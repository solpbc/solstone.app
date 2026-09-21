-- Colorado automatic-renewal notice tracking.
-- Sentinels: SQLite UNIQUE does not treat NULLs as equal, so service and renewal_at are non-null.
-- kind = 'ack': one row per account+service, renewal_at = 0, content_key = ''.
-- kind = 'reminder': one row per account+service+renewal_at, content_key = ''.
-- kind = 'oneoff': one row per account+content_key, service = '', renewal_at = 0.

CREATE TABLE IF NOT EXISTS renewal_notices (
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
    (kind IN ('ack', 'reminder') AND content_key = '')
    OR (kind = 'oneoff' AND length(content_key) = 64)
  ),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, kind, service, renewal_at, content_key),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
