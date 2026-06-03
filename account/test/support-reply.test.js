import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  TEST_CSRF,
  makeSupportWorker,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedAccountEmail,
  seedSession,
} from './helpers.js';

describe('support reply', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  it('posts a reply after 404 fanout, uploads attachments with the same email, and re-renders detail', async () => {
    const support = makeSupportWorker({
      'POST /api/services/tickets/REQ_1/messages': ({ request }) => {
        if (request.headers.get('X-Verified-Email') === 'primary@example.com') return json({ error: 'not found' }, 404);
        return json({ ok: true });
      },
      'POST /api/services/tickets/REQ_1/attachments': ({ request }) => {
        expect(request.headers.get('X-Verified-Email')).toBe('secondary@example.com');
        return json({ ok: true });
      },
      'GET /api/services/tickets/REQ_1': ({ request }) => {
        expect(request.headers.get('X-Verified-Email')).toBe('secondary@example.com');
        return json(detailPayload('reply body'));
      },
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { account, session } = await signedInAccount(testEnv);
    await seedAccountEmail({ accountId: account.accountId, address: 'secondary@example.com', verifiedAt: Date.now(), testEnv });

    const response = await worker.fetch(replyRequest(session.cookie, {
      file: new File(['reply file'], 'reply.log'),
    }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('reply body');
    expect(support.requests.map((request) => `${request.method} ${request.pathname}`)).toEqual([
      'POST /api/services/tickets/REQ_1/messages',
      'POST /api/services/tickets/REQ_1/messages',
      'POST /api/services/tickets/REQ_1/attachments',
      'GET /api/services/tickets/REQ_1',
    ]);
    expect(support.requests[1].body).toEqual({ content: 'reply body' });
    expect(support.requests[2].body.files).toEqual([{ name: 'reply.log', size: 10 }]);
  });

  it('preserves the reply and shows a notice when reply attachment upload fails', async () => {
    const support = makeSupportWorker({
      'POST /api/services/tickets/REQ_1/messages': () => json({ ok: true }),
      'POST /api/services/tickets/REQ_1/attachments': () => json({ error: 'down' }, 500),
      'GET /api/services/tickets/REQ_1': () => json(detailPayload('reply was saved')),
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { session } = await signedInAccount(testEnv);

    const response = await worker.fetch(replyRequest(session.cookie, {
      file: new File(['bad'], 'bad.log'),
    }), testEnv);
    const body = await response.text();

    expect(body).toContain('reply was saved');
    expect(body).toContain('your attachments could not be uploaded.');
  });

  it('stops reply fanout on non-404 failure', async () => {
    const support = makeSupportWorker({
      'POST /api/services/tickets/REQ_1/messages': ({ request }) => {
        if (request.headers.get('X-Verified-Email') === 'primary@example.com') return json({ error: 'down' }, 500);
        return json({ ok: true });
      },
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { account, session } = await signedInAccount(testEnv);
    await seedAccountEmail({ accountId: account.accountId, address: 'secondary@example.com', verifiedAt: Date.now(), testEnv });

    const response = await worker.fetch(replyRequest(session.cookie), testEnv);
    const body = await response.text();

    expect(body).toContain("we couldn't add that reply. try again.");
    expect(support.requests).toHaveLength(1);
  });

  it('requires same-origin and a valid csrf token', async () => {
    const testEnv = makeTestEnv({ SUPPORT_WORKER: makeSupportWorker() });
    const { session } = await signedInAccount(testEnv);

    const badOrigin = await worker.fetch(replyRequest(session.cookie, { origin: 'https://bad.example' }), testEnv);
    const badCsrf = await worker.fetch(replyRequest(session.cookie, { csrf: 'bad' }), testEnv);

    expect(badOrigin.status).toBe(403);
    expect(badOrigin.headers.get('Cache-Control')).toBe('no-store');
    expect(badCsrf.status).toBe(403);
  });
});

async function signedInAccount(testEnv) {
  const account = await seedAccount({ email: 'primary@example.com', testEnv });
  const session = await seedSession(account.accountId, { testEnv });
  return { account, session };
}

function replyRequest(cookie, {
  origin = 'https://services.solstone.app',
  csrf = TEST_CSRF,
  file = null,
} = {}) {
  const body = new FormData();
  body.set('csrf', csrf);
  body.set('content', 'reply body');
  if (file) body.append('file', file);
  return new Request('https://services.solstone.app/support/REQ_1/reply', {
    method: 'POST',
    headers: {
      Origin: origin,
      Cookie: cookie,
    },
    body,
  });
}

function detailPayload(content) {
  return {
    ticket: { id: 'REQ_1', subject: 'detail', status: 'open', updated_at: Date.now() },
    messages: [{ author_kind: 'human', content, created_at: Date.now() }],
    attachments: [],
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
