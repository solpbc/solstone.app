import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { scopedHmac, encryptEmail } from '../src/crypto.js';
import { advanceDeletionServiceOperation, remintExpiredDeletionServiceOperation } from '../src/deletion-contract.js';
import { makeTestEnv, resetDb } from './helpers.js';

describe('deletion purge contract', () => {
  beforeEach(resetDb);

  it('delivers then confirms an authenticated unchanged relay envelope', async () => {
    const testEnv = makeTestEnv({ RELAY: contractService('relay', 'test-relay-grant-secret') });
    const snapshot = await encryptEmail(JSON.stringify({ relay: { spl_instance_ids: ['one'], spp_instance_ids: [] } }), testEnv);
    await deletion(snapshot);
    const row = await workerEnv.DB.prepare("SELECT * FROM account_deletions WHERE operation_id = 'delete'").first();
    await expect(advanceDeletionServiceOperation(testEnv, { deletion: row, service: 'relay', nowMs: 1 })).resolves.toBe('complete');
    await expect(workerEnv.DB.prepare("SELECT state FROM account_deletion_service_ops WHERE operation_id = 'delete' AND service = 'relay'").first()).resolves.toMatchObject({ state: 'complete' });
  });

  it('keeps malformed, lost, or expired work retryable', async () => {
    const testEnv = makeTestEnv({ RELAY: { async fetch() { return new Response('{}'); } } });
    await deletion(await encryptEmail(JSON.stringify({ relay: { spl_instance_ids: [] } }), testEnv));
    const row = await workerEnv.DB.prepare("SELECT * FROM account_deletions WHERE operation_id = 'delete'").first();
    await expect(advanceDeletionServiceOperation(testEnv, { deletion: row, service: 'relay', nowMs: 1 })).resolves.toBe('retryable');
    await workerEnv.DB.prepare("UPDATE account_deletion_service_ops SET envelope_expires_at = 0").run();
    await expect(advanceDeletionServiceOperation(testEnv, { deletion: row, service: 'relay', nowMs: 2 })).resolves.toBe('retryable');
  });

  it('completes a zero-target relay snapshot', async () => {
    const env = makeTestEnv({ RELAY: contractService('relay', 'test-relay-grant-secret') });
    await deletion(await encryptEmail(JSON.stringify({ relay: { spl_instance_ids: [], spp_instance_ids: [] } }), env));
    const row = await deletionRow();
    await expect(advanceDeletionServiceOperation(env, { deletion: row, service: 'relay', nowMs: 1 })).resolves.toBe('complete');
  });

  it('canonicalizes duplicate relay targets into one complete operation', async () => {
    const env = makeTestEnv({ RELAY: contractService('relay', 'test-relay-grant-secret') });
    await deletion(await encryptEmail(JSON.stringify({ relay: { spl_instance_ids: ['one', 'one'], spp_instance_ids: [] } }), env));
    await expect(advanceDeletionServiceOperation(env, { deletion: await deletionRow(), service: 'relay', nowMs: 1 })).resolves.toBe('complete');
    await expect(count("state = 'complete'")).resolves.toBe(1);
  });

  it('makes a lost delivery retryable', async () => {
    const env = makeTestEnv({ RELAY: { async fetch() { throw new Error('lost'); } } });
    await deletion(await encryptEmail(JSON.stringify({ relay: {} }), env));
    await expect(advanceDeletionServiceOperation(env, { deletion: await deletionRow(), service: 'relay', nowMs: 1 })).resolves.toBe('retryable');
  });

  it('rejects an altered replay with a stale HMAC', async () => {
    const base = contractService('relay', 'test-relay-grant-secret');
    const env = makeTestEnv({ RELAY: { async fetch(input, init) {
      const response = await base.fetch(input, init);
      const body = await response.json();
      return new Response(JSON.stringify({ ...body, request_digest: 'altered' }), { headers: { 'Content-Type': 'application/json' } });
    } } });
    await deletion(await encryptEmail(JSON.stringify({ relay: {} }), env));
    await expect(advanceDeletionServiceOperation(env, { deletion: await deletionRow(), service: 'relay', nowMs: 1 })).resolves.toBe('retryable');
  });

  it('mints a fresh recovery operation after a retryable envelope expires', async () => {
    const env = makeTestEnv({ RELAY: { async fetch() { return new Response('{}'); } } });
    await deletion(await encryptEmail(JSON.stringify({ relay: {} }), env));
    const row = await deletionRow();
    await advanceDeletionServiceOperation(env, { deletion: row, service: 'relay', nowMs: 1 });
    const old = await workerEnv.DB.prepare("SELECT service_operation_id FROM account_deletion_service_ops").first();
    await workerEnv.DB.prepare('UPDATE account_deletion_service_ops SET envelope_expires_at = 0').run();
    env.RELAY = contractService('relay', 'test-relay-grant-secret');
    await expect(advanceDeletionServiceOperation(env, { deletion: row, service: 'relay', nowMs: 2 })).resolves.toBe('complete');
    const complete = await workerEnv.DB.prepare("SELECT service_operation_id FROM account_deletion_service_ops WHERE state = 'complete'").first();
    expect(complete.service_operation_id).not.toBe(old.service_operation_id);
    await expect(count("state = 'complete'")).resolves.toBe(1);
  });

  it('keeps an authenticated absence confirmation retryable', async () => {
    let calls = 0;
    const env = makeTestEnv({ RELAY: { async fetch(input, init) {
      calls += 1;
      const envelope = JSON.parse(init.body);
      const snapshot = envelope.association_snapshot;
      const digest = await scopedHmac(canonical(snapshot), 'test-relay-grant-secret', 'purge-contract-v1:relay:digest');
      const unsigned = {
        deletion_operation_id: envelope.deletion_operation_id,
        service_operation_id: envelope.service_operation_id,
        request_digest: envelope.request_digest,
        association_digest: digest,
        state: calls === 1 ? 'complete' : 'absent',
        ...(calls === 1 ? {} : { no_matching_association: true }),
      };
      const hmac = await scopedHmac(canonical(unsigned), 'test-relay-grant-secret', 'purge-contract-v1:relay');
      return new Response(JSON.stringify({ ...unsigned, hmac }), { headers: { 'Content-Type': 'application/json' } });
    } } });
    await deletion(await encryptEmail(JSON.stringify({ relay: {} }), env));
    await expect(advanceDeletionServiceOperation(env, { deletion: await deletionRow(), service: 'relay', nowMs: 1 })).resolves.toBe('retryable');
    await expect(workerEnv.DB.prepare("SELECT state FROM account_deletion_service_ops WHERE operation_id = 'delete'").first()).resolves.toMatchObject({ state: 'retryable' });
  });

  it('keeps an authenticated retryable service disposition retryable', async () => {
    const env = makeTestEnv({ RELAY: responseService('retryable') });
    await deletion(await encryptEmail(JSON.stringify({ relay: {} }), env));
    await expect(advanceDeletionServiceOperation(env, { deletion: await deletionRow(), service: 'relay', nowMs: 1 })).resolves.toBe('retryable');
  });

  it('treats a non-complete authenticated disposition as a hard refusal', async () => {
    const env = makeTestEnv({ RELAY: responseService('refused') });
    await deletion(await encryptEmail(JSON.stringify({ relay: {} }), env));
    await expect(advanceDeletionServiceOperation(env, { deletion: await deletionRow(), service: 'relay', nowMs: 1 })).resolves.toBe('non_complete_refusal');
  });

  it('remints an expired retryable operation instead of treating the old envelope as terminal', async () => {
    const env = makeTestEnv({ RELAY: contractService('relay', 'test-relay-grant-secret') });
    await deletion(await encryptEmail(JSON.stringify({ relay: {} }), env));
    await advanceDeletionServiceOperation(env, { deletion: await deletionRow(), service: 'relay', nowMs: 1 });
    await workerEnv.DB.prepare("UPDATE account_deletion_service_ops SET state = 'retryable', envelope_expires_at = 1").run();
    await expect(advanceDeletionServiceOperation(env, { deletion: await deletionRow(), service: 'relay', nowMs: 2 })).resolves.toBe('complete');
  });

  it('refuses an altered association snapshot without redelivering it', async () => {
    const env = makeTestEnv({ RELAY: { async fetch() { throw new Error('must not deliver altered snapshot'); } } });
    await deletion(await encryptEmail(JSON.stringify({ relay: { spl_instance_ids: ['one'] } }), env));
    const row = await deletionRow();
    await advanceDeletionServiceOperation(env, { deletion: row, service: 'relay', nowMs: 1 });
    await workerEnv.DB.prepare("UPDATE account_deletion_service_ops SET request_digest = 'different'").run();
    await expect(advanceDeletionServiceOperation(env, { deletion: row, service: 'relay', nowMs: 2 })).resolves.toBe('non_complete_refusal');
  });

  it('uses the support binding and its independent scoped secret', async () => {
    const env = makeTestEnv({ SUPPORT_WORKER: contractService('support', 'test-services-auth-token') });
    await deletion(await encryptEmail(JSON.stringify({ support_owner_id: 'account' }), env));
    await expect(advanceDeletionServiceOperation(env, { deletion: await deletionRow(), service: 'support', nowMs: 1 })).resolves.toBe('complete');
  });

  it.each([
    ['swapped service secret', { hmacSecret: 'test-services-auth-token', hmacScope: 'purge-contract-v1:support' }, 'retryable'],
    ['wrong association digest', { associationDigest: 'different' }, 'retryable'],
    ['legacy absence disposition', { state: ['confirmed', 'absent'].join('_') }, 'non_complete_refusal'],
    ['wrong contract scope version', { hmacScope: 'purge-contract-v0:relay' }, 'retryable'],
  ])('rejects a %s response under the v1 contract', async (_name, overrides, expected) => {
    const env = makeTestEnv({ RELAY: responseService(overrides.state || 'complete', overrides) });
    await deletion(await encryptEmail(JSON.stringify({ relay: {} }), env));
    await expect(advanceDeletionServiceOperation(env, { deletion: await deletionRow(), service: 'relay', nowMs: 1 })).resolves.toBe(expected);
  });

  it('remints only an expired non-complete service operation', async () => {
    const env = makeTestEnv();
    const snapshot = { relay: { spl_instance_ids: ['relay-target'], spp_instance_ids: [] }, support_owner_id: 'account' };
    await deletion(await encryptEmail(JSON.stringify(snapshot), env));
    const supportDigest = await scopedHmac(canonical({ support_owner_id: 'account' }), 'test-services-auth-token', 'purge-contract-v1:support:digest');
    await workerEnv.DB.batch([
      workerEnv.DB.prepare(
        `INSERT INTO account_deletion_service_ops (
           id, operation_id, service, service_operation_id, request_digest, state, envelope_expires_at, next_attempt_at, attempt_count
         ) VALUES ('relay-complete', 'delete', 'relay', 'relay-original', 'relay-digest', 'complete', 5, 1, 1)`
      ),
      workerEnv.DB.prepare(
        `INSERT INTO account_deletion_service_ops (
           id, operation_id, service, service_operation_id, request_digest, state, envelope_expires_at, next_attempt_at, attempt_count
         ) VALUES ('support-expired', 'delete', 'support', 'support-original', ?, 'retryable', 5, 1, 1)`
      ).bind(supportDigest),
    ]);

    const reminted = await remintExpiredDeletionServiceOperation(env, {
      deletion: await deletionRow(), service: 'support', nowMs: 6,
    });

    expect(reminted).toMatchObject({ service: 'support', state: 'pending', request_digest: supportDigest, envelope_expires_at: 6 + 7 * 24 * 60 * 60 * 1000 });
    expect(reminted.service_operation_id).not.toBe('support-original');
    await expect(workerEnv.DB.prepare(
      "SELECT state, service_operation_id, envelope_expires_at FROM account_deletion_service_ops WHERE id = 'relay-complete'"
    ).first()).resolves.toEqual({ state: 'complete', service_operation_id: 'relay-original', envelope_expires_at: 5 });
  });
});

