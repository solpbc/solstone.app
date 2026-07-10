-- Content-free audit records for SPP confidential-processing credential mints.

CREATE TABLE IF NOT EXISTS spp_mint_audit (
  account_id TEXT,
  instance_id TEXT,
  scope TEXT CHECK (scope IN ('inference')),
  outcome TEXT NOT NULL CHECK (outcome IN ('minted','refused_entitlement')),
  ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spp_mint_audit_account_id ON spp_mint_audit(account_id);
