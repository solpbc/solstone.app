import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  makeSupportWorker,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedAccountEmail,
  seedSession,
} from './helpers.js';

describe('support detail', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  it('advances on 404 across verified emails and renders thread labels plus write-only attachments', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets/REQ_1': ({ request }) => {
        if (request.headers.get('X-Verified-Email') === 'primary@example.com') {
          return json({ error: 'not found' }, 404);
        }
        return json(detailPayload());
      },
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { account, session } = await signedInAccount(testEnv);
    await seedAccountEmail({
      accountId: account.accountId,
      address: 'secondary@example.com',
      verifiedAt: Date.now(),
      testEnv,
    });

    const response = await worker.fetch(get('/support/REQ_1', session.cookie), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('need help');
    expect(body).toContain('waiting on you');
    expect(body).toContain('you');
    expect(body).toContain('solstone support');
    expect(body).toContain('<div class="title">sol</div>');
    expect(body).toContain('you (via the form)');
    expect(body).toContain('pending');
    expect(body).toContain('attachment removed after triage');
    expect(body).toContain('looked at the log');
    expect(body).not.toContain('secret-r2-key');
    expect(body).not.toContain('https://download.example/file');
    expect(body).not.toContain('/api/services/tickets/REQ_1/attachments/download');
    expect(body).not.toContain('r2_key');
    expect(body).not.toContain('download_url');
    expect(support.requests.map((request) => request.headers.verifiedEmail)).toEqual([
      'primary@example.com',
      'secondary@example.com',
    ]);
  });

  it('renders nested message attachments and scrubs storage fields', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets/REQ_NESTED': () => json(nestedDetailPayload()),
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { session } = await signedInAccount(testEnv);

    const response = await worker.fetch(get('/support/REQ_NESTED', session.cookie), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('shot.png');
    expect(body).toContain('trace.log');
    expect(body).toContain('pending');
    expect(body).toContain('attachment removed after triage');
    expect(body).toContain('looked at the log');
    expect(body).toContain('you');
    expect(body).toContain('solstone support');
    expect(body).toContain('<div class="title">sol</div>');
    expect(body).toContain('you (via the form)');
    expect(body).toContain('first');
    expect(body).toContain('second');
    expect(body).toContain('third');
    expect(body).toContain('fourth');
    expect(body).toContain('just now');
    expect(body).not.toContain('secret-r2-key');
    expect(body).not.toContain('https://download.example/file');
    expect(body).not.toContain('/api/services/tickets/REQ_NESTED/attachments/download');
    expect(body).not.toContain('secret-storage-id');
    expect(body).not.toContain('removed-secret');
    expect(body).not.toContain('r2_key');
    expect(body).not.toContain('download_url');
  });

  it('uses safe fallbacks for unknown status and author kind', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets/REQ_UNKNOWN': () => json({
        ticket: { id: 'REQ_UNKNOWN', subject: 'unknowns', status: 'internal-only', updated_at: Date.now() },
        messages: [{ author_kind: 'robot', content: 'hello', created_at: Date.now() }],
        attachments: [],
      }),
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { session } = await signedInAccount(testEnv);

    const response = await worker.fetch(get('/support/REQ_UNKNOWN', session.cookie), testEnv);
    const body = await response.text();

    expect(body).toContain('in progress');
    expect(body).toContain('solstone support');
    expect(body).not.toContain('internal-only');
    expect(body).not.toContain('robot');
  });

  it('stops fanout on a non-404 detail failure', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets/REQ_FAIL': ({ request }) => {
        if (request.headers.get('X-Verified-Email') === 'primary@example.com') {
          return json({ error: 'down' }, 500);
        }
        return json(detailPayload({ subject: 'should not load' }));
      },
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { account, session } = await signedInAccount(testEnv);
    await seedAccountEmail({ accountId: account.accountId, address: 'secondary@example.com', verifiedAt: Date.now(), testEnv });

    const response = await worker.fetch(get('/support/REQ_FAIL', session.cookie), testEnv);
    const body = await response.text();

    expect(body).toContain("we couldn't load your support right now. try again soon.");
    expect(body).not.toContain('should not load');
    expect(support.requests).toHaveLength(1);
  });

  it('renders generic 404s for invalid ids and all-email not found without leaking ids', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets/REQ_MISSING': () => json({ error: 'not found' }, 404),
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { session } = await signedInAccount(testEnv);

    const invalid = await worker.fetch(get('/support/bad.id', session.cookie), testEnv);
    const missing = await worker.fetch(get('/support/REQ_MISSING', session.cookie), testEnv);
    const invalidBody = await invalid.text();
    const missingBody = await missing.text();

    expect(invalid.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(invalidBody).toContain('<h1>request not found</h1>');
    expect(missingBody).toContain('<h1>request not found</h1>');
    expect(invalidBody).not.toContain('primary@example.com');
    expect(missingBody).toContain('<div class="who">primary@example.com</div>');
    expect(missingBody).not.toContain('REQ_MISSING');
    expect(missingBody).not.toContain('bad.id');
  });
});

async function signedInAccount(testEnv) {
  const account = await seedAccount({ email: 'primary@example.com', testEnv });
  const session = await seedSession(account.accountId, { testEnv });
  return { account, session };
}

function get(path, cookie) {
  return new Request(`https://services.solstone.app${path}`, {
    headers: { Cookie: cookie },
  });
}

function detailPayload({ subject = 'need help' } = {}) {
  return {
    ticket: { id: 'REQ_1', subject, status: 'proposed', updated_at: Date.now() },
    messages: [
      { author_kind: 'human', content: 'first', created_at: Date.now() },
      { author_kind: 'operator', content: 'second', created_at: Date.now() },
      { author_kind: 'agent', content: 'third', created_at: Date.now() },
      { author_kind: 'anonymous', content: 'fourth', created_at: Date.now() },
    ],
    attachments: [
      {
        filename: 'log.txt',
        status: 'pending',
        r2_key: 'secret-r2-key',
        url: 'https://download.example/file',
        download_url: '/api/services/tickets/REQ_1/attachments/download',
        storage_id: 'secret-storage-id',
      },
      {
        filename: 'old.log',
        status: 'removed',
        triage_summary: 'looked at the log',
        r2_key: 'removed-secret',
      },
    ],
  };
}

function nestedDetailPayload() {
  const now = Date.now();
  return {
    ticket: { id: 'REQ_NESTED', subject: 'need help', status: 'proposed', updated_at: now },
    messages: [
      {
        author_kind: 'human',
        content: 'first',
        created_at: now,
        attachments: [{
          filename: 'shot.png',
          status: 'pending',
          r2_key: 'secret-r2-key',
          url: 'https://download.example/file',
          download_url: '/api/services/tickets/REQ_NESTED/attachments/download',
          storage_id: 'secret-storage-id',
        }],
      },
      { author_kind: 'operator', content: 'second', created_at: now },
      {
        author_kind: 'agent',
        content: 'third',
        created_at: now,
        attachments: [{
          filename: 'trace.log',
          status: 'removed',
          triage_summary: 'looked at the log',
          r2_key: 'removed-secret',
        }],
      },
      { author_kind: 'anonymous', content: 'fourth', created_at: now },
    ],
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
