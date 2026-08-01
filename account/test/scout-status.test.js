import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { hashWithPepper } from '../src/crypto.js';
import { mintDispatchToken } from '../src/devices.js';
import { makeTestEnv, resetDb, seedAccount } from './helpers.js';

describe('/account/scout/status', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns pending application status without a removed key field', async () => {
    const testEnv = makeTestEnv();
    const { account, token } = await seedStatusAccount(testEnv);
    await seedScoutApplication(testEnv, {
      accountId: account.accountId,
      status: 'pending',
      appliedAt: 1_111,
    });

    const response = await worker.fetch(statusRequest({ token }), testEnv);
    const body = await expectStatusBody(response);

    expect(body).toEqual({
      account_id: account.accountId,
      status: 'pending',
      applied_at: 1_111,
      approved_at: null,
      revoked_at: null,
    });
    expect(body).not.toHaveProperty('active_key');
  });

  it('returns approved application status without a removed key field', async () => {
    const testEnv = makeTestEnv();
    const { account, token } = await seedStatusAccount(testEnv);
    await seedScoutApplication(testEnv, {
      accountId: account.accountId,
      status: 'approved',
      approvedAt: 2_222,
    });

    const response = await worker.fetch(statusRequest({ token }), testEnv);
    const body = await expectStatusBody(response);

    expect(body).toEqual({
      account_id: account.accountId,
      status: 'approved',
      applied_at: null,
      approved_at: 2_222,
      revoked_at: null,
    });
    expect(body).not.toHaveProperty('active_key');
  });

  it('returns revoked APPLICATION status for a valid token', async () => {
    const testEnv = makeTestEnv();
    const { account, token } = await seedStatusAccount(testEnv);
    await seedScoutApplication(testEnv, {
      accountId: account.accountId,
      status: 'revoked',
      appliedAt: 1_111,
      revokedAt: 4_444,
    });

    const response = await worker.fetch(statusRequest({ token }), testEnv);
    const body = await expectStatusBody(response);

    expect(body).toEqual({
      account_id: account.accountId,
      status: 'revoked',
      applied_at: 1_111,
      approved_at: null,
      revoked_at: 4_444,
    });
    expect(body).not.toHaveProperty('active_key');
  });

  it('rejects missing Authorization header', async () => {
    const response = await worker.fetch(statusRequest({ token: null }), makeTestEnv());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_token' });
  });

  it('rejects garbage token', async () => {
    const response = await worker.fetch(statusRequest({ token: 'garbage-token' }), makeTestEnv());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_token' });
  });

  it('rejects malformed non-Bearer Authorization header', async () => {
    const response = await worker.fetch(statusRequest({ token: 'Token garbage-token', rawAuth: true }), makeTestEnv());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_token' });
  });

  it('rejects SERVER-REVOKED dispatch token', async () => {
    const testEnv = makeTestEnv();
    const { account, token } = await seedStatusAccount(testEnv);
    await seedScoutApplication(testEnv, {
      accountId: account.accountId,
      status: 'pending',
      appliedAt: 1_111,
    });
    const tokenHash = await hashWithPepper(token, testEnv, 'DISPATCH_TOKEN_PEPPER');
    await testEnv.DB
      .prepare('UPDATE account_dispatch_tokens SET revoked_at = ? WHERE token_hash = ?')
      .bind(Date.now(), tokenHash)
      .run();

    const response = await worker.fetch(statusRequest({ token }), testEnv);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_token' });
  });

  it('returns not_found when resolved account has no scout application', async () => {
    const testEnv = makeTestEnv();
    const { token } = await seedStatusAccount(testEnv);

    const response = await worker.fetch(statusRequest({ token }), testEnv);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'not_found' });
  });

  it('does not mutate dispatch tokens during a successful status read', async () => {
    const testEnv = makeTestEnv();
    const { account, token } = await seedStatusAccount(testEnv);
    await seedScoutApplication(testEnv, {
      accountId: account.accountId,
      status: 'approved',
      approvedAt: 2_222,
    });
    const beforeTokens = await rowCount(testEnv, 'account_dispatch_tokens');

    const response = await worker.fetch(statusRequest({ token }), testEnv);
    const body = await expectStatusBody(response);

    expect(body).toMatchObject({ status: 'approved' });
    expect(body).not.toHaveProperty('active_key');
    await expect(rowCount(testEnv, 'account_dispatch_tokens')).resolves.toBe(beforeTokens);
  });
});

async function seedStatusAccount(testEnv) {
  const account = await seedAccount({ testEnv });
  const minted = await mintDispatchToken(testEnv, account.accountId);
  return { account, token: minted.token };
}

async function seedScoutApplication(testEnv, {
  accountId,
  status,
  appliedAt = null,
  approvedAt = null,
  revokedAt = null,
  createdAt = 1_000,
  updatedAt = createdAt,
}) {
  await testEnv.DB
    .prepare(
      `INSERT INTO scout_applications (
         account_id, status, use_case, data_acked_at, applied_at,
         approved_at, revoked_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(accountId, status, null, null, appliedAt, approvedAt, revokedAt, createdAt, updatedAt)
    .run();
}

function statusRequest({ token, rawAuth = false } = {}) {
  const headers = {};
  if (token != null) headers.Authorization = rawAuth ? token : `Bearer ${token}`;
  return new Request('https://services.solstone.app/account/scout/status', { headers });
}

async function expectStatusBody(response) {
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toContain('application/json');
  const body = await response.json();
  expect(body).not.toHaveProperty('active_key');
  return body;
}

async function rowCount(testEnv, table) {
  const row = await testEnv.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
  return row.count;
}
