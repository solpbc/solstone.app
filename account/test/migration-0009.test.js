import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0009_service_handoffs.sql?raw';
import { resetDb } from './helpers.js';

const RETIRED_TABLES = [
  ['oauth', 'codes'].join('_'),
  ['oauth', 'tokens'].join('_'),
  ['device', 'codes'].join('_'),
];

describe('migration 0009 service handoffs', () => {
  beforeEach(async () => {
    await resetDb();
    for (const table of ['service_handoffs', 'enable_scout_codes', ...RETIRED_TABLES]) {
      await workerEnv.DB.prepare(`DROP TABLE IF EXISTS ${table}`).run();
    }
    for (const table of RETIRED_TABLES) {
      await workerEnv.DB.prepare(`CREATE TABLE ${table} (id TEXT PRIMARY KEY)`).run();
    }
  });

  it('creates service handoff tables and drops the retired OAuth tables', async () => {
    await runMigration();

    await expect(tableExists('service_handoffs')).resolves.toBe(true);
    await expect(tableExists('enable_scout_codes')).resolves.toBe(true);
    for (const table of RETIRED_TABLES) {
      await expect(tableExists(table)).resolves.toBe(false);
    }

    await expect(columnTypes('service_handoffs')).resolves.toMatchObject({
      handoff_hash: 'TEXT',
      account_id: 'TEXT',
      service: 'TEXT',
      payload_encrypted: 'BLOB',
      created_at: 'INTEGER',
      expires_at: 'INTEGER',
      consumed_at: 'INTEGER',
    });
    await expect(Object.keys(await columnTypes('enable_scout_codes'))).not.toContain('code_display');
  });

  it('is idempotent and creates the lookup indexes', async () => {
    await runMigration();
    await runMigration();

    await expect(indexExists('idx_service_handoffs_account_id')).resolves.toBe(true);
    await expect(indexExists('idx_service_handoffs_expires_at')).resolves.toBe(true);
    await expect(indexExists('idx_enable_scout_codes_active_code_hash')).resolves.toBe(true);
    await expect(indexExists('idx_enable_scout_codes_expires_at')).resolves.toBe(true);
    await expect(indexExists('idx_enable_scout_codes_account_id')).resolves.toBe(true);
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

async function columnTypes(table) {
  const { results } = await workerEnv.DB.prepare(`PRAGMA table_info('${table}')`).all();
  return Object.fromEntries((results || []).map((row) => [row.name, row.type]));
}
