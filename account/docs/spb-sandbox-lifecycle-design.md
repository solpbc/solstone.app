# SPB Sandbox Lifecycle Design

Gate-approved design, ready for implementation. This design extends
`account/docs/sandbox-ownership-design.md`; migration 0025's ownership
rationale, canonical result meanings, and release caveat remain authoritative
unless this document explicitly amends them.

Inputs:

- Research evidence and empirical Workers-pool CAS transcript:
  `account/docs/spb-sandbox-lifecycle-prep.md:40-774`.
- Existing sandbox ownership contract:
  `account/docs/sandbox-ownership-design.md:42-458`.
- Current SPB D1 surface: `account/src/db.js:1315-1479`; owner enablement:
  `account/src/enable.js:570-630`; broker:
  `account/src/spb-broker.js:12-93`.
- Current R2 signer and request layer:
  `account/src/r2-credential.js:10-70` and `account/src/s3.js:10-140`.
- Current customer lapse sweep:
  `account/src/spb-sweep.js:16-149`; stateful S3 test precedent:
  `account/test/spb-sweep.test.js:350-505`.
- Migration and recovery precedent:
  `account/migrations/0025_sandbox_run_ownership.sql:1-43`;
  migration-harness evidence:
  `account/docs/spb-sandbox-lifecycle-prep.md:249-305`.
- Audit tradeoff evidence:
  `account/docs/spb-sandbox-lifecycle-prep.md:675-772`.

## Goals

- Give each SPB `instance_id` one global owner: one account and either baseline
  ownership (`sandbox_run_id IS NULL`) or one sandbox run.
- Make claim, denial, mint-expiry publication, and final tombstone deletion
  atomic winner/loser operations with explicit result vocabularies.
- Make denial irreversible while its tombstone exists, immediately reject its
  broker token, and preserve the maximum expiry of every externally returned
  sandbox credential.
- Keep sandbox credentials at a fixed 90-second TTL without changing any
  customer TTL or exposing a general TTL override.
- Purge a denied sandbox prefix only after outstanding external credentials
  expire, reach a joint object/multipart fixed point, and pass a fresh,
  independent empty readback.
- Preserve retryability after partial R2 failure without persisting or emitting
  credentials, tokens, hashes, identifiers, prefixes, keys, email, or content.
- Keep the baseline owner enablement, broker, entitlement, and lapse-sweep
  behavior unchanged except for failing closed when a baseline SPB claim loses
  to an existing global owner.

## Non-Goals

- Do not restate or replace migration 0025's ownership model, relay contract, or
  SPL/SPP lifecycle. Those remain defined by
  `account/docs/sandbox-ownership-design.md`.
- Do not add a public route, sandbox-run registry, historical ownership ledger,
  or compatibility entry point.
- Do not revoke an R2 credential after it has left the Worker; cleanup waits for
  the durably recorded expiry instead.
- Do not make customer SPB credentials short-lived, alter customer entitlement
  semantics, or change customer lapse-sweep outcomes.
- Do not make R2 deletion transactional. Successful deletes and aborts are
  irreversible and are not rolled back after a later failure.
- Do not place SQL or sandbox policy in R2 modules. All D1 statements remain in
  `account/src/db.js`; orchestration policy remains outside it.

## Decided Design

### D1: Migration 0026 And Consolidated Schema

Decision: add `account/migrations/0026_spb_sandbox_lifecycle.sql`, following
0025's additive header and partial-apply shape by reference rather than
repeating its rationale. Migration 0026 has not shipped, so
`spb_sandbox_audit` is part of 0026 itself; no follow-up migration is added.

The three new binding columns are:

- `sandbox_run_id TEXT`: canonical sandbox-run UUID, or null for a baseline
  row.
- `sandbox_credential_expires_at INTEGER`: Unix epoch milliseconds for the
  maximum expiry of any externally returned sandbox R2 credential.
- `sandbox_denied_at INTEGER`: Unix epoch milliseconds when the run-owned
  binding was denied.

All SPB D1 timestamps are milliseconds. Existing `created_at`, `last_seen_at`,
and `lapsed_at` are populated with `Date.now()`/`nowMs` on the paths traced in
`account/docs/spb-sandbox-lifecycle-prep.md:65-103`. The R2 signer remains
seconds-based: `nowSeconds + ttl` at `account/src/spb-broker.js:69`. The broker
owns the unit boundary and computes
`proposedExpiryMs = (credential.nowSeconds + credential.ttl) * 1000` before the
D4 CAS and response serialization.

Before applying 0026, an operator must run this literal preflight and receive
zero rows:

```sql
SELECT instance_id,
       COUNT(*) AS row_count,
       COUNT(DISTINCT account_id) AS account_count
FROM spb_bindings
GROUP BY instance_id
HAVING COUNT(*) > 1
ORDER BY instance_id;
```

The migration body is exactly:

```sql
ALTER TABLE spb_bindings ADD COLUMN sandbox_run_id TEXT;
ALTER TABLE spb_bindings ADD COLUMN sandbox_credential_expires_at INTEGER;
ALTER TABLE spb_bindings ADD COLUMN sandbox_denied_at INTEGER;

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

CREATE INDEX IF NOT EXISTS idx_spb_bindings_sandbox_run_id
  ON spb_bindings(sandbox_run_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_spb_bindings_instance_id
  ON spb_bindings(instance_id);
```

All three non-idempotent `ALTER`s precede the idempotent table and indexes.
This keeps column inspection contiguous and ensures no index can be created
against a partially extended row shape. The audit table precedes both indexes
so every suffix after the `ALTER`s is idempotent. The non-unique run index
precedes the unique instance index so a duplicate failure leaves an exact,
documented state.

The migration header must name these recovery states:

1. If some `ALTER`s applied, inspect
   `PRAGMA table_info('spb_bindings')`, run only the missing `ALTER`s in the
   original order, and then run the idempotent suffix.
2. If `idx_spb_bindings_sandbox_run_id` exists but the unique instance index
   failed, rerun the duplicate preflight, resolve ownership out of band, verify
   the intended survivor, and run only the missing unique-index statement.
3. If `spb_sandbox_audit` exists but either binding index is absent,
   leave the table in place and run the missing `CREATE INDEX IF NOT EXISTS`
   statements after the duplicate preflight.
4. If the full migration is re-run, the first already-applied `ALTER` fails
   loudly with `duplicate column name`; inspect rather than skipping blindly.

No recovery instruction may delete a row or auto-select a winner.

`account/schema.sql:322-335` receives the same three inline columns, in the
same order after `lapsed_at`; the audit table is added exactly as above; and
the two index statements are added exactly as above. The migration and
consolidated schema must match one-for-one.

The migration result vocabulary is:

- `preflight_clear`: the preflight returns zero rows and application may
  proceed.
- `preflight_duplicate`: one or more rows are returned; stop before migration.
- `applied`: all columns, the audit table, and both indexes have the exact
  intended shapes.
- `partial_apply`: inspect the named states and run only the documented missing
  suffix; never infer an owner.

### D2: Unified Guarded SPB Upsert And Owner Enablement

Decision: replace the composite-key SPB upsert at
`account/src/db.js:1315-1328` with one guarded upsert targeting the global
`instance_id` constraint. There is no second SPB upsert or compatibility
alias.

