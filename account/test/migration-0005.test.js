import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0005_email_verification.sql?raw';
import { resetDb } from './helpers.js';

describe('migration 0005 email verification', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('adds verification columns with defaults for existing verified rows', async () => {
    await workerEnv.DB.prepare('DROP TABLE IF EXISTS account_emails').run();
    await workerEnv.DB
      .prepare(
        `CREATE TABLE account_emails (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          address_encrypted TEXT NOT NULL,
          address_lower_hash TEXT NOT NULL UNIQUE,
          is_primary INTEGER NOT NULL DEFAULT 1,
          verified_at INTEGER,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (account_id) REFERENCES accounts(id)
        )`
      )
      .run();
    await workerEnv.DB
      .prepare('CREATE INDEX IF NOT EXISTS idx_account_emails_account_id ON account_emails(account_id)')
      .run();
    await workerEnv.DB
      .prepare('INSERT INTO accounts (id, primary_email_id, passkey_user_handle, created_at, last_signin_at) VALUES (?, NULL, NULL, ?, ?)')
      .bind('legacy-account', 1_000, 1_000)
      .run();
    await workerEnv.DB
      .prepare(
        `INSERT INTO account_emails (
          id, account_id, address_encrypted, address_lower_hash, is_primary, verified_at, created_at
        ) VALUES (?, ?, ?, ?, 1, ?, ?)`
      )
      .bind('legacy-email', 'legacy-account', 'encrypted', 'hash', 1_000, 1_000)
      .run();

    const executableMigration = migration
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    for (const statement of executableMigration.split(';').map((part) => part.trim()).filter(Boolean)) {
      await workerEnv.DB.prepare(statement).run();
    }

    const row = await workerEnv.DB
      .prepare(
        `SELECT verification_code_hash, verification_expires_at, verification_attempts
         FROM account_emails
         WHERE id = ?`
      )
      .bind('legacy-email')
      .first();

    expect(migration).not.toContain('verification_started_at');
    expect(row).toEqual({
      verification_code_hash: null,
      verification_expires_at: null,
      verification_attempts: 0,
    });
  });
});
