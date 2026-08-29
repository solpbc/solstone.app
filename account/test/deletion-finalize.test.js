import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { runAccountDeletionCoordinator } from '../src/deletion-coordinator.js';
import { canonicalJson, decryptEmail, encryptEmail, framedHmacSha256Base64Url, hashKey, hashWithPepper } from '../src/crypto.js';
import { createDeletionProof, insertDispatchToken, insertServiceHandoff, upsertSppBinding } from '../src/db.js';
import { prefixFor } from '../src/spb-broker.js';
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
  seedOtp,
  seedSession,
  seedSpbBinding,
  seedSpbSweepAudit,
  seedSplBinding,
} from './helpers.js';

const NOW = 1_700_000_000_000;
const OWNER_INSTANCE = '11111111-1111-1111-1111-111111111111';
const CONTROL_INSTANCE = '22222222-2222-2222-2222-222222222222';

describe('deletion finalization', () => {
  beforeEach(resetDb);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('purges every owner row, retains control rows, and creates only the identifier-free verifier', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const env = makeTestEnv({
      RELAY: contractService('relay'),
      SUPPORT_WORKER: contractService('support'),
    });
    const owner = await seedAccount({ email: 'final-owner@example.com', testEnv: env });
    const control = await seedAccount({ email: 'final-control@example.com', testEnv: env });
    const ownerData = await seedRepresentative(env, owner, 'owner', OWNER_INSTANCE);
    const controlData = await seedRepresentative(env, control, 'control', CONTROL_INSTANCE);
    const ownerPrefix = prefixFor(owner.accountId, OWNER_INSTANCE);
    installFinalizationFetch(env);
    await workerEnv.DB.prepare(
      `INSERT INTO enable_scout_codes (code_hash, nonce_hash, account_id, created_at, expires_at, ip_hash)
       VALUES ('null-code', 'null-nonce', NULL, 0, 1, 'null-ip')`
    ).run();
    await workerEnv.DB.prepare(
      `INSERT INTO rate_buckets (key, count, window_start) VALUES (?, 1, ?)`
    ).bind(await hashKey('signin_ip', '203.0.113.7', env), NOW).run();
    await requestedDeletion(owner.accountId);

    await expect(runAccountDeletionCoordinator(env, Date.now())).resolves.toMatchObject({ phase: 'requested' });
    await expect(runAccountDeletionCoordinator(env, Date.now())).resolves.toMatchObject({ phase: 'purging' });
    const deletion = await workerEnv.DB.prepare("SELECT snapshot_encrypted FROM account_deletions WHERE operation_id = 'op'").first();
    const snapshot = JSON.parse(await decryptEmail(deletion.snapshot_encrypted, env));
    const relayExpiry = NOW + 24 * 60 * 60 * 1000;
    await insertServiceOperation({
      id: 'relay-earlier',
      operationId: 'op',
      service: 'relay',
      serviceOperationId: 'relay-earlier-operation',
      requestDigest: 'relay-earlier-digest',
      state: 'confirmed',
      envelopeExpiresAt: relayExpiry,
    });
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);
    await expect(runAccountDeletionCoordinator(env, Date.now())).resolves.toMatchObject({ phase: 'complete' });

    for (const table of accountTables) {
      await expect(countForAccount(table, owner.accountId)).resolves.toBe(0);
      await expect(countForAccount(table, control.accountId)).resolves.toBeGreaterThan(0);
    }
    await expect(workerEnv.DB.prepare(
      'SELECT label FROM mcp_bridge_hostname_ledger ORDER BY label'
    ).all()).resolves.toMatchObject({
      results: [{ label: 'controla' }, { label: 'owneraaa' }],
    });
    for (const hash of ownerData.otpHashes) await expect(countBy('otp_tokens', 'email_lower_hash', hash)).resolves.toBe(0);
    for (const hash of controlData.otpHashes) await expect(countBy('otp_tokens', 'email_lower_hash', hash)).resolves.toBe(1);
    for (const key of ownerData.rateBucketKeys) await expect(countBy('rate_buckets', 'key', key)).resolves.toBe(0);
    for (const key of controlData.rateBucketKeys) await expect(countBy('rate_buckets', 'key', key)).resolves.toBe(1);
    await expect(countBy('rate_buckets', 'key', await hashKey('signin_ip', '203.0.113.7', env))).resolves.toBe(1);
    await expect(countBy('enable_scout_codes', 'code_hash', 'null-code')).resolves.toBe(1);
    await expect(countBy('account_deletion_service_ops', 'operation_id', 'op')).resolves.toBe(0);

    const completionVerifier = await workerEnv.DB.prepare('SELECT * FROM account_deletion_completions').first();
    expect(Object.keys(completionVerifier).sort()).toEqual(['completed_at', 'expires_at', 'state', 'token_hash']);
    expect(completionVerifier).toMatchObject({
      token_hash: 'owner-status',
      state: 'complete',
      completed_at: NOW + 5 * 60 * 1000 + 1,
      expires_at: relayExpiry,
    });
    await expect(workerEnv.DB.prepare(
      "SELECT account_id, phase, snapshot_encrypted, snapshot_digest, status_token_hash, completed_at FROM account_deletions WHERE operation_id = 'op'"
    ).first()).resolves.toMatchObject({
      account_id: null,
      phase: 'complete',
      snapshot_encrypted: null,
      snapshot_digest: null,
      status_token_hash: null,
      completed_at: NOW + 5 * 60 * 1000 + 1,
    });
    expect(ownerPrefix).toContain(owner.accountId);
  });

  it('reconciles one expired confirmed service without widening work, then preserves the literal earliest verifier expiry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const env = makeTestEnv({
      RELAY: contractService('relay'),
      SUPPORT_WORKER: contractService('support'),
    });
    const owner = await seedAccount({ email: 'reconciliation-owner@example.com', testEnv: env });
    const snapshot = {
      relay: { instance_ids: ['relay-target'] },
      backup: { spb_instance_ids: [] },
      support: { portal_principal: owner.accountId, verified_emails: [] },
      stripe_customer_id: null,
    };
    const encrypted = await encryptEmail(JSON.stringify(snapshot), env);
    const statusTokenHash = await hashWithPepper('reconcile-status', env);
    await workerEnv.DB.prepare(
      `INSERT INTO account_deletions (
       operation_id, account_id, phase, requested_at, frozen_at, cancellation_deadline_at,
       next_attempt_at, snapshot_encrypted, snapshot_digest, status_token_hash
       ) VALUES ('reconcile', ?, 'purging', ?, ?, ?, ?, ?, 'digest', ?)`
    ).bind(owner.accountId, NOW - 2, NOW - 1, NOW - 1, NOW, encrypted, statusTokenHash).run();
    await insertServiceOperation({
      id: 'reconcile-relay',
      operationId: 'reconcile',
      service: 'relay',
      serviceOperationId: 'relay-complete',
      requestDigest: 'relay-expired-digest',
      state: 'confirmed',
      envelopeExpiresAt: NOW - 1,
    });
    await insertServiceOperation({
      id: 'reconcile-support-confirmed',
      operationId: 'reconcile',
      service: 'support',
      serviceOperationId: 'support-confirmed',
      requestDigest: 'support-confirmed-digest',
      state: 'confirmed',
      envelopeExpiresAt: NOW + 2 * 24 * 60 * 60 * 1000,
    });

    await expect(runAccountDeletionCoordinator(env, NOW)).resolves.toMatchObject({
      claimed: true,
      phase: 'purging',
      reconciliation: 'service_reconciliation_pending',
    });

    await expect(workerEnv.DB.prepare(
      "SELECT phase, snapshot_encrypted, last_error_code FROM account_deletions WHERE operation_id = 'reconcile'"
    ).first()).resolves.toMatchObject({
      phase: 'purging',
      snapshot_encrypted: encrypted,
      last_error_code: 'service_reconciliation_pending',
    });
    await expect(workerEnv.DB.prepare('SELECT COUNT(*) AS count FROM account_deletion_completions').first()).resolves.toMatchObject({ count: 0 });
    await expect(workerEnv.DB.prepare(
      "SELECT service_operation_id, state, envelope_expires_at FROM account_deletion_service_ops WHERE id = 'reconcile-support-confirmed'"
    ).first()).resolves.toEqual({
      service_operation_id: 'support-confirmed',
      state: 'confirmed',
      envelope_expires_at: NOW + 2 * 24 * 60 * 60 * 1000,
    });
    const relayOps = await workerEnv.DB.prepare(
      "SELECT service_operation_id, state, envelope_expires_at FROM account_deletion_service_ops WHERE operation_id = 'reconcile' AND service = 'relay' ORDER BY rowid"
    ).all();
    expect(relayOps.results).toHaveLength(2);
    expect(relayOps.results[1]).toMatchObject({
      state: 'pending',
      envelope_expires_at: NOW + 7 * 24 * 60 * 60 * 1000,
    });
    expect(relayOps.results[1].service_operation_id).not.toBe('relay-complete');

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    await expect(runAccountDeletionCoordinator(env, Date.now())).resolves.toMatchObject({ phase: 'complete' });

    const verifier = await workerEnv.DB.prepare(
      'SELECT expires_at FROM account_deletion_completions WHERE token_hash = ?'
    ).bind(statusTokenHash).first();
    expect(verifier.expires_at).toBe(NOW + 2 * 24 * 60 * 60 * 1000);
    const response = await worker.fetch(new Request('https://services.solstone.app/account/delete/status', {
      headers: { Cookie: 'account_deletion_status=reconcile-status' },
    }), env);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('complete');
  });

  it('hard-deletes expired completion verifiers even when no deletion is due', async () => {
    const env = makeTestEnv();
    await workerEnv.DB.prepare(
      `INSERT INTO account_deletion_completions (token_hash, state, completed_at, expires_at)
       VALUES ('expired-verifier', 'complete', ?, ?)`
    ).bind(NOW - 8 * 24 * 60 * 60 * 1000, NOW - 1).run();

    await expect(runAccountDeletionCoordinator(env, NOW)).resolves.toEqual({ claimed: false });
    await expect(countBy('account_deletion_completions', 'token_hash', 'expired-verifier')).resolves.toBe(0);
  });
});

