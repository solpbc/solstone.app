import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0033_drop_otp_email_lower.sql?raw';
import { resetDb } from './helpers.js';

const migrations = Object.entries(import.meta.glob('../migrations/*.sql', {
  eager: true,
  query: '?raw',
  import: 'default',
})).sort(([left], [right]) => left.localeCompare(right));

describe('migration 0033 drop otp_tokens.email_lower', () => {
  beforeEach(async () => {
    await resetDb();
    const { results } = await workerEnv.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    ).all();
    for (const { name } of results) await workerEnv.DB.prepare(`DROP TABLE ${name}`).run();
  });

  it('removes the plaintext address column and keeps in-flight codes intact', async () => {
    await applyThrough('0032_account_deletion_proofs_export.sql');
    await workerEnv.DB.prepare(
      `INSERT INTO otp_tokens (email_lower_hash, email_lower, code_hash, expires_at, attempts, consumed, started_at)
       VALUES ('hash', 'person@example.com', 'code', 20, 2, 0, 10)`
    ).run();

    await runMigration(migration);

    const { results: columns } = await workerEnv.DB.prepare('PRAGMA table_info(otp_tokens)').all();
    expect(columns.map(({ name }) => name)).toEqual([
      'email_lower_hash', 'code_hash', 'expires_at', 'attempts', 'consumed', 'started_at',
    ]);
    await expect(workerEnv.DB.prepare("SELECT * FROM otp_tokens WHERE email_lower_hash = 'hash'").first())
      .resolves.toEqual({ email_lower_hash: 'hash', code_hash: 'code', expires_at: 20, attempts: 2, consumed: 0, started_at: 10 });
    const { results: indexes } = await workerEnv.DB.prepare('PRAGMA index_list(otp_tokens)').all();
    expect(indexes.map(({ name }) => name)).toContain('idx_otp_tokens_expires');
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
