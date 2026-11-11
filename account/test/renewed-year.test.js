import { createExecutionContext, env as workerEnv, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  cancelEnds,
  currentServiceMonth,
  monthsLeftRefund,
  renewalStart,
  serviceMonthStart,
  withdrawalWindowStart,
} from '../src/renewed-year.js';
import { formatLongDate } from '../src/withdrawal-rules.js';
import { TEST_CSRF, installStripeFetchMock, makeTestEnv, resetDb, seedAccount, seedEntitlement, seedSession } from './helpers.js';

const DAY = 86400;
const NOW_S = Math.floor(Date.now() / 1000);
const RULES = { SUBSCRIPTION_RULES: 'on' };
const at = (iso) => Math.floor(Date.parse(iso) / 1000);

function annual({ startDate, periodStart, periodEnd = null, unitAmount = 4800, interval = 'year', tag = 'spl', status = 'active' }) {
  return {
    id: 'sub_r1',
    object: 'subscription',
    customer: 'cus_r1',
    status,
    start_date: startDate,
    created: startDate,
    current_period_start: periodStart,
    current_period_end: periodEnd ?? serviceMonthStart(periodStart, interval === 'year' ? 12 : 1),
    cancel_at_period_end: false,
    cancel_at: null,
    metadata: { service: tag },
    items: { data: [{ quantity: 1, price: { unit_amount: unitAmount, currency: 'usd', recurring: { interval } } }] },
  };
}

