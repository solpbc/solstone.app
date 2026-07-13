import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  fetchWithCtx,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedScoutApplication,
  seedSession,
} from './helpers.js';
import { installJwksStub, mintToken } from './jwks-helper.js';

describe('Scout lifecycle request races', () => {
  beforeEach(async () => {
    await resetDb();
    await installJwksStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('serializes identical owner apply requests', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'apply-race@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const results = await Promise.all([
      fetchWithCtx(worker, applyRequest(session.cookie), testEnv),
      fetchWithCtx(worker, applyRequest(session.cookie), testEnv),
    ]);

    expect(results.map(({ response }) => response.status)).toEqual([303, 303]);
    await assertLifecycleInvariant(account.accountId);
  });

  it('serializes identical preapprove requests', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'preapprove-race@example.com', testEnv });

    const results = await Promise.all([
      fetchWithCtx(worker, preapproveRequest(token, 'preapprove-race@example.com'), testEnv),
      fetchWithCtx(worker, preapproveRequest(token, 'preapprove-race@example.com'), testEnv),
    ]);

    expect(results.map(({ response }) => response.status)).toEqual([200, 200]);
    await assertLifecycleInvariant(account.accountId);
  });

  it('serializes identical approve requests', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'pending', applied_at: 1_000 });

    const results = await Promise.all([
      fetchWithCtx(worker, statusRequest(token, account.accountId, 'approve', 'operator_correction'), testEnv),
      fetchWithCtx(worker, statusRequest(token, account.accountId, 'approve', 'operator_correction'), testEnv),
    ]);

    expect(results.map(({ response }) => response.status)).toEqual([200, 200]);
    await assertLifecycleInvariant(account.accountId);
  });

  it('serializes identical revoke requests', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 1_000 });

    const results = await Promise.all([
      fetchWithCtx(worker, statusRequest(token, account.accountId, 'revoke', 'operator_correction'), testEnv),
      fetchWithCtx(worker, statusRequest(token, account.accountId, 'revoke', 'operator_correction'), testEnv),
    ]);

    expect(results.map(({ response }) => response.status)).toEqual([200, 200]);
    await assertLifecycleInvariant(account.accountId);
  });

  it('serializes owner apply against operator preapprove', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'apply-preapprove-race@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const results = await Promise.all([
      fetchWithCtx(worker, applyRequest(session.cookie), testEnv),
      fetchWithCtx(worker, preapproveRequest(token, 'apply-preapprove-race@example.com'), testEnv),
    ]);

    expect(results[0].response.status).toBe(303);
    expect(results[1].response.status).toBe(200);
    await assertLifecycleInvariant(account.accountId);
  });

  it('serializes approve against revoke', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'pending', applied_at: 1_000 });

    const results = await Promise.all([
      fetchWithCtx(worker, statusRequest(token, account.accountId, 'approve', 'operator_correction'), testEnv),
      fetchWithCtx(worker, statusRequest(token, account.accountId, 'revoke', 'operator_correction'), testEnv),
    ]);

    for (const { response } of results) expect([200, 409]).toContain(response.status);
    await assertLifecycleInvariant(account.accountId);
  });

  it('serializes approve against preapprove', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'approve-preapprove-race@example.com', testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'pending', applied_at: 1_000 });

    const results = await Promise.all([
      fetchWithCtx(worker, statusRequest(token, account.accountId, 'approve', 'operator_correction'), testEnv),
      fetchWithCtx(worker, preapproveRequest(token, 'approve-preapprove-race@example.com'), testEnv),
    ]);

    expect(results.map(({ response }) => response.status)).toEqual([200, 200]);
    await assertLifecycleInvariant(account.accountId);
  });
});

function applyRequest(cookie) {
  return new Request('https://services.solstone.app/scout/apply', {
    method: 'POST',
    headers: {
      Origin: 'https://services.solstone.app',
      Cookie: cookie,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ data_ack: 'yes', use_case: 'race' }),
  });
}

function preapproveRequest(token, email) {
  return new Request('https://services.solstone.app/admin/scouts/pre-approve', {
    method: 'POST',
    headers: {
      'Cf-Access-Jwt-Assertion': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, reason_code: 'operator_correction' }),
  });
}

function statusRequest(token, accountId, action, reasonCode) {
  return new Request(`https://services.solstone.app/admin/scouts/${accountId}/${action}`, {
    method: 'POST',
    headers: {
      'Cf-Access-Jwt-Assertion': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason_code: reasonCode }),
  });
}

async function assertLifecycleInvariant(accountId) {
  const { results: events } = await workerEnv.DB
    .prepare('SELECT * FROM scout_lifecycle_events WHERE account_id = ? ORDER BY sequence')
    .bind(accountId)
    .all();
  const application = await workerEnv.DB
    .prepare('SELECT status FROM scout_applications WHERE account_id = ?')
    .bind(accountId)
    .first();

  expect(events.length).toBeGreaterThan(0);
  expect(events.map((event) => event.sequence)).toEqual(
    Array.from({ length: events.length }, (_value, index) => index + 1)
  );
  expect(new Set(events.map((event) => event.correlation_id)).size).toBe(events.length);
  expect(new Set(events.map((event) => JSON.stringify([
    event.action,
    event.from_status,
    event.to_status,
  ]))).size).toBe(events.length);
  for (let index = 0; index < events.length - 1; index += 1) {
    expect(events[index].to_status).toBe(events[index + 1].from_status);
  }
  expect(application.status).toBe(events[events.length - 1].to_status);
}
