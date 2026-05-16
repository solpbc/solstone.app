import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { encryptEmail } from '../src/crypto.js';
import {
  fetchWithCtx,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedAccountEmail,
  seedCredential,
  seedSession,
} from './helpers.js';
import {
  installJwksStub,
  mintToken,
  SCOUTS_AUD,
} from './jwks-helper.js';

const ICLOUD_AAGUID = 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd';
const WINDOWS_AAGUID = '08987058-cadc-4b81-b6e1-30de50dcbe96';
const GOOGLE_AAGUID = 'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4';
const SAFARI_MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';

describe('admin endpoints', () => {
  beforeEach(async () => {
    await resetDb();
    await installJwksStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects a missing CF Access header', async () => {
    const response = await worker.fetch(adminRequest('/admin/accounts'), makeTestEnv());
    await expectJsonError(response, 403, 'cloudflare access required');
  });

  it('rejects a token signed by an unserved key', async () => {
    const token = await mintToken({ badSignature: true });
    const response = await worker.fetch(adminRequest('/admin/accounts', token), makeTestEnv());
    await expectJsonError(response, 403, 'cloudflare access required');
  });

  it('rejects wrong issuer, wrong audience, and expired tokens', async () => {
    const wrongIssuer = await mintToken({ iss: 'https://example.com' });
    await expectJsonError(
      await worker.fetch(adminRequest('/admin/accounts', wrongIssuer), makeTestEnv()),
      403,
      'cloudflare access required'
    );

    const wrongAudience = await mintToken({ aud: SCOUTS_AUD });
    await expectJsonError(
      await worker.fetch(adminRequest('/admin/accounts', wrongAudience), makeTestEnv()),
      403,
      'cloudflare access required'
    );

    const expired = await mintToken({ exp: Math.floor(Date.now() / 1000) - 60 });
    await expectJsonError(
      await worker.fetch(adminRequest('/admin/accounts', expired), makeTestEnv()),
      403,
      'cloudflare access required'
    );
  });

  it('lists accounts for a valid email payload with decrypted primary email and scoped counts', async () => {
    const testEnv = makeTestEnv();
    const { account } = await seedAdminAccount(testEnv);
    await seedAccount({ email: 'second@example.com', nowMs: 2_000, testEnv });
    const token = await mintToken();

    const response = await worker.fetch(adminRequest('/admin/accounts', token), testEnv);
    const body = await response.json();
    const row = body.accounts.find((item) => item.id === account.accountId);

    expect(response.status).toBe(200);
    expect(body.accounts).toHaveLength(2);
    expect(row).toMatchObject({
      id: account.accountId,
      primary_email: 'primary@example.com',
      n_passkeys: 2,
      n_sessions: 1,
      n_emails: 2,
      created_at: new Date(1_000).toISOString(),
      last_signin_at: new Date(1_000).toISOString(),
    });
  });

  it('accepts a valid service-token common_name payload', async () => {
    const token = await mintToken({ payload: { common_name: 'service-token' } });
    const response = await worker.fetch(adminRequest('/admin/accounts', token), makeTestEnv());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ accounts: [] });
  });

  it('keeps admin responses JSON when a post-auth query throws', async () => {
    const token = await mintToken();
    const baseEnv = makeTestEnv();
    const throwingEnv = makeTestEnv({
      DB: {
        prepare(sql) {
          if (/FROM accounts/i.test(sql) && /n_passkeys/i.test(sql)) {
            throw new Error('query failed');
          }
          return baseEnv.DB.prepare(sql);
        },
      },
    });

    const response = await worker.fetch(adminRequest('/admin/accounts', token), throwingEnv);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'account not found' });
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('shows an account by uuid, email, and percent-encoded email', async () => {
    const testEnv = makeTestEnv();
    const { account, activeSession } = await seedAdminAccount(testEnv);
    const token = await mintToken();

    const byUuid = await adminJson(`/admin/accounts/${account.accountId}`, token, testEnv);
    const byEmail = await adminJson('/admin/accounts/primary@example.com', token, testEnv);
    const byEncoded = await adminJson('/admin/accounts/primary%40example.com', token, testEnv);

    expect(byUuid.account.id).toBe(account.accountId);
    expect(byEmail.account.id).toBe(account.accountId);
    expect(byEncoded.account.id).toBe(account.accountId);
    expect(byUuid.account.primary_email).toBe('primary@example.com');
    expect(byUuid.emails.map((row) => row.address)).toEqual(['primary@example.com', 'secondary@example.com']);
    expect(byUuid.sessions.some((row) => row.id_hash === activeSession.idHash)).toBe(true);
    expect(byUuid.sessions.find((row) => row.id_hash === activeSession.idHash).id_hash)
      .toHaveLength(activeSession.idHash.length);
  });

  it('returns uniform not-found bodies for unknown or malformed show paths', async () => {
    const token = await mintToken();
    const unknownUuid = '00000000-0000-0000-0000-000000000001';

    await expectJsonError(
      await worker.fetch(adminRequest(`/admin/accounts/${unknownUuid}`, token), makeTestEnv()),
      404,
      'account not found'
    );
    await expectJsonError(
      await worker.fetch(adminRequest('/admin/accounts/unknown@example.com', token), makeTestEnv()),
      404,
      'account not found'
    );
    await expectJsonError(
      await worker.fetch(adminRequest('/admin/accounts/not-an-email', token), makeTestEnv()),
      404,
      'account not found'
    );
    await expectJsonError(
      await worker.fetch(adminRequest('/admin/other', token), makeTestEnv()),
      404,
      'account not found'
    );
  });

  it('includes revoked passkeys and revoked or expired sessions in show payload', async () => {
    const testEnv = makeTestEnv();
    const { account, revokedSession, expiredSession } = await seedAdminAccount(testEnv);
    const token = await mintToken();
    const body = await adminJson(`/admin/accounts/${account.accountId}`, token, testEnv);

    expect(body.passkeys.map((row) => row.credential_id)).toEqual([
      'google-passkey',
      'windows-passkey',
      'icloud-passkey',
    ]);
    expect(body.passkeys.find((row) => row.credential_id === 'windows-passkey').revoked_at)
      .toBe(new Date(8_000).toISOString());
    expect(body.passkeys.find((row) => row.credential_id === 'icloud-passkey').aaguid_label)
      .toBe('icloud keychain');
    expect(body.passkeys.find((row) => row.credential_id === 'windows-passkey').aaguid_label)
      .toBe('windows hello');
    expect(body.passkeys.find((row) => row.credential_id === 'google-passkey').aaguid_label)
      .toBe('google password manager');
    expect(body.sessions.some((row) => row.id_hash === revokedSession.idHash)).toBe(true);
    expect(body.sessions.some((row) => row.id_hash === expiredSession.idHash)).toBe(true);
  });

  it('sets admin JSON security headers without Turnstile CSP allowances', async () => {
    const token = await mintToken();
    const response = await worker.fetch(adminRequest('/admin/accounts', token), makeTestEnv());

    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    expect(response.headers.get('Content-Security-Policy')).not.toContain('challenges.cloudflare.com');
  });

  it('does not log during admin list or show', async () => {
    const testEnv = makeTestEnv();
    const { account } = await seedAdminAccount(testEnv);
    const token = await mintToken();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await worker.fetch(adminRequest('/admin/accounts', token), testEnv);
    await worker.fetch(adminRequest(`/admin/accounts/${account.accountId}`, token), testEnv);
    const output = [...log.mock.calls, ...warn.mock.calls, ...error.mock.calls].flat().join('\n');

    expect(output).toBe('');
    expect(output).not.toContain('@');
    expect(output).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
    expect(output).not.toMatch(/[0-9a-f]{32,}/);
    expect(output).not.toMatch(/[A-Za-z0-9_-]{32,}/);
  });
});

