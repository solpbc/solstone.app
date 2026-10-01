import { env as workerEnv, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson, encryptEmail, framedHmacSha256Base64Url } from '../src/crypto.js';
import { runAccountDeletionCoordinator } from '../src/deletion-coordinator.js';
import { answerOrigin, ORIGIN_MAX_SKEW_MS } from '../src/deletion-origin.js';
import { OwnerPurgeOrigin } from '../src/index.js';
import { makeTestEnv, resetDb } from './helpers.js';
import relayFixture from '../test-fixtures/relay-owner-purge-readiness-v1.json';
import supportFixture from '../test-fixtures/support-owner-purge-readiness-v1.json';

const KEYS = { 1: 'owner-purge-v1-fixture-test-key', 2: 'owner-purge-v2-fixture-test-key' };
const NOW = 1_800_000_000_000;

async function originFrame({
  service = 'relay',
  operationId = 'service-op',
  keyVersion = 2,
  issuedAt = NOW,
  key = KEYS[keyVersion],
  purpose = 'origin',
} = {}) {
  const unsigned = {
    version: 1,
    key_version: keyVersion,
    service,
    operation_id: operationId,
    issued_at: issuedAt,
  };
  return {
    ...unsigned,
    integrity: await framedHmacSha256Base64Url(key, `solpbc-owner-purge-v1:${service}:${purpose}`, canonicalJson(unsigned)),
  };
}

async function seedPurgingOperation({ phase = 'purging', service = 'relay', serviceOperationId = 'service-op' } = {}) {
  await workerEnv.DB.prepare(
    "INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, cancellation_deadline_at, status_token_hash) VALUES ('delete', 'account', ?, 0, 0, 'status')"
  ).bind(phase).run();
  await workerEnv.DB.prepare(
    `INSERT INTO account_deletion_service_ops (id, operation_id, service, service_operation_id, state, attempt_count)
     VALUES ('op-row', 'delete', ?, ?, 'pending', 0)`
  ).bind(service, serviceOperationId).run();
}

