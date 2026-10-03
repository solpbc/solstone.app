import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { hashWithPepper } from '../src/crypto.js';
import { publicLimitKey } from '../src/spp-authorize.js';
import { upsertSppBinding } from '../src/db.js';
import { makeFakeRateLimit, makeTestEnv, resetDb, seedAccount, seedEntitlement } from './helpers.js';

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

  // Added 2026-08-30 (cto-41): a single retry on a retry-eligible D1 fault should
  // carry a request through rather than fail closed on one bad round trip.
  it.each([
    'D1_ERROR: Network connection lost.',
    'D1_ERROR: storage caused object to be reset',
    'D1_ERROR: Unable to open database file',
    'D1_ERROR: database is locked',
    'D1_ERROR: Internal error.',
    'D1_ERROR: query timed out',
  ])('recovers a 204 when the first D1 read throws "%s" and the retry succeeds', async (message) => {
    const testEnv = makeTestEnv();
    await seedActiveBinding(testEnv);
    const flakyEnv = { ...testEnv, DB: makeFlakyDb(testEnv.DB, { failTimes: 1, message }) };

    const response = await authorize(flakyEnv);

    expect(response.status).toBe(204);
  });

  it('logs nothing when the retry recovers — the fault never reaches the caller', async () => {
    const testEnv = makeTestEnv();
    await seedActiveBinding(testEnv);
    const flakyEnv = { ...testEnv, DB: makeFlakyDb(testEnv.DB, { failTimes: 1 }) };
    const lines = [];
    const realError = console.error;
    console.error = (...args) => lines.push(args);

    try {
      await authorize(flakyEnv);
    } finally {
      console.error = realError;
    }

    expect(lines).toEqual([]);
  });

  it('still fails closed with one bounded log line when both the read and its retry throw', async () => {
    const { lines, response } = await captureFailure('D1_ERROR: Network connection lost.');

    expect(response.status).toBe(503);
    expect(lines).toEqual([['spp_authorize_failed', 'Error', 'd1', 'network_lost']]);
  });

  it.each([
    ['D1_ERROR: Too many API requests by single worker invocation.', 'subrequest_limit'],
    ['D1_ERROR: no such table: spp_bindings', 'schema'],
    ['D1_ERROR: D1 DB storage limit exceeded', 'limit'],
    ['D1_ERROR: something nobody has seen yet', 'unclassified'],
  ])('does not retry a %s fault (%s) — it fails closed on the first attempt', async (message) => {
    const testEnv = makeTestEnv();
    await seedActiveBinding(testEnv);
    let calls = 0;
    const countingEnv = {
      ...testEnv,
      DB: {
        prepare() {
          calls += 1;
          throw Object.assign(new Error(message), { name: 'Error' });
        },
      },
    };

    const response = await authorize(countingEnv);

    expect(response.status).toBe(503);
    expect(calls).toBe(1);
  });

  it('retries a retry-eligible fault exactly once, not in a loop', async () => {
    const testEnv = makeTestEnv();
    await seedActiveBinding(testEnv);
    let calls = 0;
    const countingEnv = {
      ...testEnv,
      DB: {
        prepare() {
          calls += 1;
          throw Object.assign(new Error('D1_ERROR: Network connection lost.'), { name: 'Error' });
        },
      },
    };

    const response = await authorize(countingEnv);

    expect(response.status).toBe(503);
    expect(calls).toBe(2);
  });
});

