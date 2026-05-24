import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { hashWithPepper } from '../src/crypto.js';
import {
  installConsoleSpy,
  installGcpFetchMock,
  makeTestEnv,
  pkcePair,
  resetDb,
  seedAccount,
  seedOAuthCode,
  seedOtp,
  seedSession,
  TEST_CSRF,
  verifyRequest,
} from './helpers.js';

describe('OAuth device-code flow', () => {
  let spy;
  let secrets;

  beforeEach(async () => {
    await resetDb();
    spy = installConsoleSpy();
    secrets = [];
  });

  afterEach(() => {
    spy.assertNoSecrets(secrets);
    spy.restore();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('authorizes without PKCE and matches authorization-code response keys', async () => {
    const testEnv = makeTestEnv();
    installProvisioningMock('gemini-device-key');
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const device = await createDeviceAuthorization(testEnv);
    secrets.push(device.device_code, device.user_code, device.user_code.replace('-', ''));

    await approveDevice(testEnv, session.cookie, device.user_code);
    const deviceResponse = await worker.fetch(deviceTokenRequest({
      device_code: device.device_code,
    }), testEnv);
    const deviceBody = await deviceResponse.json();
    secrets.push(
      deviceBody.access_token,
      deviceBody.refresh_token,
      deviceBody.dispatch_token,
      'gemini-device-key',
      await hashWithPepper(device.device_code, testEnv, 'OAUTH_TOKEN_PEPPER')
    );

    const seeded = await seedOAuthCode({ accountId: account.accountId, testEnv });
    const authResponse = await worker.fetch(authCodeRequest(seeded), testEnv);
    const authBody = await authResponse.json();
    secrets.push(seeded.code, authBody.access_token, authBody.refresh_token, authBody.dispatch_token);

    expect(deviceResponse.status).toBe(200);
    expect(authResponse.status).toBe(200);
    expect(symDiff(Object.keys(deviceBody), Object.keys(authBody))).toEqual([]);
    expect(deviceBody.account_id).toBe(account.accountId);
  });

  it('requires matching code_verifier when device authorization used PKCE', async () => {
    const testEnv = makeTestEnv();
    installProvisioningMock('gemini-pkce-key');
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const pkce = await pkcePair();
    const device = await createDeviceAuthorization(testEnv, {
      code_challenge: pkce.challenge,
      code_challenge_method: 'S256',
    });
    secrets.push(device.device_code, device.user_code, device.user_code.replace('-', ''));

    await approveDevice(testEnv, session.cookie, device.user_code);

    const missing = await worker.fetch(deviceTokenRequest({ device_code: device.device_code }), testEnv);
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: 'invalid_request' });

    const wrong = await worker.fetch(deviceTokenRequest({
      device_code: device.device_code,
      code_verifier: 'b'.repeat(43),
    }), testEnv);
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toEqual({ error: 'invalid_grant' });

    const ok = await worker.fetch(deviceTokenRequest({
      device_code: device.device_code,
      code_verifier: pkce.verifier,
    }), testEnv);
    const body = await ok.json();
    secrets.push(body.access_token, body.refresh_token, body.dispatch_token, 'gemini-pkce-key');

    expect(ok.status).toBe(200);
    expect(body.provisioned.gemini.api_key).toBe('gemini-pkce-key');
  });

  it('maps pending, slow_down, denied, expired, and missing rows to RFC errors', async () => {
    const now = 1_780_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const pending = await createDeviceAuthorization(testEnv);
    secrets.push(pending.device_code, pending.user_code, pending.user_code.replace('-', ''));

    const invalidRequest = await worker.fetch(deviceTokenRequest({ device_code: '' }), testEnv);
    expect(invalidRequest.status).toBe(400);
    expect(await invalidRequest.json()).toEqual({ error: 'invalid_request' });

    const invalidClient = await worker.fetch(deviceTokenRequest({
      device_code: pending.device_code,
      client_id: 'other-client',
    }), testEnv);
    expect(invalidClient.status).toBe(400);
    expect(await invalidClient.json()).toEqual({ error: 'invalid_client' });

    const first = await worker.fetch(deviceTokenRequest({ device_code: pending.device_code }), testEnv);
    expect(first.status).toBe(400);
    expect(await first.json()).toEqual({ error: 'authorization_pending' });

    const slow = await worker.fetch(deviceTokenRequest({ device_code: pending.device_code }), testEnv);
    expect(slow.status).toBe(400);
    expect(await slow.json()).toEqual({ error: 'slow_down' });
    await expect(deviceInterval(pending.device_code, testEnv)).resolves.toBe(10);

    const denied = await createDeviceAuthorization(testEnv);
    secrets.push(denied.device_code, denied.user_code, denied.user_code.replace('-', ''));
    await denyDevice(testEnv, session.cookie, denied.user_code);
    const deniedResponse = await worker.fetch(deviceTokenRequest({ device_code: denied.device_code }), testEnv);
    expect(deniedResponse.status).toBe(400);
    expect(await deniedResponse.json()).toEqual({ error: 'access_denied' });

    const expired = await createDeviceAuthorization(testEnv);
    secrets.push(expired.device_code, expired.user_code, expired.user_code.replace('-', ''));
    vi.setSystemTime(new Date(now + 901_000));
    const expiredResponse = await worker.fetch(deviceTokenRequest({ device_code: expired.device_code }), testEnv);
    expect(expiredResponse.status).toBe(400);
    expect(await expiredResponse.json()).toEqual({ error: 'expired_token' });

    const missing = await worker.fetch(deviceTokenRequest({ device_code: 'missing-device-code' }), testEnv);
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: 'invalid_grant' });
  });

  it('validates device authorization client, scope, and PKCE request fields', async () => {
    const testEnv = makeTestEnv();

    const missingScope = await worker.fetch(deviceAuthorizationRequest({ scope: null }), testEnv);
    expect(missingScope.status).toBe(400);
    expect(await missingScope.json()).toEqual({ error: 'invalid_request' });

    const invalidClient = await worker.fetch(deviceAuthorizationRequest({ client_id: 'other-client' }), testEnv);
    expect(invalidClient.status).toBe(400);
    expect(await invalidClient.json()).toEqual({ error: 'invalid_client' });

    const invalidScope = await worker.fetch(deviceAuthorizationRequest({ scope: 'other.scope' }), testEnv);
    expect(invalidScope.status).toBe(400);
    expect(await invalidScope.json()).toEqual({ error: 'invalid_scope' });

    const invalidPkce = await worker.fetch(deviceAuthorizationRequest({
      code_challenge: 'abc',
      code_challenge_method: 'plain',
    }), testEnv);
    expect(invalidPkce.status).toBe(400);
    expect(await invalidPkce.json()).toEqual({ error: 'invalid_request' });

    const ok = await createDeviceAuthorization(testEnv);
    expect(ok.user_code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
    secrets.push(ok.device_code, ok.user_code, ok.user_code.replace('-', ''));
  });

  it('bumps slow_down interval by five seconds per rapid poll and caps at 60', async () => {
    const testEnv = makeTestEnv();
    const device = await createDeviceAuthorization(testEnv);
    secrets.push(device.device_code, device.user_code, device.user_code.replace('-', ''));

    const pending = await worker.fetch(deviceTokenRequest({ device_code: device.device_code }), testEnv);
    expect(await pending.json()).toEqual({ error: 'authorization_pending' });
    await expect(deviceInterval(device.device_code, testEnv)).resolves.toBe(5);

    for (const interval of [10, 15, 20]) {
      const response = await worker.fetch(deviceTokenRequest({ device_code: device.device_code }), testEnv);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'slow_down' });
      await expect(deviceInterval(device.device_code, testEnv)).resolves.toBe(interval);
    }
    for (let i = 0; i < 17; i++) {
      await worker.fetch(deviceTokenRequest({ device_code: device.device_code }), testEnv);
    }

    await expect(deviceInterval(device.device_code, testEnv)).resolves.toBe(60);
  });

  it('consumes an approved device code only once under concurrent exchange', async () => {
    const testEnv = makeTestEnv();
    installProvisioningMock('gemini-race-key');
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const device = await createDeviceAuthorization(testEnv);
    secrets.push(device.device_code, device.user_code, device.user_code.replace('-', ''));
    await approveDevice(testEnv, session.cookie, device.user_code);

    const responses = await Promise.all([
      worker.fetch(deviceTokenRequest({ device_code: device.device_code }), testEnv),
      worker.fetch(deviceTokenRequest({ device_code: device.device_code }), testEnv),
    ]);
    const bodies = await Promise.all(responses.map((response) => response.clone().json()));
    for (const body of bodies) {
      secrets.push(body.access_token, body.refresh_token, body.dispatch_token);
    }

    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
    expect(bodies).toContainEqual({ error: 'invalid_grant' });
  });

  it('preserves typed user_code through unauthenticated sign-in resume', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'resume@example.com', testEnv });
    const device = await createDeviceAuthorization(testEnv);
    const post = await worker.fetch(devicePostRequest(device.user_code), testEnv);
    const location = new URL(post.headers.get('Location'), 'https://services.solstone.app');
    secrets.push(device.device_code, device.user_code, device.user_code.replace('-', ''));

    expect(post.status).toBe(303);
    expect(location.pathname).toBe('/');

    const otp = await seedOtp({ email: account.emailLower });
    const verify = await worker.fetch(verifyRequest({
      email: account.emailLower,
      code: otp.code,
      next: location.searchParams.get('next'),
      nextSig: location.searchParams.get('next_sig'),
    }), testEnv);

    expect(verify.status).toBe(303);
    expect(verify.headers.get('Location')).toBe(`/device?user_code=${device.user_code.replace('-', '')}`);
  });

  it('retries active user_code collisions and fails after the retry budget', async () => {
    const testEnv = makeTestEnv();
    await insertActiveUserCode('22222222');
    let userCalls = 0;
    let hexCalls = 0;
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      if (array.length === 32) {
        array.fill(++hexCalls);
      } else {
        userCalls += 1;
        array.fill(userCalls <= 7 ? 0 : 1);
      }
      return array;
    });

    const ok = await createDeviceAuthorization(testEnv);
    expect(ok.user_code).toBe('3333-3333');

    vi.restoreAllMocks();
    userCalls = 0;
    hexCalls = 0;
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      if (array.length === 32) array.fill(++hexCalls);
      else {
        userCalls += 1;
        array.fill(0);
      }
      return array;
    });

    const failed = await worker.fetch(deviceAuthorizationRequest(), testEnv);
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: 'server_error' });
  });

  it('ignores token request cookies and provisions the approving account', async () => {
    const testEnv = makeTestEnv();
    installProvisioningMock('gemini-account-a');
    const accountA = await seedAccount({ email: 'a@example.com', testEnv });
    const accountB = await seedAccount({ email: 'b@example.com', testEnv });
    const sessionA = await seedSession(accountA.accountId, { testEnv });
    const sessionB = await seedSession(accountB.accountId, { testEnv });
    const device = await createDeviceAuthorization(testEnv);
    await approveDevice(testEnv, sessionA.cookie, device.user_code);

    const response = await worker.fetch(deviceTokenRequest(
      { device_code: device.device_code },
      { Cookie: sessionB.cookie }
    ), testEnv);
    const body = await response.json();
    secrets.push(device.device_code, device.user_code, device.user_code.replace('-', ''), body.access_token, body.refresh_token, body.dispatch_token, 'gemini-account-a');

    expect(response.status).toBe(200);
    expect(body.account_id).toBe(accountA.accountId);
    expect(body.account_id).not.toBe(accountB.accountId);
  });
});

