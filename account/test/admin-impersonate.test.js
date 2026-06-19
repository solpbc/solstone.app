import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { hashWithPepper } from '../src/crypto.js';
import { revokeSession } from '../src/db.js';
import { fetchWithCtx, makeTestEnv, resetDb, seedAccount, seedSession } from './helpers.js';
import { installJwksStub, installJwksStubWith, mintToken } from './jwks-helper.js';

const HUB_URL = 'https://extro.solpbc.org/hooks/security';

const IMPERSONATE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

describe('admin impersonate endpoint', () => {
  beforeEach(async () => {
    await resetDb();
    await installJwksStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mints a one-hour session by account_id', async () => {
    const account = await seedAccount({ email: 'target@example.com' });
    const testEnv = makeTestEnv({ IMPERSONATE_ALLOWED: account.accountId });
    const token = await mintToken();

    const response = await worker.fetch(
      adminRequest('/admin/impersonate', token, {
        method: 'POST',
        body: { account_id: account.accountId },
      }),
      testEnv
    );
    const body = await response.json();
    const row = await sessionRowForAccount(account.accountId);

    expect(response.status).toBe(200);
    expect(body.account_id).toBe(account.accountId);
    expect(body.session_token).toEqual(expect.any(String));
    expect(body.session_token.length).toBeGreaterThan(0);
    expect(body.cookie_name).toBe('account_session');
    expect(typeof body.expires_at).toBe('string');
    expect(Number.isNaN(Date.parse(body.expires_at))).toBe(false);
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(row.expires_at - row.created_at).toBe(IMPERSONATE_TTL_MS);
    expect(row.last_user_agent).toBe('impersonation by jer@solpbc.org');
  });

  it('authenticates end-to-end as the target account', async () => {
    const account = await seedAccount({ email: 'target@example.com' });
    const testEnv = makeTestEnv({ IMPERSONATE_ALLOWED: account.accountId });
    const token = await mintToken();
    const minted = await impersonate(token, { account_id: account.accountId }, testEnv);

    const response = await worker.fetch(new Request('https://services.solstone.app/', {
      headers: { Cookie: `account_session=${minted.session_token}` },
    }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<div class="who">target@example.com</div>');
  });

  it('mints by email with normalization', async () => {
    const account = await seedAccount({ email: 'target@example.com' });
    const testEnv = makeTestEnv({ IMPERSONATE_ALLOWED: account.accountId });
    const token = await mintToken();

    const body = await impersonate(token, { email: 'Target@Example.com' }, testEnv);

    expect(body.account_id).toBe(account.accountId);
  });

  it('uses the short one-hour ttl instead of the default session ttl', async () => {
    const account = await seedAccount({ email: 'target@example.com' });
    const testEnv = makeTestEnv({ IMPERSONATE_ALLOWED: account.accountId });
    const token = await mintToken();

    await impersonate(token, { account_id: account.accountId }, testEnv);
    const row = await sessionRowForAccount(account.accountId);

    expect(row.expires_at - row.created_at).toBe(IMPERSONATE_TTL_MS);
    expect(row.expires_at - row.created_at).not.toBe(DEFAULT_SESSION_TTL_MS);
  });

  it('shows the audit marker in admin session details and remains revocable', async () => {
    const account = await seedAccount({ email: 'target@example.com' });
    const testEnv = makeTestEnv({ IMPERSONATE_ALLOWED: account.accountId });
    const token = await mintToken();
    const minted = await impersonate(token, { account_id: account.accountId }, testEnv);

    const showResponse = await worker.fetch(adminRequest(`/admin/accounts/${account.accountId}`, token), testEnv);
    const showBody = await showResponse.json();
    const session = showBody.sessions[0];
    const idHash = await hashWithPepper(minted.session_token, testEnv);

    expect(showResponse.status).toBe(200);
    expect(session.ua_label).toBe('impersonation by jer@solpbc.org');
    expect(session.revoked_at).toBeNull();
    expect(session.id_hash).toBe(idHash);

    await revokeSession(workerEnv.DB, { idHash, accountId: account.accountId, nowMs: Date.now() });
    const revokedResponse = await worker.fetch(new Request('https://services.solstone.app/', {
      headers: { Cookie: `account_session=${minted.session_token}` },
    }), testEnv);

    expect(revokedResponse.status).not.toBe(200);
  });

  it('marks service-token operator sessions', async () => {
    const account = await seedAccount({ email: 'target@example.com' });
    const testEnv = makeTestEnv({ IMPERSONATE_ALLOWED: account.accountId });
    const token = await mintToken({ payload: { common_name: 'service-token' } });

    const body = await impersonate(token, { account_id: account.accountId }, testEnv);
    const row = await sessionRowForAccount(body.account_id);

    expect(body.account_id).toBe(account.accountId);
    expect(row.last_user_agent).toBe('impersonation by service-token');
  });

  it('returns uniform 404 for unknown or malformed account input', async () => {
    const token = await mintToken();

    await expectJsonError(
      await worker.fetch(adminRequest('/admin/impersonate', token, {
        method: 'POST',
        body: { account_id: '00000000-0000-0000-0000-000000000000' },
      }), makeTestEnv()),
      404,
      'account not found'
    );
    await expectJsonError(
      await worker.fetch(adminRequest('/admin/impersonate', token, {
        method: 'POST',
        body: { email: 'nobody@example.com' },
      }), makeTestEnv()),
      404,
      'account not found'
    );
    await expectJsonError(
      await worker.fetch(adminRequest('/admin/impersonate', token, {
        method: 'POST',
        body: {},
      }), makeTestEnv()),
      404,
      'account not found'
    );
    await expectJsonError(
      await worker.fetch(adminRequest('/admin/impersonate', token, {
        method: 'POST',
        body: { account_id: '' },
      }), makeTestEnv()),
      404,
      'account not found'
    );
    await expectJsonError(
      await worker.fetch(adminRequest('/admin/impersonate', token, {
        method: 'POST',
        body: null,
      }), makeTestEnv()),
      404,
      'account not found'
    );
    await expectJsonError(
      await worker.fetch(adminRequest('/admin/impersonate', token, {
        method: 'POST',
        body: [],
      }), makeTestEnv()),
      404,
      'account not found'
    );
    await expectJsonError(
      await worker.fetch(adminRequest('/admin/impersonate', token, {
        method: 'POST',
        rawBody: '{',
      }), makeTestEnv()),
      404,
      'account not found'
    );
  });

  it('requires CF Access and creates no session without it', async () => {
    const response = await worker.fetch(adminRequest('/admin/impersonate', null, {
      method: 'POST',
      body: { account_id: '00000000-0000-0000-0000-000000000000' },
    }), makeTestEnv());
    const row = await workerEnv.DB.prepare('SELECT COUNT(*) AS count FROM sessions').first();

    await expectJsonError(response, 403, 'cloudflare access required');
    expect(row.count).toBe(0);
  });

  it('does not mint for non-POST requests', async () => {
    const token = await mintToken();

    const response = await worker.fetch(adminRequest('/admin/impersonate', token), makeTestEnv());
    const row = await workerEnv.DB.prepare('SELECT COUNT(*) AS count FROM sessions').first();

    await expectJsonError(response, 404, 'account not found');
    expect(row.count).toBe(0);
  });

  it('emits an audit log line without the raw token', async () => {
    const account = await seedAccount({ email: 'target@example.com' });
    const testEnv = makeTestEnv({ IMPERSONATE_ALLOWED: account.accountId });
    const token = await mintToken();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const body = await impersonate(token, { account_id: account.accountId }, testEnv);
    const logged = warn.mock.calls.flat().join('\n');

    expect(logged).toContain('"event":"admin_impersonate"');
    expect(logged).toContain('"operator":"jer@solpbc.org"');
    expect(logged).toContain(`"account_id":"${account.accountId}"`);
    expect(logged).not.toContain(body.session_token);
  });

  it('denies impersonation when the allowlist is unset (default-off)', async () => {
    const account = await seedAccount({ email: 'target@example.com' });
    const testEnv = makeTestEnv();
    const token = await mintToken();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await worker.fetch(adminRequest('/admin/impersonate', token, {
      method: 'POST',
      body: { account_id: account.accountId },
    }), testEnv);
    const body = await response.json();
    const row = await workerEnv.DB.prepare('SELECT COUNT(*) AS count FROM sessions').first();
    const logged = warn.mock.calls.flat().join('\n');

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'account not found' });
    expect(row.count).toBe(0);
    expect(logged).toContain('"event":"admin_impersonate_denied"');
    expect(logged).toContain('"reason":"disabled"');
    expect(logged).toContain('"operator":"jer@solpbc.org"');
    expect(logged).toContain(`"account_id":"${account.accountId}"`);
  });

  it('denies impersonation for an account that is not on the allowlist', async () => {
    const accountA = await seedAccount({ email: 'target-a@example.com' });
    const accountB = await seedAccount({ email: 'target-b@example.com' });
    const testEnv = makeTestEnv({ IMPERSONATE_ALLOWED: accountA.accountId });
    const token = await mintToken();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await impersonate(token, { account_id: accountA.accountId }, testEnv);
    const response = await worker.fetch(adminRequest('/admin/impersonate', token, {
      method: 'POST',
      body: { account_id: accountB.accountId },
    }), testEnv);
    const body = await response.json();
    const row = await sessionRowForAccount(accountB.accountId);
    const logged = warn.mock.calls.flat().join('\n');

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'account not found' });
    expect(row).toBeNull();
    expect(logged).toContain('"reason":"not_allowlisted"');
    expect(logged).toContain(`"account_id":"${accountB.accountId}"`);
  });

  it('parses the allowlist tolerating spaces, mixed case, and empty commas', async () => {
    const accountA = await seedAccount({ email: 'target-a@example.com' });
    const accountB = await seedAccount({ email: 'target-b@example.com' });
    const allowed = ` ${accountA.accountId} , ,${accountB.accountId.toUpperCase()}, `;
    const testEnv = makeTestEnv({ IMPERSONATE_ALLOWED: allowed });
    const token = await mintToken();

    await impersonate(token, { account_id: accountA.accountId }, testEnv);
    await impersonate(token, { account_id: accountB.accountId }, testEnv);
  });

  it('denied responses are indistinguishable from the unknown-account 404', async () => {
    const account = await seedAccount({ email: 'target@example.com' });
    const testEnv = makeTestEnv();
    const token = await mintToken();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const deniedResponse = await worker.fetch(adminRequest('/admin/impersonate', token, {
      method: 'POST',
      body: { account_id: account.accountId },
    }), testEnv);
    const deniedBody = await deniedResponse.json();
    const unknownResponse = await worker.fetch(adminRequest('/admin/impersonate', token, {
      method: 'POST',
      body: { account_id: '00000000-0000-0000-0000-000000000000' },
    }), testEnv);
    const unknownBody = await unknownResponse.json();

    expect(deniedResponse.status).toBe(404);
    expect(unknownResponse.status).toBe(404);
    expect(deniedBody).toEqual({ error: 'account not found' });
    expect(unknownBody).toEqual({ error: 'account not found' });
  });

  it('keeps existing session callers on the default ttl with no user agent', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'target@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const row = await workerEnv.DB
      .prepare('SELECT created_at, expires_at, last_user_agent FROM sessions WHERE id_hash = ?')
      .bind(session.idHash)
      .first();

    expect(row.expires_at - row.created_at).toBe(DEFAULT_SESSION_TTL_MS);
    expect(row.last_user_agent).toBeNull();
  });
});

