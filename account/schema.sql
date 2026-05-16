-- account-portal D1 schema after 0005 — email verification
-- Insert order on new-account creation (enforced by application code):
--   1. INSERT INTO accounts (primary_email_id = NULL)
--   2. INSERT INTO account_emails (account_id = accounts.id)
--   3. UPDATE accounts SET primary_email_id = account_emails.id
-- D1 does not honor SQLite DEFERRABLE FK clauses; FK clauses below are informational.

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  primary_email_id TEXT,
  passkey_user_handle TEXT,
  created_at INTEGER NOT NULL,
  last_signin_at INTEGER
);

CREATE TABLE IF NOT EXISTS account_emails (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  address_encrypted TEXT NOT NULL,
  address_lower_hash TEXT NOT NULL UNIQUE,
  is_primary INTEGER NOT NULL DEFAULT 1,
  verified_at INTEGER,
  verification_code_hash TEXT,
  verification_expires_at INTEGER,
  verification_attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_account_emails_account_id
  ON account_emails(account_id);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL DEFAULT 0,
  revoked_at INTEGER,
  last_ip_encrypted TEXT,
  last_user_agent TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_account_id
  ON sessions(account_id);

CREATE INDEX IF NOT EXISTS idx_sessions_account_active
  ON sessions(account_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS rate_buckets (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS otp_tokens (
  email_lower_hash TEXT PRIMARY KEY,
  email_lower TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_otp_tokens_expires
  ON otp_tokens(expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_passkey_user_handle
  ON accounts(passkey_user_handle)
  WHERE passkey_user_handle IS NOT NULL;

CREATE TABLE IF NOT EXISTS passkey_credentials (
  credential_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  public_key BLOB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  aaguid TEXT,
  transports TEXT,
  backup_eligible INTEGER NOT NULL DEFAULT 0,
  backup_state INTEGER NOT NULL DEFAULT 0,
  device_type TEXT,
  friendly_name TEXT,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_passkey_credentials_account
  ON passkey_credentials(account_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS passkey_challenges (
  challenge TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('register','authenticate')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_passkey_challenges_expires
  ON passkey_challenges(expires_at);
