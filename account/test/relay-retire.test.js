import { afterEach, describe, expect, it, vi } from 'vitest';
import { retireRelayInstance } from '../src/relay-grant.js';
import { installConsoleSpy, installRelayFetchMock, makeTestEnv } from './helpers.js';

const INSTANCE_ID = '11111111-1111-1111-1111-111111111111';
const TOKEN = 'plaintext-token-must-not-log';
const TOKEN_HASH = 'token-hash-must-not-log';
const ACCOUNT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RUN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const EMAIL = 'relay-retire@example.com';
const CHECKS = {
  entry_denial_verified: true,
  sockets_closed: true,
  devices_revoked: true,
  entitlement_cleared: true,
  pending_grants_cleared: true,
  tombstone_verified: true,
};
const COMPONENTS = [
  'retired_state',
  'instance_do_cleanup',
  'rk_do_cleanup',
  'device_revocation',
  'entitlement_clear',
  'pending_grant_clear',
  'rk_registry_clear',
  'verification',
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('retireRelayInstance', () => {
  it.each(['retired', 'already_retired', 'absent'])(
    'accepts the relay literal 200 shape with state %s',
    async (state) => {
      const spy = installConsoleSpy();
      const testEnv = makeTestEnv({
        RELAY_GRANT_URL: 'https://link.solstone.app/configured/path?ignored=yes',
      });
      try {
        const { calls } = installRelayFetchMock({
          'DELETE link.solstone.app/admin/instances/11111111-1111-1111-1111-111111111111':
            async () => jsonResponse({ state, ...CHECKS }, 200),
        });

        await expect(retireRelayInstance(testEnv, { instanceId: INSTANCE_ID })).resolves.toEqual({
          outcome: 'retired',
          relayState: state,
          checks: CHECKS,
        });
        expect(calls).toHaveLength(1);
        expect(calls[0].method).toBe('DELETE');
        expect(calls[0].url.href).toBe(
          `https://link.solstone.app/admin/instances/${INSTANCE_ID}`
        );
        expect(calls[0].init.headers.Authorization).toBe('Bearer test-relay-grant-secret');
        expect(calls[0].init.redirect).toBe('manual');
        assertNoLeaks(spy, testEnv);
      } finally {
        spy.restore();
      }
    }
  );

  it('prefers the RELAY service binding and never reaches public fetch', async () => {
    const spy = installConsoleSpy();
    const bindingCalls = [];
    const testEnv = makeTestEnv({
      RELAY: {
        async fetch(input, init) {
          bindingCalls.push({ input, init });
          return jsonResponse({ state: 'retired', ...CHECKS }, 200);
        },
      },
    });
    const publicFetch = vi.fn(async () => {
      throw new Error('public fetch must not run');
    });
    vi.stubGlobal('fetch', publicFetch);
    try {
      await expect(retireRelayInstance(testEnv, { instanceId: INSTANCE_ID }))
        .resolves.toMatchObject({ outcome: 'retired', relayState: 'retired' });
      expect(bindingCalls).toHaveLength(1);
      expect(bindingCalls[0].input).toBe(`https://link.solstone.app/admin/instances/${INSTANCE_ID}`);
      expect(bindingCalls[0].init).toMatchObject({ method: 'DELETE', redirect: 'manual' });
      expect(bindingCalls[0].init.headers.Authorization).toBe('Bearer test-relay-grant-secret');
      expect(publicFetch).not.toHaveBeenCalled();
      assertNoLeaks(spy, testEnv);
    } finally {
      spy.restore();
    }
  });

  it.each(COMPONENTS)('returns the redacted residual for failed_component %s', async (component) => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    try {
      installRelayFetchMock({
        'DELETE link.solstone.app': async () => jsonResponse({
          ...CHECKS,
          sockets_closed: false,
          failed_component: component,
        }, 503),
      });

      await expect(retireRelayInstance(testEnv, { instanceId: INSTANCE_ID })).resolves.toEqual({
        outcome: 'retryable_residual',
        failedComponent: component,
        checks: { ...CHECKS, sockets_closed: false },
      });
      assertNoLeaks(spy, testEnv);
    } finally {
      spy.restore();
    }
  });

  it.each([
    ['a false 200 check', { state: 'retired', ...CHECKS, sockets_closed: false }],
    ['a missing 200 key', withoutKey({ state: 'retired', ...CHECKS }, 'sockets_closed')],
    ['an extra 200 key', { state: 'retired', ...CHECKS, extra: true }],
    ['a non-enum 200 state', { state: 'unknown', ...CHECKS }],
    ['a wrong-typed 200 check', { state: 'retired', ...CHECKS, sockets_closed: 1 }],
  ])('returns failed for %s', async (_label, body) => {
    await expectFailedResponse(() => jsonResponse(body, 200));
  });

  it.each([
    ['state on a residual', { ...CHECKS, failed_component: 'verification', state: 'retired' }],
    ['a missing residual key', withoutKey({ ...CHECKS, failed_component: 'verification' }, 'sockets_closed')],
    ['a wrong-typed residual check', { ...CHECKS, sockets_closed: 0, failed_component: 'verification' }],
    ['a non-enum residual component', { ...CHECKS, failed_component: 'unknown' }],
  ])('returns failed for %s', async (_label, body) => {
    await expectFailedResponse(() => jsonResponse(body, 503));
  });

  it.each([
    ['unprovisioned 503', () => jsonResponse({ error: 'relay not provisioned' }, 503)],
    ['400', () => jsonResponse({ error: 'bad instance_id' }, 400)],
    ['401', () => jsonResponse({ error: 'unauthorized' }, 401)],
    ['404 plain text', () => new Response('not found', { status: 404 })],
    ['unexpected 500', () => new Response('upstream failed', { status: 500 })],
    ['malformed JSON', () => new Response('{', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })],
  ])('maps %s to failed', async (_label, responseFactory) => {
    await expectFailedResponse(responseFactory);
  });

  it('fails every redirect without following or forwarding Authorization', async () => {
    for (const status of [300, 301, 302, 303, 307, 308]) {
      vi.unstubAllGlobals();
      const spy = installConsoleSpy();
      const testEnv = makeTestEnv();
      try {
        const { calls } = installRelayFetchMock({
          'DELETE link.solstone.app': async () => new Response(null, {
            status,
            headers: { Location: 'https://foreign.example/steal' },
          }),
        });
        await expect(retireRelayInstance(testEnv, { instanceId: INSTANCE_ID }))
          .resolves.toEqual({ outcome: 'failed' });
        expect(calls).toHaveLength(1);
        expect(calls[0].url.host).toBe('link.solstone.app');
        expect(calls[0].init.redirect).toBe('manual');
        assertNoLeaks(spy, testEnv);
      } finally {
        spy.restore();
      }
    }
  });

  it.each(['global fetch', 'service binding'])(
    'catches a %s exception and returns failed',
    async (source) => {
      const spy = installConsoleSpy();
      const throwingFetch = vi.fn(async () => {
        throw new Error(`${TOKEN} ${TOKEN_HASH} ${INSTANCE_ID}`);
      });
      const testEnv = makeTestEnv(source === 'service binding'
        ? { RELAY: { fetch: throwingFetch } }
        : {});
      if (source === 'global fetch') vi.stubGlobal('fetch', throwingFetch);
      try {
        await expect(retireRelayInstance(testEnv, { instanceId: INSTANCE_ID }))
          .resolves.toEqual({ outcome: 'failed' });
        expect(throwingFetch).toHaveBeenCalledOnce();
        assertNoLeaks(spy, testEnv);
      } finally {
        spy.restore();
      }
    }
  );

  it.each([
    ['foreign origin', { RELAY_GRANT_URL: 'https://foreign.example/path' }],
    ['non-HTTPS URL', { RELAY_GRANT_URL: 'http://link.solstone.app' }],
    ['malformed URL', { RELAY_GRANT_URL: 'not a URL' }],
    ['missing secret', { RELAY_GRANT_SECRET: '' }],
  ])('fails closed before or at fetch for %s configuration', async (_label, overrides) => {
    const spy = installConsoleSpy();
    const testEnv = { ...makeTestEnv(), ...overrides };
    try {
      const { fetchMock } = installRelayFetchMock();
      await expect(retireRelayInstance(testEnv, { instanceId: INSTANCE_ID }))
        .resolves.toEqual({ outcome: 'failed' });
      if (_label !== 'foreign origin') expect(fetchMock).not.toHaveBeenCalled();
      assertNoLeaks(spy, testEnv);
    } finally {
      spy.restore();
    }
  });

  it('throws only for a noncanonical instance argument before fetch', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const { fetchMock } = installRelayFetchMock();
    try {
      const error = await retireRelayInstance(testEnv, { instanceId: 'not-a-uuid' })
        .catch((caught) => caught);
      expect(error).toBeInstanceOf(TypeError);
      expect(error.message).toBe('invalid relay instance identifier');
      expect(error.message).not.toContain('not-a-uuid');
      expect(fetchMock).not.toHaveBeenCalled();
      assertNoLeaks(spy, testEnv);
    } finally {
      spy.restore();
    }
  });
});

async function expectFailedResponse(responseFactory) {
  const spy = installConsoleSpy();
  const testEnv = makeTestEnv();
  try {
    installRelayFetchMock({
      'DELETE link.solstone.app': async () => responseFactory(),
    });
    await expect(retireRelayInstance(testEnv, { instanceId: INSTANCE_ID }))
      .resolves.toEqual({ outcome: 'failed' });
    assertNoLeaks(spy, testEnv);
  } finally {
    spy.restore();
  }
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function withoutKey(value, key) {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function assertNoLeaks(spy, testEnv) {
  spy.assertNoSecrets([
    testEnv.RELAY_GRANT_SECRET,
    INSTANCE_ID,
    TOKEN,
    TOKEN_HASH,
    ACCOUNT_ID,
    RUN_ID,
    EMAIL,
  ]);
}
