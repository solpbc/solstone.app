import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson, framedHmacSha256Base64Url } from '../src/crypto.js';
import { runAccountDeletionCoordinator } from '../src/deletion-coordinator.js';
import { collectOwnerLocalExport } from '../src/owner-export-local.js';
import {
  ownerExportNotIncluded,
  ownerExportRetainedMechanics,
} from '../src/owner-export-retained.js';
import {
  installS3FetchMock,
  installStripeFetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedAccountEmail,
  seedCredential,
  seedDevice,
  seedEntitlement,
  seedSession,
  seedSpbBinding,
  seedSplBinding,
} from './helpers.js';

const NOW = 1_700_000_000_000;
const OWNER_INSTANCE = '11111111-1111-1111-1111-111111111111';
const CONTROL_INSTANCE = '22222222-2222-2222-2222-222222222222';

describe('owner export retained mechanics and not included metadata (AC6–7)', () => {
  beforeEach(resetDb);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('matches observed deletion, completions min-expiry, and ledger behavior in database after finalization', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));

    const env = makeTestEnv({
      RELAY: contractService('relay'),
      SUPPORT_WORKER: contractService('support'),
    });

    const owner = await seedAccount({ email: 'retained-owner@example.com', testEnv: env });
    const control = await seedAccount({ email: 'retained-control@example.com', testEnv: env });

    await seedRepresentative(env, owner, 'owner', OWNER_INSTANCE);
    await seedRepresentative(env, control, 'control', CONTROL_INSTANCE);

    installFinalizationFetch(env);

    await workerEnv.DB.prepare(
      `INSERT INTO account_deletions (
         operation_id, account_id, phase, requested_at, cancellation_deadline_at, next_attempt_at, status_token_hash
       ) VALUES ('op-retained', ?, 'requested', ?, ?, ?, 'owner-status')`
    ).bind(owner.accountId, NOW, NOW, NOW).run();

    await expect(runAccountDeletionCoordinator(env, Date.now())).resolves.toMatchObject({ phase: 'requested' });
    await expect(runAccountDeletionCoordinator(env, Date.now())).resolves.toMatchObject({ phase: 'purging' });

    // Insert BOTH confirmed relay and support ops with DIFFERENT envelope_expires_at
    const relayExpiry = NOW + 24 * 60 * 60 * 1000;
    const supportExpiry = NOW + 48 * 60 * 60 * 1000;

    await insertServiceOperation({
      id: 'relay-op',
      operationId: 'op-retained',
      service: 'relay',
      serviceOperationId: 'relay-operation-1',
      requestDigest: 'relay-digest-1',
      state: 'confirmed',
      envelopeExpiresAt: relayExpiry,
    });

    await insertServiceOperation({
      id: 'support-op',
      operationId: 'op-retained',
      service: 'support',
      serviceOperationId: 'support-operation-1',
      requestDigest: 'support-digest-1',
      state: 'confirmed',
      envelopeExpiresAt: supportExpiry,
    });

    // Also insert an extra future completion row to verify sweep selectivity
    const futureExpiry = NOW + 100 * 60 * 60 * 1000;
    await workerEnv.DB.prepare(
      `INSERT INTO account_deletion_completions (token_hash, state, completed_at, expires_at)
       VALUES ('future-status', 'complete', ?, ?)`
    ).bind(NOW, futureExpiry).run();

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);
    await expect(runAccountDeletionCoordinator(env, Date.now())).resolves.toMatchObject({ phase: 'complete' });

    const mechanics = ownerExportRetainedMechanics();

    // 1. Verify account_deletions observed row against mechanics
    const sanitizedDeletion = await workerEnv.DB.prepare(
      "SELECT * FROM account_deletions WHERE operation_id = 'op-retained'"
    ).first();

    expect(sanitizedDeletion.phase).toBe(mechanics.account_deletions.phase_on_complete);
    for (const clearedCol of mechanics.account_deletions.cleared_at_completion) {
      expect(sanitizedDeletion[clearedCol]).toBeNull();
    }
    for (const retainedCol of mechanics.account_deletions.retained_columns) {
      expect(sanitizedDeletion).toHaveProperty(retainedCol);
    }
    expect(sanitizedDeletion).not.toHaveProperty('expires_at');
    expect(mechanics.account_deletions.has_expires_at).toBe(false);

    // 2. Verify account_deletion_completions observed row equals Math.min(relay, support)
    const completionRow = await workerEnv.DB.prepare(
      "SELECT * FROM account_deletion_completions WHERE token_hash = 'owner-status'"
    ).first();

    expect(Object.keys(completionRow).sort()).toEqual(mechanics.account_deletion_completions.columns.sort());
    expect(completionRow.state).toBe('complete');
    expect(completionRow.expires_at).toBe(Math.min(relayExpiry, supportExpiry));
    expect(mechanics.account_deletion_completions.expires_at_rule).toBe('min_relay_support_envelope_expires_at');

    // 3. Test completion verifier sweep: due verifier removed while future verifier remains
    await vi.advanceTimersByTimeAsync(25 * 60 * 60 * 1000);
    await runAccountDeletionCoordinator(env, Date.now());

    const sweptRow = await workerEnv.DB.prepare(
      "SELECT * FROM account_deletion_completions WHERE token_hash = 'owner-status'"
    ).first();
    expect(sweptRow).toBeNull();

    const futureRow = await workerEnv.DB.prepare(
      "SELECT * FROM account_deletion_completions WHERE token_hash = 'future-status'"
    ).first();
    expect(futureRow).not.toBeNull();
    expect(futureRow.token_hash).toBe('future-status');

    // 4. Verify mcp_bridge_hostname_ledger persists while owner mcp_bridge_bindings are purged
    expect(mechanics.mcp_bridge_hostname_ledger.account_join).toBe(false);

    const ledgerRows = await workerEnv.DB.prepare(
      'SELECT label FROM mcp_bridge_hostname_ledger ORDER BY label'
    ).all();
    expect(ledgerRows.results.map((r) => r.label)).toEqual(['controla', 'owneraaa']);

    const ownerBindings = await workerEnv.DB.prepare(
      'SELECT * FROM mcp_bridge_bindings WHERE account_id = ?'
    ).bind(owner.accountId).all();
    expect(ownerBindings.results).toEqual([]);

    const controlBindings = await workerEnv.DB.prepare(
      'SELECT * FROM mcp_bridge_bindings WHERE account_id = ?'
    ).bind(control.accountId).all();
    expect(controlBindings.results.length).toBeGreaterThan(0);
  });

  it('fails if metadata is mutated to diverge from actual database mechanics', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));

    const env = makeTestEnv({
      RELAY: contractService('relay'),
      SUPPORT_WORKER: contractService('support'),
    });

    const owner = await seedAccount({ email: 'retained-mutated@example.com', testEnv: env });
    await seedRepresentative(env, owner, 'owner', OWNER_INSTANCE);
    installFinalizationFetch(env);

    await workerEnv.DB.prepare(
      `INSERT INTO account_deletions (
         operation_id, account_id, phase, requested_at, cancellation_deadline_at, next_attempt_at, status_token_hash
       ) VALUES ('op-mutated', ?, 'requested', ?, ?, ?, 'status-mutated')`
    ).bind(owner.accountId, NOW, NOW, NOW).run();

    await runAccountDeletionCoordinator(env, Date.now());
    await runAccountDeletionCoordinator(env, Date.now());

    const relayExpiry = NOW + 24 * 60 * 60 * 1000;
    const supportExpiry = NOW + 48 * 60 * 60 * 1000;

    await insertServiceOperation({
      id: 'relay-op-mut',
      operationId: 'op-mutated',
      service: 'relay',
      serviceOperationId: 'relay-operation-1',
      requestDigest: 'relay-digest-1',
      state: 'confirmed',
      envelopeExpiresAt: relayExpiry,
    });

    await insertServiceOperation({
      id: 'support-op-mut',
      operationId: 'op-mutated',
      service: 'support',
      serviceOperationId: 'support-operation-1',
      requestDigest: 'support-digest-1',
      state: 'confirmed',
      envelopeExpiresAt: supportExpiry,
    });

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);
    await runAccountDeletionCoordinator(env, Date.now());

    const observedSanitizedDeletion = await workerEnv.DB.prepare(
      "SELECT * FROM account_deletions WHERE operation_id = 'op-mutated'"
    ).first();

    const observedCompletionRow = await workerEnv.DB.prepare(
      "SELECT * FROM account_deletion_completions WHERE token_hash = 'status-mutated'"
    ).first();

    const observedLedgerRows = await workerEnv.DB.prepare(
      "SELECT * FROM mcp_bridge_hostname_ledger WHERE label = 'owneraaa'"
    ).all();

    const originalMechanics = ownerExportRetainedMechanics();

    // 1. Mutate cleared_at_completion: fails because 'phase' is retained (not null) in observed sanitizedDeletion
    const mutatedCleared = JSON.parse(JSON.stringify(originalMechanics));
    mutatedCleared.account_deletions.cleared_at_completion.push('phase');
    const clearedCheckFails = mutatedCleared.account_deletions.cleared_at_completion.every(
      (col) => observedSanitizedDeletion[col] === null
    );
    expect(clearedCheckFails).toBe(false);

    // 2. Mutate has_expires_at to true: fails because observed deletion has no expires_at column
    const mutatedExpiry = JSON.parse(JSON.stringify(originalMechanics));
    mutatedExpiry.account_deletions.has_expires_at = true;
    const hasExpiresAtMatchesObserved = ('expires_at' in observedSanitizedDeletion) === mutatedExpiry.account_deletions.has_expires_at;
    expect(hasExpiresAtMatchesObserved).toBe(false);

    // 3. Mutate account_join to true: fails because observed ledger has no account_id column
    const mutatedLedger = JSON.parse(JSON.stringify(originalMechanics));
    mutatedLedger.mcp_bridge_hostname_ledger.account_join = true;
    const accountJoinMatchesObserved = observedLedgerRows.results.some((row) => 'account_id' in row) === mutatedLedger.mcp_bridge_hostname_ledger.account_join;
    expect(accountJoinMatchesObserved).toBe(false);

    // 4. Mutate expires_at_rule: fails because observed completions expires_at is Math.min(relay, support)
    const mutatedRule = JSON.parse(JSON.stringify(originalMechanics));
    mutatedRule.account_deletion_completions.expires_at_rule = 'fixed_30_days';
    expect(mutatedRule.account_deletion_completions.expires_at_rule).not.toBe('min_relay_support_envelope_expires_at');
    expect(observedCompletionRow.expires_at).toBe(Math.min(relayExpiry, supportExpiry));
    expect(observedCompletionRow.expires_at).not.toBe(NOW + 30 * 24 * 60 * 60 * 1000);
  });

  it('exposes exactly four not-included categories with grounded descriptions and no extra entries', () => {
    const notIncluded = ownerExportNotIncluded();
    expect(notIncluded).toHaveLength(4);

    const codes = notIncluded.map((entry) => entry.code);
    expect(codes).toEqual([
      'journal_files',
      'operated_backup_bytes',
      'stripe_side_records',
      'anonymous_no_email_support',
    ]);

    for (const entry of notIncluded) {
      expect(entry.description).toBeTruthy();
      expect(['not_in_local_collection', 'included_binding_metadata', 'included_customer_reference'])
        .toContain(entry.local_export);
    }
  });

  it('proves local export collects metadata without fetching R2, Stripe, journal, or support', async () => {
    const globalFetchSpy = vi.fn();
    vi.stubGlobal('fetch', globalFetchSpy);

    const env = makeTestEnv();
    const owner = await seedAccount({ email: 'local-meta-owner@example.com', nowMs: NOW, testEnv: env });
    await seedRepresentative(env, owner, 'owner', OWNER_INSTANCE);

    const result = await collectOwnerLocalExport({
      db: workerEnv.DB,
      env,
      accountId: owner.accountId,
    });

    expect(result.ok).toBe(true);

    // Metadata is included
    const spbBindings = result.classes.find((c) => c.name === 'spb_bindings');
    expect(spbBindings.records.length).toBeGreaterThan(0);
    expect(spbBindings.records[0].instance_id).toBe(OWNER_INSTANCE);

    const stripeCustomers = result.classes.find((c) => c.name === 'stripe_customers');
    expect(stripeCustomers.records.length).toBeGreaterThan(0);
    expect(stripeCustomers.records[0].stripe_customer_id).toBe('cus_owner');

    // No external fetch made
    expect(globalFetchSpy).not.toHaveBeenCalled();
  });
});

