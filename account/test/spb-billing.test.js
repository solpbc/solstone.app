import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  TEST_CSRF,
  installStripeFetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedScoutApplication,
  seedSession,
} from './helpers.js';

const SPB_SERVICE = 'spb_hosted';

describe('spb operated backup billing', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('redirects signed-out /services/spb through the signed-in guard', async () => {
    const response = await worker.fetch(new Request('https://services.solstone.app/services/spb'), makeTestEnv());

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('renders subscribe, active, comped, past due, and flash states', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spb-render@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const subscribe = await get('/services/spb', testEnv, session.cookie);
    const subscribeHtml = await subscribe.text();
    expect(subscribe.status).toBe(200);
    expect(subscribeHtml).toContain('encrypted backup');
    expect(subscribeHtml).toContain('action="/services/spb/checkout"');
    expect(subscribeHtml).toContain('pay yearly');

    await seedEntitlement({
      accountId: account.accountId,
      service: SPB_SERVICE,
      status: 'active',
      currentPeriodEnd: 1_800_000_000,
    });
    const active = await get('/services/spb?checkout=success', testEnv, session.cookie);
    const activeHtml = await active.text();
    expect(activeHtml).toContain('payment received. it can take a moment to show up here.');
    expect(activeHtml).toContain('your encrypted backup is on');
    expect(activeHtml).toContain('renews 2027-01-15');
    expect(activeHtml).toContain('action="/services/spb/portal"');

    await seedEntitlement({
      accountId: account.accountId,
      service: SPB_SERVICE,
      status: 'active',
      currentPeriodEnd: null,
      source: 'comp',
      sourceRef: null,
    });
    const comped = await get('/services/spb', testEnv, session.cookie);
    const compedHtml = await comped.text();
    expect(compedHtml).toContain("free while you're an approved scout");
    expect(compedHtml).not.toContain('action="/services/spb/portal"');

    await seedEntitlement({
      accountId: account.accountId,
      service: SPB_SERVICE,
      status: 'past_due',
      currentPeriodEnd: 1_800_000_000,
    });
    const pastDue = await get('/services/spb?checkout=cancel&billing=missing', testEnv, session.cookie);
    const pastDueHtml = await pastDue.text();
    expect(pastDueHtml).toContain("your last payment didn't go through");
    expect(pastDueHtml).toContain('no charge made.');
    expect(pastDueHtml).toContain('billing management is available after encrypted backup starts.');
  });

  it('creates checkout sessions with spb prices, metadata, and return urls', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spb-checkout@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const { calls } = installStripeFetchMock({
      'POST api.stripe.com/v1/checkout/sessions': async () => stripeJson({ id: 'cs_spb', url: 'https://checkout.stripe.test/spb-session' }),
    });

    const annual = await postForm('/services/spb/checkout', testEnv, new URLSearchParams({
      csrf: TEST_CSRF,
      plan: 'annual',
    }), session.cookie);
    expect(annual.status).toBe(303);
    expect(annual.headers.get('Location')).toBe('https://checkout.stripe.test/spb-session');
    expect(calls).toHaveLength(1);
    expect(calls[0].body.get('subscription_data[metadata][service]')).toBe('spb');
    expect(calls[0].body.get('subscription_data[metadata][account_id]')).toBe(account.accountId);
    expect(calls[0].body.get('line_items[0][price]')).toBe(testEnv.STRIPE_PRICE_SPB_ANNUAL);
    expect(calls[0].body.get('success_url')).toBe('https://services.solstone.app/services/spb?checkout=success');
    expect(calls[0].body.get('cancel_url')).toBe('https://services.solstone.app/services/spb?checkout=cancel');
    expect(calls[0].body.get('customer_email')).toBe('spb-checkout@example.com');

    await seedStripeCustomer(account.accountId, 'cus_spb_existing');
    const monthly = await postForm('/services/spb/checkout', testEnv, new URLSearchParams({
      csrf: TEST_CSRF,
      plan: 'monthly',
    }), session.cookie);
    expect(monthly.status).toBe(303);
    expect(calls[1].body.get('line_items[0][price]')).toBe(testEnv.STRIPE_PRICE_SPB_MONTHLY);
    expect(calls[1].body.get('customer')).toBe('cus_spb_existing');
    expect(calls[1].body.has('customer_email')).toBe(false);
  });

  it('handles checkout guard and error redirects without reaching Stripe when inappropriate', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spb-guards@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const { calls } = installStripeFetchMock({
      'POST api.stripe.com/v1/checkout/sessions': async () => stripeJson({ id: 'cs_without_url' }),
    });

    const invalid = await postForm('/services/spb/checkout', testEnv, new URLSearchParams({
      csrf: TEST_CSRF,
      plan: 'weekly',
    }), session.cookie);
    expect(invalid.status).toBe(303);
    expect(invalid.headers.get('Location')).toBe('/services/spb?checkout=invalid');
    expect(calls).toHaveLength(0);

    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 1_000 });
    const comped = await postForm('/services/spb/checkout', testEnv, new URLSearchParams({
      csrf: TEST_CSRF,
      plan: 'annual',
    }), session.cookie);
    expect(comped.status).toBe(303);
    expect(comped.headers.get('Location')).toBe('/services/spb?checkout=comped');
    expect(calls).toHaveLength(0);

    const other = await seedAccount({ email: 'spb-no-email@example.com', testEnv });
    const otherSession = await seedSession(other.accountId, { testEnv });
    await workerEnv.DB.prepare('UPDATE accounts SET primary_email_id = NULL WHERE id = ?').bind(other.accountId).run();
    const noEmail = await postForm('/services/spb/checkout', testEnv, new URLSearchParams({
      csrf: TEST_CSRF,
      plan: 'annual',
    }), otherSession.cookie);
    expect(noEmail.status).toBe(303);
    expect(noEmail.headers.get('Location')).toBe('/services/spb?checkout=email');

    const errorAccount = await seedAccount({ email: 'spb-error@example.com', testEnv });
    const errorSession = await seedSession(errorAccount.accountId, { testEnv });
    const stripeError = await postForm('/services/spb/checkout', testEnv, new URLSearchParams({
      csrf: TEST_CSRF,
      plan: 'annual',
    }), errorSession.cookie);
    expect(stripeError.status).toBe(303);
    expect(stripeError.headers.get('Location')).toBe('/services/spb?checkout=error');
    expect(calls).toHaveLength(1);
  });

  it('creates portal sessions with the spb return url and handles missing customers', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spb-portal@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const missing = await postForm('/services/spb/portal', testEnv, new URLSearchParams({ csrf: TEST_CSRF }), session.cookie);
    expect(missing.status).toBe(303);
    expect(missing.headers.get('Location')).toBe('/services/spb?billing=missing');

    await seedStripeCustomer(account.accountId, 'cus_spb_portal');
    const { calls } = installStripeFetchMock({
      'POST api.stripe.com/v1/billing_portal/sessions': async () => stripeJson({ id: 'bps_spb', url: 'https://billing.stripe.test/spb-session' }),
    });
    const response = await postForm('/services/spb/portal', testEnv, new URLSearchParams({ csrf: TEST_CSRF }), session.cookie);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('https://billing.stripe.test/spb-session');
    expect(calls[0].body.get('customer')).toBe('cus_spb_portal');
    expect(calls[0].body.get('return_url')).toBe('https://services.solstone.app/services/spb');
  });
});

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
  return worker.fetch(new Request(`https://services.solstone.app${path}`, {
    method: 'POST',
    headers,
    body,
  }), testEnv);
}

function stripeJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function seedStripeCustomer(accountId, stripeCustomerId) {
  await workerEnv.DB
    .prepare('INSERT INTO stripe_customers (account_id, stripe_customer_id, created_at) VALUES (?, ?, ?)')
    .bind(accountId, stripeCustomerId, 1_000)
    .run();
}
