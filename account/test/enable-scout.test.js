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
const SECOND_NONCE = '3'.repeat(52);
const THIRD_NONCE = '4'.repeat(52);
const FOURTH_NONCE = '5'.repeat(52);

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
    expect(body).toContain('href="/portal.css?v=2"');
    expect(body).toContain('solstone on this device wants to enable scout for you.');
    expect(body).toContain(`name="nonce" value="${VALID_NONCE}"`);
    expect(body).toContain(`name="account_id" value="${account.accountId}"`);
    expect(body).toContain('<label class="ack">');
    expect(body).toContain('name="data_ack" value="yes" required');
    expect(body).toContain('<span>i understand</span>');
    expect(body).toContain('name="use_case"');
    expect(body).toContain('name="action" value="cancel" type="submit" formnovalidate');
  });

  it('confirms consent, stores the encrypted handoff, and exposes it once by nonce', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedProvisionedKey({ testEnv, accountId: account.accountId, keyString: 'existing-google-key' });
    await seedScoutApplication({
      accountId: account.accountId,
      status: 'approved',
      data_acked_at: 1_000,
      approved_at: 1_000,
    });
    try {
      const confirm = await confirmNonce({ testEnv, cookie: session.cookie, accountId: account.accountId });
      const handoff = await worker.fetch(
        new Request(`https://services.solstone.app/handoff/scout?nonce=${VALID_NONCE}`),
        testEnv
      );
      const payload = await handoff.json();

      expect(confirm.status).toBe(200);
      expect(confirm.headers.get('Cache-Control')).toBe('no-store');
      expect(await confirm.text()).toContain('scout enabled');
      await expect(rowCount('service_handoffs')).resolves.toBe(1);
      expect(handoff.status).toBe(200);
      expect(handoff.headers.get('Cache-Control')).toBe('no-store');
      expect(handoff.headers.has('Set-Cookie')).toBe(false);
      expect(handoff.headers.has('Vary')).toBe(false);
      expect(payload).toEqual({
        state: 'approved',
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
    await seedScoutApplication({
      accountId: account.accountId,
      status: 'approved',
      data_acked_at: 1_000,
      approved_at: 1_000,
    });
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
      expect(payload.state).toBe('approved');
      expect(payload.google_api_key).toBe('partial-google-key');
      spy.assertNoSecrets([VALID_NONCE, 'partial-google-key', payload.dispatch_token]);
    } finally {
      spy.restore();
    }
  });

  it('rejects missing data acknowledgment before provisioning or Scout application changes', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({
      accountId: account.accountId,
      status: 'approved',
      data_acked_at: 1_000,
      approved_at: 1_000,
    });
    const before = await applicationRow(account.accountId);
    const gcp = installProvisioningMock('unused-google-key');

    const response = await confirmNonce({
      testEnv,
      cookie: session.cookie,
      accountId: account.accountId,
      dataAck: null,
    });

    expect(response.status).toBe(400);
    await expect(applicationRow(account.accountId)).resolves.toEqual(before);
    await expect(rowCount('provisioned_keys')).resolves.toBe(0);
    await expect(rowCount('service_handoffs')).resolves.toBe(0);
    expect(gcp.createCalls).toBe(0);
  });

  it('honors cancel without acknowledgement or a session before any write', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });

    const response = await confirmNonce({
      testEnv,
      cookie: null,
      accountId: account.accountId,
      action: 'cancel',
      dataAck: null,
    });

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(rowCount('scout_applications')).resolves.toBe(0);
    await expect(rowCount('scout_lifecycle_events')).resolves.toBe(0);
    await expect(rowCount('provisioned_keys')).resolves.toBe(0);
    await expect(rowCount('service_handoffs')).resolves.toBe(0);
  });

  it.each([null, '', 'no', '1', 'YES'])(
    'rejects missing or non-exact data acknowledgement %j before creating an application',
    async (dataAck) => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });

      const response = await confirmNonce({
        testEnv,
        cookie: session.cookie,
        accountId: account.accountId,
        dataAck,
      });

      expect(response.status).toBe(400);
      await expect(rowCount('scout_applications')).resolves.toBe(0);
      await expect(rowCount('scout_lifecycle_events')).resolves.toBe(0);
      await expect(rowCount('provisioned_keys')).resolves.toBe(0);
      await expect(rowCount('service_handoffs')).resolves.toBe(0);
    }
  );

  it.each(['', 'no', '1', 'YES'])(
    'rejects non-exact data acknowledgement %j for an approved unacked application',
    async (dataAck) => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      await seedScoutApplication({
        accountId: account.accountId,
        status: 'approved',
        approved_at: 1_000,
      });
      const before = await applicationRow(account.accountId);

      const response = await confirmNonce({
        testEnv,
        cookie: session.cookie,
        accountId: account.accountId,
        dataAck,
      });

      expect(response.status).toBe(400);
      await expect(applicationRow(account.accountId)).resolves.toEqual(before);
      await expect(rowCount('scout_applications')).resolves.toBe(1);
      await expect(rowCount('scout_lifecycle_events')).resolves.toBe(0);
      await expect(rowCount('provisioned_keys')).resolves.toBe(0);
      await expect(rowCount('service_handoffs')).resolves.toBe(0);
    }
  );

  it('records a pending application without provisioning when no application exists', async () => {
    const nowMs = 1_780_000_100_000;
    vi.spyOn(Date, 'now').mockReturnValue(nowMs);
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    try {
      const confirm = await confirmNonce({
        testEnv,
        cookie: session.cookie,
        accountId: account.accountId,
        useCase: 'local research',
      });
      const body = await confirm.text();
      const row = await applicationRow(account.accountId);
      const event = await lifecycleEvent(account.accountId);
      const { response: handoff, payload } = await readHandoff(testEnv);

      expect(confirm.status).toBe(200);
      expect(body).toContain('scout request received');
      expect(row).toMatchObject({
        account_id: account.accountId,
        status: 'pending',
        use_case: 'local research',
        applied_at: expect.any(Number),
        data_acked_at: expect.any(Number),
      });
      expect(event).toMatchObject({
        action: 'apply',
        actor_kind: 'owner',
        actor_principal: account.accountId,
        occurred_at: nowMs,
      });
      expect(event.occurred_at).toBe(row.applied_at);
      expect(event.occurred_at).toBe(row.created_at);
      expect(event.occurred_at).toBe(row.updated_at);
      expect(handoff.status).toBe(200);
      expect(payload).toEqual({
        state: 'pending',
        account_id: account.accountId,
        since: row.applied_at,
        dispatch_token: expect.stringMatching(/^[A-Za-z0-9_-]+$/),
      });
      await expect(rowCount('provisioned_keys')).resolves.toBe(0);
      spy.assertNoSecrets([VALID_NONCE, payload.dispatch_token]);
    } finally {
      spy.restore();
    }
  });

  it('returns the global error page without a success handoff when the apply batch fails', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const failingEnv = withFailingBatch(testEnv);
    try {
      const confirm = await confirmNonce({
        testEnv: failingEnv,
        cookie: session.cookie,
        accountId: account.accountId,
      });

      expect(confirm.status).toBe(500);
      expect(confirm.headers.get('Content-Type')).toContain('text/html');
      expect(await confirm.text()).toContain("that link didn't work");
      await expect(rowCount('scout_applications')).resolves.toBe(0);
      await expect(rowCount('scout_lifecycle_events')).resolves.toBe(0);
      await expect(rowCount('service_handoffs')).resolves.toBe(0);
    } finally {
      spy.restore();
    }
  });

  it('refreshes pending applications idempotently and keeps the original since timestamp', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({
      accountId: account.accountId,
      status: 'pending',
      use_case: 'existing use',
      data_acked_at: 1_000,
      applied_at: 900,
      created_at: 900,
      updated_at: 1_000,
    });
    try {
      const confirm = await confirmNonce({
        testEnv,
        cookie: session.cookie,
        accountId: account.accountId,
        useCase: '',
      });
      const row = await applicationRow(account.accountId);
      const { payload } = await readHandoff(testEnv);

      expect(confirm.status).toBe(200);
      await expect(rowCount('scout_applications')).resolves.toBe(1);
      expect(row).toMatchObject({
        status: 'pending',
        use_case: 'existing use',
        applied_at: 900,
        created_at: 900,
        data_acked_at: expect.any(Number),
        updated_at: expect.any(Number),
      });
      expect(row.data_acked_at).toBeGreaterThan(1_000);
      expect(row.updated_at).toBeGreaterThan(1_000);
      await expect(rowCount('scout_lifecycle_events')).resolves.toBe(0);
      expect(payload).toEqual({
        state: 'pending',
        account_id: account.accountId,
        since: 900,
        dispatch_token: expect.stringMatching(/^[A-Za-z0-9_-]+$/),
      });
      await expect(rowCount('provisioned_keys')).resolves.toBe(0);
      spy.assertNoSecrets([VALID_NONCE, payload.dispatch_token]);
    } finally {
      spy.restore();
    }
  });

  it('handles concurrent first confirms with one pending application row', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const [first, second] = await Promise.all([
      confirmNonce({ testEnv, cookie: session.cookie, accountId: account.accountId, nonce: SECOND_NONCE }),
      confirmNonce({ testEnv, cookie: session.cookie, accountId: account.accountId, nonce: THIRD_NONCE }),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.text()).toContain('scout request received');
    expect(await second.text()).toContain('scout request received');
    await expect(rowCount('scout_applications')).resolves.toBe(1);
    await expect(applicationRow(account.accountId)).resolves.toMatchObject({ status: 'pending' });
    await expect(rowCount('provisioned_keys')).resolves.toBe(0);
  });

  it('provisions approved acked applications in the configured Scout project and reuses the key', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv({ SCOUT_GCP_PROJECT: 'scout-enable-project' });
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({
      accountId: account.accountId,
      status: 'approved',
      data_acked_at: 1_000,
      approved_at: 1_000,
    });
    const gcp = installProvisioningMock({
      keyString: 'scout-project-google-key',
      projectId: 'scout-enable-project',
    });
    try {
      const first = await confirmNonce({ testEnv, cookie: session.cookie, accountId: account.accountId });
      const firstHandoff = await readHandoff(testEnv);
      const second = await confirmNonce({
        testEnv,
        cookie: session.cookie,
        accountId: account.accountId,
        nonce: FOURTH_NONCE,
      });
      const secondHandoff = await readHandoff(testEnv, FOURTH_NONCE);
      const row = await applicationRow(account.accountId);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(firstHandoff.payload).toMatchObject({
        state: 'approved',
        google_api_key: 'scout-project-google-key',
        account_id: account.accountId,
      });
      expect(secondHandoff.payload).toMatchObject({
        state: 'approved',
        google_api_key: 'scout-project-google-key',
        account_id: account.accountId,
      });
      expect(gcp.createCalls).toBe(1);
      expect(gcp.calls.some(({ method, url }) => (
        method === 'POST' &&
        url.host === 'apikeys.googleapis.com' &&
        url.pathname === '/v2/projects/scout-enable-project/locations/global/keys'
      ))).toBe(true);
      expect(row.data_acked_at).toBe(1_000);
      spy.assertNoSecrets([
        VALID_NONCE,
        FOURTH_NONCE,
        'scout-project-google-key',
        firstHandoff.payload.dispatch_token,
        secondHandoff.payload.dispatch_token,
      ]);
    } finally {
      spy.restore();
    }
  });

  it('acks and provisions approved unacked applications when consent includes the data acknowledgment', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({
      accountId: account.accountId,
      status: 'approved',
      approved_at: 1_000,
    });
    const gcp = installProvisioningMock('unacked-approved-google-key');
    try {
      const confirm = await confirmNonce({ testEnv, cookie: session.cookie, accountId: account.accountId });
      const row = await applicationRow(account.accountId);
      const { payload } = await readHandoff(testEnv);

      expect(confirm.status).toBe(200);
      expect(row.data_acked_at).toEqual(expect.any(Number));
      expect(row.approved_at).toBe(1_000);
      expect(gcp.createCalls).toBe(1);
      expect(payload).toMatchObject({
        state: 'approved',
        google_api_key: 'unacked-approved-google-key',
        account_id: account.accountId,
      });
      spy.assertNoSecrets([VALID_NONCE, 'unacked-approved-google-key', payload.dispatch_token]);
    } finally {
      spy.restore();
    }
  });

  it('does not ack or provision approved unacked applications without data acknowledgment', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({
      accountId: account.accountId,
      status: 'approved',
      approved_at: 1_000,
    });
    const gcp = installProvisioningMock('unreachable-google-key');

    const confirm = await confirmNonce({
      testEnv,
      cookie: session.cookie,
      accountId: account.accountId,
      dataAck: null,
    });

    expect(confirm.status).toBe(400);
    await expect(applicationRow(account.accountId)).resolves.toMatchObject({
      status: 'approved',
      data_acked_at: null,
      approved_at: 1_000,
    });
    await expect(rowCount('scout_applications')).resolves.toBe(1);
    await expect(rowCount('scout_lifecycle_events')).resolves.toBe(0);
    await expect(rowCount('provisioned_keys')).resolves.toBe(0);
    await expect(rowCount('service_handoffs')).resolves.toBe(0);
    expect(gcp.createCalls).toBe(0);
  });

  it('renders the pending done page on same-nonce pending double submits', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const first = await confirmNonce({ testEnv, cookie: session.cookie, accountId: account.accountId });
    const second = await confirmNonce({ testEnv, cookie: session.cookie, accountId: account.accountId });
    const firstBody = await first.text();
    const secondBody = await second.text();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstBody).toContain('scout request received');
    expect(secondBody).toContain('scout request received');
    expect(secondBody).not.toContain('scout enabled');
    await expect(rowCount('scout_applications')).resolves.toBe(1);
  });

  it('returns revoked handoff state without provisioning when Scout is unavailable for the account', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({
      accountId: account.accountId,
      status: 'revoked',
      revoked_at: 1_000,
    });
    const gcp = installProvisioningMock('unreachable-google-key');

    const confirm = await confirmNonce({ testEnv, cookie: session.cookie, accountId: account.accountId });
    const body = await confirm.text();
    const { response: handoff, payload } = await readHandoff(testEnv);

    expect(confirm.status).toBe(200);
    expect(body).toContain("scout isn't available");
    expect(handoff.status).toBe(200);
    expect(payload).toEqual({ state: 'revoked', account_id: account.accountId });
    await expect(rowCount('provisioned_keys')).resolves.toBe(0);
    expect(gcp.createCalls).toBe(0);
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

function confirmNonce({
  testEnv,
  cookie,
  accountId,
  nonce = VALID_NONCE,
  action = 'allow',
  dataAck = 'yes',
  useCase = '',
}) {
  const body = new URLSearchParams({
    csrf: TEST_CSRF,
    nonce,
    account_id: accountId,
    action,
  });
  if (dataAck !== null) body.set('data_ack', dataAck);
  if (useCase !== undefined) body.set('use_case', useCase);
  const headers = {
    Origin: 'https://services.solstone.app',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (cookie) headers.Cookie = cookie;
  return worker.fetch(new Request('https://services.solstone.app/enable/scout/confirm', {
    method: 'POST',
    headers,
    body,
  }), testEnv);
}

async function readHandoff(testEnv, nonce = VALID_NONCE) {
  const response = await worker.fetch(
    new Request(`https://services.solstone.app/handoff/scout?nonce=${nonce}`),
    testEnv
  );
  return { response, payload: await response.json() };
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

async function seedScoutApplication({
  accountId,
  status,
  use_case = null,
  data_acked_at = null,
  applied_at = null,
  approved_at = null,
  revoked_at = null,
  created_at = 1_000,
  updated_at = created_at,
}) {
  await workerEnv.DB
    .prepare(
      `INSERT INTO scout_applications (
         account_id, status, use_case, data_acked_at, applied_at,
         approved_at, revoked_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(accountId, status, use_case, data_acked_at, applied_at, approved_at, revoked_at, created_at, updated_at)
    .run();
}

async function applicationRow(accountId) {
  return workerEnv.DB
    .prepare(
      `SELECT account_id, status, use_case, data_acked_at, applied_at,
              approved_at, revoked_at, created_at, updated_at
       FROM scout_applications
       WHERE account_id = ?`
    )
    .bind(accountId)
    .first();
}

async function lifecycleEvent(accountId) {
  return workerEnv.DB
    .prepare('SELECT * FROM scout_lifecycle_events WHERE account_id = ? ORDER BY sequence')
    .bind(accountId)
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

function withFailingBatch(testEnv) {
  return {
    ...testEnv,
    DB: {
      prepare: (...args) => testEnv.DB.prepare(...args),
      batch() {
        throw new Error('injected batch failure');
      },
    },
  };
}

function installProvisioningMock(options) {
  const keyString = typeof options === 'string' ? options : options.keyString;
  const projectId = typeof options === 'string' ? 'test-gcp-project' : options.projectId || 'test-gcp-project';
  const state = { calls: [], createCalls: 0 };
  vi.stubGlobal('fetch', vi.fn(async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = (init.method || 'GET').toUpperCase();
    state.calls.push({ method, url, init });
    const key = `${method} ${url.host}${url.pathname}`;
    if (key === 'POST oauth2.googleapis.com/token') {
      return jsonResponse({ access_token: 'gcp-access-token', expires_in: 3600, token_type: 'Bearer' });
    }
    if (key === `GET apikeys.googleapis.com/v2/projects/${projectId}/locations/global/keys`) {
      return jsonResponse({ keys: [] });
    }
    if (key === `POST apikeys.googleapis.com/v2/projects/${projectId}/locations/global/keys`) {
      state.createCalls += 1;
      return jsonResponse({ name: 'operations/create-enable-scout' });
    }
    if (key === 'GET apikeys.googleapis.com/v2/operations/create-enable-scout') {
      return jsonResponse({ done: true, response: { name: `projects/${projectId}/locations/global/keys/enable-scout` } });
    }
    if (key === `GET apikeys.googleapis.com/v2/projects/${projectId}/locations/global/keys/enable-scout/keyString`) {
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