function contractService(service, secret) {
  return { async fetch(input, init) {
    const envelope = JSON.parse(init.body);
    const snapshot = envelope.association_snapshot;
    const associationDigest = await scopedHmac(canonical(snapshot), secret, `purge-contract-v1:${service}:digest`);
    const unsigned = {
      deletion_operation_id: envelope.deletion_operation_id,
      service_operation_id: envelope.service_operation_id,
      request_digest: envelope.request_digest,
      association_digest: associationDigest,
      state: 'complete',
    };
    const hmac = await scopedHmac(canonical(unsigned), secret, `purge-contract-v1:${service}`);
    return new Response(JSON.stringify({ ...unsigned, hmac }), { headers: { 'Content-Type': 'application/json' } });
  }};
}

function responseService(state, {
  associationDigest: expectedDigest,
  hmacSecret = 'test-relay-grant-secret',
  hmacScope = 'purge-contract-v1:relay',
} = {}) {
  return { async fetch(_input, init) {
    const envelope = JSON.parse(init.body);
    const associationDigest = expectedDigest ?? await scopedHmac(canonical(envelope.association_snapshot), 'test-relay-grant-secret', 'purge-contract-v1:relay:digest');
    const unsigned = { deletion_operation_id: envelope.deletion_operation_id, service_operation_id: envelope.service_operation_id, request_digest: envelope.request_digest, association_digest: associationDigest, state };
    return new Response(JSON.stringify({ ...unsigned, hmac: await scopedHmac(canonical(unsigned), hmacSecret, hmacScope) }), { headers: { 'Content-Type': 'application/json' } });
  } };
}

async function deletion(snapshot) {
  await workerEnv.DB.prepare(
    "INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, cancellation_deadline_at, snapshot_encrypted, status_token_hash, lease_token) VALUES ('delete', 'account', 'purging', 0, 0, ?, 'status', 'lease')"
  ).bind(snapshot).run();
}

async function deletionRow() {
  return workerEnv.DB.prepare("SELECT * FROM account_deletions WHERE operation_id = 'delete'").first();
}

async function count(where) {
  const row = await workerEnv.DB.prepare(`SELECT COUNT(*) AS count FROM account_deletion_service_ops WHERE ${where}`).first();
  return row.count;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
