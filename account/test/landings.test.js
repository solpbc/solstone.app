import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { makeTestEnv, resetDb, rowCount, seedAccount, seedEntitlement, seedSession } from './helpers.js';

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

  it('renders the confidential processing landing page without a CTA button', async () => {
    const response = await get('/confidential-processing', makeTestEnv());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<h1>confidential processing</h1>');
    expect(body).toContain('no content is retained · no human reviews it · nothing is used to train');
    expect(body).toContain('confidential processing extends your compute on confidential hardware sol pbc runs that keeps nothing.');
    expect(body).toContain('confidential processing sends <a href="/confidential-processing/data">your thinking off your device</a>, never your journal, which stays on your computer. it runs on confidential hardware sol pbc operates, using a model sol pbc runs itself with no third-party AI provider in the path.');
    expect(body).toContain('href="/confidential-processing/data"');
    expect(body).toContain("sol pbc's own engine");
    expect(body).toContain("a model sol pbc runs itself, with no third-party AI provider in the path. it runs on confidential GPUs in Microsoft Azure that sol pbc operates, where the hardware boundary keeps the cloud host excluded from what's processed.");
    expect(body).toContain('your journal does the checking');
    expect(body).toContain("your journal must verify the service before anything is sent. if it can't verify, it doesn't send.");
    expect(body).toContain('<span class="tag free">available to approved scouts</span>');
    expect(body).toContain('confidential processing is available to approved scouts. enable it from the journal after approval.');
    expect(body).not.toMatch(/class="btn/);
    expect(body).not.toContain('$');
    expect(body).not.toContain('sealed');
    expect(body).not.toContain("verifies that seal");
    expect(body).not.toContain('checks the hardware before it sends');
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
    expect(body).toContain('confidential processing is available to this sign-in');
    expect(body).toContain('available to enable from your journal');
    expect(body).not.toContain('confidential processing is on for this journal');
    expect(body).not.toContain('enabled for your journal');
    expect(body).toContain('the "transcribe audio on the service" switch lives in the journal\'s thinking app.');
    expect(body).not.toContain('verifies the engine');
    expect(body).not.toContain('$');
    expect(body).not.toContain('never sees');
    expect(body).not.toMatch(/class="btn/);
    await expect(rowCount('spp_bindings')).resolves.toBe(0);
  });

  it('renders confidential-processing eligibility for a sign-in without availability', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await get('/confidential-processing', testEnv, { Cookie: session.cookie });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('confidential processing is not available to this sign-in');
    expect(body).toContain('confidential processing is available to approved scouts. this sign-in is not currently approved.');
    expect(body).toContain('href="/scout">scout</a> to request access.');
    expect(body).toContain('href="/scout">request scout access</a>');
    expect(body).not.toContain("isn't open yet");
    expect(body).not.toContain('early access');
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
    expect(body).toContain('<h1>scout</h1>');
    expect(body).toContain('scout is the tester program. approved scouts can enable confidential processing from the journal and share feedback that helps shape solstone.');
    expect(body).toContain('confidential processing is available to approved scouts. enable it from the journal after approval.');
    expect(body).toContain('your journal does the checking');
    expect(body).toContain("your journal must verify the service before anything is sent. if it can't verify, it doesn't send.");
    expect(body).toContain('free <span class="price"><span class="per">· tester program</span></span>');
    expect(body).toContain('<a class="btn primary" href="/?signin">request scout</a>');
    expect(body).toContain('confidential processing: no content is retained · no human reviews it · nothing is used to train. your journal must verify the service before anything is sent.');
    expect(body.match(/class="beat"/g) || []).toHaveLength(4);
    const beatTitles = [
      'confidential processing',
      'your journal does the checking',
      'kept for nothing',
      'help shape solstone',
    ];
    const beatTitlePositions = beatTitles.map((title) => body.indexOf(`<p class="bt">${title}</p>`));
    expect(beatTitlePositions.every((position) => position >= 0)).toBe(true);
    expect(beatTitlePositions).toEqual([...beatTitlePositions].sort((a, b) => a - b));
    for (const phrase of ['Gemini', 'key', 'never sees', 'never hears']) {
      expect(body).not.toContain(phrase);
    }
    expect(body).not.toContain('invite-only');
    expect(body).not.toContain('alpha');
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
    expect(body).not.toContain('scout is the tester program.');
  });
});

function get(path, env, headers = {}) {
  return worker.fetch(new Request(`https://services.solstone.app${path}`, { headers }), env);
}
