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
  updatePasskeyCredentialCounter,
} from './db.js';
import { sendDeletionProofEmail } from './email.js';
import {
  buildPasskeyAuthenticationOptions,
  passkeyChallengeFromClientData,
  verifyPasskeyAssertion,
} from './passkey.js';
import {
  renderDeletionCancelPage,
  renderDeletionPage,
  renderDeletionProofPage,
  renderDeletionStatus,
  formatDate,
} from './html.js';
import { loadMenuContext, requireSignedInSession, signedInHtml } from './settings.js';

const ORIGIN = 'https://services.solstone.app';
const PROOF_TTL_MS = 10 * 60 * 1000;
const CANCELLATION_WINDOW_MS = 72 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const PROOF_MAX_ATTEMPTS = 5;
const PROOF_ACCOUNT_LIMIT = 10;
const PROOF_IP_LIMIT = 20;
const STATUS_COOKIE = 'account_deletion_status';

function isUniqueViolation(error) {
  return typeof error?.message === 'string' && error.message.includes('UNIQUE constraint failed');
}

export function strictDeletionOriginAllowed(req) {
  const origin = req.headers.get('Origin');
  if (typeof origin !== 'string') return false;
  try {
    return new URL(origin).origin === ORIGIN;
  } catch {
    return false;
  }
}

export async function startEmailProof(env, { accountId, sessionIdHash, purpose, ip = '' }) {
  const nowMs = Date.now();
  await checkProofRateLimit(env, { accountId, ip, method: 'otp', nowMs });
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
  await sendDeletionProofEmail({ env, address, code, purpose });
  return { expiresAt: nowMs + PROOF_TTL_MS };
}

export async function verifyEmailProof(env, { accountId, sessionIdHash, purpose, code, ip = '' }) {
  const nowMs = Date.now();
  await checkProofRateLimit(env, { accountId, ip, method: 'otp', nowMs });
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
  await checkProofRateLimit(env, { accountId, ip, method: 'passkey', nowMs });
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
  await checkProofRateLimit(env, { accountId, ip, method: 'passkey', nowMs });
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

export async function requireFreshProof(env, { accountId, sessionIdHash, purpose }) {
  const nowMs = Date.now();
  const passkeyRequired = await hasAnyActivePasskey(env.DB, accountId);
  const otp = await getLatestDeletionProof(env.DB, {
    accountId, sessionIdHash, purpose, method: 'otp', nowMs, verified: true,
  });
  const passkey = passkeyRequired
    ? await getLatestDeletionProof(env.DB, {
      accountId, sessionIdHash, purpose, method: 'passkey', nowMs, verified: true,
    })
    : null;
  return {
    otpRequired: true,
    passkeyRequired,
    otpVerified: Boolean(otp),
    passkeyVerified: !passkeyRequired || Boolean(passkey),
    proofTokenHashes: [otp?.token_hash, passkey?.token_hash].filter(Boolean),
  };
}

export async function captureDeletionSnapshotForAccount(env, accountId, operationId) {
  const [spl, spb, spp, scout, stripe] = await Promise.all([
    listSplBindings(env.DB, accountId),
    listSpbBindings(env.DB, accountId),
    listSppBindings(env.DB, accountId),
    getScoutApplicationByAccount(env.DB, { accountId }),
    getStripeCustomerByAccount(env.DB, { accountId }),
  ]);
  const snapshot = JSON.stringify({
    relay: {
      spl_instance_ids: spl.map((row) => row.instance_id).sort(),
      spp_instance_ids: spp.map((row) => row.instance_id).sort(),
    },
    backup: { spb_instance_ids: spb.map((row) => row.instance_id).sort() },
    scout_application: { present: Boolean(scout) },
    stripe_customer_id: stripe?.stripe_customer_id || null,
    support_owner_id: accountId,
  });
  const frozenAt = Date.now();
  return captureDeletionSnapshot(env.DB, {
    operationId,
    snapshotEncrypted: await encryptEmail(snapshot, env),
    snapshotDigest: await hashWithPepper(snapshot, env),
    frozenAt,
  });
}

export async function handleAccountDeletionPage(req, env) {
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const [menu, active] = await Promise.all([
    loadMenuContext(env, guard.session.account_id, guard.nowMs),
    getActiveDeletionForAccount(env.DB, guard.session.account_id),
  ]);
  if (active) {
    return signedInHtml(renderDeletionCancelPage({ menu, phase: active.phase }));
  }
  return signedInHtml(renderDeletionPage({ menu }));
}

export async function handleDeletionOtpStart(req, env) {
  const guard = await deletionGuard(req, env);
  if (guard instanceof Response) return guard;
  const purpose = await requestPurpose(req, env, guard.session.account_id);
  if (!purpose) return refusal(400, 'invalid deletion proof request');
  try {
    await startEmailProof(env, {
      accountId: guard.session.account_id,
      sessionIdHash: guard.session.id_hash,
      purpose,
      ip: requestIp(req),
    });
  } catch (error) {
    if (error?.message === 'proof_rate_limited') return refusal(429, 'too many proof attempts; try again later');
    return refusal(400, 'a verified email is required to continue');
  }
  const menu = await loadMenuContext(env, guard.session.account_id, guard.nowMs);
  return signedInHtml(renderDeletionProofPage({ menu, purpose, status: 'code sent' }));
}

export async function handleDeletionOtpVerify(req, env) {
  const guard = await deletionGuard(req, env);
  if (guard instanceof Response) return guard;
  const form = await req.formData();
  const purpose = normalizePurpose(form.get('purpose'));
  if (!purpose) return refusal(400, 'invalid deletion proof request');
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
    if (error?.message === 'proof_rate_limited') return refusal(429, 'too many proof attempts; try again later');
    throw error;
  }
  const menu = await loadMenuContext(env, guard.session.account_id, guard.nowMs);
  return signedInHtml(renderDeletionProofPage({
    menu,
    purpose,
    status: result.ok ? 'email proof verified' : '',
    error: result.ok ? '' : 'that code is invalid or expired.',
  }), { status: result.ok ? 200 : 400 });
}

