import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { decryptEmail, hashServiceHandoffNonce } from '../src/crypto.js';
import { verifyEnableResume } from '../src/enable.js';
import {
  TEST_CSRF,
  installConsoleSpy,
  installRelayFetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedSession,
} from './helpers.js';

const VALID_NONCE = '2'.repeat(52);
const OTHER_NONCE = '3'.repeat(52);
const VALID_INSTANCE = '11111111-1111-1111-1111-111111111111';
const OTHER_INSTANCE = '22222222-2222-2222-2222-222222222222';

describe('/enable/spl', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('rejects missing or malformed query params with the generic error page', async () => {
    const cases = [
      splUrl({ nonce: '' }),
      splUrl({ nonce: 'bad' }),
    ];

    for (const url of cases) {
      const response = await worker.fetch(new Request(url), makeTestEnv());
      const body = await response.text();
      expect(response.status).toBe(400);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Location')).toBeNull();
      expect(body).toContain("something didn't look right with that link.");
    }
  });

  it('redirects signed-out requests through the byte-preserving resume flow', async () => {
    const testEnv = makeTestEnv();
    const query = `?nonce=${VALID_NONCE}`;
    const response = await worker.fetch(new Request(`https://services.solstone.app/enable/spl${query}`), testEnv);
    const location = new URL(response.headers.get('Location'), 'https://services.solstone.app');
    const resume = await verifyEnableResume(location.searchParams.get('next'), location.searchParams.get('next_sig'), testEnv);

    expect(response.status).toBe(303);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(location.pathname).toBe('/');
    expect(resume).toEqual({ path: '/enable/spl', queryString: query });
  });

  it('redirects signed-out requests with a valid instance in the resume flow', async () => {
    const testEnv = makeTestEnv();
    const query = `?nonce=${VALID_NONCE}&instance=${VALID_INSTANCE}`;
    const response = await worker.fetch(new Request(`https://services.solstone.app/enable/spl${query}`), testEnv);
    const location = new URL(response.headers.get('Location'), 'https://services.solstone.app');
    const resume = await verifyEnableResume(location.searchParams.get('next'), location.searchParams.get('next_sig'), testEnv);

    expect(response.status).toBe(303);
    expect(resume).toEqual({ path: '/enable/spl', queryString: query });
  });

  it('renders signed-in consent with hidden csrf and nonce fields', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const response = await worker.fetch(new Request(splUrl(), {
      headers: { Cookie: session.cookie },
    }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toContain('this journal is asking to enable private link access.');
    expect(body).toContain('name="csrf" value=');
    expect(body).toContain(`name="nonce" value="${VALID_NONCE}"`);
  });

  it('ignores malformed or repeated instance params on consent', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const malformed = await worker.fetch(new Request(splUrl({ instance: 'zz' }), {
      headers: { Cookie: session.cookie },
    }), testEnv);
    const repeated = await worker.fetch(new Request(`${splUrl()}&instance=${VALID_INSTANCE}&instance=${OTHER_INSTANCE}`, {
      headers: { Cookie: session.cookie },
    }), testEnv);

    for (const response of [malformed, repeated]) {
      const body = await response.text();
      expect(response.status).toBe(200);
      expect(body).not.toContain('name="instance"');
      expect(body).toContain('<a href="/services/spl">set up solstone hosting</a> to let solstone host your private link relay.');
    }
  });

  it('enforces origin, csrf, cancel, and stale account guards on confirm', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const badOrigin = await worker.fetch(confirmRequest({ cookie: session.cookie, origin: 'https://bad.example' }), testEnv);
    expect(badOrigin.status).toBe(403);
    expect(badOrigin.headers.get('Cache-Control')).toBe('no-store');

    const badCsrf = await worker.fetch(confirmRequest({ cookie: session.cookie, csrf: 'bad' }), testEnv);
    expect(badCsrf.status).toBe(403);

    const cancel = await worker.fetch(confirmRequest({ cookie: session.cookie, action: 'cancel' }), testEnv);
    expect(cancel.status).toBe(303);
    expect(cancel.headers.get('Location')).toBe('/');
    await expect(rowCount('service_handoffs')).resolves.toBe(0);

    const stale = await worker.fetch(confirmRequest({ cookie: session.cookie, nonce: OTHER_NONCE }), accountMissingEnv(testEnv));
    expect(stale.status).toBe(303);
    expect(stale.headers.get('Location')).toBe('/');
    expect(stale.headers.get('Set-Cookie')).toContain('account_session=;');
  });

  it('writes the encrypted handoff, consumes it once, and leaks no secrets to logs', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedEntitlement({ accountId: account.accountId, status: 'active' });
    try {
      const response = await worker.fetch(confirmRequest({ cookie: session.cookie }), testEnv);
      const payloadEncrypted = (await serviceHandoffRow(VALID_NONCE, testEnv)).payload_encrypted;
      const handoff = await worker.fetch(new Request(`https://services.solstone.app/handoff/spl?nonce=${VALID_NONCE}`), testEnv);
      const payload = await handoff.json();
      const second = await worker.fetch(new Request(`https://services.solstone.app/handoff/spl?nonce=${VALID_NONCE}`), testEnv);

      expect(response.status).toBe(200);
      expect(await response.text()).toContain('private link access is approved for this journal. you can close this tab.');
      expect(handoff.status).toBe(200);
      expect(payload).toEqual({
        service: 'spl',
        state: 'approved',
        approved_at: expect.any(String),
      });
      expect(Number.isNaN(Date.parse(payload.approved_at))).toBe(false);
      expect(second.status).toBe(410);
      await expect(second.json()).resolves.toEqual({ error: 'gone' });
      spy.assertNoSecrets([VALID_NONCE, payloadEncrypted]);
    } finally {
      spy.restore();
    }
  });

  it('returns 503 and writes no consumable handoff when insert fails', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const failingEnv = failOnceOnSql(testEnv, /INSERT INTO service_handoffs/i);

    const response = await worker.fetch(confirmRequest({ cookie: session.cookie }), failingEnv);

    expect(response.status).toBe(503);
    await expectNoSplHandoff({ testEnv, nonce: VALID_NONCE });
  });

  it('returns 503 and writes no consumable handoff when encryption fails', async () => {
    const testEnv = makeTestEnv();
    const brokenEnv = makeTestEnv({ ENCRYPTION_SECRET: 'AAAA' });
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(confirmRequest({ cookie: session.cookie }), brokenEnv);

    expect(response.status).toBe(503);
    await expectNoSplHandoff({ testEnv, nonce: VALID_NONCE });
  });

  it('writes a needs-subscription handoff with a binding and no relay push when unentitled', async () => {
    const testEnv = makeTestEnv();
    const { calls } = installRelayFetchMock();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(confirmRequest({
      cookie: session.cookie,
      extraForm: { instance: VALID_INSTANCE },
    }), testEnv);
    const body = await response.text();
    const payload = await pollSplHandoff({ testEnv, nonce: VALID_NONCE });
    const binding = await splBindingRow(account.accountId, VALID_INSTANCE);

    expect(response.status).toBe(200);
    expect(body).toContain('set up solstone hosting');
    expect(payload).toEqual({
      service: 'spl',
      state: 'needs_subscription',
      subscribe_url: 'https://services.solstone.app/services/spl',
    });
    expect(binding).toMatchObject({ account_id: account.accountId, instance_id: VALID_INSTANCE });
    expect(calls).toHaveLength(0);
  });

  it('writes an approved handoff and pushes an inline relay grant when entitled with an instance', async () => {
    const testEnv = makeTestEnv();
    const { calls } = installRelayFetchMock();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedEntitlement({
      accountId: account.accountId,
      status: 'active',
      currentPeriodEnd: 1_900_000_000,
    });

    const response = await worker.fetch(confirmRequest({
      cookie: session.cookie,
      extraForm: { instance: VALID_INSTANCE },
    }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('private link access is approved for this journal. you can close this tab.');
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ instance_id: VALID_INSTANCE, entitled_until: 1_900_000_000 });
    expect(calls[0].init.headers.Authorization).toBe('Bearer test-relay-grant-secret');
  });

  it('ignores smuggled fields and derives the payload server-side', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedEntitlement({ accountId: account.accountId, status: 'active' });
    const smuggled = {
      home_label: 'h',
      instance_id: 'i',
      public_key: 'k',
      totp_secret: 't',
      relay_token: 'r',
      account_id: 'evil',
      service: 'evil',
      state: 'evil',
      approved_at: 'evil',
    };
    try {
      const response = await worker.fetch(confirmRequest({
        cookie: session.cookie,
        extraForm: smuggled,
      }), testEnv);
      const row = await serviceHandoffRow(VALID_NONCE, testEnv);
      const storedPayload = JSON.parse(await decryptEmail(row.payload_encrypted, testEnv));
      const payload = await pollSplHandoff({ testEnv, nonce: VALID_NONCE });

      expect(response.status).toBe(200);
      expect(storedPayload).toEqual({
        service: 'spl',
        state: 'approved',
        approved_at: expect.any(String),
      });
      expect(payload).toEqual(storedPayload);
      expect(Number.isNaN(Date.parse(payload.approved_at))).toBe(false);
      for (const value of Object.values(smuggled)) {
        expect(Object.values(storedPayload)).not.toContain(value);
      }
      spy.assertNoSecrets([...Object.values(smuggled), VALID_NONCE, row.payload_encrypted]);
    } finally {
      spy.restore();
    }
  });
});

