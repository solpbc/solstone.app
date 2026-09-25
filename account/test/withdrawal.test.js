import { createExecutionContext, env as workerEnv, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { CHECKOUT_SUBMIT_TEXT_LIMIT, checkoutDisclosure } from '../src/stripe.js';
import {
  TEST_CSRF,
  installStripeFetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedSession,
  signStripeWebhook,
} from './helpers.js';

const DAY = 86400;
const NOW_S = Math.floor(Date.now() / 1000);
const ON = { WITHDRAWAL_DOOR: 'on' };
const DOOR = 'withdraw from contract here';

const SERVICES = [
  { slug: 'private-network', service: 'spl_hosted', tag: 'spl', page: '/private-network', checkout: '/billing/checkout', extra: {} },
  { slug: 'backup', service: 'spb_hosted', tag: 'spb', page: '/services/backup', checkout: '/services/backup/checkout', extra: {} },
  { slug: 'solstone-me', service: 'sme_hosted', tag: 'sme', page: '/services/solstone-me', checkout: '/services/solstone-me/checkout', extra: { data_ack: 'yes' } },
];

describe('withdrawal from a paid subscription within 14 days', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('with the door off, owners see none of it', () => {
    it('answers 404 on the withdraw routes and shows no door, box or disclosure', async () => {
      const testEnv = makeTestEnv();
      const { session, accountId } = await subscriber(testEnv, { purchasedAt: NOW_S - DAY });
      const { calls } = installStripeFetchMock({
        'GET api.stripe.com/v1/subscriptions/sub_w1': async () => stripeJson(subscription({ purchasedAt: NOW_S - DAY })),
        'POST api.stripe.com/v1/checkout/sessions': async () => stripeJson({ id: 'cs', url: 'https://checkout.stripe.test/s' }),
      });

      expect((await get('/billing/withdraw/private-network', testEnv, session.cookie)).status).toBe(404);
      expect((await post('/billing/withdraw/private-network', testEnv, form(), session.cookie)).status).toBe(404);
      expect(await (await get('/private-network', testEnv, session.cookie)).text()).not.toContain(DOOR);
      expect(await (await get('/billing', testEnv, session.cookie)).text()).not.toContain(DOOR);
      expect(calls.some((c) => c.method !== 'GET')).toBe(false);

      // A new buyer's checkout asks for no box and carries the renewal disclosure alone.
      const buyer = await seedAccount({ email: 'buyer-off@example.com', testEnv });
      const buyerSession = await seedSession(buyer.accountId, { testEnv });
      const page = await (await get('/private-network', testEnv, buyerSession.cookie)).text();
      expect(page).not.toContain('name="start_now"');
      const checkout = await post('/billing/checkout', testEnv, form({ plan: 'annual' }), buyerSession.cookie);
      expect(checkout.headers.get('Location')).toBe('https://checkout.stripe.test/s');
      const created = calls.find((c) => c.url.pathname === '/v1/checkout/sessions');
      expect(created.body.get('custom_text[submit][message]')).toBe(checkoutDisclosure());
      expect(created.body.has('subscription_data[metadata][start_now_requested_at]')).toBe(false);
      expect(accountId).toBeTruthy();
    });
  });

  describe('the door', () => {
    it.each(SERVICES)('is on the $slug page and the billing page for the whole 14 days, a pending cancel included', async (def) => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv, { service: def.service, purchasedAt: NOW_S - 13 * DAY });
      installStripeFetchMock({
        'GET api.stripe.com/v1/subscriptions/sub_w1': async () => stripeJson(subscription({ tag: def.tag, purchasedAt: NOW_S - 13 * DAY })),
      });

      const pageHtml = await (await get(def.page, testEnv, session.cookie)).text();
      expect(pageHtml).toContain(DOOR);
      expect(pageHtml).toContain(`href="/billing/withdraw/${def.slug}"`);
      expect(await (await get('/billing', testEnv, session.cookie)).text()).toContain(`href="/billing/withdraw/${def.slug}"`);

      // An ordinary cancel pending hides the turn-off door, and must not hide this one.
      await workerEnv.DB.prepare('UPDATE entitlements SET cancel_at_period_end = 1').run();
      const pending = await (await get(def.page, testEnv, session.cookie)).text();
      expect(pending).toContain(`href="/billing/withdraw/${def.slug}"`);
      expect(await (await get('/billing', testEnv, session.cookie)).text()).toContain(`href="/billing/withdraw/${def.slug}"`);
    });

    it('stays when the Stripe read fails, and is gone once the 14 days are over', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv, { purchasedAt: NOW_S - 15 * DAY });

      installStripeFetchMock({ 'GET api.stripe.com/v1/subscriptions/sub_w1': async () => stripeJson({ error: {} }, 500) });
      expect(await (await get('/private-network', testEnv, session.cookie)).text()).toContain(DOOR);
      expect(await (await get('/billing', testEnv, session.cookie)).text()).toContain(DOOR);

      installStripeFetchMock({ 'GET api.stripe.com/v1/subscriptions/sub_w1': async () => stripeJson(subscription({ purchasedAt: NOW_S - 15 * DAY })) });
      expect(await (await get('/private-network', testEnv, session.cookie)).text()).not.toContain(DOOR);
      expect(await (await get('/billing', testEnv, session.cookie)).text()).not.toContain(DOOR);
    });

    it('places the backup 30-day sentence beside the door', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv, { service: 'spb_hosted', purchasedAt: NOW_S - DAY });
      installStripeFetchMock({ 'GET api.stripe.com/v1/subscriptions/sub_w1': async () => stripeJson(subscription({ tag: 'spb', purchasedAt: NOW_S - DAY })) });
      const page = await (await get('/billing/withdraw/backup', testEnv, session.cookie)).text();
      expect(page).toContain('keeps your encrypted copy for 30 days');
      expect(await (await get('/billing', testEnv, session.cookie)).text()).toContain('keeps your encrypted copy for 30 days');
    });
  });

  describe('the start-now box', () => {
    it.each(SERVICES)('is unticked on the $slug page, required by the server, and recorded with the subscription', async (def) => {
      const testEnv = makeTestEnv(ON);
      const buyer = await seedAccount({ email: `buyer-${def.slug}@example.com`, testEnv });
      const session = await seedSession(buyer.accountId, { testEnv });
      const { calls } = installStripeFetchMock({
        'POST api.stripe.com/v1/checkout/sessions': async () => stripeJson({ id: 'cs', url: 'https://checkout.stripe.test/s' }),
      });

      const page = await (await get(def.page, testEnv, session.cookie)).text();
      expect(page).toMatch(/<input type="checkbox" name="start_now" value="yes" required>/);
      expect(page).not.toMatch(/name="start_now"[^>]*checked/);

      const refused = await post(def.checkout, testEnv, form({ plan: 'annual', ...def.extra }), session.cookie);
      expect(refused.headers.get('Location')).toBe(`${def.page}?checkout=start_now`);
      expect(calls).toHaveLength(0);

      const before = Date.now();
      const accepted = await post(def.checkout, testEnv, form({ plan: 'annual', start_now: 'yes', ...def.extra }), session.cookie);
      expect(accepted.headers.get('Location')).toBe('https://checkout.stripe.test/s');
      const body = calls[0].body;
      const at = Date.parse(body.get('subscription_data[metadata][start_now_requested_at]'));
      expect(at).toBeGreaterThanOrEqual(before - 1000);
      expect(at).toBeLessThanOrEqual(Date.now());
      const text = body.get('custom_text[submit][message]');
      expect(text).toBe(checkoutDisclosure({ withdrawal: true }));
      expect(text.startsWith(checkoutDisclosure())).toBe(true);
      expect(text.length).toBeLessThanOrEqual(CHECKOUT_SUBMIT_TEXT_LIMIT);
    });
  });

  describe('the withdraw page', () => {
    it('names the sign-in, the subscription and the acknowledgement address, with one confirm button', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv, { email: 'owner-page@example.com', purchasedAt: NOW_S - 2 * DAY });
      installStripeFetchMock({ 'GET api.stripe.com/v1/subscriptions/sub_w1': async () => stripeJson(subscription({ purchasedAt: NOW_S - 2 * DAY })) });

      const html = await (await get('/billing/withdraw/private-network', testEnv, session.cookie)).text();
      expect(html).toContain('signed in as owner-page@example.com');
      expect(html).toContain('<strong>private network</strong> ($20 / year), bought on');
      expect(html).toContain("we'll email the acknowledgement to owner-page@example.com.");
      const form = html.slice(html.indexOf('action="/billing/withdraw/private-network"'));
      expect(form.slice(0, form.indexOf('</form>')).match(/type="submit"/g)).toHaveLength(1);
      expect(html.match(/>confirm withdrawal</g)).toHaveLength(1);
    });

    it('says the period is over after 14 days, and refuses a confirm', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv, { purchasedAt: NOW_S - 15 * DAY });
      const { calls } = installStripeFetchMock({ 'GET api.stripe.com/v1/subscriptions/sub_w1': async () => stripeJson(subscription({ purchasedAt: NOW_S - 15 * DAY })) });

      expect(await (await get('/billing/withdraw/private-network', testEnv, session.cookie)).text()).toContain('the 14 days to withdraw from this private network subscription ended');
      const response = await post('/billing/withdraw/private-network', testEnv, form(), session.cookie);
      expect(response.headers.get('Location')).toBe('/billing/withdraw/private-network?withdrawal=closed');
      expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
      expect(await rowCount()).toBe(0);
    });

    it('enforces origin, csrf and ownership', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv, { purchasedAt: NOW_S - DAY });
      const { calls } = installStripeFetchMock({
        'GET api.stripe.com/v1/subscriptions/sub_w1': async () => stripeJson({ ...subscription({ purchasedAt: NOW_S - DAY }), customer: 'cus_someone_else' }),
      });
      expect((await post('/billing/withdraw/private-network', testEnv, form({ csrf: 'wrong' }), session.cookie)).status).toBe(403);
      expect((await post('/billing/withdraw/private-network', testEnv, form(), session.cookie, 'https://evil.test')).status).toBe(403);
      const mismatch = await post('/billing/withdraw/private-network', testEnv, form(), session.cookie);
      expect(mismatch.headers.get('Location')).toBe('/private-network?withdrawal=missing');
      expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
    });
  });

  describe('confirming', () => {
    it('refunds in full, ends the subscription now, lapses the entitlement and emails the acknowledgement', async () => {
      const testEnv = makeTestEnv(ON);
      const { session, accountId } = await subscriber(testEnv, { email: 'withdraw@example.com', purchasedAt: NOW_S - 3 * DAY });
      const stripe = fakeStripe({ purchasedAt: NOW_S - 3 * DAY });

      const before = Date.now();
      const response = await post('/billing/withdraw/private-network', testEnv, form(), session.cookie);
      expect(response.headers.get('Location')).toBe('/private-network?withdrawal=done');

      expect(stripe.refunds).toEqual([{ charge: 'ch_w1', key: 'withdrawal-refund-ch_w1' }]);
      expect(stripe.cancels).toEqual(['sub_w1']);
      expect(stripe.order).toEqual(['refund', 'cancel']);
      const entitlement = await workerEnv.DB.prepare('SELECT status FROM entitlements WHERE account_id = ?').bind(accountId).first();
      expect(entitlement.status).toBe('lapsed');

      expect(testEnv.EMAIL.sent).toHaveLength(1);
      const mail = testEnv.EMAIL.sent[0];
      expect(mail.to).toBe('withdraw@example.com');
      expect(mail.subject).toBe('your private network subscription: withdrawal received');
      const row = await workerEnv.DB.prepare('SELECT * FROM subscription_withdrawals').first();
      expect(row.submitted_at).toBeGreaterThanOrEqual(before);
      expect(mail.text).toContain(`you submitted it on ${new Date(row.submitted_at).toISOString().slice(0, 16).replace('T', ' ')} UTC`);
      expect(mail.text).toContain('private network has ended');
      expect(row.completed_at).not.toBeNull();
      expect(row.acknowledged_at).not.toBeNull();
      expect(row.purchased_at).toBe(NOW_S - 3 * DAY);
    });

    it('refunds once for a double confirm and for a replayed deleted webhook', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv, { purchasedAt: NOW_S - DAY });
      const stripe = fakeStripe({ purchasedAt: NOW_S - DAY });

      await post('/billing/withdraw/private-network', testEnv, form(), session.cookie);
      // The entitlement has lapsed, so a second confirm finds nothing to withdraw from.
      const again = await post('/billing/withdraw/private-network', testEnv, form(), session.cookie);
      expect(again.headers.get('Location')).toBe('/private-network?withdrawal=missing');
      const deleted = JSON.stringify({ id: 'evt_del', type: 'customer.subscription.deleted', data: { object: { ...subscription({ purchasedAt: NOW_S - DAY }), status: 'canceled' } } });
      await postWebhook(testEnv, deleted);
      await postWebhook(testEnv, deleted);

      expect(stripe.refunds).toHaveLength(1);
      expect(stripe.cancels).toHaveLength(1);
      expect(testEnv.EMAIL.sent).toHaveLength(1);
    });

    it('keeps the door and the subscription when the refund fails, and a retry finishes it', async () => {
      const testEnv = makeTestEnv(ON);
      const { session, accountId } = await subscriber(testEnv, { purchasedAt: NOW_S - DAY });
      const stripe = fakeStripe({ purchasedAt: NOW_S - DAY, refundFails: 1 });

      const failed = await post('/billing/withdraw/private-network', testEnv, form(), session.cookie);
      expect(failed.headers.get('Location')).toBe('/billing/withdraw/private-network?withdrawal=error');
      expect(stripe.cancels).toHaveLength(0);
      expect((await workerEnv.DB.prepare('SELECT status FROM entitlements WHERE account_id = ?').bind(accountId).first()).status).toBe('active');
      expect(await (await get('/private-network', testEnv, session.cookie)).text()).toContain(DOOR);
      expect(await (await get('/billing/withdraw/private-network?withdrawal=error', testEnv, session.cookie)).text()).toContain("the withdrawal didn't finish");
      expect(testEnv.EMAIL.sent).toHaveLength(0);

      const retried = await post('/billing/withdraw/private-network', testEnv, form(), session.cookie);
      expect(retried.headers.get('Location')).toBe('/private-network?withdrawal=done');
      expect(stripe.refunds).toHaveLength(1);
      expect(stripe.cancels).toHaveLength(1);
      expect(testEnv.EMAIL.sent).toHaveLength(1);
    });

    it('does not refund twice when the cancel failed after the refund, even once the 14 days are over', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv, { purchasedAt: NOW_S - 13 * DAY - DAY / 2 });
      const stripe = fakeStripe({ purchasedAt: NOW_S - 13 * DAY - DAY / 2, cancelFails: 1 });

      const failed = await post('/billing/withdraw/private-network', testEnv, form(), session.cookie);
      expect(failed.headers.get('Location')).toBe('/billing/withdraw/private-network?withdrawal=error');
      expect(stripe.refunds).toHaveLength(1);

      // The period ends before the owner retries; the submission already made still counts.
      await workerEnv.DB.prepare('UPDATE subscription_withdrawals SET purchased_at = purchased_at - 86400').run();
      stripe.setPurchasedAt(NOW_S - 15 * DAY);
      expect(await (await get('/billing/withdraw/private-network', testEnv, session.cookie)).text()).toContain("it hasn't finished yet");
      const retried = await post('/billing/withdraw/private-network', testEnv, form(), session.cookie);
      expect(retried.headers.get('Location')).toBe('/private-network?withdrawal=done');
      expect(stripe.refundAttempts).toBe(2);
      expect(stripe.refunds).toHaveLength(1);
      expect(stripe.cancels).toHaveLength(1);
    });

    it('is finished by the schedule when the owner does not retry, and the acknowledgement is resent after a failed send', async () => {
      const testEnv = makeTestEnv({ ...ON, emailSendError: true });
      const { session } = await subscriber(testEnv, { purchasedAt: NOW_S - DAY });
      const stripe = fakeStripe({ purchasedAt: NOW_S - DAY, cancelFails: 1 });

      await post('/billing/withdraw/private-network', testEnv, form(), session.cookie);
      await runScheduled(testEnv);
      expect(stripe.cancels).toHaveLength(1);
      let row = await workerEnv.DB.prepare('SELECT completed_at, acknowledged_at FROM subscription_withdrawals').first();
      expect(row.completed_at).not.toBeNull();
      expect(row.acknowledged_at).toBeNull();

      const working = { ...testEnv, EMAIL: makeTestEnv().EMAIL };
      await runScheduled(working);
      await runScheduled(working);
      expect(working.EMAIL.sent).toHaveLength(1);
      row = await workerEnv.DB.prepare('SELECT acknowledged_at FROM subscription_withdrawals').first();
      expect(row.acknowledged_at).not.toBeNull();
      expect(stripe.refunds).toHaveLength(1);
    });

    it('leaves an ordinary cancel exactly as it was', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv, { purchasedAt: NOW_S - DAY });
      const { calls } = installStripeFetchMock({
        'POST api.stripe.com/v1/billing_portal/sessions': async () => stripeJson({ url: 'https://billing.stripe.test/p' }),
      });
      const response = await post('/billing/cancel', testEnv, form(), session.cookie);
      expect(response.headers.get('Location')).toBe('https://billing.stripe.test/p');
      expect(calls).toHaveLength(1);
      expect(calls[0].body.get('flow_data[type]')).toBe('subscription_cancel');
    });
  });
});

