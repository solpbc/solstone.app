import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { makeTestEnv, resetDb, seedAccount, seedDevice, seedSession } from './helpers.js';

describe('services disable endpoints', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('turns off push by revoking all active devices', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedDevice({ accountId: account.accountId, deviceId: 'device-a' });
    await seedDevice({ accountId: account.accountId, deviceId: 'device-b' });

    const response = await worker.fetch(servicePost('/push/disable', session.cookie), testEnv);
    const count = await activeDeviceCount(testEnv, account.accountId);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/devices?disable=ok');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(count).toBe(0);
  });

  it('rejects push disable from a bad origin', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(servicePost('/push/disable', session.cookie, {
      origin: 'https://evil.example',
    }), testEnv);

    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});

function servicePost(path, cookie, { origin = 'https://services.solstone.app' } = {}) {
  return new Request(`https://services.solstone.app${path}`, {
    method: 'POST',
    headers: {
      Origin: origin,
      Cookie: cookie,
    },
    body: '',
  });
}

async function activeDeviceCount(testEnv, accountId) {
  const row = await testEnv.DB
    .prepare('SELECT COUNT(*) AS count FROM account_devices WHERE account_id = ? AND revoked_at IS NULL')
    .bind(accountId)
    .first();
  return row.count;
}
