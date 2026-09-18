import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));

import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import worker from '../src/index.js';
import { requireFreshProof } from '../src/db.js';
import {
  fetchWithCtx,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedAccountEmail,
  seedCredential,
  seedCredentialChangeProof,
  seedSession,
  startRequest,
  stubTurnstile,
  verifyRequest,
} from './helpers.js';

const ORIGIN = 'https://services.solstone.app';

describe('credential-change step-up', () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    generateAuthenticationOptions.mockResolvedValue({ challenge: 'cc-challenge', allowCredentials: [] });
    verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 1 } });
    generateRegistrationOptions.mockResolvedValue({ challenge: 'welcome-register-challenge', rp: { id: 'solstone.app', name: 'solstone' } });
  });

  it('redirects add-email, remove-email, make-primary, and remove-passkey to the step-up page without a fresh proof', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const secondary = await seedAccountEmail({
      accountId: account.accountId, address: 'secondary@example.com', verifiedAt: Date.now(), testEnv,
    });
    await workerEnv.DB.prepare('INSERT INTO passkey_credentials (credential_id, account_id, public_key, counter, transports, backup_eligible, backup_state, created_at) VALUES (?, ?, \'pk\', 0, NULL, 0, 0, ?)')
      .bind('gated-remove', account.accountId, Date.now()).run();

    const cases = [
      ['/sign-in/emails/add', { address: 'new@example.com' }, '/sign-in/emails'],
      [`/sign-in/emails/${secondary.id}/remove`, {}, '/sign-in/emails'],
      [`/sign-in/emails/${secondary.id}/make-primary`, {}, '/sign-in/emails'],
      ['/sign-in/passkeys/gated-remove/remove', {}, '/sign-in/passkeys'],
    ];
    for (const [path, form, next] of cases) {
      const response = await worker.fetch(formPost(path, session.cookie, form), testEnv);
      expect(response.status, path).toBe(303);
      expect(response.headers.get('Location'), path).toBe(
        `/account/credential-change/proof?next=${encodeURIComponent(next)}`
      );
      expect(response.headers.get('Cache-Control'), path).toBe('no-store');
    }
  });

  it('the step-up redirect is distinct from an origin-guard refusal', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const originRefused = await worker.fetch(new Request(`${ORIGIN}/sign-in/emails/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://evil.example', Cookie: session.cookie },
      body: 'address=new%40example.com',
    }), testEnv);
    const stepUpRefused = await worker.fetch(formPost('/sign-in/emails/add', session.cookie, { address: 'new@example.com' }), testEnv);

    expect(originRefused.status).toBe(403);
    expect(await originRefused.text()).toBe('');
    expect(stepUpRefused.status).toBe(303);
    expect(stepUpRefused.headers.get('Location')).toContain('/account/credential-change/proof');
  });

  it('passkey register start/finish return a distinct step-up JSON refusal, not the origin/session shape', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(new Request(`${ORIGIN}/passkey/register/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: session.cookie },
      body: '{}',
    }), testEnv);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.step_up_required).toBe(true);
    expect(body.step_up_url).toBe('/account/credential-change/proof?next=/sign-in/passkeys');
    expect(body.error).not.toBe('invalid request');
    expect(body.error).not.toBe('sign-in required');
  });

  it('a fresh OTP proof licenses the change on a zero-passkey account, and never needs a second one for a second action', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedCredentialChangeProof({ accountId: account.accountId, sessionIdHash: session.idHash, testEnv });

    const { response: first } = await fetchWithCtx(worker, formPost('/sign-in/emails/add', session.cookie, { address: 'first@example.com' }), testEnv);
    expect(first.status).toBe(303);
    expect(first.headers.get('Location')).toBe('/sign-in/emails/verify?address=first%40example.com');

    const { response: second } = await fetchWithCtx(worker, formPost('/sign-in/emails/add', session.cookie, { address: 'second@example.com' }), testEnv);
    expect(second.status).toBe(303);
    expect(second.headers.get('Location')).toBe('/sign-in/emails/verify?address=second%40example.com');
  });

  it('an account with an active passkey needs a passkey proof too — OTP alone is not enough', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedCredential({ accountId: account.accountId, credentialId: 'existing', testEnv });
    await seedCredentialChangeProof({ accountId: account.accountId, sessionIdHash: session.idHash, testEnv });

    const otpOnly = await worker.fetch(formPost('/sign-in/emails/add', session.cookie, { address: 'new@example.com' }), testEnv);
    expect(otpOnly.status).toBe(303);
    expect(otpOnly.headers.get('Location')).toBe('/account/credential-change/proof?next=%2Fsign-in%2Femails');

    await seedCredentialChangeProof({
      accountId: account.accountId, sessionIdHash: session.idHash, testEnv, withPasskeyProof: true,
    });
    const { response: otpAndPasskey } = await fetchWithCtx(worker, formPost('/sign-in/emails/add', session.cookie, { address: 'new@example.com' }), testEnv);
    expect(otpAndPasskey.status).toBe(303);
    expect(otpAndPasskey.headers.get('Location')).toBe('/sign-in/emails/verify?address=new%40example.com');
  });

  it('a fresh sign-in OTP verification seeds the proof a first-run passkey enrollment needs, with no extra step', async () => {
    stubTurnstile(true);
    const testEnv = makeTestEnv();
    const email = 'welcome@example.com';
    await worker.fetch(startRequest(email), testEnv);
    const message = testEnv.EMAIL.sent[0];
    const code = message.text.match(/\b(\d{3}) (\d{3})\b/).slice(1).join('');
    const verifyResponse = await worker.fetch(verifyRequest({ email, code }), testEnv);
    expect(verifyResponse.status).toBe(303);
    expect(verifyResponse.headers.get('Location')).toBe('/?welcome=1');
    const cookie = `account_session=${extractSessionToken(verifyResponse)}`;

    const registerStart = await worker.fetch(new Request(`${ORIGIN}/passkey/register/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie },
      body: '{}',
    }), testEnv);

    expect(registerStart.status).toBe(200);
  });

  it('renaming a passkey is not gated by the credential-change proof', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedCredential({ accountId: account.accountId, credentialId: 'rename-me', testEnv });

    const response = await worker.fetch(formPost('/sign-in/passkeys/rename-me/rename', session.cookie, { friendly_name: 'my key' }), testEnv);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/sign-in/passkeys');
  });

  it('the proof page falls back to /sign-in for an unrecognized next target', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(new Request(`${ORIGIN}/account/credential-change/proof?next=https://evil.example`, {
      headers: { Cookie: session.cookie },
    }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('action="/account/credential-change/proof/otp/verify"');
    expect(body).toContain('name="next" value="/sign-in"');
    expect(body).not.toContain('evil.example');
  });

  it('the OTP step-up ceremony redirects to next once fresh, on a zero-passkey account', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const start = await worker.fetch(new Request(`${ORIGIN}/account/credential-change/proof/otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN, Cookie: session.cookie },
      body: 'next=%2Fsign-in%2Femails',
    }), testEnv);
    expect(start.status).toBe(200);
    const message = testEnv.EMAIL.sent[0];
    const code = message.text.match(/\b(\d{3}) (\d{3})\b/).slice(1).join('');

    const wrong = await worker.fetch(new Request(`${ORIGIN}/account/credential-change/proof/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN, Cookie: session.cookie },
      body: 'next=%2Fsign-in%2Femails&code=000000',
    }), testEnv);
    expect(wrong.status).toBe(400);

    const right = await worker.fetch(new Request(`${ORIGIN}/account/credential-change/proof/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN, Cookie: session.cookie },
      body: `next=%2Fsign-in%2Femails&code=${code}`,
    }), testEnv);
    expect(right.status).toBe(303);
    expect(right.headers.get('Location')).toBe('/sign-in/emails');

    const fresh = await requireFreshProof(testEnv.DB, {
      accountId: account.accountId, sessionIdHash: session.idHash, purpose: 'credential-change',
    });
    expect(fresh).toMatchObject({ otpVerified: true, passkeyVerified: true });
  });

  it('the passkey step-up ceremony reports ready only once both proofs are fresh', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedCredential({ accountId: account.accountId, credentialId: 'step-up-credential', testEnv });

    const passkeyStart = await worker.fetch(new Request(`${ORIGIN}/account/credential-change/proof/passkey/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: session.cookie },
      body: '{}',
    }), testEnv);
    expect(passkeyStart.status).toBe(200);

    const passkeyFinish = await worker.fetch(new Request(`${ORIGIN}/account/credential-change/proof/passkey/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: session.cookie },
      body: JSON.stringify({ response: assertion('cc-challenge', 'step-up-credential') }),
    }), testEnv);
    const finishBody = await passkeyFinish.json();
    expect(finishBody).toMatchObject({ ok: true, ready: false });

    // The passkey proof from the finish above is already verified and does
    // not need re-proving; only the still-missing OTP half is added.
    await seedOtpProofDirectly(testEnv, account.accountId, session.idHash);
    const fresh = await requireFreshProof(testEnv.DB, {
      accountId: account.accountId, sessionIdHash: session.idHash, purpose: 'credential-change',
    });
    expect(fresh).toMatchObject({ otpVerified: true, passkeyVerified: true });
  });
});

async function seedOtpProofDirectly(testEnv, accountId, sessionIdHash) {
  const { createDeletionProof } = await import('../src/db.js');
  const { hashWithPepper, generateSessionToken } = await import('../src/crypto.js');
  const tokenHash = await hashWithPepper(generateSessionToken(), testEnv);
  await createDeletionProof(testEnv.DB, {
    tokenHash,
    accountId,
    sessionIdHash,
    purpose: 'credential-change',
    method: 'otp',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 600_000,
    otpCodeHash: tokenHash,
    verified: true,
  });
}

function extractSessionToken(response) {
  const setCookie = response.headers.get('Set-Cookie') || '';
  return setCookie.match(/^account_session=([^;]*);/)?.[1] || '';
}

function formPost(path, cookie, form) {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN, Cookie: cookie },
    body: new URLSearchParams(form).toString(),
  });
}

function assertion(challenge, id) {
  return {
    id,
    response: {
      clientDataJSON: b64u(new TextEncoder().encode(JSON.stringify({ challenge }))),
      authenticatorData: 'auth', signature: 'signature', userHandle: null,
    },
  };
}

function b64u(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
