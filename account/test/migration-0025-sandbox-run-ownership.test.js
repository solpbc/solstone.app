import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0025_sandbox_run_ownership.sql?raw';
import { resetDb } from './helpers.js';

const ACCOUNT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACCOUNT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const INSTANCE_ID = '11111111-1111-1111-1111-111111111111';

describe('migration 0025 sandbox-run ownership', () => {
  beforeEach(async () => {
    await resetDb();
    await installPre0025Tables();
    await insertAccounts();
  });

  it('adds nullable last columns, preserves legacy rows, and creates the exact indexes', async () => {
    await workerEnv.DB
      .prepare('INSERT INTO account_dispatch_tokens (token_hash, account_id, created_at, revoked_at) VALUES (?, ?, ?, ?)')
      .bind('legacy-dispatch-hash', ACCOUNT_A, 1_000, null)
      .run();
    await workerEnv.DB
      .prepare('INSERT INTO spl_bindings (account_id, instance_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)')
      .bind(ACCOUNT_A, INSTANCE_ID, 2_000, 3_000)
      .run();
    await workerEnv.DB
      .prepare(
        `INSERT INTO spp_bindings (
           account_id, instance_id, token_hash, created_at, last_seen_at,
           consent_acked_at, consent_disclosure_version
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(ACCOUNT_A, INSTANCE_ID, 'legacy-spp-hash', 4_000, 5_000, 6_000, 'legacy-consent')
      .run();

    await runMigration();

    await expect(columnNames('account_dispatch_tokens')).resolves.toEqual([
      'token_hash', 'account_id', 'created_at', 'revoked_at', 'sandbox_run_id',
    ]);
    await expect(columnNames('spl_bindings')).resolves.toEqual([
      'account_id', 'instance_id', 'created_at', 'last_seen_at', 'sandbox_run_id',
    ]);
    await expect(columnNames('spp_bindings')).resolves.toEqual([
      'account_id', 'instance_id', 'token_hash', 'created_at', 'last_seen_at',
      'consent_acked_at', 'consent_disclosure_version', 'sandbox_run_id',
    ]);
    for (const table of ['account_dispatch_tokens', 'spl_bindings', 'spp_bindings']) {
      const columns = await tableColumns(table);
      expect(columns.at(-1)).toMatchObject({ name: 'sandbox_run_id', type: 'TEXT', notnull: 0 });
    }

    await expect(indexShape('account_dispatch_tokens', 'idx_account_dispatch_tokens_sandbox_run_id'))
      .resolves.toEqual({ unique: 0, columns: ['sandbox_run_id'] });
    await expect(indexShape('spl_bindings', 'idx_spl_bindings_sandbox_run_id'))
      .resolves.toEqual({ unique: 0, columns: ['sandbox_run_id'] });
    await expect(indexShape('spp_bindings', 'idx_spp_bindings_sandbox_run_id'))
      .resolves.toEqual({ unique: 0, columns: ['sandbox_run_id'] });
    await expect(indexShape('spl_bindings', 'idx_spl_bindings_instance_id'))
      .resolves.toEqual({ unique: 1, columns: ['instance_id'] });
    await expect(indexShape('spp_bindings', 'idx_spp_bindings_instance_id'))
      .resolves.toEqual({ unique: 1, columns: ['instance_id'] });
    await expect(indexShape('spb_bindings', 'idx_spb_bindings_sandbox_run_id')).resolves.toBeNull();

    await expect(workerEnv.DB.prepare('SELECT * FROM account_dispatch_tokens').first()).resolves.toEqual({
      token_hash: 'legacy-dispatch-hash',
      account_id: ACCOUNT_A,
      created_at: 1_000,
      revoked_at: null,
      sandbox_run_id: null,
    });
    await expect(workerEnv.DB.prepare('SELECT * FROM spl_bindings').first()).resolves.toEqual({
      account_id: ACCOUNT_A,
      instance_id: INSTANCE_ID,
      created_at: 2_000,
      last_seen_at: 3_000,
      sandbox_run_id: null,
    });
    await expect(workerEnv.DB.prepare('SELECT * FROM spp_bindings').first()).resolves.toEqual({
      account_id: ACCOUNT_A,
      instance_id: INSTANCE_ID,
      token_hash: 'legacy-spp-hash',
      created_at: 4_000,
      last_seen_at: 5_000,
      consent_acked_at: 6_000,
      consent_disclosure_version: 'legacy-consent',
      sandbox_run_id: null,
    });
  });

  it.each(['spl_bindings', 'spp_bindings'])(
    'fails loudly and preserves both pre-existing duplicate rows in %s',
    async (table) => {
      await insertDuplicateBindings(table);

      await expect(runMigration()).rejects.toThrow(
        new RegExp(`UNIQUE constraint failed: ${table}\\.instance_id: SQLITE_CONSTRAINT`)
      );

      const { results } = await workerEnv.DB
        .prepare(`SELECT account_id, instance_id, sandbox_run_id FROM ${table} ORDER BY account_id`)
        .all();
      expect(results).toEqual([
        { account_id: ACCOUNT_A, instance_id: INSTANCE_ID, sandbox_run_id: null },
        { account_id: ACCOUNT_B, instance_id: INSTANCE_ID, sandbox_run_id: null },
      ]);
    }
  );

  it('documents loud ALTER re-apply while allowing the index suffix to re-run', async () => {
    await runMigration();

    await expect(runMigration()).rejects.toThrow(/duplicate column name: sandbox_run_id/i);
    await expect(runStatements(migrationStatements().slice(3))).resolves.toBeUndefined();
    await expect(indexShape('spl_bindings', 'idx_spl_bindings_instance_id'))
      .resolves.toEqual({ unique: 1, columns: ['instance_id'] });
    await expect(indexShape('spp_bindings', 'idx_spp_bindings_instance_id'))
      .resolves.toEqual({ unique: 1, columns: ['instance_id'] });
  });
});

async function installPre0025Tables() {
  for (const table of ['account_dispatch_tokens', 'spl_bindings', 'spp_bindings']) {
    await workerEnv.DB.prepare(`DROP TABLE IF EXISTS ${table}`).run();
  }
  await workerEnv.DB
    .prepare(
      `CREATE TABLE account_dispatch_tokens (
         token_hash TEXT PRIMARY KEY,
         account_id TEXT NOT NULL,
         created_at INTEGER NOT NULL,
         revoked_at INTEGER,
         FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
       )`
    )
    .run();
  await workerEnv.DB
    .prepare('CREATE INDEX idx_account_dispatch_tokens_account_id ON account_dispatch_tokens(account_id)')
    .run();
  await workerEnv.DB
    .prepare(
      `CREATE TABLE spl_bindings (
         account_id TEXT NOT NULL,
         instance_id TEXT NOT NULL,
         created_at INTEGER NOT NULL,
         last_seen_at INTEGER NOT NULL,
         PRIMARY KEY (account_id, instance_id),
         FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
       )`
    )
    .run();
  await workerEnv.DB.prepare('CREATE INDEX idx_spl_bindings_account_id ON spl_bindings(account_id)').run();
  await workerEnv.DB
    .prepare(
      `CREATE TABLE spp_bindings (
         account_id TEXT NOT NULL,
         instance_id TEXT NOT NULL,
         token_hash TEXT,
         created_at INTEGER NOT NULL,
         last_seen_at INTEGER NOT NULL,
         consent_acked_at INTEGER,
         consent_disclosure_version TEXT,
         PRIMARY KEY (account_id, instance_id),
         FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
       )`
    )
    .run();
  await workerEnv.DB.prepare('CREATE INDEX idx_spp_bindings_account_id ON spp_bindings(account_id)').run();
}

async function insertAccounts() {
  await workerEnv.DB
    .prepare('INSERT INTO accounts (id, primary_email_id, created_at, last_signin_at) VALUES (?, NULL, ?, ?)')
    .bind(ACCOUNT_A, 1_000, 1_000)
    .run();
  await workerEnv.DB
    .prepare('INSERT INTO accounts (id, primary_email_id, created_at, last_signin_at) VALUES (?, NULL, ?, ?)')
    .bind(ACCOUNT_B, 1_000, 1_000)
    .run();
}

async function insertDuplicateBindings(table) {
  if (table === 'spl_bindings') {
    for (const accountId of [ACCOUNT_A, ACCOUNT_B]) {
      await workerEnv.DB
        .prepare('INSERT INTO spl_bindings (account_id, instance_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)')
        .bind(accountId, INSTANCE_ID, 1_000, 1_000)
        .run();
    }
    return;
  }
  for (const accountId of [ACCOUNT_A, ACCOUNT_B]) {
    await workerEnv.DB
      .prepare(
        `INSERT INTO spp_bindings (
           account_id, instance_id, token_hash, created_at, last_seen_at,
           consent_acked_at, consent_disclosure_version
         ) VALUES (?, ?, ?, ?, ?, NULL, NULL)`
      )
      .bind(accountId, INSTANCE_ID, `hash-${accountId}`, 1_000, 1_000)
      .run();
  }
}

function migrationStatements() {
  const executable = migration
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  return executable.split(';').map((part) => part.trim()).filter(Boolean);
}

function runMigration() {
  return runStatements(migrationStatements());
}

async function runStatements(statements) {
  for (const statement of statements) await workerEnv.DB.prepare(statement).run();
}

async function tableColumns(table) {
  const { results } = await workerEnv.DB.prepare(`PRAGMA table_info(${table})`).all();
  return results;
}

async function columnNames(table) {
  return (await tableColumns(table)).map((column) => column.name);
}

async function indexShape(table, name) {
  const { results: indexes } = await workerEnv.DB.prepare(`PRAGMA index_list(${table})`).all();
  const index = indexes.find((candidate) => candidate.name === name);
  if (!index) return null;
  const { results: columns } = await workerEnv.DB.prepare(`PRAGMA index_info(${name})`).all();
  return { unique: index.unique, columns: columns.map((column) => column.name) };
}
