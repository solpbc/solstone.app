import { createExecutionContext, env as workerEnv, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCancellationRecovery } from '../src/cancel-contract.js';
import worker from '../src/index.js';
import { serviceMonthStart } from '../src/renewed-year.js';
import { formatLongDate } from '../src/withdrawal-rules.js';
import {
  TEST_CSRF,
  installStripeFetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedSession,
} from './helpers.js';

const DAY = 86400;
const NOW_S = Math.floor(Date.now() / 1000);
const ON = { WITHDRAWAL_DOOR: 'on', SUBSCRIPTION_RULES: 'on' };
const CANCEL = '/billing/cancel-contract';
const ALERTS = 'support@solstone.app';

// The approved lines, as they render for private network.
const firstPointer = (date) => `you can still withdraw until the end of the 14th day after ${date}. "withdraw from contract here" stops private network today and refunds everything you paid. "cancel contracts here" keeps it working to the end of the period you've paid for, with no refund.`;
const renewedPointer = (date, paid) => `you can still withdraw from this renewal until the end of the 14th day after ${date}. "withdraw from contract here" stops private network today and refunds the whole renewal, ${paid}. "cancel contracts here" ends it at the end of your current plan month and refunds the whole months left.`;
const renewedDoor = (date) => `you can withdraw until the end of the 14th day after ${date}, the day your plan renewed, for a full refund of that renewal.`;
const renewedLead = (date) => `if you withdraw, private network stops today and we refund everything you paid for its renewal on ${date}. you have until the end of the 14th day after ${date}.`;
const renewedClosed = (date) => `the 14 days to withdraw from private network's renewal on ${date} are over. you can still cancel it with "cancel contracts here": it ends at the end of your current plan month, and we refund the whole months left.`;

