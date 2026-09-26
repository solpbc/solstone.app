-- migration 0046_solstone_me_acme_pin
-- Add ACME account URI pinning, DNS lease and verification tracking to mcp_bridge_bindings,
-- refusal tracking to sme_bindings, and the capacity alert deduplication table.

ALTER TABLE sme_bindings ADD COLUMN journal_update_refused_at INTEGER;

ALTER TABLE mcp_bridge_bindings ADD COLUMN acme_account_uri TEXT;
ALTER TABLE mcp_bridge_bindings ADD COLUMN acme_account_pinned_at INTEGER;
ALTER TABLE mcp_bridge_bindings ADD COLUMN acme_account_replaced_at INTEGER;
ALTER TABLE mcp_bridge_bindings ADD COLUMN dns_lease_generation INTEGER;
ALTER TABLE mcp_bridge_bindings ADD COLUMN dns_lease_expires_at INTEGER;
ALTER TABLE mcp_bridge_bindings ADD COLUMN dns_verification_state TEXT;
ALTER TABLE mcp_bridge_bindings ADD COLUMN dns_verified_at INTEGER;
ALTER TABLE mcp_bridge_bindings ADD COLUMN dns_verified_uri TEXT;
ALTER TABLE mcp_bridge_bindings ADD COLUMN dns_verified_addresses TEXT;

CREATE TABLE IF NOT EXISTS solstone_me_dns_capacity_alerts (
  slot TEXT PRIMARY KEY CHECK (slot = 'capacity'),
  alerted_at INTEGER NOT NULL
);
