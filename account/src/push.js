import { timingSafeEqual } from './crypto.js';
import { json } from './index.js';

const APNS_JWT_TTL_SECONDS = 3300;
const APNS_CATEGORY_SOL_CHAT_REQUEST = 'SOLSTONE_SOL_CHAT_REQUEST';
const KIND_SOL_CHAT_REQUEST = 'sol_chat_request';
const encoder = new TextEncoder();

export async function handlePushDispatch(req, env) {
  const denied = authorizeRelay(req, env);
  if (denied) return denied;
  const body = await readJsonObject(req);
  if (body instanceof Response) return body;
  const input = validateDispatchBody(body);
  if (input instanceof Response) return input;
  const devices = input.devices;

  if (devices.length === 0) {
    return json({ ok: true, sent: 0, failed: 0, revoked: 0, revoked_tokens: [], failures: [] });
  }

  let jwt;
  try {
    jwt = await cachedApnsJwt(env);
  } catch {
    console.warn('apns_jwt_mint_failed');
    return json({ error: 'server_error' }, { status: 500 });
  }

  const payload = buildSolChatRequestPayload(input);
  const result = await fanOutSends(
    env,
    jwt,
    devices,
    payload,
    (activeJwt) => dispatchHeadersFor(env, activeJwt, input.request_id)
  );
  return json(result);
}

export async function handlePushDedup(req, env) {
  const denied = authorizeRelay(req, env);
  if (denied) return denied;
  const body = await readJsonObject(req);
  if (body instanceof Response) return body;
  const input = validateDedupBody(body);
  if (input instanceof Response) return input;
  const devices = input.devices;

  if (devices.length === 0) {
    return json({ ok: true, sent: 0, failed: 0, revoked: 0, revoked_tokens: [], failures: [] });
  }

  let jwt;
  try {
    jwt = await cachedApnsJwt(env);
  } catch {
    console.warn('apns_jwt_mint_failed');
    return json({ error: 'server_error' }, { status: 500 });
  }

  const payload = buildSilentChatLifecyclePayload(input);
  const result = await fanOutSends(
    env,
    jwt,
    devices,
    payload,
    (activeJwt) => dedupHeadersFor(env, activeJwt, input.request_id, input.action)
  );
  return json(result);
}

function authorizeRelay(req, env) {
  const auth = req.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match || !timingSafeEqual(match[1], env.PUSH_RELAY_SECRET)) {
    return json({ error: 'invalid_token' }, { status: 401 });
  }
  return null;
}

