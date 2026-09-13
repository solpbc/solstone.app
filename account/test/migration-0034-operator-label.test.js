import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0034_operator_label.sql?raw';
import { createAccountWithEmail, createSession } from '../src/db.js';
import { resetDb } from './helpers.js';

const migrations = Object.entries(import.meta.glob('../migrations/*.sql', {
  eager: true,
  query: '?raw',
  import: 'default',
})).sort(([left], [right]) => left.localeCompare(right));

describe('migration 0034 add sessions.operator_label', () => {
  beforeEach(async () => {
    await resetDb();
    const { results } = await workerEnv.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    ).all();
    for (const { name } of results) await workerEnv.DB.prepare(`DROP TABLE ${name}`).run();
  });

  it('adds nullable operator_label as the last column on sessions and preserves pre-migration rows', async () => {
    await applyThrough('0033_drop_otp_email_lower.sql');
    await workerEnv.DB.prepare(
      "INSERT INTO accounts (id, created_at, last_signin_at) VALUES ('acc-pre', 1000, 1000)"
    ).run();
    await workerEnv.DB.prepare(
      `INSERT INTO sessions (id_hash, account_id, created_at, expires_at, last_active_at, last_ip_encrypted, last_user_agent)
       VALUES ('hash-pre', 'acc-pre', 1000, 2000, 1000, 'ip-enc', 'Mozilla/5.0')`
    ).run();

    await runMigration(migration);

    const { results: columns } = await workerEnv.DB.prepare('PRAGMA table_info(sessions)').all();
    const colNames = columns.map(({ name }) => name);
    expect(colNames).toEqual([
      'id_hash', 'account_id', 'created_at', 'expires_at', 'last_active_at',
      'revoked_at', 'last_ip_encrypted', 'last_user_agent', 'operator_label',
    ]);
    expect(colNames.at(-1)).toBe('operator_label');

    const preRow = await workerEnv.DB.prepare("SELECT * FROM sessions WHERE id_hash = 'hash-pre'").first();
    expect(preRow.operator_label).toBeNull();
    expect(preRow.last_user_agent).toBe('Mozilla/5.0');

    // Fresh inserts on migrated database: ordinary session & operator session
    await createSession(workerEnv.DB, {
      idHash: 'hash-ord',
      accountId: 'acc-pre',
      nowMs: 2000,
    });
    const ordRow = await workerEnv.DB.prepare("SELECT * FROM sessions WHERE id_hash = 'hash-ord'").first();
    expect(ordRow.operator_label).toBeNull();

    await createSession(workerEnv.DB, {
      idHash: 'hash-op',
      accountId: 'acc-pre',
      nowMs: 3000,
      operatorLabel: 'impersonation by op@solpbc.org',
    });
    const opRow = await workerEnv.DB.prepare("SELECT * FROM sessions WHERE id_hash = 'hash-op'").first();
    expect(opRow.operator_label).toBe('impersonation by op@solpbc.org');
    expect(opRow.last_user_agent).toBeNull();
  });

  it('accepts both ordinary and operator sessions on a fresh schema.sql database', async () => {
    await resetDb();
    const { accountId } = await createAccountWithEmail(workerEnv.DB, {
      addressEncrypted: 'enc-email',
      addressLowerHash: 'hash-email',
      nowMs: 1000,
    });

    await createSession(workerEnv.DB, {
      idHash: 'hash-fresh-ord',
      accountId,
      nowMs: 1000,
    });
    const ordRow = await workerEnv.DB.prepare("SELECT * FROM sessions WHERE id_hash = 'hash-fresh-ord'").first();
    expect(ordRow.operator_label).toBeNull();

    await createSession(workerEnv.DB, {
      idHash: 'hash-fresh-op',
      accountId,
      nowMs: 1000,
      operatorLabel: 'impersonation by admin@solpbc.org',
    });
    const opRow = await workerEnv.DB.prepare("SELECT * FROM sessions WHERE id_hash = 'hash-fresh-op'").first();
    expect(opRow.operator_label).toBe('impersonation by admin@solpbc.org');
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
  const executable = source.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
  for (const statement of executable.split(';').map((part) => part.trim()).filter(Boolean)) {
    await workerEnv.DB.prepare(statement).run();
  }
}
