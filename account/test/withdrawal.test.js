import { createExecutionContext, env as workerEnv, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { runRetention } from '../src/retention.js';
import { CHECKOUT_SUBMIT_TEXT_LIMIT, checkoutDisclosure } from '../src/stripe.js';
import { formatLongDate, formatMomentUtc } from '../src/withdrawal-rules.js';
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
      const { session } = await subscriber(testEnv, { purchasedAt: NOW_S - DAY });
      const { calls } = installStripeFetchMock({
        'GET api.stripe.com/v1/subscriptions/sub_w1': async () => stripeJson(subscription({ purchasedAt: NOW_S - DAY })),
        'POST api.stripe.com/v1/checkout/sessions': async () => stripeJson({ id: 'cs_off', url: 'https://checkout.stripe.test/s' }),
      });

      expect((await get('/billing/withdraw/private-network', testEnv, session.cookie)).status).toBe(404);
      expect((await post('/billing/withdraw/private-network', testEnv, form(), session.cookie)).status).toBe(404);
      expect(await (await get('/private-network', testEnv, session.cookie)).text()).not.toContain(DOOR);
      expect(await (await get('/billing', testEnv, session.cookie)).text()).not.toContain(DOOR);

      const buyer = await seedAccount({ email: 'buyer-off@example.com', testEnv });
      const buyerSession = await seedSession(buyer.accountId, { testEnv });
      expect(await (await get('/private-network', testEnv, buyerSession.cookie)).text()).not.toContain('name="start_now"');
      const checkout = await post('/billing/checkout', testEnv, form({ plan: 'annual' }), buyerSession.cookie);
      expect(checkout.headers.get('Location')).toBe('https://checkout.stripe.test/s');
      const created = calls.find((c) => c.url.pathname === '/v1/checkout/sessions');
      expect(created.body.get('custom_text[submit][message]')).toBe(checkoutDisclosure());
      expect(await count('subscription_start_requests')).toBe(0);
    });
  });

  describe('the door', () => {
    it.each(SERVICES)('is on the $slug page and the billing page, a pending cancel included', async (def) => {
      const testEnv = makeTestEnv(ON);
      const purchasedAt = NOW_S - 13 * DAY;
      const { session } = await subscriber(testEnv, { service: def.service, purchasedAt });
      installStripeFetchMock({ 'GET api.stripe.com/v1/subscriptions/sub_w1': async () => stripeJson(subscription({ tag: def.tag, purchasedAt })) });

      const pageHtml = await (await get(def.page, testEnv, session.cookie)).text();
      expect(pageHtml).toContain(`href="/billing/withdraw/${def.slug}"`);
      expect(pageHtml).toContain(`you can withdraw until the end of the 14th day after ${formatLongDate(purchasedAt)}, for a full refund.`);
      expect(await (await get('/billing', testEnv, session.cookie)).text()).toContain(`href="/billing/withdraw/${def.slug}"`);

      // An ordinary cancel pending hides the turn-off door, and must not hide this one.
      await workerEnv.DB.prepare('UPDATE entitlements SET cancel_at_period_end = 1').run();
      expect(await (await get(def.page, testEnv, session.cookie)).text()).toContain(`href="/billing/withdraw/${def.slug}"`);
      expect(await (await get('/billing', testEnv, session.cookie)).text()).toContain(`href="/billing/withdraw/${def.slug}"`);
    });

    it('never shows a date that could read as passed: undated after 15 days, gone after 21', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv, { purchasedAt: NOW_S - 17 * DAY });
      installStripeFetchMock({ 'GET api.stripe.com/v1/subscriptions/sub_w1': async () => stripeJson(subscription({ purchasedAt: NOW_S - 17 * DAY })) });
      const late = await (await get('/private-network', testEnv, session.cookie)).text();
      expect(late).toContain('you can still withdraw here, for a full refund.');
      expect(late).not.toContain('14th day after');

      installStripeFetchMock({ 'GET api.stripe.com/v1/subscriptions/sub_w1': async () => stripeJson(subscription({ purchasedAt: NOW_S - 22 * DAY })) });
      expect(await (await get('/private-network', testEnv, session.cookie)).text()).not.toContain(DOOR);
      expect(await (await get('/billing', testEnv, session.cookie)).text()).not.toContain(DOOR);
    });

    it('stays, undated, when the Stripe read fails', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv, { purchasedAt: NOW_S - 30 * DAY });
      installStripeFetchMock({ 'GET api.stripe.com/v1/subscriptions/sub_w1': async () => stripeJson({ error: {} }, 500) });
      const page = await (await get('/private-network', testEnv, session.cookie)).text();
      expect(page).toContain(DOOR);
      expect(page).toContain('you can still withdraw here, for a full refund.');
      expect(await (await get('/billing', testEnv, session.cookie)).text()).toContain(DOOR);
      expect(await (await get('/billing/withdraw/private-network', testEnv, session.cookie)).text()).toContain("your subscription details didn't load");
    });

    it('places the backup sentence beside the door', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv, { service: 'spb_hosted', purchasedAt: NOW_S - DAY });
      installStripeFetchMock({ 'GET api.stripe.com/v1/subscriptions/sub_w1': async () => stripeJson(subscription({ tag: 'spb', purchasedAt: NOW_S - DAY })) });
      const line = 'we keep your encrypted backup copy for 30 days, then delete it. if you offloaded media into it, that copy is the only one.';
      expect(await (await get('/billing/withdraw/backup', testEnv, session.cookie)).text()).toContain(line);
      expect(await (await get('/billing', testEnv, session.cookie)).text()).toContain(line);
    });
  });

  describe('the start-now box', () => {
    it.each(SERVICES)('is unticked on the $slug page, required by the server, and kept with us, not at Stripe', async (def) => {
      const testEnv = makeTestEnv(ON);
      const buyer = await seedAccount({ email: `buyer-${def.slug}@example.com`, testEnv });
      const session = await seedSession(buyer.accountId, { testEnv });
      const { calls } = installStripeFetchMock({
        'POST api.stripe.com/v1/checkout/sessions': async () => stripeJson({ id: `cs_${def.tag}`, url: 'https://checkout.stripe.test/s' }),
      });

      const page = await (await get(def.page, testEnv, session.cookie)).text();
      expect(page).toMatch(/<input type="checkbox" name="start_now" value="yes" required>/);
      expect(page).not.toMatch(/name="start_now"[^>]*checked/);
      // Above the button that goes to Checkout.
      expect(page.indexOf('name="start_now"')).toBeLessThan(page.indexOf('pay yearly'));

      const refused = await post(def.checkout, testEnv, form({ plan: 'annual', ...def.extra }), session.cookie);
      expect(refused.headers.get('Location')).toBe(`${def.page}?checkout=start_now`);
      expect(calls).toHaveLength(0);

      const before = Date.now();
      const accepted = await post(def.checkout, testEnv, form({ plan: 'annual', start_now: 'yes', ...def.extra }), session.cookie);
      expect(accepted.headers.get('Location')).toBe('https://checkout.stripe.test/s');
      const sent = [...calls[0].body.keys()];
      expect(sent.some((key) => key.includes('start_now'))).toBe(false);
      const text = calls[0].body.get('custom_text[submit][message]');
      expect(text).toBe(checkoutDisclosure({ withdrawal: true }));
      expect(text.startsWith(checkoutDisclosure())).toBe(true);
      expect(text.length).toBeLessThanOrEqual(CHECKOUT_SUBMIT_TEXT_LIMIT);

      const row = await workerEnv.DB.prepare('SELECT * FROM subscription_start_requests').first();
      expect(row).toMatchObject({ checkout_session_ref: `cs_${def.tag}`, account_id: buyer.accountId, service: def.service, subscription_ref: null });
      expect(row.requested_at).toBeGreaterThanOrEqual(before);
    });

    it('is tied to the subscription when its checkout completes, and swept if it never does', async () => {
      const testEnv = makeTestEnv(ON);
      const buyer = await seedAccount({ email: 'start-now-attach@example.com', testEnv });
      const session = await seedSession(buyer.accountId, { testEnv });
      let n = 0;
      installStripeFetchMock({
        'POST api.stripe.com/v1/checkout/sessions': async () => stripeJson({ id: `cs_attach_${(n += 1)}`, url: 'https://checkout.stripe.test/s' }),
        'GET api.stripe.com/v1/subscriptions/sub_w1': async () => stripeJson(subscription({ purchasedAt: NOW_S })),
      });
      await post('/billing/checkout', testEnv, form({ plan: 'annual', start_now: 'yes' }), session.cookie);
      await post('/billing/checkout', testEnv, form({ plan: 'annual', start_now: 'yes' }), session.cookie);
      await postWebhook(testEnv, JSON.stringify({
        id: 'evt_attach',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_attach_1', client_reference_id: buyer.accountId, customer: 'cus_w1', subscription: 'sub_w1' } },
      }));
      const rows = (await workerEnv.DB.prepare('SELECT checkout_session_ref, subscription_ref FROM subscription_start_requests ORDER BY checkout_session_ref').all()).results;
      expect(rows).toEqual([
        { checkout_session_ref: 'cs_attach_1', subscription_ref: 'sub_w1' },
        { checkout_session_ref: 'cs_attach_2', subscription_ref: null },
      ]);

      await runRetention(testEnv, Date.now() + 3 * DAY * 1000);
      const kept = (await workerEnv.DB.prepare('SELECT checkout_session_ref FROM subscription_start_requests').all()).results;
      expect(kept).toEqual([{ checkout_session_ref: 'cs_attach_1' }]);
    });
  });

  describe('the withdraw page', () => {
    it('shows who is signed in, the subscription and where the acknowledgement goes, all read-only, with one confirm', async () => {
      const testEnv = makeTestEnv(ON);
      const purchasedAt = NOW_S - 2 * DAY;
      const { session } = await subscriber(testEnv, { email: 'owner-page@example.com', purchasedAt });
      installStripeFetchMock({ 'GET api.stripe.com/v1/subscriptions/sub_w1': async () => stripeJson(subscription({ purchasedAt })) });

      const html = await (await get('/billing/withdraw/private-network', testEnv, session.cookie)).text();
      expect(html).toContain('<h1>withdraw from your private network subscription</h1>');
      expect(html).toContain('signed in as owner-page@example.com');
      expect(html).toContain(`subscription: private network, $20 every year, bought on ${formatLongDate(purchasedAt)}`);
      expect(html).toContain("we'll send the acknowledgement to owner-page@example.com");
      expect(html).toContain(`if you withdraw, private network stops today and we refund everything you paid for this subscription. you have until the end of the 14th day after ${formatLongDate(purchasedAt)}.`);
      const formHtml = html.slice(html.indexOf('action="/billing/withdraw/private-network"'));
      const inputs = formHtml.slice(0, formHtml.indexOf('</form>')).match(/<input [^>]*>/g);
      expect(inputs.every((input) => input.includes('type="hidden"'))).toBe(true);
      expect(html.match(/>confirm withdrawal</g)).toHaveLength(1);
    });

    it('says the period is over after 21 days, and a confirm without the page statement records nothing', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv, { purchasedAt: NOW_S - 22 * DAY });
      const { calls } = installStripeFetchMock({ 'GET api.stripe.com/v1/subscriptions/sub_w1': async () => stripeJson(subscription({ purchasedAt: NOW_S - 22 * DAY })) });
      expect(await (await get('/billing/withdraw/private-network', testEnv, session.cookie)).text())
        .toContain(`the 14 days to withdraw from this private network subscription, bought on ${formatLongDate(NOW_S - 22 * DAY)}, are over.`);
      const response = await post('/billing/withdraw/private-network', testEnv, form(), session.cookie);
      expect(response.headers.get('Location')).toBe('/billing/withdraw/private-network');
      expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
      expect(await count('subscription_withdrawals')).toBe(0);
    });

    it('refuses a statement that was altered, belongs to another subscription, or has expired', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv, { purchasedAt: NOW_S - DAY });
      fakeStripe({ purchasedAt: NOW_S - DAY });
      const statement = await pageStatement(testEnv, session);
      const [payload, signature] = statement.split('.');
      const altered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), p: NOW_S - 30 * DAY })).toString('base64url');
      for (const bad of [`${altered}.${signature}`, `${payload}.${signature}x`, 'nonsense']) {
        const response = await post('/billing/withdraw/private-network', testEnv, form({ statement: bad }), session.cookie);
        expect(response.headers.get('Location')).toBe('/billing/withdraw/private-network');
      }
      expect(await count('subscription_withdrawals')).toBe(0);

      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * 3600 * 1000);
      const stale = await post('/billing/withdraw/private-network', testEnv, form({ statement }), session.cookie);
      expect(stale.headers.get('Location')).toBe('/billing/withdraw/private-network');
      expect(await count('subscription_withdrawals')).toBe(0);
    });
  });

  describe('confirming', () => {
    it('records, ends the service, acknowledges, then refunds in full and ends the Stripe subscription', async () => {
      const testEnv = makeTestEnv(ON);
      const purchasedAt = NOW_S - 3 * DAY;
      const { session, accountId } = await subscriber(testEnv, { email: 'withdraw@example.com', purchasedAt });
      const stripe = fakeStripe({ purchasedAt });

      const before = Date.now();
      const response = await confirm(testEnv, session);
      expect(response.headers.get('Location')).toBe('/private-network?withdrawal=done');
      expect(stripe.refunds).toEqual([{ charge: 'ch_w1', key: 'withdrawal-refund-ch_w1' }]);
      expect(stripe.cancels).toEqual(['sub_w1']);
      expect(stripe.order).toEqual(['refund', 'cancel']);
      expect((await workerEnv.DB.prepare('SELECT status FROM entitlements WHERE account_id = ?').bind(accountId).first()).status).toBe('lapsed');

      const row = await workerEnv.DB.prepare('SELECT * FROM subscription_withdrawals').first();
      expect(row.submitted_at).toBeGreaterThanOrEqual(before);
      expect(row.purchased_at).toBe(purchasedAt);
      expect(row.completed_at).not.toBeNull();
      expect(row.acknowledged_at).not.toBeNull();
      expect(row.failure_alerted_at).toBeNull();

      expect(testEnv.EMAIL.sent).toHaveLength(1);
      const mail = testEnv.EMAIL.sent[0];
      expect(mail.to).toBe('withdraw@example.com');
      expect(mail.subject).toBe('you withdrew from your private network subscription');
      expect(mail.text).toContain('what you sent us. a withdrawal from your private network subscription.');
      expect(mail.text).toContain(`the subscription. private network, $20 every year, bought on ${formatLongDate(purchasedAt)}.`);
      expect(mail.text).toContain('from. signed in as withdraw@example.com, and this confirmation is sent there.');
      expect(mail.text).toContain(`sent. ${formatMomentUtc(Math.floor(row.submitted_at / 1000))}.`);
      expect(mail.text).toContain("private network stops today and won't renew");
      expect(mail.text).not.toMatch(/\$20,|\$20 back|refunding \$/);
    });

    it('with Stripe down, still records, ends the service and acknowledges, alerts a person, and finishes later', async () => {
      const testEnv = makeTestEnv(ON);
      const { session, accountId } = await subscriber(testEnv, { purchasedAt: NOW_S - DAY });
      const statement = await pageStatement(testEnv, session, NOW_S - DAY);
      installStripeFetchMock({ default: async () => stripeJson({ error: { type: 'api_error' } }, 500) });

      const failed = await post('/billing/withdraw/private-network', testEnv, form({ statement }), session.cookie);
      expect(failed.headers.get('Location')).toBe('/billing/withdraw/private-network?withdrawal=error');
      expect((await workerEnv.DB.prepare('SELECT status FROM entitlements WHERE account_id = ?').bind(accountId).first()).status).toBe('lapsed');
      const [ack, alert] = testEnv.EMAIL.sent;
      expect(ack.subject).toBe('you withdrew from your private network subscription');
      expect(alert.to).toBe('support@solstone.app');
      expect(alert.subject).toBe('a withdrawal needs a person: private network');
      expect(alert.text).toContain('subscription: sub_w1');
      expect(await (await get('/billing/withdraw/private-network?withdrawal=error', testEnv, session.cookie)).text())
        .toContain("finishing it hit a problem on our side; we'll keep trying, and you don't need to do anything.");
      expect(await (await get('/billing/withdraw/private-network', testEnv, session.cookie)).text()).toContain("and we're finishing it. you don't need to do anything.");

      // Still down on the schedule: no second alert yet. Past 48 hours: one more.
      await runScheduled(testEnv);
      expect(testEnv.EMAIL.sent).toHaveLength(2);
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 49 * 3600 * 1000);
      await runScheduled(testEnv);
      await runScheduled(testEnv);
      expect(testEnv.EMAIL.sent).toHaveLength(3);
      expect(testEnv.EMAIL.sent[2].subject).toBe('a withdrawal is still unrefunded after 48 hours: private network');

      const stripe = fakeStripe({ purchasedAt: NOW_S - DAY });
      await runScheduled(testEnv);
      expect(stripe.refunds).toHaveLength(1);
      expect(stripe.cancels).toHaveLength(1);
      expect((await workerEnv.DB.prepare('SELECT completed_at FROM subscription_withdrawals').first()).completed_at).not.toBeNull();
      expect(testEnv.EMAIL.sent).toHaveLength(3);
    });

    it('refunds once for a double confirm, and stays ended through replayed and late webhooks', async () => {
      const testEnv = makeTestEnv(ON);
      const { session, accountId } = await subscriber(testEnv, { purchasedAt: NOW_S - DAY });
      const stripe = fakeStripe({ purchasedAt: NOW_S - DAY });
      const statement = await pageStatement(testEnv, session);

      await post('/billing/withdraw/private-network', testEnv, form({ statement }), session.cookie);
      const again = await post('/billing/withdraw/private-network', testEnv, form({ statement }), session.cookie);
      expect(again.headers.get('Location')).toBe('/private-network?withdrawal=missing');
      const active = subscription({ purchasedAt: NOW_S - DAY });
      await postWebhook(testEnv, JSON.stringify({ id: 'evt_late', type: 'customer.subscription.updated', data: { object: active } }));
      await postWebhook(testEnv, JSON.stringify({ id: 'evt_del', type: 'customer.subscription.deleted', data: { object: { ...active, status: 'canceled' } } }));
      expect((await workerEnv.DB.prepare('SELECT status FROM entitlements WHERE account_id = ?').bind(accountId).first()).status).toBe('lapsed');
      expect(stripe.refunds).toHaveLength(1);
      expect(stripe.cancels).toHaveLength(1);
      expect(testEnv.EMAIL.sent).toHaveLength(1);

      // Subscribing again is a new subscription, which a late event about the old one leaves alone.
      await seedEntitlement({ accountId, sourceRef: 'sub_w2', currentPeriodEnd: NOW_S + 365 * DAY });
      await postWebhook(testEnv, JSON.stringify({ id: 'evt_late2', type: 'customer.subscription.updated', data: { object: active } }));
      expect(await workerEnv.DB.prepare('SELECT status, source_ref FROM entitlements WHERE account_id = ?').bind(accountId).first())
        .toEqual({ status: 'active', source_ref: 'sub_w2' });
    });

    it('carries each service\'s own line in the acknowledgement', async () => {
      for (const [def, keep, drop] of [
        [SERVICES[1], 'we keep your encrypted backup copy for 30 days from today', 'solstone.me address stays reserved'],
        [SERVICES[2], 'your solstone.me address stays reserved for you', 'encrypted backup copy'],
      ]) {
        await resetDb();
        const testEnv = makeTestEnv(ON);
        const { session } = await subscriber(testEnv, { service: def.service, purchasedAt: NOW_S - DAY });
        fakeStripe({ purchasedAt: NOW_S - DAY, tag: def.tag });
        const statement = await pageStatement(testEnv, session, null, def.slug);
        const response = await post(`/billing/withdraw/${def.slug}`, testEnv, form({ statement }), session.cookie);
        expect(response.headers.get('Location')).toBe(`${def.page}?withdrawal=done`);
        expect(testEnv.EMAIL.sent[0].text).toContain(keep);
        expect(testEnv.EMAIL.sent[0].text).not.toContain(drop);
      }
    });

    it('refunds nothing, and alerts a person, when Stripe\'s purchase time differs from the one the page showed', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv, { purchasedAt: NOW_S - DAY });
      const statement = await pageStatement(testEnv, session, NOW_S - DAY);
      const stripe = fakeStripe({ purchasedAt: NOW_S - 2 * DAY });
      const response = await post('/billing/withdraw/private-network', testEnv, form({ statement }), session.cookie);
      expect(response.headers.get('Location')).toBe('/billing/withdraw/private-network?withdrawal=error');
      expect(stripe.refundAttempts).toBe(0);
      expect(stripe.cancels).toHaveLength(0);
      expect(testEnv.EMAIL.sent.map((m) => m.to)).toEqual(['subscriber@example.com', 'support@solstone.app']);
    });

    it('sends Stripe nothing with a refund but the charge and its reason code', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv, { purchasedAt: NOW_S - DAY });
      fakeStripe({ purchasedAt: NOW_S - DAY });
      const statement = await pageStatement(testEnv, session);
      const spy = vi.mocked(globalThis.fetch);
      await post('/billing/withdraw/private-network', testEnv, form({ statement }), session.cookie);
      const refund = spy.mock.calls.find(([url, init]) => String(url).endsWith('/v1/refunds') && init?.method === 'POST');
      expect([...new URLSearchParams(refund[1].body).keys()].sort()).toEqual(['charge', 'reason']);
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

