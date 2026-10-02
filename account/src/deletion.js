import {
  decryptEmail,
  encryptEmail,
  generateOtp,
  generateSessionToken,
  hashKey,
  hashWithPepper,
  normalizeCode,
  timingSafeEqual,
} from './crypto.js';
import {
  bumpDeletionProofAttempts,
  bumpRateBucket,
  captureDeletionSnapshot,
  consumeProofsAndCancelDeletionRequest,
  consumeProofsAndCreateDeletionRequest,
  createDeletionProof,
  deletionIsCancellable,
  getActiveDeletionForAccount,
  getCompletionVerifier,
  getDeletionByStatusTokenHash,
  getLatestDeletionProof,
  getPasskeyCredential,
  getRateBucketCount,
  getScoutApplicationByAccount,
  getStripeCustomerByAccount,
  hasAnyActivePasskey,
  listAccountEmails,
  listPasskeyCredentialsForAccount,
  listSpbBindings,
  listSplBindings,
  listSppBindings,
  markDeletionProofVerified,
  PROOF_TTL_MS,
  requireFreshProof,
  updatePasskeyCredentialCounter,
} from './db.js';
import { sendDeletionProofEmail } from './email.js';
import {
  buildPasskeyAuthenticationOptions,
  passkeyChallengeFromClientData,
  verifyPasskeyAssertion,
} from './passkey.js';
import {
  formatDeadline,
  DELETION_PAST_DEADLINE_LINE,
  renderDeletionCancelPage,
  renderDeletionPage,
  renderDeletionProofPage,
  renderDeletionStatus,
  renderDeletionUnavailablePage,
} from './html.js';
import { applyDeletionHold, markKeepRestoreOwed, restoreAfterKeep } from './deletion-hold.js';
import { checkDeletionReadiness } from './deletion-readiness.js';
import { originAllowed } from './index.js';
import { rateBucketFamily } from './owner-data-inventory.js';
import { loadMenuContext, requireSignedInSession, signedInHtml } from './settings.js';

const CANCELLATION_WINDOW_MS = 72 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const PROOF_MAX_ATTEMPTS = 5;
const PROOF_ACCOUNT_LIMIT = 10;
const PROOF_IP_LIMIT = 20;
const STATUS_COOKIE = 'account_deletion_status';
const KEEP_FAILED = "that didn't go through. reload the page to see where your sign-in stands.";
const DELETION_RUNNING_LINE = 'sol pbc is deleting what it held for your sign-in.';
const DELETION_DELAYED_LINE = 'this is taking longer than usual. sol pbc keeps trying until every part is done.';
const DELETION_COMPLETE_LINE = 'your sign-in is closed, and sol pbc has deleted what it held for it, apart from the few records the privacy policy names. your journal is still on your devices.';

function isUniqueViolation(error) {
  return typeof error?.message === 'string' && error.message.includes('UNIQUE constraint failed');
}

// Same predicate as every other signed-in POST; kept under its historical name
// for the deletion and export call sites. A call-time wrapper rather than an
// alias because deletion.js and index.js import each other.
export function strictDeletionOriginAllowed(req) {
  return originAllowed(req);
}

export async function startEmailProof(env, { accountId, sessionIdHash, purpose, ip = '' }) {
  const nowMs = Date.now();
  await checkProofRateLimit(env, { accountId, ip, method: 'otp', purpose, nowMs });
  const code = generateOtp();
  const tokenHash = await hashWithPepper(generateSessionToken(), env);
  await createDeletionProof(env.DB, {
    tokenHash,
    accountId,
    sessionIdHash,
    purpose,
    method: 'otp',
    issuedAt: nowMs,
    expiresAt: nowMs + PROOF_TTL_MS,
    otpCodeHash: await hashWithPepper(code, env),
  });
  const address = await primaryVerifiedAddress(env, accountId);
  if (!address) throw new Error('deletion_proof_email_missing');
  const active = purpose === 'cancel' ? await getActiveDeletionForAccount(env.DB, accountId) : null;
  const deadline = active ? formatDeadline(active.cancellation_deadline_at) : '';
  await sendDeletionProofEmail({ env, address, code, purpose, deadline });
  return { expiresAt: nowMs + PROOF_TTL_MS };
}

