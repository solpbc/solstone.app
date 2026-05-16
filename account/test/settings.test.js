import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import {
  makeTestEnv,
  recordingDb,
  resetDb,
  seedAccount,
  seedCredential,
  seedSession,
} from './helpers.js';

const SAFARI_MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';

describe('settings sessions', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('renders settings shell counts with no-store headers', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedCredential({ accountId: account.accountId, credentialId: 'shell-credential' });

    const response = await worker.fetch(settingsRequest('/settings', { cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toContain('1 active session');
    expect(body).toContain('1 passkey');
    expect(body).toContain('action="/signout"');
    expect(body).toContain('href="/dashboard"');
  });

  it('renders the current request user agent and IPv4 from the activity bump', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(settingsRequest('/settings/sessions', {
      cookie: session.cookie,
      ip: '73.225.42.18',
      userAgent: SAFARI_MAC_UA,
    }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toContain('safari on macos');
    expect(body).toContain('73.225.42.x');
    expect(body).toContain('<span class="sticker">current</span>');
    expect(body).not.toContain(`${session.idHash}/revoke`);
  });

  it('renders an IPv6 /64 mask from the current request bump', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(settingsRequest('/settings/sessions', {
      cookie: session.cookie,
      ip: '2001:db8:abcd:1234:5678:abcd:1234:5678',
      userAgent: SAFARI_MAC_UA,
    }), testEnv);
    const body = await response.text();

    expect(body).toContain('2001:db8:abcd:1234::/64');
  });

  it('escapes unrecognized user agents in the sessions view', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(settingsRequest('/settings/sessions', {
      cookie: session.cookie,
      userAgent: '<script>alert(1)</script>',
    }), testEnv);
    const body = await response.text();

    expect(body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(body).not.toContain('<script>alert(1)</script>');
  });

  it('forbids self-revoke without changing the row', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(settingsPost(`/settings/sessions/${session.idHash}/revoke`, {
      cookie: session.cookie,
    }), testEnv);
    const row = await sessionRow(session.idHash);

    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(row.revoked_at).toBeNull();
  });

  it('forbids an empty session id revoke path without changing rows', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(settingsPost('/settings/sessions//revoke', {
      cookie: session.cookie,
    }), testEnv);
    const row = await sessionRow(session.idHash);

    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(row.revoked_at).toBeNull();
  });

  it('does not revoke anything for unauthenticated revoke-others requests', async () => {
    const statements = [];
    const noCookieEnv = makeTestEnv({ DB: recordingDb(workerEnv.DB, statements) });
    const noCookie = await worker.fetch(settingsPost('/settings/sessions/revoke-others'), noCookieEnv);
    expect(noCookie.status).toBe(303);
    expect(noCookie.headers.get('Location')).toBe('/');
    expect(noCookie.headers.get('Set-Cookie')).toBe('account_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
    expect(noCookie.headers.get('Cache-Control')).toBe('no-store');
    expect(statements).toHaveLength(0);

    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const victim = await seedSession(account.accountId, { testEnv });
    const unknownStatements = [];
    const unknown = await worker.fetch(settingsPost('/settings/sessions/revoke-others', {
      cookie: 'account_session=garbage',
    }), makeTestEnv({ DB: recordingDb(workerEnv.DB, unknownStatements) }));
    expect(unknown.status).toBe(303);
    expect(unknown.headers.get('Location')).toBe('/');
    expect(unknown.headers.get('Set-Cookie')).toBe('account_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
    expect(unknown.headers.get('Cache-Control')).toBe('no-store');
    expect(unknownStatements.some((sql) => /UPDATE sessions SET revoked_at/i.test(sql))).toBe(false);
    expect((await sessionRow(victim.idHash)).revoked_at).toBeNull();

    const expired = await seedSession(account.accountId, { testEnv });
    const other = await seedSession(account.accountId, { testEnv });
    await workerEnv.DB
      .prepare('UPDATE sessions SET expires_at = ? WHERE id_hash = ?')
      .bind(Date.now() - 1_000, expired.idHash)
      .run();
    const expiredStatements = [];
    const expiredResponse = await worker.fetch(settingsPost('/settings/sessions/revoke-others', {
      cookie: expired.cookie,
    }), makeTestEnv({ DB: recordingDb(workerEnv.DB, expiredStatements) }));
    expect(expiredResponse.status).toBe(303);
    expect(expiredResponse.headers.get('Location')).toBe('/');
    expect(expiredResponse.headers.get('Cache-Control')).toBe('no-store');
    expect(expiredStatements.some((sql) => /UPDATE sessions SET revoked_at/i.test(sql))).toBe(false);
    expect((await sessionRow(other.idHash)).revoked_at).toBeNull();
  });

  it('scopes session revoke mutations to the signed-in account', async () => {
    const testEnv = makeTestEnv();
    const accountA = await seedAccount({ email: 'a@example.com', testEnv });
    const accountB = await seedAccount({ email: 'b@example.com', testEnv });
    const sessionA = await seedSession(accountA.accountId, { testEnv });
    const sessionB = await seedSession(accountB.accountId, { testEnv });

    const revoke = await worker.fetch(settingsPost(`/settings/sessions/${sessionB.idHash}/revoke`, {
      cookie: sessionA.cookie,
    }), testEnv);
    expect(revoke.status).toBe(303);
    expect((await sessionRow(sessionB.idHash)).revoked_at).toBeNull();

    const revokeOthers = await worker.fetch(settingsPost('/settings/sessions/revoke-others', {
      cookie: sessionA.cookie,
    }), testEnv);
    expect(revokeOthers.status).toBe(303);
    expect((await sessionRow(sessionB.idHash)).revoked_at).toBeNull();
  });

  it('revokes other sessions for the same account', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const current = await seedSession(account.accountId, { testEnv });
    const other = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(settingsPost('/settings/sessions/revoke-others', {
      cookie: current.cookie,
    }), testEnv);

    expect(response.status).toBe(303);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect((await sessionRow(current.idHash)).revoked_at).toBeNull();
    expect((await sessionRow(other.idHash)).revoked_at).toBeGreaterThan(0);
  });
});

function settingsRequest(path, {
  cookie,
  ip = '203.0.113.77',
  userAgent = 'Mozilla/5.0 Firefox/124.0',
} = {}) {
  const headers = { 'CF-Connecting-IP': ip, 'User-Agent': userAgent };
  if (cookie) headers.Cookie = cookie;
  return new Request(`https://account.solstone.app${path}`, { headers });
}

function settingsPost(path, { cookie } = {}) {
  const headers = { Origin: 'https://account.solstone.app' };
  if (cookie) headers.Cookie = cookie;
  return new Request(`https://account.solstone.app${path}`, {
    method: 'POST',
    headers,
    body: '',
  });
}

async function sessionRow(idHash) {
  return workerEnv.DB
    .prepare('SELECT revoked_at FROM sessions WHERE id_hash = ?')
    .bind(idHash)
    .first();
}
