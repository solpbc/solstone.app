import {
  decryptEmail,
  encryptEmail,
  hashKey,
  hashServiceHandoffNonce,
  hashWithPepper,
  timingSafeEqual,
} from './crypto.js';
import {
  issueScoutCapability,
  issueSpbCapability,
  issueSplCapability,
  issueSppCapability,
} from './capability-issuance.js';
import { mintDispatchToken, resolveBearerAccount } from './dispatch-tokens.js';
import {
  applyScoutPendingWithEvent,
  bumpDeviceLastSeen,
  consumeServiceHandoff,
  findActiveProvisionedKey,
  findDeviceByPushKey,
  findServiceHandoffStatus,
  getAccountTransparencyRow,
  getEntitlement,
  getScoutApplicationByAccount,
  getScoutApplicationStatusByAccount,
  insertDevice,
  insertServiceHandoff,
  insertSppMintAudit,
  revokeDevicePriorAndInsertNew,
  setScoutApplicationDataAcked,
} from './db.js';
import {
  BUNDLE_ID_REGEX,
  DEVICE_TOKEN_REGEX,
  HANDOFF_TTL_MS,
  INSTANCE_ID_REGEX,
  MAX_USE_CASE_LEN,
  NONCE_REGEX,
  PUSH_PLATFORM_ALLOWLIST,
} from './enable-constants.js';
import { SUPPORT_ID_REGEX } from './support-constants.js';
import {
  renderEnablePushConsent,
  renderEnablePushDone,
  renderEnablePushError,
  renderEnableScoutConsent,
  renderEnableScoutDone,
  renderEnableScoutError,
  renderEnableScoutPendingDone,
  renderEnableScoutRevokedDone,
  renderEnableSplConsent,
  renderEnableSplDone,
  renderEnableSplError,
  renderEnableSplNeedsSubscription,
  renderEnableSpbConsent,
  renderEnableSpbDone,
  renderEnableSpbError,
  renderEnableSpbNeedsSubscription,
  renderEnableSppConsent,
  renderEnableSppDone,
  renderEnableSppEarlyAccess,
  renderEnableSppError,
  renderError,
} from './html.js';
import { forbidden, html, json, originAllowed, redirect } from './index.js';
import { ensureProvisionedKey, ProvisioningBusyError } from './provisioning.js';
import { SPL_HOSTED_SERVICE } from './relay-grant.js';
import { clearSessionCookie, getValidSession } from './session.js';
import { SPB_HOSTED_SERVICE } from './spb-entitlement.js';
import { SPP_CONSENT_DISCLOSURE_VERSION } from './spp-entitlement.js';

const HANDOFF_POLL_MS = 1500;
const HANDOFF_POLL_BUDGET_MS = 30_000;
const ENABLE_PATH = '/enable/scout';
const ENABLE_PUSH_PATH = '/enable/push';
const ENABLE_SPL_PATH = '/enable/spl';
const ENABLE_SPB_PATH = '/enable/backup';
const ENABLE_SPP_PATH = '/enable/spp';
const GEMINI_PROVIDER = 'gemini';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const RESUME_PATH_WHITELIST = new Map([
  [ENABLE_PATH, validateScoutResumeParams],
  [ENABLE_PUSH_PATH, validatePushResumeParams],
  [ENABLE_SPL_PATH, validateSplResumeParams],
  [ENABLE_SPB_PATH, validateSpbResumeParams],
  [ENABLE_SPP_PATH, validateSppResumeParams],
]);

export async function provisionScoutForAccount({ env, accountId, ctx }) {
  const googleApiKey = await ensureProvisionedKey({ env, accountId });
  const issued = await issueScoutCapability({ env, accountId, googleApiKey });
  return issued.capability;
}

