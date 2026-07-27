import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  findSppBindingByTokenHash,
  insertSppMintAudit,
  upsertSppBinding,
} from '../src/db.js';
import { makeTestEnv, resetDb, seedAccount } from './helpers.js';

const INSTANCE_ID = '11111111-1111-1111-1111-111111111111';

describe('spp binding database helpers', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('round-trips tokens and preserves created_at on upsert', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spp-binding@example.com', testEnv });

    await upsertSppBinding(testEnv.DB, {
      accountId: account.accountId,
      instanceId: INSTANCE_ID,
      tokenHash: 'token-hash-1',
      nowMs: 1_000,
      consentAckedAt: 1_000,
      consentDisclosureVersion: 'spp-consent-v1',
    });
    await expect(findSppBindingByTokenHash(testEnv.DB, 'token-hash-1')).resolves.toEqual({
      account_id: account.accountId,
      instance_id: INSTANCE_ID,
    });

    await upsertSppBinding(testEnv.DB, {
      accountId: account.accountId,
      instanceId: INSTANCE_ID,
      tokenHash: 'token-hash-2',
      nowMs: 2_000,
      consentAckedAt: 2_000,
      consentDisclosureVersion: 'spp-consent-v2',
    });

    await expect(bindingRow(account.accountId)).resolves.toEqual({
      account_id: account.accountId,
      instance_id: INSTANCE_ID,
      token_hash: 'token-hash-2',
      created_at: 1_000,
      last_seen_at: 2_000,
      consent_acked_at: 2_000,
      consent_disclosure_version: 'spp-consent-v2',
    });
    await expect(findSppBindingByTokenHash(testEnv.DB, 'token-hash-1')).resolves.toBeNull();
    await expect(findSppBindingByTokenHash(testEnv.DB, 'token-hash-2')).resolves.toEqual({
      account_id: account.accountId,
      instance_id: INSTANCE_ID,
    });
  });

  it('inserts content-free mint audit rows', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spp-audit@example.com', testEnv });

    await insertSppMintAudit(testEnv.DB, {
      accountId: account.accountId,
      instanceId: INSTANCE_ID,
      scope: 'inference',
      outcome: 'minted',
      nowMs: 3_000,
    });

    await expect(auditRow()).resolves.toEqual({
      account_id: account.accountId,
      instance_id: INSTANCE_ID,
      scope: 'inference',
      outcome: 'minted',
      ts: 3_000,
    });
    await expect(tableColumns('spp_mint_audit')).resolves.toEqual([
      'account_id',
      'instance_id',
      'scope',
      'outcome',
      'ts',
    ]);
  });
});

async function bindingRow(accountId) {
  return workerEnv.DB
    .prepare(
      `SELECT account_id, instance_id, token_hash, created_at, last_seen_at,
              consent_acked_at, consent_disclosure_version
       FROM spp_bindings
       WHERE account_id = ? AND instance_id = ?`
    )
    .bind(accountId, INSTANCE_ID)
    .first();
}

async function auditRow() {
  return workerEnv.DB
    .prepare(
      `SELECT account_id, instance_id, scope, outcome, ts
       FROM spp_mint_audit
       WHERE instance_id = ?`
    )
    .bind(INSTANCE_ID)
    .first();
}

async function tableColumns(name) {
  const { results } = await workerEnv.DB
    .prepare(`SELECT name FROM pragma_table_info('${name}')`)
    .all();
  return results.map((row) => row.name);
}