describe('owner-purge origin check', () => {
  beforeEach(resetDb);

  it('cannot reach the portal routes through the ORIGINATOR entrypoint', async () => {
    await seedPurgingOperation();
    const binding = workerEnv.OWNER_PURGE_ORIGIN_PROBE;
    // The route is live on the portal's own fetch handler...
    const direct = await SELF.fetch('https://services.solstone.app/account/delete/status');
    expect(direct.status).not.toBe(404);
    // ...but the entrypoint a target binds to has no fetch handler at all.
    expect(OwnerPurgeOrigin.prototype.fetch).toBeUndefined();
    for (const url of [
      'https://services.solstone.app/account/delete/status',
      'https://services.solstone.app/admin/impersonate',
      'https://account.internal/internal/deletion/originated',
    ]) {
      await expect(binding.fetch(url, { method: 'POST' })).rejects.toThrow();
    }
    // The one method it does expose answers.
    await expect(binding.originated(await originFrame({ issuedAt: Date.now() }))).resolves.toEqual({ originated: true });
  });

  it('answers yes only for an operation it holds under a purging deletion', async () => {
    const env = makeTestEnv();
    await seedPurgingOperation();
    await expect(answerOrigin(env, await originFrame(), NOW)).resolves.toBe(true);
    await expect(answerOrigin(env, await originFrame({ keyVersion: 1 }), NOW)).resolves.toBe(true);
    await expect(answerOrigin(env, await originFrame({ operationId: 'unknown-op' }), NOW)).resolves.toBe(false);
    await expect(answerOrigin(env, await originFrame({ service: 'support' }), NOW)).resolves.toBe(false);

    for (const phase of ['frozen', 'cancelled', 'complete']) {
      await resetDb();
      await seedPurgingOperation({ phase });
      await expect(answerOrigin(env, await originFrame(), NOW)).resolves.toBe(false);
    }
  });

  it('refuses a frame it cannot authenticate or that is outside its five minutes', async () => {
    const env = makeTestEnv();
    await seedPurgingOperation();
    const valid = await originFrame();
    const refusals = [
      await originFrame({ key: 'not-the-relay-key' }),
      await originFrame({ purpose: 'request' }),
      await originFrame({ purpose: 'readiness' }),
      await originFrame({ keyVersion: 3, key: KEYS[2] }),
      await originFrame({ issuedAt: NOW - ORIGIN_MAX_SKEW_MS - 1 }),
      await originFrame({ issuedAt: NOW + ORIGIN_MAX_SKEW_MS + 1 }),
      { ...valid, operation_id: 'other-op' },
      { ...valid, service: 'support' },
      { ...valid, extra: true },
      { ...valid, version: 2 },
      { ...valid, key_version: '2' },
      (({ integrity: _integrity, ...rest }) => rest)(valid),
      null,
      [],
    ];
    for (const frame of refusals) {
      await expect(answerOrigin(env, frame, NOW)).rejects.toThrow('owner purge origin frame refused');
    }
    await expect(answerOrigin(env, await originFrame({ issuedAt: NOW - ORIGIN_MAX_SKEW_MS }), NOW)).resolves.toBe(true);
  });

  it('accepts the origin frames vendored from both targets', async () => {
    const env = makeTestEnv();
    for (const [service, fixture] of [['relay', relayFixture], ['support', supportFixture]]) {
      for (const name of ['v1', 'v2']) {
        const { frame } = fixture.origin_check.sample_frames[name];
        expect(fixture.origin_check.domain).toBe(`solpbc-owner-purge-v1:${service}:origin`);
        await resetDb();
        await seedPurgingOperation({ service, serviceOperationId: frame.operation_id });
        await expect(answerOrigin(env, frame, frame.issued_at)).resolves.toBe(true);
      }
    }
  });

  it('answers yes at first receipt for an operation sent in the same coordinator pass', async () => {
    const answers = [];
    const target = (service) => ({
      async fetch(input, init) {
        const path = new URL(typeof input === 'string' ? input : input.url).pathname;
        const { envelope } = JSON.parse(init.body);
        if (path === '/internal/deletion/purge') {
          // What a target does on first receipt: ask the portal, over the
          // binding, before it binds or deletes anything.
          const answer = await workerEnv.OWNER_PURGE_ORIGIN_PROBE.originated(await originFrame({
            service,
            operationId: envelope.operation_id,
            keyVersion: envelope.key_version,
            issuedAt: Date.now(),
          }));
          answers.push({ service, ...answer });
        }
        const unsigned = {
          version: 1,
          key_version: envelope.key_version,
          service,
          operation_id: envelope.operation_id,
          request_digest: envelope.request_digest,
          disposition: path === '/internal/deletion/purge' ? 'complete' : 'confirmed',
        };
        const integrity = await framedHmacSha256Base64Url(
          KEYS[envelope.key_version],
          `solpbc-owner-purge-v1:${service}:response`,
          canonicalJson(unsigned),
        );
        return new Response(JSON.stringify({ ...unsigned, integrity }), { headers: { 'Content-Type': 'application/json' } });
      },
    });
    const env = makeTestEnv({ RELAY: target('relay'), SUPPORT_WORKER: target('support') });
    const snapshot = await encryptEmail(JSON.stringify({
      relay: { instance_ids: [] },
      support: { portal_principal: 'principal', verified_emails: [] },
    }), env);
    await workerEnv.DB.prepare(
      "INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, cancellation_deadline_at, next_attempt_at, snapshot_encrypted, status_token_hash) VALUES ('delete', 'account', 'purging', 0, 0, 0, ?, 'status')"
    ).bind(snapshot).run();

    const pass = await runAccountDeletionCoordinator(env, Date.now());
    expect(pass).toMatchObject({ claimed: true });
    expect(answers.sort((a, b) => a.service.localeCompare(b.service))).toEqual([
      { service: 'relay', originated: true },
      { service: 'support', originated: true },
    ]);
  });
});
