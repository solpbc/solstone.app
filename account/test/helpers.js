import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { vi } from 'vitest';
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
    ENCRYPTION_SECRET: TEST_SECRET,
    HMAC_PEPPER: TEST_PEPPER,
    DISPATCH_TOKEN_PEPPER: 'test-dispatch-token-pepper',
    TURNSTILE_SECRET: 'test-turnstile-secret',
    TURNSTILE_SITE_KEY: 'test-turnstile-site-key',
    CF_ACCESS_AUD: overrides.CF_ACCESS_AUD || TEST_CF_ACCESS_AUD,
    EMAIL_PATH_DISABLED: overrides.EMAIL_PATH_DISABLED || 'false',
    SIGNUP_DISABLED: overrides.SIGNUP_DISABLED || 'false',
  };
}

export async function fetchWithCtx(worker, request, testEnv) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return { response, ctx };
}

export async function resetDb() {
  for (const table of [
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

export function startRequest(email, headers = {}, { csrf = TEST_CSRF } = {}) {
  const body = new URLSearchParams({
    email,
    'cf-turnstile-response': 'turnstile-token',
  });
  if (csrf !== null) body.set('csrf', csrf);
  return new Request('https://account.solstone.app/signin/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'https://account.solstone.app',
      'CF-Connecting-IP': '203.0.113.10',
      ...headers,
    },
    body,
  });
}

export function emailAddRequest({
  address,
  cookie,
  origin = 'https://account.solstone.app',
  headers = {},
}) {
  const requestHeaders = {
    'Content-Type': 'application/x-www-form-urlencoded',
    ...headers,
  };
  if (origin !== null) requestHeaders.Origin = origin;
  if (cookie) requestHeaders.Cookie = cookie;
  return new Request('https://account.solstone.app/settings/emails/add', {
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
  origin = 'https://account.solstone.app',
  headers = {},
  csrf = TEST_CSRF,
}) {
  const body = new URLSearchParams({
    email,
    code,
  });
  if (csrf !== null) body.set('csrf', csrf);
  const requestHeaders = {
    'Content-Type': 'application/x-www-form-urlencoded',
    ...headers,
  };
  if (origin !== null) requestHeaders.Origin = origin;
  return new Request('https://account.solstone.app/signin/verify', {
    method: 'POST',
    headers: requestHeaders,
    body,
  });
}

export function emailVerifyRequest({
  address,
  code,
  cookie,
  origin = 'https://account.solstone.app',
  headers = {},
}) {
  const requestHeaders = {
    'Content-Type': 'application/x-www-form-urlencoded',
    ...headers,
  };
  if (origin !== null) requestHeaders.Origin = origin;
  if (cookie) requestHeaders.Cookie = cookie;
  return new Request('https://account.solstone.app/settings/emails/verify', {
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
