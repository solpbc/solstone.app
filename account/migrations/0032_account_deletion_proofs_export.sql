-- migration 0032_account_deletion_proofs_export
-- Add the export proof purpose without changing any other proof coordinate.
--
-- Partial-apply recovery:
-- 1. If both tables exist, account_deletion_proofs remains authoritative. Drop
--    account_deletion_proofs_new and rerun.
-- 2. If only account_deletion_proofs_new exists, rename it and recreate the
--    lookup index below.
-- 3. If account_deletion_proofs already admits export, this migration completed;
--    do not rerun it. Rebuilding an already-live proof table can race a proof.

DROP TABLE IF EXISTS account_deletion_proofs_new;

CREATE TABLE account_deletion_proofs_new (
  token_hash TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  session_id_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('delete', 'cancel', 'export')),
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

INSERT INTO account_deletion_proofs_new (
  token_hash, account_id, session_id_hash, purpose, method, issued_at,
  expires_at, verified, consumed, attempt_count, otp_code_hash,
  passkey_challenge
)
SELECT
  token_hash, account_id, session_id_hash, purpose, method, issued_at,
  expires_at, verified, consumed, attempt_count, otp_code_hash,
  passkey_challenge
FROM account_deletion_proofs
ORDER BY rowid ASC;

DROP TABLE account_deletion_proofs;

ALTER TABLE account_deletion_proofs_new RENAME TO account_deletion_proofs;

CREATE INDEX IF NOT EXISTS idx_account_deletion_proofs_lookup
  ON account_deletion_proofs(account_id, session_id_hash, purpose, method, consumed, issued_at DESC);