const accountTables = [
  'account_deletion_proofs',
  'spb_mint_reservations',
  'service_handoffs',
  'account_dispatch_tokens',
  'sessions',
  'passkey_challenges',
  'passkey_credentials',
  'account_devices',
  'spb_retired_tokens',
  'spb_mint_audit',
  'spb_sweep_audit',
  'spb_bindings',
  'spp_mint_audit',
  'spp_bindings',
  'spl_bindings',
  'mcp_bridge_bindings',
  'entitlements',
  'stripe_customers',
  'scout_lifecycle_events',
  'scout_applications',
  'enable_scout_codes',
  'account_emails',
  'accounts',
];

async function seedRepresentative(env, account, tag, instanceId) {
  const secondary = await seedAccountEmail({
    accountId: account.accountId,
    address: `${tag}-secondary@example.com`,
    verifiedAt: NOW,
    testEnv: env,
  });
  const emails = [account.emailLower, secondary.addressLower];
  await seedSession(account.accountId, { nowMs: NOW, testEnv: env });
  await seedCredential({ accountId: account.accountId, credentialId: `${tag}-credential`, createdAt: NOW });
  await workerEnv.DB.prepare(
    `INSERT INTO passkey_challenges (challenge, account_id, purpose, created_at, expires_at)
     VALUES (?, ?, 'register', ?, ?)`
  ).bind(`${tag}-challenge`, account.accountId, NOW, NOW + 1).run();
  await seedDevice({ accountId: account.accountId, deviceId: `${tag}-device`, pushToken: `${tag}-push`, registeredAt: NOW, lastSeenAt: NOW });
  await insertDispatchToken(workerEnv.DB, { tokenHash: `${tag}-dispatch`, accountId: account.accountId, nowMs: NOW });
  await insertServiceHandoff(workerEnv.DB, {
    handoffHash: `${tag}-handoff`, accountId: account.accountId, service: 'scout',
    payloadEncrypted: 'payload', createdAt: NOW, expiresAt: NOW + 1,
  });
  await workerEnv.DB.prepare(
    `INSERT INTO scout_applications (account_id, status, created_at, updated_at)
     VALUES (?, 'pending', ?, ?)`
  ).bind(account.accountId, NOW, NOW).run();
  await workerEnv.DB.prepare(
    `INSERT INTO scout_lifecycle_events (
       correlation_id, account_id, sequence, action, from_status, to_status,
       actor_kind, actor_principal, reason_code, occurred_at
     ) VALUES (?, ?, 1, 'apply', 'absent', 'pending', 'owner', ?, 'owner_application', ?)`
  ).bind(`${tag}-event`, account.accountId, account.accountId, NOW).run();
  await workerEnv.DB.prepare(
    `INSERT INTO enable_scout_codes (code_hash, nonce_hash, account_id, created_at, expires_at, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(`${tag}-code`, `${tag}-nonce`, account.accountId, NOW, NOW + 1, `${tag}-ip`).run();
  await seedEntitlement({ accountId: account.accountId, updatedAt: NOW });
  await workerEnv.DB.prepare(
    'INSERT INTO stripe_customers (account_id, stripe_customer_id, created_at) VALUES (?, ?, ?)'
  ).bind(account.accountId, tag === 'owner' ? 'cus_owner' : 'cus_control', NOW).run();
  await seedSplBinding({ accountId: account.accountId, instanceId, createdAt: NOW, lastSeenAt: NOW });
  const mcpLabel = tag === 'owner' ? 'owneraaa' : 'controla';
  await workerEnv.DB.prepare(
    'INSERT INTO mcp_bridge_hostname_ledger (label, created_at) VALUES (?, ?)'
  ).bind(mcpLabel, NOW).run();
  await workerEnv.DB.prepare(
    `INSERT INTO mcp_bridge_bindings (account_id, instance_id, label, created_at)
     VALUES (?, ?, ?, ?)`
  ).bind(account.accountId, instanceId, mcpLabel, NOW).run();
  await seedSpbBinding({ accountId: account.accountId, instanceId, createdAt: NOW, lastSeenAt: NOW, tokenHash: `${tag}-spb` });
  await upsertSppBinding(workerEnv.DB, {
    accountId: account.accountId, instanceId, tokenHash: `${tag}-spp`, nowMs: NOW,
    consentAckedAt: null, consentDisclosureVersion: null,
  });
  await workerEnv.DB.prepare(
    'INSERT INTO spb_retired_tokens (token_hash, account_id, instance_id, retired_at) VALUES (?, ?, ?, ?)'
  ).bind(`${tag}-retired`, account.accountId, instanceId, NOW).run();
  await workerEnv.DB.prepare(
    `INSERT INTO spb_mint_audit (account_id, instance_id, prefix, scope, ttl, outcome, ts)
     VALUES (?, ?, ?, 'backup', 1, 'minted', ?)`
  ).bind(account.accountId, instanceId, prefixFor(account.accountId, instanceId), 1).run();
  await workerEnv.DB.prepare(
    "INSERT INTO spp_mint_audit (account_id, instance_id, scope, outcome, ts) VALUES (?, ?, 'inference', 'minted', ?)"
  ).bind(account.accountId, instanceId, NOW).run();
  await seedSpbSweepAudit({ accountId: account.accountId, instanceId, ts: NOW });
  await workerEnv.DB.prepare(
    `INSERT INTO spb_mint_reservations (id, account_id, instance_id, scope, reserved_expires_at, state, created_at)
     VALUES (?, ?, ?, 'backup', 1, 'finalized', ?)`
  ).bind(`${tag}-reservation`, account.accountId, instanceId, NOW).run();
  await createDeletionProof(workerEnv.DB, {
    tokenHash: `${tag}-proof`, accountId: account.accountId, sessionIdHash: `${tag}-session`, purpose: 'delete', method: 'otp',
    issuedAt: NOW, expiresAt: NOW + 1, otpCodeHash: `${tag}-otp-proof`,
  });
  const otpHashes = [];
  const rateBucketKeys = [];
  for (const email of emails) {
    const otp = await seedOtp({ email, options: { code: `${tag === 'owner' ? '1' : '2'}23456`, nowMs: NOW } });
    otpHashes.push(otp.emailLowerHash);
    rateBucketKeys.push(await hashKey('signin_email', email, env));
  }
  rateBucketKeys.push(...await Promise.all([
    'passkey_register_account',
    'add_email_per_day',
    'delete_proof_otp_account',
    'delete_proof_passkey_account',
  ].map((scope) => hashKey(scope, account.accountId, env))));
  for (const key of rateBucketKeys) {
    await workerEnv.DB.prepare('INSERT INTO rate_buckets (key, count, window_start) VALUES (?, 1, ?)').bind(key, NOW).run();
  }
  return { otpHashes, rateBucketKeys };
}

async function requestedDeletion(accountId) {
  await workerEnv.DB.prepare(
    `INSERT INTO account_deletions (
       operation_id, account_id, phase, requested_at, cancellation_deadline_at, next_attempt_at, status_token_hash
     ) VALUES ('op', ?, 'requested', ?, ?, ?, 'owner-status')`
  ).bind(accountId, NOW, NOW, NOW).run();
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

function installEmptyS3(env) {
  return installS3FetchMock(env, {
    default: async ({ method, url }) => {
      if (method === 'GET' && url.searchParams.get('list-type') === '2') {
        return xmlResponse('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>');
      }
      if (method === 'GET' && url.searchParams.has('uploads')) {
        return xmlResponse('<ListMultipartUploadsResult><IsTruncated>false</IsTruncated></ListMultipartUploadsResult>');
      }
      throw new Error(`unexpected finalization R2 request: ${method} ${url.href}`);
    },
  });
}

function installFinalizationFetch(env) {
  const s3 = installEmptyS3(env);
  const stripe = installStripeFetchMock({
    'DELETE api.stripe.com/v1/customers/cus_owner': async () => stripeJson({ id: 'cus_owner', deleted: true }),
  });
  vi.stubGlobal('fetch', (input, init) => {
    const href = typeof input === 'string' ? input : input.url;
    return new URL(href).host === 'api.stripe.com'
      ? stripe.fetchMock(input, init)
      : s3.fetchMock(input, init);
  });
}

function contractService(service) {
  return { async fetch(_input, init) {
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
  } };
}

function stripeJson(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function xmlResponse(body) {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/xml' },
  });
}

async function countForAccount(table, accountId) {
  const column = table === 'accounts' ? 'id' : 'account_id';
  return countBy(table, column, accountId);
}

async function countBy(table, column, value) {
  const row = await workerEnv.DB.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`).bind(value).first();
  return row.count;
}