The helper signature becomes additive:

`upsertSpbBinding(db, { accountId, instanceId, tokenHash, nowMs,
sandboxRunId = null })`.

It returns the row on acquisition/same-owner refresh and `null` on a guarded
conflict, matching the SPL/SPP winner signal at
`account/src/db.js:1293-1365`.

The literal statement is:

```sql
INSERT INTO spb_bindings (
  account_id,
  instance_id,
  created_at,
  last_seen_at,
  token_hash,
  lapsed_at,
  sandbox_run_id,
  sandbox_credential_expires_at,
  sandbox_denied_at
) VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, NULL)
ON CONFLICT(instance_id) DO UPDATE SET
  token_hash = excluded.token_hash,
  last_seen_at = excluded.last_seen_at,
  lapsed_at = NULL
WHERE account_id = excluded.account_id
  AND sandbox_run_id IS excluded.sandbox_run_id
  AND sandbox_denied_at IS NULL
RETURNING account_id,
          instance_id,
          sandbox_run_id,
          created_at,
          last_seen_at,
          token_hash,
          lapsed_at,
          sandbox_credential_expires_at,
          sandbox_denied_at
```

In SQLite's `DO UPDATE ... WHERE`, an unqualified column names the existing
conflicting row; incoming values require `excluded.`. Therefore the final
conjunct tests the incumbent `sandbox_denied_at` and is the load-bearing
tombstone guard.

`lapsed_at = NULL` remains correct. It preserves today's baseline same-owner
refresh behavior. For a run-owned row it also expresses a live same-owner
claim; D9 excludes that row from customer lapse selection regardless.
The upsert deliberately does not modify
`sandbox_credential_expires_at`—rotating a broker token cannot erase an
already-returned credential's maximum expiry—and cannot clear
`sandbox_denied_at`.

The upsert result vocabulary is:

- `row`: insert or same-account/same-run refresh won.
- `null`: a baseline/run/account ownership conflict or a denial tombstone
  blocked the write.
- `exception`: an operational D1 failure, distinct from a zero-row result.

The baseline caller at `account/src/enable.js:598` must inspect the return.
Today it ignores the result and continues through entitlement reconciliation
at `:599` to build and store a successful handoff at `:604-629`; after the
guarded upsert, that would become a false-success response for a losing claim.
On `null`, the SPB handler returns
`spbError(500)` immediately after the upsert and before
`reconcileSpbEntitlement`. This uses the handler's established SPB-specific
error surface at `account/src/enable.js:989-991`, already used by this handler
for 400/403/503, rather than the sibling SPL/SPP generic page. It adds no new
owner-visible copy.

On that early return, no entitlement reconciliation, success payload, broker
token response, or `insertServiceHandoff` may occur. The externally observable
result is the existing no-store SPB error page with HTTP 500.

### D3: Fixed 90-Second Sandbox Credential Entry Points

Decision: do not add a general `ttlSeconds` override to
`mintScopedCredential`. Such an override would let a future money-path caller
choose an arbitrarily long TTL. Add the exported constant
`SPB_SANDBOX_TTL_SECONDS = 90` and two narrow entry points in
`account/src/r2-credential.js`, both backed by the existing single private
signing body:

- `mintSandboxExternalCredential(env, { prefix, scope, nowSeconds })` accepts
  only `backup` and `operated`, selects the existing action list for that
  scope, and always signs for 90 seconds.
- `mintSandboxMaintenanceCredential(env, { prefix, nowSeconds })` accepts no
  caller-selected scope or TTL, uses the existing maintenance action list, and
  always signs for 90 seconds.

The existing `SCOPES` entries and customer TTL constants at
`account/src/r2-credential.js:22-30` remain byte-identical. Baseline broker
mints, including any existing customer maintenance use, continue through
`mintScopedCredential`.

Run-owned external broker mints permit only `backup` and `operated`.
`maintenance` remains invalid at the external broker boundary. Sandbox cleanup
uses the maintenance-only entry point. That credential never leaves Worker
locals, so it creates no outstanding external credential and never advances
`sandbox_credential_expires_at`. That column tracks only credentials returned
to an external caller.

The signer result vocabulary remains:

- `credential`: a signed credential with `ttl === 90` for an allowed sandbox
  entry point.
- `null`: an unsupported external sandbox scope.
- `exception`: signer/configuration failure.

There is no D1 SQL in this decision; D4 is the only durable-expiry writer.

### D4: Post-Sign Mint CAS

Decision: a run-owned broker mint uses this exact order, with each named seam
available to focused tests:

1. `hashWithPepper` and `findSpbBindingByTokenHash` authenticate the bearer and
   resolve its exact binding (`account/src/spb-broker.js:21-31`).
2. `getEntitlement(env.DB, { accountId, service: SPB_HOSTED_SERVICE })` reads
   entitlement, then `isSpbEntitledToServe(entitlement, nowSeconds, env)`
   decides whether service is allowed (`account/src/spb-broker.js:33-49`).
3. `readJson(req)` reads the request body and `body?.scope` selects the
   requested scope (`account/src/spb-broker.js:51-52`).
4. `mintSandboxExternalCredential` signs the 90-second credential in memory at
   the same seam where `mintScopedCredential` is called today
   (`account/src/spb-broker.js:53-66`).
5. `advanceSpbSandboxCredentialExpiry` atomically advances durable maximum
   expiry using the exact identity and token that authenticated.
6. Only after the CAS returns a row does `handleBackupCredentials` serialize
   and return the credential at the existing response seam
   (`account/src/spb-broker.js:68-89`).

The run-owned branch preserves the shipped handler order: authenticate,
read/check entitlement, read the JSON body/select scope, sign, then respond.
It only inserts the post-sign CAS between signing and response. It does not
call `reconcileSpbEntitlement`; that mutating enable/billing/admin reconciler is
defined at `account/src/spb-entitlement.js:21-62`, while the broker performs
the read-only check above.

`findSpbBindingByTokenHash` adds `sandbox_run_id` to its projection:

```sql
SELECT account_id, instance_id, lapsed_at, sandbox_run_id
FROM spb_bindings
WHERE token_hash = ?
  AND token_hash IS NOT NULL
```

There is no added `LIMIT`: the helper already bounds the query with `.first()`
at `account/src/db.js:1469-1479`. Adding `sandbox_run_id` to the projection is
the only lookup-statement change.

It does not need `sandbox_denied_at`: denial nulls `token_hash`, so the existing
predicate already makes an old token return the existing 401. It does not need
`sandbox_credential_expires_at`: the atomic statement below owns both
monotonicity and the winner signal. It does need `sandbox_run_id` to choose the
90-second entry point and require the expiry CAS, as established in
`account/docs/spb-sandbox-lifecycle-prep.md:77-98`.

`advanceSpbSandboxCredentialExpiry` runs:

```sql
UPDATE spb_bindings
SET sandbox_credential_expires_at =
      MAX(COALESCE(sandbox_credential_expires_at, 0), ?)
WHERE token_hash = ?
  AND account_id = ?
  AND instance_id = ?
  AND sandbox_run_id IS ?
  AND sandbox_denied_at IS NULL
  AND token_hash IS NOT NULL
RETURNING account_id,
          instance_id,
          sandbox_run_id,
          sandbox_credential_expires_at
```