export async function verifyEmailProof(env, { accountId, sessionIdHash, purpose, code, ip = '' }) {
  const nowMs = Date.now();
  await checkProofRateLimit(env, { accountId, ip, method: 'otp', purpose, nowMs });
  const proof = await getLatestDeletionProof(env.DB, {
    accountId,
    sessionIdHash,
    purpose,
    method: 'otp',
    nowMs,
    verified: false,
  });
  if (!proof) return { ok: false, reason: 'proof_expired' };
  const codeHash = await hashWithPepper(normalizeCode(code || ''), env);
  if (!await timingSafeEqual(codeHash, proof.otp_code_hash)) {
    await bumpDeletionProofAttempts(env.DB, {
      tokenHash: proof.token_hash,
      nowMs,
      maxAttempts: PROOF_MAX_ATTEMPTS,
    });
    return { ok: false, reason: 'invalid_code' };
  }
  const verified = await markDeletionProofVerified(env.DB, { tokenHash: proof.token_hash, nowMs });
  return verified ? { ok: true } : { ok: false, reason: 'proof_expired' };
}

export async function startPasskeyProof(env, { accountId, sessionIdHash, purpose, ip = '' }) {
  const nowMs = Date.now();
  await checkProofRateLimit(env, { accountId, ip, method: 'passkey', purpose, nowMs });
  if (!await hasAnyActivePasskey(env.DB, accountId)) {
    return { ok: false, reason: 'no_passkey' };
  }
  const credentials = await listPasskeyCredentialsForAccount(env.DB, accountId);
  const options = await buildPasskeyAuthenticationOptions({
    userVerification: 'required',
    allowCredentials: credentials.map((row) => ({
      id: row.credential_id,
      type: 'public-key',
      transports: parseTransports(row.transports),
    })),
  });
  await createDeletionProof(env.DB, {
    tokenHash: await hashWithPepper(generateSessionToken(), env),
    accountId,
    sessionIdHash,
    purpose,
    method: 'passkey',
    issuedAt: nowMs,
    expiresAt: nowMs + PROOF_TTL_MS,
    passkeyChallenge: options.challenge,
  });
  return { ok: true, options, expiresAt: nowMs + PROOF_TTL_MS };
}

export async function finishPasskeyProof(env, { accountId, sessionIdHash, purpose, assertionResponse, ip = '' }) {
  const nowMs = Date.now();
  await checkProofRateLimit(env, { accountId, ip, method: 'passkey', purpose, nowMs });
  const challenge = assertionResponse?.response?.clientDataJSON
    ? passkeyChallengeFromClientData(assertionResponse.response.clientDataJSON)
    : null;
  if (!challenge) return { ok: false, reason: 'invalid_assertion' };
  const proof = await getLatestDeletionProof(env.DB, {
    accountId,
    sessionIdHash,
    purpose,
    method: 'passkey',
    nowMs,
    verified: false,
  });
  if (!proof || proof.passkey_challenge !== challenge) return { ok: false, reason: 'proof_expired' };
  const credentialId = assertionResponse?.id;
  if (typeof credentialId !== 'string') return { ok: false, reason: 'invalid_assertion' };
  const credential = await getPasskeyCredential(env.DB, credentialId);
  if (!credential || credential.account_id !== accountId) return { ok: false, reason: 'invalid_assertion' };
  const verification = await verifyPasskeyAssertion({
    response: assertionResponse,
    expectedChallenge: challenge,
    credentialRow: credential,
    requireUserVerification: true,
  });
  if (!verification) return { ok: false, reason: 'invalid_assertion' };
  await updatePasskeyCredentialCounter(
    env.DB,
    credential.credential_id,
    verification.authenticationInfo?.newCounter ?? credential.counter ?? 0,
    nowMs
  );
  const verified = await markDeletionProofVerified(env.DB, { tokenHash: proof.token_hash, nowMs });
  return verified ? { ok: true } : { ok: false, reason: 'proof_expired' };
}

