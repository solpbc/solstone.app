import { beforeEach, describe, expect, it } from 'vitest';
import { hashWithPepper } from '../src/crypto.js';
import { mintDispatchToken, resolveDispatchToken } from '../src/devices.js';
import { makeTestEnv, resetDb, seedAccount } from './helpers.js';

describe('dispatch tokens', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('mints and resolves a dispatch token', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });

    const minted = await mintDispatchToken(testEnv, account.accountId);
    const resolved = await resolveDispatchToken(testEnv, minted.token);

    expect(minted.accountId).toBe(account.accountId);
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
});
