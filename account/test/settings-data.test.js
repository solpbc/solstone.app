import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { encryptEmail } from '../src/crypto.js';
import { renderTransparencyRecords } from '../src/html.js';
import { OWNER_DATA_INVENTORY } from '../src/owner-data-inventory.js';
import {
  makeTestEnv,
  resetDb,
  seedAccount,
  seedAccountEmail,
  seedCredential,
  seedSession,
  seedSplBinding,
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
    // Credential id and authenticator id are authentication material the download omits;
    // the page matches it and shows the derived passkey name instead.
    expect(body).not.toContain('active-credential');
    expect(body).not.toContain('revoked-credential');
    expect(body).not.toContain('fbfc3007-154e-4ecc-8c0b-6e020557d7bd');
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
    expect(body).toContain("these aren't promises, they're structural commitments under");
    expect(body).toContain('Article 8 of our articles of incorporation');
    expect(body).toContain('Article III of the bylaws');
    expect(body).toContain('href="https://solpbc.org/articles#s8-3"');
    expect(body).toContain('href="https://solpbc.org/bylaws#art-3"');
    expect(body).toContain('<a class="back" href="/">');
    expect(body).not.toContain("what we don't have");
  });

  it('puts a download-your-data card above the records when export is enabled, and its link opens', async () => {
    const testEnv = makeTestEnv({ OWNER_EXPORT_ENABLED: 'true' });
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(settingsRequest('/transparency', { cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<h2>download what sol pbc holds</h2>');
    expect(body).toContain('<a class="btn primary block" href="/account/export">download what sol pbc holds</a>');
    // The card near the top, and the same action again after the records.
    expect(body.match(/href="\/account\/export"/g)).toHaveLength(2);
    expect(body.indexOf('href="/account/export"')).toBeLessThan(body.indexOf('<h3 class="section-label">sign-in id</h3>'));

    const target = await worker.fetch(settingsRequest('/account/export', { cookie: session.cookie }), testEnv);
    expect(target.status).toBe(200);
    expect(await target.text()).toContain('download what sol pbc holds');
  });

  it('links export from data transparency only, not from home or manage sign-in', async () => {
    const testEnv = makeTestEnv({ OWNER_EXPORT_ENABLED: 'true' });
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    for (const path of ['/', '/sign-in']) {
      const response = await worker.fetch(settingsRequest(path, { cookie: session.cookie }), testEnv);
      expect(response.status).toBe(200);
      expect(await response.text()).not.toContain('href="/account/export"');
    }
  });

  it('shows no export link when export is not enabled', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(settingsRequest('/transparency', { cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).not.toContain('href="/account/export"');
    expect(body).not.toContain('<h2>download what sol pbc holds</h2>');
  });

  it('shows no export link to a signed-out visitor', async () => {
    const testEnv = makeTestEnv({ OWNER_EXPORT_ENABLED: 'true' });

    const response = await worker.fetch(settingsRequest('/transparency', { cookie: '' }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).not.toContain('href="/account/export"');
  });

  it('shows every class the download carries, even when a class is empty', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(settingsRequest('/transparency', { cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    const signIn = new Set(['accounts', 'account_emails', 'sessions', 'passkey_credentials']);
    const exportable = OWNER_DATA_INVENTORY.filter((t) => t.exportTreatment === 'exportable' && !signIn.has(t.name));
    expect(exportable.length).toBeGreaterThan(0);
    for (const entry of exportable) {
      expect(body, entry.name).toContain(`<h3 class="section-label">${entry.description}</h3>`);
    }
    expect(body).toContain('href="/support"');
    expect(body).not.toContain("couldn't be loaded just now");
  });

  it('renders a journal binding with the relay record read live, and discloses a relay miss', async () => {
    const relayBody = (id) => JSON.stringify({
      instance_id: id,
      ca_fp: `sha256:${'a'.repeat(64)}`,
      created_at: 1_790_000_000,
      rotated_at: null,
      revoked_at: null,
      entitled_until: 1_800_000_000,
      entitled: true,
    });
    const relay = {
      async fetch(url) {
        const id = decodeURIComponent(new URL(url).pathname.split('/').pop());
        if (id === 'aaaaaaaa-1111-2222-3333-444444444444') return new Response(relayBody(id), { status: 200 });
        return new Response('unknown', { status: 404 });
      },
    };
    const testEnv = makeTestEnv({ RELAY: relay, RELAY_GRANT_SECRET: 'grant-secret' });
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedSplBinding({ accountId: account.accountId, instanceId: 'aaaaaaaa-1111-2222-3333-444444444444' });
    await seedSplBinding({ accountId: account.accountId, instanceId: 'bbbbbbbb-1111-2222-3333-444444444444' });

    const response = await worker.fetch(settingsRequest('/transparency', { cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("the relay's record for each of your journals");
    expect(body).toContain('relay access until 2027-01-15');
    expect(body).not.toContain('entitled yes');
    expect(body).toContain("the relay's record for this journal couldn't be loaded just now. reload to try again.");
    expect(body).toContain('bbbbbbbb-1111-2222-3333-444444444444');
    expect(body).not.toContain('sha256:');
  });

  it('collapses a long history to its newest rows and says how many the download holds', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    for (let i = 0; i < 25; i++) {
      await workerEnv.DB.prepare(
        `INSERT INTO spb_mint_audit (account_id, instance_id, prefix, scope, ttl, outcome, ts)
         VALUES (?, 'cccccccc-1111-2222-3333-444444444444', 'p', 'backup', 259200, 'minted', ?)`
      ).bind(account.accountId, 1_700_000_000_000 + i * 86_400_000).run();
    }

    const response = await worker.fetch(settingsRequest('/transparency', { cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(body).toContain('newest 20 of 25 shown.');
    expect(body).not.toContain('all 25 are in');
    expect(body).toContain('valid for 72 hours');
    expect(body).not.toContain('prefix');
  });

  it('names a class it could not read, keeps the rest, and never points at the download for it', () => {
    const html = renderTransparencyRecords({
      records: {
        classes: [{ name: 'entitlements', description: 'your services and their status', fields: {}, records: [] }],
        failed: ['spb_mint_audit'],
        descriptions: { spb_mint_audit: 'backup access history' },
      },
      relay: { complete: true, instances: [], accounting: [] },
    });
    expect(html).toContain('<h3 class="section-label">backup access history</h3>\n<p class="meta" style="margin:0 2px">these couldn\'t be loaded just now. reload to try again.</p>');
    expect(html).toContain('<h3 class="section-label">your services and their status</h3>\n<p class="meta" style="margin:0 2px">none held.</p>');
    expect(html).not.toContain('download');
    const noRelay = renderTransparencyRecords({ records: { classes: [], failed: ['spl_bindings'], descriptions: {} }, relay: null });
    expect(noRelay).toContain("the relay's record for each of your journals</h3>\n<p class=\"meta\" style=\"margin:0 2px\">these couldn't be loaded just now.");
  });

  it('points a shortened history at the download only when the download is on', () => {
    const records = Array.from({ length: 25 }, (_, i) => ({ outcome: 'minted', occurred_at: new Date(Date.UTC(2026, 0, 1 + i)).toISOString() }));
    const cls = { name: 'spb_mint_audit', description: 'backup access', fields: { outcome: { transform: 'identity' }, occurred_at: { transform: 'epoch_ms_to_iso' } }, records };
    const on = renderTransparencyRecords({ records: { classes: [cls], failed: [], descriptions: {} }, relay: { instances: [], accounting: [] }, exportEnabled: true });
    expect(on).toContain('newest 20 of 25 shown. all 25 are in <a href="/account/export">the download</a>.');
    expect(on).toContain('on 2026-01-25');
    expect(on).not.toContain('on 2026-01-05');
  });

  it('renders every exported field of every class, so a new column reaches the page without an edit', () => {
    const signIn = new Set(['accounts', 'account_emails', 'sessions', 'passkey_credentials']);
    const classes = OWNER_DATA_INVENTORY
      .filter((t) => t.exportTreatment === 'exportable' && !signIn.has(t.name))
      .map((t) => {
        const exported = t.columns.filter((c) => c.treatment === 'exported');
        const fields = Object.fromEntries(exported.map((c) => [c.publicName, { transform: c.transform, semantics: c.semantics }]));
        const record = Object.fromEntries(exported
          // Value-mapped fields render as plain words; scout history's sequence number is left to
          // the download on purpose. Any other exported field must reach the page verbatim.
          .filter((c) => c.transform === 'identity' && !['service', 'renewal_at', 'cancel_at_period_end', 'ttl', 'label', 'reason_code', 'outcome', 'sequence'].includes(c.publicName))
          .map((c) => [c.publicName, `sentinel-${t.name}-${c.publicName}`]));
        return { name: t.name, description: t.description, fields, records: [record] };
      });
    const html = renderTransparencyRecords({ records: { classes, failed: [], descriptions: {} }, relay: { instances: [], accounting: [] } });
    for (const cls of classes) {
      for (const value of Object.values(cls.records[0])) expect(html, value).toContain(value);
    }
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
    expect(calls.join('\n')).not.toContain('row_id');
    expect(calls.every((call) => /"row_ref":"[A-Za-z0-9_-]{43}"/.test(call))).toBe(true);
    expect(calls.join('\n')).not.toContain(String(badEmail.id));
    expect(calls.join('\n')).not.toContain(badSession.idHash);
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
    // A backup credential history grows without a bound; the page shows its newest rows only.
    for (let i = 0; i < 500; i++) {
      await workerEnv.DB.prepare(
        `INSERT INTO spb_mint_audit (account_id, instance_id, prefix, scope, ttl, outcome, ts)
         VALUES (?, 'dddddddd-1111-2222-3333-444444444444', 'p', 'backup', 259200, 'minted', ?)`
      ).bind(account.accountId, 1_700_000_000_000 + i * 1000).run();
    }

    const response = await worker.fetch(settingsRequest('/transparency', { cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body.length).toBeLessThan(50_000);
    expect(body).toContain('newest 20 of 500 shown.');
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