export async function captureDeletionSnapshotForAccount(env, accountId, operationId) {
  const [spl, spb, spp, scout, stripe, emails] = await Promise.all([
    listSplBindings(env.DB, accountId),
    listSpbBindings(env.DB, accountId),
    listSppBindings(env.DB, accountId),
    getScoutApplicationByAccount(env.DB, { accountId }),
    getStripeCustomerByAccount(env.DB, { accountId }),
    listAccountEmails(env.DB, accountId),
  ]);
  const relayInstanceIds = [...new Set([
    ...spl.map((row) => row.instance_id),
    ...spp.map((row) => row.instance_id),
  ])].sort();
  const verifiedEmails = [...new Set(await Promise.all(
    emails
      .filter((row) => row.verified_at != null)
      .map((row) => decryptEmail(row.address_encrypted, env))
  ))].sort();
  const snapshot = JSON.stringify({
    relay: { instance_ids: relayInstanceIds },
    backup: { spb_instance_ids: spb.map((row) => row.instance_id).sort() },
    scout_application: { present: Boolean(scout) },
    stripe_customer_id: stripe?.stripe_customer_id || null,
    support: { portal_principal: accountId, verified_emails: verifiedEmails },
  });
  const frozenAt = Date.now();
  return captureDeletionSnapshot(env.DB, {
    operationId,
    snapshotEncrypted: await encryptEmail(snapshot, env),
    snapshotDigest: await hashWithPepper(snapshot, env),
    frozenAt,
  });
}

// Display context for the top bar on deletion and export pages. While a deletion
// is active the session is confined to /account/delete* and, in requested/frozen,
// the export carve-out (getValidSession; export also needs OWNER_EXPORT_ENABLED).
// The renderer uses this only to leave out links that would end the session;
// it grants nothing.
export function withDeletionMenu(menu, active, env) {
  if (!active) return { ...menu, deletion: null };
  const exportAvailable = env?.OWNER_EXPORT_ENABLED === 'true'
    && (active.phase === 'requested' || active.phase === 'frozen');
  return { ...menu, deletion: { phase: active.phase, exportAvailable } };
}

export async function loadDeletionMenuContext(env, accountId, nowMs) {
  const [menu, active] = await Promise.all([
    loadMenuContext(env, accountId, nowMs),
    getActiveDeletionForAccount(env.DB, accountId),
  ]);
  return withDeletionMenu(menu, active, env);
}

export async function handleAccountDeletionPage(req, env) {
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const [baseMenu, active] = await Promise.all([
    loadMenuContext(env, guard.session.account_id, guard.nowMs),
    getActiveDeletionForAccount(env.DB, guard.session.account_id),
  ]);
  const menu = withDeletionMenu(baseMenu, active, env);
  if (active) {
    const exportEnabled = env?.OWNER_EXPORT_ENABLED === 'true';
    // The deadline decides, not the phase: past it the coordinator may not have moved the
    // deletion to purging yet, and a keep would be refused.
    const phase = deletionIsCancellable(active, guard.nowMs) ? active.phase : 'purging';
    return signedInHtml(renderDeletionCancelPage({
      menu,
      phase,
      exportEnabled,
      deadline: formatDeadline(active.cancellation_deadline_at),
    }));
  }
  return signedInHtml(renderDeletionPage({ menu }));
}

export async function handleDeletionOtpStart(req, env) {
  const guard = await deletionGuard(req, env);
  if (guard instanceof Response) return guard;
  const purpose = await requestPurpose(req, env, guard.session.account_id);
  if (!purpose) return refusal(400, "that request didn't go through. go back and try again.");
  try {
    await startEmailProof(env, {
      accountId: guard.session.account_id,
      sessionIdHash: guard.session.id_hash,
      purpose,
      ip: requestIp(req),
    });
  } catch (error) {
    if (error?.message === 'proof_rate_limited') return refusal(429, 'too many tries. please wait a while and try again.');
    return refusal(400, 'a verified email is required to continue');
  }
  const menu = await loadDeletionMenuContext(env, guard.session.account_id, guard.nowMs);
  return signedInHtml(renderDeletionProofPage({ menu, purpose, status: 'code sent' }));
}

