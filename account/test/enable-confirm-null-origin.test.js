import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker, { originAllowed } from '../src/index.js';
import {
  TEST_CSRF,
  makeTestEnv,
  resetDb,
  rowCount,
  seedAccount,
  seedScoutApplication,
  seedSession,
} from './helpers.js';

const ORIGIN = 'https://services.solstone.app';
const NONCE = '7'.repeat(52);
const INSTANCE = '11111111-1111-1111-1111-111111111111';

// A consent page that carries a journal's possession proof is served
// `Referrer-Policy: no-referrer`. Chromium and Firefox then send `Origin: null`
// on the page's own form POST, with `Sec-Fetch-Site: same-origin`. Opaque-origin
// documents (sandboxed iframes, `data:` pages) send `Origin: null` with
// `Sec-Fetch-Site: cross-site`. Measured in Chromium 149 and Firefox 151,
// 2026-10-21.
const SAME_ORIGIN_NULL = { Origin: 'null', 'Sec-Fetch-Site': 'same-origin' };

const REFUSED_NULL = [
  ['null origin from an opaque document', { Origin: 'null', 'Sec-Fetch-Site': 'cross-site' }],
  ['null origin from a sibling subdomain', { Origin: 'null', 'Sec-Fetch-Site': 'same-site' }],
  ['null origin from a user-initiated navigation', { Origin: 'null', 'Sec-Fetch-Site': 'none' }],
  ['null origin without fetch metadata', { Origin: 'null' }],
  ['same-origin fetch metadata without an Origin', { 'Sec-Fetch-Site': 'same-origin' }],
  ['null origin with a mixed-case fetch metadata value', { Origin: 'null', 'Sec-Fetch-Site': 'Same-Origin' }],
];

const CONFIRMS = [
  { service: 'spl', path: '/enable/spl/confirm' },
  { service: 'spb', path: '/enable/backup/confirm' },
  { service: 'spp', path: '/enable/spp/confirm' },
  { service: 'sme', path: '/enable/solstone-me/confirm' },
];

function post(path, headers, form = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(form),
  });
}

describe('origin predicate: Origin null', () => {
  it('admits a same-origin form POST from a no-referrer page', () => {
    expect(originAllowed(post('/enable/spp/confirm', SAME_ORIGIN_NULL))).toBe(true);
  });

  for (const [name, headers] of REFUSED_NULL) {
    it(`refuses ${name}`, () => {
      expect(originAllowed(post('/enable/spp/confirm', headers))).toBe(false);
    });
  }

  it('leaves a foreign Origin refused whatever the fetch metadata says', () => {
    expect(originAllowed(post('/enable/spp/confirm', { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'same-origin' }))).toBe(false);
  });
});

describe('service-enable confirms under Origin null', () => {
  beforeEach(resetDb);

  for (const { service, path } of CONFIRMS) {
    it(`${service}: passes the origin gate from its own no-referrer page`, async () => {
      const response = await worker.fetch(post(path, SAME_ORIGIN_NULL, { csrf: TEST_CSRF, nonce: NONCE, action: 'cancel' }), makeTestEnv());
      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/');
    });

    for (const [name, headers] of REFUSED_NULL) {
      it(`${service}: refuses ${name} with the bare no-store 403`, async () => {
        const response = await worker.fetch(post(path, headers, { csrf: TEST_CSRF, nonce: NONCE, action: 'cancel' }), makeTestEnv());
        expect(response.status).toBe(403);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(await response.text()).toBe('');
      });
    }
  }

  it('spp: an approved scout allowing from a no-referrer page is bound and minted', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 1_000 });

    const response = await worker.fetch(post('/enable/spp/confirm', { ...SAME_ORIGIN_NULL, Cookie: session.cookie }, {
      csrf: TEST_CSRF, nonce: NONCE, action: 'allow', instance: INSTANCE, data_ack: 'yes',
    }), testEnv);

    expect(response.status).toBe(200);
    await expect(rowCount('spp_bindings')).resolves.toBe(1);
    const audit = await workerEnv.DB.prepare('SELECT outcome FROM spp_mint_audit WHERE account_id = ?').bind(account.accountId).first();
    expect(audit).toMatchObject({ outcome: 'minted' });
  });

  it('spp: the same allow from an opaque document changes nothing', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 1_000 });

    const response = await worker.fetch(post('/enable/spp/confirm', { Origin: 'null', 'Sec-Fetch-Site': 'cross-site', Cookie: session.cookie }, {
      csrf: TEST_CSRF, nonce: NONCE, action: 'allow', instance: INSTANCE, data_ack: 'yes',
    }), testEnv);

    expect(response.status).toBe(403);
    await expect(rowCount('spp_bindings')).resolves.toBe(0);
    await expect(rowCount('spp_mint_audit')).resolves.toBe(0);
    await expect(rowCount('service_handoffs')).resolves.toBe(0);
  });
});
