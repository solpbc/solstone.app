-- migration 0028_account_deletions
-- Owner-initiated account deletion foundation. Phase meanings:
-- requested = proof consumed, freeze active, snapshot not yet captured, cancellable.
-- frozen = snapshot captured, access blocked, 72-hour clock from requested_at running, cancellable.
-- purging = cancellation deadline elapsed; irreversible work may run, not cancellable.
-- complete = purge finished; only a completion verifier remains.
-- cancelled = cancellation won before purging; access is restored.

CREATE TABLE IF NOT EXISTS account_deletions (
  operation_id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT,
  phase TEXT NOT NULL CHECK (phase IN ('requested', 'frozen', 'purging', 'complete', 'cancelled')),
  requested_at INTEGER NOT NULL,
  frozen_at INTEGER,
  cancellation_deadline_at INTEGER NOT NULL,
  next_attempt_at INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_expires_at INTEGER,
  snapshot_encrypted TEXT,
  snapshot_digest TEXT,
  backup_safe_after INTEGER,
  backup_empty_verified_at INTEGER,
  status_token_hash TEXT,
  completed_at INTEGER,
  cancelled_at INTEGER,
  last_error_code TEXT,
  last_error_at INTEGER,
  stripe_purge_state TEXT,
  stripe_purge_attempted_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_deletions_active_account_id
  ON account_deletions(account_id)
  WHERE account_id IS NOT NULL AND phase IN ('requested', 'frozen', 'purging');

CREATE INDEX IF NOT EXISTS idx_account_deletions_due
  ON account_deletions(phase, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_account_deletions_status_token_hash
  ON account_deletions(status_token_hash);

CREATE TABLE IF NOT EXISTS account_deletion_proofs (
  token_hash TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  session_id_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('delete', 'cancel')),
  method TEXT NOT NULL CHECK (method IN ('otp', 'passkey')),
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  consumed INTEGER NOT NULL DEFAULT 0 CHECK (consumed IN (0, 1)),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  otp_code_hash TEXT,
  passkey_challenge TEXT,
  CHECK (
    (method = 'otp' AND otp_code_hash IS NOT NULL AND passkey_challenge IS NULL) OR
    (method = 'passkey' AND otp_code_hash IS NULL AND passkey_challenge IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_proofs_lookup
  ON account_deletion_proofs(account_id, session_id_hash, purpose, method, consumed, issued_at DESC);

CREATE TABLE IF NOT EXISTS account_deletion_service_ops (
  id TEXT PRIMARY KEY NOT NULL,
  operation_id TEXT NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('relay', 'support')),
  service_operation_id TEXT,
  request_digest TEXT,
  state TEXT NOT NULL CHECK (state IN ('pending', 'delivered', 'complete', 'retryable', 'non_complete_refusal', 'confirmed_absent')),
  envelope_expires_at INTEGER,
  next_attempt_at INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  confirmation_receipt_digest TEXT
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_service_ops_due
  ON account_deletion_service_ops(operation_id, state, next_attempt_at);

CREATE TABLE IF NOT EXISTS spb_mint_reservations (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  reserved_expires_at INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('reserved', 'finalized', 'abandoned')),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spb_mint_reservations_account_id
  ON spb_mint_reservations(account_id, state);

-- This is intentionally identifier-free. token_hash is the sole lookup key.
CREATE TABLE IF NOT EXISTS account_deletion_completions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  state TEXT NOT NULL CHECK (state = 'complete'),
  completed_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_completions_expires_at
  ON account_deletion_completions(expires_at);
