-- migration 0011_scout_applications
-- Per-account scout application lifecycle for operator admin.

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
