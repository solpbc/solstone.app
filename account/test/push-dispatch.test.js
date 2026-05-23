import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { hashWithPepper } from '../src/crypto.js';
import { mintDispatchToken } from '../src/devices.js';
import {
  apnsJwtCacheKey,
  buildSolChatRequestCollapseId,
  buildSolChatRequestPayload,
} from '../src/push.js';
import {
  installConsoleSpy,
  installGcpFetchMock,
  makeFakeKv,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedDevice,
  TEST_APNS_P8_PEM,
} from './helpers.js';

describe('push dispatch endpoint', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects missing bearer without APNs fetch', async () => {
    const { calls } = installGcpFetchMock({});

    const response = await worker.fetch(dispatchRequest({ token: null }), apnsEnv());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'invalid_token' });
    expect(calls).toHaveLength(0);
  });

  it('rejects malformed bearer without APNs fetch', async () => {
    const { calls } = installGcpFetchMock({});

    const response = await worker.fetch(dispatchRequest({ token: 'not-bearer', rawAuth: true }), apnsEnv());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'invalid_token' });
    expect(calls).toHaveLength(0);
  });

  it('rejects unknown bearer without APNs fetch', async () => {
    const { calls } = installGcpFetchMock({});

    const response = await worker.fetch(dispatchRequest({ token: 'unknown-token' }), apnsEnv());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'invalid_token' });
    expect(calls).toHaveLength(0);
  });

  it('rejects revoked bearer without APNs fetch', async () => {
    const testEnv = apnsEnv();
    const account = await seedAccount({ testEnv });
    const minted = await mintDispatchToken(testEnv, account.accountId);
    const tokenHash = await hashWithPepper(minted.token, testEnv, 'DISPATCH_TOKEN_PEPPER');
    await testEnv.DB
      .prepare('UPDATE account_dispatch_tokens SET revoked_at = ? WHERE token_hash = ?')
      .bind(Date.now(), tokenHash)
      .run();
    const { calls } = installGcpFetchMock({});

    const response = await worker.fetch(dispatchRequest({ token: minted.token }), testEnv);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'invalid_token' });
    expect(calls).toHaveLength(0);
  });

  it('rejects missing summary', async () => {
    await expectValidationError({ category: 'notice', request_id: 'req-1' });
  });

  it('rejects empty summary', async () => {
    await expectValidationError({ summary: '   ', category: 'notice', request_id: 'req-1' });
  });

  it('rejects summary over 80 bytes', async () => {
    await expectValidationError({ summary: `${'a'.repeat(79)}🙂`, category: 'notice', request_id: 'req-1' });
  });

  it('accepts summary exactly 80 bytes', async () => {
    const testEnv = apnsEnv();
    const { token, account } = await seedDispatchAccount(testEnv);
    await seedDeviceForAccount(testEnv, { accountId: account.accountId });
    installApnsOk();

    const response = await worker.fetch(dispatchRequest({
      token,
      body: { summary: 'a'.repeat(80), category: 'notice', request_id: 'req-1' },
    }), testEnv);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, sent: 1, failed: 0 });
  });

  it('rejects missing category', async () => {
    await expectValidationError({ summary: 'hello', request_id: 'req-1' });
  });

  it('rejects missing request_id', async () => {
    await expectValidationError({ summary: 'hello', category: 'notice' });
  });

  it("uses bearer account and ignores body account_id", async () => {
    const testEnv = apnsEnv();
    const accountA = await seedAccount({ email: 'a@example.com', testEnv });
    const accountB = await seedAccount({ email: 'b@example.com', testEnv });
    await seedDevice({ accountId: accountA.accountId, deviceId: 'device-a1', pushToken: 'push-a1' });
    await seedDevice({ accountId: accountA.accountId, deviceId: 'device-a2', pushToken: 'push-a2' });
    await seedDevice({ accountId: accountB.accountId, deviceId: 'device-b1', pushToken: 'push-b1' });
    const minted = await mintDispatchToken(testEnv, accountA.accountId);
    const { calls } = installApnsOk();

    const response = await worker.fetch(dispatchRequest({
      token: minted.token,
      body: { ...validDispatchBody(), account_id: accountB.accountId },
    }), testEnv);

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(calls.map(({ url }) => url.href).join('\n')).not.toContain('push-b1');
  });

  it('sends one alert push for a single active device', async () => {
    const testEnv = apnsEnv();
    const { token, account } = await seedDispatchAccount(testEnv);
    await seedDeviceForAccount(testEnv, { accountId: account.accountId });
    installApnsOk();

    const response = await worker.fetch(dispatchRequest({ token }), testEnv);

    expect(await response.json()).toEqual({ ok: true, sent: 1, failed: 0, revoked: 0, failures: [] });
  });

  it('fans out to multiple active devices before awaiting responses', async () => {
    const testEnv = apnsEnv();
    const { token, account } = await seedDispatchAccount(testEnv);
    await seedDeviceForAccount(testEnv, { accountId: account.accountId, deviceId: 'device-a', pushToken: 'push-a' });
    await seedDeviceForAccount(testEnv, { accountId: account.accountId, deviceId: 'device-b', pushToken: 'push-b' });
    await seedDeviceForAccount(testEnv, { accountId: account.accountId, deviceId: 'device-c', pushToken: 'push-c' });
    let started = 0;
    let release;
    const allStarted = new Promise((resolve) => {
      release = resolve;
    });
    const gate = new Promise((resolve) => {
      installGcpFetchMock({
        'POST api.push.apple.com': async () => {
          started += 1;
          if (started === 3) release();
          await new Promise((done) => setTimeout(done, 1));
          resolve();
          return new Response('{}', { status: 200 });
        },
      });
    });

    const responsePromise = worker.fetch(dispatchRequest({ token }), testEnv);
    await allStarted;
    expect(started).toBe(3);
    await gate;
    const response = await responsePromise;

    expect(await response.json()).toMatchObject({ sent: 3, failed: 0 });
  });

  it('excludes revoked devices from fan-out', async () => {
    const testEnv = apnsEnv();
    const { token, account } = await seedDispatchAccount(testEnv);
    await seedDeviceForAccount(testEnv, { accountId: account.accountId, deviceId: 'active-device', pushToken: 'active-push' });
    await seedDeviceForAccount(testEnv, {
      accountId: account.accountId,
      deviceId: 'revoked-device',
      pushToken: 'revoked-push',
      revokedAt: 1234,
    });
    const { calls } = installApnsOk();

    const response = await worker.fetch(dispatchRequest({ token }), testEnv);

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].url.href).toContain('active-push');
  });

  it('revokes devices on APNs 410', async () => {
    await expectRevokedForApnsResponse(new Response(JSON.stringify({ reason: 'Unregistered' }), { status: 410 }));
  });

  it('revokes devices on BadDeviceToken', async () => {
    await expectRevokedForApnsResponse(new Response(JSON.stringify({ reason: 'BadDeviceToken' }), { status: 400 }));
  });

  it('revokes devices on Unregistered', async () => {
    await expectRevokedForApnsResponse(new Response(JSON.stringify({ reason: 'Unregistered' }), { status: 400 }));
  });

  it('counts 5xx as failed without revoking', async () => {
    const spy = installConsoleSpy();
    const testEnv = apnsEnv();
    const { token, account } = await seedDispatchAccount(testEnv);
    const device = await seedDeviceForAccount(testEnv, { accountId: account.accountId });
    installGcpFetchMock({
      'POST api.push.apple.com': async () => new Response(JSON.stringify({ reason: 'InternalServerError' }), { status: 500 }),
    });

    const response = await worker.fetch(dispatchRequest({ token }), testEnv);
    const body = await response.json();

    expect(body).toEqual({
      ok: false,
      sent: 0,
      failed: 1,
      revoked: 0,
      failures: [{ device_id: device.deviceId, reason: 'InternalServerError' }],
    });
    expect(await revokedAt(device.deviceId)).toBeNull();
    spy.restore();
  });

  it('does not send devices whose token env mismatches APNS_ENV', async () => {
    const testEnv = apnsEnv({ APNS_ENV: 'production' });
    const { token, account } = await seedDispatchAccount(testEnv);
    const device = await seedDeviceForAccount(testEnv, {
      accountId: account.accountId,
      pushToken: 'sandbox-push-token',
      pushTokenEnv: 'sandbox',
    });
    const { calls } = installGcpFetchMock({});

    const response = await worker.fetch(dispatchRequest({ token }), testEnv);

    expect(calls).toHaveLength(0);
    expect(calls.map(({ url }) => url.href).join('\n')).not.toContain('sandbox-push-token');
    expect(await response.json()).toEqual({
      ok: false,
      sent: 0,
      failed: 1,
      revoked: 0,
      failures: [{ device_id: device.deviceId, reason: 'env_mismatch' }],
    });
  });

  it('deletes cached JWT once and retries all ExpiredProviderToken sends with one fresh JWT', async () => {
    const kv = makeFakeKv();
    const testEnv = apnsEnv({ GCP_TOKEN_CACHE: kv });
    const { token, account } = await seedDispatchAccount(testEnv);
    for (const id of ['a', 'b', 'c']) {
      await seedDeviceForAccount(testEnv, { accountId: account.accountId, deviceId: `device-${id}`, pushToken: `push-${id}` });
    }
    let calls = 0;
    installGcpFetchMock({
      'POST api.push.apple.com': async () => {
        calls += 1;
        if (calls <= 3) {
          return new Response(JSON.stringify({ reason: 'ExpiredProviderToken' }), { status: 403 });
        }
        return new Response('{}', { status: 200 });
      },
    });

    const response = await worker.fetch(dispatchRequest({ token }), testEnv);

    expect(await response.json()).toEqual({ ok: true, sent: 3, failed: 0, revoked: 0, failures: [] });
    expect(calls).toBe(6);
    expect(kv.deletes).toEqual([apnsJwtCacheKey(testEnv)]);
    expect(kv.puts).toHaveLength(2);
  });

  it('sends the exact alert payload shape', async () => {
    const payload = buildSolChatRequestPayload(validDispatchBody());

    expect(Object.keys(payload).sort()).toEqual(['aps', 'data']);
    expect(payload.aps).toEqual({
      alert: { title: 'sol', body: 'Needs a reply' },
      category: 'SOLSTONE_SOL_CHAT_REQUEST',
      sound: 'default',
      'mutable-content': 1,
      'content-available': 1,
    });
    expect(payload.data).toEqual({
      action: 'open_chat_request',
      request_id: 'req-1',
      category: 'notice',
    });
  });

  it('sets APNs alert headers', async () => {
    const testEnv = apnsEnv();
    const { token, account } = await seedDispatchAccount(testEnv);
    await seedDeviceForAccount(testEnv, { accountId: account.accountId });
    let capturedHeaders;
    installGcpFetchMock({
      'POST api.push.apple.com': async ({ init }) => {
        capturedHeaders = new Headers(init.headers);
        return new Response('{}', { status: 200 });
      },
    });

    await worker.fetch(dispatchRequest({ token }), testEnv);

    expect(capturedHeaders.get('apns-topic')).toBe(testEnv.APNS_BUNDLE_ID);
    expect(capturedHeaders.get('apns-push-type')).toBe('alert');
    expect(capturedHeaders.get('apns-priority')).toBe('10');
    expect(capturedHeaders.get('apns-collapse-id')).toBe(buildSolChatRequestCollapseId({ request_id: 'req-1' }));
    expect(capturedHeaders.get('authorization')).toMatch(/^bearer .+\..+\..+$/);
    expect(capturedHeaders.get('apns-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('builds the Python-compatible collapse id', () => {
    expect(buildSolChatRequestCollapseId({ request_id: 'req-1' })).toBe('sol_chat_request:req-1');
  });

  it('does not log PEM, JWT, signature, or push tokens', async () => {
    const spy = installConsoleSpy();
    const testEnv = apnsEnv();
    const { token, account } = await seedDispatchAccount(testEnv);
    await seedDeviceForAccount(testEnv, { accountId: account.accountId, pushToken: 'secret-push-token' });
    let jwt = '';
    installGcpFetchMock({
      'POST api.push.apple.com': async ({ init }) => {
        jwt = new Headers(init.headers).get('authorization').replace(/^bearer /, '');
        return new Response(JSON.stringify({ reason: 'InternalServerError' }), { status: 500 });
      },
    });

    await worker.fetch(dispatchRequest({ token }), testEnv);

    spy.assertNoSecrets([TEST_APNS_P8_PEM, jwt, jwt.split('.')[2], 'secret-push-token']);
    spy.restore();
  });

  it('keeps inference hosts blocked in the widened fetch mock', async () => {
    installGcpFetchMock({});

    await expect(fetch('https://generativelanguage.googleapis.com/v1/models')).rejects
      .toThrow(/disallowed host reached fetch: generativelanguage.googleapis.com/);
  });
});

