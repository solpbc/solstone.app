-- account-portal D1 schema after 0014 — billing entitlements + comp source
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

-- Add account device registry and dispatch tokens.
CREATE TABLE IF NOT EXISTS account_devices (
  device_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios','macos','android')),
  push_token TEXT NOT NULL,
  push_token_env TEXT NOT NULL CHECK (push_token_env IN ('production','sandbox')),
  bundle_id TEXT NOT NULL,
  device_label TEXT,
  app_version TEXT,
  device_pubkey TEXT, -- reserved for future encrypted-push end-state
  device_pubkey_alg TEXT,
  registered_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  revoked_at INTEGER,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_devices_active_push_token
  ON account_devices(push_token, bundle_id, push_token_env)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_account_devices_account_id
  ON account_devices(account_id);

CREATE TABLE IF NOT EXISTS account_dispatch_tokens (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_account_dispatch_tokens_account_id
  ON account_dispatch_tokens(account_id);

-- Per-account Gemini API key provisioning.

CREATE TABLE IF NOT EXISTS provisioned_keys (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('gemini')),
  display_name TEXT NOT NULL,
  key_resource_name TEXT NOT NULL,
  key_string_encrypted TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  last_used_fetched_at INTEGER,
  revoked_at INTEGER,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_provisioned_keys_active_account_provider
  ON provisioned_keys(account_id, provider)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_provisioned_keys_account_id
  ON provisioned_keys(account_id);

-- Back-channel service handoffs for /enable/scout and /handoff/scout.
-- TTL-on-read enforces expiry; periodic sweep is a future lode.
CREATE TABLE IF NOT EXISTS service_handoffs (
  handoff_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('scout','push','spl')),
  payload_encrypted BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
  consumed_at INTEGER,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_service_handoffs_account_id
  ON service_handoffs(account_id);

CREATE INDEX IF NOT EXISTS idx_service_handoffs_expires_at
  ON service_handoffs(expires_at);

-- Scout application lifecycle for operator admin.
CREATE TABLE IF NOT EXISTS scout_applications (
  account_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','revoked')),
  use_case TEXT,
  data_acked_at INTEGER,
  applied_at INTEGER,
  approved_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scout_applications_status
  ON scout_applications(status);

-- retired/dormant: no code references; left in place (no destructive migration)
CREATE TABLE IF NOT EXISTS enable_scout_codes (
  code_hash TEXT PRIMARY KEY,
  nonce_hash TEXT NOT NULL UNIQUE,
  account_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
  consumed_at INTEGER,
  ip_hash TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_enable_scout_codes_active_code_hash
  ON enable_scout_codes(code_hash)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_enable_scout_codes_expires_at
  ON enable_scout_codes(expires_at);

CREATE INDEX IF NOT EXISTS idx_enable_scout_codes_account_id
  ON enable_scout_codes(account_id)
  WHERE account_id IS NOT NULL;

-- Append-only reveal acknowledgements. The PK order supports:
-- WHERE account_id = ? AND acked_at > ?
-- via equality on the first key and range on the second key.
CREATE TABLE IF NOT EXISTS gemini_reveal_acks (
  account_id TEXT NOT NULL,
  acked_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, acked_at),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS entitlements (
  account_id TEXT NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('spl_hosted')),
  status TEXT NOT NULL CHECK (status IN ('active','past_due','canceled','lapsed')),
  -- current_period_end: Stripe Unix SECONDS, stored verbatim. Never milliseconds.
  -- The spl relay lode compares its grant window against this value in seconds.
  current_period_end INTEGER,
  source TEXT NOT NULL CHECK (source IN ('stripe','apple','google','comp')),
  source_ref TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, service),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stripe_customers (
  account_id TEXT PRIMARY KEY,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- spl_bindings: schema hook for the sibling relay lode. This lode creates the
-- table + index ONLY and never reads or writes it. instance_id = relay instance.
CREATE TABLE IF NOT EXISTS spl_bindings (
  account_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, instance_id),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_spl_bindings_account_id ON spl_bindings(account_id);
