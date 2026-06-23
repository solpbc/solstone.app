import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0018_service_handoffs_spb.sql?raw';
import { resetDb } from './helpers.js';

describe('migration 0018 service handoffs spb', () => {
  beforeEach(async () => {
    await resetDb();
    await installScoutPushSplServiceHandoffs();
    await workerEnv.DB
      .prepare('INSERT INTO accounts (id, primary_email_id, created_at, last_signin_at) VALUES (?, NULL, ?, ?)')
      .bind('acct-migration-0018', 1_000, 1_000)
      .run();
  });

  it('broadens service_handoffs to spb, preserves rows, and recreates indexes idempotently', async () => {
    const splRow = {
      handoff_hash: 'spl-hash',
      account_id: 'acct-migration-0018',
      service: 'spl',
      payload_encrypted: 'spl-payload',
      created_at: 2_000,
      expires_at: 3_000,
      consumed_at: null,
    };
    await insertHandoff(splRow);

    await runMigration();
    await expect(insertHandoff({
      handoff_hash: 'spb-hash',
      account_id: 'acct-migration-0018',
      service: 'spb',
      payload_encrypted: 'spb-payload',
      created_at: 4_000,
      expires_at: 5_000,
      consumed_at: null,
    })).resolves.toBeUndefined();
    await expect(insertHandoff({
      handoff_hash: 'bad-hash',
      account_id: 'acct-migration-0018',
      service: 'spbb',
      payload_encrypted: 'bad-payload',
      created_at: 4_000,
      expires_at: 5_000,
      consumed_at: null,
    })).rejects.toThrow(/CHECK constraint failed/i);
    await expect(handoffRow('spl-hash')).resolves.toEqual(splRow);
    await expect(indexExists('idx_service_handoffs_account_id')).resolves.toBe(true);
    await expect(indexExists('idx_service_handoffs_expires_at')).resolves.toBe(true);

    await runMigration();
    await expect(insertHandoff({
      handoff_hash: 'spb-hash-2',
      account_id: 'acct-migration-0018',
      service: 'spb',
      payload_encrypted: 'spb-payload-2',
      created_at: 6_000,
      expires_at: 7_000,
      consumed_at: null,
    })).resolves.toBeUndefined();
    await expect(handoffRow('spl-hash')).resolves.toEqual(splRow);
    await expect(indexExists('idx_service_handoffs_account_id')).resolves.toBe(true);
    await expect(indexExists('idx_service_handoffs_expires_at')).resolves.toBe(true);
    await expect(tableSql()).resolves.toContain("service IN ('scout','push','spl','spb')");
  });
});

async function installScoutPushSplServiceHandoffs() {
  await workerEnv.DB.prepare('DROP TABLE IF EXISTS service_handoffs_new').run();
  await workerEnv.DB.prepare('DROP TABLE IF EXISTS service_handoffs').run();
  await workerEnv.DB
    .prepare(
      `CREATE TABLE service_handoffs (
         handoff_hash TEXT PRIMARY KEY,
         account_id TEXT NOT NULL,
         service TEXT NOT NULL CHECK (service IN ('scout','push','spl')),
         payload_encrypted BLOB NOT NULL,
         created_at INTEGER NOT NULL,
         expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
         consumed_at INTEGER,
         FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
       )`
    )
    .run();
  await workerEnv.DB
    .prepare('CREATE INDEX idx_service_handoffs_account_id ON service_handoffs(account_id)')
    .run();
  await workerEnv.DB
    .prepare('CREATE INDEX idx_service_handoffs_expires_at ON service_handoffs(expires_at)')
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

async function insertHandoff(row) {
  await workerEnv.DB
    .prepare(
      `INSERT INTO service_handoffs (
         handoff_hash, account_id, service, payload_encrypted, created_at, expires_at, consumed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      row.handoff_hash,
      row.account_id,
      row.service,
      row.payload_encrypted,
      row.created_at,
      row.expires_at,
      row.consumed_at
    )
    .run();
}

async function handoffRow(handoffHash) {
  return workerEnv.DB
    .prepare(
      `SELECT handoff_hash, account_id, service, payload_encrypted, created_at, expires_at, consumed_at
       FROM service_handoffs
       WHERE handoff_hash = ?`
    )
    .bind(handoffHash)
    .first();
}

async function indexExists(name) {
  const row = await workerEnv.DB
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
    .bind(name)
    .first();
  return Boolean(row);
}

async function tableSql() {
  const row = await workerEnv.DB
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'service_handoffs'")
    .first();
  return row?.sql || '';
}
