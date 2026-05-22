import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { makeTestEnv, resetDb, seedAccount, seedDevice, seedSession } from './helpers.js';

const BUNDLE_ID = 'app.solstone.swift';

describe('device listing', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns only caller's active devices", async () => {
    const testEnv = makeTestEnv();
    const accountA = await seedAccount({ email: 'a@example.com', testEnv });
    const accountB = await seedAccount({ email: 'b@example.com', testEnv });
    const sessionA = await seedSession(accountA.accountId, { testEnv });
    await seedDevice({ accountId: accountA.accountId, deviceId: 'device-a', bundleId: BUNDLE_ID });
    await seedDevice({ accountId: accountB.accountId, deviceId: 'device-b', bundleId: BUNDLE_ID });

    const response = await worker.fetch(listRequest(sessionA.cookie), testEnv);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.devices.map((row) => row.device_id)).toEqual(['device-a']);
  });

  it('omits revoked devices', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedDevice({ accountId: account.accountId, deviceId: 'active-device', bundleId: BUNDLE_ID });
    await seedDevice({
      accountId: account.accountId,
      deviceId: 'revoked-device',
      bundleId: BUNDLE_ID,
      revokedAt: 2_000,
    });

    const response = await worker.fetch(listRequest(session.cookie), testEnv);
    const body = await response.json();

    expect(body.devices.map((row) => row.device_id)).toEqual(['active-device']);
  });

  it('does not include push_token in response bodies', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedDevice({
      accountId: account.accountId,
      deviceId: 'active-device',
      pushToken: 'secret-push-token',
      bundleId: BUNDLE_ID,
    });

    const response = await worker.fetch(listRequest(session.cookie), testEnv);
    const bodyText = await response.text();
    const body = JSON.parse(bodyText);

    expect(Object.keys(body.devices[0])).not.toContain('push_token');
    expect(bodyText).not.toContain('secret-push-token');
  });
});

function listRequest(cookie) {
  return new Request('https://account.solstone.app/account/devices', {
    headers: { Cookie: cookie },
  });
}
