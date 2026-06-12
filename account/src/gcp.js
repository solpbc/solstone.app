const TOKEN_CACHE_KEY = 'sa:cloud-platform';
const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const API_KEYS_HOST = 'apikeys.googleapis.com';
const ALLOWED_HOSTS = ['oauth2.googleapis.com', API_KEYS_HOST];
const API_TARGET = ['generative', 'language.googleapis.com'].join('');

const encoder = new TextEncoder();
let cachedSaJsonString = null;
let cachedSaJson = null;

export class GcpApiKeysDisabledError extends Error {}
export class GcpUnauthorizedError extends Error {}
export class GcpTimeoutError extends Error {}
export class GcpHostNotAllowedError extends Error {}

export async function gcpCreateApiKey({ env, displayName, projectId }) {
  const project = projectId || serviceAccount(env).project_id;
  // API Keys v2 keys.create rejects a `requestId` query param ("Cannot bind query parameter").
  // Idempotency comes from the provisioning in-flight lock + adopt-by-displayName, not requestId.
  const url = `https://${API_KEYS_HOST}/v2/projects/${encodeURIComponent(project)}/locations/global/keys`;
  const res = await authorizedGcpFetch(env, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName,
      restrictions: {
        apiTargets: [{ service: API_TARGET }],
      },
    }),
  });
  const text = await res.text();
  if (res.status === 403 && text.includes('API Keys API')) {
    throw new GcpApiKeysDisabledError('API Keys API is disabled');
  }
  if (!res.ok) throw new Error(`GCP API key creation failed: ${res.status} ${text}`);
  const operation = safeJson(text);
  if (!operation?.name) throw new Error('GCP API key creation returned no operation name');
  return operation.name;
}

export async function gcpPollOperation({ env, opName }) {
  const started = Date.now();
  for (let attempt = 0; attempt < 30; attempt++) {
    if (Date.now() - started >= 30_000) throw new GcpTimeoutError('GCP operation timed out');
    const res = await authorizedGcpFetch(env, `https://${API_KEYS_HOST}/v2/${opName}`, { method: 'GET' });
    const operation = await jsonResponse(res, 'GCP operation poll failed');
    if (operation.done) {
      if (operation.error) throw new Error(`GCP operation failed: ${JSON.stringify(operation.error)}`);
      const keyName = operation.response?.name;
      if (!keyName) throw new Error('GCP operation returned no key resource name');
      return keyName;
    }
    if (Date.now() - started >= 30_000) throw new GcpTimeoutError('GCP operation timed out');
    await sleep(1000);
  }
  throw new GcpTimeoutError('GCP operation timed out');
}

export async function gcpFetchKeyString({ env, keyName }) {
  const res = await authorizedGcpFetch(env, `https://${API_KEYS_HOST}/v2/${keyName}/keyString`, { method: 'GET' });
  const body = await jsonResponse(res, 'GCP keyString fetch failed');
  if (typeof body.keyString !== 'string' || !body.keyString) {
    throw new Error('GCP keyString response missing keyString');
  }
  return body.keyString;
}

export async function gcpDeleteKey({ env, keyName }) {
  const res = await authorizedGcpFetch(env, `https://${API_KEYS_HOST}/v2/${keyName}`, { method: 'DELETE' });
  if (res.status === 404) return;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GCP key delete failed: ${res.status} ${text}`);
  }
}

export async function gcpFindKeyByDisplayName({ env, displayName, projectId }) {
  const project = projectId || serviceAccount(env).project_id;
  const filter = encodeURIComponent(`displayName=${displayName}`);
  const url = `https://${API_KEYS_HOST}/v2/projects/${encodeURIComponent(project)}/locations/global/keys?filter=${filter}`;
  const res = await authorizedGcpFetch(env, url, { method: 'GET' });
  const body = await jsonResponse(res, 'GCP key list failed');
  const keys = Array.isArray(body.keys) ? body.keys : [];
  return keys.find((key) => key?.displayName === displayName) || null;
}

async function authorizedGcpFetch(env, url, opts = {}) {
  let token = await cachedSaAccessToken(env);
  let res = await gcpFetch(url, withAuth(opts, token));
  if (res.status !== 401) return res;

  await env.GCP_TOKEN_CACHE?.delete(TOKEN_CACHE_KEY);
  token = await mintSaAccessToken(env);
  res = await gcpFetch(url, withAuth(opts, token));
  if (res.status === 401) {
    console.error('gcp_token_unauthorized', {});
    throw new GcpUnauthorizedError('GCP token unauthorized');
  }
  return res;
}

function withAuth(opts, token) {
  const headers = new Headers(opts.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  return { ...opts, headers };
}

async function cachedSaAccessToken(env) {
  const cached = await env.GCP_TOKEN_CACHE?.get(TOKEN_CACHE_KEY);
  if (cached) return cached;
  return mintSaAccessToken(env);
}

async function mintSaAccessToken(env) {
  const sa = serviceAccount(env);
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signRs256({
    header: {
      alg: 'RS256',
      typ: 'JWT',
      kid: sa.private_key_id,
    },
    claims: {
      iss: sa.client_email,
      aud: TOKEN_ENDPOINT,
      scope: CLOUD_PLATFORM_SCOPE,
      iat: now,
      exp: now + 3600,
    },
    privateKeyPem: sa.private_key,
  });
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const res = await gcpFetch(sa.token_uri || TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const token = await jsonResponse(res, 'GCP service-account token failed');
  if (typeof token.access_token !== 'string' || token.token_type !== 'Bearer') {
    throw new Error('GCP service-account token response invalid');
  }
  const ttl = Number(token.expires_in) - 60;
  if (Number.isFinite(ttl) && ttl > 0) {
    await env.GCP_TOKEN_CACHE?.put(TOKEN_CACHE_KEY, token.access_token, { expirationTtl: Math.floor(ttl) });
  }
  return token.access_token;
}

function gcpFetch(url, opts = {}) {
  const parsed = new URL(url);
  if (!ALLOWED_HOSTS.includes(parsed.host)) {
    throw new GcpHostNotAllowedError(`GCP host not allowed: ${parsed.host}`);
  }
  return fetchWithTimeout(url, opts);
}

async function fetchWithTimeout(url, opts) {
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs || 10_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const { timeoutMs: _timeoutMs, ...fetchOpts } = opts;
  try {
    return await fetch(url, { ...fetchOpts, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new GcpTimeoutError('GCP request timed out');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function serviceAccount(env) {
  const raw = env.GCP_SERVICE_ACCOUNT_JSON;
  if (raw !== cachedSaJsonString) {
    cachedSaJsonString = raw;
    cachedSaJson = JSON.parse(raw || '{}');
  }
  return cachedSaJson;
}

async function signRs256({ header, claims, privateKeyPem }) {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const headerB64 = base64Url(encoder.encode(JSON.stringify(header)));
  const claimsB64 = base64Url(encoder.encode(JSON.stringify(claims)));
  const signingInput = `${headerB64}.${claimsB64}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(signingInput)
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
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

async function jsonResponse(res, message) {
  const text = await res.text();
  if (!res.ok) throw new Error(`${message}: ${res.status} ${text}`);
  return safeJson(text);
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
