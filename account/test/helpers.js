import { env } from 'cloudflare:test';
import { vi } from 'vitest';
import schema from '../schema.sql?raw';
import { generateOtp, hashWithPepper } from '../src/crypto.js';
import { upsertOtp } from '../src/db.js';

const TEST_SECRET = 'MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=';
const TEST_PEPPER = 'test-hmac-pepper';

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
    TURNSTILE_SECRET: 'test-turnstile-secret',
    TURNSTILE_SITE_KEY: 'test-turnstile-site-key',
  };
}

export async function resetDb() {
  for (const table of ['rate_buckets', 'otp_tokens', 'sessions', 'account_emails', 'accounts']) {
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

export function startRequest(email, headers = {}) {
  const body = new URLSearchParams({
    email,
    'cf-turnstile-response': 'turnstile-token',
  });
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

export function verifyRequest({ email, code, origin = 'https://account.solstone.app', headers = {} }) {
  const body = new URLSearchParams({
    email,
    code,
  });
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

export function extractCookieToken(setCookie) {
  return setCookie.match(/^account_session=([^;]*);/)?.[1] || '';
}

export async function dbDumpText() {
  const tables = ['accounts', 'account_emails', 'sessions', 'otp_tokens', 'rate_buckets'];
  const dumped = {};
  for (const table of tables) {
    const { results } = await env.DB.prepare(`SELECT * FROM ${table}`).all();
    dumped[table] = results;
  }
  return JSON.stringify(dumped);
}