describe('the withdrawal window beside the cancel function', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('the pointer beside "cancel contracts here"', () => {
    it('in a first window, is on the service page and at /billing, and never on the cancel page', async () => {
      const testEnv = makeTestEnv(ON);
      const start = NOW_S - 2 * DAY;
      const { session } = await buyer(testEnv, [{ id: 'sub_spl', start, interval: 'month' }]);
      fakeStripe([{ id: 'sub_spl', start, interval: 'month' }]);
      const pointer = firstPointer(formatLongDate(start));

      const page = await text('/private-network', testEnv, session);
      expect(page).toContain(pointer);
      expect(page).toContain(`href="${CANCEL}?service=private-network"`);
      const billing = await text('/billing', testEnv, session);
      expect(billing).toContain(pointer);
      expect(billing).toContain(`href="${CANCEL}?service=private-network"`);
      expect(await text(`${CANCEL}?service=private-network`, testEnv, session)).not.toContain('you can still withdraw');
    });

    it('in a renewed window, names what the renewal paid, on both pages, beside the renewed door line', async () => {
      const testEnv = makeTestEnv(ON);
      const spec = { id: 'sub_spl', start: NOW_S - 400 * DAY, renewal: NOW_S - 3 * DAY, renewalPaid: 1800 };
      const { session } = await buyer(testEnv, [spec]);
      fakeStripe([spec]);
      const date = formatLongDate(spec.renewal);

      const page = await text('/private-network', testEnv, session);
      expect(page).toContain(renewedPointer(date, '$18'));
      expect(page).toContain(renewedDoor(date));
      const billing = await text('/billing', testEnv, session);
      expect(billing).toContain(renewedPointer(date, '$18'));
      expect(billing).toContain(`private network: ${renewedDoor(date)}`);
      expect(await text(`${CANCEL}?service=private-network`, testEnv, session)).not.toContain('you can still withdraw');
    });

    it('is absent outside a window, where the link stays', async () => {
      const testEnv = makeTestEnv(ON);
      const spec = { id: 'sub_spl', start: NOW_S - 400 * DAY, renewal: NOW_S - 45 * DAY };
      const { session } = await buyer(testEnv, [spec]);
      fakeStripe([spec]);
      for (const path of ['/private-network', '/billing']) {
        const html = await text(path, testEnv, session);
        expect(html).not.toContain('you can still withdraw');
        expect(html).toContain(`href="${CANCEL}?service=private-network"`);
      }
    });

    it('/billing links each paid entry to its own cancel page', async () => {
      const testEnv = makeTestEnv(ON);
      const specs = [
        { id: 'sub_spl', start: NOW_S - 60 * DAY },
        { id: 'sub_spb', service: 'spb_hosted', tag: 'spb', start: NOW_S - 90 * DAY },
      ];
      const { session } = await buyer(testEnv, specs);
      fakeStripe(specs);
      const billing = await text('/billing', testEnv, session);
      expect(billing).toContain(`href="${CANCEL}?service=private-network"`);
      expect(billing).toContain(`href="${CANCEL}?service=backup"`);
      expect(billing).not.toContain(`href="${CANCEL}"`);
    });

    it('with the rules off, shows no pointer and no cancel link', async () => {
      const testEnv = makeTestEnv({ WITHDRAWAL_DOOR: 'on' });
      const start = NOW_S - 2 * DAY;
      const { session } = await buyer(testEnv, [{ id: 'sub_spl', start, interval: 'month' }]);
      fakeStripe([{ id: 'sub_spl', start, interval: 'month' }]);
      for (const path of ['/private-network', '/billing']) {
        const html = await text(path, testEnv, session);
        expect(html).not.toContain('cancel contracts here');
        expect(html).toContain(`you can withdraw until the end of the 14th day after ${formatLongDate(start)}, for a full refund.`);
      }
    });
  });

  describe('the withdraw door in a reopened window', () => {
    it('carries each approved line, the notice after it and the acknowledgement', async () => {
      const testEnv = makeTestEnv(ON);
      const spec = { id: 'sub_spl', start: NOW_S - 400 * DAY, renewal: NOW_S - 3 * DAY };
      const { session } = await buyer(testEnv, [spec]);
      fakeStripe([spec]);
      const date = formatLongDate(spec.renewal);

      const door = await text('/billing/withdraw/private-network', testEnv, session);
      expect(door).toContain(renewedLead(date));
      expect(door).toContain(`subscription: private network, $20 every year, bought on ${formatLongDate(spec.start)}`);
      const response = await post('/billing/withdraw/private-network', testEnv, { statement: statementOf(door) }, session);
      const location = response.headers.get('Location');
      expect(location).toBe(`/private-network?withdrawal=done&renewed=${spec.renewal}`);

      const notice = await text(location, testEnv, session);
      expect(notice).toContain(`we received your withdrawal. private network has stopped and won't renew, we're refunding everything you paid for its renewal on ${date}, and we've emailed you the acknowledgement.`);
      expect(await text(`/private-network?withdrawal=done_unsent&renewed=${spec.renewal}`, testEnv, session))
        .toContain(`we received your withdrawal. private network has stopped and won't renew, and we're refunding everything you paid for its renewal on ${date}. the acknowledgement email hasn't gone out yet; we'll keep trying.`);

      const ack = testEnv.EMAIL.sent.find((message) => message.to !== ALERTS);
      const ackText = ack.text || '';
      expect(ackText).toContain(`private network, $20 every year, bought on ${formatLongDate(spec.start)}, renewed on ${date}.`);
      expect(ackText).toContain(`private network stops today and won't renew, and we're refunding everything you paid for its renewal on ${date}, the same way you paid, within 14 days`);
    });

    it('says the renewal\'s 14 days are over once they are', async () => {
      const testEnv = makeTestEnv(ON);
      const spec = { id: 'sub_spl', start: NOW_S - 400 * DAY, renewal: NOW_S - 45 * DAY };
      const { session } = await buyer(testEnv, [spec]);
      fakeStripe([spec]);
      expect(await text('/billing/withdraw/private-network', testEnv, session)).toContain(renewedClosed(formatLongDate(spec.renewal)));
    });

    it('in the renewed year\'s last month, where a cancel refunds nothing, promises no refund', async () => {
      const testEnv = makeTestEnv(ON);
      const renewal = serviceMonthStart(NOW_S, -11) - DAY;
      const spec = { id: 'sub_spl', start: renewal - 365 * DAY, renewal };
      const { session } = await buyer(testEnv, [spec]);
      fakeStripe([spec]);
      const page = await text('/billing/withdraw/private-network', testEnv, session);
      expect(page).toContain('are over');
      expect(page).not.toContain('we refund the whole months left');
    });

    it('leaves the first window\'s lines and notices as they were', async () => {
      const testEnv = makeTestEnv(ON);
      const start = NOW_S - 2 * DAY;
      const { session } = await buyer(testEnv, [{ id: 'sub_spl', start }]);
      fakeStripe([{ id: 'sub_spl', start }]);
      const date = formatLongDate(start);
      expect(await text('/private-network', testEnv, session)).toContain(`you can withdraw until the end of the 14th day after ${date}, for a full refund.`);
      const door = await text('/billing/withdraw/private-network', testEnv, session);
      expect(door).toContain(`if you withdraw, private network stops today and we refund everything you paid for this subscription. you have until the end of the 14th day after ${date}.`);
      expect(door).toContain(`subscription: private network, $20 every year, bought on ${date}`);
      const response = await post('/billing/withdraw/private-network', testEnv, { statement: statementOf(door) }, session);
      expect(response.headers.get('Location')).toBe('/private-network?withdrawal=done');
      expect(await text('/private-network?withdrawal=done', testEnv, session)).toContain("we're refunding everything you paid for it, and we've emailed you the acknowledgement.");
      expect(testEnv.EMAIL.sent[0].text).toContain(`bought on ${date}.`);
      expect(testEnv.EMAIL.sent[0].text).toContain("we're refunding everything you paid for this subscription");
    });

    it('ignores a renewal date in the notice\'s address with the rules off', async () => {
      const testEnv = makeTestEnv({ WITHDRAWAL_DOOR: 'on' });
      const { session } = await buyer(testEnv, [{ id: 'sub_spl', start: NOW_S - 2 * DAY }]);
      fakeStripe([{ id: 'sub_spl', start: NOW_S - 2 * DAY }]);
      const page = await text(`/private-network?withdrawal=done&renewed=${NOW_S}`, testEnv, session);
      expect(page).toContain("we're refunding everything you paid for it, and");
      expect(page).not.toContain('its renewal on');
    });
  });

  describe('a withdrawal after a pending cancel', () => {
    const spec = { id: 'sub_spl', start: NOW_S - 400 * DAY, renewal: NOW_S - 3 * DAY };

    it('refunds only what the cancel left of the renewal', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await buyer(testEnv, [spec]);
      const stripe = fakeStripe([spec]);
      await cancel(testEnv, session);
      // The cancel refunded 11 whole months of the $20 renewal.
      expect(stripe.refunded('ch_renewal_sub_spl')).toBe(1833);

      const door = await text('/billing/withdraw/private-network', testEnv, session);
      await post('/billing/withdraw/private-network', testEnv, { statement: statementOf(door) }, session);
      expect(stripe.refunds.at(-1)).toEqual({ charge: 'ch_renewal_sub_spl', asked: null, made: 167 });
      expect(stripe.refunded('ch_renewal_sub_spl')).toBe(2000);
      expect(stripe.refunded('ch_first_sub_spl')).toBe(0);
    });

    it('when the cancel had not refunded yet, refunds the renewal once, and the cancel\'s retry neither refunds nor alerts', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await buyer(testEnv, [spec]);
      const stripe = fakeStripe([spec], { failFirstRefund: true });
      await cancel(testEnv, session);
      expect(stripe.refunded('ch_renewal_sub_spl')).toBe(0);
      const alerts = () => testEnv.EMAIL.sent.filter((message) => message.to === ALERTS).length;
      const before = alerts();

      const door = await text('/billing/withdraw/private-network', testEnv, session);
      await post('/billing/withdraw/private-network', testEnv, { statement: statementOf(door) }, session);
      expect(stripe.refunded('ch_renewal_sub_spl')).toBe(2000);

      const ctx = createExecutionContext();
      await runCancellationRecovery(testEnv, ctx, Date.now() + 49 * 3600 * 1000);
      await waitOnExecutionContext(ctx);
      expect(stripe.refunded('ch_renewal_sub_spl')).toBe(2000);
      expect(stripe.refunds.filter((r) => r.made > 0)).toHaveLength(1);
      expect(alerts()).toBe(before);
      const row = await workerEnv.DB.prepare('SELECT refunded_at, completed_at FROM subscription_cancellations').first();
      expect(row.completed_at).not.toBeNull();
    });
  });
});

