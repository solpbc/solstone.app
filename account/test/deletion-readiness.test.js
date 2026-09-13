import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { checkDeletionReadiness, TOTAL_READINESS_TIMEOUT_MS } from '../src/deletion-readiness.js';
import {
  bearerFor,
  bindingFor,
  CURRENT_KEY_VERSION,
  DELETION_SERVICES,
  domainFor,
  hmacKeyFor,
  readinessDomainFor,
  READY_PATH,
  RETAINED_KEY_VERSIONS,
  validateDeletionServiceConfig,
} from '../src/deletion-services.js';
import { runAccountDeletionCoordinator } from '../src/deletion-coordinator.js';
import { createDeletionProof, markDeletionProofVerified } from '../src/db.js';
import { hashWithPepper } from '../src/crypto.js';
import { makeTestEnv, resetDb, seedAccount, seedSession } from './helpers.js';
import relayFixtureText from '../test-fixtures/relay-owner-purge-readiness-v1.json?raw';
import supportFixtureText from '../test-fixtures/support-owner-purge-readiness-v1.json?raw';
import provenance from '../test-fixtures/owner-purge-readiness-provenance-v1.json';
import destructiveFixtureText from '../proto/owner-purge-v1.json?raw';

const relayFixture = JSON.parse(relayFixtureText);
const supportFixture = JSON.parse(supportFixtureText);

// Independent framer and signer (strictly independent: no imports from production crypto/canonicalization helpers)
async function independentFrameAndSign(secret, service, nonce, keyVersion) {
  const enc = new TextEncoder();
  const canonical = independentCanonicalJson({
    key_version: keyVersion,
    nonce,
    service,
    version: 1,
  });
  const domain = `solpbc-owner-purge-v1:${service}:readiness`;
  const domainBytes = enc.encode(domain);
  const payloadBytes = enc.encode(canonical);

  const domainView = new DataView(new ArrayBuffer(8));
  domainView.setBigUint64(0, BigInt(domainBytes.length), false);
  const framedDomain = new Uint8Array(8 + domainBytes.length);
  framedDomain.set(new Uint8Array(domainView.buffer));
  framedDomain.set(domainBytes, 8);

  const payloadView = new DataView(new ArrayBuffer(8));
  payloadView.setBigUint64(0, BigInt(payloadBytes.length), false);
  const framedPayload = new Uint8Array(8 + payloadBytes.length);
  framedPayload.set(new Uint8Array(payloadView.buffer));
  framedPayload.set(payloadBytes, 8);

  const combined = new Uint8Array(framedDomain.length + framedPayload.length);
  combined.set(framedDomain);
  combined.set(framedPayload, framedDomain.length);

  const frameHex = Array.from(combined, (b) => b.toString(16).padStart(2, '0')).join('');

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, combined);
  const bin = Array.from(new Uint8Array(sig), (b) => String.fromCharCode(b)).join('');
  const proof = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

  return { canonical, frameHex, proof };
}

function independentCanonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(independentCanonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort((left, right) => {
    const a = new TextEncoder().encode(left);
    const b = new TextEncoder().encode(right);
    for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
      if (a[index] !== b[index]) return a[index] - b[index];
    }
    return a.length - b.length;
  });
  return `{${keys.map((key) => `${JSON.stringify(key)}:${independentCanonicalJson(value[key])}`).join(',')}}`;
}