The bindings are, in order: `proposedExpiryMs`, the exact hash used for
authentication, `accountId`, `instanceId`, and the non-null `sandboxRunId`.
The proposed durable value and response value are the same integer:

`(credential.nowSeconds + credential.ttl) * 1000`.

The Workers-pool probe at
`account/docs/spb-sandbox-lifecycle-prep.md:307-411` proves that two-argument
`MAX` is scalar in `UPDATE SET`, `COALESCE` is necessary because
`MAX(NULL, 100)` remains null, and a lower proposal returns the incumbent
higher value. This is why the design rejects an added
`expiry IS NULL OR expiry < proposed` predicate: that alternative returns zero
for a safely covered lower proposal and conflates it with a real
owner/token/denial loss. Scalar `MAX` reserves zero rows for those real losses.

The durable expiry never decreases. Cleanup relies on that monotonic maximum:
once any external sandbox credential is returned, no denial, token rotation,
or later lower proposal can shorten its wait.

The CAS result vocabulary is:

- `advanced`: one row returned; its expiry is at least the proposal and the
  signed credential may be returned.
- `lost`: zero rows returned; discard every signed field from memory, persist
  no credential or expiry, write only D7's identifier-free
  `mint/mint_cas_lost` audit evidence, emit its counts-only telemetry, and
  return HTTP 401 with `{"error":"invalid_token"}`.
- `exception`: return the existing HTTP 500
  `{"error":"internal_error"}` path and no credential.

Reusing `invalid_token` avoids disclosing whether denial, token rotation, or
ownership caused the loss. “Nothing persisted after signing loss” means no
signed field, credential, token/hash, or binding expiry/state is persisted;
the generalized audit stores only stable `mint/mint_cas_lost`, validated
scope, actual TTL, zero returned-credential count, and timestamp.

Baseline rows (`sandbox_run_id IS NULL`) take today's broker branch exactly:
the existing scope/TTL, response shape, and `spb_mint_audit` behavior remain
unchanged; no CAS runs and no sandbox expiry column is written.

### D5: Denial Tombstone And Classification

Decision: denial is one conditional update. It requires canonical,
non-null account, instance, and run UUIDs at the lifecycle boundary and runs:

```sql
UPDATE spb_bindings
SET token_hash = NULL,
    sandbox_denied_at = ?
WHERE account_id = ?
  AND instance_id = ?
  AND sandbox_run_id IS ?
  AND sandbox_denied_at IS NULL
RETURNING account_id,
          instance_id,
          sandbox_run_id,
          sandbox_credential_expires_at,
          sandbox_denied_at
```

It must not change `account_id`, `instance_id`, `sandbox_run_id`,
`sandbox_credential_expires_at`, `created_at`, `last_seen_at`, or `lapsed_at`.
In particular, it preserves the maximum external expiry for D6.

Zero rows are classified with this authoritative tombstone read:

```sql
SELECT account_id,
       instance_id,
       sandbox_run_id,
       sandbox_credential_expires_at,
       sandbox_denied_at
FROM spb_bindings
WHERE instance_id = ?
LIMIT 1
```

The new `findSpbSandboxLifecycleByInstance` helper is also D6's cleanup read.
`findSpbBindingByTokenHash` cannot serve it because the token is null after
denial. The unique instance index makes the read unambiguous. The orchestrator
uses the conditional update result plus this read only for classification; the
update remains the one denial writer.

Denial uses the existing release vocabulary from
`account/docs/sandbox-ownership-design.md:150-201`:

- `released`: the guarded update returned one tombstone.
- `absent`: no row exists, or the exact account/run row is already denied.
  Re-denial is idempotently `absent` because no live credential remains to
  release; no new state word is needed.
- `ownership_conflict`: an incumbent exists for another account, ownership
  class, or run.

While a tombstone exists, denial is irreversible:

- D2's upsert cannot reinstall a token because its incumbent
  `sandbox_denied_at IS NULL` guard fails.
- `clearSpbBindingLapsed` changes only `lapsed_at`
  (`account/src/db.js:1441-1446`).
- D4's CAS cannot advance expiry because it requires both a matching non-null
  token and `sandbox_denied_at IS NULL`.
- D6's delete does not clear or overwrite the tombstone; it removes the whole
  exact tombstone only after verified cleanup.

After successful cleanup deletion, a future claim is a new lifecycle, not a
reversal of the deleted denial. Immediately after denial, the old broker token
gets the existing 401 because
`account/src/db.js:1473` requires `token_hash IS NOT NULL`; no read or error
reveals that a tombstone exists.

### D6: Tombstone-Preserving Cleanup State Machine

Decision: cleanup begins with `findSpbSandboxLifecycleByInstance`, validates
the exact account/run owner, and requires a non-null denial timestamp.

Its complete literal result vocabulary is:

- `credential_expiry_pending`: the tombstone is valid but a returned external
  credential may still be live.
- `cleaned`: final independent readback was empty, the identifier-free audit was
  inserted, and the exact tombstone delete returned one row.
- `retryable`: an R2 operation, credential mint, audit insert, fixed-point
  bound, or terminal D1 operation failed without proving terminal cleanup.
- `denial_required`: the exact run-owned row exists but is not denied.
- `absent`: no lifecycle row exists, including a concurrent successful cleanup.
- `ownership_conflict`: a row exists for another account, ownership class, or
  run.

`absent` is never translated to `released` or `cleaned` and is never proof of
purge, preserving the rule at
`account/docs/sandbox-ownership-design.md:190-193`.

#### Expiry Gate

The pending predicate is literal:

`nowMs < sandbox_credential_expires_at`.

For a non-null future expiry:

`retry_after_seconds = Math.ceil((sandbox_credential_expires_at - nowMs) / 1000)`.

Under D4's monotonic invariant it is an integer from 1 through 90. Every
proposal was at most its CAS time plus 90 seconds, and cleanup's current time
is not earlier than that CAS time. In this result no R2 list, delete, abort,
readback, or maintenance-credential mint occurs, and the caller must not report
clean. It also writes no `spb_sandbox_audit` row: polling during this pure,
bounded wait would otherwise amplify durable writes without recording a state
change. D7's console/hub event remains.

#### Joint Fixed Point And Readback

One cleanup attempt performs:

1. fixed-point object drain;
2. fixed-point multipart-upload drain;
3. a newly minted maintenance credential;
4. independent `ListObjectsV2(max-keys=1)` and
   `ListMultipartUploads` readbacks;
5. if either readback is non-empty, repeat both drains and both readbacks;
6. stop as `retryable` if `MAX_JOINT_PASSES` joint passes do not reach empty.

The outer loop is required because the existing drains are independently
fixed-point, but the object drain currently finishes before multipart aborts
begin (`account/src/spb-sweep.js:41-42,83-137`). An upload may complete into a
committed object after the object drain. Repeating both domains closes that
gap without changing the customer sweep.

`listObjectsV2` at `account/src/s3.js:74-84` does not accept `max-keys` today.
Its signature becomes additive:

`listObjectsV2(env, credential, { prefix, continuationToken = null,
maxKeys = null, nowMs = Date.now() })`.

