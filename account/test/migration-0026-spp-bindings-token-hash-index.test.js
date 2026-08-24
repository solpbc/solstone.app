import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0026_spp_bindings_token_hash_index.sql?raw';
import { resetDb } from './helpers.js';

// The tables as they stood before 0026: an account_id index and the composite
// primary key, and nothing covering token_hash.
const PRE_0026 = {
  spp_bindings: `CREATE TABLE spp_bindings (
    account_id TEXT NOT NULL,
    instance_id TEXT NOT NULL,
    token_hash TEXT,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    consent_acked_at INTEGER,
    consent_disclosure_version TEXT,
    PRIMARY KEY (account_id, instance_id),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
  )`,
  spb_bindings: `CREATE TABLE spb_bindings (
    account_id TEXT NOT NULL,
    instance_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    token_hash TEXT,
    lapsed_at INTEGER,
    PRIMARY KEY (account_id, instance_id),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
  )`,
};

const FINDER_SQL = {
  spp_bindings:
    'SELECT account_id, instance_id FROM spp_bindings WHERE token_hash = ? AND token_hash IS NOT NULL',
  spb_bindings:
    'SELECT account_id, instance_id, lapsed_at FROM spb_bindings WHERE token_hash = ? AND token_hash IS NOT NULL',
};

describe('migration 0026 spp/spb bindings token_hash index', () => {
  beforeEach(async () => {
    await resetDb();
    await installPre0026Tables();
    await workerEnv.DB
      .prepare('INSERT INTO accounts (id, primary_email_id, created_at, last_signin_at) VALUES (?, NULL, ?, ?)')
      .bind('acct-0026', 1_000, 1_000)
      .run();
  });

  it.each(['spp_bindings', 'spb_bindings'])(
    'turns the %s token_hash finder from a table scan into an indexed search',
    async (table) => {
      // Red half: this is the defect the migration exists to remove. If a future
      // change makes the pre-migration state already indexed, this assertion fails
      // and the test stops proving anything — that is intentional.
      await expect(queryPlan(table)).resolves.toMatch(/SCAN/);

      await runMigration();

      const plan = await queryPlan(table);
      expect(plan).toMatch(/SEARCH/);
      expect(plan).toContain(`idx_${table}_token_hash`);
      expect(plan).not.toMatch(/SCAN/);
    }
  );

  it.each(['spp_bindings', 'spb_bindings'])('rejects a duplicate token_hash on %s', async (table) => {
    await runMigration();
    await insertBinding(table, 'instance-a', 'shared-token-hash');

    await expect(insertBinding(table, 'instance-b', 'shared-token-hash')).rejects.toThrow(
      /UNIQUE constraint failed/i
    );
  });

  it.each(['spp_bindings', 'spb_bindings'])(
    'still allows many unbound rows on %s, because the index is partial',
    async (table) => {
      await runMigration();

      await insertBinding(table, 'instance-a', null);
      await insertBinding(table, 'instance-b', null);

      await expect(countRows(table)).resolves.toBe(2);
    }
  );

  it('is idempotent — re-applying is safe and preserves rows', async () => {
    await runMigration();
    await insertBinding('spp_bindings', 'instance-a', 'token-hash-0026');

    await expect(runMigration()).resolves.toBeUndefined();

    await expect(countRows('spp_bindings')).resolves.toBe(1);
    await expect(queryPlan('spp_bindings')).resolves.toMatch(/SEARCH/);
  });

  it('applies cleanly on top of a table that already holds bound rows', async () => {
    await insertBinding('spp_bindings', 'instance-a', 'token-hash-a');
    await insertBinding('spp_bindings', 'instance-b', 'token-hash-b');

    await runMigration();

    await expect(countRows('spp_bindings')).resolves.toBe(2);
    await expect(queryPlan('spp_bindings')).resolves.toMatch(/SEARCH/);
  });
});

async function installPre0026Tables() {
  for (const [table, createSql] of Object.entries(PRE_0026)) {
    await workerEnv.DB.prepare(`DROP TABLE IF EXISTS ${table}`).run();
    await workerEnv.DB.prepare(createSql).run();
    await workerEnv.DB
      .prepare(`CREATE INDEX IF NOT EXISTS idx_${table}_account_id ON ${table}(account_id)`)
      .run();
  }
}

async function runMigration() {
  for (const statement of migration
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)) {
    await workerEnv.DB.prepare(statement).run();
  }
}

async function queryPlan(table) {
  const { results } = await workerEnv.DB
    .prepare(`EXPLAIN QUERY PLAN ${FINDER_SQL[table]}`)
    .bind('any-token-hash')
    .all();
  return results.map((row) => row.detail).join(' | ');
}

function insertBinding(table, instanceId, tokenHash) {
  return workerEnv.DB
    .prepare(
      `INSERT INTO ${table} (account_id, instance_id, token_hash, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind('acct-0026', instanceId, tokenHash, 2_000, 3_000)
    .run();
}

async function countRows(table) {
  const row = await workerEnv.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first();
  return row.n;
}
