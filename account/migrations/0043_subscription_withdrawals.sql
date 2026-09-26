-- migration 0043_subscription_withdrawals
-- A withdrawal from a paid subscription within 14 days of buying it: submitted by the
-- owner, then finished by refunding the purchase in full and ending the subscription
-- at once, then acknowledged by email. One row per subscription, because the right runs
-- once per subscription. A row that is not finished, or not yet acknowledged, is picked
-- up again until it is.
--   subscription_ref: the Stripe subscription id withdrawn from.
--   purchased_at: Stripe's start of that subscription, Unix SECONDS.
--   submitted_at, completed_at, acknowledged_at: ms.

CREATE TABLE IF NOT EXISTS subscription_withdrawals (
  subscription_ref TEXT PRIMARY KEY CHECK (substr(subscription_ref, 1, 4) = 'sub_' AND length(subscription_ref) > 4),
  account_id TEXT NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('spl_hosted', 'spb_hosted', 'sme_hosted')),
  purchased_at INTEGER NOT NULL,
  submitted_at INTEGER NOT NULL,
  completed_at INTEGER,
  acknowledged_at INTEGER,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subscription_withdrawals_account_id
  ON subscription_withdrawals(account_id);
