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
import { hashWithPepper } from '../src/crypto.js';
import { signEnableResume } from '../src/enable.js';
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

const VALID_NONCE = '2'.repeat(52);
const SESSION_COOKIE_RE = /^account_session=[A-Za-z0-9_-]+; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=1209600$/;

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
    expect(body).toEqual({ ok: true, redirect: '/' });
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

  it('honors a validly signed resume', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedCredential({
      accountId: account.accountId,
      credentialId: 'resume-credential-id',
      userHandle: 'resume-user-handle',
    });
    await seedPasskeyChallenge({ challenge: 'resume-auth', purpose: 'authenticate' });
    const { next, nextSig } = await signEnableResume('/enable/spl', `?nonce=${VALID_NONCE}`, testEnv);

    const response = await worker.fetch(passkeyRequest('/passkey/auth/finish', {
      body: {
        response: authResponse('resume-auth', 'resume-credential-id', 'resume-user-handle'),
        next,
        next_sig: nextSig,
      },
    }), testEnv);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.redirect).toBe(`/enable/spl?nonce=${VALID_NONCE}`);
    expect(response.headers.get('Set-Cookie')).toMatch(SESSION_COOKIE_RE);
  });

  it('uses / when no resume is present', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedCredential({
      accountId: account.accountId,
      credentialId: 'no-resume-credential-id',
      userHandle: 'no-resume-user-handle',
    });
    await seedPasskeyChallenge({ challenge: 'no-resume-auth', purpose: 'authenticate' });

    const response = await worker.fetch(passkeyRequest('/passkey/auth/finish', {
      body: { response: authResponse('no-resume-auth', 'no-resume-credential-id', 'no-resume-user-handle') },
    }), testEnv);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.redirect).toBe('/');
    expect(response.headers.get('Set-Cookie')).toMatch(SESSION_COOKIE_RE);
  });

  it('uses / when only one resume field is present', async () => {
    const testEnv = makeTestEnv();
    const signed = await signEnableResume('/enable/spl', `?nonce=${VALID_NONCE}`, testEnv);
    const nextOnlyAccount = await seedAccount({ testEnv, email: 'next-only@example.com' });
    await seedCredential({
      accountId: nextOnlyAccount.accountId,
      credentialId: 'next-only-credential-id',
      userHandle: 'next-only-user-handle',
    });
    await seedPasskeyChallenge({ challenge: 'next-only-auth', purpose: 'authenticate' });

    const nextOnly = await worker.fetch(passkeyRequest('/passkey/auth/finish', {
      body: {
        response: authResponse('next-only-auth', 'next-only-credential-id', 'next-only-user-handle'),
        next: signed.next,
      },
    }), testEnv);
    const nextOnlyBody = await nextOnly.json();

    const sigOnlyAccount = await seedAccount({ testEnv, email: 'sig-only@example.com' });
    await seedCredential({
      accountId: sigOnlyAccount.accountId,
      credentialId: 'sig-only-credential-id',
      userHandle: 'sig-only-user-handle',
    });
    await seedPasskeyChallenge({ challenge: 'sig-only-auth', purpose: 'authenticate' });

    const sigOnly = await worker.fetch(passkeyRequest('/passkey/auth/finish', {
      body: {
        response: authResponse('sig-only-auth', 'sig-only-credential-id', 'sig-only-user-handle'),
        next_sig: signed.nextSig,
      },
    }), testEnv);
    const sigOnlyBody = await sigOnly.json();

    expect(nextOnly.status).toBe(200);
    expect(nextOnlyBody.redirect).toBe('/');
    expect(nextOnly.headers.get('Set-Cookie')).toMatch(SESSION_COOKIE_RE);
    expect(sigOnly.status).toBe(200);
    expect(sigOnlyBody.redirect).toBe('/');
    expect(sigOnly.headers.get('Set-Cookie')).toMatch(SESSION_COOKIE_RE);
  });

  it('refuses unsafe resume redirects while still signing in', async () => {
    const testEnv = makeTestEnv();
    const signed = await signEnableResume('/enable/spl', `?nonce=${VALID_NONCE}`, testEnv);
    const wrongSigAccount = await seedAccount({ testEnv, email: 'wrong-sig@example.com' });
    await seedCredential({
      accountId: wrongSigAccount.accountId,
      credentialId: 'wrong-sig-credential-id',
      userHandle: 'wrong-sig-user-handle',
    });
    await seedPasskeyChallenge({ challenge: 'wrong-sig-auth', purpose: 'authenticate' });

    const wrongSig = await worker.fetch(passkeyRequest('/passkey/auth/finish', {
      body: {
        response: authResponse('wrong-sig-auth', 'wrong-sig-credential-id', 'wrong-sig-user-handle'),
        next: signed.next,
        next_sig: 'bad-signature',
      },
    }), testEnv);
    const wrongSigBody = await wrongSig.json();

    const badPath = makeNext({ path: '/not-enable', queryString: `?nonce=${VALID_NONCE}` });
    const badPathSig = await hashWithPepper(badPath, testEnv, 'HMAC_PEPPER');
    const badPathAccount = await seedAccount({ testEnv, email: 'bad-path@example.com' });
    await seedCredential({
      accountId: badPathAccount.accountId,
      credentialId: 'bad-path-credential-id',
      userHandle: 'bad-path-user-handle',
    });
    await seedPasskeyChallenge({ challenge: 'bad-path-auth', purpose: 'authenticate' });

    const badPathResponse = await worker.fetch(passkeyRequest('/passkey/auth/finish', {
      body: {
        response: authResponse('bad-path-auth', 'bad-path-credential-id', 'bad-path-user-handle'),
        next: badPath,
        next_sig: badPathSig,
      },
    }), testEnv);
    const badPathBody = await badPathResponse.json();

    const externalPath = makeNext({ path: 'https://evil.example', queryString: `?nonce=${VALID_NONCE}` });
    const externalPathSig = await hashWithPepper(externalPath, testEnv, 'HMAC_PEPPER');
    const externalPathAccount = await seedAccount({ testEnv, email: 'external-path@example.com' });
    await seedCredential({
      accountId: externalPathAccount.accountId,
      credentialId: 'external-path-credential-id',
      userHandle: 'external-path-user-handle',
    });
    await seedPasskeyChallenge({ challenge: 'external-path-auth', purpose: 'authenticate' });

    const externalPathResponse = await worker.fetch(passkeyRequest('/passkey/auth/finish', {
      body: {
        response: authResponse('external-path-auth', 'external-path-credential-id', 'external-path-user-handle'),
        next: externalPath,
        next_sig: externalPathSig,
      },
    }), testEnv);
    const externalPathBody = await externalPathResponse.json();

    expect(wrongSig.status).toBe(200);
    expect(wrongSigBody.redirect).toBe('/');
    expect(wrongSig.headers.get('Set-Cookie')).toMatch(SESSION_COOKIE_RE);
    expect(badPathResponse.status).toBe(200);
    expect(badPathBody.redirect).toBe('/');
    expect(badPathResponse.headers.get('Set-Cookie')).toMatch(SESSION_COOKIE_RE);
    expect(externalPathResponse.status).toBe(200);
    expect(externalPathBody.redirect).toBe('/');
    expect(externalPathResponse.headers.get('Set-Cookie')).toMatch(SESSION_COOKIE_RE);
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
    const response = await worker.fetch(new Request('https://services.solstone.app/passkey/auth/finish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://services.solstone.app',
        'CF-Connecting-IP': '203.0.113.91',
      },
      body: 'not-json',
    }), makeTestEnv());

    expect(response.status).toBe(400);
    expect(response.headers.get('Content-Type')).toMatch(/application\/json/);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});

function passkeyRequest(path, { body = {}, origin = 'https://services.solstone.app' } = {}) {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.91' };
  if (origin !== null) headers.Origin = origin;
  return new Request(`https://services.solstone.app${path}`, {
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

function makeNext(obj) {
  return btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
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
