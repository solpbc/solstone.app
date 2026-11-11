import { createExecutionContext, env as workerEnv, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { formatPrice } from '../src/renewal-notices.js';
import { currentServiceMonth, monthsLeftRefund, serviceMonthStart } from '../src/renewed-year.js';
import { formatLongDate, formatMomentUtc } from '../src/withdrawal-rules.js';
import {
  TEST_CSRF,
  installStripeFetchMock,
  makeSupportWorker,
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
const SERVICE_NAMES = { spl_hosted: 'private network', spb_hosted: 'encrypted backup', sme_hosted: 'solstone.me', spp_hosted: 'confidential processing' };

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
      expect((await get(`${PATH}?service=private-network`, testEnv, session.cookie)).status).toBe(404);
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

    it('is one subscription\'s page, linked from no service page before a subscription exists: with no service, or one with nothing to cancel, it is the billing page', async () => {
      const testEnv = makeTestEnv({ ...ON, ...PAGE_ENV });
      const account = await seedAccount({ email: 'new@example.com', testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      for (const def of SERVICES) {
        expect(await (await get(def.page, testEnv, session.cookie)).text()).not.toContain(`href="${PATH}?service=${def.slug}"`);
      }
      expect(await (await get('/billing', testEnv, session.cookie)).text()).toContain(`href="${PATH}`);
      for (const path of [PATH, `${PATH}?service=private-network`, `${PATH}?service=nonsense`]) {
        const response = await get(path, testEnv, session.cookie);
        expect(response.status).toBe(303);
        expect(response.headers.get('Location')).toBe('/billing');
      }
      const review = await post(`${PATH}/review`, testEnv, { service: 'private-network' }, session.cookie);
      expect(review.headers.get('Location')).toBe('/billing');
    });
  });

  describe('the page and its summary', () => {
    it('in the first year, shows the subscription, an optional name, the two kinds of cancel and the period end, then one summary line', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv, { email: 'first@example.com' });
      const stripe = fakeStripe({ renewed: false });
      const end = formatLongDate(stripe.state().current_period_end - DAY);

      const form = await (await get(`${PATH}?service=private-network`, testEnv, session.cookie)).text();
      expect(form).toContain('<h1>cancel your private network subscription</h1>');
      expect(form).toContain('signed in as first@example.com');
      expect(form).toContain(`subscription: private network, $20 every year, bought on ${formatLongDate(NOW_S - 30 * DAY)}`);
      expect(form).toContain('your name (optional; it goes only into your confirmation email):');
      expect(form).not.toMatch(/name="name"[^>]*required/);
      expect(form).toContain('>cancel</label>');
      expect(form).toContain('cancel for a serious reason, such as something we did wrong');
      expect(form).toContain('tell us the reason:');
      expect(form).toContain(`it ends on ${end}, the earliest it can.`);
      expect(form).toContain(`it ends on ${end}, the earliest an ordinary cancel can.`);
      expect(form).toContain("private network keeps working until then, the end of the period you've paid for. it won't renew.");
      expect(form).not.toContain('value="period_end"');
      expect(form).toContain('value="today"');
      expect(form).not.toMatch(/name="email"/);

      // No name is needed.
      const review = await (await post(`${PATH}/review`, testEnv, { service: 'private-network', type: 'cancel', end: 'earliest' }, session.cookie)).text();
      expect(review).toContain(`you're canceling private network ($20 every year). it ends on ${end}. we'll send the confirmation to first@example.com.`);
      // Below the heading: the one cancel button, nothing else; above it, the plain way back.
      const body = review.slice(review.indexOf('<h1>'), review.lastIndexOf('</form>'));
      expect(body.match(/<form /g)).toHaveLength(1);
      expect(body.match(/<button[^>]*type="submit"/g)).toHaveLength(1);
      expect(body).not.toMatch(/<a [^>]*href/);
      expect(review.match(/>cancel now</g)).toHaveLength(1);
      expect(review).toContain(`action="${PATH}/confirm"`);
      expect(review).toMatch(/<button class="back cc-back" type="submit">[\s\S]*?back<\/button>/);
      // The way back brings what was entered.
      const back = await (await post(PATH, testEnv, { name: 'Ada Owner', service: 'private-network', type: 'cause', reason: 'you lost my data', end: 'today' }, session.cookie)).text();
      expect(back).toContain('value="Ada Owner"');
      expect(back).toContain('>you lost my data</textarea>');
      expect(back).toMatch(/id="cc-type-cause" name="type" value="cause" checked/);
      expect(back).toMatch(/name="end" value="today" checked/);
      expect(stripe.writes).toEqual([]);
    });

    it('in a renewed year, defaults to the plan month\'s end with its refund, and offers the year end', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv);
      fakeStripe({ renewed: true });
      const refund = formatPrice(monthsLeftRefund(2000, 11 - MONTH));
      const form = await (await get(`${PATH}?service=private-network`, testEnv, session.cookie)).text();
      expect(form).toContain(`it ends on ${formatLongDate(MONTH_END - DAY)}, the earliest it can.`);
      expect(form).toContain(`private network keeps working until then, and we refund ${11 - MONTH} whole months, ${refund}, the same way you paid, within 14 days.`);
      expect(form).toContain(`at the end of this plan year, ${formatLongDate(YEAR_END - DAY)}`);
      expect(form).toMatch(/name="end" value="earliest" checked/);
      expect(form).toContain(`we refund the whole months left, ${refund}, either way.`);

      const review = await (await post(`${PATH}/review`, testEnv, { service: 'private-network', end: 'period_end' }, session.cookie)).text();
      expect(review).toContain(`it ends on ${formatLongDate(YEAR_END - DAY)}. we'll send`);
      expect(review).not.toContain('we refund');
      const earliest = await (await post(`${PATH}/review`, testEnv, { service: 'private-network', end: 'earliest' }, session.cookie)).text();
      expect(earliest).toContain(`it ends on ${formatLongDate(MONTH_END - DAY)}. we refund ${refund}. we'll send`);
    });

    it('in a renewed year\'s last plan month, has no month to refund and no year-end option', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv);
      const renewal = NOW_S - 350 * DAY;
      expect(currentServiceMonth(renewal, NOW_S)).toBe(11);
      fakeStripe({ renewed: true, renewal });
      const form = await (await get(`${PATH}?service=private-network`, testEnv, session.cookie)).text();
      expect(form).not.toContain('value="period_end"');
      expect(form).not.toContain('whole month');
      expect(form).toContain(`it ends on ${formatLongDate(serviceMonthStart(renewal, 12) - DAY)}, the earliest it can.`);
    });

    it('a cancel for a serious reason needs its reason, and its summary carries it', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv);
      fakeStripe({ renewed: false });
      const missing = await (await post(`${PATH}/review`, testEnv, { service: 'private-network', type: 'cause', reason: '  ' }, session.cookie)).text();
      expect(missing).not.toContain('name="statement"');
      expect(missing).toMatch(/<textarea id="cancel-reason"[^>]*autofocus/);
      const review = await (await post(`${PATH}/review`, testEnv, { service: 'private-network', type: 'cause', reason: 'you lost my data', end: 'today' }, session.cookie)).text();
      expect(review).toContain(`you're canceling private network ($20 every year). for a serious reason: "you lost my data". it ends on ${formatLongDate(NOW_S)}.`);
      // "today" belongs to a cancel for a serious reason only.
      const ordinary = await (await post(`${PATH}/review`, testEnv, { service: 'private-network', type: 'cancel', reason: 'x', end: 'today' }, session.cookie)).text();
      expect(ordinary).not.toContain('serious reason: "');
      expect(ordinary).not.toContain(`it ends on ${formatLongDate(NOW_S)}.`);
    });

    it('shows a subscription already set to end with its date, and does not offer it', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv, { cancelAtPeriodEnd: true, periodEnd: NOW_S + 20 * DAY });
      fakeStripe({});
      const form = await (await get(`${PATH}?service=private-network`, testEnv, session.cookie)).text();
      // The last day of service, as the email gives it: the stored end minus a day, with no time.
      expect(form).toContain(`private network: already set to end on ${formatLongDate(NOW_S + 19 * DAY)}.`);
      expect(form).not.toContain(formatMomentUtc(NOW_S + 20 * DAY));
      expect(form).not.toContain('name="type"');
      const review = await (await post(`${PATH}/review`, testEnv, { service: 'private-network' }, session.cookie)).text();
      expect(review).not.toContain('name="statement"');
    });
  });

  describe('confirming', () => {
    it('in the first year with no name: records no name, emails the end date first, and cancels at the period end with no refund', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv, { email: 'first@example.com' });
      const stripe = fakeStripe({ renewed: false });
      const periodEnd = stripe.state().current_period_end;
      const end = formatLongDate(periodEnd - DAY);

      const before = Date.now();
      const done = await (await confirm(testEnv, session, { name: '' })).text();
      expect(stripe.writes).toEqual([{ cancel_at_period_end: 'true' }]);
      expect(stripe.refunds).toEqual([]);
      const row = await workerEnv.DB.prepare('SELECT * FROM subscription_cancellations').first();
      expect(row).not.toHaveProperty('name');
      expect(row).not.toHaveProperty('plan_amount');
      expect(row).toMatchObject({ cause: 0, ends_today: 0, ends_at: periodEnd, at_period_end: 1, refund_invoice_ref: null, refund_amount: null });
      expect(row.submitted_at).toBeGreaterThanOrEqual(before);
      expect(row.completed_at).not.toBeNull();

      expect(testEnv.EMAIL.sent).toHaveLength(1);
      const mail = testEnv.EMAIL.sent[0];
      const received = formatMomentUtc(Math.floor(row.submitted_at / 1000));
      expect(mail.to).toBe('first@example.com');
      expect(mail.subject).toBe(`your private network subscription ends on ${end}`);
      expect(mail.text).toBe([
        `private network ends on ${end}`,
        "we received your cancellation. keep this email: it's your record of it.",
        `what you sent us. a cancellation of your private network subscription ($20 every year), to end on ${end}.`,
        "from. first@example.com, the address you're signed in with. this confirmation goes there.",
        `received. ${received}.`,
        `what happens now. private network keeps working until ${end}, then stops, and it won't renew.`,
        'changed your mind? subscribe again anytime from services.solstone.app.',
        'questions: support@solstone.app.',
        'sol pbc',
      ].join('\n\n'));
      expect(mail.html).toContain(`font-size: 26px; font-weight: 700; line-height: 1.25; color: #1A1A1A; background: #FBEFDD; padding: 16px 20px; border-radius: 8px; margin: 0 0 20px;">private network ends on ${end}</p>`);
      expect(mail.html).toContain('<strong>what you sent us.</strong>');

      // The done page: when it was received, the summary line again, the email, and a way to save it.
      expect(done).toContain(`we received your cancellation on ${received}.`);
      expect(done).toContain(`you're canceling private network ($20 every year). it ends on ${end}. we'll send the confirmation to first@example.com.`);
      expect(done).toContain("we've emailed you a copy.");
      expect(done).toContain('onclick="window.print()">save this page</button>');
      // The service page shows the cancel at once.
      expect(await (await get('/private-network', testEnv, session.cookie)).text()).toContain(`scheduled to turn off on ${new Date(periodEnd * 1000).toISOString().slice(0, 10)}`);
    });

    it('with a name, the email carries it and the row does not', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv);
      fakeStripe({ renewed: false });
      await confirm(testEnv, session, { name: 'Ada Owner' });
      expect(testEnv.EMAIL.sent[0].text).toContain("from. Ada Owner, owner@example.com, the address you're signed in with.");
      const row = await workerEnv.DB.prepare('SELECT * FROM subscription_cancellations').first();
      expect(JSON.stringify(row)).not.toContain('Ada');
    });

    it.each(SERVICES)('in a renewed $slug year, ends at the month end and refunds the whole months left, tax included', async (def) => {
      const testEnv = makeTestEnv({ ...ON, ...PAGE_ENV });
      const { session } = await subscriber(testEnv, { service: def.service });
      const stripe = fakeStripe({ renewed: true, tag: def.tag, amount: def.amount, tax: 37 });
      const paid = def.amount + 37;
      const months = 11 - MONTH;
      const expected = monthsLeftRefund(paid, months);
      const end = formatLongDate(MONTH_END - DAY);

      const done = await (await confirm(testEnv, session, { service: def.slug })).text();
      expect(stripe.writes).toEqual([{ cancel_at: String(MONTH_END), proration_behavior: 'none' }]);
      expect(stripe.refunds).toEqual([{ charge: 'ch_renewal', amount: String(expected), key: 'cancel-refund-in_renewal' }]);
      expect(expected).toBe(Math.round((paid * months) / 12));
      const row = await workerEnv.DB.prepare('SELECT * FROM subscription_cancellations').first();
      expect(row).toMatchObject({ ends_at: MONTH_END, at_period_end: 0, refund_invoice_ref: 'in_renewal', refund_amount: expected, refund_months: months });
      expect(row.refunded_at).not.toBeNull();
      expect(row.completed_at).not.toBeNull();
      expect(done).toContain(`it ends on ${end}. we refund ${formatPrice(expected)}.`);
      const mail = testEnv.EMAIL.sent[0];
      expect(mail.subject).toBe(`your ${SERVICE_NAMES[def.service]} subscription ends on ${end}`);
      expect(mail.text).toContain(`we're refunding ${formatPrice(expected)} for the ${months} whole months left, the same way you paid, within 14 days.`);
      expect(mail.text.includes('we keep your encrypted backup copy for 30 days')).toBe(def.service === 'spb_hosted');
      expect(mail.text.includes('your solstone.me address stays reserved for you')).toBe(def.service === 'sme_hosted');

      // Stripe's own event for the cancel_at keeps the service page saying when it ends.
      await webhook(testEnv, 'customer.subscription.updated', stripe.state());
      expect(await entitlement(def.service)).toMatchObject({ status: 'active', cancel_at_period_end: 1, current_period_end: MONTH_END });
      expect(await (await get(def.page, testEnv, session.cookie)).text()).toContain(new Date(MONTH_END * 1000).toISOString().slice(0, 10));
    });
  });

  describe('a cancel for a serious reason', () => {
    it('with the ordinary end: opens a support request with the reason, emails it, and stores neither', async () => {
      const support = causeSupport();
      const testEnv = makeTestEnv({ ...ON, SUPPORT_WORKER: support });
      const { accountId, session } = await subscriber(testEnv);
      const stripe = fakeStripe({ renewed: false });
      const end = formatLongDate(stripe.state().current_period_end - DAY);

      await confirm(testEnv, session, { type: 'cause', reason: 'you lost my data' });
      expect(stripe.writes).toEqual([{ cancel_at_period_end: 'true' }]);
      const row = await workerEnv.DB.prepare('SELECT * FROM subscription_cancellations').first();
      expect(row).toMatchObject({ cause: 1, ends_today: 0 });
      expect(JSON.stringify(row)).not.toContain('lost my data');

      const mail = testEnv.EMAIL.sent[0];
      expect(mail.text).toContain(`to end on ${end}. you gave a serious reason: "you lost my data".`);
      expect(mail.text).toContain("then stops, and it won't renew. we'll answer your reason, and whether we refund more.");

      const [ticket, ack] = support.requests;
      expect(ticket).toMatchObject({ method: 'POST', pathname: '/api/services/tickets', headers: { ownerId: accountId, verifiedEmail: 'owner@example.com' } });
      expect(ticket.headers.idempotencyKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(ticket.body).toEqual({
        product: 'general',
        subject: 'cancel for a serious reason, such as something we did wrong',
        description: `you're canceling private network ($20 every year). for a serious reason: "you lost my data". it ends on ${end}. we'll send the confirmation to owner@example.com.`,
      });
      expect(ack).toMatchObject({ pathname: '/api/services/idempotency/ack', headers: { idempotencyKey: ticket.headers.idempotencyKey } });
    });

    it('ending today in the first year: Stripe ends it now, the service lapses, and nothing is refunded', async () => {
      const support = causeSupport();
      const testEnv = makeTestEnv({ ...ON, SUPPORT_WORKER: support });
      const { session } = await subscriber(testEnv);
      const stripe = fakeStripe({ renewed: false });
      const today = formatLongDate(NOW_S);

      const done = await (await confirm(testEnv, session, { type: 'cause', reason: 'it never worked', end: 'today' })).text();
      expect(stripe.deletes).toEqual(['cancel-today-sub_c1']);
      expect(stripe.writes).toEqual([]);
      expect(stripe.refunds).toEqual([]);
      expect(await entitlement()).toMatchObject({ status: 'lapsed' });
      const row = await workerEnv.DB.prepare('SELECT * FROM subscription_cancellations').first();
      expect(row).toMatchObject({ cause: 1, ends_today: 1, refund_invoice_ref: null });
      expect(row.completed_at).not.toBeNull();
      expect(testEnv.EMAIL.sent[0].subject).toBe(`your private network subscription ends on ${today}`);
      expect(testEnv.EMAIL.sent[0].text).toContain('what happens now. private network stopped when you canceled, and it won\'t renew.');
      expect(testEnv.EMAIL.sent[0].text).not.toContain('keeps working until');
      expect(done).toContain(`for a serious reason: "it never worked". it ends on ${today}. we'll send`);
      expect(support.requests[0].body.description).toContain('"it never worked"');
    });

    it('ending today in a renewed year still refunds the whole months left', async () => {
      const testEnv = makeTestEnv({ ...ON, SUPPORT_WORKER: causeSupport() });
      const { session } = await subscriber(testEnv);
      const stripe = fakeStripe({ renewed: true });
      const expected = monthsLeftRefund(2000, 11 - MONTH);

      const done = await (await confirm(testEnv, session, { type: 'cause', reason: 'it never worked', end: 'today' })).text();
      expect(stripe.deletes).toEqual(['cancel-today-sub_c1']);
      expect(stripe.refunds).toEqual([{ charge: 'ch_renewal', amount: String(expected), key: 'cancel-refund-in_renewal' }]);
      expect(await entitlement()).toMatchObject({ status: 'lapsed' });
      expect(done).toContain(`it ends on ${formatLongDate(NOW_S)}. we refund ${formatPrice(expected)}.`);
      expect(testEnv.EMAIL.sent[0].text).toContain(`we're refunding ${formatPrice(expected)} for the ${11 - MONTH} whole months left`);
    });

    it('a confirmation resent by the schedule carries neither the name nor the reason', async () => {
      const testEnv = makeTestEnv({ ...ON, SUPPORT_WORKER: causeSupport() });
      const { session } = await subscriber(testEnv);
      fakeStripe({ renewed: false });
      const send = testEnv.EMAIL.send;
      testEnv.EMAIL.send = async () => { throw new Error('send failed'); };
      const done = await (await confirm(testEnv, session, { name: 'Ada Owner', type: 'cause', reason: 'you lost my data' })).text();
      // The email hasn't gone, so the page doesn't say it has.
      expect(done).not.toContain("we've emailed you a copy.");
      expect(done).toContain('for a serious reason: "you lost my data"');
      testEnv.EMAIL.send = send;
      // The row keeps no price: the resend reads the plan from Stripe, and waits while it can't.
      installStripeFetchMock({ default: async () => json({ error: { type: 'api_error' } }, 500) });
      await runScheduled(testEnv);
      expect(testEnv.EMAIL.sent).toHaveLength(0);
      fakeStripe({ renewed: false });
      await runScheduled(testEnv);
      const [mail] = testEnv.EMAIL.sent;
      expect(mail.text).toContain('a cancellation of your private network subscription ($20 every year)');
      expect(mail.text).not.toContain('Ada');
      expect(mail.text).not.toContain('you gave a serious reason');
      expect(mail.text).toContain("from. owner@example.com, the address you're signed in with.");
      expect(mail.text).toContain("we'll answer your reason, and whether we refund more.");
    });

    it('a second press of the summary opens the support request the first could not', async () => {
      let up = false;
      const support = makeSupportWorker({
        'POST /api/services/tickets': () => (up ? supportJson({ id: '101', created_at: Date.now(), status: 'open' }, 201) : supportJson({ error: 'unavailable' }, 503)),
        'POST /api/services/idempotency/ack': () => new Response(null, { status: 204 }),
      });
      const testEnv = makeTestEnv({ ...ON, SUPPORT_WORKER: support });
      const { session } = await subscriber(testEnv);
      fakeStripe({ renewed: false });
      const statement = await summaryStatement(testEnv, session, { type: 'cause', reason: 'you lost my data' });
      await post(`${PATH}/confirm`, testEnv, { statement }, session.cookie);
      up = true;
      await post(`${PATH}/confirm`, testEnv, { statement }, session.cookie);
      const tickets = support.requests.filter((r) => r.pathname === '/api/services/tickets');
      expect(tickets).toHaveLength(2);
      expect(tickets[1].headers.idempotencyKey).toBe(tickets[0].headers.idempotencyKey);
      expect(tickets[1].body.description).toContain('"you lost my data"');
      expect(support.requests.at(-1).pathname).toBe('/api/services/idempotency/ack');
      expect(await count()).toBe(1);
    });

    it('ending today stays ended while Stripe\'s cancel keeps failing, whatever Stripe reports meanwhile', async () => {
      const testEnv = makeTestEnv({ ...ON, SUPPORT_WORKER: causeSupport() });
      const { session } = await subscriber(testEnv);
      const stripe = fakeStripe({ renewed: false, deleteFails: true });
      await confirm(testEnv, session, { type: 'cause', reason: 'it never worked', end: 'today' });
      expect(stripe.deletes).toHaveLength(1);
      expect(await entitlement()).toMatchObject({ status: 'lapsed' });
      await webhook(testEnv, 'customer.subscription.updated', stripe.state());
      expect(await entitlement()).toMatchObject({ status: 'lapsed' });
    });
  });

  describe('a renewed year whose renewal is unpaid', () => {
    it('ends today, with no refund and no year-end option, and Stripe ends it now', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv);
      const stripe = fakeStripe({ renewed: true, renewalPaid: false, status: 'past_due' });
      const today = formatLongDate(NOW_S);

      const form = await (await get(`${PATH}?service=private-network`, testEnv, session.cookie)).text();
      expect(form).toContain(`it ends on ${today}, the earliest it can.`);
      expect(form).toContain(`it ends on ${today}, the earliest an ordinary cancel can.`);
      expect(form).not.toContain('value="period_end"');
      expect(form).not.toContain('value="today"');
      expect(form).not.toContain('whole month');
      expect(form).not.toContain('keeps working until then');

      const done = await (await confirm(testEnv, session)).text();
      expect(done).toContain(`you're canceling private network ($20 every year). it ends on ${today}. we'll send the confirmation to owner@example.com.`);
      expect(stripe.deletes).toEqual(['cancel-today-sub_c1']);
      expect(stripe.writes).toEqual([]);
      expect(stripe.refunds).toEqual([]);
      expect(await entitlement()).toMatchObject({ status: 'lapsed' });
      const row = await workerEnv.DB.prepare('SELECT * FROM subscription_cancellations').first();
      expect(row).toMatchObject({ cause: 0, ends_today: 1, refund_invoice_ref: null });
      expect(testEnv.EMAIL.sent[0].subject).toBe(`your private network subscription ends on ${today}`);
      expect(testEnv.EMAIL.sent[0].text).toContain('private network stopped when you canceled, and it won\'t renew.');
      expect(testEnv.EMAIL.sent[0].text).not.toContain('withdraw from contract here');
    });
  });

  describe('the withdrawal line in the email', () => {
    it.each([
      ['inside the 14 days', 5, true],
      ['after them', 30, false],
    ])('%s', async (_label, daysAgo, shown) => {
      const testEnv = makeTestEnv({ ...ON, WITHDRAWAL_DOOR: 'on' });
      const { session } = await subscriber(testEnv);
      fakeStripe({ renewed: false, start: NOW_S - daysAgo * DAY });
      await confirm(testEnv, session);
      const line = `you can still withdraw for a full refund until the end of the 14th day after ${formatLongDate(NOW_S - daysAgo * DAY)}, with "withdraw from contract here".`;
      expect(testEnv.EMAIL.sent[0].text.includes(line)).toBe(shown);
      expect(testEnv.EMAIL.sent[0].html.includes('with <em>withdraw from contract here</em>.')).toBe(shown);
    });

    it('in a renewed year, counts from when the renewal was paid', async () => {
      const testEnv = makeTestEnv({ ...ON, WITHDRAWAL_DOOR: 'on' });
      const { session } = await subscriber(testEnv);
      const renewal = NOW_S - 3 * DAY;
      fakeStripe({ renewed: true, renewal, paidAt: renewal + DAY });
      await confirm(testEnv, session);
      expect(testEnv.EMAIL.sent[0].text).toContain(`until the end of the 14th day after ${formatLongDate(renewal + DAY)}, with "withdraw from contract here".`);
    });
  });

  describe('confirming again or failing', () => {
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
      const review = await (await post(`${PATH}/review`, testEnv, { service: 'private-network' }, session.cookie)).text();
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
      await workerEnv.DB.prepare(`INSERT INTO subscription_cancellations (subscription_ref, issued_at, account_id, service, cause, ends_today, ends_at, at_period_end, refund_invoice_ref, refund_amount, refund_months, submitted_at, refunded_at, completed_at, acknowledged_at)
        SELECT 'sub_c1', 1, id, 'spl_hosted', 0, 0, ?, 0, 'in_renewal', 100, 1, 1, 1, 1, 1 FROM accounts`).bind(MONTH_END).run();
      const done = await (await post(`${PATH}/confirm`, testEnv, { statement: stale }, session.cookie)).text();
      expect(stripe.refunds).toHaveLength(1);
      expect(done).not.toContain('we refund');
      const rows = (await workerEnv.DB.prepare('SELECT refund_invoice_ref FROM subscription_cancellations ORDER BY issued_at').all()).results;
      expect(rows).toEqual([{ refund_invoice_ref: 'in_renewal' }, { refund_invoice_ref: null }]);
    });

    it('with Stripe down, still records and emails, alerts a person, and finishes on the schedule', async () => {
      const testEnv = makeTestEnv(ON);
      const { session } = await subscriber(testEnv, { email: 'outage@example.com' });
      fakeStripe({ renewed: true });
      const statement = await summaryStatement(testEnv, session, { name: 'Ada' });
      installStripeFetchMock({ default: async () => json({ error: { type: 'api_error' } }, 500) });

      const done = await (await post(`${PATH}/confirm`, testEnv, { statement }, session.cookie)).text();
      expect(done).toContain(formatLongDate(MONTH_END - DAY));
      expect(done).toContain("we've emailed you a copy.");
      const row = await workerEnv.DB.prepare('SELECT * FROM subscription_cancellations').first();
      expect(row.completed_at).toBeNull();
      expect(row.refunded_at).toBeNull();
      const [mail, alert] = testEnv.EMAIL.sent;
      expect(mail.to).toBe('outage@example.com');
      expect(alert.to).toBe('support@solstone.app');
      expect(alert.text).not.toMatch(/sub_|cus_|in_renewal|outage@|Ada/);
      const lookup = alert.text.match(/^npx wrangler d1 execute account-portal --remote --command "(.+)"$/m)[1];
      expect((await workerEnv.DB.prepare(lookup).all()).results).toEqual([expect.objectContaining({ subscription_ref: 'sub_c1', stripe_customer_id: 'cus_c1' })]);
      // A pending declaration is not offered again, and shows the date its email gave.
      const pending = await (await get(`${PATH}?service=private-network`, testEnv, session.cookie)).text();
      expect(pending).not.toContain('name="type"');
      expect(pending).toContain(`private network: already set to end on ${formatLongDate(MONTH_END - DAY)}.`);
      expect(mail.subject).toBe(`your private network subscription ends on ${formatLongDate(MONTH_END - DAY)}`);

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

    it('when support cannot take the reason, a person is told, with nothing about the owner', async () => {
      const support = makeSupportWorker({ 'POST /api/services/tickets': () => supportJson({ error: 'unavailable' }, 503) });
      const testEnv = makeTestEnv({ ...ON, SUPPORT_WORKER: support });
      const { session } = await subscriber(testEnv);
      fakeStripe({ renewed: false });
      await confirm(testEnv, session, { name: 'Ada', type: 'cause', reason: 'you lost my data' });
      const [mail, alert] = testEnv.EMAIL.sent;
      expect(mail.text).toContain('you lost my data');
      expect(alert.to).toBe('support@solstone.app');
      expect(alert.text).not.toMatch(/sub_|cus_|owner@|Ada|lost my data/);
      const lookup = alert.text.match(/^npx wrangler d1 execute account-portal --remote --command "(.+)"$/m)[1];
      expect((await workerEnv.DB.prepare(lookup).all()).results).toEqual([expect.objectContaining({ subscription_ref: 'sub_c1', stripe_customer_id: 'cus_c1' })]);
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

// A Stripe that keeps the subscription's cancel state, and records every write, cancel and refund.
function fakeStripe({ renewed = false, tag = 'spl', amount = 2000, tax = 0, cancelAt = null, renewal = RENEWAL, start: firstStart = null, paidAt = null, renewalPaid = true, status: initialStatus = 'active', deleteFails = false }) {
  const start = firstStart ?? (renewed ? START : NOW_S - 30 * DAY);
  const periodStart = renewed ? renewal : start;
  const periodEnd = renewed ? serviceMonthStart(renewal, 12) : serviceMonthStart(start, 12);
  let cancel = { cancel_at: cancelAt, cancel_at_period_end: false };
  let status = initialStatus;
  const out = { writes: [], refunds: [], deletes: [] };
  const state = () => ({
    id: 'sub_c1',
    object: 'subscription',
    customer: 'cus_c1',
    status,
    start_date: start,
    created: start,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    ...cancel,
    metadata: { service: tag },
    items: { data: [{ quantity: 1, price: { unit_amount: amount, currency: 'usd', recurring: { interval: 'year' } } }] },
  });
  const invoices = [
    { id: 'in_first', amount_paid: amount + tax, charge: 'ch_first', created: start, billing_reason: 'subscription_create', status_transitions: { paid_at: start } },
    ...(renewed && renewalPaid ? [{ id: 'in_renewal', amount_paid: amount + tax, charge: 'ch_renewal', created: renewal + 30, billing_reason: 'subscription_cycle', status_transitions: { paid_at: paidAt ?? renewal + 30 } }] : []),
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
    'DELETE api.stripe.com/v1/subscriptions/sub_c1': async ({ init }) => {
      out.deletes.push(init.headers['Idempotency-Key']);
      if (deleteFails) return json({ error: { type: 'api_error' } }, 500);
      status = 'canceled';
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

// A support service that opens the request and takes its acknowledgement.
function causeSupport() {
  return makeSupportWorker({
    'POST /api/services/tickets': () => supportJson({ id: '101', created_at: Date.now(), status: 'open' }, 201),
    'POST /api/services/idempotency/ack': () => new Response(null, { status: 204 }),
  });
}

function supportJson(body, status) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Idempotency-Replay': 'false' } });
}

async function summaryStatement(testEnv, session, { name = '', service = 'private-network', type = 'cancel', reason = '', end = 'earliest' } = {}) {
  const review = await (await post(`${PATH}/review`, testEnv, { name, service, type, reason, end }, session.cookie)).text();
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
