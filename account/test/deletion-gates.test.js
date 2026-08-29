import { createExecutionContext, env as workerEnv, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveDispatchToken } from '../src/dispatch-tokens.js';
import worker from '../src/index.js';
import { getValidSession } from '../src/session.js';
import { hashWithPepper } from '../src/crypto.js';
import {
  consumeServiceHandoff,
  createDeletionProof,
  insertDispatchToken,
  insertServiceHandoff,
  markDeletionProofVerified,
  reserveSpbMint,
  upsertSppBinding,
} from '../src/db.js';
import { syncAccountEntitlementToRelay } from '../src/relay-grant.js';
import { runSpbLapseSweep } from '../src/spb-sweep.js';
import {
  fetchWithCtx,
  installS3FetchMock,
  installStripeFetchMock,
  makeTestEnv,
  resetDb,
  rowCount,
  seedAccount,
  seedEntitlement,
  seedOtp,
  seedSession,
  seedSpbBinding,
  seedSplBinding,
  signStripeWebhook,
  verifyRequest,
} from './helpers.js';
import { installJwksStub, mintToken } from './jwks-helper.js';

const SWEEP_NOW = 1_700_000_000_000;
const OLD_LAPSE = SWEEP_NOW - 31 * 24 * 60 * 60 * 1000;
const BROKER_TOKEN = 'deletion-race-broker-token';
const BROKER_INSTANCE_ID = '11111111-1111-1111-1111-111111111111';

