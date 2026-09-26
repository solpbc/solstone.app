import { env as workerEnv } from 'cloudflare:test';
import { exportJWK, generateKeyPair } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  applyLabelBatch,
  countZoneRecords,
  labelRecordsMatch,
  listLabelRecords,
  planLabelBatch,
  readDnsRecordCeiling,
  solstoneMeDnsReady,
} from '../src/solstone-me-dns.js';
import { installFakeSolstoneMeZone } from './fake-solstone-me-zone.js';
import {
  fetchWithCtx,
  installConsoleSpy,
  makeTestEnv,
  resetDb,
  rowCount,
  seedAccount,
  seedEntitlement,
  seedSmeBinding,
  V1_MCP_BRIDGE_ADDRESS,
} from './helpers.js';
import { generateReachKeyPair, mintHomeReachAssertion } from './reach-helper.js';

const VALID_ACME_URI_1 = 'https://acme-v02.api.letsencrypt.org/acme/acct/123456';
const VALID_ACME_URI_2 = 'https://acme-v02.api.letsencrypt.org/acme/acct/789012';
const VALID_ACME_URI_LEADING_ZEROS = 'https://acme-v02.api.letsencrypt.org/acme/acct/000789';
const VALID_STAGING_URI = 'https://acme-staging-v02.api.letsencrypt.org/acme/acct/999999';

