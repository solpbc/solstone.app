-- migration 0042_renewal_ack_per_subscription
-- The written confirmation (kind = 'ack') was recorded once per account and service, ever,
-- so an owner who cancelled and subscribed again never received one for the new
-- subscription. An ack row now names the subscription it confirms in content_key.
-- Rows written before this migration keep content_key = '' and still count for any
-- subscription that started before they were sent.
--
-- SQLite cannot alter a CHECK constraint in place, so the table is rebuilt with every
-- row carried over unchanged. Nothing references renewal_notices, so dropping the old
-- table breaks no foreign key.

CREATE TABLE renewal_notices_next (
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ack', 'reminder', 'oneoff')),
  service TEXT NOT NULL CHECK (
    (kind = 'oneoff' AND service = '')
    OR (kind IN ('ack', 'reminder') AND service IN ('spl_hosted', 'spb_hosted', 'sme_hosted'))
  ),
  renewal_at INTEGER NOT NULL CHECK (
    (kind = 'reminder' AND renewal_at > 0)
    OR (kind IN ('ack', 'oneoff') AND renewal_at = 0)
  ),
  content_key TEXT NOT NULL CHECK (
    (kind = 'reminder' AND content_key = '')
    OR (kind = 'ack' AND (content_key = '' OR (substr(content_key, 1, 4) = 'sub_' AND length(content_key) > 4)))
    OR (kind = 'oneoff' AND length(content_key) = 64)
  ),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, kind, service, renewal_at, content_key),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

INSERT INTO renewal_notices_next (
  account_id, kind, service, renewal_at, content_key, subject, body, created_at
)
SELECT account_id, kind, service, renewal_at, content_key, subject, body, created_at
FROM renewal_notices;

DROP TABLE renewal_notices;

ALTER TABLE renewal_notices_next RENAME TO renewal_notices;
