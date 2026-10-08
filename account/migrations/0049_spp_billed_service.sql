-- migration 0049_spp_billed_service
-- Confidential processing (spp_hosted) becomes a billed service alongside spl_hosted,
-- spb_hosted and sme_hosted: it gets the written confirmation and renewal reminders, the
-- 14-day withdrawal, and the "start my service now" request. Each of those three tables names
-- the billed services in a CHECK constraint, and SQLite cannot alter a CHECK in place, so each
-- is rebuilt with every row carried over unchanged. Nothing references these tables, so
-- dropping the old ones breaks no foreign key.
--
-- Partial-apply recovery: each table is rebuilt in its own create / copy / drop / rename
-- group. If a group stopped after its DROP, run only that group's RENAME (and, for the two
-- indexed tables, the CREATE INDEX that follows it). Earlier groups need nothing.

CREATE TABLE IF NOT EXISTS renewal_notices_next (
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ack', 'reminder', 'oneoff')),
  service TEXT NOT NULL CHECK (
    (kind = 'oneoff' AND service = '')
    OR (kind IN ('ack', 'reminder') AND service IN ('spl_hosted', 'spb_hosted', 'sme_hosted', 'spp_hosted'))
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

INSERT OR IGNORE INTO renewal_notices_next (
  account_id, kind, service, renewal_at, content_key, subject, body, created_at
)
SELECT account_id, kind, service, renewal_at, content_key, subject, body, created_at
FROM renewal_notices;

DROP TABLE renewal_notices;

ALTER TABLE renewal_notices_next RENAME TO renewal_notices;

CREATE TABLE IF NOT EXISTS subscription_withdrawals_next (
  subscription_ref TEXT PRIMARY KEY CHECK (substr(subscription_ref, 1, 4) = 'sub_' AND length(subscription_ref) > 4),
  account_id TEXT NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('spl_hosted', 'spb_hosted', 'sme_hosted', 'spp_hosted')),
  purchased_at INTEGER NOT NULL,
  submitted_at INTEGER NOT NULL,
  completed_at INTEGER,
  acknowledged_at INTEGER,
  failure_alerted_at INTEGER,
  stuck_alerted_at INTEGER,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO subscription_withdrawals_next (
  subscription_ref, account_id, service, purchased_at, submitted_at, completed_at,
  acknowledged_at, failure_alerted_at, stuck_alerted_at
)
SELECT subscription_ref, account_id, service, purchased_at, submitted_at, completed_at,
  acknowledged_at, failure_alerted_at, stuck_alerted_at
FROM subscription_withdrawals;

DROP TABLE subscription_withdrawals;

ALTER TABLE subscription_withdrawals_next RENAME TO subscription_withdrawals;

CREATE INDEX IF NOT EXISTS idx_subscription_withdrawals_account_id
  ON subscription_withdrawals(account_id);

CREATE TABLE IF NOT EXISTS subscription_start_requests_next (
  checkout_session_ref TEXT PRIMARY KEY CHECK (substr(checkout_session_ref, 1, 3) = 'cs_' AND length(checkout_session_ref) > 3),
  account_id TEXT NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('spl_hosted', 'spb_hosted', 'sme_hosted', 'spp_hosted')),
  requested_at INTEGER NOT NULL,
  subscription_ref TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO subscription_start_requests_next (
  checkout_session_ref, account_id, service, requested_at, subscription_ref
)
SELECT checkout_session_ref, account_id, service, requested_at, subscription_ref
FROM subscription_start_requests;

DROP TABLE subscription_start_requests;

ALTER TABLE subscription_start_requests_next RENAME TO subscription_start_requests;

CREATE INDEX IF NOT EXISTS idx_subscription_start_requests_account_id
  ON subscription_start_requests(account_id);
