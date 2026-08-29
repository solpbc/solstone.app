import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0028_account_deletions.sql?raw';
import schema from '../schema.sql?raw';
import { resetDb } from './helpers.js';

const deletionBlockStart = '-- Owner-initiated account deletion foundation. Phase meanings:';
const deletionBlockEnd = 'CREATE INDEX IF NOT EXISTS idx_account_deletion_completions_expires_at\n  ON account_deletion_completions(expires_at);';

describe('migration 0028 account deletions', () => {
  beforeEach(async () => {
    await resetDb();
    for (const table of ['account_deletion_completions', 'account_deletion_service_ops', 'account_deletion_proofs', 'account_deletions', 'spb_mint_reservations']) {
      await workerEnv.DB.prepare(`DROP TABLE IF EXISTS ${table}`).run();
    }
  });

  it('creates all deletion foundation tables', async () => {
    await runMigration();
    await expect(tableExists('account_deletions')).resolves.toBe(true);
    await expect(tableExists('account_deletion_proofs')).resolves.toBe(true);
    await expect(tableExists('account_deletion_service_ops')).resolves.toBe(true);
    await expect(tableExists('spb_mint_reservations')).resolves.toBe(true);
    await expect(tableExists('account_deletion_completions')).resolves.toBe(true);
    await expect(columns('account_deletion_completions')).resolves.toEqual([
      'token_hash', 'state', 'completed_at', 'expires_at',
    ]);
  });

  it('keeps the immutable deletion foundation byte-identical apart from its later service-op state rewrite', () => {
    expect(normalizedDeletionSchemaBlock(schema)).toBe(normalizedDeletionSchemaBlock(migration));
  });

  it('enforces the deletion phase and identifier-free completion shape', async () => {
    await runMigration();
    await expect(workerEnv.DB.prepare(
      "INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, cancellation_deadline_at, status_token_hash) VALUES ('bad', 'a', 'bad', 1, 2, 'status')"
    ).run()).rejects.toThrow(/CHECK constraint failed/i);
    await workerEnv.DB.prepare(
      "INSERT INTO account_deletion_completions (token_hash, state, completed_at, expires_at) VALUES ('token', 'complete', 1, 2)"
    ).run();
    await expect(workerEnv.DB.prepare(
      "INSERT INTO account_deletion_completions (token_hash, state, completed_at, expires_at) VALUES ('wrong', 'pending', 1, 2)"
    ).run()).rejects.toThrow(/CHECK constraint failed/i);
  });
});

async function runMigration() {
  const executable = migration.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
  for (const statement of executable.split(';').map((part) => part.trim()).filter(Boolean)) {
    await workerEnv.DB.prepare(statement).run();
  }
}

async function tableExists(name) {
  return Boolean(await workerEnv.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").bind(name).first());
}

async function columns(name) {
  const { results } = await workerEnv.DB.prepare(`SELECT name FROM pragma_table_info('${name}')`).all();
  return results.map((row) => row.name);
}

function deletionSchemaBlock(source) {
  const start = source.indexOf(deletionBlockStart);
  const end = source.indexOf(deletionBlockEnd, start);
  if (start < 0 || end < 0) throw new Error('deletion migration block is missing');
  return source.slice(start, end + deletionBlockEnd.length);
}

function normalizedDeletionSchemaBlock(source) {
  return deletionSchemaBlock(source).replace(
    /CREATE TABLE IF NOT EXISTS account_deletion_service_ops \([\s\S]*?\n\);\n\nCREATE INDEX IF NOT EXISTS idx_account_deletion_service_ops_due\n  ON account_deletion_service_ops\(operation_id, state, next_attempt_at\);\n\n/,
    '',
  );
}
