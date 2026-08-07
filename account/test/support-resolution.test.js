import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { TEST_CSRF, makeSupportWorker, makeTestEnv, resetDb, seedAccount, seedSession } from './helpers.js';

const KEY = 'ddddddddddddddddddddddddddddddddddddddddddd';

describe('support resolution', () => {
  beforeEach(resetDb);

  it('renders exactly two proposed actions and one scheduled-waiting cancellation action', async () => {
    for (const [ticket, resolutionForms] of [[detail('proposed'), 2], [detail('waiting', '2026-09-01T00:00:00.000Z'), 1]]) {
      const support = makeSupportWorker({ 'GET /api/services/tickets/REQ_1': () => json(ticket) });
      const { testEnv, session } = await signedIn(support);
      const body = await (await worker.fetch(get('/support/REQ_1', session.cookie), testEnv)).text();
      expect(body.match(/value="still_need_help"/g)).toHaveLength(1);
      expect(body.match(/action="\/support\/REQ_1\/resolution"/g)).toHaveLength(resolutionForms);
    }
  });

  it('sends the exact still-needed resolution JSON and refreshes authoritative state after acknowledgement', async () => {
    let reads = 0;
    const support = makeSupportWorker({
      'GET /api/services/tickets/REQ_1': () => json(detail(reads++ ? 'open' : 'proposed')),
      'POST /api/services/tickets/REQ_1/resolution': () => json({ id: 'REQ_1', status: 'open', close_scheduled_at: null }),
      'POST /api/services/idempotency/ack': () => new Response(null, { status: 204 }),
    });
    const { testEnv, session } = await signedIn(support);
    const response = await worker.fetch(resolutionRequest(session.cookie, 'still_need_help'), testEnv);
    const body = await response.text();

    expect(support.requests[1].body).toEqual({ outcome: 'still_need_help' });
    expect(support.requests[1].headers.idempotencyKey).toBe(KEY);
    expect(support.requests[2].body).toEqual({ mutation: 'ticket.resolution' });
    expect(body).not.toContain('scheduled to be removed');
  });

  it('requires removal confirmation for solved and sends the exact solved JSON', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets/REQ_1': () => json(detail('proposed')),
      'POST /api/services/tickets/REQ_1/resolution': () => json(tombstone()),
      'POST /api/services/idempotency/ack': () => new Response(null, { status: 204 }),
    });
    const { testEnv, session } = await signedIn(support);
    await worker.fetch(resolutionRequest(session.cookie, 'solved'), testEnv);
    expect(support.requests).toHaveLength(0);
    await worker.fetch(resolutionRequest(session.cookie, 'solved', 'remove_details'), testEnv);
    expect(support.requests[1].body).toEqual({ outcome: 'solved' });
  });

  it('uses refreshed authoritative close scheduling and retains an uncommitted cancellation schedule', async () => {
    let reads = 0;
    const support = makeSupportWorker({
      'GET /api/services/tickets/REQ_1': () => json(reads++ === 0
        ? detail('waiting', '2026-09-01T00:00:00.000Z')
        : detail('waiting', '2026-09-02T00:00:00.000Z')),
      'POST /api/services/tickets/REQ_1/resolution': () => new Response('down', { status: 500 }),
    });
    const { testEnv, session } = await signedIn(support);
    const body = await (await worker.fetch(resolutionRequest(session.cookie, 'still_need_help'), testEnv)).text();

    expect(body).toContain('scheduled to be removed on 2026-09-01');
    expect(body).toContain('I still need help');
  });

  it('renders the backend-refreshed close schedule after a confirmed still-needed action', async () => {
    let reads = 0;
    const support = makeSupportWorker({
      'GET /api/services/tickets/REQ_1': () => json(reads++ === 0
        ? detail('waiting', '2026-09-01T00:00:00.000Z')
        : detail('waiting', '2026-09-03T00:00:00.000Z')),
      'POST /api/services/tickets/REQ_1/resolution': () => json({ id: 'REQ_1', status: 'waiting', close_scheduled_at: null }),
      'POST /api/services/idempotency/ack': () => new Response(null, { status: 204 }),
    });
    const { testEnv, session } = await signedIn(support);
    const body = await (await worker.fetch(resolutionRequest(session.cookie, 'still_need_help'), testEnv)).text();

    expect(body).toContain('scheduled to be removed on 2026-09-03');
  });
});

async function signedIn(support) {
  const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
  const account = await seedAccount({ email: 'owner@example.com', testEnv });
  const session = await seedSession(account.accountId, { testEnv });
  return { testEnv, session };
}

function resolutionRequest(cookie, outcome, confirmation) {
  const body = new FormData();
  body.set('csrf', TEST_CSRF); body.set('operation_key', KEY); body.set('outcome', outcome);
  if (confirmation) body.set('confirmation', confirmation);
  if (confirmation === 'remove_details') body.set('confirmation_control', 'checkbox');
  return new Request('https://services.solstone.app/support/REQ_1/resolution', { method: 'POST', headers: { Origin: 'https://services.solstone.app', Cookie: cookie }, body });
}
function get(path, cookie) { return new Request(`https://services.solstone.app${path}`, { headers: { Cookie: cookie } }); }
function detail(status, closeScheduledAt = null) { return { ticket: { id: 'REQ_1', subject: 'subject', status, updated_at: Date.now(), close_scheduled_at: closeScheduledAt }, messages: [], attachments: [] }; }
function tombstone() { return { id: 'REQ_1', created_at: '2026-08-01T00:00:00.000Z', closed_at: '2026-08-02T00:00:00.000Z', status: 'closed', content_removed: true }; }
function json(body) { return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }); }
