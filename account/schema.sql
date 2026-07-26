-- account-portal D1 schema after 0027 — sandbox-run lease + schema core
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
  sandbox_run_id TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_account_dispatch_tokens_account_id
  ON account_dispatch_tokens(account_id);

CREATE INDEX IF NOT EXISTS idx_account_dispatch_tokens_sandbox_run_id
  ON account_dispatch_tokens(sandbox_run_id);

-- Per-account Gemini API key provisioning.

CREATE TABLE IF NOT EXISTS provisioned_keys (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('gemini')),
  display_name TEXT NOT NULL,
  key_resource_name TEXT NOT NULL,
  key_string_encrypted TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  last_used_fetched_at INTEGER,
  revoked_at INTEGER,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_provisioned_keys_active_account_provider
  ON provisioned_keys(account_id, provider)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_provisioned_keys_account_id
  ON provisioned_keys(account_id);

-- Back-channel service handoffs for /enable/scout and /handoff/scout.
-- TTL-on-read enforces expiry; periodic sweep is a future lode.
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

-- Append-only reveal acknowledgements. The PK order supports:
-- WHERE account_id = ? AND acked_at > ?
-- via equality on the first key and range on the second key.
CREATE TABLE IF NOT EXISTS gemini_reveal_acks (
  account_id TEXT NOT NULL,
  acked_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, acked_at),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS entitlements (
  account_id TEXT NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('spl_hosted','spb_hosted','spp_hosted')),
  status TEXT NOT NULL CHECK (status IN ('active','past_due','canceled','lapsed')),
  -- current_period_end: Stripe Unix SECONDS, stored verbatim. Never milliseconds.
  -- The spl relay lode compares its grant window against this value in seconds.
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