// The statement the withdraw page signs for what it showed, read the way the owner's browser gets it.
async function pageStatement(testEnv, session, purchasedAt = null, slug = 'private-network') {
  if (purchasedAt != null) {
    installStripeFetchMock({ 'GET api.stripe.com/v1/subscriptions/sub_w1': async () => stripeJson(subscription({ purchasedAt, tag: SERVICES.find((s) => s.slug === slug).tag })) });
  }
  const html = await (await get(`/billing/withdraw/${slug}`, testEnv, session.cookie)).text();
  const match = html.match(/name="statement" value="([^"]+)"/);
  if (!match) throw new Error('no statement on the page');
  return match[1];
}

async function confirm(testEnv, session, slug = 'private-network') {
  const statement = await pageStatement(testEnv, session, null, slug);
  return post(`/billing/withdraw/${slug}`, testEnv, form({ statement }), session.cookie);
}

// A Stripe that keeps the state a withdrawal changes: whether the charge is refunded and the
// subscription ended, and the order the calls came in.
function fakeStripe({ purchasedAt, refundFails = 0, cancelFails = 0, tag = 'spl' }) {
  const state = { purchasedAt, refunded: false, canceled: false };
  const out = { refunds: [], cancels: [], order: [], refundAttempts: 0 };
  installStripeFetchMock({
    'GET api.stripe.com/v1/subscriptions/sub_w1': async () => stripeJson(subscription({ tag, purchasedAt: state.purchasedAt, status: state.canceled ? 'canceled' : 'active' })),
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

async function post(path, testEnv, body, cookie = '', origin = 'https://services.solstone.app') {
  const headers = { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' };
  if (cookie) headers.Cookie = cookie;
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(`https://services.solstone.app${path}`, { method: 'POST', headers, body }), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return response;
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
  expect(response.status).toBe(200);
  return response;
}

async function runScheduled(testEnv) {
  const ctx = createExecutionContext();
  await worker.scheduled({ cron: '*/15 * * * *' }, testEnv, ctx);
  await waitOnExecutionContext(ctx);
}

async function count(table) {
  const row = await workerEnv.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first();
  return row.n;
}

function stripeJson(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
