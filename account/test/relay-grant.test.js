import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  entitledUntilFor,
  pushEntitlementGrant,
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
    expect(entitledUntilFor({ status: 'active', current_period_end: 1_900_000_000 }, nowSeconds, env)).toBe(1_900_000_000);
    expect(entitledUntilFor({ status: 'active', current_period_end: null }, nowSeconds, env)).toBe(nowSeconds + 14 * 86400);
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
});
