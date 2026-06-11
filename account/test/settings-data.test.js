import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { encryptEmail } from '../src/crypto.js';
import {
  makeTestEnv,
  resetDb,
  seedAccount,
  seedAccountEmail,
  seedCredential,
  seedSession,
} from './helpers.js';

const SAFARI_MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';

describe('settings transparency data view', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  it('renders account, all emails, all passkeys, and all sessions including revoked', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'primary@example.com', nowMs: 1_000, testEnv });
    const current = await seedSession(account.accountId, { testEnv });
    const revoked = await seedSession(account.accountId, { testEnv });
    await workerEnv.DB
      .prepare('UPDATE sessions SET revoked_at = ?, last_ip_encrypted = ?, last_user_agent = ? WHERE id_hash = ?')
      .bind(4_000, await encryptEmail('198.51.100.42', testEnv), 'Mozilla/5.0 Firefox/124.0', revoked.idHash)
      .run();
    await seedAccountEmail({
      accountId: account.accountId,
      address: 'secondary@example.com',
      verifiedAt: 5_000,
      testEnv,
    });
    await seedAccountEmail({
      accountId: account.accountId,
      address: 'unverified@example.com',
      code: '123456',
      expiresAt: Date.now() + 600_000,
      testEnv,
    });
    await seedCredential({ accountId: account.accountId, credentialId: 'active-credential', createdAt: 6_000 });
    await seedCredential({ accountId: account.accountId, credentialId: 'revoked-credential', createdAt: 7_000 });
    await workerEnv.DB
      .prepare('UPDATE passkey_credentials SET revoked_at = ?, aaguid = ? WHERE credential_id = ?')
      .bind(8_000, 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd', 'revoked-credential')
      .run();

    const response = await worker.fetch(settingsRequest('/transparency', {
      cookie: current.cookie,
      ip: '73.225.42.18',
      userAgent: SAFARI_MAC_UA,
    }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toContain(account.accountId);
    expect(body).toContain('created 1970-01-01');
    expect(body).toContain('<div class="lbl">signed in as</div>');
    expect(body).toContain('<div class="who">primary@example.com</div>');
    expect(body).toContain('primary@example.com');
    expect(body).toContain('secondary@example.com');
    expect(body).toContain('unverified@example.com');
    expect(body).toContain('active-credential');
    expect(body).toContain('revoked-credential');
    expect(body).toContain('icloud keychain');
    expect(body).toContain('revoked 1970-01-01');
    expect(body).toContain('safari on macos');
    expect(body).toContain('73.225.42.x');
    expect(body).toContain('firefox on device');
    expect(body).toContain('198.51.100.x');
  });

  it('renders the prose data-covenant intro, citations, and back link', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(settingsRequest('/transparency', { cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(body).toContain('<title>data transparency</title>');
    expect(body).toContain('<h1>data transparency</h1>');
    expect(body).toContain('your name, your phone, your address, or where you are');
    expect(body).toContain("these aren't promises — they're structural commitments under");
    expect(body).toContain('Article 8 of our articles of incorporation');
    expect(body).toContain('Article III of the bylaws');
    expect(body).toContain('href="https://solpbc.org/articles#s8-3"');
    expect(body).toContain('href="https://solpbc.org/bylaws#art-3"');
    expect(body).toContain('<a class="back" href="/">');
    expect(body).not.toContain("what we don't have");
  });

  it('renders anonymous transparency without a signed-in menu', async () => {
    const testEnv = makeTestEnv();

    const response = await worker.fetch(settingsRequest('/transparency', { cookie: '' }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<h1>data transparency</h1>');
    expect(body).toContain('href="https://solpbc.org/articles#s8-3"');
    expect(body).toContain('href="https://solpbc.org/bylaws#art-3"');
    expect(body).toContain("we don't have anything about you");
    expect(body).toContain('sign in to manage your services');
    expect(body).toContain('class="brandbar"');
    expect(body).toContain('href="/support"');
    expect(body).not.toContain('signed in as');
  });

  it('continues rendering when email or IP decrypt fails with scrubbed logs', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'ok@example.com', testEnv });
    const current = await seedSession(account.accountId, { testEnv });
    const badSession = await seedSession(account.accountId, { testEnv });
    const badEmail = await seedAccountEmail({
      accountId: account.accountId,
      address: 'bad@example.com',
      verifiedAt: Date.now(),
      testEnv,
    });
    await seedAccountEmail({
      accountId: account.accountId,
      address: 'still-renders@example.com',
      verifiedAt: Date.now(),
      testEnv,
    });
    await workerEnv.DB
      .prepare('UPDATE account_emails SET address_encrypted = ? WHERE id = ?')
      .bind('not-valid-ciphertext', badEmail.id)
      .run();
    await workerEnv.DB
      .prepare('UPDATE sessions SET last_ip_encrypted = ? WHERE id_hash = ?')
      .bind('not-valid-ciphertext', badSession.idHash)
      .run();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await worker.fetch(settingsRequest('/transparency', { cookie: current.cookie }), testEnv);
    const body = await response.text();
    const calls = warn.mock.calls.map((call) => call[0]);

    expect(response.status).toBe(200);
    expect(body).toContain('&lt;decrypt failed&gt;');
    expect(body).toContain('still-renders@example.com');
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.includes('transparency_decrypt_failed'))).toBe(true);
    expect(calls.some((call) => call.includes(`"kind":"address"`))).toBe(true);
    expect(calls.some((call) => call.includes(`"kind":"ip"`))).toBe(true);
    expect(calls.join('\n')).not.toContain('bad@example.com');
    expect(calls.join('\n')).not.toContain('not-valid-ciphertext');
  });

  it('does not log PII during a normal transparency render', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'quiet@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedCredential({ accountId: account.accountId, credentialId: 'quiet-credential' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const response = await worker.fetch(settingsRequest('/transparency', {
      cookie: session.cookie,
      ip: '203.0.113.9',
    }), testEnv);
    await response.text();
    const logged = [...warn.mock.calls, ...error.mock.calls, ...log.mock.calls].flat().join('\n');

    expect(response.status).toBe(200);
    expect(logged).not.toContain('quiet@example.com');
    expect(logged).not.toContain('203.0.113.9');
    expect(logged).not.toContain('quiet-credential');
    expect(logged).not.toMatch(/token|hash|session/i);
  });

  it('renders under roughly 50KB for many rows', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    for (let i = 0; i < 30; i++) {
      await seedAccountEmail({
        accountId: account.accountId,
        address: `many-${i}@example.com`,
        verifiedAt: Date.now(),
        testEnv,
      });
      await seedCredential({ accountId: account.accountId, credentialId: `many-credential-${i}` });
      await seedSession(account.accountId, { testEnv });
    }

    const response = await worker.fetch(settingsRequest('/transparency', { cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body.length).toBeLessThan(50_000);
  });
});

function settingsRequest(path, {
  cookie,
  ip = '203.0.113.77',
  userAgent = 'Mozilla/5.0 Firefox/124.0',
} = {}) {
  return new Request(`https://services.solstone.app${path}`, {
    headers: {
      Cookie: cookie,
      'CF-Connecting-IP': ip,
      'User-Agent': userAgent,
    },
  });
}
