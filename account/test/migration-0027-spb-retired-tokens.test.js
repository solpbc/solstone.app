import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0027_spb_retired_tokens.sql?raw';
import schema from '../schema.sql?raw';
import { resetDb } from './helpers.js';

const createTableSql = `CREATE TABLE IF NOT EXISTS spb_retired_tokens (
  token_hash TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  retired_at INTEGER NOT NULL
);`;

const createIndexSql = 'CREATE INDEX IF NOT EXISTS idx_spb_retired_tokens_retired_at ON spb_retired_tokens(retired_at);';

describe('migration 0027 spb retired tokens', () => {
  beforeEach(async () => {
    await resetDb();
    await workerEnv.DB.prepare('DROP TABLE IF EXISTS spb_retired_tokens').run();
  });

  it('creates the retired token table and index', async () => {
    await runMigration();

    await expect(tableExists('spb_retired_tokens')).resolves.toBe(true);
    await expect(tableColumns('spb_retired_tokens')).resolves.toEqual([
      'token_hash',
      'account_id',
      'instance_id',
      'retired_at',
    ]);
    await expect(indexExists('idx_spb_retired_tokens_retired_at')).resolves.toBe(true);
  });

  it('rejects a retired token without a token hash', async () => {
    await runMigration();

    await expect(insertRetiredToken(null)).rejects.toThrow(/NOT NULL constraint failed/i);
  });

  it('keeps the schema and migration SQL blocks byte-identical', () => {
    expect(schema).toContain(createTableSql);
    expect(schema).toContain(createIndexSql);
    expect(migration).toContain(createTableSql);
    expect(migration).toContain(createIndexSql);
  });

  it('can re-run without duplicating the table or index', async () => {
    await runMigration();
    await insertRetiredToken('retired-token');

    await runMigration();

    await expect(tableCount('spb_retired_tokens')).resolves.toBe(1);
    await expect(indexExists('idx_spb_retired_tokens_retired_at')).resolves.toBe(true);
  });
});

async function runMigration() {
  const executable = migration
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  for (const statement of executable.split(';').map((part) => part.trim()).filter(Boolean)) {
    await workerEnv.DB.prepare(statement).run();
  }
}

async function insertRetiredToken(tokenHash) {
  await workerEnv.DB
    .prepare('INSERT INTO spb_retired_tokens (token_hash, account_id, instance_id, retired_at) VALUES (?, ?, ?, ?)')
    .bind(tokenHash, 'acct-0027', 'instance-0027', 1_000)
    .run();
}

async function tableExists(name) {
  const row = await workerEnv.DB
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(name)
    .first();
  return Boolean(row);
}

async function tableCount(name) {
  const row = await workerEnv.DB
    .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(name)
    .first();
  return row.count;
}

async function tableColumns(name) {
  const { results } = await workerEnv.DB
    .prepare(`SELECT name FROM pragma_table_info('${name}')`)
    .all();
  return results.map((row) => row.name);
}

async function indexExists(name) {
  const row = await workerEnv.DB
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
    .bind(name)
    .first();
  return Boolean(row);
}
