# Sandbox-Run Ownership Design

Review-gate design, approved for implementation. Jer selected D2 option 1: an
owner-path ownership conflict fails through the existing generic 500 boundary.

Inputs:

- Relay retirement source of truth: `~/projects/spl/relay/src/retire.ts:1-364`,
  `src/index.ts:38-62`, `src/logging.ts:64-72`, and `README.md:105-151`.
- Current binding writes: `account/src/db.js:1293-1365`; owner callers:
  `account/src/enable.js:489-494` and `account/src/enable.js:743-751`.
- Current dispatch-token path: `account/src/dispatch-tokens.js:1-20` and
  `account/src/db.js:439-453`.
- Canonical UUID precedent: `account/src/admin.js:34`.
- Migration/runbook precedents: `account/migrations/0023_spp_consent.sql:1-12`
  and `account/test/migration-0023-spp-consent.test.js:54-82`.
- Atomic D1 result precedent: `account/src/db.js:901-954` and
  `account/src/db.js:1132-1138`.

## Goals

- Make one live SPL or SPP `instance_id` belong to exactly one account and one
  ownership class: baseline (`sandbox_run_id IS NULL`) or one sandbox run.
- Give concurrent claimants an atomic winner/loser signal without exceptions,
  incumbent mutation, or a multi-statement claim transaction.
- Tag dispatch tokens, SPL bindings, and SPP bindings with a sandbox run so one
  validated internal helper layer can claim and release them.
- Keep local SPL/SPP release targeted, D1-only, and independent of relay
  retirement sequencing.
- Fail closed on ownership conflict, malformed identifiers, redirects, and any
  relay response outside the shipped wire contract.

## Non-Goals

- Do not change `spb_bindings`; SPB is outside this lode.
- Do not add a public route or change an owner-facing response shape.
- Do not introduce a sandbox-run registry, historical ownership ledger, or
  compatibility entry points.
- Do not use bare `ON CONFLICT DO UPDATE`, and do not use `db.batch` for the
  one-row acquisition rule.

## Decided Design

### D1: Atomic Claim Rule

Decision: keep one guarded upsert per binding table. The conflict target is the
new global `instance_id` unique index, and `RETURNING` is the only winner signal.

SPL uses this literal SQL:

```sql
INSERT INTO spl_bindings (
  account_id, instance_id, sandbox_run_id, created_at, last_seen_at
) VALUES (?, ?, ?, ?, ?)
ON CONFLICT(instance_id) DO UPDATE SET
  last_seen_at = excluded.last_seen_at
WHERE account_id = excluded.account_id
  AND sandbox_run_id IS excluded.sandbox_run_id
RETURNING account_id, instance_id, sandbox_run_id, created_at, last_seen_at
```

SPP uses this literal SQL:

```sql
INSERT INTO spp_bindings (
  account_id, instance_id, token_hash, created_at, last_seen_at,
  consent_acked_at, consent_disclosure_version, sandbox_run_id
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(instance_id) DO UPDATE SET
  token_hash = excluded.token_hash,
  last_seen_at = excluded.last_seen_at,
  consent_acked_at = excluded.consent_acked_at,
  consent_disclosure_version = excluded.consent_disclosure_version
WHERE account_id = excluded.account_id
  AND sandbox_run_id IS excluded.sandbox_run_id
RETURNING account_id, instance_id, sandbox_run_id, created_at, last_seen_at
```

SPP deliberately preserves its existing same-owner credential rotation and
consent-refresh behavior from `account/src/db.js:1345-1352`; it never changes
`created_at` or `sandbox_run_id`. The prep probe's reduced table had only
`last_seen_at` as mutable payload. In both production statements, a failed guard
writes no column at all, including SPP credential and consent columns.

The guard covers every ownership case:

- Same account, same instance, both run IDs null: `IS` is null-safe, so the
  baseline retry wins.
- Same account, same instance, identical non-null run ID: the sandbox retry
  wins.
- Baseline versus sandbox, or two different sandbox run IDs: the run-ID guard
  fails and the incumbent is untouched.
- Different accounts with the same instance ID: the account guard fails and
  the incumbent is untouched.

