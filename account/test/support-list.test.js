import { env as workerEnv } from 'cloudflare:test';
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

describe('support list', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  it('reads the stable owner first, then discovers legacy rows sequentially and merges by newest update', async () => {
    let activeReads = 0;
    let activeReadsAtOnce = 0;
    let maximumActiveReadsAtOnce = 0;
    const support = makeSupportWorker({
      'GET /api/services/tickets': async ({ request }) => {
        activeReadsAtOnce += 1;
        maximumActiveReadsAtOnce = Math.max(maximumActiveReadsAtOnce, activeReadsAtOnce);
        activeReads += 1;
        await Promise.resolve();
        activeReadsAtOnce -= 1;
        const email = request.headers.get('X-Verified-Email');
        if (!email) return json({ tickets: [{ id: 'REQ_OWNER', subject: 'owner request', status: 'open', updated_at: 1_700_000_005_000 }] });
        if (email === 'primary@example.com') {
          return json({ tickets: [
            { id: 'REQ_A', subject: 'primary newer', status: 'waiting', updated_at: 1_700_000_010_000 },
            { id: 'REQ_DUP', subject: 'primary wins', status: 'open', updated_at: 1_700_000_000_000 },
          ] });
        }
        return json({ tickets: [
          { id: 'REQ_B', subject: 'secondary newest', status: 'in-progress', updated_at: '2023-11-14T22:13:40.000Z' },
          { id: 'REQ_DUP', subject: 'secondary duplicate', status: 'resolved', updated_at: 1_700_000_050_000 },
        ] });
      },
      'GET /api/services/tickets/closed': () => json({ tickets: [], next_cursor: null }),
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { session } = await signedInAccount(testEnv);
    await seedAccountEmail({
      accountId: session.accountId,
      address: 'secondary@example.com',
      verifiedAt: Date.now(),
      testEnv,
    });
    await seedAccountEmail({
      accountId: session.accountId,
      address: 'unverified@example.com',
      verifiedAt: null,
      testEnv,
    });

    const response = await worker.fetch(get('/support', session.cookie), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toContain('<h1>your support</h1>');
    expect(body.indexOf('secondary newest')).toBeLessThan(body.indexOf('primary newer'));
    // §9 replaced first-seen merge with newest valid updated_at wins.
    expect(body).toContain('secondary duplicate');
    expect(body).not.toContain('primary wins');
    expect(body).toContain('waiting on you');
    expect(body).toContain('in progress');
    expect(body).toContain('updated ');
    const active = support.requests.filter((request) => request.pathname === '/api/services/tickets');
    // §9 replaces email-only fanout with a stable-owner read before legacy discovery.
    expect(active.map((request) => request.headers.verifiedEmail)).toEqual([
      null,
      'primary@example.com',
      'secondary@example.com',
    ]);
    expect(active[0].headers.hasVerifiedEmail).toBe(false);
    expect(active.slice(1).every((request) => request.headers.hasVerifiedEmail)).toBe(true);
    expect(active.every((request) => request.headers.ownerId === session.accountId)).toBe(true);
    expect(maximumActiveReadsAtOnce).toBe(1);
    expect(activeReads).toBe(3);
    expect(support.requests.some((request) => request.pathname === '/api/services/tickets/closed')).toBe(true);
    expect(active.map((request) => request.headers.verifiedEmail)).not.toContain('unverified@example.com');
  });

  it('renders the exact empty state and open-request form when no requests load', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets': () => json({ tickets: [] }),
      'GET /api/services/tickets/closed': () => json({ tickets: [], next_cursor: null }),
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { session } = await signedInAccount(testEnv);

    const response = await worker.fetch(get('/support', session.cookie), testEnv);
    const body = await response.text();

    expect(body).toContain('no open requests. need help? open one below, or sol can file one for you.');
    expect(body).toContain('open a request');
    expect(body).toContain("tell us what's going on. you can attach screenshots or logs here. it's easier than email.");
    expect(body).toContain("what's going on?");
    expect(body).toContain('the details');
    expect(body).toContain('which product?');
    expect(body).toContain('optional screenshots/logs');
  });

  it('shows a partial notice when one list call fails or a verified email cannot decrypt', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets': ({ request }) => {
        if (request.headers.get('X-Verified-Email') === 'secondary@example.com') {
          return new Response(JSON.stringify({ error: 'nope' }), { status: 500 });
        }
        return json({ tickets: [{ id: 'REQ_OK', subject: 'loaded request', status: 'open', updated_at: Date.now() }] });
      },
      'GET /api/services/tickets/closed': () => json({ tickets: [], next_cursor: null }),
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { session } = await signedInAccount(testEnv);
    await seedAccountEmail({
      accountId: session.accountId,
      address: 'secondary@example.com',
      verifiedAt: Date.now(),
      testEnv,
    });
    const bad = await seedAccountEmail({
      accountId: session.accountId,
      address: 'bad@example.com',
      verifiedAt: Date.now(),
      testEnv,
    });
    await workerEnv.DB
      .prepare('UPDATE account_emails SET address_encrypted = ? WHERE id = ?')
      .bind('not-valid-ciphertext', bad.id)
      .run();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await worker.fetch(get('/support', session.cookie), testEnv);
    const body = await response.text();

    expect(body).toContain('loaded request');
    expect(body).toContain('some support history could not be loaded.');
    expect(support.requests.filter((request) => request.pathname === '/api/services/tickets')).toHaveLength(3);
  });

  it('shows a total load failure when all list calls fail', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets': () => new Response(JSON.stringify({ error: 'down' }), { status: 500 }),
      'GET /api/services/tickets/closed': () => json({ tickets: [], next_cursor: null }),
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { session } = await signedInAccount(testEnv);

    const response = await worker.fetch(get('/support', session.cookie), testEnv);
    const body = await response.text();

    expect(body).toContain("we couldn't load active requests. try again.");
    expect(body).not.toContain('no open requests.');
  });

  it('keeps the owner-scoped read available without a usable verified email', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets': ({ request }) => {
        expect(request.headers.has('X-Verified-Email')).toBe(false);
        return json({ tickets: [{ id: 'REQ_OWNER', subject: 'owner request', status: 'open', updated_at: Date.now() }] });
      },
      'GET /api/services/tickets/closed': () => json({ tickets: [], next_cursor: null }),
    });
    const noEmailEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { session } = await signedInAccount(noEmailEnv);
    await workerEnv.DB
      .prepare('UPDATE account_emails SET verified_at = NULL WHERE account_id = ?')
      .bind(session.accountId)
      .run();

    const noEmail = await worker.fetch(get('/support', session.cookie), noEmailEnv);
    const noEmailBody = await noEmail.text();
    // §9 keeps stable-owner reads available; only opening and legacy discovery need an email.
    expect(noEmailBody).toContain('owner request');
    expect(noEmailBody).toContain('we need a verified email before you can open a request.');
    expect(support.requests.filter((request) => request.pathname === '/api/services/tickets')).toHaveLength(1);

    const missingBindingEnv = makeTestEnv();
    const withBindingMissing = await seedAccount({ email: 'missing-binding@example.com', testEnv: missingBindingEnv });
    const missingSession = await seedSession(withBindingMissing.accountId, { testEnv: missingBindingEnv });
    const missing = await worker.fetch(get('/support', missingSession.cookie), missingBindingEnv);
    expect(await missing.text()).toContain("we couldn't load active requests. try again.");
  });

  it('renders active and closed failures independently while keeping the create form', async () => {
    const activeFailure = makeSupportWorker({
      'GET /api/services/tickets': () => new Response('down', { status: 500 }),
      'GET /api/services/tickets/closed': () => json({ tickets: [tombstone('REQ_CLOSED')], next_cursor: null }),
    });
    const activeEnv = makeTestEnv({ SUPPORT_WORKER: activeFailure });
    const { session: activeSession } = await signedInAccount(activeEnv);
    const activeResponse = await worker.fetch(get('/support', activeSession.cookie), activeEnv);
    const activeBody = await activeResponse.text();
    expect(activeBody).toContain("we couldn't load active requests. try again.");
    expect(activeBody).toContain('request #REQ_CLOSED');
    expect(activeBody).toContain('open a request');

    const closedFailure = makeSupportWorker({
      'GET /api/services/tickets': () => json({ tickets: [{ id: 'REQ_ACTIVE', subject: 'still open', status: 'open', updated_at: Date.now() }] }),
      'GET /api/services/tickets/closed': () => new Response('down', { status: 500 }),
    });
    const closedEnv = makeTestEnv({ SUPPORT_WORKER: closedFailure });
    const { session: closedSession } = await signedInAccount(closedEnv);
    const closedResponse = await worker.fetch(get('/support', closedSession.cookie), closedEnv);
    const closedBody = await closedResponse.text();
    expect(closedBody).toContain('still open');
    expect(closedBody).toContain("we couldn't load closed requests. try again.");
    expect(closedBody).toContain('open a request');
  });
});

async function signedInAccount(testEnv) {
  const account = await seedAccount({ email: 'primary@example.com', testEnv });
  const session = await seedSession(account.accountId, { testEnv });
  return { account, session: { ...session, accountId: account.accountId } };
}

function get(path, cookie) {
  return new Request(`https://services.solstone.app${path}`, {
    headers: { Cookie: cookie },
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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
