-- migration 0052_subscription_cancellations_no_name
-- The name an owner types on the cancel page is optional, goes only into the confirmation email
-- sent at the confirm, and is never stored, so the name column goes. A cancel for a serious
-- reason is recorded as a type, never with its reason. What a later resend of the confirmation
-- needs is kept instead, apart from the plan, which a resend reads from Stripe: the type,
-- whether it ends today, the whole months a refund covers, and when the withdrawal window the
-- summary showed opened.
--   cause: 1 for a cancel for a serious reason.
--   ends_today: 1 when the cancel ends the subscription the day it is made: a cancel for a
--     serious reason that chose today, or a cancel in a renewed year whose renewal is unpaid.
--     ends_at is then the moment its summary was issued, Unix seconds.
--   refund_months: the whole months the refund covers.
--   window_at: when the withdrawal window the summary showed opened, Unix seconds, or null.
-- A row carried over from 0050 keeps its values and gets cause 0, ends_today 0 and nulls for the
-- rest; none exists, since the cancel function has never been on.
--
-- SQLite cannot drop a constrained column in place, so the table is rebuilt with every row
-- carried over. Nothing references subscription_cancellations, so dropping the old table breaks
-- no foreign key; its index goes with it and is created again on the new table.
--
-- Partial-apply recovery: rerunning is safe until the DROP has run. If the old table is gone
-- and subscription_cancellations_next remains, run only the final RENAME and CREATE INDEX.

CREATE TABLE IF NOT EXISTS subscription_cancellations_next (
  subscription_ref TEXT NOT NULL CHECK (substr(subscription_ref, 1, 4) = 'sub_' AND length(subscription_ref) > 4),
  issued_at INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('spl_hosted', 'spb_hosted', 'sme_hosted', 'spp_hosted')),
  cause INTEGER NOT NULL CHECK (cause IN (0, 1)),
  ends_today INTEGER NOT NULL CHECK (ends_today IN (0, 1)),
  ends_at INTEGER NOT NULL,
  at_period_end INTEGER NOT NULL CHECK (at_period_end IN (0, 1)),
  refund_invoice_ref TEXT UNIQUE CHECK (refund_invoice_ref IS NULL OR (substr(refund_invoice_ref, 1, 3) = 'in_' AND length(refund_invoice_ref) > 3)),
  refund_amount INTEGER CHECK ((refund_invoice_ref IS NULL AND refund_amount IS NULL) OR (refund_invoice_ref IS NOT NULL AND refund_amount > 0)),
  refund_months INTEGER CHECK (refund_months IS NULL OR (refund_invoice_ref IS NOT NULL AND refund_months BETWEEN 1 AND 11)),
  window_at INTEGER,
  submitted_at INTEGER NOT NULL,
  refunded_at INTEGER,
  completed_at INTEGER,
  acknowledged_at INTEGER,
  failure_alerted_at INTEGER,
  stuck_alerted_at INTEGER,
  PRIMARY KEY (subscription_ref, issued_at),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO subscription_cancellations_next (
  subscription_ref, issued_at, account_id, service, cause, ends_today,
  ends_at, at_period_end, refund_invoice_ref, refund_amount, refund_months, window_at,
  submitted_at, refunded_at, completed_at, acknowledged_at, failure_alerted_at, stuck_alerted_at
)
SELECT subscription_ref, issued_at, account_id, service, 0, 0,
  ends_at, at_period_end, refund_invoice_ref, refund_amount, NULL, NULL,
  submitted_at, refunded_at, completed_at, acknowledged_at, failure_alerted_at, stuck_alerted_at
FROM subscription_cancellations;

DROP TABLE subscription_cancellations;

ALTER TABLE subscription_cancellations_next RENAME TO subscription_cancellations;

CREATE INDEX IF NOT EXISTS idx_subscription_cancellations_account_id
  ON subscription_cancellations(account_id);
