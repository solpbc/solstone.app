import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  buildSilentChatLifecycleCollapseId,
  buildSilentChatLifecyclePayload,
} from '../src/push.js';
import { mintReachRelayToken } from '../src/reach.js';
import {
  installConsoleSpy,
  installGcpFetchMock,
  makeTestEnv,
  TEST_APNS_P8_PEM,
} from './helpers.js';

describe('push dedup endpoint', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects missing bearer without APNs fetch', async () => {
    const { calls } = installGcpFetchMock({});

    const response = await worker.fetch(dedupRequest({ token: null }), apnsEnv());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'invalid_token' });
    expect(calls).toHaveLength(0);
  });

  it('rejects wrong bearer without APNs fetch', async () => {
    const { calls } = installGcpFetchMock({});

    const response = await worker.fetch(dedupRequest({ token: 'wrong-secret' }), apnsEnv());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'invalid_token' });
    expect(calls).toHaveLength(0);
  });

  it('authorizes with a valid reach relay token', async () => {
    const instanceId = '11111111-1111-1111-1111-111111111111';
    const testEnv = apnsEnv({ DB: throwingDb() });
    const iat = Math.floor(Date.now() / 1000);
    const token = await mintReachRelayToken(testEnv, { instanceId, iat });
    const { calls } = installApnsOk();

    const response = await worker.fetch(dedupRequest({ token }), testEnv);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({
      ok: true,
      sent: 1,
      failed: 0,
      revoked: 0,
      revoked_tokens: [],
      failures: [],
    });
    expect(text).not.toContain(instanceId);
    expect(calls).toHaveLength(1);
  });

  it('rejects an expired reach relay token without APNs fetch', async () => {
    const testEnv = apnsEnv();
    const iat = Math.floor(Date.now() / 1000) - 90000;
    const token = await mintReachRelayToken(testEnv, {
      instanceId: '11111111-1111-1111-1111-111111111111',
      iat,
    });
    const { calls } = installGcpFetchMock({});

    const response = await worker.fetch(dedupRequest({ token }), testEnv);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'invalid_token' });
    expect(calls).toHaveLength(0);
  });

  it('rejects a reach token signed with the wrong secret without APNs fetch', async () => {
    const testEnv = apnsEnv();
    const iat = Math.floor(Date.now() / 1000);
    const token = await mintReachRelayToken(
      { ...testEnv, REACH_RELAY_TOKEN_SECRET: 'other-secret' },
      { instanceId: '11111111-1111-1111-1111-111111111111', iat }
    );
    const { calls } = installGcpFetchMock({});

    const response = await worker.fetch(dedupRequest({ token }), testEnv);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'invalid_token' });
    expect(calls).toHaveLength(0);
  });

  it('sends one background push to an inline device', async () => {
    const testEnv = apnsEnv();
    const { calls } = installApnsOk();

    const response = await worker.fetch(dedupRequest({
      token: testEnv.PUSH_RELAY_SECRET,
      body: validDedupBody({ devices: [inlineDevice('push-1')] }),
    }), testEnv);

    expect(await response.json()).toEqual({
      ok: true,
      sent: 1,
      failed: 0,
      revoked: 0,
      revoked_tokens: [],
      failures: [],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url.host).toBe('api.push.apple.com');
    expect(calls[0].url.pathname).toBe('/3/device/push-1');
  });

  it('rejects missing request_id', async () => {
    await expectValidationError({
      action: 'owner_chat_open',
      devices: [inlineDevice('push-1')],
    });
  });

  it('rejects missing action', async () => {
    await expectValidationError({
      request_id: 'req-1',
      devices: [inlineDevice('push-1')],
    });
  });

  it('sets APNs background headers and collapse id', async () => {
    const testEnv = apnsEnv();
    let capturedHeaders;
    installGcpFetchMock({
      'POST api.push.apple.com': async ({ init }) => {
        capturedHeaders = new Headers(init.headers);
        return new Response('{}', { status: 200 });
      },
    });

    await worker.fetch(dedupRequest({
      token: testEnv.PUSH_RELAY_SECRET,
      body: validDedupBody({ devices: [inlineDevice('header-token')] }),
    }), testEnv);

    expect(capturedHeaders.get('apns-topic')).toBe(testEnv.APNS_BUNDLE_ID);
    expect(capturedHeaders.get('apns-push-type')).toBe('background');
    expect(capturedHeaders.get('apns-priority')).toBe('5');
    expect(capturedHeaders.get('apns-collapse-id')).toBe(
      buildSilentChatLifecycleCollapseId({ request_id: 'req-1', action: 'owner_chat_open' })
    );
    expect(capturedHeaders.get('authorization')).toMatch(/^bearer .+\..+\..+$/);
    expect(capturedHeaders.get('apns-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('builds the exact silent payload shape', () => {
    const payload = buildSilentChatLifecyclePayload({
      request_id: 'req-1',
      action: 'owner_chat_open',
    });

    expect(Object.keys(payload).sort()).toEqual(['aps', 'data']);
    expect(payload.aps).toEqual({ 'mutable-content': 1, 'content-available': 1 });
    expect(payload.aps).not.toHaveProperty('alert');
    expect(payload.aps).not.toHaveProperty('sound');
    expect(payload.aps).not.toHaveProperty('category');
    expect(payload.data).toEqual({ action: 'owner_chat_open', request_id: 'req-1' });
  });

  it('does not log PEM, JWT, signature, or push tokens', async () => {
    const spy = installConsoleSpy();
    const testEnv = apnsEnv();
    let jwt = '';
    installGcpFetchMock({
      'POST api.push.apple.com': async ({ init }) => {
        jwt = new Headers(init.headers).get('authorization').replace(/^bearer /, '');
        return new Response(JSON.stringify({ reason: 'InternalServerError' }), { status: 500 });
      },
    });

    await worker.fetch(dedupRequest({
      token: testEnv.PUSH_RELAY_SECRET,
      body: validDedupBody({ devices: [inlineDevice('secret-push-token')] }),
    }), testEnv);

    spy.assertNoSecrets([TEST_APNS_P8_PEM, jwt, jwt.split('.')[2], 'secret-push-token']);
    spy.restore();
  });
});

async function expectValidationError(body) {
  const testEnv = apnsEnv();
  const { calls } = installGcpFetchMock({});

  const response = await worker.fetch(dedupRequest({ token: testEnv.PUSH_RELAY_SECRET, body }), testEnv);

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'invalid_input' });
  expect(calls).toHaveLength(0);
}

function apnsEnv(overrides = {}) {
  return makeTestEnv({
    APNS_TEAM_ID: 'TEAM123',
    APNS_KEY_ID: 'APNSKEY1',
    APNS_KEY_P8: TEST_APNS_P8_PEM,
    APNS_BUNDLE_ID: 'app.solstone.swift',
    APNS_ENV: 'production',
    ...overrides,
  });
}

function installApnsOk() {
  return installGcpFetchMock({
    'POST api.push.apple.com': async () => new Response('{}', { status: 200 }),
  });
}

function dedupRequest({ token = apnsEnv().PUSH_RELAY_SECRET, body = validDedupBody() } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  return new Request('https://services.solstone.app/push/dedup', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function validDedupBody(overrides = {}) {
  return {
    request_id: 'req-1',
    action: 'owner_chat_open',
    devices: [inlineDevice('push-1')],
    ...overrides,
  };
}

function inlineDevice(token, overrides = {}) {
  return {
    token,
    bundle_id: 'app.solstone.swift',
    environment: 'production',
    ...overrides,
  };
}

function throwingDb() {
  return new Proxy({}, { get() { throw new Error('unexpected D1 access'); } });
}
