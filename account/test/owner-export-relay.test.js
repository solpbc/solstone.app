import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectOwnerRelayExport,
  detectDuplicateTopLevelJsonMembers,
  relayExpectedInstanceIds,
  RELAY_BODY_BYTE_LIMIT,
} from '../src/owner-export-relay.js';

const VALID_INSTANCE_1 = '11111111-1111-1111-1111-111111111111';
const VALID_INSTANCE_2 = '22222222-2222-2222-2222-222222222222';
const VALID_CA_FP = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const RAW_FIXTURE_BYTES = `{"instance_id":"11111111-1111-1111-1111-111111111111","ca_fp":"sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","created_at":1700000000,"rotated_at":null,"revoked_at":null,"entitled_until":1800000000,"entitled":true}`;

function makeValidPayload(instanceId = VALID_INSTANCE_1) {
  return JSON.stringify({
    instance_id: instanceId,
    ca_fp: VALID_CA_FP,
    created_at: 1700000000,
    rotated_at: null,
    revoked_at: null,
    entitled_until: 1800000000,
    entitled: true,
  });
}

describe('owner relay export collector (AC4–5)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('relayExpectedInstanceIds', () => {
    it('handles SPL-only, SPP-only, duplicate-in-both, and empty sets', () => {
      // Empty
      expect(relayExpectedInstanceIds([], [])).toEqual([]);

      // SPL only
      expect(relayExpectedInstanceIds(['11111111-1111-1111-1111-111111111111'], [])).toEqual([
        '11111111-1111-1111-1111-111111111111',
      ]);

      // SPP only
      expect(relayExpectedInstanceIds([], ['22222222-2222-2222-2222-222222222222'])).toEqual([
        '22222222-2222-2222-2222-222222222222',
      ]);

      // Duplicate in both and sorted
      const spl = ['33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111'];
      const spp = ['22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111'];
      expect(relayExpectedInstanceIds(spl, spp)).toEqual([
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
      ]);
    });
  });

  describe('concurrency recording fake (17 IDs, all succeed)', () => {
    it('caps peak in-flight at <= 8, issues exact GET requests, and never calls global fetch', async () => {
      const globalFetchSpy = vi.fn();
      vi.stubGlobal('fetch', globalFetchSpy);

      let inFlight = 0;
      let peakInFlight = 0;
      const recordedCalls = [];

      const ids = Array.from({ length: 17 }, (_, i) => `11111111-1111-1111-1111-${String(i).padStart(12, '0')}`);

      const env = {
        RELAY: {
          fetch: async (url, init) => {
            inFlight++;
            if (inFlight > peakInFlight) peakInFlight = inFlight;
            recordedCalls.push({ url, init });

            await new Promise((r) => setTimeout(r, 10));
            inFlight--;

            const id = url.split('/').pop();
            return new Response(makeValidPayload(id), {
              status: 200,
              headers: { 'Content-Type': 'application/json; charset=utf-8' },
            });
          },
        },
        RELAY_GRANT_SECRET: 'test-grant-secret',
      };

      const result = await collectOwnerRelayExport({
        env,
        instanceIds: ids,
      });

      expect(peakInFlight).toBeLessThanOrEqual(8);
      expect(result.complete).toBe(true);
      expect(result.accounting).toEqual([]);
      expect(result.instances).toHaveLength(17);

      // Verify each request
      expect(recordedCalls).toHaveLength(17);
      for (const call of recordedCalls) {
        expect(call.init.method).toBe('GET');
        expect(call.init.headers.Authorization).toBe('Bearer test-grant-secret');
        expect(call.init.redirect).toBe('manual');
        const id = call.url.slice('https://spl-relay.internal/admin/instances/'.length);
        expect(ids).toContain(id);
        expect(call.url).toBe(`https://spl-relay.internal/admin/instances/${encodeURIComponent(id)}`);
      }

      expect(globalFetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('deadline (17 IDs, first 8 hang)', () => {
    it('returns at the deadline when a peer binding ignores abort', async () => {
      vi.useFakeTimers();
      const pending = collectOwnerRelayExport({
        env: {
          RELAY: { fetch: () => new Promise(() => {}) },
          RELAY_GRANT_SECRET: 'test-grant-secret',
        },
        instanceIds: [VALID_INSTANCE_1],
      });

      await vi.advanceTimersByTimeAsync(10_001);
      await expect(pending).resolves.toEqual({
        complete: false,
        instances: [],
        accounting: [{ instance_id: VALID_INSTANCE_1, reason: 'deadline' }],
      });
      vi.useRealTimers();
    });

    it('aborts in-flight workers, does not start queued IDs, and accounts for all 17 IDs', async () => {
      const ids = Array.from({ length: 17 }, (_, i) => `11111111-1111-1111-1111-${String(i).padStart(12, '0')}`);

      let inFlight = 0;
      let fetchCount = 0;
      let abortControllerRef;
      let currentTime = 1000;

      const testClock = {
        now: () => currentTime,
        abortAfter: (ms, controller) => {
          abortControllerRef = controller;
          return 123;
        },
      };

      const env = {
        RELAY: {
          fetch: async (_url, init) => {
            fetchCount++;
            inFlight++;

            if (inFlight === 8) {
              // Once 8 are in flight, simulate deadline timeout
              currentTime = 12000;
              abortControllerRef.abort();
            }

            return new Promise((_, reject) => {
              if (init.signal.aborted) {
                const err = new Error('Aborted');
                err.name = 'AbortError';
                reject(err);
                return;
              }
              init.signal.addEventListener('abort', () => {
                const err = new Error('Aborted');
                err.name = 'AbortError';
                reject(err);
              });
            });
          },
        },
        RELAY_GRANT_SECRET: 'test-grant-secret',
      };

      const result = await collectOwnerRelayExport({
        env,
        instanceIds: ids,
        clock: testClock,
      });

      expect(result.complete).toBe(false);
      expect(result.instances).toEqual([]);
      expect(fetchCount).toBe(8); // queued IDs must not start!
      expect(result.accounting).toHaveLength(17);
      for (const entry of result.accounting) {
        expect(entry.reason).toBe('deadline');
      }
    });

    it('retains pre-deadline successes while accounting remaining IDs under deadline', async () => {
      const ids = [
        '11111111-1111-1111-1111-000000000001',
        '11111111-1111-1111-1111-000000000002',
        '11111111-1111-1111-1111-000000000003',
      ];

      let currentTime = 1000;
      let abortControllerRef;

      const testClock = {
        now: () => currentTime,
        abortAfter: (ms, controller) => {
          abortControllerRef = controller;
          return 456;
        },
      };

      const env = {
        RELAY: {
          fetch: async (url, init) => {
            const id = url.split('/').pop();
            if (id.endsWith('000000000001')) {
              return new Response(makeValidPayload(id), { status: 200 });
            }

            currentTime = 12000;
            abortControllerRef.abort();
            const err = new Error('Aborted');
            err.name = 'AbortError';
            throw err;
          },
        },
        RELAY_GRANT_SECRET: 'test-grant-secret',
      };

      const result = await collectOwnerRelayExport({
        env,
        instanceIds: ids,
        clock: testClock,
      });

      expect(result.complete).toBe(false);
      expect(result.instances).toHaveLength(1);
      expect(result.instances[0].instance_id).toBe('11111111-1111-1111-1111-000000000001');
      expect(result.accounting).toEqual([
        { instance_id: '11111111-1111-1111-1111-000000000002', reason: 'deadline' },
        { instance_id: '11111111-1111-1111-1111-000000000003', reason: 'deadline' },
      ]);
    });
  });

  describe('table-driven failures', () => {
    const failureCases = [
      {
        name: 'absent RELAY binding',
        env: { RELAY_GRANT_SECRET: 'secret' },
        expectedReason: 'unconfigured',
      },
      {
        name: 'absent RELAY_GRANT_SECRET',
        env: { RELAY: { fetch: async () => new Response('{}', { status: 200 }) } },
        expectedReason: 'unconfigured',
      },
      {
        name: 'fetch throws network error',
        env: {
          RELAY: { fetch: async () => { throw new Error('network down'); } },
          RELAY_GRANT_SECRET: 'secret',
        },
        expectedReason: 'throw',
      },
      {
        name: 'redirect 301',
        env: {
          RELAY: { fetch: async () => new Response(null, { status: 301, headers: { Location: 'https://example.com' } }) },
          RELAY_GRANT_SECRET: 'secret',
        },
        expectedReason: 'redirect',
      },
      {
        name: 'redirect 302',
        env: {
          RELAY: { fetch: async () => new Response(null, { status: 302, headers: { Location: 'https://example.com' } }) },
          RELAY_GRANT_SECRET: 'secret',
        },
        expectedReason: 'redirect',
      },
      {
        name: 'HTTP 400',
        env: {
          RELAY: { fetch: async () => new Response('Bad Request', { status: 400 }) },
          RELAY_GRANT_SECRET: 'secret',
        },
        expectedReason: 'http_400',
      },
      {
        name: 'HTTP 401',
        env: {
          RELAY: { fetch: async () => new Response('Unauthorized', { status: 401 }) },
          RELAY_GRANT_SECRET: 'secret',
        },
        expectedReason: 'http_401',
      },
      {
        name: 'HTTP 404',
        env: {
          RELAY: { fetch: async () => new Response('Not Found', { status: 404 }) },
          RELAY_GRANT_SECRET: 'secret',
        },
        expectedReason: 'http_404',
      },
      {
        name: 'HTTP 500',
        env: {
          RELAY: { fetch: async () => new Response('Internal Error', { status: 500 }) },
          RELAY_GRANT_SECRET: 'secret',
        },
        expectedReason: 'http_500',
      },
      {
        name: 'HTTP 503',
        env: {
          RELAY: { fetch: async () => new Response('Service Unavailable', { status: 503 }) },
          RELAY_GRANT_SECRET: 'secret',
        },
        expectedReason: 'http_503',
      },
      {
        name: 'malformed body JSON',
        env: {
          RELAY: { fetch: async () => new Response('not json at all {', { status: 200 }) },
          RELAY_GRANT_SECRET: 'secret',
        },
        expectedReason: 'malformed_body',
      },
      {
        name: 'instance_id mismatch',
        env: {
          RELAY: { fetch: async () => new Response(makeValidPayload(VALID_INSTANCE_2), { status: 200 }) },
          RELAY_GRANT_SECRET: 'secret',
        },
        expectedReason: 'mismatch',
      },
    ];

    for (const testCase of failureCases) {
      it(`fails with ${testCase.name} -> ${testCase.expectedReason}`, async () => {
        const result = await collectOwnerRelayExport({
          env: testCase.env,
          instanceIds: [VALID_INSTANCE_1],
        });

        expect(result.complete).toBe(false);
        expect(result.accounting).toEqual([
          { instance_id: VALID_INSTANCE_1, reason: testCase.expectedReason },
        ]);
      });
    }
  });

  describe('body cap (8192 bytes)', () => {
    it('passes 8192 bytes with dishonest Content-Length: 1', async () => {
      const validJson = makeValidPayload(VALID_INSTANCE_1);
      const padding = ' '.repeat(8192 - validJson.length);
      const body8192 = validJson + padding;
      expect(new TextEncoder().encode(body8192).length).toBe(8192);

      const env = {
        RELAY: {
          fetch: async () => new Response(body8192, {
            status: 200,
            headers: { 'Content-Length': '1' }, // dishonest!
          }),
        },
        RELAY_GRANT_SECRET: 'test-grant-secret',
      };

      const result = await collectOwnerRelayExport({
        env,
        instanceIds: [VALID_INSTANCE_1],
      });

      expect(result.complete).toBe(true);
      expect(result.instances).toHaveLength(1);
      expect(result.instances[0].instance_id).toBe(VALID_INSTANCE_1);
    });

    it('fails 8193 bytes with oversize with dishonest Content-Length', async () => {
      const validJson = makeValidPayload(VALID_INSTANCE_1);
      const padding = ' '.repeat(8193 - validJson.length);
      const body8193 = validJson + padding;
      expect(new TextEncoder().encode(body8193).length).toBe(8193);

      const env = {
        RELAY: {
          fetch: async () => new Response(body8193, {
            status: 200,
            headers: { 'Content-Length': '1' },
          }),
        },
        RELAY_GRANT_SECRET: 'test-grant-secret',
      };

      const result = await collectOwnerRelayExport({
        env,
        instanceIds: [VALID_INSTANCE_1],
      });

      expect(result.complete).toBe(false);
      expect(result.accounting).toEqual([
        { instance_id: VALID_INSTANCE_1, reason: 'oversize' },
      ]);
    });

    it('cancels stream at 8193 bytes without pulling unread tail', async () => {
      let pullCount = 0;
      let tailPulled = false;
      let cancelCalled = false;

      const stream = new ReadableStream({
        async pull(controller) {
          pullCount++;
          if (pullCount === 1) {
            // chunk of 8192 bytes
            controller.enqueue(new Uint8Array(8192));
          } else if (pullCount === 2) {
            // 1 byte over the limit (total 8193)
            controller.enqueue(new Uint8Array(1));
          } else {
            // unread tail
            tailPulled = true;
            controller.enqueue(new Uint8Array(100));
          }
          await new Promise((r) => setTimeout(r, 5));
        },
        cancel() {
          cancelCalled = true;
        },
      });

      const env = {
        RELAY: {
          fetch: async () => new Response(stream, { status: 200 }),
        },
        RELAY_GRANT_SECRET: 'test-grant-secret',
      };

      const result = await collectOwnerRelayExport({
        env,
        instanceIds: [VALID_INSTANCE_1],
      });

      expect(result.complete).toBe(false);
      expect(result.accounting).toEqual([
        { instance_id: VALID_INSTANCE_1, reason: 'oversize' },
      ]);
      expect(cancelCalled).toBe(true);
      expect(tailPulled).toBe(false);
      expect(pullCount).toBe(2);
    });

    it('returns oversize even when stream cancellation never settles', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(RELAY_BODY_BYTE_LIMIT + 1));
        },
        cancel() {
          return new Promise(() => {});
        },
      });
      const result = await collectOwnerRelayExport({
        env: {
          RELAY: { fetch: async () => new Response(stream) },
          RELAY_GRANT_SECRET: 'test-grant-secret',
        },
        instanceIds: [VALID_INSTANCE_1],
      });

      expect(result.accounting).toEqual([
        { instance_id: VALID_INSTANCE_1, reason: 'oversize' },
      ]);
    });
  });

  describe('envelope (AC5)', () => {
    it('parses raw fixture bytes exactly into six public keys and omits ca_fp', async () => {
      const env = {
        RELAY: {
          fetch: async () => new Response(RAW_FIXTURE_BYTES, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        },
        RELAY_GRANT_SECRET: 'test-grant-secret',
      };

      const result = await collectOwnerRelayExport({
        env,
        instanceIds: [VALID_INSTANCE_1],
      });

      expect(result.complete).toBe(true);
      expect(result.instances).toHaveLength(1);

      const inst = result.instances[0];
      expect(Object.keys(inst)).toEqual([
        'instance_id',
        'created_at',
        'rotated_at',
        'revoked_at',
        'entitled_until',
        'entitled',
      ]);

      expect(inst).toEqual({
        instance_id: VALID_INSTANCE_1,
        created_at: '2023-11-14T22:13:20.000Z',
        rotated_at: null,
        revoked_at: null,
        entitled_until: '2027-01-15T08:00:00.000Z',
        entitled: true,
      });

      expect(inst.ca_fp).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain(VALID_CA_FP);
      expect(JSON.stringify(result)).not.toContain('ca_fp');
    });

    it('rejects envelope with missing, extra, or renamed keys', async () => {
      const badEnvelopes = [
        // Missing key
        { instance_id: VALID_INSTANCE_1, ca_fp: VALID_CA_FP, created_at: 1700000000, rotated_at: null, revoked_at: null, entitled: true },
        // Extra key home_label
        { instance_id: VALID_INSTANCE_1, ca_fp: VALID_CA_FP, created_at: 1700000000, rotated_at: null, revoked_at: null, entitled_until: 1800000000, entitled: true, home_label: 'home' },
        // Renamed key
        { instanceId: VALID_INSTANCE_1, ca_fp: VALID_CA_FP, created_at: 1700000000, rotated_at: null, revoked_at: null, entitled_until: 1800000000, entitled: true },
      ];

      for (const badEnv of badEnvelopes) {
        const env = {
          RELAY: { fetch: async () => new Response(JSON.stringify(badEnv), { status: 200 }) },
          RELAY_GRANT_SECRET: 'test-grant-secret',
        };

        const result = await collectOwnerRelayExport({
          env,
          instanceIds: [VALID_INSTANCE_1],
        });

        expect(result.complete).toBe(false);
        expect(result.accounting).toEqual([
          { instance_id: VALID_INSTANCE_1, reason: 'invalid_envelope' },
        ]);
      }
    });

    it('rejects envelope with invalid types, non-safe integer timestamps, or invalid dates', async () => {
      const invalidTypes = [
        // Non-boolean entitled
        { ...JSON.parse(RAW_FIXTURE_BYTES), entitled: 'true' },
        // Malformed ca_fp
        { ...JSON.parse(RAW_FIXTURE_BYTES), ca_fp: 'md5:1234' },
        // Non-safe integer timestamp
        { ...JSON.parse(RAW_FIXTURE_BYTES), created_at: 1e20 },
        // Negative timestamp
        { ...JSON.parse(RAW_FIXTURE_BYTES), created_at: -1 },
        // Float timestamp
        { ...JSON.parse(RAW_FIXTURE_BYTES), created_at: 1700000000.5 },
        // Non-safe integer rotated_at
        { ...JSON.parse(RAW_FIXTURE_BYTES), rotated_at: '2023-01-01' },
      ];

      for (const bad of invalidTypes) {
        const env = {
          RELAY: { fetch: async () => new Response(JSON.stringify(bad), { status: 200 }) },
          RELAY_GRANT_SECRET: 'test-grant-secret',
        };

        const result = await collectOwnerRelayExport({
          env,
          instanceIds: [VALID_INSTANCE_1],
        });

        expect(result.complete).toBe(false);
        expect(result.accounting).toEqual([
          { instance_id: VALID_INSTANCE_1, reason: 'invalid_envelope' },
        ]);
      }
    });

    it('rejects duplicate members for every top-level key (identical and conflicting values)', async () => {
      const keys = [
        'instance_id',
        'ca_fp',
        'created_at',
        'rotated_at',
        'revoked_at',
        'entitled_until',
        'entitled',
      ];

      for (const key of keys) {
        // Identical duplicate
        const identicalDup = `{"instance_id":"${VALID_INSTANCE_1}","ca_fp":"${VALID_CA_FP}","created_at":1700000000,"rotated_at":null,"revoked_at":null,"entitled_until":1800000000,"entitled":true,"${key}":${JSON.parse(RAW_FIXTURE_BYTES)[key] === null ? 'null' : JSON.stringify(JSON.parse(RAW_FIXTURE_BYTES)[key])}}`;
        expect(detectDuplicateTopLevelJsonMembers(identicalDup)).toBe(true);

        // Conflicting duplicate
        let conflictVal = '"conflict"';
        if (key === 'created_at' || key === 'entitled_until') conflictVal = '1900000000';
        if (key === 'entitled') conflictVal = 'false';
        const conflictingDup = `{"instance_id":"${VALID_INSTANCE_1}","ca_fp":"${VALID_CA_FP}","created_at":1700000000,"rotated_at":null,"revoked_at":null,"entitled_until":1800000000,"entitled":true,"${key}":${conflictVal}}`;
        expect(detectDuplicateTopLevelJsonMembers(conflictingDup)).toBe(true);

        const env = {
          RELAY: { fetch: async () => new Response(identicalDup, { status: 200 }) },
          RELAY_GRANT_SECRET: 'test-grant-secret',
        };

        const result = await collectOwnerRelayExport({
          env,
          instanceIds: [VALID_INSTANCE_1],
        });

        expect(result.complete).toBe(false);
        expect(result.accounting).toEqual([
          { instance_id: VALID_INSTANCE_1, reason: 'duplicate_member' },
        ]);
      }
    });
  });
});
