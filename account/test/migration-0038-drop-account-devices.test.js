import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0038_drop_account_devices.sql?raw';
import {
  makeTestEnv,
  resetDb,
  seedAccount,
} from './helpers.js';
import { insertDispatchToken } from '../src/db.js';

const ACCOUNT_DEVICES_DDL = `
CREATE TABLE IF NOT EXISTS account_devices (
  device_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios','macos','android')),
  push_token TEXT NOT NULL,
  push_token_env TEXT NOT NULL CHECK (push_token_env IN ('production','sandbox')),
  bundle_id TEXT NOT NULL,
  device_label TEXT,
  app_version TEXT,
  device_pubkey TEXT, -- reserved for future encrypted-push end-state
  device_pubkey_alg TEXT,
  registered_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  revoked_at INTEGER,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_devices_active_push_token
  ON account_devices(push_token, bundle_id, push_token_env)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_account_devices_account_id
  ON account_devices(account_id);
`;

describe('migration 0038 drops account_devices', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('drops account_devices table and indexes, preserves account_dispatch_tokens, and is idempotent', async () => {
    const account = await seedAccount({ email: 'migration-0038@example.com', testEnv: makeTestEnv() });

    // Recreate account_devices and its indexes from 0006 DDL
    const ddlStatements = ACCOUNT_DEVICES_DDL
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of ddlStatements) {
      await workerEnv.DB.prepare(statement).run();
    }

    // Insert one device row satisfying DDL
    await workerEnv.DB.prepare(
      `INSERT INTO account_devices (
         device_id, account_id, platform, push_token, push_token_env, bundle_id,
         device_label, app_version, registered_at, last_seen_at, revoked_at
       ) VALUES (?, ?, 'ios', 'token-1', 'production', 'app.solstone.swift', 'iPhone', '1.0.0', 1000, 1000, NULL)`
    ).bind('dev-1', account.accountId).run();

    // Insert one account_dispatch_tokens row and read full row before migration
    await insertDispatchToken(workerEnv.DB, {
      tokenHash: 'dispatch-token-hash-1',
      accountId: account.accountId,
      nowMs: 1000,
    });
    const beforeRow = await workerEnv.DB
      .prepare('SELECT * FROM account_dispatch_tokens WHERE token_hash = ?')
      .bind('dispatch-token-hash-1')
      .first();
    expect(beforeRow).not.toBeNull();

    // Run migration
    await runMigration();

    // Assert the three names are absent from sqlite_master
    const droppedNames = [
      'account_devices',
      'idx_account_devices_active_push_token',
      'idx_account_devices_account_id',
    ];
    for (const name of droppedNames) {
      const entry = await workerEnv.DB
        .prepare('SELECT name FROM sqlite_master WHERE name = ?')
        .bind(name)
        .first();
      expect(entry).toBeNull();
    }

    // Assert account_dispatch_tokens is still a table in sqlite_master
    const dispatchTable = await workerEnv.DB
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='account_dispatch_tokens'")
      .first();
    expect(dispatchTable?.name).toBe('account_dispatch_tokens');

    // Assert seeded row is unchanged
    const afterRow = await workerEnv.DB
      .prepare('SELECT * FROM account_dispatch_tokens WHERE token_hash = ?')
      .bind('dispatch-token-hash-1')
      .first();
    expect(afterRow).toEqual(beforeRow);

    // Run migration again for idempotence check
    await expect(runMigration()).resolves.toBeUndefined();

    // Assert three names still absent
    for (const name of droppedNames) {
      const entry = await workerEnv.DB
        .prepare('SELECT name FROM sqlite_master WHERE name = ?')
        .bind(name)
        .first();
      expect(entry).toBeNull();
    }
  });
});

async function runMigration() {
  const statements = migration
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await workerEnv.DB.prepare(statement).run();
  }
}
