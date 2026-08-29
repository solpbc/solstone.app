-- migration 0013_billing_entitlements
-- Add Stripe-backed entitlements and relay binding schema hooks.

CREATE TABLE IF NOT EXISTS entitlements (
  account_id TEXT NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('spl_hosted')),
  status TEXT NOT NULL CHECK (status IN ('active','past_due','canceled','lapsed')),
  -- current_period_end: Stripe Unix SECONDS, stored verbatim. Never milliseconds.
  -- The spl relay compares its grant window against this value in seconds.
  current_period_end INTEGER,
  source TEXT NOT NULL CHECK (source IN ('stripe','apple','google')),
  source_ref TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, service),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stripe_customers (
  account_id TEXT PRIMARY KEY,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- spl_bindings: owner-to-journal bindings used for relay entitlement grants and
-- account-deletion relay fan-out. instance_id = relay instance.
CREATE TABLE IF NOT EXISTS spl_bindings (
  account_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, instance_id),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_spl_bindings_account_id ON spl_bindings(account_id);
