-- migration 0050_subscription_cancellations
-- A cancellation the owner declared through the cancel function: who declared it, which
-- subscription, when it ends, and any refund of the months after it. One row per declaration,
-- keyed by its subscription and the moment its summary page was issued, so a double press of
-- the confirm finds the first row. It is recorded before any Stripe call; the row is picked up
-- again until the Stripe change and any refund have landed and the confirmation email has gone.
--   name: the name the owner typed on the form, kept for the confirmation and its resend.
--   ends_at: when the subscription ends, Unix SECONDS.
--   at_period_end: 1 when it ends at the end of the paid period, 0 at the end of a service month.
--   refund_invoice_ref: the renewal invoice whose remaining whole months are refunded. UNIQUE:
--     one cancel refund per renewal invoice, ever, whatever is declared later.
--   refund_amount: cents refunded on that invoice's charge, tax included.
--   issued_at, submitted_at, refunded_at, completed_at, acknowledged_at, *_alerted_at: ms.

CREATE TABLE IF NOT EXISTS subscription_cancellations (
  subscription_ref TEXT NOT NULL CHECK (substr(subscription_ref, 1, 4) = 'sub_' AND length(subscription_ref) > 4),
  issued_at INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('spl_hosted', 'spb_hosted', 'sme_hosted', 'spp_hosted')),
  name TEXT NOT NULL,
  ends_at INTEGER NOT NULL,
  at_period_end INTEGER NOT NULL CHECK (at_period_end IN (0, 1)),
  refund_invoice_ref TEXT UNIQUE CHECK (refund_invoice_ref IS NULL OR (substr(refund_invoice_ref, 1, 3) = 'in_' AND length(refund_invoice_ref) > 3)),
  refund_amount INTEGER CHECK ((refund_invoice_ref IS NULL AND refund_amount IS NULL) OR (refund_invoice_ref IS NOT NULL AND refund_amount > 0)),
  submitted_at INTEGER NOT NULL,
  refunded_at INTEGER,
  completed_at INTEGER,
  acknowledged_at INTEGER,
  failure_alerted_at INTEGER,
  stuck_alerted_at INTEGER,
  PRIMARY KEY (subscription_ref, issued_at),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subscription_cancellations_account_id
  ON subscription_cancellations(account_id);
