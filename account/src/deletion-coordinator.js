import { decryptEmail, generateSessionToken, hashKey, hashWithPepper } from './crypto.js';
import { captureDeletionSnapshotForAccount } from './deletion.js';
import { advanceDeletionServiceOperation, remintExpiredDeletionServiceOperation } from './deletion-contract.js';
import { DELETION_SERVICES } from './deletion-services.js';
import { mintScopedCredential } from './r2-credential.js';
import { listMultipartUploads, listObjectsV2 } from './s3.js';
import { prefixFor } from './spb-broker.js';
import { drainMultipartUploads, drainObjects } from './spb-sweep.js';
import { deleteStripeCustomer } from './stripe.js';
import { ownerDeletionPlan, RATE_BUCKET_FAMILIES } from './owner-data-inventory.js';

const LEASE_MS = 5 * 60 * 1000;
const FIFTEEN_MINUTES = 15 * 60 * 1000;
const MAX_BACKOFF = 6 * 60 * 60 * 1000;
const SERVICE_RECONCILIATION_PENDING = 'service_reconciliation_pending';

export async function runAccountDeletionCoordinator(env, nowMs = Date.now()) {
  await env.DB.prepare('DELETE FROM account_deletion_completions WHERE expires_at <= ?').bind(nowMs).run();
  const leaseToken = generateSessionToken();
  const claim = await claimDueDeletion(env.DB, leaseToken, nowMs);
  if (!claim) return { claimed: false };
  if (claim.phase === 'requested') {
    await captureDeletionSnapshotForAccount(env, claim.account_id, claim.operation_id);
    await release(env.DB, claim.operation_id, leaseToken, nowMs);
    return { claimed: true, phase: 'requested' };
  }
  if (claim.phase === 'frozen') {
    if (nowMs < claim.cancellation_deadline_at) {
      await reschedule(env.DB, claim.operation_id, leaseToken, claim.cancellation_deadline_at, nowMs);
      return { claimed: true, phase: 'frozen' };
    }
    await env.DB.prepare(
      "UPDATE account_deletions SET phase = 'purging', next_attempt_at = ? WHERE operation_id = ? AND lease_token = ? AND phase = 'frozen'"
    ).bind(nowMs, claim.operation_id, leaseToken).run();
    return { claimed: true, phase: 'purging' };
  }
  if (claim.phase === 'purging') {
    const deletion = await env.DB.prepare('SELECT * FROM account_deletions WHERE operation_id = ? AND lease_token = ?').bind(claim.operation_id, leaseToken).first();
    if (!deletion) return { claimed: false };
    const serviceOps = await Promise.all(DELETION_SERVICES.map((service) => latestServiceOperation(env.DB, deletion.operation_id, service)));
    const reconciliationService = expiredReconciliationService(serviceOps, nowMs);
    if (reconciliationService) {
      if (!await markServiceReconciliationPending(env.DB, deletion, nowMs)) return { claimed: false };
      await remintExpiredDeletionServiceOperation(env, { deletion, service: reconciliationService, nowMs });
      const backoff = retryBackoff(claim.attempt_count);
      await reschedule(env.DB, claim.operation_id, leaseToken, nowMs + backoff, nowMs, true);
      return { claimed: true, phase: 'purging', reconciliation: SERVICE_RECONCILIATION_PENDING };
    }
    const [states, backup, stripe] = await Promise.all([
      Promise.all(DELETION_SERVICES.map((service) => advanceDeletionServiceOperation(env, { deletion, service, nowMs }))),
      advanceDeletionBackupPurge(env, deletion, nowMs),
      advanceDeletionStripePurge(env, deletion, nowMs),
    ]);
    const servicesConfirmed = states.every((state) => state === 'confirmed');
    if (servicesConfirmed) await clearServiceReconciliationPending(env.DB, deletion);
    if (servicesConfirmed && backup === 'complete' && stripe === 'complete') {
      const completed = await finalizeDeletion(env, deletion, nowMs);
      return completed
        ? { claimed: true, phase: 'complete', states, backup, stripe }
        : { claimed: false };
    }
    const retryable = states.includes('retryable') || backup === 'retryable' || stripe === 'retryable';
    const backoff = retryable ? retryBackoff(claim.attempt_count) : FIFTEEN_MINUTES;
    await reschedule(env.DB, claim.operation_id, leaseToken, nowMs + backoff, nowMs, retryable);
    return { claimed: true, phase: 'purging', states, backup, stripe };
  }
  return { claimed: true, phase: claim.phase };
}

