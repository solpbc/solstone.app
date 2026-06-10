import {
  decryptEmail,
  encryptEmail,
  hashKey,
  hashServiceHandoffNonce,
  hashWithPepper,
  timingSafeEqual,
} from './crypto.js';
import { mintDispatchToken } from './dispatch-tokens.js';
import {
  bumpDeviceLastSeen,
  consumeServiceHandoff,
  findDeviceByPushKey,
  findServiceHandoffStatus,
  getAccountTransparencyRow,
  insertDevice,
  insertServiceHandoff,
  revokeDevicePriorAndInsertNew,
} from './db.js';
import {
  BUNDLE_ID_REGEX,
  DEVICE_TOKEN_REGEX,
  HANDOFF_TTL_MS,
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
} from './html.js';
import { forbidden, html, json, originAllowed, redirect } from './index.js';
import { ensureProvisionedKey, ProvisioningBusyError } from './provisioning.js';
import { clearSessionCookie, getValidSession } from './session.js';

const HANDOFF_POLL_MS = 1500;
const HANDOFF_POLL_BUDGET_MS = 30_000;
const ENABLE_PATH = '/enable/scout';
const ENABLE_PUSH_PATH = '/enable/push';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const RESUME_PATH_WHITELIST = new Map([
  [ENABLE_PATH, validateScoutResumeParams],
  [ENABLE_PUSH_PATH, validatePushResumeParams],
]);

export async function provisionScoutForAccount({ env, accountId, ctx }) {
  const googleApiKey = await ensureProvisionedKey({ env, accountId });
  const dispatch = await mintDispatchToken(env, accountId);
  return {
    google_api_key: googleApiKey,
    dispatch_token: dispatch.token,
    account_id: accountId,
    created_at: dispatch.createdAt,
  };
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

  const handoffHash = await hashServiceHandoffNonce(source.nonce, env);

  let provisioned;
  try {
    provisioned = await provisionScoutForAccount({ env, accountId: session.account_id, ctx });
  } catch (error) {
    if (error instanceof ProvisioningBusyError) {
      return noStoreHtml(renderEnableScoutError({ message: "something didn't finish. try again in a moment." }), {
        status: 503,
        headers: { 'Retry-After': '2' },
      });
    }
    return noStoreHtml(renderEnableScoutError({ message: "something didn't finish. try again in a moment." }), { status: 503 });
  }

  const payload = { ...provisioned };
  const nowMs = Date.now();
  const payloadEncrypted = await encryptEmail(JSON.stringify(payload), env);
  let inserted;
  try {
    inserted = await insertServiceHandoff(env.DB, {
      handoffHash,
      accountId: session.account_id,
      service: 'scout',
      payloadEncrypted,
      createdAt: nowMs,
      expiresAt: nowMs + HANDOFF_TTL_MS,
    });
  } catch {
    return noStoreHtml(renderEnableScoutError({ message: "something didn't finish. try again in a moment." }), { status: 503 });
  }

  if (!inserted.ok) {
    return noStoreHtml(renderEnableScoutDone());
  }

  return noStoreHtml(renderEnableScoutDone());
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

function enableError(message, status) {
  return noStoreHtml(renderEnableScoutError({ message }), { status });
}

function pushError(status) {
  return noStoreHtml(renderEnablePushError(), { status });
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