function deviceAuthorizationRequest(overrides = {}) {
  const params = {
    client_id: 'solstone-cli',
    scope: 'solstone.gemini',
    ...overrides,
  };
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null) body.set(key, value);
  }
  return new Request('https://services.solstone.app/oauth/device_authorization', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
}

async function createDeviceAuthorization(testEnv, overrides = {}) {
  const response = await worker.fetch(deviceAuthorizationRequest(overrides), testEnv);
  expect(response.status).toBe(200);
  return response.json();
}

function devicePostRequest(userCode, cookie = '') {
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Origin: 'https://services.solstone.app',
  };
  if (cookie) headers.Cookie = cookie;
  return new Request('https://services.solstone.app/device', {
    method: 'POST',
    headers,
    body: new URLSearchParams({ user_code: userCode }),
  });
}

async function approveDevice(testEnv, cookie, userCode) {
  await worker.fetch(devicePostRequest(userCode, cookie), testEnv);
  const response = await worker.fetch(deviceConfirmRequest(cookie, userCode, 'approve'), testEnv);
  expect(response.status).toBe(200);
}

async function denyDevice(testEnv, cookie, userCode) {
  await worker.fetch(devicePostRequest(userCode, cookie), testEnv);
  const response = await worker.fetch(deviceConfirmRequest(cookie, userCode, 'deny'), testEnv);
  expect(response.status).toBe(200);
}

