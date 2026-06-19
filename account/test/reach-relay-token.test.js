import { exportSPKI, generateKeyPair } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { installConsoleSpy, makeTestEnv } from './helpers.js';
import { generateReachKeyPair, mintHomeReachAssertion } from './reach-helper.js';

const INSTANCE_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_INSTANCE_ID = '22222222-2222-2222-2222-222222222222';

describe('reach relay token endpoint', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mints a 24h reach relay token without D1 access', async () => {
    const testEnv = reachEnv({ DB: throwingDb() });
    const payload = await validReachPayload();

    const response = await worker.fetch(reachRequest(payload), testEnv);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body)).toEqual(['token', 'token_type', 'expires_in', 'expires_at', 'instance_id']);
    expect(body.token_type).toBe('Bearer');
    expect(body.expires_in).toBe(86400);
    expect(body.instance_id).toBe(INSTANCE_ID);
    expect(body.expires_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);

    const parts = body.token.split('.');
    expect(parts).toHaveLength(3);
    expect(decodeJwtPart(parts[0])).toEqual({ alg: 'HS256', typ: 'reach-relay', kid: 'reach-relay-v1' });
    const claims = decodeJwtPart(parts[1]);
    expect(claims.iss).toBe('solstone-reach');
    expect(claims.aud).toBe('push-relay');
    expect(claims.scope).toBe('push.relay');
    expect(claims.instance_id).toBe(INSTANCE_ID);
    expect(Number.isInteger(claims.iat)).toBe(true);
    expect(claims.exp).toBe(claims.iat + 86400);
  });

  it('rejects malformed JSON as invalid input', async () => {
    const response = await worker.fetch(reachRequestRaw('{'), reachEnv({ DB: throwingDb() }));

    await expectError(response, 400, 'invalid_input');
  });

  it('rejects missing assertion as invalid input', async () => {
    const payload = await validReachPayload();
    delete payload.assertion;

    const response = await worker.fetch(reachRequest(payload), reachEnv({ DB: throwingDb() }));

    await expectError(response, 400, 'invalid_input');
  });

  it('rejects missing instance_id as invalid input', async () => {
    const payload = await validReachPayload();
    delete payload.instance_id;

    const response = await worker.fetch(reachRequest(payload), reachEnv({ DB: throwingDb() }));

    await expectError(response, 400, 'invalid_input');
  });

  it('rejects missing ca_pubkey as invalid input', async () => {
    const payload = await validReachPayload();
    delete payload.ca_pubkey;

    const response = await worker.fetch(reachRequest(payload), reachEnv({ DB: throwingDb() }));

    await expectError(response, 400, 'invalid_input');
  });

  it('rejects mismatched instance_id as invalid token', async () => {
    const payload = await validReachPayload();
    payload.instance_id = OTHER_INSTANCE_ID;

    const response = await worker.fetch(reachRequest(payload), reachEnv({ DB: throwingDb() }));

    await expectError(response, 401, 'invalid_token');
  });

  it('rejects wrong assertion issuer as invalid token', async () => {
    const payload = await validReachPayload({ claims: { iss: `home:${OTHER_INSTANCE_ID}` } });

    const response = await worker.fetch(reachRequest(payload), reachEnv({ DB: throwingDb() }));

    await expectError(response, 401, 'invalid_token');
  });

  it('rejects wrong assertion audience as invalid token', async () => {
    const payload = await validReachPayload({ claims: { aud: 'other-audience' } });

    const response = await worker.fetch(reachRequest(payload), reachEnv({ DB: throwingDb() }));

    await expectError(response, 401, 'invalid_token');
  });

  it('rejects wrong assertion scope as invalid token', async () => {
    const payload = await validReachPayload({ claims: { scope: 'push.relay' } });

    const response = await worker.fetch(reachRequest(payload), reachEnv({ DB: throwingDb() }));

    await expectError(response, 401, 'invalid_token');
  });

  it('rejects expired assertion as invalid token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = await validReachPayload({ claims: { exp: now - 10 } });

    const response = await worker.fetch(reachRequest(payload), reachEnv({ DB: throwingDb() }));

    await expectError(response, 401, 'invalid_token');
  });

  it('rejects future assertion iat as invalid token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = await validReachPayload({ claims: { iat: now + 120, exp: now + 240 } });

    const response = await worker.fetch(reachRequest(payload), reachEnv({ DB: throwingDb() }));

    await expectError(response, 401, 'invalid_token');
  });

  it('rejects bad assertion signature as invalid token', async () => {
    const good = await generateReachKeyPair();
    const bad = await generateReachKeyPair();
    const assertion = await mintHomeReachAssertion({
      instanceId: INSTANCE_ID,
      privateKey: good.privateKey,
      signingKey: bad.privateKey,
    });
    const payload = {
      instance_id: INSTANCE_ID,
      assertion,
      ca_pubkey: good.publicKeyPem,
    };

    const response = await worker.fetch(reachRequest(payload), reachEnv({ DB: throwingDb() }));

    await expectError(response, 401, 'invalid_token');
  });

  it('rejects wrong assertion alg as invalid token', async () => {
    const payload = await validReachPayload({ header: { alg: 'RS256' } });

    const response = await worker.fetch(reachRequest(payload), reachEnv({ DB: throwingDb() }));

    await expectError(response, 401, 'invalid_token');
  });

  it('rejects wrong assertion typ as invalid token', async () => {
    const payload = await validReachPayload({ header: { typ: 'JWT' } });

    const response = await worker.fetch(reachRequest(payload), reachEnv({ DB: throwingDb() }));

    await expectError(response, 401, 'invalid_token');
  });

  it('rejects non-P-256 ca_pubkey as invalid input', async () => {
    const payload = await validReachPayload();
    const { publicKey } = await generateKeyPair('ES384', { extractable: true });
    payload.ca_pubkey = await exportSPKI(publicKey);

    const response = await worker.fetch(reachRequest(payload), reachEnv({ DB: throwingDb() }));

    await expectError(response, 400, 'invalid_input');
  });

  it('rejects malformed ca_pubkey as invalid input', async () => {
    const payload = await validReachPayload();
    payload.ca_pubkey = 'not-a-pem';

    const response = await worker.fetch(reachRequest(payload), reachEnv({ DB: throwingDb() }));

    await expectError(response, 400, 'invalid_input');
  });

  it('rejects empty ca_pubkey as invalid input', async () => {
    const payload = await validReachPayload();
    payload.ca_pubkey = '';

    const response = await worker.fetch(reachRequest(payload), reachEnv({ DB: throwingDb() }));

    await expectError(response, 400, 'invalid_input');
  });

  it('does not log assertion, relay token, or ca_pubkey', async () => {
    const spy = installConsoleSpy();
    const testEnv = reachEnv({ DB: throwingDb() });
    const payload = await validReachPayload();

    const response = await worker.fetch(reachRequest(payload), testEnv);
    expect(response.status).toBe(200);
    const body = await response.json();

    spy.assertNoSecrets([payload.assertion, body.token, payload.ca_pubkey]);
    spy.restore();
  });
});

async function validReachPayload({ instanceId = INSTANCE_ID, header = {}, claims = {} } = {}) {
  const { publicKeyPem, privateKey } = await generateReachKeyPair();
  const assertion = await mintHomeReachAssertion({ instanceId, privateKey, header, claims });
  return {
    instance_id: instanceId,
    assertion,
    ca_pubkey: publicKeyPem,
  };
}

function reachEnv(overrides = {}) {
  return makeTestEnv(overrides);
}

function reachRequest(body) {
  return new Request('https://services.solstone.app/reach/push/relay-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function reachRequestRaw(body) {
  return new Request('https://services.solstone.app/reach/push/relay-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

async function expectError(response, status, error) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error });
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

function throwingDb() {
  return new Proxy({}, { get() { throw new Error('unexpected D1 access'); } });
}
