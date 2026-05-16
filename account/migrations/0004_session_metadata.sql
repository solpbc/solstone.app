-- migration 0004_session_metadata
-- Track session activity metadata and non-destructive revocation.
ALTER TABLE sessions ADD COLUMN last_active_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN revoked_at INTEGER;
ALTER TABLE sessions ADD COLUMN last_ip_encrypted TEXT;
ALTER TABLE sessions ADD COLUMN last_user_agent TEXT;
UPDATE sessions SET last_active_at = created_at WHERE last_active_at = 0;
CREATE INDEX IF NOT EXISTS idx_sessions_account_active
  ON sessions(account_id)
  WHERE revoked_at IS NULL;
