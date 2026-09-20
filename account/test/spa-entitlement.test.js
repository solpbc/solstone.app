import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SPA_HOSTED_SERVICE,
  isSpaEntitledToServe,
  reconcileSpaEntitlement,
} from '../src/spa-entitlement.js';
import { reconcileAllServices } from '../src/spb-entitlement.js';
import {
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedScoutApplication,
} from './helpers.js';

const NOW_MS = 1_700_000_000_000;
const NOW_SECONDS = NOW_MS / 1000;
const DAY = 86400;

describe('spa entitlement helpers', () => {
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
    const account = await seedAccount({ email: 'spa-paid-active@example.com', testEnv });

    await reconcileSpaEntitlement(testEnv, account.accountId, NOW_MS, undefined, {
      paid: { status: 'active', currentPeriodEnd: 1_900_000_000, source: 'stripe', sourceRef: 'sub_spa_active' },
    });

    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      service: SPA_HOSTED_SERVICE,
      status: 'active',
      current_period_end: 1_900_000_000,
      source: 'stripe',
      source_ref: 'sub_spa_active',
    });
  });

  it('reconciles paid past_due entitlements, keeping the paid period the row already holds', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spa-paid-past-due@example.com', testEnv });
    await seedEntitlement({
      accountId: account.accountId,
      service: SPA_HOSTED_SERVICE,
      status: 'active',
      currentPeriodEnd: 1_800_000_000,
      sourceRef: 'sub_spa_held',
    });

    await reconcileSpaEntitlement(testEnv, account.accountId, NOW_MS, undefined, {
      paid: { status: 'past_due', currentPeriodEnd: null, source: 'stripe', sourceRef: null },
    });

    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'past_due',
      current_period_end: 1_800_000_000,
      source: 'stripe',
      source_ref: 'sub_spa_held',
    });
  });

  it('comps an approved scout when no paid signal exists', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spa-scout@example.com', testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 2_000 });

    await reconcileSpaEntitlement(testEnv, account.accountId, NOW_MS);

    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'active',
      current_period_end: null,
      source: 'comp',
      source_ref: null,
    });
  });

  it('lapses an account with no paid or approved scout signal', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spa-lapsed@example.com', testEnv });

    await reconcileSpaEntitlement(testEnv, account.accountId, NOW_MS);

    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'lapsed',
      current_period_end: null,
      source: 'comp',
    });
  });

  it('keeps paid precedence over an approved scout comp', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spa-paid-scout@example.com', testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 2_000 });
    await seedEntitlement({
      accountId: account.accountId,
      service: SPA_HOSTED_SERVICE,
      status: 'active',
      currentPeriodEnd: 1_900_000_111,
      source: 'stripe',
      sourceRef: 'sub_spa_paid_scout',
    });

    await reconcileSpaEntitlement(testEnv, account.accountId, NOW_MS);

    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'active',
      current_period_end: 1_900_000_111,
      source: 'stripe',
      source_ref: 'sub_spa_paid_scout',
    });
  });

  it('falls back to the scout comp, not a lapse, when a paid subscription ends for an approved scout', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spa-scout-cancel@example.com', testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 2_000 });

    await reconcileSpaEntitlement(testEnv, account.accountId, NOW_MS, undefined, { paid: null });

    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({ status: 'active', source: 'comp' });
  });

  it('writes nothing for an account under active deletion', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spa-deleting@example.com', testEnv });
    await workerEnv.DB.prepare(
      "INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, cancellation_deadline_at, status_token_hash) VALUES (?, ?, 'frozen', 0, 1, 'status')"
    ).bind(crypto.randomUUID(), account.accountId).run();

    await reconcileSpaEntitlement(testEnv, account.accountId, NOW_MS, undefined, {
      paid: { status: 'active', currentPeriodEnd: 1_900_000_000, source: 'stripe', sourceRef: 'sub' },
    });

    await expect(entitlementRow(account.accountId)).resolves.toBeNull();
  });

  it('is reconciled with the other services, so a scout approval comps the connector too', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spa-all-services@example.com', testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 2_000 });

    await reconcileAllServices(testEnv, account.accountId, NOW_MS);

    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({ status: 'active', source: 'comp' });
  });
});

describe('isSpaEntitledToServe', () => {
  const env = { RELAY_GRACE_DAYS: '14' };

  it('serves active rows and refuses absent, lapsed and canceled ones', () => {
    expect(isSpaEntitledToServe({ status: 'active' }, NOW_SECONDS, env)).toBe(true);
    expect(isSpaEntitledToServe(null, NOW_SECONDS, env)).toBe(false);
    expect(isSpaEntitledToServe({ status: 'lapsed' }, NOW_SECONDS, env)).toBe(false);
    expect(isSpaEntitledToServe({ status: 'canceled' }, NOW_SECONDS, env)).toBe(false);
  });

  it('serves a past_due row for 14 days after the paid period ends, to the second', () => {
    const end = NOW_SECONDS - 14 * DAY;
    expect(isSpaEntitledToServe({ status: 'past_due', current_period_end: end }, NOW_SECONDS, env)).toBe(true);
    expect(isSpaEntitledToServe({ status: 'past_due', current_period_end: end - 1 }, NOW_SECONDS, env)).toBe(false);
  });

  it('refuses a past_due row that never recorded a paid period', () => {
    expect(isSpaEntitledToServe({ status: 'past_due', current_period_end: null }, NOW_SECONDS, env)).toBe(false);
  });

  it('reads the grace window from RELAY_GRACE_DAYS, defaulting to 14', () => {
    const row = { status: 'past_due', current_period_end: NOW_SECONDS - 20 * DAY };
    expect(isSpaEntitledToServe(row, NOW_SECONDS, { RELAY_GRACE_DAYS: '30' })).toBe(true);
    expect(isSpaEntitledToServe(row, NOW_SECONDS, {})).toBe(false);
  });
});

async function entitlementRow(accountId) {
  return workerEnv.DB
    .prepare(
      `SELECT account_id, service, status, current_period_end, source, source_ref
       FROM entitlements
       WHERE account_id = ? AND service = ?`
    )
    .bind(accountId, SPA_HOSTED_SERVICE)
    .first();
}
