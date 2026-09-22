import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { getEntitlement, upsertEntitlement } from '../src/db.js';
import {
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedSession,
} from './helpers.js';

const SERVICE = 'spl_hosted';
const ENABLED_AT = Date.UTC(2026, 0, 2);

describe('private network', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('renders the public landing when signed out', async () => {
    const response = await get('/private-network', makeTestEnv());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<h1>private network</h1>');
    expect(body).toContain('<p class="hero-tag">your private network</p>');
    expect(body).toContain('you never have to pay us');
  });

  it('renders the signed-in active thin control', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'active-private@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedEntitlement({ accountId: account.accountId, status: 'active', enabledAt: ENABLED_AT, currentPeriodEnd: 1_800_000_000 });

    const response = await get('/private-network', testEnv, { Cookie: session.cookie });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toContain('<h1>private network</h1>');
    expect(body).toContain('your private network is on');
    expect(body).toContain('class="pill on"');
    expect(body).toContain('enabled 2026-01-02');
    expect(body).not.toContain('last seen');
    expect(body).not.toContain('devices reaching your journal');
    expect(body).not.toContain('device reaching your journal');
    expect(body).toContain('manage billing');
    expect(body).toContain('turn off');
    expect(body.match(/action="\/billing\/portal"/g) || []).toHaveLength(1);
    expect(body).toContain('action="/billing/cancel"');
    expect(body).toContain('paid through 2027-01-15');
    expect(body).not.toContain('renews');
    expect(body).toContain('how it works');
  });

  it('shows a pending cancellation and removes the cancel door', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'pending-private@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedEntitlement({
      accountId: account.accountId,
      status: 'active',
      currentPeriodEnd: 1_800_000_000,
      cancelAtPeriodEnd: true,
    });

    const body = await (await get('/private-network', testEnv, { Cookie: session.cookie })).text();

    expect(body).toContain('scheduled to turn off on 2027-01-15');
    expect(body).toContain('action="/billing/portal"');
    expect(body).not.toContain('action="/billing/cancel"');
  });

  it('omits the billing date when an active entitlement has no period end', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'no-period-private@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedEntitlement({ accountId: account.accountId, status: 'active', currentPeriodEnd: null });

    const response = await get('/private-network', testEnv, { Cookie: session.cookie });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('billed through Stripe.');
    expect(body).not.toContain('paid through');
    expect(body).not.toContain('renews');
    expect(body).not.toContain('1970-01-01');
  });

  it('omits the enabled segment when enabled_at is null', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'no-enabled-private@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedEntitlement({ accountId: account.accountId, status: 'active' });

    const response = await get('/private-network', testEnv, { Cookie: session.cookie });
    const body = await response.text();

    expect(body).not.toContain('enabled ');
    expect(body).not.toMatch(/\d+ devices? reaching your journal/);
  });

  it('renders checkout when signed in without a subscription', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'empty-private@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await get('/private-network', testEnv, { Cookie: session.cookie });
    const body = await response.text();

    expect(body).toContain('sol pbc runs a blind relay');
    expect(body).toContain('pay yearly');
    expect(body).toContain('pay monthly');
    expect(body).not.toContain('your private network is on');
  });

  it('stamps enabled_at once on first activation', async () => {
    const testEnv = makeTestEnv();
    const first = await seedAccount({ email: 'stamp-one@example.com', testEnv });
    const second = await seedAccount({ email: 'stamp-two@example.com', testEnv });

    await upsertEntitlement(testEnv.DB, entitlementParams({
      accountId: first.accountId,
      status: 'active',
      nowMs: 1_000,
    }));
    expect((await getEntitlement(testEnv.DB, { accountId: first.accountId, service: SERVICE })).enabled_at).toBe(1_000);

    await upsertEntitlement(testEnv.DB, entitlementParams({
      accountId: first.accountId,
      status: 'active',
      nowMs: 2_000,
    }));
    expect((await getEntitlement(testEnv.DB, { accountId: first.accountId, service: SERVICE })).enabled_at).toBe(1_000);

    await upsertEntitlement(testEnv.DB, entitlementParams({
      accountId: first.accountId,
      status: 'past_due',
      nowMs: 3_000,
    }));
    expect((await getEntitlement(testEnv.DB, { accountId: first.accountId, service: SERVICE })).enabled_at).toBe(1_000);

    await upsertEntitlement(testEnv.DB, entitlementParams({
      accountId: second.accountId,
      status: 'lapsed',
      currentPeriodEnd: null,
      nowMs: 4_000,
    }));
    expect((await getEntitlement(testEnv.DB, { accountId: second.accountId, service: SERVICE })).enabled_at).toBeNull();

    await upsertEntitlement(testEnv.DB, entitlementParams({
      accountId: second.accountId,
      status: 'active',
      nowMs: 5_000,
    }));
    expect((await getEntitlement(testEnv.DB, { accountId: second.accountId, service: SERVICE })).enabled_at).toBe(5_000);
  });
});

function entitlementParams({
  accountId,
  status,
  currentPeriodEnd = 1_800_000_000,
  source = 'stripe',
  sourceRef = 'sub_private_network_test',
  nowMs,
}) {
  return {
    accountId,
    service: SERVICE,
    status,
    currentPeriodEnd,
    source,
    sourceRef,
    nowMs,
  };
}

function get(path, env, headers = {}) {
  return worker.fetch(new Request(`https://services.solstone.app${path}`, { headers }), env);
}
