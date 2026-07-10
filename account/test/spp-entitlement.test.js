import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { reconcileAllServices } from '../src/spb-entitlement.js';
import {
  isSppEntitledToServe,
  reconcileSppEntitlement,
  SPP_HOSTED_SERVICE,
} from '../src/spp-entitlement.js';
import {
  makeTestEnv,
  resetDb,
  seedAccount,
  seedScoutApplication,
} from './helpers.js';

describe('spp entitlement helpers', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('uses approved scout comp access', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spp-scout@example.com', testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 2_000 });

    await reconcileSppEntitlement(testEnv, account.accountId, 1_700_000_000_000);

    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'active',
      current_period_end: null,
      source: 'comp',
      source_ref: null,
    });
  });

  it('lapses accounts without an approved scout application', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spp-lapsed@example.com', testEnv });

    await reconcileSppEntitlement(testEnv, account.accountId, 1_700_000_000_000);

    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'lapsed',
      current_period_end: null,
      source: 'comp',
      source_ref: null,
    });
  });

  it('lapses accounts whose scout application is revoked', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spp-revoked@example.com', testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'revoked', revoked_at: 2_000 });

    await reconcileSppEntitlement(testEnv, account.accountId, 1_700_000_000_000);

    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'lapsed',
      current_period_end: null,
      source: 'comp',
      source_ref: null,
    });
  });

  it('serves only active entitlements', () => {
    expect(isSppEntitledToServe({ status: 'active' }, 1_700_000_000, {})).toBe(true);
    expect(isSppEntitledToServe({ status: 'lapsed' }, 1_700_000_000, {})).toBe(false);
    expect(isSppEntitledToServe({ status: 'past_due' }, 1_700_000_000, {})).toBe(false);
    expect(isSppEntitledToServe(null, 1_700_000_000, {})).toBe(false);
  });

  it('reconciles spp through the all-services funnel', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spp-funnel@example.com', testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 2_000 });

    await reconcileAllServices(testEnv, account.accountId, 1_700_000_000_000);

    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      service: SPP_HOSTED_SERVICE,
      status: 'active',
      source: 'comp',
    });
  });
});

async function entitlementRow(accountId) {
  return workerEnv.DB
    .prepare(
      `SELECT account_id, service, status, current_period_end, source, source_ref, updated_at
       FROM entitlements
       WHERE account_id = ? AND service = ?`
    )
    .bind(accountId, SPP_HOSTED_SERVICE)
    .first();
}
