-- migration 0033_drop_otp_email_lower
-- otp_tokens stored the plaintext lower-cased address beside its peppered hash.
-- The verify handler already holds the address it hashed, so the column was
-- pure redundancy and a standing exception to "no plaintext email at rest".
-- Rows in flight keep their hash, code hash, expiry, attempts and consumed state.
--
-- Partial-apply recovery: this is one statement. If it failed, the column is
-- still present and the migration can simply be rerun.

ALTER TABLE otp_tokens DROP COLUMN email_lower;
