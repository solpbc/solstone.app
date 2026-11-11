import { createExecutionContext, env as workerEnv, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  renderServicesSme,
  renderServicesSpb,
  renderServicesSpl,
  renderServicesSpp,
} from '../src/html.js';
import { claimRenewalNotice, upsertStripeCustomer } from '../src/db.js';
import { maybeSendSubscriptionAck, renderLegalNotice, runRenewalCatchUp } from '../src/renewal-notices.js';
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
const RULES_ON = { SUBSCRIPTION_RULES: 'on' };

describe('subscription rules: reminders, notices and key information', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('with the switch off', () => {
    // SHA-256 of each surface as rendered by the code before the switch existed. A switch-off
    // render that differs by one byte fails here.
    const BEFORE = {
      'spl:false': 'c2d26bd7c374673b83c09f3caff0b5b8ba854ca0d5b15f58f11ce3f934e42d20',
      'spb:false': 'f3798dbc45f37f53982e738a060ec52cc6ed37f73bfff22820cc40369a129c52',
      'spb-restore:false': '719b8c671067ef1acd47ecebf3919fd8a279205654de35de90c9ee06b4164116',
      'sme:false': '55c873a66dd1be3aa4131a0d2deed92e505f8ed5bb255631c3d1547c90afe922',
      'spp:false': '9e2f8c0b38fd583de48acac54c626c8f302f6168cd56ae98d7ba9558d6ea31fd',
      'spl:true': '292008f69418c3d681ec9c514bddcda801a4a0d92ae24f19ce8ab087c0109df5',
      'spb:true': 'a0377043ff00307494026508e94a6d994e3af9f5b7ae3a85e0199e7e82815e00',
      'spb-restore:true': 'c341a22c52d9bdede42d08a34047d5703964eb60a7b80528a46a7718f81f86f3',
      'sme:true': 'a4a8e75958753a331fc72b20bba5e67bc2d481d73a68b6f2f5eaa4897796b4da',
      'spp:true': '7b06e611332111ce69f17f3c97742cb66d60a9bb660ddcb826ed6185602d05da',
      notice0: '9bc36dca0bb32eadaa19eee5023dee97b9a6dc01df3c5e25c5d661ed2da968d9',
      notice1: '8e7f1aff8a15cdd699b6b0b2da374797e9d74f24949033a44f88f038dcdc3ee1',
      notice2: '3e8d9bb88b7c794cece976ed07a40b647de8097abf444473819df3acc267cdc1',
      notice3: '2bf0889ba265c9b5a8c01256920b5fea8f86f4ba99c9ed696354536c0b604ecb',
    };

    it('renders every checkout page and notice byte-identical to before', async () => {
      const got = {};
      for (const box of [false, true]) {
        const base = { entitlement: null, csrf: 'csrf-fixed', menu: {}, flash: {}, startNowBox: box, keyInfo: false };
        got[`spl:${box}`] = await sha256(renderServicesSpl(base));
        got[`spb:${box}`] = await sha256(renderServicesSpb(base));
        got[`spb-restore:${box}`] = await sha256(renderServicesSpb({ ...base, restoreIntent: true }));
        got[`sme:${box}`] = await sha256(renderServicesSme(base));
        got[`spp:${box}`] = await sha256(renderServicesSpp({ ...base, onSale: true, planTerms: 'terms' }));
      }
      const notices = [
        { kind: 'ack', service: 'spl_hosted', interval: 'year', unitAmount: 2000 },
        { kind: 'ack', service: 'spb_hosted', interval: 'month', unitAmount: 499, withdrawal: { purchasedAt: 1790000000 } },
        { kind: 'catch_up', service: 'sme_hosted', interval: 'year', unitAmount: 500 },
        { kind: 'reminder', service: 'spp_hosted', interval: 'month', unitAmount: 999, renewalSeconds: 1800000000 },
      ];
      for (const [i, n] of notices.entries()) {
        const r = renderLegalNotice(n);
        got[`notice${i}`] = await sha256(`${r.subject}\n${r.text}\n${r.html}`);
      }
      expect(got).toEqual(BEFORE);
    });

    it('shows no key information on a service page and sends no cooling-off notice', async () => {
      const testEnv = makeTestEnv({ WITHDRAWAL_DOOR: 'on' });
      const buyer = await seedAccount({ email: 'off-buyer@example.com', testEnv });
      const session = await seedSession(buyer.accountId, { testEnv });
      expect(await (await get('/private-network', testEnv, session.cookie)).text()).not.toContain('data-key-info');

      const start = Date.UTC(2026, 0, 15) / 1000;
      const renewedAt = Date.UTC(2027, 0, 15) / 1000;
      await subscriber(testEnv, { sub: { start, periodStart: renewedAt, periodEnd: Date.UTC(2028, 0, 15) / 1000 } });
      await runAt(testEnv, renewedAt + 3600);
      expect(testEnv.EMAIL.sent).toHaveLength(0);
    });
  });

  describe('Checkout', () => {
    it('carries the approved disclosure pair within Stripe\'s limit and takes no promotion code with the rules on', async () => {
      const testEnv = makeTestEnv({ ...RULES_ON, WITHDRAWAL_DOOR: 'on' });
      const buyer = await seedAccount({ email: 'checkout-rules@example.com', testEnv });
      const session = await seedSession(buyer.accountId, { testEnv });
      const { calls } = installStripeFetchMock({
        'POST api.stripe.com/v1/checkout/sessions': () => stripeJson({ id: 'cs_rules', url: 'https://checkout.stripe.test/s' }),
      });
      const response = await post('/billing/checkout', testEnv, { plan: 'annual', start_now: 'yes' }, session.cookie);
      expect(response.headers.get('Location')).toBe('https://checkout.stripe.test/s');
      const text = calls[0].body.get('custom_text[submit][message]');
      expect(text).toBe(`${CHECKOUT_RULES} ${CHECKOUT_RULES_WITHDRAWAL}`);
      expect(text).toBe(checkoutDisclosure({ withdrawal: true, rules: true }));
      expect(text.length).toBe(1185);
      expect(text.length).toBeLessThanOrEqual(CHECKOUT_SUBMIT_TEXT_LIMIT);
      expect(calls[0].body.get('allow_promotion_codes')).toBe('false');
    });

    it('keeps today\'s disclosure and promotion codes with the rules off', async () => {
      const testEnv = makeTestEnv({ WITHDRAWAL_DOOR: 'on' });
      const buyer = await seedAccount({ email: 'checkout-off@example.com', testEnv });
      const session = await seedSession(buyer.accountId, { testEnv });
      const { calls } = installStripeFetchMock({
        'POST api.stripe.com/v1/checkout/sessions': () => stripeJson({ id: 'cs_off', url: 'https://checkout.stripe.test/s' }),
      });
      await post('/billing/checkout', testEnv, { plan: 'annual', start_now: 'yes' }, session.cookie);
      expect(calls[0].body.get('custom_text[submit][message]')).toBe(checkoutDisclosure({ withdrawal: true }));
      expect(calls[0].body.get('custom_text[submit][message]')).not.toContain('cancel contracts here');
      expect(calls[0].body.get('allow_promotion_codes')).toBe('true');
    });
  });

  describe('the annual renewal reminders', () => {
    const renewal = Date.UTC(2027, 0, 15, 12) / 1000;
    const start = Date.UTC(2026, 0, 15, 12) / 1000;

    it.each([
      [71, 0],
      [70, 1],
      [60, 1],
      [59, 0],
      [41, 0],
      [40, 1],
      [35, 1],
      [34, 0],
    ])('%i days before the renewal sends %i', async (days, expected) => {
      const testEnv = makeTestEnv(RULES_ON);
      await subscriber(testEnv, { sub: { start, periodStart: start, periodEnd: renewal } });
      await runAt(testEnv, renewal - days * DAY);
      expect(testEnv.EMAIL.sent).toHaveLength(expected);
    });

    it('sends the early one and the main one once each, the early one saying another is coming', async () => {
      const testEnv = makeTestEnv(RULES_ON);
      await subscriber(testEnv, { sub: { start, periodStart: start, periodEnd: renewal } });
      for (const days of [70, 65, 60, 40, 37, 35]) await runAt(testEnv, renewal - days * DAY);
      expect(testEnv.EMAIL.sent).toHaveLength(2);
      const [early, main] = testEnv.EMAIL.sent;
      for (const email of [early, main]) {
        expect(email.to).toBe('rules@example.com');
        expect(email.subject).toBe('your private network subscription renews on 2027-01-15');
        expect(email.text).not.toContain('sol pbc runs your');
      }
      expect(early.text).toContain("we'll remind you again closer to the date. if you want to keep it, there's nothing to do.");
      expect(main.text).toContain("\n\nif you want to keep it, there's nothing to do.");
      expect(main.text).not.toContain('remind you again');
      const kinds = await workerEnv.DB.prepare('SELECT kind, renewal_at FROM renewal_notices ORDER BY kind').all();
      expect(kinds.results).toEqual([{ kind: 'early_reminder', renewal_at: renewal }, { kind: 'reminder', renewal_at: renewal }]);
    });

    it('opens with the heading, then the cancel-by date two days before the renewal in a box', async () => {
      const testEnv = makeTestEnv(RULES_ON);
      await subscriber(testEnv, { sub: { start, periodStart: start, periodEnd: renewal } });
      await runAt(testEnv, renewal - 37 * DAY);
      const [email] = testEnv.EMAIL.sent;
      expect(email.text.startsWith('private network renews on 2027-01-15\n\n----------------------------------------\nto stop it renewing, cancel by 2027-01-13.\n----------------------------------------\n\n')).toBe(true);
      expect(email.html).toContain('<p><strong>private network renews on 2027-01-15</strong></p>\n  <p style="border: 2px solid #222; border-radius: 6px; padding: 12px 16px;"><strong>to stop it renewing, cancel by 2027-01-13.</strong></p>');
      expect(email.text).toContain("this is a reminder: your private network subscription renews on 2027-01-15, and you'll be charged $20 for another year, using the payment method on file, unless you cancel before then. you paid $20 last time. the renewal after it is on 2028-01-15.");
      expect(email.text).toContain("if it renews, you can still withdraw for a full refund until the end of the 14th day after it does. after that, the least you'll pay is one month of it, $1.67: a cancel ends it at the end of your current plan month, and we refund the whole months left.");
      expect(email.text).toContain('to cancel by 2027-01-13, sign in at https://services.solstone.app and use cancel contracts here on your private network page there or at https://services.solstone.app/billing, or email support@solstone.app saying you cancel.');
    });

    it('names a higher price and the difference, and leaves out the last payment when there was none', async () => {
      const higher = makeTestEnv(RULES_ON);
      await subscriber(higher, { sub: { start, periodStart: start, periodEnd: renewal, amount: 2400 }, lastPaid: 2000 });
      await runAt(higher, renewal - 37 * DAY);
      expect(higher.EMAIL.sent[0].text).toContain("you'll be charged $24 for another year, using the payment method on file, unless you cancel before then. you paid $20 last time. this renewal is $4 more. the renewal after it is on 2028-01-15.");

      await resetDb();
      const none = makeTestEnv(RULES_ON);
      await subscriber(none, { sub: { start, periodStart: start, periodEnd: renewal }, lastPaid: null });
      await runAt(none, renewal - 37 * DAY);
      expect(none.EMAIL.sent[0].text).toContain('unless you cancel before then. the renewal after it is on 2028-01-15.');
      expect(none.EMAIL.sent[0].text).not.toContain('last time');
      expect(none.EMAIL.sent[0].text).not.toContain('more.');
    });

    it('goes to no subscription set to end', async () => {
      const testEnv = makeTestEnv(RULES_ON);
      await subscriber(testEnv, { sub: { start, periodStart: start, periodEnd: renewal, cancelAtPeriodEnd: true } });
      await runAt(testEnv, renewal - 65 * DAY);
      await runAt(testEnv, renewal - 37 * DAY);
      expect(testEnv.EMAIL.sent).toHaveLength(0);
    });
  });

  describe('the monthly reminder', () => {
    it.each([
      ['the 15th', Date.UTC(2026, 0, 15, 9) / 1000],
      ['the 31st', Date.UTC(2026, 7, 31, 9) / 1000],
    ])('goes once every six months across a year and a half, 25 to 28 days before, starting on %s', async (_label, start) => {
      const testEnv = makeTestEnv(RULES_ON);
      const sub = { start, periodStart: start, periodEnd: stripeMonthly(start, 1), interval: 'month', amount: 249 };
      const { accountId } = await subscriber(testEnv, { sub, lastPaid: 249 });
      const sentAt = [];
      for (let n = 1; n <= 18; n++) {
        sub.periodStart = stripeMonthly(start, n - 1);
        sub.periodEnd = stripeMonthly(start, n);
        await workerEnv.DB.prepare('UPDATE entitlements SET current_period_end = ? WHERE account_id = ?')
          .bind(sub.periodEnd, accountId)
          .run();
        const before = testEnv.EMAIL.sent.length;
        for (const days of [29, 28, 26, 25, 24]) await runAt(testEnv, sub.periodEnd - days * DAY);
        if (testEnv.EMAIL.sent.length > before) sentAt.push(n);
      }
      expect(sentAt).toEqual([6, 12, 18]);
      expect(testEnv.EMAIL.sent).toHaveLength(3);
      const [first] = testEnv.EMAIL.sent;
      const renewalDate = new Date(stripeMonthly(start, 6) * 1000).toISOString().slice(0, 10);
      const nextDate = new Date(stripeMonthly(start, 7) * 1000).toISOString().slice(0, 10);
      expect(first.subject).toBe(`your private network subscription renews on ${renewalDate}`);
      expect(first.text).toContain(`for another month, using the payment method on file, unless you cancel before then. you paid $2.49 last time. the renewal after it is on ${nextDate}.`);
      expect(first.text).toContain("\n\nif it renews, the least you'll pay is that $2.49.\n\n");
      expect(first.text).not.toContain('remind you again');
    });

    it.each([[29, 0], [28, 1], [25, 1], [24, 0]])('%i days before the six-month renewal sends %i', async (days, expected) => {
      const start = Date.UTC(2026, 0, 15, 9) / 1000;
      const testEnv = makeTestEnv(RULES_ON);
      const sub = { start, periodStart: stripeMonthly(start, 5), periodEnd: stripeMonthly(start, 6), interval: 'month', amount: 249 };
      await subscriber(testEnv, { sub, lastPaid: 249 });
      await runAt(testEnv, sub.periodEnd - days * DAY);
      expect(testEnv.EMAIL.sent).toHaveLength(expected);
    });
  });

  describe('the renewal cooling-off notice', () => {
    const start = Date.UTC(2026, 0, 15, 12) / 1000;
    const renewed1 = Date.UTC(2027, 0, 15, 12) / 1000;
    const renewed2 = Date.UTC(2028, 0, 15, 12) / 1000;
    const renewalInvoice = (paidAt, amountPaid = 4800) => ({
      id: 'in_renewal', object: 'invoice', customer: 'cus_rules', billing_reason: 'subscription_cycle',
      created: renewed1, amount_paid: amountPaid, status: 'paid', status_transitions: { paid_at: paidAt },
      parent: { subscription_details: { subscription: 'sub_rules', metadata: { service: 'spb' } } },
    });

    it('goes once when the annual renewal is paid, dated by the payment, and neither a replay nor the cron sends it again', async () => {
      const testEnv = makeTestEnv(RULES_ON);
      const sub = { start, periodStart: renewed1, periodEnd: renewed2, tag: 'spb', amount: 4800 };
      const invoice = renewalInvoice(renewed1 + 3600);
      const { accountId } = await subscriber(testEnv, { sub, invoices: [invoice] });
      await customerWithConfirmation(accountId, 'spb_hosted');

      await webhookAt(testEnv, renewed1 + 3700, 'invoice.paid', invoice);
      await webhookAt(testEnv, renewed1 + 3800, 'invoice.paid', invoice);
      await runAt(testEnv, renewed1 + 5 * 3600);
      expect(testEnv.EMAIL.sent).toHaveLength(1);
      const [email] = testEnv.EMAIL.sent;
      expect(email.subject).toBe('your encrypted backup subscription renewed: you can cancel it for a full refund for 14 days');
      expect(email.text.startsWith('you can cancel this renewal for a full refund until the end of the 14th day after January 15, 2027\n\n')).toBe(true);
      expect(email.text).toContain('your encrypted backup subscription has renewed for another year, and you paid $48 on January 15, 2027, and it continues.');
      expect(email.text).toContain('we refund everything you paid for this renewal, $48, the same way you paid, within 14 days.');
      expect(email.html).toContain('<strong>if you use <em>cancel contracts here</em> instead,</strong>');
      const rows = await workerEnv.DB.prepare("SELECT renewal_at FROM renewal_notices WHERE kind = 'cooling_off'").all();
      expect(rows.results).toEqual([{ renewal_at: renewed1 }]);
    });

    it('on a retried payment, goes when it succeeds, dated that day, with the amount paid', async () => {
      const testEnv = makeTestEnv(RULES_ON);
      const sub = { start, periodStart: renewed1, periodEnd: renewed2, tag: 'spb', amount: 4800 };
      const paidAt = renewed1 + 6 * DAY;
      const invoice = renewalInvoice(paidAt, 4320);
      const { accountId } = await subscriber(testEnv, { sub, invoices: [invoice] });
      await customerWithConfirmation(accountId, 'spb_hosted');
      await webhookAt(testEnv, paidAt + 60, 'invoice.paid', invoice);
      expect(testEnv.EMAIL.sent).toHaveLength(1);
      expect(testEnv.EMAIL.sent[0].text).toContain('you paid $43.20 on January 21, 2027, and it continues.');
      expect(testEnv.EMAIL.sent[0].text).toContain('until the end of the 14th day after January 21, 2027');
    });

    it('is never sent for a first invoice or a monthly renewal', async () => {
      const first = makeTestEnv(RULES_ON);
      const { accountId } = await subscriber(first, { sub: { start, periodStart: start, periodEnd: renewed1, tag: 'spb', amount: 4800 } });
      await customerWithConfirmation(accountId, 'spb_hosted');
      await webhookAt(first, start + 60, 'invoice.paid', { ...renewalInvoice(start + 30), billing_reason: 'subscription_create', created: start });
      expect(first.EMAIL.sent).toHaveLength(0);

      await resetDb();
      const monthly = makeTestEnv(RULES_ON);
      const periodStart = stripeMonthly(start, 12);
      const invoice = { ...renewalInvoice(periodStart + 60, 499), created: periodStart };
      const m = await subscriber(monthly, { sub: { start, periodStart, periodEnd: stripeMonthly(start, 13), interval: 'month', tag: 'spb', amount: 499 }, invoices: [invoice] });
      await customerWithConfirmation(m.accountId, 'spb_hosted');
      await webhookAt(monthly, periodStart + 120, 'invoice.paid', invoice);
      await runAt(monthly, periodStart + 3600);
      expect(monthly.EMAIL.sent).toHaveLength(0);
    });

    it('is sent by the cron if the webhook was missed and the renewal was paid within the last day, once', async () => {
      const testEnv = makeTestEnv(RULES_ON);
      const paidAt = renewed1 + 3 * DAY;
      const sub = { start, periodStart: renewed1, periodEnd: renewed2 };
      // Unpaid while it was retried: nothing to say yet.
      await subscriber(testEnv, { sub, invoices: [] });
      await runAt(testEnv, renewed1 + 3600);
      expect(testEnv.EMAIL.sent).toHaveLength(0);

      await subscriber(testEnv, { sub, invoices: [{ ...renewalInvoice(paidAt, 2000), id: 'in_spl' }] }, { reseed: false });
      await runAt(testEnv, paidAt + 3600);
      await runAt(testEnv, paidAt + 7200);
      expect(testEnv.EMAIL.sent).toHaveLength(1);
      expect(testEnv.EMAIL.sent[0].subject).toBe('your private network subscription renewed: you can cancel it for a full refund for 14 days');
      expect(testEnv.EMAIL.sent[0].text).toContain('you paid $20 on January 18, 2027');
    });

    it('is not sent by the cron for a payment more than a day old, or in the first year', async () => {
      const late = makeTestEnv(RULES_ON);
      await subscriber(late, { sub: { start, periodStart: renewed1, periodEnd: renewed2 }, invoices: [renewalInvoice(renewed1 + 60, 2000)] });
      await runAt(late, renewed1 + 2 * DAY);
      expect(late.EMAIL.sent).toHaveLength(0);

      await resetDb();
      const firstYear = makeTestEnv(RULES_ON);
      await subscriber(firstYear, { sub: { start, periodStart: start, periodEnd: renewed1 }, invoices: [{ ...renewalInvoice(start + 60, 2000), billing_reason: 'subscription_create', created: start }] });
      await runAt(firstYear, start + 3600);
      expect(firstYear.EMAIL.sent).toHaveLength(0);
    });
  });

  describe('the key facts before checkout', () => {
    it('show each plan apart, then how to end it and the terms link once, on a page offering two', async () => {
      const on = makeTestEnv({ ...RULES_ON, WITHDRAWAL_DOOR: 'on' });
      const buyer = await seedAccount({ email: 'key-info@example.com', testEnv: on });
      const session = await seedSession(buyer.accountId, { testEnv: on });
      const page = await (await get('/private-network', on, session.cookie)).text();
      const block = keyFactsBlock(page);
      expect(block).toContain('<h2>before you subscribe: the key facts</h2>');
      const annual = planPart(block, 'annual');
      const monthly = planPart(block, 'monthly');
      expect(annual).toContain('<li><strong>it continues until you end it.</strong> private network is a subscription, and you keep paying until you cancel. the first year runs to its end. once it has renewed, a cancel takes effect at the end of your current plan month, and we refund the whole months left.</li>');
      expect(annual).toContain("<li><strong>what you pay.</strong> $20 every year, tax included. that's $1.67 a month. the price can change only from a renewal, and we tell you before it does.</li>");
      expect(annual).toContain('<li><strong>renewal reminders.</strong> 60 to 70 days, and again 35 to 40 days, before each renewal.</li>');
      expect(annual).toContain('counts too. you can do it again after each renewal.</li>');
      expect(monthly).toContain("<li><strong>it continues until you end it.</strong> private network is a subscription, and you keep paying until you cancel. you don't need to give notice: it ends at the end of the month you've paid for.</li>");
      expect(monthly).toContain("<li><strong>the least you'll pay</strong> is $2.49, for the first month, unless you withdraw within 14 days.</li>");
      expect(monthly).toContain('<li><strong>renewal reminders.</strong> 25 to 28 days before the renewal at each six-month mark.</li>');
      expect(monthly).not.toContain('a month.');
      for (const part of [annual, monthly]) {
        expect(part).not.toContain('how to end it');
        expect(part).not.toContain('services.solstone.app/terms');
      }
      expect(count(block, 'how to end it')).toBe(1);
      expect(count(block, 'href="https://services.solstone.app/terms"')).toBe(1);
      expect(block).toContain('<li><strong>how to end it.</strong> sign in at services.solstone.app and use <em>cancel contracts here</em>, on this page or at services.solstone.app/billing, or email support@solstone.app saying you cancel.</li>');
      expect(block).toContain('<li>the details are in the terms, with everything else: <a href="https://services.solstone.app/terms">services.solstone.app/terms</a>.</li>');
      // Beside the start-now box, before the buttons that go to Checkout.
      expect(page.indexOf('data-key-info')).toBeLessThan(page.indexOf('name="start_now"'));
      expect(page.indexOf('data-key-info')).toBeLessThan(page.indexOf('pay yearly'));
      expect(page).not.toContain('[placeholder]');

      const off = makeTestEnv({ WITHDRAWAL_DOOR: 'on' });
      expect(await (await get('/private-network', off, session.cookie)).text()).not.toContain('data-key-info');
    });

    it('show all six facts in order on a page offering one plan', async () => {
      const on = makeTestEnv({ ...RULES_ON, WITHDRAWAL_DOOR: 'on' });
      const buyer = await seedAccount({ email: 'key-info-sme@example.com', testEnv: on });
      const session = await seedSession(buyer.accountId, { testEnv: on });
      const page = await (await get('/services/solstone-me', on, session.cookie)).text();
      const block = keyFactsBlock(page);
      const items = [...block.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
      expect(items).toEqual([
        '<strong>it continues until you end it.</strong> solstone.me is a subscription, and you keep paying until you cancel. the first year runs to its end. once it has renewed, a cancel takes effect at the end of your current plan month, and we refund the whole months left.',
        "<strong>what you pay.</strong> $5 every year, tax included. that's $0.42 a month. the price can change only from a renewal, and we tell you before it does.",
        "<strong>the least you'll pay</strong> is $5, for the first year, unless you withdraw within 14 days.",
        '<strong>how to end it.</strong> sign in at services.solstone.app and use <em>cancel contracts here</em>, on this page or at services.solstone.app/billing, or email support@solstone.app saying you cancel.',
        '<strong>renewal reminders.</strong> 60 to 70 days, and again 35 to 40 days, before each renewal.',
        '<strong>you can change your mind.</strong> you can withdraw for a full refund until the end of the 14th day after you buy; an email saying you cancel in that time counts too. you can do it again after each renewal. the details are in the terms, with everything else: <a href="https://services.solstone.app/terms">services.solstone.app/terms</a>.',
      ]);
      expect(page.indexOf('data-key-info')).toBeLessThan(page.indexOf('name="start_now"'));
    });

    it('render on the backup and confidential processing pages, with or without the start-now box', async () => {
      const on = makeTestEnv({ ...RULES_ON, WITHDRAWAL_DOOR: 'on' });
      const buyer = await seedAccount({ email: 'key-info-spb@example.com', testEnv: on });
      const session = await seedSession(buyer.accountId, { testEnv: on });
      const backup = keyFactsBlock(await (await get('/services/backup', on, session.cookie)).text());
      expect(planPart(backup, 'annual')).toContain('encrypted backup is a subscription');
      expect(planPart(backup, 'annual')).toContain("$48 every year, tax included. that's $4 a month.");
      expect(planPart(backup, 'monthly')).toContain('$4.99 every month, tax included.');
      for (const startNowBox of [true, false]) {
        const page = keyFactsBlock(renderServicesSpp({ entitlement: null, menu: {}, onSale: true, csrf: 'c', startNowBox, keyInfo: true }));
        expect(planPart(page, 'annual')).toContain("$96 every year, tax included. that's $8 a month.");
        expect(planPart(page, 'monthly')).toContain('confidential processing is a subscription');
      }
      expect(renderServicesSpp({ entitlement: null, menu: {}, onSale: true, csrf: 'c', startNowBox: true })).not.toContain('data-key-info');
    });
  });

  describe('the written confirmation under the rules', () => {
    it('on an annual plan carries the key facts, the reminders, canceling, the renewed withdrawal and who we are', () => {
      const { subject, text, html } = renderLegalNotice({
        kind: 'ack', service: 'spl_hosted', interval: 'year', unitAmount: 2000, withdrawal: { purchasedAt: 1790000000 }, rules: true,
      });
      expect(subject).toBe('your private network subscription: keep this for your records');
      const paragraphs = text.split('\n\n');
      expect(paragraphs[1]).toBe('the plan. private network, $20 every year.');
      expect(paragraphs[2]).toBe('the key facts');
      expect(paragraphs[3].split('\n')).toEqual([
        '- it continues until you end it. private network is a subscription, and you keep paying until you cancel. the first year runs to its end. once it has renewed, a cancel takes effect at the end of your current plan month, and we refund the whole months left.',
        "- what you pay. $20 every year, tax included. that's $1.67 a month. the price can change only from a renewal, and we tell you before it does.",
        "- the least you'll pay is $20, for the first year, unless you withdraw within 14 days.",
        '- how to end it. sign in at services.solstone.app and use cancel contracts here, on your private network page there or at services.solstone.app/billing, or email support@solstone.app saying you cancel.',
        '- renewal reminders. 60 to 70 days, and again 35 to 40 days, before each renewal.',
        '- you can change your mind. you can withdraw for a full refund until the end of the 14th day after you buy; an email saying you cancel in that time counts too. you can do it again after each renewal. the details are in the terms, with everything else: https://services.solstone.app/terms.',
      ]);
      expect(paragraphs[4]).toBe("it renews on its own. at the end of each year, private network renews automatically at the plan's then-current price, using the payment method on file, until you cancel. we'll email you twice before each renewal, 60 to 70 days and 35 to 40 days before it, with the date to cancel by and how to cancel.");
      expect(paragraphs[5]).toBe("canceling takes as few steps as subscribing did. sign in at https://services.solstone.app and use cancel contracts here on your private network page there or at https://services.solstone.app/billing, or email support@solstone.app saying you cancel. within your 14 days to withdraw (below), an email saying you cancel counts as a withdrawal, unless you tell us to keep private network running. no phone call, no retention maze. if you cancel in this first year, private network keeps working through the end of the year you've paid for, then stops. once it has renewed, a cancel ends it at the end of your current plan month, and we refund the whole months left.");
      expect(paragraphs[6].endsWith('the same way you paid. each renewal gives you 14 more days to withdraw, counted from the day you pay for it, for a refund of that renewal.')).toBe(true);
      expect(text).toContain('withdrawal form (fill this in and send it only if you want to withdraw):');
      expect(paragraphs.slice(-4)).toEqual([
        "who we are. sol pbc, 16095 East 109th Place, Commerce City, CO 80022, United States · support@solstone.app · +1 563 663 5487. questions and complaints go to either, and an answer to a complaint says what we'll do about it.",
        "your rights. if private network isn't as described or doesn't work, the law where you live may give you rights about it, and nothing here limits them. private network works with the solstone software on your own devices; section 11 of the terms says what it does and anything it needs.",
        'questions: support@solstone.app.',
        'sol pbc',
      ]);
      expect(html).toContain('<p><strong>the key facts</strong></p>\n  <ul><li><strong>it continues until you end it.</strong>');
      expect(text).not.toMatch(/\[\/?[A-Z]+\]|\{\{|placeholder/);
    });

    it('on a monthly plan says so in each branch, and names the service\'s section of the terms', () => {
      const sections = { spb_hosted: '12', spp_hosted: '13' };
      for (const [service, section] of Object.entries(sections)) {
        const { text } = renderLegalNotice({
          kind: 'ack', service, interval: 'month', unitAmount: 499, withdrawal: { purchasedAt: 1790000000 }, rules: true,
        });
        expect(text).toContain('- renewal reminders. 25 to 28 days before the renewal at each six-month mark.');
        expect(text).toContain("we'll email you 25 to 28 days before the renewal at each six-month mark, to say it's coming and how to cancel.");
        expect(text).toContain("no phone call, no retention maze. if you cancel, ");
        expect(text).toContain(" keeps working through the end of the month you've paid for, then stops.\n\n");
        expect(text).toContain("the same way you paid. you get this once, counted from this purchase; a monthly renewal doesn't start a new one.");
        expect(text).toContain(`section ${section} of the terms`);
        expect(text).not.toContain('once it has renewed');
        expect(text).not.toMatch(/\[\/?[A-Z]+\]|\{\{/);
      }
      expect(renderLegalNotice({ kind: 'ack', service: 'sme_hosted', interval: 'year', unitAmount: 500, rules: true }).text).toContain('section 14 of the terms');
    });

    it('is what checkout sends with the rules on', async () => {
      const testEnv = makeTestEnv({ ...RULES_ON, WITHDRAWAL_DOOR: 'on' });
      const start = Date.UTC(2026, 10, 1) / 1000;
      const { accountId } = await subscriber(testEnv, { sub: { start, periodStart: start, periodEnd: Date.UTC(2027, 10, 1) / 1000 } });
      await upsertStripeCustomer(workerEnv.DB, { accountId, stripeCustomerId: 'cus_rules', nowMs: Date.now() });
      await maybeSendSubscriptionAck(testEnv, { accountId, tag: 'spl', status: 'active', sourceRef: 'sub_rules' });
      expect(testEnv.EMAIL.sent).toHaveLength(1);
      expect(testEnv.EMAIL.sent[0].text).toContain('\n\nthe key facts\n\n- it continues until you end it.');
      expect(testEnv.EMAIL.sent[0].text).toContain('who we are. sol pbc');
    });
  });

  describe('the catch-up confirmation', () => {
    it('sends nothing with the rules on', async () => {
      const testEnv = makeTestEnv(RULES_ON);
      const start = Date.UTC(2026, 0, 15) / 1000;
      await subscriber(testEnv, { sub: { start, periodStart: start, periodEnd: Date.UTC(2027, 0, 15) / 1000 } });
      await expect(runRenewalCatchUp(testEnv)).resolves.toEqual({ sent: 0, skipped: 0 });
      expect(testEnv.EMAIL.sent).toHaveLength(0);
    });
  });
});

const CHECKOUT_RULES = 'by purchasing this service, you agree to enroll in an automatic renewal contract: it renews automatically at the end of each billing period, until you cancel. cancel anytime: sign in at services.solstone.app and use "cancel contracts here" on the service\'s page or at services.solstone.app/billing, or email support@solstone.app saying you cancel. when you cancel, the service keeps working through the end of the period you have already paid for, then stops. on an annual plan that has renewed, it stops at the end of your current plan month instead, and we refund the whole months left.';
const CHECKOUT_RULES_WITHDRAWAL = 'you can also withdraw for a full refund, wherever you live, until the end of the 14th day after the day you buy, and again after each annual renewal: sign in at services.solstone.app and use "withdraw from contract here" on the service\'s page or at services.solstone.app/billing, then confirm; or email support@solstone.app saying you withdraw or cancel. a withdrawal sent within the 14 days counts. withdrawing stops the service that day and we refund everything you paid for that purchase or renewal. the withdrawal form and the details are in the terms: services.solstone.app/terms#withdrawal.';

// The Stripe customer of the subscriber, whose written confirmation has already gone out, so a
// paid invoice sends nothing but what the test is about.
async function customerWithConfirmation(accountId, service) {
  await upsertStripeCustomer(workerEnv.DB, { accountId, stripeCustomerId: 'cus_rules', nowMs: Date.now() });
  await claimRenewalNotice(workerEnv.DB, {
    accountId, kind: 'ack', service, renewalAt: 0, contentKey: 'sub_rules', subject: 's', body: 'b', nowMs: Date.now(),
  });
}

function keyFactsBlock(page) {
  const at = page.indexOf('<section class="card" data-key-info');
  expect(at).toBeGreaterThan(-1);
  return page.slice(at, page.indexOf('</section>', at));
}

function planPart(block, plan) {
  const start = block.indexOf(`data-key-info-plan="${plan}"`);
  expect(start).toBeGreaterThan(-1);
  return block.slice(start, block.indexOf('</div>', start));
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

// Stripe's monthly renewal n months after a start: the same day of the month, or the month's
// last day when it is shorter.
function stripeMonthly(start, n) {
  const d = new Date(start * 1000);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(d.getUTCDate(), last), d.getUTCHours()) / 1000;
}

// One annual (by default) private network subscriber whose Stripe reads come from `sub`, a live
// object the test can move from one period to the next. `lastPaid` is the one paid invoice the
// reminders read; `invoices`, when given, is the whole list instead.
async function subscriber(testEnv, { sub, lastPaid = 2000, invoices = null }, { reseed = true } = {}) {
  const tag = sub.tag ?? 'spl';
  let accountId = null;
  if (reseed) {
    const account = await seedAccount({ email: 'rules@example.com', testEnv });
    accountId = account.accountId;
    await seedEntitlement({ accountId, service: `${tag}_hosted`, sourceRef: 'sub_rules', currentPeriodEnd: sub.periodEnd });
  }
  const paid = invoices ?? (lastPaid == null ? [] : [{ id: 'in_rules', amount_paid: lastPaid, created: sub.periodStart }]);
  installStripeFetchMock({
    'GET api.stripe.com/v1/subscriptions/sub_rules': () => stripeJson({
      id: 'sub_rules',
      object: 'subscription',
      status: 'active',
      customer: 'cus_rules',
      start_date: sub.start,
      current_period_start: sub.periodStart,
      current_period_end: sub.periodEnd,
      cancel_at_period_end: Boolean(sub.cancelAtPeriodEnd),
      cancel_at: null,
      metadata: { service: tag },
      items: { data: [{ quantity: 1, price: { unit_amount: sub.amount ?? 2000, currency: 'usd', recurring: { interval: sub.interval ?? 'year' } } }] },
    }),
    'GET api.stripe.com/v1/invoices': () => stripeJson({ object: 'list', data: paid }),
  });
  return { accountId };
}

async function runAt(testEnv, seconds) {
  const spy = vi.spyOn(Date, 'now').mockReturnValue(seconds * 1000);
  try {
    const ctx = createExecutionContext();
    await worker.scheduled({ cron: '0 4 * * *' }, testEnv, ctx);
    await waitOnExecutionContext(ctx);
  } finally {
    spy.mockRestore();
  }
}

async function webhookAt(testEnv, seconds, type, object) {
  const spy = vi.spyOn(Date, 'now').mockReturnValue(seconds * 1000);
  try {
    const rawBody = JSON.stringify({ id: `evt_${Math.random()}`, type, data: { object } });
    const ctx = createExecutionContext();
    const response = await worker.fetch(new Request('https://services.solstone.app/stripe/webhook', {
      method: 'POST',
      headers: { 'Stripe-Signature': await signStripeWebhook(rawBody, testEnv.STRIPE_WEBHOOK_SECRET, seconds) },
      body: rawBody,
    }), testEnv, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
  } finally {
    spy.mockRestore();
  }
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

function stripeJson(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