When `maxKeys` is non-null the helper adds `max-keys`; existing callers omit it
and preserve today's request. The final readback uses `maxKeys: 1`.
`listMultipartUploads` needs no pagination extension merely to prove that its
first page has at least one upload.

The pair proves that, at two adjacent fresh reads under the exact prefix, R2
reports no committed objects and no in-progress multipart uploads. It does not
prove bucket-wide emptiness, absence of a write after the reads, or absence of
an object outside the prefix. Denial plus the recorded-expiry wait removes all
known external writers before this proof. A `HeadObject` check is rejected:
without a known key it can prove only one object's absence, never prefix
emptiness. A single object-list read is weaker because it says nothing about
multipart uploads.

#### Bounded In-Memory Credential Supply

The shared drains receive `getRequestAuth()`, which returns
`{ credential, nowMs }` immediately before each S3 request. For sandbox
cleanup, the supplier keeps only the current maintenance credential, its
expiry, and a mint count in local variables. It mints before the first request
and re-mints when fewer than five seconds remain. Each final readback always
uses a separately, newly minted credential.

`MAX_JOINT_PASSES = 3` and `MAX_MAINTENANCE_CREDENTIALS = 6` are module-private
constants in `spb-sandbox-lifecycle.js`. They are not function parameters,
configuration, `env` values, or otherwise caller-overridable. Six credentials
allow one drain credential and one independent verifier across each of the
three joint passes. A pass that exhausts either bound returns `retryable`; the
next attempt starts with no retained credential.

No maintenance credential, access key, secret key, session token, signature,
or hash may enter D1, logs, audits, hub events, errors, or returned results.
Only the numeric mint count is observable.

#### Partial Failure And Terminal Delete

Any list/delete/abort/readback throw, credential-mint failure, or bound
exhaustion preserves the tombstone and returns `retryable`. Successful object
deletes and multipart aborts are not rolled back; that is acceptable because
both operations are intended, retry-safe progress toward the same empty
prefix. Retry is safe because the tombstone remains the ownership and denial
authority, repeated R2 deletes/aborts are idempotent progress, and a later
attempt re-lists source state rather than trusting prior in-memory state. It
converges once writers are gone; only a fresh empty object/upload readback plus
a one-row guarded tombstone delete yields `cleaned`.

After a fresh readback proves both domains empty, cleanup inserts D7's
identifier-free `event = 'cleanup', outcome = 'cleaned'` audit. Only then does it
run this dedicated delete; it never calls the customer helper at
`account/src/db.js:1462-1467`:

```sql
DELETE FROM spb_bindings
WHERE account_id = ?
  AND instance_id = ?
  AND sandbox_run_id IS ?
  AND sandbox_denied_at IS ?
  AND token_hash IS NULL
RETURNING account_id, instance_id, sandbox_run_id
```

The expected non-null denial timestamp is bound from the authoritative read,
so a recreated or changed lifecycle cannot be deleted. One row yields
`cleaned`. Zero rows is never silent success: an authoritative re-read returns
`absent` if a concurrent cleanup deleted it, otherwise
`ownership_conflict`. A D1 exception is `retryable`.

If the audit insert fails, deletion does not run. If the audit succeeds but a
later delete fails, retry may produce another `cleanup/cleaned` audit; each row
records an independently verified empty cleanup attempt, while only a one-row
delete permits the returned `cleaned` result.

### D7: Identifier-Free Sandbox Audit And Telemetry

Decision: use prep option C
(`account/docs/spb-sandbox-lifecycle-prep.md:755-772`), the
`spb_sandbox_audit` table created in D1. It is the only option whose
schema structurally cannot hold the forbidden identifiers. Reusing
`spb_sweep_audit` with nulls would rely on every caller remembering to null
`account_id`, `instance_id`, and `prefix`; extending `spb_mint_audit.outcome`
would require the full indexed table rebuild documented at
`account/docs/spb-sandbox-lifecycle-prep.md:688-736`.

The table durably records post-identity sandbox mint/refusal, denial, and
cleanup evidence without identities. Including `denial` is a small deliberate
extension of Jer's mint/refusal/cleanup wording: denial is the lifecycle's
irreversible security-critical action, D5 already defines its telemetry event,
and leaving it console-only while mint is durable would be inconsistent.

The literal SQL and closed event/outcome vocabularies are:

```sql
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
```

The table-level conditional `CHECK` pairs each event with only its own literal
outcome vocabulary. A cleanup outcome under `event = 'mint'`, for example, is
rejected at the storage boundary. SQLite accepts and D1's Workers pool enforces
this form: the repository already ships a multi-branch table-level `CHECK` at
`account/migrations/0024_scout_lifecycle_events.sql:15-38`, and its Workers-pool
migration test rejects impossible branch combinations at
`account/test/migration-0024-scout-lifecycle-events.test.js:45-100`. The 0026
migration test still proves this exact new constraint by attempting at least
one mismatched event/outcome pair and expecting a D1 `CHECK` failure.

Nullable fields are per-event applicable, not optional. Every caller binds all
eight columns and uses this exact applicability matrix:

| Event/outcome | `scope` | `ttl` | `credentials_minted` | `objects_deleted` | `multipart_aborted` |
|---|---:|---:|---:|---:|---:|
| `mint/minted` | requested `backup` or `operated` | actual `90` | `1` | null | null |
| `mint/refused_entitlement` | null | null | `0` | null | null |
| `mint/refused_scope` | null | null | `0` | null | null |
| `mint/mint_cas_lost` | validated `backup` or `operated` | actual `90` | `0` | null | null |
| `mint/internal_error` | null | null | `0` | null | null |
| Any `denial/*` outcome | null | null | null | null | null |
| `cleanup/cleaned` | null | null | actual attempt count | actual successful delete count | actual successful abort count |
| `cleanup/retryable` | null | null | actual attempt count | actual successful delete count | actual successful abort count |
| `cleanup/denial_required` | null | null | `0` | `0` | `0` |
| `cleanup/absent` | null | null | `0` | `0` | `0` |
| `cleanup/ownership_conflict` | null | null | `0` | `0` | `0` |

Thus `scope` and `ttl` apply only to mint and are non-null only when a valid
external scope was signed; `credentials_minted` is non-null for every mint and
cleanup row and null for denial; and object/multipart counts are non-null only
for cleanup. Null always means “not applicable to this event/outcome,” never
“the caller omitted an applicable value.”

`ts` is always the event's Unix epoch millisecond timestamp. For mint rows,
`credentials_minted` counts credentials eligible to leave the Worker: a signed
credential discarded after CAS loss remains `0`. The successful mint row's
`ttl` is the actual signed value, exactly `90`, rather than a configured or
assumed value. `scope` excludes `maintenance` because maintenance credentials
are cleanup-internal and never an external caller-selected scope.

`credential_expiry_pending` deliberately remains in D6's returned cleanup
vocabulary but is absent from the audit `CHECK`. It mints nothing, issues no R2
request, and changes no state; persisting every poll would amplify writes
during the bounded 90-second wait. It remains counts-only console/hub telemetry,
and `retry_after_seconds` therefore needs no audit column.

No index is added. There is no identifier or query key to index, and the
use is append-only. `account/test/helpers.js:118-143` adds
`spb_sandbox_audit` to `resetDb()`'s drop list.

