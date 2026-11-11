import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptEmail } from '../src/crypto.js';
import { runAccountDeletionCoordinator } from '../src/deletion-coordinator.js';
import { RENEWAL_REFUND_RETRY_MS } from '../src/deletion-hold.js';
import { serviceMonthStart } from '../src/renewed-year.js';
import { installStripeFetchMock, makeTestEnv, resetDb, seedAccount } from './helpers.js';

const DAY = 86400;
const NOW = Date.now();
const ON = { SUBSCRIPTION_RULES: 'on' };
// The sign-in was confirmed 72 hours ago, in month 2 of a renewed year of $20: nine whole months
// are left after the one the confirm fell in.
const CONFIRMED = NOW - 72 * 3600 * 1000;
const RENEWAL = serviceMonthStart(Math.floor(CONFIRMED / 1000), -2) - DAY;
const START = RENEWAL - 365 * DAY;
const OWED = Math.round((2000 * 9) / 12);

describe('closing a sign-in in a renewed annual year', () => {
  beforeEach(resetDb);
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('refunds the whole months left on the renewal, once, before the customer is deleted', async () => {
    const env = makeTestEnv(ON);
    await purging(env);
    const stripe = fakeStripe({ renewed: true });

    await expect(runAccountDeletionCoordinator(env, NOW)).resolves.toMatchObject({ stripe: 'complete' });
    expect(stripe.refunds).toEqual([{ charge: 'ch_renewal', amount: OWED, key: 'deletion-refund-in_renewal' }]);
    const order = stripe.calls.map((call) => `${call.method} ${call.url.pathname}`);
    expect(order.indexOf('POST /v1/refunds')).toBeLessThan(order.indexOf('DELETE /v1/customers/cus_d'));
    await expect(runAccountDeletionCoordinator(env, NOW + DAY * 1000)).resolves.toBeDefined();
    expect(stripe.refunds).toHaveLength(1);
  });

  it('refunds nothing in the first year, on a monthly plan, or with the rules off', async () => {
    for (const [overrides, shape] of [[ON, { renewed: false }], [ON, { renewed: true, interval: 'month' }], [{}, { renewed: true }]]) {
      await resetDb();
      const env = makeTestEnv(overrides);
      await purging(env);
      const stripe = fakeStripe(shape);
      await expect(runAccountDeletionCoordinator(env, NOW)).resolves.toMatchObject({ stripe: 'complete' });
      expect(stripe.refunds).toEqual([]);
      expect(stripe.deleted).toBe(true);
    }
  });

  it('refunds nothing more when the renewal is already refunded, or a cancel or a withdrawal holds it', async () => {
    const cases = [
      { stripe: { renewed: true, refunded: 1833 } },
      { seed: (accountId) => workerEnv.DB.prepare(
        `INSERT INTO subscription_cancellations (subscription_ref, issued_at, account_id, service, cause, ends_today, ends_at, at_period_end, refund_invoice_ref, refund_amount, submitted_at)
         VALUES ('sub_d', 1, ?, 'spl_hosted', 0, 0, 1, 0, 'in_renewal', 1833, 1)`,
      ).bind(accountId).run() },
      { seed: (accountId) => workerEnv.DB.prepare(
        `INSERT INTO subscription_withdrawals (subscription_ref, account_id, service, purchased_at, submitted_at)
         VALUES ('sub_d', ?, 'spl_hosted', ?, 1)`,
      ).bind(accountId, RENEWAL).run() },
    ];
    for (const { stripe: shape = { renewed: true }, seed } of cases) {
      await resetDb();
      const env = makeTestEnv(ON);
      const accountId = await purging(env);
      if (seed) await seed(accountId);
      const stripe = fakeStripe(shape);
      await expect(runAccountDeletionCoordinator(env, NOW)).resolves.toMatchObject({ stripe: 'complete' });
      expect(stripe.refunds).toEqual([]);
      expect(stripe.deleted).toBe(true);
    }
  });

  it('holds the deletion and retries when the refund fails, alerts a person once with nothing about the owner, and goes on after 48 hours', async () => {
    const env = makeTestEnv(ON);
    await purging(env);
    const stripe = fakeStripe({ renewed: true, refundFails: true });

    await expect(runAccountDeletionCoordinator(env, NOW)).resolves.toMatchObject({ stripe: 'retryable' });
    expect(stripe.deleted).toBe(false);
    const alerts = env.EMAIL.sent.filter((message) => message.to === 'support@solstone.app');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].text).not.toMatch(/deleting@example\.com|cus_d|sub_d|in_renewal|ch_renewal/);

    const next = await workerEnv.DB.prepare("SELECT next_attempt_at FROM account_deletions WHERE operation_id = 'op'").first();
    await expect(runAccountDeletionCoordinator(env, next.next_attempt_at)).resolves.toMatchObject({ stripe: 'retryable' });
    expect(env.EMAIL.sent.filter((message) => message.to === 'support@solstone.app')).toHaveLength(1);

    await expect(runAccountDeletionCoordinator(env, NOW + RENEWAL_REFUND_RETRY_MS)).resolves.toMatchObject({ stripe: 'complete' });
    expect(stripe.deleted).toBe(true);
    expect(env.EMAIL.sent.filter((message) => message.to === 'support@solstone.app')).toHaveLength(1);
  });
});

