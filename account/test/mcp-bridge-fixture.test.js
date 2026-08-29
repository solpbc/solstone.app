import { env as workerEnv } from 'cloudflare:test';
import { decodeProtectedHeader, importJWK, jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixtureText from '../test-fixtures/mcp_bridge_v1.json?raw';
import worker from '../src/index.js';
import { deriveJournalIdFromSpki } from '../src/crypto.js';
import { parseHomeReachCaPubkey } from '../src/reach.js';
import {
  fetchWithCtx,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedSplBinding,
} from './helpers.js';

const FIXTURE_NOW_MS = 1_700_000_000_000;
const FIXTURE_CA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEDqAw0i9YxRG5/1DAZ1eLejZJuTcq
Pjxbfiv6klgXm9nk08MUGpdn/Cgw5Fc0/lI39DF1GiyQ9AewtkawyxUDIQ==
-----END PUBLIC KEY-----`;
const FIXTURE_CNF_JWK = {
  kty: 'OKP',
  crv: 'Ed25519',
  x: 'AsjOOYUMUDDGYVvf2a02SDEXab1H9W3Zvc4WXzymL4c',
};
const FIXTURE_ASSERTION = 'eyJhbGciOiJFUzI1NiIsInR5cCI6ImhvbWUtcmVhY2gifQ.eyJpc3MiOiJob21lOjg0ODhhZTY0LWI1OTItODBhMy05N2M2LTQ5MGU5OTVkYWE4NSIsImF1ZCI6InNvbHN0b25lLXJlYWNoIiwic2NvcGUiOiJtY3AuYnJpZGdlLnJlZ2lzdGVyIiwiaW5zdGFuY2VfaWQiOiI4NDg4YWU2NC1iNTkyLTgwYTMtOTdjNi00OTBlOTk1ZGFhODUiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTcwMDAwMDI0MH0.Dob8pebaDSM80usXouCFraOrgzORGXDPQWzZgHLz1lIspj_C10nEF2lQJjbMn-RYgBDOTY-N7jlRB07tae2JSQ';

describe('MCP bridge v1 golden fixture', () => {
  beforeEach(resetDb);

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reproduces the real Worker request, response, and JWKS bytes', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(FIXTURE_NOW_MS);
    const env = makeTestEnv({
      MCP_BRIDGE_TOKEN_KID: 'mcp-bridge-fixture-v1',
      MCP_BRIDGE_ID: 'mcp-bridge-fixture',
      MCP_BRIDGE_ADDRESSES: '20.186.92.169',
    });
    const ca = await parseHomeReachCaPubkey(FIXTURE_CA_PUBLIC_KEY);
    if (!ca) throw new Error('fixture CA public key must be valid P-256 SPKI');
    const instanceId = await deriveJournalIdFromSpki(ca.spkiBytes);
    const rawRequest = JSON.stringify({
      instance_id: instanceId,
      assertion: FIXTURE_ASSERTION,
      ca_pubkey: FIXTURE_CA_PUBLIC_KEY,
      cnf_jwk: FIXTURE_CNF_JWK,
    });
    const account = await seedAccount({ email: 'mcp-bridge-fixture@example.com', testEnv: env });
    await seedSplBinding({ accountId: account.accountId, instanceId });
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((bytes) => {
      bytes.set([0, 1, 2, 3, 4]);
      return bytes;
    });

    const { response } = await fetchWithCtx(worker, new Request('https://services.solstone.app/reach/mcp/bridge-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: rawRequest,
    }), env);
    const { response: jwksResponse } = await fetchWithCtx(
      worker,
      new Request('https://services.solstone.app/.well-known/jwks.json'),
      env,
    );
    const artifact = {
      version: 1,
      request: {
        method: 'POST',
        url: 'https://services.solstone.app/reach/mcp/bridge-token',
        body: rawRequest,
      },
      response: {
        status: response.status,
        cache_control: response.headers.get('Cache-Control'),
        body: JSON.parse(await response.text()),
      },
      jwks: {
        status: jwksResponse.status,
        cache_control: jwksResponse.headers.get('Cache-Control'),
        body: JSON.parse(await jwksResponse.text()),
      },
    };
    const fixtureToken = artifact.response.body.token;
    const fixturePublicKey = await importJWK(artifact.jwks.body.keys[0], 'EdDSA');
    const verified = await jwtVerify(fixtureToken, fixturePublicKey, {
      issuer: 'services.solstone.app',
      audience: env.MCP_BRIDGE_ID,
      algorithms: ['EdDSA'],
      typ: 'JWT',
      currentDate: new Date(FIXTURE_NOW_MS),
    });
    expect(decodeProtectedHeader(fixtureToken)).toEqual({
      alg: 'EdDSA', typ: 'JWT', kid: env.MCP_BRIDGE_TOKEN_KID,
    });
    expect(Object.keys(verified.payload).sort()).toEqual([
      'aud', 'cnf', 'exp', 'hostname', 'iat', 'iss', 'sub',
    ]);
    expect(Object.keys(artifact.response.body)).toEqual([
      'token',
      'token_type',
      'expires_in',
      'expires_at',
      'instance_id',
      'hostname',
      'bridge_id',
      'bridge_addresses',
    ]);
    expect(verified.payload.cnf).toEqual({ jwk: FIXTURE_CNF_JWK });
    expect(verified.payload.exp - verified.payload.iat).toBe(600);
    expect(artifact.response.body.expires_at).toBe(
      new Date(verified.payload.exp * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    );
    const bytes = `${JSON.stringify(artifact, null, 2)}\n`;

    if (workerEnv.MCP_BRIDGE_FIXTURE_WRITE === '1') {
      const write = await fetch(workerEnv.MCP_BRIDGE_FIXTURE_WRITE_URL, {
        method: 'POST',
        body: bytes,
      });
      expect(write.status).toBe(204);
    } else {
      expect(bytes).toBe(fixtureText);
    }
  });
});
