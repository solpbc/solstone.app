import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0014_entitlements_comp_source.sql?raw';
import { resetDb } from './helpers.js';

describe('migration 0014 entitlements comp source', () => {
  beforeEach(async () => {
    await resetDb();
    for (const id of ['acct-0014-stripe', 'acct-0014-apple', 'acct-0014-google', 'acct-0014-comp', 'acct-0014-paypal']) {
      await workerEnv.DB
        .prepare('INSERT INTO accounts (id, primary_email_id, created_at, last_signin_at) VALUES (?, NULL, ?, ?)')
        .bind(id, 1_000, 1_000)
        .run();
    }
  });

  it('widens entitlements source to comp, preserves rows, and can re-run', async () => {
    await installOldEntitlements();
    await insertEntitlement({ accountId: 'acct-0014-stripe', source: 'stripe' });
    await insertEntitlement({ accountId: 'acct-0014-apple', source: 'apple' });
    await insertEntitlement({ accountId: 'acct-0014-google', source: 'google' });

    await runMigration();

    await expect(entitlementSources()).resolves.toEqual(['apple', 'google', 'stripe']);
    await expect(insertEntitlement({ accountId: 'acct-0014-comp', source: 'comp' })).resolves.toBeUndefined();
    await expect(insertEntitlement({ accountId: 'acct-0014-paypal', source: 'paypal' })).rejects.toThrow(/CHECK constraint failed/i);

    await runMigration();
    await expect(entitlementSources()).resolves.toEqual(['apple', 'comp', 'google', 'stripe']);
  });
});

async function installOldEntitlements() {
  await workerEnv.DB.prepare('DROP TABLE IF EXISTS entitlements_new').run();
  await workerEnv.DB.prepare('DROP TABLE IF EXISTS entitlements').run();
  await workerEnv.DB
    .prepare(
      `CREATE TABLE entitlements (
        account_id TEXT NOT NULL,
        service TEXT NOT NULL CHECK (service IN ('spl_hosted')),
        status TEXT NOT NULL CHECK (status IN ('active','past_due','canceled','lapsed')),
        current_period_end INTEGER,
        source TEXT NOT NULL CHECK (source IN ('stripe','apple','google')),
        source_ref TEXT,
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

async function insertEntitlement({
  accountId,
  source,
} = {}) {
  await workerEnv.DB
    .prepare(
      `INSERT INTO entitlements (
         account_id, service, status, current_period_end, source, source_ref, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(accountId, 'spl_hosted', 'active', 1_800_000_000, source, 'source-ref', 2_000)
    .run();
}

async function entitlementSources() {
  const { results } = await workerEnv.DB
    .prepare('SELECT source FROM entitlements ORDER BY source')
    .all();
  return results.map((row) => row.source);
}
