-- Migration 0004: drop Hop 1 rollback tables
--
-- The pre-Hop-1 tables (scouts_old, sessions_old, feedback_old) were retained
-- by 0001_email_path.sql as a rollback target while the new email + OTP auth
-- path bedded in. The email path has been running clean since 2026-05-05 and
-- full round-trip verification (founder, 2026-05-10) is complete. CPO has
-- shipped the spec; rollback posture changes from in-place rename to
-- `wrangler rollback` + forward-roll migration.
--
-- Pre-flight 2026-05-10: scouts_old=4, sessions_old=0, feedback_old=0
-- (identical to Hop 1 baseline; no code path reads or writes them).

DROP TABLE scouts_old;
DROP TABLE sessions_old;
DROP TABLE feedback_old;
