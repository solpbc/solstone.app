import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { makeTestEnv, resetDb, seedAccount, seedSession } from './helpers.js';

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
