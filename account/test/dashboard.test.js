import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { makeTestEnv, resetDb, seedAccount, seedSession } from './helpers.js';

describe('services catalog rendering', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  it('renders account email, last sign-in, catalog rows, and sign-out form', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'dash@example.com', testEnv, nowMs: Date.now() - 60_000 });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(dashboardRequest(session.cookie), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toContain('<h1>your services</h1>');
    expect(body).toContain('<div class="lbl">signed in as</div>');
    expect(body).toContain('<div class="who">dash@example.com</div>');
    expect(body).toContain('last sign-in 1 minute ago');
    expect(body).toContain('your journal is always private, only yours.');
    expect(body).toContain('href="/private-network"');
    expect(body).toContain('<div class="title">private network</div>');
    expect(body).toContain('href="/backup"');
    expect(body).toContain('<div class="title">encrypted backup</div>');
    expect(body).toContain('href="/notifications"');
    expect(body).toContain('<div class="title">notifications</div>');
    expect(body).toContain('href="/sealed-container"');
    expect(body).toContain('<div class="title">sealed container</div>');
    expect(body).toContain('href="/confidential-processing"');
    expect(body).toContain('<div class="title">confidential processing</div>');
    expect(body).toContain('href="/scout"');
    expect(body).toContain('<div class="title">scout</div>');
    expect(body).toContain('href="/sign-in"');
    expect(body).toContain('<div class="title">your sign-in</div>');
    expect(body).toContain('href="/transparency"');
    expect(body).toContain('<div class="title">data transparency</div>');
    expect(body).toContain('<span class="pill off"><span class="dot"></span>off</span>');
    expect(body).not.toContain('not set up');
    expect(body).toContain('href="https://solpbc.org/privacy"');
    expect(body).toContain('how we earn your trust');
    expect(body).toContain('<a href="/sign-in">manage sign-in</a>');
    expect(body).toContain('<form method="post" action="/signout">');
  });

  it('renders the welcome passkey panel when requested OR when no passkey is enrolled', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    // No passkey yet → panel shows on bare / so the owner has a
    // discoverable path to enroll (otherwise existing-session owners who
    // signed in pre-passkey have no way to reach the affordance).
    const beforeEnroll = await worker.fetch(dashboardRequest(session.cookie), testEnv);
    const beforeBody = await beforeEnroll.text();
    expect(beforeBody).toContain('id="passkey-add"');
    expect(beforeBody).toContain('set up a passkey for next time');

    // Welcome=1 still works regardless of passkey state.
    const welcome = await worker.fetch(dashboardRequest(session.cookie, '/?welcome=1'), testEnv);
    const welcomeBody = await welcome.text();
    expect(welcomeBody).toContain('id="passkey-friendly-name"');
    expect(welcomeBody).toContain('id="passkey-add"');
    expect(welcomeBody).toContain('id="passkey-skip"');
    expect(welcomeBody).toContain('/passkey/register/start');

    // Insert an active passkey row → panel hides on bare /.
    await workerEnv.DB
      .prepare(
        `INSERT INTO passkey_credentials (credential_id, account_id, public_key, counter, aaguid, transports, backup_eligible, backup_state, friendly_name, created_at, last_used_at, revoked_at)
         VALUES (?, ?, 'pk', 0, NULL, NULL, 0, 0, NULL, ?, NULL, NULL)`
      )
      .bind('cred-1', account.accountId, Date.now())
      .run();

    const afterEnroll = await worker.fetch(dashboardRequest(session.cookie), testEnv);
    const afterBody = await afterEnroll.text();
    expect(afterBody).not.toContain('id="passkey-add"');
  });

  it('keeps services catalog and sign-out available when email decrypt fails', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await workerEnv.DB
      .prepare('UPDATE account_emails SET address_encrypted = ? WHERE account_id = ?')
      .bind('not-valid-base64', account.accountId)
      .run();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await worker.fetch(dashboardRequest(session.cookie), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("we couldn't decrypt your email address. you're still signed in.");
    expect(body).toContain('<form method="post" action="/signout">');
    expect(spy).toHaveBeenCalledWith('menu_decrypt_failed');
  });
});

function dashboardRequest(cookie, path = '/') {
  return new Request(`https://services.solstone.app${path}`, {
    headers: { Cookie: cookie },
  });
}
