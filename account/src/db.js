import { hashWithPepper } from './crypto.js';

const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export async function findEmailByHash(db, addressLowerHash) {
  return db
    .prepare('SELECT id, account_id FROM account_emails WHERE address_lower_hash = ?')
    .bind(addressLowerHash)
    .first();
}

export async function findEmailEligibilityByHash(db, addressLowerHash) {
  return db
    .prepare('SELECT id, account_id, verified_at FROM account_emails WHERE address_lower_hash = ?')
    .bind(addressLowerHash)
    .first();
}

export async function insertAccountEmailVerification(db, {
  id,
  accountId,
  addressEncrypted,
  addressLowerHash,
  codeHash,
  expiresAt,
  nowMs,
}) {
  await db
    .prepare(
      `INSERT INTO account_emails (
         id, account_id, address_encrypted, address_lower_hash, is_primary,
         verified_at, created_at, verification_code_hash, verification_expires_at,
         verification_attempts
       ) VALUES (?, ?, ?, ?, 0, NULL, ?, ?, ?, 0)`
    )
    .bind(id, accountId, addressEncrypted, addressLowerHash, nowMs, codeHash, expiresAt)
    .run();
}

export async function resetAccountEmailVerification(db, { id, accountId, codeHash, expiresAt }) {
  await db
    .prepare(
      `UPDATE account_emails
       SET verification_code_hash = ?,
           verification_expires_at = ?,
           verification_attempts = 0
       WHERE id = ? AND account_id = ?`
    )
    .bind(codeHash, expiresAt, id, accountId)
    .run();
}

export async function matchAndVerifyAccountEmail(db, {
  accountId,
  addressLowerHash,
  codeHash,
  nowMs,
}) {
  const row = await db
    .prepare(
      `UPDATE account_emails
       SET verified_at = ?,
           verification_code_hash = NULL,
           verification_expires_at = NULL
       WHERE account_id = ?
         AND address_lower_hash = ?
         AND verification_code_hash = ?
         AND verified_at IS NULL
         AND verification_expires_at > ?
       RETURNING id`
    )
    .bind(nowMs, accountId, addressLowerHash, codeHash, nowMs)
    .first();
  return row || null;
}

export async function bumpAccountEmailVerificationAttempts(db, {
  accountId,
  addressLowerHash,
  nowMs,
  maxAttempts,
}) {
  await db
    .prepare(
      `UPDATE account_emails
       SET verification_attempts = verification_attempts + 1,
           verification_code_hash = CASE
             WHEN verification_attempts + 1 >= ? THEN NULL
             ELSE verification_code_hash
           END,
           verification_expires_at = CASE
             WHEN verification_attempts + 1 >= ? THEN NULL
             ELSE verification_expires_at
           END
       WHERE account_id = ?
         AND address_lower_hash = ?
         AND verified_at IS NULL
         AND verification_expires_at > ?
         AND verification_code_hash IS NOT NULL`
    )
    .bind(maxAttempts, maxAttempts, accountId, addressLowerHash, nowMs)
    .run();
}

export async function findAccountEmailByAddressHash(db, { accountId, addressLowerHash }) {
  return db
    .prepare('SELECT id, verified_at FROM account_emails WHERE account_id = ? AND address_lower_hash = ?')
    .bind(accountId, addressLowerHash)
    .first();
}

export async function listAccountEmails(db, accountId) {
  const { results } = await db
    .prepare(
      `SELECT id, address_encrypted, is_primary, verified_at, created_at,
              verification_expires_at
       FROM account_emails
       WHERE account_id = ?
       ORDER BY is_primary DESC, created_at DESC`
    )
    .bind(accountId)
    .all();
  return results || [];
}

export async function countAccountEmails(db, accountId) {
  const row = await db
    .prepare('SELECT COUNT(*) AS count FROM account_emails WHERE account_id = ?')
    .bind(accountId)
    .first();
  return row?.count || 0;
}

export async function findVerifiedAccountEmailById(db, { id, accountId }) {
  return db
    .prepare('SELECT id FROM account_emails WHERE id = ? AND account_id = ? AND verified_at IS NOT NULL')
    .bind(id, accountId)
    .first();
}

export async function makeAccountEmailPrimary(db, { id, accountId }) {
  await db.batch([
    db
      .prepare(
        `UPDATE account_emails
         SET is_primary = CASE WHEN id = ? THEN 1 ELSE 0 END
         WHERE account_id = ?`
      )
      .bind(id, accountId),
    db
      .prepare('UPDATE accounts SET primary_email_id = ? WHERE id = ?')
      .bind(id, accountId),
  ]);
}

export async function removeAccountEmail(db, { id, accountId }) {
  const result = await db
    .prepare(
      `DELETE FROM account_emails
       WHERE id = ?
         AND account_id = ?
         AND is_primary = 0
         AND (
           verified_at IS NULL
           OR (SELECT COUNT(*) FROM account_emails
                 WHERE account_id = ? AND verified_at IS NOT NULL) >= 2
         )`
    )
    .bind(id, accountId, accountId)
    .run();
  return result?.meta?.changes || 0;
}

export async function findAccountEmailById(db, { id, accountId }) {
  return db
    .prepare('SELECT id FROM account_emails WHERE id = ? AND account_id = ?')
    .bind(id, accountId)
    .first();
}

export async function createAccountWithEmail(db, { addressEncrypted, addressLowerHash, nowMs }) {
  const accountId = crypto.randomUUID();
  const accountEmailId = crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO accounts (id, primary_email_id, passkey_user_handle, created_at, last_signin_at) VALUES (?, NULL, NULL, ?, ?)'
    )
    .bind(accountId, nowMs, nowMs)
    .run();

  try {
    await db
      .prepare(
        'INSERT INTO account_emails (id, account_id, address_encrypted, address_lower_hash, is_primary, verified_at, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
      )
      .bind(accountEmailId, accountId, addressEncrypted, addressLowerHash, nowMs, nowMs)
      .run();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await findEmailByHash(db, addressLowerHash);
    await db.prepare('DELETE FROM accounts WHERE id = ?').bind(accountId).run();
    if (!existing) throw error;
    return { accountId: existing.account_id, accountEmailId: existing.id };
  }

  await db
    .prepare('UPDATE accounts SET primary_email_id = ? WHERE id = ?')
    .bind(accountEmailId, accountId)
    .run();
  return { accountId, accountEmailId };
}

export async function updateAccountLastSignin(db, accountId, nowMs) {
  await db
    .prepare('UPDATE accounts SET last_signin_at = ? WHERE id = ?')
    .bind(nowMs, accountId)
    .run();
}

