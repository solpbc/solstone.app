import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { encryptEmail, hashServiceHandoffNonce } from '../src/crypto.js';
import { makeTestEnv, resetDb, seedAccount } from './helpers.js';

// The journal gives up on a backup handoff poll after 15 s (solstone-journal
// core/crates/solstone-core-backup-web/src/handoff_poll.rs, HANDOFF_POLL_TIMEOUT)
// and asks again. A poll still open here after the journal has gone can consume
// the owner's consent and answer nobody, and the journal's next poll then reads
// 410 and reports the turn-on expired. Every poll must answer well inside that
// timeout, leaving room for the network on both ends.
const JOURNAL_POLL_TIMEOUT_MS = 15_000;
const NETWORK_MARGIN_MS = 3_000;
const ANSWER_BY_MS = JOURNAL_POLL_TIMEOUT_MS - NETWORK_MARGIN_MS;

const NONCE = '5'.repeat(52);
const SPB_PAYLOAD = {
  broker_endpoint: 'https://services.solstone.app',
  account_id: 'acct_spb_poll_budget',
  instance_id: '11111111-1111-1111-1111-111111111111',
  bucket: 'solstone-backups',
  prefix: 'users/acct_spb_poll_budget/11111111-1111-1111-1111-111111111111/',
  broker_token: 'spb-broker-token',
  status: 'approved',
};

describe('handoff long-poll budget', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  for (const service of ['backup', 'spl', 'spp', 'solstone-me']) {
    it(`/handoff/${service} answers an empty poll inside the journal's client timeout`, async () => {
      vi.useFakeTimers();
      const settled = track(worker.fetch(
        new Request(`https://services.solstone.app/handoff/${service}?nonce=${NONCE}`),
        makeTestEnv()
      ));
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(ANSWER_BY_MS);

      expect(settled.done).toBe(true);
      expect((await settled.promise).status).toBe(204);
    });
  }

  it('a backup poll has answered before the journal gives up on it, so only the next poll takes the consent', async () => {
    vi.useFakeTimers();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const url = `https://services.solstone.app/handoff/backup?nonce=${NONCE}`;

    // The journal's first poll. Fake time gives D1 no latency, so the margin is asserted
    // directly: the poll must be over with room to spare before the journal's 15 s timeout.
    const abandoned = track(worker.fetch(new Request(url), testEnv));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(ANSWER_BY_MS);
    expect(abandoned.done).toBe(true);
    await vi.advanceTimersByTimeAsync(JOURNAL_POLL_TIMEOUT_MS - ANSWER_BY_MS);

    // The journal asks again, and the owner then approves.
    const next = track(worker.fetch(new Request(url), testEnv));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);
    await insertSpbHandoff({ testEnv, accountId: account.accountId });
    await vi.advanceTimersByTimeAsync(ANSWER_BY_MS);

    // Only the poll the journal is still waiting on may take the consent.
    expect(abandoned.done).toBe(true);
    expect(next.done).toBe(true);
    const [gone, answer] = await Promise.all([abandoned.promise, next.promise]);
    expect({ abandoned: gone.status, next: answer.status }).toEqual({ abandoned: 204, next: 200 });
    await expect(answer.json()).resolves.toEqual(SPB_PAYLOAD);
  });
});

function track(promise) {
  const state = { done: false, promise };
  promise.then(() => { state.done = true; }, () => { state.done = true; });
  return state;
}

async function insertSpbHandoff({ testEnv, accountId }) {
  const nowMs = Date.now();
  await workerEnv.DB
    .prepare(
      `INSERT INTO service_handoffs (
         handoff_hash, account_id, service, payload_encrypted, created_at, expires_at
       ) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      await hashServiceHandoffNonce(NONCE, testEnv),
      accountId,
      'spb',
      await encryptEmail(JSON.stringify(SPB_PAYLOAD), testEnv),
      nowMs,
      nowMs + 60_000
    )
    .run();
}
