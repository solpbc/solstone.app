import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0026_spb_sandbox_lifecycle.sql?raw';
import schema from '../schema.sql?raw';
import { resetDb } from './helpers.js';

const ACCOUNT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACCOUNT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const INSTANCE_ID = '11111111-1111-1111-1111-111111111111';

describe('migration 0026 SPB sandbox lifecycle', () => {
  beforeEach(async () => {
    await resetDb();
    await installPost0025Pre0026SpbShape();
    await insertAccounts();
  });

  it('adds nullable lifecycle columns, preserves legacy rows, and creates exact storage shapes', async () => {
    await workerEnv.DB
      .prepare(
        `INSERT INTO spb_bindings (
           account_id, instance_id, created_at, last_seen_at, token_hash, lapsed_at
         ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(ACCOUNT_A, INSTANCE_ID, 1_000, 2_000, 'legacy-token-hash', 3_000)
      .run();

    await runMigration();

    await expect(columnNames('spb_bindings')).resolves.toEqual([
      'account_id',
      'instance_id',
      'created_at',
      'last_seen_at',
      'token_hash',
      'lapsed_at',
      'sandbox_run_id',
      'sandbox_credential_expires_at',
      'sandbox_denied_at',
    ]);
    const columns = await tableColumns('spb_bindings');
    expect(columns.slice(-3)).toEqual([
      expect.objectContaining({ name: 'sandbox_run_id', type: 'TEXT', notnull: 0 }),
      expect.objectContaining({ name: 'sandbox_credential_expires_at', type: 'INTEGER', notnull: 0 }),
      expect.objectContaining({ name: 'sandbox_denied_at', type: 'INTEGER', notnull: 0 }),
    ]);
    await expect(indexShape('spb_bindings', 'idx_spb_bindings_account_id'))
      .resolves.toEqual({ unique: 0, columns: ['account_id'] });
    await expect(indexShape('spb_bindings', 'idx_spb_bindings_sandbox_run_id'))
      .resolves.toEqual({ unique: 0, columns: ['sandbox_run_id'] });
    await expect(indexShape('spb_bindings', 'idx_spb_bindings_instance_id'))
      .resolves.toEqual({ unique: 1, columns: ['instance_id'] });
    await expect(columnNames('spb_sandbox_audit')).resolves.toEqual([
      'event',
      'outcome',
      'scope',
      'ttl',
      'credentials_minted',
      'objects_deleted',
      'multipart_aborted',
      'ts',
    ]);
    await expect(workerEnv.DB.prepare('SELECT * FROM spb_bindings').first()).resolves.toEqual({
      account_id: ACCOUNT_A,
      instance_id: INSTANCE_ID,
      created_at: 1_000,
      last_seen_at: 2_000,
      token_hash: 'legacy-token-hash',
      lapsed_at: 3_000,
      sandbox_run_id: null,
      sandbox_credential_expires_at: null,
      sandbox_denied_at: null,
    });
  });

  it('enforces each event outcome vocabulary at the storage boundary', async () => {
    await runMigration();

    for (const row of validAuditRows()) await insertAudit(row);

    await expect(insertAudit({
      event: 'mint',
      outcome: 'cleaned',
      scope: null,
      ttl: null,
      credentialsMinted: 0,
      objectsDeleted: null,
      multipartAborted: null,
    })).rejects.toThrow(/CHECK constraint failed/i);

    const row = await workerEnv.DB
      .prepare('SELECT COUNT(*) AS count FROM spb_sandbox_audit')
      .first();
    expect(row.count).toBe(validAuditRows().length);
  });

  it('matches the consolidated schema columns, constraints, and indexes exactly', async () => {
    await runMigration();
    const migratedShape = await lifecycleStorageShape();

    await resetDb();
    const schemaShape = await lifecycleStorageShape();

    expect(createTableSql(schema, 'spb_sandbox_audit'))
      .toBe(createTableSql(migration, 'spb_sandbox_audit'));
    expect(schemaShape).toEqual(migratedShape);
  });

  it('fails loudly on duplicate instance owners and preserves both rows without choosing a winner', async () => {
    for (const accountId of [ACCOUNT_A, ACCOUNT_B]) {
      await workerEnv.DB
        .prepare(
          `INSERT INTO spb_bindings (
             account_id, instance_id, created_at, last_seen_at, token_hash, lapsed_at
           ) VALUES (?, ?, ?, ?, ?, NULL)`
        )
        .bind(accountId, INSTANCE_ID, 1_000, 1_000, `hash-${accountId}`)
        .run();
    }

    await expect(runMigration()).rejects.toThrow(
      /UNIQUE constraint failed: spb_bindings\.instance_id: SQLITE_CONSTRAINT/
    );

    const { results } = await workerEnv.DB
      .prepare(
        `SELECT account_id, instance_id, sandbox_run_id,
                sandbox_credential_expires_at, sandbox_denied_at
         FROM spb_bindings
         ORDER BY account_id`
      )
      .all();
    expect(results).toEqual([
      {
        account_id: ACCOUNT_A,
        instance_id: INSTANCE_ID,
        sandbox_run_id: null,
        sandbox_credential_expires_at: null,
        sandbox_denied_at: null,
      },
      {
        account_id: ACCOUNT_B,
        instance_id: INSTANCE_ID,
        sandbox_run_id: null,
        sandbox_credential_expires_at: null,
        sandbox_denied_at: null,
      },
    ]);
    await expect(indexShape('spb_bindings', 'idx_spb_bindings_sandbox_run_id'))
      .resolves.toEqual({ unique: 0, columns: ['sandbox_run_id'] });
    await expect(indexShape('spb_bindings', 'idx_spb_bindings_instance_id')).resolves.toBeNull();
    await expect(tableExists('spb_sandbox_audit')).resolves.toBe(true);
    await expect(runStatements(migrationStatements().slice(3, 5))).resolves.toBeUndefined();
  });

  it('continues safely after only some ALTER statements applied', async () => {
    const statements = migrationStatements();
    await runStatements(statements.slice(0, 1));

    await expect(runStatements(statements.slice(1))).resolves.toBeUndefined();
    await expect(columnNames('spb_bindings')).resolves.toEqual([
      'account_id',
      'instance_id',
      'created_at',
      'last_seen_at',
      'token_hash',
      'lapsed_at',
      'sandbox_run_id',
      'sandbox_credential_expires_at',
      'sandbox_denied_at',
    ]);
    await expect(indexShape('spb_bindings', 'idx_spb_bindings_instance_id'))
      .resolves.toEqual({ unique: 1, columns: ['instance_id'] });
  });

  it('re-runs the idempotent suffix when the audit table exists but indexes are absent', async () => {
    const statements = migrationStatements();
    await runStatements(statements.slice(0, 4));

    await expect(tableExists('spb_sandbox_audit')).resolves.toBe(true);
    await expect(indexShape('spb_bindings', 'idx_spb_bindings_sandbox_run_id')).resolves.toBeNull();
    await expect(indexShape('spb_bindings', 'idx_spb_bindings_instance_id')).resolves.toBeNull();

    await expect(runStatements(statements.slice(3))).resolves.toBeUndefined();
    await expect(indexShape('spb_bindings', 'idx_spb_bindings_sandbox_run_id'))
      .resolves.toEqual({ unique: 0, columns: ['sandbox_run_id'] });
    await expect(indexShape('spb_bindings', 'idx_spb_bindings_instance_id'))
      .resolves.toEqual({ unique: 1, columns: ['instance_id'] });
  });

  it('re-runs the suffix when the run index exists but the unique index is absent', async () => {
    const statements = migrationStatements();
    await runStatements(statements.slice(0, 5));

    await expect(indexShape('spb_bindings', 'idx_spb_bindings_sandbox_run_id'))
      .resolves.toEqual({ unique: 0, columns: ['sandbox_run_id'] });
    await expect(indexShape('spb_bindings', 'idx_spb_bindings_instance_id')).resolves.toBeNull();

    await expect(runStatements(statements.slice(3))).resolves.toBeUndefined();
    await expect(indexShape('spb_bindings', 'idx_spb_bindings_instance_id'))
      .resolves.toEqual({ unique: 1, columns: ['instance_id'] });
  });

  it('fails loudly on a full ALTER re-apply while allowing the suffix to re-run', async () => {
    await runMigration();

    await expect(runMigration()).rejects.toThrow(/duplicate column name: sandbox_run_id/i);
    await expect(runStatements(migrationStatements().slice(3))).resolves.toBeUndefined();
    await expect(indexShape('spb_bindings', 'idx_spb_bindings_instance_id'))
      .resolves.toEqual({ unique: 1, columns: ['instance_id'] });
  });
});

async function installPost0025Pre0026SpbShape() {
  await workerEnv.DB.prepare('DROP TABLE IF EXISTS spb_sandbox_audit').run();
  await workerEnv.DB.prepare('DROP TABLE IF EXISTS spb_bindings').run();
  await workerEnv.DB
    .prepare(
      `CREATE TABLE spb_bindings (
         account_id TEXT NOT NULL,
         instance_id TEXT NOT NULL,
         created_at INTEGER NOT NULL,
         last_seen_at INTEGER NOT NULL,
         token_hash TEXT,
         lapsed_at INTEGER,
         PRIMARY KEY (account_id, instance_id),
         FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
       )`
    )
    .run();
  await workerEnv.DB
    .prepare('CREATE INDEX idx_spb_bindings_account_id ON spb_bindings(account_id)')
    .run();
}

async function insertAccounts() {
  for (const accountId of [ACCOUNT_A, ACCOUNT_B]) {
    await workerEnv.DB
      .prepare('INSERT INTO accounts (id, primary_email_id, created_at, last_signin_at) VALUES (?, NULL, ?, ?)')
      .bind(accountId, 1_000, 1_000)
      .run();
  }
}

function validAuditRows() {
  return [
    ['mint', 'minted', 'backup', 90, 1, null, null],
    ['mint', 'refused_entitlement', null, null, 0, null, null],
    ['mint', 'refused_scope', null, null, 0, null, null],
    ['mint', 'mint_cas_lost', 'operated', 90, 0, null, null],
    ['mint', 'internal_error', null, null, 0, null, null],
    ['denial', 'released', null, null, null, null, null],
    ['denial', 'absent', null, null, null, null, null],
    ['denial', 'ownership_conflict', null, null, null, null, null],
    ['denial', 'internal_error', null, null, null, null, null],
    ['cleanup', 'cleaned', null, null, 1, 2, 3],
    ['cleanup', 'retryable', null, null, 1, 2, 3],
    ['cleanup', 'denial_required', null, null, 0, 0, 0],
    ['cleanup', 'absent', null, null, 0, 0, 0],
    ['cleanup', 'ownership_conflict', null, null, 0, 0, 0],
  ].map(([
    event,
    outcome,
    scope,
    ttl,
    credentialsMinted,
    objectsDeleted,
    multipartAborted,
  ]) => ({
    event,
    outcome,
    scope,
    ttl,
    credentialsMinted,
    objectsDeleted,
    multipartAborted,
  }));
}

async function insertAudit({
  event,
  outcome,
  scope,
  ttl,
  credentialsMinted,
  objectsDeleted,
  multipartAborted,
}) {
  await workerEnv.DB
    .prepare(
      `INSERT INTO spb_sandbox_audit (
         event, outcome, scope, ttl, credentials_minted,
         objects_deleted, multipart_aborted, ts
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      event,
      outcome,
      scope,
      ttl,
      credentialsMinted,
      objectsDeleted,
      multipartAborted,
      1_000
    )
    .run();
}

function migrationStatements() {
  const executable = migration
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  return executable.split(';').map((part) => part.trim()).filter(Boolean);
}

function runMigration() {
  return runStatements(migrationStatements());
}

async function runStatements(statements) {
  for (const statement of statements) await workerEnv.DB.prepare(statement).run();
}

async function tableExists(table) {
  const row = await workerEnv.DB
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(table)
    .first();
  return Boolean(row);
}

async function tableColumns(table) {
  const { results } = await workerEnv.DB.prepare(`PRAGMA table_info(${table})`).all();
  return results;
}

async function columnNames(table) {
  return (await tableColumns(table)).map((column) => column.name);
}

async function indexShape(table, name) {
  const { results: indexes } = await workerEnv.DB.prepare(`PRAGMA index_list(${table})`).all();
  const index = indexes.find((candidate) => candidate.name === name);
  if (!index) return null;
  const { results: columns } = await workerEnv.DB.prepare(`PRAGMA index_info(${name})`).all();
  return { unique: index.unique, columns: columns.map((column) => column.name) };
}

async function lifecycleStorageShape() {
  return {
    bindingColumns: columnShape(await tableColumns('spb_bindings')),
    auditColumns: columnShape(await tableColumns('spb_sandbox_audit')),
    auditConstraints: await tableSql('spb_sandbox_audit'),
    bindingIndexes: await indexShapes('spb_bindings'),
    auditIndexes: await indexShapes('spb_sandbox_audit'),
  };
}

function columnShape(columns) {
  return columns.map((column) => ({
    name: column.name,
    type: column.type,
    notnull: column.notnull,
    defaultValue: column.dflt_value,
    primaryKey: column.pk,
  }));
}

async function tableSql(table) {
  const row = await workerEnv.DB
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(table)
    .first();
  return row.sql.replace(/\s+/g, ' ').trim();
}

async function indexShapes(table) {
  const { results: indexes } = await workerEnv.DB.prepare(`PRAGMA index_list(${table})`).all();
  const shapes = [];
  for (const index of indexes) {
    const { results: columns } = await workerEnv.DB
      .prepare(`PRAGMA index_info(${index.name})`)
      .all();
    shapes.push({
      name: index.name,
      unique: index.unique,
      columns: columns.map((column) => column.name),
    });
  }
  return shapes.sort((left, right) => left.name.localeCompare(right.name));
}

function createTableSql(source, table) {
  const match = source.match(new RegExp(
    `CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`
  ));
  return match?.[0].replace(/\s+/g, ' ').trim() || null;
}