function deviceConfirmRequest(cookie, userCode, action) {
  return new Request('https://services.solstone.app/device/confirm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'https://services.solstone.app',
      Cookie: cookie,
    },
    body: new URLSearchParams({
      csrf: TEST_CSRF,
      user_code: userCode,
      action,
    }),
  });
}

function deviceTokenRequest(overrides = {}, headers = {}) {
  return new Request('https://services.solstone.app/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...headers,
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: 'solstone-cli',
      ...overrides,
    }),
  });
}

function authCodeRequest(seeded) {
  return new Request('https://services.solstone.app/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: seeded.code,
      redirect_uri: seeded.redirectUri,
      client_id: seeded.clientId,
      code_verifier: seeded.verifier,
    }),
  });
}

async function deviceInterval(deviceCode, testEnv) {
  const hash = await hashWithPepper(deviceCode, testEnv, 'OAUTH_TOKEN_PEPPER');
  const row = await workerEnv.DB
    .prepare('SELECT interval_seconds FROM device_codes WHERE device_code_hash = ?')
    .bind(hash)
    .first();
  return row.interval_seconds;
}

async function insertActiveUserCode(userCode) {
  await workerEnv.DB
    .prepare(
      `INSERT INTO device_codes (
         device_code_hash, user_code, client_id, scope, created_at, expires_at
       ) VALUES (?, ?, 'solstone-cli', 'solstone.gemini', ?, ?)`
    )
    .bind(`hash-${userCode}`, userCode, Date.now(), Date.now() + 900_000)
    .run();
}

function installProvisioningMock(apiKey) {
  installGcpFetchMock({
    'POST oauth2.googleapis.com/token': async () => jsonResponse({
      access_token: 'gcp-access-token',
      expires_in: 3600,
      token_type: 'Bearer',
    }),
    'GET apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys': async () => jsonResponse({ keys: [] }),
    'POST apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys': async () => jsonResponse({ name: 'operations/create-key' }),
    'GET apikeys.googleapis.com/v2/operations/create-key': async () => jsonResponse({
      done: true,
      response: { name: 'projects/test-gcp-project/locations/global/keys/key-1' },
    }),
    'GET apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys/key-1/keyString': async () => jsonResponse({ keyString: apiKey }),
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function symDiff(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  return [...left.filter((key) => !b.has(key)), ...right.filter((key) => !a.has(key))].sort();
}