export async function createSession(db, { idHash, accountId, nowMs, ttlMs = SESSION_TTL_MS, lastUserAgent = null }) {
  await db
    .prepare('INSERT INTO sessions (id_hash, account_id, created_at, expires_at, last_active_at, last_user_agent) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(idHash, accountId, nowMs, nowMs + ttlMs, nowMs, lastUserAgent)
    .run();
}

export async function getSessionAccount(db, idHash) {
  return db
    .prepare('SELECT account_id, expires_at FROM sessions WHERE id_hash = ? AND revoked_at IS NULL')
    .bind(idHash)
    .first();
}

export async function bumpSessionActivity(db, { idHash, accountId, nowMs, ipEncrypted, userAgent }) {
  await db
    .prepare(
      `UPDATE sessions
       SET last_active_at = ?, last_ip_encrypted = ?, last_user_agent = ?
       WHERE id_hash = ? AND account_id = ? AND revoked_at IS NULL`
    )
    .bind(nowMs, ipEncrypted, userAgent, idHash, accountId)
    .run();
}

export async function listSessionsForAccount(db, accountId) {
  const { results } = await db
    .prepare(
      `SELECT id_hash, created_at, last_active_at, last_ip_encrypted, last_user_agent
       FROM sessions
       WHERE account_id = ? AND revoked_at IS NULL
       ORDER BY last_active_at DESC, id_hash DESC`
    )
    .bind(accountId)
    .all();
  return results || [];
}

export async function revokeSession(db, { idHash, accountId, nowMs }) {
  await db
    .prepare('UPDATE sessions SET revoked_at = ? WHERE id_hash = ? AND account_id = ? AND revoked_at IS NULL')
    .bind(nowMs, idHash, accountId)
    .run();
}

export async function revokeOtherSessions(db, { accountId, currentIdHash, nowMs }) {
  await db
    .prepare('UPDATE sessions SET revoked_at = ? WHERE account_id = ? AND id_hash != ? AND revoked_at IS NULL')
    .bind(nowMs, accountId, currentIdHash)
    .run();
}

export async function countActiveSessions(db, accountId) {
  const row = await db
    .prepare('SELECT COUNT(*) AS count FROM sessions WHERE account_id = ? AND revoked_at IS NULL')
    .bind(accountId)
    .first();
  return row?.count || 0;
}

export async function insertDevice(db, {
  deviceId,
  accountId,
  platform,
  pushToken,
  pushTokenEnv,
  bundleId,
  deviceLabel,
  appVersion,
  nowMs,
}) {
  await db
    .prepare(
      `INSERT INTO account_devices (
         device_id, account_id, platform, push_token, push_token_env, bundle_id,
         device_label, app_version, registered_at, last_seen_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      deviceId,
      accountId,
      platform,
      pushToken,
      pushTokenEnv,
      bundleId,
      deviceLabel,
      appVersion,
      nowMs,
      nowMs
    )
    .run();
}

export async function findDeviceByPushKey(db, { pushToken, bundleId, pushTokenEnv }) {
  const row = await db
    .prepare(
      `SELECT device_id, account_id, platform, push_token_env, bundle_id,
              device_label, app_version, registered_at, last_seen_at, revoked_at
       FROM account_devices
       WHERE push_token = ? AND bundle_id = ? AND push_token_env = ? AND revoked_at IS NULL`
    )
    .bind(pushToken, bundleId, pushTokenEnv)
    .first();
  return row || null;
}

export async function bumpDeviceLastSeen(db, { deviceId, nowMs }) {
  await db
    .prepare('UPDATE account_devices SET last_seen_at = ? WHERE device_id = ?')
    .bind(nowMs, deviceId)
    .run();
}

export async function revokeDevicePriorAndInsertNew(db, { priorDeviceId, newDevice, nowMs }) {
  return db.batch([
    db
      .prepare('UPDATE account_devices SET revoked_at = ? WHERE device_id = ? AND revoked_at IS NULL')
      .bind(nowMs, priorDeviceId),
    db
      .prepare(
        `INSERT INTO account_devices (
           device_id, account_id, platform, push_token, push_token_env, bundle_id,
           device_label, app_version, registered_at, last_seen_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        newDevice.deviceId,
        newDevice.accountId,
        newDevice.platform,
        newDevice.pushToken,
        newDevice.pushTokenEnv,
        newDevice.bundleId,
        newDevice.deviceLabel,
        newDevice.appVersion,
        newDevice.nowMs,
        newDevice.nowMs
      ),
  ]);
}

export async function revokeDevice(db, { deviceId, accountId, nowMs }) {
  const result = await db
    .prepare(
      'UPDATE account_devices SET revoked_at = ? WHERE device_id = ? AND account_id = ? AND revoked_at IS NULL'
    )
    .bind(nowMs, deviceId, accountId)
    .run();
  return result?.meta || {};
}

export async function revokeDeviceById(db, { deviceId, nowMs }) {
  await db
    .prepare('UPDATE account_devices SET revoked_at = ? WHERE device_id = ? AND revoked_at IS NULL')
    .bind(nowMs, deviceId)
    .run();
}

export async function revokeAllDevicesForAccount(db, { accountId, nowMs }) {
  await db
    .prepare('UPDATE account_devices SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL')
    .bind(nowMs, accountId)
    .run();
}

export async function listDevicesForAccount(db, accountId) {
  const { results } = await db
    .prepare(
      `SELECT device_id, platform, push_token_env, bundle_id, device_label,
              app_version, registered_at, last_seen_at
       FROM account_devices
       WHERE account_id = ? AND revoked_at IS NULL
       ORDER BY last_seen_at DESC`
    )
    .bind(accountId)
    .all();
  return results || [];
}

export async function listDispatchableDevicesForAccount(db, accountId) {
  const { results } = await db
    .prepare(
      `SELECT device_id, push_token, push_token_env
       FROM account_devices
       WHERE account_id = ? AND revoked_at IS NULL
       ORDER BY last_seen_at DESC`
    )
    .bind(accountId)
    .all();
  return results || [];
}

export async function countActiveDevices(db, accountId) {
  const row = await db
    .prepare('SELECT COUNT(*) AS c FROM account_devices WHERE account_id = ? AND revoked_at IS NULL')
    .bind(accountId)
    .first();
  return Number(row?.c || 0);
}

