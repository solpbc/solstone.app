import { createExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { encryptEmail } from '../src/crypto.js';
import { computeDisplayName } from '../src/provisioning.js';
import { computeRotationDisplayName } from '../src/settings.js';
import {
  installConsoleSpy,
  installGcpFetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedSession,
} from './helpers.js';

describe('Gemini key rotation', () => {
  let spy;
  let secrets;

  beforeEach(async () => {
    await resetDb();
    spy = installConsoleSpy();
    secrets = [];
  });

  afterEach(() => {
    spy.assertNoSecrets(secrets);
    spy.restore();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('dashboard rotate redirects on success', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedProvisionedKey({ testEnv, accountId: account.accountId, keyString: 'old-dashboard-key' });
    installRotationMock(['new-dashboard-key']);
    installImmediateTimeout();
    const ctx = createExecutionContext();
    const waitSpy = vi.spyOn(ctx, 'waitUntil');
    secrets.push('old-dashboard-key', 'new-dashboard-key');

    const response = await worker.fetch(settingsRotateRequest(session.cookie), testEnv, ctx);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/services/scout?rotated=ok');
    await waitSpy.mock.calls[0][0];
  });

  it('cleans up the just-created key when a concurrent rotation loses the active-key batch', async () => {
    const baseEnv = makeTestEnv();
    const account = await seedAccount({ testEnv: baseEnv });
    const session = await seedSession(account.accountId, { testEnv: baseEnv });
    await seedProvisionedKey({ testEnv: baseEnv, accountId: account.accountId, keyString: 'old-conflict-key' });
    const gcp = installRotationMock(['winner-key', 'loser-key']);
    installImmediateTimeout();
    let batchCalls = 0;
    const testEnv = {
      ...baseEnv,
      DB: {
        prepare(sql) {
          return baseEnv.DB.prepare(sql);
        },
        batch(statements) {
          batchCalls += 1;
          if (batchCalls === 2) return Promise.resolve([{ results: [] }, { results: [] }]);
          return baseEnv.DB.batch(statements);
        },
      },
    };
    secrets.push('old-conflict-key', 'winner-key', 'loser-key');

    const firstCtx = createExecutionContext();
    const secondCtx = createExecutionContext();
    const firstWait = vi.spyOn(firstCtx, 'waitUntil');
    const secondWait = vi.spyOn(secondCtx, 'waitUntil');
    const first = await worker.fetch(settingsRotateRequest(session.cookie), testEnv, firstCtx);
    const second = await worker.fetch(settingsRotateRequest(session.cookie), testEnv, secondCtx);

    expect(first.status).toBe(303);
    expect(first.headers.get('Location')).toBe('/services/scout?rotated=ok');
    expect(second.status).toBe(303);
    expect(second.headers.get('Location')).toBe('/services/scout?rotated=conflict');
    expect(gcp.created).toEqual([
      'projects/test-gcp-project/locations/global/keys/new-1',
      'projects/test-gcp-project/locations/global/keys/new-2',
    ]);
    expect(gcp.deleted).toContain('projects/test-gcp-project/locations/global/keys/new-2');
    expect(gcp.deleted).not.toContain('projects/test-gcp-project/locations/global/keys/new-1');
    expect(firstWait).toHaveBeenCalledTimes(1);
    expect(secondWait).not.toHaveBeenCalled();

    await firstWait.mock.calls[0][0];
    expect(gcp.deleted).toContain('projects/test-gcp-project/locations/global/keys/old');
  });

  it('returns rotation_failed for non-conflict DB errors and cleans up the orphan key', async () => {
    const baseEnv = makeTestEnv();
    const account = await seedAccount({ testEnv: baseEnv });
    const session = await seedSession(account.accountId, { testEnv: baseEnv });
    await seedProvisionedKey({ testEnv: baseEnv, accountId: account.accountId, keyString: 'old-sql-error-key' });
    const gcp = installRotationMock(['new-sql-error-key']);
    const testEnv = {
      ...baseEnv,
      DB: {
        prepare(sql) {
          return baseEnv.DB.prepare(sql);
        },
        batch() {
          throw new Error('SQLITE_BUSY: unrelated database error');
        },
      },
    };
    const ctx = createExecutionContext();
    const waitSpy = vi.spyOn(ctx, 'waitUntil');
    secrets.push('old-sql-error-key', 'new-sql-error-key');

    const response = await worker.fetch(settingsRotateRequest(session.cookie), testEnv, ctx);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/services/scout?rotated=rotation_failed');
    expect(gcp.deleted).toContain('projects/test-gcp-project/locations/global/keys/new-1');
    expect(waitSpy).not.toHaveBeenCalled();
  });

  it('tolerates 404 while deleting the old key after the grace window', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedProvisionedKey({ testEnv, accountId: account.accountId, keyString: 'old-404-key' });
    installRotationMock(['new-404-key'], { oldDeleteStatus: 404 });
    installImmediateTimeout();
    const ctx = createExecutionContext();
    const waitSpy = vi.spyOn(ctx, 'waitUntil');
    secrets.push('old-404-key', 'new-404-key');

    const response = await worker.fetch(settingsRotateRequest(session.cookie), testEnv, ctx);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/services/scout?rotated=ok');
    await expect(waitSpy.mock.calls[0][0]).resolves.toBeUndefined();
  });

  it('returns no_active_key for accounts without an active key', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(settingsRotateRequest(session.cookie), testEnv, createExecutionContext());

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/services/scout?rotated=no_active_key');
  });

  it('builds UTC-safe rotation display names with a six-character suffix', () => {
    const accountId = 'display-name-account';
    const base = computeDisplayName(accountId);
    let fill = 0;
    vi.useFakeTimers();
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      array.fill(fill);
      fill += 1;
      return array;
    });

    vi.setSystemTime(new Date('2026-05-23T12:00:00.000Z'));
    const noon = computeRotationDisplayName(accountId);
    vi.setSystemTime(new Date('2026-05-23T23:59:59.000Z'));
    const late = computeRotationDisplayName(accountId);

    for (const displayName of [noon, late]) {
      expect(displayName).toMatch(/^acct-[a-z2-7]+-r-\d{8}-[a-z2-7]{6}$/);
      expect(displayName).toMatch(/^[a-z0-9-]{1,63}$/);
      expect(displayName.length).toBeLessThanOrEqual(63);
      expect(displayName.startsWith(`${base}-r-20260523-`)).toBe(true);
    }
    expect(noon).not.toBe(late);
  });
});

