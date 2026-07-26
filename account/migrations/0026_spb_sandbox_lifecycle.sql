-- migration 0026_spb_sandbox_lifecycle
-- Add sandbox-run ownership, credential-expiry, denial, and identifier-free
-- lifecycle audit storage for SPB.
-- Existing rows remain baseline-owned because each new column defaults to NULL.
--
-- Preflight duplicate check (must return zero rows before applying this migration):
-- SELECT instance_id,
--        COUNT(*) AS row_count,
--        COUNT(DISTINCT account_id) AS account_count
-- FROM spb_bindings
-- GROUP BY instance_id
-- HAVING COUNT(*) > 1
-- ORDER BY instance_id;
--
-- Partial-apply recovery runbook:
-- 1. Each ALTER is non-idempotent. If some ALTERs applied, inspect
--    PRAGMA table_info('spb_bindings'), run only the missing ALTER statements
--    in their original order, then run the idempotent table/index suffix.
-- 2. If idx_spb_bindings_sandbox_run_id exists but creation of
--    idx_spb_bindings_instance_id failed, rerun the duplicate preflight, resolve
--    ownership out of band, verify the intended survivor, and run only the
--    missing unique-index statement. Never delete or select a winner automatically.
-- 3. If spb_sandbox_audit exists but either binding index is absent, leave the
--    table in place, rerun the duplicate preflight, and run only the missing
--    CREATE INDEX IF NOT EXISTS statements.
-- 4. A full rerun after all ALTERs applied fails loudly with "duplicate column
--    name". Inspect the table and run only the documented missing suffix; do not
--    skip statements blindly.

ALTER TABLE spb_bindings ADD COLUMN sandbox_run_id TEXT;
ALTER TABLE spb_bindings ADD COLUMN sandbox_credential_expires_at INTEGER;
ALTER TABLE spb_bindings ADD COLUMN sandbox_denied_at INTEGER;

CREATE TABLE IF NOT EXISTS spb_sandbox_audit (
  event TEXT NOT NULL CHECK (event IN ('mint','denial','cleanup')),
  outcome TEXT NOT NULL,
  scope TEXT CHECK (scope IS NULL OR scope IN ('backup','operated')),
  ttl INTEGER CHECK (ttl IS NULL OR ttl >= 0),
  credentials_minted INTEGER CHECK (credentials_minted IS NULL OR credentials_minted >= 0),
  objects_deleted INTEGER CHECK (objects_deleted IS NULL OR objects_deleted >= 0),
  multipart_aborted INTEGER CHECK (multipart_aborted IS NULL OR multipart_aborted >= 0),
  ts INTEGER NOT NULL,
  CHECK (
    (event = 'mint' AND outcome IN ('minted','refused_entitlement','refused_scope','mint_cas_lost','internal_error'))
    OR (event = 'denial' AND outcome IN ('released','absent','ownership_conflict','internal_error'))
    OR (event = 'cleanup' AND outcome IN ('cleaned','retryable','denial_required','absent','ownership_conflict'))
  )
);

CREATE INDEX IF NOT EXISTS idx_spb_bindings_sandbox_run_id
  ON spb_bindings(sandbox_run_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_spb_bindings_instance_id
  ON spb_bindings(instance_id);
