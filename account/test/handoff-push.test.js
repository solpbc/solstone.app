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

describe('/handoff/push', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects malformed nonces without setting cookies or varying by cookie', async () => {
    const response = await worker.fetch(
      new Request('https://services.solstone.app/handoff/push?nonce=bad'),
      makeTestEnv()
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.has('Set-Cookie')).toBe(false);
    expect(response.headers.has('Vary')).toBe(false);
  });

  it('atomically consumes a push handoff once and returns gone after consumption', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const payload = {
      device_id: 'handoff-device',
      dispatch_token: 'handoff-dispatch-token',
      account_id: account.accountId,
      created_at: 1234,
    };
    await insertHandoff({ testEnv, accountId: account.accountId, nonce: VALID_NONCE, payload });
    try {
      const first = await worker.fetch(
        new Request(`https://services.solstone.app/handoff/push?nonce=${VALID_NONCE}`),
        testEnv
      );
      const body = await first.json();
      const second = await worker.fetch(
        new Request(`https://services.solstone.app/handoff/push?nonce=${VALID_NONCE}`),
        testEnv
      );

      expect(first.status).toBe(200);
      expect(first.headers.get('Cache-Control')).toBe('no-store');
      expect(first.headers.has('Set-Cookie')).toBe(false);
      expect(first.headers.has('Vary')).toBe(false);
      expect(body).toEqual(payload);
      expect(second.status).toBe(410);
      await expect(second.json()).resolves.toEqual({ error: 'gone' });
      spy.assertNoSecrets([VALID_NONCE, payload.device_id, payload.dispatch_token]);
    } finally {
      spy.restore();
    }
  });

  it('allows only one concurrent poller to consume a ready push handoff', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await insertHandoff({
      testEnv,
      accountId: account.accountId,
      nonce: VALID_NONCE,
      payload: {
        device_id: 'race-device',
        dispatch_token: 'race-dispatch-token',
        account_id: account.accountId,
        created_at: 5678,
      },
    });
    try {
      const [first, second] = await Promise.all([
        worker.fetch(new Request(`https://services.solstone.app/handoff/push?nonce=${VALID_NONCE}`), testEnv),
        worker.fetch(new Request(`https://services.solstone.app/handoff/push?nonce=${VALID_NONCE}`), testEnv),
      ]);
      const ok = [first, second].filter((response) => response.status === 200);
      const gone = [first, second].filter((response) => response.status === 410);

      expect(ok).toHaveLength(1);
      expect(gone).toHaveLength(1);
      await expect(ok[0].json()).resolves.toMatchObject({
        device_id: 'race-device',
        dispatch_token: 'race-dispatch-token',
      });
      await expect(gone[0].json()).resolves.toEqual({ error: 'gone' });
      spy.assertNoSecrets([VALID_NONCE, 'race-device', 'race-dispatch-token']);
    } finally {
      spy.restore();
    }
  });

  it('returns 204 after the long-poll budget when no push handoff exists', async () => {
    vi.useFakeTimers();
    const pending = worker.fetch(
      new Request(`https://services.solstone.app/handoff/push?nonce=${VALID_NONCE}`),
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

  it('does not serve scout rows through the push handoff endpoint', async () => {
    vi.useFakeTimers();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await insertHandoff({
      testEnv,
      accountId: account.accountId,
      nonce: VALID_NONCE,
      service: 'scout',
      payload: {
        state: 'ready',
        dispatch_token: 'scout-dispatch',
        account_id: account.accountId,
        created_at: 1,
      },
    });

    const pending = worker.fetch(
      new Request(`https://services.solstone.app/handoff/push?nonce=${VALID_NONCE}`),
      testEnv
    );
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(31_500);
    const response = await pending;

    expect(response.status).toBe(204);
  });

  it('ignores cookies when polling push handoffs', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const payload = {
      device_id: 'cookie-device',
      dispatch_token: 'cookie-dispatch',
      account_id: account.accountId,
      created_at: 9012,
    };
    await insertHandoff({ testEnv, accountId: account.accountId, nonce: VALID_NONCE, payload });
    await insertHandoff({ testEnv, accountId: account.accountId, nonce: OTHER_NONCE, payload });

    const noCookie = await responseSnapshot(await worker.fetch(
      new Request(`https://services.solstone.app/handoff/push?nonce=${VALID_NONCE}`),
      testEnv
    ));
    const withCookie = await responseSnapshot(await worker.fetch(
      new Request(`https://services.solstone.app/handoff/push?nonce=${OTHER_NONCE}`, {
        headers: { Cookie: 'account_session=unrelated' },
      }),
      testEnv
    ));

    expect(withCookie).toEqual(noCookie);
  });
});

async function insertHandoff({ testEnv, accountId, nonce, payload, service = 'push' }) {
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