The helper signature is:

`insertSpbSandboxAudit(db, { event, outcome, scope, ttl,
credentialsMinted, objectsDeleted, multipartAborted, ts })`.

Callers pass explicit null for every inapplicable column; the helper supplies
no semantic defaults.

It runs:

```sql
INSERT INTO spb_sandbox_audit (
  event,
  outcome,
  scope,
  ttl,
  credentials_minted,
  objects_deleted,
  multipart_aborted,
  ts
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
```

Baseline broker exits continue unchanged. Once
`findSpbBindingByTokenHash` resolves a non-null `sandbox_run_id`, every later
exit is a sandbox event: it inserts the exact `spb_sandbox_audit` row below and
takes the counts-only `spb_sandbox_mint` console/hub path. It must not call
either `insertSpbMintAudit` or the identifier-bearing `alertRefusal`. The
sandbox event replaces, rather than supplements, `spb_mint_refused`; no broker
exit emits both.

The branch contract for every broker exit is:

| Exit | Baseline branch | Run-owned branch |
|---|---|---|
| Killswitch, before identity | Existing `refusePreIdentity`: console `spb_mint_refused/refused_killswitch`, no D1 audit, no hub event, HTTP 503 `mint_disabled` (`account/src/spb-broker.js:17-19,96-103`). | The branch cannot be known because lookup has not run. Use the same pre-identity behavior; do not invent a sandbox event. |
| Missing, malformed, or unknown bearer, before identity | Existing `refusePreIdentity`: console `spb_mint_refused/refused_binding`, existing `spb_mint_refused` hub event with both identifier fields null, no D1 audit, HTTP 401 `invalid_token` (`account/src/spb-broker.js:21-31,96-112`). | The branch cannot be known because no binding resolved. Use the same pre-identity behavior. The hub event contains nulls, not UUIDs. |
| Entitlement refusal | Existing `spb_mint_audit` row with account, instance, and prefix; existing identifier-bearing `spb_mint_refused` hub event; HTTP 402 `needs_subscription` (`account/src/spb-broker.js:36-48`). | Insert `('mint','refused_entitlement',null,null,0,null,null,nowMs)`. Emit only `spb_sandbox_mint/refused_entitlement` with `credentials_minted: 0`; no `spb_mint_audit` or `spb_mint_refused`; return the same HTTP 402 body. |
| Scope refusal, including unreadable JSON | Existing `spb_mint_audit` row with account, instance, and prefix; existing identifier-bearing `spb_mint_refused` hub event; HTTP 400 `invalid_scope` (`account/src/spb-broker.js:51-65,119-125`). | Insert `('mint','refused_scope',null,null,0,null,null,nowMs)`. Emit only `spb_sandbox_mint/refused_scope` with `credentials_minted: 0`; no `spb_mint_audit` or `spb_mint_refused`; return the same HTTP 400 body. |
| Minted | Existing identifier-bearing `spb_mint_audit` row and no mint-success hub event; existing credential response (`account/src/spb-broker.js:68-89`). | After a winning D4 CAS, insert `('mint','minted',scope,90,1,null,null,nowMs)`. Emit only `spb_sandbox_mint/minted` with `credentials_minted: 1`, then return the credential. |
| CAS lost | Not applicable; baseline mints do not CAS. | Insert `('mint','mint_cas_lost',scope,90,0,null,null,nowMs)`. Emit only `spb_sandbox_mint/mint_cas_lost` with `credentials_minted: 0`; no existing refusal event; return D4's HTTP 401 `invalid_token`. The row contains no signed field. |
| Internal error | Before run ownership is resolved, or for a resolved baseline row, preserve `console.error('spb_mint_failed')`, no new D1 audit/hub event, and HTTP 500 `internal_error` (`account/src/spb-broker.js:90-92`). | If run ownership was resolved before the throw, insert `('mint','internal_error',null,null,0,null,null,nowMs)`. Do not emit the baseline error or any identifier-bearing event; emit only `spb_sandbox_mint/internal_error` with `credentials_minted: 0`; return the same HTTP 500 body. |

Denial inserts `('denial', outcome, null, null, null, null, null, nowMs)` for
each D5 outcome: `released`, `absent`, `ownership_conflict`, or
`internal_error`. Cleanup inserts `('cleanup', outcome, null, null,
credentialsMinted, objectsDeleted, multipartAborted, nowMs)` for every D6 exit
except `credential_expiry_pending`; the three counts follow the matrix above,
and an internal cleanup failure maps to the existing `retryable` result.

The exact sandbox console events are:

- `spb_sandbox_mint` with
  `{ event, outcome, credentials_minted, ts }`, where `outcome` is one of
  `minted | refused_entitlement | refused_scope | mint_cas_lost |
  internal_error`.
- `spb_sandbox_denial` with
  `{ event, outcome, bindings_denied, ts }`, where `outcome` is one of
  `released | absent | ownership_conflict | internal_error`.
- `spb_sandbox_cleanup` with
  `{ event, outcome, credentials_minted, objects_deleted,
  multipart_aborted, retry_after_seconds, duration_ms, ts }`, where `outcome`
  is one of D6's six cleanup results and inapplicable numeric fields are zero.

The exact hub event types and detail fields are:

- `spb_sandbox_mint`:
  `{ tier: 'T4', outcome, credentials_minted }`.
- `spb_sandbox_denial`:
  `{ tier: 'T4', outcome, bindings_denied }`.
- `spb_sandbox_cleanup`:
  `{ tier: 'T4', outcome, credentials_minted, objects_deleted,
  multipart_aborted, retry_after_seconds }`.

`emitSecurityEvent` supplies its normal envelope; no lifecycle caller adds an
identity or free-form detail. Console/hub delivery failures follow the
existing security-event behavior and never change the D1/R2 result.

Acceptance criterion 11 applies to the table, console fields, hub details, and
all error paths. They must never contain an account/run/instance UUID, prefix,
object key, token or hash, credential field, email, content, or a free-form
error message. The table physically has no such column; event construction
uses the exact allowlists above.

### D8: Module And Shared-Drain Placement

Decision: add `account/src/spb-sandbox-lifecycle.js` as the policy
orchestrator. It owns the internal claim, deny, and cleanup entry points:

- `claimSpbSandboxBinding`
- `denySpbSandboxBinding`
- `cleanupSpbSandboxBinding`

This is materially larger than the 0025 SPL/SPP claim/release helpers and
should not make `account/src/sandbox-ownership.js` own SPB entitlement,
credential, R2, audit, and retry policy.

`claimSpbSandboxBinding` validates first, generates and hashes one broker token,
then calls D2 with the non-null run ID. Its literal result vocabulary is:

- `{ outcome: 'claimed', credential }` when D2 returns a row; `credential` is
  the plaintext broker token returned only to the in-process caller.
- `{ outcome: 'ownership_conflict' }` when D2 returns null; the generated token
  is discarded.

The result never exposes `token_hash`, and no route is added. Denial and cleanup
use the D5 and D6 vocabularies without aliases.

