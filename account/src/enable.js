import {
  base64UrlDecode,
  base64UrlEncode,
  decryptEmail,
  encryptEmail,
  generateSessionToken,
  hashKey,
  hashServiceHandoffNonce,
  hashWithPepper,
  timingSafeEqual,
} from './crypto.js';
import { resolveBearerAccount } from './dispatch-tokens.js';
import {
  accountHoldsServiceBinding,
  consumeServiceHandoff,
  findSpbSweepAudit,
  findServiceHandoffStatus,
  getAccountTransparencyRow,
  getEntitlement,
  getScoutApplicationByAccount,
  getScoutApplicationStatusByAccount,
  insertServiceHandoff,
  insertSppMintAudit,
  hasOtherSppBinding,
  hasSppBinding,
  listSpbBindings,
  peekServiceHandoff,
  rotateSpbBindingToken,
  upsertSmeBinding,
  upsertSpbBinding,
  upsertSplBinding,
  upsertSppBinding,
} from './db.js';
import { verifyServiceEnableProof } from './enable-proof.js';
import {
  HANDOFF_TTL_MS,
  INSTANCE_ID_REGEX,
  NONCE_REGEX,
} from './enable-constants.js';
import { SUPPORT_ID_REGEX } from './support-constants.js';
import {
  formatDate,
  renderEnableScout,
  renderEnableSplConsent,
  renderEnableSplDone,
  renderEnableSplError,
  renderEnableSmeConsent,
  renderEnableSmeDone,
  renderEnableSmeError,
  renderEnableSmeNeedsSubscription,
  renderEnableSplNeedsSubscription,
  renderEnableSpbConsent,
  renderEnableSpbDone,
  renderEnableSpbError,
  renderEnableSpbNeedsSubscription,
  renderEnableSpbRestoreConsent,
  renderEnableSpbRestoreExpired,
  renderEnableSpbRestoreNeedsSubscription,
  renderEnableSpbRestoreNoHostedBackup,
  renderEnableSppApprovalRequired,
  renderEnableSppConsent,
  renderEnableSppDone,
  renderEnableSppError,
  renderEnableSppJournalLimit,
  renderEnableSppNeedsSubscription,
} from './html.js';
import { forbidden, html, json, originAllowed, redirect } from './index.js';
import { SPL_HOSTED_SERVICE, paidSignalFromRow, reconcileSplEntitlement } from './relay-grant.js';
import { clearSessionCookie, getValidSession } from './session.js';
import {
  SME_CONSENT_DISCLOSURE_VERSION,
  SME_HOSTED_SERVICE,
  isSmeEntitledToServe,
  reconcileSmeEntitlement,
} from './sme-entitlement.js';
import { SME_SERVICE_PATH } from './sme-service.js';
import { SPB_HOSTED_SERVICE, reconcileSpbEntitlement } from './spb-entitlement.js';
import { prefixFor } from './spb-broker.js';
import { mintScopedCredential } from './r2-credential.js';
import { listObjectsV2 } from './s3.js';
import {
  SPP_CONSENT_DISCLOSURE_VERSION,
  SPP_HOSTED_SERVICE,
  isSppEntitledToServe,
  reconcileSppEntitlement,
} from './spp-entitlement.js';
import { SPP_SUBSCRIBE_URL, sppOnSale } from './spp-service.js';

const HANDOFF_POLL_MS = 1500;
const HANDOFF_POLL_BUDGET_MS = 30_000;
// How long a turn-on that is waiting for a subscription stays open. The journal keeps asking
// for this long once it hears needs_subscription.
const SUBSCRIBE_WAIT_MS = 60 * 60 * 1000;
const ENABLE_SPL_PATH = '/enable/spl';
const ENABLE_SPB_PATH = '/enable/backup';
const ENABLE_SPP_PATH = '/enable/spp';
const ENABLE_SME_PATH = '/enable/solstone-me';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const RESUME_PATH_WHITELIST = new Map([
  [ENABLE_SPL_PATH, validateSplResumeParams],
  [ENABLE_SPB_PATH, validateSpbResumeParams],
  [ENABLE_SPP_PATH, validateSppResumeParams],
  [ENABLE_SME_PATH, validateSmeResumeParams],
]);

export async function signEnableResume(path, queryString, env) {
  const resume = normalizeResume(path, queryString);
  if (!resume) return null;
  const next = base64UrlEncode(encoder.encode(JSON.stringify(resume)));
  const nextSig = await hashWithPepper(next, env, 'HMAC_PEPPER');
  return { next, nextSig };
}

export async function verifyEnableResume(next, nextSig, env) {
  if (typeof next !== 'string' || typeof nextSig !== 'string') return null;
  if (!/^[A-Za-z0-9_-]+$/.test(next)) return null;
  const expected = await hashWithPepper(next, env, 'HMAC_PEPPER');
  if (!timingSafeEqual(nextSig, expected)) return null;
  try {
    return decodeEnableResume(next);
  } catch {
    return null;
  }
}

export function decodeEnableResume(next) {
  const decoded = JSON.parse(decoder.decode(base64UrlDecode(next)));
  const resume = normalizeResume(decoded.path, decoded.queryString);
  if (!resume) throw new Error('invalid resume');
  return resume;
}

export function classifyProof(params) {
  const assertions = params ? params.getAll('assertion').map((v) => v.toString()) : [];
  const caPubkeys = params ? params.getAll('ca_pubkey').map((v) => v.toString()) : [];
  if (assertions.length === 0 && caPubkeys.length === 0) {
    return { kind: 'absent', assertions: [], caPubkeys: [] };
  }
  return {
    kind: 'supplied',
    assertions,
    caPubkeys,
  };
}

export async function serviceEnableProofAllows(env, { service, accountId, instanceId, nonce, proof }) {
  if (proof.kind === 'supplied') {
    if (!instanceId || proof.assertions.length !== 1 || proof.caPubkeys.length !== 1) {
      return false;
    }
    return verifyServiceEnableProof({
      assertion: proof.assertions[0],
      caPubkey: proof.caPubkeys[0],
      instanceId,
      nonce,
      service,
    });
  }

  if (env.SERVICE_ENABLE_PROOF_REQUIRED !== 'true') {
    return true;
  }

  if (!instanceId) {
    return service === 'spl';
  }

  return accountHoldsServiceBinding(env.DB, service, accountId, instanceId);
}

export function resumeCarriesProof(queryString) {
  if (!queryString || typeof queryString !== 'string') return false;
  const search = queryString.startsWith('?') ? queryString.slice(1) : queryString;
  const params = new URLSearchParams(search);
  return params.has('assertion') || params.has('ca_pubkey');
}

export function applyProofHeaders(response, carries) {
  if (!carries || !response) return response;
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}


export function handleEnableScoutGet() {
  return noStoreHtml(renderEnableScout());
}

export async function handleScoutStatus(req, env) {
  const auth = await resolveBearerAccount(req, env);
  if (auth instanceof Response) return auth;
  const row = await getScoutApplicationByAccount(env.DB, { accountId: auth.accountId });
  if (!row) return json({ error: 'not_found' }, { status: 404 });
  return json({
    account_id: auth.accountId,
    status: row.status,
    applied_at: row.applied_at,
    approved_at: row.approved_at,
    revoked_at: row.revoked_at,
  });
}

