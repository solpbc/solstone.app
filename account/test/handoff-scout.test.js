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

describe('/handoff/scout', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects malformed nonces without setting cookies or varying by cookie', async () => {
    const response = await worker.fetch(
      new Request('https://services.solstone.app/handoff/scout?nonce=bad'),
      makeTestEnv()
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.has('Set-Cookie')).toBe(false);
    expect(response.headers.has('Vary')).toBe(false);
  });

  it('atomically consumes a handoff once and returns gone after consumption', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await insertHandoff({
      testEnv,
      accountId: account.accountId,
      nonce: VALID_NONCE,
      payload: {
        google_api_key: 'handoff-google-key',
        dispatch_token: 'handoff-dispatch-token',
        account_id: account.accountId,
        created_at: 1234,
      },
    });
    try {
      const first = await worker.fetch(
        new Request(`https://services.solstone.app/handoff/scout?nonce=${VALID_NONCE}`),
        testEnv
      );
      const payload = await first.json();
      const second = await worker.fetch(
        new Request(`https://services.solstone.app/handoff/scout?nonce=${VALID_NONCE}`),
        testEnv
      );

      expect(first.status).toBe(200);
      expect(first.headers.get('Cache-Control')).toBe('no-store');
      expect(first.headers.has('Set-Cookie')).toBe(false);
      expect(first.headers.has('Vary')).toBe(false);
      expect(payload.google_api_key).toBe('handoff-google-key');
      expect(payload.dispatch_token).toBe('handoff-dispatch-token');
      expect(second.status).toBe(410);
      spy.assertNoSecrets([VALID_NONCE, 'handoff-google-key', 'handoff-dispatch-token']);
    } finally {
      spy.restore();
    }
  });

  it('allows only one concurrent poller to consume a ready handoff', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await insertHandoff({
      testEnv,
      accountId: account.accountId,
      nonce: VALID_NONCE,
      payload: {
        google_api_key: 'race-google-key',
        dispatch_token: 'race-dispatch-token',
        account_id: account.accountId,
        created_at: 5678,
      },
    });
    try {
      const [first, second] = await Promise.all([
        worker.fetch(new Request(`https://services.solstone.app/handoff/scout?nonce=${VALID_NONCE}`), testEnv),
        worker.fetch(new Request(`https://services.solstone.app/handoff/scout?nonce=${VALID_NONCE}`), testEnv),
      ]);

      const ok = [first, second].filter((response) => response.status === 200);
      const gone = [first, second].filter((response) => response.status === 410);

      expect(ok).toHaveLength(1);
      expect(gone).toHaveLength(1);
      await expect(ok[0].json()).resolves.toMatchObject({
        google_api_key: 'race-google-key',
        dispatch_token: 'race-dispatch-token',
      });
      await expect(gone[0].json()).resolves.toEqual({ error: 'gone' });
      spy.assertNoSecrets([VALID_NONCE, 'race-google-key', 'race-dispatch-token']);
    } finally {
      spy.restore();
    }
  });

  it('returns 204 after the long-poll budget when no handoff exists', async () => {
    vi.useFakeTimers();
    const pending = worker.fetch(
      new Request(`https://services.solstone.app/handoff/scout?nonce=${VALID_NONCE}`),
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
});

async function insertHandoff({ testEnv, accountId, nonce, payload }) {
  const nowMs = Date.now();
  await workerEnv.DB
    .prepare(
      `INSERT INTO service_handoffs (
         handoff_hash, account_id, service, payload_encrypted, created_at, expires_at
       ) VALUES (?, ?, 'scout', ?, ?, ?)`
    )
    .bind(
      await hashServiceHandoffNonce(nonce, testEnv),
      accountId,
      await encryptEmail(JSON.stringify(payload), testEnv),
      nowMs,
      nowMs + 60_000
    )
    .run();
}
