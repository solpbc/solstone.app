// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

// --- Session management ---

const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 2 weeks

export async function createSession(db, scoutId) {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  await db
    .prepare('INSERT INTO sessions (id, scout_id, expires_at) VALUES (?, ?, ?)')
    .bind(id, scoutId, expiresAt)
    .run();
  return { id, expiresAt };
}

export async function getSession(db, sessionId) {
  if (!sessionId) return null;
  const row = await db
    .prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')")
    .bind(sessionId)
    .first();
  return row || null;
}

export async function deleteSession(db, sessionId) {
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
}

export async function cleanupExpiredSessions(db) {
  await db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
}

// --- Scout operations ---
//
// Scout id schemes:
//   - atproto:       id = did (e.g. 'did:plc:abc123')
//   - email:         id = 'email-<uuid>' (set on first verify)
//   - pre-approved:  id = 'pending:<handle>' or 'pending-email:<email_lower>'

export async function upsertAtprotoScout(db, did, handle) {
  // If scout already exists by id (= did), update handle.
  const existing = await db
    .prepare("SELECT * FROM scouts WHERE id = ? AND auth_kind = 'atproto'")
    .bind(did)
    .first();
  if (existing) {
    await db
      .prepare('UPDATE scouts SET handle = ? WHERE id = ?')
      .bind(handle, did)
      .run();
    return { ...existing, handle };
  }
  // Check for a pre-approved record by handle (stored with pending: id prefix).
  // If found, upgrade it to the real DID so the scout inherits the pre-approval.
  const preApproved = await db
    .prepare("SELECT * FROM scouts WHERE handle = ? AND id LIKE 'pending:%'")
    .bind(handle)
    .first();
  if (preApproved) {
    await db
      .prepare('UPDATE scouts SET id = ?, did = ?, handle = ? WHERE id = ?')
      .bind(did, did, handle, preApproved.id)
      .run();
    return { ...preApproved, id: did, did, handle };
  }
  await db
    .prepare("INSERT INTO scouts (id, auth_kind, did, handle, status) VALUES (?, 'atproto', ?, ?, 'unknown')")
    .bind(did, did, handle)
    .run();
  return { id: did, auth_kind: 'atproto', did, handle, status: 'unknown' };
}

export async function getScout(db, id) {
  return db.prepare('SELECT * FROM scouts WHERE id = ?').bind(id).first();
}

export async function applyScout(db, id, email, useCase) {
  await db
    .prepare(
      "UPDATE scouts SET email = ?, email_lower = CASE WHEN ? IS NULL OR ? = '' THEN NULL ELSE lower(?) END, use_case = ?, status = 'applied', applied_at = datetime('now') WHERE id = ? AND status = 'unknown'"
    )
    .bind(email, email, email, email, useCase || null, id)
    .run();
}

export async function approveScout(db, id) {
  await db
    .prepare(
      "UPDATE scouts SET status = 'approved', approved_at = datetime('now') WHERE id = ?"
    )
    .bind(id)
    .run();
}

export async function revokeScout(db, id) {
  await db
    .prepare("UPDATE scouts SET status = 'revoked', revoked_at = datetime('now') WHERE id = ?")
    .bind(id)
    .run();
}

export async function preApproveScout(db, didOrHandle) {
  // Check if already exists by id (which equals did for atproto rows) or by handle.
  const existing = await db
    .prepare('SELECT * FROM scouts WHERE id = ? OR handle = ?')
    .bind(didOrHandle, didOrHandle)
    .first();
  if (existing) {
    await db
      .prepare(
        "UPDATE scouts SET status = 'approved', approved_at = datetime('now') WHERE id = ?"
      )
      .bind(existing.id)
      .run();
    return existing.id;
  }
  // Create new pre-approved atproto scout (DID or handle as placeholder).
  const isDid = didOrHandle.startsWith('did:');
  const id = isDid ? didOrHandle : `pending:${didOrHandle}`;
  const did = isDid ? didOrHandle : null;
  const handle = didOrHandle;
  await db
    .prepare(
      "INSERT INTO scouts (id, auth_kind, did, handle, status, approved_at) VALUES (?, 'atproto', ?, ?, 'approved', datetime('now'))"
    )
    .bind(id, did, handle)
    .run();
  return id;
}

export async function setGeminiKey(db, id, key, secret) {
  const encrypted = await encrypt(key, secret);
  await db
    .prepare('UPDATE scouts SET gemini_key = ? WHERE id = ?')
    .bind(encrypted, id)
    .run();
}

export async function getGeminiKey(db, id, secret) {
  const row = await db
    .prepare('SELECT gemini_key FROM scouts WHERE id = ?')
    .bind(id)
    .first();
  if (!row?.gemini_key) return null;
  return decrypt(row.gemini_key, secret);
}

export async function listScouts(db) {
  const { results } = await db
    .prepare('SELECT id, auth_kind, did, handle, email, status, use_case, applied_at, approved_at, created_at FROM scouts ORDER BY created_at DESC')
    .all();
  return results;
}

export async function acknowledgeData(db, id) {
  await db
    .prepare("UPDATE scouts SET data_acknowledged = 1 WHERE id = ? AND status = 'approved'")
    .bind(id)
    .run();
}

// --- Email-path scout operations ---

export async function findScoutByEmailLower(db, emailLower) {
  return db
    .prepare('SELECT * FROM scouts WHERE email_lower = ?')
    .bind(emailLower)
    .first();
}

