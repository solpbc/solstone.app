-- migration 0009_service_handoffs
-- Back-channel service handoffs for /enable/scout and /handoff/scout.
-- TTL-on-read enforces expiry; a periodic sweep is future work.
-- If a handoff is never polled, the small dispatch-token row is acceptable
-- garbage until account deletion or a future janitor sweep.

CREATE TABLE IF NOT EXISTS service_handoffs (
  handoff_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('scout')),
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

DROP TABLE IF EXISTS oauth_codes;
DROP TABLE IF EXISTS oauth_tokens;
DROP TABLE IF EXISTS device_codes;
