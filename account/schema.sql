-- account-portal D1 schema after 0023 — spp entitlement + schema core
-- Insert order on new-account creation (enforced by application code):
--   1. INSERT INTO accounts (primary_email_id = NULL)
--   2. INSERT INTO account_emails (account_id = accounts.id)
--   3. UPDATE accounts SET primary_email_id = account_emails.id
-- D1 does not honor SQLite DEFERRABLE FK clauses; FK clauses below are informational.

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  primary_email_id TEXT,
  passkey_user_handle TEXT,
  created_at INTEGER NOT NULL,
  last_signin_at INTEGER
);

CREATE TABLE IF NOT EXISTS account_emails (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  address_encrypted TEXT NOT NULL,
  address_lower_hash TEXT NOT NULL UNIQUE,
  is_primary INTEGER NOT NULL DEFAULT 1,
  verified_at INTEGER,
  verification_code_hash TEXT,
  verification_expires_at INTEGER,
  verification_attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_account_emails_account_id
  ON account_emails(account_id);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL DEFAULT 0,
  revoked_at INTEGER,
  last_ip_encrypted TEXT,
  last_user_agent TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_account_id
  ON sessions(account_id);

CREATE INDEX IF NOT EXISTS idx_sessions_account_active
  ON sessions(account_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS rate_buckets (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS otp_tokens (
  email_lower_hash TEXT PRIMARY KEY,
  email_lower TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_otp_tokens_expires
  ON otp_tokens(expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_passkey_user_handle
  ON accounts(passkey_user_handle)
  WHERE passkey_user_handle IS NOT NULL;

CREATE TABLE IF NOT EXISTS passkey_credentials (
  credential_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  public_key BLOB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  aaguid TEXT,
  transports TEXT,
  backup_eligible INTEGER NOT NULL DEFAULT 0,
  backup_state INTEGER NOT NULL DEFAULT 0,
  device_type TEXT,
  friendly_name TEXT,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_passkey_credentials_account
  ON passkey_credentials(account_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS passkey_challenges (
  challenge TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('register','authenticate')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_passkey_challenges_expires
  ON passkey_challenges(expires_at);

-- Add account device registry and dispatch tokens.
CREATE TABLE IF NOT EXISTS account_devices (
  device_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios','macos','android')),
  push_token TEXT NOT NULL,
  push_token_env TEXT NOT NULL CHECK (push_token_env IN ('production','sandbox')),
  bundle_id TEXT NOT NULL,
  device_label TEXT,
  app_version TEXT,
  device_pubkey TEXT, -- reserved for future encrypted-push end-state
  device_pubkey_alg TEXT,
  registered_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  revoked_at INTEGER,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_devices_active_push_token
  ON account_devices(push_token, bundle_id, push_token_env)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_account_devices_account_id
  ON account_devices(account_id);

CREATE TABLE IF NOT EXISTS account_dispatch_tokens (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_account_dispatch_tokens_account_id
  ON account_dispatch_tokens(account_id);

-- Back-channel service handoffs for /enable/scout and /handoff/scout.
-- TTL-on-read enforces expiry; a periodic sweep is future work.
CREATE TABLE IF NOT EXISTS service_handoffs (
  handoff_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('scout','push','spl','spb','spp')),
  payload_encrypted BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
  consumed_at INTEGER,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_service_handoffs_account_id
  ON service_handoffs(account_id);

CREATE INDEX IF NOT EXISTS idx_service_handoffs_expires_at
  ON service_handoffs(expires_at);

-- Scout application lifecycle for operator admin.
CREATE TABLE IF NOT EXISTS scout_applications (
  account_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','revoked')),
  use_case TEXT,
  data_acked_at INTEGER,
  applied_at INTEGER,
  approved_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scout_applications_status
  ON scout_applications(status);

-- Append-only Scout lifecycle events for owner and operator transitions.
CREATE TABLE IF NOT EXISTS scout_lifecycle_events (
  correlation_id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(correlation_id)) > 0),
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  action TEXT NOT NULL CHECK (action IN ('apply','preapprove','approve','revoke')),
  from_status TEXT NOT NULL CHECK (from_status IN ('absent','pending','approved','revoked')),
  to_status TEXT NOT NULL CHECK (to_status IN ('pending','approved','revoked')),
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('owner','operator','service')),
  actor_principal TEXT NOT NULL CHECK (length(trim(actor_principal)) > 0),
  reason_code TEXT NOT NULL CHECK (reason_code IN ('owner_application','invitation','operator_correction','application_approved','eligibility_restored','owner_request','eligibility_ended','security_response')),
  occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0),
  CHECK (
    (action = 'apply'
      AND from_status = 'absent' AND to_status = 'pending'
      AND actor_kind = 'owner' AND actor_principal = account_id
      AND reason_code = 'owner_application')
    OR
    (action = 'preapprove'
      AND actor_kind IN ('operator','service') AND to_status = 'approved'
      AND (
        (from_status = 'absent' AND reason_code IN ('invitation','operator_correction'))
        OR (from_status = 'pending' AND reason_code IN ('application_approved','operator_correction'))
        OR (from_status = 'revoked' AND reason_code IN ('eligibility_restored','operator_correction'))
      ))
    OR
    (action = 'approve'
      AND from_status = 'pending' AND to_status = 'approved'
      AND actor_kind IN ('operator','service')
      AND reason_code IN ('application_approved','operator_correction'))
    OR
    (action = 'revoke'
      AND from_status IN ('pending','approved') AND to_status = 'revoked'
      AND actor_kind IN ('operator','service')
      AND reason_code IN ('owner_request','eligibility_ended','security_response','operator_correction'))
  ),
  UNIQUE(account_id, sequence)
);

-- retired/dormant: no code references; left in place (no destructive migration)
CREATE TABLE IF NOT EXISTS enable_scout_codes (
  code_hash TEXT PRIMARY KEY,
  nonce_hash TEXT NOT NULL UNIQUE,
  account_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
  consumed_at INTEGER,
  ip_hash TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_enable_scout_codes_active_code_hash
  ON enable_scout_codes(code_hash)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_enable_scout_codes_expires_at
  ON enable_scout_codes(expires_at);

CREATE INDEX IF NOT EXISTS idx_enable_scout_codes_account_id
  ON enable_scout_codes(account_id)
  WHERE account_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS entitlements (
  account_id TEXT NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('spl_hosted','spb_hosted','spp_hosted')),
  status TEXT NOT NULL CHECK (status IN ('active','past_due','canceled','lapsed')),
  -- current_period_end: Stripe Unix SECONDS, stored verbatim. Never milliseconds.
  -- The spl relay compares its grant window against this value in seconds.
  current_period_end INTEGER,
  source TEXT NOT NULL CHECK (source IN ('stripe','apple','google','comp')),
  source_ref TEXT,
  -- enabled_at: ms (nowMs), stamped once on first transition to active; never moved.
  enabled_at INTEGER,
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

-- MCP bridge hostname authority. The ledger permanently reserves every assigned
-- label; live bindings are removed with their owner account during deletion.
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

-- spb_bindings: schema hook for SPB hosted access. P1 records only binding
-- identity plus the lapsed clock used by later retention/sweep work.
CREATE TABLE IF NOT EXISTS spb_bindings (
  account_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  token_hash TEXT,
  lapsed_at INTEGER,
  PRIMARY KEY (account_id, instance_id),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_spb_bindings_account_id ON spb_bindings(account_id);

-- token_hash is the lookup key for findSpbBindingByTokenHash(); without this the
-- finder scans the whole table. Partial + UNIQUE: unbound rows (NULL) stay exempt,
-- and .first() already assumes at most one match. See migration 0026.
CREATE UNIQUE INDEX IF NOT EXISTS idx_spb_bindings_token_hash
  ON spb_bindings(token_hash)
  WHERE token_hash IS NOT NULL;

-- spb_retired_tokens: captures a binding's old token_hash at rotation time so a
-- stranded device presenting it gets a diagnosable 401 instead of a generic
-- invalid_token. See migration 0027.
CREATE TABLE IF NOT EXISTS spb_retired_tokens (
  token_hash TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  retired_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spb_retired_tokens_retired_at ON spb_retired_tokens(retired_at);

-- Owner-initiated account deletion foundation. Phase meanings:
-- requested = proof consumed, freeze active, snapshot not yet captured, cancellable.
-- frozen = snapshot captured, access blocked, 72-hour clock from requested_at running, cancellable.
-- purging = cancellation deadline elapsed; irreversible work may run, not cancellable.
-- complete = purge finished; only a completion verifier remains.
-- cancelled = cancellation won before purging; access is restored.

CREATE TABLE IF NOT EXISTS account_deletions (
  operation_id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT,
  phase TEXT NOT NULL CHECK (phase IN ('requested', 'frozen', 'purging', 'complete', 'cancelled')),
  requested_at INTEGER NOT NULL,
  frozen_at INTEGER,
  cancellation_deadline_at INTEGER NOT NULL,
  next_attempt_at INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_expires_at INTEGER,
  snapshot_encrypted TEXT,
  snapshot_digest TEXT,
  backup_safe_after INTEGER,
  backup_empty_verified_at INTEGER,
  status_token_hash TEXT,
  completed_at INTEGER,
  cancelled_at INTEGER,
  last_error_code TEXT,
  last_error_at INTEGER,
  stripe_purge_state TEXT,
  stripe_purge_attempted_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_deletions_active_account_id
  ON account_deletions(account_id)
  WHERE account_id IS NOT NULL AND phase IN ('requested', 'frozen', 'purging');

CREATE INDEX IF NOT EXISTS idx_account_deletions_due
  ON account_deletions(phase, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_account_deletions_status_token_hash
  ON account_deletions(status_token_hash);

CREATE TABLE IF NOT EXISTS account_deletion_proofs (
  token_hash TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  session_id_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('delete', 'cancel')),
  method TEXT NOT NULL CHECK (method IN ('otp', 'passkey')),
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  consumed INTEGER NOT NULL DEFAULT 0 CHECK (consumed IN (0, 1)),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  otp_code_hash TEXT,
  passkey_challenge TEXT,
  CHECK (
    (method = 'otp' AND otp_code_hash IS NOT NULL AND passkey_challenge IS NULL) OR
    (method = 'passkey' AND otp_code_hash IS NULL AND passkey_challenge IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_proofs_lookup
  ON account_deletion_proofs(account_id, session_id_hash, purpose, method, consumed, issued_at DESC);

CREATE TABLE IF NOT EXISTS account_deletion_service_ops (
  id TEXT PRIMARY KEY NOT NULL,
  operation_id TEXT NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('relay', 'support')),
  service_operation_id TEXT,
  request_digest TEXT,
  key_version INTEGER,
  envelope_issued_at INTEGER,
  state TEXT NOT NULL CHECK (state IN ('pending', 'complete', 'confirmed')),
  envelope_expires_at INTEGER,
  next_attempt_at INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_service_ops_due
  ON account_deletion_service_ops(operation_id, state, next_attempt_at);

CREATE TABLE IF NOT EXISTS spb_mint_reservations (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  reserved_expires_at INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('reserved', 'finalized', 'abandoned')),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spb_mint_reservations_account_id
  ON spb_mint_reservations(account_id, state);

-- This is intentionally identifier-free. token_hash is the sole lookup key.
CREATE TABLE IF NOT EXISTS account_deletion_completions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  state TEXT NOT NULL CHECK (state = 'complete'),
  completed_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_completions_expires_at
  ON account_deletion_completions(expires_at);

-- spp_bindings: schema hook for SPP confidential-processing access.
-- Records binding identity plus broker-token lookup; SPP has no lapse clock or retention lifecycle.
CREATE TABLE IF NOT EXISTS spp_bindings (
  account_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  token_hash TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  consent_acked_at INTEGER,
  consent_disclosure_version TEXT,
  PRIMARY KEY (account_id, instance_id),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_spp_bindings_account_id ON spp_bindings(account_id);

-- token_hash is the lookup key for findSppBindingByTokenHash() on the SPP
-- authorization hot path; without this the finder scans the whole table on every
-- POST /internal/spp/authorize. Partial + UNIQUE, same reasoning as spb above.
-- See migration 0026.
CREATE UNIQUE INDEX IF NOT EXISTS idx_spp_bindings_token_hash
  ON spp_bindings(token_hash)
  WHERE token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS spb_mint_audit (
  account_id TEXT,
  instance_id TEXT,
  prefix TEXT,
  scope TEXT,
  ttl INTEGER,
  outcome TEXT NOT NULL CHECK (outcome IN ('minted','refused_entitlement','refused_scope')),
  ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spb_mint_audit_account_id ON spb_mint_audit(account_id);

CREATE TABLE IF NOT EXISTS spp_mint_audit (
  account_id TEXT,
  instance_id TEXT,
  scope TEXT CHECK (scope IN ('inference')),
  outcome TEXT NOT NULL CHECK (outcome IN ('minted','refused_entitlement')),
  ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spp_mint_audit_account_id ON spp_mint_audit(account_id);

CREATE TABLE IF NOT EXISTS spb_sweep_audit (
  account_id TEXT,
  instance_id TEXT,
  prefix TEXT,
  objects_deleted INTEGER,
  multipart_aborted INTEGER,
  ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spb_sweep_audit_account_id ON spb_sweep_audit(account_id);
