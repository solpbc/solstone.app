-- migration 0018_spb_sweep_audit
-- Durable per-binding record for SPB lapse-retention R2 sweeps.

CREATE TABLE IF NOT EXISTS spb_sweep_audit (
  account_id TEXT,
  instance_id TEXT,
  prefix TEXT,
  objects_deleted INTEGER,
  multipart_aborted INTEGER,
  ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spb_sweep_audit_account_id ON spb_sweep_audit(account_id);
