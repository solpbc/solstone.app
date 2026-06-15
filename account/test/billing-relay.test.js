import { createExecutionContext, env as workerEnv, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  installConsoleSpy,
  installRelayFetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedSplBinding,
  signStripeWebhook,
} from './helpers.js';

const INSTANCE_ID = '11111111-1111-1111-1111-111111111111';

describe('billing webhook relay sync', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('pushes a relay grant after a subscription update webhook', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedStripeCustomer(account.accountId, 'cus_relay');
    await seedSplBinding({ accountId: account.accountId, instanceId: INSTANCE_ID });
    const { calls } = installRelayFetchMock();

    const response = await postWebhook(testEnv, {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_relay',
          customer: 'cus_relay',
          status: 'active',
          current_period_end: 1_900_000_000,
        },
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ instance_id: INSTANCE_ID, entitled_until: 1_900_000_000 });
  });

  it('keeps webhook success when relay grant push fails', async () => {
    const spy = installConsoleSpy();
    try {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      await seedStripeCustomer(account.accountId, 'cus_relay_fail');
      await seedSplBinding({ accountId: account.accountId, instanceId: INSTANCE_ID });
      installRelayFetchMock({
        'POST link.solstone.app/admin/entitlement': async () => new Response(JSON.stringify({ ok: false }), { status: 500 }),
      });

      const response = await postWebhook(testEnv, {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_relay_fail',
            customer: 'cus_relay_fail',
            status: 'active',
            current_period_end: 1_900_000_111,
          },
        },
      });

      expect(response.status).toBe(200);
      spy.assertNoSecrets([testEnv.RELAY_GRANT_SECRET, INSTANCE_ID]);
    } finally {
      spy.restore();
    }
  });
});

async function postWebhook(testEnv, event) {
  const rawBody = JSON.stringify(event);
  const signature = await signStripeWebhook(rawBody, testEnv.STRIPE_WEBHOOK_SECRET);
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request('https://services.solstone.app/stripe/webhook', {
    method: 'POST',
    headers: { 'Stripe-Signature': signature },
    body: rawBody,
  }), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function seedStripeCustomer(accountId, stripeCustomerId) {
  await workerEnv.DB
    .prepare('INSERT INTO stripe_customers (account_id, stripe_customer_id, created_at) VALUES (?, ?, ?)')
    .bind(accountId, stripeCustomerId, 1_000)
    .run();
}
