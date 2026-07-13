import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashWithPepper } from '../src/crypto.js';
import worker from '../src/index.js';
import { makeTestEnv, resetDb, seedAccount, seedScoutApplication } from './helpers.js';
import { installJwksStub, mintToken } from './jwks-helper.js';

describe('admin Scout lifecycle history', () => {
  beforeEach(async () => {
    await resetDb();
    await installJwksStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('requires valid CF Access on the history route', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const invalidToken = await mintToken({ badSignature: true });

    for (const token of [null, invalidToken]) {
      const response = await history(account.accountId, token, testEnv);
      expect(response.status).toBe(403);
      expect(await response.text()).toBe('{"error":"cloudflare access required"}');
    }
  });

  it('uses account 404 before limit 400 before cursor 400 and accepts non-UUID account ids', async () => {
    const token = await mintToken();
    await insertRawAccount('legacy-account-id');

    const unknown = await history('missing-account?limit=0&cursor=bad!', token, makeTestEnv());
    expect(unknown.status).toBe(404);
    expect(await unknown.text()).toBe('{"error":"account not found"}');

    const badLimit = await history('legacy-account-id?limit=0&cursor=bad!', token, makeTestEnv());
    expect(badLimit.status).toBe(400);
    expect(await badLimit.text()).toBe('{"error":"valid Scout lifecycle history limit required","code":"invalid_scout_lifecycle_history_limit"}');

    const badCursor = await history('legacy-account-id?limit=1&cursor=bad!', token, makeTestEnv());
    expect(badCursor.status).toBe(400);
    expect(await badCursor.text()).toBe('{"error":"valid Scout lifecycle history cursor required","code":"invalid_scout_lifecycle_history_cursor"}');

    const valid = await history('legacy-account-id', token, makeTestEnv());
    expect(valid.status).toBe(200);
    expect(await valid.text()).toBe('{"account_id":"legacy-account-id","snapshot_sequence":0,"events":[],"next_cursor":null}');
  });

  it('returns empty history for an account with a legacy Scout row', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 1_000 });

    const response = await history(account.accountId, token, testEnv);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(JSON.stringify({
      account_id: account.accountId,
      snapshot_sequence: 0,
      events: [],
      next_cursor: null,
    }));
  });

  it('returns only the approved content-free event fields in exact key order', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'history-private@example.com', testEnv });
    await seedEvent(account.accountId, {
      correlationId: 'history-event-1',
      sequence: 1,
      occurredAt: 1_700_000_000_000,
    });

    const response = await history(account.accountId, token, testEnv);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toBe(JSON.stringify({
      account_id: account.accountId,
      snapshot_sequence: 1,
      events: [{
        correlation_id: 'history-event-1',
        sequence: 1,
        action: 'apply',
        from_status: 'absent',
        to_status: 'pending',
        actor_kind: 'owner',
        actor_principal: account.accountId,
        reason_code: 'owner_application',
        occurred_at: '2023-11-14T22:13:20.000Z',
      }],
      next_cursor: null,
    }));
    for (const prohibited of ['email', 'use_case', 'data_acked', 'token']) {
      expect(text.toLowerCase()).not.toContain(prohibited);
    }
  });

  it('paginates a stable descending snapshot and excludes later events', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedEvent(account.accountId, { correlationId: 'event-1', sequence: 1 });
    await seedEvent(account.accountId, {
      correlationId: 'event-2',
      sequence: 2,
      action: 'approve',
      fromStatus: 'pending',
      toStatus: 'approved',
      actorKind: 'operator',
      actorPrincipal: 'operator@example.com',
      reasonCode: 'application_approved',
    });
    await seedEvent(account.accountId, {
      correlationId: 'event-3',
      sequence: 3,
      action: 'revoke',
      fromStatus: 'approved',
      toStatus: 'revoked',
      actorKind: 'operator',
      actorPrincipal: 'operator@example.com',
      reasonCode: 'owner_request',
    });

    const first = await history(`${account.accountId}?limit=2`, token, testEnv);
    const firstText = await first.text();
    const firstBody = JSON.parse(firstText);
    expect(firstBody.snapshot_sequence).toBe(3);
    expect(firstBody.events.map((event) => event.sequence)).toEqual([3, 2]);
    expect(firstBody.next_cursor).toBe(await encodeCursor({ a: account.accountId, s: 3, b: 1 }, testEnv));
    expect(firstText).toBe(JSON.stringify(firstBody));

    await seedEvent(account.accountId, {
      correlationId: 'event-4',
      sequence: 4,
      action: 'preapprove',
      fromStatus: 'revoked',
      toStatus: 'approved',
      actorKind: 'operator',
      actorPrincipal: 'operator@example.com',
      reasonCode: 'eligibility_restored',
    });
    const second = await history(
      `${account.accountId}?limit=2&cursor=${encodeURIComponent(firstBody.next_cursor)}`,
      token,
      testEnv
    );
    const secondBody = await second.json();
    expect(secondBody).toMatchObject({
      account_id: account.accountId,
      snapshot_sequence: 3,
      next_cursor: null,
    });
    expect(secondBody.events.map((event) => event.sequence)).toEqual([1]);

    const fresh = await history(`${account.accountId}?limit=2`, token, testEnv);
    const freshBody = await fresh.json();
    expect(freshBody.snapshot_sequence).toBe(4);
    expect(freshBody.events.map((event) => event.sequence)).toEqual([4, 3]);
    expect(freshBody.events[0].correlation_id).toBe('event-4');
  });

  it('rejects a cursor minted for another account', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const accountA = await seedAccount({ email: 'cursor-a@example.com', testEnv });
    const accountB = await seedAccount({ email: 'cursor-b@example.com', testEnv });
    await seedEvent(accountA.accountId, { correlationId: 'account-a-event-1', sequence: 1 });
    await seedEvent(accountA.accountId, {
      correlationId: 'account-a-event-2',
      sequence: 2,
      action: 'approve',
      fromStatus: 'pending',
      toStatus: 'approved',
      actorKind: 'operator',
      actorPrincipal: 'operator@example.com',
      reasonCode: 'application_approved',
    });
    const firstPage = await history(`${accountA.accountId}?limit=1`, token, testEnv);
    const { next_cursor: cursor } = await firstPage.json();
    expect(cursor).toEqual(expect.any(String));

    const response = await history(
      `${accountB.accountId}?cursor=${encodeURIComponent(cursor)}`,
      token,
      testEnv
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('{"error":"valid Scout lifecycle history cursor required","code":"invalid_scout_lifecycle_history_cursor"}');
  });

  it.each(['0', '101', '-1', '1.5', ''])('rejects invalid limit %j', async (limit) => {
    const token = await mintToken();
    const account = await seedAccount({ testEnv: makeTestEnv() });

    const response = await history(`${account.accountId}?limit=${encodeURIComponent(limit)}`, token, makeTestEnv());

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('{"error":"valid Scout lifecycle history limit required","code":"invalid_scout_lifecycle_history_limit"}');
  });

  it.each([
    ['not base64url', '%%%'],
    ['not JSON', 'bm90LWpzb24'],
    ['wrong account', (id, env) => encodeCursor({ a: `${id}-other`, s: 1, b: 1 }, env)],
    ['wrong snapshot type', (id, env) => encodeCursor({ a: id, s: '1', b: 1 }, env)],
    ['wrong boundary type', (id, env) => encodeCursor({ a: id, s: 1, b: '1' }, env)],
    ['zero boundary', (id, env) => encodeCursor({ a: id, s: 1, b: 0 }, env)],
    ['boundary above snapshot', (id, env) => encodeCursor({ a: id, s: 1, b: 2 }, env)],
    ['snapshot above current max', (id, env) => encodeCursor({ a: id, s: 2, b: 1 }, env)],
  ])('rejects cursor with %s', async (_name, cursorValue) => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedEvent(account.accountId, { correlationId: 'event-1', sequence: 1 });
    const cursor = typeof cursorValue === 'function'
      ? await cursorValue(account.accountId, testEnv)
      : cursorValue;

    const response = await history(
      `${account.accountId}?cursor=${encodeURIComponent(cursor)}`,
      token,
      testEnv
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('{"error":"valid Scout lifecycle history cursor required","code":"invalid_scout_lifecycle_history_cursor"}');
  });

  it('rejects a tampered opaque cursor instead of returning a truncated page', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedEvent(account.accountId, { correlationId: 'event-1', sequence: 1 });
    await seedEvent(account.accountId, {
      correlationId: 'event-2',
      sequence: 2,
      action: 'approve',
      fromStatus: 'pending',
      toStatus: 'approved',
      actorKind: 'operator',
      actorPrincipal: 'operator@example.com',
      reasonCode: 'application_approved',
    });
    const first = await history(`${account.accountId}?limit=1`, token, testEnv);
    const { next_cursor: cursor } = await first.json();
    const last = cursor.at(-1);
    const tampered = `${cursor.slice(0, -1)}${last === 'A' ? 'B' : 'A'}`;

    const response = await history(
      `${account.accountId}?cursor=${encodeURIComponent(tampered)}`,
      token,
      testEnv
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('{"error":"valid Scout lifecycle history cursor required","code":"invalid_scout_lifecycle_history_cursor"}');
  });

  it.each([
    ['account lookup', /SELECT id, created_at, last_signin_at FROM accounts/i],
    ['maximum sequence', /MAX\(sequence\)/i],
    ['page read', /SELECT correlation_id, sequence, action/i],
  ])('returns no partial page when the %s fails', async (_name, pattern) => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedEvent(account.accountId, { correlationId: 'event-1', sequence: 1 });

    const response = await history(account.accountId, token, failOnPrepare(testEnv, pattern));

    expect(response.status).toBe(500);
    expect(await response.text()).toBe('{"error":"Scout lifecycle history unavailable","code":"scout_lifecycle_history_unavailable"}');
  });
});

