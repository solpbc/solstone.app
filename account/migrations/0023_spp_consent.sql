-- migration 0023_spp_consent
-- Add nullable SPP consent acknowledgment metadata, with no backfill.
-- Application code refreshes both values each time a journal is enabled.
--
-- Partial-apply recovery runbook:
-- Each ALTER is non-idempotent. If rerunning reports "duplicate column name",
-- inspect PRAGMA table_info(spp_bindings). If only one column is present, run
-- only the ALTER for the missing column. If both columns are present, the error
-- is safe to ignore because the migration is complete.

ALTER TABLE spp_bindings ADD COLUMN consent_acked_at INTEGER;
ALTER TABLE spp_bindings ADD COLUMN consent_disclosure_version TEXT;