// G3 / Shape C (CSO-cleared): the sealed appliance publishes no engine secret, so this
// route runs the identical owner-credential predicate with no service-bearer check at
// all. See handleSppAuthorizePublic's doc comment in ../src/spp-authorize.js.
describe('POST /spp/authorize (G3 Shape C, no engine bearer)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('authorizes an active binding with no Authorization header at all', async () => {
    const testEnv = makeTestEnv();
    await seedActiveBinding(testEnv);

    const response = await authorizePublic(testEnv, { headers: {} });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it.each([
    ['no Authorization header', {}],
    ['a garbage bearer', { Authorization: 'Bearer not-even-shaped-right' }],
    ['a random 256-bit-looking bearer', { Authorization: 'Bearer ' + 'a'.repeat(64) }],
    ['the old engine secret (now meaningless here)', { Authorization: 'Bearer test-spp-engine-auth-secret' }],
  ])('reaches the identical 204 regardless of the bearer — %s', async (_label, headers) => {
    const testEnv = makeTestEnv();
    await seedActiveBinding(testEnv);

    const response = await authorizePublic(testEnv, { headers });

    expect(response.status).toBe(204);
  });

  it('fails closed for a missing or unknown entitlement credential, same as the internal route', async () => {
    const testEnv = makeTestEnv();
    await seedActiveBinding(testEnv);

    const missing = await authorizePublic(testEnv, { token: '' });
    expect(missing.status).toBe(401);

    const unknown = await authorizePublic(testEnv, { token: 'unknown-token' });
    expect(unknown.status).toBe(401);
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

    const response = await authorizePublic(testEnv);

    expect(response.status).toBe(401);
  });

  it('uses event names distinct from the internal route, so the two are never confused in logs', async () => {
    const testEnv = makeTestEnv();
    await seedActiveBinding(testEnv);
    const lines = [];
    const realWarn = console.warn;
    console.warn = (...args) => lines.push(args);

    try {
      await authorizePublic(testEnv, { token: 'unknown-token' });
    } finally {
      console.warn = realWarn;
    }

    expect(lines).toEqual([['spp_authorize_public_refused_entitlement']]);
  });

  it('fails closed with 503 and a bounded reason code when the entitlement lookup throws', async () => {
    const testEnv = makeTestEnv({
      DB: {
        prepare() {
          throw Object.assign(new Error('D1_ERROR: Network connection lost.'), { name: 'Error' });
        },
      },
    });
    const lines = [];
    const realError = console.error;
    console.error = (...args) => lines.push(args);

    let response;
    try {
      response = await authorizePublic(testEnv);
    } finally {
      console.error = realError;
    }

    expect(response.status).toBe(503);
    expect(lines).toEqual([['spp_authorize_public_failed', 'Error', 'd1', 'network_lost']]);
  });
});

