-- migration 0014_entitlements_comp_source
-- Broaden entitlements.source from CHECK (source IN ('stripe','apple','google'))
-- to CHECK (source IN ('stripe','apple','google','comp')) for approved-scout hosted relay comps.
--
-- Partial-apply recovery runbook:
-- 1. If entitlements exists and entitlements_new also exists, the migration stopped
--    before dropping the old table. Verify entitlements contains the authoritative
--    rows, DROP TABLE entitlements_new, then rerun this file.
-- 2. If entitlements_new exists and entitlements does not exist, the migration
--    stopped after DROP TABLE entitlements and before RENAME. Run:
--      ALTER TABLE entitlements_new RENAME TO entitlements;
-- 3. If entitlements already has CHECK (source IN ('stripe','apple','google','comp')),
--    rerunning this file is safe: it rebuilds to the same schema and preserves all rows.

DROP TABLE IF EXISTS entitlements_new;

CREATE TABLE entitlements_new (
  account_id TEXT NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('spl_hosted')),
  status TEXT NOT NULL CHECK (status IN ('active','past_due','canceled','lapsed')),
  -- current_period_end: Stripe Unix SECONDS, stored verbatim. Never milliseconds.
  -- The spl relay lode compares its grant window against this value in seconds.
  current_period_end INTEGER,
  source TEXT NOT NULL CHECK (source IN ('stripe','apple','google','comp')),
  source_ref TEXT,
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
  updated_at
)
SELECT
  account_id,
  service,
  status,
  current_period_end,
  source,
  source_ref,
  updated_at
FROM entitlements;

DROP TABLE entitlements;

ALTER TABLE entitlements_new RENAME TO entitlements;
