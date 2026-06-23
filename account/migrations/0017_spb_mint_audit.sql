CREATE TABLE IF NOT EXISTS spb_mint_audit (
  account_id TEXT,
  instance_id TEXT,
  prefix TEXT,
  scope TEXT,
  ttl INTEGER,
  outcome TEXT NOT NULL CHECK (outcome IN ('minted','refused_entitlement','refused_scope')),
  ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spb_mint_audit_account_id ON spb_mint_audit(account_id);
