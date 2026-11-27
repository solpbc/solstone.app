-- migration 0054_renewal_thanks_note
-- A sign-in's first paid purchase is followed, once ever, by a short thank-you note of its own,
-- sent after the written confirmation. Its copy is kept with the other notices emailed to a
-- subscriber, so it has a kind of its own: kind = 'thanks', service = the service bought,
-- renewal_at = 0, content_key = the subscription it followed. Once per sign-in is enforced by
-- a partial unique index on account_id, so a second claim for any service is refused.
--
-- SQLite cannot alter a CHECK constraint in place, so the table is rebuilt with every row
-- carried over unchanged. Nothing references renewal_notices, so dropping the old table breaks
-- no foreign key.
--
-- Partial-apply recovery: rerunning is safe until the DROP has run. If the old table is gone
-- and renewal_notices_next remains, run only the final RENAME and the index.

CREATE TABLE IF NOT EXISTS renewal_notices_next (
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ack', 'reminder', 'oneoff', 'cooling_off', 'early_reminder', 'thanks')),
  service TEXT NOT NULL CHECK (
    (kind = 'oneoff' AND service = '')
    OR (kind IN ('ack', 'reminder', 'cooling_off', 'early_reminder', 'thanks') AND service IN ('spl_hosted', 'spb_hosted', 'sme_hosted', 'spp_hosted'))
  ),
  renewal_at INTEGER NOT NULL CHECK (
    (kind IN ('reminder', 'cooling_off', 'early_reminder') AND renewal_at > 0)
    OR (kind IN ('ack', 'oneoff', 'thanks') AND renewal_at = 0)
  ),
  content_key TEXT NOT NULL CHECK (
    (kind IN ('reminder', 'cooling_off', 'early_reminder') AND content_key = '')
    OR (kind = 'ack' AND (content_key = '' OR (substr(content_key, 1, 4) = 'sub_' AND length(content_key) > 4)))
    OR (kind = 'thanks' AND substr(content_key, 1, 4) = 'sub_' AND length(content_key) > 4)
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

CREATE UNIQUE INDEX IF NOT EXISTS renewal_notices_thanks_once
  ON renewal_notices (account_id) WHERE kind = 'thanks';
