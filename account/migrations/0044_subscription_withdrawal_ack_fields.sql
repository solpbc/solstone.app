-- migration 0044_subscription_withdrawal_ack_fields
-- What the withdrawal acknowledgement states and where it goes:
--   amount_paid: cents actually paid for the subscription, read from Stripe when the
--     withdrawal is first handled, so the acknowledgement and any resend state the same amount.
--   acknowledgement_address_encrypted: the address the owner asked the acknowledgement to go
--     to, encrypted like every stored email address, and cleared once it has been sent.
--
-- Partial-apply recovery: rerun only the statement whose column is still missing.

ALTER TABLE subscription_withdrawals ADD COLUMN amount_paid INTEGER;

ALTER TABLE subscription_withdrawals ADD COLUMN acknowledgement_address_encrypted TEXT;