Each DB helper executes the statement with `.all()`. Exactly one returned row
means the caller won (new insert or same-owner retry); zero returned rows means
`ownership_conflict`. A D1 exception is an operational failure, never a loser
signal. This is sufficient for the one-row rule. A `db.batch` adds no safety,
and bare `ON CONFLICT DO UPDATE` is forbidden because prep proved it can update
a different account's incumbent.

### D2: Signatures And Owner-Path Gate

Decision: retain one function per table and extend its object argument
additively:

- `upsertSplBinding(db, { accountId, instanceId, nowMs, sandboxRunId = null })`
- `upsertSppBinding(db, { accountId, instanceId, tokenHash, nowMs,
  consentAckedAt, consentDisclosureVersion, sandboxRunId = null })`

Both return the returned ownership row or `null`. Existing callers that omit
`sandboxRunId` remain baseline owners. The sandbox layer maps a row to
`{ outcome: 'claimed' }` and null to `{ outcome: 'ownership_conflict' }`.
Separate baseline and sandbox SQL entry points would duplicate the load-bearing
guard and invite drift.

The gate resolved and implementation shipped the owner-path behavior. Before
0025, cross-account duplicate `instance_id` writes silently succeeded because
the composite primary key permitted them. The guarded upsert converts that case
into a zero-row no-op. The owner callers now check that result and return the
pre-existing generic 500 on conflict at `account/src/enable.js:494` and
`account/src/enable.js:751`; they never return an owner success handoff while
storing nothing. That enforces the repository rule to fail fast and never report
success on a degraded result.

Options:

1. Have each owner call site check for null and return its existing SPL/SPP
   generic 500 response. The router branches at `account/src/index.js:431` and
   `account/src/index.js:487` return these async handler promises without
   awaiting them, so a thrown error would escape the catch at
   `account/src/index.js:952-955` instead of reaching the portal's generic error
   page. Returning the existing `noStoreHtml(renderError(), { status: 500 })`
   response preserves the generic status, page, and copy without exposing
   account/instance detail.
2. Return a conflict signal that each handler surfaces as a new explicit HTTP
   response. This is clearest to the owner but violates this lode's constraint
   against changing `enable.js` handler responses.
3. Leave the handlers unchanged on the premise that collision is impossible by
   construction. This is false today: the owner boundary accepts the deliberately
   loose `INSTANCE_ID_REGEX` at `account/src/enable-constants.js:11`, and the
   current schema has already allowed cross-account duplicates.

Gate ruling: option 1, implemented at both owner call sites. It is the smallest
in-scope behavior that turns the new loser signal into a failure rather than a
false success. The implementation adds no bespoke owner-facing response; option
2 requires a separately approved scope change. Option 3 is rejected.

### D3: Release Representation And Classification

Decision: hard-delete owned SPL and SPP rows. Do not add a local tombstone.

Rationale:

- Deleting SPP removes `token_hash`, so `findSppBindingByTokenHash` at
  `account/src/db.js:1481-1490` immediately stops authorizing the credential.
- SPL has no local credential to null. The relay retains its own irreversible,
  authoritative tombstone; the account row is ownership/retry coordination.
- One representation for SPL and SPP avoids a SPP-only `released_at` state and
  read-side filtering throughout the authorization and entitlement paths.
- It keeps 0025 to the three ownership columns and requested indexes. No
  `released_at` column is part of 0025.

For SPL and SPP, the DB release helper uses one transactional `db.batch` with:

1. A guarded `DELETE ... WHERE instance_id = ? AND account_id = ? AND
   sandbox_run_id IS ? RETURNING instance_id`.
2. A `SELECT account_id, sandbox_run_id FROM <table> WHERE instance_id = ?`.

The second statement disambiguates the two zero-row delete cases in the same
D1 transaction:

- A returned delete row yields `released`.
- No returned delete row and no selected incumbent yields `absent`.
- No returned delete row and a selected incumbent yields
  `ownership_conflict`, regardless of whether account ID, sandbox run ID, or
  both differ.

The delete and classification batch is required for precise release reporting;
it is separate from, and does not replace, the single-statement acquisition
rule. No read-then-delete race is accepted.

