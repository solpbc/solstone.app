import { createExecutionContext, env as workerEnv, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  renderServicesSme,
  renderServicesSpb,
  renderServicesSpl,
  renderServicesSpp,
} from '../src/html.js';
import { renderLegalNotice } from '../src/renewal-notices.js';
import {
  installStripeFetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedSession,
} from './helpers.js';

const DAY = 86400;
const RULES_ON = { SUBSCRIPTION_RULES: 'on' };
const CANCEL_URL = 'https://services.solstone.app/billing/cancel-contract';

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

  describe('the annual renewal reminder', () => {
    const renewal = Date.UTC(2027, 0, 15) / 1000;
    const start = Date.UTC(2026, 0, 15) / 1000;

    it.each([
      [34, 0],
      [35, 1],
      [40, 1],
      [41, 0],
    ])('%i days before the renewal sends %i', async (days, expected) => {
      const testEnv = makeTestEnv(RULES_ON);
      await subscriber(testEnv, { sub: { start, periodStart: start, periodEnd: renewal } });
      await runAt(testEnv, renewal - days * DAY);
      expect(testEnv.EMAIL.sent).toHaveLength(expected);
    });

    it('is its own email carrying the renewal, the amounts, how to cancel and the cancel-by date in a box', async () => {
      const testEnv = makeTestEnv(RULES_ON);
      await subscriber(testEnv, { sub: { start, periodStart: start, periodEnd: renewal }, lastPaid: 1800 });
      await runAt(testEnv, renewal - 37 * DAY);
      await runAt(testEnv, renewal - 36 * DAY);
      expect(testEnv.EMAIL.sent).toHaveLength(1);
      const [email] = testEnv.EMAIL.sent;
      expect(email.to).toBe('rules@example.com');
      expect(email.subject).toContain('2027-01-15');
      expect(email.text).toContain('$20');
      expect(email.text).toContain('$18');
      expect(email.text).toContain(`${CANCEL_URL}?service=private-network`);
      expect(email.html).toContain(`href="${CANCEL_URL}?service=private-network"`);
      // The cancel-by date is the last day before the renewal, set apart in both parts.
      expect(email.html).toMatch(/<p style="border:[^"]*">[^\n]*2027-01-14[^\n]*<\/p>/);
      expect(email.text).toMatch(/-{10,}\n[^\n]*2027-01-14[^\n]*\n-{10,}/);
    });

    it('states the price as the previous amount when no invoice is paid yet', async () => {
      const testEnv = makeTestEnv(RULES_ON);
      await subscriber(testEnv, { sub: { start, periodStart: start, periodEnd: renewal }, lastPaid: null });
      await runAt(testEnv, renewal - 37 * DAY);
      expect(testEnv.EMAIL.sent).toHaveLength(1);
      expect(testEnv.EMAIL.sent[0].text).toContain('$20');
    });
  });

  describe('the monthly reminder', () => {
    it.each([
      ['the 15th', Date.UTC(2026, 0, 15, 9) / 1000],
      ['the 31st', Date.UTC(2026, 7, 31, 9) / 1000],
    ])('goes once every six months across a year, starting on %s', async (_label, start) => {
      const testEnv = makeTestEnv(RULES_ON);
      const sub = { start, periodStart: start, periodEnd: stripeMonthly(start, 1), interval: 'month', amount: 249 };
      const { accountId } = await subscriber(testEnv, { sub });
      const sentAt = [];
      for (let n = 1; n <= 18; n++) {
        sub.periodStart = stripeMonthly(start, n - 1);
        sub.periodEnd = stripeMonthly(start, n);
        await workerEnv.DB.prepare('UPDATE entitlements SET current_period_end = ? WHERE account_id = ?')
          .bind(sub.periodEnd, accountId)
          .run();
        const before = testEnv.EMAIL.sent.length;
        // Today's monthly timing: early in the cycle, 25 to 40 days before the renewal.
        await runAt(testEnv, sub.periodEnd - 26 * DAY);
        await runAt(testEnv, sub.periodEnd - 25 * DAY);
        if (testEnv.EMAIL.sent.length > before) sentAt.push(n);
      }
      expect(sentAt).toEqual([6, 12, 18]);
      expect(testEnv.EMAIL.sent).toHaveLength(3);
      expect(testEnv.EMAIL.sent[0].text).toContain(`${CANCEL_URL}?service=private-network`);
    });
  });

  describe('the renewal cooling-off notice', () => {
    const start = Date.UTC(2026, 0, 15, 12) / 1000;
    const renewed1 = Date.UTC(2027, 0, 15, 12) / 1000;
    const renewed2 = Date.UTC(2028, 0, 15, 12) / 1000;

    it('goes once on the first day of each renewed annual year, with the door and the cancel page', async () => {
      const testEnv = makeTestEnv(RULES_ON);
      const sub = { start, periodStart: renewed1, periodEnd: renewed2 };
      await subscriber(testEnv, { sub });
      await runAt(testEnv, renewed1 + 3600);
      await runAt(testEnv, renewed1 + 20 * 3600);
      expect(testEnv.EMAIL.sent).toHaveLength(1);
      const [email] = testEnv.EMAIL.sent;
      expect(email.html).toContain('href="https://services.solstone.app/billing/withdraw/private-network"');
      expect(email.html).toContain(`href="${CANCEL_URL}?service=private-network"`);
      const rows = await workerEnv.DB.prepare("SELECT renewal_at FROM renewal_notices WHERE kind = 'cooling_off'").all();
      expect(rows.results).toEqual([{ renewal_at: renewed1 }]);

      // Not after the first day.
      await runAt(testEnv, renewed1 + 2 * DAY);
      expect(testEnv.EMAIL.sent).toHaveLength(1);

      // The next renewal sends its own.
      sub.periodStart = renewed2;
      sub.periodEnd = Date.UTC(2029, 0, 15, 12) / 1000;
      await runAt(testEnv, renewed2 + 3600);
      expect(testEnv.EMAIL.sent).toHaveLength(2);
    });

    it('is never sent in the first year', async () => {
      const testEnv = makeTestEnv(RULES_ON);
      await subscriber(testEnv, { sub: { start, periodStart: start, periodEnd: renewed1 } });
      await runAt(testEnv, start + 3600);
      expect(testEnv.EMAIL.sent).toHaveLength(0);
    });

    it('is never sent on a monthly plan', async () => {
      const testEnv = makeTestEnv(RULES_ON);
      const periodStart = stripeMonthly(start, 12);
      await subscriber(testEnv, { sub: { start, periodStart, periodEnd: stripeMonthly(start, 13), interval: 'month', amount: 249 } });
      await runAt(testEnv, periodStart + 3600);
      expect(testEnv.EMAIL.sent).toHaveLength(0);
    });
  });

  describe('key information before checkout', () => {
    const pages = [
      { path: '/private-network', plans: { annual: ['$20', '$1.67'], monthly: ['$2.49'] } },
      { path: '/services/backup', plans: { annual: ['$48', '$4'], monthly: ['$4.99'] } },
      { path: '/services/solstone-me', plans: { annual: ['$5', '$0.42'] } },
    ];

    it.each(pages)('renders per plan on $path with the switch on, beside the start-now box, and not with it off', async ({ path, plans }) => {
      const on = makeTestEnv({ ...RULES_ON, WITHDRAWAL_DOOR: 'on' });
      const buyer = await seedAccount({ email: 'key-info@example.com', testEnv: on });
      const session = await seedSession(buyer.accountId, { testEnv: on });
      const page = await (await get(path, on, session.cookie)).text();
      expectKeyInformation(page, plans);
      // Before the box and before the button that goes to Checkout.
      expect(page.indexOf('data-key-info')).toBeLessThan(page.indexOf('name="start_now"'));
      expect(page.indexOf('data-key-info')).toBeLessThan(page.indexOf('pay yearly'));

      const off = makeTestEnv({ WITHDRAWAL_DOOR: 'on' });
      expect(await (await get(path, off, session.cookie)).text()).not.toContain('data-key-info');
    });

    it('renders on the confidential processing page, with or without the start-now box', () => {
      for (const startNowBox of [true, false]) {
        const page = renderServicesSpp({ entitlement: null, menu: {}, onSale: true, csrf: 'c', startNowBox, keyInfo: true });
        expectKeyInformation(page, { annual: ['$96', '$8'], monthly: ['$9.99'] });
      }
      expect(renderServicesSpp({ entitlement: null, menu: {}, onSale: true, csrf: 'c', startNowBox: true })).not.toContain('data-key-info');
    });
  });
});