async function seedRepresentative(env, account, tag, instanceId) {
  await seedAccountEmail({
    accountId: account.accountId,
    address: `${tag}-secondary@example.com`,
    verifiedAt: NOW,
    testEnv: env,
  });
  await seedSession(account.accountId, { nowMs: NOW, testEnv: env });
  await seedCredential({ accountId: account.accountId, credentialId: `${tag}-credential`, createdAt: NOW });
  await seedDevice({ accountId: account.accountId, deviceId: `${tag}-device`, pushToken: `${tag}-push`, registeredAt: NOW, lastSeenAt: NOW });
  await seedEntitlement({ accountId: account.accountId, service: 'spl_hosted', updatedAt: NOW });

  await workerEnv.DB.prepare(
    'INSERT INTO stripe_customers (account_id, stripe_customer_id, created_at) VALUES (?, ?, ?)'
  ).bind(account.accountId, tag === 'owner' ? 'cus_owner' : 'cus_control', NOW).run();

  await seedSplBinding({ accountId: account.accountId, instanceId, createdAt: NOW, lastSeenAt: NOW });

  const mcpLabel = tag === 'owner' ? 'owneraaa' : 'controla';
  await workerEnv.DB.prepare(
    'INSERT INTO mcp_bridge_hostname_ledger (label, created_at) VALUES (?, ?)'
  ).bind(mcpLabel, NOW).run();

  await workerEnv.DB.prepare(
    'INSERT INTO mcp_bridge_bindings (account_id, instance_id, label, created_at) VALUES (?, ?, ?, ?)'
  ).bind(account.accountId, instanceId, mcpLabel, NOW).run();

  await seedSpbBinding({ accountId: account.accountId, instanceId, createdAt: NOW, lastSeenAt: NOW, tokenHash: `${tag}-spb` });
}

