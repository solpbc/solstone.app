import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { makeTestEnv, resetDb } from './helpers.js';

describe('landing page', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('renders the services landing copy, OTP form, passkey slot, and disclosure', async () => {
    const response = await worker.fetch(new Request('https://services.solstone.app/?signin'), makeTestEnv());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<span class="wordmark">solstone</span>');
    expect(body).toContain('<h1>your services</h1>');
    expect(body).toContain("sign in to manage the optional services you've turned on.");
    expect(body).toContain('<div id="passkey-error" class="error" hidden></div>');
    expect(body).toContain('form method="post" action="/signin/start"');
    expect(body).toContain('autocomplete="email webauthn"');
    expect(body).toContain('placeholder="you@example.com"');
    expect(body).toContain('maxlength="254"');
    expect(body).toContain('no analytics, no tracking, no third parties.');
    expect(body).toContain('/passkey/auth/start');
    expect(body).toContain('passkey sign-in failed. use your email instead.');
  });
});

describe('robots.txt and noindex', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('serves a sol-pbc-authored robots.txt that leaves /support crawlable', async () => {
    const response = await worker.fetch(new Request('https://services.solstone.app/robots.txt'), makeTestEnv());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/plain');
    expect(body).toContain('User-agent: *');
    expect(body).toContain('Disallow: /sign-in');
    expect(body).not.toContain('Disallow: /support');
    expect(body).not.toContain('As a condition of accessing this website');
  });

  it('does not noindex the public catalog', async () => {
    const response = await worker.fetch(new Request('https://services.solstone.app/'), makeTestEnv());
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Robots-Tag')).toBeNull();
  });

  it('sends X-Robots-Tag noindex on the sign-in landing', async () => {
    const response = await worker.fetch(new Request('https://services.solstone.app/?signin'), makeTestEnv());
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
  });

  it('sends X-Robots-Tag noindex on the support sign-in redirect', async () => {
    const response = await worker.fetch(
      new Request('https://services.solstone.app/support', { redirect: 'manual' }),
      makeTestEnv(),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
  });
});