`releaseSandboxSplBinding` and `releaseSandboxSppBinding` are deliberately
identical in representation, vocabulary, and side-effect class. Both perform
only the targeted D1 release batch above. Neither performs network I/O or calls
`retireRelayInstance`. Sequencing relay retirement and local release belongs to
the future durable run controller, not this lode.

An account-level `absent` result means only that no row existed at the atomic
classification point. `absent` alone never proves that the run acquired the
resource; only a prior `claimed` result does. Absence can also mean never
claimed, already released, or cascade-deleted.

Dispatch tokens retain their existing `revoked_at` representation rather than
being deleted. Their release DB batch conditionally revokes active rows for the
exact account/run and selects rows by `sandbox_run_id` to classify a zero-row
update. The update includes a `NOT EXISTS` guard for a differently owned row so
a mixed-owner data anomaly returns `ownership_conflict` without revoking any
token. Same-owner already-revoked rows count as `absent`; at least one newly
revoked row counts as `released`.

### D4: Module Placement And Validation Boundary

Decision: add `account/src/sandbox-ownership.js` as the policy/orchestration
layer over new functions in `account/src/db.js`.

`account/src/sandbox-ownership.js` owns:

- `mintSandboxDispatchToken(env, { sandboxRunId, accountId })`
- `claimSandboxSplBinding`
- `claimSandboxSppBinding`
- `releaseSandboxDispatchTokens`
- `releaseSandboxSplBinding`
- `releaseSandboxSppBinding`
- Result mapping and D1-only release orchestration.

Canonical UUID validation now lives in `account/src/sandbox-identifiers.js`;
see `account/docs/spb-sandbox-lifecycle-design.md` D8.

Every exported sandbox helper validates `sandboxRunId`, `accountId`, and any
`instanceId` before its first D1 query or hash/mint operation. It uses the
exact canonical, case-insensitive UUID shape from
`account/src/admin.js:34`:

`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`

It must not reuse `INSTANCE_ID_REGEX` from
`account/src/enable-constants.js:11`. The relay itself accepts the looser
`^[0-9a-fA-F-]{10,64}$`; the account sandbox boundary is intentionally stricter
so malformed/noncanonical ownership keys never reach D1 or the network.

All SQL remains in `account/src/db.js`, including guarded upserts, ownership
reads, guarded release batches, dispatch-token tagging, and run-based lookups.
`account/src/dispatch-tokens.js` extends `mintDispatchToken` additively with an
optional `sandboxRunId = null` and passes it to `insertDispatchToken`; existing
owner and enable callers remain baseline tokens. `mintSandboxDispatchToken`
returns the minted record directly to its in-process caller, including the
plaintext token and `tokenHash`. The plaintext token is never logged, never
placed in a response body, and never stored; D1 receives only `tokenHash`,
`accountId`, `sandboxRunId`, and timestamps.

`claimSandboxSppBinding` mints and hashes its credential only after boundary
validation. A winning claim returns the plaintext credential to its in-process
caller with `outcome: 'claimed'`; a loser returns only
`outcome: 'ownership_conflict'`. Neither result exposes the hash, and no route
is added.

`retireRelayInstance` belongs in `account/src/relay-grant.js` beside
`pushEntitlementGrant`, because both own the relay URL, bearer secret,
service-binding preference, and public-fetch fallback. It is a separate helper
and contract parser; it cannot reuse `pushEntitlementGrant`'s boolean
`{ ok: true }` response assumption at `account/src/relay-grant.js:105-137`.
No sandbox ownership helper calls it. The future durable run controller must
invoke relay retirement and local release as explicit, separately handled
steps.

No SQL belongs in `sandbox-ownership.js`, and no sandbox policy belongs in
`db.js`.

### D5: Migration 0025

Decision: add `account/migrations/0025_sandbox_run_ownership.sql` with this
exact SQL and runbook header:

