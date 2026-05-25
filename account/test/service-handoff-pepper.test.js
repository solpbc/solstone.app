import { describe, expect, it } from 'vitest';
import { deriveServiceHandoffPepper, hashServiceHandoffNonce } from '../src/crypto.js';
import { installConsoleSpy, makeTestEnv } from './helpers.js';

describe('service handoff pepper', () => {
  it('derives a stable 32-byte pepper from DISPATCH_TOKEN_PEPPER', async () => {
    const testEnv = makeTestEnv();
    const first = await deriveServiceHandoffPepper(testEnv);
    const second = await deriveServiceHandoffPepper(testEnv);
    const changed = await deriveServiceHandoffPepper({
      ...testEnv,
      DISPATCH_TOKEN_PEPPER: 'different-dispatch-pepper',
    });

    expect(Array.from(first)).toEqual(Array.from(second));
    expect(first).toBeInstanceOf(Uint8Array);
    expect(first).toHaveLength(32);
    expect(Array.from(first)).not.toEqual(Array.from(changed));
  });

  it('hashes handoff nonces with HMAC output and does not log nonce material', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const nonce = '2'.repeat(52);
    try {
      const first = await hashServiceHandoffNonce(nonce, testEnv);
      const second = await hashServiceHandoffNonce(nonce, testEnv);
      const other = await hashServiceHandoffNonce('3'.repeat(52), testEnv);

      expect(first).toBe(second);
      expect(first).toMatch(/^[a-f0-9]{64}$/);
      expect(other).not.toBe(first);
      spy.assertNoSecrets([nonce, first]);
    } finally {
      spy.restore();
    }
  });
});
