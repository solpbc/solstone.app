import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  TEST_CSRF,
  installStripeFetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedScoutApplication,
  seedSession,
} from './helpers.js';

const PATH = '/services/sme';

describe('sme checkout and portal', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates an annual checkout tagged sme, with its own price and return urls', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'sme-checkout@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const { calls } = installStripeFetchMock({
      'POST api.stripe.com/v1/checkout/sessions': async () => stripeJson({ id: 'cs_sme', url: 'https://checkout.stripe.test/sme-session' }),
    });

    const first = await postForm(`${PATH}/checkout`, testEnv, new URLSearchParams({ csrf: TEST_CSRF, plan: 'annual', data_ack: 'yes' }), session.cookie);
    expect(first.status).toBe(303);
    expect(first.headers.get('Location')).toBe('https://checkout.stripe.test/sme-session');
    expect(calls).toHaveLength(1);
    expect(calls[0].body.get('mode')).toBe('subscription');
    expect(calls[0].body.get('client_reference_id')).toBe(account.accountId);
    expect(calls[0].body.get('subscription_data[metadata][service]')).toBe('sme');
    expect(calls[0].body.get('subscription_data[metadata][account_id]')).toBe(account.accountId);
    expect(calls[0].body.get('line_items[0][price]')).toBe(testEnv.STRIPE_PRICE_SME_ANNUAL);
    expect(calls[0].body.get('success_url')).toBe(`https://services.solstone.app${PATH}?checkout=success`);
    expect(calls[0].body.get('cancel_url')).toBe(`https://services.solstone.app${PATH}?checkout=cancel`);
    expect(calls[0].body.get('customer_email')).toBe('sme-checkout@example.com');
    expect(calls[0].body.get('automatic_tax[enabled]')).toBe('true');

    // The one price is annual, so a form that names no plan buys it, and an existing
    // Stripe customer is reused rather than asked for an email again.
    await seedStripeCustomer(account.accountId, 'cus_sme_existing');
    const second = await postForm(`${PATH}/checkout`, testEnv, new URLSearchParams({ csrf: TEST_CSRF, data_ack: 'yes' }), session.cookie);
    expect(second.status).toBe(303);
    expect(calls[1].body.get('line_items[0][price]')).toBe(testEnv.STRIPE_PRICE_SME_ANNUAL);
    expect(calls[1].body.get('customer')).toBe('cus_sme_existing');
    expect(calls[1].body.has('customer_email')).toBe(false);
  });

  it('takes no subscription until the owner has acknowledged the permanent record, enforced on the server', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'sme-ack@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const { calls } = installStripeFetchMock({
      'POST api.stripe.com/v1/checkout/sessions': async () => stripeJson({ id: 'cs_sme', url: 'https://checkout.stripe.test/sme-session' }),
    });

    for (const fields of [{}, { data_ack: 'no' }, { data_ack: 'on' }, { data_ack: '' }]) {
      const response = await postForm(`${PATH}/checkout`, testEnv, new URLSearchParams({ csrf: TEST_CSRF, plan: 'annual', ...fields }), session.cookie);
      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe(`${PATH}?checkout=ack`);
    }
    expect(calls).toHaveLength(0);

    const acknowledged = await postForm(`${PATH}/checkout`, testEnv, new URLSearchParams({ csrf: TEST_CSRF, plan: 'annual', data_ack: 'yes' }), session.cookie);
    expect(acknowledged.headers.get('Location')).toBe('https://checkout.stripe.test/sme-session');
    expect(calls).toHaveLength(1);
  });

  it('is annual-only: any other plan is refused before Stripe is reached', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'sme-annual-only@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const { calls } = installStripeFetchMock();

    for (const plan of ['monthly', 'weekly', 'Annual', ' ']) {
      const response = await postForm(`${PATH}/checkout`, testEnv, new URLSearchParams({ csrf: TEST_CSRF, plan }), session.cookie);
      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe(`${PATH}?checkout=invalid`);
    }
    expect(calls).toHaveLength(0);
  });

  it('fails closed while the price is unset, which is how the placeholder ships', async () => {
    const testEnv = { ...makeTestEnv(), STRIPE_PRICE_SME_ANNUAL: '' };
    const account = await seedAccount({ email: 'sme-no-price@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const { calls } = installStripeFetchMock();

    const response = await postForm(`${PATH}/checkout`, testEnv, new URLSearchParams({ csrf: TEST_CSRF, plan: 'annual', data_ack: 'yes' }), session.cookie);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe(`${PATH}?checkout=invalid`);
    expect(calls).toHaveLength(0);
  });

  it('keeps scouts free, and handles guard and error redirects, without reaching Stripe when inappropriate', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'sme-guards@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const { calls } = installStripeFetchMock({
      'POST api.stripe.com/v1/checkout/sessions': async () => stripeJson({ id: 'cs_without_url' }),
    });
    const form = () => new URLSearchParams({ csrf: TEST_CSRF, plan: 'annual', data_ack: 'yes' });

    const stripeError = await postForm(`${PATH}/checkout`, testEnv, form(), session.cookie);
    expect(stripeError.status).toBe(303);
    expect(stripeError.headers.get('Location')).toBe(`${PATH}?checkout=error`);
    expect(calls).toHaveLength(1);

    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 1_000 });
    const comped = await postForm(`${PATH}/checkout`, testEnv, form(), session.cookie);
    expect(comped.status).toBe(303);
    expect(comped.headers.get('Location')).toBe(`${PATH}?checkout=comped`);
    expect(calls).toHaveLength(1);

    const other = await seedAccount({ email: 'sme-no-email@example.com', testEnv });
    const otherSession = await seedSession(other.accountId, { testEnv });
    await workerEnv.DB.prepare('UPDATE accounts SET primary_email_id = NULL WHERE id = ?').bind(other.accountId).run();
    const noEmail = await postForm(`${PATH}/checkout`, testEnv, form(), otherSession.cookie);
    expect(noEmail.status).toBe(303);
    expect(noEmail.headers.get('Location')).toBe(`${PATH}?checkout=email`);
    expect(calls).toHaveLength(1);
  });

  it('enforces origin, csrf and sign-in on checkout and portal', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'sme-csrf@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const { calls } = installStripeFetchMock();

    for (const action of ['checkout', 'portal']) {
      const badCsrf = await postForm(`${PATH}/${action}`, testEnv, new URLSearchParams({ csrf: 'bad', plan: 'annual' }), session.cookie);
      expect(badCsrf.status).toBe(403);
      const badOrigin = await worker.fetch(new Request(`https://services.solstone.app${PATH}/${action}`, {
        method: 'POST',
        headers: { Origin: 'https://bad.example', Cookie: session.cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ csrf: TEST_CSRF, plan: 'annual' }),
      }), testEnv);
      expect(badOrigin.status).toBe(403);
      const signedOut = await postForm(`${PATH}/${action}`, testEnv, new URLSearchParams({ csrf: TEST_CSRF, plan: 'annual' }));
      expect(signedOut.status).toBe(303);
      expect(signedOut.headers.get('Location')).toBe('/');
    }
    expect(calls).toHaveLength(0);
  });

  it('creates portal sessions with the return url and handles missing customers', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'sme-portal@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const missing = await postForm(`${PATH}/portal`, testEnv, new URLSearchParams({ csrf: TEST_CSRF }), session.cookie);
    expect(missing.status).toBe(303);
    expect(missing.headers.get('Location')).toBe(`${PATH}?billing=missing`);

    await seedStripeCustomer(account.accountId, 'cus_sme_portal');
    const { calls } = installStripeFetchMock({
      'POST api.stripe.com/v1/billing_portal/sessions': async () => stripeJson({ id: 'bps_sme', url: 'https://billing.stripe.test/sme-session' }),
    });
    const response = await postForm(`${PATH}/portal`, testEnv, new URLSearchParams({ csrf: TEST_CSRF }), session.cookie);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('https://billing.stripe.test/sme-session');
    expect(calls[0].body.get('customer')).toBe('cus_sme_portal');
    expect(calls[0].body.get('return_url')).toBe(`https://services.solstone.app${PATH}`);
  });
});

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
