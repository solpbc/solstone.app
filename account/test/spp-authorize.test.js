import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { hashWithPepper } from '../src/crypto.js';
import { upsertSppBinding } from '../src/db.js';
import { makeTestEnv, resetDb, seedAccount, seedEntitlement } from './helpers.js';

const TOKEN = 'portal-issued-spp-token';
const INSTANCE_ID = '11111111-1111-1111-1111-111111111111';

describe('POST /internal/spp/authorize', () => {
  beforeEach(async () => {
    await resetDb();
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
});

async function seedActiveBinding(testEnv) {
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
