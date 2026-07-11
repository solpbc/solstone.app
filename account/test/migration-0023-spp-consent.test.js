import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0023_spp_consent.sql?raw';
import { resetDb } from './helpers.js';

describe('migration 0023 spp consent', () => {
  beforeEach(async () => {
    await resetDb();
    await installPre0023SppBindings();
    await workerEnv.DB
      .prepare('INSERT INTO accounts (id, primary_email_id, created_at, last_signin_at) VALUES (?, NULL, ?, ?)')
      .bind('acct-0023', 1_000, 1_000)
      .run();
  });

  it('adds consent columns, preserves rows, and fails safely on re-apply', async () => {
    await runMigration();

    await expect(tableColumns('spp_bindings')).resolves.toEqual([
      'account_id',
      'instance_id',
      'token_hash',
      'created_at',
      'last_seen_at',
      'consent_acked_at',
      'consent_disclosure_version',
    ]);

    await insertBinding();

    await expect(runMigration()).rejects.toThrow(/duplicate column name: consent_acked_at/i);

    await expect(tableColumns('spp_bindings')).resolves.toEqual([
      'account_id',
      'instance_id',
      'token_hash',
      'created_at',
      'last_seen_at',
      'consent_acked_at',
      'consent_disclosure_version',
    ]);
    await expect(bindingRow()).resolves.toEqual({
      account_id: 'acct-0023',
      instance_id: 'instance-0023',
      token_hash: 'token-hash-0023',
      created_at: 2_000,
      last_seen_at: 3_000,
      consent_acked_at: 4_000,
      consent_disclosure_version: 'spp-consent-v1',
    });
  });
});

async function installPre0023SppBindings() {
  await workerEnv.DB.prepare('DROP TABLE IF EXISTS spp_bindings').run();
  await workerEnv.DB
    .prepare(
      `CREATE TABLE spp_bindings (
        account_id TEXT NOT NULL,
        instance_id TEXT NOT NULL,
        token_hash TEXT,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        PRIMARY KEY (account_id, instance_id),
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      )`
    )
    .run();
  await workerEnv.DB
    .prepare('CREATE INDEX idx_spp_bindings_account_id ON spp_bindings(account_id)')
    .run();
}

async function runMigration() {
  const executable = migration
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  for (const statement of executable.split(';').map((part) => part.trim()).filter(Boolean)) {
    await workerEnv.DB.prepare(statement).run();
  }
}

async function insertBinding() {
  await workerEnv.DB
    .prepare(
      `INSERT INTO spp_bindings (
         account_id, instance_id, token_hash, created_at, last_seen_at,
         consent_acked_at, consent_disclosure_version
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      'acct-0023',
      'instance-0023',
      'token-hash-0023',
      2_000,
      3_000,
      4_000,
      'spp-consent-v1'
    )
    .run();
}

async function bindingRow() {
  return workerEnv.DB
    .prepare(
      `SELECT account_id, instance_id, token_hash, created_at, last_seen_at,
              consent_acked_at, consent_disclosure_version
       FROM spp_bindings
       WHERE account_id = ? AND instance_id = ?`
    )
    .bind('acct-0023', 'instance-0023')
    .first();
}

async function tableColumns(name) {
  const { results } = await workerEnv.DB
    .prepare(`SELECT name FROM pragma_table_info('${name}')`)
    .all();
  return results.map((row) => row.name);
}
