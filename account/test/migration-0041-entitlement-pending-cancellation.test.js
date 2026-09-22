import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0041_entitlement_pending_cancellation.sql?raw';
import { resetDb } from './helpers.js';

describe('migration 0041 entitlement pending cancellation', () => {
  beforeEach(async () => {
    await resetDb();
    await workerEnv.DB.prepare('DROP TABLE entitlements').run();
    await workerEnv.DB.prepare(`
      CREATE TABLE entitlements (
        account_id TEXT NOT NULL,
        service TEXT NOT NULL,
        status TEXT NOT NULL,
        current_period_end INTEGER,
        source TEXT NOT NULL,
        source_ref TEXT,
        enabled_at INTEGER,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (account_id, service)
      )
    `).run();
    await workerEnv.DB.prepare(`
      INSERT INTO entitlements (
        account_id, service, status, current_period_end, source, source_ref, enabled_at, updated_at
      ) VALUES ('acct-0041', 'spl_hosted', 'active', 1800000000, 'stripe', 'sub_0041', 1000, 2000)
    `).run();
  });

  it('preserves existing rows and defaults them to not pending', async () => {
    await runMigration();

    await expect(workerEnv.DB.prepare(`
      SELECT source_ref, cancel_at_period_end FROM entitlements WHERE account_id = 'acct-0041'
    `).first()).resolves.toEqual({ source_ref: 'sub_0041', cancel_at_period_end: 0 });
    await workerEnv.DB.prepare(`
      UPDATE entitlements SET cancel_at_period_end = 1 WHERE account_id = 'acct-0041'
    `).run();
    await expect(workerEnv.DB.prepare(`
      UPDATE entitlements SET cancel_at_period_end = 2 WHERE account_id = 'acct-0041'
    `).run()).rejects.toThrow(/CHECK constraint failed/i);
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