describe('the renewed annual year', () => {
  describe('service months', () => {
    it('steps from a renewal on the 31st to the last day of shorter months, and month 12 is the year end', () => {
      const renewal = at('2027-01-31T10:15:00Z');
      expect(serviceMonthStart(renewal, 0)).toBe(renewal);
      expect(serviceMonthStart(renewal, 1)).toBe(at('2027-02-28T10:15:00Z'));
      expect(serviceMonthStart(renewal, 2)).toBe(at('2027-03-31T10:15:00Z'));
      expect(serviceMonthStart(renewal, 3)).toBe(at('2027-04-30T10:15:00Z'));
      expect(serviceMonthStart(renewal, 12)).toBe(at('2028-01-31T10:15:00Z'));
    });

    it('steps from a renewal on February 29 and ends the year on February 28', () => {
      const renewal = at('2028-02-29T08:00:00Z');
      expect(serviceMonthStart(renewal, 1)).toBe(at('2028-03-29T08:00:00Z'));
      expect(serviceMonthStart(renewal, 11)).toBe(at('2029-01-29T08:00:00Z'));
      expect(serviceMonthStart(renewal, 12)).toBe(at('2029-02-28T08:00:00Z'));
    });

    it('finds the current month, the largest whose start has come, up to month 11', () => {
      const renewal = at('2027-01-31T10:15:00Z');
      expect(currentServiceMonth(renewal, renewal)).toBe(0);
      expect(currentServiceMonth(renewal, at('2027-02-28T10:14:59Z'))).toBe(0);
      expect(currentServiceMonth(renewal, at('2027-02-28T10:15:00Z'))).toBe(1);
      expect(currentServiceMonth(renewal, at('2028-01-01T00:00:00Z'))).toBe(11);
      expect(currentServiceMonth(renewal, at('2028-02-15T00:00:00Z'))).toBe(11);
    });

    it('ends a cancel at the current month\'s end, and in month 11 at the period end with nothing to refund', () => {
      const renewal = at('2028-02-29T08:00:00Z');
      const sub = annual({ startDate: at('2027-02-28T08:00:00Z'), periodStart: renewal });
      expect(sub.current_period_end).toBe(at('2029-02-28T08:00:00Z'));
      expect(cancelEnds(makeTestEnv(RULES), sub, at('2028-05-01T00:00:00Z')).earliest)
        .toEqual({ endsAt: at('2028-05-29T08:00:00Z'), atPeriodEnd: false, monthsLeft: 9 });
      expect(cancelEnds(makeTestEnv(RULES), sub, at('2029-02-01T00:00:00Z')).earliest)
        .toEqual({ endsAt: sub.current_period_end, atPeriodEnd: true, monthsLeft: 0 });
    });

    it('leaves the first year, monthly plans and the switch-off case ending at the period end', () => {
      const first = annual({ startDate: NOW_S - 30 * DAY, periodStart: NOW_S - 30 * DAY });
      const monthly = annual({ startDate: NOW_S - 400 * DAY, periodStart: NOW_S - 10 * DAY, interval: 'month' });
      const renewed = annual({ startDate: NOW_S - 400 * DAY, periodStart: NOW_S - 35 * DAY });
      for (const [env, sub] of [[makeTestEnv(RULES), first], [makeTestEnv(RULES), monthly], [makeTestEnv(), renewed]]) {
        expect(cancelEnds(env, sub, NOW_S).earliest).toEqual({ endsAt: sub.current_period_end, atPeriodEnd: true, monthsLeft: 0 });
      }
      expect(renewalStart(first)).toBeNull();
      expect(renewalStart(monthly)).toBeNull();
      expect(renewalStart(renewed)).toBe(NOW_S - 35 * DAY);
      // About a day between Stripe's first period start and the subscription's start is still year one.
      expect(renewalStart(annual({ startDate: NOW_S - 30 * DAY, periodStart: NOW_S - 30 * DAY + DAY - 1 }))).toBeNull();
    });
  });

  describe('the refund of the whole months left', () => {
    it.each([
      [500, [[0, 458], [5, 250], [10, 42], [11, 0]]],
      [4800, [[0, 4400], [5, 2400], [10, 400], [11, 0]]],
      [9600, [[0, 8800], [5, 4800], [10, 800], [11, 0]]],
    ])('on a renewal paying %i cents', (amountPaid, points) => {
      for (const [k, cents] of points) expect(monthsLeftRefund(amountPaid, 11 - k)).toBe(cents);
    });
  });

  describe('the withdraw door after a renewal', () => {
    beforeEach(async () => {
      await resetDb();
      vi.restoreAllMocks();
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    const startDate = NOW_S - 400 * DAY;
    const renewal = NOW_S - 3 * DAY;

    it('reopens for 14 days from the renewal and refunds only the renewal', async () => {
      const testEnv = makeTestEnv({ WITHDRAWAL_DOOR: 'on', ...RULES });
      const { session, accountId } = await subscriber(testEnv);
      const stripe = fakeStripe(annual({ startDate, periodStart: renewal, unitAmount: 2000 }));
      expect(withdrawalWindowStart(testEnv, annual({ startDate, periodStart: renewal }))).toBeNull();
      expect(withdrawalWindowStart(testEnv, annual({ startDate, periodStart: renewal }), [
        { id: 'in_renewal', amount_paid: 2000, created: renewal, billing_reason: 'subscription_cycle', status_transitions: { paid_at: renewal } },
      ])).toBe(renewal);

      const pageHtml = await (await get('/private-network', testEnv, session.cookie)).text();
      expect(pageHtml).toContain(`you can withdraw until the end of the 14th day after ${formatLongDate(renewal)}`);
      const door = await (await get('/billing/withdraw/private-network', testEnv, session.cookie)).text();
      expect(door).toContain(`bought on ${formatLongDate(startDate)}`);
      expect(door).toContain(`we refund everything you paid for its renewal on ${formatLongDate(renewal)}`);
      const statement = door.match(/name="statement" value="([^"]+)"/)[1];

      const response = await post('/billing/withdraw/private-network', testEnv, { statement }, session.cookie);
      expect(response.headers.get('Location')).toBe(`/private-network?withdrawal=done&renewed=${renewal}`);
      expect(stripe.refunds).toEqual([{ charge: 'ch_renewal', amount: null }]);
      expect(stripe.cancels).toBe(1);
      const row = await workerEnv.DB.prepare('SELECT purchased_at, completed_at FROM subscription_withdrawals').first();
      expect(row.purchased_at).toBe(renewal);
      expect(row.completed_at).not.toBeNull();
      expect((await workerEnv.DB.prepare('SELECT status FROM entitlements WHERE account_id = ?').bind(accountId).first()).status).toBe('lapsed');
      expect(testEnv.EMAIL.sent[0].text).toContain(`bought on ${formatLongDate(startDate)}, renewed on ${formatLongDate(renewal)}.`);
    });

    it('counts from when a retried renewal was paid, and opens no window before then', async () => {
      const testEnv = makeTestEnv({ WITHDRAWAL_DOOR: 'on', ...RULES });
      const { session } = await subscriber(testEnv);
      const renewedSub = annual({ startDate, periodStart: renewal, unitAmount: 2000 });
      const raised = { id: 'in_renewal', amount_paid: 2000, charge: 'ch_renewal', created: renewal, billing_reason: 'subscription_cycle' };
      const paidLate = renewal + 2 * DAY;
      expect(withdrawalWindowStart(testEnv, renewedSub, [{ ...raised, status_transitions: { paid_at: paidLate } }])).toBe(paidLate);

      fakeStripe(renewedSub, { invoices: [{ id: 'in_first', amount_paid: 2000, charge: 'ch_first', created: startDate, billing_reason: 'subscription_create' }] });
      expect(await (await get('/private-network', testEnv, session.cookie)).text()).not.toContain('withdraw from contract here');

      const stripe = fakeStripe(renewedSub, { invoices: [{ ...raised, status_transitions: { paid_at: paidLate } }] });
      const door = await (await get('/billing/withdraw/private-network', testEnv, session.cookie)).text();
      const statement = door.match(/name="statement" value="([^"]+)"/)[1];
      await post('/billing/withdraw/private-network', testEnv, { statement }, session.cookie);
      expect(stripe.refunds).toEqual([{ charge: 'ch_renewal', amount: null }]);
      const row = await workerEnv.DB.prepare('SELECT purchased_at FROM subscription_withdrawals').first();
      expect(row.purchased_at).toBe(paidLate);
    });

    it('takes a year restarted after a kept sign-in as the renewal, and not a plan change later in it', async () => {
      const testEnv = makeTestEnv({ WITHDRAWAL_DOOR: 'on', ...RULES });
      const { session } = await subscriber(testEnv);
      // A keep restarts the year with billing_cycle_anchor=now: Stripe bills it as a
      // subscription_update raised at the new period's start (checked in test mode).
      const restarted = { id: 'in_restart', amount_paid: 2000, charge: 'ch_restart', created: renewal, billing_reason: 'subscription_update', status_transitions: { paid_at: renewal } };
      const planChange = { ...restarted, id: 'in_change', charge: 'ch_change', created: renewal + 40 * DAY, status_transitions: { paid_at: renewal + 40 * DAY } };
      const sub = annual({ startDate, periodStart: renewal, unitAmount: 2000 });
      expect(withdrawalWindowStart(testEnv, sub, [planChange])).toBeNull();
      expect(withdrawalWindowStart(testEnv, sub, [restarted, planChange])).toBe(renewal);

      const stripe = fakeStripe(sub, { invoices: [{ id: 'in_first', amount_paid: 2000, charge: 'ch_first', created: startDate, billing_reason: 'subscription_create' }, restarted] });
      expect(await (await get('/private-network', testEnv, session.cookie)).text()).toContain(`after ${formatLongDate(renewal)}, the day your plan renewed`);
      const door = await (await get('/billing/withdraw/private-network', testEnv, session.cookie)).text();
      await post('/billing/withdraw/private-network', testEnv, { statement: door.match(/name="statement" value="([^"]+)"/)[1] }, session.cookie);
      expect(stripe.refunds).toEqual([{ charge: 'ch_restart', amount: null }]);
    });

    it('with the switch off, counts from the purchase, as before', async () => {
      const testEnv = makeTestEnv({ WITHDRAWAL_DOOR: 'on' });
      const { session } = await subscriber(testEnv);
      const stripe = fakeStripe(annual({ startDate, periodStart: renewal, unitAmount: 2000 }));
      expect(withdrawalWindowStart(testEnv, annual({ startDate, periodStart: renewal }))).toBe(startDate);
      expect(await (await get('/private-network', testEnv, session.cookie)).text()).not.toContain('withdraw from contract here');
      expect(await (await get('/billing/withdraw/private-network', testEnv, session.cookie)).text())
        .toContain(`bought on ${formatLongDate(startDate)}, are over.`);
      expect(stripe.refunds).toEqual([]);
    });

    it('refunds every paid invoice in the first year, as before', async () => {
      const testEnv = makeTestEnv({ WITHDRAWAL_DOOR: 'on', ...RULES });
      const { session } = await subscriber(testEnv);
      const stripe = fakeStripe(annual({ startDate: NOW_S - 2 * DAY, periodStart: NOW_S - 2 * DAY, unitAmount: 2000 }), {
        invoices: [
          { id: 'in_first', amount_paid: 2000, charge: 'ch_first', created: NOW_S - 2 * DAY, billing_reason: 'subscription_create' },
          { id: 'in_change', amount_paid: 300, charge: 'ch_change', created: NOW_S - DAY, billing_reason: 'subscription_update' },
        ],
      });
      const door = await (await get('/billing/withdraw/private-network', testEnv, session.cookie)).text();
      const statement = door.match(/name="statement" value="([^"]+)"/)[1];
      await post('/billing/withdraw/private-network', testEnv, { statement }, session.cookie);
      expect(stripe.refunds.map((r) => r.charge)).toEqual(['ch_first', 'ch_change']);
    });
  });
});

