-- migration 0024_scout_lifecycle_events
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
