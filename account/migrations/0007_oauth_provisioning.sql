-- migration 0007_oauth_provisioning
-- Add OAuth authorization-code/token storage and per-account Gemini API key provisioning.

CREATE TABLE IF NOT EXISTS provisioned_keys (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('gemini')),
  display_name TEXT NOT NULL,
  key_resource_name TEXT NOT NULL,
  key_string_encrypted TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_provisioned_keys_active_account_provider
  ON provisioned_keys(account_id, provider)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_provisioned_keys_account_id
  ON provisioned_keys(account_id);

CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  scope TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL CHECK (code_challenge_method = 'S256'),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_oauth_codes_account_id
  ON oauth_codes(account_id);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  family_id TEXT NOT NULL,
  access_token_hash TEXT NOT NULL UNIQUE,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  access_expires_at INTEGER NOT NULL,
  refresh_expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_account_id
  ON oauth_tokens(account_id);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_family_id
  ON oauth_tokens(family_id);

-- oauth_tokens.refresh_token_hash UNIQUE serves as the refresh-token lookup index.