// CSO G3 condition 4, enforced in the worker because the zone rule cannot match ip.src
// on our plan: the engines' egress IPs get the high tier, every other caller the low one,
// and both run before any pepper hash or D1 read.
describe('POST /spp/authorize two-tier rate limit', () => {
  const ENGINE_IP = '203.0.113.10';
  const OTHER_IP = '198.51.100.7';

  beforeEach(async () => {
    await resetDb();
  });

  it('limits an ordinary caller to five per window and answers the sixth with an empty 429', async () => {
    const testEnv = makeTestEnv();
    await seedActiveBinding(testEnv);
    const statuses = [];
    let last;
    for (let i = 0; i < 6; i++) {
      last = await authorizePublic(testEnv, { headers: { 'CF-Connecting-IP': OTHER_IP } });
      statuses.push(last.status);
    }

    expect(statuses).toEqual([204, 204, 204, 204, 204, 429]);
    expect(await last.text()).toBe('');
    expect(last.headers.get('Cache-Control')).toBe('no-store');
  });

  it('gives an engine egress IP the engine tier, past the ordinary limit', async () => {
    const testEnv = makeTestEnv();
    await seedActiveBinding(testEnv);
    const statuses = [];
    for (let i = 0; i < 8; i++) {
      const response = await authorizePublic(testEnv, { headers: { 'CF-Connecting-IP': ENGINE_IP } });
      statuses.push(response.status);
    }

    expect(statuses.every((status) => status === 204)).toBe(true);
    expect(testEnv.SPP_AUTHORIZE_ENGINE_LIMIT.calls).toHaveLength(8);
    expect(testEnv.SPP_AUTHORIZE_PUBLIC_LIMIT.calls).toHaveLength(0);
  });

  it('reads every listed engine IP and treats an unlisted one as ordinary', async () => {
    const testEnv = makeTestEnv({ SPP_ENGINE_EGRESS_IPS: ' 192.0.2.1 , 203.0.113.10 ' });
    await seedActiveBinding(testEnv);

    await authorizePublic(testEnv, { headers: { 'CF-Connecting-IP': '192.0.2.1' } });
    await authorizePublic(testEnv, { headers: { 'CF-Connecting-IP': ENGINE_IP } });
    await authorizePublic(testEnv, { headers: { 'CF-Connecting-IP': OTHER_IP } });

    expect(testEnv.SPP_AUTHORIZE_ENGINE_LIMIT.calls).toEqual(['192.0.2.1', ENGINE_IP]);
    expect(testEnv.SPP_AUTHORIZE_PUBLIC_LIMIT.calls).toEqual([OTHER_IP]);
  });

  it('refuses before any D1 read once a caller is over the limit', async () => {
    let prepared = 0;
    const testEnv = makeTestEnv({
      SPP_AUTHORIZE_PUBLIC_LIMIT: makeFakeRateLimit(0),
      DB: {
        prepare() {
          prepared += 1;
          throw new Error('D1 must not be reached');
        },
      },
    });

    const response = await authorizePublic(testEnv, { headers: { 'CF-Connecting-IP': OTHER_IP } });

    expect(response.status).toBe(429);
    expect(prepared).toBe(0);
  });

  it('logs only a bounded event name when it limits, never the caller address', async () => {
    const testEnv = makeTestEnv({ SPP_AUTHORIZE_PUBLIC_LIMIT: makeFakeRateLimit(0) });
    const lines = [];
    const realWarn = console.warn;
    console.warn = (...args) => lines.push(args);
    try {
      await authorizePublic(testEnv, { headers: { 'CF-Connecting-IP': OTHER_IP } });
    } finally {
      console.warn = realWarn;
    }

    expect(lines).toEqual([['spp_authorize_public_limited']]);
  });

  it('fails closed with 503 when the rate-limit binding is missing', async () => {
    const testEnv = makeTestEnv({ SPP_AUTHORIZE_PUBLIC_LIMIT: undefined });
    await seedActiveBinding(testEnv);
    const lines = [];
    const realError = console.error;
    console.error = (...args) => lines.push(args);
    let response;
    try {
      response = await authorizePublic(testEnv, { headers: { 'CF-Connecting-IP': OTHER_IP } });
    } finally {
      console.error = realError;
    }

    expect(response.status).toBe(503);
    expect(lines).toEqual([['spp_authorize_public_failed', 'Error', 'other', 'rate_limit_binding_missing']]);
  });

  it('counts IPv6 callers by their /64 so rotating inside it buys no fresh budget', async () => {
    const testEnv = makeTestEnv();
    await seedActiveBinding(testEnv);
    const statuses = [];
    for (let i = 1; i <= 6; i++) {
      const response = await authorizePublic(testEnv, {
        headers: { 'CF-Connecting-IP': `2001:db8:abcd:12::${i.toString(16)}` },
      });
      statuses.push(response.status);
    }

    expect(statuses).toEqual([204, 204, 204, 204, 204, 429]);
    expect(new Set(testEnv.SPP_AUTHORIZE_PUBLIC_LIMIT.calls)).toEqual(new Set(['2001:db8:abcd:12::/64']));
  });

  it.each([
    ['198.51.100.7', '198.51.100.7'],
    ['2001:db8:abcd:12::1', '2001:db8:abcd:12::/64'],
    ['2001:0db8:abcd:0012:ffff:0:0:1', '2001:db8:abcd:12::/64'],
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
    ['', 'unknown'],
  ])('keys %s as %s on the ordinary tier', (ip, key) => {
    expect(publicLimitKey(ip)).toBe(key);
  });

  it('leaves the internal route unlimited by the worker tiers', async () => {
    const testEnv = makeTestEnv({ SPP_AUTHORIZE_PUBLIC_LIMIT: makeFakeRateLimit(0) });
    await seedActiveBinding(testEnv);

    const response = await authorize(testEnv);

    expect(response.status).toBe(204);
    expect(testEnv.SPP_AUTHORIZE_PUBLIC_LIMIT.calls).toHaveLength(0);
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

// A DB proxy whose `prepare()` throws on the first `failTimes` calls, then
// delegates every subsequent call to the real (already-seeded) D1 binding — for
// proving a transient D1 fault is retried and recovered, not just retried.
function makeFlakyDb(realDb, { failTimes, message = 'D1_ERROR: Network connection lost.' }) {
  let failuresLeft = failTimes;
  return {
    prepare(...args) {
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        throw Object.assign(new Error(message), { name: 'Error' });
      }
      return realDb.prepare(...args);
    },
  };
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

function authorizePublic(testEnv, { headers = {}, token = TOKEN } = {}) {
  const requestHeaders = new Headers(headers);
  if (token) requestHeaders.set('X-Sol-Entitlement', token);
  return worker.fetch(
    new Request('https://services.solstone.app/spp/authorize', {
      method: 'POST',
      headers: requestHeaders,
    }),
    testEnv
  );
}
