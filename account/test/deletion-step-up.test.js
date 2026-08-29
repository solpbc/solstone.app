import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@simplewebauthn/server', () => ({
  generateAuthenticationOptions: vi.fn(),
  generateRegistrationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
}));

import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { finishPasskeyProof, requireFreshProof, startEmailProof, startPasskeyProof, verifyEmailProof } from '../src/deletion.js';
import { createDeletionProof } from '../src/db.js';
import { makeTestEnv, resetDb, seedAccount, seedCredential } from './helpers.js';

describe('deletion step-up proofs', () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    generateAuthenticationOptions.mockResolvedValue({ challenge: 'delete-challenge', allowCredentials: [] });
    verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 4 } });
  });

  it('requires a fresh OTP, expires it, and makes it single-use at consumption time', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await startEmailProof(testEnv, { accountId: account.accountId, sessionIdHash: 'session', purpose: 'delete', ip: '203.0.113.1' });
    const code = testEnv.EMAIL.sent[0].text.match(/\b(\d{3}) (\d{3})\b/).slice(1).join('');
    await expect(verifyEmailProof(testEnv, { accountId: account.accountId, sessionIdHash: 'session', purpose: 'delete', code, ip: '203.0.113.1' })).resolves.toEqual({ ok: true });
    await expect(requireFreshProof(testEnv, { accountId: account.accountId, sessionIdHash: 'session', purpose: 'delete' })).resolves.toMatchObject({ otpVerified: true, passkeyVerified: true });
    await workerEnv.DB.prepare('UPDATE account_deletion_proofs SET expires_at = 0').run();
    await expect(requireFreshProof(testEnv, { accountId: account.accountId, sessionIdHash: 'session', purpose: 'delete' })).resolves.toMatchObject({ otpVerified: false });
  });

  it('requires a fresh user-verified passkey assertion for an active passkey', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedCredential({ accountId: account.accountId, credentialId: 'credential', testEnv });
    const started = await startPasskeyProof(testEnv, { accountId: account.accountId, sessionIdHash: 'session', purpose: 'delete', ip: '203.0.113.2' });
    expect(started.options.challenge).toBe('delete-challenge');
    await expect(finishPasskeyProof(testEnv, {
      accountId: account.accountId, sessionIdHash: 'session', purpose: 'delete', ip: '203.0.113.2',
      assertionResponse: assertion('delete-challenge', 'credential'),
    })).resolves.toEqual({ ok: true });
    expect(verifyAuthenticationResponse).toHaveBeenCalledWith(expect.objectContaining({ requireUserVerification: true }));
  });

  it('bounds OTP proof starts by account and IP rate buckets', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    for (let index = 0; index < 10; index++) {
      await startEmailProof(testEnv, { accountId: account.accountId, sessionIdHash: 'session', purpose: 'delete', ip: '203.0.113.3' });
    }
    await expect(startEmailProof(testEnv, { accountId: account.accountId, sessionIdHash: 'session', purpose: 'delete', ip: '203.0.113.3' })).rejects.toThrow('proof_rate_limited');
  });
});

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
