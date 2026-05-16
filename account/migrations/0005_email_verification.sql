-- migration 0005_email_verification
-- Add verification code state to account email rows.
ALTER TABLE account_emails ADD COLUMN verification_code_hash TEXT;
ALTER TABLE account_emails ADD COLUMN verification_expires_at INTEGER;
ALTER TABLE account_emails ADD COLUMN verification_attempts INTEGER NOT NULL DEFAULT 0;
