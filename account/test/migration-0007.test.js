import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0007_oauth_provisioning.sql?raw';
import { resetDb } from './helpers.js';

describe('migration 0007 OAuth provisioning', () => {
  beforeEach(async () => {
    await resetDb();
    await workerEnv.DB.prepare('DROP TABLE IF EXISTS oauth_tokens').run();
    await workerEnv.DB.prepare('DROP TABLE IF EXISTS oauth_codes').run();
    await workerEnv.DB.prepare('DROP TABLE IF EXISTS provisioned_keys').run();
  });

  it('creates provisioning, code, and token tables from migration', async () => {
    await applyMigration();
    await seedAccount('account-a');
    await insertProvisionedKey({ accountId: 'account-a' });
    await insertOauthCode({ accountId: 'account-a' });
    await insertOauthToken({ accountId: 'account-a' });

    await expect(row('provisioned_keys')).resolves.toEqual({ count: 1 });
    await expect(row('oauth_codes')).resolves.toEqual({ count: 1 });
    await expect(row('oauth_tokens')).resolves.toEqual({ count: 1 });
  });

  it('enforces one active provisioned key per account/provider', async () => {
    await applyMigration();
    await seedAccount('account-a');
    await insertProvisionedKey({ id: 'key-a', accountId: 'account-a' });

    await expect(insertProvisionedKey({ id: 'key-b', accountId: 'account-a' })).rejects.toThrow();
  });

  it('permits a second provisioned key after revocation', async () => {
    await applyMigration();
    await seedAccount('account-a');
    await insertProvisionedKey({ id: 'key-a', accountId: 'account-a' });
    await workerEnv.DB
      .prepare('UPDATE provisioned_keys SET revoked_at = ? WHERE id = ?')
      .bind(2_000, 'key-a')
      .run();

    await expect(insertProvisionedKey({ id: 'key-b', accountId: 'account-a' })).resolves.toBeUndefined();
  });

  it("enforces provider IN ('gemini')", async () => {
    await applyMigration();
    await seedAccount('account-a');

    await expect(insertProvisionedKey({ accountId: 'account-a', provider: 'openai' })).rejects.toThrow();
  });

  it("enforces code_challenge_method = 'S256'", async () => {
    await applyMigration();
    await seedAccount('account-a');

    await expect(insertOauthCode({ accountId: 'account-a', codeChallengeMethod: 'plain' })).rejects.toThrow();
  });

  it('uses the unique refresh token hash as the lookup index', async () => {
    await applyMigration();
    await seedAccount('account-a');
    await insertOauthToken({ id: null, accountId: 'account-a', refreshHash: 'refresh-hash' });

    await expect(insertOauthToken({ id: null, accountId: 'account-a', refreshHash: 'refresh-hash' })).rejects.toThrow();
  });
});

async function applyMigration() {
  const executableMigration = migration
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  for (const statement of executableMigration.split(';').map((part) => part.trim()).filter(Boolean)) {
    await workerEnv.DB.prepare(statement).run();
  }
}

async function seedAccount(accountId) {
  await workerEnv.DB
    .prepare('INSERT INTO accounts (id, primary_email_id, passkey_user_handle, created_at, last_signin_at) VALUES (?, NULL, NULL, ?, ?)')
    .bind(accountId, 1_000, 1_000)
    .run();
}

async function insertProvisionedKey({
  id = 'key-a',
  accountId,
  provider = 'gemini',
}) {
  await workerEnv.DB
    .prepare(
      `INSERT INTO provisioned_keys (
        id, account_id, provider, display_name, key_resource_name,
        key_string_encrypted, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, accountId, provider, `acct-${id}`, `projects/test/locations/global/keys/${id}`, 'encrypted', 1_000)
    .run();
}

async function insertOauthCode({
  accountId,
  codeChallengeMethod = 'S256',
}) {
  await workerEnv.DB
    .prepare(
      `INSERT INTO oauth_codes (
        code_hash, account_id, client_id, redirect_uri, scope,
        code_challenge, code_challenge_method, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      accountId,
      'solstone-cli',
      'http://127.0.0.1:5015/callback',
      'solstone.gemini',
      'a'.repeat(43),
      codeChallengeMethod,
      1_000,
      61_000
    )
    .run();
}

async function insertOauthToken({
  accountId,
  refreshHash = crypto.randomUUID(),
}) {
  await workerEnv.DB
    .prepare(
      `INSERT INTO oauth_tokens (
        account_id, family_id, access_token_hash, refresh_token_hash, scope,
        created_at, access_expires_at, refresh_expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(accountId, crypto.randomUUID(), crypto.randomUUID(), refreshHash, 'solstone.gemini', 1_000, 3_601_000, 2_592_001_000)
    .run();
}

async function row(table) {
  return workerEnv.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
}
