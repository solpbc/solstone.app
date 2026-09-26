-- migration 0045_withdrawal_round_two
-- The withdrawal record no longer keeps an amount or an address: the acknowledgement names no
-- amount, and it goes to the sign-in's primary address, which the owner confirms on the page.
-- It gains the two times a person was alerted about a withdrawal that had not finished: at its
-- first failed finish, and again if the refund had still not landed after 48 hours.
--
-- The owner's "start my service now" request is kept here, not at Stripe:
--   subscription_start_requests: one row per checkout that carried the request, keyed by the
--   Stripe Checkout Session it created; subscription_ref is filled in when that checkout
--   completes. A row whose checkout never completed is removed after two days.
--   requested_at: ms.
--
-- Partial-apply recovery: rerun only the statements whose effect is missing.

ALTER TABLE subscription_withdrawals DROP COLUMN amount_paid;

ALTER TABLE subscription_withdrawals DROP COLUMN acknowledgement_address_encrypted;

ALTER TABLE subscription_withdrawals ADD COLUMN failure_alerted_at INTEGER;

ALTER TABLE subscription_withdrawals ADD COLUMN stuck_alerted_at INTEGER;

CREATE TABLE IF NOT EXISTS subscription_start_requests (
  checkout_session_ref TEXT PRIMARY KEY CHECK (substr(checkout_session_ref, 1, 3) = 'cs_' AND length(checkout_session_ref) > 3),
  account_id TEXT NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('spl_hosted', 'spb_hosted', 'sme_hosted')),
  requested_at INTEGER NOT NULL,
  subscription_ref TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subscription_start_requests_account_id
  ON subscription_start_requests(account_id);
