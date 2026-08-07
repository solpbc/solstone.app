import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { encodeCursor } from '../src/support-wire.js';
import {
  makeSupportWorker,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedSession,
} from './helpers.js';

describe('support closed history', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  it('reserves /support/closed before the generic detail route and forwards its opaque cursor once', async () => {
    const cursor = encodeCursor({ closedAt: '2026-08-12T15:17:47.154Z', id: '33' }).value;
    const support = makeSupportWorker({
      'GET /api/services/tickets/closed': ({ url }) => {
        expect(url.searchParams.get('cursor')).toBe(cursor);
        return json({ tickets: twentyFiveTombstones(), next_cursor: null });
      },
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { session } = await signedInAccount(testEnv);

    const response = await worker.fetch(get(`/support/closed?cursor=${cursor}`, session.cookie), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('closed requests');
    expect(body).toContain('request #1');
    expect(body).toContain('request #25');
    expect(body).toContain('details removed to protect your privacy');
    expect(support.requests).toHaveLength(1);
    expect(support.requests[0].pathname).toBe('/api/services/tickets/closed');
    expect(support.requests[0].search).toBe(`?cursor=${cursor}`);
    expect(support.requests[0].headers.hasVerifiedEmail).toBe(false);
  });

  it('keeps a malformed inbound cursor page-local without calling page one', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets/closed': () => json({ tickets: twentyFiveTombstones(), next_cursor: null }),
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { session } = await signedInAccount(testEnv);

    const response = await worker.fetch(get('/support/closed?cursor=bad%3D', session.cookie), testEnv);
    const body = await response.text();

    expect(body).toContain("we couldn't load closed requests. try again.");
    expect(body).not.toContain('request #1');
    expect(body).not.toContain('older closed requests');
    expect(body).toContain('/support/closed?cursor=bad%3D');
    expect(support.requests).toHaveLength(0);
  });

  it('does not render or advance a page with a malformed upstream next cursor', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets/closed': () => json({ tickets: twentyFiveTombstones(), next_cursor: 'not-a-cursor' }),
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { session } = await signedInAccount(testEnv);

    const response = await worker.fetch(get('/support/closed', session.cookie), testEnv);
    const body = await response.text();

    expect(body).toContain("we couldn't load closed requests. try again.");
    expect(body).not.toContain('request #1');
    expect(body).not.toContain('older closed requests');
    expect(support.requests).toHaveLength(1);
    expect(support.requests[0].search).toBe('');
  });

  it('renders a tombstone detail without active content, controls, or upstream poison', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets/REQ_CLOSED': () => json(tombstone('REQ_CLOSED')),
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { session } = await signedInAccount(testEnv);

    const response = await worker.fetch(get('/support/REQ_CLOSED', session.cookie), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('closed request');
    expect(body).toContain('request #REQ_CLOSED');
    expect(body).toContain('details removed to protect your privacy.');
    for (const value of ['subject', 'messages', 'reply', 'attachments', 'filename', 'reason', 'owner_key', 'context', 'action="/support/REQ_CLOSED']) {
      expect(body).not.toContain(value);
    }
  });
});

async function signedInAccount(testEnv) {
  const account = await seedAccount({ email: 'history@example.com', testEnv });
  const session = await seedSession(account.accountId, { testEnv });
  return { account, session };
}

function get(path, cookie) {
  return new Request(`https://services.solstone.app${path}`, { headers: { Cookie: cookie } });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function twentyFiveTombstones() {
  return Array.from({ length: 25 }, (_, index) => tombstone(String(index + 1)));
}

function tombstone(id) {
  return {
    id,
    created_at: '2026-08-01T00:00:00.000Z',
    closed_at: '2026-08-02T00:00:00.000Z',
    status: 'closed',
    content_removed: true,
  };
}
