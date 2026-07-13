-- migration 0024_scout_lifecycle_events
-- Append-only Scout lifecycle events for owner and operator transitions.

CREATE TABLE IF NOT EXISTS scout_lifecycle_events (
  correlation_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('apply','preapprove','approve','revoke')),
  from_status TEXT NOT NULL CHECK (from_status IN ('absent','pending','approved','revoked')),
  to_status TEXT NOT NULL CHECK (to_status IN ('pending','approved','revoked')),
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('owner','operator','service')),
  actor_principal TEXT NOT NULL,
  reason_code TEXT NOT NULL CHECK (reason_code IN ('owner_application','invitation','operator_correction','application_approved','eligibility_restored','owner_request','eligibility_ended','security_response')),
  occurred_at INTEGER NOT NULL,
  UNIQUE(account_id, sequence)
);
