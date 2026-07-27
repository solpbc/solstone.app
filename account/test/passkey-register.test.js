import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import worker from '../src/index.js';
import {
  makeTestEnv,
  recordingDb,
  resetDb,
  seedAccount,
  seedCredential,
  seedPasskeyChallenge,
  seedSession,
} from './helpers.js';

describe('passkey registration', () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    generateRegistrationOptions.mockResolvedValue({
      challenge: 'register-challenge',
      rp: { id: 'solstone.app', name: 'solstone' },
    });
    verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'new-credential-id',
          publicKey: new Uint8Array([9, 8, 7, 6]),
          counter: 3,
          transports: ['internal'],
        },
        aaguid: 'test-aaguid',
        credentialDeviceType: 'multiDevice',
        credentialBackedUp: true,
      },
    });
  });

  it('starts registration with decrypted display name, excludeCredentials, and stored challenge', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'Passkey@Example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedCredential({ accountId: account.accountId, credentialId: 'existing-credential-id' });

    const response = await worker.fetch(passkeyRequest('/passkey/register/start', { cookie: session.cookie }), testEnv);
    const body = await response.json();
    const challenge = await workerEnv.DB
      .prepare('SELECT purpose, account_id FROM passkey_challenges WHERE challenge = ?')
      .bind('register-challenge')
      .first();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body.options.challenge).toBe('register-challenge');
    expect(generateRegistrationOptions).toHaveBeenCalledWith(expect.objectContaining({
      rpID: 'solstone.app',
      rpName: 'solstone',
      userName: 'passkey@example.com',
      userDisplayName: 'passkey@example.com',
      attestationType: 'none',
      supportedAlgorithmIDs: [-7, -257, -8],
      hints: ['client-device', 'hybrid'],
      excludeCredentials: [expect.objectContaining({ id: 'existing-credential-id', type: 'public-key' })],
    }));
    expect(challenge).toMatchObject({ purpose: 'register', account_id: account.accountId });
  });

  it('uses one conditional handle update followed by read-back select', async () => {
    const statements = [];
    const testEnv = makeTestEnv({ DB: recordingDb(workerEnv.DB, statements) });
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    generateRegistrationOptions.mockImplementationOnce(async (options) => ({
      challenge: 'register-challenge',
      user: { id: b64u(options.userID) },
    }));

    const response = await worker.fetch(passkeyRequest('/passkey/register/start', { cookie: session.cookie }), testEnv);
    const body = await response.json();
    const row = await workerEnv.DB
      .prepare('SELECT passkey_user_handle FROM accounts WHERE id = ?')
      .bind(account.accountId)
      .first();

    const updateIndex = statements.findIndex((sql) => /UPDATE accounts SET passkey_user_handle = \? WHERE id = \? AND passkey_user_handle IS NULL/i.test(sql));
    const selectIndex = statements.findIndex((sql) => /SELECT passkey_user_handle FROM accounts WHERE id = \?/i.test(sql));
    expect(updateIndex).toBeGreaterThanOrEqual(0);
    expect(selectIndex).toBeGreaterThan(updateIndex);
    expect(row.passkey_user_handle).toBeTruthy();
    expect(body.options.user.id).toBe(row.passkey_user_handle);
  });

  it('finishes registration with purpose/account checks and friendly name truncation', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedPasskeyChallenge({ challenge: 'finish-challenge', purpose: 'register', accountId: account.accountId });

    const response = await worker.fetch(passkeyRequest('/passkey/register/finish', {
      cookie: session.cookie,
      body: {
        response: registrationResponse('finish-challenge'),
        friendly_name: `  ${'x'.repeat(80)}  `,
      },
    }), testEnv);
    const body = await response.json();
    const row = await workerEnv.DB
      .prepare('SELECT friendly_name, device_type, backup_eligible, backup_state FROM passkey_credentials WHERE credential_id = ?')
      .bind('new-credential-id')
      .first();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, credential_id: 'new-credential-id' });
    expect(row.friendly_name).toBe('x'.repeat(64));
    expect(row).toMatchObject({ device_type: 'multiDevice', backup_eligible: 1, backup_state: 1 });
  });

  it('rejects a register challenge created for a different account', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'one@example.com', testEnv });
    const other = await seedAccount({ email: 'two@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedPasskeyChallenge({ challenge: 'wrong-account', purpose: 'register', accountId: other.accountId });

    const response = await worker.fetch(passkeyRequest('/passkey/register/finish', {
      cookie: session.cookie,
      body: { response: registrationResponse('wrong-account') },
    }), testEnv);

    expect(response.status).toBe(400);
    expect(await rowCount('passkey_credentials')).toBe(0);
  });

  it('rejects an authenticate challenge on register finish', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedPasskeyChallenge({ challenge: 'wrong-purpose', purpose: 'authenticate', accountId: null });

    const response = await worker.fetch(passkeyRequest('/passkey/register/finish', {
      cookie: session.cookie,
      body: { response: registrationResponse('wrong-purpose') },
    }), testEnv);

    expect(response.status).toBe(400);
  });
});

function passkeyRequest(path, { cookie, body = {}, origin = 'https://services.solstone.app' } = {}) {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.90' };
  if (cookie) headers.Cookie = cookie;
  if (origin !== null) headers.Origin = origin;
  return new Request(`https://services.solstone.app${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function registrationResponse(challenge) {
  return {
    id: 'new-credential-id',
    rawId: 'new-credential-id',
    type: 'public-key',
    response: {
      clientDataJSON: clientData(challenge),
      attestationObject: 'attestation',
      transports: ['internal'],
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