function expiredReconciliationService(operations, nowMs) {
  const expiredConfirmed = operations.filter((operation) => (
    operation
    && operation.state === 'confirmed'
    && operation.envelope_expires_at != null
    && operation.envelope_expires_at <= nowMs
  ));
  return expiredConfirmed.length > 0 ? expiredConfirmed[0].service : null;
}

function retryBackoff(attemptCount) {
  return Math.min(MAX_BACKOFF, FIFTEEN_MINUTES * (2 ** Math.min(Number(attemptCount || 0), 4)));
}

async function claimDueDeletion(db, leaseToken, nowMs) {
  const candidate = await db.prepare(
    `SELECT operation_id FROM account_deletions
     WHERE phase IN ('requested', 'frozen', 'purging') AND next_attempt_at <= ?
       AND (lease_token IS NULL OR lease_expires_at <= ?)
     ORDER BY next_attempt_at ASC LIMIT 1`
  ).bind(nowMs, nowMs).first();
  if (!candidate) return null;
  const results = await db.batch([
    db.prepare(
      `UPDATE account_deletions SET lease_token = ?, lease_expires_at = ?
       WHERE operation_id = ? AND next_attempt_at <= ?
         AND (lease_token IS NULL OR lease_expires_at <= ?)`
    ).bind(leaseToken, nowMs + LEASE_MS, candidate.operation_id, nowMs, nowMs),
    db.prepare('SELECT * FROM account_deletions WHERE operation_id = ? AND lease_token = ?').bind(candidate.operation_id, leaseToken),
  ]);
  return results[0]?.meta?.changes === 1 ? results[1]?.results?.[0] || null : null;
}

async function release(db, operationId, leaseToken, nowMs) {
  await db.prepare('UPDATE account_deletions SET lease_token = NULL, lease_expires_at = NULL, next_attempt_at = ? WHERE operation_id = ? AND lease_token = ?')
    .bind(nowMs, operationId, leaseToken).run();
}

async function reschedule(db, operationId, leaseToken, nextAttemptAt, nowMs, increment = false) {
  await db.prepare(
    `UPDATE account_deletions
     SET lease_token = NULL, lease_expires_at = NULL, next_attempt_at = ?,
         attempt_count = attempt_count + ?
     WHERE operation_id = ? AND lease_token = ?`
  ).bind(nextAttemptAt, increment ? 1 : 0, operationId, leaseToken).run();
}

async function latestServiceOperation(db, operationId, service) {
  return db.prepare(
    `SELECT * FROM account_deletion_service_ops WHERE operation_id = ? AND service = ? ORDER BY rowid DESC LIMIT 1`
  ).bind(operationId, service).first();
}

async function markServiceReconciliationPending(db, deletion, nowMs) {
  // last_error_* is repurposed as a deletion state marker, not a literal error.
  const result = await db.prepare(
    `UPDATE account_deletions
     SET last_error_code = ?, last_error_at = ?
     WHERE operation_id = ? AND lease_token = ? AND phase = 'purging'`
  ).bind(SERVICE_RECONCILIATION_PENDING, nowMs, deletion.operation_id, deletion.lease_token).run();
  return result.meta?.changes === 1;
}

async function clearServiceReconciliationPending(db, deletion) {
  await db.prepare(
    `UPDATE account_deletions
     SET last_error_code = NULL, last_error_at = NULL
     WHERE operation_id = ? AND lease_token = ? AND phase = 'purging'
       AND last_error_code = ?`
  ).bind(deletion.operation_id, deletion.lease_token, SERVICE_RECONCILIATION_PENDING).run();
}

