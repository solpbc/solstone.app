import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashWithPepper } from '../src/crypto.js';
import { mintDispatchToken, resolveDispatchToken } from '../src/devices.js';
import { makeTestEnv, resetDb, seedAccount, seedSandboxRun } from './helpers.js';

const NOW_MS = 1_700_000_000_000;
const RUN_ID = '22222222-2222-2222-2222-222222222222';
const INSTANCE_ID = '11111111-1111-1111-1111-111111111111';

describe('dispatch tokens', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mints and resolves a dispatch token', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });

    const minted = await mintDispatchToken(testEnv, account.accountId);
    const resolved = await resolveDispatchToken(testEnv, minted.token);
    const row = await testEnv.DB
      .prepare('SELECT token_hash, account_id, sandbox_run_id FROM account_dispatch_tokens WHERE token_hash = ?')
      .bind(minted.tokenHash)
      .first();

    expect(minted.accountId).toBe(account.accountId);
    expect(minted.sandboxRunId).toBeNull();
    expect(row).toEqual({
      token_hash: minted.tokenHash,
      account_id: account.accountId,
      sandbox_run_id: null,
    });
    expect(JSON.stringify(row)).not.toContain(minted.token);
    expect(resolved).toEqual({ accountId: account.accountId });
  });

  it('returns created_at as an ISO-8601 UTC string', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const minted = await mintDispatchToken(testEnv, account.accountId);
    expect(typeof minted.createdAt).toBe('string');
    expect(Number.isNaN(Date.parse(minted.createdAt))).toBe(false);
  });

  it('returns null for mutated plaintext', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const minted = await mintDispatchToken(testEnv, account.accountId);

    await expect(resolveDispatchToken(testEnv, `${minted.token}x`)).resolves.toBeNull();
  });

  it('returns null for revoked token rows', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const minted = await mintDispatchToken(testEnv, account.accountId);
    const tokenHash = await hashWithPepper(minted.token, testEnv, 'DISPATCH_TOKEN_PEPPER');
    await testEnv.DB
      .prepare('UPDATE account_dispatch_tokens SET revoked_at = ? WHERE token_hash = ?')
      .bind(2_000, tokenHash)
      .run();

    await expect(resolveDispatchToken(testEnv, minted.token)).resolves.toBeNull();
  });

  it('keeps prior dispatch tokens valid when minting again', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const first = await mintDispatchToken(testEnv, account.accountId);
    const second = await mintDispatchToken(testEnv, account.accountId);

    await expect(resolveDispatchToken(testEnv, first.token)).resolves.toEqual({ accountId: account.accountId });
    await expect(resolveDispatchToken(testEnv, second.token)).resolves.toEqual({ accountId: account.accountId });
  });

  it("does not resolve account B from account A's token", async () => {
    const testEnv = makeTestEnv();
    const accountA = await seedAccount({ email: 'a@example.com', testEnv });
    const accountB = await seedAccount({ email: 'b@example.com', testEnv });
    const mintedA = await mintDispatchToken(testEnv, accountA.accountId);
    const mintedB = await mintDispatchToken(testEnv, accountB.accountId);

    await expect(resolveDispatchToken(testEnv, mintedA.token)).resolves.toEqual({ accountId: accountA.accountId });
    await expect(resolveDispatchToken(testEnv, mintedB.token)).resolves.toEqual({ accountId: accountB.accountId });
  });

  it('uses DISPATCH_TOKEN_PEPPER not HMAC_PEPPER', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const minted = await mintDispatchToken(testEnv, account.accountId);
    const changedEnv = { ...testEnv, DISPATCH_TOKEN_PEPPER: 'different-dispatch-token-pepper' };

    await expect(resolveDispatchToken(changedEnv, minted.token)).resolves.toBeNull();
  });

  it('resolves a run-owned token only while its exact lease is active', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS);
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedSandboxRun({
      runId: RUN_ID,
      accountId: account.accountId,
      instanceId: INSTANCE_ID,
      createdAt: NOW_MS - 1_000,
    });
    const minted = await mintDispatchToken(testEnv, account.accountId, RUN_ID);

    await expect(resolveDispatchToken(testEnv, minted.token)).resolves.toEqual({ accountId: account.accountId });
  });

  it.each([
    ['missing', null],
    ['account-mismatched', { accountMismatch: true }],
    ['non-active', { status: 'provisioning', provisioningPhase: 'created' }],
    ['boundary-expired', { createdAt: NOW_MS - 3_600_000, leaseExpiresAt: NOW_MS }],
  ])('fails closed for a %s run-owned token lease', async (_label, run) => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS);
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const minted = await mintDispatchToken(testEnv, account.accountId, RUN_ID);

    if (run) {
      let runAccountId = account.accountId;
      if (run.accountMismatch) {
        const otherAccount = await seedAccount({ email: 'dispatch-run-other@example.com', testEnv });
        runAccountId = otherAccount.accountId;
      }
      const { accountMismatch: _accountMismatch, ...overrides } = run;
      await seedSandboxRun({
        runId: RUN_ID,
        accountId: runAccountId,
        instanceId: INSTANCE_ID,
        createdAt: NOW_MS - 1_000,
        ...overrides,
      });
    }

    await expect(resolveDispatchToken(testEnv, minted.token)).resolves.toBeNull();
  });
});
