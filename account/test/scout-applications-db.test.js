import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  setScoutApplicationDataAcked,
  upsertScoutApplicationPending,
} from '../src/db.js';
import { makeTestEnv, resetDb, seedAccount } from './helpers.js';

describe('scout application db builders', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('inserts a pending application with use case and data ack', async () => {
    const account = await seedTestAccount('pending-insert@example.com');

    await upsertScoutApplicationPending(workerEnv.DB, {
      accountId: account.accountId,
      useCase: 'try scout for research',
      dataAckedAt: 2_000,
      nowMs: 2_000,
    });

    await expect(applicationRow(account.accountId)).resolves.toEqual({
      account_id: account.accountId,
      status: 'pending',
      use_case: 'try scout for research',
      data_acked_at: 2_000,
      applied_at: 2_000,
      approved_at: null,
      revoked_at: null,
      created_at: 2_000,
      updated_at: 2_000,
    });
  });

  it('refreshes pending applications without resetting applied_at or clobbering use_case with null', async () => {
    const account = await seedTestAccount('pending-refresh@example.com');

    await upsertScoutApplicationPending(workerEnv.DB, {
      accountId: account.accountId,
      useCase: 'first use',
      dataAckedAt: 1_000,
      nowMs: 1_000,
    });
    await upsertScoutApplicationPending(workerEnv.DB, {
      accountId: account.accountId,
      useCase: 'updated use',
      dataAckedAt: 2_000,
      nowMs: 2_000,
    });

    await expect(rowCount('scout_applications')).resolves.toBe(1);
    await expect(applicationRow(account.accountId)).resolves.toMatchObject({
      status: 'pending',
      use_case: 'updated use',
      data_acked_at: 2_000,
      applied_at: 1_000,
      created_at: 1_000,
      updated_at: 2_000,
    });

    await upsertScoutApplicationPending(workerEnv.DB, {
      accountId: account.accountId,
      useCase: null,
      dataAckedAt: 3_000,
      nowMs: 3_000,
    });

    await expect(rowCount('scout_applications')).resolves.toBe(1);
    await expect(applicationRow(account.accountId)).resolves.toMatchObject({
      status: 'pending',
      use_case: 'updated use',
      data_acked_at: 3_000,
      applied_at: 1_000,
      created_at: 1_000,
      updated_at: 3_000,
    });
  });

  it('does not refresh an approved row through the pending upsert guard', async () => {
    const account = await seedTestAccount('approved-guard@example.com');
    await seedScoutApplication({
      accountId: account.accountId,
      status: 'approved',
      useCase: 'approved use',
      dataAckedAt: 1_100,
      approvedAt: 1_200,
      createdAt: 1_000,
      updatedAt: 1_200,
    });
    const before = await applicationRow(account.accountId);

    await upsertScoutApplicationPending(workerEnv.DB, {
      accountId: account.accountId,
      useCase: 'should not write',
      dataAckedAt: 2_000,
      nowMs: 2_000,
    });

    await expect(applicationRow(account.accountId)).resolves.toEqual(before);
  });

  it('sets approved data ack once without changing status or approved_at', async () => {
    const account = await seedTestAccount('approved-ack@example.com');
    await seedScoutApplication({
      accountId: account.accountId,
      status: 'approved',
      approvedAt: 1_200,
      createdAt: 1_000,
      updatedAt: 1_200,
    });

    await setScoutApplicationDataAcked(workerEnv.DB, { accountId: account.accountId, nowMs: 2_000 });

    await expect(applicationRow(account.accountId)).resolves.toMatchObject({
      status: 'approved',
      data_acked_at: 2_000,
      approved_at: 1_200,
      updated_at: 2_000,
    });
  });

  it('does not overwrite an existing approved data ack', async () => {
    const account = await seedTestAccount('approved-ack-existing@example.com');
    await seedScoutApplication({
      accountId: account.accountId,
      status: 'approved',
      dataAckedAt: 1_100,
      approvedAt: 1_200,
      createdAt: 1_000,
      updatedAt: 1_200,
    });

    await setScoutApplicationDataAcked(workerEnv.DB, { accountId: account.accountId, nowMs: 2_000 });

    await expect(applicationRow(account.accountId)).resolves.toMatchObject({
      status: 'approved',
      data_acked_at: 1_100,
      approved_at: 1_200,
      updated_at: 1_200,
    });
  });

  it('does not set data ack on non-approved rows', async () => {
    const pending = await seedTestAccount('pending-no-ack@example.com');
    const revoked = await seedTestAccount('revoked-no-ack@example.com');
    await seedScoutApplication({
      accountId: pending.accountId,
      status: 'pending',
      appliedAt: 1_100,
      createdAt: 1_000,
      updatedAt: 1_100,
    });
    await seedScoutApplication({
      accountId: revoked.accountId,
      status: 'revoked',
      revokedAt: 1_200,
      createdAt: 1_000,
      updatedAt: 1_200,
    });

    await setScoutApplicationDataAcked(workerEnv.DB, { accountId: pending.accountId, nowMs: 2_000 });
    await setScoutApplicationDataAcked(workerEnv.DB, { accountId: revoked.accountId, nowMs: 2_000 });

    await expect(applicationRow(pending.accountId)).resolves.toMatchObject({
      status: 'pending',
      data_acked_at: null,
      updated_at: 1_100,
    });
    await expect(applicationRow(revoked.accountId)).resolves.toMatchObject({
      status: 'revoked',
      data_acked_at: null,
      updated_at: 1_200,
    });
  });
});

function seedTestAccount(email) {
  return seedAccount({ email, testEnv: makeTestEnv() });
}

async function seedScoutApplication({
  accountId,
  status,
  useCase = null,
  dataAckedAt = null,
  appliedAt = null,
  approvedAt = null,
  revokedAt = null,
  createdAt = 1_000,
  updatedAt = createdAt,
}) {
  await workerEnv.DB
    .prepare(
      `INSERT INTO scout_applications (
         account_id, status, use_case, data_acked_at, applied_at,
         approved_at, revoked_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(accountId, status, useCase, dataAckedAt, appliedAt, approvedAt, revokedAt, createdAt, updatedAt)
    .run();
}

async function applicationRow(accountId) {
  return workerEnv.DB
    .prepare(
      `SELECT account_id, status, use_case, data_acked_at, applied_at,
              approved_at, revoked_at, created_at, updated_at
       FROM scout_applications
       WHERE account_id = ?`
    )
    .bind(accountId)
    .first();
}

async function rowCount(table) {
  const row = await workerEnv.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
  return row.count;
}
