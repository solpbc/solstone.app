import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyScoutPendingWithEvent,
  getScoutLifecycleMaxSequence,
  listScoutLifecycleEvents,
  setScoutApplicationDataAcked,
  transitionScoutStatusWithEvent,
} from '../src/db.js';
import { makeTestEnv, resetDb, seedAccount } from './helpers.js';

describe('Scout application lifecycle db builders', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('atomically inserts a pending application and content-free owner event', async () => {
    const account = await seedTestAccount('pending-insert@example.com');

    const result = await applyScoutPendingWithEvent(workerEnv.DB, {
      accountId: account.accountId,
      useCase: 'try scout for research',
      dataAckedAt: 2_000,
      nowMs: 2_000,
    });

    expect(result).toEqual({ transitioned: true, correlationId: expect.any(String) });
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
    const event = await eventRow(account.accountId, 1);
    expect(Object.keys(event)).toEqual([
      'correlation_id',
      'account_id',
      'sequence',
      'action',
      'from_status',
      'to_status',
      'actor_kind',
      'actor_principal',
      'reason_code',
      'occurred_at',
    ]);
    expect(event).toEqual({
      correlation_id: result.correlationId,
      account_id: account.accountId,
      sequence: 1,
      action: 'apply',
      from_status: 'absent',
      to_status: 'pending',
      actor_kind: 'owner',
      actor_principal: account.accountId,
      reason_code: 'owner_application',
      occurred_at: 2_000,
    });
  });

  it('refreshes pending applications without resetting applied_at or appending an event', async () => {
    const account = await seedTestAccount('pending-refresh@example.com');
    await applyScoutPendingWithEvent(workerEnv.DB, {
      accountId: account.accountId,
      useCase: 'first use',
      dataAckedAt: 1_000,
      nowMs: 1_000,
    });

    const updated = await applyScoutPendingWithEvent(workerEnv.DB, {
      accountId: account.accountId,
      useCase: 'updated use',
      dataAckedAt: 2_000,
      nowMs: 2_000,
    });
    const preserved = await applyScoutPendingWithEvent(workerEnv.DB, {
      accountId: account.accountId,
      useCase: null,
      dataAckedAt: 3_000,
      nowMs: 3_000,
    });

    expect(updated).toEqual({ transitioned: false, correlationId: null });
    expect(preserved).toEqual({ transitioned: false, correlationId: null });
    await expect(applicationRow(account.accountId)).resolves.toMatchObject({
      status: 'pending',
      use_case: 'updated use',
      data_acked_at: 3_000,
      applied_at: 1_000,
      created_at: 1_000,
      updated_at: 3_000,
    });
    await expect(eventRows(account.accountId)).resolves.toHaveLength(1);
  });

  it.each(['approved', 'revoked'])('does not change an existing %s row through owner apply', async (status) => {
    const account = await seedTestAccount(`${status}-guard@example.com`);
    await seedScoutApplication({
      accountId: account.accountId,
      status,
      approvedAt: status === 'approved' ? 1_100 : null,
      revokedAt: status === 'revoked' ? 1_100 : null,
    });
    const before = await applicationRow(account.accountId);

    const result = await applyScoutPendingWithEvent(workerEnv.DB, {
      accountId: account.accountId,
      useCase: 'should not write',
      dataAckedAt: 2_000,
      nowMs: 2_000,
    });

    expect(result).toEqual({ transitioned: false, correlationId: null });
    await expect(applicationRow(account.accountId)).resolves.toEqual(before);
    await expect(eventRows(account.accountId)).resolves.toEqual([]);
  });

  it.each([
    ['preapprove', 'absent', 'approved', 'invitation'],
    ['preapprove', 'pending', 'approved', 'application_approved'],
    ['preapprove', 'revoked', 'approved', 'eligibility_restored'],
    ['approve', 'pending', 'approved', 'operator_correction'],
    ['revoke', 'pending', 'revoked', 'owner_request'],
    ['revoke', 'approved', 'revoked', 'security_response'],
  ])('atomically records %s %s to %s', async (action, fromStatus, toStatus, reasonCode) => {
    const account = await seedTestAccount(`${action}-${fromStatus}@example.com`);
    if (fromStatus !== 'absent') {
      await seedScoutApplication({
        accountId: account.accountId,
        status: fromStatus,
        appliedAt: fromStatus === 'pending' ? 1_000 : null,
        approvedAt: fromStatus === 'approved' ? 1_000 : null,
        revokedAt: fromStatus === 'revoked' ? 1_000 : null,
      });
    }

    const result = await transitionScoutStatusWithEvent(workerEnv.DB, {
      accountId: account.accountId,
      action,
      fromStatus,
      toStatus,
      actorKind: 'operator',
      actorPrincipal: 'operator@example.com',
      reasonCode,
      nowMs: 2_000,
    });

    expect(result).toEqual({ transitioned: true, correlationId: expect.any(String) });
    const row = await applicationRow(account.accountId);
    expect(row.status).toBe(toStatus);
    expect(row.updated_at).toBe(2_000);
    if (toStatus === 'approved') expect(row.approved_at).toBe(2_000);
    if (toStatus === 'revoked') expect(row.revoked_at).toBe(2_000);
    if (fromStatus === 'absent') {
      expect(row).toMatchObject({
        use_case: null,
        data_acked_at: null,
        applied_at: null,
        created_at: 2_000,
      });
    }
    await expect(eventRow(account.accountId, 1)).resolves.toEqual({
      correlation_id: result.correlationId,
      account_id: account.accountId,
      sequence: 1,
      action,
      from_status: fromStatus,
      to_status: toStatus,
      actor_kind: 'operator',
      actor_principal: 'operator@example.com',
      reason_code: reasonCode,
      occurred_at: 2_000,
    });
  });

  it('returns a no-op when the transition guard misses', async () => {
    const account = await seedTestAccount('transition-miss@example.com');
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approvedAt: 1_000 });
    const before = await applicationRow(account.accountId);

    const result = await transitionScoutStatusWithEvent(workerEnv.DB, {
      accountId: account.accountId,
      action: 'approve',
      fromStatus: 'pending',
      toStatus: 'approved',
      actorKind: 'service',
      actorPrincipal: 'automation',
      reasonCode: 'application_approved',
      nowMs: 2_000,
    });

    expect(result).toEqual({ transitioned: false, correlationId: null });
    await expect(applicationRow(account.accountId)).resolves.toEqual(before);
    await expect(eventRows(account.accountId)).resolves.toEqual([]);
  });

  it('assigns gap-free per-account sequences and supports bounded descending reads', async () => {
    const account = await seedTestAccount('sequence@example.com');
    await applyScoutPendingWithEvent(workerEnv.DB, {
      accountId: account.accountId,
      useCase: null,
      dataAckedAt: 1_000,
      nowMs: 1_000,
    });
    await transitionScoutStatusWithEvent(workerEnv.DB, {
      accountId: account.accountId,
      action: 'approve',
      fromStatus: 'pending',
      toStatus: 'approved',
      actorKind: 'service',
      actorPrincipal: 'automation',
      reasonCode: 'application_approved',
      nowMs: 2_000,
    });

    await expect(getScoutLifecycleMaxSequence(workerEnv.DB, account.accountId)).resolves.toBe(2);
    await expect(listScoutLifecycleEvents(workerEnv.DB, account.accountId, {
      maxSequence: 2,
      limit: 1,
    })).resolves.toEqual([expect.objectContaining({ sequence: 2, action: 'approve' })]);
    expect((await eventRows(account.accountId)).map((row) => row.sequence)).toEqual([1, 2]);
  });

  it('rolls back an apply event when the later application insert fails', async () => {
    const account = await seedTestAccount('apply-rollback@example.com');
    await workerEnv.DB.prepare(
      `CREATE TRIGGER fail_scout_application_insert
       BEFORE INSERT ON scout_applications
       BEGIN
         SELECT RAISE(ABORT, 'forced application insert failure');
       END`
    ).run();

    await expect(applyScoutPendingWithEvent(workerEnv.DB, {
      accountId: account.accountId,
      useCase: null,
      dataAckedAt: 2_000,
      nowMs: 2_000,
    })).rejects.toThrow(/forced application insert failure/i);
    await expect(applicationRow(account.accountId)).resolves.toBeNull();
    await expect(eventRows(account.accountId)).resolves.toEqual([]);
  });

  it('rolls back an operator event when the later status update fails', async () => {
    const account = await seedTestAccount('transition-rollback@example.com');
    await seedScoutApplication({ accountId: account.accountId, status: 'pending', appliedAt: 1_000 });
    await workerEnv.DB.prepare(
      `CREATE TRIGGER fail_scout_application_update
       BEFORE UPDATE OF status ON scout_applications
       BEGIN
         SELECT RAISE(ABORT, 'forced application update failure');
       END`
    ).run();

    await expect(transitionScoutStatusWithEvent(workerEnv.DB, {
      accountId: account.accountId,
      action: 'approve',
      fromStatus: 'pending',
      toStatus: 'approved',
      actorKind: 'operator',
      actorPrincipal: 'operator@example.com',
      reasonCode: 'application_approved',
      nowMs: 2_000,
    })).rejects.toThrow(/forced application update failure/i);
    await expect(applicationRow(account.accountId)).resolves.toMatchObject({ status: 'pending' });
    await expect(eventRows(account.accountId)).resolves.toEqual([]);
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
    await seedScoutApplication({ accountId: pending.accountId, status: 'pending', appliedAt: 1_100 });
    await seedScoutApplication({ accountId: revoked.accountId, status: 'revoked', revokedAt: 1_200 });

    await setScoutApplicationDataAcked(workerEnv.DB, { accountId: pending.accountId, nowMs: 2_000 });
    await setScoutApplicationDataAcked(workerEnv.DB, { accountId: revoked.accountId, nowMs: 2_000 });

    await expect(applicationRow(pending.accountId)).resolves.toMatchObject({
      status: 'pending', data_acked_at: null, updated_at: 1_000,
    });
    await expect(applicationRow(revoked.accountId)).resolves.toMatchObject({
      status: 'revoked', data_acked_at: null, updated_at: 1_000,
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

async function eventRow(accountId, sequence) {
  return workerEnv.DB
    .prepare('SELECT * FROM scout_lifecycle_events WHERE account_id = ? AND sequence = ?')
    .bind(accountId, sequence)
    .first();
}

async function eventRows(accountId) {
  const { results } = await workerEnv.DB
    .prepare('SELECT * FROM scout_lifecycle_events WHERE account_id = ? ORDER BY sequence')
    .bind(accountId)
    .all();
  return results;
}
