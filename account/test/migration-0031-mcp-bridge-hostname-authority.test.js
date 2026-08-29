import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import schema from '../schema.sql?raw';
import migration from '../migrations/0031_mcp_bridge_hostname_authority.sql?raw';
import { resetDb } from './helpers.js';

const migrations = Object.entries(import.meta.glob('../migrations/*.sql', {
  eager: true,
  query: '?raw',
  import: 'default',
})).sort(([left], [right]) => left.localeCompare(right));

describe('migration 0031 MCP bridge hostname authority', () => {
  beforeEach(async () => {
    await resetDb();
    const { results } = await workerEnv.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    ).all();
    for (const { name } of results) await workerEnv.DB.prepare(`DROP TABLE ${name}`).run();
  });

  it('adds permanent label and live-binding constraints to the pre-0031 schema', async () => {
    await applyThrough('0030_account_deletion_service_ops_owner_purge_v1.sql');
    await runMigration(migration);
    await workerEnv.DB.prepare('INSERT INTO accounts (id, created_at) VALUES (?, ?)').bind('account', 1).run();
    await workerEnv.DB.prepare(
      'INSERT INTO mcp_bridge_hostname_ledger (label, created_at) VALUES (?, ?)'
    ).bind('ab2cd3ef', 1).run();
    await workerEnv.DB.prepare(
      `INSERT INTO mcp_bridge_bindings (account_id, instance_id, label, created_at)
       VALUES (?, ?, ?, ?)`
    ).bind('account', 'instance', 'ab2cd3ef', 1).run();

    await expect(workerEnv.DB.prepare(
      'INSERT INTO mcp_bridge_hostname_ledger (label, created_at) VALUES (?, ?)'
    ).bind('ab2cd3ef', 2).run()).rejects.toThrow(/UNIQUE constraint failed/i);
    await expect(workerEnv.DB.prepare(
      'INSERT INTO mcp_bridge_hostname_ledger (label, created_at) VALUES (?, ?)'
    ).bind('invalid!', 2).run()).rejects.toThrow(/CHECK constraint failed/i);
    await expect(workerEnv.DB.prepare(
      `INSERT INTO mcp_bridge_bindings (account_id, instance_id, label, created_at)
       VALUES (?, ?, ?, ?)`
    ).bind('account', 'other-instance', 'ab2cd3ef', 2).run()).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it('keeps the final MCP bridge schema blocks byte-identical to migration 0031', async () => {
    await applyThrough('0031_mcp_bridge_hostname_authority.sql');

    expect(normalizedTableBlock(migration, 'mcp_bridge_hostname_ledger'))
      .toBe(normalizedTableBlock(schema, 'mcp_bridge_hostname_ledger'));
    expect(normalizedTableBlock(migration, 'mcp_bridge_bindings'))
      .toBe(normalizedTableBlock(schema, 'mcp_bridge_bindings'));
    expect(normalizedIndex(migration, 'idx_mcp_bridge_bindings_account_id'))
      .toBe(normalizedIndex(schema, 'idx_mcp_bridge_bindings_account_id'));
  });
});

async function applyThrough(lastName) {
  for (const [path, source] of migrations) {
    await runMigration(source);
    if (path.split('/').at(-1) === lastName) return;
  }
  throw new Error(`missing migration ${lastName}`);
}

async function runMigration(source) {
  const executable = source
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  for (const statement of executable.split(';').map((part) => part.trim()).filter(Boolean)) {
    await workerEnv.DB.prepare(statement).run();
  }
}

function normalizedTableBlock(source, table) {
  const start = source.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`);
  if (start < 0) throw new Error(`missing table ${table}`);
  const end = source.indexOf('\n);', start);
  if (end < 0) throw new Error(`incomplete table ${table}`);
  return source.slice(start, end + 3);
}

function normalizedIndex(source, index) {
  const match = source.match(new RegExp(`CREATE INDEX IF NOT EXISTS ${index}\\s+ON [^;]+;`));
  if (!match) throw new Error(`missing index ${index}`);
  return match[0];
}