export async function handleDeletionOtpVerify(req, env) {
  const guard = await deletionGuard(req, env);
  if (guard instanceof Response) return guard;
  const form = await req.formData();
  const purpose = normalizePurpose(form.get('purpose'));
  if (!purpose) return refusal(400, "that request didn't go through. go back and try again.");
  let result;
  try {
    result = await verifyEmailProof(env, {
      accountId: guard.session.account_id,
      sessionIdHash: guard.session.id_hash,
      purpose,
      code: form.get('code')?.toString() || '',
      ip: requestIp(req),
    });
  } catch (error) {
    if (error?.message === 'proof_rate_limited') return refusal(429, 'too many tries. please wait a while and try again.');
    throw error;
  }
  const menu = await loadDeletionMenuContext(env, guard.session.account_id, guard.nowMs);
  return signedInHtml(renderDeletionProofPage({
    menu,
    purpose,
    status: result.ok ? 'code confirmed' : '',
    error: result.ok ? '' : 'that code is invalid or expired.',
  }), { status: result.ok ? 200 : 400 });
}

export async function handleDeletionPasskeyStart(req, env) {
  const guard = await deletionGuard(req, env);
  if (guard instanceof Response) return guard;
  const body = await jsonBody(req);
  const purpose = normalizePurpose(body?.purpose);
  if (!purpose) return jsonError(400, "that request didn't go through. go back and try again.");
  try {
    const result = await startPasskeyProof(env, {
      accountId: guard.session.account_id,
      sessionIdHash: guard.session.id_hash,
      purpose,
      ip: requestIp(req),
    });
    return result.ok ? jsonResponse({ options: result.options }) : jsonError(400, 'no active passkey');
  } catch (error) {
    return error?.message === 'proof_rate_limited'
      ? jsonError(429, 'too many tries. please wait a while and try again.')
      : jsonError(500, 'passkey proof could not start');
  }
}

export async function handleDeletionPasskeyFinish(req, env) {
  const guard = await deletionGuard(req, env);
  if (guard instanceof Response) return guard;
  const body = await jsonBody(req);
  const purpose = normalizePurpose(body?.purpose);
  if (!purpose) return jsonError(400, "that request didn't go through. go back and try again.");
  try {
    const result = await finishPasskeyProof(env, {
      accountId: guard.session.account_id,
      sessionIdHash: guard.session.id_hash,
      purpose,
      assertionResponse: body?.response,
      ip: requestIp(req),
    });
    return result.ok ? jsonResponse({ ok: true }) : jsonError(400, 'passkey proof could not be verified');
  } catch (error) {
    return error?.message === 'proof_rate_limited'
      ? jsonError(429, 'too many tries. please wait a while and try again.')
      : jsonError(500, 'passkey proof could not be verified');
  }
}

