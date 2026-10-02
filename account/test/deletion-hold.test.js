import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { createDeletionProof, markDeletionProofVerified, upsertStripeCustomer } from '../src/db.js';
import { runAccountDeletionCoordinator } from '../src/deletion-coordinator.js';
import {
  installStripeFetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedSession,
  seedSplBinding,
} from './helpers.js';

const HOUR = 60 * 60 * 1000;
const INSTANCE = '22222222-2222-4222-8222-222222222222';

describe('the sign-in deletion hold', () => {
  beforeEach(resetDb);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('pauses collection on every live subscription at confirm', async () => {
    const testEnv = makeTestEnv();
    const { accountId, session } = await ownerWithCustomer(testEnv);
    const { calls } = installStripeFetchMock({
      'GET api.stripe.com/v1/subscriptions': async () => stripeJson({
        data: [subscription('sub_live'), subscription('sub_done', { status: 'canceled' })],
      }),
      'POST api.stripe.com/v1/subscriptions/sub_live': async () => stripeJson(subscription('sub_live')),
    });
    await verifiedProof(accountId, session, 'delete');

    const response = await worker.fetch(post('/account/delete/confirm', session), testEnv);

    expect(response.status).toBe(303);
    const pauses = calls.filter((call) => call.method === 'POST');
    expect(pauses).toHaveLength(1);
    expect(pauses[0].url.pathname).toBe('/v1/subscriptions/sub_live');
    expect(pauses[0].body.get('pause_collection[behavior]')).toBe('void');
    expect(calls.find((call) => call.method === 'GET').url.searchParams.get('customer')).toBe('cus_hold');
    await expect(deletionRow()).resolves.toMatchObject({ phase: 'frozen' });
  });

  it('retries a hold that failed at confirm before the deadline', async () => {
    const testEnv = makeTestEnv();
    const { accountId } = await ownerWithCustomer(testEnv);
    const now = Date.now();
    await frozenDeletion(accountId, { requestedAt: now - HOUR, deadline: now + 71 * HOUR, nextAttemptAt: now });
    let attempts = 0;
    const { calls } = installStripeFetchMock({
      'GET api.stripe.com/v1/subscriptions': async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('timeout');
        return stripeJson({ data: [subscription('sub_live')] });
      },
      'POST api.stripe.com/v1/subscriptions/sub_live': async () => stripeJson(subscription('sub_live')),
    });

    await expect(runAccountDeletionCoordinator(testEnv, now)).resolves.toMatchObject({ phase: 'frozen', held: false });
    const retry = await deletionRow();
    expect(retry.next_attempt_at).toBeLessThan(now + 71 * HOUR);

    await expect(runAccountDeletionCoordinator(testEnv, retry.next_attempt_at)).resolves.toMatchObject({ held: true });
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
    await expect(deletionRow()).resolves.toMatchObject({ next_attempt_at: now + 71 * HOUR });
  });

  it('charges a renewal that fell inside the hold at keep, starts its period then, and restores the relay grant', async () => {
    const pushes = [];
    const testEnv = makeTestEnv({ RELAY: grantRecorder(pushes) });
    const { accountId, session } = await ownerWithCustomer(testEnv);
    const now = Date.now();
    const heldAt = now - 30 * HOUR;
    const renewedAt = Math.floor((now - 2 * HOUR) / 1000);
    const restartedEnd = Math.floor(now / 1000) + 30 * 86400;
    await seedSplBinding({ accountId, instanceId: INSTANCE });
    await seedEntitlement({ accountId, currentPeriodEnd: renewedAt, sourceRef: 'sub_live' });
    await frozenDeletion(accountId, { requestedAt: heldAt, deadline: now + 42 * HOUR });
    const { calls } = installStripeFetchMock({
      'GET api.stripe.com/v1/subscriptions': async () => stripeJson({
        data: [subscription('sub_live', { paused: true, periodStart: renewedAt, periodEnd: renewedAt + 30 * 86400 })],
      }),
      'GET api.stripe.com/v1/invoices': async ({ url }) => {
        expect(url.searchParams.get('subscription')).toBe('sub_live');
        expect(url.searchParams.get('status')).toBe('void');
        return stripeJson({ data: [
          { id: 'in_voided', billing_reason: 'subscription_cycle', created: renewedAt },
          { id: 'in_before_hold', billing_reason: 'subscription_cycle', created: Math.floor(heldAt / 1000) - 60 },
        ] });
      },
      'POST api.stripe.com/v1/subscriptions/sub_live': async () => stripeJson(
        subscription('sub_live', { periodStart: Math.floor(now / 1000), periodEnd: restartedEnd })
      ),
    });
    await verifiedProof(accountId, session, 'cancel');

    const response = await worker.fetch(post('/account/delete/cancel', session), testEnv);

    expect(response.status).toBe(303);
    const resume = calls.find((call) => call.method === 'POST');
    expect(resume.body.get('pause_collection')).toBe('');
    expect(resume.body.get('billing_cycle_anchor')).toBe('now');
    expect(resume.body.get('proration_behavior')).toBe('none');
    expect(resume.init.headers['Idempotency-Key']).toBe('deletion-keep-restart-sub_live-in_voided');
    await expect(entitlement(accountId)).resolves.toMatchObject({ status: 'active', current_period_end: restartedEnd });
    expect(pushes.at(-1)).toEqual({ instance_id: INSTANCE, entitled_until: restartedEnd });
    await expect(deletionRow()).resolves.toMatchObject({ phase: 'cancelled', next_attempt_at: null });
  });

  it('resumes without a new charge when no renewal fell inside the hold', async () => {
    const testEnv = makeTestEnv({ RELAY: grantRecorder([]) });
    const { accountId, session } = await ownerWithCustomer(testEnv);
    const now = Date.now();
    const heldAt = now - 2 * HOUR;
    const periodStart = Math.floor((now - 10 * 86400 * 1000) / 1000);
    await frozenDeletion(accountId, { requestedAt: heldAt, deadline: now + 70 * HOUR });
    const { calls } = installStripeFetchMock({
      'GET api.stripe.com/v1/subscriptions': async () => stripeJson({
        data: [subscription('sub_live', { paused: true, periodStart })],
      }),
      'GET api.stripe.com/v1/invoices': async () => stripeJson({ data: [{ id: 'in_other', billing_reason: 'manual' }] }),
      'POST api.stripe.com/v1/subscriptions/sub_live': async () => stripeJson(subscription('sub_live', { periodStart })),
    });
    await verifiedProof(accountId, session, 'cancel');

    expect((await worker.fetch(post('/account/delete/cancel', session), testEnv)).status).toBe(303);

    const resume = calls.find((call) => call.method === 'POST');
    expect(resume.body.get('pause_collection')).toBe('');
    expect(resume.body.has('billing_cycle_anchor')).toBe(false);
    expect(resume.init.headers).not.toHaveProperty('Idempotency-Key');
  });

  it('lets the coordinator finish a keep whose restore failed', async () => {
    const testEnv = makeTestEnv({ RELAY: grantRecorder([]) });
    const { accountId } = await ownerWithCustomer(testEnv);
    const now = Date.now();
    await workerEnv.DB.prepare(
      `INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, cancellation_deadline_at,
         next_attempt_at, status_token_hash, cancelled_at)
       VALUES ('hold', ?, 'cancelled', ?, ?, ?, 'status', ?)`
    ).bind(accountId, now - HOUR, now + 71 * HOUR, now - 60_000, now - 60_000).run();
    const { calls } = installStripeFetchMock({
      'GET api.stripe.com/v1/subscriptions': async () => stripeJson({ data: [subscription('sub_live', { paused: true, periodStart: 1 })] }),
      'GET api.stripe.com/v1/invoices': async () => stripeJson({ data: [] }),
      'POST api.stripe.com/v1/subscriptions/sub_live': async () => stripeJson(subscription('sub_live')),
    });

    await runAccountDeletionCoordinator(testEnv, now);

    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
    await expect(deletionRow()).resolves.toMatchObject({ next_attempt_at: null });
  });

  it('stops offering keep at the deadline, before the coordinator moves the deletion on', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const now = Date.now();
    await frozenDeletion(account.accountId, { requestedAt: now - 73 * HOUR, deadline: now - 1 });
    await verifiedProof(account.accountId, session, 'cancel');

    const page = await (await worker.fetch(get('/account/delete', session), testEnv)).text();
    expect(page).toContain('<h1>deletion in progress</h1>');
    expect(page).not.toContain('send a cancellation code');

    const keep = await worker.fetch(post('/account/delete/cancel', session), testEnv);
    expect(keep.status).toBe(409);
    await expect(deletionRow()).resolves.toMatchObject({ phase: 'frozen' });
  });

  it('shows the deadline with its time and zone on the keep page, the status page and in the keep email', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const deadline = Date.UTC(2099, 9, 4, 16, 52, 50);
    await frozenDeletion(account.accountId, { requestedAt: Date.now(), deadline, statusTokenHash: null });
    const line = 'the safety period ends 2099-10-04 16:52 UTC.';

    expect(await (await worker.fetch(get('/account/delete', session), testEnv)).text()).toContain(line);

    const confirm = await confirmedStatusCookie(testEnv, account.accountId);
    const status = await (await worker.fetch(get('/account/delete/status', session, confirm), testEnv)).text();
    expect(status).toContain(line);

    const sent = await worker.fetch(post('/account/delete/proof/otp', session, { purpose: 'cancel' }), testEnv);
    expect(sent.status).toBe(200);
    expect(testEnv.EMAIL.sent.at(-1).text).toContain(line);
  });
});

