import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { hashWithPepper } from '../src/crypto.js';
import { makeTestEnv, resetDb } from './helpers.js';

const NEXT_RETRY = Date.parse('2024-12-03T12:00:00.000Z');

describe('deletion status', () => {
  beforeEach(resetDb);

  it('names delayed relay cleanup and the scheduled retry date', async () => {
    const env = makeTestEnv();
    await deletion(env, { operationId: 'relay-op' });
    await workerEnv.DB.prepare(
      `INSERT INTO account_deletion_service_ops (
         id, operation_id, service, state, attempt_count
       ) VALUES ('relay-service-op', 'relay-op', 'relay', 'retryable', 1)`
    ).run();

    const response = await statusRequest(env);

    expect(await response.text()).toContain('relay cleanup delayed; next retry 2024-12-03');
  });

  it('names delayed backup cleanup when service cleanup is terminal', async () => {
    const env = makeTestEnv();
    await deletion(env, { operationId: 'backup-op', stripePurgeState: 'deleted' });

    const response = await statusRequest(env);

    expect(await response.text()).toContain('backup cleanup delayed; next retry 2024-12-03');
  });

  it('names a pending service reconciliation and the scheduled retry date', async () => {
    const env = makeTestEnv();
    await deletion(env, {
      operationId: 'reconciliation-op',
      lastErrorCode: 'service_reconciliation_pending',
    });

    const response = await statusRequest(env);

    expect(await response.text()).toContain('service reconciliation pending; next retry 2024-12-03');
  });

  it('names delayed billing cleanup after backup is verified empty', async () => {
    const env = makeTestEnv();
    await deletion(env, {
      operationId: 'stripe-op',
      backupEmptyVerifiedAt: NEXT_RETRY - 1,
      stripePurgeState: 'retryable',
    });

    const response = await statusRequest(env);

    expect(await response.text()).toContain('billing cleanup delayed; next retry 2024-12-03');
  });

  it('uses the lowercase unavailable message when no receipt is present', async () => {
    const env = makeTestEnv();

    const response = await worker.fetch(new Request('https://services.solstone.app/account/delete/status'), env);

    expect(await response.text()).toContain('deletion status unavailable');
  });

  it('returns a non-identifying expired link response for a presented unknown receipt', async () => {
    const env = makeTestEnv();

    const response = await statusRequest(env);

    expect(response.status).toBe(410);
    const body = await response.text();
    expect(body).toContain('expired link');
    expect(body).not.toContain('deletion status unavailable');
  });
});

async function deletion(env, {
  operationId,
  backupEmptyVerifiedAt = null,
  stripePurgeState = null,
  lastErrorCode = null,
} = {}) {
  await workerEnv.DB.prepare(
    `INSERT INTO account_deletions (
       operation_id, account_id, phase, requested_at, cancellation_deadline_at,
       next_attempt_at, backup_empty_verified_at, stripe_purge_state, last_error_code, status_token_hash
     ) VALUES (?, 'account', 'purging', 0, 0, ?, ?, ?, ?, ?)`
  ).bind(
    operationId,
    NEXT_RETRY,
    backupEmptyVerifiedAt,
    stripePurgeState,
    lastErrorCode,
    await hashWithPepper('status-token', env)
  ).run();
}

function statusRequest(env) {
  return worker.fetch(new Request('https://services.solstone.app/account/delete/status', {
    headers: { Cookie: 'account_deletion_status=status-token' },
  }), env);
}
