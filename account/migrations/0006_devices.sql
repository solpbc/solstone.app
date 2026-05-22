-- migration 0006_devices
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