```sql
-- migration 0025_sandbox_run_ownership
-- Add sandbox-run ownership tags and globally unique SPL/SPP instance ownership.
-- Existing rows remain baseline-owned because each new column defaults to NULL.
--
-- Preflight duplicate check (must return zero rows before applying this migration):
-- SELECT 'spl_bindings' AS table_name, instance_id,
--        COUNT(*) AS row_count, COUNT(DISTINCT account_id) AS account_count
-- FROM spl_bindings
-- GROUP BY instance_id
-- HAVING COUNT(*) > 1
-- UNION ALL
-- SELECT 'spp_bindings' AS table_name, instance_id,
--        COUNT(*) AS row_count, COUNT(DISTINCT account_id) AS account_count
-- FROM spp_bindings
-- GROUP BY instance_id
-- HAVING COUNT(*) > 1
-- ORDER BY table_name, instance_id;
--
-- Partial-apply recovery runbook:
-- Each ALTER is non-idempotent. If rerunning reports "duplicate column name",
-- inspect PRAGMA table_info(account_dispatch_tokens), PRAGMA table_info(spl_bindings),
-- and PRAGMA table_info(spp_bindings), then run only the ALTER statements for
-- missing columns. The CREATE INDEX IF NOT EXISTS statements are safe to rerun.
-- Before creating either unique index, rerun the duplicate check above. If index
-- creation reports "UNIQUE constraint failed: <table>.instance_id", stop, resolve
-- the duplicate owners out of band, verify the intended survivor, and run only
-- the remaining index statements. Never delete or select a winner automatically.

ALTER TABLE account_dispatch_tokens ADD COLUMN sandbox_run_id TEXT;
ALTER TABLE spl_bindings ADD COLUMN sandbox_run_id TEXT;
ALTER TABLE spp_bindings ADD COLUMN sandbox_run_id TEXT;

CREATE INDEX IF NOT EXISTS idx_account_dispatch_tokens_sandbox_run_id
  ON account_dispatch_tokens(sandbox_run_id);
CREATE INDEX IF NOT EXISTS idx_spl_bindings_sandbox_run_id
  ON spl_bindings(sandbox_run_id);
CREATE INDEX IF NOT EXISTS idx_spp_bindings_sandbox_run_id
  ON spp_bindings(sandbox_run_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_spl_bindings_instance_id
  ON spl_bindings(instance_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_spp_bindings_instance_id
  ON spp_bindings(instance_id);
```

All three `ALTER`s precede every index. Thus an index failure cannot leave only
some tables with the ownership column. Existing rows become baseline-owned
through SQLite's null value for an added nullable column; no backfill runs.
`CREATE UNIQUE INDEX IF NOT EXISTS` still fails loudly when the index is absent
and duplicate data exists. Prep observed the exact error
`UNIQUE constraint failed: <table>.instance_id: SQLITE_CONSTRAINT`, with both
duplicate rows unchanged.

A blind full-file reapply is not supported because the `ALTER`s are
non-idempotent. Recovery is inspection plus the missing statements, exactly as
the header says. Index creation is idempotent once reached. A failure on the SPL
unique index can leave all columns and run indexes present but both unique
indexes absent; a failure on SPP can leave SPL's unique index present. The
runbook covers both states.

Mirror the resulting schema one-for-one into `account/schema.sql`: add
`sandbox_run_id TEXT` to the three existing `CREATE TABLE` definitions and add
the five index statements with the same names, columns, uniqueness, and
`IF NOT EXISTS`. The consolidated schema keeps columns inline rather than
duplicating migration `ALTER`s. Do not alter, index, or otherwise touch
`spb_bindings`.

### D6: Relay Retirement Wire Contract

Decision: validate the relay response as an exact closed union, not a
presence-based or truthy object, and return an explicit result for every
expected operational failure.

Request:

- Validate `instanceId` as a canonical UUID before any network work. A
  noncanonical argument is programmer error and throws.
- Parse `env.RELAY_GRANT_URL`; an invalid or non-HTTPS URL returns `failed`
  before fetch.
- Pin the target to `new URL(env.RELAY_GRANT_URL).origin`, then build exactly
  `/admin/instances/${encodeURIComponent(instanceId)}`. Configuration path,
  query, fragment, userinfo, and any response `Location` cannot influence the
  authenticated target.
- Send `DELETE` with `Authorization: Bearer ${env.RELAY_GRANT_SECRET}` and
  `redirect: 'manual'` through `env.RELAY.fetch` when bound, otherwise global
  `fetch`.