async function subscriber(testEnv, { email = 'subscriber@example.com', service = 'spl_hosted', purchasedAt }) {
  const account = await seedAccount({ email, testEnv });
  const session = await seedSession(account.accountId, { testEnv });
  await seedEntitlement({ accountId: account.accountId, service, sourceRef: 'sub_w1', currentPeriodEnd: purchasedAt + 365 * DAY });
  await workerEnv.DB
    .prepare('INSERT INTO stripe_customers (account_id, stripe_customer_id, created_at) VALUES (?, ?, ?)')
    .bind(account.accountId, 'cus_w1', 1_000)
    .run();
  return { accountId: account.accountId, session };
}

function subscription({ tag = 'spl', purchasedAt, status = 'active' }) {
  return {
    id: 'sub_w1',
    object: 'subscription',
    customer: 'cus_w1',
    status,
    start_date: purchasedAt,
    created: purchasedAt,
    current_period_end: purchasedAt + 365 * DAY,
    cancel_at_period_end: false,
    metadata: { service: tag },
    items: { data: [{ quantity: 1, price: { unit_amount: 2000, currency: 'usd', recurring: { interval: 'year' } } }] },
  };
}

// A Stripe that keeps the state a withdrawal changes: whether the charge is refunded and the
// subscription ended, and the order the calls came in.
function fakeStripe({ purchasedAt, refundFails = 0, cancelFails = 0 }) {
  const state = { purchasedAt, refunded: false, canceled: false };
  const out = { refunds: [], cancels: [], order: [], refundAttempts: 0, setPurchasedAt: (v) => { state.purchasedAt = v; } };
  installStripeFetchMock({
    'GET api.stripe.com/v1/subscriptions/sub_w1': async () => stripeJson(subscription({ purchasedAt: state.purchasedAt, status: state.canceled ? 'canceled' : 'active' })),
    'GET api.stripe.com/v1/invoices': async ({ url }) => {
      expect(url.searchParams.get('subscription')).toBe('sub_w1');
      expect(url.searchParams.get('status')).toBe('paid');
      return stripeJson({ object: 'list', data: [{ id: 'in_w1', amount_paid: 2000, charge: 'ch_w1' }], has_more: false });
    },
    'POST api.stripe.com/v1/refunds': async ({ body, init }) => {
      out.refundAttempts += 1;
      if (refundFails > 0) {
        refundFails -= 1;
        return stripeJson({ error: { type: 'api_error' } }, 500);
      }
      if (state.refunded) return stripeJson({ error: { type: 'invalid_request_error', code: 'charge_already_refunded' } }, 400);
      state.refunded = true;
      out.order.push('refund');
      out.refunds.push({ charge: body.get('charge'), key: init.headers['Idempotency-Key'] });
      return stripeJson({ id: 're_w1', amount: 2000, charge: body.get('charge') });
    },
    'DELETE api.stripe.com/v1/subscriptions/sub_w1': async () => {
      if (cancelFails > 0) {
        cancelFails -= 1;
        return stripeJson({ error: { type: 'api_error' } }, 500);
      }
      state.canceled = true;
      out.order.push('cancel');
      out.cancels.push('sub_w1');
      return stripeJson({ id: 'sub_w1', status: 'canceled' });
    },
  });
  return out;
}

