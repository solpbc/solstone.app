-- Migration 0005: passkeys (WebAuthn) return-access auth path
--
-- Adds the storage substrate for passkey credentials + single-use challenges.
-- No public surface in this migration — endpoints land in Hop 2.
-- See cpo/specs/in-flight/solstone-passkey-auth.md.
--
-- Notes:
--   * passkey_user_handle is 32 random bytes per scout (base64url), populated
--     lazily on first enrollment. Never derived from PII.
--   * RP ID is solstone.app (apex). Same passkey works across *.solstone.app.
--   * Counter is recorded on every auth but never used as a rejection criterion
--     (synced passkeys stay at 0 by design).
--   * Challenges live in D1, not KV — strong consistency makes single-use
--     enforcement race-free.
--   * Spec called this 0004; that slot was taken by today's rollback-drop
--     migration. Bumped to 0005 (no behavioral change).

ALTER TABLE scouts ADD COLUMN passkey_user_handle TEXT UNIQUE;

CREATE TABLE IF NOT EXISTS passkey_credentials (
  credential_id     TEXT PRIMARY KEY,                 -- base64url, <=1023 bytes raw
  scout_id          TEXT NOT NULL REFERENCES scouts(id) ON DELETE CASCADE,
  public_key        TEXT NOT NULL,                    -- base64url of COSE-CBOR (what SimpleWebAuthn verify expects)
  counter           INTEGER NOT NULL DEFAULT 0,       -- recorded, never enforced
  aaguid            TEXT,                             -- telemetry only, never used for authz
  transports        TEXT,                             -- JSON array: ["internal","hybrid","usb",...]
  is_discoverable   INTEGER NOT NULL DEFAULT 1,
  backup_eligible   INTEGER NOT NULL DEFAULT 0,
  backup_state      INTEGER NOT NULL DEFAULT 0,
  friendly_name     TEXT,
  created_at        INTEGER NOT NULL,
  last_used_at      INTEGER,
  revoked_at        INTEGER                           -- soft-delete; lookups filter by NULL
);

CREATE INDEX IF NOT EXISTS idx_passkey_credentials_scout
  ON passkey_credentials(scout_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS passkey_challenges (
  challenge      TEXT PRIMARY KEY,                    -- base64url of 32 random bytes
  scout_id       TEXT REFERENCES scouts(id) ON DELETE CASCADE,  -- NULL for auth (discoverable)
  purpose        TEXT NOT NULL CHECK (purpose IN ('register','authenticate')),
  expires_at     INTEGER NOT NULL,                    -- now + 5 min (unix ms)
  used_at        INTEGER,                             -- single-use enforcement
  created_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_passkey_challenges_expires
  ON passkey_challenges(expires_at);
