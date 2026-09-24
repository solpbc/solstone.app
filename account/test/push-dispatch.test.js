import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  ENVELOPE_BYTES,
  ENVELOPE_CHARS,
  FIXED_ALERT_BODY,
  FIXED_ALERT_TITLE,
  MAX_DISPATCH_DEVICES,
  apnsJwtCacheKey,
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

    expect(await response.json()).toEqual({ results: [{ token: tok('push-a'), outcome: 'sent' }, { token: tok('push-b'), outcome: 'sent' }] });
    expect(calls).toHaveLength(2);
    expect(calls.map(({ url }) => url.host)).toEqual(['api.push.apple.com', 'api.push.apple.com']);
    expect(calls.map(({ url }) => url.pathname)).toEqual([`/3/device/${tok('push-a')}`, `/3/device/${tok('push-b')}`]);
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
    expect(JSON.parse(text)).toEqual({ results: [{ token: tok('push-1'), outcome: 'sent' }] });
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

    expect(await response.json()).toEqual({ results: [{ token: tok('prod-token'), outcome: 'sent' }, { token: tok('sandbox-token'), outcome: 'sent' }] });
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

    expect(await response.json()).toEqual({ results: [{ token: tok('revoked-push-token'), outcome: 'revoked', reason: 'Unregistered' }] });
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

    expect(await response.json()).toEqual({ results: [{ token: tok('bad-device-token'), outcome: 'failed', reason: 'BadDeviceToken' }] });
    expect(spy.calls).toContainEqual({
      level: 'warn',
      args: ['apns_send_failed', { status: 400, reason: 'BadDeviceToken' }],
    });
    spy.assertNoSecrets([tok('bad-device-token')]);
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

    expect(await response.json()).toEqual({ results: [{ token: tok('stale-410-token'), outcome: 'revoked', reason: 'BadDeviceToken' }] });
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

    expect(await response.json()).toEqual({ results: [{ token: tok('push-a'), outcome: 'sent' }, { token: tok('push-b'), outcome: 'sent' }, { token: tok('push-c'), outcome: 'sent' }] });
    expect(calls).toHaveLength(6);
    expect(kv.deletes).toEqual([apnsJwtCacheKey(testEnv)]);
    expect(kv.puts).toHaveLength(2);
  });


  it('accepts an empty devices array without minting a JWT or fetching APNs', async () => {
    const kv = makeFakeKv();
    const testEnv = apnsEnv({ GCP_TOKEN_CACHE: kv });
    const { calls } = installApnsFetchMock({});

    const response = await worker.fetch(dispatchRequest({
      token: await relayToken(testEnv),
      body: validDispatchBody({ devices: [] }),
    }), testEnv);

    expect(await response.json()).toEqual({ results: [] });
    expect(kv.puts).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('returns one result per device in input order, including a send that throws', async () => {
    const testEnv = apnsEnv();
    installApnsFetchMock({
      'POST api.push.apple.com': async ({ url }) => {
        if (url.pathname.endsWith(tok('push-b'))) throw new Error('socket hang up');
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
      results: [
        { token: tok('push-a'), outcome: 'sent' },
        { token: tok('push-b'), outcome: 'failed', reason: 'fetch_failed' },
        { token: tok('push-c'), outcome: 'sent' },
      ],
    });
  });

  it('builds a fixed alert around the envelope and carries nothing else', () => {
    const envelope = sealedEnvelope(7);
    const payload = buildAlertPayload(envelope);

    expect(payload).toEqual({
      aps: {
        alert: { title: FIXED_ALERT_TITLE, body: FIXED_ALERT_BODY },
        sound: 'default',
        'mutable-content': 1,
      },
      e: envelope,
    });
  });

  it('sends each device its own envelope under the fixed alert', async () => {
    const testEnv = apnsEnv();
    const { calls } = installApnsOk();
    const first = sealedEnvelope(1);
    const second = sealedEnvelope(2);

    const response = await worker.fetch(dispatchRequest({
      token: await relayToken(testEnv),
      body: validDispatchBody({
        devices: [inlineDevice('push-a', { envelope: first }), inlineDevice('push-b', { envelope: second })],
      }),
    }), testEnv);

    expect(response.status).toBe(200);
    const byPath = Object.fromEntries(calls.map(({ url, init }) => [url.pathname, JSON.parse(init.body)]));
    expect(byPath[`/3/device/${tok('push-a')}`].e).toBe(first);
    expect(byPath[`/3/device/${tok('push-b')}`].e).toBe(second);
    for (const payload of Object.values(byPath)) {
      expect(payload.aps.alert).toEqual({ title: FIXED_ALERT_TITLE, body: FIXED_ALERT_BODY });
      expect(Object.keys(payload).sort()).toEqual(['aps', 'e']);
    }
  });

  it('sets APNs alert headers with an expiry and no collapse id', async () => {
    const testEnv = apnsEnv();
    let capturedHeaders;
    installApnsFetchMock({
      'POST api.push.apple.com': async ({ init }) => {
        capturedHeaders = new Headers(init.headers);
        return new Response('{}', { status: 200 });
      },
    });
    const before = Math.floor(Date.now() / 1000);

    await worker.fetch(dispatchRequest({
      token: await relayToken(testEnv),
      body: validDispatchBody({ devices: [inlineDevice('header-token')] }),
    }), testEnv);

    expect(capturedHeaders.get('apns-topic')).toBe(testEnv.APNS_BUNDLE_ID);
    expect(capturedHeaders.get('apns-push-type')).toBe('alert');
    expect(capturedHeaders.get('apns-priority')).toBe('10');
    expect(capturedHeaders.get('apns-collapse-id')).toBeNull();
    const expiration = Number(capturedHeaders.get('apns-expiration'));
    expect(expiration).toBeGreaterThanOrEqual(before + 24 * 60 * 60);
    expect(expiration).toBeLessThanOrEqual(before + 24 * 60 * 60 + 5);
    expect(capturedHeaders.get('authorization')).toMatch(/^bearer .+\..+\..+$/);
    expect(capturedHeaders.get('apns-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([
    ['a readable text field', { title: 'Journal update' }],
    ['a summary field', { summary: 'Needs a reply' }],
    ['any unknown top-level key', { kind: 'journal_state' }],
  ])('refuses %s', async (_label, extra) => {
    await expectDispatchValidationError({ ...validDispatchBody(), ...extra });
  });

  it('refuses a body without devices', async () => {
    await expectDispatchValidationError({});
  });

  it.each([
    ['an unknown device key', () => inlineDevice('push-1', { bundle_id: 'app.solstone.swift' })],
    ['a missing envelope', () => { const d = inlineDevice('push-1'); delete d.envelope; return d; }],
    ['a non-hex token', () => ({ ...inlineDevice('push-1'), token: 'not-hex-token' })],
    ['an uppercase hex token', () => ({ ...inlineDevice('push-1'), token: 'ABCDEF' })],
    ['an overlong token', () => ({ ...inlineDevice('push-1'), token: 'a'.repeat(202) })],
    ['an odd-length token', () => ({ ...inlineDevice('push-1'), token: 'a'.repeat(17) })],
    ['a too-short token', () => ({ ...inlineDevice('push-1'), token: 'ab'.repeat(7) })],
    ['an unknown environment', () => inlineDevice('push-1', { environment: 'development' })],
    ['a short envelope', () => inlineDevice('push-1', { envelope: sealedEnvelope(1).slice(0, ENVELOPE_CHARS - 4) })],
    ['a long envelope', () => inlineDevice('push-1', { envelope: sealedEnvelope(1) + 'AAAA' })],
    ['standard base64 characters', () => inlineDevice('push-1', { envelope: '+' + sealedEnvelope(1).slice(1) })],
    ['whitespace inside the envelope', () => inlineDevice('push-1', { envelope: ' ' + sealedEnvelope(1).slice(1) })],
    ['a wrong version byte', () => inlineDevice('push-1', { envelope: sealedEnvelope(1, 0x02) })],
    ['a non-object device', () => 'push-1'],
  ])('refuses a device with %s', async (_label, device) => {
    await expectDispatchValidationError(validDispatchBody({ devices: [device()] }));
  });

  it(`refuses more than ${MAX_DISPATCH_DEVICES} devices and accepts exactly ${MAX_DISPATCH_DEVICES}`, async () => {
    const many = (n) => Array.from({ length: n }, (_, i) => inlineDevice(`push-${i}`));
    await expectDispatchValidationError(validDispatchBody({ devices: many(MAX_DISPATCH_DEVICES + 1) }));

    const testEnv = apnsEnv();
    const { calls } = installApnsOk();
    const response = await worker.fetch(dispatchRequest({
      token: await relayToken(testEnv),
      body: validDispatchBody({ devices: many(MAX_DISPATCH_DEVICES) }),
    }), testEnv);
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(MAX_DISPATCH_DEVICES);
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

    spy.assertNoSecrets([TEST_APNS_P8_PEM, jwt, jwt.split('.')[2], tok('secret-push-token')]);
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
    devices: [inlineDevice('push-1')],
    ...overrides,
  };
}

// APNs tokens are lowercase hex; tests name them readably and encode the name,
// padded to the 8-byte minimum the relay accepts.
function tok(name) {
  return Buffer.from(name.padEnd(8, '.'), 'utf8').toString('hex');
}

// A well-formed envelope: version byte, then filler of the sealed length.
// The relay cannot and does not check the ciphertext, only its shape.
function sealedEnvelope(fill, version = 0x01) {
  const bytes = new Uint8Array(ENVELOPE_BYTES).fill(fill);
  bytes[0] = version;
  return Buffer.from(bytes).toString('base64url');
}

function inlineDevice(name, overrides = {}) {
  return {
    token: tok(name),
    environment: 'production',
    envelope: sealedEnvelope(1),
    ...overrides,
  };
}
