-- migration 0034_operator_label
-- Add nullable operator_label to sessions for operator impersonation markers.
-- Ordinary and pre-existing sessions leave it null.
--
-- Partial-apply recovery runbook:
-- This ALTER is non-idempotent. If rerunning reports "duplicate column name",
-- inspect PRAGMA table_info(sessions). If operator_label is present, the error
-- is safe to ignore because the migration is complete.

ALTER TABLE sessions ADD COLUMN operator_label TEXT;
