import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { hashWithPepper } from '../src/crypto.js';
import { signEnableResume } from '../src/enable.js';
import { makeTestEnv, resetDb, seedAccount, seedSession } from './helpers.js';

const ORIGIN = 'https://services.solstone.app';
const HOLD_MS = 72 * 60 * 60 * 1000;
const VALID_NONCE = '3'.repeat(52);
const CLEAR_COOKIE_RE = /^account_session=; .*Max-Age=0/;

// GET / clears any account_session cookie getValidSession rejects (stale token,
// unknown token, or a session confined away from this route by an active
// deletion), then used to redirect to bare '/' — dropping ?signin and any
// signed resume params the visitor arrived with. It now keeps the same path
// and query on that redirect, so the intent survives losing a dead cookie.
describe('GET / preserves sign-in intent when clearing an unusable session cookie', () => {
  beforeEach(resetDb);

  it('an unknown session token on /?signin redirects to /?signin, not /, and clears the cookie', async () => {
    const env = makeTestEnv();
    const response = await worker.fetch(get('/?signin', 'account_session=not-a-real-token'), env);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/?signin');
    expect(response.headers.get('Set-Cookie')).toMatch(CLEAR_COOKIE_RE);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    // Following the redirect with the cookie gone (as a real browser would
    // after honoring the Set-Cookie) reaches the sign-in form directly.
    const landed = await worker.fetch(get('/?signin'), env);
    expect(landed.status).toBe(200);
    expect(await landed.text()).toContain('<h1>your services</h1>');
  });

  it('an unknown session token with a signed resume preserves next/next_sig, and the resume still verifies after the redirect', async () => {
    const env = makeTestEnv();
    const { next, nextSig } = await signEnableResume('/enable/spl', `?nonce=${VALID_NONCE}`, env);
    const query = `?next=${encodeURIComponent(next)}&next_sig=${encodeURIComponent(nextSig)}`;

    const response = await worker.fetch(get(`/${query}`, 'account_session=not-a-real-token'), env);
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe(`/${query}`);
    expect(response.headers.get('Set-Cookie')).toMatch(CLEAR_COOKIE_RE);

    const landed = await worker.fetch(get(`/${query}`), env);
    expect(landed.status).toBe(200);
    const body = await landed.text();
    expect(body).toContain(`value="${next}"`);
    expect(body).toContain(`value="${nextSig}"`);
  });

  it('a session held by an active deletion on /?signin redirects preserving ?signin and still clears the cookie', async () => {
    const env = makeTestEnv();
    const owner = await seedAccount({ email: 'held@example.com', testEnv: env });
    const session = await seedSession(owner.accountId, { testEnv: env });
    await holdingDeletion(env, owner.accountId);

    const response = await worker.fetch(get('/?signin', session.cookie), env);
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/?signin');
    expect(response.headers.get('Set-Cookie')).toMatch(CLEAR_COOKIE_RE);

    // Confinement is unchanged: the cleared cookie can't be replayed to reach
    // an ordinary signed-in surface, only the deletion routes.
    const replay = await worker.fetch(get('/', session.cookie), env);
    expect(await replay.text()).not.toContain('held@example.com');
  });

  it('a valid session on /?signin is unaffected: it still opens the catalog, not the sign-in form', async () => {
    const env = makeTestEnv();
    const owner = await seedAccount({ email: 'signedin@example.com', testEnv: env });
    const session = await seedSession(owner.accountId, { testEnv: env });

    const response = await worker.fetch(get('/?signin', session.cookie), env);
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain('action="/signin/start"');
  });

  it('a stale cookie on bare / still redirects to / with no query to preserve', async () => {
    const env = makeTestEnv();
    const response = await worker.fetch(get('/', 'account_session=not-a-real-token'), env);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/');
    expect(response.headers.get('Set-Cookie')).toMatch(CLEAR_COOKIE_RE);
  });
});

async function holdingDeletion(env, accountId, { deadline = Date.now() + HOLD_MS } = {}) {
  await workerEnv.DB.prepare(
    `INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, cancellation_deadline_at, status_token_hash)
     VALUES ('root-signin-intent-op', ?, 'frozen', ?, ?, ?)`
  ).bind(accountId, Date.now(), deadline, await hashWithPepper('root-signin-intent-status', env)).run();
}

function get(path, cookie = '') {
  return new Request(`${ORIGIN}${path}`, { headers: cookie ? { Cookie: cookie } : {} });
}
