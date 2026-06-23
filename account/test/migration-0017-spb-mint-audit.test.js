import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0017_spb_mint_audit.sql?raw';
import { resetDb } from './helpers.js';

describe('migration 0017 spb mint audit', () => {
  beforeEach(async () => {
    await resetDb();
    await workerEnv.DB.prepare('DROP TABLE IF EXISTS spb_mint_audit').run();
  });

  it('creates the audit table and index, enforces outcomes, and can re-run', async () => {
    await runMigration();

    await expect(tableExists('spb_mint_audit')).resolves.toBe(true);
    await expect(tableColumns('spb_mint_audit')).resolves.toEqual([
      'account_id',
      'instance_id',
      'prefix',
      'scope',
      'ttl',
      'outcome',
      'ts',
    ]);
    await expect(indexExists('idx_spb_mint_audit_account_id')).resolves.toBe(true);
    await expect(insertAudit('minted')).resolves.toBeUndefined();
    await expect(insertAudit('bogus')).rejects.toThrow(/CHECK constraint failed/i);
    await expect(insertAudit('refused_killswitch')).rejects.toThrow(/CHECK constraint failed/i);

    await runMigration();

    await expect(tableCount('spb_mint_audit')).resolves.toBe(1);
    await expect(indexExists('idx_spb_mint_audit_account_id')).resolves.toBe(true);
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

async function insertAudit(outcome) {
  await workerEnv.DB
    .prepare(
      `INSERT INTO spb_mint_audit (
         account_id, instance_id, prefix, scope, ttl, outcome, ts
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind('acct-0017', 'instance-0017', 'users/acct-0017/instance-0017/', 'backup', 3600, outcome, 1_000)
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
