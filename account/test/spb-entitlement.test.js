import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  reconcileSpbEntitlement,
  SPB_HOSTED_SERVICE,
} from '../src/spb-entitlement.js';
import {
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedScoutApplication,
  seedSpbBinding,
} from './helpers.js';

const INSTANCE_ID = '11111111-1111-1111-1111-111111111111';

describe('spb entitlement helpers', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reconciles paid active entitlements', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spb-paid-active@example.com', testEnv });
    const nowMs = 1_700_000_000_000;

    await reconcileSpbEntitlement(testEnv, account.accountId, nowMs, undefined, {
      paid: {
        status: 'active',
        currentPeriodEnd: 1_900_000_000,
        source: 'stripe',
        sourceRef: 'sub_spb_active',
      },
    });

    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      account_id: account.accountId,
      service: SPB_HOSTED_SERVICE,
      status: 'active',
      current_period_end: 1_900_000_000,
      source: 'stripe',
      source_ref: 'sub_spb_active',
    });
  });

  it('reconciles paid past_due entitlements', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spb-paid-past-due@example.com', testEnv });
    const nowMs = 1_700_000_000_000;

    await reconcileSpbEntitlement(testEnv, account.accountId, nowMs, undefined, {
      paid: {
        status: 'past_due',
        currentPeriodEnd: null,
        source: 'stripe',
        sourceRef: null,
      },
    });

    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'past_due',
      current_period_end: null,
      source: 'stripe',
      source_ref: null,
    });
  });

  it('uses approved scout comp when no paid signal exists', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spb-scout@example.com', testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 2_000 });

    await reconcileSpbEntitlement(testEnv, account.accountId, 1_700_000_000_000);

    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'active',
      current_period_end: null,
      source: 'comp',
      source_ref: null,
    });
  });

  it('lapses accounts without paid or approved scout signals', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spb-lapsed@example.com', testEnv });

    await reconcileSpbEntitlement(testEnv, account.accountId, 1_700_000_000_000);

    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'lapsed',
      current_period_end: null,
      source: 'comp',
      source_ref: null,
    });
  });

  it('keeps paid precedence over approved scout comps', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spb-paid-scout@example.com', testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 2_000 });
    await seedEntitlement({
      accountId: account.accountId,
      service: SPB_HOSTED_SERVICE,
      status: 'active',
      currentPeriodEnd: 1_900_000_111,
      source: 'stripe',
      sourceRef: 'sub_spb_paid_scout',
    });

    await reconcileSpbEntitlement(testEnv, account.accountId, 1_700_000_000_000);

    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'active',
      current_period_end: 1_900_000_111,
      source: 'stripe',
      source_ref: 'sub_spb_paid_scout',
    });
  });

  it('reactivates lapsed accounts through approved scout comp', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spb-comp-lapsed@example.com', testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 2_000 });
    await seedEntitlement({
      accountId: account.accountId,
      service: SPB_HOSTED_SERVICE,
      status: 'lapsed',
      currentPeriodEnd: null,
      source: 'comp',
      sourceRef: null,
    });

    await reconcileSpbEntitlement(testEnv, account.accountId, 1_700_000_000_000);

    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'active',
      source: 'comp',
    });
  });

  it('stamps lapsed_at on first lapse without advancing it on repeat lapse', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spb-lapse-clock@example.com', testEnv });
    await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_ID, lapsedAt: null });

    await reconcileSpbEntitlement(testEnv, account.accountId, 1_700_000_000_000);
    await expect(spbBindingRow(account.accountId)).resolves.toMatchObject({
      lapsed_at: 1_700_000_000_000,
    });

    await reconcileSpbEntitlement(testEnv, account.accountId, 1_700_000_123_000);
    await expect(spbBindingRow(account.accountId)).resolves.toMatchObject({
      lapsed_at: 1_700_000_000_000,
    });
  });

  it('clears lapsed_at on paid reactivation', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spb-paid-clear@example.com', testEnv });
    await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_ID, lapsedAt: 999 });
    await seedEntitlement({
      accountId: account.accountId,
      service: SPB_HOSTED_SERVICE,
      status: 'active',
      currentPeriodEnd: 1_900_000_000,
      source: 'stripe',
      sourceRef: 'sub_spb_clear',
    });

    await reconcileSpbEntitlement(testEnv, account.accountId, 1_700_000_000_000);

    await expect(spbBindingRow(account.accountId)).resolves.toMatchObject({
      lapsed_at: null,
    });
  });

  it('clears lapsed_at on comp reactivation', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spb-comp-clear@example.com', testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 2_000 });
    await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_ID, lapsedAt: 999 });

    await reconcileSpbEntitlement(testEnv, account.accountId, 1_700_000_000_000);

    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'active',
      source: 'comp',
    });
    await expect(spbBindingRow(account.accountId)).resolves.toMatchObject({
      lapsed_at: null,
    });
  });

  it('does not fetch or schedule waitUntil work', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spb-no-network@example.com', testEnv });
    await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_ID });
    const fetchMock = vi.fn(() => {
      throw new Error('spb resolver must not fetch');
    });
    vi.stubGlobal('fetch', fetchMock);
    const ctx = { waitUntil: vi.fn() };

    await reconcileSpbEntitlement(testEnv, account.accountId, 1_700_000_000_000, ctx);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(ctx.waitUntil).not.toHaveBeenCalled();
  });
});

async function entitlementRow(accountId) {
  return workerEnv.DB
    .prepare(
      `SELECT account_id, service, status, current_period_end, source, source_ref, updated_at
       FROM entitlements
       WHERE account_id = ? AND service = ?`
    )
    .bind(accountId, SPB_HOSTED_SERVICE)
    .first();
}

async function spbBindingRow(accountId, instanceId = INSTANCE_ID) {
  return workerEnv.DB
    .prepare(
      `SELECT account_id, instance_id, created_at, last_seen_at, token_hash, lapsed_at
       FROM spb_bindings
       WHERE account_id = ? AND instance_id = ?`
    )
    .bind(accountId, instanceId)
    .first();
}
