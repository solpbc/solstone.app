-- migration 0029_account_deletion_service_ops_state
-- Remove confirmed_absent from account_deletion_service_ops.state. Historical
-- confirmed_absent rows become retryable; absence never certifies purge completion.
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
-- 3. If account_deletion_service_ops already has CHECK (state IN ('pending',
--    'delivered', 'complete', 'retryable', 'non_complete_refusal')), rerunning this
--    file is safe: it rebuilds to the same schema and preserves all rows.

DROP TABLE IF EXISTS account_deletion_service_ops_new;

CREATE TABLE account_deletion_service_ops_new (
  id TEXT PRIMARY KEY NOT NULL,
  operation_id TEXT NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('relay', 'support')),
  service_operation_id TEXT,
  request_digest TEXT,
  state TEXT NOT NULL CHECK (state IN ('pending', 'delivered', 'complete', 'retryable', 'non_complete_refusal')),
  envelope_expires_at INTEGER,
  next_attempt_at INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  confirmation_receipt_digest TEXT
);

INSERT INTO account_deletion_service_ops_new (
  id,
  operation_id,
  service,
  service_operation_id,
  request_digest,
  state,
  envelope_expires_at,
  next_attempt_at,
  attempt_count,
  confirmation_receipt_digest
)
SELECT
  id,
  operation_id,
  service,
  service_operation_id,
  request_digest,
  CASE WHEN state = 'confirmed_absent' THEN 'retryable' ELSE state END,
  envelope_expires_at,
  next_attempt_at,
  attempt_count,
  confirmation_receipt_digest
FROM account_deletion_service_ops
ORDER BY rowid ASC;

DROP TABLE account_deletion_service_ops;

ALTER TABLE account_deletion_service_ops_new RENAME TO account_deletion_service_ops;

CREATE INDEX IF NOT EXISTS idx_account_deletion_service_ops_due
  ON account_deletion_service_ops(operation_id, state, next_attempt_at);
