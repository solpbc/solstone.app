import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { makeTestEnv, resetDb } from './helpers.js';

describe('landing page', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('renders the services landing copy, OTP form, passkey slot, and disclosure', async () => {
    const response = await worker.fetch(new Request('https://services.solstone.app/'), makeTestEnv());
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
