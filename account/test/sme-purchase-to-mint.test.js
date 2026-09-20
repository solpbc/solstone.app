import { env as workerEnv } from 'cloudflare:test';
import { exportJWK, generateKeyPair } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  TEST_CSRF,
  fetchWithCtx,
  installStripeFetchMock,
  makeTestEnv,
  resetDb,
  rowCount,
  seedAccount,
  seedEntitlement,
  seedScoutApplication,
  seedSession,
  seedSplBinding,
  signStripeWebhook,
} from './helpers.js';
import { generateReachKeyPair, mintHomeReachAssertion } from './reach-helper.js';

const NONCE = '7'.repeat(52);
const DAY = 86400;

// The lane's completion claim, walked through the real worker end to end: an owner
// could buy this, and an account that has not could not mint.
describe('the agent connector: consent, purchase, and the mint', () => {
  beforeEach(resetDb);

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('refuses until the owner has both consented and paid, then mints, and a lapse refuses again without losing the address', async () => {
    const env = makeTestEnv();
    const account = await seedAccount({ email: 'buyer@example.com', testEnv: env });
    const session = await seedSession(account.accountId, { testEnv: env });
    const home = await journalIdentity();

    // Nothing yet: the journal has never been through the owner's consent.
    await expectMint(home, env, 401, 'invalid_token');

    // The owner consents in the browser. They have not subscribed.
    const consent = await postForm('/enable/sme/confirm', env, session.cookie, {
      csrf: TEST_CSRF, nonce: NONCE, action: 'allow', instance: home.instanceId, data_ack: 'yes',
    });
    expect(consent.status).toBe(200);
    expect(await consent.text()).toContain('a subscription is needed');
    await expectMint(home, env, 402, 'needs_subscription');
    expect(await rowCount('mcp_bridge_hostname_ledger')).toBe(0);

    // The owner buys it. Checkout is tagged for the connector, and the webhook, not the
    // redirect, is what grants it.
    const { calls } = installStripeFetchMock({
      'POST api.stripe.com/v1/checkout/sessions': async () => stripeJson({ id: 'cs_sme', url: 'https://checkout.stripe.test/sme' }),
      'GET api.stripe.com/v1/subscriptions/sub_sme': async () => stripeJson({
        id: 'sub_sme',
        status: 'active',
        customer: 'cus_sme',
        current_period_end: Math.floor(Date.now() / 1000) + 365 * DAY,
        metadata: { service: 'sme', account_id: account.accountId },
      }),
    });
    const checkout = await postForm('/services/sme/checkout', env, session.cookie, { csrf: TEST_CSRF, plan: 'annual', data_ack: 'yes' });
    expect(checkout.status).toBe(303);
    expect(checkout.headers.get('Location')).toBe('https://checkout.stripe.test/sme');
    expect(calls[0].body.get('subscription_data[metadata][service]')).toBe('sme');
    await expectMint(home, env, 402, 'needs_subscription');

    await webhook(env, {
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: account.accountId, customer: 'cus_sme', subscription: 'sub_sme' } },
    });
    // The $5 payment granted the connector and nothing else.
    expect(await entitlement(account.accountId, 'sme_hosted')).toMatchObject({ status: 'active', source: 'stripe' });
    expect(await entitlement(account.accountId, 'spl_hosted')).toBeNull();
    expect(await entitlement(account.accountId, 'spb_hosted')).toBeNull();

    const minted = await expectMint(home, env, 200);
    expect(minted.hostname).toMatch(/^[a-z2-7]{8}\.solstone\.me$/);
    expect(await rowCount('mcp_bridge_hostname_ledger')).toBe(1);

    // A payment fails and the grace window runs out.
    await webhook(env, {
      type: 'customer.subscription.updated',
      data: { object: {
        id: 'sub_sme', customer: 'cus_sme', status: 'past_due',
        current_period_end: Math.floor(Date.now() / 1000) - 15 * DAY, metadata: { service: 'sme' },
      } },
    });
    await expectMint(home, env, 402, 'needs_subscription');

    // They pay again: the same address comes back, and no second label was ever spent.
    // In the shape this account's webhook delivers: the subscription lives under `parent`.
    await webhook(env, {
      type: 'invoice.paid',
      data: { object: {
        customer: 'cus_sme',
        parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_sme', metadata: { service: 'sme' } } },
      } },
    });
    const again = await expectMint(home, env, 200);
    expect(again.hostname).toBe(minted.hostname);
    expect(await rowCount('mcp_bridge_hostname_ledger')).toBe(1);
  });

  it('mints for an approved scout with no payment, and no Stripe call is made', async () => {
    const env = makeTestEnv();
    const account = await seedAccount({ email: 'scout@example.com', testEnv: env });
    const session = await seedSession(account.accountId, { testEnv: env });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 1_000 });
    const home = await journalIdentity();
    const { calls } = installStripeFetchMock();

    const consent = await postForm('/enable/sme/confirm', env, session.cookie, {
      csrf: TEST_CSRF, nonce: NONCE, action: 'allow', instance: home.instanceId, data_ack: 'yes',
    });
    expect(consent.status).toBe(200);
    expect(await consent.text()).toContain('sol pbc approved this journal for an address.');
    await expectMint(home, env, 200);
    expect(calls).toHaveLength(0);
  });

  it('gives an owner of the private network nothing: paying for it is neither consent nor entitlement here', async () => {
    const env = makeTestEnv();
    const account = await seedAccount({ email: 'private-network@example.com', testEnv: env });
    const home = await journalIdentity();
    await seedSplBinding({ accountId: account.accountId, instanceId: home.instanceId });
    for (const service of ['spl_hosted', 'spb_hosted', 'spp_hosted']) {
      await seedEntitlement({ accountId: account.accountId, service, status: 'active' });
    }

    await expectMint(home, env, 401, 'invalid_token');
    expect(await rowCount('mcp_bridge_hostname_ledger')).toBe(0);
    expect(await rowCount('mcp_bridge_bindings')).toBe(0);
  });
});