async function ownerWithCustomer(testEnv) {
  const account = await seedAccount({ testEnv });
  const session = await seedSession(account.accountId, { testEnv });
  await upsertStripeCustomer(workerEnv.DB, { accountId: account.accountId, stripeCustomerId: 'cus_hold', nowMs: Date.now() });
  return { accountId: account.accountId, session };
}

async function frozenDeletion(accountId, { requestedAt, deadline, nextAttemptAt = deadline, statusTokenHash = 'status' }) {
  await workerEnv.DB.prepare(
    `INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, frozen_at, cancellation_deadline_at,
       next_attempt_at, status_token_hash)
     VALUES ('hold', ?, 'frozen', ?, ?, ?, ?, ?)`
  ).bind(accountId, requestedAt, requestedAt, deadline, nextAttemptAt, statusTokenHash).run();
}

// The status page is read through its receipt cookie; give the seeded row one.
async function confirmedStatusCookie(testEnv, accountId) {
  const { hashWithPepper } = await import('../src/crypto.js');
  const token = 'receipt-token';
  await workerEnv.DB.prepare('UPDATE account_deletions SET status_token_hash = ? WHERE account_id = ?')
    .bind(await hashWithPepper(token, testEnv), accountId).run();
  return `account_deletion_status=${token}`;
}

