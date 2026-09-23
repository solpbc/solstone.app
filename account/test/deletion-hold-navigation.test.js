import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { hashWithPepper } from '../src/crypto.js';
import {
  extractCookieToken,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedOtp,
  seedSession,
  verifyRequest,
} from './helpers.js';

const ORIGIN = 'https://services.solstone.app';
const HOLD_MS = 72 * 60 * 60 * 1000;

// During an active deletion getValidSession confines a session to
// /account/delete* and, in requested/frozen, the export carve-out. Any other
// portal link sends that session through requireSignedInSession's redirect (or
// the / handler), which clears the cookie. The deletion and export pages must
// not offer such links.
describe('navigation from deletion pages during an active deletion', () => {
  beforeEach(resetDb);

  it('measures the ordinary menu targets: each one ends a confined session', async () => {
    const env = makeTestEnv({ OWNER_EXPORT_ENABLED: 'true' });
    const owner = await seedAccount({ email: 'hold@example.com', testEnv: env });
    await deletion(env, owner.accountId, 'frozen');

    for (const path of ['/', '/sign-in']) {
      const response = await worker.fetch(get(path, await freshCookie(env, owner)), env);
      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/');
      expect(clearsSession(response)).toBe(true);
    }
    // /support redirects to the sign-in landing, which then clears the cookie.
    const cookie = await freshCookie(env, owner);
    const support = await worker.fetch(get('/support', cookie), env);
    expect(support.status).toBe(303);
    const landing = await worker.fetch(get(support.headers.get('Location'), cookie), env);
    expect(clearsSession(landing)).toBe(true);
    // /transparency keeps the cookie but shows only the signed-out variant.
    const transparency = await worker.fetch(get('/transparency', await freshCookie(env, owner)), env);
    const transparencyBody = await transparency.text();
    expect(transparencyBody).not.toContain('hold@example.com');
    // Its signed-in download card is not shown there either; the deletion menu carries export.
    expect(transparencyBody).not.toContain('href="/account/export"');
  });

  it('a fresh sign-in during the hold lands on a page whose every link keeps the session', async () => {
    const env = makeTestEnv({ OWNER_EXPORT_ENABLED: 'true' });
    const owner = await seedAccount({ email: 'hold@example.com', testEnv: env });
    await deletion(env, owner.accountId, 'frozen');
    const otp = await seedOtp({ email: 'hold@example.com', options: { code: '123456' } });
    const signIn = await worker.fetch(verifyRequest({ email: otp.emailLower, code: otp.code }), env);
    expect(signIn.headers.get('Location')).toBe('/account/delete');
    const cookie = `account_session=${extractCookieToken(signIn.headers.get('Set-Cookie') || '')}`;

    const body = await (await worker.fetch(get('/account/delete', cookie), env)).text();
    expect(menuLinks(body)).toEqual(['/account/delete', '/account/export']);
    expect(body).toContain('<span class="home">');
    expect(body).toContain('action="/signout"');
    await expectEveryLinkKeepsSession(env, owner, body);
  });

  it('keeps the proof and export pages free of session-ending links during the hold', async () => {
    const env = makeTestEnv({ OWNER_EXPORT_ENABLED: 'true' });
    const owner = await seedAccount({ email: 'hold@example.com', testEnv: env });
    await deletion(env, owner.accountId, 'requested');

    const proof = await worker.fetch(post('/account/delete/proof/otp', await freshCookie(env, owner), { purpose: 'cancel' }), env);
    expect(proof.status).toBe(200);
    const proofBody = await proof.text();
    expect(menuLinks(proofBody)).toEqual(['/account/delete', '/account/export']);
    await expectEveryLinkKeepsSession(env, owner, proofBody);

    const exportPage = await worker.fetch(get('/account/export', await freshCookie(env, owner)), env);
    expect(exportPage.status).toBe(200);
    const exportBody = await exportPage.text();
    expect(exportBody).toContain('<a class="back" href="/account/delete">');
    expect(exportBody).not.toContain('href="/transparency"');
    await expectEveryLinkKeepsSession(env, owner, exportBody);
  });

  it('offers no export link when export is off or deletion has begun', async () => {
    const offEnv = makeTestEnv();
    const owner = await seedAccount({ email: 'hold@example.com', testEnv: offEnv });
    await deletion(offEnv, owner.accountId, 'frozen');
    const off = await (await worker.fetch(get('/account/delete', await freshCookie(offEnv, owner)), offEnv)).text();
    expect(menuLinks(off)).toEqual(['/account/delete']);
    await expectEveryLinkKeepsSession(offEnv, owner, off);

    const onEnv = makeTestEnv({ OWNER_EXPORT_ENABLED: 'true' });
    await workerEnv.DB.prepare("UPDATE account_deletions SET phase = 'purging'").run();
    const purging = await (await worker.fetch(get('/account/delete', await freshCookie(onEnv, owner)), onEnv)).text();
    expect(purging).toContain('deletion in progress');
    expect(menuLinks(purging)).toEqual(['/account/delete']);
    await expectEveryLinkKeepsSession(onEnv, owner, purging);
  });

  it('leaves the ordinary menu and footer alone when no deletion is active', async () => {
    const env = makeTestEnv({ OWNER_EXPORT_ENABLED: 'true' });
    const owner = await seedAccount({ email: 'plain@example.com', testEnv: env });
    const { cookie } = await seedSession(owner.accountId, { testEnv: env });
    for (const path of ['/account/delete', '/account/export']) {
      const body = await (await worker.fetch(get(path, cookie), env)).text();
      expect(menuLinks(body)).toEqual(['/', '/sign-in']);
      expect(body).toContain('<a class="home" href="/">');
      expect(body).toContain('href="/transparency"');
      expect(body).toContain('href="/support"');
    }
  });
});