async function subscriber(testEnv) {
  const account = await seedAccount({ email: 'renewed@example.com', testEnv });
  const session = await seedSession(account.accountId, { testEnv });
  await seedEntitlement({ accountId: account.accountId, sourceRef: 'sub_r1', currentPeriodEnd: NOW_S + 300 * DAY });
  await workerEnv.DB
    .prepare('INSERT INTO stripe_customers (account_id, stripe_customer_id, created_at) VALUES (?, ?, ?)')
    .bind(account.accountId, 'cus_r1', 1_000)
    .run();
  return { accountId: account.accountId, session };
}

function fakeStripe(sub, { invoices = null } = {}) {
  const out = { refunds: [], cancels: 0 };
  const list = invoices || [
    { id: 'in_first', amount_paid: 2000, charge: 'ch_first', created: sub.start_date, billing_reason: 'subscription_create' },
    { id: 'in_renewal', amount_paid: 2000, charge: 'ch_renewal', created: sub.current_period_start, billing_reason: 'subscription_cycle', status_transitions: { paid_at: sub.current_period_start } },
  ];
  installStripeFetchMock({
    'GET api.stripe.com/v1/subscriptions/sub_r1': async () => json(out.cancels ? { ...sub, status: 'canceled' } : sub),
    'GET api.stripe.com/v1/invoices': async () => json({ object: 'list', data: list, has_more: false }),
    'POST api.stripe.com/v1/refunds': async ({ body }) => {
      out.refunds.push({ charge: body.get('charge'), amount: body.get('amount') });
      return json({ id: `re_${out.refunds.length}` });
    },
    'DELETE api.stripe.com/v1/subscriptions/sub_r1': async () => {
      out.cancels += 1;
      return json({ ...sub, status: 'canceled' });
    },
  });
  return out;
}

function get(path, testEnv, cookie) {
  return worker.fetch(new Request(`https://services.solstone.app${path}`, { headers: { Cookie: cookie } }), testEnv, createExecutionContext());
}

async function post(path, testEnv, fields, cookie) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(`https://services.solstone.app${path}`, {
    method: 'POST',
    headers: { Origin: 'https://services.solstone.app', 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
    body: new URLSearchParams({ csrf: TEST_CSRF, ...fields }),
  }), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
