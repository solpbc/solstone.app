import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { hashWithPepper } from '../src/crypto.js';
import { upsertSppBinding } from '../src/db.js';
import { makeTestEnv, resetDb, seedAccount, seedEntitlement, seedSandboxRun } from './helpers.js';

const TOKEN = 'portal-issued-spp-token';
const INSTANCE_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_INSTANCE_ID = '33333333-3333-3333-3333-333333333333';
const RUN_ID = '22222222-2222-2222-2222-222222222222';
const NOW_MS = 1_700_000_000_000;

describe('POST /internal/spp/authorize', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('authorizes an active portal binding without returning identity data', async () => {
    const testEnv = makeTestEnv();
    await seedActiveBinding(testEnv);

    const response = await authorize(testEnv);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it.each([
    ['missing engine credential', {}, ''],
    ['wrong engine credential', { Authorization: 'Bearer wrong-engine' }, TOKEN],
    ['missing entitlement credential', engineHeaders(), ''],
    ['unknown entitlement credential', engineHeaders(), 'unknown-token'],
  ])('fails closed for %s', async (_label, headers, token) => {
    const testEnv = makeTestEnv();
    await seedActiveBinding(testEnv);

    const response = await authorize(testEnv, { headers, token });

    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('rejects a real binding whose entitlement is no longer active', async () => {
    const testEnv = makeTestEnv();
    const account = await seedActiveBinding(testEnv);
    await seedEntitlement({
      accountId: account.accountId,
      service: 'spp_hosted',
      status: 'lapsed',
      source: 'comp',
      currentPeriodEnd: null,
    });

    const response = await authorize(testEnv);

    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
  });

  it('authorizes an exact run-owned binding while its lease is active', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS);
    const testEnv = makeTestEnv();
    const account = await seedActiveBinding(testEnv, { sandboxRunId: RUN_ID });
    await seedSandboxRun({
      runId: RUN_ID,
      accountId: account.accountId,
      instanceId: INSTANCE_ID,
      createdAt: NOW_MS - 1_000,
    });

    const response = await authorize(testEnv);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it.each([
    ['missing', null],
    ['account-mismatched', { accountMismatch: true }],
    ['instance-mismatched', { instanceId: OTHER_INSTANCE_ID }],
    ['non-active', { status: 'provisioning', provisioningPhase: 'created' }],
    ['boundary-expired', { createdAt: NOW_MS - 3_600_000, leaseExpiresAt: NOW_MS }],
  ])('fails closed for a %s run-owned binding lease', async (_label, run) => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW_MS);
    const testEnv = makeTestEnv();
    const account = await seedActiveBinding(testEnv, { sandboxRunId: RUN_ID });

    if (run) {
      let runAccountId = account.accountId;
      if (run.accountMismatch) {
        const otherAccount = await seedAccount({ email: 'spp-run-other@example.com', testEnv });
        runAccountId = otherAccount.accountId;
      }
      const { accountMismatch: _accountMismatch, ...overrides } = run;
      await seedSandboxRun({
        runId: RUN_ID,
        accountId: runAccountId,
        instanceId: INSTANCE_ID,
        createdAt: NOW_MS - 1_000,
        ...overrides,
      });
    }

    const response = await authorize(testEnv);

    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});

async function seedActiveBinding(testEnv, { sandboxRunId = null } = {}) {
  const account = await seedAccount({ email: 'spp-authorize@example.com', testEnv });
  await seedEntitlement({
    accountId: account.accountId,
    service: 'spp_hosted',
    status: 'active',
    source: 'comp',
    currentPeriodEnd: null,
  });
  await upsertSppBinding(testEnv.DB, {
    accountId: account.accountId,
    instanceId: INSTANCE_ID,
    tokenHash: await hashWithPepper(TOKEN, testEnv),
    nowMs: 1_000,
    consentAckedAt: 1_000,
    consentDisclosureVersion: 'spp-consent-v2-audio',
    sandboxRunId,
  });
  return account;
}

function engineHeaders() {
  return { Authorization: 'Bearer test-spp-engine-auth-secret' };
}

function authorize(testEnv, { headers = engineHeaders(), token = TOKEN } = {}) {
  const requestHeaders = new Headers(headers);
  if (token) requestHeaders.set('X-Sol-Entitlement', token);
  return worker.fetch(
    new Request('https://services.solstone.app/internal/spp/authorize', {
      method: 'POST',
      headers: requestHeaders,
    }),
    testEnv
  );
}