- Treat every 3xx as `failed`. Because redirects are never followed,
  Authorization is never sent to a redirect target.

Validated 200 keys are exactly:

- `state`
- `entry_denial_verified`
- `sockets_closed`
- `devices_revoked`
- `entitlement_cleared`
- `pending_grants_cleared`
- `tombstone_verified`

`state` must be exactly `retired`, `already_retired`, or `absent`. Every other
key must have boolean type, and all six must be `true` for a 200 to be accepted
as complete. Missing keys, extra keys, arrays, null, malformed JSON, false
postconditions, and wrong types fail closed.

A retryable 503 residual has exactly the same six boolean keys, no `state`, and
one `failed_component` key. Each check must have boolean type.
`failed_component` must be exactly one of:

- `retired_state`
- `instance_do_cleanup`
- `rk_do_cleanup`
- `device_revocation`
- `entitlement_clear`
- `pending_grant_clear`
- `rk_registry_clear`
- `verification`

The other recognized relay 503 shape is exactly
`{ "error": "relay not provisioned" }`. The relay returns it before auth at
`retire.ts:36`; it returns `failed`, never `retryable_residual`. The
reachable `400 {"error":"bad instance_id"}` and
`401 {"error":"unauthorized"}` shapes, router-level 404 plain text, every
other status, and any malformed or nonconforming 200 or 503 body also return
`failed`.

`retireRelayInstance` returns only constructed, allow-listed data:

- `{ outcome: 'retired', relayState, checks }` for a valid 200.
- `{ outcome: 'retryable_residual', failedComponent, checks }` for the exact
  residual 503.
- `{ outcome: 'failed' }` for everything else.

`checks` contains only the six named booleans. It never returns the raw body,
headers, URL, instance ID, bearer, or an upstream error string. Network errors,
service-binding exceptions, redirects, the unprovisioned 503, 400, 401, 404,
unexpected statuses, malformed JSON, missing or extra keys, wrong-typed values,
non-enum values, and a 200 with any false check are caught and returned as
`{ outcome: 'failed' }` after status-only, secret-free logging. This is the
redaction boundary.

`retireRelayInstance` does not propagate expected network, binding,
configuration, HTTP, parsing, or validation-of-response failures. Throw is
reserved for programmer error: a noncanonical `instanceId`, rejected by the
argument validator before any network work.

### D7: Result Vocabularies

Decision: use an `outcome` discriminator and these literal strings only.

Claims and dispatch mint:

- `mintSandboxDispatchToken(env, { sandboxRunId, accountId })` returns the
  minted record directly, with no `outcome` discriminator.
- `claimSandboxSplBinding`: `claimed | ownership_conflict`.
- `claimSandboxSppBinding`: `claimed | ownership_conflict`.

The dispatch mint deliberately has no outcome union. It inserts a freshly
generated random `token_hash`, the table's primary key, while
`sandbox_run_id` has only a non-unique lookup index. There is no ownership
decision or reachable conflict branch to communicate, so adding `claimed` or
`ownership_conflict` would be dead vocabulary. It throws only for programmer
error: a noncanonical `sandboxRunId` or `accountId`, rejected before D1 or
hashing work.

For SPL and SPP, `claimed` covers both a new insert and an exact same-owner
retry; callers do not need to distinguish those successful cases. Their claim
results do not expose token hashes. `ownership_conflict` remains genuinely
reachable through the global `instance_id` unique index and guarded upsert.

Releases:

- `releaseSandboxDispatchTokens`: `released | absent | ownership_conflict`.
- `releaseSandboxSppBinding`: `released | absent | ownership_conflict`.
- `releaseSandboxSplBinding`: `released | absent | ownership_conflict`.

`released` means this call changed at least one owned local capability record:
one SPL/SPP row deleted or at least one dispatch token newly revoked. `absent`
and `ownership_conflict` have the exact definitions in D3. These three strings
have identical spelling and meaning across dispatch, SPL, and SPP; local
release helpers have no relay-derived outcomes.

Relay retirement:

- `retired | retryable_residual | failed` as defined in D6.

