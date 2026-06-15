import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
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
  TEST_APNS_P8_PEM,
} from './helpers.js';

describe('push dispatch endpoint', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends alert pushes to inline production devices without D1 access', async () => {
    const testEnv = apnsEnv({ DB: throwingDb() });
    const { calls } = installApnsOk();

    const response = await worker.fetch(dispatchRequest({
      token: testEnv.PUSH_RELAY_SECRET,
      body: validDispatchBody({
        devices: [inlineDevice('push-a'), inlineDevice('push-b')],
      }),
    }), testEnv);

    expect(await response.json()).toEqual({
      ok: true,
      sent: 2,
      failed: 0,
      revoked: 0,
      revoked_tokens: [],
      failures: [],
    });
    expect(calls).toHaveLength(2);
    expect(calls.map(({ url }) => url.host)).toEqual(['api.push.apple.com', 'api.push.apple.com']);
    expect(calls.map(({ url }) => url.pathname)).toEqual(['/3/device/push-a', '/3/device/push-b']);
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
    const token = apnsEnv().PUSH_RELAY_SECRET;

    const response = await worker.fetch(dispatchRequest({ token, rawAuth: true }), apnsEnv());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'invalid_token' });
    expect(calls).toHaveLength(0);
  });

  it('rejects wrong bearer without APNs fetch', async () => {
    const { calls } = installGcpFetchMock({});

    const response = await worker.fetch(dispatchRequest({ token: 'wrong-secret' }), apnsEnv());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'invalid_token' });
    expect(calls).toHaveLength(0);
  });

  it('routes inline devices to their requested APNs environments in one request', async () => {
    const testEnv = apnsEnv();
    const { calls } = installGcpFetchMock({
      'POST api.push.apple.com': async () => new Response('{}', { status: 200 }),
      'POST api.sandbox.push.apple.com': async () => new Response('{}', { status: 200 }),
    });

    const response = await worker.fetch(dispatchRequest({
      token: testEnv.PUSH_RELAY_SECRET,
      body: validDispatchBody({
        devices: [
          inlineDevice('prod-token', { environment: 'production' }),
          inlineDevice('sandbox-token', { environment: 'sandbox' }),
        ],
      }),
    }), testEnv);

    expect(await response.json()).toEqual({
      ok: true,
      sent: 2,
      failed: 0,
      revoked: 0,
      revoked_tokens: [],
      failures: [],
    });
    expect(calls.map(({ url }) => url.host).sort()).toEqual([
      'api.push.apple.com',
      'api.sandbox.push.apple.com',
    ]);
  });

  it('reports revocable APNs responses by token without D1 access', async () => {
    const testEnv = apnsEnv({ DB: throwingDb() });
    installGcpFetchMock({
      'POST api.push.apple.com': async () => new Response(JSON.stringify({ reason: 'Unregistered' }), { status: 410 }),
    });

    const response = await worker.fetch(dispatchRequest({
      token: testEnv.PUSH_RELAY_SECRET,
      body: validDispatchBody({
        devices: [inlineDevice('revoked-push-token')],
      }),
    }), testEnv);

    expect(await response.json()).toEqual({
      ok: true,
      sent: 0,
      failed: 0,
      revoked: 1,
      revoked_tokens: ['revoked-push-token'],
      failures: [],
    });
  });

  it('deletes cached JWT once and retries all ExpiredProviderToken sends with one fresh JWT', async () => {
    const kv = makeFakeKv();
    const testEnv = apnsEnv({ GCP_TOKEN_CACHE: kv });
    let apnsCalls = 0;
    const { calls } = installGcpFetchMock({
      'POST api.push.apple.com': async () => {
        apnsCalls += 1;
        if (apnsCalls <= 3) {
          return new Response(JSON.stringify({ reason: 'ExpiredProviderToken' }), { status: 403 });
        }
        return new Response('{}', { status: 200 });
      },
    });

    const response = await worker.fetch(dispatchRequest({
      token: testEnv.PUSH_RELAY_SECRET,
      body: validDispatchBody({
        devices: [inlineDevice('push-a'), inlineDevice('push-b'), inlineDevice('push-c')],
      }),
    }), testEnv);

    expect(await response.json()).toEqual({
      ok: true,
      sent: 3,
      failed: 0,
      revoked: 0,
      revoked_tokens: [],
      failures: [],
    });
    expect(calls).toHaveLength(6);
    expect(kv.deletes).toEqual([apnsJwtCacheKey(testEnv)]);
    expect(kv.puts).toHaveLength(2);
  });

  it('rejects summary over 80 UTF-8 bytes', async () => {
    const { calls } = installGcpFetchMock({});
    const testEnv = apnsEnv();

    const response = await worker.fetch(dispatchRequest({
      token: testEnv.PUSH_RELAY_SECRET,
      body: validDispatchBody({ summary: `${'a'.repeat(79)}🙂` }),
    }), testEnv);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_input' });
    expect(calls).toHaveLength(0);
  });

  it('accepts summary exactly 80 bytes', async () => {
    const testEnv = apnsEnv();
    installApnsOk();

    const response = await worker.fetch(dispatchRequest({
      token: testEnv.PUSH_RELAY_SECRET,
      body: validDispatchBody({ summary: 'a'.repeat(80), devices: [inlineDevice('push-80')] }),
    }), testEnv);

    expect(await response.json()).toEqual({
      ok: true,
      sent: 1,
      failed: 0,
      revoked: 0,
      revoked_tokens: [],
      failures: [],
    });
  });

  it('accepts an empty devices array without minting a JWT or fetching APNs', async () => {
    const kv = makeFakeKv();
    const testEnv = apnsEnv({ GCP_TOKEN_CACHE: kv });
    const { calls } = installGcpFetchMock({});

    const response = await worker.fetch(dispatchRequest({
      token: testEnv.PUSH_RELAY_SECRET,
      body: validDispatchBody({ devices: [] }),
    }), testEnv);

    expect(await response.json()).toEqual({
      ok: true,
      sent: 0,
      failed: 0,
      revoked: 0,
      revoked_tokens: [],
      failures: [],
    });
    expect(kv.puts).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('sends the exact alert payload shape', () => {
    const payload = buildSolChatRequestPayload({
      summary: 'Needs a reply',
      category: 'notice',
      request_id: 'req-1',
    });

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

  it('builds the Python-compatible collapse id', () => {
    expect(buildSolChatRequestCollapseId({ request_id: 'req-1' })).toBe('sol_chat_request:req-1');
  });

  it('sets APNs alert headers', async () => {
    const testEnv = apnsEnv();
    let capturedHeaders;
    installGcpFetchMock({
      'POST api.push.apple.com': async ({ init }) => {
        capturedHeaders = new Headers(init.headers);
        return new Response('{}', { status: 200 });
      },
    });

    await worker.fetch(dispatchRequest({
      token: testEnv.PUSH_RELAY_SECRET,
      body: validDispatchBody({ devices: [inlineDevice('header-token')] }),
    }), testEnv);

    expect(capturedHeaders.get('apns-topic')).toBe(testEnv.APNS_BUNDLE_ID);
    expect(capturedHeaders.get('apns-push-type')).toBe('alert');
    expect(capturedHeaders.get('apns-priority')).toBe('10');
    expect(capturedHeaders.get('apns-collapse-id')).toBe(buildSolChatRequestCollapseId({ request_id: 'req-1' }));
    expect(capturedHeaders.get('authorization')).toMatch(/^bearer .+\..+\..+$/);
    expect(capturedHeaders.get('apns-id')).toMatch(/^[0-9a-f-]{36}$/);
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

    await worker.fetch(dispatchRequest({
      token: testEnv.PUSH_RELAY_SECRET,
      body: validDispatchBody({ devices: [inlineDevice('secret-push-token')] }),
    }), testEnv);

    spy.assertNoSecrets([TEST_APNS_P8_PEM, jwt, jwt.split('.')[2], 'secret-push-token']);
    spy.restore();
  });

  it('keeps inference hosts blocked in the widened fetch mock', async () => {
    installGcpFetchMock({});

    await expect(fetch('https://generativelanguage.googleapis.com/v1/models')).rejects
      .toThrow(/disallowed host reached fetch: generativelanguage.googleapis.com/);
  });
});

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

function throwingDb() {
  return new Proxy({}, { get() { throw new Error('unexpected D1 access'); } });
}

function installApnsOk() {
  return installGcpFetchMock({
    'POST api.push.apple.com': async () => new Response('{}', { status: 200 }),
  });
}

function dispatchRequest({ token = apnsEnv().PUSH_RELAY_SECRET, body = validDispatchBody(), rawAuth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token !== null) headers.Authorization = rawAuth ? token : `Bearer ${token}`;
  return new Request('https://services.solstone.app/push/dispatch', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function validDispatchBody(overrides = {}) {
  return {
    summary: 'Needs a reply',
    category: 'notice',
    request_id: 'req-1',
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
