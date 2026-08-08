import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { expect, vi } from 'vitest';
import schema from '../schema.sql?raw';
import { encryptEmail, generateOtp, generateSessionToken, hashKey, hashWithPepper } from '../src/crypto.js';
import {
  createAccountWithEmail,
  createSession,
  insertPasskeyChallenge,
  insertPasskeyCredential,
  upsertOtp,
} from '../src/db.js';

const TEST_SECRET = 'MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=';
const TEST_PEPPER = 'test-hmac-pepper';
export const TEST_CSRF = await hashKey('csrf', 'account', { HMAC_PEPPER: TEST_PEPPER });
export const TEST_CF_ACCESS_AUD = 'test-cf-access-aud';
export const TEST_APNS_P8_PEM = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg+Zj7Bk6Dzp080/PU
jTZnJ6kP4KtlHErFO/WuVRTQvkShRANCAARW8djY5HF7K8noSZQRfjP38mIzaufi
/YPI38YuaWmiPIqRmwDOu5rICl4PPLem4k+qtb950rlYCGx3J+MQN9tO
-----END PRIVATE KEY-----`;

export function makeTestEnv(overrides = {}) {
  const sent = [];
  const emailBinding = {
    sent,
    async send(message) {
      if (overrides.emailSendError) throw new Error('send failed');
      sent.push(message);
      return { messageId: `test-${sent.length}` };
    },
  };
  return {
    DB: overrides.DB || env.DB,
    EMAIL: overrides.EMAIL || emailBinding,
    ENCRYPTION_SECRET: overrides.ENCRYPTION_SECRET || TEST_SECRET,
    HMAC_PEPPER: TEST_PEPPER,
    DISPATCH_TOKEN_PEPPER: 'test-dispatch-token-pepper',
    GCP_TOKEN_CACHE: overrides.GCP_TOKEN_CACHE || makeFakeKv(),
    TURNSTILE_SECRET: 'test-turnstile-secret',
    TURNSTILE_SITE_KEY: 'test-turnstile-site-key',
    CF_ACCESS_AUD: overrides.CF_ACCESS_AUD || TEST_CF_ACCESS_AUD,
    IMPERSONATE_ALLOWED: overrides.IMPERSONATE_ALLOWED,
    EMAIL_PATH_DISABLED: overrides.EMAIL_PATH_DISABLED || 'false',
    SIGNUP_DISABLED: overrides.SIGNUP_DISABLED || 'false',
    SUPPORT_WORKER: overrides.SUPPORT_WORKER,
    SERVICES_AUTH_TOKEN: overrides.SERVICES_AUTH_TOKEN || 'test-services-auth-token',
    APNS_TEAM_ID: overrides.APNS_TEAM_ID,
    APNS_KEY_ID: overrides.APNS_KEY_ID,
    APNS_KEY_P8: overrides.APNS_KEY_P8 ?? overrides.APNS_P8_PEM,
    APNS_BUNDLE_ID: overrides.APNS_BUNDLE_ID,
    APNS_ENV: overrides.APNS_ENV,
    REACH_RELAY_TOKEN_SECRET: overrides.REACH_RELAY_TOKEN_SECRET || 'test-reach-relay-token-secret',
    STRIPE_SECRET_KEY: overrides.STRIPE_SECRET_KEY || 'sk_test_account_portal',
    STRIPE_WEBHOOK_SECRET: overrides.STRIPE_WEBHOOK_SECRET || 'whsec_account_portal',
    STRIPE_PRICE_ANNUAL: overrides.STRIPE_PRICE_ANNUAL || 'price_annual_test',
    STRIPE_PRICE_MONTHLY: overrides.STRIPE_PRICE_MONTHLY || 'price_monthly_test',
    STRIPE_PRICE_SPB_ANNUAL: overrides.STRIPE_PRICE_SPB_ANNUAL || 'price_spb_annual_test',
    STRIPE_PRICE_SPB_MONTHLY: overrides.STRIPE_PRICE_SPB_MONTHLY || 'price_spb_monthly_test',
    RELAY_GRANT_URL: overrides.RELAY_GRANT_URL || 'https://link.solstone.app',
    RELAY_GRACE_DAYS: overrides.RELAY_GRACE_DAYS || '14',
    RELAY_GRANT_SECRET: overrides.RELAY_GRANT_SECRET || 'test-relay-grant-secret',
    HUB_WEBHOOK_URL: overrides.HUB_WEBHOOK_URL,
    HUB_WEBHOOK_SECRET: overrides.HUB_WEBHOOK_SECRET,
    R2_PARENT_ACCESS_KEY_ID: overrides.R2_PARENT_ACCESS_KEY_ID ?? 'test-r2-parent-access-key-id',
    R2_PARENT_SECRET_ACCESS_KEY: overrides.R2_PARENT_SECRET_ACCESS_KEY ?? 'test-r2-parent-secret-access-key',
    R2_ACCOUNT_ID: overrides.R2_ACCOUNT_ID ?? '3f2c1528c7d4d9685819ea9e9e307c92',
    R2_BUCKET: overrides.R2_BUCKET ?? 'solstone-backups',
    SPB_MINT_ENABLED: overrides.SPB_MINT_ENABLED ?? 'true',
    SPB_SWEEP_ENABLED: overrides.SPB_SWEEP_ENABLED ?? 'true',
    SPP_ENGINE_ENDPOINT: overrides.SPP_ENGINE_ENDPOINT ?? 'https://processing.solstone.app',
    SPP_ENGINE_MODEL: overrides.SPP_ENGINE_MODEL ?? 'Qwen/Qwen3.5-4B',
    SPP_ENGINE_AUTH_SECRET: overrides.SPP_ENGINE_AUTH_SECRET ?? 'test-spp-engine-auth-secret',
    RELAY: overrides.RELAY,
  };
}

export async function fetchWithCtx(worker, request, testEnv) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return { response, ctx };
}

export function makeFakeKv() {
  const store = new Map();
  const binding = {
    puts: [],
    deletes: [],
    async get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt != null && entry.expiresAt <= Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async put(key, value, options = {}) {
      const ttl = options.expirationTtl;
      binding.puts.push({ key, value, options });
      store.set(key, {
        value,
        expiresAt: Number.isFinite(ttl) ? Date.now() + ttl * 1000 : null,
      });
    },
    async delete(key) {
      binding.deletes.push(key);
      store.delete(key);
    },
  };
  return binding;
}

export async function resetDb() {
  for (const table of [
    'entitlements',
    'stripe_customers',
    'spl_bindings',
    'spb_bindings',
    'spp_bindings',
    'spb_mint_audit',
    'spp_mint_audit',
    'spb_sweep_audit',
    'scout_lifecycle_events',
    'scout_applications',
    'enable_scout_codes',
    'service_handoffs',
    'account_dispatch_tokens',
    'account_devices',
    'passkey_challenges',
    'passkey_credentials',
    'rate_buckets',
    'otp_tokens',
    'sessions',
    'account_emails',
    'accounts',
  ]) {
    await env.DB.prepare(`DROP TABLE IF EXISTS ${table}`).run();
  }
  // Tests apply the checked-in schema text directly so schema.sql remains the source of truth.
  const executableSchema = schema
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  for (const statement of executableSchema.split(';').map((part) => part.trim()).filter(Boolean)) {
    await env.DB.prepare(statement).run();
  }
}

export function stubTurnstile(success = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ success }), {
      headers: { 'Content-Type': 'application/json' },
    }))
  );
}

export function installApnsFetchMock(handlers = {}) {
  const calls = [];
  const fetchMock = vi.fn(async (input, init = {}) => {
    const href = typeof input === 'string' ? input : input.url;
    const url = new URL(href);
    const method = (init.method || 'GET').toUpperCase();
    calls.push({ method, url, init });
    if (!['api.push.apple.com', 'api.sandbox.push.apple.com'].includes(url.host)) {
      throw new Error(`disallowed host reached fetch: ${url.host}`);
    }
    const keys = [
      `${method} ${url.host}${url.pathname}${url.search}`,
      `${method} ${url.host}${url.pathname}`,
      `${method} ${url.host}`,
      url.host,
      'default',
    ];
    const handler = keys.map((key) => handlers[key]).find(Boolean);
    if (!handler) throw new Error(`unhandled APNs fetch: ${method} ${url.href}`);
    return handler({ method, url, init, calls });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

export function installS3FetchMock(testEnv, handlers = {}) {
  const calls = [];
  const allowedHost = `${testEnv.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const bucketPath = `/${testEnv.R2_BUCKET}`;
  const fetchMock = vi.fn(async (input, init = {}) => {
    const href = typeof input === 'string' ? input : input.url;
    const url = new URL(href);
    const method = (init.method || input.method || 'GET').toUpperCase();
    const headers = Object.fromEntries(new Headers(init.headers || input.headers || {}).entries());
    const bodyText = typeof init.body === 'string' ? init.body : '';
    calls.push({ method, url, headers, bodyText });
    if (url.host !== allowedHost) {
      throw new Error(`disallowed R2 host reached fetch: ${url.host}`);
    }
    if (url.pathname !== bucketPath && !url.pathname.startsWith(`${bucketPath}/`)) {
      throw new Error(`disallowed R2 bucket path reached fetch: ${url.pathname}`);
    }
    const subresource = s3SubresourceKey(url);
    const keys = [
      `${method} ${url.host}${url.pathname}${url.search}`,
      subresource ? `${method} ${url.host}${url.pathname}${subresource}` : null,
      `${method} ${url.host}${url.pathname}`,
      subresource ? `${method} ${url.host}${subresource}` : null,
      subresource ? `${method} ${subresource}` : null,
      `${method} ${url.host}`,
      url.host,
      'default',
    ].filter(Boolean);
    const handler = keys.map((key) => handlers[key]).find(Boolean);
    if (!handler) throw new Error(`unhandled R2 fetch: ${method} ${url.href}`);
    return handler({ method, url, headers, bodyText, init, calls });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

export function installStripeFetchMock(handlers = {}) {
  const calls = [];
  const fetchMock = vi.fn(async (input, init = {}) => {
    const href = typeof input === 'string' ? input : input.url;
    const url = new URL(href);
    const method = (init.method || 'GET').toUpperCase();
    const body = typeof init.body === 'string' ? new URLSearchParams(init.body) : new URLSearchParams();
    calls.push({ method, url, init, body });
    if (url.host !== 'api.stripe.com') {
      throw new Error(`disallowed host reached fetch: ${url.host}`);
    }
    const keys = [
      `${method} ${url.host}${url.pathname}${url.search}`,
      `${method} ${url.host}${url.pathname}`,
      `${method} ${url.host}`,
      url.host,
      'default',
    ];
    const handler = keys.map((key) => handlers[key]).find(Boolean);
    if (!handler) throw new Error(`unhandled stripe fetch: ${method} ${url.href}`);
    return handler({ method, url, init, body, calls });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

function s3SubresourceKey(url) {
  if (url.searchParams.has('delete')) return '?delete';
  if (url.searchParams.has('uploads')) return '?uploads';
  if (url.searchParams.get('list-type') === '2') return '?list-type=2';
  if (url.searchParams.has('uploadId')) return '?uploadId';
  return null;
}

export function installRelayFetchMock(handlers = {}) {
  const calls = [];
  const fetchMock = vi.fn(async (input, init = {}) => {
    const href = typeof input === 'string' ? input : input.url;
    const url = new URL(href);
    const method = (init.method || 'GET').toUpperCase();
    if (url.host !== 'link.solstone.app') {
      throw new Error(`disallowed host reached fetch: ${url.host}`);
    }
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method, url, init, body });
    const keys = [
      `${method} ${url.host}${url.pathname}${url.search}`,
      `${method} ${url.host}${url.pathname}`,
      `${method} ${url.host}`,
      url.host,
      'default',
    ];
    const handler = keys.map((key) => handlers[key]).find(Boolean) || (() => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    return handler({ method, url, init, body, calls });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

export async function signStripeWebhook(rawBody, secret, t = Math.floor(Date.now() / 1000)) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${t}.${rawBody}`));
  return `t=${t},v1=${hexEncode(new Uint8Array(signature))}`;
}

export function installConsoleSpy() {
  const calls = [];
  const spies = ['error', 'warn', 'log', 'info'].map((level) => vi.spyOn(console, level).mockImplementation((...args) => {
    calls.push({ level, args });
  }));
  return {
    calls,
    assertNoSecrets(secrets) {
      const text = calls.map(({ args }) => args.map(formatConsoleArg).join(' ')).join('\n');
      for (const secret of secrets.filter(Boolean)) expect(text).not.toContain(secret);
    },
    restore() {
      for (const spy of spies) spy.mockRestore();
    },
  };
}

export function startRequest(email, headers = {}, { csrf = TEST_CSRF, next = null, nextSig = null } = {}) {
  const body = new URLSearchParams({
    email,
    'cf-turnstile-response': 'turnstile-token',
  });
  if (csrf !== null) body.set('csrf', csrf);
  if (next !== null) body.set('next', next);
  if (nextSig !== null) body.set('next_sig', nextSig);
  return new Request('https://services.solstone.app/signin/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'https://services.solstone.app',
      'CF-Connecting-IP': '203.0.113.10',
      ...headers,
    },
    body,
  });
}

export function emailAddRequest({
  address,
  cookie,
  origin = 'https://services.solstone.app',
  headers = {},
}) {
  const requestHeaders = {
    'Content-Type': 'application/x-www-form-urlencoded',
    ...headers,
  };
  if (origin !== null) requestHeaders.Origin = origin;
  if (cookie) requestHeaders.Cookie = cookie;
  return new Request('https://services.solstone.app/sign-in/emails/add', {
    method: 'POST',
    headers: requestHeaders,
    body: new URLSearchParams({ address }),
  });
}

export async function responseSnapshot(response) {
  const bytes = Array.from(new Uint8Array(await response.clone().arrayBuffer()));
  const headers = Array.from(response.headers.entries()).sort(([a], [b]) => a.localeCompare(b));
  return { status: response.status, headers, bytes };
}

export function recordingDb(db, statements) {
  return {
    prepare(sql) {
      statements.push(sql);
      return db.prepare(sql);
    },
    batch(batchStatements) {
      statements.push('[batch]');
      return db.batch(batchStatements);
    },
  };
}

export async function rowCount(table) {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
  return row.count;
}

export async function seedOtp({ email, options = {} }) {
  const testEnv = makeTestEnv();
  const nowMs = options.nowMs ?? Date.now();
  const emailLower = email.trim().toLowerCase();
  const code = options.code || generateOtp();
  const codeHash = await hashWithPepper(code, testEnv);
  const emailLowerHash = await hashWithPepper(emailLower, testEnv);

  await upsertOtp(env.DB, {
    emailLowerHash,
    emailLower,
    codeHash,
    nowMs,
    ttlMs: options.expired ? -1 : 10 * 60 * 1000,
  });

  if (options.consumed || options.attempts) {
    await env.DB
      .prepare('UPDATE otp_tokens SET consumed = ?, attempts = ? WHERE email_lower_hash = ?')
      .bind(options.consumed ? 1 : 0, options.attempts || 0, emailLowerHash)
      .run();
  }

  return { code, codeHash, emailLowerHash, emailLower };
}

export function verifyRequest({
  email,
  code,
  origin = 'https://services.solstone.app',
  headers = {},
  csrf = TEST_CSRF,
  next = null,
  nextSig = null,
}) {
  const body = new URLSearchParams({
    email,
    code,
  });
  if (csrf !== null) body.set('csrf', csrf);
  if (next !== null) body.set('next', next);
  if (nextSig !== null) body.set('next_sig', nextSig);
  const requestHeaders = {
    'Content-Type': 'application/x-www-form-urlencoded',
    ...headers,
  };
  if (origin !== null) requestHeaders.Origin = origin;
  return new Request('https://services.solstone.app/signin/verify', {
    method: 'POST',
    headers: requestHeaders,
    body,
  });
}

export function emailVerifyRequest({
  address,
  code,
  cookie,
  origin = 'https://services.solstone.app',
  headers = {},
}) {
  const requestHeaders = {
    'Content-Type': 'application/x-www-form-urlencoded',
    ...headers,
  };
  if (origin !== null) requestHeaders.Origin = origin;
  if (cookie) requestHeaders.Cookie = cookie;
  return new Request('https://services.solstone.app/sign-in/emails/verify', {
    method: 'POST',
    headers: requestHeaders,
    body: new URLSearchParams({ address, code }),
  });
}

export function extractCookieToken(setCookie) {
  return setCookie.match(/^account_session=([^;]*);/)?.[1] || '';
}

export async function dbDumpText() {
  const tables = [
    'accounts',
    'account_emails',
    'sessions',
    'otp_tokens',
    'rate_buckets',
    'passkey_credentials',
    'passkey_challenges',
  ];
  const dumped = {};
  for (const table of tables) {
    const { results } = await env.DB.prepare(`SELECT * FROM ${table}`).all();
    dumped[table] = results;
  }
  return JSON.stringify(dumped);
}

export async function seedAccount({ email = 'person@example.com', nowMs = Date.now(), testEnv = makeTestEnv() } = {}) {
  const emailLower = email.trim().toLowerCase();
  const addressLowerHash = await hashWithPepper(emailLower, testEnv);
  const addressEncrypted = await encryptEmail(emailLower, testEnv);
  const created = await createAccountWithEmail(env.DB, {
    addressEncrypted,
    addressLowerHash,
    nowMs,
  });
  return { ...created, emailLower, addressLowerHash, addressEncrypted, nowMs, testEnv };
}

export async function seedScoutApplication({
  accountId,
  status,
  applied_at = null,
  approved_at = null,
  revoked_at = null,
  createdAt = 1_000,
}) {
  await env.DB
    .prepare(
      `INSERT INTO scout_applications (
         account_id, status, use_case, data_acked_at, applied_at,
         approved_at, revoked_at, created_at, updated_at
       ) VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?)`
    )
    .bind(accountId, status, applied_at, approved_at, revoked_at, createdAt, createdAt)
    .run();
}

export async function seedAccountEmail({
  accountId,
  address = 'secondary@example.com',
  id = crypto.randomUUID(),
  verifiedAt = null,
  isPrimary = 0,
  code = null,
  expiresAt = null,
  attempts = 0,
  createdAt = Date.now(),
  testEnv = makeTestEnv(),
} = {}) {
  const addressLower = address.trim().toLowerCase();
  const addressLowerHash = await hashWithPepper(addressLower, testEnv);
  const addressEncrypted = await encryptEmail(addressLower, testEnv);
  const codeHash = code == null ? null : await hashWithPepper(code, testEnv);
  if (isPrimary) {
    await env.DB
      .prepare('UPDATE account_emails SET is_primary = 0 WHERE account_id = ?')
      .bind(accountId)
      .run();
  }
  await env.DB
    .prepare(
      `INSERT INTO account_emails (
        id, account_id, address_encrypted, address_lower_hash, is_primary,
        verified_at, created_at, verification_code_hash, verification_expires_at,
        verification_attempts
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      accountId,
      addressEncrypted,
      addressLowerHash,
      isPrimary ? 1 : 0,
      verifiedAt,
      createdAt,
      codeHash,
      expiresAt,
      attempts
    )
    .run();
  if (isPrimary) {
    await env.DB
      .prepare('UPDATE accounts SET primary_email_id = ? WHERE id = ?')
      .bind(id, accountId)
      .run();
  }
  return {
    id,
    accountId,
    addressLower,
    addressLowerHash,
    addressEncrypted,
    code,
    codeHash,
    expiresAt,
    verifiedAt,
    isPrimary: isPrimary ? 1 : 0,
  };
}

export async function seedSession(accountId, { nowMs = Date.now(), testEnv = makeTestEnv() } = {}) {
  const token = generateSessionToken();
  const idHash = await hashWithPepper(token, testEnv);
  await createSession(env.DB, { idHash, accountId, nowMs });
  return { token, cookie: `account_session=${token}`, idHash };
}

export async function seedDevice({
  deviceId = crypto.randomUUID(),
  accountId,
  platform = 'ios',
  pushToken = `push-${deviceId}`,
  pushTokenEnv = 'production',
  bundleId = 'app.solstone.swift',
  deviceLabel = 'test device',
  appVersion = '1.0.0',
  registeredAt = Date.now(),
  lastSeenAt = registeredAt,
  revokedAt = null,
} = {}) {
  await env.DB
    .prepare(
      `INSERT INTO account_devices (
        device_id, account_id, platform, push_token, push_token_env, bundle_id,
        device_label, app_version, registered_at, last_seen_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      deviceId,
      accountId,
      platform,
      pushToken,
      pushTokenEnv,
      bundleId,
      deviceLabel,
      appVersion,
      registeredAt,
      lastSeenAt,
      revokedAt
    )
    .run();
  return {
    deviceId,
    accountId,
    platform,
    pushToken,
    pushTokenEnv,
    bundleId,
    deviceLabel,
    appVersion,
    registeredAt,
    lastSeenAt,
    revokedAt,
  };
}

export async function seedEntitlement({
  accountId,
  service = 'spl_hosted',
  status = 'active',
  currentPeriodEnd = 1_800_000_000,
  source = 'stripe',
  sourceRef = 'sub_seeded',
  enabledAt = null,
  updatedAt = Date.now(),
} = {}) {
  await env.DB
    .prepare(
      `INSERT INTO entitlements (
         account_id, service, status, current_period_end, source, source_ref, enabled_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id, service) DO UPDATE SET
         status = excluded.status,
         current_period_end = excluded.current_period_end,
         source = excluded.source,
         source_ref = excluded.source_ref,
         enabled_at = excluded.enabled_at,
         updated_at = excluded.updated_at`
    )
    .bind(accountId, service, status, currentPeriodEnd, source, sourceRef, enabledAt, updatedAt)
    .run();
  return { accountId, service, status, currentPeriodEnd, source, sourceRef, enabledAt, updatedAt };
}

export async function seedSplBinding({
  accountId,
  instanceId = '11111111-1111-1111-1111-111111111111',
  createdAt = Date.now(),
  lastSeenAt = createdAt,
} = {}) {
  await env.DB
    .prepare(
      `INSERT INTO spl_bindings (account_id, instance_id, created_at, last_seen_at)
       VALUES (?, ?, ?, ?)`
    )
    .bind(accountId, instanceId, createdAt, lastSeenAt)
    .run();
  return { accountId, instanceId, createdAt, lastSeenAt };
}

export async function seedSpbBinding({
  accountId,
  instanceId = '11111111-1111-1111-1111-111111111111',
  createdAt = Date.now(),
  lastSeenAt = createdAt,
  tokenHash = null,
  lapsedAt = null,
} = {}) {
  await env.DB
    .prepare(
      `INSERT INTO spb_bindings (
         account_id, instance_id, created_at, last_seen_at, token_hash, lapsed_at
       ) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(accountId, instanceId, createdAt, lastSeenAt, tokenHash, lapsedAt)
    .run();
  return { accountId, instanceId, createdAt, lastSeenAt, tokenHash, lapsedAt };
}

export async function seedCredential({
  accountId,
  credentialId = 'credential-id',
  publicKey = new Uint8Array([1, 2, 3, 4]),
  counter = 0,
  userHandle = null,
  createdAt = Date.now(),
} = {}) {
  if (userHandle) {
    await env.DB
      .prepare('UPDATE accounts SET passkey_user_handle = ? WHERE id = ?')
      .bind(userHandle, accountId)
      .run();
  }
  await insertPasskeyCredential(env.DB, {
    credentialId,
    accountId,
    publicKey,
    counter,
    aaguid: null,
    transports: JSON.stringify(['internal']),
    backupEligible: true,
    backupState: true,
    deviceType: 'multiDevice',
    friendlyName: null,
    createdAt,
  });
  return { credentialId, publicKey, counter };
}

export async function seedPasskeyChallenge({
  challenge = 'challenge',
  accountId = null,
  purpose,
  createdAt = Date.now(),
  expiresAt = createdAt + 5 * 60 * 1000,
} = {}) {
  await insertPasskeyChallenge(env.DB, { challenge, accountId, purpose, createdAt, expiresAt });
  return { challenge, accountId, purpose, createdAt, expiresAt };
}

export function makeSupportWorker(handlers = {}) {
  const requests = [];
  return {
    requests,
    async fetch(request) {
      const url = new URL(request.url);
      const method = request.method.toUpperCase();
      const body = await readSupportRequestBody(request.clone());
      const headerEntries = Array.from(request.headers.entries());
      requests.push({
        method,
        pathname: url.pathname,
        headers: {
          servicesAuth: request.headers.get('X-Services-Auth'),
          servicesOwnerId: request.headers.get('X-Services-Owner-ID'),
          verifiedEmail: request.headers.get('X-Verified-Email'),
          verifiedEmailCount: headerEntries.filter(([name]) => name.toLowerCase() === 'x-verified-email').length,
        },
        body,
      });
      const handler = handlers[`${method} ${url.pathname}`] || handlers.default;
      if (!handler) throw new Error(`unhandled support request: ${method} ${url.pathname}`);
      if (typeof handler === 'function') return handler({ request, url, method, body, requests });
      return handler;
    },
  };
}

async function readSupportRequestBody(request) {
  const contentType = request.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    try {
      return await request.json();
    } catch {
      return null;
    }
  }
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    return {
      files: form.getAll('file').map((file) => ({
        name: file?.name || '',
        size: file?.size || 0,
      })),
    };
  }
  try {
    return await request.text();
  } catch {
    return null;
  }
}

function formatConsoleArg(value) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function hexEncode(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