async function expectValidationError(body) {
  const testEnv = apnsEnv();
  const { token } = await seedDispatchAccount(testEnv);
  const { calls } = installGcpFetchMock({});

  const response = await worker.fetch(dispatchRequest({ token, body }), testEnv);

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'invalid_input' });
  expect(calls).toHaveLength(0);
}

async function expectRevokedForApnsResponse(apnsResponse) {
  const testEnv = apnsEnv();
  const { token, account } = await seedDispatchAccount(testEnv);
  const device = await seedDeviceForAccount(testEnv, { accountId: account.accountId });
  installGcpFetchMock({
    'POST api.push.apple.com': async () => apnsResponse.clone(),
  });

  const response = await worker.fetch(dispatchRequest({ token }), testEnv);

  expect(await response.json()).toEqual({ ok: true, sent: 0, failed: 0, revoked: 1, failures: [] });
  expect(await revokedAt(device.deviceId)).toBeGreaterThan(0);
}

function apnsEnv(overrides = {}) {
  return makeTestEnv({
    APNS_TEAM_ID: 'TEAM123',
    APNS_KEY_ID: 'APNSKEY1',
    APNS_P8_PEM: TEST_APNS_P8_PEM,
    APNS_BUNDLE_ID: 'app.solstone.swift',
    APNS_ENV: 'production',
    ...overrides,
  });
}