export async function getRelayDeviceSignal(db, accountId) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count, MAX(last_seen_at) AS lastSeenAt
       FROM account_devices
       WHERE account_id = ? AND revoked_at IS NULL`
    )
    .bind(accountId)
    .first();
  return { count: Number(row?.count || 0), lastSeenAt: row?.lastSeenAt ?? null };
}

export async function getDeviceById(db, deviceId) {
  const row = await db
    .prepare('SELECT device_id, account_id, revoked_at FROM account_devices WHERE device_id = ?')
    .bind(deviceId)
    .first();
  return row || null;
}

export async function insertDispatchToken(db, { tokenHash, accountId, nowMs }) {
  await db
    .prepare('INSERT INTO account_dispatch_tokens (token_hash, account_id, created_at) VALUES (?, ?, ?)')
    .bind(tokenHash, accountId, nowMs)
    .run();
}

export async function findActiveDispatchToken(db, tokenHash) {
  const row = await db
    .prepare('SELECT account_id FROM account_dispatch_tokens WHERE token_hash = ? AND revoked_at IS NULL')
    .bind(tokenHash)
    .first();
  return row || null;
}

export async function deleteSession(db, idHash) {
  await db.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(idHash).run();
}

export async function hasAnyActivePasskey(db, accountId) {
  const row = await db
    .prepare(
      'SELECT 1 FROM passkey_credentials WHERE account_id = ? AND revoked_at IS NULL LIMIT 1'
    )
    .bind(accountId)
    .first();
  return row != null;
}

export async function countActivePasskeys(db, accountId) {
  const row = await db
    .prepare('SELECT COUNT(*) AS count FROM passkey_credentials WHERE account_id = ? AND revoked_at IS NULL')
    .bind(accountId)
    .first();
  return row?.count || 0;
}

export async function getAccountTransparencyRow(db, accountId) {
  const row = await db
    .prepare('SELECT id, created_at, last_signin_at FROM accounts WHERE id = ?')
    .bind(accountId)
    .first();
  return row || null;
}

export async function upsertOtp(db, { emailLowerHash, emailLower, codeHash, nowMs, ttlMs }) {
  await db
    .prepare(
      `INSERT INTO otp_tokens (email_lower_hash, email_lower, code_hash, expires_at, attempts, consumed, started_at)
       VALUES (?, ?, ?, ?, 0, 0, ?)
       ON CONFLICT(email_lower_hash) DO UPDATE SET
         email_lower = excluded.email_lower,
         code_hash = excluded.code_hash,
         expires_at = excluded.expires_at,
         attempts = 0,
         consumed = 0,
         started_at = excluded.started_at`
    )
    .bind(emailLowerHash, emailLower, codeHash, nowMs + ttlMs, nowMs)
    .run();
}

export async function matchOtp(db, { emailLowerHash, codeHash, nowMs }) {
  const row = await db
    .prepare(
      `UPDATE otp_tokens
       SET consumed = 1
       WHERE email_lower_hash = ?
         AND code_hash = ?
         AND consumed = 0
         AND expires_at > ?
       RETURNING email_lower`
    )
    .bind(emailLowerHash, codeHash, nowMs)
    .first();
  return row ? { emailLower: row.email_lower } : null;
}

export async function bumpOtpAttempts(db, { emailLowerHash, nowMs, maxAttempts }) {
  await db
    .prepare(
      `UPDATE otp_tokens
       SET
         attempts = attempts + 1,
         consumed = CASE WHEN attempts + 1 >= ? THEN 1 ELSE consumed END
       WHERE email_lower_hash = ?
         AND consumed = 0
         AND expires_at > ?`
    )
    .bind(maxAttempts, emailLowerHash, nowMs)
    .run();
}

export async function deleteOtp(db, { emailLowerHash, codeHash }) {
  await db
    .prepare('DELETE FROM otp_tokens WHERE email_lower_hash = ? AND code_hash = ?')
    .bind(emailLowerHash, codeHash)
    .run();
}

export async function bumpRateBucket(db, key, windowMs, nowMs) {
  await db
    .prepare(
      `INSERT INTO rate_buckets (key, count, window_start) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE
           WHEN rate_buckets.window_start + ? > ? THEN rate_buckets.count + 1
           ELSE 1
         END,
         window_start = CASE
           WHEN rate_buckets.window_start + ? > ? THEN rate_buckets.window_start
           ELSE ?
         END`
    )
    .bind(key, nowMs, windowMs, nowMs, windowMs, nowMs, nowMs)
    .run();
  const row = await db.prepare('SELECT count FROM rate_buckets WHERE key = ?').bind(key).first();
  return row?.count || 0;
}

export async function getRateBucketCount(db, key, windowMs, nowMs) {
  const row = await db
    .prepare('SELECT count, window_start FROM rate_buckets WHERE key = ?')
    .bind(key)
    .first();
  if (!row || row.window_start + windowMs <= nowMs) return 0;
  return row.count;
}

// --- Account deletion ---

export async function captureDeletionSnapshot(db, {
  operationId,
  snapshotEncrypted,
  snapshotDigest,
  frozenAt,
}) {
  const result = await db
    .prepare(
      `UPDATE account_deletions
       SET phase = 'frozen', frozen_at = ?, snapshot_encrypted = ?, snapshot_digest = ?
       WHERE operation_id = ? AND phase = 'requested'`
    )
    .bind(frozenAt, snapshotEncrypted, snapshotDigest, operationId)
    .run();
  return result?.meta?.changes === 1;
}

export async function getActiveDeletionForAccount(db, accountId) {
  const row = await db
    .prepare(
      `SELECT * FROM account_deletions
       WHERE account_id = ? AND phase IN ('requested', 'frozen', 'purging')
       LIMIT 1`
    )
    .bind(accountId)
    .first();
  return row || null;
}

export async function createDeletionProof(db, {
  tokenHash,
  accountId,
  sessionIdHash,
  purpose,
  method,
  issuedAt,
  expiresAt,
  otpCodeHash = null,
  passkeyChallenge = null,
}) {
  await db
    .prepare(
      `INSERT INTO account_deletion_proofs (
         token_hash, account_id, session_id_hash, purpose, method, issued_at, expires_at,
         verified, consumed, attempt_count, otp_code_hash, passkey_challenge
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`
    )
    .bind(
      tokenHash,
      accountId,
      sessionIdHash,
      purpose,
      method,
      issuedAt,
      expiresAt,
      otpCodeHash,
      passkeyChallenge
    )
    .run();
}

export async function getLatestDeletionProof(db, {
  accountId,
  sessionIdHash,
  purpose,
  method,
  nowMs,
  verified,
}) {
  const clauses = [
    'account_id = ?',
    'session_id_hash = ?',
    'purpose = ?',
    'method = ?',
    'consumed = 0',
    'expires_at > ?',
  ];
  const values = [accountId, sessionIdHash, purpose, method, nowMs];
  if (verified !== undefined) {
    clauses.push('verified = ?');
    values.push(verified ? 1 : 0);
  }
  const row = await db
    .prepare(
      `SELECT * FROM account_deletion_proofs
       WHERE ${clauses.join(' AND ')}
       ORDER BY issued_at DESC
       LIMIT 1`
    )
    .bind(...values)
    .first();
  return row || null;
}

export async function markDeletionProofVerified(db, { tokenHash, nowMs }) {
  const result = await db
    .prepare(
      `UPDATE account_deletion_proofs
       SET verified = 1
       WHERE token_hash = ? AND consumed = 0 AND expires_at > ?`
    )
    .bind(tokenHash, nowMs)
    .run();
  return result?.meta?.changes === 1;
}

export async function bumpDeletionProofAttempts(db, { tokenHash, nowMs, maxAttempts }) {
  await db
    .prepare(
      `UPDATE account_deletion_proofs
       SET attempt_count = attempt_count + 1,
           consumed = CASE WHEN attempt_count + 1 >= ? THEN 1 ELSE consumed END
       WHERE token_hash = ? AND consumed = 0 AND expires_at > ?`
    )
    .bind(maxAttempts, tokenHash, nowMs)
    .run();
}

export async function getDeletionByStatusTokenHash(db, statusTokenHash) {
  const row = await db
    .prepare(
      `SELECT operation_id, phase, lease_token, next_attempt_at,
              backup_empty_verified_at, stripe_purge_state
       FROM account_deletions
       WHERE status_token_hash = ?
       LIMIT 1`
    )
    .bind(statusTokenHash)
    .first();
  return row || null;
}

export async function getCompletionVerifier(db, tokenHash) {
  const row = await db
    .prepare('SELECT token_hash, state, completed_at, expires_at FROM account_deletion_completions WHERE token_hash = ?')
    .bind(tokenHash)
    .first();
  return row || null;
}

export async function consumeProofsAndCreateDeletionRequest(db, {
  proofTokenHashes,
  accountId,
  sessionIdHash,
  operationId,
  statusTokenHash,
  requestedAt,
  cancellationDeadlineAt,
}) {
  const proofGuard = liveDeletionProofGuard(proofTokenHashes, {
    accountId,
    sessionIdHash,
    purpose: 'delete',
    nowMs: requestedAt,
  });
  const mutation = db
    .prepare(
      `INSERT INTO account_deletions (
         operation_id, account_id, phase, requested_at, cancellation_deadline_at,
         next_attempt_at, attempt_count, status_token_hash
       )
       SELECT ?, ?, 'requested', ?, ?, ?, 0, ?
       WHERE ${proofGuard.sql}`
    )
    .bind(
      operationId,
      accountId,
      requestedAt,
      cancellationDeadlineAt,
      requestedAt,
      statusTokenHash,
      ...proofGuard.bindings,
    );
  const proofStatements = proofTokenHashes.map((tokenHash) => db
    .prepare(
      `UPDATE account_deletion_proofs
       SET consumed = 1
       WHERE token_hash = ? AND account_id = ? AND session_id_hash = ?
         AND purpose = 'delete' AND verified = 1 AND consumed = 0 AND expires_at > ?
         AND EXISTS (
           SELECT 1 FROM account_deletions
           WHERE operation_id = ? AND account_id = ? AND phase = 'requested' AND status_token_hash = ?
         )`
    )
    .bind(tokenHash, accountId, sessionIdHash, requestedAt, operationId, accountId, statusTokenHash));
  const results = await db.batch([mutation, ...proofStatements]);
  const created = results[0]?.meta?.changes === 1;
  const proofChanges = created && results.slice(1).every((result) => result?.meta?.changes === 1);
  return { proofChanges, created };
}

export async function consumeProofsAndCancelDeletionRequest(db, {
  proofTokenHashes,
  accountId,
  sessionIdHash,
  operationId,
  cancelledAt,
  nowMs,
}) {
  const proofGuard = liveDeletionProofGuard(proofTokenHashes, {
    accountId,
    sessionIdHash,
    purpose: 'cancel',
    nowMs,
  });
  const mutation = db
    .prepare(
      `UPDATE account_deletions
       SET phase = 'cancelled', cancelled_at = ?, lease_token = NULL, lease_expires_at = NULL
       WHERE operation_id = ? AND account_id = ?
         AND phase IN ('requested', 'frozen')
         AND lease_token IS NULL
         AND cancellation_deadline_at > ?
         AND ${proofGuard.sql}`
    )
    .bind(cancelledAt, operationId, accountId, nowMs, ...proofGuard.bindings);
  const proofStatements = proofTokenHashes.map((tokenHash) => db
    .prepare(
      `UPDATE account_deletion_proofs
       SET consumed = 1
       WHERE token_hash = ? AND account_id = ? AND session_id_hash = ?
         AND purpose = 'cancel' AND verified = 1 AND consumed = 0 AND expires_at > ?
         AND EXISTS (
           SELECT 1 FROM account_deletions
           WHERE operation_id = ? AND account_id = ?
             AND phase = 'cancelled' AND cancelled_at = ?
         )`
    )
    .bind(tokenHash, accountId, sessionIdHash, nowMs, operationId, accountId, cancelledAt));
  const results = await db.batch([mutation, ...proofStatements]);
  const cancelled = results[0]?.meta?.changes === 1;
  return {
    proofChanges: cancelled && results.slice(1).every((result) => result?.meta?.changes === 1),
    cancelled,
  };
}

function liveDeletionProofGuard(proofTokenHashes, { accountId, sessionIdHash, purpose, nowMs }) {
  if (proofTokenHashes.length === 0) return { sql: '0', bindings: [] };
  const sql = proofTokenHashes.map(() => `EXISTS (
    SELECT 1 FROM account_deletion_proofs
    WHERE token_hash = ? AND account_id = ? AND session_id_hash = ?
      AND purpose = '${purpose}' AND verified = 1 AND consumed = 0 AND expires_at > ?
  )`).join(' AND ');
  const bindings = proofTokenHashes.flatMap((tokenHash) => [tokenHash, accountId, sessionIdHash, nowMs]);
  return { sql, bindings };
}

// --- Service handoffs ---

export async function insertServiceHandoff(db, {
  handoffHash,
  accountId,
  service,
  payloadEncrypted,
  createdAt,
  expiresAt,
}) {
  try {
    await db
      .prepare(
        `INSERT INTO service_handoffs (
           handoff_hash, account_id, service, payload_encrypted, created_at, expires_at
         ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(handoffHash, accountId, service, payloadEncrypted, createdAt, expiresAt)
      .run();
    return { ok: true };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: 'duplicate' };
    throw error;
  }
}