export async function handleDeletionConfirm(req, env) {
  const guard = await deletionGuard(req, env);
  if (guard instanceof Response) return guard;
  const fresh = await requireFreshProof(env.DB, {
    accountId: guard.session.account_id,
    sessionIdHash: guard.session.id_hash,
    purpose: 'delete',
  });
  if (!fresh.otpVerified || !fresh.passkeyVerified) {
    const menu = await loadDeletionMenuContext(env, guard.session.account_id, guard.nowMs);
    return signedInHtml(renderDeletionProofPage({
      menu,
      purpose: 'delete',
      error: fresh.passkeyRequired
        ? 'confirm with both your email code and your passkey to continue.'
        : 'confirm with your email code to continue.',
    }), { status: 400 });
  }
  const readiness = await checkDeletionReadiness(env);
  if (!readiness.ok) {
    const menu = await loadDeletionMenuContext(env, guard.session.account_id, guard.nowMs);
    return signedInHtml(renderDeletionUnavailablePage({ menu }), { status: 503 });
  }
  const requestedAt = Date.now();
  const operationId = generateSessionToken();
  const statusToken = generateSessionToken();
  const statusTokenHash = await hashWithPepper(statusToken, env);
  let result;
  try {
    result = await consumeProofsAndCreateDeletionRequest(env.DB, {
      proofTokenHashes: fresh.proofTokenHashes,
      accountId: guard.session.account_id,
      sessionIdHash: guard.session.id_hash,
      operationId,
      statusTokenHash,
      requestedAt,
      cancellationDeadlineAt: requestedAt + CANCELLATION_WINDOW_MS,
    });
  } catch (error) {
    if (isUniqueViolation(error)) return refusal(409, "you've already asked to close your sign-in.");
    throw error;
  }
  if (!result.created) return refusal(409, "your request can't be confirmed right now. please try again.");
  const captured = await captureDeletionSnapshotForAccount(env, guard.session.account_id, operationId);
  const current = await getActiveDeletionForAccount(env.DB, guard.session.account_id);
  if (!captured && (!current || current.operation_id !== operationId || current.phase !== 'frozen')) {
    return refusal(409, "your request went through, but this page didn't finish. reload the close page to see where it stands, or to change your mind.");
  }
  // Every service stops here and no renewal is charged. The coordinator applies the hold again
  // on its next pass, which also covers a failure here.
  if (current?.operation_id === operationId) await applyDeletionHold(env, current);
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/account/delete/status',
      'Cache-Control': 'no-store',
      'Set-Cookie': statusCookie(statusToken),
    },
  });
}

export async function handleDeletionCancel(req, env) {
  const guard = await deletionGuard(req, env);
  if (guard instanceof Response) return guard;
  const active = await getActiveDeletionForAccount(env.DB, guard.session.account_id);
  if (!deletionIsCancellable(active, guard.nowMs)) {
    return refusal(409, active ? DELETION_PAST_DEADLINE_LINE : KEEP_FAILED);
  }
  const fresh = await requireFreshProof(env.DB, {
    accountId: guard.session.account_id,
    sessionIdHash: guard.session.id_hash,
    purpose: 'cancel',
  });
  if (!fresh.otpVerified || !fresh.passkeyVerified) {
    const menu = await loadDeletionMenuContext(env, guard.session.account_id, guard.nowMs);
    return signedInHtml(renderDeletionProofPage({
      menu,
      purpose: 'cancel',
      error: "confirm it's you with a fresh code, and your passkey if you set one up.",
    }), { status: 400 });
  }
  const result = await consumeProofsAndCancelDeletionRequest(env.DB, {
    proofTokenHashes: fresh.proofTokenHashes,
    accountId: guard.session.account_id,
    sessionIdHash: guard.session.id_hash,
    operationId: active.operation_id,
    cancelledAt: guard.nowMs,
    nowMs: guard.nowMs,
  });
  if (!result.cancelled) return refusal(409, KEEP_FAILED);
  // Keeping the sign-in gives back what the hold stopped. The restore is marked owed first, so
  // the coordinator finishes it if this request does not.
  await markKeepRestoreOwed(env, active.operation_id, guard.nowMs);
  const kept = await env.DB.prepare('SELECT * FROM account_deletions WHERE operation_id = ?')
    .bind(active.operation_id).first();
  if (kept) await restoreAfterKeep(env, kept, guard.nowMs);
  return new Response(null, { status: 303, headers: { Location: '/account/delete', 'Cache-Control': 'no-store' } });
}