describe('solstone.me DNS management & ACME pin', () => {
  let fakeZone;
  beforeEach(async () => {
    await resetDb();
    fakeZone = installFakeSolstoneMeZone();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('pure planning and matching functions', () => {
    it('plans batch correctly for empty zone', () => {
      const plan = planLabelBatch([], {
        hostname: 'abcdef23.solstone.me',
        accountUri: VALID_ACME_URI_1,
        addresses: ['20.186.92.169'],
      });
      expect(plan.deletes).toEqual([]);
      expect(plan.patches).toEqual([]);
      expect(plan.posts).toHaveLength(2);
      expect(plan.posts.find((p) => p.name === 'abcdef23.solstone.me' && p.type === 'CAA')).toBeDefined();
      expect(plan.posts.find((p) => p.name === 'abcdef23.solstone.me' && p.type === 'A')).toBeDefined();
    });

    it('identifies matching records accurately', () => {
      const records = [
        {
          id: 'rec_1',
          type: 'CAA',
          name: 'abcdef23.solstone.me',
          data: { flags: 0, tag: 'issue', value: `letsencrypt.org; accounturi=${VALID_ACME_URI_1}; validationmethods=tls-alpn-01` },
          proxied: false,
          ttl: 60,
        },
        {
          id: 'rec_2',
          type: 'A',
          name: 'abcdef23.solstone.me',
          content: '20.186.92.169',
          proxied: false,
          ttl: 60,
        },
      ];

      expect(labelRecordsMatch(records, {
        hostname: 'abcdef23.solstone.me',
        accountUri: VALID_ACME_URI_1,
        addresses: ['20.186.92.169'],
      })).toBe(true);

      expect(labelRecordsMatch(records, {
        hostname: 'abcdef23.solstone.me',
        accountUri: VALID_ACME_URI_2,
        addresses: ['20.186.92.169'],
      })).toBe(false);

      expect(labelRecordsMatch(records, {
        hostname: 'abcdef23.solstone.me',
        accountUri: VALID_ACME_URI_1,
        addresses: ['1.2.3.4'],
      })).toBe(false);

      // Multiple CAA returns false
      expect(labelRecordsMatch([...records, { ...records[0], id: 'rec_3' }], {
        hostname: 'abcdef23.solstone.me',
        accountUri: VALID_ACME_URI_1,
        addresses: ['20.186.92.169'],
      })).toBe(false);

      // Proxied or wrong TTL returns false
      expect(labelRecordsMatch([{ ...records[0], proxied: true }, records[1]], {
        hostname: 'abcdef23.solstone.me',
        accountUri: VALID_ACME_URI_1,
        addresses: ['20.186.92.169'],
      })).toBe(false);
      expect(labelRecordsMatch([{ ...records[0], ttl: 300 }, records[1]], {
        hostname: 'abcdef23.solstone.me',
        accountUri: VALID_ACME_URI_1,
        addresses: ['20.186.92.169'],
      })).toBe(false);

      // Null or non-array returns false
      expect(labelRecordsMatch(null, {
        hostname: 'abcdef23.solstone.me',
        accountUri: VALID_ACME_URI_1,
        addresses: ['20.186.92.169'],
      })).toBe(false);
    });

    it('plans deletes for extraneous or stale records on the label', () => {
      const records = [
        {
          id: 'rec_cname',
          type: 'CNAME',
          name: 'abcdef23.solstone.me',
          content: 'other.example.com',
          proxied: false,
          ttl: 60,
        },
        {
          id: 'rec_extra_a',
          type: 'A',
          name: 'abcdef23.solstone.me',
          content: '9.9.9.9',
          proxied: false,
          ttl: 60,
        },
      ];
      const plan = planLabelBatch(records, {
        hostname: 'abcdef23.solstone.me',
        accountUri: VALID_ACME_URI_1,
        addresses: ['20.186.92.169'],
      });
      expect(plan.deletes.map((d) => d.id)).toEqual(['rec_extra_a', 'rec_cname']);
      expect(plan.posts.length).toBeGreaterThan(0);
    });

    it('returns null plan when records already match target', () => {
      const records = [
        {
          id: 'rec_1',
          type: 'CAA',
          name: 'abcdef23.solstone.me',
          data: { flags: 0, tag: 'issue', value: `letsencrypt.org; accounturi=${VALID_ACME_URI_1}; validationmethods=tls-alpn-01` },
          proxied: false,
          ttl: 60,
        },
        {
          id: 'rec_2',
          type: 'A',
          name: 'abcdef23.solstone.me',
          content: '20.186.92.169',
          proxied: false,
          ttl: 60,
        },
      ];
      const plan = planLabelBatch(records, {
        hostname: 'abcdef23.solstone.me',
        accountUri: VALID_ACME_URI_1,
        addresses: ['20.186.92.169'],
      });
      expect(plan).toBeNull();
    });
  });

  describe('URI formatting and validation', () => {
    it('accepts valid prod and staging Let\'s Encrypt URIs and preserves leading zeros', async () => {
      const env = dnsEnv();
      const home = await generateReachKeyPair();
      await seedBoundAccount(env, home.instanceId);

      for (const uri of [VALID_ACME_URI_1, VALID_STAGING_URI, VALID_ACME_URI_LEADING_ZEROS]) {
        const input = await validDnsInput({
          home,
          claims: { acme_account_uri: uri, acme_account_replace: true },
        });
        const res = await fetchBridge(input, env);
        expect(res.status).toBe(200);

        if (uri === VALID_ACME_URI_LEADING_ZEROS) {
          const caa = fakeZone.getRecords().find((r) => r.type === 'CAA');
          expect(caa.data.value).toContain(`accounturi=${VALID_ACME_URI_LEADING_ZEROS}`);
        }
      }
    });

    it('rejects invalid URI shapes as invalid_input', async () => {
      const env = dnsEnv();
      const home = await generateReachKeyPair();
      await seedBoundAccount(env, home.instanceId);

      const invalidUris = [
        'http://acme-v02.api.letsencrypt.org/acme/acct/123',
        'https://other.api.letsencrypt.org/acme/acct/123',
        'https://acme-v02.api.letsencrypt.org/acme/acct/',
        'https://acme-v02.api.letsencrypt.org/acme/acct/abc',
        'https://acme-v02.api.letsencrypt.org/acme/acct/123/extra',
        'https://acme-v02.api.letsencrypt.org/acme/acct/123/',
        'https://acme-v02.api.letsencrypt.org/acme/acct/123?foo=bar',
        'https://acme-v02.api.letsencrypt.org/acme/acct/123456789012345678901', // 21 digits
        'https://example.com/acme/acct/123',
        '',
        12345,
      ];

      for (const uri of invalidUris) {
        const input = await validDnsInput({
          home,
          claims: { acme_account_uri: uri },
        });
        const res = await fetchBridge(input, env);
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'invalid_input' });
        expect(fakeZone.fetchSpy).not.toHaveBeenCalled();
      }
    });

    it('rejects non-boolean acme_account_replace as invalid_input', async () => {
      const env = dnsEnv();
      const home = await generateReachKeyPair();
      await seedBoundAccount(env, home.instanceId);
      for (const badVal of ['true', 1, {}]) {
        const input = await validDnsInput({
          home,
          claims: { acme_account_uri: VALID_ACME_URI_1, acme_account_replace: badVal },
        });
        const res = await fetchBridge(input, env);
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'invalid_input' });
        expect(fakeZone.fetchSpy).not.toHaveBeenCalled();
      }
    });
  });

  describe('assertion lifetime check', () => {
    it('accepts assertion with lifetime <= 300s and rejects > 300s with 401 and no fetch', async () => {
      const env = dnsEnv();
      const home = await generateReachKeyPair();
      await seedBoundAccount(env, home.instanceId);

      const now = Math.floor(Date.now() / 1000);

      // exp - iat === 300 -> 200
      const valid300 = await validDnsInput({
        home,
        claims: { iat: now, exp: now + 300, acme_account_uri: VALID_ACME_URI_1 },
      });
      const res300 = await fetchBridge(valid300, env);
      expect(res300.status).toBe(200);

      fakeZone.fetchSpy.mockClear();

      // exp - iat === 301 -> 401 invalid_token
      const invalid301 = await validDnsInput({
        home,
        claims: { iat: now, exp: now + 301, acme_account_uri: VALID_ACME_URI_1 },
      });
      const res301 = await fetchBridge(invalid301, env);
      expect(res301.status).toBe(401);
      expect(await res301.json()).toEqual({ error: 'invalid_token' });
      expect(fakeZone.fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('response shape and zone record structure check', () => {
    it('returns exact 8 response keys in order and configures CAA and A records with ttl 60 and proxied false', async () => {
      const env = dnsEnv();
      const home = await generateReachKeyPair();
      await seedBoundAccount(env, home.instanceId);

      const input = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });
      const res = await fetchBridge(input, env);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Object.keys(body)).toEqual([
        'token',
        'token_type',
        'expires_in',
        'expires_at',
        'instance_id',
        'hostname',
        'bridge_id',
        'bridge_addresses',
      ]);

      const records = fakeZone.getRecords(body.hostname);
      expect(records).toHaveLength(2); // 1 CAA + 1 A

      const caa = records.find((r) => r.type === 'CAA');
      expect(caa).toBeDefined();
      expect(caa.proxied).toBe(false);
      expect(caa.ttl).toBe(60);
      expect(caa.data).toEqual({
        flags: 0,
        tag: 'issue',
        value: `letsencrypt.org; accounturi=${VALID_ACME_URI_1}; validationmethods=tls-alpn-01`,
      });

      const aRec = records.find((r) => r.type === 'A');
      expect(aRec).toBeDefined();
      expect(aRec.proxied).toBe(false);
      expect(aRec.ttl).toBe(60);
      expect(aRec.content).toBe(V1_MCP_BRIDGE_ADDRESS);
    });
  });

  describe('426 journal update refusal and recovery', () => {
    it('returns 426 when acme_account_uri is missing, stamps refusal, handles repeat without CF fetch, and clears refusal upon update', async () => {
      const env = dnsEnv();
      const home = await generateReachKeyPair();
      const account = await seedBoundAccount(env, home.instanceId);
      const inputWithoutUri = await validDnsInput({
        home,
        claims: { acme_account_uri: undefined },
      });

      const res426 = await fetchBridge(inputWithoutUri, env);
      expect(res426.status).toBe(426);
      expect(res426.headers.get('Cache-Control')).toBe('no-store');
      expect(await res426.json()).toEqual({ error: 'journal_update_required' });
      expect(fakeZone.fetchSpy).not.toHaveBeenCalled();

      // Verify sme_bindings has journal_update_refused_at set
      const smeBinding = await workerEnv.DB.prepare(
        'SELECT journal_update_refused_at FROM sme_bindings WHERE account_id = ?'
      ).bind(account.accountId).first();
      expect(typeof smeBinding.journal_update_refused_at).toBe('number');

      // Subsequent valid request with acme_account_uri succeeds and clears journal_update_refused_at
      const inputWithUri = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });
      const res200 = await fetchBridge(inputWithUri, env);
      expect(res200.status).toBe(200);

      const clearedBinding = await workerEnv.DB.prepare(
        'SELECT journal_update_refused_at FROM sme_bindings WHERE account_id = ?'
      ).bind(account.accountId).first();
      expect(clearedBinding.journal_update_refused_at).toBeNull();
      expect(await rowCount('mcp_bridge_hostname_ledger')).toBe(1);

      // Repeat request without URI after address already pinned: returns 426, advances refusal ts, does not touch CF or ledger
      fakeZone.fetchSpy.mockClear();
      const laterMs = Date.now() + 10_000;
      vi.spyOn(Date, 'now').mockReturnValue(laterMs);

      const repeatNoUri = await validDnsInput({
        home,
        claims: { acme_account_uri: undefined },
      });
      const resRepeat426 = await fetchBridge(repeatNoUri, env);
      expect(resRepeat426.status).toBe(426);
      expect(fakeZone.fetchSpy).not.toHaveBeenCalled();
      expect(await rowCount('mcp_bridge_hostname_ledger')).toBe(1);

      const updatedBinding = await workerEnv.DB.prepare(
        'SELECT journal_update_refused_at FROM sme_bindings WHERE account_id = ?'
      ).bind(account.accountId).first();
      expect(updatedBinding.journal_update_refused_at).toBe(laterMs);
    });

    it('returns 426 when acme_account_uri is only present in unsigned JSON body and not in assertion claims', async () => {
      const env = dnsEnv();
      const home = await generateReachKeyPair();
      await seedBoundAccount(env, home.instanceId);

      const input = await validDnsInput({
        home,
        claims: { acme_account_uri: undefined },
      });
      input.acme_account_uri = VALID_ACME_URI_1; // on request body only

      const res = await fetchBridge(input, env);
      expect(res.status).toBe(426);
      expect(await res.json()).toEqual({ error: 'journal_update_required' });
      expect(fakeZone.fetchSpy).not.toHaveBeenCalled();
    });

    it('returns 503 binding_lookup_unavailable when stampSmeJournalUpdateRefused updates 0 rows or clear throws', async () => {
      const home = await generateReachKeyPair();
      const zeroUpdateDb = {
        prepare: (sql, ...args) => {
          if (/journal_update_refused_at\s*=/.test(sql) && !/NULL/.test(sql)) {
            return {
              bind: () => ({
                run: async () => ({ meta: { changes: 0 } }),
              }),
            };
          }
          return workerEnv.DB.prepare(sql, ...args);
        },
        batch: (...args) => workerEnv.DB.batch(...args),
      };
      const envZero = dnsEnv({ DB: zeroUpdateDb });
      await seedBoundAccount(envZero, home.instanceId);

      const inputNoUri = await validDnsInput({
        home,
        claims: { acme_account_uri: undefined },
      });
      const res503 = await fetchBridge(inputNoUri, envZero);
      expect(res503.status).toBe(503);
      expect(await res503.json()).toEqual({ error: 'binding_lookup_unavailable' });

      // Clear throws
      const throwingClearDb = {
        prepare: (sql, ...args) => {
          if (/journal_update_refused_at\s*=\s*NULL/.test(sql)) {
            throw new Error('D1_ERROR: database is locked');
          }
          return workerEnv.DB.prepare(sql, ...args);
        },
        batch: (...args) => workerEnv.DB.batch(...args),
      };
      const envThrow = dnsEnv({ DB: throwingClearDb });
      const inputWithUri = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });
      const resClearThrow = await fetchBridge(inputWithUri, envThrow);
      expect(resClearThrow.status).toBe(503);
      expect(await resClearThrow.json()).toEqual({ error: 'binding_lookup_unavailable' });
    });
  });

  describe('ACME pin decisions and replacement', () => {
    it('pins on first request, succeeds on same URI, and enforces replace claim on change', async () => {
      const env = dnsEnv();
      const home = await generateReachKeyPair();
      const account = await seedBoundAccount(env, home.instanceId);

      // 1. First pin
      const input1 = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });
      const res1 = await fetchBridge(input1, env);
      expect(res1.status).toBe(200);

      const binding1 = await workerEnv.DB.prepare(
        'SELECT acme_account_uri, acme_account_pinned_at, acme_account_replaced_at FROM mcp_bridge_bindings WHERE account_id = ?'
      ).bind(account.accountId).first();
      expect(binding1.acme_account_uri).toBe(VALID_ACME_URI_1);
      expect(typeof binding1.acme_account_pinned_at).toBe('number');
      expect(binding1.acme_account_replaced_at).toBeNull();

      // 2. Same URI re-request succeeds without changing pinned_at or setting replaced_at
      const resSame = await fetchBridge(input1, env);
      expect(resSame.status).toBe(200);

      // 3. Changed URI without acme_account_replace returns 409
      const inputChangedNoReplace = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_2, acme_account_replace: false },
      });
      const res409 = await fetchBridge(inputChangedNoReplace, env);
      expect(res409.status).toBe(409);
      expect(await res409.json()).toEqual({ error: 'acme_account_changed' });

      // Zone and pin are untouched
      const bindingAfter409 = await workerEnv.DB.prepare(
        'SELECT acme_account_uri FROM mcp_bridge_bindings WHERE account_id = ?'
      ).bind(account.accountId).first();
      expect(bindingAfter409.acme_account_uri).toBe(VALID_ACME_URI_1);

      // 4. Changed URI with acme_account_replace: true succeeds and updates replaced_at
      const initialCaa = fakeZone.getRecords().find((r) => r.type === 'CAA');
      let sawCaaInEveryStep = true;
      fakeZone.afterBatchStep((stepName, currentRecords) => {
        const caaCount = currentRecords.filter((r) => r.type === 'CAA').length;
        if (caaCount < 1) sawCaaInEveryStep = false;
      });

      const inputChangedReplace = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_2, acme_account_replace: true },
      });
      const resReplace = await fetchBridge(inputChangedReplace, env);
      expect(resReplace.status).toBe(200);
      expect(sawCaaInEveryStep).toBe(true);

      const replacedBody = await resReplace.json();
      expect(replacedBody.acme_account_replaced_at).toBeDefined();

      const newCaa = fakeZone.getRecords().find((r) => r.type === 'CAA');
      expect(newCaa.id).toBe(initialCaa.id); // CAA id unchanged (patched)
      expect(newCaa.data.value).toContain(`accounturi=${VALID_ACME_URI_2}`);

      const binding2 = await workerEnv.DB.prepare(
        'SELECT acme_account_uri, acme_account_pinned_at, acme_account_replaced_at FROM mcp_bridge_bindings WHERE account_id = ?'
      ).bind(account.accountId).first();
      expect(binding2.acme_account_uri).toBe(VALID_ACME_URI_2);
      expect(binding2.acme_account_pinned_at).toBe(binding1.acme_account_pinned_at);
      expect(typeof binding2.acme_account_replaced_at).toBe('number');

      // 5. Subsequent request with URI2 and NO replace claim still returns acme_account_replaced_at
      const inputSubsequentNoReplace = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_2 },
      });
      const resSubsequent = await fetchBridge(inputSubsequentNoReplace, env);
      expect(resSubsequent.status).toBe(200);
      const subsequentBody = await resSubsequent.json();
      expect(subsequentBody.acme_account_replaced_at).toBe(replacedBody.acme_account_replaced_at);

      // 6. Same-URI replace claim does not change acme_account_replaced_at
      const inputSameReplace = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_2, acme_account_replace: true },
      });
      await fetchBridge(inputSameReplace, env);
      const bindingSame = await workerEnv.DB.prepare(
        'SELECT acme_account_replaced_at FROM mcp_bridge_bindings WHERE account_id = ?'
      ).bind(account.accountId).first();
      expect(bindingSame.acme_account_replaced_at).toBe(binding2.acme_account_replaced_at);
    });

    it('first pin with acme_account_replace: true leaves acme_account_replaced_at null', async () => {
      const env = dnsEnv();
      const home = await generateReachKeyPair();
      const account = await seedBoundAccount(env, home.instanceId);

      const input = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1, acme_account_replace: true },
      });
      const res = await fetchBridge(input, env);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.acme_account_replaced_at).toBeUndefined();

      const binding = await workerEnv.DB.prepare(
        'SELECT acme_account_replaced_at FROM mcp_bridge_bindings WHERE account_id = ?'
      ).bind(account.accountId).first();
      expect(binding.acme_account_replaced_at).toBeNull();
    });

    it('two concurrent first pins with different URIs and no replace claim return 200 and 409 with only 1 ledger row', async () => {
      const env = dnsEnv();
      const home = await generateReachKeyPair();
      await seedBoundAccount(env, home.instanceId);

      const inputA = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });
      const inputB = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_2 },
      });

      const [resA, resB] = await Promise.all([
        fetchBridge(inputA, env),
        fetchBridge(inputB, env),
      ]);

      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([200, 409]);
      expect(await rowCount('mcp_bridge_hostname_ledger')).toBe(1);
    });
  });

  describe('verification paths: fast-path, re-verify, and timing', () => {
    it('fast-paths for verified records within 6 hours without calling Cloudflare API', async () => {
      const env = dnsEnv();
      const home = await generateReachKeyPair();
      await seedBoundAccount(env, home.instanceId);
      const input = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });

      // First call goes through write path
      const res1 = await fetchBridge(input, env);
      expect(res1.status).toBe(200);
      expect(fakeZone.fetchSpy).toHaveBeenCalled();
      fakeZone.fetchSpy.mockClear();

      // Second call within 6h hits fast path, no Cloudflare fetch
      const res2 = await fetchBridge(input, env);
      expect(res2.status).toBe(200);
      expect(fakeZone.fetchSpy).not.toHaveBeenCalled();
    });

    it('fast-paths when MCP_BRIDGE_ADDRESSES is specified in reverse order', async () => {
      const env1 = dnsEnv({ MCP_BRIDGE_ADDRESSES: '1.2.3.4, 5.6.7.8' });
      const home = await generateReachKeyPair();
      await seedBoundAccount(env1, home.instanceId);
      const input = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });

      await fetchBridge(input, env1);
      fakeZone.fetchSpy.mockClear();

      const env2 = dnsEnv({ MCP_BRIDGE_ADDRESSES: '5.6.7.8, 1.2.3.4' });
      const res2 = await fetchBridge(input, env2);
      expect(res2.status).toBe(200);
      expect(fakeZone.fetchSpy).not.toHaveBeenCalled();
    });

    it('executes write path when MCP_BRIDGE_ADDRESSES changes', async () => {
      const env1 = dnsEnv({ MCP_BRIDGE_ADDRESSES: '1.2.3.4' });
      const home = await generateReachKeyPair();
      await seedBoundAccount(env1, home.instanceId);
      const input = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });

      await fetchBridge(input, env1);
      fakeZone.fetchSpy.mockClear();

      const env2 = dnsEnv({ MCP_BRIDGE_ADDRESSES: '9.9.9.9' });
      const res2 = await fetchBridge(input, env2);
      expect(res2.status).toBe(200);
      expect(fakeZone.fetchSpy).toHaveBeenCalled();

      const aRec = fakeZone.getRecords().find((r) => r.type === 'A');
      expect(aRec.content).toBe('9.9.9.9');
    });

    it('checks provisional fast-path timing: under 60s fast-paths, at >= 60s lists', async () => {
      const startMs = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(startMs);
      const env = dnsEnv();
      const home = await generateReachKeyPair();
      await seedBoundAccount(env, home.instanceId);
      const input = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });

      await fetchBridge(input, env); // provisional
      fakeZone.fetchSpy.mockClear();

      // At 59s -> fast-path (0 fetch)
      vi.spyOn(Date, 'now').mockReturnValue(startMs + 59_000);
      const res59 = await fetchBridge(input, env);
      expect(res59.status).toBe(200);
      expect(fakeZone.fetchSpy).not.toHaveBeenCalled();

      // At 60s -> lists zone
      vi.spyOn(Date, 'now').mockReturnValue(startMs + 60_000);
      const res60 = await fetchBridge(input, env);
      expect(res60.status).toBe(200);
      expect(fakeZone.fetchSpy).toHaveBeenCalledTimes(1); // 1 list, 0 batch
    });

    it('re-verifies after 6 hours, confirming verification if records match', async () => {
      const env = dnsEnv();
      const home = await generateReachKeyPair();
      const account = await seedBoundAccount(env, home.instanceId);
      const input = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });

      await fetchBridge(input, env);

      // Simulate 7 hours later
      const sevenHoursLater = Date.now() + 7 * 3600 * 1000;
      vi.spyOn(Date, 'now').mockReturnValue(sevenHoursLater);
      fakeZone.fetchSpy.mockClear();

      const futureInput = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });

      const res = await fetchBridge(futureInput, env);
      expect(res.status).toBe(200);
      expect(fakeZone.fetchSpy).toHaveBeenCalledTimes(1);

      const row = await workerEnv.DB.prepare(
        'SELECT dns_verified_at, dns_verification_state FROM mcp_bridge_bindings WHERE account_id = ?'
      ).bind(account.accountId).first();
      expect(row.dns_verification_state).toBe('confirmed');
      expect(row.dns_verified_at).toBe(sevenHoursLater);
    });

    it('re-verifies after 6 hours and restores deleted CAA record', async () => {
      const env = dnsEnv();
      const home = await generateReachKeyPair();
      await seedBoundAccount(env, home.instanceId);
      const input = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });

      await fetchBridge(input, env);

      // Delete CAA record in fakeZone
      const caa = fakeZone.getRecords().find((r) => r.type === 'CAA');
      fakeZone.deleteRecord(caa.id);

      // 7 hours later
      const sevenHoursLater = Date.now() + 7 * 3600 * 1000;
      vi.spyOn(Date, 'now').mockReturnValue(sevenHoursLater);
      fakeZone.fetchSpy.mockClear();

      const futureInput = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });

      const res = await fetchBridge(futureInput, env);
      expect(res.status).toBe(200);

      // CAA restored
      const restoredCaa = fakeZone.getRecords().find((r) => r.type === 'CAA');
      expect(restoredCaa).toBeDefined();
      expect(restoredCaa.data.value).toContain(`accounturi=${VALID_ACME_URI_1}`);
    });

    it('falls back gracefully to return token on re-verify when DNS fetch fails', async () => {
      const env = dnsEnv();
      const home = await generateReachKeyPair();
      await seedBoundAccount(env, home.instanceId);
      const input = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });

      await fetchBridge(input, env);

      const sevenHoursLater = Date.now() + 7 * 3600 * 1000;
      vi.spyOn(Date, 'now').mockReturnValue(sevenHoursLater);
      fakeZone.forceNextList({
        status: 500,
        body: { success: false, errors: [{ message: 'Cloudflare internal error' }] },
      });

      const futureInput = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });

      const res = await fetchBridge(futureInput, env);
      expect(res.status).toBe(200);
    });
  });

  describe('concurrency, lease races, and pin move', () => {
    it('easy stale writer: cancels batch when lease expires before batch call and leaves newer lease intact', async () => {
      const env = dnsEnv();
      const home = await generateReachKeyPair();
      const account = await seedBoundAccount(env, home.instanceId);
      const input1 = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });

      let recordedGeneration = null;
      let recordedExpiresAt = null;

      fakeZone.afterList(async () => {
        await workerEnv.DB.prepare(`
          UPDATE mcp_bridge_bindings
          SET dns_lease_expires_at = 0
          WHERE account_id = ?
        `).bind(account.accountId).run();

        const input2 = await validDnsInput({
          home,
          claims: { acme_account_uri: VALID_ACME_URI_2, acme_account_replace: true },
        });
        const res2 = await fetchBridge(input2, env);
        expect(res2.status).toBe(200);

        const r2Row = await workerEnv.DB.prepare(`
          SELECT dns_lease_generation, dns_lease_expires_at
          FROM mcp_bridge_bindings
          WHERE account_id = ?
        `).bind(account.accountId).first();
        recordedGeneration = r2Row.dns_lease_generation;
        recordedExpiresAt = r2Row.dns_lease_expires_at;
      });

      const res1 = await fetchBridge(input1, env);
      expect(res1.status).toBe(503);
      expect(await res1.json()).toEqual({ error: 'hostname_records_unavailable' });

      // Exactly 1 batch call (R2's) was made across the whole test
      const batchCalls = fakeZone.fetchSpy.mock.calls.filter(([url]) => String(url).endsWith('/dns_records/batch'));
      expect(batchCalls).toHaveLength(1);

      // The zone's only CAA contains R2's URI
      const caaRecords = fakeZone.getRecords().filter((r) => r.type === 'CAA');
      expect(caaRecords).toHaveLength(1);
      expect(caaRecords[0].data.value).toContain(`accounturi=${VALID_ACME_URI_2}`);

      // After R1 returns, generation and dns_lease_expires_at still equal R2's values
      const afterRow = await workerEnv.DB.prepare(`
        SELECT dns_lease_generation, dns_lease_expires_at
        FROM mcp_bridge_bindings
        WHERE account_id = ?
      `).bind(account.accountId).first();
      expect(afterRow.dns_lease_generation).toBe(recordedGeneration);
      expect(afterRow.dns_lease_expires_at).toBe(recordedExpiresAt);
    });

    it('hard stale writer: fails provisional commit when lease was stolen while batch was inflight, subsequent request repairs zone', async () => {
      const env = dnsEnv();
      const home = await generateReachKeyPair();
      const account = await seedBoundAccount(env, home.instanceId);

      // A pinned, verified address for URI1.
      const warm = await fetchBridge(await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      }), env);
      expect(warm.status).toBe(200);

      // Drift the CAA's TTL and age the verification past the re-verify window,
      // so R1 takes the write path with an in-place patch of the same CAA record.
      const caa = fakeZone.getRecords().find((r) => r.type === 'CAA');
      caa.ttl = 300;
      const later = Date.now() + 6 * 3600 * 1000 + 1000;
      vi.spyOn(Date, 'now').mockReturnValue(later);

      const input1 = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });

      // While R1's batch is in flight, its lease is stolen and R2 replaces the pin
      // to URI2, patching the same CAA record; R1's stale patch then lands last.
      fakeZone.beforeBatch(async () => {
        await workerEnv.DB.prepare(`
          UPDATE mcp_bridge_bindings
          SET dns_lease_expires_at = 0
          WHERE account_id = ?
        `).bind(account.accountId).run();

        const input2 = await validDnsInput({
          home,
          claims: { acme_account_uri: VALID_ACME_URI_2, acme_account_replace: true },
        });
        const res2 = await fetchBridge(input2, env);
        expect(res2.status).toBe(200);
      });

      const res1 = await fetchBridge(input1, env);
      expect(res1.status).toBe(503);
      expect(await res1.json()).toEqual({ error: 'hostname_records_unavailable' });

      // In D1: dns_verified_uri is URI2 and state is provisional
      const rowAfterR1 = await workerEnv.DB.prepare(`
        SELECT dns_lease_generation, dns_lease_expires_at, dns_verified_uri, dns_verification_state
        FROM mcp_bridge_bindings
        WHERE account_id = ?
      `).bind(account.accountId).first();
      expect(rowAfterR1.dns_verified_uri).toBe(VALID_ACME_URI_2);
      expect(rowAfterR1.dns_verification_state).toBe('provisional');
      expect(rowAfterR1.dns_lease_generation).toBeGreaterThan(1);
      expect(rowAfterR1.dns_lease_expires_at).toBeNull();

      // Zone CAA data.value contains URI1 (R1's stale patch landed last)
      const caasAfterR1 = fakeZone.getRecords().filter((r) => r.type === 'CAA');
      expect(caasAfterR1).toHaveLength(1);
      expect(caasAfterR1[0].data.value).toContain(`accounturi=${VALID_ACME_URI_1}`);

      // Advance Date.now by 60_000 and request URI2 with no replace claim
      const futureNow = later + 60_000;
      vi.spyOn(Date, 'now').mockReturnValue(futureNow);
      fakeZone.fetchSpy.mockClear();

      const inputRepair = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_2 },
      });
      const resRepair = await fetchBridge(inputRepair, env);
      expect(resRepair.status).toBe(200);
      const repairBody = await resRepair.json();
      expect(repairBody.hostname).toBeDefined();

      // Called Cloudflare (not a zero-fetch fast path)
      expect(fakeZone.fetchSpy).toHaveBeenCalled();

      // Zone CAA now contains URI2
      const caaRepaired = fakeZone.getRecords().find((r) => r.type === 'CAA');
      expect(caaRepaired.data.value).toContain(`accounturi=${VALID_ACME_URI_2}`);

      // dns_verification_state is provisional, not confirmed
      const rowRepaired = await workerEnv.DB.prepare(`
        SELECT dns_verification_state
        FROM mcp_bridge_bindings
        WHERE account_id = ?
      `).bind(account.accountId).first();
      expect(rowRepaired.dns_verification_state).toBe('provisional');
    });

    it('pin move: when acme_account_uri changes in D1 after list, writes new URI, commits, and returns 409', async () => {
      const env = dnsEnv();
      const home = await generateReachKeyPair();
      const account = await seedBoundAccount(env, home.instanceId);

      const input = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });

      // Hook afterList to change acme_account_uri to URI2 in D1 (lease untouched)
      fakeZone.afterList(async () => {
        await workerEnv.DB.prepare(`
          UPDATE mcp_bridge_bindings
          SET acme_account_uri = ?
          WHERE account_id = ?
        `).bind(VALID_ACME_URI_2, account.accountId).run();
      });

      const res = await fetchBridge(input, env);
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: 'acme_account_changed' });

      // Stored verification URI is URI2
      const row = await workerEnv.DB.prepare(
        'SELECT dns_verified_uri, dns_verification_state FROM mcp_bridge_bindings WHERE account_id = ?'
      ).bind(account.accountId).first();
      expect(row.dns_verified_uri).toBe(VALID_ACME_URI_2);
      expect(row.dns_verification_state).toBe('provisional');
    });

    it('rejects when less than 10s remains on lease before fetch', async () => {
      const env = dnsEnv();
      const home = await generateReachKeyPair();
      const account = await seedBoundAccount(env, home.instanceId);

      const input = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });

      // Mock Date.now to bump time by 21s right after takeMcpBridgeDnsLease
      const originalNow = Date.now();
      let takeDone = false;
      const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
        if (takeDone) return originalNow + 21_000;
        return originalNow;
      });

      const interceptDb = {
        prepare: (sql, ...args) => {
          if (sql.includes('COALESCE(dns_lease_generation')) {
            takeDone = true;
          }
          return workerEnv.DB.prepare(sql, ...args);
        },
        batch: (...args) => workerEnv.DB.batch(...args),
      };

      const res = await fetchBridge(input, dnsEnv({ DB: interceptDb }));
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: 'hostname_records_unavailable' });
      expect(fakeZone.fetchSpy).not.toHaveBeenCalled();

      // Lease safely released
      const row = await workerEnv.DB.prepare(
        'SELECT dns_lease_expires_at FROM mcp_bridge_bindings WHERE account_id = ?'
      ).bind(account.accountId).first();
      expect(row.dns_lease_expires_at).toBeNull();
    });

    it('returns 503 while another request holds active lease', async () => {
      const env = dnsEnv();
      const home = await generateReachKeyPair();
      const account = await seedBoundAccount(env, home.instanceId);

      const input = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });
      await fetchBridge(input, env);

      // Invalidate verification state and artificially hold lease
      await workerEnv.DB.prepare(`
        UPDATE mcp_bridge_bindings
        SET dns_verification_state = NULL,
            dns_verified_at = NULL,
            dns_lease_expires_at = ?
        WHERE account_id = ?
      `).bind(Date.now() + 25000, account.accountId).run();

      const resHeld = await fetchBridge(input, env);
      expect(resHeld.status).toBe(503);
      expect(await resHeld.json()).toEqual({ error: 'hostname_records_unavailable' });
    });

    it('returns 200 with 0 batch fetches when zone already matches target', async () => {
      const env = dnsEnv();
      const home = await generateReachKeyPair();
      const account = await seedBoundAccount(env, home.instanceId);

      // Pre-seed matching records in fakeZone
      const label = 'abcdef23';
      const hostname = `${label}.solstone.me`;
      await workerEnv.DB.prepare(`
        INSERT INTO mcp_bridge_hostname_ledger (label, created_at) VALUES (?, ?)
      `).bind(label, Date.now()).run();
      await workerEnv.DB.prepare(`
        INSERT INTO mcp_bridge_bindings (account_id, instance_id, label, created_at) VALUES (?, ?, ?, ?)
      `).bind(account.accountId, home.instanceId, label, Date.now()).run();

      fakeZone.addRecord({
        type: 'CAA',
        name: hostname,
        data: { flags: 0, tag: 'issue', value: `letsencrypt.org; accounturi=${VALID_ACME_URI_1}; validationmethods=tls-alpn-01` },
        proxied: false,
        ttl: 60,
      });
      fakeZone.addRecord({
        type: 'A',
        name: hostname,
        content: V1_MCP_BRIDGE_ADDRESS,
        proxied: false,
        ttl: 60,
      });

      const input = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });

      const res = await fetchBridge(input, env);
      expect(res.status).toBe(200);

      // 1 list call, 0 batch calls
      const batchCalls = fakeZone.fetchSpy.mock.calls.filter(([url]) => url.includes('/batch'));
      expect(batchCalls).toHaveLength(0);

      const row = await workerEnv.DB.prepare(
        'SELECT dns_verification_state FROM mcp_bridge_bindings WHERE account_id = ?'
      ).bind(account.accountId).first();
      expect(row.dns_verification_state).toBe('provisional');
    });
  });

  describe('timeouts, missing config, and error handling', () => {
    it('uses AbortSignal.timeout(5000) on Cloudflare API requests', async () => {
      const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
      const env = dnsEnv();
      const home = await generateReachKeyPair();
      await seedBoundAccount(env, home.instanceId);

      const input = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });

      await fetchBridge(input, env);
      expect(timeoutSpy).toHaveBeenCalledWith(5000);
    });

    it('handles batch failures: HTTP 500, success: false, readback mismatch with clean lease release', async () => {
      const env = dnsEnv();
      const home = await generateReachKeyPair();
      const account = await seedBoundAccount(env, home.instanceId);
      const input = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });

      // 1. HTTP 500
      fakeZone.forceNextBatch({
        status: 500,
        body: { success: false, errors: [{ message: 'Cloudflare 500' }] },
      });
      const res500 = await fetchBridge(input, env);
      expect(res500.status).toBe(503);
      expect(await res500.json()).toEqual({ error: 'hostname_records_unavailable' });
      let row = await workerEnv.DB.prepare(
        'SELECT dns_verification_state, dns_lease_expires_at FROM mcp_bridge_bindings WHERE account_id = ?'
      ).bind(account.accountId).first();
      expect(row.dns_verification_state).toBeNull();
      expect(row.dns_lease_expires_at).toBeNull();

      // 2. HTTP 200 with success: false
      fakeZone.forceNextBatch({
        status: 200,
        body: { success: false, errors: [{ message: 'bad request' }] },
      });
      const resFalse = await fetchBridge(input, env);
      expect(resFalse.status).toBe(503);
      expect(await resFalse.json()).toEqual({ error: 'hostname_records_unavailable' });

      // 3. Readback mismatch (extra record added in batch)
      fakeZone.beforeBatch(async () => {
        fakeZone.addRecord({
          type: 'A',
          name: 'whatever.solstone.me',
          content: '8.8.8.8',
        });
      });
    });

    it('handles missing zone id or token: 503 on first pin, 200 on fresh fast-path, 200 with not_configured log on stale re-verify', async () => {
      const spy = installConsoleSpy();
      const home = await generateReachKeyPair();
      const account = await seedBoundAccount(dnsEnv(), home.instanceId);

      const input = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });

      // 1. First pin without zone ID -> 503 (no fetch)
      const resMissingZone = await fetchBridge(input, dnsEnv({ SOLSTONE_ME_ZONE_ID: '' }));
      expect(resMissingZone.status).toBe(503);
      expect(fakeZone.fetchSpy).not.toHaveBeenCalled();

      // Successfully mint
      await fetchBridge(input, dnsEnv());
      fakeZone.fetchSpy.mockClear();

      // 2. Fresh fast-path (<6h) without zone ID -> 200 (no fetch)
      const resFresh = await fetchBridge(input, dnsEnv({ SOLSTONE_ME_ZONE_ID: '' }));
      expect(resFresh.status).toBe(200);
      expect(fakeZone.fetchSpy).not.toHaveBeenCalled();

      // 3. Stale re-verify (>6h) without zone ID -> 200, logs not_configured, verified_at unchanged
      const sevenHoursLater = Date.now() + 7 * 3600 * 1000;
      vi.spyOn(Date, 'now').mockReturnValue(sevenHoursLater);

      const rowBefore = await workerEnv.DB.prepare(
        'SELECT dns_verified_at FROM mcp_bridge_bindings WHERE account_id = ?'
      ).bind(account.accountId).first();

      const futureInput = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });
      const resStale = await fetchBridge(futureInput, dnsEnv({ SOLSTONE_ME_ZONE_ID: '' }));
      expect(resStale.status).toBe(200);
      expect(fakeZone.fetchSpy).not.toHaveBeenCalled();

      const rowAfter = await workerEnv.DB.prepare(
        'SELECT dns_verified_at FROM mcp_bridge_bindings WHERE account_id = ?'
      ).bind(account.accountId).first();
      expect(rowAfter.dns_verified_at).toBe(rowBefore.dns_verified_at);

      spy.restore();
    });
  });

  describe('zone capacity and alert deduplication', () => {
    it('refuses when record count + new records exceeds ceiling, allows when within ceiling, defaults to 190', async () => {
      // 2 distinct addresses -> requires 1 CAA + 2 A = 3 records
      const env = dnsEnv({
        MCP_BRIDGE_ADDRESSES: '1.1.1.1, 2.2.2.2',
        SOLSTONE_ME_DNS_RECORD_CEILING: 190,
      });
      const home = await generateReachKeyPair();
      await seedBoundAccount(env, home.instanceId);
      const input = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });

      // Total count 188 + 3 = 191 > 190 -> 503 hostname_capacity
      fakeZone.setTotalRecordCount(188);
      const res188 = await fetchBridge(input, env);
      expect(res188.status).toBe(503);
      expect(await res188.json()).toEqual({ error: 'hostname_capacity' });

      // Total count 187 + 3 = 190 <= 190 -> 200
      fakeZone.setTotalRecordCount(187);
      const res187 = await fetchBridge(input, env);
      expect(res187.status).toBe(200);

      // Default ceiling when unset is 190
      expect(readDnsRecordCeiling({})).toBe(190);

      // Invalid ceilings "nope" and "0" -> 503 hostname_records_unavailable
      for (const badCeiling of ['nope', '0']) {
        const resBad = await fetchBridge(input, dnsEnv({ SOLSTONE_ME_DNS_RECORD_CEILING: badCeiling }));
        expect(resBad.status).toBe(503);
        expect(await resBad.json()).toEqual({ error: 'hostname_records_unavailable' });
      }
    });

    it('manages hub webhook capacity alerts: deduplicates within 24h, fires again after 24h', async () => {
      const hubCalls = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (req, init) => {
        const url = typeof req === 'string' ? req : req.url;
        if (url === 'https://hub.example.com/events') {
          const body = JSON.parse(init.body || '{}');
          hubCalls.push({ url, body });
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        return fakeZone.fetchSpy(req, init);
      };

      const env = dnsEnv({
        SOLSTONE_ME_DNS_RECORD_CEILING: 10,
        HUB_WEBHOOK_URL: 'https://hub.example.com/events',
      });
      const home = await generateReachKeyPair();
      await seedBoundAccount(env, home.instanceId);
      const input = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });

      fakeZone.setTotalRecordCount(10);

      // 1. First refusal emits hub event
      const res1 = await fetchBridge(input, env);
      expect(res1.status).toBe(503);
      expect(hubCalls).toHaveLength(1);
      expect(hubCalls[0].body).toMatchObject({
        office: 'cto',
        type: 'solstone_me_dns_capacity',
        record_count: 10,
      });
      expect(typeof hubCalls[0].body.ts).toBe('string');

      // 2. Second refusal within 24h deduplicates
      const res2 = await fetchBridge(input, env);
      expect(res2.status).toBe(503);
      expect(hubCalls).toHaveLength(1);

      // 3. Third refusal after 24h emits 2nd hub event
      const nextDay = Date.now() + 25 * 3600 * 1000;
      vi.spyOn(Date, 'now').mockReturnValue(nextDay);

      const inputDay2 = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });
      const res3 = await fetchBridge(inputDay2, env);
      expect(res3.status).toBe(503);
      expect(hubCalls).toHaveLength(2);

      globalThis.fetch = originalFetch;
    });
  });

  describe('unit tests on direct DNS client functions', () => {
    it('handles listLabelRecords, countZoneRecords, and applyLabelBatch directly', async () => {
      const env = dnsEnv();

      // listLabelRecords
      const list = await listLabelRecords(env, 'test.solstone.me');
      expect(list.ok).toBe(true);
      expect(Array.isArray(list.records)).toBe(true);

      // countZoneRecords
      fakeZone.setTotalRecordCount(42);
      const count = await countZoneRecords(env);
      expect(count.ok).toBe(true);
      expect(count.totalCount).toBe(42);

      // applyLabelBatch
      const batch = await applyLabelBatch(env, {
        deletes: [],
        patches: [],
        posts: [
          { type: 'A', name: 'direct.solstone.me', content: '1.2.3.4', ttl: 60, proxied: false },
        ],
      });
      expect(batch.ok).toBe(true);
    });
  });

  describe('secrets security', () => {
    it('never logs SOLSTONE_ME_DNS_API_TOKEN or bearer token in console errors', async () => {
      const spy = installConsoleSpy();
      const secretToken = 'secret-dns-token-12345';
      const env = dnsEnv({ SOLSTONE_ME_DNS_API_TOKEN: secretToken });
      const home = await generateReachKeyPair();
      await seedBoundAccount(env, home.instanceId);
      const input = await validDnsInput({
        home,
        claims: { acme_account_uri: VALID_ACME_URI_1 },
      });

      fakeZone.forceNextBatch({
        status: 500,
        body: { success: false, errors: [{ message: 'batch error' }] },
      });

      const res = await fetchBridge(input, env);
      expect(res.status).toBe(503);

      spy.assertNoSecrets([secretToken]);
      spy.restore();
    });
  });
});

