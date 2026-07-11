import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { makeTestEnv, resetDb, seedAccount, seedEntitlement, seedSession } from './helpers.js';

describe('service landing pages', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('renders the private network landing page', async () => {
    const response = await get('/private-network', makeTestEnv());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<h1>private network</h1>');
    expect(body).toContain('<p class="hero-tag">your private network</p>');
    expect(body).toContain('you never have to pay us');
    expect(body).toContain('href="/?signin"');
  });

  it('renders the backup landing page', async () => {
    const response = await get('/backup', makeTestEnv());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<h1>encrypted backup</h1>');
    expect(body).toContain('keep an encrypted copy of your journal somewhere safe');
    expect(body).toContain('sign in to enable');
    expect(body).toContain('$48');
  });

  it('renders the notifications landing page without a CTA button', async () => {
    const response = await get('/notifications', makeTestEnv());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<h1>notifications</h1>');
    expect(body).toContain('<p class="hero-tag">built in</p>');
    expect(body).toContain('turn on notifications on each device you want to hear from.');
    expect(body).not.toMatch(/class="btn/);
  });

  it('renders the sealed container landing page without a CTA button', async () => {
    const response = await get('/sealed-container', makeTestEnv());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<h1>sealed container</h1>');
    expect(body).toContain('<span class="tag soon">coming soon</span>');
    expect(body).toContain('this isn’t available yet. pricing at launch.');
    expect(body).not.toMatch(/class="btn/);
    expect(body).not.toContain('notify');
  });

  it('renders the confidential processing landing page without a CTA button', async () => {
    const response = await get('/confidential-processing', makeTestEnv());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<h1>confidential processing</h1>');
    expect(body).toContain('no content is retained · no human reviews it · nothing is used to train');
    expect(body).toContain('let sol think off your device — on confidential hardware sol pbc runs that keeps nothing.');
    expect(body).toContain('sol sends <a href="/confidential-processing/data">only the thinking off your device</a> — never your journal, which stays here on your computer. it runs on confidential hardware sol pbc operates — a model sol pbc runs itself, with no third-party AI provider in the path.');
    expect(body).toContain('href="/confidential-processing/data"');
    expect(body).toContain('the hardware sol pbc operates');
    expect(body).toContain("runs on confidential cloud hardware sol pbc operates — the host is sealed out of what's processed, and your journal verifies that seal before it sends.");
    expect(body).toContain('your journal does the checking');
    expect(body).toContain('<span class="tag soon">coming soon</span>');
    expect(body).not.toMatch(/class="btn/);
    expect(body).not.toContain('$');
    expect(body).not.toContain('sealed engine');
    expect(body).not.toContain('never sees');
  });

  it('renders enabled confidential processing management without billing controls', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedEntitlement({
      accountId: account.accountId,
      service: 'spp_hosted',
      status: 'active',
      source: 'comp',
    });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await get('/confidential-processing', testEnv, { Cookie: session.cookie });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toContain('confidential processing is on for this journal');
    expect(body).toContain('enabled — your journal verifies the engine each time it sends');
    expect(body).not.toContain('$');
    expect(body).not.toContain('never sees');
    expect(body).not.toMatch(/class="btn/);
  });

  it('keeps the public confidential processing catalog row free of pricing and forbidden claims', async () => {
    const response = await get('/', makeTestEnv());
    const body = await response.text();
    const match = body.match(/<a class="row" href="\/confidential-processing"[\s\S]*?<\/a>/);

    expect(match).not.toBeNull();
    const row = match?.[0] || '';
    expect(row).not.toContain('$');
    expect(row).not.toContain('never sees');
  });

  it('renders the public scout landing page when signed out', async () => {
    const response = await get('/scout', makeTestEnv());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<h1>solstone scout</h1>');
    expect(body).toContain('join the solstone alpha');
    expect(body).toContain('request access');
    expect(body).toContain('your questions to sol go straight to Google Gemini under Google’s terms.');
  });

  it('renders the scout management page when signed in', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const response = await get('/scout', testEnv, { Cookie: session.cookie });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('href="https://solstone.app/releases"');
    expect(body).toContain('share feedback');
    expect(body).not.toContain('join the solstone alpha');
  });
});

function get(path, env, headers = {}) {
  return worker.fetch(new Request(`https://services.solstone.app${path}`, { headers }), env);
}
