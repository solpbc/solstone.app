import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0021_spp_mint_audit.sql?raw';
import { resetDb } from './helpers.js';

describe('migration 0021 spp mint audit', () => {
  beforeEach(async () => {
    await resetDb();
    await workerEnv.DB.prepare('DROP TABLE IF EXISTS spp_mint_audit').run();
  });

  it('creates the constrained audit table and index, preserves rows, and can re-run', async () => {
    await runMigration();

    await expect(tableExists('spp_mint_audit')).resolves.toBe(true);
    await expect(tableColumns('spp_mint_audit')).resolves.toEqual([
      'account_id',
      'instance_id',
      'scope',
      'outcome',
      'ts',
    ]);
    await expect(indexExists('idx_spp_mint_audit_account_id')).resolves.toBe(true);
    await expect(insertAudit({ instanceId: 'instance-minted', scope: 'inference', outcome: 'minted' })).resolves.toBeUndefined();
    await expect(insertAudit({ instanceId: 'instance-null-scope', scope: null, outcome: 'refused_entitlement' })).resolves.toBeUndefined();
    await expect(insertAudit({ instanceId: 'instance-bogus', scope: 'inference', outcome: 'bogus' })).rejects.toThrow(/CHECK constraint failed/i);
    await expect(insertAudit({ instanceId: 'instance-refused-scope', scope: 'inference', outcome: 'refused_scope' })).rejects.toThrow(/CHECK constraint failed/i);
    await expect(insertAudit({ instanceId: 'instance-backup', scope: 'backup', outcome: 'minted' })).rejects.toThrow(/CHECK constraint failed/i);

    await runMigration();

    await expect(auditRows()).resolves.toEqual([
      {
        account_id: 'acct-0021',
        instance_id: 'instance-minted',
        scope: 'inference',
        outcome: 'minted',
        ts: 1_000,
      },
      {
        account_id: 'acct-0021',
        instance_id: 'instance-null-scope',
        scope: null,
        outcome: 'refused_entitlement',
        ts: 1_000,
      },
    ]);
    await expect(indexExists('idx_spp_mint_audit_account_id')).resolves.toBe(true);
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

async function insertAudit({ instanceId, scope, outcome }) {
  await workerEnv.DB
    .prepare(
      `INSERT INTO spp_mint_audit (account_id, instance_id, scope, outcome, ts)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind('acct-0021', instanceId, scope, outcome, 1_000)
    .run();
}

async function auditRows() {
  const { results } = await workerEnv.DB
    .prepare(
      `SELECT account_id, instance_id, scope, outcome, ts
       FROM spp_mint_audit
       ORDER BY rowid ASC`
    )
    .all();
  return results;
}

async function tableExists(name) {
  const row = await workerEnv.DB
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(name)
    .first();
  return Boolean(row);
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
