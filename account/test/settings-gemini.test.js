import { createExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { encryptEmail } from '../src/crypto.js';
import {
  installConsoleSpy,
  installGcpFetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedSession,
} from './helpers.js';

describe('settings gemini dashboard', () => {
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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('requires a session for GET /services/scout', async () => {
    const response = await worker.fetch(settingsGet('/services/scout'), makeTestEnv());

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/');
  });

  it('renders active key state without leaking plaintext and uses ack before reveal', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedProvisionedKey({
      testEnv,
      accountId: account.accountId,
      id: 'active-key',
      displayName: 'acct-active',
      keyString: 'plaintext-current-key',
    });
    installGcpListMock([{ name: 'projects/test-gcp-project/locations/global/keys/active', displayName: 'acct-active' }]);
    secrets.push('plaintext-current-key');

    const first = await worker.fetch(settingsGet('/services/scout', { cookie: session.cookie }), testEnv);
    const firstBody = await first.text();

    expect(first.status).toBe(200);
    expect(firstBody).not.toContain('plaintext-current-key');
    expect(firstBody).toContain('action="/services/scout/ack"');
    expect(firstBody).not.toContain('action="/services/scout/reveal"');

    const ack = await worker.fetch(settingsPost('/services/scout/ack', { cookie: session.cookie }), testEnv);
    expect(ack.status).toBe(303);
    expect(ack.headers.get('Location')).toBe('/services/scout?ack=ok');

    const second = await worker.fetch(settingsGet('/services/scout', { cookie: session.cookie }), testEnv);
    const secondBody = await second.text();

    expect(secondBody).toContain('action="/services/scout/reveal"');
  });

  it('treats same-millisecond reveal ack submits as idempotent', async () => {
    const now = 1_780_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    secrets.push(String(now));

    const first = await worker.fetch(settingsPost('/services/scout/ack', { cookie: session.cookie }), testEnv);
    const second = await worker.fetch(settingsPost('/services/scout/ack', { cookie: session.cookie }), testEnv);

    expect(first.status).toBe(303);
    expect(first.headers.get('Location')).toBe('/services/scout?ack=ok');
    expect(second.status).toBe(303);
    expect(second.headers.get('Location')).toBe('/services/scout?ack=ok');
    expect(await ackCount(testEnv, account.accountId)).toBe(1);
  });

  it('requires a fresh server-side ack before revealing plaintext', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedProvisionedKey({
      testEnv,
      accountId: account.accountId,
      id: 'active-key',
      keyString: 'plaintext-reveal-key',
    });
    await testEnv.DB
      .prepare('INSERT INTO gemini_reveal_acks (account_id, acked_at) VALUES (?, ?)')
      .bind(account.accountId, Date.now())
      .run();
    await testEnv.DB.prepare('DELETE FROM gemini_reveal_acks WHERE account_id = ?').bind(account.accountId).run();
    secrets.push('plaintext-reveal-key');

    const response = await worker.fetch(settingsPost('/services/scout/reveal', { cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/services/scout?reveal=ack_required');
    expect(body).not.toContain('plaintext-reveal-key');
  });

  it('renders plaintext only on reveal after a fresh ack', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedProvisionedKey({
      testEnv,
      accountId: account.accountId,
      id: 'active-key',
      keyString: 'plaintext-visible-key',
    });
    await testEnv.DB
      .prepare('INSERT INTO gemini_reveal_acks (account_id, acked_at) VALUES (?, ?)')
      .bind(account.accountId, Date.now())
      .run();
    secrets.push('plaintext-visible-key');

    const response = await worker.fetch(settingsPost('/services/scout/reveal', { cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('plaintext-visible-key');
  });

  it('expires reveal acknowledgements after 24 hours', async () => {
    const now = 1_780_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedProvisionedKey({
      testEnv,
      accountId: account.accountId,
      id: 'active-key',
      keyString: 'plaintext-expiring-key',
    });
    secrets.push('plaintext-expiring-key', String(now), String(now + 24 * 60 * 60 * 1000 + 1));

    const ack = await worker.fetch(settingsPost('/services/scout/ack', { cookie: session.cookie }), testEnv);
    expect(ack.status).toBe(303);

    vi.mocked(Date.now).mockReturnValue(now + 24 * 60 * 60 * 1000 + 1);
    const response = await worker.fetch(settingsPost('/services/scout/reveal', { cookie: session.cookie }), testEnv);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/services/scout?reveal=ack_required');
  });

  it('rotates from the dashboard and redirects to the success flash', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedProvisionedKey({
      testEnv,
      accountId: account.accountId,
      id: 'active-key',
      keyResourceName: 'projects/test-gcp-project/locations/global/keys/old-dashboard',
      keyString: 'plaintext-old-dashboard',
    });
    installRotationMock(['plaintext-new-dashboard'], { oldKeyName: 'projects/test-gcp-project/locations/global/keys/old-dashboard' });
    installImmediateTimeout();
    const ctx = createExecutionContext();
    const waitSpy = vi.spyOn(ctx, 'waitUntil');
    secrets.push('plaintext-old-dashboard', 'plaintext-new-dashboard');

    const response = await worker.fetch(settingsPost('/services/scout/rotate', { cookie: session.cookie }), testEnv, ctx);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/services/scout?rotated=ok');
    await waitSpy.mock.calls[0][0];
  });

  it('forgets revoked rows but refuses to delete the active row', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedProvisionedKey({
      testEnv,
      accountId: account.accountId,
      id: 'active-key',
      displayName: 'acct-active',
      keyString: 'plaintext-active-key',
    });
    await seedProvisionedKey({
      testEnv,
      accountId: account.accountId,
      id: 'revoked-key',
      displayName: 'acct-revoked',
      keyString: 'plaintext-revoked-key',
      keyResourceName: 'projects/test-gcp-project/locations/global/keys/revoked',
      revokedAt: 2_000,
    });
    installGcpListMock([{ name: 'projects/test-gcp-project/locations/global/keys/active', displayName: 'acct-active' }]);
    secrets.push('plaintext-active-key', 'plaintext-revoked-key');

    const forget = await worker.fetch(settingsPost('/services/scout/forget', {
      cookie: session.cookie,
      body: { key_id: 'revoked-key' },
    }), testEnv);
    expect(forget.status).toBe(303);
    expect(await keyExists(testEnv, 'revoked-key')).toBe(false);

    const page = await worker.fetch(settingsGet('/services/scout', { cookie: session.cookie }), testEnv);
    expect(await page.text()).not.toContain('acct-revoked');

    const activeDelete = await worker.fetch(settingsPost('/services/scout/forget', {
      cookie: session.cookie,
      body: { key_id: 'active-key' },
    }), testEnv);
    expect(activeDelete.status).toBe(400);
    expect(await keyExists(testEnv, 'active-key')).toBe(true);
  });

  it('isolates gemini settings operations to the signed-in account', async () => {
    const testEnv = makeTestEnv();
    const accountA = await seedAccount({ email: 'a@example.com', testEnv });
    const accountB = await seedAccount({ email: 'b@example.com', testEnv });
    const sessionB = await seedSession(accountB.accountId, { testEnv });
    await seedProvisionedKey({
      testEnv,
      accountId: accountA.accountId,
      id: 'a-active',
      displayName: 'acct-a-active',
      keyResourceName: 'projects/test-gcp-project/locations/global/keys/a-old',
      keyString: 'plaintext-a-key',
    });
    await seedProvisionedKey({
      testEnv,
      accountId: accountA.accountId,
      id: 'a-revoked',
      displayName: 'acct-a-revoked',
      keyResourceName: 'projects/test-gcp-project/locations/global/keys/a-revoked',
      keyString: 'plaintext-a-revoked',
      revokedAt: 2_000,
    });
    await seedProvisionedKey({
      testEnv,
      accountId: accountB.accountId,
      id: 'b-active',
      displayName: 'acct-b-active',
      keyResourceName: 'projects/test-gcp-project/locations/global/keys/b-old',
      keyString: 'plaintext-b-key',
    });
    installGcpListMock([{ name: 'projects/test-gcp-project/locations/global/keys/b-old', displayName: 'acct-b-active' }]);
    secrets.push('plaintext-a-key', 'plaintext-a-revoked', 'plaintext-b-key', 'plaintext-b-new');

    const page = await worker.fetch(settingsGet('/services/scout', { cookie: sessionB.cookie }), testEnv);
    const body = await page.text();
    expect(body).toContain('acct-b-active');
    expect(body).not.toContain('acct-a-active');

    const ack = await worker.fetch(settingsPost('/services/scout/ack', { cookie: sessionB.cookie }), testEnv);
    expect(ack.status).toBe(303);
    expect(await ackCount(testEnv, accountA.accountId)).toBe(0);
    expect(await ackCount(testEnv, accountB.accountId)).toBe(1);

    const reveal = await worker.fetch(settingsPost('/services/scout/reveal', { cookie: sessionB.cookie }), testEnv);
    const revealBody = await reveal.text();
    expect(revealBody).toContain('plaintext-b-key');
    expect(revealBody).not.toContain('plaintext-a-key');

    const forgetA = await worker.fetch(settingsPost('/services/scout/forget', {
      cookie: sessionB.cookie,
      body: { key_id: 'a-revoked' },
    }), testEnv);
    expect(forgetA.status).toBe(400);
    expect(await keyExists(testEnv, 'a-revoked')).toBe(true);

    installRotationMock(['plaintext-b-new'], { oldKeyName: 'projects/test-gcp-project/locations/global/keys/b-old' });
    installImmediateTimeout();
    const ctx = createExecutionContext();
    const waitSpy = vi.spyOn(ctx, 'waitUntil');
    const rotate = await worker.fetch(settingsPost('/services/scout/rotate', { cookie: sessionB.cookie }), testEnv, ctx);
    expect(rotate.status).toBe(303);
    await waitSpy.mock.calls[0][0];
    expect(await activeKeyResource(testEnv, accountA.accountId)).toBe('projects/test-gcp-project/locations/global/keys/a-old');
    expect(await activeKeyResource(testEnv, accountB.accountId)).toBe('projects/test-gcp-project/locations/global/keys/new-1');
  });
});

function settingsGet(path, { cookie } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  return new Request(`https://services.solstone.app${path}`, { headers });
}

function settingsPost(path, { cookie, body = {} } = {}) {
  const headers = {
    Origin: 'https://services.solstone.app',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (cookie) headers.Cookie = cookie;
  return new Request(`https://services.solstone.app${path}`, {
    method: 'POST',
    headers,
    body: new URLSearchParams(body),
  });
}

async function seedProvisionedKey({
  testEnv,
  accountId,
  id = crypto.randomUUID(),
  displayName = 'acct-test',
  keyResourceName = 'projects/test-gcp-project/locations/global/keys/active',
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

function installGcpListMock(keys = []) {
  installGcpFetchMock({
    'POST oauth2.googleapis.com/token': async () => jsonResponse({
      access_token: 'gcp-access-token',
      expires_in: 3600,
      token_type: 'Bearer',
    }),
    'GET apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys': async () => jsonResponse({ keys }),
  });
}

function installRotationMock(apiKeys, { oldKeyName = 'projects/test-gcp-project/locations/global/keys/old' } = {}) {
  let createCount = 0;
  installGcpFetchMock({
    'POST oauth2.googleapis.com/token': async () => jsonResponse({
      access_token: 'gcp-access-token',
      expires_in: 3600,
      token_type: 'Bearer',
    }),
    'POST apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys': async () => {
      createCount += 1;
      return jsonResponse({ name: `operations/create-${createCount}` });
    },
    'GET apikeys.googleapis.com/v2/operations/create-1': async () => jsonResponse({
      done: true,
      response: { name: 'projects/test-gcp-project/locations/global/keys/new-1' },
    }),
    'GET apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys/new-1/keyString': async () => jsonResponse({
      keyString: apiKeys[0],
    }),
    [`DELETE apikeys.googleapis.com/v2/${oldKeyName}`]: async () => new Response(''),
  });
}

function installImmediateTimeout() {
  return vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback) => {
    callback();
    return 1;
  });
}

async function keyExists(testEnv, keyId) {
  const row = await testEnv.DB.prepare('SELECT id FROM provisioned_keys WHERE id = ?').bind(keyId).first();
  return row != null;
}

async function ackCount(testEnv, accountId) {
  const row = await testEnv.DB
    .prepare('SELECT COUNT(*) AS count FROM gemini_reveal_acks WHERE account_id = ?')
    .bind(accountId)
    .first();
  return row.count;
}

async function activeKeyResource(testEnv, accountId) {
  const row = await testEnv.DB
    .prepare("SELECT key_resource_name FROM provisioned_keys WHERE account_id = ? AND revoked_at IS NULL")
    .bind(accountId)
    .first();
  return row?.key_resource_name || null;
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