-- spl_bindings: SPL relay instance bindings, read and written by db.js.
-- instance_id is globally unique across accounts; sandbox_run_id is NULL for
-- owner-created (baseline) rows.
CREATE TABLE IF NOT EXISTS spl_bindings (
  account_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  sandbox_run_id TEXT,
  PRIMARY KEY (account_id, instance_id),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_spl_bindings_account_id ON spl_bindings(account_id);

CREATE INDEX IF NOT EXISTS idx_spl_bindings_sandbox_run_id
  ON spl_bindings(sandbox_run_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_spl_bindings_instance_id
  ON spl_bindings(instance_id);

-- spb_bindings: SPB hosted-access bindings and sandbox lifecycle state.
CREATE TABLE IF NOT EXISTS spb_bindings (
  account_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  token_hash TEXT,
  lapsed_at INTEGER,
  sandbox_run_id TEXT,
  sandbox_credential_expires_at INTEGER,
  sandbox_denied_at INTEGER,
  PRIMARY KEY (account_id, instance_id),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_spb_bindings_account_id ON spb_bindings(account_id);

CREATE INDEX IF NOT EXISTS idx_spb_bindings_sandbox_run_id
  ON spb_bindings(sandbox_run_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_spb_bindings_instance_id
  ON spb_bindings(instance_id);

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
  sandbox_run_id TEXT,
  PRIMARY KEY (account_id, instance_id),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_spp_bindings_account_id ON spp_bindings(account_id);

CREATE INDEX IF NOT EXISTS idx_spp_bindings_sandbox_run_id
  ON spp_bindings(sandbox_run_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_spp_bindings_instance_id
  ON spp_bindings(instance_id);

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

CREATE TABLE IF NOT EXISTS spb_sandbox_audit (
  event TEXT NOT NULL CHECK (event IN ('mint','denial','cleanup')),
  outcome TEXT NOT NULL,
  scope TEXT CHECK (scope IS NULL OR scope IN ('backup','operated')),
  ttl INTEGER CHECK (ttl IS NULL OR ttl >= 0),
  credentials_minted INTEGER CHECK (credentials_minted IS NULL OR credentials_minted >= 0),
  objects_deleted INTEGER CHECK (objects_deleted IS NULL OR objects_deleted >= 0),
  multipart_aborted INTEGER CHECK (multipart_aborted IS NULL OR multipart_aborted >= 0),
  ts INTEGER NOT NULL,
  CHECK (
    (event = 'mint' AND outcome IN ('minted','refused_entitlement','refused_scope','mint_cas_lost','internal_error'))
    OR (event = 'denial' AND outcome IN ('released','absent','ownership_conflict','internal_error'))
    OR (event = 'cleanup' AND outcome IN ('cleaned','retryable','denial_required','absent','ownership_conflict'))
  )
);

CREATE TABLE IF NOT EXISTS sandbox_runs (
  run_id TEXT NOT NULL PRIMARY KEY,
  account_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  contract_version INTEGER NOT NULL CHECK (contract_version = 1),
  profile TEXT NOT NULL CHECK (profile = 'full'),
  status TEXT NOT NULL CHECK (
    status IN (
      'provisioning','active','cleanup_required','cleaning',
      'expiry_pending','cleanup_failed','released'
    )
  ),
  provisioning_phase TEXT NOT NULL CHECK (
    provisioning_phase IN (
      'created','dispatch_intent','dispatch_acquired','spl_intent',
      'spl_acquired','spb_intent','spb_acquired','spp_intent',
      'spp_acquired','active'
    )
  ),
  cleanup_phase TEXT CHECK (
    cleanup_phase IS NULL OR cleanup_phase IN (
      'deny_intent','denied','relay_intent','relay_retired',
      'spb_expiry','spb_purge','verify','released'
    )
  ),
  created_at INTEGER NOT NULL,
  lease_expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  spb_retry_not_before INTEGER,
  completed_at INTEGER,
  last_residual_code TEXT CHECK (
    last_residual_code IS NULL OR last_residual_code IN (
      'lease_expired','account_missing',
      'dispatch_issue_failed','dispatch_release_failed','dispatch_ownership_conflict',
      'spp_issue_failed','spp_release_failed','spp_ownership_conflict',
      'spb_issue_failed','spb_denial_failed','spb_denial_required',
      'spb_credential_expiry_pending','spb_cleanup_retryable',
      'spb_lifecycle_absent','spb_ownership_conflict',
      'spl_grant_failed','relay_retired_state','relay_instance_do_cleanup',
      'relay_rk_do_cleanup','relay_device_revocation','relay_entitlement_clear',
      'relay_pending_grant_clear','relay_rk_registry_clear','relay_verification',
      'relay_failed','spl_issue_failed','spl_release_failed',
      'spl_ownership_conflict','lease_expired_before_activation',
      'activation_cas_lost'
    )
  ),
  dispatch_state TEXT NOT NULL CHECK (
    dispatch_state IN (
      'active','deny_pending','purge_pending','verify_pending',
      'released','cleanup_failed'
    )
  ),
  dispatch_residual_code TEXT CHECK (
    dispatch_residual_code IS NULL OR dispatch_residual_code IN (
      'lease_expired','account_missing','dispatch_issue_failed',
      'dispatch_release_failed','dispatch_ownership_conflict'
    )
  ),
  dispatch_updated_at INTEGER NOT NULL,
  spp_state TEXT NOT NULL CHECK (
    spp_state IN (
      'active','deny_pending','purge_pending','verify_pending',
      'released','cleanup_failed'
    )
  ),
  spp_residual_code TEXT CHECK (
    spp_residual_code IS NULL OR spp_residual_code IN (
      'lease_expired','account_missing','spp_issue_failed',
      'spp_release_failed','spp_ownership_conflict'
    )
  ),
  spp_updated_at INTEGER NOT NULL,
  spb_state TEXT NOT NULL CHECK (
    spb_state IN (
      'active','deny_pending','purge_pending','verify_pending',
      'released','cleanup_failed'
    )
  ),
  spb_residual_code TEXT CHECK (
    spb_residual_code IS NULL OR spb_residual_code IN (
      'lease_expired','account_missing','spb_issue_failed',
      'spb_denial_failed','spb_denial_required',
      'spb_credential_expiry_pending','spb_cleanup_retryable',
      'spb_lifecycle_absent','spb_ownership_conflict'
    )
  ),
  spb_updated_at INTEGER NOT NULL,
  spl_relay_state TEXT NOT NULL CHECK (
    spl_relay_state IN (
      'active','deny_pending','purge_pending','verify_pending',
      'released','cleanup_failed'
    )
  ),
  spl_relay_residual_code TEXT CHECK (
    spl_relay_residual_code IS NULL OR spl_relay_residual_code IN (
      'lease_expired','account_missing','spl_grant_failed',
      'relay_retired_state','relay_instance_do_cleanup','relay_rk_do_cleanup',
      'relay_device_revocation','relay_entitlement_clear',
      'relay_pending_grant_clear','relay_rk_registry_clear',
      'relay_verification','relay_failed'
    )
  ),
  spl_relay_updated_at INTEGER NOT NULL,
  spl_binding_state TEXT NOT NULL CHECK (
    spl_binding_state IN (
      'active','deny_pending','purge_pending','verify_pending',
      'released','cleanup_failed'
    )
  ),
  spl_binding_residual_code TEXT CHECK (
    spl_binding_residual_code IS NULL OR spl_binding_residual_code IN (
      'lease_expired','account_missing','spl_issue_failed',
      'spl_release_failed','spl_ownership_conflict'
    )
  ),
  spl_binding_updated_at INTEGER NOT NULL,
  CHECK (lease_expires_at = created_at + 3600000),
  CHECK (
    (status = 'released' AND cleanup_phase = 'released' AND completed_at IS NOT NULL)
    OR (
      status != 'released'
      AND cleanup_phase IS NOT 'released'
      AND completed_at IS NULL
    )
  ),
  CHECK (
    (dispatch_state = 'cleanup_failed' AND dispatch_residual_code IS NOT NULL)
    OR (dispatch_state != 'cleanup_failed' AND dispatch_residual_code IS NULL)
  ),
  CHECK (
    (spp_state = 'cleanup_failed' AND spp_residual_code IS NOT NULL)
    OR (spp_state != 'cleanup_failed' AND spp_residual_code IS NULL)
  ),
  CHECK (
    (
      spb_state = 'purge_pending'
      AND (
        spb_residual_code IS NULL
        OR spb_residual_code = 'spb_credential_expiry_pending'
      )
    )
    OR (
      spb_state = 'cleanup_failed'
      AND spb_residual_code IS NOT NULL
      AND spb_residual_code != 'spb_credential_expiry_pending'
    )
    OR (
      spb_state NOT IN ('purge_pending','cleanup_failed')
      AND spb_residual_code IS NULL
    )
  ),
  CHECK (
    (spl_relay_state = 'cleanup_failed' AND spl_relay_residual_code IS NOT NULL)
    OR (
      spl_relay_state != 'cleanup_failed'
      AND spl_relay_residual_code IS NULL
    )
  ),
  CHECK (
    (spl_binding_state = 'cleanup_failed' AND spl_binding_residual_code IS NOT NULL)
    OR (
      spl_binding_state != 'cleanup_failed'
      AND spl_binding_residual_code IS NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_sandbox_runs_account_id
  ON sandbox_runs(account_id);

CREATE INDEX IF NOT EXISTS idx_sandbox_runs_reconcile
  ON sandbox_runs(status, lease_expires_at, created_at, run_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sandbox_runs_one_nonterminal_account
  ON sandbox_runs(account_id)
  WHERE status IN (
    'provisioning','active','cleanup_required','cleaning',
    'expiry_pending','cleanup_failed'
  );
