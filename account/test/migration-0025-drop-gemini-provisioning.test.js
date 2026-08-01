import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0025_drop_gemini_provisioning.sql?raw';
import {
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedScoutApplication,
} from './helpers.js';

describe('migration 0025 drops Gemini provisioning', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('drops both retired tables, preserves Scout state, and safely re-applies', async () => {
    const account = await seedAccount({ email: 'migration-0025@example.com', testEnv: makeTestEnv() });
    await createRetiredTables();
    await workerEnv.DB
      .prepare(
        `INSERT INTO provisioned_keys (
           id, account_id, provider, display_name, key_resource_name,
           key_string_encrypted, created_at, last_used_at, last_used_fetched_at, revoked_at
         ) VALUES (?, ?, 'gemini', ?, ?, ?, ?, ?, ?, NULL)`
      )
      .bind(
        'retired-key',
        account.accountId,
        'retired-display',
        'projects/retired/locations/global/keys/retired-key',
        'encrypted-key-material',
        1_000,
        1_100,
        1_200
      )
      .run();
    await workerEnv.DB
      .prepare('INSERT INTO gemini_reveal_acks (account_id, acked_at) VALUES (?, ?)')
      .bind(account.accountId, 1_300)
      .run();
    await seedScoutApplication({
      accountId: account.accountId,
      status: 'approved',
      applied_at: 2_000,
      approved_at: 2_100,
      createdAt: 1_900,
    });
    await seedEntitlement({
      accountId: account.accountId,
      service: 'spp_hosted',
      status: 'active',
      source: 'comp',
      updatedAt: 2_200,
    });
    const applicationBefore = await applicationRow(account.accountId);
    const entitlementBefore = await entitlementRow(account.accountId);

    await runMigration();

    await expect(retiredTableNames()).resolves.toEqual([]);
    await expect(applicationRow(account.accountId)).resolves.toEqual(applicationBefore);
    await expect(entitlementRow(account.accountId)).resolves.toEqual(entitlementBefore);

    await expect(runMigration()).resolves.toBeUndefined();
    await expect(retiredTableNames()).resolves.toEqual([]);
    await expect(applicationRow(account.accountId)).resolves.toEqual(applicationBefore);
    await expect(entitlementRow(account.accountId)).resolves.toEqual(entitlementBefore);
  });
});

async function createRetiredTables() {
  await workerEnv.DB.prepare(
    `CREATE TABLE provisioned_keys (
       id TEXT PRIMARY KEY,
       account_id TEXT NOT NULL,
       provider TEXT NOT NULL CHECK (provider IN ('gemini')),
       display_name TEXT NOT NULL,
       key_resource_name TEXT NOT NULL,
       key_string_encrypted TEXT NOT NULL,
       created_at INTEGER NOT NULL,
       last_used_at INTEGER,
       last_used_fetched_at INTEGER,
       revoked_at INTEGER,
       FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
     )`
  ).run();
  await workerEnv.DB.prepare(
    `CREATE UNIQUE INDEX idx_provisioned_keys_active_account_provider
       ON provisioned_keys(account_id, provider)
       WHERE revoked_at IS NULL`
  ).run();
  await workerEnv.DB.prepare(
    'CREATE INDEX idx_provisioned_keys_account_id ON provisioned_keys(account_id)'
  ).run();
  await workerEnv.DB.prepare(
    `CREATE TABLE gemini_reveal_acks (
       account_id TEXT NOT NULL,
       acked_at INTEGER NOT NULL,
       PRIMARY KEY (account_id, acked_at),
       FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
     )`
  ).run();
}

async function runMigration() {
  for (const statement of migration.split(';').map((part) => part.trim()).filter(Boolean)) {
    await workerEnv.DB.prepare(statement).run();
  }
}

async function retiredTableNames() {
  const { results } = await workerEnv.DB
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table'
         AND name IN ('provisioned_keys', 'gemini_reveal_acks')
       ORDER BY name`
    )
    .all();
  return results.map((row) => row.name);
}

function applicationRow(accountId) {
  return workerEnv.DB
    .prepare('SELECT * FROM scout_applications WHERE account_id = ?')
    .bind(accountId)
    .first();
}

function entitlementRow(accountId) {
  return workerEnv.DB
    .prepare('SELECT * FROM entitlements WHERE account_id = ? AND service = ?')
    .bind(accountId, 'spp_hosted')
    .first();
}