async function deletion(env, accountId, phase) {
  await workerEnv.DB.prepare(
    `INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, cancellation_deadline_at, status_token_hash)
     VALUES ('hold-nav', ?, ?, ?, ?, ?)`
  ).bind(accountId, phase, Date.now(), Date.now() + HOLD_MS, await hashWithPepper('hold-nav-status', env)).run();
}

async function freshCookie(env, owner) {
  return (await seedSession(owner.accountId, { testEnv: env })).cookie;
}

function menuLinks(html) {
  const menu = html.match(/<div class="menu" role="menu">([\s\S]*?)<\/div>\s*<\/details>/)?.[1] || '';
  return [...menu.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((m) => m[1]);
}

// Follow every same-origin link and GET/POST form on the page (except sign
// out, which ends the session on purpose) with a fresh confined session, and
// check that none of them clears the cookie or drops the owner onto a
// signed-out page.
async function expectEveryLinkKeepsSession(env, owner, html) {
  const targets = [
    ...[...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((m) => ({ method: 'GET', path: m[1] })),
    ...[...html.matchAll(/<form\b[^>]*method="([^"]+)"[^>]*action="([^"]+)"/g)]
      .map((m) => ({ method: m[1].toUpperCase(), path: m[2] })),
  ].filter((t) => t.path.startsWith('/') && t.path !== '/signout');
  expect(targets.length).toBeGreaterThan(0);
  for (const target of targets) {
    const cookie = await freshCookie(env, owner);
    const request = target.method === 'POST'
      ? post(target.path, cookie, target.path.startsWith('/account/delete') ? { purpose: 'cancel' } : {})
      : get(target.path, cookie);
    const response = await worker.fetch(request, env);
    const where = `${target.method} ${target.path}`;
    expect(clearsSession(response), where).toBe(false);
    expect(response.headers.get('Location'), where).not.toBe('/');
    if (target.path === '/terms') continue; // public page; does not read the session
    if (response.status === 200) expect(await response.text(), where).toContain('class="usermenu"');
  }
}

function clearsSession(response) {
  return /account_session=;[^,]*Max-Age=0/.test(response.headers.get('Set-Cookie') || '');
}

function get(path, cookie) {
  return new Request(`${ORIGIN}${path}`, { headers: { Cookie: cookie } });
}

function post(path, cookie, form = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  });
}
