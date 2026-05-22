import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0006_devices.sql?raw';
import { resetDb } from './helpers.js';

const BUNDLE_ID = 'app.solstone.swift';

describe('migration 0006 devices', () => {
  beforeEach(async () => {
    await resetDb();
    await workerEnv.DB.prepare('DROP TABLE IF EXISTS account_dispatch_tokens').run();
    await workerEnv.DB.prepare('DROP TABLE IF EXISTS account_devices').run();
  });

  it('applies device tables migration to an existing schema', async () => {
    await applyMigration();
    await seedAccount('migration-account');
    await insertDevice({ deviceId: 'device-1', accountId: 'migration-account' });
    await workerEnv.DB
      .prepare('INSERT INTO account_dispatch_tokens (token_hash, account_id, created_at) VALUES (?, ?, ?)')
      .bind('token-hash', 'migration-account', 1_000)
      .run();

    const device = await workerEnv.DB
      .prepare('SELECT device_id FROM account_devices WHERE device_id = ?')
      .bind('device-1')
      .first();
    const token = await workerEnv.DB
      .prepare('SELECT account_id FROM account_dispatch_tokens WHERE token_hash = ?')
      .bind('token-hash')
      .first();

    expect(device).toEqual({ device_id: 'device-1' });
    expect(token).toEqual({ account_id: 'migration-account' });
  });

  it('enforces one active device per push token bundle and env', async () => {
    await applyMigration();
    await seedAccount('account-a');
    await seedAccount('account-b');
    await insertDevice({ deviceId: 'device-a', accountId: 'account-a' });

    await expect(insertDevice({ deviceId: 'device-b', accountId: 'account-b' })).rejects.toThrow();
  });

  it('allows duplicate push token tuple after prior row is revoked', async () => {
    await applyMigration();
    await seedAccount('account-a');
    await seedAccount('account-b');
    await insertDevice({ deviceId: 'device-a', accountId: 'account-a' });
    await workerEnv.DB
      .prepare('UPDATE account_devices SET revoked_at = ? WHERE device_id = ?')
      .bind(2_000, 'device-a')
      .run();

    await expect(insertDevice({ deviceId: 'device-b', accountId: 'account-b' })).resolves.toBeUndefined();
  });

  it('rejects unknown platform via CHECK constraint', async () => {
    await applyMigration();
    await seedAccount('account-a');

    await expect(insertDevice({
      deviceId: 'device-a',
      accountId: 'account-a',
      platform: 'windows',
    })).rejects.toThrow();
  });

  it('rejects unknown push_token_env via CHECK constraint', async () => {
    await applyMigration();
    await seedAccount('account-a');

    await expect(insertDevice({
      deviceId: 'device-a',
      accountId: 'account-a',
      pushTokenEnv: 'staging',
    })).rejects.toThrow();
  });
});

async function applyMigration() {
  const executableMigration = migration
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  for (const statement of executableMigration.split(';').map((part) => part.trim()).filter(Boolean)) {
    await workerEnv.DB.prepare(statement).run();
  }
}

async function seedAccount(accountId) {
  await workerEnv.DB
    .prepare('INSERT INTO accounts (id, primary_email_id, passkey_user_handle, created_at, last_signin_at) VALUES (?, NULL, NULL, ?, ?)')
    .bind(accountId, 1_000, 1_000)
    .run();
}

async function insertDevice({
  deviceId,
  accountId,
  platform = 'ios',
  pushToken = 'push-token',
  pushTokenEnv = 'production',
}) {
  await workerEnv.DB
    .prepare(
      `INSERT INTO account_devices (
        device_id, account_id, platform, push_token, push_token_env, bundle_id,
        registered_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(deviceId, accountId, platform, pushToken, pushTokenEnv, BUNDLE_ID, 1_000, 1_000)
    .run();
}
