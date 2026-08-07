import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { renderSupportDetail } from '../src/support-html.js';
import { supportSignInPrompt } from '../src/support.js';
import {
  TEST_CSRF,
  makeSupportWorker,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedSession,
} from './helpers.js';

describe('support copy and leak checks', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  it('renders every byte-exact support list and open-request copy block', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets': () => json({ tickets: [] }),
      'GET /api/services/tickets/closed': () => json({ tickets: [], next_cursor: null }),
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { session } = await signedInAccount(testEnv);

    const response = await worker.fetch(get('/support', session.cookie), testEnv);
    const body = await response.text();

    expect(body).toContain('your support');
    expect(body).toContain('no open requests. need help? open one below, or sol can file one for you.');
    expect(body).toContain('open a request');
    expect(body).toContain("tell us what's going on. you can attach screenshots or logs here. it's easier than email.");
    expect(body).toContain("what's going on?");
    expect(body).toContain('the details');
    expect(body).toContain('which product?');
    expect(body).toContain('solstone');
    expect(body).toContain('vit');
    expect(body).toContain('attachments');
    expect(body).toContain('optional screenshots/logs');
    expect(body).toContain("screenshots and logs are used only to triage your request. once we've reviewed them, the files are deleted and can't be recovered. after you submit, they're not viewable or downloadable here, and we keep only a short summary from triage, never the files themselves.");
  });

  it('renders exact reply helper and removed attachment phrase without poisoned attachment values', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets/REQ_COPY': () => json({
        ticket: { id: 'REQ_COPY', subject: 'copy check', status: 'resolved', updated_at: Date.now() },
        messages: [{ author_kind: 'human', content: 'hello', created_at: Date.now() }],
        attachments: [
          {
            filename: 'pending.log',
            status: 'pending',
            r2_key: 'POISON_R2',
            url: 'POISON_URL',
            download_url: 'POISON_DOWNLOAD',
            storage_id: 'POISON_STORAGE',
          },
          {
            filename: 'removed.log',
            status: 'removed',
            triage_summary: 'triage found the issue',
            r2_key: 'POISON_REMOVED',
            download_url: '/api/services/tickets/REQ_COPY/attachments/download',
          },
        ],
      }),
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { session } = await signedInAccount(testEnv);

    const response = await worker.fetch(get('/support/REQ_COPY', session.cookie), testEnv);
    const body = await response.text();

    expect(body).toContain('reply');
    expect(body).toContain('add a reply, or attach a screenshot or log.');
    expect(body).toContain('pending');
    expect(body).toContain('attachment removed after triage');
    expect(body).toContain('triage found the issue');
    for (const leak of [
      'POISON_R2',
      'POISON_URL',
      'POISON_DOWNLOAD',
      'POISON_STORAGE',
      'POISON_REMOVED',
      '/api/services/tickets/REQ_COPY/attachments/download',
      'r2_key',
      'download_url',
    ]) {
      expect(body).not.toContain(leak);
    }
  });

  it('renders exact request-opened confirmation copy', async () => {
    const support = makeSupportWorker({
      'POST /api/services/tickets': () => json({
        id: 'REQ_COPY_NEW', created_at: Date.now(), status: 'open',
      }),
      'POST /api/services/idempotency/ack': () => new Response(null, { status: 204 }),
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { session } = await signedInAccount(testEnv);

    const response = await worker.fetch(create('/support', session.cookie), testEnv);
    const body = await response.text();

    expect(body).toContain("got it, this is request #REQ_COPY_NEW. you can follow it right here.");
  });

  it('keeps support-rendered HTML free of banned support words', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets': () => json({ tickets: [
        {
          id: 'REQ_SAFE', subject: 'safe subject', status: 'open', updated_at: Date.now(),
          reason: 'POISON_REASON', owner_key: 'POISON_OWNER_KEY', context: 'POISON_CONTEXT',
        },
      ] }),
      'GET /api/services/tickets/closed': () => json({ tickets: [tombstone('REQ_CLOSED')], next_cursor: null }),
      'GET /api/services/tickets/REQ_SAFE': () => json({
        ticket: {
          id: 'REQ_SAFE', subject: 'safe subject', status: 'open', updated_at: Date.now(),
          reason: 'POISON_REASON', owner_key: 'POISON_OWNER_KEY', context: 'POISON_CONTEXT',
        },
        messages: [{ author_kind: 'human', content: 'safe message', created_at: Date.now() }],
        attachments: [],
      }),
      'GET /api/services/tickets/REQ_CLOSED': () => json(tombstone('REQ_CLOSED')),
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { account, session } = await signedInAccount(testEnv);

    const list = await worker.fetch(get('/support', session.cookie), testEnv);
    const closed = await worker.fetch(get('/support/closed', session.cookie), testEnv);
    const detail = await worker.fetch(get('/support/REQ_SAFE', session.cookie), testEnv);
    const tombstoneDetail = await worker.fetch(get('/support/REQ_CLOSED', session.cookie), testEnv);
    const notFound = await worker.fetch(get('/support/missing.id', session.cookie), testEnv);

    const activeErrorEnv = makeTestEnv({
      SUPPORT_WORKER: makeSupportWorker({
        'GET /api/services/tickets': () => new Response('down', { status: 500 }),
      }),
    });
    const { session: activeErrorSession } = await signedInAccount(activeErrorEnv);
    const activeFailure = await worker.fetch(get('/support?section=active', activeErrorSession.cookie), activeErrorEnv);
    const closedErrorEnv = makeTestEnv({
      SUPPORT_WORKER: makeSupportWorker({
        'GET /api/services/tickets': () => json({ tickets: [] }),
        'GET /api/services/tickets/closed': () => new Response('down', { status: 500 }),
      }),
    });
    const { session: closedErrorSession } = await signedInAccount(closedErrorEnv);
    const closedFailure = await worker.fetch(get('/support', closedErrorSession.cookie), closedErrorEnv);

    for (const body of [
      await list.text(), await closed.text(), await detail.text(), await tombstoneDetail.text(), await notFound.text(),
      await activeFailure.text(), await closedFailure.text(),
    ]) {
      expect(body).not.toMatch(/\bticket\b/i);
      expect(body).not.toMatch(/\bdashboard\b/i);
      expect(body).not.toMatch(/\blog in\b/i);
      expect(body).not.toMatch(/\baccount\b/i);
      expect(body).not.toContain(account.accountId);
      expect(body).not.toContain('copy@example.com');
      expect(body).not.toContain('POISON_REASON');
      expect(body).not.toContain('POISON_OWNER_KEY');
      expect(body).not.toContain('POISON_CONTEXT');
    }
  });

  it('keeps support OTP landing pages to the exact prompts and word bans', async () => {
    const testEnv = makeTestEnv();
    const listPrompt = supportSignInPrompt('/support');
    const detailBody = await supportLandingBody('/support/REQ_COPY', testEnv);

    expect(listPrompt).toContain("sign in with your email to see your support. we'll email you a code.");
    expect(detailBody).toContain("sign in with your email to see request #REQ_COPY. we'll email you a code.");
    expect(listPrompt).not.toMatch(/\baccount\b/i);
    expect(detailBody).not.toMatch(/\baccount\b/i);
    for (const body of [listPrompt, detailBody]) {
      expect(body).not.toMatch(/\bticket\b/i);
      expect(body).not.toMatch(/\bdashboard\b/i);
      expect(body).not.toMatch(/\blog in\b/i);
      expect(body).not.toMatch(/support[_-]?(nonce|token)|magic/i);
    }
  });

  it('makes bypassed status values visible rather than inventing pending or in-progress states', () => {
    const body = renderSupportDetail({
      request: { id: 'REQ_RENDER', subject: 'safe subject', status: 'unknown', updatedAtMs: Date.now() },
      attachments: [{ filename: 'safe.log', status: 'unknown' }],
    });

    expect(body).toContain('unreadable status');
    expect(body).toContain('unreadable attachment state');
    expect(body).not.toContain('<div class="desc">pending</div>');
  });

  it('keeps support forms native and accessible without placing controls on tombstones', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets/REQ_COPY': () => json({
        ticket: { id: 'REQ_COPY', subject: 'copy check', status: 'proposed', updated_at: Date.now() },
        messages: [], attachments: [],
      }),
      'GET /api/services/tickets/REQ_CLOSED': () => json(tombstone('REQ_CLOSED')),
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { session } = await signedInAccount(testEnv);
    const active = await (await worker.fetch(get('/support/REQ_COPY', session.cookie), testEnv)).text();
    const closed = await (await worker.fetch(get('/support/REQ_CLOSED', session.cookie), testEnv)).text();

    for (const id of ['reply-content', 'reply-file']) expect(active).toContain(`label for="${id}"`);
    expect(active).toContain('required maxlength="5000"');
    expect(active).toContain('data-support-progress role="status" aria-live="polite"');
    expect(active).toContain('data-support-form');
    expect(active).toContain('disabled=!0');
    expect(active).toContain('pageshow');
    expect(closed).not.toMatch(/<form[^>]+action="\/support/);
  });
});

async function signedInAccount(testEnv) {
  const account = await seedAccount({ email: 'copy@example.com', testEnv });
  const session = await seedSession(account.accountId, { testEnv });
  return { account, session };
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

function get(path, cookie) {
  return new Request(`https://services.solstone.app${path}`, {
    headers: { Cookie: cookie },
  });
}

function create(path, cookie) {
  const body = new FormData();
  body.set('csrf', TEST_CSRF);
  body.set('product', 'solstone');
  body.set('subject', 'copy subject');
  body.set('description', 'copy details');
  body.set('operation_key', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  body.set('attachment_operation_key', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  return new Request(`https://services.solstone.app${path}`, {
    method: 'POST',
    headers: {
      Origin: 'https://services.solstone.app',
      Cookie: cookie,
    },
    body,
  });
}

async function supportLandingBody(path, testEnv) {
  const first = await worker.fetch(new Request(`https://services.solstone.app${path}`), testEnv);
  expect(first.status).toBe(303);
  const landing = await worker.fetch(new Request(`https://services.solstone.app${first.headers.get('Location')}`), testEnv);
  return landing.text();
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