async function verifiedProof(accountId, session, purpose) {
  const tokenHash = `${purpose}-proof`;
  await createDeletionProof(workerEnv.DB, {
    tokenHash, accountId, sessionIdHash: session.idHash, purpose, method: 'otp',
    issuedAt: Date.now(), expiresAt: Date.now() + 60_000, otpCodeHash: 'hash',
  });
  await markDeletionProofVerified(workerEnv.DB, { tokenHash, nowMs: Date.now() });
}

function subscription(id, { status = 'active', paused = false, periodStart = 1_700_000_000, periodEnd = 1_900_000_000 } = {}) {
  return {
    id,
    status,
    customer: 'cus_hold',
    metadata: { service: 'spl' },
    pause_collection: paused ? { behavior: 'void' } : null,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    cancel_at_period_end: false,
  };
}

function grantRecorder(pushes) {
  return {
    async fetch(input, init = {}) {
      const url = new URL(typeof input === 'string' ? input : input.url);
      if (url.pathname !== '/admin/entitlement') return new Response(null, { status: 404 });
      pushes.push(JSON.parse(init.body));
      return Response.json({ ok: true });
    },
  };
}

function stripeJson(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function get(path, session, extraCookie = '') {
  return new Request(`https://services.solstone.app${path}`, {
    headers: { Cookie: [session.cookie, extraCookie].filter(Boolean).join('; ') },
  });
}

function post(path, session, form = {}) {
  return new Request(`https://services.solstone.app${path}`, {
    method: 'POST',
    headers: {
      Cookie: session.cookie,
      Origin: 'https://services.solstone.app',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(form).toString(),
  });
}

function deletionRow() {
  return workerEnv.DB.prepare("SELECT * FROM account_deletions WHERE operation_id = 'hold' OR phase IN ('frozen', 'requested')").first();
}

function entitlement(accountId) {
  return workerEnv.DB.prepare("SELECT status, current_period_end FROM entitlements WHERE account_id = ? AND service = 'spl_hosted'")
    .bind(accountId).first();
}
