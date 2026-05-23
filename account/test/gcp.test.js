import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GcpApiKeysDisabledError,
  GcpHostNotAllowedError,
  GcpTimeoutError,
  GcpUnauthorizedError,
  gcpCreateApiKey,
  gcpDeleteKey,
  gcpFetchKeyString,
  gcpFindKeyByDisplayName,
  gcpPollOperation,
} from '../src/gcp.js';
import { installConsoleSpy, installGcpFetchMock, makeTestEnv, makeFakeKv } from './helpers.js';
import { decodeSaJwtHeader, verifySaJwt } from './sa-helper.js';

describe('GCP API Keys client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('signs SA JWT with RS256 header including kid', async () => {
    let assertion = '';
    installGcpFetchMock({
      'POST oauth2.googleapis.com/token': async ({ init }) => {
        assertion = new URLSearchParams(init.body).get('assertion');
        return jsonResponse({ access_token: 'gcp-token', expires_in: 3600, token_type: 'Bearer' });
      },
      'POST apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys': async () => jsonResponse({ name: 'operations/op' }),
    });

    await gcpCreateApiKey({ env: makeTestEnv(), displayName: 'acct-test', requestId: 'request-1' });

    expect(decodeSaJwtHeader(assertion)).toEqual({ alg: 'RS256', typ: 'JWT', kid: 'test-sa-key' });
  });

  it('SA JWT claims match iss/aud/scope/iat/exp and omit sub', async () => {
    let assertion = '';
    installGcpFetchMock({
      'POST oauth2.googleapis.com/token': async ({ init }) => {
        assertion = new URLSearchParams(init.body).get('assertion');
        return jsonResponse({ access_token: 'gcp-token', expires_in: 3600, token_type: 'Bearer' });
      },
      'POST apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys': async () => jsonResponse({ name: 'operations/op' }),
    });

    await gcpCreateApiKey({ env: makeTestEnv(), displayName: 'acct-test', requestId: 'request-1' });
    const { payload } = await verifySaJwt(assertion, {
      issuer: 'test-sa@test-gcp-project.iam.gserviceaccount.com',
      audience: 'https://oauth2.googleapis.com/token',
    });

    expect(payload.scope).toBe('https://www.googleapis.com/auth/cloud-platform');
    expect(payload.sub).toBeUndefined();
    expect(payload.exp - payload.iat).toBe(3600);
  });

  it('token endpoint receives form-encoded JWT bearer grant', async () => {
    let grantType = '';
    let assertion = '';
    installGcpFetchMock({
      'POST oauth2.googleapis.com/token': async ({ init }) => {
        const body = new URLSearchParams(init.body);
        grantType = body.get('grant_type');
        assertion = body.get('assertion');
        return jsonResponse({ access_token: 'gcp-token', expires_in: 3600, token_type: 'Bearer' });
      },
      'POST apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys': async () => jsonResponse({ name: 'operations/op' }),
    });

    await gcpCreateApiKey({ env: makeTestEnv(), displayName: 'acct-test', requestId: 'request-1' });

    expect(grantType).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(assertion.split('.')).toHaveLength(3);
  });

  it('caches token in GCP_TOKEN_CACHE with skewed TTL', async () => {
    const kv = makeFakeKv();
    installGcpFetchMock({
      'POST oauth2.googleapis.com/token': async () => jsonResponse({ access_token: 'gcp-token', expires_in: 3600, token_type: 'Bearer' }),
      'POST apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys': async () => jsonResponse({ name: 'operations/op' }),
    });

    await gcpCreateApiKey({
      env: makeTestEnv({ GCP_TOKEN_CACHE: kv }),
      displayName: 'acct-test',
      requestId: 'request-1',
    });

    expect(kv.puts[0]).toMatchObject({
      key: 'sa:cloud-platform',
      value: 'gcp-token',
      options: { expirationTtl: 3540 },
    });
  });

  it('reuses cached token', async () => {
    let tokenCalls = 0;
    installGcpFetchMock({
      'POST oauth2.googleapis.com/token': async () => {
        tokenCalls += 1;
        return jsonResponse({ access_token: 'gcp-token', expires_in: 3600, token_type: 'Bearer' });
      },
      'POST apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys': async () => jsonResponse({ name: 'operations/op' }),
    });
    const testEnv = makeTestEnv();

    await gcpCreateApiKey({ env: testEnv, displayName: 'acct-test', requestId: 'request-1' });
    await gcpCreateApiKey({ env: testEnv, displayName: 'acct-test', requestId: 'request-2' });

    expect(tokenCalls).toBe(1);
  });

  it('host allowlist throws before fetch on disallowed host', async () => {
    const testEnv = makeTestEnv({
      GCP_SERVICE_ACCOUNT_JSON: JSON.stringify({
        ...JSON.parse(makeTestEnv().GCP_SERVICE_ACCOUNT_JSON),
        token_uri: 'https://evil.example/token',
      }),
    });
    installGcpFetchMock({});

    await expect(gcpCreateApiKey({
      env: testEnv,
      displayName: 'acct-test',
      requestId: 'request-1',
    })).rejects.toBeInstanceOf(GcpHostNotAllowedError);
  });

  it('create API key uses SA project_id, requestId, and Gemini restriction body', async () => {
    let createUrl = null;
    let createBody = null;
    installGcpFetchMock({
      'POST oauth2.googleapis.com/token': async () => jsonResponse({ access_token: 'gcp-token', expires_in: 3600, token_type: 'Bearer' }),
      'POST apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys': async ({ url, init }) => {
        createUrl = url;
        createBody = JSON.parse(init.body);
        return jsonResponse({ name: 'operations/op' });
      },
    });

    await gcpCreateApiKey({ env: makeTestEnv(), displayName: 'acct-test', requestId: 'request-1' });

    expect(createUrl.searchParams.get('requestId')).toBe('request-1');
    expect(createBody).toEqual({
      displayName: 'acct-test',
      restrictions: {
        apiTargets: [{ service: 'generativelanguage.googleapis.com' }],
      },
    });
  });

  it('403 body containing API Keys API throws disabled error class', async () => {
    installGcpFetchMock({
      'POST oauth2.googleapis.com/token': async () => jsonResponse({ access_token: 'gcp-token', expires_in: 3600, token_type: 'Bearer' }),
      'POST apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys': async () => new Response('API Keys API has not been used', { status: 403 }),
    });

    await expect(gcpCreateApiKey({
      env: makeTestEnv(),
      displayName: 'acct-test',
      requestId: 'request-1',
    })).rejects.toBeInstanceOf(GcpApiKeysDisabledError);
  });

  it('poll operation returns response.name', async () => {
    installGcpFetchMock({
      'POST oauth2.googleapis.com/token': async () => jsonResponse({ access_token: 'gcp-token', expires_in: 3600, token_type: 'Bearer' }),
      'GET apikeys.googleapis.com/v2/operations/op': async () => jsonResponse({
        done: true,
        response: { name: 'projects/test/locations/global/keys/key-1' },
      }),
    });

    await expect(gcpPollOperation({ env: makeTestEnv(), opName: 'operations/op' }))
      .resolves.toBe('projects/test/locations/global/keys/key-1');
  });

  it('poll operation times out', async () => {
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(30_000);

    await expect(gcpPollOperation({ env: makeTestEnv(), opName: 'operations/op' }))
      .rejects.toBeInstanceOf(GcpTimeoutError);
  });

  it('poll operation error field throws', async () => {
    installGcpFetchMock({
      'POST oauth2.googleapis.com/token': async () => jsonResponse({ access_token: 'gcp-token', expires_in: 3600, token_type: 'Bearer' }),
      'GET apikeys.googleapis.com/v2/operations/op': async () => jsonResponse({
        done: true,
        error: { message: 'failed' },
      }),
    });

    await expect(gcpPollOperation({ env: makeTestEnv(), opName: 'operations/op' })).rejects.toThrow(/failed/);
  });

  it('keyString fetch returns top-level keyString', async () => {
    installGcpFetchMock({
      'POST oauth2.googleapis.com/token': async () => jsonResponse({ access_token: 'gcp-token', expires_in: 3600, token_type: 'Bearer' }),
      'GET apikeys.googleapis.com/v2/projects/test/locations/global/keys/key-1/keyString': async () => jsonResponse({ keyString: 'gemini-key' }),
    });

    await expect(gcpFetchKeyString({ env: makeTestEnv(), keyName: 'projects/test/locations/global/keys/key-1' }))
      .resolves.toBe('gemini-key');
  });

  it('delete key is best effort', async () => {
    installGcpFetchMock({
      'POST oauth2.googleapis.com/token': async () => jsonResponse({ access_token: 'gcp-token', expires_in: 3600, token_type: 'Bearer' }),
      'DELETE apikeys.googleapis.com/v2/projects/test/locations/global/keys/key-1': async () => new Response('failed', { status: 500 }),
    });

    await expect(gcpDeleteKey({ env: makeTestEnv(), keyName: 'projects/test/locations/global/keys/key-1' }))
      .rejects.toThrow(/delete failed/);
  });

  it('find key by displayName returns exact match', async () => {
    installGcpFetchMock({
      'POST oauth2.googleapis.com/token': async () => jsonResponse({ access_token: 'gcp-token', expires_in: 3600, token_type: 'Bearer' }),
      'GET apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys': async () => jsonResponse({
        keys: [
          { name: 'wrong', displayName: 'other' },
          { name: 'right', displayName: 'acct-test' },
        ],
      }),
    });

    await expect(gcpFindKeyByDisplayName({ env: makeTestEnv(), displayName: 'acct-test' }))
      .resolves.toEqual({ name: 'right', displayName: 'acct-test' });
  });

  it('stale 401 evicts cache, remints, and retries once', async () => {
    const kv = makeFakeKv();
    await kv.put('sa:cloud-platform', 'cached-gcp-token');
    let createCalls = 0;
    installGcpFetchMock({
      'POST oauth2.googleapis.com/token': async () => jsonResponse({ access_token: 'new-gcp-token', expires_in: 3600, token_type: 'Bearer' }),
      'POST apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys': async () => {
        createCalls += 1;
        if (createCalls === 1) return new Response('unauthorized', { status: 401 });
        return jsonResponse({ name: 'operations/op' });
      },
    });

    await expect(gcpCreateApiKey({
      env: makeTestEnv({ GCP_TOKEN_CACHE: kv }),
      displayName: 'acct-test',
      requestId: 'request-1',
    })).resolves.toBe('operations/op');
    expect(createCalls).toBe(2);
    await expect(kv.get('sa:cloud-platform')).resolves.toBe('new-gcp-token');
  });

  it('second 401 logs gcp_token_unauthorized without secrets', async () => {
    const spy = installConsoleSpy();
    const kv = makeFakeKv();
    await kv.put('sa:cloud-platform', 'cached-gcp-token');
    installGcpFetchMock({
      'POST oauth2.googleapis.com/token': async () => jsonResponse({ access_token: 'new-gcp-token', expires_in: 3600, token_type: 'Bearer' }),
      'POST apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys': async () => new Response('unauthorized', { status: 401 }),
    });

    await expect(gcpCreateApiKey({
      env: makeTestEnv({ GCP_TOKEN_CACHE: kv }),
      displayName: 'acct-test',
      requestId: 'request-1',
    })).rejects.toBeInstanceOf(GcpUnauthorizedError);
    expect(spy.calls.some((call) => call.args[0] === 'gcp_token_unauthorized')).toBe(true);
    spy.assertNoSecrets(['cached-gcp-token', 'new-gcp-token']);
  });
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