export async function consumeServiceHandoff(db, { handoffHash, nowMs, service }) {
  const row = await db
    .prepare(
      `UPDATE service_handoffs
       SET consumed_at = ?
       WHERE handoff_hash = ?
         AND service = ?
         AND consumed_at IS NULL
         AND expires_at > ?
         AND NOT EXISTS (
           SELECT 1 FROM account_deletions d
           WHERE d.account_id = service_handoffs.account_id
             AND d.phase IN ('requested', 'frozen', 'purging')
         )
       RETURNING payload_encrypted`
    )
    .bind(nowMs, handoffHash, service, nowMs)
    .first();
  return row || null;
}

export async function findServiceHandoffStatus(db, { handoffHash, service }) {
  const row = await db
    .prepare(
      `SELECT account_id, expires_at, consumed_at
       FROM service_handoffs
       WHERE handoff_hash = ?
         AND service = ?`
    )
    .bind(handoffHash, service)
    .first();
  return row || null;
}

// --- Scout applications ---

export async function getScoutApplicationByAccount(db, { accountId }) {
  const row = await db
    .prepare(
      `SELECT account_id, status, use_case, data_acked_at, applied_at,
              approved_at, revoked_at, created_at, updated_at
       FROM scout_applications
       WHERE account_id = ?`
    )
    .bind(accountId)
    .first();
  return row || null;
}

