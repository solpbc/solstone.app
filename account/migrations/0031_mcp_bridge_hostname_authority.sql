-- migration 0031_mcp_bridge_hostname_authority
-- Add permanent MCP bridge hostname reservations and live owner bindings.

CREATE TABLE IF NOT EXISTS mcp_bridge_hostname_ledger (
  label TEXT PRIMARY KEY NOT NULL
    CHECK (length(label) = 8 AND label NOT GLOB '*[^a-z2-7]*'),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_bridge_bindings (
  account_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  label TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, instance_id),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (label) REFERENCES mcp_bridge_hostname_ledger(label)
);

CREATE INDEX IF NOT EXISTS idx_mcp_bridge_bindings_account_id ON mcp_bridge_bindings(account_id);