describe('admin impersonate durable security events', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function installHubStub(calls) {
    return installJwksStubWith(async (input, init = {}) => {
      const href = typeof input === 'string' ? input : input.url;
      if (href === HUB_URL) {
        calls.push({ headers: init.headers || {}, body: JSON.parse(init.body) });
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      }
      return null;
    });
  }

  it('emits a durable CSO hub event on mint and never includes the raw token', async () => {
    const hubCalls = [];
    await installHubStub(hubCalls);
    const account = await seedAccount({ email: 'target@example.com' });
    const testEnv = makeTestEnv({
      IMPERSONATE_ALLOWED: account.accountId,
      HUB_WEBHOOK_URL: HUB_URL,
      HUB_WEBHOOK_SECRET: 'test-hub-secret',
    });
    const token = await mintToken();

    const { response } = await fetchWithCtx(
      worker,
      adminRequest('/admin/impersonate', token, { method: 'POST', body: { account_id: account.accountId } }),
      testEnv
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(hubCalls).toHaveLength(1);
    expect(hubCalls[0].headers['X-Hub-Secret']).toBe('test-hub-secret');
    expect(hubCalls[0].body).toMatchObject({
      type: 'impersonate',
      office: 'cso',
      tier: 'T4',
      operator: 'jer@solpbc.org',
      account_id: account.accountId,
    });
    expect(hubCalls[0].body.session_id_hash).toEqual(expect.any(String));
    expect(typeof hubCalls[0].body.ts).toBe('string');
    expect(JSON.stringify(hubCalls[0].body)).not.toContain(body.session_token);
  });

  it('emits a durable CSO hub event on a denied (disabled) attempt', async () => {
    const hubCalls = [];
    await installHubStub(hubCalls);
    const account = await seedAccount({ email: 'target@example.com' });
    const testEnv = makeTestEnv({
      HUB_WEBHOOK_URL: HUB_URL,
      HUB_WEBHOOK_SECRET: 'test-hub-secret',
    });
    const token = await mintToken();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { response } = await fetchWithCtx(
      worker,
      adminRequest('/admin/impersonate', token, { method: 'POST', body: { account_id: account.accountId } }),
      testEnv
    );

    expect(response.status).toBe(404);
    expect(hubCalls).toHaveLength(1);
    expect(hubCalls[0].body).toMatchObject({
      type: 'impersonate_denied',
      office: 'cso',
      tier: 'T4',
      operator: 'jer@solpbc.org',
      account_id: account.accountId,
      reason: 'disabled',
    });
  });

  it('does not POST a hub event when the sink is unconfigured, and still mints', async () => {
    let hubHit = false;
    await installJwksStubWith(async (input) => {
      const href = typeof input === 'string' ? input : input.url;
      if (href.includes('/hooks/')) {
        hubHit = true;
        return new Response('{}', { status: 200 });
      }
      return null;
    });
    const account = await seedAccount({ email: 'target@example.com' });
    const testEnv = makeTestEnv({ IMPERSONATE_ALLOWED: account.accountId });
    const token = await mintToken();

    const { response } = await fetchWithCtx(
      worker,
      adminRequest('/admin/impersonate', token, { method: 'POST', body: { account_id: account.accountId } }),
      testEnv
    );

    expect(response.status).toBe(200);
    expect(hubHit).toBe(false);
  });
});

function adminRequest(path, token, { method = 'GET', body, rawBody } = {}) {
  const headers = {};
  if (token) headers['Cf-Access-Jwt-Assertion'] = token;
  const init = { method, headers };
  if (rawBody !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = rawBody;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return new Request(`https://services.solstone.app${path}`, init);
}

async function impersonate(token, body, testEnv) {
  const response = await worker.fetch(
    adminRequest('/admin/impersonate', token, { method: 'POST', body }),
    testEnv
  );
  expect(response.status).toBe(200);
  return response.json();
}

async function sessionRowForAccount(accountId) {
  return workerEnv.DB
    .prepare('SELECT created_at, expires_at, last_user_agent FROM sessions WHERE account_id = ?')
    .bind(accountId)
    .first();
}

async function expectJsonError(response, status, error) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error });
}
