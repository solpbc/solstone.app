import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { findRetiredSpbToken, rotateSpbBindingToken } from '../src/db.js';
import { resetDb, rowCount, seedAccount, seedSpbBinding } from './helpers.js';

const INSTANCE_ID = '11111111-1111-1111-1111-111111111111';

describe('SPB retired tokens', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('retires a non-null binding token atomically with rotation', async () => {
    const account = await seedBinding('hash-1');

    await expect(rotateSpbBindingToken(workerEnv.DB, {
      accountId: account.accountId,
      instanceId: INSTANCE_ID,
      tokenHash: 'hash-2',
      nowMs: 2_000,
    })).resolves.toBe(true);

    await expect(bindingTokenHash(account.accountId)).resolves.toBe('hash-2');
    expect(await rowCount('spb_retired_tokens')).toBe(1);
    await expect(retiredToken('hash-1')).resolves.toEqual({
      token_hash: 'hash-1',
      account_id: account.accountId,
      instance_id: INSTANCE_ID,
      retired_at: 2_000,
    });
  });

  it('does not retire a null binding token', async () => {
    const account = await seedBinding(null);

    await expect(rotateSpbBindingToken(workerEnv.DB, {
      accountId: account.accountId,
      instanceId: INSTANCE_ID,
      tokenHash: 'hash-2',
      nowMs: 2_000,
    })).resolves.toBe(true);

    await expect(bindingTokenHash(account.accountId)).resolves.toBe('hash-2');
    expect(await rowCount('spb_retired_tokens')).toBe(0);
  });

  it('does not create retired tokens when the binding is absent', async () => {
    await expect(rotateSpbBindingToken(workerEnv.DB, {
      accountId: 'missing-account',
      instanceId: INSTANCE_ID,
      tokenHash: 'hash-2',
      nowMs: 2_000,
    })).resolves.toBe(false);

    expect(await rowCount('spb_retired_tokens')).toBe(0);
  });

  it('retains each prior token across sequential rotations', async () => {
    const account = await seedBinding('hash-1');

    await expect(rotateSpbBindingToken(workerEnv.DB, {
      accountId: account.accountId,
      instanceId: INSTANCE_ID,
      tokenHash: 'hash-2',
      nowMs: 2_000,
    })).resolves.toBe(true);
    await expect(rotateSpbBindingToken(workerEnv.DB, {
      accountId: account.accountId,
      instanceId: INSTANCE_ID,
      tokenHash: 'hash-3',
      nowMs: 3_000,
    })).resolves.toBe(true);

    await expect(bindingTokenHash(account.accountId)).resolves.toBe('hash-3');
    await expect(retiredToken('hash-1')).resolves.toEqual(expect.objectContaining({
      account_id: account.accountId,
      instance_id: INSTANCE_ID,
    }));
    await expect(retiredToken('hash-2')).resolves.toEqual(expect.objectContaining({
      account_id: account.accountId,
      instance_id: INSTANCE_ID,
    }));
  });

  it('finds retired tokens and returns null when absent', async () => {
    const account = await seedBinding('hash-1');
    await rotateSpbBindingToken(workerEnv.DB, {
      accountId: account.accountId,
      instanceId: INSTANCE_ID,
      tokenHash: 'hash-2',
      nowMs: 2_000,
    });

    await expect(findRetiredSpbToken(workerEnv.DB, 'hash-1')).resolves.toEqual({
      account_id: account.accountId,
      instance_id: INSTANCE_ID,
    });
    await expect(findRetiredSpbToken(workerEnv.DB, 'missing-hash')).resolves.toBeNull();
  });
});

async function seedBinding(tokenHash) {
  const account = await seedAccount();
  await seedSpbBinding({
    accountId: account.accountId,
    instanceId: INSTANCE_ID,
    tokenHash,
  });
  return account;
}

async function bindingTokenHash(accountId) {
  const row = await workerEnv.DB
    .prepare('SELECT token_hash FROM spb_bindings WHERE account_id = ? AND instance_id = ?')
    .bind(accountId, INSTANCE_ID)
    .first();
  return row?.token_hash || null;
}

async function retiredToken(tokenHash) {
  return workerEnv.DB
    .prepare('SELECT token_hash, account_id, instance_id, retired_at FROM spb_retired_tokens WHERE token_hash = ?')
    .bind(tokenHash)
    .first();
}
