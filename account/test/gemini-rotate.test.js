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
  seedOauthToken,
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

  it('rotates with Bearer auth and schedules old-key delete via waitUntil', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const oauth = await seedOauthToken({ accountId: account.accountId, testEnv });
    await seedProvisionedKey({ testEnv, accountId: account.accountId, keyString: 'old-gemini-key' });
    const gcp = installRotationMock(['new-gemini-key']);
    const timeoutSpy = installImmediateTimeout();
    const ctx = createExecutionContext();
    const waitSpy = vi.spyOn(ctx, 'waitUntil');
    secrets.push(oauth.accessToken, oauth.refreshToken, 'old-gemini-key', 'new-gemini-key');

    const response = await worker.fetch(rotateRequest({ bearer: oauth.accessToken }), testEnv, ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body).not.toHaveProperty('provisioned');
    expect(waitSpy).toHaveBeenCalledTimes(1);
    expect(await activeKeyResource(account.accountId)).toBe('projects/test-gcp-project/locations/global/keys/new-1');

    await waitSpy.mock.calls[0][0];
    expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);
    expect(gcp.deleted).toContain('projects/test-gcp-project/locations/global/keys/old');
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
    expect(response.headers.get('Location')).toBe('/settings/gemini?rotated=ok');
    await waitSpy.mock.calls[0][0];
  });

  it('Bearer skips origin guard while session rotation requires it', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const oauth = await seedOauthToken({ accountId: account.accountId, testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedProvisionedKey({ testEnv, accountId: account.accountId, keyString: 'old-origin-key' });
    installRotationMock(['new-origin-key']);
    installImmediateTimeout();
    secrets.push(oauth.accessToken, oauth.refreshToken, 'old-origin-key', 'new-origin-key');

    const bearer = await worker.fetch(rotateRequest({
      bearer: oauth.accessToken,
      origin: 'https://evil.example',
    }), testEnv, createExecutionContext());
    expect(bearer.status).toBe(200);

    const crossSite = await worker.fetch(new Request('https://account.solstone.app/settings/gemini/rotate', {
      method: 'POST',
      headers: { Cookie: session.cookie, Origin: 'https://evil.example' },
    }), testEnv, createExecutionContext());
    expect(crossSite.status).toBe(403);
  });

  it('rotates only the Bearer token account when another account also has a key', async () => {
    const testEnv = makeTestEnv();
    const accountA = await seedAccount({ email: 'a@example.com', testEnv });
    const accountB = await seedAccount({ email: 'b@example.com', testEnv });
    const oauthA = await seedOauthToken({ accountId: accountA.accountId, testEnv });
    await seedProvisionedKey({
      testEnv,
      accountId: accountA.accountId,
      id: 'a-old',
      keyString: 'a-old-gemini-key',
    });
    await seedProvisionedKey({
      testEnv,
      accountId: accountB.accountId,
      id: 'b-old',
      displayName: 'acct-b-old',
      keyResourceName: 'projects/test-gcp-project/locations/global/keys/b-old',
      keyString: 'b-old-gemini-key',
    });
    const gcp = installRotationMock(['a-new-gemini-key']);
    installImmediateTimeout();
    const ctx = createExecutionContext();
    const waitSpy = vi.spyOn(ctx, 'waitUntil');
    secrets.push(oauthA.accessToken, oauthA.refreshToken, 'a-old-gemini-key', 'a-new-gemini-key', 'b-old-gemini-key');

    const response = await worker.fetch(rotateRequest({ bearer: oauthA.accessToken }), testEnv, ctx);

    expect(response.status).toBe(200);
    await waitSpy.mock.calls[0][0];
    expect(await activeKeyResource(accountA.accountId)).toBe('projects/test-gcp-project/locations/global/keys/new-1');
    expect(await activeKeyResource(accountB.accountId)).toBe('projects/test-gcp-project/locations/global/keys/b-old');
    expect((await keyRow('a-old')).revoked_at).toBeGreaterThan(0);
    expect((await keyRow('b-old')).revoked_at).toBeNull();
    expect(gcp.displayNames).toHaveLength(1);
    expect(gcp.displayNames[0].startsWith(`${computeDisplayName(accountA.accountId)}-r-`)).toBe(true);
    expect(gcp.displayNames[0].startsWith(`${computeDisplayName(accountB.accountId)}-r-`)).toBe(false);
    expect(gcp.deleted).toContain('projects/test-gcp-project/locations/global/keys/old');
    expect(gcp.deleted).not.toContain('projects/test-gcp-project/locations/global/keys/b-old');
  });

  it('cleans up the just-created key when a concurrent rotation loses the active-key batch', async () => {
    const baseEnv = makeTestEnv();
    const account = await seedAccount({ testEnv: baseEnv });
    const oauth = await seedOauthToken({ accountId: account.accountId, testEnv: baseEnv });
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
    secrets.push(oauth.accessToken, oauth.refreshToken, 'old-conflict-key', 'winner-key', 'loser-key');

    const firstCtx = createExecutionContext();
    const secondCtx = createExecutionContext();
    const firstWait = vi.spyOn(firstCtx, 'waitUntil');
    const secondWait = vi.spyOn(secondCtx, 'waitUntil');
    const first = await worker.fetch(rotateRequest({ bearer: oauth.accessToken }), testEnv, firstCtx);
    const second = await worker.fetch(rotateRequest({ bearer: oauth.accessToken }), testEnv, secondCtx);

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: 'rotation_conflict' });
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
    const oauth = await seedOauthToken({ accountId: account.accountId, testEnv: baseEnv });
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
    secrets.push(oauth.accessToken, oauth.refreshToken, 'old-sql-error-key', 'new-sql-error-key');

    const response = await worker.fetch(rotateRequest({ bearer: oauth.accessToken }), testEnv, ctx);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'rotation_failed' });
    expect(gcp.deleted).toContain('projects/test-gcp-project/locations/global/keys/new-1');
    expect(waitSpy).not.toHaveBeenCalled();
  });

  it('tolerates 404 while deleting the old key after the grace window', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const oauth = await seedOauthToken({ accountId: account.accountId, testEnv });
    await seedProvisionedKey({ testEnv, accountId: account.accountId, keyString: 'old-404-key' });
    installRotationMock(['new-404-key'], { oldDeleteStatus: 404 });
    installImmediateTimeout();
    const ctx = createExecutionContext();
    const waitSpy = vi.spyOn(ctx, 'waitUntil');
    secrets.push(oauth.accessToken, oauth.refreshToken, 'old-404-key', 'new-404-key');

    const response = await worker.fetch(rotateRequest({ bearer: oauth.accessToken }), testEnv, ctx);

    expect(response.status).toBe(200);
    await expect(waitSpy.mock.calls[0][0]).resolves.toBeUndefined();
  });

  it('returns no_active_key for accounts without an active key', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const oauth = await seedOauthToken({ accountId: account.accountId, testEnv });
    secrets.push(oauth.accessToken, oauth.refreshToken);

    const response = await worker.fetch(rotateRequest({ bearer: oauth.accessToken }), testEnv, createExecutionContext());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'no_active_key' });
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

function rotateRequest({ bearer, origin = '' }) {
  const headers = { Authorization: `Bearer ${bearer}` };
  if (origin) headers.Origin = origin;
  return new Request('https://account.solstone.app/keys/gemini/rotate', {
    method: 'POST',
    headers,
  });
}

function settingsRotateRequest(cookie) {
  return new Request('https://account.solstone.app/settings/gemini/rotate', {
    method: 'POST',
    headers: {
      Origin: 'https://account.solstone.app',
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

async function keyRow(id) {
  return makeTestEnv().DB
    .prepare('SELECT id, revoked_at FROM provisioned_keys WHERE id = ?')
    .bind(id)
    .first();
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
