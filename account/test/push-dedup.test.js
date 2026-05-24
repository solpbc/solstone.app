import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { mintDispatchToken } from '../src/devices.js';
import {
  buildSilentChatLifecycleCollapseId,
  buildSilentChatLifecyclePayload,
} from '../src/push.js';
import {
  installConsoleSpy,
  installGcpFetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedDevice,
  TEST_APNS_P8_PEM,
} from './helpers.js';

describe('push dedup endpoint', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects missing bearer', async () => {
    const { calls } = installGcpFetchMock({});

    const response = await worker.fetch(dedupRequest({ token: null }), apnsEnv());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'invalid_token' });
    expect(calls).toHaveLength(0);
  });

  it('rejects unknown bearer', async () => {
    const { calls } = installGcpFetchMock({});

    const response = await worker.fetch(dedupRequest({ token: 'unknown-token' }), apnsEnv());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'invalid_token' });
    expect(calls).toHaveLength(0);
  });

  it('rejects missing request_id', async () => {
    await expectValidationError({ action: 'owner_chat_open' });
  });

  it('rejects missing action', async () => {
    await expectValidationError({ request_id: 'req-1' });
  });

  it('sends one background push for a single active device', async () => {
    const testEnv = apnsEnv();
    const { token, account } = await seedDedupAccount(testEnv);
    await seedDevice({ accountId: account.accountId, deviceId: 'device-1', pushToken: 'push-1' });
    installApnsOk();

    const response = await worker.fetch(dedupRequest({ token }), testEnv);

    expect(await response.json()).toEqual({ ok: true, sent: 1, failed: 0, revoked: 0, failures: [] });
  });

  it('does not send devices whose token env mismatches APNS_ENV', async () => {
    const testEnv = apnsEnv({ APNS_ENV: 'production' });
    const { token, account } = await seedDedupAccount(testEnv);
    await seedDevice({
      accountId: account.accountId,
      deviceId: 'device-1',
      pushToken: 'sandbox-push-token',
      pushTokenEnv: 'sandbox',
    });
    const { calls } = installGcpFetchMock({});

    const response = await worker.fetch(dedupRequest({ token }), testEnv);

    expect(calls).toHaveLength(0);
    expect(calls.map(({ url }) => url.href).join('\n')).not.toContain('sandbox-push-token');
    expect(await response.json()).toEqual({
      ok: false,
      sent: 0,
      failed: 1,
      revoked: 0,
      failures: [{ device_id: 'device-1', reason: 'env_mismatch' }],
    });
  });

  it('builds the exact silent payload shape', () => {
    const payload = buildSilentChatLifecyclePayload(validDedupBody());

    expect(Object.keys(payload).sort()).toEqual(['aps', 'data']);
    expect(payload.aps).toEqual({ 'mutable-content': 1, 'content-available': 1 });
    expect(payload.aps).not.toHaveProperty('alert');
    expect(payload.aps).not.toHaveProperty('sound');
    expect(payload.aps).not.toHaveProperty('category');
    expect(payload.data).toEqual({ action: 'owner_chat_open', request_id: 'req-1' });
  });

  it('sets APNs background headers and collapse id', async () => {
    const testEnv = apnsEnv();
    const { token, account } = await seedDedupAccount(testEnv);
    await seedDevice({ accountId: account.accountId, deviceId: 'device-1', pushToken: 'push-1' });
    let capturedHeaders;
    installGcpFetchMock({
      'POST api.push.apple.com': async ({ init }) => {
        capturedHeaders = new Headers(init.headers);
        return new Response('{}', { status: 200 });
      },
    });

    await worker.fetch(dedupRequest({ token }), testEnv);

    expect(capturedHeaders.get('apns-topic')).toBe(testEnv.APNS_BUNDLE_ID);
    expect(capturedHeaders.get('apns-push-type')).toBe('background');
    expect(capturedHeaders.get('apns-priority')).toBe('5');
    expect(capturedHeaders.get('apns-collapse-id')).toBe(
      buildSilentChatLifecycleCollapseId({ request_id: 'req-1', action: 'owner_chat_open' })
    );
    expect(capturedHeaders.get('authorization')).toMatch(/^bearer .+\..+\..+$/);
    expect(capturedHeaders.get('apns-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('does not log PEM, JWT, signature, or push tokens', async () => {
    const spy = installConsoleSpy();
    const testEnv = apnsEnv();
    const { token, account } = await seedDedupAccount(testEnv);
    await seedDevice({ accountId: account.accountId, deviceId: 'device-1', pushToken: 'secret-push-token' });
    let jwt = '';
    installGcpFetchMock({
      'POST api.push.apple.com': async ({ init }) => {
        jwt = new Headers(init.headers).get('authorization').replace(/^bearer /, '');
        return new Response(JSON.stringify({ reason: 'InternalServerError' }), { status: 500 });
      },
    });

    await worker.fetch(dedupRequest({ token }), testEnv);

    spy.assertNoSecrets([TEST_APNS_P8_PEM, jwt, jwt.split('.')[2], 'secret-push-token']);
    spy.restore();
  });
});

async function expectValidationError(body) {
  const testEnv = apnsEnv();
  const { token } = await seedDedupAccount(testEnv);
  const { calls } = installGcpFetchMock({});

  const response = await worker.fetch(dedupRequest({ token, body }), testEnv);

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'invalid_input' });
  expect(calls).toHaveLength(0);
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

async function seedDedupAccount(testEnv) {
  const account = await seedAccount({ testEnv });
  const minted = await mintDispatchToken(testEnv, account.accountId);
  return { account, token: minted.token };
}

function installApnsOk() {
  return installGcpFetchMock({
    'POST api.push.apple.com': async () => new Response('{}', { status: 200 }),
  });
}

function dedupRequest({ token, body = validDedupBody() }) {
  const headers = { 'Content-Type': 'application/json' };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  return new Request('https://services.solstone.app/push/dedup', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function validDedupBody() {
  return { request_id: 'req-1', action: 'owner_chat_open' };
}