function form(fields = {}) {
  return new URLSearchParams({ csrf: TEST_CSRF, ...fields });
}

function get(path, testEnv, cookie = '') {
  const headers = cookie ? { Cookie: cookie } : {};
  return worker.fetch(new Request(`https://services.solstone.app${path}`, { headers }), testEnv, createExecutionContext());
}

function post(path, testEnv, body, cookie = '', origin = 'https://services.solstone.app') {
  const headers = { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' };
  if (cookie) headers.Cookie = cookie;
  return worker.fetch(new Request(`https://services.solstone.app${path}`, { method: 'POST', headers, body }), testEnv, createExecutionContext());
}

async function postWebhook(testEnv, rawBody) {
  const signature = await signStripeWebhook(rawBody, testEnv.STRIPE_WEBHOOK_SECRET);
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request('https://services.solstone.app/stripe/webhook', {
    method: 'POST',
    headers: { 'Stripe-Signature': signature },
    body: rawBody,
  }), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function runScheduled(testEnv) {
  const ctx = createExecutionContext();
  await worker.scheduled({ cron: '*/15 * * * *' }, testEnv, ctx);
  await waitOnExecutionContext(ctx);
}

async function rowCount() {
  const row = await workerEnv.DB.prepare('SELECT COUNT(*) AS n FROM subscription_withdrawals').first();
  return row.n;
}

function stripeJson(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
