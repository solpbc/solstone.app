import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
} from '@simplewebauthn/server';
import { hashKey } from '../src/crypto.js';
import worker from '../src/index.js';
import { makeTestEnv, resetDb, seedAccount, seedSession } from './helpers.js';

describe('passkey rate limits', () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    generateRegistrationOptions.mockResolvedValue({ challenge: 'register-rate' });
    generateAuthenticationOptions.mockResolvedValue({ challenge: 'auth-rate', allowCredentials: [] });
  });

  it('stores only peppered passkey rate bucket keys', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const ip = '203.0.113.101';

    await worker.fetch(passkeyRequest('/passkey/register/start', { cookie: session.cookie, ip }), testEnv);
    await worker.fetch(passkeyRequest('/passkey/auth/start', { ip }), testEnv);
    const { results } = await workerEnv.DB.prepare('SELECT key FROM rate_buckets ORDER BY key').all();
    const text = JSON.stringify(results);

    expect(results).toHaveLength(3);
    expect(text).not.toContain(ip);
    expect(text).not.toContain(account.accountId);
    for (const row of results) {
      expect(row.key).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(row.key).not.toMatch(/^[0-9a-f]{8}-/i);
    }
  });

  it('enforces register account, register IP, and auth IP caps from pre-bump counts', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const other = await seedAccount({ email: 'other-rate@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const otherSession = await seedSession(other.accountId, { testEnv });
    const nowMs = Date.now();
    const registerAccountKey = await hashKey('passkey_register_account', account.accountId, testEnv);
    const registerIpKey = await hashKey('passkey_register_ip', '203.0.113.102', testEnv);
    const authIpKey = await hashKey('passkey_auth_ip', '203.0.113.103', testEnv);
    await seedRateBucket(registerAccountKey, 5, nowMs);
    await seedRateBucket(registerIpKey, 20, nowMs);
    await seedRateBucket(authIpKey, 60, nowMs);

    const accountCapped = await worker.fetch(passkeyRequest('/passkey/register/start', {
      cookie: session.cookie,
      ip: '203.0.113.104',
    }), testEnv);
    const ipCapped = await worker.fetch(passkeyRequest('/passkey/register/start', {
      cookie: otherSession.cookie,
      ip: '203.0.113.102',
    }), testEnv);
    const authCapped = await worker.fetch(passkeyRequest('/passkey/auth/start', {
      ip: '203.0.113.103',
    }), testEnv);

    expect(accountCapped.status).toBe(429);
    expect(accountCapped.headers.get('Content-Type')).toMatch(/application\/json/);
    expect(accountCapped.headers.get('Cache-Control')).toBe('no-store');
    expect(ipCapped.status).toBe(429);
    expect(ipCapped.headers.get('Content-Type')).toMatch(/application\/json/);
    expect(ipCapped.headers.get('Cache-Control')).toBe('no-store');
    expect(authCapped.status).toBe(429);
    expect(authCapped.headers.get('Content-Type')).toMatch(/application\/json/);
    expect(authCapped.headers.get('Cache-Control')).toBe('no-store');
  });
});

async function seedRateBucket(key, count, windowStart) {
  await workerEnv.DB
    .prepare('INSERT INTO rate_buckets (key, count, window_start) VALUES (?, ?, ?)')
    .bind(key, count, windowStart)
    .run();
}

function passkeyRequest(path, { cookie, ip = '203.0.113.100' } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Origin: 'https://services.solstone.app',
    'CF-Connecting-IP': ip,
  };
  if (cookie) headers.Cookie = cookie;
  return new Request(`https://services.solstone.app${path}`, {
    method: 'POST',
    headers,
    body: '{}',
  });
}
