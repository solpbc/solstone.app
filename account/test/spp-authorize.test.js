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

  it('fails closed with 503 and a bounded reason code when the entitlement lookup throws', async () => {
    const { lines, response } = await captureFailure('D1_ERROR: Network connection lost.');

    expect(response.status).toBe(503);
    expect(await response.text()).toBe('');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(lines).toEqual([['spp_authorize_failed', 'Error', 'd1', 'network_lost']]);
    // the entitlement credential must never reach the log
    expect(JSON.stringify(lines)).not.toContain(TOKEN);
  });

  // The reason token is what makes "why does D1 throw" answerable from the log at
  // all — 'd1' alone said only that D1 was involved. Each case pins one D1 message
  // to the token it must emit, so a later edit to the taxonomy cannot silently
  // reclassify a fault we are still tracking.
  it.each([
    ['D1_ERROR: Network connection lost.', 'network_lost'],
    ['D1_ERROR: storage caused object to be reset', 'storage_reset'],
    ['D1_ERROR: Too many API requests by single worker invocation.', 'subrequest_limit'],
    ['D1_ERROR: Unable to open database file', 'unavailable'],
    ['D1_ERROR: database is locked', 'locked'],
    ['D1_ERROR: no such table: spp_bindings', 'schema'],
    ['D1_ERROR: Internal error.', 'internal'],
    ['D1_ERROR: query timed out', 'timeout'],
    ['D1_ERROR: D1 DB storage limit exceeded', 'limit'],
    ['D1_ERROR: something nobody has seen yet', 'unclassified'],
  ])('classifies "%s" as %s', async (message, reason) => {
    const { lines } = await captureFailure(message);
    expect(lines).toEqual([['spp_authorize_failed', 'Error', 'd1', reason]]);
  });

  it('reports a non-D1 throw as other, with no reason token', async () => {
    const { lines } = await captureFailure('cannot read property of undefined');
    expect(lines).toEqual([['spp_authorize_failed', 'Error', 'other', 'n/a']]);
  });

  // The whole point of emitting fixed constants rather than any slice of the raw
  // message: D1 can embed a bound parameter in its error text, and the bound
  // parameter on this path is the owner's peppered token hash.
  it('never emits any part of a D1 message that embeds the bound token hash', async () => {
    const tokenHash = await hashWithPepper(TOKEN, makeTestEnv());
    const { lines } = await captureFailure(
      `D1_ERROR: no such table: spp_bindings near "${tokenHash}" and ${TOKEN}`
    );

    expect(lines).toEqual([['spp_authorize_failed', 'Error', 'd1', 'schema']]);
    const serialized = JSON.stringify(lines);
    expect(serialized).not.toContain(tokenHash);
    expect(serialized).not.toContain(TOKEN);
  });
});

// Drives one authorize call whose first D1 read throws `message`, and returns the
// console.error lines it produced alongside the response.
async function captureFailure(message) {
  const testEnv = makeTestEnv({
    DB: {
      prepare() {
        throw Object.assign(new Error(message), { name: 'Error' });
      },
    },
  });
  const lines = [];
  const realError = console.error;
  console.error = (...args) => lines.push(args);

  let response;
  try {
    response = await authorize(testEnv);
  } finally {
    console.error = realError;
  }
  return { lines, response };
}

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
