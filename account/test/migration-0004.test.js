import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0004_session_metadata.sql?raw';
import { resetDb } from './helpers.js';

describe('migration 0004 session metadata', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('backfills legacy sessions and adds nullable metadata columns', async () => {
    await workerEnv.DB.prepare('DROP TABLE IF EXISTS sessions').run();
    await workerEnv.DB
      .prepare(
        `CREATE TABLE sessions (
          id_hash TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          FOREIGN KEY (account_id) REFERENCES accounts(id)
        )`
      )
      .run();
    await workerEnv.DB
      .prepare('CREATE INDEX IF NOT EXISTS idx_sessions_account_id ON sessions(account_id)')
      .run();
    await workerEnv.DB
      .prepare('INSERT INTO accounts (id, primary_email_id, passkey_user_handle, created_at, last_signin_at) VALUES (?, NULL, NULL, ?, ?)')
      .bind('legacy-account', 1_000, 1_000)
      .run();
    await workerEnv.DB
      .prepare('INSERT INTO sessions (id_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .bind('legacy-hash', 'legacy-account', 12_345, 99_999)
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
        `SELECT last_active_at, revoked_at, last_ip_encrypted, last_user_agent
         FROM sessions
         WHERE id_hash = ?`
      )
      .bind('legacy-hash')
      .first();

    expect(row).toEqual({
      last_active_at: 12_345,
      revoked_at: null,
      last_ip_encrypted: null,
      last_user_agent: null,
    });
  });
});
