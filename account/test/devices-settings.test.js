import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { makeTestEnv, resetDb, seedAccount, seedDevice, seedSession } from './helpers.js';

const BUNDLE_ID = 'app.solstone.swift';

describe('settings devices', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('renders settings devices with no-store headers', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedDevice({ accountId: account.accountId, deviceId: 'device-a', bundleId: BUNDLE_ID });

    const response = await worker.fetch(settingsRequest('/devices', session.cookie), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toContain('your devices');
    expect(body).toContain('app.solstone.swift');
    expect(body).toContain('action="/devices/device-a/revoke"');
  });

  it('revokes one device from settings', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const device = await seedDevice({ accountId: account.accountId, bundleId: BUNDLE_ID });

    const response = await worker.fetch(settingsPost(`/devices/${device.deviceId}/revoke`, session.cookie), testEnv);
    const row = await deviceRow(device.deviceId);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/devices');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(row.revoked_at).toBeGreaterThan(0);
  });

  it('revokes all devices from settings', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedDevice({ accountId: account.accountId, deviceId: 'device-a', bundleId: BUNDLE_ID });
    await seedDevice({ accountId: account.accountId, deviceId: 'device-b', bundleId: BUNDLE_ID });

    const response = await worker.fetch(settingsPost('/devices/revoke-all', session.cookie), testEnv);
    const count = await activeDeviceCount(account.accountId);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/devices');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(count).toBe(0);
  });

  it('escapes device labels in settings HTML', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedDevice({
      accountId: account.accountId,
      bundleId: BUNDLE_ID,
      deviceLabel: '<script>alert(1)</script>',
    });

    const response = await worker.fetch(settingsRequest('/devices', session.cookie), testEnv);
    const body = await response.text();

    expect(body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(body).not.toContain('<script>alert(1)</script>');
  });

  it('shows device count on services dashboard', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedDevice({ accountId: account.accountId, bundleId: BUNDLE_ID });

    const response = await worker.fetch(settingsRequest('/', session.cookie), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('href="/devices"');
    expect(body).toContain('1 device');
  });
});

function settingsRequest(path, cookie) {
  return new Request(`https://services.solstone.app${path}`, {
    headers: { Cookie: cookie },
  });
}

function settingsPost(path, cookie) {
  return new Request(`https://services.solstone.app${path}`, {
    method: 'POST',
    headers: {
      Origin: 'https://services.solstone.app',
      Cookie: cookie,
    },
    body: '',
  });
}

async function deviceRow(deviceId) {
  return workerEnv.DB
    .prepare('SELECT revoked_at FROM account_devices WHERE device_id = ?')
    .bind(deviceId)
    .first();
}

async function activeDeviceCount(accountId) {
  const row = await workerEnv.DB
    .prepare('SELECT COUNT(*) AS count FROM account_devices WHERE account_id = ? AND revoked_at IS NULL')
    .bind(accountId)
    .first();
  return row.count;
}
