import { createExecutionContext, env as workerEnv, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { renderLegalNotice, runRenewalReminders } from '../src/renewal-notices.js';
import {
  TEST_CSRF,
  installConsoleSpy,
  installStripeFetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedSession,
  signStripeWebhook,
} from './helpers.js';

const DAY = 86400;

describe('billing riders', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('the written confirmation goes once per subscription', () => {
    it('reaches an owner who subscribes again, and still goes only once for each subscription', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ email: 'resubscriber@example.com', testEnv });
      const firstStart = 1_760_000_000;
      const secondStart = firstStart + 100 * DAY;
      // The first subscription's confirmation, recorded the way it was before rows named their subscription.
      await workerEnv.DB
        .prepare(`INSERT INTO renewal_notices (account_id, kind, service, renewal_at, content_key, subject, body, created_at)
                  VALUES (?, 'ack', 'spl_hosted', 0, '', 's', 'b', ?)`)
        .bind(account.accountId, (firstStart + 60) * 1000)
        .run();
      installStripeFetchMock({
        'GET api.stripe.com/v1/subscriptions/sub_first': async () => stripeJson(subscription('sub_first', firstStart)),
        'GET api.stripe.com/v1/subscriptions/sub_second': async () => stripeJson(subscription('sub_second', secondStart)),
      });

      // The subscription the legacy row confirmed is not confirmed again.
      await postWebhook(testEnv, checkoutCompleted(account.accountId, 'sub_first'));
      expect(testEnv.EMAIL.sent).toHaveLength(0);

      await postWebhook(testEnv, checkoutCompleted(account.accountId, 'sub_second'));
      await postWebhook(testEnv, checkoutCompleted(account.accountId, 'sub_second'));
      expect(testEnv.EMAIL.sent).toHaveLength(1);
      expect(testEnv.EMAIL.sent[0].to).toBe('resubscriber@example.com');
      const rows = await workerEnv.DB
        .prepare("SELECT content_key FROM renewal_notices WHERE account_id = ? AND kind = 'ack' ORDER BY created_at")
        .bind(account.accountId)
        .all();
      expect(rows.results.map((row) => row.content_key)).toEqual(['', 'sub_second']);
    });

    it('carries the withdrawal paragraph only while the door is on, and changes nothing else', () => {
      const base = { kind: 'ack', service: 'spl_hosted', interval: 'year', unitAmount: 2000 };
      const off = renderLegalNotice(base);
      const purchasedAt = 1_760_000_000;
      const on = renderLegalNotice({ ...base, withdrawal: { purchasedAt, until: purchasedAt + 14 * DAY } });
      expect(off.text).not.toContain('withdraw');
      expect(on.text).toContain('you can withdraw within 14 days, for a full refund.');
      expect(on.text).toContain('until 2025-10-23');
      expect(on.text).toContain('bought on 2025-10-09');
      // Removing the one inserted paragraph gives back the locked text exactly.
      const paragraphs = on.text.split('\n\n');
      const inserted = paragraphs.findIndex((p) => p.startsWith('you can withdraw within 14 days'));
      paragraphs.splice(inserted, 1);
      expect(paragraphs.join('\n\n')).toBe(off.text);
      expect(on.html).toContain('<strong>you can withdraw within 14 days, for a full refund.</strong>');
      expect(on.html).not.toContain('](');
    });
  });

  describe('the renewal reminder', () => {
    it('is not sent to an owner whose cancel is pending', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ email: 'stopping@example.com', testEnv });
      const nowSec = 1_790_000_000;
      const periodEnd = nowSec + 30 * DAY;
      await seedEntitlement({ accountId: account.accountId, sourceRef: 'sub_stop', currentPeriodEnd: periodEnd, cancelAtPeriodEnd: true });
      const logs = installConsoleSpy();
      const renewing = { ...subscription('sub_stop', periodEnd - 365 * DAY), current_period_end: periodEnd };
      installStripeFetchMock({
        'GET api.stripe.com/v1/subscriptions/sub_stop': async () => stripeJson({ ...renewing, cancel_at_period_end: true, cancel_at: periodEnd }),
      });
      await runRenewalReminders(testEnv, nowSec * 1000);
      expect(testEnv.EMAIL.sent).toHaveLength(0);
      expect(JSON.stringify(logs.calls)).toContain('cancel_pending');

      // The same subscription, set to renew, gets its notice.
      installStripeFetchMock({ 'GET api.stripe.com/v1/subscriptions/sub_stop': async () => stripeJson(renewing) });
      await runRenewalReminders(testEnv, nowSec * 1000);
      expect(testEnv.EMAIL.sent).toHaveLength(1);
    });
  });

  describe('the manage-billing handlers', () => {
    it.each([
      ['/billing/portal', '/private-network'],
      ['/services/backup/portal', '/services/backup'],
      ['/services/solstone-me/portal', '/services/solstone-me'],
    ])('%s returns to its page with an error when Stripe refuses, never a 500', async (action, page) => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ email: 'portal-error@example.com', testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      await workerEnv.DB
        .prepare('INSERT INTO stripe_customers (account_id, stripe_customer_id, created_at) VALUES (?, ?, ?)')
        .bind(account.accountId, 'cus_portal', 1_000)
        .run();
      installStripeFetchMock({
        'POST api.stripe.com/v1/billing_portal/sessions': async () => stripeJson({ error: { type: 'api_error' } }, 500),
      });
      const response = await worker.fetch(new Request(`https://services.solstone.app${action}`, {
        method: 'POST',
        headers: { Origin: 'https://services.solstone.app', 'Content-Type': 'application/x-www-form-urlencoded', Cookie: session.cookie },
        body: new URLSearchParams({ csrf: TEST_CSRF }),
      }), testEnv);
      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe(`${page}?billing=error`);
    });
  });

  describe('migration 0042', () => {
    it('lets an ack row name its subscription, and nothing else', async () => {
      const account = await seedAccount({ email: 'migration-0042@example.com' });
      const insert = (kind, service, contentKey) => workerEnv.DB
        .prepare(`INSERT INTO renewal_notices (account_id, kind, service, renewal_at, content_key, subject, body, created_at)
                  VALUES (?, ?, ?, 0, ?, 's', 'b', 1)`)
        .bind(account.accountId, kind, service, contentKey)
        .run();
      await insert('ack', 'spl_hosted', '');
      await insert('ack', 'spl_hosted', 'sub_abc');
      await expect(insert('ack', 'spb_hosted', 'sub_')).rejects.toThrow();
      await expect(insert('ack', 'spb_hosted', 'cus_abc')).rejects.toThrow();
      await expect(insert('oneoff', '', 'sub_abc')).rejects.toThrow();
    });
  });
});

function subscription(id, start) {
  return {
    id,
    object: 'subscription',
    status: 'active',
    customer: 'cus_rider',
    start_date: start,
    created: start,
    current_period_end: start + 365 * DAY,
    cancel_at_period_end: false,
    cancel_at: null,
    metadata: { service: 'spl' },
    items: { data: [{ quantity: 1, price: { unit_amount: 2000, currency: 'usd', recurring: { interval: 'year' } } }] },
  };
}

function checkoutCompleted(accountId, subscriptionId) {
  return JSON.stringify({
    id: `evt_${subscriptionId}`,
    type: 'checkout.session.completed',
    data: { object: { id: `cs_${subscriptionId}`, client_reference_id: accountId, customer: 'cus_rider', subscription: subscriptionId } },
  });
}

async function postWebhook(testEnv, rawBody) {
  const signature = await signStripeWebhook(rawBody, testEnv.STRIPE_WEBHOOK_SECRET);
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request('https://services.solstone.app/stripe/webhook', {
    method: 'POST',
    headers: { 'Stripe-Signature': signature },
    body: rawBody,
  }), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  expect(response.status).toBe(200);
  return response;
}

function stripeJson(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
