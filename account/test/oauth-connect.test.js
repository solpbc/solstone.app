import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  makeTestEnv,
  resetDb,
  rowCount,
  seedAccount,
  seedOtp,
  seedSession,
  startRequest,
  stubTurnstile,
  validConnectParams,
  verifyRequest,
  TEST_CSRF,
} from './helpers.js';

describe('OAuth connect handoff', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects invalid /connect params with OAuth JSON 400', async () => {
    const response = await worker.fetch(connectRequest({ client_id: 'wrong-client' }), makeTestEnv());

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_request' });
  });

  it('rejects localhost redirect_uri', async () => {
    const response = await worker.fetch(
      connectRequest({ redirect_uri: 'http://localhost:8080/callback' }),
      makeTestEnv()
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_request' });
  });

  it('rejects redirect_uri with port below 1024', async () => {
    const response = await worker.fetch(
      connectRequest({ redirect_uri: 'http://127.0.0.1:80/callback' }),
      makeTestEnv()
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_request' });
  });

  it('rejects https redirect_uri', async () => {
    const response = await worker.fetch(
      connectRequest({ redirect_uri: 'https://127.0.0.1:12345/callback' }),
      makeTestEnv()
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_request' });
  });

  it('rejects redirect_uri with query', async () => {
    const response = await worker.fetch(
      connectRequest({ redirect_uri: 'http://127.0.0.1:12345/callback?foo=bar' }),
      makeTestEnv()
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_request' });
  });

  it('rejects redirect_uri with fragment', async () => {
    const response = await worker.fetch(
      connectRequest({ redirect_uri: 'http://127.0.0.1:12345/callback#frag' }),
      makeTestEnv()
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_request' });
  });

  it('unauthenticated valid /connect redirects to /?next=&next_sig=', async () => {
    const response = await worker.fetch(connectRequest(), makeTestEnv());
    const location = response.headers.get('Location');

    expect(response.status).toBe(303);
    expect(location).toMatch(/^\/\?next=[A-Za-z0-9_-]+&next_sig=[A-Za-z0-9_-]+$/);
  });

  it('resume next decodes to original query string byte-identical', async () => {
    const request = connectRequest();
    const original = new URL(request.url).search.slice(1);
    const response = await worker.fetch(request, makeTestEnv());
    const location = new URL(`https://account.solstone.app${response.headers.get('Location')}`);

    expect(base64UrlDecode(location.searchParams.get('next'))).toBe(original);
  });

  it('landing form carries valid next fields through /signin/start', async () => {
    stubTurnstile(true);
    const testEnv = makeTestEnv();
    const connect = await worker.fetch(connectRequest(), testEnv);
    const landing = await worker.fetch(
      new Request(`https://account.solstone.app${connect.headers.get('Location')}`),
      testEnv
    );
    const landingBody = await landing.text();
    const next = hiddenValue(landingBody, 'next');
    const nextSig = hiddenValue(landingBody, 'next_sig');
    const csrf = hiddenValue(landingBody, 'csrf');
    const start = await worker.fetch(
      startRequest('person@example.com', {}, { csrf, next, nextSig }),
      testEnv
    );

    expect(start.status).toBe(303);
    expect(start.headers.get('Location')).toContain('/signin/verify?email=person%40example.com&next=');
  });

  it('verify form carries valid next fields through /signin/verify', async () => {
    const testEnv = makeTestEnv();
    const connect = await worker.fetch(connectRequest(), testEnv);
    const landingLocation = new URL(`https://account.solstone.app${connect.headers.get('Location')}`);
    const verify = await worker.fetch(
      new Request(`https://account.solstone.app/signin/verify?email=person%40example.com&next=${encodeURIComponent(landingLocation.searchParams.get('next'))}&next_sig=${encodeURIComponent(landingLocation.searchParams.get('next_sig'))}`),
      testEnv
    );
    const body = await verify.text();

    expect(body).toContain(`name="next" value="${landingLocation.searchParams.get('next')}"`);
    expect(body).toContain(`name="next_sig" value="${landingLocation.searchParams.get('next_sig')}"`);
  });

  it('OTP success with valid next redirects to /connect with original query', async () => {
    const testEnv = makeTestEnv();
    const request = connectRequest();
    const original = new URL(request.url).search.slice(1);
    const connect = await worker.fetch(request, testEnv);
    const landingLocation = new URL(`https://account.solstone.app${connect.headers.get('Location')}`);
    const seeded = await seedOtp({ email: 'person@example.com', options: { code: '123456' } });
    const response = await worker.fetch(
      verifyRequest({
        email: 'person@example.com',
        code: seeded.code,
        next: landingLocation.searchParams.get('next'),
        nextSig: landingLocation.searchParams.get('next_sig'),
      }),
      testEnv
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe(`/connect?${original}`);
  });

  it('OTP success with invalid next signature falls back to dashboard', async () => {
    const testEnv = makeTestEnv();
    const connect = await worker.fetch(connectRequest(), testEnv);
    const landingLocation = new URL(`https://account.solstone.app${connect.headers.get('Location')}`);
    const seeded = await seedOtp({ email: 'person@example.com', options: { code: '123456' } });
    const response = await worker.fetch(
      verifyRequest({
        email: 'person@example.com',
        code: seeded.code,
        next: landingLocation.searchParams.get('next'),
        nextSig: 'bad-signature',
      }),
      testEnv
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/dashboard?welcome=1');
  });

  it('session GET /connect renders consent hidden fields and mints no code', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'person@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const response = await worker.fetch(connectRequest({}, { Cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<h1 style="text-transform:none">Connect Solstone CLI</h1>');
    expect(body).toContain('person@example.com');
    expect(body).toContain('name="client_id" value="solstone-cli"');
    expect(await rowCount('oauth_codes')).toBe(0);
  });

  it('GET /connect/confirm returns 405', async () => {
    const response = await worker.fetch(
      new Request('https://account.solstone.app/connect/confirm'),
      makeTestEnv()
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('POST /connect/confirm rejects bad origin', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const response = await worker.fetch(confirmRequest(session.cookie, { origin: 'https://evil.example' }), testEnv);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'invalid_request' });
  });

  it('POST /connect/confirm rejects bad CSRF', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const response = await worker.fetch(confirmRequest(session.cookie, { csrf: 'wrong' }), testEnv);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'invalid_request' });
  });

  it('POST /connect/confirm revalidates mirrored fields', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const response = await worker.fetch(
      confirmRequest(session.cookie, { params: { client_id: 'wrong-client' } }),
      testEnv
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_request' });
  });

  it('POST /connect/confirm inserts one code and redirects to loopback with code/state', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const response = await worker.fetch(confirmRequest(session.cookie), testEnv);
    const location = new URL(response.headers.get('Location'));

    expect(response.status).toBe(303);
    expect(location.origin + location.pathname).toBe('http://127.0.0.1:5015/callback');
    expect(location.searchParams.get('code')).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(location.searchParams.get('state')).toBe('state-123');
    expect(await rowCount('oauth_codes')).toBe(1);
    const row = await workerEnv.DB.prepare('SELECT account_id FROM oauth_codes').first();
    expect(row.account_id).toBe(account.accountId);
  });
});

function connectRequest(overrides = {}, headers = {}) {
  return new Request(`https://account.solstone.app/connect?${new URLSearchParams(validConnectParams(overrides)).toString()}`, {
    headers,
  });
}

function confirmRequest(cookie, {
  origin = 'https://account.solstone.app',
  csrf = TEST_CSRF,
  params = {},
} = {}) {
  return new Request('https://account.solstone.app/connect/confirm', {
    method: 'POST',
    headers: {
      Origin: origin,
      Cookie: cookie,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ ...validConnectParams(params), csrf }),
  });
}

function hiddenValue(body, name) {
  return body.match(new RegExp(`name="${name}" value="([^"]*)"`))?.[1] || '';
}

function base64UrlDecode(value) {
  const pad = value.length % 4 === 2 ? '==' : value.length % 4 === 3 ? '=' : '';
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}
