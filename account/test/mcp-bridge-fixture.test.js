import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import v1FixtureText from '../test-fixtures/mcp_bridge_v1.json?raw';
import v2FixtureText from '../test-fixtures/mcp_bridge_v2.json?raw';
import worker from '../src/index.js';
import { deriveJournalIdFromSpki } from '../src/crypto.js';
import { parseHomeReachCaPubkey } from '../src/reach.js';
import {
  fetchWithCtx,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedSmeBinding,
  V1_MCP_BRIDGE_ADDRESS,
} from './helpers.js';
import { installFakeSolstoneMeZone } from './fake-solstone-me-zone.js';

const V1_SHA256 = '6563b737522de561b62a00a93e5a083f5cfa56608bd45ea1bc388c0ee395c956';
const FIXTURE_NOW_MS = 1_700_000_000_000;

const V2_CA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQWlKYw5U0BTp/TLsowvmpKeLBzg9
bu+9FzYqScH+EVXR2+GHE0xZoSOR242MK4NX7h+sp/kGyDpkBKWfT3zBsA==
-----END PUBLIC KEY-----`;

// The P-256 private key below is frozen for regeneration only — tests do not call sign.
// eslint-disable-next-line no-unused-vars
const V2_CA_PRIVATE_KEY_FOR_REGENERATION = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg18tnFyg3ipmfVpDS
Tv6lvM0nLVKOM63PoGjHJjIdkLmhRANCAARBaUpjDlTQFOn9MuyjC+akp4sHOD1u
770XNipJwf4RVdHb4YcTTFmhI5HbjYwrg1fuH6yn+QbIOmQEpZ9PfMGw
-----END PRIVATE KEY-----`;

const V2_CNF_JWK = {
  kty: 'OKP',
  crv: 'Ed25519',
  x: 'AsjOOYUMUDDGYVvf2a02SDEXab1H9W3Zvc4WXzymL4c',
};

const V2_PIN_ASSERTION = 'eyJhbGciOiJFUzI1NiIsInR5cCI6ImhvbWUtcmVhY2gifQ.eyJpc3MiOiJob21lOjVmODQzZjkxLTVmY2QtOGE1YS05YzhiLTUwMDlkZWJkOGQwMCIsImF1ZCI6InNvbHN0b25lLXJlYWNoIiwic2NvcGUiOiJtY3AuYnJpZGdlLnJlZ2lzdGVyIiwiaW5zdGFuY2VfaWQiOiI1Zjg0M2Y5MS01ZmNkLThhNWEtOWM4Yi01MDA5ZGViZDhkMDAiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTcwMDAwMDI0MCwiYWNtZV9hY2NvdW50X3VyaSI6Imh0dHBzOi8vYWNtZS12MDIuYXBpLmxldHNlbmNyeXB0Lm9yZy9hY21lL2FjY3QvMTIzNDU2In0.FV6Sspl31a7e0HMwRQhK8nTDoOPbRCR8FLSBNAMMh7Nv5Xc_4s9I6cyEQ7P9wKRLcbv-KKF3x_ajRABPeR4tBw';

const V2_REPLACE_ASSERTION = 'eyJhbGciOiJFUzI1NiIsInR5cCI6ImhvbWUtcmVhY2gifQ.eyJpc3MiOiJob21lOjVmODQzZjkxLTVmY2QtOGE1YS05YzhiLTUwMDlkZWJkOGQwMCIsImF1ZCI6InNvbHN0b25lLXJlYWNoIiwic2NvcGUiOiJtY3AuYnJpZGdlLnJlZ2lzdGVyIiwiaW5zdGFuY2VfaWQiOiI1Zjg0M2Y5MS01ZmNkLThhNWEtOWM4Yi01MDA5ZGViZDhkMDAiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTcwMDAwMDI0MCwiYWNtZV9hY2NvdW50X3VyaSI6Imh0dHBzOi8vYWNtZS12MDIuYXBpLmxldHNlbmNyeXB0Lm9yZy9hY21lL2FjY3QvMDAwNzg5IiwiYWNtZV9hY2NvdW50X3JlcGxhY2UiOnRydWV9.1LASqdvvlq-cK6Tv6A6qGCT0MqcodecT3W3ZXYSlttNMRaVTTB11dfuEkygOSdd-JSm_g34W1acNUFBKumIpVg';

