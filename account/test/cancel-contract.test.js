import { createExecutionContext, env as workerEnv, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { currentServiceMonth, monthsLeftRefund, serviceMonthStart } from '../src/renewed-year.js';
import { formatMomentUtc } from '../src/withdrawal-rules.js';
import {
  TEST_CSRF,
  installStripeFetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedSession,
  seedSpbBinding,
  seedSplBinding,
  signStripeWebhook,
} from './helpers.js';

const DAY = 86400;
const NOW_S = Math.floor(Date.now() / 1000);
const ON = { SUBSCRIPTION_RULES: 'on' };
const PATH = '/billing/cancel-contract';
const LINK = 'cancel contracts here';

const SERVICES = [
  { slug: 'private-network', service: 'spl_hosted', tag: 'spl', page: '/private-network', cancel: '/billing/cancel', amount: 2000 },
  { slug: 'backup', service: 'spb_hosted', tag: 'spb', page: '/services/backup', cancel: '/services/backup/cancel', amount: 4800 },
  { slug: 'solstone-me', service: 'sme_hosted', tag: 'sme', page: '/services/solstone-me', cancel: '/services/solstone-me/cancel', amount: 500 },
  { slug: 'confidential-processing', service: 'spp_hosted', tag: 'spp', page: '/confidential-processing', cancel: '/confidential-processing/cancel', amount: 9600 },
];
const PAGE_ENV = { STRIPE_PRICE_SPP_ANNUAL: 'price_spp_annual_test', STRIPE_PRICE_SPP_MONTHLY: 'price_spp_monthly_test', SPP_PLAN_TERMS: 'test plan terms' };

// A renewed annual year: bought 400 days ago, renewed 45 days ago, so the reopened 14 days are over.
const START = NOW_S - 400 * DAY;
const RENEWAL = NOW_S - 45 * DAY;
const MONTH = currentServiceMonth(RENEWAL, NOW_S);
const MONTH_END = serviceMonthStart(RENEWAL, MONTH + 1);
const YEAR_END = serviceMonthStart(RENEWAL, 12);

describe('the cancel function', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('with the switch off', () => {
    it('answers 404 and leaves every page, button and cancel exactly as before', async () => {
      const testEnv = makeTestEnv(PAGE_ENV);
      const { session } = await subscriber(testEnv);
      const stripe = fakeStripe({ renewed: true, cancelAt: MONTH_END });

      expect((await get(PATH, testEnv, session.cookie)).status).toBe(404);
      expect((await post(PATH, testEnv, {}, session.cookie)).status).toBe(404);
      expect((await post(`${PATH}/review`, testEnv, { name: 'a', service: 'private-network' }, session.cookie)).status).toBe(404);
      expect((await post(`${PATH}/confirm`, testEnv, { statement: 'x' }, session.cookie)).status).toBe(404);
      const page = await (await get('/private-network', testEnv, session.cookie)).text();
      expect(page).not.toContain(LINK);
      expect(page).toContain('action="/billing/cancel"');
      expect(await (await get('/billing', testEnv, session.cookie)).text()).not.toContain(LINK);
      const cancel = await post('/billing/cancel', testEnv, {}, session.cookie);
      expect(cancel.headers.get('Location')).toBe('https://billing.stripe.test/p');

      // A cancel_at set at Stripe is not read as a pending cancel, as before.
      await webhook(testEnv, 'customer.subscription.updated', stripe.state());
      expect(await entitlement()).toMatchObject({ cancel_at_period_end: 0, current_period_end: YEAR_END });

      const sent = testEnv.EMAIL.sent.length;
      await runScheduled(testEnv);
      expect(stripe.writes).toEqual([]);
      expect(testEnv.EMAIL.sent).toHaveLength(sent);
    });
  });

  describe('where it is reached from', () => {
    it.each(SERVICES)('takes over the $slug page\'s cancel button and its route', async (def) => {
      const testEnv = makeTestEnv({ ...ON, ...PAGE_ENV });
      const { session } = await subscriber(testEnv, { service: def.service });
      fakeStripe({ tag: def.tag });
      const page = await (await get(def.page, testEnv, session.cookie)).text();
      expect(page).toContain(`href="${PATH}?service=${def.slug}"`);
      expect(page).not.toContain(`action="${def.cancel}"`);
      expect(page).toContain('manage billing');
      const moved = await post(def.cancel, testEnv, {}, session.cookie);
      expect(moved.status).toBe(303);
      expect(moved.headers.get('Location')).toBe(`${PATH}?service=${def.slug}`);
    });

    it('shows on the billing page before a subscription exists, and on no service page until one does', async () => {
      const testEnv = makeTestEnv({ ...ON, ...PAGE_ENV });
      const account = await seedAccount({ email: 'new@example.com', testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      for (const def of SERVICES) {
        expect(await (await get(def.page, testEnv, session.cookie)).text()).not.toContain(LINK);
      }
      expect(await (await get('/billing', testEnv, session.cookie)).text()).toContain(`href="${PATH}"`);
      // With nothing to cancel, the page says so.
      const form = await (await get(PATH, testEnv, session.cookie)).text();
      expect(form).not.toContain('name="service"');
    });
  });

  describe('the form and its summary', () => {
    it('in the first year, offers only the period end, and the summary carries one cancel now and a way back', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv, { email: 'first@example.com' });
      const stripe = fakeStripe({ renewed: false });
      const periodEnd = stripe.state().current_period_end;

      const form = await (await get(`${PATH}?service=private-network`, testEnv, session.cookie)).text();
      expect(form).toContain('first@example.com');
      expect(form).not.toMatch(/name="email"/);
      expect(form).toMatch(/<input type="radio" name="service" value="private-network" required checked>/);
      expect(form).toContain(formatMomentUtc(periodEnd));
      expect(form).not.toContain('value="period_end"');
      expect(form).toMatch(/name="name"[^>]*required/);

      const missing = await (await post(`${PATH}/review`, testEnv, { name: ' ', service: 'private-network' }, session.cookie)).text();
      expect(missing).not.toContain('name="statement"');

      const review = await (await post(`${PATH}/review`, testEnv, { name: 'Ada Owner', service: 'private-network', end: 'earliest' }, session.cookie)).text();
      expect(review).toContain('Ada Owner');
      expect(review).toContain('first@example.com');
      expect(review).toContain(formatMomentUtc(periodEnd));
      // Below the heading: the way back and the one cancel button, nothing else.
      const body = review.slice(review.indexOf('<h1>'), review.lastIndexOf('</form>'));
      expect(body.match(/<form /g)).toHaveLength(2);
      expect(body.match(/<button[^>]*type="submit"/g)).toHaveLength(2);
      expect(body).not.toMatch(/<a [^>]*href/);
      expect(review.match(/>cancel now</g)).toHaveLength(1);
      expect(review).toContain(`action="${PATH}/confirm"`);
      // The way back brings what was entered.
      const back = await (await post(PATH, testEnv, { name: 'Ada Owner', service: 'private-network', end: 'earliest' }, session.cookie)).text();
      expect(back).toContain('value="Ada Owner"');
      expect(stripe.writes).toEqual([]);
    });

    it('in a renewed year, defaults to the month end and offers the period end too', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv);
      fakeStripe({ renewed: true });
      const form = await (await get(PATH, testEnv, session.cookie)).text();
      expect(form).toContain(formatMomentUtc(MONTH_END));
      expect(form).toContain(formatMomentUtc(YEAR_END));
      expect(form).toMatch(/name="end" value="earliest" checked/);
      expect(form).toContain('value="period_end"');
      const review = await (await post(`${PATH}/review`, testEnv, { name: 'Ada', service: 'private-network', end: 'period_end' }, session.cookie)).text();
      expect(review).toContain(formatMomentUtc(YEAR_END));
      expect(review).not.toContain(formatMomentUtc(MONTH_END));
    });

    it('lists a subscription already set to end with its date, and does not offer it', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv, { cancelAtPeriodEnd: true, periodEnd: NOW_S + 20 * DAY });
      fakeStripe({});
      const form = await (await get(PATH, testEnv, session.cookie)).text();
      expect(form).toContain(formatMomentUtc(NOW_S + 20 * DAY));
      expect(form).not.toContain('name="service"');
      const review = await (await post(`${PATH}/review`, testEnv, { name: 'Ada', service: 'private-network' }, session.cookie)).text();
      expect(review).not.toContain('name="statement"');
    });
  });

  describe('confirming', () => {
    it('in the first year, records, emails the end date first, and cancels at the period end with no refund', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv, { email: 'first@example.com' });
      const stripe = fakeStripe({ renewed: false });
      const periodEnd = stripe.state().current_period_end;

      const before = Date.now();
      const done = await (await confirm(testEnv, session, { name: 'Ada Owner' })).text();
      expect(stripe.writes).toEqual([{ cancel_at_period_end: 'true' }]);
      expect(stripe.refunds).toEqual([]);
      const row = await workerEnv.DB.prepare('SELECT * FROM subscription_cancellations').first();
      expect(row).toMatchObject({ name: 'Ada Owner', ends_at: periodEnd, at_period_end: 1, refund_invoice_ref: null, refund_amount: null });
      expect(row.submitted_at).toBeGreaterThanOrEqual(before);
      expect(row.completed_at).not.toBeNull();

      expect(testEnv.EMAIL.sent).toHaveLength(1);
      const mail = testEnv.EMAIL.sent[0];
      const end = formatMomentUtc(periodEnd);
      expect(mail.to).toBe('first@example.com');
      expect(mail.subject).toContain(end);
      expect(mail.text.split('\n\n')[0]).toContain(end);
      expect(mail.html.indexOf(end)).toBeLessThan(mail.html.indexOf('Ada Owner'));
      expect(mail.text).toContain('Ada Owner');
      expect(mail.text).toContain(formatMomentUtc(Math.floor(row.submitted_at / 1000)));

      // The done page shows the whole declaration and that the email has gone.
      for (const value of ['Ada Owner', 'first@example.com', 'private network', end, formatMomentUtc(Math.floor(row.submitted_at / 1000))]) {
        expect(done).toContain(value);
      }
      expect(done).toContain('emailed this to first@example.com');
      // The service page shows the cancel at once.
      expect(await (await get('/private-network', testEnv, session.cookie)).text()).toContain(`scheduled to turn off on ${new Date(periodEnd * 1000).toISOString().slice(0, 10)}`);
    });

    it.each(SERVICES)('in a renewed $slug year, ends at the month end and refunds the whole months left, tax included', async (def) => {
      const testEnv = makeTestEnv({ ...ON, ...PAGE_ENV });
      const { session } = await subscriber(testEnv, { service: def.service });
      const stripe = fakeStripe({ renewed: true, tag: def.tag, amount: def.amount, tax: 37 });
      const paid = def.amount + 37;
      const expected = monthsLeftRefund(paid, 11 - MONTH);

      const done = await (await confirm(testEnv, session, { service: def.slug })).text();
      expect(stripe.writes).toEqual([{ cancel_at: String(MONTH_END), proration_behavior: 'none' }]);
      expect(stripe.refunds).toEqual([{ charge: 'ch_renewal', amount: String(expected), key: 'cancel-refund-in_renewal' }]);
      expect(expected).toBe(Math.round((paid * (11 - MONTH)) / 12));
      const row = await workerEnv.DB.prepare('SELECT * FROM subscription_cancellations').first();
      expect(row).toMatchObject({ ends_at: MONTH_END, at_period_end: 0, refund_invoice_ref: 'in_renewal', refund_amount: expected });
      expect(row.refunded_at).not.toBeNull();
      expect(row.completed_at).not.toBeNull();
      expect(done).toContain(formatMomentUtc(MONTH_END));
      expect(testEnv.EMAIL.sent[0].subject).toContain(formatMomentUtc(MONTH_END));

      // Stripe's own event for the cancel_at keeps the service page saying when it ends.
      await webhook(testEnv, 'customer.subscription.updated', stripe.state());
      expect(await entitlement(def.service)).toMatchObject({ status: 'active', cancel_at_period_end: 1, current_period_end: MONTH_END });
      expect(await (await get(def.page, testEnv, session.cookie)).text()).toContain(new Date(MONTH_END * 1000).toISOString().slice(0, 10));
    });

    it('refunds once for a double confirm, and never again for that renewal on a re-cancel', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv);
      const stripe = fakeStripe({ renewed: true });
      const statement = await summaryStatement(testEnv, session);
      await post(`${PATH}/confirm`, testEnv, { statement }, session.cookie);
      const again = await post(`${PATH}/confirm`, testEnv, { statement }, session.cookie);
      expect(again.status).toBe(200);
      expect(stripe.refunds).toHaveLength(1);
      expect(testEnv.EMAIL.sent).toHaveLength(1);
      expect(await count()).toBe(1);

      // The owner takes the cancel back at Stripe, then cancels again: no second refund.
      stripe.reactivate();
      await webhook(testEnv, 'customer.subscription.updated', stripe.state());
      expect(await entitlement()).toMatchObject({ cancel_at_period_end: 0 });
      const review = await (await post(`${PATH}/review`, testEnv, { name: 'Ada', service: 'private-network' }, session.cookie)).text();
      expect(review).not.toContain('refund');
      await post(`${PATH}/confirm`, testEnv, { statement: review.match(/name="statement" value="([^"]+)"/)[1] }, session.cookie);
      expect(stripe.writes).toHaveLength(2);
      expect(stripe.refunds).toHaveLength(1);
      expect(await count()).toBe(2);

      // Even a summary issued before the first refund was claimed gets none.
      stripe.reactivate();
      await webhook(testEnv, 'customer.subscription.updated', stripe.state());
      await workerEnv.DB.prepare('DELETE FROM subscription_cancellations').run();
      const stale = await summaryStatement(testEnv, session);
      expect(JSON.parse(Buffer.from(stale.split('.')[0], 'base64url').toString())).toMatchObject({ i: 'in_renewal' });
      // Meanwhile another declaration claims that renewal's refund.
      await workerEnv.DB.prepare(`INSERT INTO subscription_cancellations (subscription_ref, issued_at, account_id, service, name, ends_at, at_period_end, refund_invoice_ref, refund_amount, submitted_at, refunded_at, completed_at, acknowledged_at)
        SELECT 'sub_c1', 1, id, 'spl_hosted', 'Ada', ?, 0, 'in_renewal', 100, 1, 1, 1, 1 FROM accounts`).bind(MONTH_END).run();
      await post(`${PATH}/confirm`, testEnv, { statement: stale }, session.cookie);
      expect(stripe.refunds).toHaveLength(1);
      const rows = (await workerEnv.DB.prepare('SELECT refund_invoice_ref FROM subscription_cancellations ORDER BY issued_at').all()).results;
      expect(rows).toEqual([{ refund_invoice_ref: 'in_renewal' }, { refund_invoice_ref: null }]);
    });

    it('with Stripe down, still records and emails, alerts a person, and finishes on the schedule', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv, { email: 'outage@example.com' });
      fakeStripe({ renewed: true });
      const statement = await summaryStatement(testEnv, session);
      installStripeFetchMock({ default: async () => json({ error: { type: 'api_error' } }, 500) });

      const done = await (await post(`${PATH}/confirm`, testEnv, { statement }, session.cookie)).text();
      expect(done).toContain(formatMomentUtc(MONTH_END));
      expect(done).toContain('emailed this to outage@example.com');
      const row = await workerEnv.DB.prepare('SELECT * FROM subscription_cancellations').first();
      expect(row.completed_at).toBeNull();
      expect(row.refunded_at).toBeNull();
      const [mail, alert] = testEnv.EMAIL.sent;
      expect(mail.to).toBe('outage@example.com');
      expect(alert.to).toBe('support@solstone.app');
      expect(alert.text).not.toMatch(/sub_|cus_|in_renewal|outage@|Ada/);
      const lookup = alert.text.match(/^npx wrangler d1 execute account-portal --remote --command "(.+)"$/m)[1];
      expect((await workerEnv.DB.prepare(lookup).all()).results).toEqual([expect.objectContaining({ subscription_ref: 'sub_c1', stripe_customer_id: 'cus_c1' })]);
      // A pending declaration is not offered again.
      expect(await (await get(PATH, testEnv, session.cookie)).text()).not.toContain('name="service"');

      await runScheduled(testEnv);
      expect(testEnv.EMAIL.sent).toHaveLength(2);
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 49 * 3600 * 1000);
      await runScheduled(testEnv);
      await runScheduled(testEnv);
      expect(testEnv.EMAIL.sent).toHaveLength(3);
      vi.restoreAllMocks();

      const stripe = fakeStripe({ renewed: true });
      await runScheduled(testEnv);
      await runScheduled(testEnv);
      expect(stripe.writes).toEqual([{ cancel_at: String(MONTH_END), proration_behavior: 'none' }]);
      expect(stripe.refunds).toHaveLength(1);
      expect((await workerEnv.DB.prepare('SELECT completed_at FROM subscription_cancellations').first()).completed_at).not.toBeNull();
      expect(testEnv.EMAIL.sent).toHaveLength(3);
    });

    it('refuses a summary that was altered or has expired', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv);
      const stripe = fakeStripe({ renewed: true });
      const statement = await summaryStatement(testEnv, session);
      const [payload, signature] = statement.split('.');
      const altered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), r: 999999 })).toString('base64url');
      for (const bad of [`${altered}.${signature}`, 'nonsense']) {
        expect((await post(`${PATH}/confirm`, testEnv, { statement: bad }, session.cookie)).headers.get('Location')).toBe(PATH);
      }
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * 3600 * 1000);
      expect((await post(`${PATH}/confirm`, testEnv, { statement }, session.cookie)).headers.get('Location')).toBe(PATH);
      expect(await count()).toBe(0);
      expect(stripe.writes).toEqual([]);
    });
  });

  describe('the end at month end', () => {
    it('lapses through the subscription-deleted path: the relay grant runs to the month end, then closes; backup starts its 30 days', async () => {
      const pushes = [];
      const testEnv = makeTestEnv({
        ...ON,
        RELAY: { fetch: async (_url, init) => { pushes.push(JSON.parse(init.body)); return json({ ok: true }); } },
      });
      const { accountId } = await subscriber(testEnv);
      await seedEntitlement({ accountId, service: 'spb_hosted', sourceRef: 'sub_b1', currentPeriodEnd: YEAR_END });
      await seedSplBinding({ accountId });
      await seedSpbBinding({ accountId });
      const stripe = fakeStripe({ renewed: true, cancelAt: MONTH_END });

      await webhook(testEnv, 'customer.subscription.updated', stripe.state());
      expect(pushes.at(-1).entitled_until).toBe(MONTH_END);
      await webhook(testEnv, 'customer.subscription.deleted', { ...stripe.state(), status: 'canceled' });
      expect(await entitlement()).toMatchObject({ status: 'lapsed' });
      expect(pushes.at(-1).entitled_until).toBe(0);

      const spb = stripe.state();
      await webhook(testEnv, 'customer.subscription.deleted', { ...spb, id: 'sub_b1', status: 'canceled', metadata: { service: 'spb' } });
      expect(await entitlement('spb_hosted')).toMatchObject({ status: 'lapsed' });
      expect((await workerEnv.DB.prepare('SELECT lapsed_at FROM spb_bindings WHERE account_id = ?').bind(accountId).first()).lapsed_at).not.toBeNull();
    });
  });
});

