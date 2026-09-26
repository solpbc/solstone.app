import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0046_solstone_me_acme_pin.sql?raw';
import { resetDb } from './helpers.js';

describe('migration 0046 solstone.me ACME pin', () => {
  beforeEach(async () => {
    await resetDb();
    await workerEnv.DB.prepare('DROP TABLE IF EXISTS solstone_me_dns_capacity_alerts').run();
    await workerEnv.DB.prepare('DROP TABLE IF EXISTS mcp_bridge_bindings').run();
    await workerEnv.DB.prepare('DROP TABLE IF EXISTS sme_bindings').run();

    await workerEnv.DB.prepare(`
      CREATE TABLE sme_bindings (
        account_id TEXT NOT NULL,
        instance_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        consent_acked_at INTEGER NOT NULL,
        consent_disclosure_version TEXT NOT NULL,
        PRIMARY KEY (account_id, instance_id),
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      )
    `).run();

    await workerEnv.DB.prepare(`
      CREATE TABLE mcp_bridge_bindings (
        account_id TEXT NOT NULL,
        instance_id TEXT NOT NULL,
        label TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (account_id, instance_id),
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      )
    `).run();

    await workerEnv.DB.prepare(
      'INSERT INTO accounts (id, created_at, last_signin_at) VALUES (?, ?, ?)'
    ).bind('acct-0046', 1000, 1000).run();

    await workerEnv.DB.prepare(`
      INSERT INTO sme_bindings (
        account_id, instance_id, created_at, last_seen_at, consent_acked_at, consent_disclosure_version
      ) VALUES ('acct-0046', 'inst-0046', 1000, 1000, 1000, 'v1')
    `).run();

    await workerEnv.DB.prepare(`
      INSERT INTO mcp_bridge_bindings (
        account_id, instance_id, label, created_at
      ) VALUES ('acct-0046', 'inst-0046', 'abcdef23', 1000)
    `).run();
  });

  it('preserves existing rows, adds new columns as null, and creates solstone_me_dns_capacity_alerts', async () => {
    await runMigration();

    const smeRow = await workerEnv.DB.prepare(
      'SELECT * FROM sme_bindings WHERE account_id = ?'
    ).bind('acct-0046').first();
    expect(smeRow).toMatchObject({
      account_id: 'acct-0046',
      instance_id: 'inst-0046',
      journal_update_refused_at: null,
    });

    const bridgeRow = await workerEnv.DB.prepare(
      'SELECT * FROM mcp_bridge_bindings WHERE account_id = ?'
    ).bind('acct-0046').first();
    expect(bridgeRow).toMatchObject({
      account_id: 'acct-0046',
      instance_id: 'inst-0046',
      label: 'abcdef23',
      acme_account_uri: null,
      acme_account_pinned_at: null,
      acme_account_replaced_at: null,
      dns_lease_generation: null,
      dns_lease_expires_at: null,
      dns_verification_state: null,
      dns_verified_at: null,
      dns_verified_uri: null,
      dns_verified_addresses: null,
    });

    // Check table info for solstone_me_dns_capacity_alerts
    const { results: alertCols } = await workerEnv.DB.prepare(
      'PRAGMA table_info(solstone_me_dns_capacity_alerts)'
    ).all();
    const alertColNames = alertCols.map((col) => col.name);
    expect(alertColNames).toEqual([
      'slot',
      'alerted_at',
    ]);

    // Test writing capacity alert
    await workerEnv.DB.prepare(`
      INSERT INTO solstone_me_dns_capacity_alerts (slot, alerted_at) VALUES (?, ?)
    `).bind('capacity', 1700000100).run();

    // Invalid slot should fail check constraint
    await expect(workerEnv.DB.prepare(`
      INSERT INTO solstone_me_dns_capacity_alerts (slot, alerted_at) VALUES (?, ?)
    `).bind('other', 1700000200).run())
      .rejects.toThrow(/CHECK constraint failed/i);
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