const V2_OTHER_ASSERTION = 'eyJhbGciOiJFUzI1NiIsInR5cCI6ImhvbWUtcmVhY2gifQ.eyJpc3MiOiJob21lOjVmODQzZjkxLTVmY2QtOGE1YS05YzhiLTUwMDlkZWJkOGQwMCIsImF1ZCI6InNvbHN0b25lLXJlYWNoIiwic2NvcGUiOiJtY3AuYnJpZGdlLnJlZ2lzdGVyIiwiaW5zdGFuY2VfaWQiOiI1Zjg0M2Y5MS01ZmNkLThhNWEtOWM4Yi01MDA5ZGViZDhkMDAiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTcwMDAwMDI0MCwiYWNtZV9hY2NvdW50X3VyaSI6Imh0dHBzOi8vYWNtZS12MDIuYXBpLmxldHNlbmNyeXB0Lm9yZy9hY21lL2FjY3QvMDAwNzg5In0.qiGfeA7mR9DF6kqXNHZfJ9SKm4v-i07UZM3B9Jfi_uzaX0eiQDOPJLM_HkJ-DbRMl1VFQ5MF5iyAdCUHPrQ55A';

const V2_NO_URI_ASSERTION = 'eyJhbGciOiJFUzI1NiIsInR5cCI6ImhvbWUtcmVhY2gifQ.eyJpc3MiOiJob21lOjVmODQzZjkxLTVmY2QtOGE1YS05YzhiLTUwMDlkZWJkOGQwMCIsImF1ZCI6InNvbHN0b25lLXJlYWNoIiwic2NvcGUiOiJtY3AuYnJpZGdlLnJlZ2lzdGVyIiwiaW5zdGFuY2VfaWQiOiI1Zjg0M2Y5MS01ZmNkLThhNWEtOWM4Yi01MDA5ZGViZDhkMDAiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTcwMDAwMDI0MH0.f2x_CD3Qn8PudlYFR__z9esVjYqJjy-uBSM6qJmveFtQThKgnfOLhvBXxpESFXv84S_1stQq5hc50I-5PX6syA';

describe('MCP bridge v1 golden fixture', () => {
  beforeEach(resetDb);

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('pins the byte SHA-256 and replays the v1 request to 426 journal_update_required', async () => {
    const encoder = new TextEncoder();
    const digestBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(v1FixtureText)));
    const digestHex = Array.from(digestBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(digestHex).toBe(V1_SHA256);

    const v1Artifact = JSON.parse(v1FixtureText);
    const env = makeTestEnv({
      MCP_BRIDGE_TOKEN_KID: 'mcp-bridge-fixture-v1',
      MCP_BRIDGE_ID: 'mcp-bridge-fixture',
      MCP_BRIDGE_ADDRESSES: V1_MCP_BRIDGE_ADDRESS,
    });
    vi.spyOn(Date, 'now').mockReturnValue(FIXTURE_NOW_MS);
    const parsedBody = JSON.parse(v1Artifact.request.body);
    const account = await seedAccount({ email: 'mcp-bridge-v1-replay@example.com', testEnv: env });
    await seedSmeBinding({ accountId: account.accountId, instanceId: parsedBody.instance_id });
    await seedEntitlement({ accountId: account.accountId, service: 'sme_hosted' });

    const { response } = await fetchWithCtx(worker, new Request(v1Artifact.request.url, {
      method: v1Artifact.request.method,
      headers: { 'Content-Type': 'application/json' },
      body: v1Artifact.request.body,
    }), env);

    const bodyJson = await response.json();
    console.log('v1 replay returned:', response.status, bodyJson);
    expect(response.status).toBe(426);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(bodyJson).toEqual({ error: 'journal_update_required' });
  });
});