export async function handleDeletionPasskeyStart(req, env) {
  const guard = await deletionGuard(req, env);
  if (guard instanceof Response) return guard;
  const body = await jsonBody(req);
  const purpose = normalizePurpose(body?.purpose);
  if (!purpose) return jsonError(400, 'invalid deletion proof request');
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
      ? jsonError(429, 'too many proof attempts; try again later')
      : jsonError(500, 'passkey proof could not start');
  }
}

export async function handleDeletionPasskeyFinish(req, env) {
  const guard = await deletionGuard(req, env);
  if (guard instanceof Response) return guard;
  const body = await jsonBody(req);
  const purpose = normalizePurpose(body?.purpose);
  if (!purpose) return jsonError(400, 'invalid deletion proof request');
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
      ? jsonError(429, 'too many proof attempts; try again later')
      : jsonError(500, 'passkey proof could not be verified');
  }
}

export async function handleDeletionConfirm(req, env) {
  const guard = await deletionGuard(req, env);
  if (guard instanceof Response) return guard;
  const fresh = await requireFreshProof(env, {
    accountId: guard.session.account_id,
    sessionIdHash: guard.session.id_hash,
    purpose: 'delete',
  });
  if (!fresh.otpVerified || !fresh.passkeyVerified) {
    const menu = await loadMenuContext(env, guard.session.account_id, guard.nowMs);
    return signedInHtml(renderDeletionProofPage({
      menu,
      purpose: 'delete',
      error: fresh.passkeyRequired
        ? 'verify both your email code and your passkey before continuing.'
        : 'verify your email code before continuing.',
    }), { status: 400 });
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
    if (isUniqueViolation(error)) return refusal(409, 'deletion already requested');
    throw error;
  }
  if (!result.created) return refusal(409, 'deletion request could not be confirmed');
  const captured = await captureDeletionSnapshotForAccount(env, guard.session.account_id, operationId);
  if (!captured) {
    const current = await getActiveDeletionForAccount(env.DB, guard.session.account_id);
    if (!current || current.operation_id !== operationId || current.phase !== 'frozen') {
      return refusal(409, 'deletion request could not be prepared');
    }
  }
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
  if (!active || active.phase === 'purging') return refusal(409, 'deletion can no longer be cancelled');
  const fresh = await requireFreshProof(env, {
    accountId: guard.session.account_id,
    sessionIdHash: guard.session.id_hash,
    purpose: 'cancel',
  });
  if (!fresh.otpVerified || !fresh.passkeyVerified) {
    const menu = await loadMenuContext(env, guard.session.account_id, guard.nowMs);
    return signedInHtml(renderDeletionProofPage({
      menu,
      purpose: 'cancel',
      error: 'complete a fresh cancellation proof before continuing.',
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
  if (!result.cancelled) return refusal(409, 'deletion can no longer be cancelled');
  return new Response(null, { status: 303, headers: { Location: '/account/delete', 'Cache-Control': 'no-store' } });
}

export async function handleDeletionStatus(req, env) {
  const token = cookieValue(req, STATUS_COOKIE);
  if (!token) return signedInHtml(renderDeletionStatus());
  try {
    const tokenHash = await hashWithPepper(token, env);
    const completion = await getCompletionVerifier(env.DB, tokenHash);
    if (completion) {
      if (completion.expires_at <= Date.now()) return signedInHtml(renderDeletionStatus({ state: 'expired link' }), { status: 410 });
      return signedInHtml(renderDeletionStatus({ state: 'complete' }));
    }
    const row = await getDeletionByStatusTokenHash(env.DB, tokenHash);
    if (!row) return signedInHtml(renderDeletionStatus({ state: 'expired link' }), { status: 410 });
    if (row.phase === 'requested') return signedInHtml(renderDeletionStatus({ state: 'access ended' }));
    if (row.phase === 'frozen') return signedInHtml(renderDeletionStatus({ state: 'waiting for the safety period' }));
    if (row.phase === 'purging') {
      if (row.lease_token) return signedInHtml(renderDeletionStatus({ state: 'deletion in progress' }));
      return signedInHtml(renderDeletionStatus({ state: await deletionDelayedStatus(env, row) }));
    }
    return signedInHtml(renderDeletionStatus());
  } catch {
    return signedInHtml(renderDeletionStatus());
  }
}

async function deletionDelayedStatus(env, deletion) {
  const retry = formatDate(deletion.next_attempt_at);
  if (deletion.last_error_code === 'service_reconciliation_pending') {
    return `service reconciliation pending; next retry ${retry}`;
  }
  const { results } = await env.DB.prepare(
    `SELECT service
     FROM account_deletion_service_ops
     WHERE operation_id = ?
       AND service IN ('relay', 'support')
       AND state NOT IN ('complete')
     ORDER BY CASE service WHEN 'relay' THEN 0 ELSE 1 END
     LIMIT 1`
  ).bind(deletion.operation_id).all();
  const delayedService = results?.[0]?.service;
  if (delayedService === 'relay') return `relay cleanup delayed; next retry ${retry}`;
  if (delayedService === 'support') return `support cleanup delayed; next retry ${retry}`;
  if (deletion.backup_empty_verified_at == null) return `backup cleanup delayed; next retry ${retry}`;
  if (!['deleted', 'absent'].includes(deletion.stripe_purge_state)) return `billing cleanup delayed; next retry ${retry}`;
  return `deletion cleanup delayed; next retry ${retry}`;
}

async function deletionGuard(req, env) {
  if (!strictDeletionOriginAllowed(req)) return refusal(403, 'invalid deletion request origin');
  return requireSignedInSession(req, env);
}

async function requestPurpose(req, env, accountId) {
  const form = await req.formData();
  const purpose = normalizePurpose(form.get('purpose'));
  if (purpose !== 'cancel') return 'delete';
  return (await getActiveDeletionForAccount(env.DB, accountId)) ? 'cancel' : null;
}

function normalizePurpose(value) {
  return value === 'delete' || value === 'cancel' ? value : null;
}

async function checkProofRateLimit(env, { accountId, ip, method, nowMs }) {
  const accountKey = await hashKey(`delete_proof_${method}_account`, accountId, env);
  const ipKey = await hashKey(`delete_proof_${method}_ip`, ip || 'unknown', env);
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