describe('deletion access gates', () => {
  beforeEach(resetDb);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects sessions and dispatch capabilities for an active deletion while a control account works', async () => {
    const env = makeTestEnv();
    const deleting = await seedAccount({ email: 'deleting@example.com', testEnv: env });
    const control = await seedAccount({ email: 'control@example.com', testEnv: env });
    const deletingSession = await seedSession(deleting.accountId, { testEnv: env });
    const controlSession = await seedSession(control.accountId, { testEnv: env });
    await active(deleting.accountId);
    await expect(getValidSession(new Request('https://services.solstone.app/', { headers: { Cookie: deletingSession.cookie } }), env, Date.now())).resolves.toBeNull();
    await expect(getValidSession(new Request('https://services.solstone.app/', { headers: { Cookie: controlSession.cookie } }), env, Date.now())).resolves.toMatchObject({ account_id: control.accountId });
    const token = 'dispatch-token';
    await insertDispatchToken(workerEnv.DB, { tokenHash: await hashWithPepper(token, env, 'DISPATCH_TOKEN_PEPPER'), accountId: deleting.accountId, nowMs: Date.now() });
    await expect(resolveDispatchToken(env, token)).resolves.toBeNull();
    const controlToken = 'control-dispatch-token';
    await insertDispatchToken(workerEnv.DB, { tokenHash: await hashWithPepper(controlToken, env, 'DISPATCH_TOKEN_PEPPER'), accountId: control.accountId, nowMs: Date.now() });
    await expect(resolveDispatchToken(env, controlToken)).resolves.toMatchObject({ accountId: control.accountId });
  });

  it('records a conservative SPB mint expiry or refuses an active-deletion contender', async () => {
    const env = makeTestEnv();
    const account = await seedAccount({ testEnv: env });
    await expect(reserveSpbMint(workerEnv.DB, {
      id: 'mint-control', accountId: account.accountId, instanceId: 'instance', scope: 'backup',
      reservedExpiresAt: 72_000, createdAt: 0,
    })).resolves.toBe(true);
    await active(account.accountId);
    await expect(reserveSpbMint(workerEnv.DB, {
      id: 'mint-blocked', accountId: account.accountId, instanceId: 'instance', scope: 'backup',
      reservedExpiresAt: 144_000, createdAt: 0,
    })).resolves.toBe(false);
    await expect(workerEnv.DB.prepare("SELECT reserved_expires_at FROM spb_mint_reservations WHERE id = 'mint-control'").first()).resolves.toMatchObject({ reserved_expires_at: 72_000 });
  });

  it('atomically refuses an active-deletion handoff and permits a control handoff', async () => {
    const env = makeTestEnv();
    const deleting = await seedAccount({ email: 'handoff-deleting@example.com', testEnv: env });
    const control = await seedAccount({ email: 'handoff-control@example.com', testEnv: env });
    await insertServiceHandoff(workerEnv.DB, { handoffHash: 'deleting', accountId: deleting.accountId, service: 'scout', payloadEncrypted: 'payload', createdAt: 0, expiresAt: 100 });
    await insertServiceHandoff(workerEnv.DB, { handoffHash: 'control', accountId: control.accountId, service: 'scout', payloadEncrypted: 'payload', createdAt: 0, expiresAt: 100 });
    await active(deleting.accountId);
    await expect(consumeServiceHandoff(workerEnv.DB, { handoffHash: 'deleting', service: 'scout', nowMs: 1 })).resolves.toBeNull();
    await expect(consumeServiceHandoff(workerEnv.DB, { handoffHash: 'control', service: 'scout', nowMs: 1 })).resolves.toMatchObject({ payload_encrypted: 'payload' });
  });

  it('revokes relay access immediately for deletion while retaining normal control entitlement', async () => {
    const calls = [];
    const env = makeTestEnv({ RELAY: { async fetch(_input, init) {
      calls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    } } });
    const deleting = await seedAccount({ email: 'relay-deleting@example.com', testEnv: env });
    const control = await seedAccount({ email: 'relay-control@example.com', testEnv: env });
    await Promise.all([seedSplBinding({ accountId: deleting.accountId }), seedSplBinding({ accountId: control.accountId, instanceId: '22222222-2222-2222-2222-222222222222' })]);
    await Promise.all([
      seedEntitlement({ accountId: deleting.accountId, service: 'spl_hosted', status: 'active', source: 'stripe', currentPeriodEnd: 1_900_000_000 }),
      seedEntitlement({ accountId: control.accountId, service: 'spl_hosted', status: 'active', source: 'stripe', currentPeriodEnd: 1_900_000_000 }),
    ]);
    await active(deleting.accountId);
    await syncAccountEntitlementToRelay(env, deleting.accountId);
    await syncAccountEntitlementToRelay(env, control.accountId);
    expect(calls[0].entitled_until).toBe(0);
    expect(calls[1].entitled_until).toBe(1_900_000_000);
  });

  it('refuses SPP authorization for deletion while authorizing its control binding', async () => {
    const env = makeTestEnv();
    const deleting = await seedAccount({ email: 'spp-deleting@example.com', testEnv: env });
    const control = await seedAccount({ email: 'spp-control@example.com', testEnv: env });
    const deletingToken = 'spp-deleting-token';
    const controlToken = 'spp-control-token';
    await upsertSppBinding(workerEnv.DB, { accountId: deleting.accountId, instanceId: '11111111-1111-1111-1111-111111111111', tokenHash: await hashWithPepper(deletingToken, env), nowMs: 1, consentAckedAt: null, consentDisclosureVersion: null });
    await upsertSppBinding(workerEnv.DB, { accountId: control.accountId, instanceId: '22222222-2222-2222-2222-222222222222', tokenHash: await hashWithPepper(controlToken, env), nowMs: 1, consentAckedAt: null, consentDisclosureVersion: null });
    await Promise.all([
      seedEntitlement({ accountId: deleting.accountId, service: 'spp_hosted', status: 'active', source: 'comp', currentPeriodEnd: null }),
      seedEntitlement({ accountId: control.accountId, service: 'spp_hosted', status: 'active', source: 'comp', currentPeriodEnd: null }),
    ]);
    await active(deleting.accountId);
    await expect(worker.fetch(authorise(deletingToken), env)).resolves.toMatchObject({ status: 401 });
    await expect(worker.fetch(authorise(controlToken), env)).resolves.toMatchObject({ status: 204 });
  });

  it('refuses an active-deletion backup broker request before it mints a credential', async () => {
    const env = makeTestEnv();
    const account = await seedAccount({ email: 'broker-deleting@example.com', testEnv: env });
    const token = 'broker-token';
    await seedSpbBinding({ accountId: account.accountId, tokenHash: await hashWithPepper(token, env) });
    await seedEntitlement({ accountId: account.accountId, service: 'spb_hosted', status: 'active', source: 'stripe', currentPeriodEnd: 1_900_000_000 });
    await active(account.accountId);
    const response = await worker.fetch(new Request('https://services.solstone.app/backup/credentials', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'backup' }) }), env);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'deletion_in_progress' });
  });

  it('skips Stripe checkout reconciliation for deletion while reconciling a control account', async () => {
    const stripeCustomerWrites = [];
    const baseEnv = makeTestEnv();
    const env = makeTestEnv({
      DB: {
        prepare(sql) {
          if (/INSERT INTO stripe_customers/i.test(sql)) stripeCustomerWrites.push(sql);
          return baseEnv.DB.prepare(sql);
        },
      },
    });
    const deleting = await seedAccount({ email: 'stripe-deleting@example.com', testEnv: env });
    const control = await seedAccount({ email: 'stripe-control@example.com', testEnv: env });
    await active(deleting.accountId);
    const { calls } = installStripeFetchMock({
      'GET api.stripe.com/v1/subscriptions/sub_control': async () => stripeJson({
        id: 'sub_control',
        status: 'active',
        current_period_end: 1_900_000_000,
        customer: 'cus_control',
      }),
    });

    const deletingResponse = await postStripeWebhook(env, {
      type: 'checkout.session.completed',
      data: { object: {
        client_reference_id: deleting.accountId,
        customer: 'cus_deleting',
        subscription: 'sub_deleting',
      } },
    });

    expect(deletingResponse.status).toBe(200);
    expect(stripeCustomerWrites).toEqual([]);
    expect(calls).toEqual([]);
    await expect(stripeCustomer(deleting.accountId)).resolves.toBeNull();
    await expect(entitlement(deleting.accountId)).resolves.toBeNull();

    const controlResponse = await postStripeWebhook(env, {
      type: 'checkout.session.completed',
      data: { object: {
        client_reference_id: control.accountId,
        customer: 'cus_control',
        subscription: 'sub_control',
      } },
    });

    expect(controlResponse.status).toBe(200);
    expect(stripeCustomerWrites).toHaveLength(1);
    expect(calls).toHaveLength(1);
    await expect(stripeCustomer(control.accountId)).resolves.toMatchObject({ stripe_customer_id: 'cus_control' });
    await expect(entitlement(control.accountId)).resolves.toMatchObject({ status: 'active', source_ref: 'sub_control' });
  });

  it('rejects admin scout mutations and impersonation for an active deletion', async () => {
    await installJwksStub();
    const env = makeTestEnv();
    const account = await seedAccount({ email: 'admin-deleting@example.com', testEnv: env });
    await active(account.accountId);
    const token = await mintToken();

    const approve = await worker.fetch(adminRequest(`/admin/scouts/${account.accountId}/approve`, token, { reason_code: 'approved' }), env);
    const revoke = await worker.fetch(adminRequest(`/admin/scouts/${account.accountId}/revoke`, token, { reason_code: 'revoked' }), env);
    const impersonate = await worker.fetch(adminRequest('/admin/impersonate', token, { account_id: account.accountId }), env);

    for (const response of [approve, revoke, impersonate]) {
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({ error: 'account deletion in progress' });
    }
  });

  it('refuses OTP sign-in for an active-deletion account without minting a session', async () => {
    const env = makeTestEnv();
    const account = await seedAccount({ email: 'signin-deleting@example.com', testEnv: env });
    const otp = await seedOtp({ email: 'signin-deleting@example.com', options: { code: '123456' } });
    await active(account.accountId);

    const response = await worker.fetch(verifyRequest({ email: otp.emailLower, code: otp.code }), env);

    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(await response.text()).toContain("that code didn't work.");
    await expect(rowCount('sessions')).resolves.toBe(0);
  });

  it('skips a deleting account during the SPB lapse sweep while sweeping its control', async () => {
    const env = makeTestEnv();
    const deleting = await seedAccount({ email: 'sweep-deleting@example.com', testEnv: env });
    const control = await seedAccount({ email: 'sweep-control@example.com', testEnv: env });
    const deletingBinding = await seedSpbBinding({ accountId: deleting.accountId, lapsedAt: OLD_LAPSE });
    const controlBinding = await seedSpbBinding({
      accountId: control.accountId,
      instanceId: '22222222-2222-2222-2222-222222222222',
      lapsedAt: OLD_LAPSE,
    });
    await active(deleting.accountId);
    const { calls } = installS3FetchMock(env, {
      default: async ({ method, url }) => {
        if (method === 'GET' && url.searchParams.get('list-type') === '2') {
          return xmlResponse('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>');
        }
        if (method === 'GET' && url.searchParams.has('uploads')) {
          return xmlResponse('<ListMultipartUploadsResult><IsTruncated>false</IsTruncated></ListMultipartUploadsResult>');
        }
        throw new Error(`unexpected sweep request: ${method} ${url.href}`);
      },
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const ctx = createExecutionContext();
    await runSpbLapseSweep(env, ctx, SWEEP_NOW);
    await waitOnExecutionContext(ctx);

    const deletingPrefix = `users/${deletingBinding.accountId}/${deletingBinding.instanceId}/`;
    const controlPrefix = `users/${controlBinding.accountId}/${controlBinding.instanceId}/`;
    await expect(spbBinding(deletingBinding.accountId, deletingBinding.instanceId)).resolves.not.toBeNull();
    await expect(spbBinding(controlBinding.accountId, controlBinding.instanceId)).resolves.toBeNull();
    expect(calls.some((call) => call.url.searchParams.get('prefix') === deletingPrefix)).toBe(false);
    expect(calls.some((call) => call.url.searchParams.get('prefix') === controlPrefix)).toBe(true);
  });

  it('makes a real concurrent broker mint lose cleanly when deletion confirmation wins the reservation race', async () => {
    const baseEnv = makeTestEnv();
    const delayed = delayReservationInsert(baseEnv.DB);
    const env = { ...baseEnv, DB: delayed.db };
    const account = await seedAccount({ email: 'race-owner@example.com', testEnv: env });
    const session = await seedSession(account.accountId, { testEnv: env });
    await seedEntitlement({
      accountId: account.accountId,
      service: 'spb_hosted',
      status: 'active',
      currentPeriodEnd: 1_900_000_000,
    });
    await seedSpbBinding({
      accountId: account.accountId,
      instanceId: BROKER_INSTANCE_ID,
      tokenHash: await hashWithPepper(BROKER_TOKEN, env),
    });
    await createDeletionProof(workerEnv.DB, {
      tokenHash: 'race-delete-proof',
      accountId: account.accountId,
      sessionIdHash: session.idHash,
      purpose: 'delete',
      method: 'otp',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      otpCodeHash: 'hash',
    });
    await markDeletionProofVerified(workerEnv.DB, { tokenHash: 'race-delete-proof', nowMs: Date.now() });

    let mintReturned = false;
    const mintPromise = worker.fetch(brokerRequest(BROKER_TOKEN), env).then((response) => {
      mintReturned = true;
      return response;
    });
    await delayed.reached;
    const deletionResponse = await worker.fetch(deletionConfirmRequest(session.cookie), env);
    expect(mintReturned).toBe(false);
    delayed.release();
    const mintResponse = await mintPromise;

    const mintWon = mintResponse.status === 200;
    const deletionWon = mintResponse.status === 409;
    expect(Number(mintWon) + Number(deletionWon)).toBe(1);
    expect(deletionResponse.status).toBe(303);
    if (mintWon) {
      const reservation = await workerEnv.DB.prepare(
        'SELECT reserved_expires_at, state FROM spb_mint_reservations WHERE account_id = ?'
      ).bind(account.accountId).first();
      expect(reservation).toMatchObject({ state: 'finalized' });
      expect(reservation.reserved_expires_at).toBeGreaterThan(Date.now());
    } else {
      await expect(mintResponse.json()).resolves.toEqual({ error: 'deletion_in_progress' });
      await expect(workerEnv.DB.prepare(
        'SELECT id FROM spb_mint_reservations WHERE account_id = ?'
      ).bind(account.accountId).first()).resolves.toBeNull();
    }
    await expect(workerEnv.DB.prepare(
      "SELECT phase FROM account_deletions WHERE account_id = ? AND phase IN ('requested', 'frozen', 'purging')"
    ).bind(account.accountId).first()).resolves.toMatchObject({ phase: 'frozen' });
  });
});

