-- migration 0025_sandbox_run_ownership
-- Add sandbox-run ownership tags and globally unique SPL/SPP instance ownership.
-- Existing rows remain baseline-owned because each new column defaults to NULL.
--
-- Preflight duplicate check (must return zero rows before applying this migration):
-- SELECT 'spl_bindings' AS table_name, instance_id,
--        COUNT(*) AS row_count, COUNT(DISTINCT account_id) AS account_count
-- FROM spl_bindings
-- GROUP BY instance_id
-- HAVING COUNT(*) > 1
-- UNION ALL
-- SELECT 'spp_bindings' AS table_name, instance_id,
--        COUNT(*) AS row_count, COUNT(DISTINCT account_id) AS account_count
-- FROM spp_bindings
-- GROUP BY instance_id
-- HAVING COUNT(*) > 1
-- ORDER BY table_name, instance_id;
--
-- Partial-apply recovery runbook:
-- Each ALTER is non-idempotent. If rerunning reports "duplicate column name",
-- inspect PRAGMA table_info(account_dispatch_tokens), PRAGMA table_info(spl_bindings),
-- and PRAGMA table_info(spp_bindings), then run only the ALTER statements for
-- missing columns. The CREATE INDEX IF NOT EXISTS statements are safe to rerun.
-- Before creating either unique index, rerun the duplicate check above. If index
-- creation reports "UNIQUE constraint failed: <table>.instance_id", stop, resolve
-- the duplicate owners out of band, verify the intended survivor, and run only
-- the remaining index statements. Never delete or select a winner automatically.

ALTER TABLE account_dispatch_tokens ADD COLUMN sandbox_run_id TEXT;
ALTER TABLE spl_bindings ADD COLUMN sandbox_run_id TEXT;
ALTER TABLE spp_bindings ADD COLUMN sandbox_run_id TEXT;

CREATE INDEX IF NOT EXISTS idx_account_dispatch_tokens_sandbox_run_id
  ON account_dispatch_tokens(sandbox_run_id);
CREATE INDEX IF NOT EXISTS idx_spl_bindings_sandbox_run_id
  ON spl_bindings(sandbox_run_id);
CREATE INDEX IF NOT EXISTS idx_spp_bindings_sandbox_run_id
  ON spp_bindings(sandbox_run_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_spl_bindings_instance_id
  ON spl_bindings(instance_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_spp_bindings_instance_id
  ON spp_bindings(instance_id);
