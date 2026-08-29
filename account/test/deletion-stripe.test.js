import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAccountDeletionCoordinator } from '../src/deletion-coordinator.js';
import { encryptEmail } from '../src/crypto.js';
import {
  installStripeFetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
} from './helpers.js';

const NOW = 1_700_000_000_000;

describe('deletion Stripe purge', () => {
  beforeEach(resetDb);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('records a deleted Stripe customer as terminal', async () => {
    const env = makeTestEnv();
    const account = await seedAccount({ email: 'stripe-deleted@example.com', testEnv: env });
    await purgingDeletion(env, account.accountId, 'cus_deleted');
    const { calls } = installStripeFetchMock({
      'DELETE api.stripe.com/v1/customers/cus_deleted': async () => stripeJson({ id: 'cus_deleted', deleted: true }),
    });

    const result = await runAccountDeletionCoordinator(env, NOW);

    expect(result).toMatchObject({ claimed: true, phase: 'purging', stripe: 'complete' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'DELETE' });
    expect(calls[0].init.headers).not.toHaveProperty('Idempotency-Key');
    await expect(stripeState()).resolves.toMatchObject({ stripe_purge_state: 'deleted', stripe_purge_attempted_at: NOW });
  });

  it('treats an absent Stripe customer as terminal', async () => {
    const env = makeTestEnv();
    const account = await seedAccount({ email: 'stripe-absent@example.com', testEnv: env });
    await purgingDeletion(env, account.accountId, 'cus_absent');
    const { calls } = installStripeFetchMock({
      'DELETE api.stripe.com/v1/customers/cus_absent': async () => new Response('{}', { status: 404 }),
    });

    const result = await runAccountDeletionCoordinator(env, NOW);

    expect(result).toMatchObject({ claimed: true, phase: 'purging', stripe: 'complete' });
    expect(calls).toHaveLength(1);
    await expect(stripeState()).resolves.toMatchObject({ stripe_purge_state: 'absent', stripe_purge_attempted_at: NOW });
  });

  it('keeps a timeout or error retryable', async () => {
    const env = makeTestEnv();
    const account = await seedAccount({ email: 'stripe-retry@example.com', testEnv: env });
    await purgingDeletion(env, account.accountId, 'cus_retry');
    const { calls } = installStripeFetchMock({
      'DELETE api.stripe.com/v1/customers/cus_retry': async () => { throw new Error('timeout'); },
    });

    const result = await runAccountDeletionCoordinator(env, NOW);

    expect(result).toMatchObject({ claimed: true, phase: 'purging', stripe: 'retryable' });
    expect(calls).toHaveLength(1);
    await expect(stripeState()).resolves.toMatchObject({ stripe_purge_state: 'retryable', stripe_purge_attempted_at: NOW });
  });

  it('retries once after failure, then persists terminal success without another delete', async () => {
    const env = makeTestEnv();
    const account = await seedAccount({ email: 'stripe-retry-success@example.com', testEnv: env });
    await purgingDeletion(env, account.accountId, 'cus_retry_success');
    let attempts = 0;
    const { calls } = installStripeFetchMock({
      'DELETE api.stripe.com/v1/customers/cus_retry_success': async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('timeout');
        return stripeJson({ id: 'cus_retry_success', deleted: true });
      },
    });

    await expect(runAccountDeletionCoordinator(env, NOW)).resolves.toMatchObject({ stripe: 'retryable' });
    const first = await stripeState();
    await expect(runAccountDeletionCoordinator(env, first.next_attempt_at)).resolves.toMatchObject({ stripe: 'complete' });
    const second = await stripeState();
    await expect(runAccountDeletionCoordinator(env, second.next_attempt_at)).resolves.toMatchObject({ stripe: 'complete' });

    expect(calls).toHaveLength(2);
    await expect(stripeState()).resolves.toMatchObject({ stripe_purge_state: 'deleted' });
  });
});

async function purgingDeletion(env, accountId, stripeCustomerId) {
  const snapshot = await encryptEmail(JSON.stringify({
    relay: { spl_instance_ids: [], spp_instance_ids: [] },
    backup: { spb_instance_ids: [] },
    support_owner_id: accountId,
    stripe_customer_id: stripeCustomerId,
  }), env);
  await workerEnv.DB.prepare(
    `INSERT INTO account_deletions (
       operation_id, account_id, phase, requested_at, frozen_at, cancellation_deadline_at,
       next_attempt_at, snapshot_encrypted, snapshot_digest, status_token_hash
     ) VALUES ('op', ?, 'purging', 0, -1, 0, ?, ?, 'digest', 'status')`
  ).bind(accountId, NOW, snapshot).run();
}

async function stripeState() {
  return workerEnv.DB.prepare(
    "SELECT stripe_purge_state, stripe_purge_attempted_at, next_attempt_at FROM account_deletions WHERE operation_id = 'op'"
  ).first();
}

function stripeJson(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
