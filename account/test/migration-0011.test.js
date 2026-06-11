import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0011_scout_applications.sql?raw';
import { resetDb } from './helpers.js';

describe('migration 0011 scout applications', () => {
  beforeEach(async () => {
    await resetDb();
    await workerEnv.DB.prepare('DROP INDEX IF EXISTS idx_scout_applications_status').run();
    await workerEnv.DB.prepare('DROP TABLE IF EXISTS scout_applications').run();
    await workerEnv.DB
      .prepare('INSERT INTO accounts (id, primary_email_id, created_at, last_signin_at) VALUES (?, NULL, ?, ?)')
      .bind('acct-mig-0011', 1_000, 1_000)
      .run();
  });

  it('creates scout_applications constraints and index idempotently', async () => {
    await runMigration();

    await expect(tableSql()).resolves.toContain("status IN ('pending','approved','revoked')");
    await expect(indexExists('idx_scout_applications_status')).resolves.toBe(true);
    await expect(insertApplication({ status: 'bad' })).rejects.toThrow(/CHECK constraint failed/i);
    await expect(insertApplication({ status: 'pending' })).resolves.toBeUndefined();
    await expect(insertApplication({ status: 'approved' })).rejects.toThrow(/UNIQUE constraint failed|PRIMARY KEY/i);
    await expect(runMigration()).resolves.toBeUndefined();
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

async function insertApplication({ status }) {
  await workerEnv.DB
    .prepare(
      `INSERT INTO scout_applications (
         account_id, status, created_at, updated_at
       ) VALUES (?, ?, ?, ?)`
    )
    .bind('acct-mig-0011', status, 2_000, 2_000)
    .run();
}

async function tableSql() {
  const row = await workerEnv.DB
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'scout_applications'")
    .first();
  return row?.sql || '';
}

async function indexExists(name) {
  const row = await workerEnv.DB
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
    .bind(name)
    .first();
  return Boolean(row);
}
