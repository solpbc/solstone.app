import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import {
  makeTestEnv,
  resetDb,
  seedAccount,
  seedDevice,
  seedEntitlement,
  seedSession,
} from './helpers.js';

describe('services catalog', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('renders the public catalog at the root without redirecting to sign-in', async () => {
    const response = await worker.fetch(new Request('https://services.solstone.app/'), makeTestEnv());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.status).toBeLessThan(300);
    expect(body).toContain('solstone services');
    for (const name of ['private network', 'encrypted backup', 'notifications', 'sealed container', 'scout']) {
      expect(body).toContain(name);
    }
    expect(body).toContain('$20');
    expect(body).toContain('free · byo');
    expect(body).toContain('built in');
    expect(body).toContain('coming');
    expect(body).toContain('your journal is always private, only yours.');
    expect(body).toContain('href="/?signin"');
    expect(body).toContain('no analytics, no tracking, no third parties. sign in only to manage what you’ve turned on');
    expect(body).toContain('href="/transparency"');
    expect(body).not.toContain('action="/signin/start"');
  });

  it('renders the signed-in catalog with no-store, account rows, and active service signals', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedEntitlement({ accountId: account.accountId, service: 'spl_hosted', status: 'active' });
    await seedDevice({ accountId: account.accountId });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(catalogRequest(session.cookie), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toContain('your services');
    expect(body).toContain('class="pill');
    expect(body).toContain('href="/sign-in"');
    expect(body).toContain('href="/transparency"');
    expect(body).toMatch(/href="\/private-network"[\s\S]*?<span class="pill on"><span class="dot"><\/span>on<\/span>/);
    expect(body).toMatch(/href="\/notifications"[\s\S]*?<span class="pill on"><span class="dot"><\/span>on<\/span>/);
    expect(body).not.toContain('last seen');
  });

  it('renders the sign-in form at /?signin', async () => {
    const response = await worker.fetch(new Request('https://services.solstone.app/?signin'), makeTestEnv());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('action="/signin/start"');
  });
});

function catalogRequest(cookie) {
  return new Request('https://services.solstone.app/', {
    headers: { Cookie: cookie },
  });
}
