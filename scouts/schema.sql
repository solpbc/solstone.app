CREATE TABLE IF NOT EXISTS scouts (
  did TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'unknown' CHECK(status IN ('unknown','applied','approved','revoked')),
  gemini_key TEXT,
  use_case TEXT,
  applied_at TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scout_did TEXT NOT NULL REFERENCES scouts(did),
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
  did TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_feedback_scout ON feedback(scout_did);
CREATE INDEX IF NOT EXISTS idx_news_posted ON news(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_state_created ON oauth_state(created_at);
