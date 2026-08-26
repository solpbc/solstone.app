-- migration 0027_spb_retired_tokens
-- Adds spb_retired_tokens: rotateSpbBindingToken() now retires a binding's old
-- token_hash atomically with the rotation, so handleBackupCredentials() can tell
-- "your token was superseded by a rotation" apart from "your token was never
-- valid" instead of collapsing both into a generic invalid_token 401.

CREATE TABLE IF NOT EXISTS spb_retired_tokens (
  token_hash TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  retired_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spb_retired_tokens_retired_at ON spb_retired_tokens(retired_at);
