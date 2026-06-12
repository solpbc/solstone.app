-- migration 0012_service_handoffs_spl
-- Broaden service_handoffs.service from CHECK (service IN ('scout','push'))
-- to CHECK (service IN ('scout','push','spl')) for SPL /enable/spl + /handoff/spl.
--
-- Partial-apply recovery runbook:
-- 1. If service_handoffs exists and service_handoffs_new also exists, the migration
--    stopped before dropping the old table. Verify service_handoffs contains the
--    authoritative rows, DROP TABLE service_handoffs_new, then rerun this file.
-- 2. If service_handoffs_new exists and service_handoffs does not exist, the migration
--    stopped after DROP TABLE service_handoffs and before RENAME. Run:
--      ALTER TABLE service_handoffs_new RENAME TO service_handoffs;
--      CREATE INDEX IF NOT EXISTS idx_service_handoffs_account_id
--        ON service_handoffs(account_id);
--      CREATE INDEX IF NOT EXISTS idx_service_handoffs_expires_at
--        ON service_handoffs(expires_at);
-- 3. If service_handoffs already has CHECK (service IN ('scout','push','spl')), rerunning
--    this file is safe: it rebuilds to the same schema and preserves all rows.
--
-- Do not add a retention sweep here. TTL-on-read remains the enforcement model.

DROP TABLE IF EXISTS service_handoffs_new;

CREATE TABLE service_handoffs_new (
  handoff_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('scout','push','spl')),
  payload_encrypted BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
  consumed_at INTEGER,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

INSERT INTO service_handoffs_new (
  handoff_hash,
  account_id,
  service,
  payload_encrypted,
  created_at,
  expires_at,
  consumed_at
)
SELECT
  handoff_hash,
  account_id,
  service,
  payload_encrypted,
  created_at,
  expires_at,
  consumed_at
FROM service_handoffs;

DROP TABLE service_handoffs;

ALTER TABLE service_handoffs_new RENAME TO service_handoffs;

CREATE INDEX IF NOT EXISTS idx_service_handoffs_account_id
  ON service_handoffs(account_id);

CREATE INDEX IF NOT EXISTS idx_service_handoffs_expires_at
  ON service_handoffs(expires_at);
