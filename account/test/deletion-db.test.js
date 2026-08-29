import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  captureDeletionSnapshot,
  consumeProofsAndCancelDeletionRequest,
  consumeProofsAndCreateDeletionRequest,
  createDeletionProof,
  markDeletionProofVerified,
} from '../src/db.js';
import { resetDb } from './helpers.js';

describe('deletion database transitions', () => {
  beforeEach(resetDb);

  it('captures a snapshot only once from requested', async () => {
    await request('one');
    await expect(captureDeletionSnapshot(workerEnv.DB, {
      operationId: 'one', snapshotEncrypted: 'encrypted', snapshotDigest: 'digest', frozenAt: 2,
    })).resolves.toBe(true);
    await expect(captureDeletionSnapshot(workerEnv.DB, {
      operationId: 'one', snapshotEncrypted: 'other', snapshotDigest: 'other', frozenAt: 3,
    })).resolves.toBe(false);
  });

  it('uses batches so exactly one concurrent cancellation consumes its proof and wins', async () => {
    await request('one');
    await createDeletionProof(workerEnv.DB, {
      tokenHash: 'cancel-proof', accountId: 'account', sessionIdHash: 'session', purpose: 'cancel', method: 'otp',
      issuedAt: 1, expiresAt: 100, otpCodeHash: 'code',
    });
    await markDeletionProofVerified(workerEnv.DB, { tokenHash: 'cancel-proof', nowMs: 2 });
    const attempts = await Promise.all([
      consumeProofsAndCancelDeletionRequest(workerEnv.DB, {
        proofTokenHashes: ['cancel-proof'], accountId: 'account', sessionIdHash: 'session', operationId: 'one', cancelledAt: 2, nowMs: 2,
      }),
      consumeProofsAndCancelDeletionRequest(workerEnv.DB, {
        proofTokenHashes: ['cancel-proof'], accountId: 'account', sessionIdHash: 'session', operationId: 'one', cancelledAt: 2, nowMs: 2,
      }),
    ]);
    expect(attempts.filter((result) => result.proofChanges && result.cancelled)).toHaveLength(1);

    await insertRequest('purging', 'purging');
    await createDeletionProof(workerEnv.DB, {
      tokenHash: 'purging-proof', accountId: 'account', sessionIdHash: 'session', purpose: 'cancel', method: 'otp',
      issuedAt: 1, expiresAt: 100, otpCodeHash: 'code',
    });
    await markDeletionProofVerified(workerEnv.DB, { tokenHash: 'purging-proof', nowMs: 2 });
    await expect(consumeProofsAndCancelDeletionRequest(workerEnv.DB, {
      proofTokenHashes: ['purging-proof'], accountId: 'account', sessionIdHash: 'session', operationId: 'purging', cancelledAt: 2, nowMs: 2,
    })).resolves.toMatchObject({ cancelled: false });

    await createDeletionProof(workerEnv.DB, {
      tokenHash: 'delete-proof', accountId: 'second-account', sessionIdHash: 'session', purpose: 'delete', method: 'otp',
      issuedAt: 1, expiresAt: 100, otpCodeHash: 'code',
    });
    await markDeletionProofVerified(workerEnv.DB, { tokenHash: 'delete-proof', nowMs: 2 });
    await expect(consumeProofsAndCreateDeletionRequest(workerEnv.DB, {
      proofTokenHashes: ['delete-proof'], accountId: 'second-account', sessionIdHash: 'session', operationId: 'two',
      statusTokenHash: 'two-status', requestedAt: 2, cancellationDeadlineAt: 3,
    })).resolves.toMatchObject({ proofChanges: true, created: true });
  });

  it('does not mutate a deletion when a proof was consumed before the batch', async () => {
    await createDeletionProof(workerEnv.DB, {
      tokenHash: 'stale-delete-proof', accountId: 'second-account', sessionIdHash: 'session', purpose: 'delete', method: 'otp',
      issuedAt: 1, expiresAt: 100, otpCodeHash: 'code',
    });
    await markDeletionProofVerified(workerEnv.DB, { tokenHash: 'stale-delete-proof', nowMs: 2 });
    await workerEnv.DB.prepare("UPDATE account_deletion_proofs SET consumed = 1 WHERE token_hash = 'stale-delete-proof'").run();
    await expect(consumeProofsAndCreateDeletionRequest(workerEnv.DB, {
      proofTokenHashes: ['stale-delete-proof'], accountId: 'second-account', sessionIdHash: 'session', operationId: 'stale-create',
      statusTokenHash: 'stale-status', requestedAt: 2, cancellationDeadlineAt: 100,
    })).resolves.toMatchObject({ created: false });
    await expect(workerEnv.DB.prepare("SELECT operation_id FROM account_deletions WHERE operation_id = 'stale-create'").first()).resolves.toBeNull();

    await request('cancel-stale');
    await createDeletionProof(workerEnv.DB, {
      tokenHash: 'stale-cancel-proof', accountId: 'account', sessionIdHash: 'session', purpose: 'cancel', method: 'otp',
      issuedAt: 1, expiresAt: 100, otpCodeHash: 'code',
    });
    await markDeletionProofVerified(workerEnv.DB, { tokenHash: 'stale-cancel-proof', nowMs: 2 });
    await workerEnv.DB.prepare("UPDATE account_deletion_proofs SET consumed = 1 WHERE token_hash = 'stale-cancel-proof'").run();
    await expect(consumeProofsAndCancelDeletionRequest(workerEnv.DB, {
      proofTokenHashes: ['stale-cancel-proof'], accountId: 'account', sessionIdHash: 'session', operationId: 'cancel-stale', cancelledAt: 2, nowMs: 2,
    })).resolves.toMatchObject({ cancelled: false });
    await expect(workerEnv.DB.prepare("SELECT phase FROM account_deletions WHERE operation_id = 'cancel-stale'").first()).resolves.toMatchObject({ phase: 'requested' });
  });

  it('rejects cancellation once the 72-hour deadline has passed even before the coordinator flips phase', async () => {
    await insertRequest('deadline-passed', 'frozen', 2);
    await createDeletionProof(workerEnv.DB, {
      tokenHash: 'deadline-proof', accountId: 'account', sessionIdHash: 'session', purpose: 'cancel', method: 'otp',
      issuedAt: 1, expiresAt: 100, otpCodeHash: 'code',
    });
    await markDeletionProofVerified(workerEnv.DB, { tokenHash: 'deadline-proof', nowMs: 2 });
    await expect(consumeProofsAndCancelDeletionRequest(workerEnv.DB, {
      proofTokenHashes: ['deadline-proof'], accountId: 'account', sessionIdHash: 'session', operationId: 'deadline-passed', cancelledAt: 2, nowMs: 2,
    })).resolves.toMatchObject({ cancelled: false });
    await expect(workerEnv.DB.prepare("SELECT phase FROM account_deletions WHERE operation_id = 'deadline-passed'").first()).resolves.toMatchObject({ phase: 'frozen' });
    await expect(workerEnv.DB.prepare("SELECT consumed FROM account_deletion_proofs WHERE token_hash = 'deadline-proof'").first()).resolves.toMatchObject({ consumed: 0 });
  });
});

async function request(operationId) {
  return insertRequest(operationId, 'requested');
}

async function insertRequest(operationId, phase, cancellationDeadlineAt = 100) {
  await workerEnv.DB.prepare(
    "INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, cancellation_deadline_at, status_token_hash) VALUES (?, 'account', ?, 1, ?, ?)"
  ).bind(operationId, phase, cancellationDeadlineAt, `${operationId}-status`).run();
}