export async function handleDeletionStatus(req, env) {
  const token = cookieValue(req, STATUS_COOKIE);
  if (!token) return signedInHtml(renderDeletionStatus());
  try {
    const tokenHash = await hashWithPepper(token, env);
    const completion = await getCompletionVerifier(env.DB, tokenHash);
    if (completion) {
      if (completion.expires_at <= Date.now()) return signedInHtml(renderDeletionStatus({ state: 'this status link has expired.' }), { status: 410 });
      return signedInHtml(renderDeletionStatus({ state: DELETION_COMPLETE_LINE }));
    }
    const row = await getDeletionByStatusTokenHash(env.DB, tokenHash);
    if (!row) return signedInHtml(renderDeletionStatus({ state: 'this status link has expired.' }), { status: 410 });
    if ((row.phase === 'requested' || row.phase === 'frozen') && Date.now() >= row.cancellation_deadline_at) {
      return signedInHtml(renderDeletionStatus({ state: DELETION_PAST_DEADLINE_LINE }));
    }
    if (row.phase === 'requested' || row.phase === 'frozen') {
      const guard = await requireSignedInSession(req, env);
      const nowMs = Date.now();
      const canCancel = !(guard instanceof Response)
        && guard.session.account_id === row.account_id
        && nowMs < row.cancellation_deadline_at;
      return signedInHtml(renderDeletionStatus({
        state: `your services are stopping, and your sign-in closes at ${formatDeadline(row.cancellation_deadline_at)}. until then, you can change your mind.`,
        canCancel,
        // Display only: point a receipt-only viewer at sign-in, which during a
        // cancellable hold lands on /account/delete (index.js, passkey.js).
        canSignInToCancel: !canCancel && deletionIsCancellable(row, nowMs),
      }));
    }
    if (row.phase === 'cancelled') return signedInHtml(renderDeletionStatus({ state: 'you kept your sign-in, and nothing was deleted.' }));
    if (row.phase === 'purging') {
      // Between passes a purge is waiting on a part that is not done yet: slow, not stuck.
      return signedInHtml(renderDeletionStatus({ state: row.lease_token ? DELETION_RUNNING_LINE : DELETION_DELAYED_LINE }));
    }
    return signedInHtml(renderDeletionStatus());
  } catch {
    return signedInHtml(renderDeletionStatus());
  }
}

async function deletionGuard(req, env) {
  if (!strictDeletionOriginAllowed(req)) return refusal(403, "that request didn't go through. go back and try again.");
  return requireSignedInSession(req, env);
}

async function requestPurpose(req, env, accountId) {
  const form = await req.formData();
  const purpose = normalizePurpose(form.get('purpose'));
  if (purpose !== 'cancel') return 'delete';
  return deletionIsCancellable(await getActiveDeletionForAccount(env.DB, accountId), Date.now()) ? 'cancel' : null;
}

function normalizePurpose(value) {
  return value === 'delete' || value === 'cancel' ? value : null;
}

async function checkProofRateLimit(env, { accountId, ip, method, purpose, nowMs }) {
  const family = purpose === 'export'
    ? 'export_proof'
    : purpose === 'credential-change'
      ? 'credential_change_proof'
      : 'delete_proof';
  const accountKey = await hashKey(rateBucketFamily(`${family}_${method}_account`).scope, accountId, env);
  const ipKey = await hashKey(rateBucketFamily(`${family}_${method}_ip`).scope, ip || 'unknown', env);
  const [accountCount, ipCount] = await Promise.all([
    getRateBucketCount(env.DB, accountKey, HOUR_MS, nowMs),
    getRateBucketCount(env.DB, ipKey, HOUR_MS, nowMs),
  ]);
  if (accountCount >= PROOF_ACCOUNT_LIMIT || ipCount >= PROOF_IP_LIMIT) {
    throw new Error('proof_rate_limited');
  }
  await Promise.all([
    bumpRateBucket(env.DB, accountKey, HOUR_MS, nowMs),
    bumpRateBucket(env.DB, ipKey, HOUR_MS, nowMs),
  ]);
}

async function primaryVerifiedAddress(env, accountId) {
  const rows = await listAccountEmails(env.DB, accountId);
  const row = rows.find((entry) => entry.is_primary && entry.verified_at != null)
    || rows.find((entry) => entry.verified_at != null);
  return row ? decryptEmail(row.address_encrypted, env) : null;
}

function parseTransports(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function requestIp(req) {
  return req.headers.get('CF-Connecting-IP') || req.headers.get('x-forwarded-for') || 'unknown';
}

async function jsonBody(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function statusCookie(token) {
  return `${STATUS_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/account/delete; Max-Age=604800`;
}

function cookieValue(req, name) {
  const match = (req.headers.get('Cookie') || '').match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

function refusal(status, message) {
  return new Response(message, { status, headers: { 'Cache-Control': 'no-store' } });
}

function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
