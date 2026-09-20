import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0036_spa_entitlement.sql?raw';
import { resetDb } from './helpers.js';

describe('migration 0036 spa entitlement', () => {
  beforeEach(async () => {
    await resetDb();
    await workerEnv.DB.prepare('DROP TABLE IF EXISTS spa_bindings').run();
    await installPost0035Entitlements();
    for (const id of ['acct-0036-spl', 'acct-0036-spa', 'acct-0036-foo']) {
      await workerEnv.DB
        .prepare('INSERT INTO accounts (id, primary_email_id, created_at, last_signin_at) VALUES (?, NULL, ?, ?)')
        .bind(id, 1_000, 1_000)
        .run();
    }
  });

  it('widens entitlement service, preserves rows, creates spa bindings that require consent, and can re-run', async () => {
    await insertEntitlement({ accountId: 'acct-0036-spl', service: 'spl_hosted', enabledAt: 1_234 });

    await runMigration();

    await expect(entitlementRow('acct-0036-spl', 'spl_hosted')).resolves.toMatchObject({
      service: 'spl_hosted',
      enabled_at: 1_234,
      source_ref: 'source-ref',
    });
    await expect(insertEntitlement({ accountId: 'acct-0036-spa', service: 'spa_hosted' })).resolves.toBeUndefined();
    await expect(insertEntitlement({ accountId: 'acct-0036-foo', service: 'foo_hosted' })).rejects.toThrow(/CHECK constraint failed/i);

    await expect(tableExists('spa_bindings')).resolves.toBe(true);
    expect(await tableColumns('spa_bindings')).toEqual([
      'account_id',
      'instance_id',
      'created_at',
      'last_seen_at',
      'consent_acked_at',
      'consent_disclosure_version',
    ]);
    await expect(indexExists('idx_spa_bindings_instance_id')).resolves.toBe(true);
    await expect(insertSpaBinding('acct-0036-spa')).resolves.toBeUndefined();
    // A binding without a consent record cannot exist.
    await expect(insertSpaBinding('acct-0036-spl', { consentAckedAt: null })).rejects.toThrow(/NOT NULL constraint failed/i);
    await expect(insertSpaBinding('acct-0036-spl', { consentDisclosureVersion: null })).rejects.toThrow(/NOT NULL constraint failed/i);

    await runMigration();

    await expect(entitlementRow('acct-0036-spl', 'spl_hosted')).resolves.toMatchObject({
      enabled_at: 1_234,
      source_ref: 'source-ref',
    });
    await expect(entitlementRow('acct-0036-spa', 'spa_hosted')).resolves.toMatchObject({ service: 'spa_hosted' });
    await expect(spaBindingRow('acct-0036-spa')).resolves.toMatchObject({
      instance_id: 'instance-0036',
      created_at: 3_000,
      last_seen_at: 4_000,
      consent_acked_at: 3_500,
      consent_disclosure_version: 'spa-consent-fixture',
    });
    await expect(indexExists('idx_spa_bindings_instance_id')).resolves.toBe(true);
  });
});

async function installPost0035Entitlements() {
  await workerEnv.DB.prepare('DROP TABLE IF EXISTS entitlements_new').run();
  await workerEnv.DB.prepare('DROP TABLE IF EXISTS entitlements').run();
  await workerEnv.DB
    .prepare(
      `CREATE TABLE entitlements (
        account_id TEXT NOT NULL,
        service TEXT NOT NULL CHECK (service IN ('spl_hosted','spb_hosted','spp_hosted')),
        status TEXT NOT NULL CHECK (status IN ('active','past_due','canceled','lapsed')),
        current_period_end INTEGER,
        source TEXT NOT NULL CHECK (source IN ('stripe','apple','google','comp')),
        source_ref TEXT,
        enabled_at INTEGER,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (account_id, service),
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      )`
    )
    .run();
}

async function runMigration() {
  const executable = migration
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  for (const statement of executable.split(';').map((part) => part.trim()).filter(Boolean)) {
    await workerEnv.DB.prepare(statement).run();
  }
}

async function insertEntitlement({ accountId, service, enabledAt = 2_345 } = {}) {
  await workerEnv.DB
    .prepare(
      `INSERT INTO entitlements (
         account_id, service, status, current_period_end, source, source_ref, enabled_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(accountId, service, 'active', 1_800_000_000, 'stripe', 'source-ref', enabledAt, 2_000)
    .run();
}

async function insertSpaBinding(accountId, {
  consentAckedAt = 3_500,
  consentDisclosureVersion = 'spa-consent-fixture',
} = {}) {
  await workerEnv.DB
    .prepare(
      `INSERT INTO spa_bindings (
         account_id, instance_id, created_at, last_seen_at, consent_acked_at, consent_disclosure_version
       ) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(accountId, 'instance-0036', 3_000, 4_000, consentAckedAt, consentDisclosureVersion)
    .run();
}

async function entitlementRow(accountId, service) {
  return workerEnv.DB
    .prepare(
      `SELECT account_id, service, status, current_period_end, source, source_ref, enabled_at, updated_at
       FROM entitlements
       WHERE account_id = ? AND service = ?`
    )
    .bind(accountId, service)
    .first();
}

async function spaBindingRow(accountId) {
  return workerEnv.DB
    .prepare(
      `SELECT account_id, instance_id, created_at, last_seen_at, consent_acked_at, consent_disclosure_version
       FROM spa_bindings
       WHERE account_id = ?`
    )
    .bind(accountId)
    .first();
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