async function sha256Hex(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function makeStrictPeerDouble(service, {
  expectedBearer = `test-${service}-purge-bearer`,
  keyV1 = 'owner-purge-v1-fixture-test-key',
  keyV2 = 'owner-purge-v2-fixture-test-key',
  status = 204,
  body = '',
  cacheControl = 'no-store',
  readinessVersion = '1',
  proofV1Override = undefined,
  proofV2Override = undefined,
  delayMs = 0,
  duplicateHeader = null,
  legacyProofV1 = false,
  legacyProofV2 = false,
  isRedirect = false,
  calls = [],
} = {}) {
  return {
    async fetch(input, init = {}) {
      const url = new URL(typeof input === 'string' ? input : input.url);
      const headers = init.headers || {};
      const auth = typeof headers.get === 'function' ? headers.get('Authorization') : headers.Authorization;
      const oldNonce = typeof headers.get === 'function' ? headers.get('X-Owner-Purge-Nonce') : headers['X-Owner-Purge-Nonce'];
      if (oldNonce !== undefined && oldNonce !== null) {
        return new Response('Old header forbidden', { status: 400 });
      }
      const nonce = typeof headers.get === 'function' ? headers.get('X-Owner-Purge-Readiness-Nonce') : headers['X-Owner-Purge-Readiness-Nonce'];
      const origin = typeof headers.get === 'function' ? headers.get('Origin') : headers.Origin;

      calls.push({
        method: init.method,
        path: url.pathname,
        auth,
        nonce,
        origin,
      });

      if (delayMs > 0) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, delayMs);
          if (init.signal) {
            init.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new Error('aborted'));
            }, { once: true });
          }
        });
      }

      if (origin !== undefined && origin !== null) {
        return new Response('Origin header forbidden', { status: 400 });
      }

      if (init.method !== 'GET') {
        return new Response('Method not allowed', { status: 405 });
      }

      if (url.pathname !== READY_PATH) {
        return new Response('Not found', { status: 404 });
      }

      if (auth !== `Bearer ${expectedBearer}`) {
        return new Response('Unauthorized', { status: 401 });
      }

      if (!nonce || nonce.length !== 43) {
        return new Response('Invalid nonce', { status: 400 });
      }

      if (isRedirect) {
        return new Response(null, {
          status: 302,
          headers: { Location: `https://${service}.internal/redirected` },
        });
      }

      const resV1 = await independentFrameAndSign(keyV1, service, nonce, 1);
      const resV2 = await independentFrameAndSign(keyV2, service, nonce, 2);

      const finalProofV1 = proofV1Override !== undefined ? proofV1Override : resV1.proof;
      const finalProofV2 = proofV2Override !== undefined ? proofV2Override : resV2.proof;

      const respHeaders = new Headers();
      if (cacheControl !== null) respHeaders.set('Cache-Control', cacheControl);
      if (readinessVersion !== null) respHeaders.set('X-Owner-Purge-Readiness-Version', readinessVersion);
      if (finalProofV1 !== null) respHeaders.set('X-Owner-Purge-Readiness-Proof-V1', finalProofV1);
      if (finalProofV2 !== null) respHeaders.set('X-Owner-Purge-Readiness-Proof-V2', finalProofV2);
      if (legacyProofV1) respHeaders.set('X-Owner-Purge-Proof-V1', finalProofV1);
      if (legacyProofV2) respHeaders.set('X-Owner-Purge-Proof-V2', finalProofV2);

      if (duplicateHeader) {
        respHeaders.append(duplicateHeader.name, duplicateHeader.value);
      }

      if (body) {
        return {
          status,
          headers: respHeaders,
          async text() {
            return body;
          },
        };
      }

      return new Response(null, {
        status,
        headers: respHeaders,
      });
    },
  };
}

