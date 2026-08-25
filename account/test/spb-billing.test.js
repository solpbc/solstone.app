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

describe('spb encrypted backup billing', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('redirects signed-out /services/backup through the signed-in guard', async () => {
    const response = await worker.fetch(new Request('https://services.solstone.app/services/backup'), makeTestEnv());

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('renders subscribe, active, comped, past due, and flash states', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spb-render@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const subscribe = await get('/services/backup', testEnv, session.cookie);
    const subscribeHtml = await subscribe.text();
    expect(subscribe.status).toBe(200);
    expect(subscribeHtml).toContain('encrypted backup');
    expect(subscribeHtml).toContain('action="/services/backup/checkout"');
    expect(subscribeHtml).toContain('pay yearly');

    await seedEntitlement({
      accountId: account.accountId,
      service: SPB_SERVICE,
      status: 'active',
      currentPeriodEnd: 1_800_000_000,
    });
    const active = await get('/services/backup?checkout=success', testEnv, session.cookie);
    const activeHtml = await active.text();
    expect(activeHtml).toContain('payment received. it can take a moment to show up here.');
    expect(activeHtml).toContain('your encrypted backup is on');
    expect(activeHtml).toContain('renews 2027-01-15');
    expect(activeHtml).toContain('action="/services/backup/portal"');

    await seedEntitlement({
      accountId: account.accountId,
      service: SPB_SERVICE,
      status: 'active',
      currentPeriodEnd: null,
      source: 'comp',
      sourceRef: null,
    });
    const comped = await get('/services/backup', testEnv, session.cookie);
    const compedHtml = await comped.text();
    expect(compedHtml).toContain("free while you're an approved scout");
    expect(compedHtml).not.toContain('action="/services/backup/portal"');

    await seedEntitlement({
      accountId: account.accountId,
      service: SPB_SERVICE,
      status: 'past_due',
      currentPeriodEnd: 1_800_000_000,
    });
    const pastDue = await get('/services/backup?checkout=cancel&billing=missing', testEnv, session.cookie);
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

    const annual = await postForm('/services/backup/checkout', testEnv, new URLSearchParams({
      csrf: TEST_CSRF,
      plan: 'annual',
    }), session.cookie);
    expect(annual.status).toBe(303);
    expect(annual.headers.get('Location')).toBe('https://checkout.stripe.test/spb-session');
    expect(calls).toHaveLength(1);
    expect(calls[0].body.get('subscription_data[metadata][service]')).toBe('spb');
    expect(calls[0].body.get('subscription_data[metadata][account_id]')).toBe(account.accountId);
    expect(calls[0].body.get('line_items[0][price]')).toBe(testEnv.STRIPE_PRICE_SPB_ANNUAL);
    expect(calls[0].body.get('success_url')).toBe('https://services.solstone.app/services/backup?checkout=success');
    expect(calls[0].body.get('cancel_url')).toBe('https://services.solstone.app/services/backup?checkout=cancel');
    expect(calls[0].body.get('customer_email')).toBe('spb-checkout@example.com');

    await seedStripeCustomer(account.accountId, 'cus_spb_existing');
    const monthly = await postForm('/services/backup/checkout', testEnv, new URLSearchParams({
      csrf: TEST_CSRF,
      plan: 'monthly',
    }), session.cookie);
    expect(monthly.status).toBe(303);
    expect(calls[1].body.get('line_items[0][price]')).toBe(testEnv.STRIPE_PRICE_SPB_MONTHLY);
    expect(calls[1].body.get('customer')).toBe('cus_spb_existing');
    expect(calls[1].body.has('customer_email')).toBe(false);

    const restore = await postForm('/services/backup/checkout', testEnv, new URLSearchParams({
      csrf: TEST_CSRF,
      plan: 'annual',
      intent: 'restore',
    }), session.cookie);
    expect(restore.status).toBe(303);
    expect(calls[2].body.get('success_url')).toBe('https://services.solstone.app/services/backup?checkout=success&intent=restore');
    expect(calls[2].body.get('cancel_url')).toBe('https://services.solstone.app/services/backup?checkout=cancel');
  });

  it('threads the restore checkout marker and renders the success notice on every entitlement branch', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spb-restore-return@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const notice = "if you're restoring a journal, return to it and start the restore again. you'll enter your recovery key once more.";

    const defaultReturn = await get('/services/backup?checkout=success&intent=restore', testEnv, session.cookie);
    const defaultHtml = await defaultReturn.text();
    expect(defaultHtml).toContain(notice);
    expect(defaultHtml.indexOf(notice)).toBeLessThan(defaultHtml.indexOf('<div class="pagehead">'));
    expect(defaultHtml).not.toContain('your journal stays on your device either way');
    expect(defaultHtml).toContain('name="plan" value="annual"');
    expect(defaultHtml).toContain('name="plan" value="monthly"');
    expect(defaultHtml.match(/name="intent" value="restore"/g)).toHaveLength(2);

    const plainRestore = await get('/services/backup?intent=restore', testEnv, session.cookie);
    const plainRestoreHtml = await plainRestore.text();
    expect(plainRestoreHtml).not.toContain(notice);
    expect(plainRestoreHtml).toContain('your journal stays on your device either way');
    expect(plainRestoreHtml.match(/name="intent" value="restore"/g)).toHaveLength(2);

    const noMarker = await get('/services/backup?checkout=success', testEnv, session.cookie);
    const noMarkerHtml = await noMarker.text();
    expect(noMarkerHtml).not.toContain(notice);
    expect(noMarkerHtml).toContain('your journal stays on your device either way');

    for (const entitlement of [
      { status: 'active', source: 'stripe' },
      { status: 'active', source: 'comp', sourceRef: null },
      { status: 'past_due', source: 'stripe' },
    ]) {
      await seedEntitlement({
        accountId: account.accountId,
        service: SPB_SERVICE,
        status: entitlement.status,
        source: entitlement.source,
        sourceRef: entitlement.sourceRef,
      });
      const response = await get('/services/backup?checkout=success&intent=restore', testEnv, session.cookie);
      const body = await response.text();
      expect(body).toContain(notice);
      expect(body).not.toContain('your journal stays on your device either way');
    }
  });

  it('handles checkout guard and error redirects without reaching Stripe when inappropriate', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spb-guards@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const { calls } = installStripeFetchMock({
      'POST api.stripe.com/v1/checkout/sessions': async () => stripeJson({ id: 'cs_without_url' }),
    });

    const invalid = await postForm('/services/backup/checkout', testEnv, new URLSearchParams({
      csrf: TEST_CSRF,
      plan: 'weekly',
    }), session.cookie);
    expect(invalid.status).toBe(303);
    expect(invalid.headers.get('Location')).toBe('/services/backup?checkout=invalid');
    expect(calls).toHaveLength(0);

    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 1_000 });
    const comped = await postForm('/services/backup/checkout', testEnv, new URLSearchParams({
      csrf: TEST_CSRF,
      plan: 'annual',
    }), session.cookie);
    expect(comped.status).toBe(303);
    expect(comped.headers.get('Location')).toBe('/services/backup?checkout=comped');
    expect(calls).toHaveLength(0);

    const other = await seedAccount({ email: 'spb-no-email@example.com', testEnv });
    const otherSession = await seedSession(other.accountId, { testEnv });
    await workerEnv.DB.prepare('UPDATE accounts SET primary_email_id = NULL WHERE id = ?').bind(other.accountId).run();
    const noEmail = await postForm('/services/backup/checkout', testEnv, new URLSearchParams({
      csrf: TEST_CSRF,
      plan: 'annual',
    }), otherSession.cookie);
    expect(noEmail.status).toBe(303);
    expect(noEmail.headers.get('Location')).toBe('/services/backup?checkout=email');

    const errorAccount = await seedAccount({ email: 'spb-error@example.com', testEnv });
    const errorSession = await seedSession(errorAccount.accountId, { testEnv });
    const stripeError = await postForm('/services/backup/checkout', testEnv, new URLSearchParams({
      csrf: TEST_CSRF,
      plan: 'annual',
    }), errorSession.cookie);
    expect(stripeError.status).toBe(303);
    expect(stripeError.headers.get('Location')).toBe('/services/backup?checkout=error');
    expect(calls).toHaveLength(1);
  });

  it('creates portal sessions with the spb return url and handles missing customers', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spb-portal@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const missing = await postForm('/services/backup/portal', testEnv, new URLSearchParams({ csrf: TEST_CSRF }), session.cookie);
    expect(missing.status).toBe(303);
    expect(missing.headers.get('Location')).toBe('/services/backup?billing=missing');

    await seedStripeCustomer(account.accountId, 'cus_spb_portal');
    const { calls } = installStripeFetchMock({
      'POST api.stripe.com/v1/billing_portal/sessions': async () => stripeJson({ id: 'bps_spb', url: 'https://billing.stripe.test/spb-session' }),
    });
    const response = await postForm('/services/backup/portal', testEnv, new URLSearchParams({ csrf: TEST_CSRF }), session.cookie);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('https://billing.stripe.test/spb-session');
    expect(calls[0].body.get('customer')).toBe('cus_spb_portal');
    expect(calls[0].body.get('return_url')).toBe('https://services.solstone.app/services/backup');
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