async function active(accountId) {
  await workerEnv.DB.prepare(
    "INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, cancellation_deadline_at, status_token_hash) VALUES (?, ?, 'frozen', 0, 1, 'status')"
  ).bind(crypto.randomUUID(), accountId).run();
}

function authorise(token) {
  return new Request('https://services.solstone.app/internal/spp/authorize', {
    method: 'POST', headers: { Authorization: 'Bearer test-spp-engine-auth-secret', 'X-Sol-Entitlement': token },
  });
}

async function postStripeWebhook(env, event) {
  const body = JSON.stringify(event);
  const signature = await signStripeWebhook(body, env.STRIPE_WEBHOOK_SECRET);
  const { response } = await fetchWithCtx(worker, new Request('https://services.solstone.app/stripe/webhook', {
    method: 'POST',
    headers: { 'Stripe-Signature': signature },
    body,
  }), env);
  return response;
}

function stripeJson(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function adminRequest(path, token, body) {
  return new Request(`https://services.solstone.app${path}`, {
    method: 'POST',
    headers: {
      'Cf-Access-Jwt-Assertion': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function brokerRequest(token) {
  return new Request('https://services.solstone.app/backup/credentials', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ scope: 'backup' }),
  });
}

function deletionConfirmRequest(cookie) {
  return new Request('https://services.solstone.app/account/delete/confirm', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: 'https://services.solstone.app',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
}

function delayReservationInsert(db) {
  let markReached;
  let unblock;
  const reached = new Promise((resolve) => { markReached = resolve; });
  const release = new Promise((resolve) => { unblock = resolve; });
  return {
    db: {
      prepare(sql) {
        const statement = db.prepare(sql);
        if (!sql.includes('INSERT INTO spb_mint_reservations')) return statement;
        return {
          bind(...values) {
            const bound = statement.bind(...values);
            return {
              async first() {
                markReached();
                await release;
                return bound.first();
              },
            };
          },
        };
      },
      batch(statements) {
        return db.batch(statements);
      },
    },
    reached,
    release: unblock,
  };
}

async function stripeCustomer(accountId) {
  return workerEnv.DB.prepare('SELECT stripe_customer_id FROM stripe_customers WHERE account_id = ?').bind(accountId).first();
}

async function entitlement(accountId) {
  return workerEnv.DB.prepare("SELECT status, source_ref FROM entitlements WHERE account_id = ? AND service = 'spl_hosted'").bind(accountId).first();
}

async function spbBinding(accountId, instanceId) {
  return workerEnv.DB.prepare('SELECT account_id FROM spb_bindings WHERE account_id = ? AND instance_id = ?').bind(accountId, instanceId).first();
}

function xmlResponse(body) {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/xml' } });
}