Canonical UUID validation remains one implementation. Rather than exporting a
validator from an orchestration module, move `UUID_RE` and
`requireCanonicalUuids` from
`account/src/sandbox-ownership.js:11,109-113` into the neutral sibling
`account/src/sandbox-identifiers.js`, export only
`requireCanonicalUuids`, and import it from both ownership modules. This
amends D4's “one private validator” placement in
`account/docs/sandbox-ownership-design.md:203-258`, but preserves its
load-bearing rule: one canonical validator, invoked before D1 or R2 work.

Extract the neutral drain mechanics from
`account/src/spb-sweep.js:83-149` into
`account/src/spb-drain.js`, beside `s3.js`. It exports exactly:

- `drainObjects(env, { prefix, getRequestAuth, onDeleted })`
- `drainMultipartUploads(env, { prefix, getRequestAuth, onAborted })`

`getRequestAuth()` returns `{ credential, nowMs }` per request.
`onDeleted(count)` and `onAborted(count)` default to no-ops and let sandbox
cleanup retain numeric progress across a later throw. `chunks` and
`namedError` remain private implementation details in the new module.

The customer sweep supplies a fixed closure returning its existing credential
and fixed `nowMs`, and omits the progress callbacks. Its order remains
object drain once, then multipart drain once, with the same list/delete/abort
sequence, fixed-point behavior, exceptions, totals, audit, and binding delete.
Sandbox cleanup supplies the refreshing closure and wraps both drains in D6's
joint outer loop.

`account/src/s3.js` remains the one-request wire layer. It gains only the
additive `maxKeys` query option from D6; it does not acquire drain, credential,
or sandbox policy.

All literal SQL in D1, D2, D4, D5, D6, D7, and D9 is implemented only in
`account/src/db.js`. D1 helpers expose rows/nulls and do not classify sandbox
policy results.

This placement decision adds no SQL or new result vocabulary beyond the
contracts in D2–D7.

### D9: Customer Lapse Lifecycle Isolation

Decision: adopt prep option 1 and make the due selector the customer/sandbox
isolation boundary. `selectDueLapsedBindings` becomes:

```sql
SELECT account_id, instance_id
FROM spb_bindings
WHERE lapsed_at IS NOT NULL
  AND lapsed_at <= ?
  AND sandbox_run_id IS NULL
ORDER BY lapsed_at ASC, rowid ASC
```

This is the shipped statement at `account/src/db.js:1448-1460` plus exactly one
conjunct, `AND sandbox_run_id IS NULL`. The added predicate removes run-owned
live rows and denial tombstones before any customer R2 purge or audit.
Baseline selection, ordering, result cardinality, `spb_lapse_sweep` outcomes,
audit rows, and delete behavior remain byte-identical; no limit or pagination
is introduced.

This relies on the invariant that every denial tombstone remains run-owned.
The lifecycle boundary requires a canonical non-null run UUID; D2 inserts it
on sandbox claim; D2 cannot change owner/run on conflict; and D5 never changes
it on denial. A baseline row cannot become a sandbox tombstone through the
denial API.

`markSpbBindingLapsed` and `clearSpbBindingLapsed` remain unchanged. They may
stamp or clear `lapsed_at` account-wide, but D9 makes that field irrelevant to
customer selection for every run-owned row. Baseline reconciliation through
`account/src/spb-entitlement.js:21-38` and all callers traced in
`account/docs/spb-sandbox-lifecycle-prep.md:105-127` remains unchanged.

Prep option 4—also guarding the generic customer delete—is not adopted. The
selector is that helper's only production source, and a selected baseline row
cannot atomically change into a run-owned row because D2's global guarded
upsert would lose rather than change ownership. Adding a late delete guard
would not protect against the already-completed R2 purge unless the sweep also
handled zero rows, expanding the baseline contract without another reachable
race. Sandbox cleanup instead uses D6's dedicated guarded delete.

The selector's result vocabulary remains `rows | [] | exception`; it adds no
new customer sweep outcome.

### D10: Verification Architecture

Decision: verification is split by contract boundary, not by implementation
function:

- migration shape and recovery in
  `account/test/migration-0026-spb-sandbox-lifecycle.test.js`;
- atomic D1 ownership/denial/finalization and public lifecycle results in
  `account/test/spb-sandbox-lifecycle.test.js`;
- broker TTL, CAS ordering, real response serialization, and baseline
  compatibility, including exact generalized sandbox audit rows, in
  `account/test/spb-broker.test.js`;
- owner-path false-success prevention in
  `account/test/enable-spb.test.js`;
- R2 fixed point, re-mint, readback, containment, and retry in
  `account/test/spb-sandbox-cleanup.test.js`;
- unchanged customer behavior in `account/test/spb-sweep.test.js`;
- narrow signer contracts in
  `account/test/r2-credential.test.js`;
- 0025 non-SPB proof in
  `account/test/migration-0025-sandbox-run-ownership.test.js`.

`account/test/helpers.js:713-730` extends `seedSpbBinding` additively with
`sandboxRunId = null`, `sandboxCredentialExpiresAt = null`, and
`sandboxDeniedAt = null`; existing callers keep today's shape. Its insert names
all columns explicitly.

The test result vocabularies are exactly the production vocabularies in
D2–D7 and D9. No test-only compatibility result or fallback is introduced.
This decision adds no production SQL; the statements under test are the
literal statements already fixed above.

## Implementation Sequence

1. Land the storage contract first:
   `migrations/0026_spb_sandbox_lifecycle.sql`, the one-for-one
   `schema.sql` mirror, the `resetDb` drop-list entry, additive
   `seedSpbBinding` fields, the 0026 migration test, and the local pre-0026 SPB
   shape in the 0025 migration harness. No code may reference a new column
   before this step.
2. Add the D1 primitives in `src/db.js`: unified returning SPB upsert, expanded
   token lookup, expiry CAS, denial update, lifecycle read, generalized
   `insertSpbSandboxAudit`, guarded tombstone delete, and run-excluding due
   selector.
3. Extract canonical validation into `src/sandbox-identifiers.js`; update
   `src/sandbox-ownership.js` to import it; add
   `src/spb-sandbox-lifecycle.js` claim/deny classification without R2 cleanup
   first.
4. Update `src/enable.js` to inspect the SPB upsert result and return
   `spbError(500)` before reconciliation on loss. Match the SPL/SPP convention
   at `src/enable.js:489-494,743-751`: omit `sandboxRunId` and rely on the
   helper's additive null default for baseline callers.
5. Refactor `src/r2-credential.js` around one private signer and add the two
   fixed-90-second sandbox entry points. Update `src/spb-broker.js` with the
   run-owned branch, post-sign CAS, response/expiry shared value, loser
   discard, D7's durable sandbox audit rows, and mutually exclusive counts-only
   console/hub telemetry. Keep every baseline and pre-identity exit unchanged.
6. Extract `src/spb-drain.js`, update `src/spb-sweep.js` to use a fixed
   credential supplier with unchanged call order, and add the optional
   `maxKeys` request parameter in `src/s3.js`.
7. Complete `cleanupSpbSandboxBinding` with the expiry gate, bounded credential
   supplier, joint fixed point, fresh readback, progress counts, audit-before-
   delete terminal, generalized cleanup audit outcomes, and explicit result
   classification.
8. Amend `account/docs/sandbox-ownership-design.md:203-258` with one line
   pointing canonical validation to `src/sandbox-identifiers.js` and this
   design. Do not restate the rationale there.
