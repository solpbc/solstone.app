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
        proofTokenHashes: ['cancel-proof'], accountId: 'account', sessionIdHash: 'session', operationId: 'one', cancelledAt: 2,
      }),
      consumeProofsAndCancelDeletionRequest(workerEnv.DB, {
        proofTokenHashes: ['cancel-proof'], accountId: 'account', sessionIdHash: 'session', operationId: 'one', cancelledAt: 2,
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
      proofTokenHashes: ['purging-proof'], accountId: 'account', sessionIdHash: 'session', operationId: 'purging', cancelledAt: 2,
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
});

async function request(operationId) {
  return insertRequest(operationId, 'requested');
}

async function insertRequest(operationId, phase) {
  await workerEnv.DB.prepare(
    "INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, cancellation_deadline_at, status_token_hash) VALUES (?, 'account', ?, 1, 2, ?)"
  ).bind(operationId, phase, `${operationId}-status`).run();
}
