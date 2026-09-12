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
import { makeTestEnv, resetDb, rowCount, seedAccount, seedSession } from './helpers.js';

const ORIGIN = 'https://services.solstone.app';

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
      expect(await response.json()).toEqual({ error: 'invalid request' });
    }
  });

  const REJECTED_ORIGIN_CASES = [
    { name: 'deceptive prefix', origin: `${ORIGIN}.evil.test`, referer: null },
    { name: 'second prefix host', origin: `${ORIGIN}.attacker.test`, referer: null },
    { name: 'deceptive prefix with a path', origin: `${ORIGIN}.evil.test/x`, referer: null },
    { name: 'Referer only, expected origin', origin: null, referer: `${ORIGIN}/sign-in` },
    { name: 'Referer only, expected origin no path', origin: null, referer: ORIGIN },
    { name: 'rewritten Origin with a clean Referer', origin: 'https://urldefense.com', referer: `${ORIGIN}/sign-in` },
  ];

  for (const tc of REJECTED_ORIGIN_CASES) {
    it(`rejects ${tc.name} on all four ceremony routes even with valid sessions`, async () => {
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
          origin: tc.origin,
          referer: tc.referer,
        }), testEnv);
        expect(response.status).toBe(403);
        expect(response.headers.get('Content-Type')).toContain('application/json');
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(await response.json()).toEqual({ error: 'invalid request' });
      }
    });
  }

  const ACCEPTED_ORIGIN_CASES = [
    { name: 'exact origin with no Referer', origin: ORIGIN, referer: null },
    { name: 'exact origin with rewritten Referer', origin: ORIGIN, referer: 'https://urldefense.com/v3/__https://services.solstone.app/sign-in__' },
  ];

  for (const tc of ACCEPTED_ORIGIN_CASES) {
    it(`does not reject ${tc.name} on origin grounds on any ceremony route`, async () => {
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
          origin: tc.origin,
          referer: tc.referer,
        }), testEnv);
        expect(response.status).not.toBe(403);
      }
    });
  }

  it('allows header-less finish without origin 403 (fails later on payload validation)', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const registerFinish = await worker.fetch(passkeyRequest('/passkey/register/finish', {
      cookie: session.cookie,
      origin: null,
      referer: null,
      body: {},
    }), testEnv);
    expect(registerFinish.status).toBe(400);
    expect(await registerFinish.json()).toEqual({ error: 'response required' });

    const authFinish = await worker.fetch(passkeyRequest('/passkey/auth/finish', {
      origin: null,
      referer: null,
      body: {},
    }), testEnv);
    expect(authFinish.status).toBe(400);
    expect(await authFinish.json()).toEqual({ error: 'response required' });
  });

  it('does not insert challenges on origin refusal during auth/start', async () => {
    const testEnv = makeTestEnv();
    const beforeCount = await rowCount('passkey_challenges');

    const prefixRes = await worker.fetch(passkeyRequest('/passkey/auth/start', {
      origin: `${ORIGIN}.evil.test`,
    }), testEnv);
    expect(prefixRes.status).toBe(403);
    expect(await rowCount('passkey_challenges')).toBe(beforeCount);

    const refererRes = await worker.fetch(passkeyRequest('/passkey/auth/start', {
      origin: null,
      referer: `${ORIGIN}/sign-in`,
    }), testEnv);
    expect(refererRes.status).toBe(403);
    expect(await rowCount('passkey_challenges')).toBe(beforeCount);
  });

  it('returns 405 JSON for non-POST passkey requests', async () => {
    const response = await worker.fetch(new Request('https://services.solstone.app/passkey/auth/start', {
      method: 'GET',
      headers: { Origin: 'https://services.solstone.app' },
    }), makeTestEnv());

    expect(response.status).toBe(405);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});

function passkeyRequest(path, { cookie, origin = 'https://services.solstone.app', referer, body = '{}' } = {}) {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.92' };
  if (cookie) headers.Cookie = cookie;
  if (origin !== null) headers.Origin = origin;
  if (referer !== undefined && referer !== null) headers.Referer = referer;
  return new Request(`https://services.solstone.app${path}`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
