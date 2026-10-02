-- migration 0048_account_deletion_keep_restore
-- On a cancelled (kept) deletion, next_attempt_at now means "restoring the hold's
-- billing and services is still owed" and is cleared once that finishes. A keep made
-- before keep restored anything owes nothing, so its marker is cleared here.

UPDATE account_deletions SET next_attempt_at = NULL WHERE phase = 'cancelled';