async function seedAdminAccount(testEnv) {
  const account = await seedAccount({ email: 'primary@example.com', nowMs: 1_000, testEnv });
  await seedAccountEmail({
    accountId: account.accountId,
    address: 'secondary@example.com',
    verifiedAt: null,
    createdAt: 2_000,
    testEnv,
  });

  await seedCredential({ accountId: account.accountId, credentialId: 'icloud-passkey', createdAt: 3_000 });
  await seedCredential({ accountId: account.accountId, credentialId: 'windows-passkey', createdAt: 4_000 });
  await seedCredential({ accountId: account.accountId, credentialId: 'google-passkey', createdAt: 5_000 });
  await workerEnv.DB
    .prepare('UPDATE passkey_credentials SET aaguid = CASE credential_id WHEN ? THEN ? WHEN ? THEN ? WHEN ? THEN ? END, revoked_at = CASE WHEN credential_id = ? THEN ? ELSE revoked_at END WHERE account_id = ?')
    .bind(
      'icloud-passkey',
      ICLOUD_AAGUID,
      'windows-passkey',
      WINDOWS_AAGUID,
      'google-passkey',
      GOOGLE_AAGUID,
      'windows-passkey',
      8_000,
      account.accountId
    )
    .run();

  const activeSession = await seedSession(account.accountId, { testEnv });
  const revokedSession = await seedSession(account.accountId, { testEnv });
  const expiredSession = await seedSession(account.accountId, { testEnv });
  const ipEncrypted = await encryptEmail('73.225.42.18', testEnv);
  await workerEnv.DB
    .prepare(
      `UPDATE sessions
       SET last_ip_encrypted = ?, last_user_agent = ?,
           revoked_at = CASE WHEN id_hash = ? THEN ? ELSE revoked_at END,
           expires_at = CASE WHEN id_hash = ? THEN ? ELSE expires_at END
       WHERE account_id = ?`
    )
    .bind(
      ipEncrypted,
      SAFARI_MAC_UA,
      revokedSession.idHash,
      9_000,
      expiredSession.idHash,
      Date.now() - 1_000,
      account.accountId
    )
    .run();
  return { account, activeSession, revokedSession, expiredSession };
}

function adminRequest(path, token = null) {
  const headers = {};
  if (token) headers['Cf-Access-Jwt-Assertion'] = token;
  return new Request(`https://account.solstone.app${path}`, { headers });
}

async function adminJson(path, token, testEnv) {
  const { response } = await fetchWithCtx(worker, adminRequest(path, token), testEnv);
  expect(response.status).toBe(200);
  return response.json();
}

async function expectJsonError(response, status, error) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error });
}