async function subscriber(testEnv, { email = 'owner@example.com', service = 'spl_hosted', cancelAtPeriodEnd = false, periodEnd = YEAR_END } = {}) {
  const account = await seedAccount({ email, testEnv });
  const session = await seedSession(account.accountId, { testEnv });
  await seedEntitlement({ accountId: account.accountId, service, sourceRef: 'sub_c1', currentPeriodEnd: periodEnd, cancelAtPeriodEnd });
  await workerEnv.DB
    .prepare('INSERT INTO stripe_customers (account_id, stripe_customer_id, created_at) VALUES (?, ?, ?)')
    .bind(account.accountId, 'cus_c1', 1_000)
    .run();
  return { accountId: account.accountId, session };
}

// A Stripe that keeps the subscription's cancel state, and records every write and refund.
function fakeStripe({ renewed = false, tag = 'spl', amount = 2000, tax = 0, cancelAt = null }) {
  const start = renewed ? START : NOW_S - 30 * DAY;
  const periodStart = renewed ? RENEWAL : start;
  const periodEnd = renewed ? YEAR_END : serviceMonthStart(start, 12);
  let cancel = { cancel_at: cancelAt, cancel_at_period_end: false };
  const out = { writes: [], refunds: [] };
  const state = () => ({
    id: 'sub_c1',
    object: 'subscription',
    customer: 'cus_c1',
    status: 'active',
    start_date: start,
    created: start,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    ...cancel,
    metadata: { service: tag },
    items: { data: [{ quantity: 1, price: { unit_amount: amount, currency: 'usd', recurring: { interval: 'year' } } }] },
  });
  const invoices = [
    { id: 'in_first', amount_paid: amount + tax, charge: 'ch_first', created: start, billing_reason: 'subscription_create' },
    ...(renewed ? [{ id: 'in_renewal', amount_paid: amount + tax, charge: 'ch_renewal', created: RENEWAL + 30, billing_reason: 'subscription_cycle' }] : []),
  ];
  installStripeFetchMock({
    'GET api.stripe.com/v1/subscriptions/sub_c1': async () => json(state()),
    'POST api.stripe.com/v1/subscriptions/sub_c1': async ({ body }) => {
      out.writes.push(Object.fromEntries(body));
      cancel = body.get('cancel_at_period_end') === 'true'
        ? { cancel_at: periodEnd, cancel_at_period_end: true }
        : { cancel_at: Number(body.get('cancel_at')), cancel_at_period_end: false };
      return json(state());
    },
    'GET api.stripe.com/v1/invoices': async () => json({ object: 'list', data: invoices, has_more: false }),
    'POST api.stripe.com/v1/refunds': async ({ body, init }) => {
      out.refunds.push({ charge: body.get('charge'), amount: body.get('amount'), key: init.headers['Idempotency-Key'] });
      return json({ id: `re_${out.refunds.length}` });
    },
    'POST api.stripe.com/v1/billing_portal/sessions': async () => json({ url: 'https://billing.stripe.test/p' }),
  });
  out.state = state;
  out.reactivate = () => { cancel = { cancel_at: null, cancel_at_period_end: false }; };
  return out;
}