export async function getScoutApplicationStatusByAccount(db, { accountId }) {
  const row = await db
    .prepare(
      `SELECT account_id, status
       FROM scout_applications
       WHERE account_id = ?`
    )
    .bind(accountId)
    .first();
  return row || null;
}

export async function listScoutApplications(db, { status }) {
  const sql = `SELECT sa.account_id, sa.status, sa.applied_at, sa.approved_at, sa.revoked_at,
                      pe.address_encrypted AS primary_address_encrypted
               FROM scout_applications sa
               LEFT JOIN accounts a ON a.id = sa.account_id
               LEFT JOIN account_emails pe ON pe.id = a.primary_email_id AND pe.account_id = a.id
               ${status !== undefined ? 'WHERE sa.status = ?' : ''}
               ORDER BY sa.created_at DESC, sa.account_id DESC`;
  const statement = db.prepare(sql);
  const { results } = status !== undefined
    ? await statement.bind(status).all()
    : await statement.all();
  return results || [];
}

export async function applyScoutPendingWithEvent(db, { accountId, useCase, dataAckedAt, nowMs }) {
  const correlationId = crypto.randomUUID();
  const results = await db.batch([
    db
      .prepare(
        `UPDATE scout_applications
         SET use_case = COALESCE(?2, scout_applications.use_case),
             data_acked_at = ?3,
             updated_at = ?4
         WHERE account_id = ?1
           AND status = 'pending'`
      )
      .bind(accountId, useCase, dataAckedAt, nowMs),
    db
      .prepare(
        `INSERT INTO scout_lifecycle_events (
           correlation_id, account_id, sequence, action, from_status, to_status,
           actor_kind, actor_principal, reason_code, occurred_at
         )
         SELECT
           ?2,
           ?1,
           COALESCE(
             (SELECT MAX(sequence) FROM scout_lifecycle_events WHERE account_id = ?1),
             0
           ) + 1,
           'apply',
           'absent',
           'pending',
           'owner',
           ?1,
           'owner_application',
           ?3
         WHERE NOT EXISTS (
           SELECT 1 FROM scout_applications WHERE account_id = ?1
         )
         RETURNING correlation_id`
      )
      .bind(accountId, correlationId, nowMs),
    db
      .prepare(
        `INSERT INTO scout_applications (
           account_id, status, use_case, data_acked_at, applied_at, created_at, updated_at
         )
         SELECT ?1, 'pending', ?2, ?3, ?4, ?4, ?4
         WHERE NOT EXISTS (
           SELECT 1 FROM scout_applications WHERE account_id = ?1
         )`
      )
      .bind(accountId, useCase, dataAckedAt, nowMs),
  ]);
  const returnedCorrelationId = results?.[1]?.results?.[0]?.correlation_id || null;
  return { transitioned: returnedCorrelationId !== null, correlationId: returnedCorrelationId };
}

export async function transitionScoutStatusWithEvent(db, {
  accountId,
  action,
  fromStatus,
  toStatus,
  actorKind,
  actorPrincipal,
  reasonCode,
  nowMs,
}) {
  let eventSql;
  let statusSql;
  if (action === 'preapprove' && fromStatus === 'absent' && toStatus === 'approved') {
    eventSql = `INSERT INTO scout_lifecycle_events (
                  correlation_id, account_id, sequence, action, from_status, to_status,
                  actor_kind, actor_principal, reason_code, occurred_at
                )
                SELECT
                  ?2,
                  ?1,
                  COALESCE((SELECT MAX(sequence) FROM scout_lifecycle_events WHERE account_id = ?1), 0) + 1,
                  'preapprove',
                  'absent',
                  'approved',
                  ?3,
                  ?4,
                  ?5,
                  ?6
                WHERE NOT EXISTS (
                  SELECT 1 FROM scout_applications WHERE account_id = ?1
                )
                RETURNING correlation_id`;
    statusSql = `INSERT INTO scout_applications (
                   account_id, status, applied_at, approved_at, created_at, updated_at
                 )
                 SELECT ?1, 'approved', NULL, ?2, ?2, ?2
                 WHERE NOT EXISTS (
                   SELECT 1 FROM scout_applications WHERE account_id = ?1
                 )`;
  } else if (action === 'preapprove' && fromStatus === 'pending' && toStatus === 'approved') {
    eventSql = `INSERT INTO scout_lifecycle_events (
                  correlation_id, account_id, sequence, action, from_status, to_status,
                  actor_kind, actor_principal, reason_code, occurred_at
                )
                SELECT
                  ?2,
                  ?1,
                  COALESCE((SELECT MAX(sequence) FROM scout_lifecycle_events WHERE account_id = ?1), 0) + 1,
                  'preapprove',
                  'pending',
                  'approved',
                  ?3,
                  ?4,
                  ?5,
                  ?6
                WHERE EXISTS (
                  SELECT 1 FROM scout_applications WHERE account_id = ?1 AND status = 'pending'
                )
                RETURNING correlation_id`;
    statusSql = `UPDATE scout_applications
                 SET status = 'approved',
                     approved_at = ?2,
                     revoked_at = NULL,
                     updated_at = ?2
                 WHERE account_id = ?1
                   AND status = 'pending'`;
  } else if (action === 'preapprove' && fromStatus === 'revoked' && toStatus === 'approved') {
    eventSql = `INSERT INTO scout_lifecycle_events (
                  correlation_id, account_id, sequence, action, from_status, to_status,
                  actor_kind, actor_principal, reason_code, occurred_at
                )
                SELECT
                  ?2,
                  ?1,
                  COALESCE((SELECT MAX(sequence) FROM scout_lifecycle_events WHERE account_id = ?1), 0) + 1,
                  'preapprove',
                  'revoked',
                  'approved',
                  ?3,
                  ?4,
                  ?5,
                  ?6
                WHERE EXISTS (
                  SELECT 1 FROM scout_applications WHERE account_id = ?1 AND status = 'revoked'
                )
                RETURNING correlation_id`;
    statusSql = `UPDATE scout_applications
                 SET status = 'approved',
                     approved_at = ?2,
                     revoked_at = NULL,
                     updated_at = ?2
                 WHERE account_id = ?1
                   AND status = 'revoked'`;
  } else if (action === 'approve' && fromStatus === 'pending' && toStatus === 'approved') {
    eventSql = `INSERT INTO scout_lifecycle_events (
                  correlation_id, account_id, sequence, action, from_status, to_status,
                  actor_kind, actor_principal, reason_code, occurred_at
                )
                SELECT
                  ?2,
                  ?1,
                  COALESCE((SELECT MAX(sequence) FROM scout_lifecycle_events WHERE account_id = ?1), 0) + 1,
                  'approve',
                  'pending',
                  'approved',
                  ?3,
                  ?4,
                  ?5,
                  ?6
                WHERE EXISTS (
                  SELECT 1 FROM scout_applications WHERE account_id = ?1 AND status = 'pending'
                )
                RETURNING correlation_id`;
    statusSql = `UPDATE scout_applications
                 SET status = 'approved',
                     approved_at = ?2,
                     revoked_at = NULL,
                     updated_at = ?2
                 WHERE account_id = ?1
                   AND status = 'pending'`;
  } else if (action === 'revoke' && fromStatus === 'pending' && toStatus === 'revoked') {
    eventSql = `INSERT INTO scout_lifecycle_events (
                  correlation_id, account_id, sequence, action, from_status, to_status,
                  actor_kind, actor_principal, reason_code, occurred_at
                )
                SELECT
                  ?2,
                  ?1,
                  COALESCE((SELECT MAX(sequence) FROM scout_lifecycle_events WHERE account_id = ?1), 0) + 1,
                  'revoke',
                  'pending',
                  'revoked',
                  ?3,
                  ?4,
                  ?5,
                  ?6
                WHERE EXISTS (
                  SELECT 1 FROM scout_applications WHERE account_id = ?1 AND status = 'pending'
                )
                RETURNING correlation_id`;
    statusSql = `UPDATE scout_applications
                 SET status = 'revoked',
                     revoked_at = ?2,
                     updated_at = ?2
                 WHERE account_id = ?1
                   AND status = 'pending'`;
  } else if (action === 'revoke' && fromStatus === 'approved' && toStatus === 'revoked') {
    eventSql = `INSERT INTO scout_lifecycle_events (
                  correlation_id, account_id, sequence, action, from_status, to_status,
                  actor_kind, actor_principal, reason_code, occurred_at
                )
                SELECT
                  ?2,
                  ?1,
                  COALESCE((SELECT MAX(sequence) FROM scout_lifecycle_events WHERE account_id = ?1), 0) + 1,
                  'revoke',
                  'approved',
                  'revoked',
                  ?3,
                  ?4,
                  ?5,
                  ?6
                WHERE EXISTS (
                  SELECT 1 FROM scout_applications WHERE account_id = ?1 AND status = 'approved'
                )
                RETURNING correlation_id`;
    statusSql = `UPDATE scout_applications
                 SET status = 'revoked',
                     revoked_at = ?2,
                     updated_at = ?2
                 WHERE account_id = ?1
                   AND status = 'approved'`;
  } else {
    throw new Error('unsupported Scout lifecycle transition');
  }

  const correlationId = crypto.randomUUID();
  const results = await db.batch([
    db.prepare(eventSql).bind(accountId, correlationId, actorKind, actorPrincipal, reasonCode, nowMs),
    db.prepare(statusSql).bind(accountId, nowMs),
  ]);
  const returnedCorrelationId = results?.[0]?.results?.[0]?.correlation_id || null;
  return { transitioned: returnedCorrelationId !== null, correlationId: returnedCorrelationId };
}