9. Add the focused tests in D10/Test Plan, then update source references or
   operational documentation only where implementation moves line anchors.
   No owner-facing copy is planned.

## Test Plan

The labels below are the scope's acceptance-criterion numbers. Multiple cases
may prove one criterion, and a cross-boundary race may prove more than one.
Each case names its file, fault seam, and decisive assertion.

- **AC1 — migration and schema parity.**
  `test/migration-0026-spb-sandbox-lifecycle.test.js` applies 0026 after a
  local post-0025 SPB shape, inserts a legacy row first, and asserts exact
  column order/types/nullability, null legacy values, exact run and unique
  index shapes, exact generalized audit columns, event/outcome `CHECK`
  rejection, and one-for-one consolidated-schema parity. The legacy row must
  have null
  `sandbox_run_id`, `sandbox_credential_expires_at`, and `sandbox_denied_at`,
  proving it remains baseline-owned. Duplicate SPB instance rows are the fault
  seam: unique-index creation must fail loudly and preserve both rows. Full
  re-run must fail at the duplicate `ALTER`; the table/index suffix must re-run
  safely for each documented partial state.

- **AC1 — 0025 remains a non-SPB migration.**
  `test/migration-0025-sandbox-run-ownership.test.js:1-169` extends
  `installPre0025Tables` to drop/recreate the six-column pre-0026
  `spb_bindings` plus only `idx_spb_bindings_account_id`. The existing
  assertion at `:63` stays and still proves
  `idx_spb_bindings_sandbox_run_id === null` after applying 0025. The fault
  seam is `resetDb()` loading future `schema.sql`; the local reconstruction
  removes that contamination without deleting the proof.

- **AC2 — one atomic conflict rule serves baseline and sandbox.**
  `test/spb-sandbox-lifecycle.test.js` seeds legacy/baseline/run/denied rows
  through the additive `seedSpbBinding`. Direct guarded-upsert calls are the
  seam. Assertions cover insert, same-owner token rotation, unchanged expiry,
  null loser, unchanged incumbent, tombstone guard, and exception versus
  zero-row distinction using the one D2 statement.

- **AC2 — all ownership-class claim races.**
  `test/spb-sandbox-lifecycle.test.js` drives three prep interleavings with
  `Promise.all`: baseline/run for one instance, run A/run B for one
  account/instance, and two accounts for one instance. The unique index plus
  D2 predicate is the seam. Each case asserts exactly one `claimed`, one
  `ownership_conflict`, and one unchanged stored owner.

- **AC2 — owner SPB enablement cannot report a lost baseline claim.**
  `test/enable-spb.test.js` installs an incumbent run-owned row, calls the
  baseline SPB enable handler, and spies at `reconcileSpbEntitlement` and
  `insertServiceHandoff`. The guarded upsert's null is the seam. It asserts
  HTTP 500 through the existing SPB error page, `Cache-Control: no-store`, no
  reconciliation, no handoff row, and no broker token/success payload.

- **AC1 / AC3 — narrow 90-second signer and unchanged customer TTLs.**
  `test/r2-credential.test.js` exercises both sandbox entry points at a fixed
  `nowSeconds`. The signing seam is the shared private body observed through
  its real returned fields. It asserts exact TTL 90, backup/operated-only
  external acceptance, maintenance-only cleanup actions, unsupported scope
  null, and unchanged existing baseline backup/operated/maintenance TTLs.

- **AC3 — real serialized mint expiry and monotonic publication.**
  `test/spb-broker.test.js` uses the real signer response and D1, not a mocked
  response/row pair. It parses response-body `expires_at` to milliseconds and
  asserts equality with `sandbox_credential_expires_at`. A second mint with a
  lower proposed expiry is the seam; it must still return a row/credential
  while stored expiry never decreases. The response spy must prove the D1
  advance completed before response production. A baseline token asserts no
  sandbox expiry write and today's TTL/audit/response bytes, also serving AC1.

- **AC4 / AC5 — mint versus denial in both orders and post-sign CAS loss.**
  `test/spb-broker.test.js` and
  `test/spb-sandbox-lifecycle.test.js` coordinate promises at the named
  `mintSandboxExternalCredential`/`advanceSpbSandboxCredentialExpiry` seams.
  Faults injected immediately after signing, immediately before the CAS,
  immediately after a winning CAS, and immediately before response production
  prove that no untracked credential reaches a response. Denial-first asserts
  one tombstone, CAS zero, HTTP 401 `invalid_token`, no returned credential,
  and no credential or binding-expiry persistence by the lost mint; D7's
  stable `mint/mint_cas_lost` row is the only durable evidence. CAS-first asserts any
  subsequently returned 90-second credential has a durably equal maximum
  expiry before denial creates the token-null tombstone. A forced token
  rotation between signing and CAS covers the eighth prep interleaving and
  asserts every signed field is absent from response, D1, logs, errors, and
  hub events.

- **AC5 — denial versus same-run upsert and irreversible tombstones.**
  `test/spb-sandbox-lifecycle.test.js` coordinates both orders at the guarded
  update/upsert seams. Denial-first asserts the upsert returns null and cannot
  restore token or clear denial. Upsert-first asserts denial nulls the newest
  token. Re-denial returns `absent`; other-owner denial returns
  `ownership_conflict`; the old broker token gets the existing 401; lapse
  clear and mint CAS cannot change the tombstone.

- **AC6 — denial changes only the exact token and preserves lifecycle state.**
  `test/spb-sandbox-lifecycle.test.js`, `test/spb-broker.test.js`, and
  `test/spb-sandbox-cleanup.test.js` seed two bindings, deny one exact
  account/instance/run, and pause cleanup after final readback but before the
  guarded tombstone delete. The denial update and terminal-delete pause are
  the seams. The named case asserts only the target `token_hash` becomes null;
  the other binding/token is byte-identical; and the target `account_id`,
  `instance_id`, `sandbox_run_id`, `created_at`, and
  `sandbox_credential_expires_at` are byte-identical immediately after denial,
  during `credential_expiry_pending`, and after purge verification immediately
  before terminal deletion. The denied broker token must return HTTP 401
  immediately. Allowing the final guarded delete then removes only that exact
  tombstone.

- **AC7 — expiry-pending cleanup is side-effect free and bounded.**
  `test/spb-sandbox-cleanup.test.js` seeds an expiry at each millisecond
  boundary around `nowMs`. Spies on maintenance mint and
  `installS3FetchMock` are the fault seams. Future expiry returns
  `credential_expiry_pending`, reports the exact ceiling in 1–90, and makes
  zero mint/list/delete/abort calls and writes no `spb_sandbox_audit` row;
  equal/past/null expiry proceeds.

- **AC8 / AC9 — joint purge, pagination, fresh readback, and containment.**
  `test/spb-sandbox-cleanup.test.js` uses a stateful
  `installS3FetchMock` store shaped after
  `test/spb-sweep.test.js:350-505`. Cases cover empty state, more than 1,000
  objects, multi-page multipart uploads, and an upload completing into an
  object after the first object drain. The store records credential identity,
  host, prefix, and operation. Assertions prove an outer second pass,
  `max-keys=1` final object read, a distinct freshly minted verifier,
  object/upload emptiness, and no request against a baseline, other-run, or
  other-instance prefix.

