import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import {
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedSession,
} from './helpers.js';

describe('terms page', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('serves the combined services Terms at /terms without a session', async () => {
    const testEnv = makeTestEnv();
    const response = await get('/terms', testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(body).toContain('<h1>solstone services · terms</h1>');
    expect(body).toContain('part one · what applies to everything');
    expect(body).toContain('part two · each service, one at a time');
    expect(body).toContain('<hr>');
    expect(body).toContain('effective October 1, 2026');
    expect(body).toContain('ordinary HTTPS does not technically prevent that.');
    expect(body).not.toContain('[ship date]');
    expect(body).not.toMatch(/<p>[^<]*---[^<]*<\/p>/);
    expect(body).not.toMatch(/\*\*/);
    expect(body).not.toContain('](');
  });

  // These must keep pointing at /terms, the combined Terms — not a redirect alias.
  // The subscribe surface previously carried no contract link of its own and reached
  // /terms only through the shared footer, so repointing that footer stranded it.
  it('links to the private network terms from its own subscribe and active surfaces', async () => {
    const testEnv = makeTestEnv();
    const subscribeAccount = await seedAccount({ email: 'terms-subscribe@example.com', testEnv });
    const subscribeSession = await seedSession(subscribeAccount.accountId, { testEnv });
    const subscribeResponse = await get('/private-network', testEnv, subscribeSession.cookie);
    const subscribeBody = await subscribeResponse.text();

    expect(subscribeBody).toContain('href="/terms"');

    const activeAccount = await seedAccount({ email: 'terms-active@example.com', testEnv });
    const activeSession = await seedSession(activeAccount.accountId, { testEnv });
    await seedEntitlement({ accountId: activeAccount.accountId, status: 'active' });
    const activeResponse = await get('/private-network', testEnv, activeSession.cookie);
    const activeBody = await activeResponse.text();

    expect(activeBody).toContain('href="/terms"');
  });

  it('points the shared footer at the combined Terms', async () => {
    const testEnv = makeTestEnv();
    const response = await get('/', testEnv);
    const body = await response.text();

    expect(body).toContain('<a href="/terms">terms</a>');
    expect(body).not.toContain('<a href="/legal">terms</a>');
  });

  it('points the generic scout and notifications links at the combined Terms', async () => {
    const testEnv = makeTestEnv();

    const scoutBody = await (await get('/scout', testEnv)).text();
    expect(scoutBody).toContain('<a href="/terms">terms</a>');
    expect(scoutBody).not.toContain('<a href="/legal">terms</a>');

    const notificationsBody = await (await get('/notifications', testEnv)).text();
    expect(notificationsBody).toContain('<a href="/terms">terms</a>');
    expect(notificationsBody).not.toContain('<a href="/legal">terms</a>');
  });

  it('301s every superseded Terms URL to the combined Terms', async () => {
    const testEnv = makeTestEnv();
    const legalResponse = await get('/legal', testEnv);
    expect(legalResponse.status).toBe(301);
    expect(legalResponse.headers.get('Location')).toBe('/terms');

    const backupResponse = await get('/services/backup/terms', testEnv);
    expect(backupResponse.status).toBe(301);
    expect(backupResponse.headers.get('Location')).toBe('/terms');

    const processingResponse = await get('/services/processing/terms', testEnv);
    expect(processingResponse.status).toBe(301);
    expect(processingResponse.headers.get('Location')).toBe('/terms');
  });
});

async function get(path, testEnv, cookie = '') {
  return worker.fetch(new Request(`https://services.solstone.app${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
  }), testEnv);
}
