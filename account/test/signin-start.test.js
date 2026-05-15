import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env as workerEnv } from 'cloudflare:test';
import worker from '../src/index.js';
import {
  makeTestEnv,
  recordingDb,
  resetDb,
  responseSnapshot,
  rowCount,
  startRequest,
  stubTurnstile,
} from './helpers.js';

describe('/signin/start', () => {
  beforeEach(async () => {
    await resetDb();
    stubTurnstile(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not read account_emails on the admit path', async () => {
    const statements = [];
    const testEnv = makeTestEnv({ DB: recordingDb(workerEnv.DB, statements) });
    await worker.fetch(startRequest('new@example.com'), testEnv);
    expect(statements.some((sql) => /account_emails/i.test(sql))).toBe(false);
  });

  it('writes a nonce row for every admitted request', async () => {
    const testEnv = makeTestEnv();
    await worker.fetch(startRequest('new@example.com'), testEnv);
    expect(await rowCount('magic_link_nonces')).toBe(1);
    expect(testEnv.EMAIL.sent).toHaveLength(1);
  });

  it('returns byte-identical responses across admit and reject branches', async () => {
    const snapshots = [];

    await resetDb();
    stubTurnstile(true);
    snapshots.push(await responseSnapshot(await worker.fetch(startRequest('admit@example.com'), makeTestEnv())));

    await resetDb();
    stubTurnstile(true);
    snapshots.push(await responseSnapshot(await worker.fetch(startRequest('unknown@example.com'), makeTestEnv())));

    await resetDb();
    stubTurnstile(true);
    const ipEnv = makeTestEnv();
    for (let i = 0; i < 10; i++) {
      await worker.fetch(startRequest(`ip-${i}@example.com`, { 'CF-Connecting-IP': '203.0.113.20' }), ipEnv);
    }
    snapshots.push(await responseSnapshot(
      await worker.fetch(startRequest('ip-capped@example.com', { 'CF-Connecting-IP': '203.0.113.20' }), ipEnv)
    ));

    await resetDb();
    stubTurnstile(true);
    const emailEnv = makeTestEnv();
    for (let i = 0; i < 5; i++) {
      await worker.fetch(startRequest('email-capped@example.com', { 'CF-Connecting-IP': `203.0.113.${30 + i}` }), emailEnv);
    }
    snapshots.push(await responseSnapshot(
      await worker.fetch(startRequest('email-capped@example.com', { 'CF-Connecting-IP': '203.0.113.40' }), emailEnv)
    ));

    await resetDb();
    stubTurnstile(false);
    snapshots.push(await responseSnapshot(await worker.fetch(startRequest('turnstile@example.com'), makeTestEnv())));

    await resetDb();
    stubTurnstile(true);
    snapshots.push(await responseSnapshot(await worker.fetch(startRequest('not-an-email'), makeTestEnv())));

    expect(snapshots.slice(1)).toEqual(snapshots.slice(1).map(() => snapshots[0]));
  });

  it('does not set a session cookie', async () => {
    const response = await worker.fetch(startRequest('new@example.com'), makeTestEnv());
    expect(response.headers.has('Set-Cookie')).toBe(false);
  });

  it('bumps rate buckets before writing the nonce', async () => {
    const statements = [];
    const testEnv = makeTestEnv({ DB: recordingDb(workerEnv.DB, statements) });
    await worker.fetch(startRequest('new@example.com'), testEnv);
    const firstRateBucket = statements.findIndex((sql) => /INSERT INTO rate_buckets/i.test(sql));
    const firstNonce = statements.findIndex((sql) => /INSERT INTO magic_link_nonces/i.test(sql));
    expect(firstRateBucket).toBeGreaterThanOrEqual(0);
    expect(firstNonce).toBeGreaterThan(firstRateBucket);
  });
});
