// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

// --- Session management ---

const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 2 weeks

export async function createSession(db, did) {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  await db
    .prepare('INSERT INTO sessions (id, did, expires_at) VALUES (?, ?, ?)')
    .bind(id, did, expiresAt)
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

export async function upsertScout(db, did, handle) {
  // If scout already exists by DID, update handle.
  const existing = await db
    .prepare('SELECT * FROM scouts WHERE did = ?')
    .bind(did)
    .first();
  if (existing) {
    await db
      .prepare('UPDATE scouts SET handle = ? WHERE did = ?')
      .bind(handle, did)
      .run();
    return { ...existing, handle };
  }
  // Check for a pre-approved record by handle (stored with pending: DID prefix).
  // If found, upgrade it to the real DID so the scout inherits the pre-approval.
  const preApproved = await db
    .prepare("SELECT * FROM scouts WHERE handle = ? AND did LIKE 'pending:%'")
    .bind(handle)
    .first();
  if (preApproved) {
    await db
      .prepare('UPDATE scouts SET did = ?, handle = ? WHERE did = ?')
      .bind(did, handle, preApproved.did)
      .run();
    return { ...preApproved, did, handle };
  }
  await db
    .prepare('INSERT INTO scouts (did, handle, status) VALUES (?, ?, ?)')
    .bind(did, handle, 'unknown')
    .run();
  return { did, handle, status: 'unknown' };
}

export async function getScout(db, did) {
  return db.prepare('SELECT * FROM scouts WHERE did = ?').bind(did).first();
}

export async function applyScout(db, did, email, useCase) {
  await db
    .prepare(
      "UPDATE scouts SET email = ?, use_case = ?, status = 'applied', applied_at = datetime('now') WHERE did = ? AND status = 'unknown'"
    )
    .bind(email, useCase || null, did)
    .run();
}

export async function approveScout(db, did) {
  await db
    .prepare(
      "UPDATE scouts SET status = 'approved', approved_at = datetime('now') WHERE did = ?"
    )
    .bind(did)
    .run();
}

export async function revokeScout(db, did) {
  await db
    .prepare("UPDATE scouts SET status = 'revoked' WHERE did = ?")
    .bind(did)
    .run();
}

export async function preApproveScout(db, didOrHandle) {
  // Check if already exists
  const existing = await db
    .prepare('SELECT * FROM scouts WHERE did = ? OR handle = ?')
    .bind(didOrHandle, didOrHandle)
    .first();
  if (existing) {
    await db
      .prepare(
        "UPDATE scouts SET status = 'approved', approved_at = datetime('now') WHERE did = ?"
      )
      .bind(existing.did)
      .run();
    return existing.did;
  }
  // Create new pre-approved scout (DID or handle as placeholder)
  const isDid = didOrHandle.startsWith('did:');
  const did = isDid ? didOrHandle : `pending:${didOrHandle}`;
  const handle = isDid ? didOrHandle : didOrHandle;
  await db
    .prepare(
      "INSERT INTO scouts (did, handle, status, approved_at) VALUES (?, ?, 'approved', datetime('now'))"
    )
    .bind(did, handle)
    .run();
  return did;
}

export async function setGeminiKey(db, did, key, secret) {
  const encrypted = await encrypt(key, secret);
  await db
    .prepare('UPDATE scouts SET gemini_key = ? WHERE did = ?')
    .bind(encrypted, did)
    .run();
}

export async function getGeminiKey(db, did, secret) {
  const row = await db
    .prepare('SELECT gemini_key FROM scouts WHERE did = ?')
    .bind(did)
    .first();
  if (!row?.gemini_key) return null;
  return decrypt(row.gemini_key, secret);
}

export async function listScouts(db) {
  const { results } = await db
    .prepare('SELECT did, handle, email, status, use_case, applied_at, approved_at, created_at FROM scouts ORDER BY created_at DESC')
    .all();
  return results;
}

export async function acknowledgeData(db, did) {
  await db
    .prepare("UPDATE scouts SET data_acknowledged = 1 WHERE did = ? AND status = 'approved'")
    .bind(did)
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
