-- Migration 0003: track approval-email idempotency
--
-- Adds approval_email_sent_at to prevent re-sending the approval notification
-- if extro-scout approve runs more than once on the same scout.

ALTER TABLE scouts ADD COLUMN approval_email_sent_at TEXT;
