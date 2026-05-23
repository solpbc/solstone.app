-- migration 0008_device_codes
-- RFC 8628 device authorization rows. The device_code itself is bearer
-- material; only the OAUTH_TOKEN_PEPPER hash is stored.
CREATE TABLE IF NOT EXISTS device_codes (
  device_code_hash TEXT PRIMARY KEY,
  user_code TEXT NOT NULL
    CHECK (length(user_code) = 8)
    CHECK (user_code NOT GLOB '*[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]*'),
  account_id TEXT,
  client_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope = 'solstone.gemini'),
  code_challenge TEXT,
  code_challenge_method TEXT CHECK (code_challenge_method IS NULL OR code_challenge_method = 'S256'),
  interval_seconds INTEGER NOT NULL DEFAULT 5 CHECK (interval_seconds >= 5 AND interval_seconds <= 60),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
  last_polled_at INTEGER,
  approved_at INTEGER,
  denied_at INTEGER,
  consumed_at INTEGER,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CHECK (
    (code_challenge IS NULL AND code_challenge_method IS NULL)
    OR (code_challenge IS NOT NULL AND code_challenge_method = 'S256')
  ),
  CHECK (approved_at IS NULL OR denied_at IS NULL),
  CHECK (
    (approved_at IS NULL AND account_id IS NULL)
    OR (approved_at IS NOT NULL AND account_id IS NOT NULL)
  ),
  CHECK (consumed_at IS NULL OR approved_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_device_codes_active_user_code
  ON device_codes(user_code)
  WHERE consumed_at IS NULL AND denied_at IS NULL;

-- Append-only reveal acknowledgements. The PK order supports:
-- WHERE account_id = ? AND acked_at > ?
-- via equality on the first key and range on the second key.
CREATE TABLE IF NOT EXISTS gemini_reveal_acks (
  account_id TEXT NOT NULL,
  acked_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, acked_at),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- GCP API Keys v2 currently does not expose last-use metadata. This records
-- when we attempted the metadata fetch so the dashboard can honestly render
-- "not available (checked just now)" without treating stale local usage as GCP usage.
ALTER TABLE provisioned_keys ADD COLUMN last_used_fetched_at INTEGER;
