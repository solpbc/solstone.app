import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { ownerExportNotIncluded } from '../src/owner-export-retained.js';
import {
  TEST_CSRF,
  installStripeFetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedSession,
} from './helpers.js';

// 1_800_000_000 is the seeded period end: 2027-01-15.
const PERIOD_END = 1_800_000_000;
const PERIOD_END_DATE = '2027-01-15';
const visibleText = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

describe('the billing page', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends a signed-out visitor through sign-in', async () => {
    const response = await get('/billing', makeTestEnv());
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/');
  });

  it('is linked from the signed-in home page beside your sign-in and data transparency', async () => {
    const { testEnv, session } = await signedIn('home@example.com');
    const html = await (await get('/', testEnv, session.cookie)).text();
    const signIn = html.indexOf('href="/sign-in"');
    const billing = html.indexOf('href="/billing"');
    const transparency = html.indexOf('href="/transparency"', signIn);
    expect(billing).toBeGreaterThan(signIn);
    expect(transparency).toBeGreaterThan(billing);
  });

  it('says so plainly when nothing is paid for, with no billing controls', async () => {
    const { testEnv, session } = await signedIn('empty@example.com');
    const { calls } = installStripeFetchMock({});

    const response = await get('/billing', testEnv, session.cookie);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(html).toContain('<h1>billing</h1>');
    expect(html).toContain("you don't pay for anything");
    expect(html).toContain('href="/">see the services</a>');
    expect(html).not.toContain('action="/billing/manage"');
    expect(calls).toHaveLength(0);
  });

  it('shows each paid service with its live price and when it renews, reading only the subscription', async () => {
    const { testEnv, session, accountId } = await signedIn('renews@example.com');
    await seedStripeCustomer(accountId, 'cus_renews');
    await seedEntitlement({ accountId, service: 'spl_hosted', sourceRef: 'sub_network', currentPeriodEnd: PERIOD_END });
    await seedEntitlement({ accountId, service: 'spb_hosted', sourceRef: 'sub_backup', currentPeriodEnd: PERIOD_END });
    const { calls } = installStripeFetchMock({
      'GET api.stripe.com/v1/subscriptions/sub_network': async () => stripeJson(subscription({ unitAmount: 249, interval: 'month' })),
      'GET api.stripe.com/v1/subscriptions/sub_backup': async () => stripeJson(subscription({ unitAmount: 4800, interval: 'year' })),
    });

    const html = await (await get('/billing', testEnv, session.cookie)).text();
    const text = visibleText(html);

    expect(text).toContain(`private network renews on ${PERIOD_END_DATE} at $2.49, plus any sales tax $2.49 /mo`);
    expect(text).toContain(`encrypted backup renews on ${PERIOD_END_DATE} at $48, plus any sales tax $48 /yr`);
    expect(html).toContain('href="/private-network"');
    expect(html).toContain('href="/services/backup"');
    // One manage billing button, and it says what Stripe holds.
    expect(html.match(/>manage billing</g)).toHaveLength(1);
    expect(html).toContain('action="/billing/manage"');
    expect(text).toContain('Stripe holds your card, your receipts and past charges, and your billing email and address.');
    // The published privacy policy: our systems never fetch the card or the billing address.
    // A subscription carries neither, and nothing else is read.
    expect(calls.map(({ method, url }) => `${method} ${url.pathname}`).sort()).toEqual([
      'GET /v1/subscriptions/sub_backup',
      'GET /v1/subscriptions/sub_network',
    ]);
    for (const { url } of calls) expect(url.search).toBe('');
  });

  it('names a scheduled stop, a failed payment and a stop, each with what still holds', async () => {
    const { testEnv, session, accountId } = await signedIn('states@example.com');
    await seedStripeCustomer(accountId, 'cus_states');
    await seedEntitlement({ accountId, service: 'spl_hosted', sourceRef: 'sub_network', cancelAtPeriodEnd: true });
    await seedEntitlement({ accountId, service: 'spb_hosted', sourceRef: 'sub_backup', status: 'past_due' });
    await seedEntitlement({ accountId, service: 'sme_hosted', sourceRef: 'sub_sme', status: 'lapsed', currentPeriodEnd: 1_700_000_000 });
    const { calls } = installStripeFetchMock({
      'GET api.stripe.com/v1/subscriptions/sub_network': async () => stripeJson(subscription({ unitAmount: 2000, interval: 'year' })),
      'GET api.stripe.com/v1/subscriptions/sub_backup': async () => stripeJson(subscription({ unitAmount: 4800, interval: 'year' })),
    });

    const text = visibleText(await (await get('/billing', testEnv, session.cookie)).text());

    expect(text).toContain(`private network scheduled to stop on ${PERIOD_END_DATE}. manage billing to keep it. $20 /yr`);
    expect(text).toContain("encrypted backup the last payment didn't go through. manage billing to fix it. if the subscription ends, sol pbc keeps your encrypted copy for 30 days. $48 /yr");
    expect(text).toContain('solstone.me stopped on 2023-11-14 stopped');
    // A stopped subscription is not read.
    expect(calls.some(({ url }) => url.pathname.endsWith('/sub_sme'))).toBe(false);
  });

  it('says what keeps working through a failed payment, service by service', async () => {
    const { testEnv, session, accountId } = await signedIn('pastdue@example.com');
    await seedEntitlement({ accountId, service: 'spl_hosted', sourceRef: 'sub_network', status: 'past_due' });
    await seedEntitlement({ accountId, service: 'sme_hosted', sourceRef: 'sub_sme', status: 'past_due' });
    installStripeFetchMock({ default: async () => stripeJson(subscription({ unitAmount: 500, interval: 'year' })) });

    const text = visibleText(await (await get('/billing', testEnv, session.cookie)).text());

    expect(text).toContain("private network the last payment didn't go through. reaching your journal on your own network stays free either way. manage billing to fix it.");
    expect(text).toContain("solstone.me the last payment didn't go through. your address stays reserved for you either way. manage billing to fix it.");
  });

  it('shows a scout row as free, with no price, no Stripe read and no billing controls', async () => {
    const { testEnv, session, accountId } = await signedIn('scout@example.com');
    await seedEntitlement({ accountId, service: 'spl_hosted', source: 'comp', sourceRef: null, currentPeriodEnd: null });
    await seedEntitlement({ accountId, service: 'spb_hosted', source: 'comp', status: 'lapsed', sourceRef: null, currentPeriodEnd: null });
    const { calls } = installStripeFetchMock({});

    const html = await (await get('/billing', testEnv, session.cookie)).text();
    const text = visibleText(html);

    expect(text).toContain("private network free while you're an approved scout scout");
    // An ended scout row was never paid for, so it has no place here.
    expect(text).not.toContain('encrypted backup');
    expect(html).not.toContain('action="/billing/manage"');
    expect(calls).toHaveLength(0);
  });

  it('keeps the renewal date and says the price did not load when Stripe does not answer', async () => {
    const { testEnv, session, accountId } = await signedIn('noprice@example.com');
    await seedEntitlement({ accountId, service: 'spl_hosted', sourceRef: 'sub_network' });
    installStripeFetchMock({ default: async () => stripeJson({ error: { message: 'down' } }, 500) });

    const response = await get('/billing', testEnv, session.cookie);
    const text = visibleText(await response.text());

    expect(response.status).toBe(200);
    expect(text).toContain(`private network renews on ${PERIOD_END_DATE}. the price didn't load; manage billing to see it.`);
  });
});