function expectKeyInformation(page, plans) {
  const at = page.indexOf('<section class="card" data-key-info');
  expect(at).toBeGreaterThan(-1);
  const block = page.slice(at, page.indexOf('</section>', at));
  expect([...block.matchAll(/data-key-info-plan="([a-z]+)"/g)].map((m) => m[1])).toEqual(Object.keys(plans));
  for (const [plan, amounts] of Object.entries(plans)) {
    const start = block.indexOf(`data-key-info-plan="${plan}"`);
    const part = block.slice(start, block.indexOf('</div>', start));
    for (const amount of amounts) expect(part).toContain(amount);
    expect(part).toContain(`href="${CANCEL_URL}"`);
  }
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

// One annual (by default) private network subscriber whose Stripe reads come from `sub`,
// a live object the test can move from one period to the next.
async function subscriber(testEnv, { sub, lastPaid = 2000 }) {
  const account = await seedAccount({ email: 'rules@example.com', testEnv });
  await seedEntitlement({ accountId: account.accountId, sourceRef: 'sub_rules', currentPeriodEnd: sub.periodEnd });
  installStripeFetchMock({
    'GET api.stripe.com/v1/subscriptions/sub_rules': () => stripeJson({
      id: 'sub_rules',
      object: 'subscription',
      status: 'active',
      customer: 'cus_rules',
      start_date: sub.start,
      current_period_start: sub.periodStart,
      current_period_end: sub.periodEnd,
      cancel_at_period_end: false,
      cancel_at: null,
      metadata: { service: 'spl' },
      items: { data: [{ quantity: 1, price: { unit_amount: sub.amount ?? 2000, currency: 'usd', recurring: { interval: sub.interval ?? 'year' } } }] },
    }),
    'GET api.stripe.com/v1/invoices': () => stripeJson({ object: 'list', data: lastPaid == null ? [] : [{ id: 'in_rules', amount_paid: lastPaid }] }),
  });
  return { accountId: account.accountId };
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

function get(path, testEnv, cookie) {
  return worker.fetch(new Request(`https://services.solstone.app${path}`, { headers: { Cookie: cookie } }), testEnv, createExecutionContext());
}

function stripeJson(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
