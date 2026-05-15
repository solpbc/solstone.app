import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import {
  finishRequest,
  makeTestEnv,
  resetDb,
  responseSnapshot,
  rowCount,
  seedNonce,
} from './helpers.js';

describe('/signin/finish', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('enforces nonce single-use via update changes', async () => {
    const testEnv = makeTestEnv();
    const { nonce } = await seedNonce('single@example.com');
    const first = await worker.fetch(finishRequest(nonce), testEnv);
    const second = await worker.fetch(finishRequest(nonce), testEnv);
    expect(first.status).toBe(303);
    expect(second.status).toBe(200);
    expect(await responseSnapshot(second)).toEqual(
      await responseSnapshot(await worker.fetch(finishRequest('never-existed'), testEnv))
    );
  });

  it('concurrent verifies for a new email create exactly one account and one email row', async () => {
    const testEnv = makeTestEnv();
    const first = await seedNonce('race@example.com');
    const second = await seedNonce('race@example.com');
    const responses = await Promise.all([
      worker.fetch(finishRequest(first.nonce), testEnv),
      worker.fetch(finishRequest(second.nonce), testEnv),
    ]);
    expect(responses.map((response) => response.status)).toEqual([303, 303]);
    expect(await rowCount('accounts')).toBe(1);
    expect(await rowCount('account_emails')).toBe(1);
  });

  it('returns byte-identical invalid-link responses for never-existed, consumed, and expired nonces', async () => {
    const testEnv = makeTestEnv();
    const consumed = await seedNonce('consumed@example.com', { consumed: true });
    const expired = await seedNonce('expired@example.com', { expired: true });

    const neverSnapshot = await responseSnapshot(await worker.fetch(finishRequest('never-existed'), testEnv));
    const consumedSnapshot = await responseSnapshot(await worker.fetch(finishRequest(consumed.nonce), testEnv));
    const expiredSnapshot = await responseSnapshot(await worker.fetch(finishRequest(expired.nonce), testEnv));

    expect(consumedSnapshot).toEqual(neverSnapshot);
    expect(expiredSnapshot).toEqual(neverSnapshot);
  });
});
