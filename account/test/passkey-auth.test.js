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
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import worker from '../src/index.js';
import {
  dbDumpText,
  extractCookieToken,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedCredential,
  seedPasskeyChallenge,
} from './helpers.js';

describe('passkey authentication', () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    generateAuthenticationOptions.mockResolvedValue({
      challenge: 'auth-challenge',
      rpId: 'solstone.app',
      allowCredentials: [],
    });
    verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 9 },
    });
  });

  it('starts discoverable authentication and stores an authenticate challenge', async () => {
    const response = await worker.fetch(passkeyRequest('/passkey/auth/start'), makeTestEnv());
    const body = await response.json();
    const row = await workerEnv.DB
      .prepare('SELECT account_id, purpose FROM passkey_challenges WHERE challenge = ?')
      .bind('auth-challenge')
      .first();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body.options.challenge).toBe('auth-challenge');
    expect(generateAuthenticationOptions).toHaveBeenCalledWith(expect.objectContaining({
      rpID: 'solstone.app',
      userVerification: 'preferred',
      allowCredentials: [],
    }));
    expect(row).toMatchObject({ account_id: null, purpose: 'authenticate' });
  });

  it('finishes authentication, updates counters and last sign-in, and sets a session cookie', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv, nowMs: 1_000 });
    await seedCredential({
      accountId: account.accountId,
      credentialId: 'auth-credential-id',
      userHandle: 'user-handle',
      counter: 2,
    });
    await seedPasskeyChallenge({ challenge: 'finish-auth', purpose: 'authenticate' });

    const response = await worker.fetch(passkeyRequest('/passkey/auth/finish', {
      body: { response: authResponse('finish-auth', 'auth-credential-id', 'user-handle') },
    }), testEnv);
    const body = await response.json();
    const credential = await workerEnv.DB
      .prepare('SELECT counter, last_used_at FROM passkey_credentials WHERE credential_id = ?')
      .bind('auth-credential-id')
      .first();
    const accountRow = await workerEnv.DB
      .prepare('SELECT last_signin_at FROM accounts WHERE id = ?')
      .bind(account.accountId)
      .first();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, redirect: '/dashboard' });
    expect(response.headers.get('Set-Cookie')).toMatch(
      /^account_session=[A-Za-z0-9_-]+; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=1209600$/
    );
    const rawToken = extractCookieToken(response.headers.get('Set-Cookie') || '');
    expect(await dbDumpText()).not.toContain(rawToken);
    expect(credential.counter).toBe(9);
    expect(credential.last_used_at).toBeGreaterThan(0);
    expect(accountRow.last_signin_at).toBe(credential.last_used_at);
    expect(await rowCount('sessions')).toBe(1);
  });

  it('rejects a mismatched userHandle before verification', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedCredential({ accountId: account.accountId, credentialId: 'auth-credential-id', userHandle: 'expected' });
    await seedPasskeyChallenge({ challenge: 'bad-handle', purpose: 'authenticate' });

    const response = await worker.fetch(passkeyRequest('/passkey/auth/finish', {
      body: { response: authResponse('bad-handle', 'auth-credential-id', 'reported') },
    }), testEnv);

    expect(response.status).toBe(401);
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled();
  });

  it('rejects an unknown credential and a register-purpose challenge', async () => {
    const testEnv = makeTestEnv();
    await seedPasskeyChallenge({ challenge: 'unknown-credential', purpose: 'authenticate' });
    const unknown = await worker.fetch(passkeyRequest('/passkey/auth/finish', {
      body: { response: authResponse('unknown-credential', 'missing-credential-id', 'handle') },
    }), testEnv);

    await seedPasskeyChallenge({ challenge: 'register-purpose', purpose: 'register', accountId: null });
    const wrongPurpose = await worker.fetch(passkeyRequest('/passkey/auth/finish', {
      body: { response: authResponse('register-purpose', 'missing-credential-id', 'handle') },
    }), testEnv);

    expect(unknown.status).toBe(401);
    expect(wrongPurpose.status).toBe(400);
  });

  it('rejects expired auth challenges without consuming them', async () => {
    const testEnv = makeTestEnv();
    await seedPasskeyChallenge({
      challenge: 'expired-auth',
      purpose: 'authenticate',
      expiresAt: Date.now() - 1000,
    });

    const response = await worker.fetch(passkeyRequest('/passkey/auth/finish', {
      body: { response: authResponse('expired-auth', 'missing-credential-id', 'handle') },
    }), testEnv);
    const row = await workerEnv.DB
      .prepare('SELECT used_at FROM passkey_challenges WHERE challenge = ?')
      .bind('expired-auth')
      .first();

    expect(response.status).toBe(400);
    expect(row.used_at).toBeNull();
  });

  it('rejects reused auth challenges', async () => {
    const testEnv = makeTestEnv();
    const usedAt = Date.now() - 5000;
    await seedPasskeyChallenge({ challenge: 'reused-auth', purpose: 'authenticate' });
    await workerEnv.DB
      .prepare('UPDATE passkey_challenges SET used_at = ? WHERE challenge = ?')
      .bind(usedAt, 'reused-auth')
      .run();

    const response = await worker.fetch(passkeyRequest('/passkey/auth/finish', {
      body: { response: authResponse('reused-auth', 'missing-credential-id', 'handle') },
    }), testEnv);

    expect(response.status).toBe(400);
  });

  it('returns JSON no-store headers for invalid JSON bodies', async () => {
    const response = await worker.fetch(new Request('https://account.solstone.app/passkey/auth/finish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://account.solstone.app',
        'CF-Connecting-IP': '203.0.113.91',
      },
      body: 'not-json',
    }), makeTestEnv());

    expect(response.status).toBe(400);
    expect(response.headers.get('Content-Type')).toMatch(/application\/json/);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});

function passkeyRequest(path, { body = {}, origin = 'https://account.solstone.app' } = {}) {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.91' };
  if (origin !== null) headers.Origin = origin;
  return new Request(`https://account.solstone.app${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function authResponse(challenge, id, userHandle) {
  return {
    id,
    rawId: id,
    type: 'public-key',
    response: {
      clientDataJSON: clientData(challenge),
      authenticatorData: 'authenticator-data',
      signature: 'signature',
      userHandle,
    },
    clientExtensionResults: {},
  };
}

function clientData(challenge) {
  return b64u(new TextEncoder().encode(JSON.stringify({ challenge })));
}

function b64u(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function rowCount(table) {
  const row = await workerEnv.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
  return row.count;
}
