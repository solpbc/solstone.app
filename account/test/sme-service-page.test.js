import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { SME_PERMANENCE_PARTS } from '../src/html.js';
import {
  installStripeFetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedSession,
  TEST_CSRF,
} from './helpers.js';

const visibleText = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]*>/g, ' ');

describe('the solstone.me service page and its catalog row', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('until the price exists', () => {
    it('does not exist: the page answers 404 and no catalog carries a row', async () => {
      const testEnv = makeTestEnv({ STRIPE_PRICE_SME_ANNUAL: undefined });
      testEnv.STRIPE_PRICE_SME_ANNUAL = '';
      const account = await seedAccount({ email: 'unlaunched@example.com', testEnv });
      const session = await seedSession(account.accountId, { testEnv });

      const page = await get('/services/solstone-me', testEnv, session.cookie);
      expect(page.status).toBe(404);

      const signedOut = await (await get('/', testEnv)).text();
      const signedIn = await (await get('/', testEnv, session.cookie)).text();
      for (const html of [signedOut, signedIn]) {
        expect(visibleText(html)).not.toContain('solstone.me');
        expect(html).not.toContain('/services/solstone-me');
      }
    });
  });

  describe('once it is on sale', () => {
    it('sends a signed-out visitor through sign-in', async () => {
      const response = await get('/services/solstone-me', makeTestEnv());
      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/');
    });

    it('shows the permanence disclosure before any way to pay, and sells one annual price', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ email: 'buyer@example.com', testEnv });
      const session = await seedSession(account.accountId, { testEnv });

      const response = await get('/services/solstone-me', testEnv, session.cookie);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(html).toContain('<h1>solstone.me</h1>');
      // § 14 promises the permanence is shown before any subscription is taken.
      const disclosure = html.indexOf(SME_PERMANENCE_PARTS[0]);
      for (const part of SME_PERMANENCE_PARTS) expect(html).toContain(part);
      const checkout = html.indexOf('action="/services/solstone-me/checkout"');
      expect(disclosure).toBeGreaterThan(-1);
      expect(checkout).toBeGreaterThan(disclosure);
      // One annual rung. A monthly price would fall below Stripe's minimum charge.
      expect(html).toContain('$5 / year');
      expect(html).toContain('name="plan" value="annual"');
      expect(html.match(/name="plan"/g)).toHaveLength(1);
      // Nothing is taken until the permanent record is acknowledged; the checkbox is in the pay form.
      const form = html.slice(checkout, html.indexOf('</form>', checkout));
      expect(form).toContain('name="data_ack" value="yes" required');
      expect(form).toContain('i understand that the public record of this address is permanent.');
      expect(html).not.toMatch(/month/i);
      expect(html).toContain('complimentary for approved scouts');
      // The always-free alternative is stated, with its warning.
      expect(html).toContain('you never have to pay us.');
      expect(html).toContain('some free tunnels decrypt your traffic in order to move it.');
      // The backstage code never reaches an owner's eyes.
      expect(visibleText(html)).not.toMatch(/\bsme\b/i);
      expect(visibleText(html)).not.toMatch(/subscribe/i);
    });

    it('renders an active paid subscription with billing management and its renewal date', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ email: 'paid@example.com', testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      await seedEntitlement({ accountId: account.accountId, service: 'sme_hosted', status: 'active', currentPeriodEnd: 1_800_000_000 });

      const html = await (await get('/services/solstone-me', testEnv, session.cookie)).text();

      expect(html).toContain('covered');
      expect(html).toContain('your payment is up to date');
      expect(html).toContain('paid through 2027-01-15');
      expect(html).not.toContain('renews');
      // Coverage is availability, never use: the page does not claim the address is on.
      expect(html).not.toContain('>on<');
      expect(visibleText(html)).not.toMatch(/\b(is|are|it's) on\b/i);
      expect(html).toContain('action="/services/solstone-me/portal"');
      expect(html).toContain('action="/services/solstone-me/cancel"');
      expect(html).toContain('cancel solstone.me');
      expect(html).not.toContain('action="/services/solstone-me/checkout"');
    });

    it('shows a pending cancellation date and removes only the cancel door', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ email: 'pending@example.com', testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      await seedEntitlement({
        accountId: account.accountId,
        service: 'sme_hosted',
        status: 'active',
        currentPeriodEnd: 1_800_000_000,
        cancelAtPeriodEnd: true,
      });

      const html = await (await get('/services/solstone-me', testEnv, session.cookie)).text();

      expect(html).toContain('your solstone.me coverage is scheduled to end on 2027-01-15');
      expect(html).toContain('action="/services/solstone-me/portal"');
      expect(html).not.toContain('action="/services/solstone-me/cancel"');
    });

    it('says what a covered owner has and where to turn it on, and never invents a paid-through date', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ email: 'nodate@example.com', testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      await seedEntitlement({ accountId: account.accountId, service: 'sme_hosted', status: 'active', currentPeriodEnd: null });

      const html = await (await get('/services/solstone-me', testEnv, session.cookie)).text();

      expect(html).toContain('turn it on from your journal');
      expect(html).not.toContain('paid through');
      expect(html).not.toContain('1970');
    });

    it('renders a complimentary scout without billing controls', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ email: 'scout@example.com', testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      await seedEntitlement({ accountId: account.accountId, service: 'sme_hosted', status: 'active', source: 'comp', currentPeriodEnd: null });

      const html = await (await get('/services/solstone-me', testEnv, session.cookie)).text();

      expect(html).toContain("free while you're an approved scout.");
      // A scout has paid nothing, so nothing here says a payment is up to date.
      expect(html).not.toContain('your payment is up to date');
      expect(html).not.toContain('action="/services/solstone-me/checkout"');
      expect(html).not.toContain('action="/services/solstone-me/portal"');
    });

    it('renders a payment that needs attention with the way to fix it', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ email: 'pastdue@example.com', testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      await seedEntitlement({ accountId: account.accountId, service: 'sme_hosted', status: 'past_due', currentPeriodEnd: 1_800_000_000 });

      const html = await (await get('/services/solstone-me', testEnv, session.cookie)).text();

      expect(html).toContain("your last payment didn't go through. manage billing to fix it.");
      expect(html).toContain('your last payment needs attention');
      expect(html).toContain('action="/services/solstone-me/portal"');
    });

    it('renders the flash for each checkout and billing outcome', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ email: 'flash@example.com', testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      const cases = [
        ['?checkout=success', 'payment received. it can take a moment to show up here.'],
        ['?checkout=cancel', 'no charge made.'],
        ['?checkout=invalid', "billing couldn't start. try again."],
        ['?checkout=email', 'billing needs an email address on your sign-in.'],
        ['?checkout=ack', 'confirm you understand before continuing.'],
        ['?checkout=error', "billing couldn't start. try again."],
        ['?checkout=comped', "you're already covered free as a scout."],
        ['?billing=missing', 'billing management is available once a payment has been made.'],
        ['?billing=error', "billing management didn't open. try again."],
      ];
      for (const [query, message] of cases) {
        const html = await (await get(`/services/solstone-me${query}`, testEnv, session.cookie)).text();
        expect(html, query).toContain(message);
      }
    });

    it('lets a paying owner buy it from the page it renders, end to end through checkout', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ email: 'checkout@example.com', testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      const { calls } = installStripeFetchMock({
        'POST api.stripe.com/v1/checkout/sessions': async () => new Response(JSON.stringify({ id: 'cs_sme', url: 'https://checkout.stripe.test/sme' }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      });
      const page = await (await get('/services/solstone-me', testEnv, session.cookie)).text();
      const csrf = page.match(/name="csrf" value="([^"]+)"/)[1];
      expect(csrf).toBe(TEST_CSRF);

      const response = await worker.fetch(new Request('https://services.solstone.app/services/solstone-me/checkout', {
        method: 'POST',
        headers: { Origin: 'https://services.solstone.app', Cookie: session.cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ csrf, plan: 'annual', data_ack: 'yes' }),
      }), testEnv);

      expect(response.headers.get('Location')).toBe('https://checkout.stripe.test/sme');
      expect(calls[0].body.get('line_items[0][price]')).toBe(testEnv.STRIPE_PRICE_SME_ANNUAL);
    });

    it('lists solstone.me in both catalogs: its price on the public one, its on or off state on the signed-in one', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ email: 'catalog@example.com', testEnv });
      const session = await seedSession(account.accountId, { testEnv });

      const signedOut = await (await get('/', testEnv)).text();
      expect(signedOut).toContain('href="/solstone-me"');
      expect(signedOut).toContain('an address for your journal, so an agent you already use can read from it.');
      expect(signedOut).toContain('<span class="price">$5<span class="per">/yr</span></span>');

      const off = await (await get('/', testEnv, session.cookie)).text();
      expect(off).toContain('href="/services/solstone-me"');
      await seedEntitlement({ accountId: account.accountId, service: 'sme_hosted', status: 'active' });
      const on = await (await get('/', testEnv, session.cookie)).text();
      const rowOf = (html) => html.slice(html.indexOf('href="/services/solstone-me"'), html.indexOf('href="/notifications"'));
      // Coverage, not use: the catalog cannot know whether the owner turned the address on.
      expect(rowOf(off)).toContain('not covered');
      expect(rowOf(on)).toContain('>covered<');
      expect(rowOf(on)).not.toContain('>on<');

      // Past due keeps the address working for 14 days after the paid period, the same rule
      // the mint applies, and no longer.
      const nowSeconds = Math.floor(Date.now() / 1000);
      await seedEntitlement({ accountId: account.accountId, service: 'sme_hosted', status: 'past_due', currentPeriodEnd: nowSeconds - 13 * 86400 });
      expect(rowOf(await (await get('/', testEnv, session.cookie)).text())).toContain('>covered<');
      await seedEntitlement({ accountId: account.accountId, service: 'sme_hosted', status: 'past_due', currentPeriodEnd: nowSeconds - 15 * 86400 });
      expect(rowOf(await (await get('/', testEnv, session.cookie)).text())).toContain('not covered');
    });
  });
});

function get(path, testEnv, cookie = '') {
  const headers = cookie ? { Cookie: cookie } : {};
  return worker.fetch(new Request(`https://services.solstone.app${path}`, { headers }), testEnv);
}
