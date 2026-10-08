import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { TEST_CSRF, makeTestEnv, resetDb, seedAccount, seedScoutApplication, seedSession } from './helpers.js';

const ORIGIN = 'https://services.solstone.app';
const NONCE = '7'.repeat(52);
const INSTANCE = '11111111-1111-1111-1111-111111111111';

function confirm(service, session, nonce = NONCE) {
  return new Request(`${ORIGIN}/enable/${service === 'spb' ? 'backup' : service}/confirm`, {
    method: 'POST',
    headers: { Cookie: session.cookie, Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: TEST_CSRF, action: 'allow', nonce, instance: INSTANCE, data_ack: 'yes' }),
  });
}

async function delivered(service, testEnv, nonce = NONCE) {
  const response = await worker.fetch(new Request(`${ORIGIN}/handoff/${service === 'spb' ? 'backup' : service}?nonce=${nonce}`), testEnv);
  expect(response.status).toBe(200);
  return response.json();
}

async function accepted(service, payload, testEnv) {
  const request = service === 'spb'
    ? new Request(`${ORIGIN}/backup/credentials`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${payload.broker_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'backup' }),
    })
    : new Request(`${ORIGIN}/internal/spp/authorize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${testEnv.SPP_ENGINE_AUTH_SECRET}`, 'X-Sol-Entitlement': payload.credential },
    });
  const response = await worker.fetch(request, testEnv, { waitUntil() {} });
  expect(response.status).toBe(service === 'spb' ? 200 : 204);
}

async function ready() {
  const testEnv = makeTestEnv();
  const account = await seedAccount({ testEnv });
  await seedScoutApplication({ accountId: account.accountId, status: 'approved' });
  const session = await seedSession(account.accountId, { testEnv });
  return { testEnv, account, session };
}

describe('service consent retries preserve the delivered credential', () => {
  beforeEach(resetDb);

  it('duplicate backup confirmation preserves the credential before and after handoff consumption', async () => {
    const { testEnv, session } = await ready();
    expect((await worker.fetch(confirm('spb', session), testEnv)).status).toBe(200);
    await worker.fetch(confirm('spb', session), testEnv);
    const payload = await delivered('spb', testEnv);
    await accepted('spb', payload, testEnv);
    await worker.fetch(confirm('spb', session), testEnv);
    await accepted('spb', payload, testEnv);
  });

  it.each(['spb', 'spp'])('concurrent %s confirmations with stale handoff reads preserve the winner', async (service) => {
    const { testEnv, session } = await ready();
    // Both requests read the real absent row before the first confirmation commits.
    // Hold the second result until the first completes: its stale read must not
    // authorize a second token replacement. Writes still run against real D1.
    let reads = 0;
    let releaseReads;
    let releaseSecond;
    const bothRead = new Promise((resolve) => { releaseReads = resolve; });
    const firstFinished = new Promise((resolve) => { releaseSecond = resolve; });
    const db = testEnv.DB;
    const racingEnv = { ...testEnv, DB: {
      prepare(sql) {
        const statement = db.prepare(sql);
        if (!sql.includes('SELECT account_id, expires_at, consumed_at')) return statement;
        return { bind(...args) {
          const bound = statement.bind(...args);
          return { async first() {
            const row = await bound.first();
            const turn = ++reads;
            if (turn === 2) releaseReads();
            if (turn <= 2) await bothRead;
            if (turn === 2) await firstFinished;
            return row;
          } };
        } };
      },
      batch: db.batch.bind(db),
    } };
    const first = worker.fetch(confirm(service, session), racingEnv);
    const second = worker.fetch(confirm(service, session), racingEnv);
    try {
      expect((await Promise.race([first, second])).status).toBe(200);
    } finally {
      releaseSecond();
    }
    await Promise.all([first, second]);
    expect(reads).toBeGreaterThanOrEqual(2);
    const payload = await delivered(service, testEnv);
    await accepted(service, payload, testEnv);
    const rows = await workerEnv.DB.prepare('SELECT handoff_hash FROM service_handoffs').all();
    expect(rows.results).toHaveLength(1);
  });

  it.each(['spb', 'spp'])('%s re-consent still rotates with a fresh nonce, and a failed delivery rolls back', async (service) => {
    const { testEnv, session } = await ready();
    expect((await worker.fetch(confirm(service, session), testEnv)).status).toBe(200);
    const original = await delivered(service, testEnv);
    const nextNonce = '8'.repeat(52);
    expect((await worker.fetch(confirm(service, session, nextNonce), testEnv)).status).toBe(200);
    const replacement = await delivered(service, testEnv, nextNonce);
    const tokenKey = service === 'spb' ? 'broker_token' : 'credential';
    expect(replacement[tokenKey]).not.toBe(original[tokenKey]);
    await accepted(service, replacement, testEnv);

    await workerEnv.DB.prepare(`CREATE TRIGGER reject_handoff BEFORE INSERT ON service_handoffs
      BEGIN SELECT RAISE(ABORT, 'fixture handoff failure'); END`).run();
    try {
      const failed = await worker.fetch(confirm(service, session, '9'.repeat(52)), testEnv);
      expect(failed.status).toBe(503);
      await accepted(service, replacement, testEnv);
      const rows = await workerEnv.DB.prepare('SELECT handoff_hash FROM service_handoffs').all();
      expect(rows.results).toHaveLength(2);
    } finally {
      await workerEnv.DB.prepare('DROP TRIGGER reject_handoff').run();
    }
  });
});
