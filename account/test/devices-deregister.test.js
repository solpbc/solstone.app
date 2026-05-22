import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { makeTestEnv, resetDb, seedAccount, seedDevice, seedSession } from './helpers.js';

const BUNDLE_ID = 'app.solstone.swift';

describe('device deregistration', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('revokes a caller-owned device', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const device = await seedDevice({ accountId: account.accountId, bundleId: BUNDLE_ID });

    const response = await worker.fetch(deregisterRequest(session.cookie, device.deviceId), testEnv);
    const row = await deviceRow(device.deviceId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(row.revoked_at).toBeGreaterThan(0);
  });

  it('is idempotent for an already-revoked caller-owned device', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const device = await seedDevice({
      accountId: account.accountId,
      bundleId: BUNDLE_ID,
      revokedAt: 1_000,
    });

    const response = await worker.fetch(deregisterRequest(session.cookie, device.deviceId), testEnv);
    const row = await deviceRow(device.deviceId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(row.revoked_at).toBe(1_000);
  });

  it('returns identical forbidden responses for unknown and wrong-owner device ids', async () => {
    const testEnv = makeTestEnv();
    const accountA = await seedAccount({ email: 'a@example.com', testEnv });
    const accountB = await seedAccount({ email: 'b@example.com', testEnv });
    const sessionA = await seedSession(accountA.accountId, { testEnv });
    const deviceB = await seedDevice({ accountId: accountB.accountId, bundleId: BUNDLE_ID });

    const unknown = await worker.fetch(deregisterRequest(sessionA.cookie, 'missing-device'), testEnv);
    const wrongOwner = await worker.fetch(deregisterRequest(sessionA.cookie, deviceB.deviceId), testEnv);
    const wrongOwnerRow = await deviceRow(deviceB.deviceId);

    expect(unknown.status).toBe(403);
    expect(wrongOwner.status).toBe(403);
    expect(await unknown.text()).toBe(await wrongOwner.text());
    expect(wrongOwnerRow.revoked_at).toBeNull();
  });
});

function deregisterRequest(cookie, deviceId) {
  return new Request('https://account.solstone.app/account/devices/deregister', {
    method: 'POST',
    headers: {
      Origin: 'https://account.solstone.app',
      Cookie: cookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ device_id: deviceId }),
  });
}

async function deviceRow(deviceId) {
  return workerEnv.DB
    .prepare('SELECT revoked_at FROM account_devices WHERE device_id = ?')
    .bind(deviceId)
    .first();
}
