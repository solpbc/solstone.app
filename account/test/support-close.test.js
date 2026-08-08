import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { TEST_CSRF, makeSupportWorker, makeTestEnv, resetDb, seedAccount, seedSession } from './helpers.js';

const KEY = 'ccccccccccccccccccccccccccccccccccccccccccc';

describe('support close', () => {
  beforeEach(resetDb);

  it.each([
    ['missing', {}],
    ['wrong', { confirmation: 'wrong', confirmationControl: 'checkbox' }],
    ['hidden-only', { confirmation: 'remove_details' }],
    ['unchecked', { confirmationControl: 'checkbox' }],
  ])('makes zero binding calls for %s removal confirmation', async (_name, options) => {
    const support = makeSupportWorker();
    const { testEnv, session } = await signedIn(support);
    const response = await worker.fetch(closeRequest(session.cookie, options), testEnv);
    expect(response.status).toBe(200);
    expect(support.requests).toHaveLength(0);
  });

  it('renders a tombstone only after close acknowledgement', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets/REQ_1': () => json(detail()),
      'POST /api/services/tickets/REQ_1/close': () => mutationJson(tombstone()),
      'POST /api/services/idempotency/ack': () => new Response(null, { status: 204 }),
    });
    const { testEnv, session, account } = await signedIn(support);
    const response = await worker.fetch(closeRequest(session.cookie, { confirmation: 'remove_details', confirmationControl: 'checkbox' }), testEnv);
    const body = await response.text();

    expect(body).toContain('closed request');
    expect(body).not.toContain('action="/support/REQ_1/close"');
    expect(support.requests[1]).toMatchObject({ headers: { ownerId: account.accountId, idempotencyKey: KEY, hasVerifiedEmail: false } });
    expect(support.requests[2].body).toEqual({ mutation: 'ticket.close' });
  });

  it('never re-renders cached details when close succeeded but acknowledgement is lost', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets/REQ_1': () => json(detail()),
      'POST /api/services/tickets/REQ_1/close': () => mutationJson(tombstone()),
      'POST /api/services/idempotency/ack': () => new Response(null, { status: 503 }),
    });
    const { testEnv, session } = await signedIn(support);
    const response = await worker.fetch(closeRequest(session.cookie, {
      confirmation: 'remove_details', confirmationControl: 'checkbox',
    }), testEnv);
    const body = await response.text();

    expect(body).toContain('removing details');
    expect(body).toContain(`name="operation_key" value="${KEY}"`);
    expect(body).not.toContain('private subject');
    expect(body).not.toContain('messages');
    expect(body).not.toContain('attachments');
  });

  it('never re-renders cached details when privacy deletion wins the close race', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets/REQ_1': () => json(detail()),
      'POST /api/services/tickets/REQ_1/close': () => new Response(null, { status: 404 }),
    });
    const { testEnv, session } = await signedIn(support);
    const response = await worker.fetch(closeRequest(session.cookie, {
      confirmation: 'remove_details', confirmationControl: 'checkbox',
    }), testEnv);
    const body = await response.text();

    expect(body).toContain('removing details');
    expect(body).toContain('href="/support/REQ_1"');
    expect(body).not.toContain(`name="operation_key" value="${KEY}"`);
    expect(body).not.toContain('private subject');
    expect(body).not.toContain('messages');
    expect(body).not.toContain('attachments');
  });

  it.each([
    ['retired', 'operation_retired'],
    ['erased', 'operation_erased'],
  ])('drops a terminal %s close key from the content-free state', async (_name, error) => {
    const support = makeSupportWorker({
      'GET /api/services/tickets/REQ_1': () => json(detail()),
      'POST /api/services/tickets/REQ_1/close': () => json({ error }, 410),
    });
    const { testEnv, session } = await signedIn(support);
    const body = await (await worker.fetch(closeRequest(session.cookie, {
      confirmation: 'remove_details', confirmationControl: 'checkbox',
    }), testEnv)).text();

    expect(body).toContain('removing details');
    expect(body).toContain('href="/support/REQ_1"');
    expect(body).not.toContain(`name="operation_key" value="${KEY}"`);
    expect(body).not.toContain('private subject');
  });

  it('keeps the close key in a content-free close-in-progress retry state', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets/REQ_1': () => json(detail()),
      'POST /api/services/tickets/REQ_1/close': () => json({ error: 'close_in_progress' }, 409, { 'Retry-After': '12' }),
    });
    const { testEnv, session } = await signedIn(support);
    const response = await worker.fetch(closeRequest(session.cookie, { confirmation: 'remove_details', confirmationControl: 'checkbox' }), testEnv);
    const body = await response.text();

    expect(body).toContain('removing details');
    expect(body).toContain('try again in 12');
    expect(body).toContain(`name="operation_key" value="${KEY}"`);
    expect(body).not.toContain('private subject');
    expect(body).not.toContain('attachments');
    expect(body).not.toContain('request actions');
    expect(body).not.toContain('name="confirmation"');
  });

  it('refetches authoritative detail from the retry control without sleeping or resubmitting close', async () => {
    let reads = 0;
    const support = makeSupportWorker({
      'GET /api/services/tickets/REQ_1': () => reads++ === 0
        ? json(detail())
        : json(tombstone()),
      'POST /api/services/tickets/REQ_1/close': () => json({ error: 'close_in_progress' }, 409, { 'Retry-After': '1' }),
    });
    const { testEnv, session } = await signedIn(support);
    const started = Date.now();
    const first = await worker.fetch(closeRequest(session.cookie, { confirmation: 'remove_details', confirmationControl: 'checkbox' }), testEnv);
    expect(Date.now() - started).toBeLessThan(500);
    expect(await first.text()).toContain('check again');

    const retry = await worker.fetch(closeRequest(session.cookie, { closeRetry: true }), testEnv);
    expect(await retry.text()).toContain('closed request');
    expect(support.requests.filter((request) => request.pathname.endsWith('/close'))).toHaveLength(1);
    expect(support.requests.at(-1).pathname).toBe('/api/services/tickets/REQ_1');
  });

  it('keeps a detail close-in-progress response content-free', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets/REQ_1': () => json({ error: 'close_in_progress' }, 409, { 'Retry-After': '8' }),
    });
    const { testEnv, session } = await signedIn(support);
    const body = await (await worker.fetch(get('/support/REQ_1', session.cookie), testEnv)).text();

    expect(body).toContain('removing details');
    expect(body).toContain('try again in 8');
    for (const value of ['messages', 'attachments', 'request actions', 'name="confirmation"']) expect(body).not.toContain(value);
  });
});

