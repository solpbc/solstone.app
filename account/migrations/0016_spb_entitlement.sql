-- migration 0016_spb_entitlement
-- Broaden entitlements.service from CHECK (service IN ('spl_hosted'))
-- to CHECK (service IN ('spl_hosted','spb_hosted')) and add the SPB binding schema hook.
--
-- Partial-apply recovery runbook:
-- 1. If entitlements exists and entitlements_new also exists, the migration stopped
--    before dropping the old table. Verify entitlements contains the authoritative
--    rows, DROP TABLE entitlements_new, then rerun this file.
-- 2. If entitlements_new exists and entitlements does not exist, the migration
--    stopped after DROP TABLE entitlements and before RENAME. Run:
--      ALTER TABLE entitlements_new RENAME TO entitlements;
-- 3. If entitlements already has CHECK (service IN ('spl_hosted','spb_hosted')),
--    rerunning this file is safe: it rebuilds to the same schema and preserves all rows.
-- 4. spb_bindings uses CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS,
--    so rerunning the binding portion is safe.

DROP TABLE IF EXISTS entitlements_new;

CREATE TABLE entitlements_new (
  account_id TEXT NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('spl_hosted','spb_hosted')),
  status TEXT NOT NULL CHECK (status IN ('active','past_due','canceled','lapsed')),
  -- current_period_end: Stripe Unix SECONDS, stored verbatim. Never milliseconds.
  -- The spl relay compares its grant window against this value in seconds.
  current_period_end INTEGER,
  source TEXT NOT NULL CHECK (source IN ('stripe','apple','google','comp')),
  source_ref TEXT,
  -- enabled_at: ms (nowMs), stamped once on first transition to active; never moved.
  enabled_at INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, service),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

INSERT INTO entitlements_new (
  account_id,
  service,
  status,
  current_period_end,
  source,
  source_ref,
  enabled_at,
  updated_at
)
SELECT
  account_id,
  service,
  status,
  current_period_end,
  source,
  source_ref,
  enabled_at,
  updated_at
FROM entitlements;

DROP TABLE entitlements;

ALTER TABLE entitlements_new RENAME TO entitlements;

CREATE TABLE IF NOT EXISTS spb_bindings (
  account_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  token_hash TEXT,
  lapsed_at INTEGER,
  PRIMARY KEY (account_id, instance_id),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_spb_bindings_account_id ON spb_bindings(account_id);
