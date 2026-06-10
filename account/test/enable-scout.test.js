import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { encryptEmail } from '../src/crypto.js';
import {
  TEST_CSRF,
  installConsoleSpy,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedSession,
} from './helpers.js';

const VALID_NONCE = '2'.repeat(52);

describe('/enable/scout', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('redirects signed-out nonce requests through the sign-in resume flow', async () => {
    const response = await worker.fetch(
      new Request(`https://services.solstone.app/enable/scout?nonce=${VALID_NONCE}`),
      makeTestEnv()
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const location = new URL(response.headers.get('Location'), 'https://services.solstone.app');
    expect(location.pathname).toBe('/');
    expect(location.searchParams.get('next')).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(location.searchParams.get('next_sig')).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('returns 400 without params and renders signed-in consent with a nonce', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const entry = await worker.fetch(new Request('https://services.solstone.app/enable/scout'), testEnv);
    const consent = await worker.fetch(
      new Request(`https://services.solstone.app/enable/scout?nonce=${VALID_NONCE}`, {
        headers: { Cookie: session.cookie },
      }),
      testEnv
    );
    const body = await consent.text();

    expect(entry.status).toBe(400);
    expect(entry.headers.get('Cache-Control')).toBe('no-store');
    expect(await entry.clone().text()).not.toContain('action="/enable/scout"');
    expect(consent.status).toBe(200);
    expect(consent.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toContain('solstone on this device wants to enable solstone scout for you.');
    expect(body).toContain(`name="nonce" value="${VALID_NONCE}"`);
    expect(body).toContain(`name="account_id" value="${account.accountId}"`);
  });

  it('confirms consent, stores the encrypted handoff, and exposes it once by nonce', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedProvisionedKey({ testEnv, accountId: account.accountId, keyString: 'existing-google-key' });
    try {
      const confirm = await worker.fetch(new Request('https://services.solstone.app/enable/scout/confirm', {
        method: 'POST',
        headers: {
          Origin: 'https://services.solstone.app',
          Cookie: session.cookie,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          csrf: TEST_CSRF,
          nonce: VALID_NONCE,
          account_id: account.accountId,
          action: 'allow',
        }),
      }), testEnv);
      const handoff = await worker.fetch(
        new Request(`https://services.solstone.app/handoff/scout?nonce=${VALID_NONCE}`),
        testEnv
      );
      const payload = await handoff.json();

      expect(confirm.status).toBe(200);
      expect(confirm.headers.get('Cache-Control')).toBe('no-store');
      expect(await confirm.text()).toContain('you\'ve enabled solstone scout');
      await expect(rowCount('service_handoffs')).resolves.toBe(1);
      expect(handoff.status).toBe(200);
      expect(handoff.headers.get('Cache-Control')).toBe('no-store');
      expect(handoff.headers.has('Set-Cookie')).toBe(false);
      expect(handoff.headers.has('Vary')).toBe(false);
      expect(payload).toEqual({
        google_api_key: 'existing-google-key',
        dispatch_token: expect.stringMatching(/^[A-Za-z0-9_-]+$/),
        account_id: account.accountId,
        created_at: expect.any(String),
      });
      expect(Number.isNaN(Date.parse(payload.created_at))).toBe(false);
      spy.assertNoSecrets([VALID_NONCE, 'existing-google-key', payload.dispatch_token]);
    } finally {
      spy.restore();
    }
  });

  it('does not create another GCP key when handoff insert fails and the user retries', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const gcp = installProvisioningMock('partial-google-key');
    const failingEnv = failOnceOnSql(testEnv, /INSERT INTO service_handoffs/i);
    try {
      const first = await confirmNonce({ testEnv: failingEnv, cookie: session.cookie, accountId: account.accountId });
      const second = await confirmNonce({ testEnv, cookie: session.cookie, accountId: account.accountId });
      const handoff = await worker.fetch(
        new Request(`https://services.solstone.app/handoff/scout?nonce=${VALID_NONCE}`),
        testEnv
      );
      const payload = await handoff.json();

      expect(first.status).toBe(503);
      expect(second.status).toBe(200);
      expect(gcp.createCalls).toBe(1);
      expect(payload.google_api_key).toBe('partial-google-key');
      spy.assertNoSecrets([VALID_NONCE, 'partial-google-key', payload.dispatch_token]);
    } finally {
      spy.restore();
    }
  });

  it('redirects stale consent posts when the session account changes before confirm', async () => {
    const testEnv = makeTestEnv();
    const accountA = await seedAccount({ email: 'a@example.com', testEnv });
    const accountB = await seedAccount({ email: 'b@example.com', testEnv });
    await seedSession(accountA.accountId, { testEnv });
    const sessionB = await seedSession(accountB.accountId, { testEnv });

    const response = await confirmNonce({
      testEnv,
      cookie: sessionB.cookie,
      accountId: accountA.accountId,
    });

    expect(response.status).toBe(303);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Location')).toBe(`/enable/scout?nonce=${VALID_NONCE}`);
    await expect(rowCount('provisioned_keys')).resolves.toBe(0);
    await expect(rowCount('service_handoffs')).resolves.toBe(0);
  });
});

