import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { TEST_CSRF, makeSupportWorker, makeTestEnv, resetDb, seedAccount, seedSession } from './helpers.js';

const PARENT_KEY = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BATCH_KEY = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

describe('support mutations', () => {
  beforeEach(resetDb);

  it('sends a general create, acknowledges it, then sends its distinct attachment batch', async () => {
    const support = makeSupportWorker({
      'POST /api/services/tickets': () => json({ id: 'REQ_NEW', created_at: Date.now(), status: 'open' }),
      'POST /api/services/tickets/REQ_NEW/attachments': () => json({ ticket_id: 'REQ_NEW', attachment_ids: ['ATT_1'], status: 'accepted' }),
      'POST /api/services/idempotency/ack': () => new Response(null, { status: 204 }),
    });
    const { testEnv, session, account } = await signedIn(support);

    const response = await worker.fetch(post('/support', session.cookie, {
      product: 'general', subject: 'something else', description: 'details', operation_key: PARENT_KEY,
      attachment_operation_key: BATCH_KEY, file: new File(['one'], 'one.log', { type: 'text/plain' }),
    }), testEnv);

    expect(response.status).toBe(200);
    expect(support.requests.map((request) => request.pathname)).toEqual([
      '/api/services/tickets', '/api/services/idempotency/ack', '/api/services/tickets/REQ_NEW/attachments', '/api/services/idempotency/ack',
    ]);
    expect(support.requests[0]).toMatchObject({
      headers: { ownerId: account.accountId, idempotencyKey: PARENT_KEY, hasVerifiedEmail: true },
      body: { product: 'general', subject: 'something else', description: 'details' },
    });
    expect(support.requests[2]).toMatchObject({ headers: { ownerId: account.accountId, idempotencyKey: BATCH_KEY, hasVerifiedEmail: false } });
    expect(support.requests[2].body.fileEntries[0]).toMatchObject({ name: 'one.log', bytes: new Uint8Array([111, 110, 101]) });
    expect(support.requests[1].body).toEqual({ mutation: 'ticket.create' });
    expect(support.requests[3].body).toEqual({ mutation: 'ticket.attachments' });
  });

  it('does not send files when the parent is ambiguous and preserves its submitted key', async () => {
    const support = makeSupportWorker({
      'POST /api/services/tickets': () => new Response('down', { status: 500 }),
    });
    const { testEnv, session } = await signedIn(support);
    const response = await worker.fetch(post('/support', session.cookie, {
      product: 'solstone', subject: 'subject', description: 'details', operation_key: PARENT_KEY,
      attachment_operation_key: BATCH_KEY, file: new File(['one'], 'one.log'),
    }), testEnv);
    const body = await response.text();

    expect(support.requests).toHaveLength(1);
    expect(body).toContain('files were not sent');
    expect(body).toContain(`name="operation_key" value="${PARENT_KEY}"`);
    expect(body).toContain(`name="attachment_operation_key" value="${BATCH_KEY}"`);
  });

  it('keeps an in-progress create retryable with the submitted key and retry hint, without acknowledgement', async () => {
    const support = makeSupportWorker({
      'POST /api/services/tickets': () => json({ error: 'operation_in_progress' }, 409, { 'Retry-After': '17' }),
    });
    const { testEnv, session } = await signedIn(support);
    const body = await (await worker.fetch(post('/support', session.cookie, createFields()), testEnv)).text();

    expect(support.requests).toHaveLength(1);
    expect(body).toContain('try again in 17');
    expect(body).toContain(`name="operation_key" value="${PARENT_KEY}"`);
    expect(body).toContain(`name="attachment_operation_key" value="${BATCH_KEY}"`);
  });

  it('renders known no-mutation outcomes without retrying or rotating their submitted key', async () => {
    const cases = [
      [json({ error: 'idempotency_conflict' }, 409), 'does not match the earlier action'],
      [json({ error: 'invalid_idempotency_key' }, 400), 'action key is not valid'],
      [new Response(null, { status: 404 }), "could not find that request"],
      [json({ error: 'operation_retired' }, 410), 'permanently suppressed'],
      [json({ error: 'operation_erased' }, 410), 'can no longer be repeated'],
    ];
    for (const [upstream, message] of cases) {
      const support = makeSupportWorker({ 'POST /api/services/tickets': () => upstream.clone() });
      const { testEnv, session } = await signedIn(support);
      const body = await (await worker.fetch(post('/support', session.cookie, createFields()), testEnv)).text();

      expect(support.requests).toHaveLength(1);
      expect(body).toContain(message);
      expect(body).toContain('review request again');
      expect(body).not.toContain(PARENT_KEY);
      expect(body).not.toContain(BATCH_KEY);
      expect(body).not.toContain('closed request');
    }
  });

  it('acknowledges invalid state before refreshing the authorized support view', async () => {
    const support = makeSupportWorker({
      'POST /api/services/tickets': () => json({ error: 'invalid_state' }, 409),
      'POST /api/services/idempotency/ack': () => new Response(null, { status: 204 }),
      'GET /api/services/tickets': () => json({ tickets: [] }),
      'GET /api/services/tickets/closed': () => json({ tickets: [], next_cursor: null }),
    });
    const { testEnv, session } = await signedIn(support);
    await worker.fetch(post('/support', session.cookie, createFields()), testEnv);

    expect(support.requests.slice(0, 2).map((request) => request.pathname)).toEqual([
      '/api/services/tickets', '/api/services/idempotency/ack',
    ]);
    expect(support.requests[1].body).toEqual({ mutation: 'ticket.create' });
    expect(support.requests.slice(2).every((request) => request.method === 'GET')).toBe(true);
  });

  it('turns message and attachment tombstone witnesses into a tombstone without claiming acceptance', async () => {
    for (const path of ['/support/REQ_1/reply', '/support']) {
      const isCreate = path === '/support';
      const support = makeSupportWorker({
        'GET /api/services/tickets/REQ_1': () => json(detail()),
        'POST /api/services/tickets': () => json({ id: 'REQ_NEW', created_at: Date.now(), status: 'open' }),
        'POST /api/services/tickets/REQ_1/messages': () => json(tombstone('REQ_1')),
        'POST /api/services/tickets/REQ_NEW/attachments': () => json(tombstone('REQ_NEW')),
        'POST /api/services/idempotency/ack': () => new Response(null, { status: 204 }),
      });
      const { testEnv, session } = await signedIn(support);
      const fields = isCreate
        ? { ...createFields(), file: new File(['one'], 'one.log') }
        : { content: 'reply body', operation_key: PARENT_KEY, attachment_operation_key: BATCH_KEY };
      const body = await (await worker.fetch(post(path, session.cookie, fields), testEnv)).text();

      expect(body).toContain('closed request');
      expect(body).not.toContain(isCreate ? 'got it, this is request' : 'reply accepted');
    }
  });

  it('retries only an unresolved attachment batch with the same ordered bytes', async () => {
    let uploads = 0;
    const support = makeSupportWorker({
      'POST /api/services/tickets': () => json({ id: 'REQ_NEW', created_at: Date.now(), status: 'open' }),
      'POST /api/services/idempotency/ack': () => new Response(null, { status: 204 }),
      'GET /api/services/tickets/REQ_NEW': () => json(detail('REQ_NEW')),
      'POST /api/services/tickets/REQ_NEW/attachments': () => uploads++ === 0 ? new Response('down', { status: 500 }) : json({ ticket_id: 'REQ_NEW', attachment_ids: ['A'], status: 'accepted' }),
    });
    const { testEnv, session } = await signedIn(support);
    const files = [new File(['first'], 'first.log', { type: 'text/plain' }), new File(['second'], 'second.log', { type: 'text/plain' })];
    const first = await worker.fetch(post('/support', session.cookie, { ...createFields(), file: files }), testEnv);
    expect(await first.text()).toContain('reselect the same files');
    await worker.fetch(post('/support/REQ_NEW/attachments', session.cookie, { operation_key: BATCH_KEY, file: files }), testEnv);

    const batches = support.requests.filter((request) => request.pathname.endsWith('/attachments'));
    expect(batches).toHaveLength(2);
    expect(batches[0].headers.idempotencyKey).toBe(BATCH_KEY);
    expect(batches[1].headers.idempotencyKey).toBe(BATCH_KEY);
    expect(batches[1].body.fileEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'first.log', bytes: new Uint8Array([102, 105, 114, 115, 116]) }),
    ]));
    expect(batches[1].body.fileEntries.map((entry) => entry.name)).toEqual(['first.log', 'second.log']);
  });

  it('requires a newly reviewed batch after a changed retry conflicts under the preserved key', async () => {
    let uploads = 0;
    const support = makeSupportWorker({
      'POST /api/services/tickets': () => json({ id: 'REQ_NEW', created_at: Date.now(), status: 'open' }),
      'POST /api/services/idempotency/ack': () => new Response(null, { status: 204 }),
      'GET /api/services/tickets/REQ_NEW': () => json(detail('REQ_NEW')),
      'POST /api/services/tickets/REQ_NEW/attachments': () => uploads++ === 0
        ? new Response('down', { status: 500 })
        : json({ error: 'idempotency_conflict' }, 409),
    });
    const { testEnv, session } = await signedIn(support);
    await worker.fetch(post('/support', session.cookie, { ...createFields(), file: new File(['one'], 'one.log') }), testEnv);
    const body = await (await worker.fetch(post('/support/REQ_NEW/attachments', session.cookie, {
      operation_key: BATCH_KEY, file: new File(['changed'], 'changed.log'),
    }), testEnv)).text();

    expect(support.requests.filter((request) => request.pathname.endsWith('/attachments'))).toHaveLength(2);
    expect(body).toContain('do not match the earlier batch');
    expect(body).toContain('review request again');
    expect(body).not.toContain(`name="operation_key" value="${BATCH_KEY}"`);
  });

  it('never starts attachment upload after terminal parent outcomes', async () => {
    const parentOutcomes = [
      json(tombstone('REQ_GONE')),
      json({ error: 'operation_retired' }, 410),
      json({ error: 'operation_erased' }, 410),
      json({ error: 'invalid_state' }, 409),
      new Response(null, { status: 404 }),
    ];
    for (const parent of parentOutcomes) {
      const support = makeSupportWorker({
        'POST /api/services/tickets': () => parent.clone(),
        'POST /api/services/idempotency/ack': () => new Response(null, { status: 204 }),
        'GET /api/services/tickets': () => json({ tickets: [] }),
        'GET /api/services/tickets/closed': () => json({ tickets: [], next_cursor: null }),
      });
      const { testEnv, session } = await signedIn(support);
      await worker.fetch(post('/support', session.cookie, { ...createFields(), file: new File(['one'], 'one.log') }), testEnv);
      expect(support.requests.filter((request) => request.pathname.endsWith('/attachments'))).toHaveLength(0);
    }
  });
});

async function signedIn(support) {
  const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
  const account = await seedAccount({ email: 'owner@example.com', testEnv });
  const session = await seedSession(account.accountId, { testEnv });
  return { testEnv, session, account };
}

function post(path, cookie, fields) {
  const body = new FormData();
  body.set('csrf', TEST_CSRF);
  for (const [name, value] of Object.entries(fields)) {
    if (Array.isArray(value)) for (const item of value) body.append(name, item);
    else body.append(name, value);
  }
  return new Request(`https://services.solstone.app${path}`, { method: 'POST', headers: { Origin: 'https://services.solstone.app', Cookie: cookie }, body });
}

function createFields() { return { product: 'solstone', subject: 'subject', description: 'details', operation_key: PARENT_KEY, attachment_operation_key: BATCH_KEY }; }
function detail(id = 'REQ_1') { return { ticket: { id, subject: 'private subject', status: 'open', updated_at: Date.now() }, messages: [], attachments: [] }; }
function tombstone(id) { return { id, created_at: '2026-08-01T00:00:00.000Z', closed_at: '2026-08-02T00:00:00.000Z', status: 'closed', content_removed: true }; }
function json(body, status = 200, headers = {}) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } }); }
