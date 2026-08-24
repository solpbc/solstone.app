-- migration 0026_spp_bindings_token_hash_index
-- Index the token_hash lookup key on spp_bindings and spb_bindings.
--
-- Why: findSppBindingByTokenHash() and findSpbBindingByTokenHash() both filter on
-- token_hash, but the only indexes on either table were the
-- (account_id, instance_id) primary key and an account_id index. Neither covers
-- token_hash, so every SPP authorization and every SPB token lookup ran a full
-- table scan. Confirmed against production with D1's own planner:
--   EXPLAIN QUERY PLAN ... spp_bindings  -> "SCAN spp_bindings"   (140 rows)
--   EXPLAIN QUERY PLAN ... spb_bindings  -> "SCAN spb_bindings"   (145 rows)
-- Control, same query shape on an already-indexed table:
--   EXPLAIN QUERY PLAN ... account_dispatch_tokens
--     -> "SEARCH account_dispatch_tokens USING INDEX ... (token_hash=?)"
-- so the two SCANs are real and not an artifact of how the plan was requested.
-- The scans showed up in aggregate too: 176,090 rows_read_24h off 2,903 read
-- queries, ~61 rows per query on a 1.26 MB database. Cost is O(bindings) and
-- grows with every instance ever bound — on POST /internal/spp/authorize, which
-- is a fail-closed security gate on the confidential-processing lane.
--
-- UNIQUE is safe and is the real constraint: token_hash holds a peppered SHA-256
-- of a portal-issued token, both finders take .first() and so already assume at
-- most one match, and production had zero duplicate token_hash groups in either
-- table when this was written. Both indexes are partial on token_hash IS NOT NULL
-- so unbound rows stay exempt and can coexist freely; both queries spell that
-- predicate out, which is what lets SQLite pick a partial index.
--
-- This migration is index-only. It reads no rows, writes no rows, and changes no
-- table definition.
--
-- Partial-apply recovery runbook:
-- 1. Both statements are CREATE UNIQUE INDEX IF NOT EXISTS and are idempotent —
--    rerunning this file is safe whether one, both, or neither index exists.
-- 2. If either fails with "UNIQUE constraint failed", two bindings share a
--    token_hash. That is a real data fault, not a migration fault. Find them:
--      SELECT token_hash, COUNT(*) FROM spp_bindings WHERE token_hash IS NOT NULL
--      GROUP BY token_hash HAVING COUNT(*) > 1;
--    (and the same for spb_bindings), resolve the duplicates, then rerun.
--    Do NOT downgrade the index to non-unique to get past it — .first() would
--    then silently pick one of the colliding bindings.

CREATE UNIQUE INDEX IF NOT EXISTS idx_spp_bindings_token_hash
  ON spp_bindings(token_hash)
  WHERE token_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_spb_bindings_token_hash
  ON spb_bindings(token_hash)
  WHERE token_hash IS NOT NULL;