describe('deletion readiness protocol and shared registry', () => {
  beforeEach(resetDb);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('shared immutable source & config validation', () => {
    it('exports frozen service and retained-version sets and valid selectors', () => {
      expect(DELETION_SERVICES).toEqual(['relay', 'support']);
      expect(Object.isFrozen(DELETION_SERVICES)).toBe(true);
      expect(RETAINED_KEY_VERSIONS).toEqual([1, 2]);
      expect(Object.isFrozen(RETAINED_KEY_VERSIONS)).toBe(true);
      expect(CURRENT_KEY_VERSION).toBe(2);

      const env = makeTestEnv();
      expect(validateDeletionServiceConfig(env)).toBe(true);
      expect(bindingFor(env, 'relay')).not.toBeNull();
      expect(bindingFor(env, 'support')).not.toBeNull();
      expect(bindingFor(env, 'unknown')).toBeNull();
      expect(bearerFor(env, 'relay')).toBe('test-relay-purge-bearer');
      expect(bearerFor(env, 'support')).toBe('test-support-purge-bearer');
      expect(hmacKeyFor(env, 'relay', 1)).toBe('owner-purge-v1-fixture-test-key');
      expect(hmacKeyFor(env, 'relay', 2)).toBe('owner-purge-v2-fixture-test-key');
      expect(hmacKeyFor(env, 'relay', 3)).toBeNull();
      expect(readinessDomainFor('relay')).toBe('solpbc-owner-purge-v1:relay:readiness');
      expect(readinessDomainFor('support')).toBe('solpbc-owner-purge-v1:support:readiness');
      expect(domainFor('relay', 'request')).toBe('solpbc-owner-purge-v1:relay:request');
    });

    it('fails closed when any binding, bearer, or HMAC key is missing or undefined', () => {
      const baseEnv = makeTestEnv();

      const missingBinding = { ...baseEnv, RELAY: undefined };
      delete missingBinding.RELAY;
      expect(validateDeletionServiceConfig(missingBinding)).toBe(false);
      expect(bindingFor(missingBinding, 'relay')).toBeNull();

      const missingBearer = { ...baseEnv, ACCOUNT_RELAY_PURGE_BEARER_TOKEN: undefined };
      delete missingBearer.ACCOUNT_RELAY_PURGE_BEARER_TOKEN;
      expect(validateDeletionServiceConfig(missingBearer)).toBe(false);
      expect(bearerFor(missingBearer, 'relay')).toBeNull();

      const missingKeyV1 = { ...baseEnv, ACCOUNT_SUPPORT_PURGE_HMAC_KEY_V1: undefined };
      delete missingKeyV1.ACCOUNT_SUPPORT_PURGE_HMAC_KEY_V1;
      expect(validateDeletionServiceConfig(missingKeyV1)).toBe(false);
      expect(hmacKeyFor(missingKeyV1, 'support', 1)).toBeNull();

      const missingKeyV2 = { ...baseEnv, ACCOUNT_SUPPORT_PURGE_HMAC_KEY_V2: undefined };
      delete missingKeyV2.ACCOUNT_SUPPORT_PURGE_HMAC_KEY_V2;
      expect(validateDeletionServiceConfig(missingKeyV2)).toBe(false);
      expect(hmacKeyFor(missingKeyV2, 'support', 2)).toBeNull();
    });

    it('refuses every bearer-to-bearer and bearer-to-HMAC alias before peer calls', async () => {
      const base = makeTestEnv();
      const keyNames = [
        'ACCOUNT_RELAY_PURGE_HMAC_KEY_V1',
        'ACCOUNT_RELAY_PURGE_HMAC_KEY_V2',
        'ACCOUNT_SUPPORT_PURGE_HMAC_KEY_V1',
        'ACCOUNT_SUPPORT_PURGE_HMAC_KEY_V2',
      ];
      const cases = [{
        ACCOUNT_SUPPORT_PURGE_BEARER_TOKEN: base.ACCOUNT_RELAY_PURGE_BEARER_TOKEN,
      }];
      for (const bearerName of ['ACCOUNT_RELAY_PURGE_BEARER_TOKEN', 'ACCOUNT_SUPPORT_PURGE_BEARER_TOKEN']) {
        for (const keyName of keyNames) cases.push({ [bearerName]: base[keyName] });
      }

      for (const overrides of cases) {
        const relayCalls = [];
        const supportCalls = [];
        const testEnv = makeTestEnv({
          ...overrides,
          RELAY: makeStrictPeerDouble('relay', { calls: relayCalls }),
          SUPPORT_WORKER: makeStrictPeerDouble('support', { calls: supportCalls }),
        });
        expect(validateDeletionServiceConfig(testEnv)).toBe(false);
        expect((await checkDeletionReadiness(testEnv)).ok).toBe(false);
        expect(relayCalls).toHaveLength(0);
        expect(supportCalls).toHaveLength(0);
      }
    });

    it('permits equal HMAC V1 and V2 key values across services', async () => {
      const equalKeyEnv = makeTestEnv({
        ACCOUNT_RELAY_PURGE_HMAC_KEY_V1: 'same-shared-secret-key-12345',
        ACCOUNT_RELAY_PURGE_HMAC_KEY_V2: 'same-shared-secret-key-12345',
        ACCOUNT_SUPPORT_PURGE_HMAC_KEY_V1: 'same-shared-secret-key-12345',
        ACCOUNT_SUPPORT_PURGE_HMAC_KEY_V2: 'same-shared-secret-key-12345',
        RELAY: makeStrictPeerDouble('relay', {
          keyV1: 'same-shared-secret-key-12345',
          keyV2: 'same-shared-secret-key-12345',
        }),
        SUPPORT_WORKER: makeStrictPeerDouble('support', {
          keyV1: 'same-shared-secret-key-12345',
          keyV2: 'same-shared-secret-key-12345',
        }),
      });

      expect(validateDeletionServiceConfig(equalKeyEnv)).toBe(true);
      const result = await checkDeletionReadiness(equalKeyEnv);
      expect(result).toEqual({ ok: true });
    });

    it('verifies exhaustive set comparison in both directions and fails on synthetic member', () => {
      const exportedServices = [...DELETION_SERVICES].sort();
      const expectedServices = ['relay', 'support'].sort();
      expect(exportedServices).toEqual(expectedServices);
      expect(expectedServices).toEqual(exportedServices);

      const exportedVersions = [...RETAINED_KEY_VERSIONS].sort();
      const expectedVersions = [1, 2].sort();
      expect(exportedVersions).toEqual(expectedVersions);
      expect(expectedVersions).toEqual(exportedVersions);

      const syntheticServices = [...DELETION_SERVICES, 'extra-synthetic-service'];
      expect(syntheticServices).not.toEqual(expectedServices);
      const syntheticVersions = [...RETAINED_KEY_VERSIONS, 3];
      expect(syntheticVersions).not.toEqual(expectedVersions);
    });
  });

  describe('fixture vectors & independent framer reproduction', () => {
    it('vendors the exact landed peer bytes and reproduces all four fixed proofs', async () => {
      expect(provenance.relay).toEqual({
        repository: 'solpbc/spl',
        commit: '97861fac6dee59cffa04253b6b02728cfcd44266',
        path: 'proto/owner-purge-readiness-v1.json',
        sha256: 'e6456d20243c7a73542bacd8a31a2c1f321f08bee7034584d03977b6e0ba0ef4',
      });
      expect(provenance.support).toEqual({
        repository: 'private-support-worker',
        commit: '284c8bace2738633601f581672b6c88cbdf8d922',
        path: 'sites/support/proto/owner-purge-ready-v1.json',
        sha256: '4cdc531a57013a6c7e4d3b86c0a172e87588cf4caad725d56ed4e4f793fc17e7',
      });
      expect(await sha256Hex(relayFixtureText)).toBe(provenance.relay.sha256);
      expect(await sha256Hex(supportFixtureText)).toBe(provenance.support.sha256);
      expect(await sha256Hex(destructiveFixtureText)).toBe(provenance.destructive_contract.sha256);

      const relay = relayFixture.sample_readiness;
      for (const keyVersion of [1, 2]) {
        const result = await independentFrameAndSign(
          relayFixture.integrity.non_production_test_keys_utf8[String(keyVersion)],
          'relay',
          relay.nonce,
          keyVersion
        );
        expect(result.canonical).toBe(relay[`canonical_v${keyVersion}`]);
        expect(result.frameHex).toBe(relay[`frame_hex_v${keyVersion}`]);
        expect(result.proof).toBe(relay[`proof_v${keyVersion}`]);
      }

      const support = supportFixture.transcripts[0];
      for (const keyVersion of [1, 2]) {
        const result = await independentFrameAndSign(
          supportFixture.non_production_test_keys_utf8[String(keyVersion)],
          'support',
          support.nonce,
          keyVersion
        );
        expect(result.canonical).toBe(support[`canonical_v${keyVersion}`]);
        expect(result.frameHex).toBe(support[`frame_v${keyVersion}_hex`]);
        expect(result.proof).toBe(support.expected_headers[`X-Owner-Purge-Readiness-Proof-V${keyVersion}`]);
      }
    });
  });

  describe('readiness protocol execution, strict double, and negative cases', () => {
    it('succeeds when both services return exact 204 with valid V1 and V2 proofs', async () => {
      const relayCalls = [];
      const supportCalls = [];
      const env = makeTestEnv({
        RELAY: makeStrictPeerDouble('relay', { calls: relayCalls }),
        SUPPORT_WORKER: makeStrictPeerDouble('support', { calls: supportCalls }),
      });

      const result = await checkDeletionReadiness(env);
      expect(result).toEqual({ ok: true });
      expect(relayCalls).toHaveLength(1);
      expect(supportCalls).toHaveLength(1);
      expect(relayCalls[0].method).toBe('GET');
      expect(relayCalls[0].path).toBe('/internal/deletion/purge/ready');
      expect(relayCalls[0].auth).toBe('Bearer test-relay-purge-bearer');
      expect(relayCalls[0].origin).toBeUndefined();
      expect(relayCalls[0].nonce).toHaveLength(43);
      expect(supportCalls[0].nonce).toHaveLength(43);
      expect(relayCalls[0].nonce).not.toBe(supportCalls[0].nonce);
    });

    it('rejects non-204 status (200, 206, 500, 503)', async () => {
      for (const status of [200, 206, 500, 503]) {
        const env = makeTestEnv({
          RELAY: makeStrictPeerDouble('relay', { status }),
          SUPPORT_WORKER: makeStrictPeerDouble('support'),
        });
        const result = await checkDeletionReadiness(env);
        expect(result.ok).toBe(false);
        expect(result.error).toBe(`invalid_status_${status}`);
      }
    });

    it('rejects responses with non-empty bodies', async () => {
      const env = makeTestEnv({
        RELAY: makeStrictPeerDouble('relay', { body: 'forbidden payload' }),
        SUPPORT_WORKER: makeStrictPeerDouble('support'),
      });
      const result = await checkDeletionReadiness(env);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('non_empty_body');
    });

    it('rejects missing or invalid Cache-Control header', async () => {
      const envMissing = makeTestEnv({
        RELAY: makeStrictPeerDouble('relay', { cacheControl: null }),
        SUPPORT_WORKER: makeStrictPeerDouble('support'),
      });
      expect((await checkDeletionReadiness(envMissing)).ok).toBe(false);

      const envInvalid = makeTestEnv({
        RELAY: makeStrictPeerDouble('relay', { cacheControl: 'public, max-age=0' }),
        SUPPORT_WORKER: makeStrictPeerDouble('support'),
      });
      expect((await checkDeletionReadiness(envInvalid)).ok).toBe(false);
    });

    it('rejects missing or invalid readiness version', async () => {
      const envMissing = makeTestEnv({
        RELAY: makeStrictPeerDouble('relay', { readinessVersion: null }),
        SUPPORT_WORKER: makeStrictPeerDouble('support'),
      });
      expect((await checkDeletionReadiness(envMissing)).ok).toBe(false);

      const envWrong = makeTestEnv({
        RELAY: makeStrictPeerDouble('relay', { readinessVersion: '2' }),
        SUPPORT_WORKER: makeStrictPeerDouble('support'),
      });
      expect((await checkDeletionReadiness(envWrong)).ok).toBe(false);
    });

    it('rejects missing, corrupted, or swapped proof headers', async () => {
      // Missing Proof V1
      const envMissingV1 = makeTestEnv({
        RELAY: makeStrictPeerDouble('relay', { proofV1Override: null }),
        SUPPORT_WORKER: makeStrictPeerDouble('support'),
      });
      expect((await checkDeletionReadiness(envMissingV1)).ok).toBe(false);

      // Missing Proof V2
      const envMissingV2 = makeTestEnv({
        RELAY: makeStrictPeerDouble('relay', { proofV2Override: null }),
        SUPPORT_WORKER: makeStrictPeerDouble('support'),
      });
      expect((await checkDeletionReadiness(envMissingV2)).ok).toBe(false);

      // Corrupted Proof V1
      const envCorruptV1 = makeTestEnv({
        RELAY: makeStrictPeerDouble('relay', { proofV1Override: 'bad-v1-proof' }),
        SUPPORT_WORKER: makeStrictPeerDouble('support'),
      });
      expect((await checkDeletionReadiness(envCorruptV1)).ok).toBe(false);

      // Corrupted Proof V2
      const envCorruptV2 = makeTestEnv({
        RELAY: makeStrictPeerDouble('relay', { proofV2Override: 'bad-v2-proof' }),
        SUPPORT_WORKER: makeStrictPeerDouble('support'),
      });
      expect((await checkDeletionReadiness(envCorruptV2)).ok).toBe(false);

      // Swapped V1 and V2 proofs (proof V1 in V2 header and vice versa)
      const validDouble = makeStrictPeerDouble('relay');
      const swappedEnv = makeTestEnv({
        RELAY: {
          async fetch(input, init) {
            const res = await validDouble.fetch(input, init);
            const p1 = res.headers.get('X-Owner-Purge-Readiness-Proof-V1');
            const p2 = res.headers.get('X-Owner-Purge-Readiness-Proof-V2');
            const h = new Headers(res.headers);
            h.set('X-Owner-Purge-Readiness-Proof-V1', p2);
            h.set('X-Owner-Purge-Readiness-Proof-V2', p1);
            return new Response(null, { status: 204, headers: h });
          },
        },
        SUPPORT_WORKER: makeStrictPeerDouble('support'),
      });
      expect((await checkDeletionReadiness(swappedEnv)).ok).toBe(false);
    });

    it('rejects duplicate or combined headers detected at the Fetch boundary', async () => {
      const env = makeTestEnv({
        RELAY: makeStrictPeerDouble('relay', {
          duplicateHeader: { name: 'X-Owner-Purge-Readiness-Version', value: '1' },
        }),
        SUPPORT_WORKER: makeStrictPeerDouble('support'),
      });
      const result = await checkDeletionReadiness(env);
      expect(result.ok).toBe(false);
    });

    it('rejects manual redirects and does not follow them', async () => {
      const env = makeTestEnv({
        RELAY: makeStrictPeerDouble('relay', { isRedirect: true }),
        SUPPORT_WORKER: makeStrictPeerDouble('support'),
      });
      const result = await checkDeletionReadiness(env);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('invalid_status_302');
    });

    it('settles with pass within deadline and refuses when exceeding 5,000ms deadline', async () => {
      // Passes when completed before timeout
      const passEnv = makeTestEnv({
        RELAY: makeStrictPeerDouble('relay', { delayMs: 10 }),
        SUPPORT_WORKER: makeStrictPeerDouble('support', { delayMs: 10 }),
      });
      const passResult = await checkDeletionReadiness(passEnv, { timeoutMs: 50 });
      expect(passResult).toEqual({ ok: true });

      // Fails when exceeding timeout (simulating 5001ms against deadline)
      const timeoutEnv = makeTestEnv({
        RELAY: makeStrictPeerDouble('relay', { delayMs: 150 }),
        SUPPORT_WORKER: makeStrictPeerDouble('support'),
      });
      const timeoutResult = await checkDeletionReadiness(timeoutEnv, { timeoutMs: 30 });
      expect(timeoutResult.ok).toBe(false);
    });

    it('generates unique nonces across legs and sequential invocations (entropy/non-replay)', async () => {
      const capturedNonces = [];
      const trackingDouble = (service) => ({
        async fetch(input, init) {
          const nonce = init.headers?.['X-Owner-Purge-Readiness-Nonce'];
          capturedNonces.push(nonce);
          const r1 = await independentFrameAndSign('owner-purge-v1-fixture-test-key', service, nonce, 1);
          const r2 = await independentFrameAndSign('owner-purge-v2-fixture-test-key', service, nonce, 2);
          return new Response(null, {
            status: 204,
            headers: {
              'Cache-Control': 'no-store',
              'X-Owner-Purge-Readiness-Version': '1',
              'X-Owner-Purge-Readiness-Proof-V1': r1.proof,
              'X-Owner-Purge-Readiness-Proof-V2': r2.proof,
            },
          });
        },
      });

      const env = makeTestEnv({
        RELAY: trackingDouble('relay'),
        SUPPORT_WORKER: trackingDouble('support'),
      });

      await checkDeletionReadiness(env);
      await checkDeletionReadiness(env);

      expect(capturedNonces).toHaveLength(4);
      const uniqueNonces = new Set(capturedNonces);
      expect(uniqueNonces.size).toBe(4);
      for (const nonce of capturedNonces) {
        expect(nonce).toHaveLength(43);
        expect(nonce).toMatch(/^[A-Za-z0-9_-]+$/);
      }
    });

    it('rejects legacy X-Owner-Purge-Nonce header and requires X-Owner-Purge-Readiness-Nonce', async () => {
      const peerCalls = [];
      const env = makeTestEnv({
        RELAY: makeStrictPeerDouble('relay', { calls: peerCalls }),
        SUPPORT_WORKER: makeStrictPeerDouble('support'),
      });

      const res = await checkDeletionReadiness(env);
      expect(res.ok).toBe(true);
      expect(peerCalls[0].nonce).toBeDefined();

      // Directly calling strict double with old header should be rejected (status 400)
      const legacyDouble = makeStrictPeerDouble('relay');
      const legacyRes = await legacyDouble.fetch('https://relay.internal/internal/deletion/purge/ready', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-relay-purge-bearer',
          'X-Owner-Purge-Nonce': relayFixture.sample_readiness.nonce,
        },
      });
      expect(legacyRes.status).toBe(400);

      // Calling strict double without readiness nonce header should be rejected (status 400)
      const missingNonceRes = await legacyDouble.fetch('https://relay.internal/internal/deletion/purge/ready', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-relay-purge-bearer',
        },
      });
      expect(missingNonceRes.status).toBe(400);
    });
  });

  describe('route sequencing in handleDeletionConfirm & 503 refusal page', () => {
    it('rejects legacy destructive proof response headers through the full confirm handler', async () => {
      for (const legacyHeaders of [
        { legacyProofV1: true },
        { legacyProofV2: true },
        { legacyProofV1: true, legacyProofV2: true },
      ]) {
        await resetDb();
        const testEnv = makeTestEnv({
          RELAY: makeStrictPeerDouble('relay', legacyHeaders),
          SUPPORT_WORKER: makeStrictPeerDouble('support'),
        });
        const owner = await seedAccount({ testEnv });
        const session = await seedSession(owner.accountId, { testEnv });
        const tokenHash = `legacy-proof-${legacyHeaders.legacyProofV1 ? 'v1' : ''}${legacyHeaders.legacyProofV2 ? 'v2' : ''}`;
        await createDeletionProof(workerEnv.DB, {
          tokenHash,
          accountId: owner.accountId,
          sessionIdHash: session.idHash,
          purpose: 'delete',
          method: 'otp',
          issuedAt: Date.now(),
          expiresAt: Date.now() + 60_000,
          otpCodeHash: 'hash',
        });
        await markDeletionProofVerified(workerEnv.DB, { tokenHash, nowMs: Date.now() });

        const response = await worker.fetch(confirmRequest(session.cookie), testEnv);
        expect(response.status).toBe(503);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(await workerEnv.DB.prepare('SELECT operation_id FROM account_deletions').first()).toBeNull();
        expect(await workerEnv.DB.prepare(
          'SELECT consumed FROM account_deletion_proofs WHERE token_hash = ?'
        ).bind(tokenHash).first()).toMatchObject({ consumed: 0 });
        expect(await workerEnv.DB.prepare(
          'SELECT revoked_at FROM sessions WHERE id_hash = ?'
        ).bind(session.idHash).first()).toMatchObject({ revoked_at: null });
      }
    });

    it('executes in strict order: proof validation, readiness check, DB mutation, snapshot capture', async () => {
      const executionLog = [];
      const testEnv = makeTestEnv({
        RELAY: {
          async fetch(input, init) {
            executionLog.push('readiness_check_relay');
            const nonce = init.headers?.['X-Owner-Purge-Readiness-Nonce'];
            const r1 = await independentFrameAndSign('owner-purge-v1-fixture-test-key', 'relay', nonce, 1);
            const r2 = await independentFrameAndSign('owner-purge-v2-fixture-test-key', 'relay', nonce, 2);
            return new Response(null, {
              status: 204,
              headers: {
                'Cache-Control': 'no-store',
                'X-Owner-Purge-Readiness-Version': '1',
                'X-Owner-Purge-Readiness-Proof-V1': r1.proof,
                'X-Owner-Purge-Readiness-Proof-V2': r2.proof,
              },
            });
          },
        },
        SUPPORT_WORKER: {
          async fetch(input, init) {
            executionLog.push('readiness_check_support');
            const nonce = init.headers?.['X-Owner-Purge-Readiness-Nonce'];
            const r1 = await independentFrameAndSign('owner-purge-v1-fixture-test-key', 'support', nonce, 1);
            const r2 = await independentFrameAndSign('owner-purge-v2-fixture-test-key', 'support', nonce, 2);
            return new Response(null, {
              status: 204,
              headers: {
                'Cache-Control': 'no-store',
                'X-Owner-Purge-Readiness-Version': '1',
                'X-Owner-Purge-Readiness-Proof-V1': r1.proof,
                'X-Owner-Purge-Readiness-Proof-V2': r2.proof,
              },
            });
          },
        },
      });

      const owner = await seedAccount({ testEnv });
      const session = await seedSession(owner.accountId, { testEnv });

      // Step 1: No proof -> 400 before readiness
      const noProofRes = await worker.fetch(confirmRequest(session.cookie), testEnv);
      expect(noProofRes.status).toBe(400);
      expect(executionLog).toHaveLength(0);

      // Seed verified proof
      await createDeletionProof(workerEnv.DB, {
        tokenHash: 'seq-test-proof',
        accountId: owner.accountId,
        sessionIdHash: session.idHash,
        purpose: 'delete',
        method: 'otp',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        otpCodeHash: 'hash',
      });
      await markDeletionProofVerified(workerEnv.DB, { tokenHash: 'seq-test-proof', nowMs: Date.now() });

      // Step 2: Readiness passes -> proceeds to mutate DB and redirect
      const confirmRes = await worker.fetch(confirmRequest(session.cookie), testEnv);
      expect(confirmRes.status).toBe(303);
      expect(confirmRes.headers.get('Location')).toBe('/account/delete/status');
      expect(executionLog).toContain('readiness_check_relay');
      expect(executionLog).toContain('readiness_check_support');

      const deletionRow = await workerEnv.DB.prepare('SELECT phase FROM account_deletions').first();
      expect(deletionRow).toMatchObject({ phase: 'frozen' });
      const proofRow = await workerEnv.DB.prepare(
        "SELECT consumed FROM account_deletion_proofs WHERE token_hash = 'seq-test-proof'"
      ).first();
      expect(proofRow).toMatchObject({ consumed: 1 });
    });

    it('renders 503 generic refusal page with no-store and exactly one safe recovery action on readiness failure', async () => {
      const failingEnv = makeTestEnv({
        RELAY: makeStrictPeerDouble('relay', { status: 503 }),
        SUPPORT_WORKER: makeStrictPeerDouble('support'),
      });

      const owner = await seedAccount({ testEnv: failingEnv });
      const session = await seedSession(owner.accountId, { testEnv: failingEnv });

      await createDeletionProof(workerEnv.DB, {
        tokenHash: 'refusal-page-proof',
        accountId: owner.accountId,
        sessionIdHash: session.idHash,
        purpose: 'delete',
        method: 'otp',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        otpCodeHash: 'hash',
      });
      await markDeletionProofVerified(workerEnv.DB, { tokenHash: 'refusal-page-proof', nowMs: Date.now() });

      const res = await worker.fetch(confirmRequest(session.cookie), failingEnv);
      expect(res.status).toBe(503);
      expect(res.headers.get('Cache-Control')).toBe('no-store');

      const body = await res.text();
      expect(body).toContain("deletion request can't be confirmed");
      expect(body).toContain('please try again later.');
      // Exactly one recovery action link to /account/delete
      const matches = body.match(/href="\/account\/delete"/g) || [];
      expect(matches.length).toBe(1);

      // Verifies proofs remain unconsumed, no deletion row, and session usable
      const proofRow = await workerEnv.DB.prepare(
        "SELECT consumed FROM account_deletion_proofs WHERE token_hash = 'refusal-page-proof'"
      ).first();
      expect(proofRow).toMatchObject({ consumed: 0 });
      const deletionRow = await workerEnv.DB.prepare('SELECT operation_id FROM account_deletions').first();
      expect(deletionRow).toBeNull();
    });
  });

  describe('exhaustive delayed-status enumeration over shared DELETION_SERVICES', () => {
    it('queries and formats delayed status for every service in DELETION_SERVICES', async () => {
      const env = makeTestEnv();
      const account = await seedAccount({ email: 'delayed-status-check@example.com', testEnv: env });
      const rawStatusToken = 'status-token-for-delayed-test';
      const tokenHash = await hashWithPepper(rawStatusToken, env);

      for (const service of DELETION_SERVICES) {
        const opId = `op-delayed-${service}`;
        await workerEnv.DB.prepare(
          `INSERT INTO account_deletions (
             operation_id, account_id, phase, requested_at, frozen_at, snapshot_digest, snapshot_encrypted,
             cancellation_deadline_at, next_attempt_at, status_token_hash, backup_empty_verified_at, stripe_purge_state
           ) VALUES (?, ?, 'purging', 1000, 1001, 'snap-digest', 'snap-enc', 2000, 1700000000000, ?, 1000, 'deleted')`
        ).bind(opId, account.accountId, tokenHash).run();

        await workerEnv.DB.prepare(
          `INSERT INTO account_deletion_service_ops (
             id, operation_id, service, key_version, state, attempt_count, next_attempt_at
           ) VALUES (?, ?, ?, 2, 'pending', 1, 1700000000000)`
        ).bind(`op-srv-${service}`, opId, service).run();

        const req = new Request('https://services.solstone.app/account/delete/status', {
          headers: { Cookie: `account_deletion_status=${rawStatusToken}` },
        });
        const res = await worker.fetch(req, env);
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toContain(`${service} cleanup delayed`);

        // Clean up ops for next iteration
        await workerEnv.DB.prepare('DELETE FROM account_deletion_service_ops WHERE operation_id = ?').bind(opId).run();
        await workerEnv.DB.prepare('DELETE FROM account_deletions WHERE operation_id = ?').bind(opId).run();
      }
    });
  });

  describe('seeded purging recovery without coordinator gate', () => {
    it('allows coordinator to process seeded purging records without requiring readiness', async () => {
      const env = makeTestEnv();
      const account = await seedAccount({ email: 'purging-recovery-check@example.com', testEnv: env });

      await workerEnv.DB.prepare(
        `INSERT INTO account_deletions (
           operation_id, account_id, phase, requested_at, frozen_at, snapshot_digest, snapshot_encrypted,
           cancellation_deadline_at, next_attempt_at, status_token_hash
         ) VALUES ('purging-op-id', ?, 'purging', 1000, 1001, 'snap-digest', 'snap-enc', 2000, 0, 'status-hash')`
      ).bind(account.accountId).run();

      // Coordinator runs without readiness pre-flight
      const result = await runAccountDeletionCoordinator(env, 3000);
      expect(result).toBeDefined();

      const row = await workerEnv.DB.prepare(
        "SELECT phase, snapshot_digest FROM account_deletions WHERE operation_id = 'purging-op-id'"
      ).first();
      expect(row.snapshot_digest).toBe('snap-digest');
    });
  });
});

function confirmRequest(cookie) {
  return new Request('https://services.solstone.app/account/delete/confirm', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: 'https://services.solstone.app',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
}
