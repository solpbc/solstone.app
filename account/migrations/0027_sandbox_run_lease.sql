-- migration 0027_sandbox_run_lease
-- Add the durable, non-secret sandbox-run lease and reconciliation evidence row.
-- This migration requires the ownership shapes from 0025 and the SPB lifecycle
-- shapes from 0026.
--
-- Preflight prerequisite inspection (verify the documented 0025/0026 columns,
-- checks, and indexes are present before continuing):
-- PRAGMA table_info('account_dispatch_tokens');
-- PRAGMA table_info('spl_bindings');
-- PRAGMA table_info('spb_bindings');
-- PRAGMA table_info('spp_bindings');
-- PRAGMA table_info('spb_sandbox_audit');
-- PRAGMA index_list('account_dispatch_tokens');
-- PRAGMA index_list('spl_bindings');
-- PRAGMA index_list('spb_bindings');
-- PRAGMA index_list('spp_bindings');
--
-- First-apply object check (must return zero rows):
-- SELECT type, name, sql
-- FROM sqlite_master
-- WHERE name IN (
--   'sandbox_runs',
--   'idx_sandbox_runs_account_id',
--   'idx_sandbox_runs_reconcile',
--   'idx_sandbox_runs_one_nonterminal_account'
-- )
-- ORDER BY type, name;
--
-- Partial-apply recovery runbook:
-- 1. Verify the 0025/0026 prerequisite shapes above, then run the first-apply
--    object check. A first application requires no 0027 object.
-- 2. If sandbox_runs already exists, stop. Inspect
--    PRAGMA table_info('sandbox_runs'), PRAGMA index_list('sandbox_runs'),
--    PRAGMA index_info('<index_name>'), and sandbox_runs' sqlite_master.sql
--    before running anything. CREATE TABLE IF NOT EXISTS is not evidence that
--    an existing table carries the required CHECK constraints; this migration's
--    CREATE TABLE intentionally fails loudly instead of accepting that state.
-- 3. If the table is exact and either ordinary index is missing, run only the
--    missing CREATE INDEX IF NOT EXISTS statement. Existing exact indexes are
--    safe to leave in place.
-- 4. Before recreating idx_sandbox_runs_one_nonterminal_account, run this
--    duplicate-nonterminal preflight; it must return zero rows:
--      SELECT account_id, COUNT(*) AS row_count
--      FROM sandbox_runs
--      WHERE status IN (
--        'provisioning','active','cleanup_required','cleaning',
--        'expiry_pending','cleanup_failed'
--      )
--      GROUP BY account_id
--      HAVING COUNT(*) > 1
--      ORDER BY account_id;
--    Any result is a loud stop. Resolve ownership out of band and verify the
--    intended survivor; never delete or auto-select a winner.
-- 5. A full migration rerun fails loudly because sandbox_runs already exists.
--    After verifying the exact table definition, run only documented missing
--    index statements. Never use IF NOT EXISTS to paper over a partial or
--    mismatched table.