async function buyer(testEnv, specs) {
  const account = await seedAccount({ email: 'window@example.com', testEnv });
  const session = await seedSession(account.accountId, { testEnv });
  for (const spec of specs) {
    const sub = subscription(spec);
    await seedEntitlement({ accountId: account.accountId, service: spec.service || 'spl_hosted', sourceRef: spec.id, currentPeriodEnd: sub.current_period_end });
  }
  await workerEnv.DB
    .prepare('INSERT INTO stripe_customers (account_id, stripe_customer_id, created_at) VALUES (?, ?, ?)')
    .bind(account.accountId, 'cus_w', 1_000)
    .run();
  return { accountId: account.accountId, session };
}

function subscription({ id, tag = 'spl', start, renewal = null, interval = 'year', amount = 2000 }) {
  const periodStart = renewal ?? start;
  return {
    id,
    object: 'subscription',
    customer: 'cus_w',
    status: 'active',
    start_date: start,
    created: start,
    current_period_start: periodStart,
    current_period_end: serviceMonthStart(periodStart, interval === 'year' ? 12 : 1),
    cancel_at_period_end: false,
    cancel_at: null,
    metadata: { service: tag },
    items: { data: [{ quantity: 1, price: { unit_amount: amount, currency: 'usd', recurring: { interval } } }] },
  };
}