async function signedIn(support) {
  const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
  const account = await seedAccount({ email: 'owner@example.com', testEnv });
  const session = await seedSession(account.accountId, { testEnv });
  return { testEnv, session, account };
}

function closeRequest(cookie, { confirmation, confirmationControl, closeRetry } = {}) {
  const body = new FormData();
  body.set('csrf', TEST_CSRF);
  body.set('operation_key', KEY);
  if (confirmation !== undefined) body.set('confirmation', confirmation);
  if (confirmationControl !== undefined) body.set('confirmation_control', confirmationControl);
  if (closeRetry) body.set('close_retry', 'refresh');
  return new Request('https://services.solstone.app/support/REQ_1/close', { method: 'POST', headers: { Origin: 'https://services.solstone.app', Cookie: cookie }, body });
}

function get(path, cookie) { return new Request(`https://services.solstone.app${path}`, { headers: { Cookie: cookie } }); }

function detail() { return { ticket: { id: 'REQ_1', subject: 'private subject', status: 'open', updated_at: Date.now() }, messages: [], attachments: [] }; }
function tombstone() { return { id: 'REQ_1', created_at: '2026-08-01T00:00:00.000Z', closed_at: '2026-08-02T00:00:00.000Z', status: 'closed', content_removed: true }; }
function json(body, status = 200, headers = {}) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } }); }
function mutationJson(body) { return json(body, 200, { 'Idempotency-Replay': 'false' }); }
