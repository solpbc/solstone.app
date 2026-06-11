import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { makeTestEnv, resetDb, seedAccount, seedSession } from './helpers.js';

describe('settings passkeys', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  it('renders the empty state and add-passkey affordance', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(settingsRequest('/sign-in/passkeys', session.cookie), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toContain("no passkeys enrolled. next time you sign in, you'll use an email code.");
    expect(body).toContain('id="passkey-add"');
    expect(body).toContain('id="passkey-enroll-error"');
    expect(body).toContain('id="passkey-friendly-name"');
    expect(body).not.toContain('id="passkey-skip"');
  });

  it('labels known AAGUIDs and falls back after an empty rename', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await insertCredential({
      accountId: account.accountId,
      credentialId: 'google-credential',
      aaguid: 'EA9B8D66-4D01-1D21-3CE4-B6B48CB575D4',
    });
    await insertCredential({
      accountId: account.accountId,
      credentialId: 'icloud-credential',
      aaguid: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd',
    });
    await insertCredential({
      accountId: account.accountId,
      credentialId: 'windows-credential',
      aaguid: '08987058-cadc-4b81-b6e1-30de50dcbe96',
    });

    const before = await worker.fetch(settingsRequest('/sign-in/passkeys', session.cookie), testEnv);
    const beforeBody = await before.text();
    expect(beforeBody).toContain('google password manager');
    expect(beforeBody).toContain('icloud keychain');
    expect(beforeBody).toContain('windows hello');

    const rename = await worker.fetch(settingsPost('/sign-in/passkeys/google-credential/rename', session.cookie, {
      friendly_name: '   ',
    }), testEnv);
    const row = await credentialRow('google-credential');
    expect(rename.status).toBe(303);
    expect(row.friendly_name).toBeNull();

    const after = await worker.fetch(settingsRequest('/sign-in/passkeys', session.cookie), testEnv);
    const afterBody = await after.text();
    expect(afterBody).toContain('google password manager');
    expect(afterBody).not.toContain('<h2></h2>');
  });

  it('stores and escapes friendly names', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await insertCredential({ accountId: account.accountId, credentialId: 'xss-credential' });

    const response = await worker.fetch(settingsPost('/sign-in/passkeys/xss-credential/rename', session.cookie, {
      friendly_name: '<script>alert(1)</script>foo',
    }), testEnv);
    const row = await credentialRow('xss-credential');
    const rendered = await worker.fetch(settingsRequest('/sign-in/passkeys', session.cookie), testEnv);
    const body = await rendered.text();

    expect(response.status).toBe(303);
    expect(row.friendly_name).toBe('<script>alert(1)</script>foo');
    expect(body).toContain('<div class="title">&lt;script&gt;alert(1)&lt;/script&gt;foo</div>');
    expect(body).toContain('value="&lt;script&gt;alert(1)&lt;/script&gt;foo"');
    expect(body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;foo');
    expect(body).not.toContain('<script>alert(1)</script>foo');
  });

  it('logs unmapped nonzero AAGUIDs without logging null or all-zero values', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await insertCredential({
      accountId: account.accountId,
      credentialId: 'unknown-aaguid',
      aaguid: '11111111-2222-3333-4444-555555555555',
    });
    await insertCredential({
      accountId: account.accountId,
      credentialId: 'zero-aaguid',
      aaguid: '00000000-0000-0000-0000-000000000000',
    });
    await insertCredential({
      accountId: account.accountId,
      credentialId: 'null-aaguid',
      aaguid: null,
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await worker.fetch(settingsRequest('/sign-in/passkeys', session.cookie), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('passkey');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('passkey_label_unmapped');
  });

  it('scopes passkey rename and remove mutations to the signed-in account', async () => {
    const testEnv = makeTestEnv();
    const accountA = await seedAccount({ email: 'passkey-a@example.com', testEnv });
    const accountB = await seedAccount({ email: 'passkey-b@example.com', testEnv });
    const sessionA = await seedSession(accountA.accountId, { testEnv });
    await insertCredential({
      accountId: accountB.accountId,
      credentialId: 'b-credential',
      friendlyName: 'b original',
    });

    const rename = await worker.fetch(settingsPost('/sign-in/passkeys/b-credential/rename', sessionA.cookie, {
      friendly_name: 'changed',
    }), testEnv);
    const remove = await worker.fetch(settingsPost('/sign-in/passkeys/b-credential/remove', sessionA.cookie), testEnv);
    const row = await credentialRow('b-credential');

    expect(rename.status).toBe(303);
    expect(remove.status).toBe(303);
    expect(row.friendly_name).toBe('b original');
    expect(row.revoked_at).toBeNull();
  });

  it('removes a passkey for the signed-in account', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await insertCredential({ accountId: account.accountId, credentialId: 'remove-me' });

    const response = await worker.fetch(settingsPost('/sign-in/passkeys/remove-me/remove', session.cookie), testEnv);
    const row = await credentialRow('remove-me');

    expect(response.status).toBe(303);
    expect(row.revoked_at).toBeGreaterThan(0);

    const rendered = await worker.fetch(settingsRequest('/sign-in/passkeys', session.cookie), testEnv);
    const body = await rendered.text();
    expect(body).toContain("no passkeys enrolled. next time you sign in, you'll use an email code.");
    expect(body).toContain('id="passkey-add"');
    expect(body).toContain('/passkey/register/start');
  });
});

function settingsRequest(path, cookie) {
  return new Request(`https://services.solstone.app${path}`, {
    headers: { Cookie: cookie },
  });
}

function settingsPost(path, cookie, form = {}) {
  return new Request(`https://services.solstone.app${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'https://services.solstone.app',
      Cookie: cookie,
    },
    body: new URLSearchParams(form),
  });
}

async function insertCredential({
  accountId,
  credentialId,
  aaguid = null,
  friendlyName = null,
  createdAt = Date.now(),
}) {
  await workerEnv.DB
    .prepare(
      `INSERT INTO passkey_credentials (
         credential_id, account_id, public_key, counter, aaguid, transports,
         backup_eligible, backup_state, device_type, friendly_name, created_at, last_used_at, revoked_at
       ) VALUES (?, ?, 'pk', 0, ?, NULL, 0, 0, NULL, ?, ?, NULL, NULL)`
    )
    .bind(credentialId, accountId, aaguid, friendlyName, createdAt)
    .run();
}

async function credentialRow(credentialId) {
  return workerEnv.DB
    .prepare('SELECT friendly_name, revoked_at FROM passkey_credentials WHERE credential_id = ?')
    .bind(credentialId)
    .first();
}
