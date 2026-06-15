import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0013_billing_entitlements.sql?raw';
import { resetDb } from './helpers.js';

describe('migration 0013 billing entitlements', () => {
  beforeEach(async () => {
    await resetDb();
    await workerEnv.DB.prepare('DROP TABLE IF EXISTS spl_bindings').run();
    await workerEnv.DB.prepare('DROP TABLE IF EXISTS stripe_customers').run();
    await workerEnv.DB.prepare('DROP TABLE IF EXISTS entitlements').run();
    for (const id of ['acct-0013-a', 'acct-0013-b', 'acct-0013-c', 'acct-0013-d']) {
      await workerEnv.DB
        .prepare('INSERT INTO accounts (id, primary_email_id, created_at, last_signin_at) VALUES (?, NULL, ?, ?)')
        .bind(id, 1_000, 1_000)
        .run();
    }
  });

  it('creates billing tables, constraints, indexes, and can re-run', async () => {
    await runMigration();

    await expect(tableExists('entitlements')).resolves.toBe(true);
    await expect(tableExists('stripe_customers')).resolves.toBe(true);
    await expect(tableExists('spl_bindings')).resolves.toBe(true);
    await expect(indexExists('idx_spl_bindings_account_id')).resolves.toBe(true);

    await expect(insertEntitlement({ accountId: 'acct-0013-a', source: 'apple' })).resolves.toBeUndefined();
    await expect(insertEntitlement({ accountId: 'acct-0013-b', source: 'google' })).resolves.toBeUndefined();
    await expect(insertEntitlement({ accountId: 'acct-0013-c', source: 'paypal' })).rejects.toThrow(/CHECK constraint failed/i);
    await expect(insertEntitlement({ accountId: 'acct-0013-c', service: 'spl' })).rejects.toThrow(/CHECK constraint failed/i);
    await expect(insertEntitlement({ accountId: 'acct-0013-c', status: 'trial' })).rejects.toThrow(/CHECK constraint failed/i);
    await expect(insertEntitlement({ accountId: 'acct-0013-a' })).rejects.toThrow(/UNIQUE constraint failed/i);

    await insertStripeCustomer('acct-0013-a', 'cus_duplicate');
    await expect(insertStripeCustomer('acct-0013-b', 'cus_duplicate')).rejects.toThrow(/UNIQUE constraint failed/i);

    await runMigration();
    await expect(tableExists('entitlements')).resolves.toBe(true);
    await expect(indexExists('idx_spl_bindings_account_id')).resolves.toBe(true);
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

async function insertEntitlement({
  accountId,
  service = 'spl_hosted',
  status = 'active',
  source = 'stripe',
} = {}) {
  await workerEnv.DB
    .prepare(
      `INSERT INTO entitlements (
         account_id, service, status, current_period_end, source, source_ref, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(accountId, service, status, 1_800_000_000, source, 'source-ref', 2_000)
    .run();
}

async function insertStripeCustomer(accountId, stripeCustomerId) {
  await workerEnv.DB
    .prepare('INSERT INTO stripe_customers (account_id, stripe_customer_id, created_at) VALUES (?, ?, ?)')
    .bind(accountId, stripeCustomerId, 2_000)
    .run();
}

async function tableExists(name) {
  const row = await workerEnv.DB
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(name)
    .first();
  return Boolean(row);
}

async function indexExists(name) {
  const row = await workerEnv.DB
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
    .bind(name)
    .first();
  return Boolean(row);
}
