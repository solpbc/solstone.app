-- Migration 0001: generalize identity for email + OTP path
--
-- Rebuilds scouts, sessions, and feedback tables to support a second
-- auth kind (email + OTP) alongside the existing AT Protocol path.
-- AT Proto rows are preserved 1:1 with their existing values.
--
-- Reversible by dropping the new tables and renaming *_old back.
-- See cto/workspace/scouts-email-otp-plan-260502.md (Hop 1).

PRAGMA defer_foreign_keys = ON;

-- 1. New scouts table with generalized identity
CREATE TABLE scouts_new (
  id              TEXT PRIMARY KEY,                       -- 'did:...' or 'email-<uuid>' or 'pending:<handle>' or 'pending-email:<email_lower>'
  auth_kind       TEXT NOT NULL CHECK(auth_kind IN ('atproto','email')),
  did             TEXT,                                   -- only set when auth_kind='atproto'
  handle          TEXT,
  email           TEXT,
  email_lower     TEXT UNIQUE,                            -- enforced unique across all scouts
  status          TEXT NOT NULL DEFAULT 'unknown'
                    CHECK(status IN ('unknown','applied','approved','revoked')),
  profile_link    TEXT,                                   -- email-path-only field (per founder)
  gemini_key      TEXT,
  data_acknowledged INTEGER NOT NULL DEFAULT 0,
  use_case        TEXT,
  applied_at      TEXT,
  approved_at     TEXT,
  revoked_at      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Copy existing scouts (all atproto) into the new table
INSERT INTO scouts_new (
  id, auth_kind, did, handle, email, email_lower,
  status, profile_link, gemini_key, data_acknowledged,
  use_case, applied_at, approved_at, revoked_at, created_at
)
SELECT
  did,                          -- id := did (values are preserved across the rename)
  'atproto',                    -- auth_kind
  did,                          -- did stays for atproto rows
  handle,
  email,
  CASE WHEN email IS NULL OR email = '' THEN NULL ELSE lower(email) END,
  status,
  NULL,                         -- profile_link
  gemini_key,
  data_acknowledged,
  use_case,
  applied_at,
  approved_at,
  NULL,                         -- revoked_at (no historical timestamp; cron sweeps treat existing revoked rows as out of window)
  created_at
FROM scouts;

-- 3. Rename scouts to scouts_old (rollback target), promote scouts_new
ALTER TABLE scouts RENAME TO scouts_old;
ALTER TABLE scouts_new RENAME TO scouts;

-- 4. Rebuild sessions: did → scout_id (values identical)
CREATE TABLE sessions_new (
  id          TEXT PRIMARY KEY,
  scout_id    TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO sessions_new (id, scout_id, expires_at, created_at)
SELECT id, did, expires_at, created_at FROM sessions;
ALTER TABLE sessions RENAME TO sessions_old;
ALTER TABLE sessions_new RENAME TO sessions;

-- 5. Rebuild feedback to FK against scouts(id) (column name unchanged for now)
CREATE TABLE feedback_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  scout_did    TEXT NOT NULL REFERENCES scouts(id),     -- column name kept; FK now resolves on id
  category     TEXT NOT NULL CHECK(category IN ('bug','idea','confusion','praise')),
  body         TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO feedback_new (id, scout_did, category, body, created_at)
SELECT id, scout_did, category, body, created_at FROM feedback;
ALTER TABLE feedback RENAME TO feedback_old;
ALTER TABLE feedback_new RENAME TO feedback;

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_scouts_email_lower ON scouts(email_lower);
CREATE INDEX IF NOT EXISTS idx_scouts_status ON scouts(status);
CREATE INDEX IF NOT EXISTS idx_feedback_scout ON feedback(scout_did);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