describe('manage billing from the billing page', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('opens the Stripe billing portal for the whole customer and returns to the billing page', async () => {
    const { testEnv, session, accountId } = await signedIn('manage@example.com');
    await seedStripeCustomer(accountId, 'cus_manage');
    const { calls } = installStripeFetchMock({
      'POST api.stripe.com/v1/billing_portal/sessions': async () => stripeJson({ id: 'bps_manage', url: 'https://billing.stripe.test/manage' }),
    });

    const response = await postForm('/billing/manage', testEnv, new URLSearchParams({ csrf: TEST_CSRF }), session.cookie);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('https://billing.stripe.test/manage');
    expect(calls).toHaveLength(1);
    expect(calls[0].body.get('customer')).toBe('cus_manage');
    expect(calls[0].body.get('return_url')).toBe('https://services.solstone.app/billing');
    expect(calls[0].body.has('flow_data[type]')).toBe(false);
  });

  it('refuses a cross-origin post and a missing token', async () => {
    const { testEnv, session, accountId } = await signedIn('refuse@example.com');
    await seedStripeCustomer(accountId, 'cus_refuse');
    const { calls } = installStripeFetchMock({});

    const crossOrigin = await worker.fetch(new Request('https://services.solstone.app/billing/manage', {
      method: 'POST',
      headers: { Origin: 'https://evil.test', 'Content-Type': 'application/x-www-form-urlencoded', Cookie: session.cookie },
      body: new URLSearchParams({ csrf: TEST_CSRF }),
    }), testEnv);
    const noToken = await postForm('/billing/manage', testEnv, new URLSearchParams(), session.cookie);

    expect(crossOrigin.status).toBe(403);
    expect(noToken.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('comes back to the billing page with a notice when there is nothing at Stripe, or Stripe fails', async () => {
    const { testEnv, session, accountId } = await signedIn('nocustomer@example.com');
    installStripeFetchMock({ default: async () => stripeJson({ error: {} }, 500) });

    const missing = await postForm('/billing/manage', testEnv, new URLSearchParams({ csrf: TEST_CSRF }), session.cookie);
    expect(missing.headers.get('Location')).toBe('/billing?billing=missing');
    expect(visibleText(await (await get('/billing?billing=missing', testEnv, session.cookie)).text()))
      .toContain("billing management opens once you've paid for a service.");

    await seedStripeCustomer(accountId, 'cus_failing');
    const failed = await postForm('/billing/manage', testEnv, new URLSearchParams({ csrf: TEST_CSRF }), session.cookie);
    expect(failed.headers.get('Location')).toBe('/billing?billing=error');
  });
});

describe('the service pages agree with the billing page', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('says when each service renews and at what price, and keeps its own manage billing and cancel doors', async () => {
    const { testEnv, session, accountId } = await signedIn('pages@example.com');
    await seedEntitlement({ accountId, service: 'spl_hosted', sourceRef: 'sub_network' });
    await seedEntitlement({ accountId, service: 'spb_hosted', sourceRef: 'sub_backup' });
    await seedEntitlement({ accountId, service: 'sme_hosted', sourceRef: 'sub_sme' });
    installStripeFetchMock({
      'GET api.stripe.com/v1/subscriptions/sub_network': async () => stripeJson(subscription({ unitAmount: 2000, interval: 'year' })),
      'GET api.stripe.com/v1/subscriptions/sub_backup': async () => stripeJson(subscription({ unitAmount: 499, interval: 'month' })),
      'GET api.stripe.com/v1/subscriptions/sub_sme': async () => stripeJson(subscription({ unitAmount: 500, interval: 'year' })),
    });

    const network = await (await get('/private-network', testEnv, session.cookie)).text();
    const backup = await (await get('/services/backup', testEnv, session.cookie)).text();
    const sme = await (await get('/services/solstone-me', testEnv, session.cookie)).text();

    expect(network).toContain(`renews on ${PERIOD_END_DATE} at $20, plus any sales tax · billed through Stripe.`);
    expect(backup).toContain(`renews on ${PERIOD_END_DATE} at $4.99, plus any sales tax · billed through Stripe.`);
    expect(sme).toContain(`renews on ${PERIOD_END_DATE} at $5, plus any sales tax · billed through Stripe.`);
    // The live Checkout string sends every buyer to these: the label and routes are unchanged.
    expect(network).toContain('action="/billing/portal"');
    expect(network).toContain('action="/billing/cancel"');
    expect(backup).toContain('action="/services/backup/portal"');
    expect(sme).toContain('action="/services/solstone-me/portal"');
    for (const html of [network, backup, sme]) expect(html).toContain('>manage billing</button>');
  });

  it('keeps "paid through" once a service is set to stop, and does not read its price', async () => {
    const { testEnv, session, accountId } = await signedIn('stopping@example.com');
    await seedEntitlement({ accountId, service: 'spl_hosted', sourceRef: 'sub_network', cancelAtPeriodEnd: true });
    const { calls } = installStripeFetchMock({});

    const html = await (await get('/private-network', testEnv, session.cookie)).text();

    expect(html).toContain(`paid through ${PERIOD_END_DATE} · billed through Stripe.`);
    expect(html).not.toContain('renews on');
    expect(calls).toHaveLength(0);
  });
});

describe('what Stripe holds, named where an owner looks', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('the download names the charges and invoices it leaves out, and where to get them', () => {
    const stripe = ownerExportNotIncluded().find(({ code }) => code === 'stripe_side_records');
    expect(stripe.description).toContain('your receipts and past charges are held by Stripe and are not included');
    expect(stripe.description).toContain('services.solstone.app/billing');
  });

  it('data transparency states the boundary, and only Article 8 sits under the Article 8 sentence', async () => {
    const { testEnv, session } = await signedIn('boundary@example.com');
    for (const html of [
      await (await get('/transparency', testEnv, session.cookie)).text(),
      await (await get('/transparency', testEnv)).text(),
    ]) {
      const text = visibleText(html);
      expect(text).not.toContain("we don't have your name");
      expect(text).toContain("we never hold a readable copy of your journal, and we don't collect a phone number.");
      expect(text).toContain('we keep the network address each of your sessions came from, encrypted');
      expect(text).toContain('Stripe holds your card, the name on it and your billing address');
      expect(text).toContain("to answer a billing question, an operator can see the card's brand, its last four digits, the name and the billing address in Stripe's own dashboard.");
      expect(text).toContain('our systems never fetch or store any of it.');
      const article8 = text.slice(text.lastIndexOf('.', text.indexOf('structural commitment under')) + 1, text.indexOf('Article III of the bylaws'));
      expect(article8.trim()).toMatch(/^no analytics, no behavioral data, no third-party tracking: that isn't a promise, it's a structural commitment under Article 8/);
      expect(article8).not.toMatch(/Stripe|network address|phone/);
    }
  });
});

