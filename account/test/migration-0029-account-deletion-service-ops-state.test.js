import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
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

  it('preserves the latest service operation row across the rebuild', async () => {
    await applyThrough('0028_account_deletions.sql');
    await insertServiceOperation('superseded', 'retryable', { serviceOperationId: 'relay-superseded' });
    await insertServiceOperation('current', 'complete', { serviceOperationId: 'relay-current' });
    await expect(latestServiceOperation()).resolves.toMatchObject({ service_operation_id: 'relay-current' });

    await applyThrough('0029_account_deletion_service_ops_state.sql', '0028_account_deletions.sql');

    await expect(latestServiceOperation()).resolves.toMatchObject({ service_operation_id: 'relay-current' });
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

async function insertServiceOperation(id, state, { serviceOperationId = 'service-operation' } = {}) {
  return workerEnv.DB.prepare(
    `INSERT INTO account_deletion_service_ops (
       id, operation_id, service, service_operation_id, request_digest, state,
       envelope_expires_at, next_attempt_at, attempt_count
     ) VALUES (?, 'operation', 'relay', ?, 'digest', ?, 1, 1, 0)`
  ).bind(id, serviceOperationId, state).run();
}

async function serviceOperation(id) {
  return workerEnv.DB.prepare(
    'SELECT id, state FROM account_deletion_service_ops WHERE id = ?'
  ).bind(id).first();
}

async function latestServiceOperation() {
  return workerEnv.DB.prepare(
    "SELECT service_operation_id FROM account_deletion_service_ops WHERE operation_id = 'operation' AND service = 'relay' ORDER BY rowid DESC LIMIT 1"
  ).first();
}
