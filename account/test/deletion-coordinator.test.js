import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { runAccountDeletionCoordinator } from '../src/deletion-coordinator.js';
import { advanceDeletionServiceOperation } from '../src/deletion-contract.js';
import { consumeProofsAndCancelDeletionRequest, createDeletionProof, markDeletionProofVerified } from '../src/db.js';
import { encryptEmail } from '../src/crypto.js';
import { makeTestEnv, resetDb, seedAccount } from './helpers.js';

describe('deletion coordinator', () => {
  beforeEach(resetDb);

  it('claims a due frozen row once and advances it after the cancellation deadline', async () => {
    await row('frozen', 1, 0);
    const env = makeTestEnv();
    const [first, second] = await Promise.all([runAccountDeletionCoordinator(env, 2), runAccountDeletionCoordinator(env, 2)]);
    expect([first.claimed, second.claimed].filter(Boolean)).toHaveLength(1);
    await expect(workerEnv.DB.prepare("SELECT phase FROM account_deletions WHERE operation_id = 'op'").first()).resolves.toMatchObject({ phase: 'purging' });
  });

  it('releases a frozen deletion while its cancellation window remains open', async () => {
    await row('frozen', 10_000, 0);
    await runAccountDeletionCoordinator(makeTestEnv(), 1);
    await expect(workerEnv.DB.prepare("SELECT lease_token, next_attempt_at FROM account_deletions WHERE operation_id = 'op'").first()).resolves.toMatchObject({ lease_token: null, next_attempt_at: 10_000 });
  });

  it('resumes a requested deletion after an expired claimant lease and captures its snapshot once', async () => {
    const env = makeTestEnv();
    const account = await seedAccount({ testEnv: env });
    await workerEnv.DB.prepare(
      "INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, cancellation_deadline_at, next_attempt_at, lease_token, lease_expires_at, status_token_hash) VALUES ('op', ?, 'requested', 0, 99, 0, 'dead', 1, 'status')"
    ).bind(account.accountId).run();
    await runAccountDeletionCoordinator(env, 2);
    await expect(workerEnv.DB.prepare("SELECT phase, snapshot_encrypted, lease_token FROM account_deletions WHERE operation_id = 'op'").first()).resolves.toMatchObject({ phase: 'frozen', lease_token: null });
  });

  it('refuses cancellation after a purging job has claimed its lease', async () => {
    await row('purging', 0, 0);
    await createDeletionProof(workerEnv.DB, { tokenHash: 'proof', accountId: 'account', sessionIdHash: 'session', purpose: 'cancel', method: 'otp', issuedAt: 0, expiresAt: 100, otpCodeHash: 'hash' });
    await markDeletionProofVerified(workerEnv.DB, { tokenHash: 'proof', nowMs: 1 });
    await runAccountDeletionCoordinator(makeTestEnv(), 1);
    await expect(consumeProofsAndCancelDeletionRequest(workerEnv.DB, {
      proofTokenHashes: ['proof'], accountId: 'account', sessionIdHash: 'session', operationId: 'op', cancelledAt: 1, nowMs: 1,
    })).resolves.toMatchObject({ cancelled: false });
  });

  it('does not claim or call services for an already cancelled operation', async () => {
    await row('cancelled', 0, 0);
    await expect(runAccountDeletionCoordinator(makeTestEnv(), 1)).resolves.toEqual({ claimed: false });
  });

  it('reschedules retryable purging work without completing the deletion', async () => {
    await row('purging', 0, 0);
    await runAccountDeletionCoordinator(makeTestEnv(), 1);
    await expect(workerEnv.DB.prepare("SELECT phase, next_attempt_at, attempt_count FROM account_deletions WHERE operation_id = 'op'").first()).resolves.toMatchObject({ phase: 'purging', attempt_count: 1 });
  });

  it('makes no external service call when a stale purging lease was superseded', async () => {
    let calls = 0;
    const env = makeTestEnv({ RELAY: { async fetch() { calls += 1; return new Response('{}'); } } });
    await row('purging', 0, 0);
    const snapshot = await encryptEmail(JSON.stringify({ relay: { spl_instance_ids: [], spp_instance_ids: [] } }), env);
    await workerEnv.DB.prepare(
      "UPDATE account_deletions SET snapshot_encrypted = ?, lease_token = 'stale' WHERE operation_id = 'op'"
    ).bind(snapshot).run();
    const stale = await workerEnv.DB.prepare("SELECT * FROM account_deletions WHERE operation_id = 'op'").first();
    await workerEnv.DB.prepare("UPDATE account_deletions SET lease_token = 'successor' WHERE operation_id = 'op'").run();

    await expect(advanceDeletionServiceOperation(env, { deletion: stale, service: 'relay', nowMs: 1 })).resolves.toBe('retryable');
    expect(calls).toBe(0);
    await expect(workerEnv.DB.prepare('SELECT COUNT(*) AS count FROM account_deletion_service_ops').first()).resolves.toMatchObject({ count: 0 });
  });
});

async function row(phase, deadline, next) {
  await workerEnv.DB.prepare(
    "INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, cancellation_deadline_at, next_attempt_at, status_token_hash) VALUES ('op', 'account', ?, 0, ?, ?, 'status')"
  ).bind(phase, deadline, next).run();
}
