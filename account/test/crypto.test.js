import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decryptEmail,
  encryptEmail,
  generateOtp,
  hashWithPepper,
  normalizeCode,
  timingSafeEqual,
} from '../src/crypto.js';
import { makeTestEnv } from './helpers.js';

describe('crypto helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('generateOtp returns a six digit numeric string', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateOtp()).toMatch(/^\d{6}$/);
    }
  });

  it('generateOtp pads low values', () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      array[0] = 42;
      return array;
    });
    expect(generateOtp()).toBe('000042');
  });

  it('generateOtp rejects threshold values before modulo', () => {
    const values = [4_294_000_000, 1_000_001];
    const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      array[0] = values.shift();
      return array;
    });
    expect(generateOtp()).toBe('000001');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('normalizeCode strips whitespace', () => {
    expect(normalizeCode(' 123  456\n')).toBe('123456');
  });

  it('timingSafeEqual returns true for equal strings', () => {
    expect(timingSafeEqual('123456', '123456')).toBe(true);
  });

  it('timingSafeEqual returns false for unequal strings', () => {
    expect(timingSafeEqual('123456', '654321')).toBe(false);
  });

  it('timingSafeEqual returns false for length mismatch or non-strings', () => {
    expect(timingSafeEqual('123456', '12345')).toBe(false);
    expect(timingSafeEqual('123456', null)).toBe(false);
  });
});