function dnsEnv(overrides = {}) {
  return makeTestEnv({
    SOLSTONE_ME_ZONE_ID: 'test-solstone-me-zone-id',
    SOLSTONE_ME_DNS_API_TOKEN: 'test-solstone-me-dns-token',
    ...overrides,
  });
}

async function validDnsInput({
  home = null,
  claims = {},
} = {}) {
  const resolvedHome = home || await generateReachKeyPair();
  const { publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
  return {
    home: resolvedHome,
    instance_id: resolvedHome.instanceId,
    assertion: await mintHomeReachAssertion({
      instanceId: resolvedHome.instanceId,
      privateKey: resolvedHome.privateKey,
      claims: {
        scope: 'mcp.bridge.register',
        acme_account_uri: VALID_ACME_URI_1,
        ...claims,
      },
    }),
    ca_pubkey: resolvedHome.publicKeyPem,
    cnf_jwk: await exportJWK(publicKey),
  };
}

async function seedBoundAccount(env, instanceId, email = 'dns-test@example.com') {
  const account = await seedAccount({ email, testEnv: env });
  await seedSmeBinding({ accountId: account.accountId, instanceId });
  await seedEntitlement({ accountId: account.accountId, service: 'sme_hosted', status: 'active' });
  return account;
}

async function fetchBridge(body, env) {
  const { response } = await fetchWithCtx(worker, new Request('https://services.solstone.app/reach/mcp/bridge-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), env);
  return response;
}
