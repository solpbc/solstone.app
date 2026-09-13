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

  it('mints a one-hour session by account_id with default-on env (AC1)', async () => {
    const account = await seedAccount({ email: 'target@example.com' });
    const testEnv = makeTestEnv();
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
    expect(row.operator_label).toBe('impersonation by operator@solpbc.org');
    expect(row.last_user_agent).toBeNull();
  });

  it('authenticates end-to-end as the target account', async () => {
    const account = await seedAccount({ email: 'target@example.com' });
    const testEnv = makeTestEnv();
    const token = await mintToken();
    const minted = await impersonate(token, { account_id: account.accountId }, testEnv);

    const response = await worker.fetch(new Request('https://services.solstone.app/', {
      headers: { Cookie: `account_session=${minted.session_token}` },
    }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<div class="who">target@example.com</div>');
  });

  it('mints by email with normalization and default-on env (AC1)', async () => {
    const account = await seedAccount({ email: 'target@example.com' });
    const testEnv = makeTestEnv();
    const token = await mintToken();

    const body = await impersonate(token, { email: 'Target@Example.com' }, testEnv);
    const row = await sessionRowForAccount(account.accountId);

    expect(body.account_id).toBe(account.accountId);
    expect(row.operator_label).toBe('impersonation by operator@solpbc.org');
    expect(row.last_user_agent).toBeNull();
  });

  it('uses the short one-hour ttl instead of the default session ttl', async () => {
    const account = await seedAccount({ email: 'target@example.com' });
    const testEnv = makeTestEnv();
    const token = await mintToken();

    await impersonate(token, { account_id: account.accountId }, testEnv);
    const row = await sessionRowForAccount(account.accountId);

    expect(row.expires_at - row.created_at).toBe(IMPERSONATE_TTL_MS);
    expect(row.expires_at - row.created_at).not.toBe(DEFAULT_SESSION_TTL_MS);
  });

  it('shows the audit marker in admin session details and remains revocable', async () => {
    const account = await seedAccount({ email: 'target@example.com' });
    const testEnv = makeTestEnv();
    const token = await mintToken();
    const minted = await impersonate(token, { account_id: account.accountId }, testEnv);

    const showResponse = await worker.fetch(adminRequest(`/admin/accounts/${account.accountId}`, token), testEnv);
    const showBody = await showResponse.json();
    const session = showBody.sessions[0];
    const idHash = await hashWithPepper(minted.session_token, testEnv);

    expect(showResponse.status).toBe(200);
    expect(session.ua_label).toBe('impersonation by operator@solpbc.org');
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
    const testEnv = makeTestEnv();
    const token = await mintToken({ payload: { common_name: 'service-token' } });

    const body = await impersonate(token, { account_id: account.accountId }, testEnv);
    const row = await sessionRowForAccount(body.account_id);

    expect(body.account_id).toBe(account.accountId);
    expect(row.operator_label).toBe('impersonation by service-token');
    expect(row.last_user_agent).toBeNull();
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
    const testEnv = makeTestEnv();
    const token = await mintToken();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const body = await impersonate(token, { account_id: account.accountId }, testEnv);
    const payload = JSON.parse(warn.mock.calls[0][0]);
    const idHash = await hashWithPepper(body.session_token, testEnv);
    const serialized = JSON.stringify(payload);

    expect(payload).toEqual({
      event: 'admin_impersonate',
      operator_ref: await hashWithPepper('hub:operator:operator@solpbc.org', testEnv),
      account_ref: await hashWithPepper(`hub:account:${account.accountId}`, testEnv),
      session_ref: await hashWithPepper(`hub:session:${idHash}`, testEnv),
    });
    expect(serialized).not.toContain(account.accountId);
    expect(serialized).not.toContain('operator@solpbc.org');
    expect(serialized).not.toContain(body.session_token);
    expect(payload).not.toHaveProperty('operator');
    expect(payload).not.toHaveProperty('account_id');
    expect(payload).not.toHaveProperty('session_id_hash');
  });

  it('denies impersonation when IMPERSONATE_DISABLED is "true", but non-true values do not disable (AC2)', async () => {
    const account = await seedAccount({ email: 'target@example.com' });
    const token = await mintToken();

    // 1. IMPERSONATE_DISABLED: 'true' -> uniform 404, admin_impersonate_denied with reason 'disabled', no session
    const disabledEnv = makeTestEnv({ IMPERSONATE_DISABLED: 'true' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const deniedResp = await worker.fetch(adminRequest('/admin/impersonate', token, {
      method: 'POST',
      body: { account_id: account.accountId },
    }), disabledEnv);
    const deniedBody = await deniedResp.json();
    const countRow = await workerEnv.DB.prepare('SELECT COUNT(*) AS count FROM sessions').first();

    expect(deniedResp.status).toBe(404);
    expect(deniedBody).toEqual({ error: 'account not found' });
    expect(countRow.count).toBe(0);

    const logged = warn.mock.calls.flat().join('\n');
    const payload = JSON.parse(logged);
    expect(payload).toEqual({
      event: 'admin_impersonate_denied',
      operator_ref: await hashWithPepper('hub:operator:operator@solpbc.org', disabledEnv),
      account_ref: await hashWithPepper(`hub:account:${account.accountId}`, disabledEnv),
      reason: 'disabled',
    });
    expect(logged).not.toContain(account.accountId);
    expect(logged).not.toContain('operator@solpbc.org');

    // 2. Non-true values ('TRUE', 'false', '1', '') do not disable impersonation
    for (const nonTrueVal of ['TRUE', 'false', '1', '']) {
      const nonTrueEnv = makeTestEnv({ IMPERSONATE_DISABLED: nonTrueVal });
      const resp = await worker.fetch(adminRequest('/admin/impersonate', token, {
        method: 'POST',
        body: { account_id: account.accountId },
      }), nonTrueEnv);
      expect(resp.status).toBe(200);
      const minted = await resp.json();
      expect(minted.account_id).toBe(account.accountId);
    }

    // 3. Unset IMPERSONATE_DISABLED allows minting for the same target
    const unsetEnv = makeTestEnv();
    const unsetResp = await worker.fetch(adminRequest('/admin/impersonate', token, {
      method: 'POST',
      body: { account_id: account.accountId },
    }), unsetEnv);
    expect(unsetResp.status).toBe(200);
  });

  it('allows two distinct CF Access principals to concurrently mint two accounts (AC3)', async () => {
    const accountA = await seedAccount({ email: 'target-a@example.com' });
    const accountB = await seedAccount({ email: 'target-b@example.com' });
    const testEnv = makeTestEnv();

    const tokenAlice = await mintToken({ payload: { email: 'alice@solpbc.org' } });
    const tokenBob = await mintToken({ payload: { email: 'bob@solpbc.org' } });

    const [mintAlice, mintBob] = await Promise.all([
      impersonate(tokenAlice, { account_id: accountA.accountId }, testEnv),
      impersonate(tokenBob, { account_id: accountB.accountId }, testEnv),
    ]);

    expect(mintAlice.account_id).toBe(accountA.accountId);
    expect(mintBob.account_id).toBe(accountB.accountId);
    expect(mintAlice.session_token).not.toBe(mintBob.session_token);

    // Both minted sessions authenticate after both mints complete
    const authA = await worker.fetch(new Request('https://services.solstone.app/', {
      headers: { Cookie: `account_session=${mintAlice.session_token}` },
    }), testEnv);
    expect(authA.status).toBe(200);
    expect(await authA.text()).toContain('<div class="who">target-a@example.com</div>');

    const authB = await worker.fetch(new Request('https://services.solstone.app/', {
      headers: { Cookie: `account_session=${mintBob.session_token}` },
    }), testEnv);
    expect(authB.status).toBe(200);
    expect(await authB.text()).toContain('<div class="who">target-b@example.com</div>');

    const rowA = await sessionRowForAccount(accountA.accountId);
    const rowB = await sessionRowForAccount(accountB.accountId);
    expect(rowA.operator_label).toBe('impersonation by alice@solpbc.org');
    expect(rowB.operator_label).toBe('impersonation by bob@solpbc.org');
  });

  it('updates last_user_agent on activity while keeping operator_label unchanged (AC5)', async () => {
    const account = await seedAccount({ email: 'target@example.com' });
    const testEnv = makeTestEnv();
    const token = await mintToken();

    const minted = await impersonate(token, { account_id: account.accountId }, testEnv);
    const initialRow = await sessionRowForAccount(account.accountId);
    expect(initialRow.operator_label).toBe('impersonation by operator@solpbc.org');
    expect(initialRow.last_user_agent).toBeNull();

    // First request with UA 1
    const ua1 = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    await worker.fetch(new Request('https://services.solstone.app/', {
      headers: {
        Cookie: `account_session=${minted.session_token}`,
        'User-Agent': ua1,
      },
    }), testEnv);

    const rowAfterUa1 = await sessionRowForAccount(account.accountId);
    expect(rowAfterUa1.operator_label).toBe('impersonation by operator@solpbc.org');
    expect(rowAfterUa1.last_user_agent).toBe(ua1);

    // Second request with UA 2
    const ua2 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    await worker.fetch(new Request('https://services.solstone.app/', {
      headers: {
        Cookie: `account_session=${minted.session_token}`,
        'User-Agent': ua2,
      },
    }), testEnv);

    const rowAfterUa2 = await sessionRowForAccount(account.accountId);
    expect(rowAfterUa2.operator_label).toBe('impersonation by operator@solpbc.org');
    expect(rowAfterUa2.last_user_agent).toBe(ua2);
  });

  it('displays the operator label across all three display surfaces after activity (AC6)', async () => {
    const account = await seedAccount({ email: 'target@example.com' });
    const testEnv = makeTestEnv();
    const adminToken = await mintToken();

    const minted = await impersonate(adminToken, { account_id: account.accountId }, testEnv);

    // Activity with a recognizable browser UA
    const browserUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    await worker.fetch(new Request('https://services.solstone.app/', {
      headers: {
        Cookie: `account_session=${minted.session_token}`,
        'User-Agent': browserUa,
      },
    }), testEnv);

    // 1. GET /sign-in/sessions
    const sessionsResp = await worker.fetch(new Request('https://services.solstone.app/sign-in/sessions', {
      headers: {
        Cookie: `account_session=${minted.session_token}`,
        'User-Agent': browserUa,
      },
    }), testEnv);
    expect(sessionsResp.status).toBe(200);
    const sessionsHtml = await sessionsResp.text();
    expect(sessionsHtml).toContain('impersonation by operator@solpbc.org');
    expect(sessionsHtml).not.toContain('chrome on macos');

    // 2. GET /transparency
    const transResp = await worker.fetch(new Request('https://services.solstone.app/transparency', {
      headers: {
        Cookie: `account_session=${minted.session_token}`,
        'User-Agent': browserUa,
      },
    }), testEnv);
    expect(transResp.status).toBe(200);
    const transHtml = await transResp.text();
    expect(transHtml).toContain('impersonation by operator@solpbc.org');
    expect(transHtml).not.toContain('chrome on macos');

    // 3. GET /admin/accounts/:id
    const adminAccountResp = await worker.fetch(
      adminRequest(`/admin/accounts/${account.accountId}`, adminToken),
      testEnv
    );
    expect(adminAccountResp.status).toBe(200);
    const adminAccountBody = await adminAccountResp.json();
    expect(adminAccountBody.sessions[0].ua_label).toBe('impersonation by operator@solpbc.org');
  });

  it('keeps existing session callers on the default ttl with no user agent and null operator_label', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'target@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const row = await workerEnv.DB
      .prepare('SELECT created_at, expires_at, last_user_agent, operator_label FROM sessions WHERE id_hash = ?')
      .bind(session.idHash)
      .first();

    expect(row.expires_at - row.created_at).toBe(DEFAULT_SESSION_TTL_MS);
    expect(row.last_user_agent).toBeNull();
    expect(row.operator_label).toBeNull();
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
    });
    expect(hubCalls[0].body.operator_ref).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(hubCalls[0].body.account_ref).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(hubCalls[0].body.session_ref).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(hubCalls[0].body).not.toHaveProperty('operator');
    expect(hubCalls[0].body).not.toHaveProperty('account_id');
    expect(hubCalls[0].body).not.toHaveProperty('session_id_hash');
    expect(typeof hubCalls[0].body.ts).toBe('string');
    expect(JSON.stringify(hubCalls[0].body)).not.toContain(body.session_token);
  });

  it('emits a durable CSO hub event on a denied (disabled) attempt', async () => {
    const hubCalls = [];
    await installHubStub(hubCalls);
    const account = await seedAccount({ email: 'target@example.com' });
    const testEnv = makeTestEnv({
      IMPERSONATE_DISABLED: 'true',
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
      reason: 'disabled',
    });
    expect(hubCalls[0].body.operator_ref).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(hubCalls[0].body.account_ref).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(hubCalls[0].body).not.toHaveProperty('operator');
    expect(hubCalls[0].body).not.toHaveProperty('account_id');
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
    const testEnv = makeTestEnv();
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
    .prepare('SELECT created_at, expires_at, last_user_agent, operator_label FROM sessions WHERE account_id = ?')
    .bind(accountId)
    .first();
}

async function expectJsonError(response, status, error) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error });
}