export async function getScoutLifecycleMaxSequence(db, accountId) {
  const row = await db
    .prepare(
      `SELECT COALESCE(MAX(sequence), 0) AS max_sequence
       FROM scout_lifecycle_events
       WHERE account_id = ?1`
    )
    .bind(accountId)
    .first();
  return Number(row?.max_sequence ?? 0);
}

export async function listScoutLifecycleEvents(db, accountId, { maxSequence, limit }) {
  const { results } = await db
    .prepare(
      `SELECT correlation_id, sequence, action, from_status, to_status,
              actor_kind, actor_principal, reason_code, occurred_at
       FROM scout_lifecycle_events
       WHERE account_id = ?1
         AND sequence <= ?2
       ORDER BY sequence DESC
       LIMIT ?3`
    )
    .bind(accountId, maxSequence, limit)
    .all();
  return results || [];
}

export async function setScoutApplicationDataAcked(db, { accountId, nowMs }) {
  await db
    .prepare(
      `UPDATE scout_applications
       SET data_acked_at = ?,
           updated_at = ?
       WHERE account_id = ?
         AND status = 'approved'
         AND data_acked_at IS NULL`
    )
    .bind(nowMs, nowMs, accountId)
    .run();
}

// --- Billing entitlements ---

export async function getEntitlement(db, { accountId, service }) {
  const row = await db
    .prepare(
      `SELECT account_id, service, status, current_period_end, source, source_ref, enabled_at, updated_at
       FROM entitlements
       WHERE account_id = ? AND service = ?`
    )
    .bind(accountId, service)
    .first();
  return row || null;
}

export async function listEntitlementsForAccount(db, { accountId }) {
  const { results } = await db
    .prepare(
      `SELECT service, status, source
       FROM entitlements
       WHERE account_id = ?`
    )
    .bind(accountId)
    .all();
  return results ?? [];
}

export async function upsertEntitlement(db, {
  accountId,
  service,
  status,
  currentPeriodEnd,
  source,
  sourceRef,
  nowMs,
}) {
  const enabledAt = status === 'active' ? nowMs : null;
  await db
    .prepare(
      `INSERT INTO entitlements (
         account_id, service, status, current_period_end, source, source_ref, enabled_at, updated_at
       ) SELECT ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM accounts WHERE id = ?)
       ON CONFLICT(account_id, service) DO UPDATE SET
         status = excluded.status,
         current_period_end = COALESCE(excluded.current_period_end, entitlements.current_period_end),
         source = excluded.source,
         source_ref = COALESCE(excluded.source_ref, entitlements.source_ref),
         enabled_at = COALESCE(entitlements.enabled_at, excluded.enabled_at),
         updated_at = excluded.updated_at`
    )
    .bind(accountId, service, status, currentPeriodEnd, source, sourceRef, enabledAt, nowMs, accountId)
    .run();
}

export async function getStripeCustomerByAccount(db, { accountId }) {
  const row = await db
    .prepare(
      `SELECT account_id, stripe_customer_id, created_at
       FROM stripe_customers
       WHERE account_id = ?`
    )
    .bind(accountId)
    .first();
  return row || null;
}

export async function getAccountByStripeCustomer(db, { stripeCustomerId }) {
  const row = await db
    .prepare(
      `SELECT account_id, stripe_customer_id, created_at
       FROM stripe_customers
       WHERE stripe_customer_id = ?`
    )
    .bind(stripeCustomerId)
    .first();
  return row || null;
}

