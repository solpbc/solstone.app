import { listDispatchableDevicesForAccount } from './db.js';
import { resolveBearerAccount } from './dispatch-tokens.js';
import { deviceRevoke } from './devices.js';
import { json } from './index.js';

const APNS_JWT_TTL_SECONDS = 3300;
const APNS_CATEGORY_SOL_CHAT_REQUEST = 'SOLSTONE_SOL_CHAT_REQUEST';
const KIND_SOL_CHAT_REQUEST = 'sol_chat_request';
const encoder = new TextEncoder();

export async function handlePushDispatch(req, env) {
  const auth = await resolveBearerAccount(req, env);
  if (auth instanceof Response) return auth;
  const body = await readJsonObject(req);
  if (body instanceof Response) return body;
  const input = validateDispatchBody(body);
  if (input instanceof Response) return input;

  let jwt;
  try {
    jwt = await cachedApnsJwt(env);
  } catch {
    console.warn('apns_jwt_mint_failed');
    return json({ error: 'server_error' }, { status: 500 });
  }

  const devices = await listDispatchableDevicesForAccount(env.DB, auth.accountId);
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
  const auth = await resolveBearerAccount(req, env);
  if (auth instanceof Response) return auth;
  const body = await readJsonObject(req);
  if (body instanceof Response) return body;
  const input = validateDedupBody(body);
  if (input instanceof Response) return input;

  let jwt;
  try {
    jwt = await cachedApnsJwt(env);
  } catch {
    console.warn('apns_jwt_mint_failed');
    return json({ error: 'server_error' }, { status: 500 });
  }

  const devices = await listDispatchableDevicesForAccount(env.DB, auth.accountId);
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
          device_id: devices[index]?.device_id || '',
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
    device_id: '',
    kind: 'failed',
    reason: 'send_failed',
  };
}

async function sendForIndex(env, jwt, devices, payload, headersFor, index, retried) {
  const device = devices[index];
  if (device.push_token_env !== env.APNS_ENV) {
    return {
      index,
      device_id: device.device_id,
      kind: 'failed',
      reason: 'env_mismatch',
    };
  }
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
  const failures = [];
  for (const outcome of outcomes) {
    if (outcome.kind === 'sent') {
      sent += 1;
    } else if (outcome.kind === 'revoked') {
      revoked += 1;
    } else {
      failed += 1;
      failures.push({ device_id: outcome.device_id, reason: outcome.reason || 'send_failed' });
    }
  }
  return { ok: failed === 0, sent, failed, revoked, failures };
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
  return { summary, category, request_id: requestId };
}

function validateDedupBody(body) {
  const requestId = typeof body.request_id === 'string' ? body.request_id.trim() : '';
  const action = typeof body.action === 'string' ? body.action.trim() : '';
  if (!requestId || !action) {
    return json({ error: 'invalid_input' }, { status: 400 });
  }
  return { request_id: requestId, action };
}

function requireApnsConfig(env) {
  const config = {
    teamId: env.APNS_TEAM_ID,
    keyId: env.APNS_KEY_ID,
    p8Pem: env.APNS_P8_PEM,
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
  const url = `${apnsHost(device.push_token_env)}/3/device/${encodeURIComponent(device.push_token)}`;
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
      return { device_id: device.device_id, kind: 'sent' };
    }
    if (response.status === 403 && reason === 'ExpiredProviderToken') {
      return { device_id: device.device_id, kind: 'expired', reason };
    }
    if (isRevocableReason(response.status, reason)) {
      try {
        await deviceRevoke(env, device.device_id);
      } catch {
        console.warn('device_revoke_failed', { device_id: device.device_id });
      }
      return { device_id: device.device_id, kind: 'revoked', reason: reason || String(response.status) };
    }
    console.warn('apns_send_failed', { device_id: device.device_id, status: response.status, reason: reason || '' });
    return { device_id: device.device_id, kind: 'failed', reason: reason || String(response.status) };
  } catch (error) {
    const reason = error?.message === 'apns_request_timed_out' ? 'apns_request_timed_out' : 'fetch_failed';
    console.warn('apns_send_failed', { device_id: device.device_id, status: 0, reason });
    return { device_id: device.device_id, kind: 'failed', reason };
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

function isRevocableReason(status, reason) {
  return status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered';
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