// Upsert an email scout on first OTP verify. Three branches mirror the atproto
// helper: existing email row → return; pre-approved (id LIKE 'pending-email:...')
// → upgrade to a real id; new → INSERT with status='unknown'.
export async function upsertEmailScout(db, emailLower) {
  const existing = await findScoutByEmailLower(db, emailLower);
  if (existing) {
    if (existing.id.startsWith('pending-email:')) {
      const newId = `email-${crypto.randomUUID()}`;
      await db
        .prepare("UPDATE scouts SET id = ? WHERE id = ?")
        .bind(newId, existing.id)
        .run();
      return { ...existing, id: newId };
    }
    return existing;
  }
  const id = `email-${crypto.randomUUID()}`;
  await db
    .prepare(
      "INSERT INTO scouts (id, auth_kind, email, email_lower, status) VALUES (?, 'email', ?, ?, 'unknown')"
    )
    .bind(id, emailLower, emailLower)
    .run();
  return {
    id,
    auth_kind: 'email',
    email: emailLower,
    email_lower: emailLower,
    status: 'unknown',
  };
}

export async function applyEmailScout(db, id, useCase, profileLink) {
  await db
    .prepare(
      "UPDATE scouts SET use_case = ?, profile_link = ?, status = 'applied', applied_at = datetime('now') WHERE id = ? AND status = 'unknown'"
    )
    .bind(useCase || null, profileLink || null, id)
    .run();
}

// --- OTP operations ---
//
// One row per email_lower — UPSERTs invalidate any prior unconsumed code.

export async function upsertOtpToken(db, emailLower, codeHash, expiresAt) {
  await db
    .prepare(
      `INSERT INTO otp_tokens (email_lower, code_hash, expires_at, attempts, consumed, started_at)
       VALUES (?, ?, ?, 0, 0, datetime('now'))
       ON CONFLICT(email_lower) DO UPDATE SET
         code_hash = excluded.code_hash,
         expires_at = excluded.expires_at,
         attempts = 0,
         consumed = 0,
         started_at = datetime('now')`
    )
    .bind(emailLower, codeHash, expiresAt)
    .run();
}

export async function getOtpToken(db, emailLower) {
  return db
    .prepare('SELECT * FROM otp_tokens WHERE email_lower = ?')
    .bind(emailLower)
    .first();
}

export async function incrementOtpAttempts(db, emailLower) {
  await db
    .prepare('UPDATE otp_tokens SET attempts = attempts + 1 WHERE email_lower = ?')
    .bind(emailLower)
    .run();
}

export async function consumeOtpToken(db, emailLower) {
  await db
    .prepare('UPDATE otp_tokens SET consumed = 1 WHERE email_lower = ?')
    .bind(emailLower)
    .run();
}

// --- Rate buckets ---
//
// scope ∈ {'ip', 'email'}; key_hash is HMAC(scope, value, pepper) so values
// never store at rest. window_start is bucketed at the granularity of the
// caller's choosing (1h for IP, 1d for email-cap).

export async function bumpRateBucket(db, scope, keyHash, windowStart) {
  await db
    .prepare(
      `INSERT INTO rate_buckets (scope, key_hash, window_start, count)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(scope, key_hash, window_start) DO UPDATE SET
         count = count + 1`
    )
    .bind(scope, keyHash, windowStart)
    .run();
}

export async function getRateBucketCount(db, scope, keyHash, windowStart) {
  const row = await db
    .prepare(
      'SELECT count FROM rate_buckets WHERE scope = ? AND key_hash = ? AND window_start = ?'
    )
    .bind(scope, keyHash, windowStart)
    .first();
  return row?.count || 0;
}

// --- Cleanup helpers used by the scheduled cron handler ---

export async function cleanupExpiredOtp(db) {
  await db
    .prepare(
      "DELETE FROM otp_tokens WHERE consumed = 0 AND expires_at < datetime('now')"
    )
    .run();
  await db
    .prepare(
      "DELETE FROM otp_tokens WHERE consumed = 1 AND started_at < datetime('now', '-24 hours')"
    )
    .run();
}

export async function cleanupOldRateBuckets(db) {
  await db
    .prepare("DELETE FROM rate_buckets WHERE window_start < datetime('now', '-24 hours')")
    .run();
}

export async function expireStaleApplications(db) {
  // Silent 30-day expiration for unknown / applied / revoked rows.
  // No notification — re-apply works for both auth kinds.
  await db
    .prepare(
      "DELETE FROM scouts WHERE status = 'unknown' AND created_at < datetime('now', '-30 days')"
    )
    .run();
  await db
    .prepare(
      "DELETE FROM scouts WHERE status = 'applied' AND applied_at < datetime('now', '-30 days')"
    )
    .run();
  await db
    .prepare(
      "DELETE FROM scouts WHERE status = 'revoked' AND revoked_at IS NOT NULL AND revoked_at < datetime('now', '-30 days')"
    )
    .run();
}

// --- Feedback operations ---

export async function submitFeedback(db, scoutDid, category, body) {
  await db
    .prepare('INSERT INTO feedback (scout_did, category, body) VALUES (?, ?, ?)')
    .bind(scoutDid, category, body)
    .run();
}

export async function listFeedback(db) {
  const { results } = await db
    .prepare(
      'SELECT f.*, s.handle FROM feedback f JOIN scouts s ON f.scout_did = s.did ORDER BY f.created_at DESC'
    )
    .all();
  return results;
}

// --- News operations ---

export async function postNews(db, title, body) {
  await db
    .prepare('INSERT INTO news (title, body) VALUES (?, ?)')
    .bind(title, body)
    .run();
}

export async function listNews(db) {
  const { results } = await db
    .prepare('SELECT * FROM news ORDER BY posted_at DESC')
    .all();
  return results;
}

// --- Gemini key encryption ---

async function deriveKey(secret) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode('scouts-gemini-key'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encrypt(plaintext, secret) {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  // Concatenate iv + ciphertext, encode as base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(encoded, secret) {
  const key = await deriveKey(secret);
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(plaintext);
}
