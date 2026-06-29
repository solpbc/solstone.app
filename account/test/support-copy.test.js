import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
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
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { session } = await signedInAccount(testEnv);

    const response = await worker.fetch(get('/support', session.cookie), testEnv);
    const body = await response.text();

    expect(body).toContain('your support');
    expect(body).toContain('no open requests. need help? open one below, or your solstone keeper can file one for you.');
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
      'POST /api/services/tickets': () => json({ id: 'REQ_COPY_NEW' }),
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { session } = await signedInAccount(testEnv);

    const response = await worker.fetch(create('/support', session.cookie), testEnv);
    const body = await response.text();

    expect(body).toContain("got it, this is request #REQ_COPY_NEW. we'll email you at copy@example.com and you can follow it right here.");
  });

  it('keeps support-rendered HTML free of banned support words', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets': () => json({ tickets: [
        { id: 'REQ_SAFE', subject: 'safe subject', status: 'open', updated_at: Date.now() },
      ] }),
      'GET /api/services/tickets/REQ_SAFE': () => json({
        ticket: { id: 'REQ_SAFE', subject: 'safe subject', status: 'open', updated_at: Date.now() },
        messages: [{ author_kind: 'human', content: 'safe message', created_at: Date.now() }],
        attachments: [],
      }),
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { session } = await signedInAccount(testEnv);

    const list = await worker.fetch(get('/support', session.cookie), testEnv);
    const detail = await worker.fetch(get('/support/REQ_SAFE', session.cookie), testEnv);
    const notFound = await worker.fetch(get('/support/missing.id', session.cookie), testEnv);

    for (const body of [await list.text(), await detail.text(), await notFound.text()]) {
      expect(body).not.toMatch(/\bticket\b/i);
      expect(body).not.toMatch(/\bdashboard\b/i);
      expect(body).not.toMatch(/\blog in\b/i);
      expect(body).not.toMatch(/\baccount\b/i);
    }
  });

  it('keeps support OTP landing pages to the exact prompts and word bans', async () => {
    const testEnv = makeTestEnv();
    const listPrompt = supportSignInPrompt('/support');
    const detailBody = await supportLandingBody('/support/REQ_COPY', testEnv);
    const accountMatches = listPrompt.match(/\baccount\b/gi) || [];

    expect(listPrompt).toContain("sign in with your email to see your support. we'll send a 6-digit code, no password, no account to create.");
    expect(detailBody).toContain("sign in with your email to see request #REQ_COPY. we'll send a 6-digit code.");
    expect(accountMatches).toHaveLength(1);
    expect(detailBody).not.toMatch(/\baccount\b/i);
    for (const body of [listPrompt, detailBody]) {
      expect(body).not.toMatch(/\bticket\b/i);
      expect(body).not.toMatch(/\bdashboard\b/i);
      expect(body).not.toMatch(/\blog in\b/i);
      expect(body).not.toMatch(/support[_-]?(nonce|token)|magic/i);
    }
  });
});

async function signedInAccount(testEnv) {
  const account = await seedAccount({ email: 'copy@example.com', testEnv });
  const session = await seedSession(account.accountId, { testEnv });
  return { account, session };
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
