import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0032_account_deletion_proofs_export.sql?raw';
import { resetDb } from './helpers.js';

const migrations = Object.entries(import.meta.glob('../migrations/*.sql', {
  eager: true,
  query: '?raw',
  import: 'default',
})).sort(([left], [right]) => left.localeCompare(right));

// account_deletion_proofs is separately migrated again by 0035 (adds the
// 'credential-change' purpose), so this file no longer asserts 0032's rebuilt
// table is byte-identical to the canonical schema.sql — 0035's own migration
// test owns that assertion now. Convention: migration-0028's test carves the
// same table out of its own byte-identical check for the same reason.
describe('migration 0032 account deletion proofs export purpose', () => {
  beforeEach(async () => {
    await resetDb();
    const { results } = await workerEnv.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND substr(name, 1, 4) != '_cf_'"
    ).all();
    for (const { name } of results) await workerEnv.DB.prepare(`DROP TABLE ${name}`).run();
  });

  it('preserves existing proof rows and admits export without widening other coordinates', async () => {
    await applyThrough('0031_mcp_bridge_hostname_authority.sql');
    await workerEnv.DB.prepare(
      `INSERT INTO account_deletion_proofs (
         token_hash, account_id, session_id_hash, purpose, method, issued_at,
         expires_at, verified, consumed, attempt_count, otp_code_hash
       ) VALUES ('proof', 'account', 'session', 'delete', 'otp', 1, 2, 1, 0, 3, 'code')`
    ).run();
    await runMigration(migration);

    await expect(workerEnv.DB.prepare(
      "SELECT * FROM account_deletion_proofs WHERE token_hash = 'proof'"
    ).first()).resolves.toMatchObject({ purpose: 'delete', method: 'otp', verified: 1, attempt_count: 3 });
    await expect(workerEnv.DB.prepare(
      `INSERT INTO account_deletion_proofs (
         token_hash, account_id, session_id_hash, purpose, method, issued_at,
         expires_at, otp_code_hash
       ) VALUES ('export-proof', 'account', 'session', 'export', 'otp', 1, 2, 'code')`
    ).run()).resolves.toBeTruthy();
    await expect(workerEnv.DB.prepare(
      `INSERT INTO account_deletion_proofs (
         token_hash, account_id, session_id_hash, purpose, method, issued_at,
         expires_at, otp_code_hash
       ) VALUES ('bad-proof', 'account', 'session', 'other', 'otp', 1, 2, 'code')`
    ).run()).rejects.toThrow(/CHECK constraint failed/i);
  });
});

async function applyThrough(lastName) {
  for (const [path, source] of migrations) {
    await runMigration(source);
    if (path.split('/').at(-1) === lastName) return;
  }
  throw new Error(`missing migration ${lastName}`);
}

async function runMigration(source) {
  const executable = source.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
  for (const statement of executable.split(';').map((part) => part.trim()).filter(Boolean)) {
    await workerEnv.DB.prepare(statement).run();
  }
}
