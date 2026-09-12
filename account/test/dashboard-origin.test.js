import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { originAllowed, supportOriginAllowed } from '../src/index.js';
import { strictDeletionOriginAllowed } from '../src/deletion.js';
import { makeTestEnv, resetDb, seedAccount, seedSession } from './helpers.js';

const ORIGIN = 'https://services.solstone.app';

// The population that distinguishes an exact-origin match from the old
// prefix-or-Referer heuristic: a clean same-origin form POST passes both, so
// only rewritten, absent, deceptive-prefix and Referer-only requests can tell
// the two apart.
const REJECTED = [
  ['missing Origin and Referer', {}],
  ['deceptive prefix', { Origin: `${ORIGIN}.evil.test` }],
  ['deceptive prefix with a path', { Origin: `${ORIGIN}.evil.test/x` }],
  ['http scheme', { Origin: 'http://services.solstone.app' }],
  ['foreign origin', { Origin: 'https://evil.example' }],
  ['null origin', { Origin: 'null' }],
  ['malformed origin', { Origin: 'not a url' }],
  ['Referer only, same origin', { Referer: `${ORIGIN}/sign-in` }],
  ['rewritten Origin with a clean Referer', { Origin: 'https://urldefense.com', Referer: `${ORIGIN}/sign-in` }],
  ['rewritten Origin and rewritten Referer', { Origin: 'https://urldefense.com', Referer: 'https://urldefense.com/v3/__https://services.solstone.app/sign-in__' }],
];

const ACCEPTED = [
  ['exact origin', { Origin: ORIGIN }],
  ['exact origin with a rewritten Referer', { Origin: ORIGIN, Referer: 'https://urldefense.com/v3/__https://services.solstone.app/sign-in__' }],
  ['exact origin with no Referer', { Origin: ORIGIN }],
];

function post(path, headers) {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: '',
  });
}

describe('dashboard origin predicate', () => {
  it('is one predicate under three names', () => {
    expect(supportOriginAllowed).toBe(originAllowed);
    for (const [, headers] of [...REJECTED, ...ACCEPTED]) {
      const request = post('/account/export', headers);
      expect(strictDeletionOriginAllowed(request)).toBe(originAllowed(request));
    }
  });

  for (const [name, headers] of REJECTED) {
    it(`rejects ${name}`, () => {
      expect(originAllowed(post('/sign-in/sessions/revoke-others', headers))).toBe(false);
    });
  }

  for (const [name, headers] of ACCEPTED) {
    it(`accepts ${name}`, () => {
      expect(originAllowed(post('/sign-in/sessions/revoke-others', headers))).toBe(true);
    });
  }
});

// Route-level: the predicate runs before any session or body work on the
// guarded dashboard POSTs, so a deceptive-prefix request with a valid session
// cookie is refused with the no-store 403 and mutates nothing.
const GUARDED_ROUTES = [
  { name: 'settings revoke-others', path: '/sign-in/sessions/revoke-others' },
  { name: 'emails add', path: '/sign-in/emails/add' },
  { name: 'devices revoke-all', path: '/devices/revoke-all' },
];

describe('dashboard origin enforcement', () => {
  beforeEach(resetDb);

  for (const route of GUARDED_ROUTES) {
    it(`refuses a deceptive-prefix origin for ${route.name} with a live session`, async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      const other = await seedSession(account.accountId, { testEnv, nowMs: Date.now() + 1 });
      const response = await worker.fetch(post(route.path, {
        Origin: `${ORIGIN}.evil.test`,
        Referer: `${ORIGIN}/sign-in`,
        Cookie: session.cookie,
      }), testEnv);
      expect(response.status).toBe(403);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      const row = await workerEnv.DB.prepare('SELECT revoked_at FROM sessions WHERE id_hash = ?').bind(other.idHash).first();
      expect(row.revoked_at).toBeNull();
    });

    it(`does not refuse the exact origin for ${route.name} on origin grounds`, async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      const response = await worker.fetch(post(route.path, { Origin: ORIGIN, Cookie: session.cookie }), testEnv);
      expect(response.status).not.toBe(403);
    });
  }
});