function confirmNonce({ testEnv, cookie, accountId, nonce = VALID_NONCE }) {
  return worker.fetch(new Request('https://services.solstone.app/enable/scout/confirm', {
    method: 'POST',
    headers: {
      Origin: 'https://services.solstone.app',
      Cookie: cookie,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      csrf: TEST_CSRF,
      nonce,
      account_id: accountId,
      action: 'allow',
    }),
  }), testEnv);
}

async function seedProvisionedKey({ testEnv, accountId, keyString }) {
  await workerEnv.DB
    .prepare(
      `INSERT INTO provisioned_keys (
         id, account_id, provider, display_name, key_resource_name,
         key_string_encrypted, created_at
       ) VALUES (?, ?, 'gemini', ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      accountId,
      `acct-${accountId.slice(0, 12)}`,
      `projects/test-gcp-project/locations/global/keys/${crypto.randomUUID()}`,
      await encryptEmail(keyString, testEnv),
      Date.now()
    )
    .run();
}

async function rowCount(table) {
  const row = await workerEnv.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
  return row.count;
}

function failOnceOnSql(testEnv, pattern) {
  let shouldFail = true;
  return {
    ...testEnv,
    DB: {
      prepare(sql) {
        const statement = testEnv.DB.prepare(sql);
        if (!pattern.test(sql)) return statement;
        return {
          bind(...args) {
            const bound = statement.bind(...args);
            return {
              run() {
                if (shouldFail) {
                  shouldFail = false;
                  throw new Error('injected db failure');
                }
                return bound.run();
              },
              first(...firstArgs) {
                if (shouldFail) {
                  shouldFail = false;
                  throw new Error('injected db failure');
                }
                return bound.first(...firstArgs);
              },
              all(...allArgs) {
                if (shouldFail) {
                  shouldFail = false;
                  throw new Error('injected db failure');
                }
                return bound.all(...allArgs);
              },
            };
          },
          run: (...args) => statement.run(...args),
          first: (...args) => statement.first(...args),
          all: (...args) => statement.all(...args),
        };
      },
      batch(statements) {
        return testEnv.DB.batch(statements);
      },
    },
  };
}

function installProvisioningMock(keyString) {
  const state = { createCalls: 0 };
  vi.stubGlobal('fetch', vi.fn(async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = (init.method || 'GET').toUpperCase();
    const key = `${method} ${url.host}${url.pathname}`;
    if (key === 'POST oauth2.googleapis.com/token') {
      return jsonResponse({ access_token: 'gcp-access-token', expires_in: 3600, token_type: 'Bearer' });
    }
    if (key === 'GET apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys') {
      return jsonResponse({ keys: [] });
    }
    if (key === 'POST apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys') {
      state.createCalls += 1;
      return jsonResponse({ name: 'operations/create-enable-scout' });
    }
    if (key === 'GET apikeys.googleapis.com/v2/operations/create-enable-scout') {
      return jsonResponse({ done: true, response: { name: 'projects/test-gcp-project/locations/global/keys/enable-scout' } });
    }
    if (key === 'GET apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys/enable-scout/keyString') {
      return jsonResponse({ keyString });
    }
    throw new Error(`unhandled fetch: ${method} ${url.href}`);
  }));
  return state;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
