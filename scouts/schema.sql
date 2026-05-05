-- Canonical fresh-install schema for scouts.solstone.app.
-- Production D1 evolves via migrations/. See migrations/0001_email_path.sql
-- for the atproto → atproto+email identity refactor (2026-05-05).

CREATE TABLE IF NOT EXISTS scouts (
  id              TEXT PRIMARY KEY,                       -- 'did:...' or 'email-<uuid>' or 'pending:<handle>' or 'pending-email:<email_lower>'
  auth_kind       TEXT NOT NULL CHECK(auth_kind IN ('atproto','email')),
  did             TEXT,                                   -- only set when auth_kind='atproto'
  handle          TEXT,
  email           TEXT,
  email_lower     TEXT UNIQUE,
  status          TEXT NOT NULL DEFAULT 'unknown'
                    CHECK(status IN ('unknown','applied','approved','revoked')),
  profile_link    TEXT,
  gemini_key      TEXT,
  data_acknowledged INTEGER NOT NULL DEFAULT 0,
  use_case        TEXT,
  applied_at      TEXT,
  approved_at     TEXT,
  revoked_at      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scout_did TEXT NOT NULL REFERENCES scouts(id),
  category TEXT NOT NULL CHECK(category IN ('bug','idea','confusion','praise')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  posted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  scout_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oauth_state (
  state TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  dpop_private_key TEXT NOT NULL,
  authorization_server TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  did TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scouts_email_lower ON scouts(email_lower);
CREATE INDEX IF NOT EXISTS idx_scouts_status ON scouts(status);
CREATE INDEX IF NOT EXISTS idx_feedback_scout ON feedback(scout_did);
CREATE INDEX IF NOT EXISTS idx_news_posted ON news(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_state_created ON oauth_state(created_at);
