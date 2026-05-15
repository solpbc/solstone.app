import { describe, expect, it } from 'vitest';
import { decryptEmail, encryptEmail, hashWithPepper } from '../src/crypto.js';
import { makeTestEnv } from './helpers.js';

describe('crypto helpers', () => {
  it('encryptEmail roundtrips', async () => {
    const env = makeTestEnv();
    const encrypted = await encryptEmail('person@example.com', env);
    await expect(decryptEmail(encrypted, env)).resolves.toBe('person@example.com');
  });

  it('encryptEmail produces different ciphertexts for the same plaintext', async () => {
    const env = makeTestEnv();
    const first = await encryptEmail('person@example.com', env);
    const second = await encryptEmail('person@example.com', env);
    expect(first).not.toBe(second);
  });

  it('hashWithPepper is deterministic', async () => {
    const env = makeTestEnv();
    await expect(hashWithPepper('value', env)).resolves.toBe(await hashWithPepper('value', env));
  });

  it('hashWithPepper is pepper-sensitive', async () => {
    const env = makeTestEnv();
    const otherEnv = { ...env, HMAC_PEPPER: 'different-pepper' };
    expect(await hashWithPepper('value', env)).not.toBe(await hashWithPepper('value', otherEnv));
  });
});