describe('MCP bridge v2 golden fixture', () => {
  let fakeZone;
  beforeEach(async () => {
    await resetDb();
    fakeZone = installFakeSolstoneMeZone({ zoneId: 'test-zone-id' });
  });

  afterEach(() => {
    fakeZone?.restore();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reproduces every v2 golden case byte for byte', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(FIXTURE_NOW_MS);
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((bytes) => {
      bytes.set([0, 1, 2, 3, 4]);
      return bytes;
    });

    const env = makeTestEnv({
      MCP_BRIDGE_TOKEN_KID: 'mcp-bridge-fixture-v2',
      MCP_BRIDGE_ID: 'mcp-bridge-fixture',
      MCP_BRIDGE_ADDRESSES: V1_MCP_BRIDGE_ADDRESS,
      SOLSTONE_ME_ZONE_ID: 'test-zone-id',
      SOLSTONE_ME_DNS_API_TOKEN: 'test-dns-token',
    });

    const ca = await parseHomeReachCaPubkey(V2_CA_PUBLIC_KEY);
    const instanceId = await deriveJournalIdFromSpki(ca.spkiBytes);
    const account = await seedAccount({ email: 'mcp-bridge-v2-fixture@example.com', testEnv: env });
    await seedSmeBinding({ accountId: account.accountId, instanceId });
    await seedEntitlement({ accountId: account.accountId, service: 'sme_hosted' });

    const cases = [];

    async function executeCase(name, assertion, envOverrides = {}) {
      const requestEnv = { ...env, ...envOverrides };
      const rawBody = JSON.stringify({
        instance_id: instanceId,
        assertion,
        ca_pubkey: V2_CA_PUBLIC_KEY,
        cnf_jwk: V2_CNF_JWK,
      });
      const req = new Request('https://services.solstone.app/reach/mcp/bridge-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: rawBody,
      });
      const { response } = await fetchWithCtx(worker, req, requestEnv);
      const text = await response.text();
      cases.push({
        name,
        request: {
          method: 'POST',
          url: 'https://services.solstone.app/reach/mcp/bridge-token',
          body: rawBody,
        },
        response: {
          status: response.status,
          cache_control: response.headers.get('Cache-Control'),
          body_text: text,
        },
      });
      return { status: response.status, text };
    }

    // 1. first_pin
    await executeCase('first_pin', V2_PIN_ASSERTION);

    // 2. acme_account_changed (other assertion against pinned 123456)
    await executeCase('acme_account_changed', V2_OTHER_ASSERTION);

    // 3. replace (replace assertion changing pin to 000789)
    await executeCase('replace', V2_REPLACE_ASSERTION);

    // 4. journal_update_required
    await executeCase('journal_update_required', V2_NO_URI_ASSERTION);

    // Reset verification state so case 5 and 6 exercise write-path configuration errors
    await workerEnv.DB.prepare(
      'UPDATE mcp_bridge_bindings SET dns_verification_state = NULL, dns_verified_at = NULL WHERE account_id = ?'
    ).bind(account.accountId).run();

    // 5. hostname_records_unavailable
    await executeCase('hostname_records_unavailable', V2_REPLACE_ASSERTION, {
      SOLSTONE_ME_DNS_API_TOKEN: '',
    });

    await workerEnv.DB.prepare(
      'UPDATE mcp_bridge_bindings SET dns_verification_state = NULL, dns_verified_at = NULL WHERE account_id = ?'
    ).bind(account.accountId).run();

    // 6. hostname_capacity: the label has no records of its own and the zone is
    // at its ceiling, so the write path refuses before writing anything.
    for (const record of fakeZone.getRecords()) fakeZone.deleteRecord(record.id);
    fakeZone.setTotalRecordCount(190);
    const capacity = await executeCase('hostname_capacity', V2_REPLACE_ASSERTION);
    expect(capacity.text).toBe('{"error":"hostname_capacity"}');

    const artifact = {
      version: 2,
      clock_ms: FIXTURE_NOW_MS,
      ca_pubkey: V2_CA_PUBLIC_KEY,
      cnf_jwk: V2_CNF_JWK,
      cases,
    };

    const bytes = `${JSON.stringify(artifact, null, 2)}\n`;

    if (workerEnv.MCP_BRIDGE_FIXTURE_WRITE === '1') {
      const write = await fetch(workerEnv.MCP_BRIDGE_FIXTURE_WRITE_URL, {
        method: 'POST',
        body: bytes,
      });
      expect(write.status).toBe(204);
    } else {
      expect(bytes).toBe(v2FixtureText);
    }
  });
});
