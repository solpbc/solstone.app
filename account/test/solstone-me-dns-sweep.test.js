import { createExecutionContext, env as workerEnv, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { runSolstoneMeOrphanDnsSweep } from '../src/solstone-me-dns-sweep.js';
import { installFakeSolstoneMeZone } from './fake-solstone-me-zone.js';
import {
  installConsoleSpy,
  installStripeFetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
} from './helpers.js';

const TEST_ZONE_ID = 'TEST_ZONE_ID_DO_NOT_LOG';
const TEST_TOKEN = 'TEST_DNS_TOKEN_DO_NOT_LOG';
const TEST_ACME_URI = 'https://acme.example/TEST_ACME_URI_DO_NOT_LOG';

function testEnv(overrides = {}) {
  return makeTestEnv({
    SOLSTONE_ME_ZONE_ID: TEST_ZONE_ID,
    SOLSTONE_ME_DNS_API_TOKEN: TEST_TOKEN,
    ...overrides,
  });
}

function caaData(uri = TEST_ACME_URI) {
  return {
    flags: 0,
    tag: 'issue',
    value: `letsencrypt.org; accounturi=${uri}; validationmethods=tls-alpn-01`,
  };
}

function stripeJson(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('solstone.me orphan DNS sweep', () => {
  let fakeZone;
  beforeEach(async () => {
    await resetDb();
    fakeZone = installFakeSolstoneMeZone({ zoneId: TEST_ZONE_ID });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('deletes orphan CAA+A records, preserves live binding records, and issues no batch on second run', async () => {
    const env = testEnv();
    const account = await seedAccount({ email: 'sweep-test@example.com', testEnv: env });

    // Seed ledger with both labels
    await workerEnv.DB.prepare('INSERT INTO mcp_bridge_hostname_ledger (label, created_at) VALUES (?, ?)')
      .bind('liveaaaa', 1000).run();
    await workerEnv.DB.prepare('INSERT INTO mcp_bridge_hostname_ledger (label, created_at) VALUES (?, ?)')
      .bind('orphaaaa', 1000).run();

    // Seed live binding (only for liveaaaa)
    await workerEnv.DB.prepare(
      'INSERT INTO mcp_bridge_bindings (account_id, instance_id, label, created_at, acme_account_uri) VALUES (?, ?, ?, ?, ?)'
    ).bind(account.accountId, 'inst-1', 'liveaaaa', 1000, TEST_ACME_URI).run();

    // Add DNS records
    const liveCaa = fakeZone.addRecord({ name: 'liveaaaa.solstone.me', type: 'CAA', data: caaData() });
    const liveA = fakeZone.addRecord({ name: 'liveaaaa.solstone.me', type: 'A', content: '20.186.92.169' });
    fakeZone.addRecord({ name: 'orphaaaa.solstone.me', type: 'CAA', data: caaData() });
    fakeZone.addRecord({ name: 'orphaaaa.solstone.me', type: 'A', content: '20.186.92.169' });

    await runSolstoneMeOrphanDnsSweep(env);

    // Live records remain intact with same IDs
    const records = fakeZone.getRecords();
    expect(records.find((r) => r.id === liveCaa.id)).toBeDefined();
    expect(records.find((r) => r.id === liveA.id)).toBeDefined();
    // Orphan records are gone
    expect(records.filter((r) => r.name === 'orphaaaa.solstone.me')).toHaveLength(0);

    // Second run issues no batches
    let batchCalled = false;
    fakeZone.beforeBatch(() => { batchCalled = true; });
    await runSolstoneMeOrphanDnsSweep(env);
    expect(batchCalled).toBe(false);
  });

  it('preserves records when hooks.afterClassify inserts the binding row before batching', async () => {
    const env = testEnv();
    const account = await seedAccount({ email: 'race-test@example.com', testEnv: env });

    await workerEnv.DB.prepare('INSERT INTO mcp_bridge_hostname_ledger (label, created_at) VALUES (?, ?)')
      .bind('raceaaaa', 1000).run();

    const caa = fakeZone.addRecord({ name: 'raceaaaa.solstone.me', type: 'CAA', data: caaData() });
    const a = fakeZone.addRecord({ name: 'raceaaaa.solstone.me', type: 'A', content: '20.186.92.169' });

    let batchCalled = false;
    fakeZone.beforeBatch(() => { batchCalled = true; });

    await runSolstoneMeOrphanDnsSweep(env, {
      afterClassify: async (orphans) => {
        expect(orphans).toContain('raceaaaa.solstone.me');
        await workerEnv.DB.prepare(
          'INSERT INTO mcp_bridge_bindings (account_id, instance_id, label, created_at, acme_account_uri) VALUES (?, ?, ?, ?, ?)'
        ).bind(account.accountId, 'inst-race', 'raceaaaa', 2000, TEST_ACME_URI).run();
      },
    });

    expect(batchCalled).toBe(false);
    const records = fakeZone.getRecords('raceaaaa.solstone.me');
    expect(records.find((r) => r.id === caa.id)).toBeDefined();
    expect(records.find((r) => r.id === a.id)).toBeDefined();
  });

  it('preserves protected names, unledgered names, live binding records, and orphan TXT records', async () => {
    const env = testEnv();
    const account = await seedAccount({ email: 'names-test@example.com', testEnv: env });

    await workerEnv.DB.prepare('INSERT INTO mcp_bridge_hostname_ledger (label, created_at) VALUES (?, ?)')
      .bind('livebbbb', 1000).run();
    await workerEnv.DB.prepare('INSERT INTO mcp_bridge_hostname_ledger (label, created_at) VALUES (?, ?)')
      .bind('orphbbbb', 1000).run();

    await workerEnv.DB.prepare(
      'INSERT INTO mcp_bridge_bindings (account_id, instance_id, label, created_at, acme_account_uri) VALUES (?, ?, ?, ?, ?)'
    ).bind(account.accountId, 'inst-2', 'livebbbb', 1000, TEST_ACME_URI).run();

    // Protected names
    const apexA = fakeZone.addRecord({ name: 'solstone.me', type: 'A', content: '1.2.3.4' });
    const wwwA = fakeZone.addRecord({ name: 'www.solstone.me', type: 'A', content: '1.2.3.4' });
    const bridgeA = fakeZone.addRecord({ name: 'bridge.solstone.me', type: 'A', content: '1.2.3.4' });
    const wildA = fakeZone.addRecord({ name: '*.solstone.me', type: 'A', content: '1.2.3.4' });

    // Unledgered name (8 chars, valid pattern, but absent from ledger)
    const unledgeredA = fakeZone.addRecord({ name: 'unledger.solstone.me', type: 'A', content: '1.2.3.4' });

    // Live binding with mismatched records
    const liveBadA = fakeZone.addRecord({ name: 'livebbbb.solstone.me', type: 'A', content: '9.9.9.9' });

    // Orphan with CAA, A, and TXT
    fakeZone.addRecord({ name: 'orphbbbb.solstone.me', type: 'CAA', data: caaData() });
    fakeZone.addRecord({ name: 'orphbbbb.solstone.me', type: 'A', content: '20.186.92.169' });
    const orphanTxt = fakeZone.addRecord({ name: 'orphbbbb.solstone.me', type: 'TXT', content: 'verification-token' });

    await runSolstoneMeOrphanDnsSweep(env);

    const records = fakeZone.getRecords();
    expect(records.find((r) => r.id === apexA.id)).toBeDefined();
    expect(records.find((r) => r.id === wwwA.id)).toBeDefined();
    expect(records.find((r) => r.id === bridgeA.id)).toBeDefined();
    expect(records.find((r) => r.id === wildA.id)).toBeDefined();
    expect(records.find((r) => r.id === unledgeredA.id)).toBeDefined();
    expect(records.find((r) => r.id === liveBadA.id)).toBeDefined();
    expect(records.find((r) => r.id === orphanTxt.id)).toBeDefined();

    // Orphan CAA and A were removed
    const orphRecords = fakeZone.getRecords('orphbbbb.solstone.me');
    expect(orphRecords).toHaveLength(1);
    expect(orphRecords[0].type).toBe('TXT');
  });

  it('isolates sweep DB throw during scheduled run, allowing deletion coordinator and withdrawal recovery to advance', async () => {
    const spy = installConsoleSpy();
    const env = testEnv({
      WITHDRAWAL_DOOR: 'on',
    });

    const account = await seedAccount({ email: 'scheduled-throw@example.com', testEnv: env });

    // Seed due deletion in frozen phase past cancellation deadline
    await workerEnv.DB.prepare(
      "INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, cancellation_deadline_at, next_attempt_at, status_token_hash) VALUES ('op-sweep-throw', 'account', 'frozen', 0, 1, 0, 'status')"
    ).run();

    // Seed Stripe customer
    await workerEnv.DB.prepare(
      'INSERT INTO stripe_customers (account_id, stripe_customer_id, created_at) VALUES (?, ?, ?)'
    ).bind(account.accountId, 'cus_w1', 1000).run();

    // Seed unfinished withdrawal
    const purchasedAt = Math.floor(Date.now() / 1000) - 86400;
    await workerEnv.DB.prepare(
      `INSERT INTO subscription_withdrawals (subscription_ref, account_id, service, purchased_at, submitted_at, acknowledged_at)
       VALUES ('sub_w1', ?, 'spl_hosted', ?, ?, ?)`
    ).bind(account.accountId, purchasedAt, Date.now(), Date.now()).run();

    // Install Stripe mock
    installStripeFetchMock({
      'GET api.stripe.com/v1/subscriptions/sub_w1': async () => stripeJson({
        id: 'sub_w1',
        customer: 'cus_w1',
        status: 'active',
        start_date: purchasedAt,
        created: purchasedAt,
        metadata: { service: 'spl' },
      }),
      'GET api.stripe.com/v1/invoices': async () => stripeJson({
        object: 'list',
        data: [{ id: 'in_w1', amount_paid: 2000, charge: 'ch_w1' }],
        has_more: false,
      }),
      'POST api.stripe.com/v1/refunds': async () => stripeJson({ id: 're_w1', status: 'succeeded' }),
      'DELETE api.stripe.com/v1/subscriptions/sub_w1': async () => stripeJson({ id: 'sub_w1', status: 'canceled' }),
    });

    // AFTER stripe mock, install fake zone on top so zone listing hits fakeZone and non-Cloudflare delegates to Stripe
    fakeZone = installFakeSolstoneMeZone({ zoneId: TEST_ZONE_ID });

    // Intercept DB.prepare to throw only for sweep's SELECT label FROM mcp_bridge_bindings
    const originalPrepare = env.DB.prepare.bind(env.DB);
    const SENTINEL = 'SENTINEL_DB_THROW_TEST';
    env.DB.prepare = (query) => {
      if (typeof query === 'string' && query.trim() === 'SELECT label FROM mcp_bridge_bindings') {
        return {
          bind: () => ({ all: async () => { throw new Error(SENTINEL); } }),
          all: async () => { throw new Error(SENTINEL); },
        };
      }
      return originalPrepare(query);
    };

    try {
      const ctx = createExecutionContext();
      await worker.scheduled({ cron: '*/15 * * * *' }, env, ctx);
      await waitOnExecutionContext(ctx);

      // Deletion advanced: frozen -> purging
      const deletion = await workerEnv.DB.prepare("SELECT phase FROM account_deletions WHERE operation_id = 'op-sweep-throw'").first();
      expect(deletion?.phase).toBe('purging');

      // Withdrawal advanced: completed_at is set
      const withdrawal = await workerEnv.DB.prepare('SELECT completed_at FROM subscription_withdrawals WHERE subscription_ref = ?').bind('sub_w1').first();
      expect(withdrawal?.completed_at).not.toBeNull();

      // Console spy shows sweep_failed and not sentinel, not a label
      const errorLogs = spy.calls.filter((c) => c.level === 'error').map((c) => c.args.join(' ')).join('\n');
      expect(errorLogs).toContain('"reason":"sweep_failed"');
      expect(errorLogs).not.toContain(SENTINEL);
      spy.assertNoSecrets([TEST_TOKEN, TEST_ZONE_ID, TEST_ACME_URI]);
    } finally {
      env.DB.prepare = originalPrepare;
      spy.restore();
    }
  });

  it('logs list_failed and does not delete when fake zone list fails', async () => {
    const spy = installConsoleSpy();
    const env = testEnv();

    await workerEnv.DB.prepare('INSERT INTO mcp_bridge_hostname_ledger (label, created_at) VALUES (?, ?)')
      .bind('failaaaa', 1000).run();
    const caa = fakeZone.addRecord({ name: 'failaaaa.solstone.me', type: 'CAA', data: caaData() });

    fakeZone.forceNextList({
      status: 500,
      body: { success: false, errors: [{ code: 1000, message: 'Internal error' }] },
    });

    await runSolstoneMeOrphanDnsSweep(env);

    const errorLogs = spy.calls.filter((c) => c.level === 'error').map((c) => c.args.join(' ')).join('\n');
    expect(errorLogs).toContain('"reason":"list_failed"');
    expect(fakeZone.getRecords().find((r) => r.id === caa.id)).toBeDefined();
    spy.restore();
  });

  it('logs not_configured and does not fetch when DNS credentials are missing', async () => {
    const spy = installConsoleSpy();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const env = makeTestEnv(); // no SOLSTONE_ME_ZONE_ID or SOLSTONE_ME_DNS_API_TOKEN
    await runSolstoneMeOrphanDnsSweep(env);

    expect(fetchSpy).not.toHaveBeenCalled();
    const errorLogs = spy.calls.filter((c) => c.level === 'error').map((c) => c.args.join(' ')).join('\n');
    expect(errorLogs).toContain('"reason":"not_configured"');
    spy.restore();
  });

  it('continues after a per-orphan batch failure, deleting the remaining orphan', async () => {
    const spy = installConsoleSpy();
    const env = testEnv();

    await workerEnv.DB.prepare('INSERT INTO mcp_bridge_hostname_ledger (label, created_at) VALUES (?, ?)')
      .bind('aaaa2222', 1000).run();
    await workerEnv.DB.prepare('INSERT INTO mcp_bridge_hostname_ledger (label, created_at) VALUES (?, ?)')
      .bind('bbbb2222', 1000).run();

    const aCaa = fakeZone.addRecord({ name: 'aaaa2222.solstone.me', type: 'CAA', data: caaData() });
    const aA = fakeZone.addRecord({ name: 'aaaa2222.solstone.me', type: 'A', content: '20.186.92.169' });
    fakeZone.addRecord({ name: 'bbbb2222.solstone.me', type: 'CAA', data: caaData() });
    fakeZone.addRecord({ name: 'bbbb2222.solstone.me', type: 'A', content: '20.186.92.169' });

    // First batch fails
    fakeZone.forceNextBatch({
      status: 200,
      body: { success: false, errors: [{ message: 'nope' }] },
    });

    await runSolstoneMeOrphanDnsSweep(env);

    const errorLogs = spy.calls.filter((c) => c.level === 'error').map((c) => c.args.join(' ')).join('\n');
    expect(errorLogs).toContain('"reason":"batch_failed"');

    // First orphan remains
    expect(fakeZone.getRecords().find((r) => r.id === aCaa.id)).toBeDefined();
    expect(fakeZone.getRecords().find((r) => r.id === aA.id)).toBeDefined();

    // Second orphan was deleted
    expect(fakeZone.getRecords('bbbb2222.solstone.me')).toHaveLength(0);
    spy.restore();
  });

  it('logs list_incomplete and does not delete when total_count exceeds result.length', async () => {
    const spy = installConsoleSpy();
    const env = testEnv();

    await workerEnv.DB.prepare('INSERT INTO mcp_bridge_hostname_ledger (label, created_at) VALUES (?, ?)')
      .bind('incoaaaa', 1000).run();
    const caa = fakeZone.addRecord({ name: 'incoaaaa.solstone.me', type: 'CAA', data: caaData() });

    fakeZone.forceNextList({
      status: 200,
      body: {
        success: true,
        result: [{ id: caa.id, name: 'incoaaaa.solstone.me', type: 'CAA', data: caaData() }],
        result_info: { page: 1, per_page: 100, count: 1, total_count: 5, total_pages: 1 },
      },
    });

    await runSolstoneMeOrphanDnsSweep(env);

    const errorLogs = spy.calls.filter((c) => c.level === 'error').map((c) => c.args.join(' ')).join('\n');
    expect(errorLogs).toContain('"reason":"list_incomplete"');
    expect(fakeZone.getRecords().find((r) => r.id === caa.id)).toBeDefined();
    spy.restore();
  });
});
