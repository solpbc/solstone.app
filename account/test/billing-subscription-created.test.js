import { createExecutionContext, env as workerEnv, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { hashWithPepper } from '../src/crypto.js';
import { claimRenewalNotice, getEntitlement } from '../src/db.js';
import { runRetention } from '../src/retention.js';
import {
  installConsoleSpy,
  installStripeFetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  signStripeWebhook,
} from './helpers.js';

const FROZEN = 1_735_689_600_000;
const HUB_URL = 'https://hub.test/subscription-created';
const HUB_SECRET = 'hub-secret-canary';

function stripeJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installHubAndStripeMock(hubHandler, stripeHandlers = {}) {
  const { fetchMock: stripeFetch } = installStripeFetchMock(stripeHandlers);
  const hubCalls = [];
  const customFetch = vi.fn(async (input, init = {}) => {
    const href = typeof input === 'string' ? input : input.url;
    if (href === HUB_URL) {
      hubCalls.push({ input, init });
      return hubHandler(input, init);
    }
    return stripeFetch(input, init);
  });
  vi.stubGlobal('fetch', customFetch);
  return { hubCalls, customFetch, stripeFetch };
}

async function postWebhook(testEnv, rawBody, ctx = createExecutionContext(), t = Math.floor(Date.now() / 1000)) {
  const signature = await signStripeWebhook(rawBody, testEnv.STRIPE_WEBHOOK_SECRET, t);
  const response = await worker.fetch(new Request('https://services.solstone.app/stripe/webhook', {
    method: 'POST',
    headers: { 'Stripe-Signature': signature },
    body: rawBody,
  }), testEnv, ctx);
  return { response, ctx };
}

async function preSeedAck(accountId, tag) {
  await claimRenewalNotice(workerEnv.DB, {
    accountId,
    kind: 'ack',
    service: `${tag}_hosted`,
    renewalAt: 0,
    contentKey: '',
    subject: 'seeded ack',
    body: 'seeded ack body',
    nowMs: FROZEN,
  });
}

describe('subscription.created hub signal', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('1. spl, spb, and sme grant active stripe entitlement and schedule one identity-free POST without canaries', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(FROZEN);
    const consoleSpy = installConsoleSpy();

    for (const tag of ['spl', 'spb', 'sme']) {
      const sessionId = `cs_${tag}_long_unique_session_id_1122334455`;
      const eventId = `evt_${tag}_long_unique_event_id_6677889900`;
      const customerId = `cus_${tag}_long_unique_customer_id_aabbccddeeff`;
      const subscriptionId = `sub_${tag}_long_unique_sub_id_0011223344`;
      const email = `${tag}-owner-unique-canary@example.com`;
      const sentinel = `sentinel_${tag}_metadata_field_998877`;

      const testEnv = makeTestEnv({
        HUB_SUBSCRIPTION_CREATED_URL: HUB_URL,
        HUB_WEBHOOK_SECRET: HUB_SECRET,
      });

      const account = await seedAccount({ email, testEnv, nowMs: FROZEN });
      await preSeedAck(account.accountId, tag);

      const { hubCalls } = installHubAndStripeMock(
        async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
        {
          [`GET api.stripe.com/v1/subscriptions/${subscriptionId}`]: async () => stripeJson({
            id: subscriptionId,
            status: 'active',
            current_period_end: Math.floor(FROZEN / 1000) + 365 * 86400,
            customer: customerId,
            metadata: { service: tag, sentinel },
          }),
        }
      );

      const raw = JSON.stringify({
        id: eventId,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: sessionId,
            client_reference_id: account.accountId,
            customer: customerId,
            subscription: subscriptionId,
          },
        },
      });

      const { response, ctx } = await postWebhook(testEnv, raw);
      expect(response.status).toBe(200);
      await waitOnExecutionContext(ctx);

      const entitlement = await getEntitlement(workerEnv.DB, {
        accountId: account.accountId,
        service: `${tag}_hosted`,
      });
      expect(entitlement).toMatchObject({
        status: 'active',
        source: 'stripe',
        source_ref: subscriptionId,
      });

      expect(hubCalls).toHaveLength(1);
      const call = hubCalls[0];
      expect(call.init.method).toBe('POST');
      expect(call.init.redirect).toBe('manual');
      expect(call.init.headers).toEqual({
        'Content-Type': 'application/json',
        'X-Hub-Secret': HUB_SECRET,
      });

      const body = JSON.parse(call.init.body);
      expect(body).toEqual({
        office: 'cxo',
        type: 'subscription.created',
        service: tag,
        ts: new Date(FROZEN).toISOString(),
      });
      expect(Object.keys(body).sort()).toEqual(['office', 'service', 'ts', 'type']);

      const claimKey = await hashWithPepper(`subscription-created:${sessionId}`, testEnv);
      const claimRow = await workerEnv.DB
        .prepare('SELECT claim_key, created_at FROM subscription_created_claims WHERE claim_key = ?')
        .bind(claimKey)
        .first();
      expect(claimRow).toMatchObject({ claim_key: claimKey, created_at: FROZEN });

      const canaries = [
        sessionId,
        eventId,
        account.accountId,
        customerId,
        subscriptionId,
        email,
        sentinel,
        claimKey,
      ];
      consoleSpy.assertNoSecrets(canaries);

      const rawBodyText = call.init.body;
      for (const canary of canaries) {
        expect(rawBodyText).not.toContain(canary);
      }
    }
  });

  it('2. two overlapping deliveries with same checkout id create one claim and schedule one Hub POST', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(FROZEN);
    const testEnv = makeTestEnv({
      HUB_SUBSCRIPTION_CREATED_URL: HUB_URL,
      HUB_WEBHOOK_SECRET: HUB_SECRET,
    });

    const account = await seedAccount({ email: 'overlap-owner@example.com', testEnv, nowMs: FROZEN });
    await preSeedAck(account.accountId, 'spl');

    const sessionId = 'cs_overlap_shared_session_id';
    const subId = 'sub_overlap_test';
    const customerId = 'cus_overlap_test';

    let releaseGate;
    const gatePromise = new Promise((resolve) => { releaseGate = resolve; });
    let insideCount = 0;

    const { hubCalls } = installHubAndStripeMock(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      {
        [`GET api.stripe.com/v1/subscriptions/${subId}`]: async () => {
          insideCount++;
          if (insideCount === 2) {
            releaseGate();
          }
          await gatePromise;
          return stripeJson({
            id: subId,
            status: 'active',
            current_period_end: Math.floor(FROZEN / 1000) + 365 * 86400,
            customer: customerId,
            metadata: { service: 'spl' },
          });
        },
      }
    );

    const payload1 = JSON.stringify({
      id: 'evt_overlap_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId,
          client_reference_id: account.accountId,
          customer: customerId,
          subscription: subId,
        },
      },
    });

    const payload2 = JSON.stringify({
      id: 'evt_overlap_2',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId,
          client_reference_id: account.accountId,
          customer: customerId,
          subscription: subId,
        },
      },
    });

    const [res1, res2] = await Promise.all([
      postWebhook(testEnv, payload1),
      postWebhook(testEnv, payload2),
    ]);

    expect(res1.response.status).toBe(200);
    expect(res2.response.status).toBe(200);

    await Promise.all([
      waitOnExecutionContext(res1.ctx),
      waitOnExecutionContext(res2.ctx),
    ]);

    const claims = await workerEnv.DB.prepare('SELECT * FROM subscription_created_claims').all();
    expect(claims.results).toHaveLength(1);
    expect(hubCalls).toHaveLength(1);

    // Sequential replay adds neither
    const res3 = await postWebhook(testEnv, payload1);
    expect(res3.response.status).toBe(200);
    await waitOnExecutionContext(res3.ctx);

    const claimsAfter = await workerEnv.DB.prepare('SELECT * FROM subscription_created_claims').all();
    expect(claimsAfter.results).toHaveLength(1);
    expect(hubCalls).toHaveLength(1);
  });

  it('3. two different checkout session ids for same service create two rows, two posts, and two digests', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(FROZEN);
    const testEnv = makeTestEnv({
      HUB_SUBSCRIPTION_CREATED_URL: HUB_URL,
      HUB_WEBHOOK_SECRET: HUB_SECRET,
    });

    const account = await seedAccount({ email: 'two-checkouts@example.com', testEnv, nowMs: FROZEN });
    await preSeedAck(account.accountId, 'spl');

    const session1 = 'cs_session_alpha_111111';
    const session2 = 'cs_session_beta_222222';
    const event1 = 'evt_alpha_111111';
    const event2 = 'evt_beta_222222';

    const { hubCalls } = installHubAndStripeMock(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      {
        'GET api.stripe.com/v1/subscriptions/sub_alpha': async () => stripeJson({
          id: 'sub_alpha',
          status: 'active',
          current_period_end: Math.floor(FROZEN / 1000) + 365 * 86400,
          customer: 'cus_alpha',
          metadata: { service: 'spl' },
        }),
        'GET api.stripe.com/v1/subscriptions/sub_beta': async () => stripeJson({
          id: 'sub_beta',
          status: 'active',
          current_period_end: Math.floor(FROZEN / 1000) + 365 * 86400,
          customer: 'cus_beta',
          metadata: { service: 'spl' },
        }),
      }
    );

    const post1 = await postWebhook(testEnv, JSON.stringify({
      id: event1,
      type: 'checkout.session.completed',
      data: { object: { id: session1, client_reference_id: account.accountId, customer: 'cus_alpha', subscription: 'sub_alpha' } },
    }));
    await waitOnExecutionContext(post1.ctx);

    const post2 = await postWebhook(testEnv, JSON.stringify({
      id: event2,
      type: 'checkout.session.completed',
      data: { object: { id: session2, client_reference_id: account.accountId, customer: 'cus_beta', subscription: 'sub_beta' } },
    }));
    await waitOnExecutionContext(post2.ctx);

    expect(hubCalls).toHaveLength(2);
    const claims = await workerEnv.DB.prepare('SELECT claim_key, created_at FROM subscription_created_claims ORDER BY claim_key').all();
    expect(claims.results).toHaveLength(2);

    const [c1, c2] = claims.results;
    expect(c1.claim_key).not.toEqual(c2.claim_key);
    for (const raw of [session1, session2, event1, event2]) {
      expect(c1.claim_key).not.toContain(raw);
      expect(c2.claim_key).not.toContain(raw);
    }
  });

  it('4. runRetention leaves rows unchanged; table info and column order are exact', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(FROZEN);
    const testEnv = makeTestEnv({
      HUB_SUBSCRIPTION_CREATED_URL: HUB_URL,
      HUB_WEBHOOK_SECRET: HUB_SECRET,
    });

    const account = await seedAccount({ email: 'retention-claims@example.com', testEnv, nowMs: FROZEN });
    await preSeedAck(account.accountId, 'spl');

    const sessionId = 'cs_retention_check';
    const { hubCalls } = installHubAndStripeMock(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      {
        'GET api.stripe.com/v1/subscriptions/sub_ret': async () => stripeJson({
          id: 'sub_ret',
          status: 'active',
          current_period_end: Math.floor(FROZEN / 1000) + 365 * 86400,
          customer: 'cus_ret',
          metadata: { service: 'spl' },
        }),
      }
    );

    const res = await postWebhook(testEnv, JSON.stringify({
      id: 'evt_ret',
      type: 'checkout.session.completed',
      data: { object: { id: sessionId, client_reference_id: account.accountId, customer: 'cus_ret', subscription: 'sub_ret' } },
    }));
    await waitOnExecutionContext(res.ctx);
    expect(hubCalls).toHaveLength(1);

    await runRetention(testEnv, FROZEN + 31 * 24 * 60 * 60 * 1000);

    const rows = await workerEnv.DB.prepare('SELECT * FROM subscription_created_claims').all();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0].created_at).toBe(FROZEN);
    expect(Object.keys(rows.results[0])).toEqual(['claim_key', 'created_at']);

    const { results: tableInfo } = await workerEnv.DB.prepare('PRAGMA table_info(subscription_created_claims)').all();
    expect(tableInfo.map((col) => col.name)).toEqual(['claim_key', 'created_at']);

    // Replay past retention cutoff
    const laterTime = FROZEN + 40 * 24 * 60 * 60 * 1000;
    vi.spyOn(Date, 'now').mockReturnValue(laterTime);
    const replay = await postWebhook(testEnv, JSON.stringify({
      id: 'evt_ret_replay',
      type: 'checkout.session.completed',
      data: { object: { id: sessionId, client_reference_id: account.accountId, customer: 'cus_ret', subscription: 'sub_ret' } },
    }), undefined, Math.floor(laterTime / 1000));
    await waitOnExecutionContext(replay.ctx);

    expect(hubCalls).toHaveLength(1);
    const rowsAfter = await workerEnv.DB.prepare('SELECT * FROM subscription_created_claims').all();
    expect(rowsAfter.results).toHaveLength(1);
    expect(rowsAfter.results[0].created_at).toBe(FROZEN);
  });

  it('5. unknown service, spp, post-reconcile deletion, or unknown client_reference_id omit claim and Hub', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(FROZEN);
    const testEnv = makeTestEnv({
      HUB_SUBSCRIPTION_CREATED_URL: HUB_URL,
      HUB_WEBHOOK_SECRET: HUB_SECRET,
    });

    const account = await seedAccount({ email: 'neg-cases@example.com', testEnv, nowMs: FROZEN });
    const { hubCalls } = installHubAndStripeMock(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      {
        'GET api.stripe.com/v1/subscriptions/sub_unknown': async () => stripeJson({
          id: 'sub_unknown',
          status: 'active',
          current_period_end: Math.floor(FROZEN / 1000) + 365 * 86400,
          customer: 'cus_neg',
          metadata: { service: 'unknown_tag' },
        }),
        'GET api.stripe.com/v1/subscriptions/sub_missing': async () => stripeJson({
          id: 'sub_missing',
          status: 'active',
          current_period_end: Math.floor(FROZEN / 1000) + 365 * 86400,
          customer: 'cus_neg',
          metadata: {},
        }),
        'GET api.stripe.com/v1/subscriptions/sub_spp': async () => stripeJson({
          id: 'sub_spp',
          status: 'active',
          current_period_end: Math.floor(FROZEN / 1000) + 365 * 86400,
          customer: 'cus_neg',
          metadata: { service: 'spp' },
        }),
        'GET api.stripe.com/v1/subscriptions/sub_deletion': async () => {
          await workerEnv.DB.prepare(
            `INSERT INTO account_deletions (
               operation_id, account_id, phase, requested_at, cancellation_deadline_at, status_token_hash
             ) VALUES ('op_del', ?, 'frozen', ?, ?, 'token_hash')`
          ).bind(account.accountId, FROZEN, FROZEN + 86400).run();

          return stripeJson({
            id: 'sub_deletion',
            status: 'active',
            current_period_end: Math.floor(FROZEN / 1000) + 365 * 86400,
            customer: 'cus_neg',
            metadata: { service: 'spl' },
          });
        },
      }
    );

    // Unknown service
    const r1 = await postWebhook(testEnv, JSON.stringify({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', client_reference_id: account.accountId, customer: 'cus_neg', subscription: 'sub_unknown' } },
    }));
    await waitOnExecutionContext(r1.ctx);

    // Missing service
    const r2 = await postWebhook(testEnv, JSON.stringify({
      id: 'evt_2',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_2', client_reference_id: account.accountId, customer: 'cus_neg', subscription: 'sub_missing' } },
    }));
    await waitOnExecutionContext(r2.ctx);

    // SPP service
    const r3 = await postWebhook(testEnv, JSON.stringify({
      id: 'evt_3',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_3', client_reference_id: account.accountId, customer: 'cus_neg', subscription: 'sub_spp' } },
    }));
    await waitOnExecutionContext(r3.ctx);

    // Post-reconcile deletion
    const r4 = await postWebhook(testEnv, JSON.stringify({
      id: 'evt_4',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_4', client_reference_id: account.accountId, customer: 'cus_neg', subscription: 'sub_deletion' } },
    }));
    await waitOnExecutionContext(r4.ctx);

    // Unknown client_reference_id
    const r5 = await postWebhook(testEnv, JSON.stringify({
      id: 'evt_5',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_5', client_reference_id: 'non-existent-account-id', customer: 'cus_neg', subscription: 'sub_unknown' } },
    }));
    expect(r5.response.status).toBe(200);
    await waitOnExecutionContext(r5.ctx);

    expect(hubCalls).toHaveLength(0);
    const claims = await workerEnv.DB.prepare('SELECT * FROM subscription_created_claims').all();
    expect(claims.results).toHaveLength(0);
  });

  it('6. other Stripe event types do not emit Hub events or claims', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(FROZEN);
    const testEnv = makeTestEnv({
      HUB_SUBSCRIPTION_CREATED_URL: HUB_URL,
      HUB_WEBHOOK_SECRET: HUB_SECRET,
    });

    const account = await seedAccount({ email: 'other-events@example.com', testEnv, nowMs: FROZEN });
    await workerEnv.DB.prepare('INSERT INTO stripe_customers (account_id, stripe_customer_id, created_at) VALUES (?, ?, ?)')
      .bind(account.accountId, 'cus_other_events', FROZEN).run();

    const { hubCalls } = installHubAndStripeMock(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      {
        'GET api.stripe.com/v1/subscriptions/sub_other': async () => stripeJson({
          id: 'sub_other',
          status: 'active',
          current_period_end: Math.floor(FROZEN / 1000) + 365 * 86400,
          customer: 'cus_other_events',
          metadata: { service: 'spl' },
        }),
      }
    );

    const otherEvents = [
      {
        id: 'evt_paid_legacy',
        type: 'invoice.paid',
        data: { object: { customer: 'cus_other_events', subscription: 'sub_other' } },
      },
      {
        id: 'evt_paid_dahlia',
        type: 'invoice.paid',
        data: { object: { customer: 'cus_other_events', parent: { subscription_details: { metadata: { service: 'spl' } } } } },
      },
      {
        id: 'evt_sub_updated',
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_other', customer: 'cus_other_events', status: 'active', metadata: { service: 'spl' } } },
      },
      {
        id: 'evt_sub_deleted',
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_other', customer: 'cus_other_events', status: 'canceled', metadata: { service: 'spl' } } },
      },
      {
        id: 'evt_pay_failed',
        type: 'invoice.payment_failed',
        data: { object: { customer: 'cus_other_events', subscription: 'sub_other' } },
      },
    ];

    for (const evt of otherEvents) {
      const res = await postWebhook(testEnv, JSON.stringify(evt));
      expect(res.response.status).toBe(200);
      await waitOnExecutionContext(res.ctx);
    }

    expect(hubCalls).toHaveLength(0);
    const claims = await workerEnv.DB.prepare('SELECT * FROM subscription_created_claims').all();
    expect(claims.results).toHaveLength(0);
  });

  it('7. transport and http failures log exactly one failure line, do not abort signal, keep claim, and do not retry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FROZEN));

    const testCases = [
      {
        name: 'fetch throws network error',
        handler: async () => { throw new Error('transport-boom-network-down'); },
        expectedReason: 'transport',
        forbiddenConsole: 'transport-boom-network-down',
      },
      {
        name: 'response 500',
        handler: async () => new Response('internal-server-error-body', { status: 500 }),
        expectedReason: 'http',
        forbiddenConsole: 'internal-server-error-body',
      },
      {
        name: 'response 302 manual redirect',
        handler: async () => new Response(null, { status: 302, headers: { Location: 'https://other.test' } }),
        expectedReason: 'http',
        forbiddenConsole: 'https://other.test',
      },
    ];

    for (const { name, handler, expectedReason, forbiddenConsole } of testCases) {
      const consoleSpy = installConsoleSpy();
      const testEnv = makeTestEnv({
        HUB_SUBSCRIPTION_CREATED_URL: HUB_URL,
        HUB_WEBHOOK_SECRET: HUB_SECRET,
      });

      const account = await seedAccount({ email: `fail-${expectedReason}@example.com`, testEnv, nowMs: FROZEN });
      await preSeedAck(account.accountId, 'spl');

      const sessionId = `cs_fail_${expectedReason}_${Date.now()}`;
      let signalCaptured;

      installHubAndStripeMock(
        async (input, init) => {
          signalCaptured = init.signal;
          return handler(input, init);
        },
        {
          'GET api.stripe.com/v1/subscriptions/sub_fail': async () => stripeJson({
            id: 'sub_fail',
            status: 'active',
            current_period_end: Math.floor(FROZEN / 1000) + 365 * 86400,
            customer: 'cus_fail',
            metadata: { service: 'spl' },
          }),
        }
      );

      const raw = JSON.stringify({
        id: `evt_fail_${expectedReason}`,
        type: 'checkout.session.completed',
        data: { object: { id: sessionId, client_reference_id: account.accountId, customer: 'cus_fail', subscription: 'sub_fail' } },
      });

      const { response, ctx } = await postWebhook(testEnv, raw);
      expect(response.status).toBe(200);

      await vi.advanceTimersByTimeAsync(10_000);
      await waitOnExecutionContext(ctx);

      expect(signalCaptured.aborted).toBe(false);

      const claim = await workerEnv.DB
        .prepare('SELECT * FROM subscription_created_claims')
        .all();
      expect(claim.results.length).toBeGreaterThan(0);

      const failureLogs = consoleSpy.calls
        .filter(({ level }) => level === 'error')
        .map(({ args }) => {
          try { return JSON.parse(args[0]); } catch { return null; }
        })
        .filter((obj) => obj?.event === 'subscription_created_delivery_failed');

      expect(failureLogs).toHaveLength(1);
      expect(failureLogs[0]).toEqual({
        event: 'subscription_created_delivery_failed',
        reason: expectedReason,
      });

      consoleSpy.assertNoSecrets([forbiddenConsole]);

      consoleSpy.restore();
      await resetDb();
    }
  });

  it('8. AbortError logs deadline after 10s timeout, late resolve does not add log, and replay schedules nothing', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FROZEN));
    const consoleSpy = installConsoleSpy();

    const testEnv = makeTestEnv({
      HUB_SUBSCRIPTION_CREATED_URL: HUB_URL,
      HUB_WEBHOOK_SECRET: HUB_SECRET,
    });

    const account = await seedAccount({ email: 'abort-error@example.com', testEnv, nowMs: FROZEN });
    await preSeedAck(account.accountId, 'spl');

    const sessionId = 'cs_abort_error_session';
    let lateResolve;

    installHubAndStripeMock(
      (input, init) => new Promise((resolve, reject) => {
        lateResolve = resolve;
        init.signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }),
      {
        'GET api.stripe.com/v1/subscriptions/sub_abort': async () => stripeJson({
          id: 'sub_abort',
          status: 'active',
          current_period_end: Math.floor(FROZEN / 1000) + 365 * 86400,
          customer: 'cus_abort',
          metadata: { service: 'spl' },
        }),
      }
    );

    const raw = JSON.stringify({
      id: 'evt_abort',
      type: 'checkout.session.completed',
      data: { object: { id: sessionId, client_reference_id: account.accountId, customer: 'cus_abort', subscription: 'sub_abort' } },
    });

    const { response, ctx } = await postWebhook(testEnv, raw);
    expect(response.status).toBe(200);

    await vi.advanceTimersByTimeAsync(10_000);
    await waitOnExecutionContext(ctx);

    lateResolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const failureLogs = consoleSpy.calls
      .filter(({ level }) => level === 'error')
      .map(({ args }) => {
        try { return JSON.parse(args[0]); } catch { return null; }
      })
      .filter((obj) => obj?.event === 'subscription_created_delivery_failed');

    expect(failureLogs).toHaveLength(1);
    expect(failureLogs[0]).toEqual({
      event: 'subscription_created_delivery_failed',
      reason: 'deadline',
    });

    const claims = await workerEnv.DB.prepare('SELECT * FROM subscription_created_claims').all();
    expect(claims.results).toHaveLength(1);

    // Replay schedules nothing
    const replay = await postWebhook(testEnv, raw);
    expect(replay.response.status).toBe(200);
    await waitOnExecutionContext(replay.ctx);

    const failureLogsAfter = consoleSpy.calls
      .filter(({ level }) => level === 'error')
      .map(({ args }) => {
        try { return JSON.parse(args[0]); } catch { return null; }
      })
      .filter((obj) => obj?.event === 'subscription_created_delivery_failed');

    expect(failureLogsAfter).toHaveLength(1);
  });

  it('9. deadlineFired flag logs deadline even if abort listener resolves 200', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FROZEN));
    const consoleSpy = installConsoleSpy();

    const testEnv = makeTestEnv({
      HUB_SUBSCRIPTION_CREATED_URL: HUB_URL,
      HUB_WEBHOOK_SECRET: HUB_SECRET,
    });

    const account = await seedAccount({ email: 'flag-case@example.com', testEnv, nowMs: FROZEN });
    await preSeedAck(account.accountId, 'spl');

    const sessionId = 'cs_flag_case_session';

    installHubAndStripeMock(
      (input, init) => new Promise((resolve) => {
        init.signal.addEventListener('abort', () => {
          resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
        });
      }),
      {
        'GET api.stripe.com/v1/subscriptions/sub_flag': async () => stripeJson({
          id: 'sub_flag',
          status: 'active',
          current_period_end: Math.floor(FROZEN / 1000) + 365 * 86400,
          customer: 'cus_flag',
          metadata: { service: 'spl' },
        }),
      }
    );

    const raw = JSON.stringify({
      id: 'evt_flag',
      type: 'checkout.session.completed',
      data: { object: { id: sessionId, client_reference_id: account.accountId, customer: 'cus_flag', subscription: 'sub_flag' } },
    });

    const { response, ctx } = await postWebhook(testEnv, raw);
    expect(response.status).toBe(200);

    await vi.advanceTimersByTimeAsync(10_000);
    await waitOnExecutionContext(ctx);

    const failureLogs = consoleSpy.calls
      .filter(({ level }) => level === 'error')
      .map(({ args }) => {
        try { return JSON.parse(args[0]); } catch { return null; }
      })
      .filter((obj) => obj?.event === 'subscription_created_delivery_failed');

    expect(failureLogs).toHaveLength(1);
    expect(failureLogs[0]).toEqual({
      event: 'subscription_created_delivery_failed',
      reason: 'deadline',
    });

    const claims = await workerEnv.DB.prepare('SELECT * FROM subscription_created_claims').all();
    expect(claims.results).toHaveLength(1);
  });

  it('10. omitted or empty HUB_SUBSCRIPTION_CREATED_URL makes no claim, then later configured environment makes one attempt', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(FROZEN);
    const consoleSpy = installConsoleSpy();

    const account = await seedAccount({ email: 'unset-url@example.com', nowMs: FROZEN });
    await preSeedAck(account.accountId, 'spl');

    const sessionId = 'cs_unset_url_session';
    const raw = JSON.stringify({
      id: 'evt_unset',
      type: 'checkout.session.completed',
      data: { object: { id: sessionId, client_reference_id: account.accountId, customer: 'cus_unset', subscription: 'sub_unset' } },
    });

    const { hubCalls } = installHubAndStripeMock(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      {
        'GET api.stripe.com/v1/subscriptions/sub_unset': async () => stripeJson({
          id: 'sub_unset',
          status: 'active',
          current_period_end: Math.floor(FROZEN / 1000) + 365 * 86400,
          customer: 'cus_unset',
          metadata: { service: 'spl' },
        }),
      }
    );

    // Omitted URL
    const envOmitted = makeTestEnv();
    const r1 = await postWebhook(envOmitted, raw);
    expect(r1.response.status).toBe(200);
    await waitOnExecutionContext(r1.ctx);

    // Empty URL
    const envEmpty = makeTestEnv({ HUB_SUBSCRIPTION_CREATED_URL: '' });
    const r2 = await postWebhook(envEmpty, raw);
    expect(r2.response.status).toBe(200);
    await waitOnExecutionContext(r2.ctx);

    expect(hubCalls).toHaveLength(0);
    const claims = await workerEnv.DB.prepare('SELECT * FROM subscription_created_claims').all();
    expect(claims.results).toHaveLength(0);

    const failureLogs = consoleSpy.calls
      .filter(({ level }) => level === 'error')
      .map(({ args }) => {
        try { return JSON.parse(args[0]); } catch { return null; }
      })
      .filter((obj) => obj?.event === 'subscription_created_delivery_failed');
    expect(failureLogs).toHaveLength(0);

    // Configured environment on same DB makes one attempt
    const envConfigured = makeTestEnv({
      HUB_SUBSCRIPTION_CREATED_URL: HUB_URL,
      HUB_WEBHOOK_SECRET: HUB_SECRET,
    });
    const r3 = await postWebhook(envConfigured, raw);
    expect(r3.response.status).toBe(200);
    await waitOnExecutionContext(r3.ctx);

    expect(hubCalls).toHaveLength(1);
    const claimsAfter = await workerEnv.DB.prepare('SELECT * FROM subscription_created_claims').all();
    expect(claimsAfter.results).toHaveLength(1);
  });

  it('11. waitUntil synchronous throw logs schedule once, keeps claim, and replay schedules nothing', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(FROZEN);
    const consoleSpy = installConsoleSpy();

    const testEnv = makeTestEnv({
      HUB_SUBSCRIPTION_CREATED_URL: HUB_URL,
      HUB_WEBHOOK_SECRET: HUB_SECRET,
    });

    const account = await seedAccount({ email: 'schedule-boom@example.com', testEnv, nowMs: FROZEN });
    await preSeedAck(account.accountId, 'spb');

    const sessionId = 'cs_schedule_boom';
    const { hubCalls } = installHubAndStripeMock(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      {
        'GET api.stripe.com/v1/subscriptions/sub_sched': async () => stripeJson({
          id: 'sub_sched',
          status: 'active',
          current_period_end: Math.floor(FROZEN / 1000) + 365 * 86400,
          customer: 'cus_sched',
          metadata: { service: 'spb' },
        }),
      }
    );

    const raw = JSON.stringify({
      id: 'evt_sched',
      type: 'checkout.session.completed',
      data: { object: { id: sessionId, client_reference_id: account.accountId, customer: 'cus_sched', subscription: 'sub_sched' } },
    });

    const throwingCtx = {
      waitUntil() {
        throw new Error('schedule-boom');
      },
      passThroughOnException() {},
    };

    const signature = await signStripeWebhook(raw, testEnv.STRIPE_WEBHOOK_SECRET, Math.floor(FROZEN / 1000));
    const response = await worker.fetch(new Request('https://services.solstone.app/stripe/webhook', {
      method: 'POST',
      headers: { 'Stripe-Signature': signature },
      body: raw,
    }), testEnv, throwingCtx);

    expect(response.status).toBe(200);
    expect(hubCalls).toHaveLength(0);

    const claims = await workerEnv.DB.prepare('SELECT * FROM subscription_created_claims').all();
    expect(claims.results).toHaveLength(1);

    const failureLogs = consoleSpy.calls
      .filter(({ level }) => level === 'error')
      .map(({ args }) => {
        try { return JSON.parse(args[0]); } catch { return null; }
      })
      .filter((obj) => obj?.event === 'subscription_created_delivery_failed');

    expect(failureLogs).toHaveLength(1);
    expect(failureLogs[0]).toEqual({
      event: 'subscription_created_delivery_failed',
      reason: 'schedule',
    });

    consoleSpy.assertNoSecrets(['schedule-boom']);

    // Replay with normal context schedules nothing
    const normalPost = await postWebhook(testEnv, raw);
    expect(normalPost.response.status).toBe(200);
    await waitOnExecutionContext(normalPost.ctx);

    expect(hubCalls).toHaveLength(0);
  });

  it('12. checkout with omitted data.object.id grants entitlement but skips claim and Hub', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(FROZEN);
    const testEnv = makeTestEnv({
      HUB_SUBSCRIPTION_CREATED_URL: HUB_URL,
      HUB_WEBHOOK_SECRET: HUB_SECRET,
    });

    const account = await seedAccount({ email: 'no-session-id@example.com', testEnv, nowMs: FROZEN });
    const { hubCalls } = installHubAndStripeMock(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      {
        'GET api.stripe.com/v1/subscriptions/sub_noid': async () => stripeJson({
          id: 'sub_noid',
          status: 'active',
          current_period_end: Math.floor(FROZEN / 1000) + 365 * 86400,
          customer: 'cus_noid',
          metadata: { service: 'spl' },
        }),
      }
    );

    const raw = JSON.stringify({
      id: 'evt_noid',
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: account.accountId,
          customer: 'cus_noid',
          subscription: 'sub_noid',
        },
      },
    });

    const res = await postWebhook(testEnv, raw);
    expect(res.response.status).toBe(200);
    await waitOnExecutionContext(res.ctx);

    const entitlement = await getEntitlement(workerEnv.DB, {
      accountId: account.accountId,
      service: 'spl_hosted',
    });
    expect(entitlement).toMatchObject({ status: 'active', source: 'stripe' });

    expect(hubCalls).toHaveLength(0);
    const claims = await workerEnv.DB.prepare('SELECT * FROM subscription_created_claims').all();
    expect(claims.results).toHaveLength(0);
  });

  it('13. claim statement error cases, rollback, duplicate detection, and restore replay', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(FROZEN);

    const testEnv = makeTestEnv({
      HUB_SUBSCRIPTION_CREATED_URL: HUB_URL,
      HUB_WEBHOOK_SECRET: HUB_SECRET,
    });

    const origPrepare = workerEnv.DB.prepare.bind(workerEnv.DB);

    // Case 13a: .all() throws -> 200, no row from this attempt, no Hub, one claim line, error message absent. Restore & replay succeeds.
    {
      const account = await seedAccount({ email: 'db-prep-13a@example.com', testEnv, nowMs: FROZEN });
      await preSeedAck(account.accountId, 'spl');

      const sessionId = 'cs_db_prep_13a';
      const subId = 'sub_db_prep_13a';
      const customerId = 'cus_db_prep_13a';
      const raw = JSON.stringify({
        id: 'evt_db_prep_13a',
        type: 'checkout.session.completed',
        data: { object: { id: sessionId, client_reference_id: account.accountId, customer: customerId, subscription: subId } },
      });

      const { hubCalls } = installHubAndStripeMock(
        async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
        {
          [`GET api.stripe.com/v1/subscriptions/${subId}`]: async () => stripeJson({
            id: subId,
            status: 'active',
            current_period_end: Math.floor(FROZEN / 1000) + 365 * 86400,
            customer: customerId,
            metadata: { service: 'spl' },
          }),
        }
      );

      const consoleSpy = installConsoleSpy();
      workerEnv.DB.prepare = (sql) => {
        if (sql.includes('INSERT INTO subscription_created_claims')) {
          return {
            bind: () => ({
              all: async () => { throw new Error('claim-boom'); },
            }),
          };
        }
        return origPrepare(sql);
      };

      const res = await postWebhook(testEnv, raw);
      expect(res.response.status).toBe(200);
      await waitOnExecutionContext(res.ctx);

      const claims = await origPrepare('SELECT * FROM subscription_created_claims WHERE claim_key = ?')
        .bind(await hashWithPepper(`subscription-created:${sessionId}`, testEnv))
        .all();
      expect(claims.results).toHaveLength(0);
      expect(hubCalls).toHaveLength(0);

      const failureLogs = consoleSpy.calls
        .filter(({ level }) => level === 'error')
        .map(({ args }) => {
          try { return JSON.parse(args[0]); } catch { return null; }
        })
        .filter((obj) => obj?.event === 'subscription_created_delivery_failed');
      expect(failureLogs).toHaveLength(1);
      expect(failureLogs[0]).toEqual({ event: 'subscription_created_delivery_failed', reason: 'claim' });
      consoleSpy.assertNoSecrets(['claim-boom']);

      // Restore and replay
      workerEnv.DB.prepare = origPrepare;
      const replay = await postWebhook(testEnv, raw);
      expect(replay.response.status).toBe(200);
      await waitOnExecutionContext(replay.ctx);

      expect(hubCalls).toHaveLength(1);
      const claimsAfter = await origPrepare('SELECT * FROM subscription_created_claims WHERE claim_key = ?')
        .bind(await hashWithPepper(`subscription-created:${sessionId}`, testEnv))
        .all();
      expect(claimsAfter.results).toHaveLength(1);

      consoleSpy.restore();
    }

    // Case 13b: Real .all(), then meta.changes overwritten to null -> rolled back, one claim line, no Hub. Restore & replay sends once.
    {
      const account = await seedAccount({ email: 'db-prep-13b@example.com', testEnv, nowMs: FROZEN });
      await preSeedAck(account.accountId, 'spl');

      const sessionId = 'cs_db_prep_13b';
      const subId = 'sub_db_prep_13b';
      const customerId = 'cus_db_prep_13b';
      const raw = JSON.stringify({
        id: 'evt_db_prep_13b',
        type: 'checkout.session.completed',
        data: { object: { id: sessionId, client_reference_id: account.accountId, customer: customerId, subscription: subId } },
      });

      const { hubCalls } = installHubAndStripeMock(
        async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
        {
          [`GET api.stripe.com/v1/subscriptions/${subId}`]: async () => stripeJson({
            id: subId,
            status: 'active',
            current_period_end: Math.floor(FROZEN / 1000) + 365 * 86400,
            customer: customerId,
            metadata: { service: 'spl' },
          }),
        }
      );

      const consoleSpy = installConsoleSpy();
      workerEnv.DB.prepare = (sql) => {
        if (sql.includes('INSERT INTO subscription_created_claims')) {
          const stmt = origPrepare(sql);
          return {
            bind: (...args) => {
              const bound = stmt.bind(...args);
              return {
                all: async () => {
                  const real = await bound.all();
                  return { meta: { ...real.meta, changes: null }, results: real.results };
                },
              };
            },
          };
        }
        return origPrepare(sql);
      };

      const res = await postWebhook(testEnv, raw);
      expect(res.response.status).toBe(200);
      await waitOnExecutionContext(res.ctx);

      const claims = await origPrepare('SELECT * FROM subscription_created_claims WHERE claim_key = ?')
        .bind(await hashWithPepper(`subscription-created:${sessionId}`, testEnv))
        .all();
      expect(claims.results).toHaveLength(0);
      expect(hubCalls).toHaveLength(0);

      const failureLogs = consoleSpy.calls
        .filter(({ level }) => level === 'error')
        .map(({ args }) => {
          try { return JSON.parse(args[0]); } catch { return null; }
        })
        .filter((obj) => obj?.event === 'subscription_created_delivery_failed');
      expect(failureLogs).toHaveLength(1);
      expect(failureLogs[0]).toEqual({ event: 'subscription_created_delivery_failed', reason: 'claim' });

      // Restore and replay sends once
      workerEnv.DB.prepare = origPrepare;
      const replay = await postWebhook(testEnv, raw);
      expect(replay.response.status).toBe(200);
      await waitOnExecutionContext(replay.ctx);

      expect(hubCalls).toHaveLength(1);
      const claimsAfter = await origPrepare('SELECT * FROM subscription_created_claims WHERE claim_key = ?')
        .bind(await hashWithPepper(`subscription-created:${sessionId}`, testEnv))
        .all();
      expect(claimsAfter.results).toHaveLength(1);

      consoleSpy.restore();
    }

    // Case 13c: Pre-seed winner row. Stub .all() to return { meta: { changes: 0 }, results: [{ claim_key: 'other' }] }. Winner remains, no claim log, no Hub.
    {
      const account = await seedAccount({ email: 'db-prep-13c@example.com', testEnv, nowMs: FROZEN });
      await preSeedAck(account.accountId, 'spl');

      const sessionId = 'cs_db_prep_13c';
      const subId = 'sub_db_prep_13c';
      const customerId = 'cus_db_prep_13c';
      const raw = JSON.stringify({
        id: 'evt_db_prep_13c',
        type: 'checkout.session.completed',
        data: { object: { id: sessionId, client_reference_id: account.accountId, customer: customerId, subscription: subId } },
      });

      const { hubCalls } = installHubAndStripeMock(
        async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
        {
          [`GET api.stripe.com/v1/subscriptions/${subId}`]: async () => stripeJson({
            id: subId,
            status: 'active',
            current_period_end: Math.floor(FROZEN / 1000) + 365 * 86400,
            customer: customerId,
            metadata: { service: 'spl' },
          }),
        }
      );

      const consoleSpy = installConsoleSpy();
      const claimKey = await hashWithPepper(`subscription-created:${sessionId}`, testEnv);
      await origPrepare('INSERT INTO subscription_created_claims (claim_key, created_at) VALUES (?, ?)')
        .bind(claimKey, FROZEN).run();

      workerEnv.DB.prepare = (sql) => {
        if (sql.includes('INSERT INTO subscription_created_claims')) {
          return {
            bind: () => ({
              all: async () => ({ meta: { changes: 0 }, results: [{ claim_key: 'other' }] }),
            }),
          };
        }
        return origPrepare(sql);
      };

      const res = await postWebhook(testEnv, raw);
      expect(res.response.status).toBe(200);
      await waitOnExecutionContext(res.ctx);

      const claims = await origPrepare('SELECT * FROM subscription_created_claims WHERE claim_key = ?')
        .bind(claimKey).all();
      expect(claims.results).toHaveLength(1);
      expect(claims.results[0].claim_key).toBe(claimKey);
      expect(hubCalls).toHaveLength(0);

      const failureLogs = consoleSpy.calls
        .filter(({ level }) => level === 'error')
        .map(({ args }) => {
          try { return JSON.parse(args[0]); } catch { return null; }
        })
        .filter((obj) => obj?.event === 'subscription_created_delivery_failed');
      expect(failureLogs).toHaveLength(0);

      workerEnv.DB.prepare = origPrepare;
      consoleSpy.restore();
    }

    // Case 13d: Pre-seed winner. Stub .all() to return { meta: {}, results: [] }. Winner remains, one claim line, no Hub.
    {
      const account = await seedAccount({ email: 'db-prep-13d@example.com', testEnv, nowMs: FROZEN });
      await preSeedAck(account.accountId, 'spl');

      const sessionId = 'cs_db_prep_13d';
      const subId = 'sub_db_prep_13d';
      const customerId = 'cus_db_prep_13d';
      const raw = JSON.stringify({
        id: 'evt_db_prep_13d',
        type: 'checkout.session.completed',
        data: { object: { id: sessionId, client_reference_id: account.accountId, customer: customerId, subscription: subId } },
      });

      const { hubCalls } = installHubAndStripeMock(
        async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
        {
          [`GET api.stripe.com/v1/subscriptions/${subId}`]: async () => stripeJson({
            id: subId,
            status: 'active',
            current_period_end: Math.floor(FROZEN / 1000) + 365 * 86400,
            customer: customerId,
            metadata: { service: 'spl' },
          }),
        }
      );

      const consoleSpy = installConsoleSpy();
      const claimKey = await hashWithPepper(`subscription-created:${sessionId}`, testEnv);
      await origPrepare('INSERT INTO subscription_created_claims (claim_key, created_at) VALUES (?, ?)')
        .bind(claimKey, FROZEN).run();

      workerEnv.DB.prepare = (sql) => {
        if (sql.includes('INSERT INTO subscription_created_claims')) {
          return {
            bind: () => ({
              all: async () => ({ meta: {}, results: [] }),
            }),
          };
        }
        return origPrepare(sql);
      };

      const res = await postWebhook(testEnv, raw);
      expect(res.response.status).toBe(200);
      await waitOnExecutionContext(res.ctx);

      const claims = await origPrepare('SELECT * FROM subscription_created_claims WHERE claim_key = ?')
        .bind(claimKey).all();
      expect(claims.results).toHaveLength(1);
      expect(claims.results[0].claim_key).toBe(claimKey);
      expect(hubCalls).toHaveLength(0);

      const failureLogs = consoleSpy.calls
        .filter(({ level }) => level === 'error')
        .map(({ args }) => {
          try { return JSON.parse(args[0]); } catch { return null; }
        })
        .filter((obj) => obj?.event === 'subscription_created_delivery_failed');
      expect(failureLogs).toHaveLength(1);
      expect(failureLogs[0]).toEqual({ event: 'subscription_created_delivery_failed', reason: 'claim' });

      workerEnv.DB.prepare = origPrepare;
      consoleSpy.restore();
    }

    // Case 13e: Pre-seed winner. Stub .all() to throw. Winner remains, one claim line, no Hub.
    {
      const account = await seedAccount({ email: 'db-prep-13e@example.com', testEnv, nowMs: FROZEN });
      await preSeedAck(account.accountId, 'spl');

      const sessionId = 'cs_db_prep_13e';
      const subId = 'sub_db_prep_13e';
      const customerId = 'cus_db_prep_13e';
      const raw = JSON.stringify({
        id: 'evt_db_prep_13e',
        type: 'checkout.session.completed',
        data: { object: { id: sessionId, client_reference_id: account.accountId, customer: customerId, subscription: subId } },
      });

      const { hubCalls } = installHubAndStripeMock(
        async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
        {
          [`GET api.stripe.com/v1/subscriptions/${subId}`]: async () => stripeJson({
            id: subId,
            status: 'active',
            current_period_end: Math.floor(FROZEN / 1000) + 365 * 86400,
            customer: customerId,
            metadata: { service: 'spl' },
          }),
        }
      );

      const consoleSpy = installConsoleSpy();
      const claimKey = await hashWithPepper(`subscription-created:${sessionId}`, testEnv);
      await origPrepare('INSERT INTO subscription_created_claims (claim_key, created_at) VALUES (?, ?)')
        .bind(claimKey, FROZEN).run();

      workerEnv.DB.prepare = (sql) => {
        if (sql.includes('INSERT INTO subscription_created_claims')) {
          return {
            bind: () => ({
              all: async () => { throw new Error('claim-throw-winner'); },
            }),
          };
        }
        return origPrepare(sql);
      };

      const res = await postWebhook(testEnv, raw);
      expect(res.response.status).toBe(200);
      await waitOnExecutionContext(res.ctx);

      const claims = await origPrepare('SELECT * FROM subscription_created_claims WHERE claim_key = ?')
        .bind(claimKey).all();
      expect(claims.results).toHaveLength(1);
      expect(claims.results[0].claim_key).toBe(claimKey);
      expect(hubCalls).toHaveLength(0);

      const failureLogs = consoleSpy.calls
        .filter(({ level }) => level === 'error')
        .map(({ args }) => {
          try { return JSON.parse(args[0]); } catch { return null; }
        })
        .filter((obj) => obj?.event === 'subscription_created_delivery_failed');
      expect(failureLogs).toHaveLength(1);
      expect(failureLogs[0]).toEqual({ event: 'subscription_created_delivery_failed', reason: 'claim' });

      workerEnv.DB.prepare = origPrepare;
      consoleSpy.restore();
    }
  });

  it('14. entitlement insert failure bubbles up, no claim, no Hub', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(FROZEN);

    const testEnv = makeTestEnv({
      HUB_SUBSCRIPTION_CREATED_URL: HUB_URL,
      HUB_WEBHOOK_SECRET: HUB_SECRET,
    });

    const account = await seedAccount({ email: 'entitlement-boom@example.com', testEnv, nowMs: FROZEN });
    const sessionId = 'cs_entitlement_boom';
    const subId = 'sub_ent_boom';

    const { hubCalls } = installHubAndStripeMock(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      {
        [`GET api.stripe.com/v1/subscriptions/${subId}`]: async () => stripeJson({
          id: subId,
          status: 'active',
          current_period_end: Math.floor(FROZEN / 1000) + 365 * 86400,
          customer: 'cus_ent_boom',
          metadata: { service: 'spl' },
        }),
      }
    );

    const origPrepare = workerEnv.DB.prepare.bind(workerEnv.DB);
    workerEnv.DB.prepare = (sql) => {
      if (sql.includes('INSERT INTO entitlements')) {
        return {
          bind: () => ({
            run: async () => { throw new Error('entitlement-write-failed'); },
          }),
        };
      }
      return origPrepare(sql);
    };

    const raw = JSON.stringify({
      id: 'evt_ent_boom',
      type: 'checkout.session.completed',
      data: { object: { id: sessionId, client_reference_id: account.accountId, customer: 'cus_ent_boom', subscription: subId } },
    });

    try {
      await expect(postWebhook(testEnv, raw)).rejects.toThrow('entitlement-write-failed');

      const claims = await origPrepare('SELECT * FROM subscription_created_claims').all();
      expect(claims.results).toHaveLength(0);
      expect(hubCalls).toHaveLength(0);
    } finally {
      workerEnv.DB.prepare = origPrepare;
    }
  });
});