function history(accountPath, token, testEnv) {
  const [accountId, query] = accountPath.split('?');
  const suffix = query === undefined ? '' : `?${query}`;
  const headers = {};
  if (token) headers['Cf-Access-Jwt-Assertion'] = token;
  return worker.fetch(new Request(`https://services.solstone.app/admin/scouts/${accountId}/history${suffix}`, {
    headers,
  }), testEnv);
}

async function insertRawAccount(accountId) {
  await workerEnv.DB
    .prepare('INSERT INTO accounts (id, primary_email_id, created_at, last_signin_at) VALUES (?, NULL, ?, ?)')
    .bind(accountId, 1_000, 1_000)
    .run();
}

async function seedEvent(accountId, {
  correlationId,
  sequence,
  action = 'apply',
  fromStatus = 'absent',
  toStatus = 'pending',
  actorKind = 'owner',
  actorPrincipal = accountId,
  reasonCode = 'owner_application',
  occurredAt = sequence * 1_000,
}) {
  await workerEnv.DB
    .prepare(
      `INSERT INTO scout_lifecycle_events (
         correlation_id, account_id, sequence, action, from_status, to_status,
         actor_kind, actor_principal, reason_code, occurred_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      correlationId,
      accountId,
      sequence,
      action,
      fromStatus,
      toStatus,
      actorKind,
      actorPrincipal,
      reasonCode,
      occurredAt
    )
    .run();
}

async function encodeCursor(cursor, testEnv) {
  const payload = btoa(JSON.stringify(cursor))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  const signature = await hashWithPepper(`scout-lifecycle-history:${payload}`, testEnv);
  return `${payload}.${signature}`;
}

function failOnPrepare(testEnv, pattern) {
  return {
    ...testEnv,
    DB: {
      prepare(sql) {
        if (pattern.test(sql)) throw new Error('injected history failure');
        return testEnv.DB.prepare(sql);
      },
      batch: (statements) => testEnv.DB.batch(statements),
    },
  };
}
