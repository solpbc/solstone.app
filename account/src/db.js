const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export async function findEmailByHash(db, addressLowerHash) {
  return db
    .prepare('SELECT id, account_id FROM account_emails WHERE address_lower_hash = ?')
    .bind(addressLowerHash)
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

export async function createSession(db, { idHash, accountId, nowMs }) {
  await db
    .prepare('INSERT INTO sessions (id_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(idHash, accountId, nowMs, nowMs + SESSION_TTL_MS)
    .run();
}

export async function getSessionAccount(db, idHash) {
  return db
    .prepare('SELECT account_id, expires_at FROM sessions WHERE id_hash = ?')
    .bind(idHash)
    .first();
}

export async function deleteSession(db, idHash) {
  await db.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(idHash).run();
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

function isUniqueViolation(error) {
  return typeof error?.message === 'string' && error.message.includes('UNIQUE constraint failed');
}