// A Stripe holding each subscription, its paid invoices and their charges. A refund with no amount
// refunds what is left of the charge, and one of a fully refunded charge is refused, as Stripe
// does (checked in test mode).
function fakeStripe(specs, { failFirstRefund = false } = {}) {
  const subs = new Map(specs.map((spec) => [spec.id, subscription(spec)]));
  const invoices = new Map(specs.map((spec) => [spec.id, [
    { id: `in_first_${spec.id}`, amount_paid: spec.amount || 2000, charge: `ch_first_${spec.id}`, created: spec.start, billing_reason: 'subscription_create', status_transitions: { paid_at: spec.start } },
    ...(spec.renewal ? [{ id: `in_renewal_${spec.id}`, amount_paid: spec.renewalPaid || spec.amount || 2000, charge: `ch_renewal_${spec.id}`, created: spec.renewal, billing_reason: 'subscription_cycle', status_transitions: { paid_at: spec.renewal } }] : []),
  ]]));
  const charges = new Map([...invoices.values()].flat().map((invoice) => [invoice.charge, { amount: invoice.amount_paid, refunded: 0 }]));
  const out = { refunds: [], refunded: (id) => charges.get(id).refunded };
  let failNext = failFirstRefund;
  installStripeFetchMock({
    default: async ({ method, url, body }) => {
      const [, kind, id] = url.pathname.replace('/v1/', '/').split('/');
      if (kind === 'subscriptions' && subs.has(id)) {
        if (method === 'DELETE') subs.set(id, { ...subs.get(id), status: 'canceled' });
        if (method === 'POST') {
          subs.set(id, body.get('cancel_at_period_end') === 'true'
            ? { ...subs.get(id), cancel_at_period_end: true, cancel_at: subs.get(id).current_period_end }
            : { ...subs.get(id), cancel_at: Number(body.get('cancel_at')) });
        }
        return json(subs.get(id));
      }
      if (kind === 'invoices' && method === 'GET') return json({ object: 'list', data: invoices.get(url.searchParams.get('subscription')) || [], has_more: false });
      if (kind === 'charges' && method === 'GET') return json({ id, amount_refunded: charges.get(id).refunded });
      if (kind === 'refunds' && method === 'POST') {
        if (failNext) {
          failNext = false;
          return json({ error: { type: 'api_error' } }, 500);
        }
        const charge = charges.get(body.get('charge'));
        const left = charge.amount - charge.refunded;
        const asked = body.get('amount') == null ? null : Number(body.get('amount'));
        if (left === 0) return json({ error: { code: 'charge_already_refunded' } }, 400);
        if (asked != null && asked > left) return json({ error: { type: 'invalid_request_error' } }, 400);
        const made = asked ?? left;
        charge.refunded += made;
        out.refunds.push({ charge: body.get('charge'), asked, made });
        return json({ id: `re_${out.refunds.length}`, amount: made });
      }
      if (kind === 'billing_portal') return json({ url: 'https://billing.stripe.test/p' });
      throw new Error(`unhandled stripe fetch: ${method} ${url.href}`);
    },
  });
  return out;
}

async function cancel(testEnv, session) {
  const review = await text(`${CANCEL}/review`, testEnv, session, { name: 'Ada', service: 'private-network', end: 'earliest' });
  return post(`${CANCEL}/confirm`, testEnv, { statement: statementOf(review) }, session);
}

function statementOf(html) {
  const match = html.match(/name="statement" value="([^"]+)"/);
  if (!match) throw new Error('no statement on the page');
  return match[1];
}

async function text(path, testEnv, session, fields = null) {
  if (fields) return (await post(path, testEnv, fields, session)).text();
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(`https://services.solstone.app${path}`, { headers: { Cookie: session.cookie } }), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return response.text();
}

async function post(path, testEnv, fields, session) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(`https://services.solstone.app${path}`, {
    method: 'POST',
    headers: { Origin: 'https://services.solstone.app', 'Content-Type': 'application/x-www-form-urlencoded', Cookie: session.cookie },
    body: new URLSearchParams({ csrf: TEST_CSRF, ...fields }),
  }), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