export async function upsertStripeCustomer(db, { accountId, stripeCustomerId, nowMs }) {
  await db
    .prepare(
      `INSERT INTO stripe_customers (account_id, stripe_customer_id, created_at)
       SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM accounts WHERE id = ?)
       ON CONFLICT(account_id) DO UPDATE SET
         stripe_customer_id = excluded.stripe_customer_id`
    )
    .bind(accountId, stripeCustomerId, nowMs, accountId)
    .run();
}

export async function upsertSplBinding(db, { accountId, instanceId, nowMs }) {
  await db
    .prepare(
      `INSERT INTO spl_bindings (account_id, instance_id, created_at, last_seen_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(account_id, instance_id) DO UPDATE SET
         last_seen_at = excluded.last_seen_at`
    )
    .bind(accountId, instanceId, nowMs, nowMs)
    .run();
}

export async function upsertSpbBinding(db, { accountId, instanceId, tokenHash, nowMs }) {
  await db
    .prepare(
      `INSERT INTO spb_bindings (
         account_id, instance_id, created_at, last_seen_at, token_hash, lapsed_at
       ) VALUES (?, ?, ?, ?, ?, NULL)
       ON CONFLICT(account_id, instance_id) DO UPDATE SET
         token_hash = excluded.token_hash,
         last_seen_at = excluded.last_seen_at,
         lapsed_at = NULL`
    )
    .bind(accountId, instanceId, nowMs, nowMs, tokenHash)
    .run();
}

