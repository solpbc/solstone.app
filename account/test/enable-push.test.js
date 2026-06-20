import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { hashServiceHandoffNonce } from '../src/crypto.js';
import { verifyEnableResume } from '../src/enable.js';
import {
  TEST_CSRF,
  installConsoleSpy,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedSession,
} from './helpers.js';

const VALID_NONCE = '2'.repeat(52);
const OTHER_NONCE = '3'.repeat(52);
const THIRD_NONCE = '4'.repeat(52);
const DEVICE_TOKEN = 'A'.repeat(64);
const OTHER_DEVICE_TOKEN = 'B'.repeat(64);
const BUNDLE_ID = 'app.solstone.swift';

describe('/enable/push', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('rejects missing or malformed query params with the generic error page', async () => {
    const cases = [
      pushUrl({ nonce: '' }),
      pushUrl({ device_token: '' }),
      pushUrl({ platform: '' }),
      pushUrl({ bundle_id: '' }),
      pushUrl({ nonce: 'bad' }),
      pushUrl({ device_token: 'short' }),
      pushUrl({ platform: 'android' }),
      pushUrl({ bundle_id: 'bad/bundle' }),
    ];

    for (const url of cases) {
      const response = await worker.fetch(new Request(url), makeTestEnv());
      const body = await response.text();
      expect(response.status).toBe(400);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(body).toContain("something didn't look right with that link.");
    }
  });

  it('redirects signed-out requests through the byte-preserving resume flow', async () => {
    const testEnv = makeTestEnv();
    const query = `?nonce=${VALID_NONCE}&device_token=${DEVICE_TOKEN}&platform=ios&bundle_id=${BUNDLE_ID}`;
    const response = await worker.fetch(new Request(`https://services.solstone.app/enable/push${query}`), testEnv);
    const location = new URL(response.headers.get('Location'), 'https://services.solstone.app');
    const resume = await verifyEnableResume(location.searchParams.get('next'), location.searchParams.get('next_sig'), testEnv);

    expect(response.status).toBe(303);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(location.pathname).toBe('/');
    expect(resume).toEqual({ path: '/enable/push', queryString: query });
  });

  it('renders signed-in consent with hidden device fields', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const response = await worker.fetch(new Request(pushUrl(), {
      headers: { Cookie: session.cookie },
    }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toContain('notifications want to reach this device for you.');
    expect(body).toContain(`name="nonce" value="${VALID_NONCE}"`);
    expect(body).toContain(`name="device_token" value="${DEVICE_TOKEN}"`);
    expect(body).toContain(`name="platform" value="ios"`);
    expect(body).toContain(`name="bundle_id" value="${BUNDLE_ID}"`);
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
    await expect(rowCount('account_devices')).resolves.toBe(0);
    await expect(rowCount('service_handoffs')).resolves.toBe(0);

    const stale = await worker.fetch(confirmRequest({ cookie: session.cookie, nonce: OTHER_NONCE }), accountMissingEnv(testEnv));
    expect(stale.status).toBe(303);
    expect(stale.headers.get('Location')).toBe('/');
    expect(stale.headers.get('Set-Cookie')).toContain('account_session=;');
  });

  it('registers a sandbox device, writes the encrypted handoff, and leaks no secrets to logs', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    try {
      const response = await worker.fetch(confirmRequest({ cookie: session.cookie }), testEnv);
      const payloadEncrypted = (await serviceHandoffRow(VALID_NONCE, testEnv)).payload_encrypted;
      const handoff = await worker.fetch(new Request(`https://services.solstone.app/handoff/push?nonce=${VALID_NONCE}`), testEnv);
      const payload = await handoff.json();
      const device = await deviceRow(payload.device_id);

      expect(response.status).toBe(200);
      expect(await response.text()).toContain('your phone is connected to notifications. you can close this tab.');
      expect(handoff.status).toBe(200);
      expect(payload).toEqual({
        device_id: expect.any(String),
        dispatch_token: expect.stringMatching(/^[A-Za-z0-9_-]+$/),
        account_id: account.accountId,
        created_at: expect.any(String),
      });
      expect(Number.isNaN(Date.parse(payload.created_at))).toBe(false);
      expect(device.push_token_env).toBe('sandbox');
      expect(device.push_token).toBe(DEVICE_TOKEN);
      spy.assertNoSecrets([VALID_NONCE, DEVICE_TOKEN, payload.dispatch_token, payload.device_id, payloadEncrypted]);
    } finally {
      spy.restore();
    }
  });

  it('keeps device registration idempotency and transfer semantics while minting fresh dispatch tokens', async () => {
    const testEnv = makeTestEnv();
    const accountA = await seedAccount({ email: 'a@example.com', testEnv });
    const accountB = await seedAccount({ email: 'b@example.com', testEnv });
    const sessionA = await seedSession(accountA.accountId, { testEnv });
    const sessionB = await seedSession(accountB.accountId, { testEnv });

    const first = await confirmAndPoll({ testEnv, cookie: sessionA.cookie, nonce: VALID_NONCE, deviceToken: DEVICE_TOKEN });
    const second = await confirmAndPoll({ testEnv, cookie: sessionA.cookie, nonce: OTHER_NONCE, deviceToken: DEVICE_TOKEN });
    expect(second.device_id).toBe(first.device_id);
    expect(second.dispatch_token).not.toBe(first.dispatch_token);
    await expect(activeDeviceCount(accountA.accountId)).resolves.toBe(1);

    const otherDevice = await confirmAndPoll({
      testEnv,
      cookie: sessionA.cookie,
      nonce: THIRD_NONCE,
      deviceToken: OTHER_DEVICE_TOKEN,
    });
    expect(otherDevice.device_id).not.toBe(first.device_id);
    await expect(activeDeviceCount(accountA.accountId)).resolves.toBe(2);

    const third = await confirmAndPoll({ testEnv, cookie: sessionB.cookie, nonce: '5'.repeat(52), deviceToken: DEVICE_TOKEN });
    expect(third.device_id).not.toBe(first.device_id);
    const prior = await deviceRow(first.device_id);
    expect(prior.revoked_at).toBeGreaterThan(0);
    await expect(activeDeviceCount(accountB.accountId)).resolves.toBe(1);
    await expect(activeDeviceCount(accountA.accountId)).resolves.toBe(1);
  });

  it('hardcodes sandbox even when production is smuggled into the form', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const response = await worker.fetch(confirmRequest({
      cookie: session.cookie,
      extraForm: { push_token_env: 'production' },
    }), testEnv);
    const payload = await pollPushHandoff({ testEnv, nonce: VALID_NONCE });
    const device = await deviceRow(payload.device_id);

    expect(response.status).toBe(200);
    expect(device.push_token_env).toBe('sandbox');
  });

  it('keeps the same device id when the handoff insert fails and the user retries', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const failingEnv = failOnceOnSql(testEnv, /INSERT INTO service_handoffs/i);

    const first = await worker.fetch(confirmRequest({ cookie: session.cookie }), failingEnv);
    const deviceAfterFailure = (await devicesForToken(DEVICE_TOKEN))[0];
    const second = await worker.fetch(confirmRequest({ cookie: session.cookie, nonce: OTHER_NONCE }), testEnv);
    const payload = await pollPushHandoff({ testEnv, nonce: OTHER_NONCE });

    expect(first.status).toBe(503);
    expect(second.status).toBe(200);
    expect(payload.device_id).toBe(deviceAfterFailure.device_id);
    await expect(activeDeviceCount(account.accountId)).resolves.toBe(1);
    await expect(dispatchTokenCount(account.accountId)).resolves.toBe(2);
  });
});

