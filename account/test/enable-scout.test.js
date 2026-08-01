import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { makeTestEnv, resetDb, seedAccount, seedSession } from './helpers.js';

describe('/enable/scout', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('returns the terminal page to an anonymous visitor without a nonce', async () => {
    const response = await worker.fetch(
      new Request('https://services.solstone.app/enable/scout'),
      makeTestEnv()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.text()).resolves.toContain('<h1>scout</h1>');
  });

  it('links to scout without forms, buttons, provisioning, providers, or keys', async () => {
    const response = await worker.fetch(
      new Request('https://services.solstone.app/enable/scout'),
      makeTestEnv()
    );
    const body = await response.text();

    expect(body).toContain('scout is the tester program. approved scouts can enable complimentary confidential processing from the journal and share feedback that helps shape solstone.');
    expect(body).toContain('<a href="/scout">open scout</a>');
    expect(body).not.toContain('<form');
    expect(body).not.toContain('<button');
    expect(body).not.toMatch(/provision|provider|google|\bkeys?\b/i);
  });

  it('returns the same page to a signed-in visitor', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const anonymous = await worker.fetch(
      new Request('https://services.solstone.app/enable/scout'),
      testEnv
    );
    const signedIn = await worker.fetch(
      new Request('https://services.solstone.app/enable/scout', {
        headers: { Cookie: session.cookie },
      }),
      testEnv
    );

    expect(signedIn.status).toBe(200);
    expect(await signedIn.text()).toBe(await anonymous.text());
  });

  it('returns not found for the removed confirm route', async () => {
    const response = await worker.fetch(
      new Request('https://services.solstone.app/enable/scout/confirm', {
        method: 'POST',
        headers: { Origin: 'https://services.solstone.app' },
      }),
      makeTestEnv()
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('Location')).toBeNull();
  });
});
