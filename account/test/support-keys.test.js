import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { TEST_CSRF, makeSupportWorker, makeTestEnv, resetDb, seedAccount, seedAccountEmail, seedSession } from './helpers.js';

const KEY = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const BATCH = 'fffffffffffffffffffffffffffffffffffffffffff';

describe('support operation keys', () => {
  beforeEach(resetDb);

  it('mints distinct 43-character keys into the native create form', async () => {
    const { testEnv, session } = await signedIn(makeSupportWorker({
      'GET /api/services/tickets': () => json({ tickets: [] }),
      'GET /api/services/tickets/closed': () => json({ tickets: [], next_cursor: null }),
    }));
    const body = await (await worker.fetch(get('/support', session.cookie), testEnv)).text();
    const values = Array.from(body.matchAll(/name="(?:attachment_)?operation_key" value="([A-Za-z0-9_-]{43})"/g), (match) => match[1]);
    expect(values.length).toBeGreaterThanOrEqual(2);
    expect(new Set(values).size).toBe(values.length);
  });

  it('keeps an ambiguous create key and stable owner id across a primary-email change', async () => {
    let calls = 0;
    const support = makeSupportWorker({
      'POST /api/services/tickets': () => calls++ === 0
        ? new Response('down', { status: 500 })
        : json({ id: 'REQ_1', created_at: Date.now(), status: 'open' }),
      'POST /api/services/idempotency/ack': () => new Response(null, { status: 204 }),
    });
    const { testEnv, account, session } = await signedIn(support);
    await worker.fetch(createRequest(session.cookie), testEnv);
    await testEnv.DB.prepare('UPDATE account_emails SET is_primary = 0 WHERE account_id = ?').bind(account.accountId).run();
    await seedAccountEmail({ accountId: account.accountId, address: 'new-primary@example.com', verifiedAt: Date.now(), isPrimary: true, testEnv });
    await worker.fetch(createRequest(session.cookie), testEnv);

    const creates = support.requests.filter((request) => request.pathname === '/api/services/tickets');
    expect(creates).toHaveLength(2);
    expect(creates.map((request) => request.headers.ownerId)).toEqual([account.accountId, account.accountId]);
    expect(creates.map((request) => request.headers.idempotencyKey)).toEqual([KEY, KEY]);
    expect(creates.map((request) => request.headers.verifiedEmail)).toEqual(['owner@example.com', 'new-primary@example.com']);
  });
});

async function signedIn(support) {
  const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
  const account = await seedAccount({ email: 'owner@example.com', testEnv });
  const session = await seedSession(account.accountId, { testEnv });
  return { testEnv, account, session };
}
function get(path, cookie) { return new Request(`https://services.solstone.app${path}`, { headers: { Cookie: cookie } }); }
function createRequest(cookie) {
  const body = new FormData();
  body.set('csrf', TEST_CSRF); body.set('product', 'solstone'); body.set('subject', 'subject'); body.set('description', 'details');
  body.set('safe_content', 'confirmed');
  body.set('operation_key', KEY); body.set('attachment_operation_key', BATCH);
  return new Request('https://services.solstone.app/support', { method: 'POST', headers: { Origin: 'https://services.solstone.app', Cookie: cookie }, body });
}
function json(body) { return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }); }
