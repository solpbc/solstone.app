import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { listDispatchableDevicesForAccount } from '../src/db.js';
import { deviceRevoke } from '../src/devices.js';
import { makeTestEnv, resetDb, seedAccount, seedDevice } from './helpers.js';

const BUNDLE_ID = 'app.solstone.swift';

describe('device helpers', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('deviceRevoke is a no-op for unknown ids', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedDevice({ accountId: account.accountId, bundleId: BUNDLE_ID });

    await expect(deviceRevoke(testEnv, 'missing-device')).resolves.toBeUndefined();
    await expect(activeDeviceCount()).resolves.toBe(1);
  });

  it('deviceRevoke revokes an active device', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const device = await seedDevice({ accountId: account.accountId, bundleId: BUNDLE_ID });

    await deviceRevoke(testEnv, device.deviceId);
    const row = await deviceRow(device.deviceId);

    expect(row.revoked_at).toBeGreaterThan(0);
  });

  it('deviceRevoke is idempotent for already-revoked devices', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const device = await seedDevice({
      accountId: account.accountId,
      bundleId: BUNDLE_ID,
      revokedAt: 1_000,
    });

    await deviceRevoke(testEnv, device.deviceId);
    const row = await deviceRow(device.deviceId);

    expect(row.revoked_at).toBe(1_000);
  });

  it('listDispatchableDevicesForAccount includes push tokens and omits revoked devices', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedDevice({
      accountId: account.accountId,
      deviceId: 'active-device',
      pushToken: 'active-push-token',
      bundleId: BUNDLE_ID,
    });
    await seedDevice({
      accountId: account.accountId,
      deviceId: 'revoked-device',
      pushToken: 'revoked-push-token',
      bundleId: BUNDLE_ID,
      revokedAt: 1_000,
    });

    const rows = await listDispatchableDevicesForAccount(testEnv.DB, account.accountId);

    expect(rows).toEqual([
      {
        device_id: 'active-device',
        push_token: 'active-push-token',
        push_token_env: 'production',
      },
    ]);
  });
});

async function deviceRow(deviceId) {
  return workerEnv.DB
    .prepare('SELECT revoked_at FROM account_devices WHERE device_id = ?')
    .bind(deviceId)
    .first();
}

async function activeDeviceCount() {
  const row = await workerEnv.DB
    .prepare('SELECT COUNT(*) AS count FROM account_devices WHERE revoked_at IS NULL')
    .first();
  return row.count;
}
