-- migration 0030_account_deletion_service_ops_owner_purge_v1
-- Replace the locally-invented purge wire format with the canonical
-- owner-purge wire contract v1. Adds key_version and envelope_issued_at
-- (needed to replay a byte-identical request/attestation on retry), renames
-- the terminal state 'complete' to 'confirmed' (only an authenticated
-- confirm-route response certifies deletion; submit-only ack is now
-- 'complete', an intermediate state), drops the obsolete
-- 'delivered'/'non_complete_refusal'/'retryable' stored states (the v1
-- contract has no permanent-refusal concept -- any non-terminal response
-- just stays pending/complete and is retried with the same envelope; the
-- account's return-value vocabulary carries 'retryable' as a signal to the
-- coordinator, never as a persisted column value), and drops
-- confirmation_receipt_digest (the v1 response carries no receipt field).
-- Legacy rows predate this contract and cannot be verified under it; they
-- are forced to 'pending' with cleared replay metadata so the next advance
-- mints a fresh v1 operation. No legacy 'complete' row is ever mapped to
-- 'confirmed' -- that would falsely certify a deletion never authenticated
-- under this contract.
--
-- Partial-apply recovery runbook:
-- 1. If account_deletion_service_ops exists and account_deletion_service_ops_new also
--    exists, the migration stopped before dropping the old table. Verify the old table
--    contains the authoritative rows, DROP TABLE account_deletion_service_ops_new,
--    then rerun this file.
-- 2. If account_deletion_service_ops_new exists and account_deletion_service_ops does
--    not exist, the migration stopped after DROP TABLE and before RENAME. Run:
--      ALTER TABLE account_deletion_service_ops_new RENAME TO account_deletion_service_ops;
--      CREATE INDEX IF NOT EXISTS idx_account_deletion_service_ops_due
--        ON account_deletion_service_ops(operation_id, state, next_attempt_at);
-- 3. Unlike 0029's targeted remap, this migration unconditionally resets every row
--    to a fresh pending v1 state. It is NOT safe to rerun once real v1 operations
--    exist, even though the final shape would look identical. If
--    account_deletion_service_ops already has the v1 shape above, the migration
--    completed; do not rerun it. Use steps 1/2 only to recover a genuine
--    partial-apply during the original migration run.

DROP TABLE IF EXISTS account_deletion_service_ops_new;

CREATE TABLE account_deletion_service_ops_new (
  id TEXT PRIMARY KEY NOT NULL,
  operation_id TEXT NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('relay', 'support')),
  service_operation_id TEXT,
  request_digest TEXT,
  key_version INTEGER,
  envelope_issued_at INTEGER,
  state TEXT NOT NULL CHECK (state IN ('pending', 'complete', 'confirmed')),
  envelope_expires_at INTEGER,
  next_attempt_at INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0
);

INSERT INTO account_deletion_service_ops_new (
  id, operation_id, service, service_operation_id, request_digest,
  key_version, envelope_issued_at, state, envelope_expires_at,
  next_attempt_at, attempt_count
)
SELECT
  id, operation_id, service, service_operation_id, NULL,
  NULL, NULL, 'pending', NULL,
  next_attempt_at, attempt_count
FROM account_deletion_service_ops
ORDER BY rowid ASC;

DROP TABLE account_deletion_service_ops;

ALTER TABLE account_deletion_service_ops_new RENAME TO account_deletion_service_ops;

CREATE INDEX IF NOT EXISTS idx_account_deletion_service_ops_due
  ON account_deletion_service_ops(operation_id, state, next_attempt_at);