function pushUrl(overrides = {}) {
  const params = new URLSearchParams({
    nonce: VALID_NONCE,
    device_token: DEVICE_TOKEN,
    platform: 'ios',
    bundle_id: BUNDLE_ID,
    ...overrides,
  });
  return `https://services.solstone.app/enable/push?${params.toString()}`;
}

function confirmRequest({
  cookie,
  nonce = VALID_NONCE,
  deviceToken = DEVICE_TOKEN,
  platform = 'ios',
  bundleId = BUNDLE_ID,
  action = 'allow',
  csrf = TEST_CSRF,
  origin = 'https://services.solstone.app',
  extraForm = {},
} = {}) {
  const body = new URLSearchParams({
    csrf,
    nonce,
    device_token: deviceToken,
    platform,
    bundle_id: bundleId,
    action,
    ...extraForm,
  });
  const headers = {
    Origin: origin,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (cookie) headers.Cookie = cookie;
  return new Request('https://services.solstone.app/enable/push/confirm', {
    method: 'POST',
    headers,
    body,
  });
}

async function confirmAndPoll({ testEnv, cookie, nonce, deviceToken }) {
  const response = await worker.fetch(confirmRequest({ cookie, nonce, deviceToken }), testEnv);
  expect(response.status).toBe(200);
  return pollPushHandoff({ testEnv, nonce });
}

async function pollPushHandoff({ testEnv, nonce }) {
  const response = await worker.fetch(new Request(`https://services.solstone.app/handoff/push?nonce=${nonce}`), testEnv);
  expect(response.status).toBe(200);
  return response.json();
}

async function serviceHandoffRow(nonce, testEnv) {
  return workerEnv.DB
    .prepare('SELECT payload_encrypted FROM service_handoffs WHERE handoff_hash = ? AND service = ?')
    .bind(await hashServiceHandoffNonce(nonce, testEnv), 'push')
    .first();
}

async function deviceRow(deviceId) {
  return workerEnv.DB
    .prepare(
      `SELECT device_id, account_id, push_token, push_token_env, bundle_id, revoked_at
       FROM account_devices
       WHERE device_id = ?`
    )
    .bind(deviceId)
    .first();
}

async function devicesForToken(deviceToken) {
  const { results } = await workerEnv.DB
    .prepare(
      `SELECT device_id, account_id, revoked_at
       FROM account_devices
       WHERE push_token = ?
       ORDER BY registered_at ASC`
    )
    .bind(deviceToken)
    .all();
  return results || [];
}

async function activeDeviceCount(accountId) {
  const row = await workerEnv.DB
    .prepare('SELECT COUNT(*) AS count FROM account_devices WHERE account_id = ? AND revoked_at IS NULL')
    .bind(accountId)
    .first();
  return row.count;
}

async function dispatchTokenCount(accountId) {
  const row = await workerEnv.DB
    .prepare('SELECT COUNT(*) AS count FROM account_dispatch_tokens WHERE account_id = ?')
    .bind(accountId)
    .first();
  return row.count;
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