export async function registerDeviceForAccount({
  env,
  accountId,
  deviceToken,
  platform,
  bundleId,
  pushTokenEnv,
  deviceLabel = null,
  appVersion = null,
  nowMs = Date.now(),
}) {
  const existing = await findDeviceByPushKey(env.DB, { pushToken: deviceToken, bundleId, pushTokenEnv });
  if (existing && existing.account_id === accountId) {
    try {
      await bumpDeviceLastSeen(env.DB, { deviceId: existing.device_id, nowMs });
    } catch {
      console.error('device_last_seen_bump_failed');
    }
    return { deviceId: existing.device_id, createdAt: nowMs, isNewDevice: false };
  }

  const newDevice = {
    deviceId: crypto.randomUUID(),
    accountId,
    platform,
    pushToken: deviceToken,
    pushTokenEnv,
    bundleId,
    deviceLabel,
    appVersion,
    nowMs,
  };

  if (existing) {
    await revokeDevicePriorAndInsertNew(env.DB, {
      priorDeviceId: existing.device_id,
      newDevice,
      nowMs,
    });
  } else {
    await insertDevice(env.DB, newDevice);
  }
  return { deviceId: newDevice.deviceId, createdAt: nowMs, isNewDevice: true };
}

export async function signEnableResume(path, queryString, env) {
  const resume = normalizeResume(path, queryString);
  if (!resume) return null;
  const next = base64Url(encoder.encode(JSON.stringify(resume)));
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

export async function handleEnableScoutGet(req, env) {
  const url = new URL(req.url);
  const parsed = parseEnableRequest(url);
  if (parsed.error) return enableError(parsed.error, parsed.status || 400);
  const csrf = await csrfToken(env);

  const session = await getValidSession(req, env, Date.now());
  if (!session) return signInRedirect(env, parsed.resumePath, parsed.resumeQuery);

  return noStoreHtml(renderEnableScoutConsent({
    csrf,
    nonce: parsed.nonce,
    accountId: session.account_id,
  }));
}

export async function handleEnableScoutConfirm(req, env, ctx) {
  if (!originAllowed(req)) return noStoreResponse(forbidden());
  const form = await readForm(req);
  if (!form) return noStoreHtml(renderEnableScoutError({ message: 'that request could not be completed.' }), { status: 400 });

  const nonce = (form.get('nonce')?.toString() || '').trim().toUpperCase();
  const source = parsePostedSource({ nonce });
  if (!source) return noStoreHtml(renderEnableScoutError({ message: 'that request could not be completed.' }), { status: 400 });

  if ((form.get('action')?.toString() || '') === 'cancel') {
    return redirect('/', 303, { 'Cache-Control': 'no-store' });
  }

  const session = await getValidSession(req, env, Date.now());
  if (!session) {
    return signInRedirect(env, ENABLE_PATH, `?nonce=${source.nonce}`);
  }
  const account = await getAccountTransparencyRow(env.DB, session.account_id);
  if (!account) {
    return redirect('/', 303, { 'Set-Cookie': clearSessionCookie(), 'Cache-Control': 'no-store' });
  }

  const csrf = await csrfToken(env);
  if (!timingSafeEqual(form.get('csrf')?.toString() || '', csrf)) {
    return noStoreHtml(renderEnableScoutError({ message: 'that request could not be completed.' }), { status: 403 });
  }

  const originalAccountId = form.get('account_id')?.toString() || '';
  if (originalAccountId !== session.account_id) {
    return redirect(`${ENABLE_PATH}?nonce=${source.nonce}`, 303, { 'Cache-Control': 'no-store' });
  }

  if (form.get('data_ack')?.toString() !== 'yes') {
    return noStoreHtml(renderEnableScoutError({ message: 'that request could not be completed.' }), { status: 400 });
  }

  const rawUseCase = form.get('use_case')?.toString() || '';
  const trimmedUseCase = rawUseCase.trim();
  const useCase = trimmedUseCase ? trimmedUseCase.slice(0, MAX_USE_CASE_LEN) : null;
  const accountId = session.account_id;
  const nowMs = Date.now();
  const handoffHash = await hashServiceHandoffNonce(source.nonce, env);
  const app = await getScoutApplicationByAccount(env.DB, { accountId });

  // Handoff payload contract:
  // { state: 'pending', account_id, since: <applied_at_ms>, dispatch_token }
  // { state: 'approved', google_api_key, dispatch_token, account_id, created_at }
  // { state: 'revoked', account_id }
  // Approved retains today's google_api_key field and dispatch-token created_at ISO string.
  let state;
  let payload;
  if (!app || app.status === 'pending') {
    try {
      await applyScoutPendingWithEvent(env.DB, { accountId, useCase, dataAckedAt: nowMs, nowMs });
    } catch {
      return noStoreHtml(renderError(), { status: 500 });
    }
    const row = await getScoutApplicationByAccount(env.DB, { accountId });
    const dispatch = await mintDispatchToken(env, accountId);
    state = 'pending';
    payload = { state, account_id: accountId, since: row.applied_at, dispatch_token: dispatch.token };
  } else if (app.status === 'approved') {
    await setScoutApplicationDataAcked(env.DB, { accountId, nowMs });
    let provisioned;
    try {
      provisioned = await provisionScoutForAccount({ env, accountId, ctx });
    } catch (error) {
      if (error instanceof ProvisioningBusyError) {
        return noStoreHtml(renderEnableScoutError({ message: "something didn't finish. try again in a moment." }), {
          status: 503,
          headers: { 'Retry-After': '2' },
        });
      }
      return noStoreHtml(renderEnableScoutError({ message: "something didn't finish. try again in a moment." }), { status: 503 });
    }

    state = 'approved';
    payload = { state, ...provisioned };
  } else {
    state = 'revoked';
    payload = { state, account_id: accountId };
  }

  const payloadEncrypted = await encryptEmail(JSON.stringify(payload), env);
  try {
    await insertServiceHandoff(env.DB, {
      handoffHash,
      accountId,
      service: 'scout',
      payloadEncrypted,
      createdAt: nowMs,
      expiresAt: nowMs + HANDOFF_TTL_MS,
    });
  } catch {
    return noStoreHtml(renderEnableScoutError({ message: "something didn't finish. try again in a moment." }), { status: 503 });
  }

  const done = {
    pending: renderEnableScoutPendingDone,
    approved: renderEnableScoutDone,
    revoked: renderEnableScoutRevokedDone,
  }[state];
  return noStoreHtml(done());
}

export async function handleScoutStatus(req, env) {
  const auth = await resolveBearerAccount(req, env);
  if (auth instanceof Response) return auth;
  const row = await getScoutApplicationByAccount(env.DB, { accountId: auth.accountId });
  if (!row) return json({ error: 'not_found' }, { status: 404 });
  const activeKey = await findActiveProvisionedKey(env.DB, { accountId: auth.accountId, provider: GEMINI_PROVIDER });
  return json({
    account_id: auth.accountId,
    status: row.status,
    applied_at: row.applied_at,
    approved_at: row.approved_at,
    revoked_at: row.revoked_at,
    active_key: activeKey != null,
  });
}

export async function handleEnablePushGet(req, env) {
  const url = new URL(req.url);
  const parsed = parsePushParams(url.searchParams);
  if (!parsed) return pushError(400);

  const session = await getValidSession(req, env, Date.now());
  if (!session) return signInRedirect(env, ENABLE_PUSH_PATH, url.search);

  const csrf = await csrfToken(env);
  return noStoreHtml(renderEnablePushConsent({
    csrf,
    nonce: parsed.nonce,
    deviceToken: parsed.deviceToken,
    platform: parsed.platform,
    bundleId: parsed.bundleId,
  }));
}

export async function handleEnablePushConfirm(req, env) {
  if (!originAllowed(req)) return noStoreResponse(forbidden());
  const form = await readForm(req);
  if (!form) return pushError(400);

  const parsed = parsePushParams(form);
  if (!parsed) return pushError(400);

  if ((form.get('action')?.toString() || '') === 'cancel') {
    return redirect('/', 303, { 'Cache-Control': 'no-store' });
  }

  const session = await getValidSession(req, env, Date.now());
  if (!session) return signInRedirect(env, ENABLE_PUSH_PATH, pushQuery(parsed));
  const account = await getAccountTransparencyRow(env.DB, session.account_id);
  if (!account) {
    return redirect('/', 303, { 'Set-Cookie': clearSessionCookie(), 'Cache-Control': 'no-store' });
  }

  const csrf = await csrfToken(env);
  if (!timingSafeEqual(form.get('csrf')?.toString() || '', csrf)) {
    return pushError(403);
  }

  const registered = await registerDeviceForAccount({
    env,
    accountId: session.account_id,
    deviceToken: parsed.deviceToken,
    platform: parsed.platform,
    bundleId: parsed.bundleId,
    // L9W hardcoded sandbox per Article 8 disposition in account-push-v1.md § MVP.
    // Production APNs lands in a future arc with its own covenant pass.
    pushTokenEnv: 'sandbox',
  });
  const dispatch = await mintDispatchToken(env, session.account_id);
  const payload = {
    device_id: registered.deviceId,
    dispatch_token: dispatch.token,
    account_id: session.account_id,
    created_at: dispatch.createdAt,
  };
  const nowMs = Date.now();
  const payloadEncrypted = await encryptEmail(JSON.stringify(payload), env);
  const handoffHash = await hashServiceHandoffNonce(parsed.nonce, env);
  let inserted;
  try {
    inserted = await insertServiceHandoff(env.DB, {
      handoffHash,
      accountId: session.account_id,
      service: 'push',
      payloadEncrypted,
      createdAt: nowMs,
      expiresAt: nowMs + HANDOFF_TTL_MS,
    });
  } catch {
    return pushError(503);
  }
  if (!inserted.ok) return noStoreHtml(renderEnablePushDone());
  return noStoreHtml(renderEnablePushDone());
}

export async function handleHandoffScout(req, env) {
  const url = new URL(req.url);
  const nonce = (url.searchParams.get('nonce') || '').trim().toUpperCase();
  if (!NONCE_REGEX.test(nonce)) return handoffJson({ error: 'invalid_request' }, { status: 400 });

  const handoffHash = await hashServiceHandoffNonce(nonce, env);
  const started = Date.now();
  while (Date.now() - started <= HANDOFF_POLL_BUDGET_MS) {
    const nowMs = Date.now();
    const consumed = await consumeServiceHandoff(env.DB, { handoffHash, nowMs });
    if (consumed) {
      const plaintext = await decryptEmail(consumed.payload_encrypted, env);
      return handoffJson(JSON.parse(plaintext), { headers: { Pragma: 'no-cache' } });
    }

    const status = await findServiceHandoffStatus(env.DB, { handoffHash });
    if (status && (status.consumed_at != null || status.expires_at <= nowMs)) {
      return handoffJson({ error: 'gone' }, { status: 410 });
    }

    const elapsed = Date.now() - started;
    if (elapsed >= HANDOFF_POLL_BUDGET_MS) break;
    await sleep(Math.min(HANDOFF_POLL_MS, HANDOFF_POLL_BUDGET_MS - elapsed));
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

export async function handleHandoffPush(req, env) {
  const url = new URL(req.url);
  const nonce = (url.searchParams.get('nonce') || '').trim().toUpperCase();
  if (!NONCE_REGEX.test(nonce)) return handoffJson({ error: 'invalid_request' }, { status: 400 });

  const handoffHash = await hashServiceHandoffNonce(nonce, env);
  const started = Date.now();
  while (Date.now() - started <= HANDOFF_POLL_BUDGET_MS) {
    const nowMs = Date.now();
    const consumed = await consumeServiceHandoff(env.DB, { handoffHash, nowMs, service: 'push' });
    if (consumed) {
      const plaintext = await decryptEmail(consumed.payload_encrypted, env);
      return handoffJson(JSON.parse(plaintext), { headers: { Pragma: 'no-cache' } });
    }

    const status = await findServiceHandoffStatus(env.DB, { handoffHash, service: 'push' });
    if (status && (status.consumed_at != null || status.expires_at <= nowMs)) {
      return handoffJson({ error: 'gone' }, { status: 410 });
    }

    const elapsed = Date.now() - started;
    if (elapsed >= HANDOFF_POLL_BUDGET_MS) break;
    await sleep(Math.min(HANDOFF_POLL_MS, HANDOFF_POLL_BUDGET_MS - elapsed));
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

export async function handleEnableSplGet(req, env) {
  const url = new URL(req.url);
  const nonce = (url.searchParams.get('nonce') || '').trim().toUpperCase();
  if (!NONCE_REGEX.test(nonce)) return splError(400);
  const instance = parseOptionalInstance(url.searchParams);
  const resumeQuery = splResumeQuery(nonce, instance);

  const session = await getValidSession(req, env, Date.now());
  if (!session) return signInRedirect(env, ENABLE_SPL_PATH, resumeQuery);

  const csrf = await csrfToken(env);
  const entitlement = await getEntitlement(env.DB, { accountId: session.account_id, service: SPL_HOSTED_SERVICE });
  const entitled = isSplEntitled(entitlement);
  return noStoreHtml(renderEnableSplConsent({ csrf, nonce, instance, entitled }));
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
  const resumeQuery = splResumeQuery(nonce, instance);
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

  const nowMs = Date.now();
  const issued = await issueSplCapability({
    env,
    accountId: session.account_id,
    instanceId: instance,
    nowMs,
    ctx,
  });
  if (issued.outcome === 'ownership_conflict') {
    return noStoreHtml(renderError(), { status: 500 });
  }
  const entitled = issued.outcome === 'issued';
  const payload = entitled
    ? issued.capability
    : {
        service: 'spl',
        state: 'needs_subscription',
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
      expiresAt: nowMs + HANDOFF_TTL_MS,
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
    const consumed = await consumeServiceHandoff(env.DB, { handoffHash, nowMs, service: 'spl' });
    if (consumed) {
      const plaintext = await decryptEmail(consumed.payload_encrypted, env);
      return handoffJson(JSON.parse(plaintext), { headers: { Pragma: 'no-cache' } });
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

export async function handleEnableSpbGet(req, env) {
  const url = new URL(req.url);
  const nonce = (url.searchParams.get('nonce') || '').trim().toUpperCase();
  if (!NONCE_REGEX.test(nonce)) return spbError(400);
  const instance = parseOptionalInstance(url.searchParams);
  const resumeQuery = spbResumeQuery(nonce, instance);

  const session = await getValidSession(req, env, Date.now());
  if (!session) return signInRedirect(env, ENABLE_SPB_PATH, resumeQuery);

  const csrf = await csrfToken(env);
  const entitlement = await getEntitlement(env.DB, { accountId: session.account_id, service: SPB_HOSTED_SERVICE });
  const entitled = isSpbEntitled(entitlement);
  return noStoreHtml(renderEnableSpbConsent({ csrf, nonce, instance, entitled }));
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

  const instance = parseOptionalInstance(form);
  if (!instance) return spbError(400);
  const resumeQuery = spbResumeQuery(nonce, instance);
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

  const nowMs = Date.now();
  const accountId = session.account_id;
  const origin = new URL(req.url).origin;
  const issued = await issueSpbCapability({
    env,
    accountId,
    instanceId: instance,
    nowMs,
    brokerEndpoint: origin,
    ctx,
  });
  if (issued.outcome === 'ownership_conflict') return spbError(500);
  const entitled = issued.outcome === 'issued';
  const payload = {
    ...issued.capability,
    status: entitled ? 'approved' : 'needs_subscription',
  };
  if (!entitled) payload.subscribe_url = `${origin}/services/backup`;
  const handoffHash = await hashServiceHandoffNonce(nonce, env);
  try {
    const payloadEncrypted = await encryptEmail(JSON.stringify(payload), env);
    await insertServiceHandoff(env.DB, {
      handoffHash,
      accountId,
      service: 'spb',
      payloadEncrypted,
      createdAt: nowMs,
      expiresAt: nowMs + HANDOFF_TTL_MS,
    });
  } catch {
    return spbError(503);
  }
  if (!entitled) return noStoreHtml(renderEnableSpbNeedsSubscription());
  return noStoreHtml(renderEnableSpbDone());
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
  return noStoreHtml(renderEnableSppEarlyAccess());
}

export async function handleEnableSppGet(req, env) {
  const url = new URL(req.url);
  const nonce = (url.searchParams.get('nonce') || '').trim().toUpperCase();
  if (!NONCE_REGEX.test(nonce)) return sppError(400);
  const instance = parseOptionalInstance(url.searchParams);
  const resumeQuery = sppResumeQuery(nonce, instance);

  const session = await getValidSession(req, env, Date.now());
  if (!session) return signInRedirect(env, ENABLE_SPP_PATH, resumeQuery);

  const scout = await getScoutApplicationStatusByAccount(env.DB, { accountId: session.account_id });
  if (scout?.status !== 'approved') {
    return refuseSppToEarlyAccess({ env, nonce, accountId: session.account_id, instance, nowMs: Date.now() });
  }

  const csrf = await csrfToken(env);
  return noStoreHtml(renderEnableSppConsent({ csrf, nonce, instance }));
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
  const resumeQuery = sppResumeQuery(nonce, instance);
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

  // Scout gate: re-read status at the head of the issuance branch. Only an approved
  // scout obtains a credential; a non-scout records a content-free terminal refusal
  // and never reaches the mint — no token or binding.
  const scout = await getScoutApplicationStatusByAccount(env.DB, { accountId });
  if (scout?.status !== 'approved') {
    return refuseSppToEarlyAccess({ env, nonce, accountId, instance, nowMs });
  }

  const issued = await issueSppCapability({
    env,
    accountId,
    instanceId: instance,
    nowMs,
    consentAckedAt: nowMs,
    consentDisclosureVersion: SPP_CONSENT_DISCLOSURE_VERSION,
    ctx,
  });
  if (issued.outcome === 'ownership_conflict') {
    return noStoreHtml(renderError(), { status: 500 });
  }
  const payload = {
    state: 'approved',
    endpoint_url: issued.capability.endpoint_url,
    served_model_id: issued.capability.served_model_id,
    credential: issued.capability.credential,
    account_id: issued.capability.account_id,
    instance_id: instance,
    created_at: issued.capability.created_at,
  };
  const handoffHash = await hashServiceHandoffNonce(nonce, env);
  let inserted;
  try {
    const payloadEncrypted = await encryptEmail(JSON.stringify(payload), env);
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
  // A duplicate nonce collision means the credential was not landed in a handoff;
  // fail closed rather than record a false 'minted' audit for an undelivered credential.
  if (!inserted.ok) return sppError(503);
  await insertSppMintAudit(env.DB, { accountId, instanceId: instance, scope: 'inference', outcome: 'minted', nowMs });
  return noStoreHtml(renderEnableSppDone());
}

export async function handleHandoffSpp(req, env) {
  // Byte-for-byte mirror of handleHandoffSpb with service: 'spp'.
  const url = new URL(req.url);
  const nonce = (url.searchParams.get('nonce') || '').trim().toUpperCase();
  if (!NONCE_REGEX.test(nonce)) return handoffJson({ error: 'invalid_request' }, { status: 400 });

  const handoffHash = await hashServiceHandoffNonce(nonce, env);
  const started = Date.now();
  while (Date.now() - started <= HANDOFF_POLL_BUDGET_MS) {
    const nowMs = Date.now();
    const consumed = await consumeServiceHandoff(env.DB, { handoffHash, nowMs, service: 'spp' });
    if (consumed) {
      const plaintext = await decryptEmail(consumed.payload_encrypted, env);
      return handoffJson(JSON.parse(plaintext), { headers: { Pragma: 'no-cache' } });
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

function parseEnableRequest(url) {
  const nonceParam = url.searchParams.get('nonce');
  const nonce = (nonceParam || '').trim().toUpperCase();
  if (!nonce || !NONCE_REGEX.test(nonce)) return { error: 'invalid request', status: 400 };
  return { mode: 'nonce', nonce, resumePath: ENABLE_PATH, resumeQuery: `?nonce=${nonce}` };
}

function parsePushParams(params) {
  const nonce = singleParam(params, 'nonce');
  const deviceToken = singleParam(params, 'device_token');
  const platform = singleParam(params, 'platform');
  const bundleId = singleParam(params, 'bundle_id');
  if (
    !nonce ||
    !deviceToken ||
    !platform ||
    !bundleId ||
    !NONCE_REGEX.test(nonce) ||
    !DEVICE_TOKEN_REGEX.test(deviceToken) ||
    !PUSH_PLATFORM_ALLOWLIST.includes(platform) ||
    !BUNDLE_ID_REGEX.test(bundleId)
  ) {
    return null;
  }
  return { nonce, deviceToken, platform, bundleId };
}

function singleParam(params, name) {
  const values = params.getAll(name);
  if (values.length !== 1) return null;
  return values[0]?.toString() || '';
}

function pushQuery({ nonce, deviceToken, platform, bundleId }) {
  const params = new URLSearchParams({
    nonce,
    device_token: deviceToken,
    platform,
    bundle_id: bundleId,
  });
  return `?${params.toString()}`;
}

function splResumeQuery(nonce, instance) {
  const params = new URLSearchParams({ nonce });
  if (instance) params.set('instance', instance);
  return `?${params.toString()}`;
}

function spbResumeQuery(nonce, instance) {
  const params = new URLSearchParams({ nonce });
  if (instance) params.set('instance', instance);
  return `?${params.toString()}`;
}

function sppResumeQuery(nonce, instance) {
  const params = new URLSearchParams({ nonce });
  if (instance) params.set('instance', instance);
  return `?${params.toString()}`;
}

function parseOptionalInstance(params) {
  const values = params.getAll('instance');
  if (values.length !== 1) return null;
  const instance = values[0]?.toString() || '';
  return INSTANCE_ID_REGEX.test(instance) ? instance : null;
}

function isSplEntitled(entitlement) {
  return entitlement?.status === 'active' || entitlement?.status === 'past_due';
}

function isSpbEntitled(entitlement) {
  return entitlement?.status === 'active' || entitlement?.status === 'past_due';
}

function parsePostedSource({ nonce }) {
  if (nonce) return NONCE_REGEX.test(nonce) ? { mode: 'nonce', nonce } : null;
  return null;
}

export async function signInRedirect(env, path, queryString) {
  const resume = await signEnableResume(path, queryString, env);
  return redirect(`/?next=${encodeURIComponent(resume.next)}&next_sig=${encodeURIComponent(resume.nextSig)}`, 303, {
    'Cache-Control': 'no-store',
  });
}

async function csrfToken(env) {
  return hashKey('csrf', 'account', env);
}

async function readForm(req) {
  try {
    return await req.formData();
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
  if (path === '/support') return true;
  const parts = path.split('/');
  return parts.length === 3 && parts[1] === 'support' && SUPPORT_ID_REGEX.test(parts[2]);
}

function validateScoutResumeParams(params) {
  const nonceValues = params.getAll('nonce');
  return nonceValues.length === 1 && NONCE_REGEX.test(nonceValues[0]);
}

function validatePushResumeParams(params) {
  const nonceValues = params.getAll('nonce');
  const deviceTokenValues = params.getAll('device_token');
  const platformValues = params.getAll('platform');
  const bundleIdValues = params.getAll('bundle_id');
  if (
    nonceValues.length !== 1 ||
    deviceTokenValues.length !== 1 ||
    platformValues.length !== 1 ||
    bundleIdValues.length !== 1
  ) {
    return false;
  }
  return NONCE_REGEX.test(nonceValues[0]) &&
    DEVICE_TOKEN_REGEX.test(deviceTokenValues[0]) &&
    PUSH_PLATFORM_ALLOWLIST.includes(platformValues[0]) &&
    BUNDLE_ID_REGEX.test(bundleIdValues[0]);
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
  if (nonceValues.length !== 1 || !NONCE_REGEX.test(nonceValues[0])) return false;
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

function enableError(message, status) {
  return noStoreHtml(renderEnableScoutError({ message }), { status });
}

function pushError(status) {
  return noStoreHtml(renderEnablePushError(), { status });
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

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const pad = value.length % 4 === 2 ? '==' : value.length % 4 === 3 ? '=' : value.length % 4 === 0 ? '' : null;
  if (pad == null) throw new Error('invalid base64url');
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
