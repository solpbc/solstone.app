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

  it('serves the public terms page without a session', async () => {
    const testEnv = makeTestEnv();
    const response = await get('/terms', testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(body).toContain('your subscription renews automatically');
    expect(body).toContain('where the price, the billing interval, and the automatic renewal are shown and you affirmatively agree to them before any charge.');
    expect(body).toContain("sol pbc's total liability for the hosted relay is limited to the fees you paid for it in the 12 months before the claim.");
    expect(body).toContain('the relay has no key to your content and keeps no copy of it.');
    expect(body).toContain('articles of incorporation (Article 8, the Customer Privacy Covenant)');
    expect(body).toContain('generally up to seven years for transaction records');
    expect(body).toContain('https://stripe.com/legal');
    expect(body).toContain('https://stripe.com/privacy');
    expect(body).toContain('https://solpbc.org/privacy');
    expect(body).not.toMatch(/\*\*/);
    expect(body).not.toContain('](');
    expect(body).not.toContain('`');
  });

  it('links to terms from solstone hosted subscribe and active surfaces', async () => {
    const testEnv = makeTestEnv();
    const subscribeAccount = await seedAccount({ email: 'terms-subscribe@example.com', testEnv });
    const subscribeSession = await seedSession(subscribeAccount.accountId, { testEnv });
    const subscribeResponse = await get('/services/spl', testEnv, subscribeSession.cookie);
    const subscribeBody = await subscribeResponse.text();

    expect(subscribeBody).toContain('href="/terms"');

    const activeAccount = await seedAccount({ email: 'terms-active@example.com', testEnv });
    const activeSession = await seedSession(activeAccount.accountId, { testEnv });
    await seedEntitlement({ accountId: activeAccount.accountId, status: 'active' });
    const activeResponse = await get('/services/spl', testEnv, activeSession.cookie);
    const activeBody = await activeResponse.text();

    expect(activeBody).toContain('href="/terms"');
  });

  it('links to terms from the shared footer', async () => {
    const testEnv = makeTestEnv();
    const response = await get('/', testEnv);
    const body = await response.text();

    expect(body).toContain('href="/terms"');
  });
});

async function get(path, testEnv, cookie = '') {
  return worker.fetch(new Request(`https://services.solstone.app${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
  }), testEnv);
}