async function purging(env) {
  const account = await seedAccount({ email: 'deleting@example.com', testEnv: env });
  await workerEnv.DB
    .prepare('INSERT INTO stripe_customers (account_id, stripe_customer_id, created_at) VALUES (?, ?, ?)')
    .bind(account.accountId, 'cus_d', 1_000)
    .run();
  const snapshot = await encryptEmail(JSON.stringify({
    relay: { spl_instance_ids: [], spp_instance_ids: [] },
    backup: { spb_instance_ids: [] },
    support_owner_id: account.accountId,
    stripe_customer_id: 'cus_d',
  }), env);
  // The purge began when the 72 hours ran out, now.
  await workerEnv.DB.prepare(
    `INSERT INTO account_deletions (
       operation_id, account_id, phase, requested_at, frozen_at, cancellation_deadline_at,
       next_attempt_at, snapshot_encrypted, snapshot_digest, status_token_hash
     ) VALUES ('op', ?, 'purging', ?, ?, ?, ?, ?, 'digest', 'status')`
  ).bind(account.accountId, CONFIRMED, CONFIRMED, NOW, NOW, snapshot).run();
  return account.accountId;
}

function fakeStripe({ renewed, interval = 'year', refunded = 0, refundFails = false }) {
  const periodStart = renewed ? RENEWAL : Math.floor(CONFIRMED / 1000) - 30 * DAY;
  const start = renewed ? START : periodStart;
  const sub = {
    id: 'sub_d',
    object: 'subscription',
    customer: 'cus_d',
    status: 'active',
    pause_collection: { behavior: 'void' },
    start_date: start,
    created: start,
    current_period_start: periodStart,
    current_period_end: serviceMonthStart(periodStart, interval === 'year' ? 12 : 1),
    metadata: { service: 'spl' },
    items: { data: [{ quantity: 1, price: { unit_amount: 2000, currency: 'usd', recurring: { interval } } }] },
  };
  const invoices = [
    { id: 'in_first', amount_paid: 2000, charge: 'ch_first', created: start, billing_reason: 'subscription_create' },
    ...(renewed ? [{ id: 'in_renewal', amount_paid: 2000, charge: 'ch_renewal', created: periodStart, billing_reason: 'subscription_cycle' }] : []),
  ];
  const out = { refunds: [], deleted: false };
  const { calls } = installStripeFetchMock({
    'GET api.stripe.com/v1/subscriptions': async () => json({ object: 'list', data: [sub], has_more: false }),
    'GET api.stripe.com/v1/invoices': async () => json({ object: 'list', data: invoices, has_more: false }),
    'GET api.stripe.com/v1/charges/ch_renewal': async () => json({ id: 'ch_renewal', amount: 2000, amount_refunded: refunded }),
    'POST api.stripe.com/v1/refunds': async ({ body, init }) => {
      if (refundFails) return json({ error: { type: 'api_error' } }, 500);
      out.refunds.push({ charge: body.get('charge'), amount: Number(body.get('amount')), key: init.headers['Idempotency-Key'] });
      refunded += Number(body.get('amount'));
      return json({ id: 're_1' });
    },
    'DELETE api.stripe.com/v1/customers/cus_d': async () => {
      out.deleted = true;
      return json({ id: 'cus_d', deleted: true });
    },
  });
  out.calls = calls;
  return out;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
