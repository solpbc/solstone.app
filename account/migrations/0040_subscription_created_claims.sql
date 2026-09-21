-- 0040_subscription_created_claims.sql
-- Opaque at-most-once claim: peppered digest plus claim time, no account, no Stripe id, no expiry.

CREATE TABLE IF NOT EXISTS subscription_created_claims (
  claim_key TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