async function seedDispatchAccount(testEnv) {
  const account = await seedAccount({ testEnv });
  const minted = await mintDispatchToken(testEnv, account.accountId);
  return { account, token: minted.token };
}

async function seedDeviceForAccount(testEnv, options = {}) {
  return seedDevice({
    accountId: options.accountId,
    deviceId: options.deviceId || 'device-1',
    pushToken: options.pushToken || `push-${options.deviceId || 'device-1'}`,
    pushTokenEnv: options.pushTokenEnv || 'production',
    revokedAt: options.revokedAt ?? null,
  });
}

function installApnsOk() {
  return installGcpFetchMock({
    'POST api.push.apple.com': async () => new Response('{}', { status: 200 }),
  });
}

function dispatchRequest({ token, body = validDispatchBody(), rawAuth = false }) {
  const headers = { 'Content-Type': 'application/json' };
  if (token !== null) headers.Authorization = rawAuth ? token : `Bearer ${token}`;
  return new Request('https://account.solstone.app/push/dispatch', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function validDispatchBody() {
  return { summary: 'Needs a reply', category: 'notice', request_id: 'req-1' };
}

async function revokedAt(deviceId) {
  const row = await makeTestEnv().DB
    .prepare('SELECT revoked_at FROM account_devices WHERE device_id = ?')
    .bind(deviceId)
    .first();
  return row?.revoked_at ?? null;
}