async function signedIn(email) {
  const testEnv = makeTestEnv();
  const account = await seedAccount({ email, testEnv });
  const session = await seedSession(account.accountId, { testEnv });
  return { testEnv, session, accountId: account.accountId };
}

function subscription({ unitAmount, interval }) {
  return {
    id: 'sub_fixture',
    object: 'subscription',
    customer: 'cus_fixture',
    default_payment_method: 'pm_fixture',
    items: { data: [{ quantity: 1, price: { unit_amount: unitAmount, currency: 'usd', recurring: { interval } } }] },
  };
}

function get(path, testEnv, cookie = '') {
  const headers = cookie ? { Cookie: cookie } : {};
  return worker.fetch(new Request(`https://services.solstone.app${path}`, { headers }), testEnv);
}

function postForm(path, testEnv, body, cookie = '') {
  const headers = {
    Origin: 'https://services.solstone.app',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (cookie) headers.Cookie = cookie;
  return worker.fetch(new Request(`https://services.solstone.app${path}`, { method: 'POST', headers, body }), testEnv);
}

function stripeJson(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

async function seedStripeCustomer(accountId, stripeCustomerId) {
  await workerEnv.DB
    .prepare('INSERT INTO stripe_customers (account_id, stripe_customer_id, created_at) VALUES (?, ?, ?)')
    .bind(accountId, stripeCustomerId, 1_000)
    .run();
}
