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

  it('serves the public backup terms page without a session', async () => {
    const testEnv = makeTestEnv();
    const response = await get('/services/backup/terms', testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(body).toContain('operated tier of encrypted backup');
  });

  // These must keep pointing at /terms, the private network contract — not the index.
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

  it('serves the public processing terms page without a session', async () => {
    const testEnv = makeTestEnv();
    const response = await get('/services/processing/terms', testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(body).toContain('these terms cover');
    expect(body).toContain('confidential processing');
  });

  it('serves the terms index listing all three service terms', async () => {
    const testEnv = makeTestEnv();
    const response = await get('/legal', testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(body).toContain('href="/terms"');
    expect(body).toContain('href="/services/backup/terms"');
    expect(body).toContain('href="/services/processing/terms"');
    expect(body).toContain('private network');
    expect(body).toContain('encrypted backup');
    expect(body).toContain('confidential processing');
    // The index is navigation, not content: it names each service and links its
    // terms, and says nothing about what any service does, promises, or protects.
    expect(body).not.toMatch(/encrypt(ed|s) (your|the) journal/i);
    expect(body).not.toMatch(/cannot (read|see|hear)/i);
    expect(body).not.toContain('your journal is always private');
  });

  it('points the shared footer at the terms index, not one service contract', async () => {
    const testEnv = makeTestEnv();
    const response = await get('/', testEnv);
    const body = await response.text();

    expect(body).toContain('<a href="/legal">terms</a>');
    expect(body).not.toContain('<a href="/terms">terms</a>');
  });

  it('points the generic scout and notifications links at the terms index', async () => {
    const testEnv = makeTestEnv();

    const scoutBody = await (await get('/scout', testEnv)).text();
    expect(scoutBody).toContain('<a href="/legal">terms</a>');

    const notificationsBody = await (await get('/notifications', testEnv)).text();
    expect(notificationsBody).toContain('<a href="/legal">terms</a>');
  });

  // The combined services Terms (clo/compliance/solstone-services-terms-of-service.md) are
  // staged behind COMBINED_TERMS_LIVE (req_eyreyww2, founder-corrected 2026-09-20: /terms is
  // the permanent path, no transition period) — off by default, so all four paths must keep
  // their current behavior until CLO fills the one remaining masthead date and flips the switch.
  it('keeps /terms, /legal, and the two per-service pages on their current text while COMBINED_TERMS_LIVE is unset', async () => {
    const testEnv = makeTestEnv();

    const termsBody = await (await get('/terms', testEnv)).text();
    expect(termsBody).toContain('these terms cover');
    expect(termsBody).not.toContain('solstone services · terms');

    const legalResponse = await get('/legal', testEnv);
    expect(legalResponse.status).toBe(200);
    expect(await legalResponse.text()).toContain('each of these covers the single service it names as operated by sol pbc.');

    const backupResponse = await get('/services/backup/terms', testEnv);
    expect(backupResponse.status).toBe(200);

    const processingResponse = await get('/services/processing/terms', testEnv);
    expect(processingResponse.status).toBe(200);
  });

  it('serves the combined services Terms at /terms, and 301s /legal and the two per-service pages there, once COMBINED_TERMS_LIVE is "true"', async () => {
    const testEnv = makeTestEnv({ COMBINED_TERMS_LIVE: 'true' });
    const response = await get('/terms', testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(body).toContain('<h1>solstone services · terms</h1>');
    expect(body).toContain('part one · what applies to everything');
    expect(body).toContain('part two · each service, one at a time');
    expect(body).toContain('<hr>');
    // The one masthead date is staged unfilled; this page is not shippable until CLO fills it.
    expect(body).toContain('[ship date]');
    // The generator drops a literal markdown '---' rule, never a visible dash run.
    expect(body).not.toMatch(/<p>[^<]*---[^<]*<\/p>/);
    expect(body).not.toMatch(/\*\*/);
    expect(body).not.toContain('](');

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
