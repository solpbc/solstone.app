import { json } from './index.js';
import { verifyReachRelayToken } from './reach.js';

const APNS_JWT_TTL_SECONDS = 3300;
const encoder = new TextEncoder();

export async function handlePushDispatch(req, env) {
  const auth = await authorizeRelay(req, env);
  if (auth instanceof Response) return auth;
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

  const result = await fanOutSends(
    env,
    jwt,
    devices,
    (device) => buildAlertPayload(device.envelope),
    (activeJwt) => dispatchHeadersFor(env, activeJwt)
  );
  return json(result);
}

export async function authorizeRelay(req, env) {
  const auth = req.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return json({ error: 'invalid_token' }, { status: 401 });
  const presented = match[1];
  const reach = await verifyReachRelayToken(presented, env);
  if (reach) return { instanceId: reach.instanceId };
  return json({ error: 'invalid_token' }, { status: 401 });
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

// The alert text is fixed and identical for every notification to every
// owner: it is what the phone shows if its notification service extension
// cannot open the envelope. Everything the owner reads arrives inside the
// envelope, which this service cannot decrypt.
export const FIXED_ALERT_TITLE = 'solstone';
export const FIXED_ALERT_BODY = 'you have a new notification.';

// 0x01 || nonce(12) || ciphertext(1024) || tag(16)
export const ENVELOPE_BYTES = 1053;
export const ENVELOPE_CHARS = 1404;
export const MAX_DISPATCH_DEVICES = 16;
const APNS_EXPIRATION_SECONDS = 24 * 60 * 60;

export function buildAlertPayload(envelope) {
  return {
    aps: {
      alert: { title: FIXED_ALERT_TITLE, body: FIXED_ALERT_BODY },
      sound: 'default',
      'mutable-content': 1,
    },
    e: envelope,
  };
}

export async function fanOutSends(env, jwt, devices, payloadFor, headersFor) {
  requireApnsConfig(env);
  const firstResults = await Promise.allSettled(
    devices.map((device, index) => sendForIndex(env, jwt, devices, payloadFor, headersFor, index, false))
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
        expiredIndices.map((index) => sendForIndex(env, freshJwt, devices, payloadFor, headersFor, index, true))
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

async function sendForIndex(env, jwt, devices, payloadFor, headersFor, index, retried) {
  const device = devices[index];
  const outcome = await apnsSend(env, jwt, device, payloadFor(device), headersFor(jwt, device));
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

const DISPATCH_BODY_KEYS = ['devices'];
const DEVICE_KEYS = ['envelope', 'environment', 'token'];
const APNS_TOKEN_PATTERN = /^[0-9a-f]{1,200}$/;
const ENVELOPE_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${ENVELOPE_CHARS}}$`);

function hasExactKeys(value, keys) {
  const present = Object.keys(value).sort();
  return present.length === keys.length && present.every((key, index) => key === keys[index]);
}

// The request carries no field that can hold readable text: a push token,
// its APNs environment, and a fixed-size sealed envelope per device.
export function validateDispatchBody(body) {
  if (!hasExactKeys(body, DISPATCH_BODY_KEYS)) return invalidInput();
  if (!Array.isArray(body.devices) || body.devices.length > MAX_DISPATCH_DEVICES) return invalidInput();
  const devices = [];
  for (const d of body.devices) {
    if (!d || typeof d !== 'object' || Array.isArray(d) || !hasExactKeys(d, DEVICE_KEYS)) return invalidInput();
    if (typeof d.token !== 'string' || !APNS_TOKEN_PATTERN.test(d.token)) return invalidInput();
    if (!['sandbox', 'production'].includes(d.environment)) return invalidInput();
    if (!isSealedEnvelope(d.envelope)) return invalidInput();
    devices.push({ token: d.token, environment: d.environment, envelope: d.envelope });
  }
  return { devices };
}

export function isSealedEnvelope(value) {
  if (typeof value !== 'string' || !ENVELOPE_PATTERN.test(value)) return false;
  const bytes = base64UrlDecode(value);
  return bytes !== null && bytes.byteLength === ENVELOPE_BYTES && bytes[0] === 0x01;
}

function base64UrlDecode(value) {
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function invalidInput() {
  return json({ error: 'invalid_input' }, { status: 400 });
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

function dispatchHeadersFor(env, jwt) {
  requireApnsConfig(env);
  return {
    'apns-id': crypto.randomUUID(),
    'apns-topic': env.APNS_BUNDLE_ID,
    'apns-push-type': 'alert',
    'apns-priority': '10',
    'apns-expiration': String(Math.floor(Date.now() / 1000) + APNS_EXPIRATION_SECONDS),
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