async function advanceDeletionBackupPurge(env, deletion, nowMs) {
  if (deletion.backup_empty_verified_at != null) return 'complete';
  const safeAfter = await ensureBackupSafeAfter(env.DB, deletion);
  if (safeAfter == null) return 'retryable';
  if (nowMs <= safeAfter) return 'waiting';

  let instanceIds;
  try {
    const snapshot = deletion.snapshot_encrypted
      ? JSON.parse(await decryptEmail(deletion.snapshot_encrypted, env))
      : null;
    if (!snapshot) return 'retryable';
    instanceIds = [...new Set(Array.isArray(snapshot.backup?.spb_instance_ids)
      ? snapshot.backup.spb_instance_ids.filter((id) => typeof id === 'string')
      : [])];
  } catch {
    return 'retryable';
  }

  try {
    for (const instanceId of instanceIds) {
      const prefix = prefixFor(deletion.account_id, instanceId);
      const credential = await mintScopedCredential(env, {
        prefix,
        scope: 'maintenance',
        nowSeconds: Math.floor(nowMs / 1000),
      });
      if (!credential) return 'retryable';
      await drainObjects(env, credential, prefix, nowMs);
      await drainMultipartUploads(env, credential, prefix, nowMs);
      const [objects, uploads] = await Promise.all([
        listObjectsV2(env, credential, { prefix, nowMs }),
        listMultipartUploads(env, credential, { prefix, nowMs }),
      ]);
      if (objects.keys.length !== 0 || objects.isTruncated || uploads.uploads.length !== 0 || uploads.isTruncated) {
        return 'retryable';
      }
    }
  } catch {
    return 'retryable';
  }

  const result = await env.DB.prepare(
    `UPDATE account_deletions
     SET backup_empty_verified_at = ?
     WHERE operation_id = ? AND lease_token = ? AND backup_empty_verified_at IS NULL`
  ).bind(nowMs, deletion.operation_id, deletion.lease_token).run();
  return result.meta?.changes === 1 ? 'complete' : 'retryable';
}

async function ensureBackupSafeAfter(db, deletion) {
  if (deletion.backup_safe_after != null) return Number(deletion.backup_safe_after);
  const freezeAt = Number(deletion.frozen_at ?? deletion.requested_at);
  const [audit, reservation] = await Promise.all([
    db.prepare(
      `SELECT MAX(ts + ttl * 1000) AS safe_after
       FROM spb_mint_audit
       WHERE account_id = ? AND outcome = 'minted' AND ttl IS NOT NULL AND ts <= ?`
    ).bind(deletion.account_id, freezeAt).first(),
    db.prepare(
      'SELECT MAX(reserved_expires_at) AS safe_after FROM spb_mint_reservations WHERE account_id = ?'
    ).bind(deletion.account_id).first(),
  ]);
  const safeAfter = Math.max(
    freezeAt,
    Number(audit?.safe_after || 0),
    Number(reservation?.safe_after || 0)
  );
  const result = await db.prepare(
    `UPDATE account_deletions
     SET backup_safe_after = ?
     WHERE operation_id = ? AND lease_token = ? AND backup_safe_after IS NULL`
  ).bind(safeAfter, deletion.operation_id, deletion.lease_token).run();
  return result.meta?.changes === 1 ? safeAfter : null;
}

async function advanceDeletionStripePurge(env, deletion, nowMs) {
  if (deletion.stripe_purge_state === 'deleted' || deletion.stripe_purge_state === 'absent') return 'complete';
  let stripeCustomerId;
  try {
    const snapshot = deletion.snapshot_encrypted
      ? JSON.parse(await decryptEmail(deletion.snapshot_encrypted, env))
      : null;
    if (!snapshot) return 'retryable';
    stripeCustomerId = typeof snapshot.stripe_customer_id === 'string' ? snapshot.stripe_customer_id : '';
  } catch {
    return 'retryable';
  }
  if (!stripeCustomerId) return 'complete';

  const disposition = await deleteStripeCustomer(env, stripeCustomerId);
  const result = await env.DB.prepare(
    `UPDATE account_deletions
     SET stripe_purge_state = ?, stripe_purge_attempted_at = ?
     WHERE operation_id = ? AND lease_token = ?`
  ).bind(disposition.state, nowMs, deletion.operation_id, deletion.lease_token).run();
  if (result.meta?.changes !== 1) return 'retryable';
  return disposition.state === 'deleted' || disposition.state === 'absent' ? 'complete' : 'retryable';
}

