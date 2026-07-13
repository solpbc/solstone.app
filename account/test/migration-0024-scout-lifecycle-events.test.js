import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0024_scout_lifecycle_events.sql?raw';
import { makeTestEnv, resetDb, seedAccount, seedScoutApplication } from './helpers.js';

describe('migration 0024 Scout lifecycle events', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('creates an empty event table, preserves legacy applications, and safely re-applies', async () => {
    const account = await seedAccount({ email: 'migration-0024@example.com', testEnv: makeTestEnv() });
    await seedScoutApplication({
      accountId: account.accountId,
      status: 'approved',
      applied_at: 1_100,
      approved_at: 1_200,
      createdAt: 1_000,
    });
    const before = await applicationRow(account.accountId);
    await workerEnv.DB.prepare('DROP TABLE scout_lifecycle_events').run();

    await runMigration();

    await expect(tableColumns('scout_lifecycle_events')).resolves.toEqual([
      'correlation_id',
      'account_id',
      'sequence',
      'action',
      'from_status',
      'to_status',
      'actor_kind',
      'actor_principal',
      'reason_code',
      'occurred_at',
    ]);
    await expect(applicationRow(account.accountId)).resolves.toEqual(before);
    await expect(eventRows()).resolves.toEqual([]);

    await expect(runMigration()).resolves.toBeUndefined();
    await expect(applicationRow(account.accountId)).resolves.toEqual(before);
    await expect(eventRows()).resolves.toEqual([]);
  });

  it.each([
    ['action', { action: 'invalid' }],
    ['from_status', { fromStatus: 'invalid' }],
    ['to_status', { toStatus: 'invalid' }],
    ['actor_kind', { actorKind: 'invalid' }],
    ['reason_code', { reasonCode: 'invalid' }],
  ])('rejects an invalid %s at the storage boundary', async (_column, overrides) => {
    const account = await seedAccount({ testEnv: makeTestEnv() });

    await expect(insertEvent(account.accountId, overrides)).rejects.toThrow(/CHECK constraint failed/i);
    await expect(eventRows()).resolves.toEqual([]);
  });

  it('rejects duplicate correlation ids and account sequences', async () => {
    const account = await seedAccount({ testEnv: makeTestEnv() });
    await insertEvent(account.accountId, { correlationId: 'event-1', sequence: 1 });

    await expect(insertEvent(account.accountId, {
      correlationId: 'event-1',
      sequence: 2,
    })).rejects.toThrow(/UNIQUE constraint failed/i);
    await expect(insertEvent(account.accountId, {
      correlationId: 'event-2',
      sequence: 1,
    })).rejects.toThrow(/UNIQUE constraint failed/i);
    await expect(eventRows()).resolves.toHaveLength(1);
  });

  it('cascades lifecycle events when the account is deleted', async () => {
    const accountId = crypto.randomUUID();
    await workerEnv.DB
      .prepare('INSERT INTO accounts (id, primary_email_id, created_at, last_signin_at) VALUES (?, NULL, ?, ?)')
      .bind(accountId, 1_000, 1_000)
      .run();
    await insertEvent(accountId);

    await workerEnv.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(accountId).run();

    await expect(eventRows()).resolves.toEqual([]);
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

async function insertEvent(accountId, {
  correlationId = crypto.randomUUID(),
  sequence = 1,
  action = 'apply',
  fromStatus = 'absent',
  toStatus = 'pending',
  actorKind = 'owner',
  actorPrincipal = accountId,
  reasonCode = 'owner_application',
} = {}) {
  await workerEnv.DB
    .prepare(
      `INSERT INTO scout_lifecycle_events (
         correlation_id, account_id, sequence, action, from_status, to_status,
         actor_kind, actor_principal, reason_code, occurred_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      correlationId,
      accountId,
      sequence,
      action,
      fromStatus,
      toStatus,
      actorKind,
      actorPrincipal,
      reasonCode,
      1_000
    )
    .run();
}

async function applicationRow(accountId) {
  return workerEnv.DB.prepare('SELECT * FROM scout_applications WHERE account_id = ?').bind(accountId).first();
}

async function eventRows() {
  const { results } = await workerEnv.DB.prepare('SELECT * FROM scout_lifecycle_events ORDER BY sequence').all();
  return results;
}

async function tableColumns(name) {
  const { results } = await workerEnv.DB.prepare(`SELECT name FROM pragma_table_info('${name}')`).all();
  return results.map((row) => row.name);
}