Use no aliases such as `acquired`, `success`, `missing`, `conflict`,
`already_released`, `partial`, or `residual`. Shared outcomes keep identical
spelling and meaning across the three local resource helpers; the relay uses
its separate three-value outcome namespace.
Relay-side `relayState: 'absent'` is a nested wire-state value in the
`outcome: 'retired'` result; local `outcome: 'absent'` is a D1 release result.
Keeping one under `relayState` and the other under `outcome` prevents the two
namespaces from being confused.

### D8: Test Plan

#### Migration And Consolidated Schema

Add `account/test/migration-0025-sandbox-run-ownership.test.js`, following the
raw-SQL harness at `account/test/migration-0023-spp-consent.test.js:74-81` and
`account/test/migration-0024-scout-lifecycle-events.test.js:132-139`.

Assertions:

- All three nullable columns are added and legacy rows are preserved with null
  ownership.
- All three run-lookup indexes and both global instance indexes have the exact
  names and indexed columns from D5; no SPB column or index changes.
- New SPL/SPP cross-account duplicate instance inserts fail.
- Applying each unique index to seeded duplicate rows fails with
  `UNIQUE constraint failed: <table>.instance_id: SQLITE_CONSTRAINT`, preserves
  both rows, and does not silently choose an owner.
- Partial states match the runbook: duplicate-column reapply is loud, existing
  indexes can rerun, and a missing post-failure index can be applied after the
  duplicate is resolved.
- `resetDb` applying `account/schema.sql` produces the same final columns and
  indexes as migration 0025.

#### Guarded Claims And Races

Add `account/test/sandbox-ownership-db.test.js` for the real DB helpers and both
binding tables.

Assertions:

- Empty-table claims return one row.
- Baseline and same-run retries return one row, preserve `created_at` and
  `sandbox_run_id`, and update the intended mutable fields only. SPP continues
  to rotate its same-owner token/consent payload.
- Baseline/run, run/run, and cross-account conflicts return zero rows, do not
  throw, and leave every incumbent column byte-identical.
- `Promise.all` races produce exactly one returned winner, one empty loser, and
  one owner row for baseline/run and cross-account races.
- The caller maps one row only to `claimed` and zero rows only to
  `ownership_conflict`.

#### Sandbox Boundary And Release

Add `account/test/sandbox-ownership.test.js`.

Assertions:

- Every claim/release helper rejects noncanonical run, account, and instance
  IDs before D1 or hashing/minting; uppercase canonical UUIDs are accepted
  because the precedent regex is case-insensitive.
- Dispatch mint returns the plaintext token and hash directly to the in-process
  caller without an outcome discriminator; insertion stores the hash and run
  ID, while baseline `mintDispatchToken` stores a null run ID.
- The dispatch plaintext token never appears in D1, logs, or an HTTP response;
  only its hash is stored. Noncanonical run/account IDs throw before hashing or
  D1 work.
- Dispatch release revokes only exact-owner active tokens and produces the D7
  release outcomes, including mixed-owner conflict without mutation.
- SPL/SPP release batches distinguish absent from conflict and never delete an
  incumbent owned by another account, baseline, or another run.
- SPP `released` removes the row and immediately makes its credential lookup
  fail.
- SPL and SPP release perform no fetch for any outcome and have identical
  returned vocabularies.
- Local absence without a prior claim remains `absent` and is never evidence of
  acquisition.
- Concurrent duplicate releases remain idempotent and cannot delete a new or
  differently owned incumbent.

#### Relay Contract

Extend `account/test/relay-grant.test.js` and the additive relay recorder in
`account/test/helpers.js:260-285`.

Assertions:

- Both service-binding and global-fetch paths send the exact DELETE URL,
  bearer header, and `redirect: 'manual'`.
- A 3xx is returned to the helper, never followed; its target receives no
  Authorization.
- Each allowed 200 state and each allowed residual component is accepted.
- Exact-key equality rejects missing/extra keys, wrong types, false 200 checks,
  `state` on residuals, and `failed_component` on success.