export async function mintApnsJwt(env) {
  const config = requireApnsConfig(env);
  const iat = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: config.keyId, typ: 'JWT' };
  const claims = { iss: config.teamId, iat };
  const signingInput = `${base64Url(encoder.encode(JSON.stringify(header)))}.${base64Url(encoder.encode(JSON.stringify(claims)))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(config.p8Pem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(signingInput)
  );
  const signatureBytes = new Uint8Array(signature);
  if (signatureBytes.byteLength !== 64) {
    throw new Error('APNs ES256 signature must be raw r|s');
  }
  return `${signingInput}.${base64Url(signatureBytes)}`;
}

export async function cachedApnsJwt(env) {
  const key = apnsJwtCacheKey(env);
  const cached = await env.GCP_TOKEN_CACHE?.get(key);
  if (cached) return cached;
  const jwt = await mintApnsJwt(env);
  await env.GCP_TOKEN_CACHE?.put(key, jwt, { expirationTtl: APNS_JWT_TTL_SECONDS });
  return jwt;
}

export function apnsJwtCacheKey(env) {
  if (!env.APNS_KEY_ID) throw new Error('APNS_KEY_ID is required');
  return `apns_jwt:${env.APNS_KEY_ID}:v1`;
}

export function buildSolChatRequestPayload({ summary, category, request_id }) {
  return {
    aps: {
      alert: { title: 'sol', body: summary },
      category: APNS_CATEGORY_SOL_CHAT_REQUEST,
      sound: 'default',
      'mutable-content': 1,
      'content-available': 1,
    },
    data: {
      action: 'open_chat_request',
      request_id,
      category,
    },
  };
}

export function buildSilentChatLifecyclePayload({ request_id, action }) {
  return {
    aps: { 'mutable-content': 1, 'content-available': 1 },
    data: { action, request_id },
  };
}

export function buildSolChatRequestCollapseId({ request_id }) {
  return `${KIND_SOL_CHAT_REQUEST}:${request_id}`;
}

export function buildSilentChatLifecycleCollapseId({ request_id, action }) {
  return `sol_chat_lifecycle:${request_id}:${action}`;
}

export async function fanOutSends(env, jwt, devices, payload, headersFor) {
  requireApnsConfig(env);
  const firstResults = await Promise.allSettled(
    devices.map((device, index) => sendForIndex(env, jwt, devices, payload, headersFor, index, false))
  );
  const expiredIndices = [];
  const outcomes = [];
  for (const result of firstResults) {
    const outcome = settledOutcome(result);
    if (outcome.kind === 'expired') {
      expiredIndices.push(outcome.index);
    } else {
      outcomes.push(outcome);
    }
  }

  if (expiredIndices.length > 0) {
    let freshJwt = null;
    try {
      await env.GCP_TOKEN_CACHE?.delete(apnsJwtCacheKey(env));
      freshJwt = await cachedApnsJwt(env);
    } catch {
      console.warn('apns_jwt_mint_failed');
    }
    if (freshJwt) {
      const retryResults = await Promise.allSettled(
        expiredIndices.map((index) => sendForIndex(env, freshJwt, devices, payload, headersFor, index, true))
      );
      for (const result of retryResults) outcomes.push(settledOutcome(result));
    } else {
      for (const index of expiredIndices) {
        outcomes.push({
          index,
          token: devices[index]?.token || '',
          kind: 'failed',
          reason: 'jwt_mint_failed',
        });
      }
    }
  }

  return aggregateOutcomes(outcomes);
}

function settledOutcome(result) {
  if (result.status === 'fulfilled') return result.value;
  return {
    index: -1,
    token: '',
    kind: 'failed',
    reason: 'send_failed',
  };
}

async function sendForIndex(env, jwt, devices, payload, headersFor, index, retried) {
  const device = devices[index];
  const outcome = await apnsSend(env, jwt, device, payload, headersFor(jwt, device));
  if (outcome.kind === 'expired' && retried) {
    return { ...outcome, kind: 'failed' };
  }
  return { index, ...outcome };
}

function aggregateOutcomes(outcomes) {
  let sent = 0;
  let failed = 0;
  let revoked = 0;
  const revoked_tokens = [];
  const failures = [];
  for (const outcome of outcomes) {
    if (outcome.kind === 'sent') {
      sent += 1;
    } else if (outcome.kind === 'revoked') {
      revoked += 1;
      revoked_tokens.push(outcome.token);
    } else {
      failed += 1;
      failures.push({ token: outcome.token, reason: outcome.reason || 'send_failed' });
    }
  }
  return { ok: failed === 0, sent, failed, revoked, revoked_tokens, failures };
}

async function readJsonObject(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_input' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'invalid_input' }, { status: 400 });
  }
  return body;
}

function validateDispatchBody(body) {
  const summary = typeof body.summary === 'string' ? body.summary : null;
  const category = typeof body.category === 'string' ? body.category : null;
  const requestId = typeof body.request_id === 'string' ? body.request_id.trim() : '';
  if (!summary || !summary.trim() || category === null || !requestId) {
    return json({ error: 'invalid_input' }, { status: 400 });
  }
  if (encoder.encode(summary).byteLength > 80) {
    return json({ error: 'invalid_input' }, { status: 400 });
  }
  const devices = validateDevices(body);
  if (devices === null) {
    return json({ error: 'invalid_input' }, { status: 400 });
  }
  return { summary, category, request_id: requestId, devices };
}

function validateDedupBody(body) {
  const requestId = typeof body.request_id === 'string' ? body.request_id.trim() : '';
  const action = typeof body.action === 'string' ? body.action.trim() : '';
  if (!requestId || !action) {
    return json({ error: 'invalid_input' }, { status: 400 });
  }
  const devices = validateDevices(body);
  if (devices === null) {
    return json({ error: 'invalid_input' }, { status: 400 });
  }
  return { request_id: requestId, action, devices };
}

function validateDevices(body) {
  if (!Array.isArray(body.devices)) return null;
  const devices = [];
  for (const d of body.devices) {
    if (!d || typeof d !== 'object') return null;
    const token = typeof d.token === 'string' ? d.token : '';
    const bundleId = typeof d.bundle_id === 'string' ? d.bundle_id : null;
    if (!token || bundleId === null || !['sandbox', 'production'].includes(d.environment)) return null;
    devices.push({ token, bundle_id: bundleId, environment: d.environment });
  }
  return devices;
}

function requireApnsConfig(env) {
  const config = {
    teamId: env.APNS_TEAM_ID,
    keyId: env.APNS_KEY_ID,
    p8Pem: env.APNS_KEY_P8,
    bundleId: env.APNS_BUNDLE_ID,
    apnsEnv: env.APNS_ENV,
  };
  for (const [name, value] of Object.entries(config)) {
    if (!value) throw new Error(`APNs config missing ${name}`);
  }
  if (!['production', 'sandbox'].includes(config.apnsEnv)) {
    throw new Error('APNS_ENV must be production or sandbox');
  }
  return config;
}

async function apnsSend(env, jwt, device, payload, headers) {
  const url = `${apnsHost(device.environment)}/3/device/${encodeURIComponent(device.token)}`;
  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeoutMs: 10_000,
    });
    const text = await response.text();
    const reason = responseReason(text);
    if (response.status === 200) {
      return { token: device.token, kind: 'sent' };
    }
    if (response.status === 403 && reason === 'ExpiredProviderToken') {
      return { token: device.token, kind: 'expired', reason };
    }
    if (isRevocableStatus(response.status)) {
      return { token: device.token, kind: 'revoked', reason: reason || String(response.status) };
    }
    console.warn('apns_send_failed', { status: response.status, reason: reason || '' });
    return { token: device.token, kind: 'failed', reason: reason || String(response.status) };
  } catch (error) {
    const reason = error?.message === 'apns_request_timed_out' ? 'apns_request_timed_out' : 'fetch_failed';
    console.warn('apns_send_failed', { status: 0, reason });
    return { token: device.token, kind: 'failed', reason };
  }
}

function responseReason(body) {
  try {
    const payload = JSON.parse(body || '{}');
    const reason = payload?.reason;
    return typeof reason === 'string' && reason ? reason : null;
  } catch {
    return null;
  }
}

function isRevocableStatus(status) {
  return status === 410;
}

function dispatchHeadersFor(env, jwt, requestId) {
  requireApnsConfig(env);
  return {
    'apns-id': crypto.randomUUID(),
    'apns-topic': env.APNS_BUNDLE_ID,
    'apns-push-type': 'alert',
    'apns-priority': '10',
    'apns-collapse-id': buildSolChatRequestCollapseId({ request_id: requestId }),
    authorization: `bearer ${jwt}`,
  };
}

function dedupHeadersFor(env, jwt, requestId, action) {
  requireApnsConfig(env);
  return {
    'apns-id': crypto.randomUUID(),
    'apns-topic': env.APNS_BUNDLE_ID,
    'apns-push-type': 'background',
    'apns-priority': '5',
    'apns-collapse-id': buildSilentChatLifecycleCollapseId({ request_id: requestId, action }),
    authorization: `bearer ${jwt}`,
  };
}

function apnsHost(pushTokenEnv) {
  return pushTokenEnv === 'production'
    ? 'https://api.push.apple.com'
    : 'https://api.sandbox.push.apple.com';
}

async function fetchWithTimeout(url, opts) {
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs || 10_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const { timeoutMs: _timeoutMs, ...fetchOpts } = opts;
  try {
    return await fetch(url, { ...fetchOpts, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('apns_request_timed_out');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function pemToArrayBuffer(privateKeyPem) {
  const b64 = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