async function insertServiceOperation({
  id,
  operationId,
  service,
  serviceOperationId,
  requestDigest,
  state,
  envelopeExpiresAt,
}) {
  await workerEnv.DB.prepare(
    `INSERT INTO account_deletion_service_ops (
       id, operation_id, service, service_operation_id, request_digest, state,
       envelope_expires_at, next_attempt_at, attempt_count
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`
  ).bind(id, operationId, service, serviceOperationId, requestDigest, state, envelopeExpiresAt).run();
}

function contractService(service) {
  return {
    async fetch(_input, init) {
      const body = JSON.parse(init.body);
      const envelope = body.envelope;
      const unsigned = {
        version: 1,
        key_version: envelope.key_version,
        service,
        operation_id: envelope.operation_id,
        request_digest: envelope.request_digest,
        disposition: new URL(_input).pathname.endsWith('/confirm') ? 'confirmed' : 'complete',
      };
      return new Response(JSON.stringify({
        ...unsigned,
        integrity: await framedHmacSha256Base64Url(
          envelope.key_version === 1 ? 'owner-purge-v1-fixture-test-key' : 'owner-purge-v2-fixture-test-key',
          `solpbc-owner-purge-v1:${service}:response`,
          canonicalJson(unsigned),
        ),
      }), { headers: { 'Content-Type': 'application/json' } });
    },
  };
}

function installFinalizationFetch(env) {
  const s3 = installS3FetchMock(env, {
    default: async ({ method, url }) => {
      if (method === 'GET' && url.searchParams.get('list-type') === '2') {
        return new Response('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>', {
          headers: { 'Content-Type': 'application/xml' },
        });
      }
      if (method === 'GET' && url.searchParams.has('uploads')) {
        return new Response('<ListMultipartUploadsResult><IsTruncated>false</IsTruncated></ListMultipartUploadsResult>', {
          headers: { 'Content-Type': 'application/xml' },
        });
      }
      throw new Error(`unexpected S3 call: ${method} ${url.href}`);
    },
  });

  const stripe = installStripeFetchMock({
    'DELETE api.stripe.com/v1/customers/cus_owner': async () => new Response(JSON.stringify({ id: 'cus_owner', deleted: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  });

  vi.stubGlobal('fetch', (input, init) => {
    const href = typeof input === 'string' ? input : input.url;
    return new URL(href).host === 'api.stripe.com'
      ? stripe.fetchMock(input, init)
      : s3.fetchMock(input, init);
  });
}
