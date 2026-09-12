import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import schema from '../schema.sql?raw';
import migration from '../migrations/0032_account_deletion_proofs_export.sql?raw';
import { resetDb } from './helpers.js';

const migrations = Object.entries(import.meta.glob('../migrations/*.sql', {
  eager: true,
  query: '?raw',
  import: 'default',
})).sort(([left], [right]) => left.localeCompare(right));

describe('migration 0032 account deletion proofs export purpose', () => {
  beforeEach(async () => {
    await resetDb();
    const { results } = await workerEnv.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
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

  it('keeps the rebuilt table and lookup index byte-identical to canonical schema', async () => {
    await applyThrough('0032_account_deletion_proofs_export.sql');
    expect(normalizedTableBlock(migration, 'account_deletion_proofs_new').replaceAll('account_deletion_proofs_new', 'account_deletion_proofs'))
      .toBe(normalizedTableBlock(schema, 'account_deletion_proofs'));
    expect(normalizedIndex(migration, 'idx_account_deletion_proofs_lookup'))
      .toBe(normalizedIndex(schema, 'idx_account_deletion_proofs_lookup'));
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

function normalizedTableBlock(source, table) {
  const match = source.match(new RegExp(`CREATE TABLE(?: IF NOT EXISTS)? ${table} \\(\\n[\\s\\S]*?\\n\\);`));
  if (!match) throw new Error(`missing table ${table}`);
  return match[0].replace(/^CREATE TABLE (?!IF NOT EXISTS )/, 'CREATE TABLE IF NOT EXISTS ');
}

function normalizedIndex(source, index) {
  const match = source.match(new RegExp(`CREATE INDEX IF NOT EXISTS ${index}\\s+ON [^;]+;`));
  if (!match) throw new Error(`missing index ${index}`);
  return match[0];
}