function settingsRotateRequest(cookie) {
  return new Request('https://services.solstone.app/services/scout/rotate', {
    method: 'POST',
    headers: {
      Origin: 'https://services.solstone.app',
      Cookie: cookie,
    },
  });
}

function installImmediateTimeout() {
  return vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, timeout) => {
    callback();
    return 1;
  });
}

async function seedProvisionedKey({
  testEnv,
  accountId,
  id = 'old-key',
  displayName = 'acct-old',
  keyResourceName = 'projects/test-gcp-project/locations/global/keys/old',
  keyString,
  createdAt = 1_000,
  revokedAt = null,
}) {
  await testEnv.DB
    .prepare(
      `INSERT INTO provisioned_keys (
         id, account_id, provider, display_name, key_resource_name,
         key_string_encrypted, created_at, revoked_at
       ) VALUES (?, ?, 'gemini', ?, ?, ?, ?, ?)`
    )
    .bind(id, accountId, displayName, keyResourceName, await encryptEmail(keyString, testEnv), createdAt, revokedAt)
    .run();
}

async function activeKeyResource(accountId) {
  const row = await makeTestEnv().DB
    .prepare("SELECT key_resource_name FROM provisioned_keys WHERE account_id = ? AND revoked_at IS NULL")
    .bind(accountId)
    .first();
  return row?.key_resource_name || null;
}

function installRotationMock(apiKeys, { oldDeleteStatus = 200 } = {}) {
  const state = { created: [], deleted: [], displayNames: [] };
  let createCount = 0;
  installGcpFetchMock({
    'POST oauth2.googleapis.com/token': async () => jsonResponse({
      access_token: 'gcp-access-token',
      expires_in: 3600,
      token_type: 'Bearer',
    }),
    'POST apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys': async ({ init }) => {
      createCount += 1;
      state.displayNames.push(JSON.parse(init.body).displayName);
      return jsonResponse({ name: `operations/create-${createCount}` });
    },
    'GET apikeys.googleapis.com/v2/operations/create-1': async () => {
      const keyName = 'projects/test-gcp-project/locations/global/keys/new-1';
      state.created.push(keyName);
      return jsonResponse({ done: true, response: { name: keyName } });
    },
    'GET apikeys.googleapis.com/v2/operations/create-2': async () => {
      const keyName = 'projects/test-gcp-project/locations/global/keys/new-2';
      state.created.push(keyName);
      return jsonResponse({ done: true, response: { name: keyName } });
    },
    'GET apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys/new-1/keyString': async () => jsonResponse({ keyString: apiKeys[0] }),
    'GET apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys/new-2/keyString': async () => jsonResponse({ keyString: apiKeys[1] }),
    'DELETE apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys/old': async () => {
      state.deleted.push('projects/test-gcp-project/locations/global/keys/old');
      return new Response(oldDeleteStatus === 200 ? '' : 'missing', { status: oldDeleteStatus });
    },
    'DELETE apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys/new-1': async () => {
      state.deleted.push('projects/test-gcp-project/locations/global/keys/new-1');
      return new Response('');
    },
    'DELETE apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys/new-2': async () => {
      state.deleted.push('projects/test-gcp-project/locations/global/keys/new-2');
      return new Response('');
    },
  });
  return state;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
