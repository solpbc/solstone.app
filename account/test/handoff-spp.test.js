import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { encryptEmail, hashServiceHandoffNonce } from '../src/crypto.js';
import {
  installConsoleSpy,
  makeTestEnv,
  resetDb,
  seedAccount,
} from './helpers.js';

const VALID_NONCE = '2'.repeat(52);
const OTHER_NONCE = '3'.repeat(52);
const THIRD_NONCE = '4'.repeat(52);
const FOURTH_NONCE = '5'.repeat(52);
const SPP_PAYLOAD = {
  state: 'approved',
  endpoint_url: 'https://processing.solstone.app',
  served_model_id: 'Qwen/Qwen3.5-4B',
  credential: 'spp-credential-token',
  account_id: 'acct_spp_handoff',
  instance_id: '11111111-1111-1111-1111-111111111111',
  created_at: '2026-01-01T00:00:00.000Z',
};

describe('/handoff/spp', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects malformed nonces without setting cookies or varying by cookie', async () => {
    const response = await worker.fetch(
      new Request('https://services.solstone.app/handoff/spp?nonce=bad'),
      makeTestEnv()
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.has('Set-Cookie')).toBe(false);
    expect(response.headers.has('Vary')).toBe(false);
  });

  it('atomically consumes an spp handoff once and returns gone after consumption', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await insertHandoff({ testEnv, accountId: account.accountId, nonce: VALID_NONCE, payload: SPP_PAYLOAD });
    try {
      const first = await worker.fetch(
        new Request(`https://services.solstone.app/handoff/spp?nonce=${VALID_NONCE}`),
        testEnv
      );
      const body = await first.json();
      const second = await worker.fetch(
        new Request(`https://services.solstone.app/handoff/spp?nonce=${VALID_NONCE}`),
        testEnv
      );

      expect(first.status).toBe(200);
      expect(first.headers.get('Cache-Control')).toBe('no-store');
      expect(first.headers.has('Set-Cookie')).toBe(false);
      expect(first.headers.has('Vary')).toBe(false);
      expect(body).toEqual(SPP_PAYLOAD);
      expect(second.status).toBe(410);
      await expect(second.json()).resolves.toEqual({ error: 'gone' });
      spy.assertNoSecrets([VALID_NONCE, SPP_PAYLOAD.credential]);
    } finally {
      spy.restore();
    }
  });

  it('allows only one concurrent poller to consume a ready spp handoff', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await insertHandoff({ testEnv, accountId: account.accountId, nonce: VALID_NONCE, payload: SPP_PAYLOAD });
    try {
      const [first, second] = await Promise.all([
        worker.fetch(new Request(`https://services.solstone.app/handoff/spp?nonce=${VALID_NONCE}`), testEnv),
        worker.fetch(new Request(`https://services.solstone.app/handoff/spp?nonce=${VALID_NONCE}`), testEnv),
      ]);
      const ok = [first, second].filter((response) => response.status === 200);
      const gone = [first, second].filter((response) => response.status === 410);

      expect(ok).toHaveLength(1);
      expect(gone).toHaveLength(1);
      await expect(ok[0].json()).resolves.toEqual(SPP_PAYLOAD);
      await expect(gone[0].json()).resolves.toEqual({ error: 'gone' });
      spy.assertNoSecrets([VALID_NONCE, SPP_PAYLOAD.credential]);
    } finally {
      spy.restore();
    }
  });

  it('returns 204 after the long-poll budget when no spp handoff exists', async () => {
    vi.useFakeTimers();
    const pending = worker.fetch(
      new Request(`https://services.solstone.app/handoff/spp?nonce=${VALID_NONCE}`),
      makeTestEnv()
    );
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(31_500);
    const response = await pending;

    expect(response.status).toBe(204);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.has('Set-Cookie')).toBe(false);
    expect(response.headers.has('Vary')).toBe(false);
  });

  it('does not serve scout, push, spl, or spb rows through the spp handoff endpoint', async () => {
    vi.useFakeTimers();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const rows = [
      { nonce: VALID_NONCE, service: 'scout' },
      { nonce: OTHER_NONCE, service: 'push' },
      { nonce: THIRD_NONCE, service: 'spl' },
      { nonce: FOURTH_NONCE, service: 'spb' },
    ];
    for (const row of rows) {
      await insertHandoff({
        testEnv,
        accountId: account.accountId,
        nonce: row.nonce,
        service: row.service,
        payload: { service: row.service, credential: `${row.service}-credential` },
      });
    }

    const pending = rows.map(({ nonce }) => worker.fetch(
      new Request(`https://services.solstone.app/handoff/spp?nonce=${nonce}`),
      testEnv
    ));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(31_500);
    const responses = await Promise.all(pending);

    for (const response of responses) expect(response.status).toBe(204);
  });

  it('ignores cookies when polling spp handoffs', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await insertHandoff({ testEnv, accountId: account.accountId, nonce: VALID_NONCE, payload: SPP_PAYLOAD });
    await insertHandoff({ testEnv, accountId: account.accountId, nonce: OTHER_NONCE, payload: SPP_PAYLOAD });

    const noCookie = await responseSnapshot(await worker.fetch(
      new Request(`https://services.solstone.app/handoff/spp?nonce=${VALID_NONCE}`),
      testEnv
    ));
    const withCookie = await responseSnapshot(await worker.fetch(
      new Request(`https://services.solstone.app/handoff/spp?nonce=${OTHER_NONCE}`, {
        headers: { Cookie: 'account_session=unrelated' },
      }),
      testEnv
    ));

    expect(withCookie).toEqual(noCookie);
  });
});

async function insertHandoff({ testEnv, accountId, nonce, payload, service = 'spp' }) {
  const nowMs = Date.now();
  await workerEnv.DB
    .prepare(
      `INSERT INTO service_handoffs (
         handoff_hash, account_id, service, payload_encrypted, created_at, expires_at
       ) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      await hashServiceHandoffNonce(nonce, testEnv),
      accountId,
      service,
      await encryptEmail(JSON.stringify(payload), testEnv),
      nowMs,
      nowMs + 60_000
    )
    .run();
}

async function responseSnapshot(response) {
  return {
    status: response.status,
    headers: Array.from(response.headers.entries()).sort(([a], [b]) => a.localeCompare(b)),
    body: await response.text(),
  };
}
