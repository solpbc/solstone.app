-- Migration 0002: OTP tokens + D1-based rate buckets for email auth path
--
-- Adds two tables to support the email + OTP authentication flow.
-- See cto/workspace/scouts-email-otp-plan-260502.md (Hop 2).

-- One OTP row per email at a time. Brute-force defense binds attempts to the
-- row, not the session — parallel sessions can't accumulate guesses past 5.
CREATE TABLE IF NOT EXISTS otp_tokens (
  email_lower TEXT PRIMARY KEY,
  code_hash   TEXT NOT NULL,                          -- HMAC_SHA256(ENCRYPTION_SECRET, code) base64
  expires_at  TEXT NOT NULL,                          -- 10 min after start
  attempts    INTEGER NOT NULL DEFAULT 0,
  consumed    INTEGER NOT NULL DEFAULT 0,
  started_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_tokens(expires_at);

-- D1-backed rate buckets. scope = 'ip' or 'email'. key_hash is HMAC of the
-- raw IP or email_lower so we never store identifying values. window_start is
-- bucketed at 1-hour granularity for IP, 1-day for email-cap.
CREATE TABLE IF NOT EXISTS rate_buckets (
  scope        TEXT NOT NULL,
  key_hash     TEXT NOT NULL,
  window_start TEXT NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, key_hash, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_buckets_window ON rate_buckets(window_start);
