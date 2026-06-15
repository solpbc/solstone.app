import { createExecutionContext, env as workerEnv, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { TEST_CSRF, installStripeFetchMock, makeTestEnv, resetDb, seedAccount, seedEntitlement, seedScoutApplication, seedSession, signStripeWebhook } from './helpers.js';

describe('billing stripe core', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('verifies webhook signatures and rejects stale or tampered bodies without writes', async () => {
    const testEnv = makeTestEnv();
    const event = { type: 'unknown.event', data: { object: {} } };
    const raw = JSON.stringify(event);
    const valid = await postWebhook(testEnv, raw);
    expect(valid.status).toBe(200);

    const badSig = await worker.fetch(new Request('https://services.solstone.app/stripe/webhook', {
      method: 'POST',
      headers: { 'Stripe-Signature': 't=1,v1=bad' },
      body: raw,
    }), testEnv);
    expect(badSig.status).toBe(400);

    const stale = await postWebhook(testEnv, raw, Math.floor(Date.now() / 1000) - 301);
    expect(stale.status).toBe(400);

    const signature = await signStripeWebhook(raw, testEnv.STRIPE_WEBHOOK_SECRET);
    const tampered = await worker.fetch(new Request('https://services.solstone.app/stripe/webhook', {
      method: 'POST',
      headers: { 'Stripe-Signature': signature },
      body: JSON.stringify({ type: 'unknown.event', data: { object: { changed: true } } }),
    }), testEnv);
    expect(tampered.status).toBe(400);
    await expect(entitlementCount()).resolves.toBe(0);
  });

  it('creates customer mapping and active entitlement from checkout completion idempotently', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'stripe-owner@example.com', testEnv });
    installStripeFetchMock({
      'GET api.stripe.com/v1/subscriptions/sub_checkout': async () => stripeJson({
        id: 'sub_checkout',
        status: 'active',
        current_period_end: 1_800_000_123,
        customer: 'cus_checkout',
      }),
    });

    const raw = JSON.stringify({
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: account.accountId, customer: 'cus_checkout', subscription: 'sub_checkout' } },
    });
    expect((await postWebhook(testEnv, raw)).status).toBe(200);
    expect((await postWebhook(testEnv, raw)).status).toBe(200);

    await expect(stripeCustomerRow(account.accountId)).resolves.toMatchObject({
      account_id: account.accountId,
      stripe_customer_id: 'cus_checkout',
    });
    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      account_id: account.accountId,
      service: 'spl_hosted',
      status: 'active',
      current_period_end: 1_800_000_123,
      source: 'stripe',
      source_ref: 'sub_checkout',
    });
  });

  it('maps subscription and invoice webhooks onto entitlement state', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'mapped@example.com', testEnv });
    await seedStripeCustomer(account.accountId, 'cus_mapped');
    await seedEntitlement({
      accountId: account.accountId,
      status: 'active',
      currentPeriodEnd: 1_700_000_000,
      sourceRef: 'sub_old',
    });
    installStripeFetchMock({
      'GET api.stripe.com/v1/subscriptions/sub_invoice': async () => stripeJson({
        id: 'sub_invoice',
        status: 'active',
        current_period_end: 1_900_000_000,
        customer: 'cus_mapped',
      }),
    });

    await sendEvent(testEnv, {
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_status', customer: 'cus_mapped', status: 'past_due', current_period_end: 1_800_000_000 } },
    });
    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'past_due',
      current_period_end: 1_800_000_000,
      source_ref: 'sub_status',
    });

    await sendEvent(testEnv, {
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_status', customer: 'cus_mapped', status: 'incomplete', current_period_end: 1_800_000_111 } },
    });
    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'past_due',
      current_period_end: 1_800_000_000,
    });

    await sendEvent(testEnv, {
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_status', customer: 'cus_mapped', status: 'canceled', current_period_end: 1_800_000_222 } },
    });
    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'lapsed',
      // Stripe deletion sends paid=null; DB COALESCE preserves the prior paid period.
      current_period_end: 1_800_000_000,
      source: 'stripe',
    });

    await sendEvent(testEnv, {
      type: 'invoice.paid',
      data: { object: { customer: 'cus_mapped', subscription: 'sub_invoice' } },
    });
    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'active',
      current_period_end: 1_900_000_000,
      source_ref: 'sub_invoice',
    });

    await sendEvent(testEnv, {
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_mapped', subscription: 'sub_invoice' } },
    });
    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'past_due',
      current_period_end: 1_900_000_000,
      source_ref: 'sub_invoice',
    });
  });

  it('creates checkout sessions with locked Stripe fields and redirects to hosted checkout', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'checkout@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const { calls } = installStripeFetchMock({
      'POST api.stripe.com/v1/checkout/sessions': async () => stripeJson({ id: 'cs_test', url: 'https://checkout.stripe.test/session' }),
    });

    const response = await postForm('/billing/checkout', testEnv, new URLSearchParams({
      csrf: TEST_CSRF,
      plan: 'annual',
    }), session.cookie);
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('https://checkout.stripe.test/session');
    expect(calls).toHaveLength(1);
    expect(calls[0].init.headers['Stripe-Version']).toBe('2024-09-30.acacia');
    expect(calls[0].init.headers['Idempotency-Key']).toMatch(/[0-9a-f-]{36}/i);
    expect(calls[0].body.get('mode')).toBe('subscription');
    expect(calls[0].body.get('client_reference_id')).toBe(account.accountId);
    expect(calls[0].body.get('subscription_data[metadata][service]')).toBe('spl');
    expect(calls[0].body.get('subscription_data[metadata][account_id]')).toBe(account.accountId);
    expect(calls[0].body.get('allow_promotion_codes')).toBe('true');
    expect(calls[0].body.get('automatic_tax[enabled]')).toBe('true');
    expect(calls[0].body.get('line_items[0][price]')).toBe('price_annual_test');
    expect(calls[0].body.get('line_items[0][quantity]')).toBe('1');
    expect(calls[0].body.get('success_url')).toBe('https://services.solstone.app/billing/return?status=success');
    expect(calls[0].body.get('cancel_url')).toBe('https://services.solstone.app/billing/return?status=cancel');
    expect(calls[0].body.get('customer_email')).toBe('checkout@example.com');
    expect(calls[0].body.has('customer')).toBe(false);

    await seedStripeCustomer(account.accountId, 'cus_existing');
    const existingCustomerResponse = await postForm('/billing/checkout', testEnv, new URLSearchParams({
      csrf: TEST_CSRF,
      plan: 'monthly',
    }), session.cookie);
    expect(existingCustomerResponse.status).toBe(303);
    expect(calls[1].body.get('line_items[0][price]')).toBe('price_monthly_test');
    expect(calls[1].body.get('customer')).toBe('cus_existing');
    expect(calls[1].body.has('customer_email')).toBe(false);
  });

  it('redirects approved scouts away from Stripe checkout', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'checkout-comped@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 1_000 });
    const { calls } = installStripeFetchMock();

    const response = await postForm('/billing/checkout', testEnv, new URLSearchParams({
      csrf: TEST_CSRF,
      plan: 'annual',
    }), session.cookie);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/services/spl?checkout=comped');
    expect(calls).toHaveLength(0);
  });

  it('creates billing portal sessions for existing Stripe customers', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'portal@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedStripeCustomer(account.accountId, 'cus_portal');
    const { calls } = installStripeFetchMock({
      'POST api.stripe.com/v1/billing_portal/sessions': async () => stripeJson({ id: 'bps_test', url: 'https://billing.stripe.test/session' }),
    });

    const response = await postForm('/billing/portal', testEnv, new URLSearchParams({ csrf: TEST_CSRF }), session.cookie);
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('https://billing.stripe.test/session');
    expect(calls[0].body.get('customer')).toBe('cus_portal');
    expect(calls[0].body.get('return_url')).toBe('https://services.solstone.app/services/spl');
  });

  it('renders subscribe, active, past due, and return states behind signed-in session', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'render@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const unauth = await worker.fetch(new Request('https://services.solstone.app/services/spl'), testEnv);
    expect(unauth.status).toBe(303);

    const subscribe = await get('/services/spl', testEnv, session.cookie);
    expect(subscribe.status).toBe(200);
    expect(await subscribe.text()).toContain('pay yearly');

    await seedEntitlement({ accountId: account.accountId, status: 'active', currentPeriodEnd: 1_800_000_000 });
    const active = await get('/services/spl', testEnv, session.cookie);
    const activeHtml = await active.text();
    expect(activeHtml).toContain('active');
    expect(activeHtml).toContain('renews 2027-01-15');
    expect(activeHtml).toContain('manage billing');

    await seedEntitlement({ accountId: account.accountId, status: 'past_due', currentPeriodEnd: 1_800_000_000 });
    const pastDue = await get('/services/spl', testEnv, session.cookie);
    expect(await pastDue.text()).toContain("the last payment didn't go through");

    const returned = await get('/billing/return?status=success', testEnv, session.cookie);
    expect(await returned.text()).toContain('payment received. it can take a moment to show up here.');
  });

  it('renders comped scout hosting without renewal or billing management', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'render-comp@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedEntitlement({
      accountId: account.accountId,
      status: 'active',
      currentPeriodEnd: null,
      source: 'comp',
      sourceRef: null,
    });

    const response = await get('/services/spl', testEnv, session.cookie);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("solstone is hosting your private link relay, free, while you're an approved scout.");
    expect(html).not.toContain('renews');
    expect(html).not.toContain('action="/billing/portal"');
  });
});

async function sendEvent(testEnv, event) {
  const response = await postWebhook(testEnv, JSON.stringify(event));
  expect(response.status).toBe(200);
  return response;
}

async function postWebhook(testEnv, rawBody, t = Math.floor(Date.now() / 1000)) {
  const signature = await signStripeWebhook(rawBody, testEnv.STRIPE_WEBHOOK_SECRET, t);
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request('https://services.solstone.app/stripe/webhook', {
    method: 'POST',
    headers: { 'Stripe-Signature': signature },
    body: rawBody,
  }), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return response;
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

async function entitlementRow(accountId) {
  return workerEnv.DB
    .prepare('SELECT account_id, service, status, current_period_end, source, source_ref, updated_at FROM entitlements WHERE account_id = ? AND service = ?')
    .bind(accountId, 'spl_hosted')
    .first();
}

async function stripeCustomerRow(accountId) {
  return workerEnv.DB
    .prepare('SELECT account_id, stripe_customer_id, created_at FROM stripe_customers WHERE account_id = ?')
    .bind(accountId)
    .first();
}

async function entitlementCount() {
  const row = await workerEnv.DB.prepare('SELECT COUNT(*) AS count FROM entitlements').first();
  return row.count;
}
