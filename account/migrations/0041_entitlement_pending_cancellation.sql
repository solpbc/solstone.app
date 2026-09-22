-- migration 0041_entitlement_pending_cancellation
-- Stripe keeps an at-period-end cancellation active until the paid period ends.
-- Persist that distinct state so the service page does not offer cancellation twice.

ALTER TABLE entitlements
  ADD COLUMN cancel_at_period_end INTEGER NOT NULL DEFAULT 0
  CHECK (cancel_at_period_end IN (0, 1));