async function finalizeDeletion(env, deletion, nowMs) {
  const current = await env.DB.prepare(
    `SELECT account_id, status_token_hash
     FROM account_deletions
     WHERE operation_id = ? AND lease_token = ? AND phase = 'purging'`
  ).bind(deletion.operation_id, deletion.lease_token).first();
  if (!current?.account_id || !current.status_token_hash) return false;
  const [relayOp, supportOp] = await Promise.all(
    DELETION_SERVICES.map((service) => latestServiceOperation(env.DB, deletion.operation_id, service))
  );
  if (
    relayOp?.state !== 'confirmed'
    || supportOp?.state !== 'confirmed'
    || !Number.isFinite(Number(relayOp.envelope_expires_at))
    || !Number.isFinite(Number(supportOp.envelope_expires_at))
    || Number(relayOp.envelope_expires_at) <= nowMs
    || Number(supportOp.envelope_expires_at) <= nowMs
  ) return false;
  const completionExpiresAt = Math.min(Number(relayOp.envelope_expires_at), Number(supportOp.envelope_expires_at));

  let emailHashes;
  let rateBucketKeys;
  try {
    const { results } = await env.DB.prepare(
      'SELECT address_encrypted FROM account_emails WHERE account_id = ?'
    ).bind(current.account_id).all();
    const emails = await Promise.all((results || []).map(async ({ address_encrypted: encrypted }) => (
      (await decryptEmail(encrypted, env)).trim().toLowerCase()
    )));
    emailHashes = await Promise.all(emails.map((email) => hashWithPepper(email, env)));
    const emailFamilies = RATE_BUCKET_FAMILIES.filter((family) => family.association === 'verified_email_derived');
    const accountFamilies = RATE_BUCKET_FAMILIES.filter((family) => family.association === 'account_id');
    rateBucketKeys = await Promise.all([
      ...emails.flatMap((email) => emailFamilies.map(({ scope }) => hashKey(scope, email, env))),
      ...accountFamilies.map(({ scope }) => hashKey(scope, current.account_id, env)),
    ]);
  } catch {
    return false;
  }

  const operationId = deletion.operation_id;
  const leaseToken = deletion.lease_token;
  const accountId = current.account_id;
  const leaseGuard = "EXISTS (SELECT 1 FROM account_deletions WHERE operation_id = ? AND lease_token = ? AND phase = 'purging')";
  const deleteForAccount = (table) => env.DB.prepare(
    `DELETE FROM ${table} WHERE account_id = ? AND ${leaseGuard}`
  ).bind(accountId, operationId, leaseToken);
  const deleteForAccountId = (table) => env.DB.prepare(
    `DELETE FROM ${table} WHERE id = ? AND ${leaseGuard}`
  ).bind(accountId, operationId, leaseToken);
  const deleteForKey = (table, column, value) => env.DB.prepare(
    `DELETE FROM ${table} WHERE ${column} = ? AND ${leaseGuard}`
  ).bind(value, operationId, leaseToken);
  const statements = ownerDeletionPlan().flatMap(({ kind, table }) => {
    if (kind === 'operation_id') {
      return env.DB.prepare(`DELETE FROM ${table} WHERE operation_id = ? AND ${leaseGuard}`)
        .bind(operationId, operationId, leaseToken);
    }
    if (kind === 'account_id') return deleteForAccount(table);
    if (kind === 'account_primary_key') return deleteForAccountId(table);
    if (kind === 'verified_email_derived') {
      return emailHashes.map((hash) => deleteForKey(table, 'email_lower_hash', hash));
    }
    if (kind === 'derived_rate_key') {
      return rateBucketKeys.map((key) => deleteForKey(table, 'key', key));
    }
    if (kind === 'cancelled_deletions') {
      return env.DB.prepare(
        `DELETE FROM ${table} WHERE account_id = ? AND phase = 'cancelled' AND ${leaseGuard}`
      ).bind(accountId, operationId, leaseToken);
    }
    if (kind === 'completion_insert') {
      return env.DB.prepare(
        `INSERT INTO ${table} (token_hash, state, completed_at, expires_at)
         SELECT status_token_hash, 'complete', ?, ?
         FROM account_deletions
         WHERE operation_id = ? AND lease_token = ? AND phase = 'purging' AND status_token_hash IS NOT NULL`
      ).bind(nowMs, completionExpiresAt, operationId, leaseToken);
    }
    if (kind === 'deletion_sanitize') {
      return env.DB.prepare(
        `UPDATE ${table}
         SET account_id = NULL,
             snapshot_encrypted = NULL,
             snapshot_digest = NULL,
             status_token_hash = NULL,
             phase = 'complete',
             completed_at = ?,
             lease_token = NULL,
             lease_expires_at = NULL
         WHERE operation_id = ? AND lease_token = ? AND phase = 'purging'`
      ).bind(nowMs, operationId, leaseToken);
    }
    throw new Error(`unsupported owner deletion plan kind: ${kind}`);
  });
  const results = await env.DB.batch(statements);
  return results.at(-1)?.meta?.changes === 1;
}
