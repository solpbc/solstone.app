-- migration 0053_renewal_early_reminder
-- Under the subscription rules an annual plan is reminded twice before each renewal: an early
-- reminder 60 to 70 days before it, and the main one 35 to 40 days before it. Each is claimed
-- once per renewal, so the early one has a kind of its own: kind = 'early_reminder', one row
-- per account+service+renewal, renewal_at = the renewal, content_key = ''.
--
-- SQLite cannot alter a CHECK constraint in place, so the table is rebuilt with every row
-- carried over unchanged. Nothing references renewal_notices, so dropping the old table breaks
-- no foreign key.
--
-- Partial-apply recovery: rerunning is safe until the DROP has run. If the old table is gone
-- and renewal_notices_next remains, run only the final RENAME.

CREATE TABLE IF NOT EXISTS renewal_notices_next (
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ack', 'reminder', 'oneoff', 'cooling_off', 'early_reminder')),
  service TEXT NOT NULL CHECK (
    (kind = 'oneoff' AND service = '')
    OR (kind IN ('ack', 'reminder', 'cooling_off', 'early_reminder') AND service IN ('spl_hosted', 'spb_hosted', 'sme_hosted', 'spp_hosted'))
  ),
  renewal_at INTEGER NOT NULL CHECK (
    (kind IN ('reminder', 'cooling_off', 'early_reminder') AND renewal_at > 0)
    OR (kind IN ('ack', 'oneoff') AND renewal_at = 0)
  ),
  content_key TEXT NOT NULL CHECK (
    (kind IN ('reminder', 'cooling_off', 'early_reminder') AND content_key = '')
    OR (kind = 'ack' AND (content_key = '' OR (substr(content_key, 1, 4) = 'sub_' AND length(content_key) > 4)))
    OR (kind = 'oneoff' AND length(content_key) = 64)
  ),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, kind, service, renewal_at, content_key),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO renewal_notices_next (
  account_id, kind, service, renewal_at, content_key, subject, body, created_at
)
SELECT account_id, kind, service, renewal_at, content_key, subject, body, created_at
FROM renewal_notices;

DROP TABLE renewal_notices;

ALTER TABLE renewal_notices_next RENAME TO renewal_notices;
