import { env as workerEnv } from 'cloudflare:test';
import {
  decodeProtectedHeader,
  exportJWK,
  exportSPKI,
  generateKeyPair,
  importJWK,
  jwtVerify,
  SignJWT,
} from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { base64UrlEncode } from '../src/crypto.js';
import { labelFromRandomBytes } from '../src/mcp-bridge.js';
import {
  fetchWithCtx,
  installConsoleSpy,
  makeTestEnv,
  resetDb,
  rowCount,
  seedAccount,
  seedSplBinding,
} from './helpers.js';
import { generateReachKeyPair, mintHomeReachAssertion } from './reach-helper.js';

const FIXED_NOW_MS = 1_700_000_000_000;

describe('MCP bridge token endpoint', () => {
  beforeEach(resetDb);

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns the exact v1 response and an EdDSA JWT verifiable from the published JWKS', async () => {
    const nowMs = FIXED_NOW_MS + 789;
    const nowSeconds = Math.floor(nowMs / 1000);
    vi.spyOn(Date, 'now').mockReturnValue(nowMs);
    const env = makeTestEnv();
    const input = await validInput();
    input.bridge_id = 'request-must-not-control-bridge';
    input.bridge_addresses = ['127.0.0.1'];
    const account = await seedBoundAccount(env, input.instance_id);

    const response = await fetchBridge(input, env);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.json();
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
    expect(body.token_type).toBe('Bearer');
    expect(body.expires_in).toBe(600);
    expect(body.expires_at).toBe(new Date((nowSeconds + 600) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'));
    expect(body.instance_id).toBe(input.instance_id);
    expect(body.hostname).toMatch(/^[a-z2-7]{8}\.solstone\.me$/);
    expect(body.bridge_id).toBe(env.MCP_BRIDGE_ID);
    expect(body.bridge_addresses).toEqual(['20.186.92.169']);
    expect(body.bridge_id).not.toBe(input.bridge_id);
    expect(body.bridge_addresses).not.toEqual(input.bridge_addresses);
    expect(await rowCount('mcp_bridge_hostname_ledger')).toBe(1);
    expect(await rowCount('mcp_bridge_bindings')).toBe(1);
    await expect(workerEnv.DB.prepare(
      'SELECT account_id, instance_id FROM mcp_bridge_bindings WHERE account_id = ?'
    ).bind(account.accountId).first()).resolves.toEqual({
      account_id: account.accountId,
      instance_id: input.instance_id,
    });

    const jwksResponse = await fetchJwks(env);
    expect(jwksResponse.status).toBe(200);
    expect(jwksResponse.headers.get('Cache-Control')).toBe('public, max-age=300');
    const jwks = await jwksResponse.json();
    expect(jwks).toEqual({ keys: [{
      kty: 'OKP', crv: 'Ed25519', x: expect.any(String),
      kid: env.MCP_BRIDGE_TOKEN_KID, use: 'sig', alg: 'EdDSA',
    }] });
    expect(jwks.keys[0]).not.toHaveProperty('d');
    const publicKey = await importJWK(jwks.keys[0], 'EdDSA');
    const verified = await jwtVerify(body.token, publicKey, {
      issuer: 'services.solstone.app',
      audience: env.MCP_BRIDGE_ID,
      algorithms: ['EdDSA'],
      typ: 'JWT',
      currentDate: new Date(nowMs),
    });
    expect(decodeProtectedHeader(body.token)).toEqual({
      alg: 'EdDSA', typ: 'JWT', kid: env.MCP_BRIDGE_TOKEN_KID,
    });
    expect(verified.payload).toEqual({
      iss: 'services.solstone.app',
      aud: env.MCP_BRIDGE_ID,
      sub: `home:${input.instance_id}`,
      hostname: body.hostname,
      cnf: { jwk: input.cnf_jwk },
      iat: nowSeconds,
      exp: nowSeconds + 600,
    });
    expect(verified.payload.exp - verified.payload.iat).toBe(body.expires_in);
    expect(body.expires_at).toBe(new Date(verified.payload.exp * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'));
    expect(verified.payload).not.toHaveProperty('scope');
    expect(verified.payload).not.toHaveProperty('cnf_jwk');
  });

  it('repeats a live binding without consuming another random label', async () => {
    const env = makeTestEnv();
    const input = await validInput();
    await seedBoundAccount(env, input.instance_id);
    const rng = vi.spyOn(crypto, 'getRandomValues').mockImplementation((bytes) => {
      bytes.set([0, 1, 2, 3, 4]);
      return bytes;
    });

    const first = await responseBody(await fetchBridge(input, env));
    const second = await responseBody(await fetchBridge(input, env));

    expect(first.hostname).toBe('aaaqeaye.solstone.me');
    expect(second.hostname).toBe(first.hostname);
    expect(rng).toHaveBeenCalledTimes(1);
    expect(await rowCount('mcp_bridge_hostname_ledger')).toBe(1);
    expect(await rowCount('mcp_bridge_bindings')).toBe(1);
  });

  it('converges raced first mints on one hostname and rolls back the losing reservation', async () => {
    const { db, state } = countingBatchDb(workerEnv.DB);
    const env = makeTestEnv({ DB: db });
    const input = await validInput();
    await seedBoundAccount(env, input.instance_id);
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((bytes) => {
      bytes.set([0, 1, 2, 3, 4]);
      return bytes;
    });

    const [left, right] = await Promise.all([
      fetchBridge(input, env),
      fetchBridge(input, env),
    ]);
    const leftBody = await responseBody(left);
    const rightBody = await responseBody(right);

    expect(leftBody.hostname).toBe(rightBody.hostname);
    expect(state.calls).toBe(2);
    expect(await rowCount('mcp_bridge_hostname_ledger')).toBe(1);
    expect(await rowCount('mcp_bridge_bindings')).toBe(1);
  });

  it('derives the bridge hostname from random bytes alone, independent of account, instance, CA key, PoP key, or clock', async () => {
    const fixedBytes = new Uint8Array([1, 2, 3, 4, 5]);
    const expectedHostname = `${labelFromRandomBytes(fixedBytes)}.solstone.me`;
    const hostnames = [];

    for (const [email, nowMs] of [
      ['randomness-one@example.com', FIXED_NOW_MS],
      ['randomness-two@example.com', FIXED_NOW_MS + 60_000],
    ]) {
      await resetDb();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(nowMs);
      const input = await validInput();
      const env = makeTestEnv();
      await seedBoundAccount(env, input.instance_id, email);
      const rng = vi.spyOn(crypto, 'getRandomValues').mockImplementation((bytes) => {
        bytes.set(fixedBytes);
        return bytes;
      });

      hostnames.push((await responseBody(await fetchBridge(input, env))).hostname);
      rng.mockRestore();
      clock.mockRestore();
    }

    expect(hostnames).toEqual([expectedHostname, expectedHostname]);

    await resetDb();
    const changedBytes = new Uint8Array([5, 4, 3, 2, 1]);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW_MS + 120_000);
    const input = await validInput();
    const env = makeTestEnv();
    await seedBoundAccount(env, input.instance_id, 'randomness-three@example.com');
    const rng = vi.spyOn(crypto, 'getRandomValues').mockImplementation((bytes) => {
      bytes.set(changedBytes);
      return bytes;
    });

    await expect(responseBody(await fetchBridge(input, env))).resolves.toMatchObject({
      hostname: `${labelFromRandomBytes(changedBytes)}.solstone.me`,
    });
    expect(labelFromRandomBytes(changedBytes)).not.toBe(labelFromRandomBytes(fixedBytes));
  });

  it('uses all five random bytes, retries a permanent-label collision, and bounds collisions', async () => {
    expect(labelFromRandomBytes(new Uint8Array([0, 0, 0, 0, 0]))).toBe('aaaaaaaa');
    expect(labelFromRandomBytes(new Uint8Array([0, 0, 0, 0, 1]))).toBe('aaaaaaab');
    expect(labelFromRandomBytes(new Uint8Array([255, 255, 255, 255, 255]))).toBe('77777777');

    const env = makeTestEnv();
    const input = await validInput();
    await seedBoundAccount(env, input.instance_id);
    await workerEnv.DB.prepare(
      'INSERT INTO mcp_bridge_hostname_ledger (label, created_at) VALUES (?, ?)'
    ).bind('aaaaaaaa', 1).run();
    const values = [new Uint8Array(5), new Uint8Array([255, 255, 255, 255, 255])];
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((bytes) => {
      bytes.set(values.shift() || new Uint8Array([255, 255, 255, 255, 255]));
      return bytes;
    });

    await expect(responseBody(await fetchBridge(input, env))).resolves.toMatchObject({
      hostname: '77777777.solstone.me',
    });
    expect(await rowCount('mcp_bridge_hostname_ledger')).toBe(2);

    await resetDb();
    const exhausted = await validInput();
    await seedBoundAccount(env, exhausted.instance_id);
    await workerEnv.DB.prepare(
      'INSERT INTO mcp_bridge_hostname_ledger (label, created_at) VALUES (?, ?)'
    ).bind('aaaaaaaa', 1).run();
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((bytes) => {
      bytes.fill(0);
      return bytes;
    });
    await expectError(await fetchBridge(exhausted, env), 503, 'hostname_assignment_unavailable');
    expect(await rowCount('mcp_bridge_hostname_ledger')).toBe(1);
    expect(await rowCount('mcp_bridge_bindings')).toBe(0);
  });

  it('fails closed for missing or ambiguous SPL bindings, and before D1 for a derived-JID mismatch', async () => {
    const env = makeTestEnv();
    const absent = await validInput();
    await expectError(await fetchBridge(absent, env), 401, 'invalid_token');
    expect(await rowCount('mcp_bridge_hostname_ledger')).toBe(0);

    const ambiguous = await validInput();
    await seedBoundAccount(env, ambiguous.instance_id, 'ambiguous-one@example.com');
    const other = await seedAccount({ email: 'ambiguous-two@example.com', testEnv: env });
    await seedSplBinding({ accountId: other.accountId, instanceId: ambiguous.instance_id });
    await expectError(await fetchBridge(ambiguous, env), 401, 'invalid_token');
    expect(await rowCount('mcp_bridge_hostname_ledger')).toBe(0);

    const bound = await validInput();
    await seedBoundAccount(env, bound.instance_id, 'bound@example.com');
    const unbound = await validInput({ instanceId: bound.instance_id });
    await expectError(await fetchBridge(unbound, makeTestEnv({ DB: throwingDb() })), 401, 'invalid_token');
  });

  it('gates active deletion before allocation and permits the control account', async () => {
    const env = makeTestEnv();
    const deleting = await validInput();
    const deletingAccount = await seedBoundAccount(env, deleting.instance_id, 'deleting@example.com');
    await activeDeletion(deletingAccount.accountId);
    const rng = vi.spyOn(crypto, 'getRandomValues');
    await expectError(await fetchBridge(deleting, env), 409, 'deletion_in_progress');
    expect(rng).not.toHaveBeenCalled();
    expect(await rowCount('mcp_bridge_hostname_ledger')).toBe(0);

    const control = await validInput();
    await seedBoundAccount(env, control.instance_id, 'control@example.com');
    await expect(responseBody(await fetchBridge(control, env))).resolves.toMatchObject({
      hostname: expect.stringMatching(/\.solstone\.me$/),
    });
  });

  it('never reuses a retired label after its live binding is deleted', async () => {
    const env = makeTestEnv();
    const first = await validInput();
    const later = await validInput();
    const firstAccount = await seedBoundAccount(env, first.instance_id, 'retired-label@example.com');
    const values = [new Uint8Array(5), new Uint8Array([255, 255, 255, 255, 255])];
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((bytes) => {
      bytes.set(values.shift() || new Uint8Array([255, 255, 255, 255, 255]));
      return bytes;
    });
    await expect(responseBody(await fetchBridge(first, env))).resolves.toMatchObject({
      hostname: 'aaaaaaaa.solstone.me',
    });
    await workerEnv.DB.prepare('DELETE FROM mcp_bridge_bindings WHERE account_id = ?').bind(firstAccount.accountId).run();
    expect(await rowCount('mcp_bridge_bindings')).toBe(0);
    expect(await rowCount('mcp_bridge_hostname_ledger')).toBe(1);

    await seedBoundAccount(env, later.instance_id, 'later-label@example.com');
    await expect(responseBody(await fetchBridge(later, env))).resolves.toMatchObject({
      hostname: '77777777.solstone.me',
    });
    expect(await rowCount('mcp_bridge_hostname_ledger')).toBe(2);
  });

  it('rejects both directions of reach assertion scope confusion', async () => {
    const env = makeTestEnv({ DB: throwingDb() });
    const pushScope = await validInput({ scope: 'push.relay.enroll' });
    await expectError(await fetchBridge(pushScope, env), 401, 'invalid_token');

    const mcpScope = await validInput();
    const response = await worker.fetch(new Request('https://services.solstone.app/reach/push/relay-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instance_id: mcpScope.instance_id,
        assertion: mcpScope.assertion,
        ca_pubkey: mcpScope.ca_pubkey,
      }),
    }), env);
    await expectError(response, 401, 'invalid_token');
  });

  it('rejects malformed request inputs and private or noncanonical confirmation JWKs before D1', async () => {
    const env = makeTestEnv({ DB: throwingDb() });
    await expectError(await worker.fetch(new Request('https://services.solstone.app/reach/mcp/bridge-token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
    }), env), 400, 'invalid_input');

    const valid = await validInput();
    const cases = [
      { ...valid, ca_pubkey: `${valid.ca_pubkey}\n` },
      { ...valid, cnf_jwk: { ...valid.cnf_jwk, x: `${valid.cnf_jwk.x}=` } },
      { ...valid, cnf_jwk: { ...valid.cnf_jwk, x: base64UrlEncode(new Uint8Array(31)) } },
      { ...valid, cnf_jwk: { ...valid.cnf_jwk, x: base64UrlEncode(new Uint8Array(33)) } },
      { ...valid, cnf_jwk: { ...valid.cnf_jwk, d: 'private' } },
      { ...valid, cnf_jwk: { ...valid.cnf_jwk, kty: 'EC' } },
      { ...valid, cnf_jwk: { ...valid.cnf_jwk, crv: 'X25519' } },
      { ...valid, cnf_jwk: { ...valid.cnf_jwk, alg: 'ES256' } },
      { ...valid, cnf_jwk: { ...valid.cnf_jwk, use: 'enc' } },
      { ...valid, cnf_jwk: { ...valid.cnf_jwk, key_ops: ['sign'] } },
    ];
    for (const input of cases) await expectError(await fetchBridge(input, env), 400, 'invalid_input');
    await expectError(await fetchBridge({ ...valid, instance_id: '00000000-0000-8000-8000-000000000000' }, env), 401, 'invalid_token');
  });

  it('rejects wrong request types, non-P-256 keys, and every home-reach assertion boundary', async () => {
    const env = makeTestEnv({ DB: throwingDb() });
    const valid = await validInput();
    const missingCnf = { ...valid };
    delete missingCnf.cnf_jwk;
    for (const body of [
      null,
      [],
      { ...valid, instance_id: 1 },
      { ...valid, assertion: 1 },
      { ...valid, ca_pubkey: 1 },
      missingCnf,
    ]) {
      await expectError(await fetchBridge(body, env), 400, 'invalid_input');
    }
    const p384 = await generateKeyPair('ES384', { extractable: true });
    await expectError(await fetchBridge({ ...valid, ca_pubkey: await exportSPKI(p384.publicKey) }, env), 400, 'invalid_input');

    const now = Math.floor(Date.now() / 1000);
    const assertionCases = [
      await validInput({ header: { typ: 'other' } }),
      await validInput({ claims: { iss: 'home:other' } }),
      await validInput({ claims: { aud: 'other' } }),
      await validInput({ claims: { instance_id: 'other' } }),
      await validInput({ claims: { exp: now - 1 } }),
      await validInput({ claims: { iat: now + 120, exp: now + 240 } }),
    ];
    const badSignature = await validInput();
    const [header, payload, signature] = badSignature.assertion.split('.');
    badSignature.assertion = `${header}.${payload}.${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
    assertionCases.push(badSignature);
    for (const body of assertionCases) await expectError(await fetchBridge(body, env), 401, 'invalid_token');
  });

  it('returns typed no-store 503s for configuration, D1, assignment, signing, and JWKS failures', async () => {
    const input = await validInput();
    for (const overrides of [
      { MCP_BRIDGE_TOKEN_PRIVATE_KEY: '' },
      { MCP_BRIDGE_TOKEN_PRIVATE_KEY: 'not a private key' },
      { MCP_BRIDGE_TOKEN_KID: '' },
      { MCP_BRIDGE_ID: '' },
      { MCP_BRIDGE_ADDRESSES: '' },
      { MCP_BRIDGE_ADDRESSES: 'not-an-address' },
    ]) {
      await expectError(await fetchBridge(input, makeTestEnv(overrides)), 503, 'bridge_configuration_unavailable');
    }
    await expectError(await fetchBridge(input, makeTestEnv({ DB: throwingDb() })), 503, 'binding_lookup_unavailable');

    const env = makeTestEnv();
    await seedBoundAccount(env, input.instance_id);
    const failingBatchDb = {
      prepare: (...args) => env.DB.prepare(...args),
      batch() { throw new Error('assignment failed'); },
    };
    await expectError(await fetchBridge(input, makeTestEnv({ DB: failingBatchDb })), 503, 'hostname_assignment_unavailable');
    expect(await rowCount('mcp_bridge_hostname_ledger')).toBe(0);

    const signing = vi.spyOn(SignJWT.prototype, 'sign').mockRejectedValue(new Error('signing failed'));
    await expectError(await fetchBridge(input, env), 503, 'token_mint_unavailable');
    expect(await rowCount('mcp_bridge_hostname_ledger')).toBe(1);
    signing.mockRestore();
    await expect(responseBody(await fetchBridge(input, env))).resolves.toMatchObject({
      hostname: expect.stringMatching(/\.solstone\.me$/),
    });

    const exportKey = vi.spyOn(crypto.subtle, 'exportKey').mockRejectedValue(new Error('public derivation failed'));
    await expectError(await fetchJwks(env), 503, 'jwks_unavailable');
    exportKey.mockRestore();
  });

  it('does not log assertion, CA key, token, or signing key material', async () => {
    const env = makeTestEnv();
    const input = await validInput();
    await seedBoundAccount(env, input.instance_id);
    const spy = installConsoleSpy();
    const body = await responseBody(await fetchBridge(input, env));

    spy.assertNoSecrets([
      input.assertion,
      input.ca_pubkey,
      body.token,
      env.MCP_BRIDGE_TOKEN_PRIVATE_KEY,
    ]);
    spy.restore();
  });
});

async function validInput({ instanceId = null, scope = 'mcp.bridge.register', header = {}, claims = {} } = {}) {
  const home = await generateReachKeyPair();
  const assertionInstanceId = instanceId || home.instanceId;
  const { publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
  const cnf_jwk = await exportJWK(publicKey);
  return {
    instance_id: assertionInstanceId,
    assertion: await mintHomeReachAssertion({
      instanceId: assertionInstanceId,
      privateKey: home.privateKey,
      header,
      claims: { scope, ...claims },
    }),
    ca_pubkey: home.publicKeyPem,
    cnf_jwk,
  };
}

async function seedBoundAccount(env, instanceId, email = 'mcp-bridge@example.com') {
  const account = await seedAccount({ email, testEnv: env });
  await seedSplBinding({ accountId: account.accountId, instanceId });
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

async function fetchJwks(env) {
  const { response } = await fetchWithCtx(
    worker,
    new Request('https://services.solstone.app/.well-known/jwks.json'),
    env,
  );
  return response;
}

async function responseBody(response) {
  expect(response.status).toBe(200);
  return response.json();
}

async function expectError(response, status, error) {
  expect(response.status).toBe(status);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  await expect(response.json()).resolves.toEqual({ error });
}

function throwingDb() {
  return { prepare() { throw new Error('unexpected D1 access'); } };
}

function countingBatchDb(realDb) {
  const state = { calls: 0 };
  return {
    db: {
      prepare: (...args) => realDb.prepare(...args),
      batch: (...args) => {
        state.calls += 1;
        return realDb.batch(...args);
      },
    },
    state,
  };
}

async function activeDeletion(accountId) {
  await workerEnv.DB.prepare(
    "INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, cancellation_deadline_at, status_token_hash) VALUES (?, ?, 'frozen', 0, 1, 'status')"
  ).bind(crypto.randomUUID(), accountId).run();
}
