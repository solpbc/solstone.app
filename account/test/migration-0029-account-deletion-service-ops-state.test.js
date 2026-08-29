import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import schema from '../schema.sql?raw';
import migration from '../migrations/0029_account_deletion_service_ops_state.sql?raw';
import { resetDb } from './helpers.js';

const migrations = Object.entries(import.meta.glob('../migrations/*.sql', {
  eager: true,
  query: '?raw',
  import: 'default',
})).sort(([left], [right]) => left.localeCompare(right));

describe('migration 0029 account deletion service operation state', () => {
  beforeEach(async () => {
    await resetDb();
    const { results } = await workerEnv.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    ).all();
    for (const { name } of results) await workerEnv.DB.prepare(`DROP TABLE ${name}`).run();
  });

  it('applies migrations through 0029 in order and maps legacy confirmed_absent rows to retryable', async () => {
    await applyThrough('0028_account_deletions.sql');
    await insertServiceOperation('legacy', 'confirmed_absent');

    await applyThrough('0029_account_deletion_service_ops_state.sql', '0028_account_deletions.sql');

    await expect(serviceOperation('legacy')).resolves.toMatchObject({ state: 'retryable' });
    await expect(insertServiceOperation('rejected', 'confirmed_absent')).rejects.toThrow(/CHECK constraint failed/i);
  });

  it('keeps the final service operation table shape byte-identical to the 0029 replacement table', () => {
    expect(normalizedServiceOpsBlock(migration)).toBe(normalizedServiceOpsBlock(schema));
  });
});

async function applyThrough(lastName, afterName = null) {
  let apply = afterName == null;
  for (const [path, source] of migrations) {
    const name = path.split('/').at(-1);
    if (afterName && name === afterName) apply = true;
    if (apply) await runMigration(source);
    if (name === lastName) return;
  }
  throw new Error(`missing migration ${lastName}`);
}

async function runMigration(source) {
  const executable = source
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  for (const statement of executable.split(';').map((part) => part.trim()).filter(Boolean)) {
    await workerEnv.DB.prepare(statement).run();
  }
}

async function insertServiceOperation(id, state) {
  return workerEnv.DB.prepare(
    `INSERT INTO account_deletion_service_ops (
       id, operation_id, service, service_operation_id, request_digest, state,
       envelope_expires_at, next_attempt_at, attempt_count
     ) VALUES (?, 'operation', 'relay', 'service-operation', 'digest', ?, 1, 1, 0)`
  ).bind(id, state).run();
}

async function serviceOperation(id) {
  return workerEnv.DB.prepare(
    'SELECT id, state FROM account_deletion_service_ops WHERE id = ?'
  ).bind(id).first();
}

function normalizedServiceOpsBlock(source) {
  const start = source.indexOf('CREATE TABLE account_deletion_service_ops_new (');
  const schemaStart = source.indexOf('CREATE TABLE IF NOT EXISTS account_deletion_service_ops (');
  const blockStart = start >= 0 ? start : schemaStart;
  if (blockStart < 0) throw new Error('account deletion service operations table is missing');
  const end = source.indexOf('\n);', blockStart);
  if (end < 0) throw new Error('account deletion service operations table is incomplete');
  return source.slice(blockStart, end + 3)
    .replace('CREATE TABLE account_deletion_service_ops_new', 'CREATE TABLE account_deletion_service_ops')
    .replace('CREATE TABLE IF NOT EXISTS account_deletion_service_ops', 'CREATE TABLE account_deletion_service_ops');
}
