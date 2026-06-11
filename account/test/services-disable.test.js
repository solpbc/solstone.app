import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { encryptEmail } from '../src/crypto.js';
import { installGcpFetchMock, makeTestEnv, resetDb, seedAccount, seedDevice, seedSession } from './helpers.js';

describe('services disable endpoints', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('turns off scout by revoking the active key and scheduling GCP delete', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedProvisionedKey({
      testEnv,
      accountId: account.accountId,
      id: 'disable-key',
      keyResourceName: 'projects/test-gcp-project/locations/global/keys/disable-key',
      keyString: 'disable-scout-key',
    });
    const deleted = [];
    installGcpDeleteMock(deleted);
    installImmediateTimeout();
    const ctx = createExecutionContext();
    const waitSpy = vi.spyOn(ctx, 'waitUntil');

    const response = await worker.fetch(servicePost('/scout/disable', session.cookie), testEnv, ctx);
    await waitOnExecutionContext(ctx);
    const row = await provisionedKeyRow(testEnv, 'disable-key');

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/scout?disable=ok');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(row.revoked_at).toBeGreaterThan(0);
    expect(waitSpy).toHaveBeenCalledTimes(1);
    expect(deleted).toEqual(['projects/test-gcp-project/locations/global/keys/disable-key']);
  });

  it('redirects to the scout no-op flash when no active key exists', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(servicePost('/scout/disable', session.cookie), testEnv);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/scout?disable=none');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('rejects scout disable from a bad origin', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(servicePost('/scout/disable', session.cookie, {
      origin: 'https://evil.example',
    }), testEnv);

    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
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

async function seedProvisionedKey({
  testEnv,
  accountId,
  id,
  displayName = 'acct-disable',
  keyResourceName,
  keyString,
  createdAt = 1_000,
}) {
  await testEnv.DB
    .prepare(
      `INSERT INTO provisioned_keys (
         id, account_id, provider, display_name, key_resource_name,
         key_string_encrypted, created_at, revoked_at
       ) VALUES (?, ?, 'gemini', ?, ?, ?, ?, NULL)`
    )
    .bind(id, accountId, displayName, keyResourceName, await encryptEmail(keyString, testEnv), createdAt)
    .run();
}

async function provisionedKeyRow(testEnv, id) {
  return testEnv.DB
    .prepare('SELECT id, revoked_at FROM provisioned_keys WHERE id = ?')
    .bind(id)
    .first();
}

async function activeDeviceCount(testEnv, accountId) {
  const row = await testEnv.DB
    .prepare('SELECT COUNT(*) AS count FROM account_devices WHERE account_id = ? AND revoked_at IS NULL')
    .bind(accountId)
    .first();
  return row.count;
}

function installGcpDeleteMock(deleted) {
  installGcpFetchMock({
    'POST oauth2.googleapis.com/token': async () => jsonResponse({
      access_token: 'gcp-access-token',
      expires_in: 3600,
      token_type: 'Bearer',
    }),
    'DELETE apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys/disable-key': async () => {
      deleted.push('projects/test-gcp-project/locations/global/keys/disable-key');
      return new Response('');
    },
  });
}

function installImmediateTimeout() {
  return vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback) => {
    callback();
    return 1;
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
