import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apnsJwtCacheKey,
  cachedApnsJwt,
  mintApnsJwt,
} from '../src/push.js';
import { installConsoleSpy, makeFakeKv, makeTestEnv, TEST_APNS_P8_PEM } from './helpers.js';

describe('APNs JWT minting', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mints a 3-part ES256 JWT with expected header, claims, and raw signature', async () => {
    const testEnv = apnsEnv();
    const before = Math.floor(Date.now() / 1000);

    const token = await mintApnsJwt(testEnv);

    const parts = token.split('.');
    const after = Math.floor(Date.now() / 1000);
    expect(parts).toHaveLength(3);
    expect(decodeJwtPart(parts[0])).toEqual({ alg: 'ES256', kid: testEnv.APNS_KEY_ID, typ: 'JWT' });
    const claims = decodeJwtPart(parts[1]);
    expect(claims.iss).toBe(testEnv.APNS_TEAM_ID);
    expect(Number.isInteger(claims.iat)).toBe(true);
    expect(claims.iat).toBeGreaterThanOrEqual(before);
    expect(claims.iat).toBeLessThanOrEqual(after);
    expect(base64UrlDecode(parts[2]).byteLength).toBe(64);
  });

  it('caches APNs JWTs in KV with a 3300 second TTL', async () => {
    const kv = makeFakeKv();
    const testEnv = apnsEnv({ GCP_TOKEN_CACHE: kv });

    const first = await cachedApnsJwt(testEnv);
    const second = await cachedApnsJwt({ ...testEnv, APNS_KEY_P8: 'invalid-pem' });

    expect(second).toBe(first);
    expect(kv.puts).toHaveLength(1);
    expect(kv.puts[0]).toMatchObject({
      key: `apns_jwt:${testEnv.APNS_KEY_ID}:v1`,
      value: first,
      options: { expirationTtl: 3300 },
    });
  });

  it('scopes the cache key by APNs key id', () => {
    const testEnv = apnsEnv();

    expect(apnsJwtCacheKey(testEnv)).toBe(`apns_jwt:${testEnv.APNS_KEY_ID}:v1`);
    expect(apnsJwtCacheKey({ ...testEnv, APNS_KEY_ID: 'APNSKEY2' }))
      .toBe('apns_jwt:APNSKEY2:v1');
  });

  it('does not log PEM, JWT, or signature material', async () => {
    const spy = installConsoleSpy();
    const token = await mintApnsJwt(apnsEnv());
    const signature = token.split('.')[2];

    spy.assertNoSecrets([TEST_APNS_P8_PEM, token, signature]);
    spy.restore();
  });
});

function apnsEnv(overrides = {}) {
  return makeTestEnv({
    APNS_TEAM_ID: 'TEAM123',
    APNS_KEY_ID: 'APNSKEY1',
    APNS_KEY_P8: TEST_APNS_P8_PEM,
    APNS_BUNDLE_ID: 'app.solstone.swift',
    APNS_ENV: 'production',
    ...overrides,
  });
}

function decodeJwtPart(part) {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(part)));
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