CREATE TABLE sandbox_runs (
  run_id TEXT NOT NULL PRIMARY KEY,
  account_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  contract_version INTEGER NOT NULL CHECK (contract_version = 1),
  profile TEXT NOT NULL CHECK (profile = 'full'),
  status TEXT NOT NULL CHECK (
    status IN (
      'provisioning','active','cleanup_required','cleaning',
      'expiry_pending','cleanup_failed','released'
    )
  ),
  provisioning_phase TEXT NOT NULL CHECK (
    provisioning_phase IN (
      'created','dispatch_intent','dispatch_acquired','spl_intent',
      'spl_acquired','spb_intent','spb_acquired','spp_intent',
      'spp_acquired','active'
    )
  ),
  cleanup_phase TEXT CHECK (
    cleanup_phase IS NULL OR cleanup_phase IN (
      'deny_intent','denied','relay_intent','relay_retired',
      'spb_expiry','spb_purge','verify','released'
    )
  ),
  created_at INTEGER NOT NULL,
  lease_expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  spb_retry_not_before INTEGER,
  completed_at INTEGER,
  last_residual_code TEXT CHECK (
    last_residual_code IS NULL OR last_residual_code IN (
      'lease_expired','account_missing',
      'dispatch_issue_failed','dispatch_release_failed','dispatch_ownership_conflict',
      'spp_issue_failed','spp_release_failed','spp_ownership_conflict',
      'spb_issue_failed','spb_denial_failed','spb_denial_required',
      'spb_credential_expiry_pending','spb_cleanup_retryable',
      'spb_lifecycle_absent','spb_ownership_conflict',
      'spl_grant_failed','relay_retired_state','relay_instance_do_cleanup',
      'relay_rk_do_cleanup','relay_device_revocation','relay_entitlement_clear',
      'relay_pending_grant_clear','relay_rk_registry_clear','relay_verification',
      'relay_failed','spl_issue_failed','spl_release_failed',
      'spl_ownership_conflict','lease_expired_before_activation',
      'activation_cas_lost'
    )
  ),
  dispatch_state TEXT NOT NULL CHECK (
    dispatch_state IN (
      'active','deny_pending','purge_pending','verify_pending',
      'released','cleanup_failed'
    )
  ),
  dispatch_residual_code TEXT CHECK (
    dispatch_residual_code IS NULL OR dispatch_residual_code IN (
      'lease_expired','account_missing','dispatch_issue_failed',
      'dispatch_release_failed','dispatch_ownership_conflict'
    )
  ),
  dispatch_updated_at INTEGER NOT NULL,
  spp_state TEXT NOT NULL CHECK (
    spp_state IN (
      'active','deny_pending','purge_pending','verify_pending',
      'released','cleanup_failed'
    )
  ),
  spp_residual_code TEXT CHECK (
    spp_residual_code IS NULL OR spp_residual_code IN (
      'lease_expired','account_missing','spp_issue_failed',
      'spp_release_failed','spp_ownership_conflict'
    )
  ),
  spp_updated_at INTEGER NOT NULL,
  spb_state TEXT NOT NULL CHECK (
    spb_state IN (
      'active','deny_pending','purge_pending','verify_pending',
      'released','cleanup_failed'
    )
  ),
  spb_residual_code TEXT CHECK (
    spb_residual_code IS NULL OR spb_residual_code IN (
      'lease_expired','account_missing','spb_issue_failed',
      'spb_denial_failed','spb_denial_required',
      'spb_credential_expiry_pending','spb_cleanup_retryable',
      'spb_lifecycle_absent','spb_ownership_conflict'
    )
  ),
  spb_updated_at INTEGER NOT NULL,
  spl_relay_state TEXT NOT NULL CHECK (
    spl_relay_state IN (
      'active','deny_pending','purge_pending','verify_pending',
      'released','cleanup_failed'
    )
  ),
  spl_relay_residual_code TEXT CHECK (
    spl_relay_residual_code IS NULL OR spl_relay_residual_code IN (
      'lease_expired','account_missing','spl_grant_failed',
      'relay_retired_state','relay_instance_do_cleanup','relay_rk_do_cleanup',
      'relay_device_revocation','relay_entitlement_clear',
      'relay_pending_grant_clear','relay_rk_registry_clear',
      'relay_verification','relay_failed'
    )
  ),
  spl_relay_updated_at INTEGER NOT NULL,
  spl_binding_state TEXT NOT NULL CHECK (
    spl_binding_state IN (
      'active','deny_pending','purge_pending','verify_pending',
      'released','cleanup_failed'
    )
  ),
  spl_binding_residual_code TEXT CHECK (
    spl_binding_residual_code IS NULL OR spl_binding_residual_code IN (
      'lease_expired','account_missing','spl_issue_failed',
      'spl_release_failed','spl_ownership_conflict'
    )
  ),
  spl_binding_updated_at INTEGER NOT NULL,
  CHECK (lease_expires_at = created_at + 3600000),
  CHECK (
    (status = 'released' AND cleanup_phase = 'released' AND completed_at IS NOT NULL)
    OR (
      status != 'released'
      AND cleanup_phase IS NOT 'released'
      AND completed_at IS NULL
    )
  ),
  CHECK (
    (dispatch_state = 'cleanup_failed' AND dispatch_residual_code IS NOT NULL)
    OR (dispatch_state != 'cleanup_failed' AND dispatch_residual_code IS NULL)
  ),
  CHECK (
    (spp_state = 'cleanup_failed' AND spp_residual_code IS NOT NULL)
    OR (spp_state != 'cleanup_failed' AND spp_residual_code IS NULL)
  ),
  CHECK (
    (
      spb_state = 'purge_pending'
      AND (
        spb_residual_code IS NULL
        OR spb_residual_code = 'spb_credential_expiry_pending'
      )
    )
    OR (
      spb_state = 'cleanup_failed'
      AND spb_residual_code IS NOT NULL
      AND spb_residual_code != 'spb_credential_expiry_pending'
    )
    OR (
      spb_state NOT IN ('purge_pending','cleanup_failed')
      AND spb_residual_code IS NULL
    )
  ),
  CHECK (
    (spl_relay_state = 'cleanup_failed' AND spl_relay_residual_code IS NOT NULL)
    OR (
      spl_relay_state != 'cleanup_failed'
      AND spl_relay_residual_code IS NULL
    )
  ),
  CHECK (
    (spl_binding_state = 'cleanup_failed' AND spl_binding_residual_code IS NOT NULL)
    OR (
      spl_binding_state != 'cleanup_failed'
      AND spl_binding_residual_code IS NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_sandbox_runs_account_id
  ON sandbox_runs(account_id);

CREATE INDEX IF NOT EXISTS idx_sandbox_runs_reconcile
  ON sandbox_runs(status, lease_expires_at, created_at, run_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sandbox_runs_one_nonterminal_account
  ON sandbox_runs(account_id)
  WHERE status IN (
    'provisioning','active','cleanup_required','cleaning',
    'expiry_pending','cleanup_failed'
  );
