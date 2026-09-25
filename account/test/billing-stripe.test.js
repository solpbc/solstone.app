import { createExecutionContext, env as workerEnv, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { BILLED_SERVICES, createCheckoutSession } from '../src/stripe.js';
import { TEST_CSRF, installConsoleSpy, installStripeFetchMock, makeTestEnv, resetDb, seedAccount, seedEntitlement, seedScoutApplication, seedSession, signStripeWebhook } from './helpers.js';

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
        metadata: { service: 'spl' },
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
        metadata: { service: 'spl' },
      }),
    });

    await sendEvent(testEnv, {
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_status', customer: 'cus_mapped', metadata: { service: 'spl' }, status: 'past_due', current_period_end: 1_800_000_000, cancel_at_period_end: true } },
    });
    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'past_due',
      current_period_end: 1_800_000_000,
      source_ref: 'sub_status',
      cancel_at_period_end: 1,
    });

    await sendEvent(testEnv, {
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_status', customer: 'cus_mapped', metadata: { service: 'spl' }, status: 'incomplete', current_period_end: 1_800_000_111 } },
    });
    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'past_due',
      current_period_end: 1_800_000_000,
    });

    await sendEvent(testEnv, {
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_status', customer: 'cus_mapped', metadata: { service: 'spl' }, status: 'canceled', current_period_end: 1_800_000_222 } },
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
      data: { object: { customer: 'cus_mapped', subscription: 'sub_invoice', subscription_details: { metadata: { service: 'spl' } } } },
    });
    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'past_due',
      current_period_end: 1_900_000_000,
      source_ref: 'sub_invoice',
    });
    await expect(entitlementRow(account.accountId, 'spb_hosted')).resolves.toBeNull();
  });

  // What forces a new billed service to be wired: every service checkout can sell is
  // walked through every event the webhook reconciles, and each must land on its own
  // entitlement and on no other. A service added to BILLED_SERVICES without a reconciler
  // fails here, not in production as another product's grant.
  it.each(BILLED_SERVICES)('reconciles %s events onto its own entitlement and no other', async (service) => {
    const own = `${service}_hosted`;
    const others = BILLED_SERVICES.filter((other) => other !== service).map((other) => `${other}_hosted`);
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: `walk-${service}@example.com`, testEnv });
    await seedStripeCustomer(account.accountId, `cus_walk_${service}`);
    const subscription = (extra = {}) => ({
      id: `sub_${service}`,
      customer: `cus_walk_${service}`,
      metadata: { service },
      status: 'active',
      current_period_end: 1_900_000_000,
      ...extra,
    });
    installStripeFetchMock({
      [`GET api.stripe.com/v1/subscriptions/sub_${service}`]: async () => stripeJson(subscription()),
    });
    const expectOnlyOwn = async (match) => {
      await expect(entitlementRow(account.accountId, own)).resolves.toMatchObject(match);
      for (const other of others) await expect(entitlementRow(account.accountId, other)).resolves.toBeNull();
    };

    await sendEvent(testEnv, {
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: account.accountId, customer: `cus_walk_${service}`, subscription: `sub_${service}` } },
    });
    await expectOnlyOwn({ status: 'active', source: 'stripe', source_ref: `sub_${service}`, current_period_end: 1_900_000_000 });

    await sendEvent(testEnv, {
      type: 'customer.subscription.updated',
      data: { object: subscription({ status: 'past_due', current_period_end: 1_950_000_000 }) },
    });
    await expectOnlyOwn({ status: 'past_due', current_period_end: 1_950_000_000 });

    await sendEvent(testEnv, {
      type: 'invoice.paid',
      data: { object: { customer: `cus_walk_${service}`, subscription: `sub_${service}` } },
    });
    await expectOnlyOwn({ status: 'active', current_period_end: 1_900_000_000 });

    await sendEvent(testEnv, {
      type: 'invoice.payment_failed',
      data: { object: { customer: `cus_walk_${service}`, subscription: `sub_${service}`, subscription_details: { metadata: { service } } } },
    });
    await expectOnlyOwn({ status: 'past_due' });

    // The same two events in the shape this account's webhook actually delivers.
    await sendEvent(testEnv, {
      type: 'invoice.paid',
      data: { object: dahliaInvoice({ customer: `cus_walk_${service}`, subscription: `sub_${service}`, service }) },
    });
    await expectOnlyOwn({ status: 'active', current_period_end: 1_900_000_000 });

    await sendEvent(testEnv, {
      type: 'invoice.payment_failed',
      data: { object: dahliaInvoice({ customer: `cus_walk_${service}`, subscription: `sub_${service}`, service }) },
    });
    await expectOnlyOwn({ status: 'past_due' });

    await sendEvent(testEnv, {
      type: 'customer.subscription.deleted',
      data: { object: subscription({ status: 'canceled' }) },
    });
    await expectOnlyOwn({ status: 'lapsed' });
  });

  // The regression the legacy-shape fixtures could never see. Since the webhook endpoint
  // follows the account default (2026-03-25.dahlia), an invoice carries neither
  // `subscription` nor `subscription_details`; both live under `parent.subscription_details`.
  // A handler reading only the legacy fields returns early on invoice.paid and, since the
  // strict service tag, reconciles nothing on invoice.payment_failed, so a private-network
  // customer whose card fails would stay `active`. These run the shipped shape and only it.
  it('revives invoice.paid and keeps invoice.payment_failed working for the shape this account receives', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'dahlia-invoice@example.com', testEnv });
    await seedStripeCustomer(account.accountId, 'cus_dahlia');
    await seedEntitlement({
      accountId: account.accountId,
      status: 'active',
      currentPeriodEnd: 1_700_000_000,
      sourceRef: 'sub_old',
    });
    const logged = installConsoleSpy();
    const { calls } = installStripeFetchMock({
      'GET api.stripe.com/v1/subscriptions/sub_dahlia': async () => stripeJson({
        id: 'sub_dahlia', status: 'active', current_period_end: 1_900_000_000, customer: 'cus_dahlia', metadata: { service: 'spl' },
      }),
    });
    const invoice = dahliaInvoice({ customer: 'cus_dahlia', subscription: 'sub_dahlia', service: 'spl' });

    await sendEvent(testEnv, { type: 'invoice.payment_failed', data: { object: invoice } });
    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({ status: 'past_due' });
    // The tag came off the invoice itself, so this event costs no Stripe call.
    expect(calls).toHaveLength(0);

    await sendEvent(testEnv, { type: 'invoice.paid', data: { object: invoice } });
    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'active',
      current_period_end: 1_900_000_000,
      source_ref: 'sub_dahlia',
    });
    expect(calls.filter((call) => call.method === 'GET' && call.url.pathname === '/v1/subscriptions/sub_dahlia')).toHaveLength(1);
    expect(logged.calls.filter(({ args }) => args[0] === 'stripe_event_service_unknown')).toHaveLength(0);
    logged.restore();
  });

  it('grants nothing for a Stripe object that is untagged or carries a tag no service owns', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'unknown-tag@example.com', testEnv });
    await seedStripeCustomer(account.accountId, 'cus_unknown');
    const logged = installConsoleSpy();
    installStripeFetchMock({
      'GET api.stripe.com/v1/subscriptions/sub_unknown': async () => stripeJson({
        id: 'sub_unknown', status: 'active', current_period_end: 1_900_000_000, customer: 'cus_unknown',
      }),
    });

    for (const metadata of [undefined, {}, { service: '' }, { service: 'spx' }, { service: 'toString' }, { service: 7 }]) {
      const object = { id: 'sub_unknown', customer: 'cus_unknown', status: 'active', current_period_end: 1_900_000_000, metadata };
      await sendEvent(testEnv, { type: 'customer.subscription.updated', data: { object } });
      await sendEvent(testEnv, { type: 'customer.subscription.deleted', data: { object } });
      await sendEvent(testEnv, {
        type: 'invoice.payment_failed',
        data: { object: { customer: 'cus_unknown', subscription: 'sub_unknown', subscription_details: { metadata } } },
      });
      await sendEvent(testEnv, {
        type: 'invoice.payment_failed',
        data: { object: dahliaInvoice({ customer: 'cus_unknown', subscription: 'sub_unknown', metadata }) },
      });
    }
    await sendEvent(testEnv, {
      type: 'invoice.paid',
      data: { object: { customer: 'cus_unknown', subscription: 'sub_unknown' } },
    });
    await sendEvent(testEnv, {
      type: 'invoice.paid',
      data: { object: dahliaInvoice({ customer: 'cus_unknown', subscription: 'sub_unknown', metadata: {} }) },
    });

    await expect(entitlementCount()).resolves.toBe(0);
    const unknown = logged.calls.filter(({ level, args }) => level === 'error' && args[0] === 'stripe_event_service_unknown');
    expect(unknown).toHaveLength(6 * 4 + 2);
    logged.restore();
  });

  // The contracts say the customer agrees to the terms with a separate, affirmative step
  // before any charge. Stripe only collects that step when asked, and only once a terms URL is
  // set in the Dashboard, so the request field is behind an exact-string switch. This proves
  // all three checkouts honor it identically, and that nothing but the exact string turns it on.
  it.each([
    ['spl', '/billing/checkout', { plan: 'annual' }],
    ['spb', '/services/backup/checkout', { plan: 'annual' }],
    ['sme', '/services/solstone-me/checkout', { plan: 'annual', data_ack: 'yes' }],
  ])('%s checkout asks Stripe to collect terms assent only when STRIPE_TERMS_ASSENT is exactly "required"', async (_service, path, fields) => {
    const logged = installConsoleSpy();
    const checkoutFor = async (overrides) => {
      const testEnv = makeTestEnv(overrides);
      const account = await seedAccount({ email: `terms-${Math.random().toString(36).slice(2)}@example.com`, testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      const { calls } = installStripeFetchMock({
        'POST api.stripe.com/v1/checkout/sessions': async () => stripeJson({ id: 'cs_terms', url: 'https://checkout.stripe.test/terms' }),
      });
      const response = await postForm(path, testEnv, new URLSearchParams({ csrf: TEST_CSRF, ...fields }), session.cookie);
      expect(response.headers.get('Location')).toBe('https://checkout.stripe.test/terms');
      return calls[0].body;
    };
    const warned = () => logged.calls.filter(({ level, args }) => level === 'warn' && args[0] === 'stripe_checkout_terms_assent_off').length;

    const on = await checkoutFor({ STRIPE_TERMS_ASSENT: 'required' });
    expect(on.get('custom_text[submit][message]')).toBe('by purchasing this service, you agree to enroll in an automatic renewal contract: it renews automatically at the end of each billing period, until you cancel. cancel anytime: sign in at services.solstone.app, open the service, use the manage billing button, and cancel on the billing page it opens. when you cancel, the service keeps working through the end of the period you have already paid for, then stops.');
    expect(on.get('consent_collection[terms_of_service]')).toBe('required');
    expect(warned()).toBe(0);

    for (const value of [undefined, '', 'true', '1', 'REQUIRED', ' required', 'none']) {
      const off = await checkoutFor({ STRIPE_TERMS_ASSENT: value });
      expect(off.get('custom_text[submit][message]')).toBe('by purchasing this service, you agree to enroll in an automatic renewal contract: it renews automatically at the end of each billing period, until you cancel. cancel anytime: sign in at services.solstone.app, open the service, use the manage billing button, and cancel on the billing page it opens. when you cancel, the service keeps working through the end of the period you have already paid for, then stops.');
      expect(off.has('consent_collection[terms_of_service]')).toBe(false);
    }
    expect(warned()).toBe(7);
    logged.restore();
  });

  // Stripe answers a refused checkout with an HTTP error, and the owner must land back on the
  // service page with the error flash, not on a bare 500 from the worker.
  it.each([
    ['spl', '/billing/checkout', { plan: 'annual' }, '/private-network?checkout=error'],
    ['spb', '/services/backup/checkout', { plan: 'annual' }, '/services/backup?checkout=error'],
    ['sme', '/services/solstone-me/checkout', { plan: 'annual', data_ack: 'yes' }, '/services/solstone-me?checkout=error'],
  ])('%s checkout returns to the service page when Stripe refuses the session', async (_service, path, fields, location) => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: `refused-${Math.random().toString(36).slice(2)}@example.com`, testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    installStripeFetchMock({
      'POST api.stripe.com/v1/checkout/sessions': async () => stripeJson({ error: { message: 'refused' } }, 400),
    });

    const response = await postForm(path, testEnv, new URLSearchParams({ csrf: TEST_CSRF, ...fields }), session.cookie);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe(location);
  });

  it('refuses to create a checkout for a service checkout does not sell', async () => {
    const testEnv = makeTestEnv();
    const base = { accountId: 'acct', priceId: 'price_x', customer: 'cus_x', customerEmail: '', successUrl: 'https://x.test/ok', cancelUrl: 'https://x.test/no', idempotencyKey: 'key' };
    await expect(createCheckoutSession(testEnv, { ...base })).rejects.toThrow('billed service');
    await expect(createCheckoutSession(testEnv, { ...base, service: 'spx' })).rejects.toThrow('billed service');
  });

  it('routes spb-tagged invoice payment failures without fetching the subscription', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spb-invoice-failed@example.com', testEnv });
    await seedStripeCustomer(account.accountId, 'cus_mapped');
    await seedEntitlement({
      accountId: account.accountId,
      service: 'spl_hosted',
      status: 'active',
      currentPeriodEnd: 1_800_000_000,
      sourceRef: 'sub_spl_existing',
    });
    await seedEntitlement({
      accountId: account.accountId,
      service: 'spb_hosted',
      status: 'active',
      currentPeriodEnd: 1_950_000_000,
      sourceRef: 'sub_spb_existing',
    });
    const { calls } = installStripeFetchMock();

    await sendEvent(testEnv, {
      type: 'invoice.payment_failed',
      data: {
        object: {
          customer: 'cus_mapped',
          subscription: 'sub_invoice',
          subscription_details: { metadata: { service: 'spb' } },
        },
      },
    });

    expect(calls.filter((call) => call.method === 'GET' && call.url.pathname.startsWith('/v1/subscriptions/'))).toHaveLength(0);
    await expect(entitlementRow(account.accountId, 'spb_hosted')).resolves.toMatchObject({
      status: 'past_due',
      current_period_end: 1_950_000_000,
      source_ref: 'sub_spb_existing',
    });
    await expect(entitlementRow(account.accountId, 'spl_hosted')).resolves.toMatchObject({
      status: 'active',
      current_period_end: 1_800_000_000,
      source_ref: 'sub_spl_existing',
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

  it('creates spb checkout sessions when service and price are provided directly', async () => {
    const testEnv = makeTestEnv();
    const { calls } = installStripeFetchMock({
      'POST api.stripe.com/v1/checkout/sessions': async () => stripeJson({ id: 'cs_spb', url: 'https://checkout.stripe.test/spb-session' }),
    });

    const checkout = await createCheckoutSession(testEnv, {
      accountId: 'acct_spb_checkout',
      priceId: testEnv.STRIPE_PRICE_SPB_ANNUAL,
      customer: 'cus_spb_checkout',
      customerEmail: '',
      successUrl: 'https://services.solstone.app/billing/return?status=success',
      cancelUrl: 'https://services.solstone.app/billing/return?status=cancel',
      idempotencyKey: 'spb-checkout-idempotency-key',
      service: 'spb',
    });

    expect(checkout.url).toBe('https://checkout.stripe.test/spb-session');
    expect(calls).toHaveLength(1);
    expect(calls[0].body.get('subscription_data[metadata][service]')).toBe('spb');
    expect(calls[0].body.get('line_items[0][price]')).toBe('price_spb_annual_test');
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
    expect(response.headers.get('Location')).toBe('/private-network?checkout=comped');
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
    expect(calls[0].body.get('return_url')).toBe('https://services.solstone.app/private-network');
    expect(calls[0].body.has('flow_data[type]')).toBe(false);
  });

  it('opens the private-network cancel flow for only its own subscription', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'cancel-network@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedStripeCustomer(account.accountId, 'cus_cancel_network');
    await seedEntitlement({ accountId: account.accountId, service: 'spl_hosted', sourceRef: 'sub_network' });
    await seedEntitlement({ accountId: account.accountId, service: 'spb_hosted', sourceRef: 'sub_backup' });
    const { calls } = installStripeFetchMock({
      'POST api.stripe.com/v1/billing_portal/sessions': async () => stripeJson({ id: 'bps_cancel_network', url: 'https://billing.stripe.test/cancel-network' }),
    });

    const response = await postForm('/billing/cancel', testEnv, new URLSearchParams({ csrf: TEST_CSRF }), session.cookie);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('https://billing.stripe.test/cancel-network');
    expect(calls[0].body.get('flow_data[type]')).toBe('subscription_cancel');
    expect(calls[0].body.get('flow_data[subscription_cancel][subscription]')).toBe('sub_network');
    expect(calls[0].body.toString()).not.toContain('sub_backup');
    expect(calls[0].body.get('flow_data[after_completion][redirect][return_url]')).toBe('https://services.solstone.app/private-network');
  });

  it('returns to the service page when Stripe refuses a cancel-flow session', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'cancel-network-error@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedStripeCustomer(account.accountId, 'cus_cancel_network_error');
    await seedEntitlement({ accountId: account.accountId, service: 'spl_hosted', sourceRef: 'sub_network_error' });
    installStripeFetchMock({
      'POST api.stripe.com/v1/billing_portal/sessions': async () => stripeJson({ error: {} }, 500),
    });

    const response = await postForm('/billing/cancel', testEnv, new URLSearchParams({ csrf: TEST_CSRF }), session.cookie);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/private-network?billing=error');
  });

  it('renders public, subscribe, active, past due, and return states through private network', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'render@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const unauth = await worker.fetch(new Request('https://services.solstone.app/private-network'), testEnv);
    expect(unauth.status).toBe(200);
    expect(await unauth.text()).toContain('<h1>private network</h1>');

    const subscribe = await get('/private-network', testEnv, session.cookie);
    expect(subscribe.status).toBe(200);
    expect(await subscribe.text()).toContain('pay yearly');

    await seedEntitlement({ accountId: account.accountId, status: 'active', currentPeriodEnd: 1_800_000_000 });
    installStripeFetchMock({
      'GET api.stripe.com/v1/subscriptions/sub_seeded': async () => new Response(JSON.stringify({ object: 'subscription', items: { data: [{ quantity: 1, price: { unit_amount: 2000, currency: 'usd', recurring: { interval: 'year' } } }] } })),
    });
    const active = await get('/private-network', testEnv, session.cookie);
    const activeHtml = await active.text();
    expect(activeHtml).toContain('your private network is on');
    expect(activeHtml).toContain('renews on 2027-01-15 at $20, plus any sales tax');
    expect(activeHtml).toContain('manage billing');
    expect(activeHtml).toContain('action="/billing/cancel"');

    await seedEntitlement({ accountId: account.accountId, status: 'past_due', currentPeriodEnd: 1_800_000_000 });
    const pastDue = await get('/private-network', testEnv, session.cookie);
    expect(await pastDue.text()).toContain("your last payment didn't go through");

    const returned = await get('/billing/return?status=success', testEnv, session.cookie);
    expect(await returned.text()).toContain('payment received. it can take a moment to show up here.');
  });

  it('renders comped scout private network without renewal or billing management', async () => {
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

    const response = await get('/private-network', testEnv, session.cookie);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("free while you're an approved scout");
    expect(html).toContain('your private network is on');
    expect(html).not.toContain('renews');
    expect(html).not.toContain('action="/billing/portal"');
  });
});

// An invoice as this account's webhook receives it (2026-03-25.dahlia): the subscription and
// its metadata sit under `parent.subscription_details`, with no top-level `subscription` or
// `subscription_details`. Asserting the absence keeps this fixture from quietly drifting back
// to the legacy shape, which is how the handlers came to read a payload that never arrived.
function dahliaInvoice({ customer, subscription, service, metadata = { service } }) {
  const invoice = {
    id: 'in_dahlia',
    object: 'invoice',
    customer,
    parent: {
      type: 'subscription_details',
      subscription_details: { subscription, metadata },
    },
  };
  expect(invoice).not.toHaveProperty('subscription');
  expect(invoice).not.toHaveProperty('subscription_details');
  return invoice;
}

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

async function entitlementRow(accountId, service = 'spl_hosted') {
  return workerEnv.DB
    .prepare('SELECT account_id, service, status, current_period_end, source, source_ref, cancel_at_period_end, updated_at FROM entitlements WHERE account_id = ? AND service = ?')
    .bind(accountId, service)
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