- The unprovisioned `{error}` 503, 400, 401, 404 text, unexpected status,
  malformed JSON, key-set/type/enum failures, false 200 checks, and fetch or
  service-binding exceptions resolve to `{ outcome: 'failed' }` and never
  become `retryable_residual` or reject.
- Returned residuals and console output contain no relay secret, raw body,
  redirect location, or instance ID, using `assertNoSecrets` at
  `account/test/helpers.js:301-315`.
- A configured URL with a path/query still targets the pinned origin plus the
  exact retirement path; invalid and non-HTTPS URLs return `failed` before
  fetch.
- A noncanonical instance argument throws as programmer error before either
  fetch implementation is invoked.

#### Existing Consumers And Fixtures

Update existing tests narrowly:

- `account/test/spp-bindings-db.test.js` keeps the existing same-owner SPP token
  rotation assertion and adds returned-row/null ownership assertions.
- `account/test/dispatch-token.test.js` proves existing calls remain
  baseline-owned and resolve unchanged. Sandbox-mint coverage proves the direct
  minted-record shape, hash-only persistence, and absence of plaintext token
  material from logs and response bodies.
- `account/test/enable-spl.test.js` and
  `account/test/enable-spp.test.js` prove a seeded cross-account instance causes
  the existing generic failure response and never emits a success handoff or
  rotates the incumbent credential.
- Extend `seedSplBinding` at `account/test/helpers.js:655-670` only by adding
  `sandboxRunId = null`, inserting it, and returning it. Keep its existing
  arguments and default instance ID. Add any new SPP/dispatch seed helpers
  without changing existing call shapes. Do not modify `seedSpbBinding` for an
  ownership column because SPB is out of scope.
- The identical default UUIDs in `seedSplBinding` and `seedSpbBinding` are not a
  cross-table constraint conflict: uniqueness is table-local and SPB is
  untouched. The actual risk is two SPL rows for different accounts in one
  test. Every such test must pass distinct explicit instance IDs.
- Replace the implicit `seedSplBinding` defaults at
  `account/test/scouts-admin.test.js:224` and
  `account/test/scouts-admin.test.js:326` with named, explicit canonical UUIDs.
  Their companion `seedSpbBinding` rows may keep the same value because the
  tables are independent. This removes hidden fixture dependence without a
  breaking helper-signature change.

## Implementation Sequence

1. Apply the approved D2 option 1 owner-conflict behavior.
2. Add migration 0025 and mirror its final state into `schema.sql`; add the
   migration test before callers depend on the columns/indexes.
3. Update the DB signatures and guarded SQL, then add claim/race and release
   classification tests.
4. Extend dispatch-token minting with nullable run tagging while preserving all
   baseline callers.
5. Add and test standalone `retireRelayInstance` as the strict, total-result
   relay wire boundary.
6. Add `sandbox-ownership.js` validation, result mapping, and D1-only release
   helpers.
7. Apply Jer's owner-path decision and update only the affected owner tests and
   additive fixtures.
8. Run the narrow relevant checks through `hop check`, then the explicitly
   requested account gate, during implementation—not during this design stage.

## Risks And Review Notes

- Production may already contain cross-account duplicates. The repository
  cannot establish production contents; the D5 preflight is an operator gate.
  Migration failure is intentionally loud and never chooses a survivor.
- A relay contract change, redirect, bad deployment secret, or unprovisioned
  binding returns `failed`. The future controller must handle that result
  explicitly; this lode neither mutates nor infers local ownership from it.
- Hard deletion keeps no local ownership history. That is intentional for this
  lode; relay retirement is the SPL tombstone, and no audit/history requirement
  was approved for SPP. A later audit requirement must be designed explicitly,
  not inferred from nullable credentials.
- Dispatch mint intentionally has no outcome vocabulary: its fresh random
  primary key cannot contend, and the non-unique run index creates no alternate
  result. Future work must not add a symmetry-only conflict branch.
- Relay retirement and local SPL release are intentionally separate operations.
  Their durable ordering, retries, and composition remain follow-up controller
  work and must not leak back into these helpers.
- D2 option 1 is closed at the gate. A separately scoped owner-visible conflict
  response remains possible future work, but this lode uses the existing generic
  500 boundary and never preserves silent success.