export async function handleHandoffScout(req, env) {
  const url = new URL(req.url);
  const nonce = (url.searchParams.get('nonce') || '').trim().toUpperCase();
  if (!NONCE_REGEX.test(nonce)) return handoffJson({ error: 'invalid_request' }, { status: 400 });

  const handoffHash = await hashServiceHandoffNonce(nonce, env);
  const nowMs = Date.now();
  const consumed = await consumeServiceHandoff(env.DB, { handoffHash, nowMs, service: 'scout' });
  if (consumed) {
    const plaintext = await decryptEmail(consumed.payload_encrypted, env);
    return handoffJson(JSON.parse(plaintext), { headers: { Pragma: 'no-cache' } });
  }

  return handoffJson({ error: 'gone' }, { status: 410 });
}

export async function handleEnableSplGet(req, env) {
  const url = new URL(req.url);
  const carries = url.searchParams.has('assertion') || url.searchParams.has('ca_pubkey');
  const nonce = (url.searchParams.get('nonce') || '').trim().toUpperCase();
  if (!NONCE_REGEX.test(nonce)) return applyProofHeaders(splError(400), carries);
  const instance = parseOptionalInstance(url.searchParams);
  const proof = classifyProof(url.searchParams);
  const resumeQuery = splResumeQuery(nonce, instance, proof);

  const session = await getValidSession(req, env, Date.now());
  if (!session) return signInRedirect(env, ENABLE_SPL_PATH, resumeQuery);

  const csrf = await csrfToken(env);
  return applyProofHeaders(noStoreHtml(renderEnableSplConsent({ csrf, nonce, instance, proof })), carries);
}

export async function handleEnableSplConfirm(req, env, ctx) {
  if (!originAllowed(req)) return noStoreResponse(forbidden());
  const form = await readForm(req);
  if (!form) return splError(400);

  const nonce = (form.get('nonce')?.toString() || '').trim().toUpperCase();
  if (!NONCE_REGEX.test(nonce)) return splError(400);

  if ((form.get('action')?.toString() || '') === 'cancel') {
    return redirect('/', 303, { 'Cache-Control': 'no-store' });
  }

  const instance = parseOptionalInstance(form);
  const proof = classifyProof(form);
  const resumeQuery = splResumeQuery(nonce, instance, proof);
  const session = await getValidSession(req, env, Date.now());
  if (!session) return signInRedirect(env, ENABLE_SPL_PATH, resumeQuery);
  const account = await getAccountTransparencyRow(env.DB, session.account_id);
  if (!account) {
    return redirect('/', 303, { 'Set-Cookie': clearSessionCookie(), 'Cache-Control': 'no-store' });
  }

  const csrf = await csrfToken(env);
  if (!timingSafeEqual(form.get('csrf')?.toString() || '', csrf)) {
    return splError(403);
  }

  const allowed = await serviceEnableProofAllows(env, {
    service: 'spl',
    accountId: session.account_id,
    instanceId: instance,
    nonce,
    proof,
  });
  if (!allowed) return splError(400);

  const nowMs = Date.now();
  if (instance) {
    const bound = await upsertSplBinding(env.DB, { accountId: session.account_id, instanceId: instance, nowMs });
    // This journal is already held by another active sign-in: nothing is bound, granted or pushed.
    if (!bound) return splError(409);
  }
  await reconcileSplEntitlement(env, session.account_id, nowMs, ctx);
  const entitlement = await getEntitlement(env.DB, { accountId: session.account_id, service: SPL_HOSTED_SERVICE });
  const entitled = isSplEntitled(entitlement);
  // Not entitled yet: the consent is kept on a waiting handoff, and each time the journal asks
  // the answer is worked out again, so a journal that keeps waiting finishes turning on by itself
  // once the subscription is active. A journal that stops at its first answer reads the same
  // needs_subscription it always has.
  const payload = entitled
    ? { service: 'spl', state: 'approved', approved_at: new Date(nowMs).toISOString() }
    : {
        service: 'spl',
        state: 'awaiting_subscription',
        subscribe_url: `${new URL(req.url).origin}/private-network`,
      };
  const handoffHash = await hashServiceHandoffNonce(nonce, env);
  try {
    const payloadEncrypted = await encryptEmail(JSON.stringify(payload), env);
    await insertServiceHandoff(env.DB, {
      handoffHash,
      accountId: session.account_id,
      service: 'spl',
      payloadEncrypted,
      createdAt: nowMs,
      expiresAt: nowMs + (entitled ? HANDOFF_TTL_MS : SUBSCRIBE_WAIT_MS),
    });
  } catch {
    return splError(503);
  }
  if (!entitled) return noStoreHtml(renderEnableSplNeedsSubscription());
  return noStoreHtml(renderEnableSplDone());
}

