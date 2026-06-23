import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0019_spb_sweep_audit.sql?raw';
import { resetDb } from './helpers.js';

describe('migration 0019 spb sweep audit', () => {
  beforeEach(async () => {
    await resetDb();
    await workerEnv.DB.prepare('DROP TABLE IF EXISTS spb_sweep_audit').run();
  });

  it('creates the audit table and index and can re-run', async () => {
    await runMigration();

    await expect(tableExists('spb_sweep_audit')).resolves.toBe(true);
    await expect(tableColumns('spb_sweep_audit')).resolves.toEqual([
      'account_id',
      'instance_id',
      'prefix',
      'objects_deleted',
      'multipart_aborted',
      'ts',
    ]);
    await expect(indexExists('idx_spb_sweep_audit_account_id')).resolves.toBe(true);
    await expect(insertAudit()).resolves.toBeUndefined();

    await runMigration();

    await expect(tableCount('spb_sweep_audit')).resolves.toBe(1);
    await expect(indexExists('idx_spb_sweep_audit_account_id')).resolves.toBe(true);
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

async function insertAudit() {
  await workerEnv.DB
    .prepare(
      `INSERT INTO spb_sweep_audit (
         account_id, instance_id, prefix, objects_deleted, multipart_aborted, ts
       ) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind('acct-0018', 'instance-0018', 'users/acct-0018/instance-0018/', 2, 1, 1_000)
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
    .prepare(`SELECT COUNT(*) AS count FROM ${name}`)
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
