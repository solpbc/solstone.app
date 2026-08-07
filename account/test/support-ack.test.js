import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { TEST_CSRF, makeSupportWorker, makeTestEnv, resetDb, seedAccount, seedSession } from './helpers.js';

const KEY = 'ggggggggggggggggggggggggggggggggggggggggggg';
const BATCH = 'hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh';

describe('support acknowledgement', () => {
  beforeEach(resetDb);

  it('keeps a success ambiguous when acknowledgement is absent', async () => {
    const support = makeSupportWorker({
      'POST /api/services/tickets': () => json({ id: 'REQ_1', created_at: Date.now(), status: 'open' }),
      'POST /api/services/idempotency/ack': () => new Response(null, { status: 404 }),
    });
    const { testEnv, session } = await signedIn(support);
    const body = await (await worker.fetch(createRequest(session.cookie), testEnv)).text();

    expect(support.requests.map((request) => request.pathname)).toEqual(['/api/services/tickets', '/api/services/idempotency/ack']);
    expect(body).toContain('could not be confirmed');
    expect(body).not.toContain('got it, this is request');
    expect(body).toContain(`name="operation_key" value="${KEY}"`);
  });

  it('keeps a parsed success ambiguous with the same key when acknowledgement transport throws', async () => {
    const support = makeSupportWorker({
      'POST /api/services/tickets': () => json({ id: 'REQ_1', created_at: Date.now(), status: 'open' }),
      'POST /api/services/idempotency/ack': () => { throw new Error('ack unavailable'); },
    });
    const { testEnv, session } = await signedIn(support);
    const body = await (await worker.fetch(createRequest(session.cookie), testEnv)).text();

    expect(support.requests.map((request) => request.pathname)).toEqual(['/api/services/tickets', '/api/services/idempotency/ack']);
    expect(body).toContain('could not be confirmed');
    expect(body).not.toContain('got it, this is request');
    expect(body).toContain(`name="operation_key" value="${KEY}"`);
  });

  it('treats repeated acknowledgement as harmless terminal confirmation', async () => {
    const support = makeSupportWorker({
      'POST /api/services/tickets': () => json({ id: 'REQ_1', created_at: Date.now(), status: 'open' }),
      'POST /api/services/idempotency/ack': () => new Response(null, { status: 204 }),
    });
    const { testEnv, session } = await signedIn(support);
    const first = await (await worker.fetch(createRequest(session.cookie), testEnv)).text();
    const second = await (await worker.fetch(createRequest(session.cookie), testEnv)).text();

    expect(first).toContain('got it, this is request');
    expect(second).toContain('got it, this is request');
    expect(support.requests.filter((request) => request.pathname.endsWith('/ack'))).toHaveLength(2);
    expect(support.requests.filter((request) => request.pathname.endsWith('/ack')).every((request) => request.body.mutation === 'ticket.create')).toBe(true);
  });

  it('does not acknowledge any excluded outcome class', async () => {
    const excluded = [
      json({ error: 'idempotency_conflict' }, 409),
      json({ error: 'invalid_idempotency_key' }, 400),
      json({ error: 'operation_in_progress' }, 409, { 'Retry-After': '4' }),
      new Response(null, { status: 404 }),
      json({ error: 'operation_retired' }, 410),
      json({ error: 'operation_erased' }, 410),
    ];
    for (const response of excluded) {
      const support = makeSupportWorker({ 'POST /api/services/tickets': () => response.clone() });
      const { testEnv, session } = await signedIn(support);
      const body = await (await worker.fetch(createRequest(session.cookie), testEnv)).text();
      expect(support.requests).toHaveLength(1);
      expect(body).not.toContain('got it, this is request');
    }
  });
});

async function signedIn(support) {
  const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
  const account = await seedAccount({ email: 'owner@example.com', testEnv });
  const session = await seedSession(account.accountId, { testEnv });
  return { testEnv, session };
}
function createRequest(cookie) {
  const body = new FormData();
  body.set('csrf', TEST_CSRF); body.set('product', 'solstone'); body.set('subject', 'subject'); body.set('description', 'details'); body.set('operation_key', KEY); body.set('attachment_operation_key', BATCH);
  return new Request('https://services.solstone.app/support', { method: 'POST', headers: { Origin: 'https://services.solstone.app', Cookie: cookie }, body });
}
function json(body, status = 200, headers = {}) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } }); }
