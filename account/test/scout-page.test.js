import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { getScoutApplicationByAccount } from '../src/db.js';
import { makeTestEnv, resetDb, seedAccount, seedSession } from './helpers.js';

describe('scout page', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serves the public scout landing for a signed-out GET /scout', async () => {
    const response = await worker.fetch(settingsGet('/scout'), makeTestEnv());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<h1>scout</h1>');
    expect(body).toContain('scout is the tester program. approved scouts can enable confidential processing from the journal and share feedback that helps shape solstone.');
  });

  it('renders a revoked application as terminal', async () => {
    const { testEnv, account, session } = await signedInScout();
    await seedScoutApplication({
      testEnv,
      accountId: account.accountId,
      status: 'revoked',
      revoked_at: 2_000,
    });

    const response = await worker.fetch(settingsGet('/scout', { cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('scout access for this sign-in has ended.');
    expect(body).not.toContain('action="/scout/apply"');
  });

  it('renders an approved unacked application with the covenant affirmation', async () => {
    const { testEnv, account, session } = await signedInScout();
    await seedScoutApplication({
      testEnv,
      accountId: account.accountId,
      status: 'approved',
      approved_at: 2_000,
    });

    const response = await worker.fetch(settingsGet('/scout', { cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('approved</span> &nbsp;scout access is approved for this sign-in');
    expect(body).toContain('confidential processing is available to approved scouts. enable it from the journal.');
    expect(body).toContain('confirm the scout covenant');
    expect(body).toContain('action="/scout/apply"');
    expect(body).toContain('name="data_ack" value="yes" required');
    expect(body).not.toContain('name="use_case"');
  });

  it('renders an approved acked application without the covenant affirmation', async () => {
    const { testEnv, account, session } = await signedInScout();
    await seedScoutApplication({
      testEnv,
      accountId: account.accountId,
      status: 'approved',
      data_acked_at: 1_500,
      approved_at: 2_000,
    });

    const response = await worker.fetch(settingsGet('/scout', { cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('confidential processing is available to approved scouts. enable it from the journal.');
    expect(body).not.toContain('action="/scout/apply"');
    expect(body).not.toContain('name="data_ack"');
    expect(body).not.toContain('confirm the scout covenant');
  });

  it('renders a pending application with relative applied status and no actions', async () => {
    const now = 1_780_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const { testEnv, account, session } = await signedInScout();
    await seedScoutApplication({
      testEnv,
      accountId: account.accountId,
      status: 'pending',
      applied_at: now - 3 * 60_000,
      created_at: now - 3 * 60_000,
      updated_at: now - 3 * 60_000,
    });

    const response = await worker.fetch(settingsGet('/scout', { cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('pending, applied 3 minutes ago');
    expect(body).toContain('your scout request is under review.');
    expect(body).not.toContain('action="/scout/apply"');
  });

  it('renders the no-application state with the apply form', async () => {
    const { testEnv, session } = await signedInScout();

    const response = await worker.fetch(settingsGet('/scout', { cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('request scout access for this sign-in. approved scouts can enable confidential processing from the journal and share feedback that helps shape solstone.');
    expect(body).toContain('action="/scout/apply"');
    expect(body).toContain('name="data_ack" value="yes" required');
    expect(body).toContain('name="use_case"');
  });

  it('keeps release notes and feedback links in every scout state', async () => {
    const testEnv = makeTestEnv();
    const states = [
      null,
      { status: 'pending', applied_at: 1_000 },
      { status: 'approved', data_acked_at: 1_000, approved_at: 1_000 },
      { status: 'revoked', revoked_at: 1_000 },
    ];

    for (const [index, state] of states.entries()) {
      const account = await seedAccount({ email: `state-${index}@example.com`, testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      if (state) await seedScoutApplication({ testEnv, accountId: account.accountId, ...state });
      const response = await worker.fetch(settingsGet('/scout', { cookie: session.cookie }), testEnv);
      const body = await response.text();
      expect(body).toContain('href="https://solstone.app/releases"');
      expect(body).toContain('href="/support"');
    }
  });

  it('creates a pending application from the apply form', async () => {
    const now = 1_780_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const { testEnv, account, session } = await signedInScout();

    const response = await worker.fetch(settingsPost('/scout/apply', {
      cookie: session.cookie,
      body: { data_ack: 'yes', use_case: ' local research ' },
    }), testEnv);
    const row = await getScoutApplicationByAccount(testEnv.DB, { accountId: account.accountId });
    const event = await lifecycleEvent(testEnv, account.accountId);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/scout?apply=ok');
    expect(row).toMatchObject({
      account_id: account.accountId,
      status: 'pending',
      use_case: 'local research',
      data_acked_at: now,
      applied_at: now,
    });
    expect(event).toMatchObject({
      action: 'apply',
      actor_kind: 'owner',
      actor_principal: account.accountId,
      occurred_at: now,
    });
  });

  it('returns the global error page without a success redirect when the apply batch fails', async () => {
    const { testEnv, session } = await signedInScout();

    const response = await worker.fetch(settingsPost('/scout/apply', {
      cookie: session.cookie,
      body: { data_ack: 'yes' },
    }), withFailingBatch(testEnv));

    expect(response.status).toBe(500);
    expect(response.headers.get('Location')).toBeNull();
    expect(response.headers.get('Content-Type')).toContain('text/html');
    await expect(response.text()).resolves.toContain("that link didn't work");
    await expect(rowCount(testEnv, 'scout_applications')).resolves.toBe(0);
    await expect(rowCount(testEnv, 'scout_lifecycle_events')).resolves.toBe(0);
  });

  it('does not write an application when apply lacks data acknowledgement', async () => {
    const { testEnv, account, session } = await signedInScout();

    const response = await worker.fetch(settingsPost('/scout/apply', {
      cookie: session.cookie,
      body: { use_case: 'local research' },
    }), testEnv);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/scout?apply=no_ack');
    expect(await getScoutApplicationByAccount(testEnv.DB, { accountId: account.accountId })).toBeNull();
  });

  it.each(['', 'no', '1', 'YES'])(
    'does not create an application for non-exact data acknowledgement %j',
    async (dataAck) => {
      const { testEnv, account, session } = await signedInScout();

      const response = await worker.fetch(settingsPost('/scout/apply', {
        cookie: session.cookie,
        body: { data_ack: dataAck, use_case: 'local research' },
      }), testEnv);

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/scout?apply=no_ack');
      expect(await getScoutApplicationByAccount(testEnv.DB, { accountId: account.accountId })).toBeNull();
    }
  );

  it.each([null, '', 'no', '1', 'YES'])(
    'does not ack an approved application for missing or non-exact data acknowledgement %j',
    async (dataAck) => {
      const { testEnv, account, session } = await signedInScout();
      await seedScoutApplication({
        testEnv,
        accountId: account.accountId,
        status: 'approved',
        approved_at: 1_000,
      });
      const before = await getScoutApplicationByAccount(testEnv.DB, { accountId: account.accountId });

      const response = await worker.fetch(settingsPost('/scout/apply', {
        cookie: session.cookie,
        body: dataAck === null ? {} : { data_ack: dataAck },
      }), testEnv);

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/scout?apply=no_ack');
      await expect(getScoutApplicationByAccount(testEnv.DB, { accountId: account.accountId })).resolves.toEqual(before);
    }
  );

  it('rejects apply from a bad origin without writing', async () => {
    const { testEnv, account, session } = await signedInScout();

    const response = await worker.fetch(settingsPost('/scout/apply', {
      cookie: session.cookie,
      origin: 'https://evil.example',
      body: { data_ack: 'yes', use_case: 'local research' },
    }), testEnv);

    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await getScoutApplicationByAccount(testEnv.DB, { accountId: account.accountId })).toBeNull();
  });

  it('affirms an approved unacked application', async () => {
    const now = 1_780_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const { testEnv, account, session } = await signedInScout();
    await seedScoutApplication({
      testEnv,
      accountId: account.accountId,
      status: 'approved',
      approved_at: 1_000,
    });

    const response = await worker.fetch(settingsPost('/scout/apply', {
      cookie: session.cookie,
      body: { data_ack: 'yes' },
    }), testEnv);
    const row = await getScoutApplicationByAccount(testEnv.DB, { accountId: account.accountId });

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/scout?apply=acked');
    expect(row).toMatchObject({ status: 'approved', data_acked_at: now, approved_at: 1_000 });
  });

  it('returns not found for removed scout key-management routes', async () => {
    const { testEnv, session } = await signedInScout();

    for (const path of ['/scout/reveal', '/scout/ack', '/scout/rotate', '/scout/forget', '/scout/disable']) {
      const response = await worker.fetch(settingsPost(path, { cookie: session.cookie }), testEnv);
      expect(response.status).toBe(404);
      expect(response.headers.get('Location')).toBeNull();
    }
  });

  it('isolates scout application changes to the signed-in account', async () => {
    const testEnv = makeTestEnv();
    const accountA = await seedAccount({ email: 'a@example.com', testEnv });
    const accountB = await seedAccount({ email: 'b@example.com', testEnv });
    const sessionB = await seedSession(accountB.accountId, { testEnv });
    await seedScoutApplication({
      testEnv,
      accountId: accountA.accountId,
      status: 'pending',
      use_case: 'account a',
      applied_at: 1_000,
    });

    const response = await worker.fetch(settingsPost('/scout/apply', {
      cookie: sessionB.cookie,
      body: { data_ack: 'yes', use_case: 'account b' },
    }), testEnv);

    expect(response.status).toBe(303);
    await expect(getScoutApplicationByAccount(testEnv.DB, { accountId: accountA.accountId }))
      .resolves.toMatchObject({ status: 'pending', use_case: 'account a' });
    await expect(getScoutApplicationByAccount(testEnv.DB, { accountId: accountB.accountId }))
      .resolves.toMatchObject({ status: 'pending', use_case: 'account b' });
  });
});

async function signedInScout() {
  const testEnv = makeTestEnv();
  const account = await seedAccount({ testEnv });
  const session = await seedSession(account.accountId, { testEnv });
  return { testEnv, account, session };
}

function settingsGet(path, { cookie } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  return new Request(`https://services.solstone.app${path}`, { headers });
}

function settingsPost(path, { cookie, body = {}, origin = 'https://services.solstone.app' } = {}) {
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (origin !== null) headers.Origin = origin;
  if (cookie) headers.Cookie = cookie;
  return new Request(`https://services.solstone.app${path}`, {
    method: 'POST',
    headers,
    body: new URLSearchParams(body),
  });
}

async function seedScoutApplication({
  testEnv,
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
  await testEnv.DB
    .prepare(
      `INSERT INTO scout_applications (
         account_id, status, use_case, data_acked_at, applied_at,
         approved_at, revoked_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(accountId, status, use_case, data_acked_at, applied_at, approved_at, revoked_at, created_at, updated_at)
    .run();
}

async function lifecycleEvent(testEnv, accountId) {
  return testEnv.DB
    .prepare('SELECT * FROM scout_lifecycle_events WHERE account_id = ? ORDER BY sequence')
    .bind(accountId)
    .first();
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

async function rowCount(testEnv, table) {
  const row = await testEnv.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
  return row.count;
}
