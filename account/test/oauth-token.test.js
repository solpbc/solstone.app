import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  installConsoleSpy,
  installGcpFetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedOAuthCode,
  seedOauthToken,
} from './helpers.js';

describe('/oauth/token', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('authorization-code exchange rejects missing fields', async () => {
    const response = await worker.fetch(tokenRequest({ grant_type: 'authorization_code' }), makeTestEnv());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_request' });
  });

  it('authorization-code exchange rejects malformed body', async () => {
    const response = await worker.fetch(new Request('https://account.solstone.app/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=x' },
      body: 'not-a-valid-multipart-body',
    }), makeTestEnv());

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_request' });
  });

  it('authorization-code exchange rejects reused code', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    installProvisioningMock('gemini-key-reuse');
    const account = await seedAccount({ testEnv });
    const seeded = await seedOAuthCode({ accountId: account.accountId, testEnv });
    const first = await worker.fetch(exchangeRequest(seeded), testEnv);
    const second = await worker.fetch(exchangeRequest(seeded), testEnv);

    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
    expect(await second.json()).toEqual({ error: 'invalid_grant' });
    spy.assertNoSecrets([seeded.code, 'gemini-key-reuse']);
  });

  it('authorization-code exchange consumes a code once under concurrent exchange', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    installProvisioningMock('gemini-key-concurrent');
    const account = await seedAccount({ testEnv });
    const seeded = await seedOAuthCode({ accountId: account.accountId, testEnv });
    const responses = await Promise.all([
      worker.fetch(exchangeRequest(seeded), testEnv),
      worker.fetch(exchangeRequest(seeded), testEnv),
    ]);
    const bodies = await Promise.all(responses.map((response) => response.clone().json()));

    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
    expect(bodies).toContainEqual({ error: 'invalid_grant' });
    spy.assertNoSecrets([seeded.code, 'gemini-key-concurrent']);
  });

  it('authorization-code exchange rejects redirect_uri byte mismatch', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const seeded = await seedOAuthCode({ accountId: account.accountId, testEnv });
    const response = await worker.fetch(exchangeRequest(seeded, {
      redirect_uri: 'http://127.0.0.1:5015/callback/',
    }), testEnv);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_grant' });
  });

  it('authorization-code exchange rejects client_id mismatch', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const seeded = await seedOAuthCode({ accountId: account.accountId, testEnv });
    const response = await worker.fetch(exchangeRequest(seeded, {
      client_id: 'wrong-client',
    }), testEnv);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_client' });
  });

  it('authorization-code exchange rejects PKCE verifier mismatch', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const seeded = await seedOAuthCode({ accountId: account.accountId, testEnv });
    const response = await worker.fetch(exchangeRequest(seeded, {
      code_verifier: 'b'.repeat(43),
    }), testEnv);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_grant' });
  });

  it('authorization-code exchange rejects PKCE verifier that is too short', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const seeded = await seedOAuthCode({ accountId: account.accountId, testEnv });
    const response = await worker.fetch(exchangeRequest(seeded, {
      code_verifier: 'a'.repeat(42),
    }), testEnv);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_request' });
  });

  it('authorization-code exchange rejects PKCE verifier that is too long', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const seeded = await seedOAuthCode({ accountId: account.accountId, testEnv });
    const response = await worker.fetch(exchangeRequest(seeded, {
      code_verifier: 'a'.repeat(129),
    }), testEnv);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_request' });
  });

  it('authorization-code exchange rejects PKCE verifier with invalid character', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const seeded = await seedOAuthCode({ accountId: account.accountId, testEnv });
    const response = await worker.fetch(exchangeRequest(seeded, {
      code_verifier: `${'a'.repeat(42)}!`,
    }), testEnv);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_request' });
  });

  it('authorization-code exchange returns access, refresh, dispatch, account_id, and provisioned Gemini key', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    installProvisioningMock('gemini-key-success');
    const account = await seedAccount({ testEnv });
    const seeded = await seedOAuthCode({ accountId: account.accountId, testEnv });
    const response = await worker.fetch(exchangeRequest(seeded), testEnv);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.access_token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(body.refresh_token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(body.token_type).toBe('Bearer');
    expect(body.expires_in).toBe(3600);
    expect(body.scope).toBe('solstone.gemini');
    expect(body.provisioned.gemini.api_key).toBe('gemini-key-success');
    expect(body.dispatch_token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(body.account_id).toBe(account.accountId);
    expect(await countRows('oauth_tokens')).toBe(1);
    expect(await countRows('account_dispatch_tokens')).toBe(1);
    expect(await countRows('provisioned_keys')).toBe(1);
    spy.assertNoSecrets([seeded.code, body.access_token, body.refresh_token, body.dispatch_token, 'gemini-key-success']);
  });

  it('authorization-code exchange never sets cookies and always sets no-store/no-cache', async () => {
    const testEnv = makeTestEnv();
    installProvisioningMock('gemini-key-headers');
    const account = await seedAccount({ testEnv });
    const seeded = await seedOAuthCode({ accountId: account.accountId, testEnv });
    const response = await worker.fetch(exchangeRequest(seeded), testEnv);

    expect(response.headers.has('Set-Cookie')).toBe(false);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Pragma')).toBe('no-cache');
  });

  it('refresh exchange rotates tokens and preserves family_id', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const seeded = await seedOauthToken({ accountId: account.accountId, testEnv, familyId: 'family-a' });
    const response = await worker.fetch(tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: seeded.refreshToken,
    }), testEnv);
    const body = await response.json();
    const rows = await tokenRows();

    expect(response.status).toBe(200);
    expect(body.refresh_token).not.toBe(seeded.refreshToken);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.family_id === 'family-a')).toBe(true);
    expect(rows.filter((row) => row.revoked_at == null)).toHaveLength(1);
  });

  it('refresh exchange rotates one token under concurrent reuse', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const seeded = await seedOauthToken({ accountId: account.accountId, testEnv, familyId: 'family-concurrent' });
    const responses = await Promise.all([
      worker.fetch(tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: seeded.refreshToken,
      }), testEnv),
      worker.fetch(tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: seeded.refreshToken,
      }), testEnv),
    ]);
    const bodies = await Promise.all(responses.map((response) => response.clone().json()));

    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
    expect(bodies).toContainEqual({ error: 'invalid_grant' });
    expect(await activeFamilyCount('family-concurrent')).toBe(1);
  });

  it('refresh exchange returns no provisioned key and no dispatch token', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const seeded = await seedOauthToken({ accountId: account.accountId, testEnv });
    const response = await worker.fetch(tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: seeded.refreshToken,
    }), testEnv);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).not.toHaveProperty('provisioned');
    expect(body).not.toHaveProperty('dispatch_token');
  });

  it('reused old refresh token poisons token family', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const old = await seedOauthToken({ accountId: account.accountId, testEnv, familyId: 'family-poison' });
    const rotate = await worker.fetch(tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: old.refreshToken,
    }), testEnv);
    const rotatedBody = await rotate.json();
    const poison = await worker.fetch(tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: old.refreshToken,
    }), testEnv);
    const afterPoison = await worker.fetch(tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: rotatedBody.refresh_token,
    }), testEnv);

    expect(poison.status).toBe(400);
    expect(await poison.json()).toEqual({ error: 'invalid_grant' });
    expect(afterPoison.status).toBe(400);
    expect(await afterPoison.json()).toEqual({ error: 'invalid_grant' });
    expect(await activeFamilyCount('family-poison')).toBe(0);
  });

  it('reused old refresh token poisons token family when rotation happens in the same millisecond', async () => {
    const testEnv = makeTestEnv();
    const nowMs = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(nowMs);
    const account = await seedAccount({ testEnv });
    const old = await seedOauthToken({ accountId: account.accountId, testEnv, familyId: 'family-same-ms', nowMs });
    const rotate = await worker.fetch(tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: old.refreshToken,
    }), testEnv);
    const rotatedBody = await rotate.json();
    const poison = await worker.fetch(tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: old.refreshToken,
    }), testEnv);
    const afterPoison = await worker.fetch(tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: rotatedBody.refresh_token,
    }), testEnv);

    expect(rotate.status).toBe(200);
    expect(poison.status).toBe(400);
    expect(await poison.json()).toEqual({ error: 'invalid_grant' });
    expect(afterPoison.status).toBe(400);
    expect(await afterPoison.json()).toEqual({ error: 'invalid_grant' });
    expect(await activeFamilyCount('family-same-ms')).toBe(0);
  });

  it('device_code grant is unsupported_grant_type', async () => {
    const response = await worker.fetch(tokenRequest({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }), makeTestEnv());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'unsupported_grant_type' });
  });

  it('unknown grant is unsupported_grant_type', async () => {
    const response = await worker.fetch(tokenRequest({ grant_type: 'client_credentials' }), makeTestEnv());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'unsupported_grant_type' });
  });

  it('inbound Cookie is ignored', async () => {
    const testEnv = makeTestEnv();
    installProvisioningMock('gemini-key-cookie');
    const account = await seedAccount({ testEnv });
    const seeded = await seedOAuthCode({ accountId: account.accountId, testEnv });
    const response = await worker.fetch(exchangeRequest(seeded, {}, { Cookie: 'account_session=attacker' }), testEnv);

    expect(response.status).toBe(200);
    expect(response.headers.has('Set-Cookie')).toBe(false);
  });

  it('code for account A cannot produce account B token or dispatch token', async () => {
    const testEnv = makeTestEnv();
    installProvisioningMock('gemini-key-account-a');
    const accountA = await seedAccount({ email: 'a@example.com', testEnv });
    const accountB = await seedAccount({ email: 'b@example.com', testEnv });
    const seeded = await seedOAuthCode({ accountId: accountA.accountId, testEnv });
    const response = await worker.fetch(exchangeRequest(seeded), testEnv);
    const body = await response.json();
    const dispatchRow = await workerEnv.DB.prepare('SELECT account_id FROM account_dispatch_tokens').first();

    expect(response.status).toBe(200);
    expect(body.account_id).toBe(accountA.accountId);
    expect(body.account_id).not.toBe(accountB.accountId);
    expect(dispatchRow.account_id).toBe(accountA.accountId);
  });
});

function tokenRequest(params, headers = {}) {
  return new Request('https://account.solstone.app/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...headers,
    },
    body: new URLSearchParams(params),
  });
}

function exchangeRequest(seeded, overrides = {}, headers = {}) {
  return tokenRequest({
    grant_type: 'authorization_code',
    code: seeded.code,
    redirect_uri: seeded.redirectUri,
    client_id: seeded.clientId,
    code_verifier: seeded.verifier,
    ...overrides,
  }, headers);
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

async function countRows(table) {
  const row = await workerEnv.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
  return row.count;
}

async function tokenRows() {
  const { results } = await workerEnv.DB
    .prepare('SELECT family_id, revoked_at FROM oauth_tokens ORDER BY created_at ASC, id ASC')
    .all();
  return results || [];
}

async function activeFamilyCount(familyId) {
  const row = await workerEnv.DB
    .prepare('SELECT COUNT(*) AS count FROM oauth_tokens WHERE family_id = ? AND revoked_at IS NULL')
    .bind(familyId)
    .first();
  return row.count;
}
