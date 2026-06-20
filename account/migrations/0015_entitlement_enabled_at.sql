-- migration 0015_entitlement_enabled_at
-- Add entitlements.enabled_at as nullable milliseconds (nowMs), with no backfill.
-- Application code stamps it once on the first transition to active and never moves it.
--
-- Partial-apply recovery runbook:
-- If this ALTER already applied, rerunning errors with
-- "duplicate column name: enabled_at". That error is safe to ignore because the
-- column is present.

ALTER TABLE entitlements ADD COLUMN enabled_at INTEGER;
