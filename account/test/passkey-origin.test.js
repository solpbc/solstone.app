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
import worker from '../src/index.js';
import { makeTestEnv, resetDb, seedAccount, seedSession } from './helpers.js';

describe('passkey origin and response headers', () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    generateRegistrationOptions.mockResolvedValue({ challenge: 'register-origin' });
    generateAuthenticationOptions.mockResolvedValue({ challenge: 'auth-origin', allowCredentials: [] });
  });

  it('allows curl-style requests with no Origin or Referer', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const register = await worker.fetch(passkeyRequest('/passkey/register/start', {
      cookie: session.cookie,
      origin: null,
    }), testEnv);
    const auth = await worker.fetch(passkeyRequest('/passkey/auth/start', { origin: null }), testEnv);

    expect(register.status).toBe(200);
    expect(auth.status).toBe(200);
  });

  it('rejects mismatched origins on all passkey routes with JSON no-store responses', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    for (const [path, cookie] of [
      ['/passkey/register/start', session.cookie],
      ['/passkey/register/finish', session.cookie],
      ['/passkey/auth/start', null],
      ['/passkey/auth/finish', null],
    ]) {
      const response = await worker.fetch(passkeyRequest(path, {
        cookie,
        origin: 'https://evil.example',
      }), testEnv);
      expect(response.status).toBe(403);
      expect(response.headers.get('Content-Type')).toContain('application/json');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
  });

  it('returns 405 JSON for non-POST passkey requests', async () => {
    const response = await worker.fetch(new Request('https://account.solstone.app/passkey/auth/start', {
      method: 'GET',
      headers: { Origin: 'https://account.solstone.app' },
    }), makeTestEnv());

    expect(response.status).toBe(405);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});

function passkeyRequest(path, { cookie, origin = 'https://account.solstone.app' } = {}) {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.92' };
  if (cookie) headers.Cookie = cookie;
  if (origin !== null) headers.Origin = origin;
  return new Request(`https://account.solstone.app${path}`, {
    method: 'POST',
    headers,
    body: '{}',
  });
}