export async function handleHandoffSpl(req, env) {
  const url = new URL(req.url);
  const nonce = (url.searchParams.get('nonce') || '').trim().toUpperCase();
  if (!NONCE_REGEX.test(nonce)) return handoffJson({ error: 'invalid_request' }, { status: 400 });

  const handoffHash = await hashServiceHandoffNonce(nonce, env);
  const started = Date.now();
  while (Date.now() - started <= HANDOFF_POLL_BUDGET_MS) {
    const nowMs = Date.now();
    const live = await peekServiceHandoff(env.DB, { handoffHash, nowMs, service: 'spl' });
    if (live) {
      const payload = JSON.parse(await decryptEmail(live.payload_encrypted, env));
      if (payload?.state === 'awaiting_subscription') {
        return resolveWaitingSpl(env, { handoffHash, accountId: live.account_id, waiting: payload, nowMs });
      }
      const consumed = await consumeServiceHandoff(env.DB, { handoffHash, nowMs, service: 'spl' });
      if (consumed) {
        const plaintext = await decryptEmail(consumed.payload_encrypted, env);
        return handoffJson(JSON.parse(plaintext), { headers: { Pragma: 'no-cache' } });
      }
    }

    const status = await findServiceHandoffStatus(env.DB, { handoffHash, service: 'spl' });
    if (status && (status.consumed_at != null || status.expires_at <= nowMs)) {
      return handoffJson({ error: 'gone' }, { status: 410 });
    }

    const elapsed = Date.now() - started;
    if (elapsed >= HANDOFF_POLL_BUDGET_MS) break;
    await sleep(Math.min(HANDOFF_POLL_MS, HANDOFF_POLL_BUDGET_MS - elapsed));
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

// A waiting private-network turn-on, asked again. Not entitled yet: needs_subscription, and the
// handoff stays open. Entitled now: the handoff is consumed (once, atomically) and approved. The
// binding was made at consent, so the purchase's own reconcile has already granted it.
async function resolveWaitingSpl(env, { handoffHash, accountId, waiting, nowMs }) {
  const noCache = { headers: { Pragma: 'no-cache' } };
  const entitlement = await getEntitlement(env.DB, { accountId, service: SPL_HOSTED_SERVICE });
  if (!isSplEntitled(entitlement)) {
    return handoffJson({ service: 'spl', state: 'needs_subscription', subscribe_url: waiting.subscribe_url }, noCache);
  }
  const consumed = await consumeServiceHandoff(env.DB, { handoffHash, nowMs, service: 'spl' });
  if (!consumed) return handoffJson({ error: 'gone' }, { status: 410 });
  return handoffJson({ service: 'spl', state: 'approved', approved_at: new Date(nowMs).toISOString() }, noCache);
}

export async function handleEnableSpbGet(req, env) {
  const url = new URL(req.url);
  const carries = url.searchParams.has('assertion') || url.searchParams.has('ca_pubkey');
  const nonce = (url.searchParams.get('nonce') || '').trim().toUpperCase();
  if (!NONCE_REGEX.test(nonce)) return applyProofHeaders(spbError(400), carries);
  const restore = isRestoreIntent(url.searchParams.get('intent'));
  const proof = classifyProof(url.searchParams);
  if (restore) {
    const session = await getValidSession(req, env, Date.now());
    if (!session) return signInRedirect(env, ENABLE_SPB_PATH, spbResumeQuery(nonce, null, true, proof));
    if (proof.kind === 'supplied') return applyProofHeaders(spbError(400), carries);
    return applyProofHeaders(await handleSpbRestoreResolution({
      req,
      env,
      nonce,
      accountId: session.account_id,
      csrf: await csrfToken(env),
    }), carries);
  }

  const instance = parseOptionalInstance(url.searchParams);
  const resumeQuery = spbResumeQuery(nonce, instance, false, proof);

  const session = await getValidSession(req, env, Date.now());
  if (!session) return signInRedirect(env, ENABLE_SPB_PATH, resumeQuery);

  const csrf = await csrfToken(env);
  return applyProofHeaders(noStoreHtml(renderEnableSpbConsent({ csrf, nonce, instance, proof })), carries);
}

export async function handleEnableSpbConfirm(req, env, ctx) {
  if (!originAllowed(req)) return noStoreResponse(forbidden());
  const form = await readForm(req);
  if (!form) return spbError(400);

  const nonce = (form.get('nonce')?.toString() || '').trim().toUpperCase();
  if (!NONCE_REGEX.test(nonce)) return spbError(400);

  if ((form.get('action')?.toString() || '') === 'cancel') {
    return redirect('/', 303, { 'Cache-Control': 'no-store' });
  }

  const proof = classifyProof(form);
  if (isRestoreIntent(form.get('intent'))) {
    const session = await getValidSession(req, env, Date.now());
    if (!session) return signInRedirect(env, ENABLE_SPB_PATH, spbResumeQuery(nonce, null, true, proof));
    if (proof.kind === 'supplied') return spbError(400);
    return handleEnableSpbRestoreConfirm({ req, env, nonce, form });
  }

  const instance = parseOptionalInstance(form);
  if (!instance) return spbError(400);
  const resumeQuery = spbResumeQuery(nonce, instance, false, proof);
  const session = await getValidSession(req, env, Date.now());
  if (!session) return signInRedirect(env, ENABLE_SPB_PATH, resumeQuery);
  const account = await getAccountTransparencyRow(env.DB, session.account_id);
  if (!account) {
    return redirect('/', 303, { 'Set-Cookie': clearSessionCookie(), 'Cache-Control': 'no-store' });
  }

  const csrf = await csrfToken(env);
  if (!timingSafeEqual(form.get('csrf')?.toString() || '', csrf)) {
    return spbError(403);
  }

  const allowed = await serviceEnableProofAllows(env, {
    service: 'spb',
    accountId: session.account_id,
    instanceId: instance,
    nonce,
    proof,
  });
  if (!allowed) return spbError(400);

  const nowMs = Date.now();
  const accountId = session.account_id;
  const handoffHash = await hashServiceHandoffNonce(nonce, env);
  // Consumed and expired handoffs still reserve their nonce. Re-consent uses a
  // fresh nonce; repeating this one must never replace its delivered credential.
  if (await findServiceHandoffStatus(env.DB, { handoffHash, service: 'spb' })) return spbError(409);
  const brokerToken = generateSessionToken();
  const tokenHash = await hashWithPepper(brokerToken, env);
  const entitlement = await getEntitlement(env.DB, { accountId, service: SPB_HOSTED_SERVICE });
  // Read the same standing reconciliation will write, without changing anything
  // for a losing submit or a refused cross-account binding.
  const entitled = !!paidSignalFromRow(entitlement)
    || (await getScoutApplicationStatusByAccount(env.DB, { accountId }))?.status === 'approved';
  const origin = new URL(req.url).origin;
  const prefix = prefixFor(accountId, instance);
  const payload = {
    broker_endpoint: origin,
    account_id: accountId,
    instance_id: instance,
    bucket: env.R2_BUCKET,
    prefix,
    broker_token: brokerToken,
    status: entitled ? 'approved' : 'needs_subscription',
  };
  if (!entitled) payload.subscribe_url = `${origin}/services/backup`;
  try {
    const payloadEncrypted = await encryptEmail(JSON.stringify(payload), env);
    const bound = await upsertSpbBinding(env.DB, {
      accountId, instanceId: instance, tokenHash, nowMs,
      handoff: { handoffHash, payloadEncrypted, createdAt: nowMs, expiresAt: nowMs + HANDOFF_TTL_MS },
    });
    // This journal is already held by another active sign-in: nothing is bound or issued.
    if (!bound) return spbError(409);
  } catch {
    return spbError(503);
  }
  await reconcileSpbEntitlement(env, accountId, nowMs, ctx);
  if (!entitled) return noStoreHtml(renderEnableSpbNeedsSubscription());
  return noStoreHtml(renderEnableSpbDone());
}

async function handleEnableSpbRestoreConfirm({ req, env, nonce, form }) {
  const proof = classifyProof(form);
  const session = await getValidSession(req, env, Date.now());
  if (!session) return signInRedirect(env, ENABLE_SPB_PATH, spbResumeQuery(nonce, null, true, proof));
  if (proof.kind === 'supplied') return spbError(400);
  const account = await getAccountTransparencyRow(env.DB, session.account_id);
  if (!account) {
    return redirect('/', 303, { 'Set-Cookie': clearSessionCookie(), 'Cache-Control': 'no-store' });
  }

  const csrf = await csrfToken(env);
  if (!timingSafeEqual(form.get('csrf')?.toString() || '', csrf)) return spbError(403);

  let resolution;
  try {
    resolution = await resolveSpbRestore({ env, accountId: session.account_id, nowMs: Date.now() });
  } catch {
    return spbError(503);
  }

  const selection = restoreSelection(form);
  const selected = resolution.kind === 'consent'
    ? resolution.candidates.find((candidate) => candidate.instanceId === selection.value)
    : null;
  if (!selected) {
    return renderSpbRestoreResolution({
      req,
      env,
      nonce,
      accountId: session.account_id,
      csrf,
      resolution,
      selectionError: selection.omitted && resolution.kind === 'consent' && resolution.candidates.length > 1,
    });
  }

  const nowMs = Date.now();
  const brokerToken = generateSessionToken();
  const tokenHash = await hashWithPepper(brokerToken, env);
  const rotated = await rotateSpbBindingToken(env.DB, {
    accountId: session.account_id,
    instanceId: selected.instanceId,
    tokenHash,
    nowMs,
  });
  if (!rotated) return handleSpbRestoreResolution({
    req,
    env,
    nonce,
    accountId: session.account_id,
    csrf,
  });
  const payload = approvedSpbPayload({
    env,
    origin: new URL(req.url).origin,
    accountId: session.account_id,
    candidate: selected,
    brokerToken,
  });
  try {
    await insertSpbHandoff({ env, nonce, accountId: session.account_id, payload, nowMs, requireNew: true });
  } catch {
    return spbError(503);
  }
  return noStoreHtml(renderEnableSpbDone());
}

async function handleSpbRestoreResolution({ req, env, nonce, accountId, csrf }) {
  let resolution;
  try {
    resolution = await resolveSpbRestore({ env, accountId, nowMs: Date.now() });
  } catch {
    return spbError(503);
  }
  return renderSpbRestoreResolution({ req, env, nonce, accountId, csrf, resolution });
}

async function renderSpbRestoreResolution({ req, env, nonce, accountId, csrf, resolution, selectionError = false }) {
  if (resolution.kind === 'consent') {
    return noStoreHtml(renderEnableSpbRestoreConsent({
      csrf,
      nonce,
      candidates: resolution.candidates,
      error: selectionError,
    }));
  }

  const nowMs = Date.now();
  const origin = new URL(req.url).origin;
  let payload;
  let page;
  if (resolution.kind === 'no_hosted_backup') {
    payload = { status: 'refused', reason_code: 'no_hosted_backup' };
    page = renderEnableSpbRestoreNoHostedBackup();
  } else if (resolution.kind === 'hosted_backup_expired') {
    payload = { status: 'refused', reason_code: 'hosted_backup_expired' };
    page = renderEnableSpbRestoreExpired({ date: formatDate(resolution.ts) });
  } else {
    payload = needsSubscriptionSpbPayload({ env, origin, accountId, candidate: resolution.candidate });
    page = renderEnableSpbRestoreNeedsSubscription();
  }
  try {
    await insertSpbHandoff({ env, nonce, accountId, payload, nowMs });
  } catch {
    return spbError(503);
  }
  return noStoreHtml(page);
}

async function resolveSpbBindingRestore({ env, accountId, binding, nowMs }) {
  const instanceId = binding.instance_id;
  const prefix = prefixFor(accountId, instanceId);
  const credential = await mintScopedCredential(env, {
    prefix,
    scope: 'backup',
    nowSeconds: Math.floor(nowMs / 1000),
  });
  if (!credential) throw new Error('could not mint restore proof credential');
  const listing = await listObjectsV2(env, credential, { prefix, nowMs });
  if (listing.keys.length > 0) {
    const sizeBytes = listing.objects.reduce((total, object) => total + object.size, 0);
    if (!Number.isSafeInteger(sizeBytes)) throw new Error('invalid restore object size total');
    return {
      kind: 'recoverable',
      candidate: {
        instanceId,
        createdAt: binding.created_at,
        prefix,
        lastBackupMs: Math.max(...listing.objects.map((object) => object.lastModifiedMs)),
        sizeBytes,
      },
    };
  }

  const audit = await findSpbSweepAudit(env.DB, { accountId, instanceId, prefix });
  if (audit) return { kind: 'expired', audit };
  return { kind: 'no_hosted_backup' };
}

async function resolveSpbRestore({ env, accountId, nowMs }) {
  const bindings = await listSpbBindings(env.DB, accountId);
  if (bindings.length === 0) return { kind: 'no_hosted_backup' };

  // Each binding's R2 listing is an independent network round trip; a binding count
  // that only ever grows (the 30-day lapse sweep never reaches every stale row) made
  // a serial loop here the render-time bottleneck behind the fresh-restore handoff
  // lease expiring before the consent page could even appear.
  const results = await Promise.all(
    bindings.map((binding) => resolveSpbBindingRestore({ env, accountId, binding, nowMs })),
  );

  const recoverable = [];
  const expired = [];
  let hasNoHostedBackup = false;
  for (const result of results) {
    if (result.kind === 'recoverable') recoverable.push(result.candidate);
    else if (result.kind === 'expired') expired.push(result.audit);
    else hasNoHostedBackup = true;
  }

  if (recoverable.length === 0) {
    if (expired.length > 0 && !hasNoHostedBackup) {
      return { kind: 'hosted_backup_expired', ts: expired[0].ts };
    }
    return { kind: 'no_hosted_backup' };
  }

  const entitlement = await getEntitlement(env.DB, { accountId, service: SPB_HOSTED_SERVICE });
  if (!isSpbEntitled(entitlement)) return { kind: 'needs_subscription', candidate: recoverable[0] };
  return { kind: 'consent', candidates: recoverable };
}

function restoreSelection(form) {
  const values = form.getAll('selected_instance');
  if (values.length === 0) return { value: null, omitted: true };
  if (values.length !== 1) return { value: null, omitted: false };
  const value = values[0]?.toString() || '';
  return { value: value || null, omitted: value === '' };
}

function approvedSpbPayload({ env, origin, accountId, candidate, brokerToken }) {
  return {
    broker_endpoint: origin,
    account_id: accountId,
    instance_id: candidate.instanceId,
    bucket: env.R2_BUCKET,
    prefix: candidate.prefix,
    broker_token: brokerToken,
    status: 'approved',
  };
}

function needsSubscriptionSpbPayload({ env, origin, accountId, candidate }) {
  return {
    broker_endpoint: origin,
    account_id: accountId,
    instance_id: candidate.instanceId,
    bucket: env.R2_BUCKET,
    prefix: candidate.prefix,
    broker_token: '',
    status: 'needs_subscription',
    subscribe_url: `${origin}/services/backup?intent=restore`,
  };
}

async function insertSpbHandoff({ env, nonce, accountId, payload, nowMs, requireNew = false }) {
  const handoffHash = await hashServiceHandoffNonce(nonce, env);
  const payloadEncrypted = await encryptEmail(JSON.stringify(payload), env);
  const inserted = await insertServiceHandoff(env.DB, {
    handoffHash,
    accountId,
    service: 'spb',
    payloadEncrypted,
    createdAt: nowMs,
    expiresAt: nowMs + HANDOFF_TTL_MS,
  });
  if (!inserted.ok && (requireNew || inserted.reason !== 'duplicate')) {
    throw new Error('could not create SPB handoff');
  }
}

export async function handleHandoffSpb(req, env) {
  const url = new URL(req.url);
  const nonce = (url.searchParams.get('nonce') || '').trim().toUpperCase();
  if (!NONCE_REGEX.test(nonce)) return handoffJson({ error: 'invalid_request' }, { status: 400 });

  const handoffHash = await hashServiceHandoffNonce(nonce, env);
  const started = Date.now();
  while (Date.now() - started <= HANDOFF_POLL_BUDGET_MS) {
    const nowMs = Date.now();
    const consumed = await consumeServiceHandoff(env.DB, { handoffHash, nowMs, service: 'spb' });
    if (consumed) {
      const plaintext = await decryptEmail(consumed.payload_encrypted, env);
      return handoffJson(JSON.parse(plaintext), { headers: { Pragma: 'no-cache' } });
    }

    const status = await findServiceHandoffStatus(env.DB, { handoffHash, service: 'spb' });
    if (status && (status.consumed_at != null || status.expires_at <= nowMs)) {
      return handoffJson({ error: 'gone' }, { status: 410 });
    }

    const elapsed = Date.now() - started;
    if (elapsed >= HANDOFF_POLL_BUDGET_MS) break;
    await sleep(Math.min(HANDOFF_POLL_MS, HANDOFF_POLL_BUDGET_MS - elapsed));
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}


async function refuseSppToEarlyAccess({ env, nonce, accountId, instance, nowMs }) {
  const handoffHash = await hashServiceHandoffNonce(nonce, env);
  let inserted;
  try {
    const payloadEncrypted = await encryptEmail(JSON.stringify({ state: 'early_access' }), env);
    inserted = await insertServiceHandoff(env.DB, {
      handoffHash,
      accountId,
      service: 'spp',
      payloadEncrypted,
      createdAt: nowMs,
      expiresAt: nowMs + HANDOFF_TTL_MS,
    });
  } catch {
    return sppError(503);
  }
  // A duplicate is an idempotent refusal; audit only a fresh, instance-scoped handoff.
  if (inserted.ok && instance) {
    await insertSppMintAudit(env.DB, { accountId, instanceId: instance, scope: 'inference', outcome: 'refused_entitlement', nowMs });
  }
  return noStoreHtml(renderEnableSppApprovalRequired());
}

// Where a sign-in stands for turning confidential processing on for one journal: entitled
// (scout or paid, by the same predicate the engine's authorize uses), refused because a paid
// subscription already covers another journal, or not entitled.
// Read-only, by the same rule reconcileSppEntitlement writes: a paid subscription that is still
// serving decides; without one, an approved scout is entitled; otherwise not.
// A journal already bound to this sign-in can always be turned on again; a new one under a paid
// subscription is capped ('entitled_capped', enforced again atomically at bind).
async function sppTurnOnStanding(env, { accountId, instance, nowMs }) {
  const entitlement = await getEntitlement(env.DB, { accountId, service: SPP_HOSTED_SERVICE });
  if (paidSignalFromRow(entitlement)) {
    if (!isSppEntitledToServe(entitlement, Math.floor(nowMs / 1000), env)) return 'not_entitled';
    if (await hasSppBinding(env.DB, { accountId, instanceId: instance })) return 'entitled';
    return await hasOtherSppBinding(env.DB, { accountId, instanceId: instance }) ? 'journal_limit' : 'entitled_capped';
  }
  const scout = await getScoutApplicationStatusByAccount(env.DB, { accountId });
  return scout?.status === 'approved' ? 'entitled' : 'not_entitled';
}

// Before the sale, only an approved scout or a sign-in with a paid subscription that is still
// serving may turn it on. Read-only: nothing is written for a sign-in that is refused.
async function sppAllowedBeforeSale(env, { accountId, nowMs }) {
  const scout = await getScoutApplicationStatusByAccount(env.DB, { accountId });
  if (scout?.status === 'approved') return true;
  const entitlement = await getEntitlement(env.DB, { accountId, service: SPP_HOSTED_SERVICE });
  return entitlement?.source === 'stripe' && isSppEntitledToServe(entitlement, Math.floor(nowMs / 1000), env);
}

export async function handleEnableSppGet(req, env) {
  const url = new URL(req.url);
  const carries = url.searchParams.has('assertion') || url.searchParams.has('ca_pubkey');
  const nonce = (url.searchParams.get('nonce') || '').trim().toUpperCase();
  if (!NONCE_REGEX.test(nonce)) return applyProofHeaders(sppError(400), carries);
  const instance = parseOptionalInstance(url.searchParams);
  const proof = classifyProof(url.searchParams);
  const resumeQuery = sppResumeQuery(nonce, instance, proof);

  const session = await getValidSession(req, env, Date.now());
  if (!session) return signInRedirect(env, ENABLE_SPP_PATH, resumeQuery);

  const onSale = sppOnSale(env);
  const nowMs = Date.now();
  if (!onSale && !await sppAllowedBeforeSale(env, { accountId: session.account_id, nowMs })) {
    const allowed = await serviceEnableProofAllows(env, {
      service: 'spp',
      accountId: session.account_id,
      instanceId: instance,
      nonce,
      proof,
    });
    if (!allowed) return applyProofHeaders(sppError(400), carries);

    return applyProofHeaders(
      await refuseSppToEarlyAccess({ env, nonce, accountId: session.account_id, instance, nowMs }),
      carries
    );
  }

  const csrf = await csrfToken(env);
  return applyProofHeaders(noStoreHtml(renderEnableSppConsent({ csrf, nonce, instance, onSale, proof })), carries);
}

export async function handleEnableSppConfirm(req, env, ctx) {
  if (!originAllowed(req)) return noStoreResponse(forbidden());
  const form = await readForm(req);
  if (!form) return sppError(400);

  const nonce = (form.get('nonce')?.toString() || '').trim().toUpperCase();
  if (!NONCE_REGEX.test(nonce)) return sppError(400);

  if ((form.get('action')?.toString() || '') === 'cancel') {
    return redirect('/', 303, { 'Cache-Control': 'no-store' });
  }

  const instance = parseOptionalInstance(form);
  if (!instance) return sppError(400);
  const proof = classifyProof(form);
  const resumeQuery = sppResumeQuery(nonce, instance, proof);
  const session = await getValidSession(req, env, Date.now());
  if (!session) return signInRedirect(env, ENABLE_SPP_PATH, resumeQuery);
  const account = await getAccountTransparencyRow(env.DB, session.account_id);
  if (!account) {
    return redirect('/', 303, { 'Set-Cookie': clearSessionCookie(), 'Cache-Control': 'no-store' });
  }

  const csrf = await csrfToken(env);
  if (!timingSafeEqual(form.get('csrf')?.toString() || '', csrf)) {
    return sppError(403);
  }

  if (form.get('data_ack')?.toString() !== 'yes') return sppError(400);

  const nowMs = Date.now();
  const accountId = session.account_id;

  const allowed = await serviceEnableProofAllows(env, {
    service: 'spp',
    accountId,
    instanceId: instance,
    nonce,
    proof,
  });
  if (!allowed) return sppError(400);

  // A second submit of the same turn-on (a double click, a resubmitted form) changes nothing: the
  // first one's answer is already waiting for the journal, and binding again would replace the
  // credential it carries.
  const existing = await findServiceHandoffStatus(env.DB, { handoffHash: await hashServiceHandoffNonce(nonce, env), service: 'spp' });
  if (existing) return existing.account_id === accountId ? noStoreHtml(renderEnableSppDone()) : sppError(409);

  // Entitlement gate, re-read at the head of the issuance branch. Before the sale, a sign-in
  // that may not turn it on gets the content-free terminal refusal, exactly as before, and
  // nothing is written for it.
  const onSale = sppOnSale(env);
  if (!onSale && !await sppAllowedBeforeSale(env, { accountId, nowMs })) {
    return refuseSppToEarlyAccess({ env, nonce, accountId, instance, nowMs });
  }
  const standing = await sppTurnOnStanding(env, { accountId, instance, nowMs });

  if (standing === 'not_entitled') {
    if (!onSale) return refuseSppToEarlyAccess({ env, nonce, accountId, instance, nowMs });
    // On sale: the consent is kept on a waiting handoff, not a binding, and no credential is
    // made. Each time the journal asks, the answer is worked out again, so the journal finishes
    // turning it on by itself once the subscription is active.
    const inserted = await insertSppHandoff({
      env,
      nonce,
      accountId,
      payload: {
        state: 'awaiting_subscription',
        instance_id: instance,
        consent_acked_at: nowMs,
        consent_disclosure_version: SPP_CONSENT_DISCLOSURE_VERSION,
        // Server-held authorization admitted by the verification above. Client fields
        // never supply this marker, and no signed assertion needs to be retained.
        possession_proved: proof.kind === 'supplied',
      },
      nowMs,
      ttlMs: SUBSCRIBE_WAIT_MS,
    });
    if (!inserted) return sppError(503);
    await insertSppMintAudit(env.DB, { accountId, instanceId: instance, scope: 'inference', outcome: 'refused_entitlement', nowMs });
    return noStoreHtml(renderEnableSppNeedsSubscription());
  }

  if (standing === 'journal_limit') {
    const inserted = await insertSppHandoff({
      env,
      nonce,
      accountId,
      payload: { state: 'journal_limit', subscribe_url: SPP_SUBSCRIBE_URL },
      nowMs,
      ttlMs: HANDOFF_TTL_MS,
    });
    if (!inserted) return sppError(503);
    await insertSppMintAudit(env.DB, { accountId, instanceId: instance, scope: 'inference', outcome: 'refused_entitlement', nowMs });
    return noStoreHtml(renderEnableSppJournalLimit());
  }

  let payload;
  try {
    payload = await bindAndMintSpp(env, {
      accountId, instance, consentAckedAt: nowMs, nowMs, capped: standing === 'entitled_capped', nonce,
    });
  } catch {
    // The transaction rolled back; a losing submit cannot replace the token
    // delivered by the existing handoff.
    return sppError(503);
  }
  if (payload === 'journal_limit') {
    const inserted = await insertSppHandoff({
      env, nonce, accountId, payload: { state: 'journal_limit', subscribe_url: SPP_SUBSCRIBE_URL }, nowMs, ttlMs: HANDOFF_TTL_MS,
    });
    if (!inserted) return sppError(503);
    return noStoreHtml(renderEnableSppJournalLimit());
  }
  if (!payload) return sppError(409);
  // Paid first: a scout reconcile never lapses or overwrites a paying owner's subscription.
  await reconcileSppEntitlement(env, accountId, nowMs, ctx);
  await insertSppMintAudit(env.DB, { accountId, instanceId: instance, scope: 'inference', outcome: 'minted', nowMs });
  return noStoreHtml(renderEnableSppDone());
}

// Binds the journal to the sign-in and makes its credential. 'journal_limit' when a paid
// subscription already covers another journal (capped), null when another active sign-in already
// holds this journal: either way nothing is bound or issued.
async function bindAndMintSpp(env, {
  accountId,
  instance,
  consentAckedAt,
  nowMs,
  capped = false,
  consentDisclosureVersion = SPP_CONSENT_DISCLOSURE_VERSION,
  nonce,
}) {
  const token = generateSessionToken();
  const tokenHash = await hashWithPepper(token, env);
  const payload = {
    state: 'approved',
    endpoint_url: env.SPP_ENGINE_ENDPOINT,
    served_model_id: env.SPP_ENGINE_MODEL,
    credential: token,
    account_id: accountId,
    instance_id: instance,
    created_at: new Date(nowMs).toISOString(),
  };
  const handoff = nonce ? {
    handoffHash: await hashServiceHandoffNonce(nonce, env),
    payloadEncrypted: await encryptEmail(JSON.stringify(payload), env),
    createdAt: nowMs,
    expiresAt: nowMs + HANDOFF_TTL_MS,
  } : undefined;
  const bound = await upsertSppBinding(env.DB, {
    accountId,
    instanceId: instance,
    tokenHash,
    nowMs,
    consentAckedAt,
    consentDisclosureVersion,
    capped,
    handoff,
  });
  if (!bound) {
    if (capped && await hasOtherSppBinding(env.DB, { accountId, instanceId: instance })) return 'journal_limit';
    return null;
  }
  return payload;
}

async function insertSppHandoff({ env, nonce, accountId, payload, nowMs, ttlMs }) {
  const handoffHash = await hashServiceHandoffNonce(nonce, env);
  try {
    const payloadEncrypted = await encryptEmail(JSON.stringify(payload), env);
    const inserted = await insertServiceHandoff(env.DB, {
      handoffHash,
      accountId,
      service: 'spp',
      payloadEncrypted,
      createdAt: nowMs,
      expiresAt: nowMs + ttlMs,
    });
    return inserted.ok;
  } catch {
    return false;
  }
}

// A waiting turn-on, asked again. Not entitled yet: the same needs_subscription answer, and the
// handoff stays open. Entitled now: the handoff is consumed (once, atomically), then the journal
// is bound and its credential made, or refused when a paid subscription covers another journal.
async function resolveWaitingSpp(env, { handoffHash, accountId, waiting, nowMs }) {
  const instance = typeof waiting.instance_id === 'string' && INSTANCE_ID_REGEX.test(waiting.instance_id)
    ? waiting.instance_id
    : null;
  if (!instance) return handoffJson({ error: 'gone' }, { status: 410 });
  // An unsigned consent admitted before enforcement cannot later create a first
  // binding. A verified consent can finish within this handoff's existing TTL.
  if (env.SERVICE_ENABLE_PROOF_REQUIRED === 'true'
    && waiting.possession_proved !== true
    && !await accountHoldsServiceBinding(env.DB, 'spp', accountId, instance)) {
    return handoffJson({ error: 'invalid_request' }, { status: 400 });
  }
  const standing = await sppTurnOnStanding(env, { accountId, instance, nowMs });
  const noCache = { headers: { Pragma: 'no-cache' } };
  if (standing === 'not_entitled') {
    // The sale was switched off while this turn-on waited: the answer from before the sale.
    if (!sppOnSale(env)) {
      const consumed = await consumeServiceHandoff(env.DB, { handoffHash, nowMs, service: 'spp' });
      if (!consumed) return handoffJson({ error: 'gone' }, { status: 410 });
      return handoffJson({ state: 'early_access' }, noCache);
    }
    return handoffJson({ state: 'needs_subscription', subscribe_url: SPP_SUBSCRIBE_URL }, noCache);
  }
  // Consumed once, atomically, before anything is bound: only one poll can mint.
  const consumed = await consumeServiceHandoff(env.DB, { handoffHash, nowMs, service: 'spp' });
  if (!consumed) return handoffJson({ error: 'gone' }, { status: 410 });
  const limit = { state: 'journal_limit', subscribe_url: SPP_SUBSCRIBE_URL };
  if (standing === 'journal_limit') {
    await bestEffort(() => insertSppMintAudit(env.DB, { accountId, instanceId: instance, scope: 'inference', outcome: 'refused_entitlement', nowMs }));
    return handoffJson(limit, noCache);
  }
  const consentAckedAt = Number.isInteger(waiting.consent_acked_at) ? waiting.consent_acked_at : nowMs;
  const payload = await bindAndMintSpp(env, {
    accountId,
    instance,
    consentAckedAt,
    nowMs,
    capped: standing === 'entitled_capped',
    consentDisclosureVersion: typeof waiting.consent_disclosure_version === 'string'
      ? waiting.consent_disclosure_version
      : SPP_CONSENT_DISCLOSURE_VERSION,
  });
  if (payload === 'journal_limit') return handoffJson(limit, noCache);
  if (!payload) return handoffJson({ error: 'gone' }, { status: 410 });
  // The credential is bound; from here nothing may stop it reaching the journal.
  await bestEffort(() => reconcileSppEntitlement(env, accountId, nowMs));
  await bestEffort(() => insertSppMintAudit(env.DB, { accountId, instanceId: instance, scope: 'inference', outcome: 'minted', nowMs }));
  return handoffJson(payload, noCache);
}

async function bestEffort(step) {
  try {
    await step();
  } catch {
    console.warn('spp_handoff_followup_failed');
  }
}

export async function handleHandoffSpp(req, env) {
  const url = new URL(req.url);
  const nonce = (url.searchParams.get('nonce') || '').trim().toUpperCase();
  if (!NONCE_REGEX.test(nonce)) return handoffJson({ error: 'invalid_request' }, { status: 400 });

  const handoffHash = await hashServiceHandoffNonce(nonce, env);
  const started = Date.now();
  while (Date.now() - started <= HANDOFF_POLL_BUDGET_MS) {
    const nowMs = Date.now();
    const live = await peekServiceHandoff(env.DB, { handoffHash, nowMs, service: 'spp' });
    if (live) {
      const payload = JSON.parse(await decryptEmail(live.payload_encrypted, env));
      if (payload?.state === 'awaiting_subscription') {
        return resolveWaitingSpp(env, { handoffHash, accountId: live.account_id, waiting: payload, nowMs });
      }
      const consumed = await consumeServiceHandoff(env.DB, { handoffHash, nowMs, service: 'spp' });
      if (consumed) {
        const plaintext = await decryptEmail(consumed.payload_encrypted, env);
        return handoffJson(JSON.parse(plaintext), { headers: { Pragma: 'no-cache' } });
      }
    }

    const status = await findServiceHandoffStatus(env.DB, { handoffHash, service: 'spp' });
    if (status && (status.consumed_at != null || status.expires_at <= nowMs)) {
      return handoffJson({ error: 'gone' }, { status: 410 });
    }

    const elapsed = Date.now() - started;
    if (elapsed >= HANDOFF_POLL_BUDGET_MS) break;
    await sleep(Math.min(HANDOFF_POLL_MS, HANDOFF_POLL_BUDGET_MS - elapsed));
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

export async function handleEnableSmeGet(req, env) {
  const url = new URL(req.url);
  const carries = url.searchParams.has('assertion') || url.searchParams.has('ca_pubkey');
  const nonce = (url.searchParams.get('nonce') || '').trim().toUpperCase();
  if (!NONCE_REGEX.test(nonce)) return applyProofHeaders(smeError(400), carries);
  const instance = parseOptionalInstance(url.searchParams);
  if (!instance) return applyProofHeaders(smeError(400), carries);
  const proof = classifyProof(url.searchParams);
  const resumeQuery = smeResumeQuery(nonce, instance, proof);

  const session = await getValidSession(req, env, Date.now());
  if (!session) return signInRedirect(env, ENABLE_SME_PATH, resumeQuery);

  const csrf = await csrfToken(env);
  return applyProofHeaders(noStoreHtml(renderEnableSmeConsent({ csrf, nonce, instance, proof })), carries);
}

export async function handleEnableSmeConfirm(req, env, ctx) {
  if (!originAllowed(req)) return noStoreResponse(forbidden());
  const form = await readForm(req);
  if (!form) return smeError(400);

  const nonce = (form.get('nonce')?.toString() || '').trim().toUpperCase();
  if (!NONCE_REGEX.test(nonce)) return smeError(400);

  if ((form.get('action')?.toString() || '') === 'cancel') {
    return redirect('/', 303, { 'Cache-Control': 'no-store' });
  }

  const instance = parseOptionalInstance(form);
  if (!instance) return smeError(400);
  const proof = classifyProof(form);
  const resumeQuery = smeResumeQuery(nonce, instance, proof);
  const session = await getValidSession(req, env, Date.now());
  if (!session) return signInRedirect(env, ENABLE_SME_PATH, resumeQuery);
  const account = await getAccountTransparencyRow(env.DB, session.account_id);
  if (!account) {
    return redirect('/', 303, { 'Set-Cookie': clearSessionCookie(), 'Cache-Control': 'no-store' });
  }

  const csrf = await csrfToken(env);
  if (!timingSafeEqual(form.get('csrf')?.toString() || '', csrf)) {
    return smeError(403);
  }

  // The consent is enforced here, not by the form: no acknowledgement, no binding.
  if (form.get('data_ack')?.toString() !== 'yes') return smeError(400);

  const allowed = await serviceEnableProofAllows(env, {
    service: 'sme',
    accountId: session.account_id,
    instanceId: instance,
    nonce,
    proof,
  });
  if (!allowed) return smeError(400);

  const nowMs = Date.now();
  const accountId = session.account_id;
  // The binding records the owner's consent for this journal; it does not depend on
  // payment. Whether this journal can actually connect is the mint's entitlement gate,
  // so an owner who consents before subscribing is not asked again afterward.
  const bound = await upsertSmeBinding(env.DB, {
    accountId,
    instanceId: instance,
    nowMs,
    consentAckedAt: nowMs,
    consentDisclosureVersion: SME_CONSENT_DISCLOSURE_VERSION,
  });
  // This journal is already held by another active sign-in: nothing is bound or reconciled.
  if (!bound) return smeError(409);
  await reconcileSmeEntitlement(env, accountId, nowMs, ctx);
  const entitlement = await getEntitlement(env.DB, { accountId, service: SME_HOSTED_SERVICE });
  // The same predicate the mint gates on, so the handoff never says approved for a
  // journal the mint will refuse.
  const entitled = isSmeEntitledToServe(entitlement, Math.floor(nowMs / 1000), env);
  const payload = entitled
    ? { service: 'sme', state: 'approved', approved_at: new Date(nowMs).toISOString() }
    : {
        service: 'sme',
        state: 'needs_subscription',
        subscribe_url: `${new URL(req.url).origin}${SME_SERVICE_PATH}`,
      };
  const handoffHash = await hashServiceHandoffNonce(nonce, env);
  let inserted;
  try {
    const payloadEncrypted = await encryptEmail(JSON.stringify(payload), env);
    inserted = await insertServiceHandoff(env.DB, {
      handoffHash,
      accountId,
      service: 'sme',
      payloadEncrypted,
      createdAt: nowMs,
      expiresAt: nowMs + HANDOFF_TTL_MS,
    });
  } catch {
    return smeError(503);
  }
  // A duplicate nonce means the outcome was not landed in a handoff; fail closed.
  if (!inserted.ok) return smeError(503);
  if (!entitled) return noStoreHtml(renderEnableSmeNeedsSubscription());
  return noStoreHtml(renderEnableSmeDone());
}

export async function handleHandoffSpa(req, env) {
  // Byte-for-byte mirror of handleHandoffSpp with service: 'sme'.
  const url = new URL(req.url);
  const nonce = (url.searchParams.get('nonce') || '').trim().toUpperCase();
  if (!NONCE_REGEX.test(nonce)) return handoffJson({ error: 'invalid_request' }, { status: 400 });

  const handoffHash = await hashServiceHandoffNonce(nonce, env);
  const started = Date.now();
  while (Date.now() - started <= HANDOFF_POLL_BUDGET_MS) {
    const nowMs = Date.now();
    const consumed = await consumeServiceHandoff(env.DB, { handoffHash, nowMs, service: 'sme' });
    if (consumed) {
      const plaintext = await decryptEmail(consumed.payload_encrypted, env);
      return handoffJson(JSON.parse(plaintext), { headers: { Pragma: 'no-cache' } });
    }

    const status = await findServiceHandoffStatus(env.DB, { handoffHash, service: 'sme' });
    if (status && (status.consumed_at != null || status.expires_at <= nowMs)) {
      return handoffJson({ error: 'gone' }, { status: 410 });
    }

    const elapsed = Date.now() - started;
    if (elapsed >= HANDOFF_POLL_BUDGET_MS) break;
    await sleep(Math.min(HANDOFF_POLL_MS, HANDOFF_POLL_BUDGET_MS - elapsed));
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

function appendProofParams(params, proof) {
  if (!proof || proof.kind !== 'supplied') return;
  for (const assertion of proof.assertions) {
    params.append('assertion', assertion);
  }
  for (const caPubkey of proof.caPubkeys) {
    params.append('ca_pubkey', caPubkey);
  }
}

function splResumeQuery(nonce, instance, proof = null) {
  const params = new URLSearchParams({ nonce });
  if (instance) params.set('instance', instance);
  appendProofParams(params, proof);
  return `?${params.toString()}`;
}

function spbResumeQuery(nonce, instance, restore = false, proof = null) {
  const params = new URLSearchParams({ nonce });
  if (restore) params.set('intent', 'restore');
  if (instance) params.set('instance', instance);
  appendProofParams(params, proof);
  return `?${params.toString()}`;
}

function sppResumeQuery(nonce, instance, proof = null) {
  const params = new URLSearchParams({ nonce });
  if (instance) params.set('instance', instance);
  appendProofParams(params, proof);
  return `?${params.toString()}`;
}

function smeResumeQuery(nonce, instance, proof = null) {
  const params = new URLSearchParams({ nonce, instance });
  appendProofParams(params, proof);
  return `?${params.toString()}`;
}

function parseOptionalInstance(params) {
  const values = params.getAll('instance');
  if (values.length !== 1) return null;
  const instance = values[0]?.toString() || '';
  return INSTANCE_ID_REGEX.test(instance) ? instance : null;
}

function isRestoreIntent(value) {
  return (value || '').toString().trim() === 'restore';
}

function isSplEntitled(entitlement) {
  return entitlement?.status === 'active' || entitlement?.status === 'past_due';
}

function isSpbEntitled(entitlement) {
  return entitlement?.status === 'active' || entitlement?.status === 'past_due';
}

export async function signInRedirect(env, path, queryString) {
  const resume = await signEnableResume(path, queryString, env);
  const carries = resumeCarriesProof(queryString);
  const headers = {
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex',
  };
  if (carries) {
    headers['Referrer-Policy'] = 'no-referrer';
  }
  return redirect(`/?next=${encodeURIComponent(resume.next)}&next_sig=${encodeURIComponent(resume.nextSig)}`, 303, headers);
}

async function csrfToken(env) {
  return hashKey('csrf', 'account', env);
}

async function readForm(req) {
  try {
    const form = await req.formData();
    // Native form encoding converts the canonical PEM's LF to CRLF.
    // Keep multiplicity and all other malformed input intact for classification.
    const keys = form.getAll('ca_pubkey');
    if (keys.length === 1 && typeof keys[0] === 'string') {
      form.set('ca_pubkey', keys[0].replace(/\r\n/g, '\n'));
    }
    return form;
  } catch {
    return null;
  }
}

function normalizeResume(path, queryString) {
  if (typeof path !== 'string' || typeof queryString !== 'string') return null;
  if (queryString === '' && isSupportResumePath(path)) return { path, queryString };
  if (!queryString.startsWith('?')) return null;
  const validator = RESUME_PATH_WHITELIST.get(path);
  if (!validator) return null;
  const params = new URLSearchParams(queryString.slice(1));
  if (!validator(params)) return null;
  return { path, queryString };
}

function isSupportResumePath(path) {
  if (path === '/support' || path === '/support/closed') return true;
  const parts = path.split('/');
  return parts.length === 3 && parts[1] === 'support' && SUPPORT_ID_REGEX.test(parts[2]);
}

function validateSplResumeParams(params) {
  const nonceValues = params.getAll('nonce');
  const instanceValues = params.getAll('instance');
  if (nonceValues.length !== 1 || !NONCE_REGEX.test(nonceValues[0])) return false;
  if (instanceValues.length === 0) return true;
  return instanceValues.length === 1 && INSTANCE_ID_REGEX.test(instanceValues[0]);
}

function validateSpbResumeParams(params) {
  const nonceValues = params.getAll('nonce');
  const instanceValues = params.getAll('instance');
  const intentValues = params.getAll('intent');
  if (nonceValues.length !== 1 || !NONCE_REGEX.test(nonceValues[0])) return false;
  if (intentValues.length > 0) {
    return intentValues.length === 1 && intentValues[0] === 'restore' && instanceValues.length === 0;
  }
  if (instanceValues.length === 0) return true;
  return instanceValues.length === 1 && INSTANCE_ID_REGEX.test(instanceValues[0]);
}

function validateSppResumeParams(params) {
  const nonceValues = params.getAll('nonce');
  const instanceValues = params.getAll('instance');
  if (nonceValues.length !== 1 || !NONCE_REGEX.test(nonceValues[0])) return false;
  if (instanceValues.length === 0) return true;
  return instanceValues.length === 1 && INSTANCE_ID_REGEX.test(instanceValues[0]);
}

function validateSmeResumeParams(params) {
  const nonceValues = params.getAll('nonce');
  const instanceValues = params.getAll('instance');
  if (nonceValues.length !== 1 || !NONCE_REGEX.test(nonceValues[0])) return false;
  return instanceValues.length === 1 && INSTANCE_ID_REGEX.test(instanceValues[0]);
}

function splError(status) {
  return noStoreHtml(renderEnableSplError(), { status });
}

function spbError(status) {
  return noStoreHtml(renderEnableSpbError(), { status });
}

function sppError(status) {
  return noStoreHtml(renderEnableSppError(), { status });
}

function smeError(status) {
  return noStoreHtml(renderEnableSmeError(), { status });
}

function noStoreHtml(body, init = {}) {
  return html(body, {
    ...init,
    headers: { 'Cache-Control': 'no-store', ...(init.headers || {}) },
  });
}

function noStoreResponse(response) {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function handoffJson(body, init = {}) {
  return json(body, {
    ...init,
    headers: { ...(init.headers || {}) },
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