- **AC8 — bounded in-memory re-mint.**
  `test/spb-sandbox-cleanup.test.js` advances a fake clock across the
  five-second refresh threshold. The request-auth supplier is the seam.
  Assertions prove re-mint before an expired request, a separately minted
  verifier, no credential outside Worker locals, the six-mint attempt cap, and
  `retryable` when the cap is exhausted.

- **AC9 — partial failure remains retryable.**
  `test/spb-sandbox-cleanup.test.js` injects list, delete, abort, readback,
  signer, audit, and final-delete failures one at a time. Each case preserves
  the tombstone, retains already-completed R2 progress, reports `retryable`,
  and converges on a second idempotent attempt. Three non-empty joint passes
  exercise the fixed-point bound. A zero-row final delete must not report
  `cleaned`.

- **AC10 — cleanup maintenance credential never escapes Worker memory.**
  `test/spb-sandbox-cleanup.test.js` captures the real cleanup maintenance
  credential at the mint seam and passes every credential field to
  `assertNoSecrets` as the forbidden corpus. The named case checks response
  bodies, every `spb_bindings` and sandbox/customer audit column, console
  output, thrown errors, and hub payloads after success and each injected
  list/delete/abort/readback failure. No access key, secret key, session token,
  signature, or derived credential value may appear in any surface.

- **AC13 / out-of-scope regression — customer lapse lifecycle is unchanged.**
  `test/spb-sweep.test.js` reruns existing baseline success, pagination,
  failure isolation, audit, and delete cases, plus a mixed baseline/run/
  tombstone case proving only the baseline prefix is selected and touched.
  `test/spb-sandbox-lifecycle.test.js` asserts mark/clear may update
  `lapsed_at` but cannot make run rows due. No owner-visible string changes:
  `enable.js` reuses `renderEnableSpbError`, so no new brand-canon fixture or
  approved copy is required.

- **AC11 — every sandbox audit/log/hub exit uses only allowed fields.**
  `test/spb-broker.test.js` drives entitlement refusal, unreadable JSON/scope
  refusal, minted, CAS-lost, and internal-error exits after resolving a
  run-owned binding. Captured D1, console, and hub seams must show no
  `spb_mint_audit` row, no `spb_mint_refused` event, exactly one allowed
  `spb_sandbox_mint` console/hub event, and exactly the D7
  `spb_sandbox_audit` row for each exit—including actual `scope`/`ttl = 90`
  on `minted` and `mint_cas_lost`. Paired baseline cases assert today's
  identifier-bearing audit/refusal behavior is unchanged; killswitch and bad/
  unknown bearer cases assert the common pre-identity behavior and null hub
  identifiers remain unchanged. The 0026 migration test asserts the exact
  generalized columns and proves the table-level conditional `CHECK` rejects
  a mismatched pair such as `event = 'mint', outcome = 'cleaned'`.
  `test/spb-sandbox-lifecycle.test.js` asserts exact denial rows, and
  `test/spb-sandbox-cleanup.test.js` asserts exact cleanup rows for
  `cleaned`, `retryable`, `denial_required`, `absent`, and
  `ownership_conflict`, while `credential_expiry_pending` writes no row.
  Every sandbox audit, console record, and hub detail must have keys drawn only
  from the designed counts, outcomes, scopes, TTLs, timestamps, and stable
  codes. Account/run/instance UUIDs, prefix, object keys, token/hash,
  credential fields, email, free-form errors, and sample content are rejected
  from every sandbox audit/telemetry payload. AC10 separately supplies the
  cleanup credential itself as the forbidden corpus.

- **AC12 — missing lifecycle state is `absent`, never `released`.**
  `test/spb-sandbox-lifecycle.test.js` calls denial and cleanup with canonical
  identifiers for a missing `instance_id`. The authoritative lifecycle read is
  the seam. Both named cases assert exactly `{ outcome: 'absent' }`, never an
  invented `released` or `cleaned`, with no R2 request or tombstone delete side
  effect, and with the exact identifier-free `denial/absent` and `cleanup/absent`
  audit rows required by D7.

- **AC13 — full account gate.**
  After all focused cases pass, run the repository-required literal gate
  `cd account && npm test`. It must be green, including
  `test/spb-broker.test.js`, `test/spb-entitlement.test.js`,
  `test/handoff-spb.test.js`, `test/spb-sweep.test.js`,
  `test/enable-spb.test.js`, `test/scouts-admin.test.js`, all
  `test/migration-*.test.js` suites, and the unchanged 0025 assertion proving
  migration 0025 leaves SPB untouched. The existing brand-canon suite remains
  part of this gate even though no owner-visible copy changes.

- **AC14 — design contract and non-production boundary.**
  Review `docs/spb-sandbox-lifecycle-design.md` as the named artifact and
  assert D1 through D10 retain their literal SQL and result vocabularies. The
  change inventory is the seam: implementation/review must show no deploy, no
  production migration application, and no live R2 mutation.

## Risks

- **Production duplicate `instance_id`.** The unique index will fail loudly if
  historical accounts share an SPB instance. D1's preflight is the operator
  gate. Resolution is manual and verified; the migration never chooses a
  winner.
- **Account foreign-key cascade.** `spb_bindings.account_id` retains
  `ON DELETE CASCADE` (`account/schema.sql:331-332`). This is accepted:
  account deletion remains authoritative for subordinate account data, and
  changing it would strand data outside existing retention semantics. The
  consequence is explicit: a parent deletion can remove a tombstone before
  sandbox cleanup, and subsequent `absent` is not proof of R2 purge. A future
  general account-deletion workflow that promises R2 cleanup must coordinate
  it before deleting the parent; that expansion is outside this lode.
- **Irreversible R2 deletion.** A wrong prefix or ownership classification
  cannot be rolled back. Canonical IDs, exact owner/run comparison, deterministic
  prefix derivation, denial, expiry wait, host/prefix containment tests, and
  maintenance-only actions are the barriers before deletion.
- **Audit-before-delete retry duplicates.** An audit can succeed before a
  terminal D1 failure. Retrying may add another `cleanup/cleaned` row. This is
  intentional attempt-level evidence, not a count ledger; only a one-row
  guarded delete yields the returned `cleaned` result.
- **Clock assumptions.** The natural 90-second retry bound assumes Worker time
  does not move backward relative to the mint CAS. Tests fix the clock at both
  the seconds/milliseconds boundary and cleanup threshold.
- **Persistent or unauthorized writers.** Three joint passes bound one Worker
  attempt. Continued non-empty readback returns `retryable`; it never deletes
  the tombstone or claims clean.
- **Refactor regression in the customer sweep.** Shared drain extraction must
  preserve the existing fixed credential, fixed signing time, object-then-
  multipart call order, errors, and counts. Existing sweep tests are the
  compatibility proof.

## For Jer

Gate outcome: Jer approved three module-private joint passes and six
module-private in-memory maintenance credentials per cleanup attempt, with no
caller/config/environment override. He confirmed that post-identity run-owned
broker exits replace `spb_mint_audit`/`spb_mint_refused`; the generalized
identifier-free `spb_sandbox_audit` now supplies durable mint, refusal, denial,
and cleanup evidence alongside counts/stable-code console and hub telemetry.
