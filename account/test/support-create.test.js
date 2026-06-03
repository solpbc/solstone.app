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

describe('support create', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  it('opens a request with the primary verified email and omits category', async () => {
    const support = makeSupportWorker({
      'POST /api/services/tickets': () => json({ id: 'REQ_NEW' }),
      'POST /api/services/tickets/REQ_NEW/attachments': () => json({ ok: true }),
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { account, session } = await signedInAccount(testEnv);
    await seedAccountEmail({
      accountId: account.accountId,
      address: 'secondary@example.com',
      verifiedAt: Date.now(),
      testEnv,
    });
    await seedAccountEmail({
      accountId: account.accountId,
      address: 'unverified@example.com',
      verifiedAt: null,
      testEnv,
    });

    const response = await worker.fetch(createRequest(session.cookie, {
      file: new File(['hello'], 'log.txt', { type: 'text/plain' }),
      email: 'form-supplied@example.com',
    }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("got it — this is request #REQ_NEW. we'll email you at primary@example.com and you can follow it right here.");
    expect(body).toContain('href="/support/REQ_NEW"');
    expect(support.requests[0]).toMatchObject({
      method: 'POST',
      pathname: '/api/services/tickets',
      headers: {
        servicesAuth: 'test-services-auth-token',
        verifiedEmail: 'primary@example.com',
        verifiedEmailCount: 1,
      },
      body: {
        product: 'solstone',
        subject: 'help me',
        description: 'details here',
      },
    });
    expect(support.requests[0].body).not.toHaveProperty('category');
    expect(support.requests[1]).toMatchObject({
      method: 'POST',
      pathname: '/api/services/tickets/REQ_NEW/attachments',
      headers: {
        servicesAuth: 'test-services-auth-token',
        verifiedEmail: 'primary@example.com',
        verifiedEmailCount: 1,
      },
      body: { files: [{ name: 'log.txt', size: 5 }] },
    });
    expect(support.requests.map((request) => request.headers.verifiedEmail)).not.toContain('form-supplied@example.com');
    expect(support.requests.map((request) => request.headers.verifiedEmail)).not.toContain('unverified@example.com');
  });

  it('uses first verified email when the primary row is not verified', async () => {
    const support = makeSupportWorker({
      'POST /api/services/tickets': () => json({ ticket: { id: 'REQ_SECONDARY' } }),
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { account, session } = await signedInAccount(testEnv);
    await testEnv.DB
      .prepare('UPDATE account_emails SET verified_at = NULL WHERE account_id = ?')
      .bind(account.accountId)
      .run();
    await seedAccountEmail({
      accountId: account.accountId,
      address: 'secondary@example.com',
      verifiedAt: Date.now(),
      testEnv,
    });

    const response = await worker.fetch(createRequest(session.cookie), testEnv);
    const body = await response.text();

    expect(body).toContain('REQ_SECONDARY');
    expect(support.requests[0].headers.verifiedEmail).toBe('secondary@example.com');
  });

  it('preserves the created request when attachment upload fails', async () => {
    const support = makeSupportWorker({
      'POST /api/services/tickets': () => json({ id: 'REQ_UPLOAD_FAIL' }),
      'POST /api/services/tickets/REQ_UPLOAD_FAIL/attachments': () => new Response(JSON.stringify({ error: 'down' }), { status: 500 }),
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { session } = await signedInAccount(testEnv);

    const response = await worker.fetch(createRequest(session.cookie, {
      file: new File(['bad'], 'bad.log'),
    }), testEnv);
    const body = await response.text();

    expect(body).toContain('request #REQ_UPLOAD_FAIL');
    expect(body).toContain('your request was opened, but the attachments could not be uploaded.');
    expect(body).toContain('href="/support/REQ_UPLOAD_FAIL"');
  });

  it('does not claim creation when the create call fails', async () => {
    const support = makeSupportWorker({
      'POST /api/services/tickets': () => new Response(JSON.stringify({ error: 'down' }), { status: 500 }),
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { session } = await signedInAccount(testEnv);

    const response = await worker.fetch(createRequest(session.cookie), testEnv);
    const body = await response.text();

    expect(body).toContain("we couldn't open that request. try again.");
    expect(body).not.toContain('got it — this is request');
  });

  it('requires same-origin and a valid csrf token', async () => {
    const testEnv = makeTestEnv({ SUPPORT_WORKER: makeSupportWorker() });
    const { session } = await signedInAccount(testEnv);

    const badOrigin = await worker.fetch(createRequest(session.cookie, { origin: 'https://bad.example' }), testEnv);
    const badCsrf = await worker.fetch(createRequest(session.cookie, { csrf: 'bad' }), testEnv);

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

function createRequest(cookie, {
  origin = 'https://services.solstone.app',
  csrf = TEST_CSRF,
  file = null,
  email = '',
} = {}) {
  const body = new FormData();
  body.set('csrf', csrf);
  body.set('product', 'solstone');
  body.set('subject', 'help me');
  body.set('description', 'details here');
  if (email) body.set('email', email);
  if (file) body.append('file', file);
  return new Request('https://services.solstone.app/support', {
    method: 'POST',
    headers: {
      Origin: origin,
      Cookie: cookie,
    },
    body,
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
