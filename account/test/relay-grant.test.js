import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMP_ENTITLED_THROUGH,
  entitledUntilFor,
  pushEntitlementGrant,
  reconcileSplEntitlement,
  SPL_HOSTED_SERVICE,
  syncAccountEntitlementToRelay,
} from '../src/relay-grant.js';
import {
  installConsoleSpy,
  installRelayFetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedScoutApplication,
  seedSplBinding,
} from './helpers.js';

const INSTANCE_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_INSTANCE_ID = '22222222-2222-2222-2222-222222222222';

describe('relay grant helpers', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('computes entitled-until seconds from entitlement policy', () => {
    const env = makeTestEnv();
    const nowSeconds = 1_700_000_000;

    expect(SPL_HOSTED_SERVICE).toBe('spl_hosted');
    expect(entitledUntilFor(null, nowSeconds, env)).toBe(0);
    expect(entitledUntilFor({ status: 'active', source: 'comp', current_period_end: null }, nowSeconds, env)).toBe(COMP_ENTITLED_THROUGH);
    expect(entitledUntilFor({ status: 'active', source: 'stripe', current_period_end: 1_900_000_000 }, nowSeconds, env)).toBe(1_900_000_000);
    expect(entitledUntilFor({ status: 'active', source: 'stripe', current_period_end: null }, nowSeconds, env)).toBe(nowSeconds + 14 * 86400);
    expect(entitledUntilFor({ status: 'past_due', current_period_end: 1_900_000_000 }, nowSeconds, env)).toBe(nowSeconds + 14 * 86400);
    expect(entitledUntilFor({ status: 'canceled' }, nowSeconds, env)).toBe(0);
    expect(entitledUntilFor({ status: 'lapsed' }, nowSeconds, env)).toBe(0);
    expect(entitledUntilFor({ status: 'past_due' }, nowSeconds, makeTestEnv({ RELAY_GRACE_DAYS: '7' }))).toBe(nowSeconds + 7 * 86400);
  });

  it('posts entitlement grants with only relay-safe fields', async () => {
    const testEnv = makeTestEnv();
    const { calls } = installRelayFetchMock();

    const ok = await pushEntitlementGrant(testEnv, {
      instanceId: INSTANCE_ID,
      entitledUntil: 1_900_000_000,
    });

    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url.href).toBe('https://link.solstone.app/admin/entitlement');
    expect(calls[0].init.headers.Authorization).toBe('Bearer test-relay-grant-secret');
    expect(calls[0].init.headers['Content-Type']).toBe('application/json');
    expect(calls[0].body).toEqual({ instance_id: INSTANCE_ID, entitled_until: 1_900_000_000 });
  });

  it('routes the grant push through the RELAY service binding when bound', async () => {
    const bindingCalls = [];
    const testEnv = makeTestEnv({
      RELAY: {
        async fetch(input, init) {
          bindingCalls.push({ url: input, init, body: JSON.parse(init.body) });
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        },
      },
    });
    // When the binding is present the public fetch must not be used at all.
    const globalFetch = vi.fn(async () => {
      throw new Error('grant push must not hit public fetch when RELAY is bound');
    });
    vi.stubGlobal('fetch', globalFetch);

    const ok = await pushEntitlementGrant(testEnv, {
      instanceId: INSTANCE_ID,
      entitledUntil: 1_900_000_000,
    });

    expect(ok).toBe(true);
    expect(bindingCalls).toHaveLength(1);
    expect(bindingCalls[0].url).toBe('https://link.solstone.app/admin/entitlement');
    expect(bindingCalls[0].init.method).toBe('POST');
    expect(bindingCalls[0].init.headers.Authorization).toBe('Bearer test-relay-grant-secret');
    expect(bindingCalls[0].body).toEqual({ instance_id: INSTANCE_ID, entitled_until: 1_900_000_000 });
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it('soft-fails relay push errors without leaking secrets', async () => {
    const testEnv = makeTestEnv();
    const spy = installConsoleSpy();
    try {
      installRelayFetchMock({
        'POST link.solstone.app/admin/entitlement': async () => new Response(JSON.stringify({ ok: true }), { status: 500 }),
      });
      await expect(pushEntitlementGrant(testEnv, { instanceId: INSTANCE_ID, entitledUntil: 0 })).resolves.toBe(false);
      vi.unstubAllGlobals();

      installRelayFetchMock({
        'POST link.solstone.app/admin/entitlement': async () => new Response(JSON.stringify({ ok: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      });
      await expect(pushEntitlementGrant(testEnv, { instanceId: INSTANCE_ID, entitledUntil: 0 })).resolves.toBe(false);
      vi.unstubAllGlobals();

      installRelayFetchMock({
        'POST link.solstone.app/admin/entitlement': async () => new Response('not json', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      });
      await expect(pushEntitlementGrant(testEnv, { instanceId: INSTANCE_ID, entitledUntil: 0 })).resolves.toBe(false);
      vi.unstubAllGlobals();

      vi.stubGlobal('fetch', vi.fn(async () => {
        throw new Error('network failed');
      }));
      await expect(pushEntitlementGrant(testEnv, { instanceId: INSTANCE_ID, entitledUntil: 0 })).resolves.toBe(false);

      spy.assertNoSecrets([testEnv.RELAY_GRANT_SECRET, INSTANCE_ID]);
    } finally {
      spy.restore();
    }
  });

  it('skips relay sync when an account has no spl bindings', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedEntitlement({ accountId: account.accountId, status: 'active' });
    const { calls } = installRelayFetchMock();

    await syncAccountEntitlementToRelay(testEnv, account.accountId);

    expect(calls).toHaveLength(0);
  });

  it('pushes active entitlement to every spl binding', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedEntitlement({
      accountId: account.accountId,
      status: 'active',
      currentPeriodEnd: 1_900_000_000,
    });
    await seedSplBinding({ accountId: account.accountId, instanceId: INSTANCE_ID });
    await seedSplBinding({ accountId: account.accountId, instanceId: OTHER_INSTANCE_ID });
    const { calls } = installRelayFetchMock();

    await syncAccountEntitlementToRelay(testEnv, account.accountId);

    expect(calls.map((call) => call.body)).toEqual([
      { instance_id: INSTANCE_ID, entitled_until: 1_900_000_000 },
      { instance_id: OTHER_INSTANCE_ID, entitled_until: 1_900_000_000 },
    ]);
  });

  it('pushes zero for lapsed or missing entitlements with bindings', async () => {
    const testEnv = makeTestEnv();
    const lapsed = await seedAccount({ email: 'lapsed@example.com', testEnv });
    const missing = await seedAccount({ email: 'missing@example.com', testEnv });
    await seedEntitlement({ accountId: lapsed.accountId, status: 'lapsed' });
    await seedSplBinding({ accountId: lapsed.accountId, instanceId: INSTANCE_ID });
    await seedSplBinding({ accountId: missing.accountId, instanceId: OTHER_INSTANCE_ID });
    const { calls } = installRelayFetchMock();

    await syncAccountEntitlementToRelay(testEnv, lapsed.accountId);
    await syncAccountEntitlementToRelay(testEnv, missing.accountId);

    expect(calls.map((call) => call.body)).toEqual([
      { instance_id: INSTANCE_ID, entitled_until: 0 },
      { instance_id: OTHER_INSTANCE_ID, entitled_until: 0 },
    ]);
  });

  it('reconciles spl entitlements with paid-over-comp precedence', async () => {
    const testEnv = makeTestEnv();
    const { calls } = installRelayFetchMock();
    const nowMs = 1_700_000_000_000;

    const scoutOnly = await seedAccount({ email: 'scout-only@example.com', testEnv });
    await seedScoutApplication({ accountId: scoutOnly.accountId, status: 'approved', approved_at: 2_000 });
    await seedSplBinding({ accountId: scoutOnly.accountId, instanceId: INSTANCE_ID });
    await reconcileSplEntitlement(testEnv, scoutOnly.accountId, nowMs);
    await expect(entitlementRow(testEnv, scoutOnly.accountId)).resolves.toMatchObject({
      status: 'active',
      source: 'comp',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ instance_id: INSTANCE_ID, entitled_until: COMP_ENTITLED_THROUGH });

    const paidOnly = await seedAccount({ email: 'paid-only@example.com', testEnv });
    await seedEntitlement({
      accountId: paidOnly.accountId,
      status: 'active',
      currentPeriodEnd: 1_900_000_000,
      source: 'stripe',
      sourceRef: 'sub_paid_only',
    });
    await reconcileSplEntitlement(testEnv, paidOnly.accountId, nowMs);
    const paidOnlyRow = await entitlementRow(testEnv, paidOnly.accountId);
    expect(paidOnlyRow).toMatchObject({
      status: 'active',
      current_period_end: 1_900_000_000,
      source: 'stripe',
    });
    expect(entitledUntilFor(paidOnlyRow, 1_700_000_000, testEnv)).toBe(1_900_000_000);

    const paidScout = await seedAccount({ email: 'paid-scout@example.com', testEnv });
    await seedScoutApplication({ accountId: paidScout.accountId, status: 'approved', approved_at: 2_000 });
    await seedEntitlement({
      accountId: paidScout.accountId,
      status: 'active',
      currentPeriodEnd: 1_900_000_111,
      source: 'stripe',
      sourceRef: 'sub_paid_scout',
    });
    await reconcileSplEntitlement(testEnv, paidScout.accountId, nowMs);
    await expect(entitlementRow(testEnv, paidScout.accountId)).resolves.toMatchObject({
      status: 'active',
      current_period_end: 1_900_000_111,
      source: 'stripe',
    });

    const paidLapseScout = await seedAccount({ email: 'paid-lapse-scout@example.com', testEnv });
    await seedScoutApplication({ accountId: paidLapseScout.accountId, status: 'approved', approved_at: 2_000 });
    await seedEntitlement({
      accountId: paidLapseScout.accountId,
      status: 'active',
      currentPeriodEnd: 1_900_000_222,
      source: 'stripe',
      sourceRef: 'sub_lapsed_scout',
    });
    await reconcileSplEntitlement(testEnv, paidLapseScout.accountId, nowMs, undefined, { paid: null });
    await expect(entitlementRow(testEnv, paidLapseScout.accountId)).resolves.toMatchObject({
      status: 'active',
      source: 'comp',
    });

    const revokePaid = await seedAccount({ email: 'revoke-paid@example.com', testEnv });
    await seedScoutApplication({ accountId: revokePaid.accountId, status: 'revoked', revoked_at: 2_000 });
    await seedEntitlement({
      accountId: revokePaid.accountId,
      status: 'active',
      currentPeriodEnd: 1_900_000_333,
      source: 'stripe',
      sourceRef: 'sub_revoke_paid',
    });
    await reconcileSplEntitlement(testEnv, revokePaid.accountId, nowMs);
    await expect(entitlementRow(testEnv, revokePaid.accountId)).resolves.toMatchObject({
      status: 'active',
      source: 'stripe',
    });

    const revokeComp = await seedAccount({ email: 'revoke-comp@example.com', testEnv });
    await seedScoutApplication({ accountId: revokeComp.accountId, status: 'revoked', revoked_at: 2_000 });
    await seedEntitlement({
      accountId: revokeComp.accountId,
      status: 'active',
      currentPeriodEnd: null,
      source: 'comp',
      sourceRef: null,
    });
    await seedSplBinding({ accountId: revokeComp.accountId, instanceId: OTHER_INSTANCE_ID });
    calls.length = 0;
    await reconcileSplEntitlement(testEnv, revokeComp.accountId, nowMs);
    await expect(entitlementRow(testEnv, revokeComp.accountId)).resolves.toMatchObject({
      status: 'lapsed',
      source: 'comp',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ instance_id: OTHER_INSTANCE_ID, entitled_until: 0 });

    const lapsedStripe = await seedAccount({ email: 'lapsed-stripe@example.com', testEnv });
    await seedEntitlement({
      accountId: lapsedStripe.accountId,
      status: 'active',
      currentPeriodEnd: 1_900_000_444,
      source: 'stripe',
      sourceRef: 'sub_lapsed_stripe',
    });
    await reconcileSplEntitlement(testEnv, lapsedStripe.accountId, nowMs, undefined, { paid: null });
    await expect(entitlementRow(testEnv, lapsedStripe.accountId)).resolves.toMatchObject({
      status: 'lapsed',
      source: 'stripe',
    });

    const lapsedMissing = await seedAccount({ email: 'lapsed-missing@example.com', testEnv });
    await reconcileSplEntitlement(testEnv, lapsedMissing.accountId, nowMs);
    await expect(entitlementRow(testEnv, lapsedMissing.accountId)).resolves.toMatchObject({
      status: 'lapsed',
      source: 'comp',
    });
  });
});

async function entitlementRow(testEnv, accountId) {
  return testEnv.DB
    .prepare('SELECT account_id, service, status, current_period_end, source, source_ref, updated_at FROM entitlements WHERE account_id = ? AND service = ?')
    .bind(accountId, SPL_HOSTED_SERVICE)
    .first();
}