export async function rotateSpbBindingToken(db, { accountId, instanceId, tokenHash, nowMs }) {
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO spb_retired_tokens (token_hash, account_id, instance_id, retired_at)
         SELECT token_hash, account_id, instance_id, ?3
         FROM spb_bindings
         WHERE account_id = ?1 AND instance_id = ?2 AND token_hash IS NOT NULL
         ON CONFLICT(token_hash) DO NOTHING`
      )
      .bind(accountId, instanceId, nowMs),
    db
      .prepare(
        `UPDATE spb_bindings
         SET token_hash = ?, last_seen_at = ?, lapsed_at = NULL
         WHERE account_id = ? AND instance_id = ?`
      )
      .bind(tokenHash, nowMs, accountId, instanceId),
  ]);
  return results[results.length - 1].meta.changes > 0;
}

export async function upsertSppBinding(db, {
  accountId,
  instanceId,
  tokenHash,
  nowMs,
  consentAckedAt,
  consentDisclosureVersion,
}) {
  await db
    .prepare(
      `INSERT INTO spp_bindings (
         account_id, instance_id, token_hash, created_at, last_seen_at,
         consent_acked_at, consent_disclosure_version
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id, instance_id) DO UPDATE SET
         token_hash = excluded.token_hash,
         last_seen_at = excluded.last_seen_at,
         consent_acked_at = excluded.consent_acked_at,
         consent_disclosure_version = excluded.consent_disclosure_version`
    )
    .bind(
      accountId,
      instanceId,
      tokenHash,
      nowMs,
      nowMs,
      consentAckedAt,
      consentDisclosureVersion
    )
    .run();
}

export async function listSplBindings(db, accountId) {
  const { results } = await db
    .prepare('SELECT instance_id FROM spl_bindings WHERE account_id = ?')
    .bind(accountId)
    .all();
  return results || [];
}

export async function listSpbBindings(db, accountId) {
  const { results } = await db
    .prepare(
      `SELECT instance_id, created_at
       FROM spb_bindings
       WHERE account_id = ?
       ORDER BY created_at ASC, instance_id ASC`
    )
    .bind(accountId)
    .all();
  return results || [];
}

export async function listSppBindings(db, accountId) {
  const { results } = await db
    .prepare('SELECT instance_id FROM spp_bindings WHERE account_id = ? ORDER BY instance_id ASC')
    .bind(accountId)
    .all();
  return results || [];
}

export async function markSpbBindingLapsed(db, { accountId, nowMs }) {
  await db
    .prepare('UPDATE spb_bindings SET lapsed_at = ? WHERE account_id = ? AND lapsed_at IS NULL')
    .bind(nowMs, accountId)
    .run();
}

export async function clearSpbBindingLapsed(db, { accountId }) {
  await db
    .prepare('UPDATE spb_bindings SET lapsed_at = NULL WHERE account_id = ?')
    .bind(accountId)
    .run();
}

export async function selectDueLapsedBindings(db, cutoffMs) {
  const { results } = await db
    .prepare(
      `SELECT account_id, instance_id
       FROM spb_bindings
       WHERE lapsed_at IS NOT NULL
         AND lapsed_at <= ?
         AND NOT EXISTS (
           SELECT 1 FROM account_deletions d
           WHERE d.account_id = spb_bindings.account_id
             AND d.phase IN ('requested', 'frozen', 'purging')
         )
       ORDER BY lapsed_at ASC, rowid ASC`
    )
    .bind(cutoffMs)
    .all();
  return results || [];
}

export async function deleteSpbBinding(db, { accountId, instanceId }) {
  await db
    .prepare('DELETE FROM spb_bindings WHERE account_id = ? AND instance_id = ?')
    .bind(accountId, instanceId)
    .run();
}

export async function findSpbSweepAudit(db, { accountId, instanceId, prefix }) {
  const row = await db
    .prepare(
      `SELECT ts
       FROM spb_sweep_audit
       WHERE account_id = ? AND instance_id = ? AND prefix = ?
       ORDER BY ts DESC, rowid DESC
       LIMIT 1`
    )
    .bind(accountId, instanceId, prefix)
    .first();
  return row || null;
}

export async function findSpbBindingByTokenHash(db, tokenHash) {
  const row = await db
    .prepare(
      `SELECT account_id, instance_id, lapsed_at
       FROM spb_bindings
       WHERE token_hash = ? AND token_hash IS NOT NULL`
    )
    .bind(tokenHash)
    .first();
  return row || null;
}

export async function findRetiredSpbToken(db, tokenHash) {
  const row = await db
    .prepare(
      `SELECT account_id, instance_id
       FROM spb_retired_tokens
       WHERE token_hash = ?`
    )
    .bind(tokenHash)
    .first();
  return row || null;
}

export async function findSppBindingByTokenHash(db, tokenHash) {
  const row = await db
    .prepare(
      `SELECT account_id, instance_id
       FROM spp_bindings
       WHERE token_hash = ? AND token_hash IS NOT NULL`
    )
    .bind(tokenHash)
    .first();
  return row || null;
}

export async function insertSpbMintAudit(db, { accountId, instanceId, prefix, scope, ttl, outcome, ts }) {
  await db
    .prepare(
      `INSERT INTO spb_mint_audit (account_id, instance_id, prefix, scope, ttl, outcome, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(accountId, instanceId, prefix, scope, ttl, outcome, ts)
    .run();
}

export async function reserveSpbMint(db, {
  id,
  accountId,
  instanceId,
  scope,
  reservedExpiresAt,
  createdAt,
}) {
  const row = await db
    .prepare(
      `INSERT INTO spb_mint_reservations (
         id, account_id, instance_id, scope, reserved_expires_at, state, created_at
       ) SELECT ?, ?, ?, ?, ?, 'reserved', ?
       WHERE NOT EXISTS (
         SELECT 1 FROM account_deletions
         WHERE account_id = ? AND phase IN ('requested', 'frozen', 'purging')
       )
       RETURNING id`
    )
    .bind(id, accountId, instanceId, scope, reservedExpiresAt, createdAt, accountId)
    .first();
  return row != null;
}

export async function finalizeSpbMintReservation(db, { id }) {
  await db.prepare("UPDATE spb_mint_reservations SET state = 'finalized' WHERE id = ? AND state = 'reserved'").bind(id).run();
}

export async function insertSppMintAudit(db, { accountId, instanceId, scope, outcome, nowMs }) {
  await db
    .prepare(
      `INSERT INTO spp_mint_audit (account_id, instance_id, scope, outcome, ts)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(accountId, instanceId, scope, outcome, nowMs)
    .run();
}

export async function insertSpbSweepAudit(db, {
  accountId,
  instanceId,
  prefix,
  objectsDeleted,
  multipartAborted,
  ts,
}) {
  await db
    .prepare(
      `INSERT INTO spb_sweep_audit (
         account_id, instance_id, prefix, objects_deleted, multipart_aborted, ts
       ) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(accountId, instanceId, prefix, objectsDeleted, multipartAborted, ts)
    .run();
}

function isUniqueViolation(error) {
  return typeof error?.message === 'string' && error.message.includes('UNIQUE constraint failed');
}

// --- passkey helpers ---

export async function insertPasskeyChallenge(db, { challenge, accountId, purpose, createdAt, expiresAt }) {
  await db
    .prepare(
      'INSERT INTO passkey_challenges (challenge, account_id, purpose, created_at, expires_at, used_at) VALUES (?, ?, ?, ?, ?, NULL)'
    )
    .bind(challenge, accountId, purpose, createdAt, expiresAt)
    .run();
}

export async function consumePasskeyChallenge(db, { challenge, purpose, nowMs }) {
  const row = await db
    .prepare(
      'UPDATE passkey_challenges SET used_at = ? WHERE challenge = ? AND purpose = ? AND used_at IS NULL AND expires_at > ? RETURNING challenge, account_id, purpose, created_at, expires_at, used_at'
    )
    .bind(nowMs, challenge, purpose, nowMs)
    .first();
  return row || null;
}

export async function insertPasskeyCredential(db, credential) {
  await db
    .prepare(
      `INSERT INTO passkey_credentials (
         credential_id, account_id, public_key, counter, aaguid, transports,
         backup_eligible, backup_state, device_type, friendly_name, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      credential.credentialId,
      credential.accountId,
      credential.publicKey,
      credential.counter,
      credential.aaguid,
      credential.transports,
      credential.backupEligible ? 1 : 0,
      credential.backupState ? 1 : 0,
      credential.deviceType,
      credential.friendlyName,
      credential.createdAt
    )
    .run();
}

export async function listPasskeyCredentialsForAccount(db, accountId) {
  const { results } = await db
    .prepare(
      `SELECT credential_id, account_id, public_key, counter, aaguid, transports,
              backup_eligible, backup_state, device_type, friendly_name, created_at, last_used_at
       FROM passkey_credentials
       WHERE account_id = ? AND revoked_at IS NULL
       ORDER BY created_at DESC, credential_id DESC`
    )
    .bind(accountId)
    .all();
  return results || [];
}

export async function listTransparencyPasskeys(db, accountId) {
  const { results } = await db
    .prepare(
      `SELECT credential_id, account_id, public_key, counter, aaguid, transports,
              backup_eligible, backup_state, device_type, friendly_name, created_at,
              last_used_at, revoked_at
       FROM passkey_credentials
       WHERE account_id = ?
       ORDER BY created_at DESC, credential_id DESC`
    )
    .bind(accountId)
    .all();
  return results || [];
}

export async function listTransparencySessions(db, accountId) {
  const { results } = await db
    .prepare(
      `SELECT id_hash, created_at, expires_at, last_active_at, last_ip_encrypted,
              last_user_agent, revoked_at
       FROM sessions
       WHERE account_id = ?
       ORDER BY last_active_at DESC, id_hash DESC`
    )
    .bind(accountId)
    .all();
  return results || [];
}

export async function renamePasskey(db, { credentialId, accountId, friendlyName }) {
  await db
    .prepare('UPDATE passkey_credentials SET friendly_name = ? WHERE credential_id = ? AND account_id = ? AND revoked_at IS NULL')
    .bind(friendlyName, credentialId, accountId)
    .run();
}

export async function removePasskey(db, { credentialId, accountId, nowMs }) {
  await db
    .prepare('UPDATE passkey_credentials SET revoked_at = ? WHERE credential_id = ? AND account_id = ? AND revoked_at IS NULL')
    .bind(nowMs, credentialId, accountId)
    .run();
}

export async function getPasskeyCredential(db, credentialId) {
  const row = await db
    .prepare(
      `SELECT credential_id, account_id, public_key, counter, aaguid, transports,
              backup_eligible, backup_state, device_type, friendly_name, created_at, last_used_at, revoked_at
       FROM passkey_credentials
       WHERE credential_id = ? AND revoked_at IS NULL`
    )
    .bind(credentialId)
    .first();
  return row || null;
}

export async function updatePasskeyCredentialCounter(db, credentialId, counter, lastUsedAt) {
  await db
    .prepare('UPDATE passkey_credentials SET counter = ?, last_used_at = ? WHERE credential_id = ?')
    .bind(counter, lastUsedAt, credentialId)
    .run();
}

export async function setPasskeyUserHandleIfMissing(db, accountId, encodedHandle) {
  await db
    .prepare('UPDATE accounts SET passkey_user_handle = ? WHERE id = ? AND passkey_user_handle IS NULL')
    .bind(encodedHandle, accountId)
    .run();
}

export async function getPasskeyUserHandle(db, accountId) {
  const row = await db
    .prepare('SELECT passkey_user_handle FROM accounts WHERE id = ?')
    .bind(accountId)
    .first();
  return row?.passkey_user_handle || null;
}

// --- dashboard helpers ---

export async function getDashboardData(db, accountId) {
  const row = await db
    .prepare(
      `SELECT e.address_encrypted AS addressEncrypted, a.last_signin_at AS lastSigninAt
       FROM accounts a
       LEFT JOIN account_emails e ON e.id = a.primary_email_id AND e.account_id = a.id
       WHERE a.id = ?`
    )
    .bind(accountId)
    .first();
  return row || null;
}