function splUrl(overrides = {}) {
  const params = new URLSearchParams({
    nonce: VALID_NONCE,
    ...overrides,
  });
  return `https://services.solstone.app/enable/spl?${params.toString()}`;
}

function confirmRequest({
  cookie,
  nonce = VALID_NONCE,
  action = 'allow',
  csrf = TEST_CSRF,
  origin = 'https://services.solstone.app',
  extraForm = {},
} = {}) {
  const body = new URLSearchParams({
    csrf,
    nonce,
    action,
    ...extraForm,
  });
  const headers = {
    Origin: origin,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (cookie) headers.Cookie = cookie;
  return new Request('https://services.solstone.app/enable/spl/confirm', {
    method: 'POST',
    headers,
    body,
  });
}

async function pollSplHandoff({ testEnv, nonce }) {
  const response = await worker.fetch(new Request(`https://services.solstone.app/handoff/spl?nonce=${nonce}`), testEnv);
  expect(response.status).toBe(200);
  return response.json();
}

async function expectNoSplHandoff({ testEnv, nonce }) {
  vi.useFakeTimers();
  const pending = worker.fetch(
    new Request(`https://services.solstone.app/handoff/spl?nonce=${nonce}`),
    testEnv
  );
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(31_500);
  const response = await pending;
  expect(response.status).toBe(204);
}

async function serviceHandoffRow(nonce, testEnv) {
  return workerEnv.DB
    .prepare('SELECT payload_encrypted FROM service_handoffs WHERE handoff_hash = ? AND service = ?')
    .bind(await hashServiceHandoffNonce(nonce, testEnv), 'spl')
    .first();
}

async function splBindingRow(accountId, instanceId) {
  return workerEnv.DB
    .prepare('SELECT account_id, instance_id, created_at, last_seen_at FROM spl_bindings WHERE account_id = ? AND instance_id = ?')
    .bind(accountId, instanceId)
    .first();
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

function accountMissingEnv(testEnv) {
  return {
    ...testEnv,
    DB: {
      prepare(sql) {
        const statement = testEnv.DB.prepare(sql);
        if (!/SELECT id, created_at, last_signin_at FROM accounts WHERE id = \?/i.test(sql)) {
          return statement;
        }
        return {
          bind(...args) {
            statement.bind(...args);
            return {
              first: async () => null,
            };
          },
          first: async () => null,
        };
      },
      batch(statements) {
        return testEnv.DB.batch(statements);
      },
    },
  };
}
