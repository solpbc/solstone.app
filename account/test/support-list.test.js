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

  it('fans out across usable verified emails, merges by id, sorts by updated_at, and sends required headers', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets': ({ request }) => {
        const email = request.headers.get('X-Verified-Email');
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
    expect(body).toContain('primary wins');
    expect(body).not.toContain('secondary duplicate');
    expect(body).toContain('waiting on you');
    expect(body).toContain('in progress');
    expect(body).toContain('updated ');
    expect(support.requests.map((request) => request.pathname)).toEqual([
      '/api/services/tickets',
      '/api/services/tickets',
    ]);
    expect(support.requests.map((request) => request.headers.verifiedEmail)).toEqual([
      'primary@example.com',
      'secondary@example.com',
    ]);
    expect(support.requests.every((request) => request.headers.servicesAuth === 'test-services-auth-token')).toBe(true);
    expect(support.requests.every((request) => request.headers.verifiedEmailCount === 1)).toBe(true);
    expect(support.requests.map((request) => request.headers.verifiedEmail)).not.toContain('unverified@example.com');
  });

  it('renders the exact empty state and open-request form when no requests load', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets': () => json({ tickets: [] }),
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { session } = await signedInAccount(testEnv);

    const response = await worker.fetch(get('/support', session.cookie), testEnv);
    const body = await response.text();

    expect(body).toContain('no open requests. need help? open one below — or your solstone keeper can file one for you.');
    expect(body).toContain('open a request');
    expect(body).toContain("tell us what's going on. you can attach screenshots or logs here — it's easier than email.");
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
    expect(support.requests).toHaveLength(2);
  });

  it('shows a total load failure when all list calls fail', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets': () => new Response(JSON.stringify({ error: 'down' }), { status: 500 }),
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { session } = await signedInAccount(testEnv);

    const response = await worker.fetch(get('/support', session.cookie), testEnv);
    const body = await response.text();

    expect(body).toContain("we couldn't load your support right now. try again soon.");
    expect(body).not.toContain('no open requests.');
  });

  it('fails closed without calling support when there are no usable verified emails or no binding', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets': () => json({ tickets: [] }),
    });
    const noEmailEnv = makeTestEnv({ SUPPORT_WORKER: support });
    const { session } = await signedInAccount(noEmailEnv);
    await workerEnv.DB
      .prepare('UPDATE account_emails SET verified_at = NULL WHERE account_id = ?')
      .bind(session.accountId)
      .run();

    const noEmail = await worker.fetch(get('/support', session.cookie), noEmailEnv);
    expect(await noEmail.text()).toContain("we couldn't load your support right now. try again soon.");
    expect(support.requests).toHaveLength(0);

    const missingBindingEnv = makeTestEnv();
    const withBindingMissing = await seedAccount({ email: 'missing-binding@example.com', testEnv: missingBindingEnv });
    const missingSession = await seedSession(withBindingMissing.accountId, { testEnv: missingBindingEnv });
    const missing = await worker.fetch(get('/support', missingSession.cookie), missingBindingEnv);
    expect(await missing.text()).toContain("we couldn't load your support right now. try again soon.");
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
