import { env as workerEnv } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { resetDb } from './helpers.js';

// Every other test loads schema.sql; production is migrations/*.sql replayed in
// order. This gate is what makes the two the same database: a migration that
// lands without its schema.sql mirror (or the reverse) fails here, so the
// owner-data inventory gate, which is exhaustive over the test schema, stays
// exhaustive over the schema production actually has.
const migrations = Object.entries(import.meta.glob('../migrations/*.sql', {
  eager: true,
  query: '?raw',
  import: 'default',
})).sort(([left], [right]) => left.localeCompare(right));

describe('schema.sql mirrors the replayed migrations', () => {
  it('replays every migration from scratch and matches tables, columns, constraints and indexes', async () => {
    await dropEverything();
    for (const [, source] of migrations) await runSql(source);
    const replayed = await shape();
    expect(Object.keys(replayed.tables).length).toBeGreaterThan(20);

    await resetDb();
    const canonical = await shape();

    expect(Object.keys(canonical.tables).sort()).toEqual(Object.keys(replayed.tables).sort());
    expect(Object.keys(canonical.indexes).sort()).toEqual(Object.keys(replayed.indexes).sort());
    for (const table of Object.keys(canonical.tables)) {
      expect(canonical.tables[table], `table ${table}`).toEqual(replayed.tables[table]);
    }
    for (const index of Object.keys(canonical.indexes)) {
      expect(canonical.indexes[index], `index ${index}`).toEqual(replayed.indexes[index]);
    }
  });

  it('fails when a column exists only on one side', async () => {
    await resetDb();
    await workerEnv.DB.prepare('ALTER TABLE rate_buckets ADD COLUMN rogue TEXT').run();
    const mutated = await shape();
    await resetDb();
    const canonical = await shape();
    expect(mutated.tables.rate_buckets).not.toEqual(canonical.tables.rate_buckets);
  });
});

async function dropEverything() {
  const { results } = await workerEnv.DB.prepare(
    "SELECT name, type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND type IN ('table', 'view')"
  ).all();
  for (const { name, type } of results) await workerEnv.DB.prepare(`DROP ${type.toUpperCase()} IF EXISTS "${name}"`).run();
}

async function runSql(source) {
  const executable = source.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
  for (const statement of executable.split(';').map((part) => part.trim()).filter(Boolean)) {
    await workerEnv.DB.prepare(statement).run();
  }
}

// Column order is compared deliberately: production rows were written by
// migrations and positional reads must mean the same thing under test.
async function shape() {
  const tables = {};
  const indexes = {};
  const { results: objects } = await workerEnv.DB.prepare(
    "SELECT name, type, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND type IN ('table', 'index') ORDER BY type, name"
  ).all();
  for (const object of objects) {
    if (object.type === 'table') {
      const { results: columns } = await workerEnv.DB.prepare(`PRAGMA table_info("${object.name}")`).all();
      const { results: foreignKeys } = await workerEnv.DB.prepare(`PRAGMA foreign_key_list("${object.name}")`).all();
      tables[object.name] = {
        columns: columns.map(({ name, type, notnull, dflt_value, pk }) => ({ name, type, notnull, default: dflt_value, pk })),
        checks: checkClauses(object.sql),
        foreignKeys: foreignKeys.map(({ table, from, to }) => ({ table, from, to })).sort(byJson),
      };
    } else {
      const { results: columns } = await workerEnv.DB.prepare(`PRAGMA index_info("${object.name}")`).all();
      const { results: list } = await workerEnv.DB.prepare(`PRAGMA index_list("${object.tbl_name}")`).all();
      const entry = list.find(({ name }) => name === object.name);
      indexes[object.name] = {
        table: object.tbl_name,
        unique: entry?.unique ?? null,
        columns: columns.map(({ name }) => name),
        where: whereClause(object.sql),
      };
    }
  }
  return { tables, indexes };
}

function normalize(sql) {
  return (sql || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function checkClauses(sql) {
  const text = normalize(sql);
  const clauses = [];
  let cursor = 0;
  for (;;) {
    const start = text.indexOf('check', cursor);
    if (start === -1) break;
    const open = text.indexOf('(', start);
    if (open === -1) break;
    let depth = 0;
    let end = open;
    for (; end < text.length; end += 1) {
      if (text[end] === '(') depth += 1;
      if (text[end] === ')') depth -= 1;
      if (depth === 0) break;
    }
    clauses.push(text.slice(open, end + 1));
    cursor = end + 1;
  }
  return clauses.sort();
}

function whereClause(sql) {
  const match = normalize(sql).match(/\bwhere\b(.*)$/);
  return match ? match[1].trim() : null;
}

function byJson(left, right) {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}