async function journalIdentity() {
  const home = await generateReachKeyPair();
  const { publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
  return {
    instanceId: home.instanceId,
    body: {
      instance_id: home.instanceId,
      assertion: await mintHomeReachAssertion({
        instanceId: home.instanceId,
        privateKey: home.privateKey,
        claims: { scope: 'mcp.bridge.register' },
      }),
      ca_pubkey: home.publicKeyPem,
      cnf_jwk: await exportJWK(publicKey),
    },
  };
}

async function expectMint(home, env, status, error) {
  const { response } = await fetchWithCtx(worker, new Request('https://services.solstone.app/reach/mcp/bridge-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(home.body),
  }), env);
  expect(response.status).toBe(status);
  const body = await response.json();
  if (error) expect(body).toEqual({ error });
  return body;
}

function postForm(path, env, cookie, fields) {
  return worker.fetch(new Request(`https://services.solstone.app${path}`, {
    method: 'POST',
    headers: {
      Origin: 'https://services.solstone.app',
      Cookie: cookie,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(fields),
  }), env);
}

async function webhook(env, event) {
  const raw = JSON.stringify(event);
  const response = await worker.fetch(new Request('https://services.solstone.app/stripe/webhook', {
    method: 'POST',
    headers: { 'Stripe-Signature': await signStripeWebhook(raw, env.STRIPE_WEBHOOK_SECRET) },
    body: raw,
  }), env);
  expect(response.status).toBe(200);
}

function stripeJson(data) {
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function entitlement(accountId, service) {
  return workerEnv.DB
    .prepare('SELECT status, source FROM entitlements WHERE account_id = ? AND service = ?')
    .bind(accountId, service)
    .first();
}
