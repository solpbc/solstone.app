import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import migration0001 from '../migrations/0001_initial.sql?raw';
import migration0002 from '../migrations/0002_otp_swap.sql?raw';
import migration0003 from '../migrations/0003_passkeys.sql?raw';
import migration0004 from '../migrations/0004_session_metadata.sql?raw';
import migration0005 from '../migrations/0005_email_verification.sql?raw';
import migration0006 from '../migrations/0006_devices.sql?raw';
import migration0007 from '../migrations/0007_oauth_provisioning.sql?raw';
import migration0008 from '../migrations/0008_device_codes.sql?raw';
import { installConsoleSpy } from './helpers.js';

describe('migration 0008 device codes and Gemini reveal acks', () => {
  let spy;

  beforeEach(async () => {
    spy = installConsoleSpy();
    await resetFreshDb();
  });

  afterEach(() => {
    spy.assertNoSecrets(['device-hash-a', 'device-hash-b', 'device-hash-c']);
    spy.restore();
  });

  it('creates device code and Gemini reveal ack tables from full migration chain', async () => {
    await applyMigrations();

    await expect(tableExists('device_codes')).resolves.toBe(true);
    await expect(tableExists('gemini_reveal_acks')).resolves.toBe(true);
  });

  it('creates the filtered unique user_code index', async () => {
    await applyMigrations();

    const { results } = await workerEnv.DB.prepare("PRAGMA index_list('device_codes')").all();
    const index = (results || []).find((row) => row.name === 'idx_device_codes_active_user_code');

    expect(index).toMatchObject({
      name: 'idx_device_codes_active_user_code',
      unique: 1,
      partial: 1,
    });
  });

  it('enforces active user_code uniqueness and permits reuse after denied or consumed', async () => {
    await applyMigrations();
    await seedAccount('account-a');
    await insertDeviceCode({ hash: 'device-hash-a', userCode: 'ABCDEFGH' });

    await expect(insertDeviceCode({ hash: 'device-hash-b', userCode: 'ABCDEFGH' })).rejects.toThrow();

    await workerEnv.DB
      .prepare('UPDATE device_codes SET denied_at = ? WHERE device_code_hash = ?')
      .bind(2_000, 'device-hash-a')
      .run();
    await expect(insertDeviceCode({ hash: 'device-hash-b', userCode: 'ABCDEFGH' })).resolves.toBeUndefined();

    await workerEnv.DB
      .prepare('UPDATE device_codes SET account_id = ?, approved_at = ?, consumed_at = ? WHERE device_code_hash = ?')
      .bind('account-a', 3_000, 4_000, 'device-hash-b')
      .run();
    await expect(insertDeviceCode({ hash: 'device-hash-c', userCode: 'ABCDEFGH' })).resolves.toBeUndefined();
  });

  it('adds provisioned_keys.last_used_fetched_at', async () => {
    await applyMigrations();

    const { results } = await workerEnv.DB.prepare("PRAGMA table_info('provisioned_keys')").all();

    expect((results || []).some((row) => row.name === 'last_used_fetched_at')).toBe(true);
  });

  it('enforces device code lifecycle checks', async () => {
    await applyMigrations();
    await seedAccount('account-a');

    await expect(insertDeviceCode({
      hash: 'device-hash-a',
      userCode: 'ABCDEFGH',
      consumedAt: 2_000,
    })).rejects.toThrow();

    await expect(insertDeviceCode({
      hash: 'device-hash-b',
      userCode: 'ABCDEFGH',
      approvedAt: 1_500,
      consumedAt: 2_000,
      accountId: 'account-a',
    })).resolves.toBeUndefined();
  });
});

async function resetFreshDb() {
  for (const table of [
    'gemini_reveal_acks',
    'device_codes',
    'oauth_tokens',
    'oauth_codes',
    'provisioned_keys',
    'account_dispatch_tokens',
    'account_devices',
    'passkey_challenges',
    'passkey_credentials',
    'otp_tokens',
    'magic_link_nonces',
    'rate_buckets',
    'sessions',
    'account_emails',
    'accounts',
  ]) {
    await workerEnv.DB.prepare(`DROP TABLE IF EXISTS ${table}`).run();
  }
}

async function applyMigrations() {
  for (const migration of [
    migration0001,
    migration0002,
    migration0003,
    migration0004,
    migration0005,
    migration0006,
    migration0007,
    migration0008,
  ]) {
    const executable = migration
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    for (const statement of executable.split(';').map((part) => part.trim()).filter(Boolean)) {
      await workerEnv.DB.prepare(statement).run();
    }
  }
}

async function tableExists(name) {
  const row = await workerEnv.DB
    .prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(name)
    .first();
  return row?.found === 1;
}

async function seedAccount(accountId) {
  await workerEnv.DB
    .prepare('INSERT INTO accounts (id, primary_email_id, passkey_user_handle, created_at, last_signin_at) VALUES (?, NULL, NULL, ?, ?)')
    .bind(accountId, 1_000, 1_000)
    .run();
}

async function insertDeviceCode({
  hash,
  userCode,
  accountId = null,
  approvedAt = null,
  deniedAt = null,
  consumedAt = null,
} = {}) {
  await workerEnv.DB
    .prepare(
      `INSERT INTO device_codes (
         device_code_hash, user_code, account_id, client_id, scope,
         code_challenge, code_challenge_method, created_at, expires_at,
         approved_at, denied_at, consumed_at
       ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)`
    )
    .bind(
      hash,
      userCode,
      accountId,
      'solstone-cli',
      'solstone.gemini',
      1_000,
      901_000,
      approvedAt,
      deniedAt,
      consumedAt
    )
    .run();
}
