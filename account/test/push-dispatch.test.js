import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  apnsJwtCacheKey,
  buildAlertCollapseId,
  buildAlertPayload,
} from '../src/push.js';
import { mintReachRelayToken } from '../src/reach.js';
import {
  installConsoleSpy,
  installApnsFetchMock,
  makeFakeKv,
  makeTestEnv,
  TEST_APNS_P8_PEM,
} from './helpers.js';

const OLD_PUSH_RELAY_SECRET = 'test-push-relay-secret';

describe('push dispatch endpoint', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends alert pushes to inline production devices without D1 access', async () => {
    const testEnv = apnsEnv({ DB: throwingDb() });
    const { calls } = installApnsOk();

    const response = await worker.fetch(dispatchRequest({
      token: await relayToken(testEnv),
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
    const { calls } = installApnsFetchMock({});

    const response = await worker.fetch(dispatchRequest({ token: null }), apnsEnv());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'invalid_token' });
    expect(calls).toHaveLength(0);
  });

  it('rejects malformed bearer without APNs fetch', async () => {
    const { calls } = installApnsFetchMock({});
    const testEnv = apnsEnv();
    const token = await relayToken(testEnv);

    const response = await worker.fetch(dispatchRequest({ token, rawAuth: true }), testEnv);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'invalid_token' });
    expect(calls).toHaveLength(0);
  });

  it('rejects wrong bearer without APNs fetch', async () => {
    const { calls } = installApnsFetchMock({});

    const response = await worker.fetch(dispatchRequest({ token: 'wrong-secret' }), apnsEnv());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'invalid_token' });
    expect(calls).toHaveLength(0);
  });

  it('rejects the retired shared-secret bearer without APNs fetch', async () => {
    const { calls } = installApnsFetchMock({});

    const response = await worker.fetch(dispatchRequest({ token: OLD_PUSH_RELAY_SECRET }), apnsEnv());

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

    const response = await worker.fetch(dispatchRequest({ token }), testEnv);
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
    const { calls } = installApnsFetchMock({});

    const response = await worker.fetch(dispatchRequest({ token }), testEnv);

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
    const { calls } = installApnsFetchMock({});

    const response = await worker.fetch(dispatchRequest({ token }), testEnv);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'invalid_token' });
    expect(calls).toHaveLength(0);
  });

  it('routes inline devices to their requested APNs environments in one request', async () => {
    const testEnv = apnsEnv();
    const { calls } = installApnsFetchMock({
      'POST api.push.apple.com': async () => new Response('{}', { status: 200 }),
      'POST api.sandbox.push.apple.com': async () => new Response('{}', { status: 200 }),
    });

    const response = await worker.fetch(dispatchRequest({
      token: await relayToken(testEnv),
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
    installApnsFetchMock({
      'POST api.push.apple.com': async () => new Response(JSON.stringify({ reason: 'Unregistered' }), { status: 410 }),
    });

    const response = await worker.fetch(dispatchRequest({
      token: await relayToken(testEnv),
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

  it('retains the token on 400 BadDeviceToken instead of revoking it', async () => {
    const spy = installConsoleSpy();
    const testEnv = apnsEnv({ DB: throwingDb() });
    installApnsFetchMock({
      'POST api.push.apple.com': async () => new Response(JSON.stringify({ reason: 'BadDeviceToken' }), { status: 400 }),
    });

    const response = await worker.fetch(dispatchRequest({
      token: await relayToken(testEnv),
      body: validDispatchBody({
        devices: [inlineDevice('bad-device-token')],
      }),
    }), testEnv);

    expect(await response.json()).toEqual({
      ok: false,
      sent: 0,
      failed: 1,
      revoked: 0,
      revoked_tokens: [],
      failures: [{ token: 'bad-device-token', reason: 'BadDeviceToken' }],
    });
    expect(spy.calls).toContainEqual({
      level: 'warn',
      args: ['apns_send_failed', { status: 400, reason: 'BadDeviceToken' }],
    });
    spy.assertNoSecrets(['bad-device-token']);
    spy.restore();
  });

  it('revokes on 410 BadDeviceToken (keys on status, not reason)', async () => {
    const testEnv = apnsEnv({ DB: throwingDb() });
    installApnsFetchMock({
      'POST api.push.apple.com': async () => new Response(JSON.stringify({ reason: 'BadDeviceToken' }), { status: 410 }),
    });

    const response = await worker.fetch(dispatchRequest({
      token: await relayToken(testEnv),
      body: validDispatchBody({
        devices: [inlineDevice('stale-410-token')],
      }),
    }), testEnv);

    expect(await response.json()).toEqual({
      ok: true,
      sent: 0,
      failed: 0,
      revoked: 1,
      revoked_tokens: ['stale-410-token'],
      failures: [],
    });
  });

  it('deletes cached JWT once and retries all ExpiredProviderToken sends with one fresh JWT', async () => {
    const kv = makeFakeKv();
    const testEnv = apnsEnv({ GCP_TOKEN_CACHE: kv });
    let apnsCalls = 0;
    const { calls } = installApnsFetchMock({
      'POST api.push.apple.com': async () => {
        apnsCalls += 1;
        if (apnsCalls <= 3) {
          return new Response(JSON.stringify({ reason: 'ExpiredProviderToken' }), { status: 403 });
        }
        return new Response('{}', { status: 200 });
      },
    });

    const response = await worker.fetch(dispatchRequest({
      token: await relayToken(testEnv),
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
    const { calls } = installApnsFetchMock({});
    const testEnv = apnsEnv();

    const response = await worker.fetch(dispatchRequest({
      token: await relayToken(testEnv),
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
      token: await relayToken(testEnv),
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
    const { calls } = installApnsFetchMock({});

    const response = await worker.fetch(dispatchRequest({
      token: await relayToken(testEnv),
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
    const payload = buildAlertPayload({
      title: 'Journal update',
      summary: 'Needs a reply',
      aps_category: 'SOLSTONE_JOURNAL_STATE',
      action: 'open_journal',
      request_id: 'req-1',
      category: 'notice',
    });

    expect(Object.keys(payload).sort()).toEqual(['aps', 'data']);
    expect(payload.aps).toEqual({
      alert: { title: 'Journal update', body: 'Needs a reply' },
      category: 'SOLSTONE_JOURNAL_STATE',
      sound: 'default',
      'mutable-content': 1,
      'content-available': 1,
    });
    expect(payload.data).toEqual({
      action: 'open_journal',
      request_id: 'req-1',
      category: 'notice',
    });
  });

  it('builds the collapse id from kind and request_id', () => {
    expect(buildAlertCollapseId({ kind: 'journal_state', request_id: 'req-1' })).toBe('journal_state:req-1');
  });

  it('sets APNs alert headers', async () => {
    const testEnv = apnsEnv();
    let capturedHeaders;
    installApnsFetchMock({
      'POST api.push.apple.com': async ({ init }) => {
        capturedHeaders = new Headers(init.headers);
        return new Response('{}', { status: 200 });
      },
    });

    await worker.fetch(dispatchRequest({
      token: await relayToken(testEnv),
      body: validDispatchBody({ devices: [inlineDevice('header-token')] }),
    }), testEnv);

    expect(capturedHeaders.get('apns-topic')).toBe(testEnv.APNS_BUNDLE_ID);
    expect(capturedHeaders.get('apns-push-type')).toBe('alert');
    expect(capturedHeaders.get('apns-priority')).toBe('10');
    expect(capturedHeaders.get('apns-collapse-id')).toBe(buildAlertCollapseId({ kind: 'journal_state', request_id: 'req-1' }));
    expect(capturedHeaders.get('authorization')).toMatch(/^bearer .+\..+\..+$/);
    expect(capturedHeaders.get('apns-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each(['title', 'action', 'kind'])('rejects missing %s', async (field) => {
    await expectDispatchValidationError(validDispatchBody({ [field]: undefined }));
  });

  it('rejects a body that has category but no aps_category', async () => {
    await expectDispatchValidationError(validDispatchBody({ aps_category: undefined }));
  });

  it.each([
    ['title', ''],
    ['title', '  '],
    ['aps_category', ''],
    ['aps_category', '  '],
    ['action', ''],
    ['action', '  '],
    ['kind', ''],
    ['kind', '  '],
  ])('rejects %s %j', async (field, value) => {
    await expectDispatchValidationError(validDispatchBody({ [field]: value }));
  });

  it('accepts empty-string category as a contract lock', async () => {
    const testEnv = apnsEnv({ DB: throwingDb() });
    const { calls } = installApnsOk();

    const response = await worker.fetch(dispatchRequest({
      token: await relayToken(testEnv),
      body: validDispatchBody({ category: '', devices: [inlineDevice('empty-cat')] }),
    }), testEnv);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      sent: 1,
      failed: 0,
      revoked: 0,
      revoked_tokens: [],
      failures: [],
    });
    expect(JSON.parse(calls[0].init.body).data.category).toBe('');
  });

  it('accepts title of exactly 80 UTF-8 bytes and emits it', async () => {
    const title = 'a'.repeat(80);
    const testEnv = apnsEnv({ DB: throwingDb() });
    const { calls } = installApnsOk();

    const response = await worker.fetch(dispatchRequest({
      token: await relayToken(testEnv),
      body: validDispatchBody({ title, devices: [inlineDevice('title-80')] }),
    }), testEnv);

    expect(response.status).toBe(200);
    expect(JSON.parse(calls[0].init.body).aps.alert.title).toBe(title);
  });

  it('rejects title of exactly 81 UTF-8 bytes', async () => {
    await expectDispatchValidationError(validDispatchBody({ title: 'a'.repeat(81) }));
  });

  it('emits title raw including surrounding whitespace', async () => {
    const title = '  Journal update  ';
    const testEnv = apnsEnv({ DB: throwingDb() });
    const { calls } = installApnsOk();

    await worker.fetch(dispatchRequest({
      token: await relayToken(testEnv),
      body: validDispatchBody({ title, devices: [inlineDevice('title-raw')] }),
    }), testEnv);

    expect(JSON.parse(calls[0].init.body).aps.alert.title).toBe(title);
  });

  it('trims kind before building the collapse id', async () => {
    const testEnv = apnsEnv({ DB: throwingDb() });
    const { calls } = installApnsOk();

    await worker.fetch(dispatchRequest({
      token: await relayToken(testEnv),
      body: validDispatchBody({ kind: '  journal_state  ', devices: [inlineDevice('trim-kind')] }),
    }), testEnv);

    expect(new Headers(calls[0].init.headers).get('apns-collapse-id')).toBe('journal_state:req-1');
  });

  it('sends the caller-supplied alert payload and collapse id', async () => {
    const testEnv = apnsEnv({ DB: throwingDb() });
    const { calls } = installApnsOk();

    const response = await worker.fetch(dispatchRequest({
      token: await relayToken(testEnv),
      body: validDispatchBody({ devices: [inlineDevice('payload-token')] }),
    }), testEnv);

    expect(await response.json()).toEqual({
      ok: true,
      sent: 1,
      failed: 0,
      revoked: 0,
      revoked_tokens: [],
      failures: [],
    });
    expect(JSON.parse(calls[0].init.body)).toEqual({
      aps: {
        alert: { title: 'Journal update', body: 'Needs a reply' },
        category: 'SOLSTONE_JOURNAL_STATE',
        sound: 'default',
        'mutable-content': 1,
        'content-available': 1,
      },
      data: { action: 'open_journal', request_id: 'req-1', category: 'notice' },
    });
    expect(JSON.parse(calls[0].init.body).data).not.toHaveProperty('kind');
    expect(new Headers(calls[0].init.headers).get('apns-collapse-id')).toBe(
      buildAlertCollapseId({ kind: 'journal_state', request_id: 'req-1' })
    );
  });

  it('varies the dispatch collapse id with request_id', async () => {
    const testEnv = apnsEnv({ DB: throwingDb() });
    const { calls } = installApnsOk();
    const token = await relayToken(testEnv);

    const first = await worker.fetch(dispatchRequest({
      token,
      body: validDispatchBody({ devices: [inlineDevice('var-1')] }),
    }), testEnv);
    const second = await worker.fetch(dispatchRequest({
      token,
      body: validDispatchBody({ request_id: 'req-2', devices: [inlineDevice('var-2')] }),
    }), testEnv);

    expect(await first.json()).toEqual({
      ok: true,
      sent: 1,
      failed: 0,
      revoked: 0,
      revoked_tokens: [],
      failures: [],
    });
    expect(await second.json()).toEqual({
      ok: true,
      sent: 1,
      failed: 0,
      revoked: 0,
      revoked_tokens: [],
      failures: [],
    });
    const ids = calls.map(({ init }) => new Headers(init.headers).get('apns-collapse-id'));
    expect(ids[0]).toBe('journal_state:req-1');
    expect(ids[1]).toBe('journal_state:req-2');
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('relays a second distinct identity without an allowlist', async () => {
    const testEnv = apnsEnv({ DB: throwingDb() });
    const { calls } = installApnsOk();

    const response = await worker.fetch(dispatchRequest({
      token: await relayToken(testEnv),
      body: validDispatchBody({
        title: 'Backup complete',
        aps_category: 'SOLSTONE_BACKUP_EVENT',
        action: 'open_backup',
        kind: 'backup_event',
        devices: [inlineDevice('backup-token')],
      }),
    }), testEnv);

    expect(response.status).toBe(200);
    const payload = JSON.parse(calls[0].init.body);
    expect(payload.aps.alert.title).toBe('Backup complete');
    expect(payload.aps.category).toBe('SOLSTONE_BACKUP_EVENT');
    expect(payload.data.action).toBe('open_backup');
    expect(new Headers(calls[0].init.headers).get('apns-collapse-id')).toBe('backup_event:req-1');
  });

  it('does not log PEM, JWT, signature, or push tokens', async () => {
    const spy = installConsoleSpy();
    const testEnv = apnsEnv();
    let jwt = '';
    installApnsFetchMock({
      'POST api.push.apple.com': async ({ init }) => {
        jwt = new Headers(init.headers).get('authorization').replace(/^bearer /, '');
        return new Response(JSON.stringify({ reason: 'InternalServerError' }), { status: 500 });
      },
    });

    await worker.fetch(dispatchRequest({
      token: await relayToken(testEnv),
      body: validDispatchBody({ devices: [inlineDevice('secret-push-token')] }),
    }), testEnv);

    spy.assertNoSecrets([TEST_APNS_P8_PEM, jwt, jwt.split('.')[2], 'secret-push-token']);
    spy.restore();
  });

  it('keeps non-APNs hosts blocked in the fetch mock', async () => {
    installApnsFetchMock({});

    await expect(fetch('https://example.com')).rejects
      .toThrow(/disallowed host reached fetch: example.com/);
  });
});

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

function throwingDb() {
  return new Proxy({}, { get() { throw new Error('unexpected D1 access'); } });
}

async function expectDispatchValidationError(body) {
  const testEnv = apnsEnv();
  const { calls } = installApnsFetchMock({});

  const response = await worker.fetch(dispatchRequest({ token: await relayToken(testEnv), body }), testEnv);

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'invalid_input' });
  expect(calls).toHaveLength(0);
}

function installApnsOk() {
  return installApnsFetchMock({
    'POST api.push.apple.com': async () => new Response('{}', { status: 200 }),
  });
}

async function relayToken(testEnv, overrides = {}) {
  return mintReachRelayToken(testEnv, {
    instanceId: '11111111-1111-1111-1111-111111111111',
    iat: Math.floor(Date.now() / 1000),
    ...overrides,
  });
}

function dispatchRequest({ token = null, body = validDispatchBody(), rawAuth = false } = {}) {
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
    title: 'Journal update',
    summary: 'Needs a reply',
    category: 'notice',
    aps_category: 'SOLSTONE_JOURNAL_STATE',
    action: 'open_journal',
    kind: 'journal_state',
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
