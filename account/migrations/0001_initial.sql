-- migration 0001_initial
-- account-portal D1 schema (Lode A — magic-link auth)
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
  verified_at INTEGER NOT NULL,
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
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_account_id
  ON sessions(account_id);

CREATE TABLE IF NOT EXISTS magic_link_nonces (
  nonce_hash TEXT PRIMARY KEY,
  email_lower_hash TEXT NOT NULL,
  email_encrypted TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed INTEGER NOT NULL DEFAULT 0,
  consumed_at INTEGER
);

CREATE TABLE IF NOT EXISTS rate_buckets (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);