async function summaryStatement(testEnv, session, { name = 'Ada', service = 'private-network', end = 'earliest' } = {}) {
  const review = await (await post(`${PATH}/review`, testEnv, { name, service, end }, session.cookie)).text();
  const match = review.match(/name="statement" value="([^"]+)"/);
  if (!match) throw new Error('no statement on the summary');
  return match[1];
}

async function confirm(testEnv, session, fields = {}) {
  const statement = await summaryStatement(testEnv, session, fields);
  return post(`${PATH}/confirm`, testEnv, { statement }, session.cookie);
}

async function entitlement(service = 'spl_hosted') {
  return workerEnv.DB.prepare('SELECT status, cancel_at_period_end, current_period_end FROM entitlements WHERE service = ?').bind(service).first();
}

async function count() {
  return (await workerEnv.DB.prepare('SELECT COUNT(*) AS n FROM subscription_cancellations').first()).n;
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

async function webhook(testEnv, type, object) {
  const rawBody = JSON.stringify({ id: `evt_${Math.random()}`, type, data: { object } });
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request('https://services.solstone.app/stripe/webhook', {
    method: 'POST',
    headers: { 'Stripe-Signature': await signStripeWebhook(rawBody, testEnv.STRIPE_WEBHOOK_SECRET) },
    body: rawBody,
  }), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  expect(response.status).toBe(200);
}

async function runScheduled(testEnv) {
  const ctx = createExecutionContext();
  await worker.scheduled({ cron: '*/15 * * * *' }, testEnv, ctx);
  await waitOnExecutionContext(ctx);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
