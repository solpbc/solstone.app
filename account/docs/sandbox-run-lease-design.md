# Sandbox Run Lease Design

Shipped design. This composes, and does not replace, the two shipped
foundations:

- `docs/sandbox-ownership-design.md:42-458` remains authoritative for exact
  dispatch/SPL/SPP ownership, release classification, and relay-retirement
  results.
- `docs/spb-sandbox-lifecycle-design.md:65-934` remains authoritative for SPB
  claim, mint publication, denial, expiry waiting, purge, and identifier-free
  audit behavior.

This document defines only the run registry, fixed lease, protected control
plane, issuance composition, authorization joins, SPL lease cap, and durable
reconciler that those designs intentionally left out
(`docs/sandbox-ownership-design.md:33-40`;
`docs/spb-sandbox-lifecycle-design.md:49-55`). Research and the accepted D1
probe are in `docs/sandbox-run-lease-prep.md:113-639`. The scope source is
`~/projects/extro/cto/workspace/hop-solstone-account-sandbox-run-control-plane-260725.md`.

## Goals

- Add one durable, non-secret evidence row for every caller-named sandbox run,
  enforcing at most one nonterminal run for the server-designated account.
- Expose exactly three JSON routes behind the existing two-layer `/admin/*`
  boundary: create once, read redacted state, and idempotently reconcile.
- Issue the four journal capabilities from the same service primitives as owner
  consent while preserving every owner response and handoff byte.
- Make one one-hour, nonrenewable lease the sole time authority for run-owned
  dispatch, SPP, SPB, and SPL access.
- Linearize activation in one D1 CAS, never replay a credential, and converge
  safely from every pre-activation crash and cleanup interleaving.
- Deny first, preserve the run evidence forever, and report only independently
  verified cleanup through fixed component states and stable residual codes.
- Add bounded scheduled reconciliation only after retention completes, without
  entering the existing `0 3 * * *` SPB sweep branch.

## Non-Goals

- Do not restate or change the ownership, relay-retirement, SPB credential,
  tombstone, R2-drain, or sandbox-audit contracts in the two preceding designs.
- Do not add account selection, service selection, endpoint selection, TTL,
  quota, profile, or entitlement knobs. The only contract/profile pair is
  version `1` and profile `full`; the lease is exactly one hour.
- Do not create, rotate, disable, or delete the standing Gemini key, shared R2
  bucket, relay Worker, SPP engine, account, Scout application, or account
  entitlement. The route may reconcile the designated account's existing
  service entitlement through the same owner primitives.
- Do not create an owner session, service handoff, consent page, device,
  passkey, email, billing record, or impersonation session.
- Do not change retention selection or protect an account in code. The operator
  must keep a verified email on the designated account because retention deletes
  old accounts with no verified email (`src/retention.js:77-80`).
- Do not add a renewal, resume, credential-recovery, cleanup-by-account, list,
  or live-run endpoint. A lost create response is cleaned by its caller-known
  `run_id`, then replaced with a fresh run ID.
- Do not deploy, set `SANDBOX_ACCOUNT_ID`, apply migration 0027 in production,
  or execute a live sandbox run in this lode.

## Decided Design

### D1: Migration 0027 And The Exact State Machine

Decision: migration `0027_sandbox_run_lease.sql` creates one `sandbox_runs`
table. It has no child table and no JSON state column. Five component triples
are normalized on the row so D1 `CHECK`s enforce the real vocabularies.

#### Status and phase vocabularies

The legal status is exactly the scope's seven-value state machine:

1. `provisioning`
2. `active`
3. `cleanup_required`
4. `cleaning`
5. `expiry_pending`
6. `cleanup_failed`
7. `released`

This reconciles the prep's five-value proposal at
`docs/sandbox-run-lease-prep.md:660-673` with the scope: the prep collapsed
three operationally distinct cleanup states. `cleanup_required` is the durable
quiescence request, `expiry_pending` is a nonfailure SPB wait, and
`cleanup_failed` is a retryable degraded verification. They cannot be folded
without losing the required `202`/`503` distinction. No eighth `expired` status
is added; D3 makes expiry a timestamp predicate, so a stored expiry status
cannot disagree with the clock.

The provisioning ladder is exactly ten values, in this order:

`created → dispatch_intent → dispatch_acquired → spl_intent → spl_acquired →
spb_intent → spb_acquired → spp_intent → spp_acquired → active`.

The cleanup ladder is exactly eight values, in this order:

`deny_intent → denied → relay_intent → relay_retired → spb_expiry → spb_purge
→ verify → released`.

Thus the scope phrase “seven statuses and both phase ladders” means seven
statuses, a ten-value provisioning ladder, and an eight-value cleanup ladder;
it does not require either ladder to contain seven values. Every phase update is
a compare-and-set from the immediately preceding value. Cleanup retries may
repeat a phase, but neither ladder may reverse.

The cleanup phase is a durable high-water mark, not a cursor that skips prior
work. Per-component isolation requires every retry to revisit any component not
verified `released`, even if another component advanced the global phase.

#### Columns

| Column group | Exact shape and invariant |
|---|---|
| Identity | `run_id TEXT NOT NULL PRIMARY KEY`, `account_id TEXT NOT NULL`, `instance_id TEXT NOT NULL`. The two caller IDs and configured account ID are canonical UUIDs validated before insertion. |
| Contract | `contract_version INTEGER NOT NULL CHECK (contract_version = 1)` and `profile TEXT NOT NULL CHECK (profile = 'full')`. |
| State | `status TEXT NOT NULL`, `provisioning_phase TEXT NOT NULL`, nullable `cleanup_phase TEXT`, each with the closed vocabularies above. |
| Time | `created_at`, `lease_expires_at`, and `updated_at` are non-null integer epoch milliseconds; `completed_at` is nullable integer milliseconds. A table check requires `lease_expires_at = created_at + 3600000`; `released` requires both cleanup phase `released` and non-null completion, and no other status may carry either terminal marker. |
| Retry/evidence | Nullable `spb_retry_not_before INTEGER` stores an absolute epoch-millisecond high-water mark. Nullable `last_residual_code TEXT` stores only D6's closed stable-code union. Neither is caller-controlled. |
| Components | `dispatch`, `spp`, `spb`, `spl_relay`, and `spl_binding` each have non-null `<name>_state`, nullable `<name>_residual_code`, and non-null `<name>_updated_at`. |

There is deliberately no foreign key from `sandbox_runs.account_id` to
`accounts`. Every existing capability row cascades with the account
(`schema.sql:132-139`, `:304-312`, `:323-335`, `:347-358`), but the run evidence
must survive account loss so it can report `account_missing` and
`spb_lifecycle_absent` rather than turning absence into success. No production
helper deletes a `sandbox_runs` row.

Each component state has this exact six-value `CHECK` vocabulary:

`active | deny_pending | purge_pending | verify_pending | released |
cleanup_failed`.

All five components start `deny_pending` at run insertion. The activation CAS
sets all five to `active` atomically. Cleanup quiescence changes any remaining
`active` state to `deny_pending`; later transitions follow D6. A component in
`active` or `released` has a null residual. A `cleanup_failed` component must
have a non-null allowed residual. `purge_pending` permits only
`spb_credential_expiry_pending` for SPB; other pending states normally have a
null residual.

The closed component residual sets are:

| Component | Allowed non-null residual codes |
|---|---|
| Dispatch | `lease_expired`, `account_missing`, `dispatch_issue_failed`, `dispatch_release_failed`, `dispatch_ownership_conflict` |
| SPP | `lease_expired`, `account_missing`, `spp_issue_failed`, `spp_release_failed`, `spp_ownership_conflict` |
| SPB | `lease_expired`, `account_missing`, `spb_issue_failed`, `spb_denial_failed`, `spb_denial_required`, `spb_credential_expiry_pending`, `spb_cleanup_retryable`, `spb_lifecycle_absent`, `spb_ownership_conflict` |
| SPL relay | `lease_expired`, `account_missing`, `spl_grant_failed`, `relay_retired_state`, `relay_instance_do_cleanup`, `relay_rk_do_cleanup`, `relay_device_revocation`, `relay_entitlement_clear`, `relay_pending_grant_clear`, `relay_rk_registry_clear`, `relay_verification`, `relay_failed` |
| SPL binding | `lease_expired`, `account_missing`, `spl_issue_failed`, `spl_release_failed`, `spl_ownership_conflict` |

`last_residual_code` uses the union above plus
`lease_expired_before_activation` and `activation_cas_lost`. It is evidence of
the last redacted problem, not the source of component truth, and may remain on
a released historical row.

These status, phase, component-state, component-residual, and
`last_residual_code` lists are the literal shipped `CHECK` values in
`migrations/0027_sandbox_run_lease.sql:65-173` and the mirrored
`schema.sql:423-531`; the migration test independently enumerates the same
closed sets (`test/migration-0027-sandbox-run-lease.test.js:14-130`).

#### Indexes and acquisition

Migration 0027 creates exactly these explicit indexes:

- `idx_sandbox_runs_account_id` on `account_id`;
- `idx_sandbox_runs_reconcile` on
  `(status, lease_expires_at, created_at, run_id)`;
- `idx_sandbox_runs_one_nonterminal_account`, unique on `account_id` where
  status is any of `provisioning`, `active`, `cleanup_required`, `cleaning`,
  `expiry_pending`, or `cleanup_failed`.

The primary key preserves every used `run_id`, including released runs. The
partial unique index makes all states except `released` mutually exclusive per
account. Its predicate is repeated literally in the run-insert conflict target,
as required by the Workers-pool probe
(`docs/sandbox-run-lease-prep.md:580-637`). Creation uses two explicit UPSERT
clauses: `ON CONFLICT(run_id) DO NOTHING`, followed by
`ON CONFLICT(account_id) WHERE status IN (<the six values>) DO NOTHING`, and
`RETURNING` is the sole winner signal. A bare `ON CONFLICT(account_id)` is
forbidden because the probe produced `SQLITE_ERROR`.

One returned row means the caller won the lease. Zero rows means either its
`run_id` already exists or that account has another nonterminal run; both are
the same redacted `409`, and no incumbent ID is read or returned. D1 exceptions
remain `503` operational failures and are never classified by message text.

#### Migration runbook and consolidated schema

The 0027 header follows 0025/0026's preflight and partial-apply style by
reference (`migrations/0025_sandbox_run_ownership.sql:1-43`;
`migrations/0026_spb_sandbox_lifecycle.sql:1-52`):

1. Preflight verifies the 0025 ownership columns/indexes and the 0026 SPB
   columns/audit/indexes exist, then queries `sqlite_master` for the table and
   three 0027 index names. A first application requires no 0027 object.
2. If `sandbox_runs` already exists, stop and inspect `PRAGMA table_info`,
   `PRAGMA index_list`, `PRAGMA index_info`, and its `sqlite_master.sql` before
   running anything. `CREATE TABLE IF NOT EXISTS` is not evidence that an
   existing table has the right `CHECK`s.
3. If the table is exact and an ordinary index is missing, run only its
   `CREATE INDEX IF NOT EXISTS` statement.
4. Before recreating the partial unique index, query for accounts with more
   than one row in the six nonterminal statuses. Any result is a loud stop;
   never delete a row or select a winner automatically.
5. A full migration rerun fails loudly because the bare `CREATE TABLE` finds
   `sandbox_runs` already present. After verifying the exact table definition,
   rerun only a documented missing `CREATE INDEX IF NOT EXISTS` statement. A
   partial or mismatched table is repaired out of band, never papered over by
   the migration.

`schema.sql` mirrors the table and indexes one-for-one. Its stale header at
`schema.sql:1` is changed from “after 0025” to “after 0027.” `resetDb()` adds
the new table to its explicit drop list (`test/helpers.js:119-157`) and gains a
`seedSandboxRun` fixture; no existing fixture changes its default ownership.

### D2: Protected Route And Fixed Request Boundary

Decision: add only these exact routes:

- `POST /admin/sandbox-runs`
- `GET /admin/sandbox-runs/<run_id>`
- `DELETE /admin/sandbox-runs/<run_id>`

`src/index.js:948-949` continues to send every `/admin/*` request through
`handleAdmin`. `handleAdmin` validates the Worker-side Access assertion before
dispatch (`src/admin.js:141-146`), while `workers_dev = false` and the custom
domain preserve the independent edge layer (`wrangler.toml:7-13`).
`admin.js` delegates the exact paths only after validation; every other method,
extra segment, collection GET/DELETE, or member POST falls through to the
existing admin not-found response (`src/admin.js:147-170`).

The Worker-wide, pre-existing HEAD rewrite deliberately mirrors GET for a
canonical member path (`src/index.js:959-966`). HEAD therefore returns the
matching GET status and headers for either an existing or absent run, with the
body stripped. This is conventional HTTP behavior and exposes no response
field; carving out only this route family would add a special case without a
safety benefit. Other unsupported methods retain the uniform admin not-found
response.

`wrangler.toml` receives comments only:

- `SANDBOX_ACCOUNT_ID` is set with `wrangler secret put`;
- it is one canonical UUID naming the designated synthetic account;
- unset/empty/malformed disables all three routes by returning a redacted 503;
- it has no default, no `[vars]` value, and is never hardcoded.

This follows the default-off secret precedent at `wrangler.toml:45-49`. The
scheduled reconciler does not read this secret: it uses the durable account ID
already on each run, so removal of route authority does not prevent cleanup.

POST accepts a JSON object whose keys are exactly
`contract_version`, `profile`, `run_id`, and `instance_id`. Validation rejects,
before the run insert or any remote mutation:

- unreadable JSON, null, arrays, primitives, missing keys, or any extra key;
- a version other than integer `1` or a profile other than exact string `full`;
- malformed/noncanonical run or instance UUIDs under the one validator in
  `src/sandbox-identifiers.js`;
- therefore every attempted `account_id`, endpoint, TTL, service, entitlement,
  quota, scope, or arbitrary metadata field;
- missing, empty, or malformed `SANDBOX_ACCOUNT_ID`;
- a configured account absent from `accounts`;
- a Scout application absent or not exactly `approved`;
- no active Gemini row, empty key material, or key decryption failure.

The last four are one preflight read/decrypt sequence using existing account,
Scout, and key queries (`src/db.js:575-584`, `:923-932`, `:722-733`). It reads
the standing key directly and never calls `ensureProvisionedKey`, whose current
implementation can create a placeholder/key and update last-used state
(`src/provisioning.js:29-63`). All failures use stable envelopes and no raw
exception. Configuration/baseline unavailability is `503`; malformed caller
input is `400`.

The operator precondition is explicit: the designated account must retain at
least one verified email. The route does not change or special-case retention.

### D3: One-Hour Lease And One Liveness Authority

Decision: `created_at` is captured immediately before the winning run insert;
`lease_expires_at` is exactly `created_at + 60 * 60 * 1000`, matching the
one-hour constant precedent at `src/admin.js:35`. POST never changes either
value. There is no renewal route or retry behavior that returns old secrets.

A lease is live if and only if:

`run.status === 'active' && nowMs < run.lease_expires_at`.

This predicate is the only authority. Status may remain `active` after the
clock passes the expiry until cleanup claims it, but no authorization or grant
treats it as live. There is no stored `expired` status, boolean, or alternate
clock. JS policy centralizes the predicate in `src/sandbox-run-lease.js`; the
three SQL authorization joins repeat the same literal two conditions and are
covered as a contract by tests.

The dispatch lookup becomes:

```sql
SELECT token.account_id
FROM account_dispatch_tokens AS token
LEFT JOIN sandbox_runs AS run ON run.run_id = token.sandbox_run_id
WHERE token.token_hash = ?
  AND token.revoked_at IS NULL
  AND (
    token.sandbox_run_id IS NULL
    OR (
      run.account_id = token.account_id
      AND run.status = 'active'
      AND ? < run.lease_expires_at
    )
  )
```

SPP and SPB use the same join and predicate, additionally requiring
`run.instance_id = binding.instance_id`; their SELECT projections remain
exactly the current caller contracts from
`docs/sandbox-run-lease-prep.md:140-167`. `findActiveDispatchToken`,
`findSppBindingByTokenHash`, and `findSpbBindingByTokenHash` add an explicit
`nowMs` argument. `resolveDispatchToken` supplies one `Date.now()` value;
`handleSppAuthorize` and `handleBackupCredentials` pass the time they already
capture at their request boundary (`src/dispatch-tokens.js:14-19`;
`src/spp-authorize.js:10-41`; `src/spb-broker.js:17-45`).

The SPB post-sign expiry CAS also requires the identical run/account/instance,
`active`, and unexpired predicate. A token that was live at lookup but loses
the lease before publication returns no credential, preserving the prior
mint-versus-denial rule rather than creating a second liveness authority
(`src/db.js:1768-1808`; `docs/spb-sandbox-lifecycle-design.md:288-392`).

Baseline rows preserve their existing branch literally through
`sandbox_run_id IS NULL`; a missing joined run can never authorize a non-null
run-owned row.

#### SPL cap

`listSplBindings` additionally selects `sandbox_run_id`, joined run
`account_id`, `instance_id`, `status`, and `lease_expires_at`; it remains
account-bounded (`src/db.js:1667-1682`). For every ordinary account-level
grant, `syncAccountEntitlementToRelay` first computes today's `base` once, then
uses exactly:

- null `sandbox_run_id`: `base`, passed unchanged;
- exact joined active run with a safe integer future expiry:
  `min(base, floor(lease_expires_at / 1000))`;
- missing/malformed/mismatched, non-active, or expired run: `0`.

The zero case is pushed, not skipped. The null branch uses the same value and
the same `JSON.stringify({ instance_id, entitled_until })` path, preserving the
baseline grant body byte-for-byte (`src/relay-grant.js:105-137`, `:200-225`).

There is one necessary create-time distinction. Ordinary reconciliation cannot
produce the positive pre-activation grant because the directed non-active rule
correctly caps a `provisioning` row to zero. D4 therefore performs one
create-owned direct grant for the exact binding, capped to
`min(base, floor(lease_expires_at / 1000))`, while the run is fenced at
`spl_intent`. This is not an exception for billing/admin reconciliation and is
not a general cap override: it accepts no TTL, uses only the stored lease, and
must receive `true` from `pushEntitlementGrant` before `spl_acquired`. A
concurrent cleanup's irreversible relay tombstone remains authoritative under
the preceding relay design (`docs/sandbox-ownership-design.md:334-410`). Every
later ordinary reconciliation follows the zero-for-non-active formula above.

### D4: Shared Issuance Seam And Exact Payloads

Decision: add `src/capability-issuance.js` as a service-only seam. It contains
no request parsing, HTML, session, handoff, audit, run-state transition, or SQL.
All SQL remains in `src/db.js`; owner and sandbox callers pass an explicit
internal ownership descriptor (`baseline`, or canonical run ID plus expected
provisioning phase) rather than a caller-facing mode or TTL.

Its public entry points are:

- `issueScoutCapability({ env, accountId, googleApiKey, ownership, nowMs })`
- `issueSplCapability({ env, accountId, instanceId, ownership, nowMs, ctx,
  leaseExpiresAt })`
- `issueSpbCapability({ env, accountId, instanceId, ownership, nowMs,
  brokerEndpoint, ctx })`
- `issueSppCapability({ env, accountId, instanceId, ownership, nowMs, ctx,
  consentAckedAt, consentDisclosureVersion })`

`leaseExpiresAt` is required only by the internal sandbox SPL branch and must
equal the stored run value; baseline callers pass null. `brokerEndpoint` is the
current request origin on the owner path and the fixed deployed
`https://services.solstone.app` origin on the sandbox path, so the caller
cannot choose an endpoint. The module uses the existing token generator,
pepper hashing, guarded binding helpers, entitlement reconcilers, endpoint,
bucket, and deterministic prefix rules already exercised in the four owner
flows (`src/enable.js:91-100`, `:488-507`, `:599-614`, `:742-763`).

The run orchestrator and owner handlers both call these neutral issuance
functions directly, with sandbox and baseline ownership respectively
(`src/sandbox-run-lease.js:22-27`, `:201-253`; `src/enable.js:9-14`, `:91-102`,
`:487-506`, `:598-616`, `:741-764`). The existing foundation claim helpers in
`src/sandbox-ownership.js` and `src/spb-sandbox-lifecycle.js` are thin wrappers
that delegate their mint/hash/binding portion to the same seam and preserve
their established outcome strings; their current callers are foundation tests.
The mechanics therefore still have one implementation without routing the
sandbox caller through an owner session, HTML response, or service handoff.

Adopting that redundant claim-helper facade in production or removing it is an
explicit out-of-scope follow-up. Those helpers are prior-lode exported API with
their own designs and tests, so this lode neither deletes them nor adds an
indirect call solely to make the facade appear used.

The factoring landed in two dependency-ordered changes. The first extracted
only the exercised owner/baseline issuance seam. The `ownership` descriptor,
the sandbox-only SPL `leaseExpiresAt`, and their run-fenced D1 branches landed
with the control-plane orchestrator, their first caller. Shipping those
parameters and branches in the earlier factoring would have introduced
unexercised code paths, contrary to KISS/YAGNI. The signatures above describe
the final shipped seam (`src/capability-issuance.js:24-159`).

For sandbox ownership, every local insert/upsert is fenced in the same D1
statement with `EXISTS` on the exact run/account/instance, status
`provisioning`, and named intent phase. This closes the check-then-write race:
if cleanup changes status first, the write returns no row and every freshly
generated plaintext token is discarded; if the write wins first, cleanup sees
and releases the exact run-owned row. Baseline ownership bypasses only that run
predicate and retains the existing guarded ownership SQL.

The shared primitive returns a journal-exact core plus a closed internal result
(`issued`, `ownership_conflict`, `run_fence_lost`, `not_entitled`, or
`grant_failed`). Owner handlers map those results to their existing pages and
call order. They alone add owner discriminators, encrypt/insert handoffs, and
write existing owner audit rows. Sandbox never calls any of those owner layers.

The exact successful core sets are:

| Capability | Sandbox/journal exact key set | Owner-only adapter |
|---|---|---|
| Scout | `google_api_key`, `dispatch_token`, `account_id`, `created_at` | Prepend `state: 'approved'`. |
| SPL | `service`, `state`, `approved_at` | Approved owner payload is identical. The owner-only `needs_subscription` alternative remains outside sandbox. |
| SPB | `broker_endpoint`, `account_id`, `instance_id`, `bucket`, `prefix`, `broker_token` | Append `status`; append `subscribe_url` only for the owner `needs_subscription` case. |
| SPP | `endpoint_url`, `served_model_id`, `credential`, `account_id`, `created_at` | Insert `state: 'approved'` first and `instance_id` before `created_at`, preserving today's serialized property order. |

This resolves the scope §4.5 discrepancy: the current SPP owner payload has
two journal-rejected extras, both `state` and `instance_id`, not only `state`
(`src/enable.js:755-763`;
`docs/sandbox-run-lease-prep.md:279-314`). SPB always has owner-only `status`
and conditionally has `subscribe_url` (`src/enable.js:610-614`). The sandbox
response includes none of those extras. The owner adapters preserve the exact
objects and property order documented at
`docs/sandbox-run-lease-prep.md:251-276`; no owner-visible byte may change.

SPB accepts the request's one canonical `instance_id`, claims exactly it, and
echoes exactly it in the six-field core. This satisfies the journal runtime
match rather than generating or normalizing another ID
(`~/projects/solstone-journal/solstone/think/sandbox_profile/capabilities.py:195-212`).

### D5: Creation, Intent Durability, And Activation Linearization

Decision: POST executes this fixed sequence and no other:

1. Validate the request, secret configuration, account, approved Scout, and
   standing key under D2. Decrypt the existing key into request-local memory.
2. Insert the `provisioning/created` run row with the fixed lease. This winning
   insert is the lease-acquisition CAS.
3. CAS to `dispatch_intent`; issue the run-fenced dispatch token; CAS to
   `dispatch_acquired` only after re-reading exact run ownership.
4. CAS to `spl_intent`; claim the run-fenced binding, reconcile the existing
   entitlement state without ordinary relay fan-out, await D3's exact positive
   lease-capped grant, re-read ownership, then CAS to `spl_acquired`.
5. CAS to `spb_intent`; issue the run-fenced SPB binding/token, reconcile and
   verify entitlement, re-read ownership, then CAS to `spb_acquired`.
6. CAS to `spp_intent`; issue the run-fenced SPP binding/token, reconcile and
   verify entitlement, re-read ownership, then CAS to `spp_acquired`.
7. Assemble the complete response in memory. Run one activation CAS requiring
   the exact run/account/instance, `status = 'provisioning'`, phase
   `spp_acquired`, and `nowMs < lease_expires_at`. It sets status and phase to
   `active`, clears current residuals, and sets all component states/timestamps
   to `active` in the same statement.
8. Only one returned activation row permits serialization of the `201`
   no-store response. A zero-row CAS discards every plaintext field and enters
   cleanup without returning a credential.

Every intent precedes its side effect. Every local side effect contains the D1
run fence described in D4; every step re-verifies ownership afterward before
advancing. The only remote issuance side effect is the SPL grant. Its exact-run
binding exists before the grant, its relay value cannot exceed the stored
lease, and the relay retirement tombstone makes both race orders safe: grant
first is retired by cleanup; retirement first cannot be reactivated by a late
grant under the inherited relay contract.

Any failure after run insertion CASes `provisioning` or `active` to
`cleanup_required`, stores only a stable residual, runs one best-effort cleanup
pass, and returns redacted `503` with only the caller-supplied `run_id`. It
never returns a partial capability object. A failure before insertion returns
503 without a row or remote mutation.

#### Fault table

| Fault boundary | Durable evidence and convergence |
|---|---|
| Before the run insert | No run and no capability mutation; a fresh request may retry the same ID. |
| After run insert, before `dispatch_intent` | Discoverable `provisioning/created`; cleanup proves local absence while the account exists. |
| After `dispatch_intent`, before dispatch insert | The intent is durable; the fenced insert either has not happened or loses to cleanup. |
| After dispatch insert, before `dispatch_acquired` | Exact run token exists but no secret escaped; cleanup revokes it. |
| After `dispatch_acquired`, before `spl_intent` | Dispatch is discoverable; no SPL effect was attempted. |
| After `spl_intent`, before SPL binding claim | Cleanup treats SPL as attempted; the fenced claim either has not happened or loses. |
| After SPL binding claim, before relay grant | Exact binding exists; cleanup retires relay first, then releases the binding. |
| After successful SPL grant, before `spl_acquired` | Relay may be live only to the stored lease; cleanup's irreversible retirement precedes local release. |
| After `spl_acquired`, before `spb_intent` | Dispatch/SPL are discoverable; no SPB effect was attempted. |
| After `spb_intent`, before SPB claim | The fenced claim either has not happened or loses to cleanup. |
| After SPB insert, before `spb_acquired` | Exact broker tombstone authority can be denied and purged; no broker token escaped. |
| After `spb_acquired`, before `spp_intent` | Earlier resources are discoverable; no SPP effect was attempted. |
| After `spp_intent`, before SPP claim | The fenced claim either has not happened or loses to cleanup. |
| After SPP insert, before `spp_acquired` | Exact SPP credential is denied by the non-active join and the row is releasable. |
| After `spp_acquired`, before activation | All resources are discoverable but authorization remains denied; cleanup can win the activation race. |
| Cleanup wins before a fenced D1 write | The write returns zero, generated plaintext is discarded, and the issuer cannot advance or activate. |
| A fenced D1 write wins before cleanup | Cleanup changes status after the atomic write and then sees/releases the exact owned row. |
| Cleanup wins before activation CAS | Activation returns zero, no response is permitted, and cleanup owns all subsequent progress. |
| Activation CAS wins before DELETE/cron cleanup | Create owns the race and may return once. Cleanup may immediately move the run forward; it can never reactivate it. |
| Crash after activation, before/during response delivery | Credentials are lost to the caller; the run remains active until explicit deletion or expiry. A retry is 409 and never replays them. This is accepted exactly-once behavior. |

The activation CAS is the sole point at which credentials become externally
returnable. `cleanup_required`, `cleaning`, `expiry_pending`,
`cleanup_failed`, and `released` can never transition to `active`; a released
row also permanently blocks reuse of its `run_id`.

### D6: Cleanup State Machine And Component Evidence

Decision: explicit DELETE, POST failure, and scheduled expiry call the same
`reconcileSandboxRun` function. The first successful CAS from `provisioning` or
`active` to `cleanup_required` is quiescence: D3 authorization fails
immediately, later local issuance writes lose their D4 fence, and ordinary SPL
reconciliation caps to zero. A cleanup pass changes a retryable nonterminal
status to `cleaning` and executes this fixed order:

1. **Deny:** independently revoke dispatch, release SPP, and deny SPB. Each
   component catches and records its own result so one failure cannot suppress
   the other two.
2. **Retire relay:** invoke the inherited strict relay retirement contract.
3. **Release SPL binding:** only after an accepted `retired` relay result,
   release the exact local SPL binding. This preserves the load-bearing order
   in `docs/sandbox-ownership-design.md:184-193`.
4. **SPB expiry/purge:** call SPB cleanup separately from denial. It may produce
   the nonfailure `credential_expiry_pending`; no R2 operation runs before that
   clock (`docs/spb-sandbox-lifecycle-design.md:470-618`).
5. **Verify:** directly read D1 for exact dispatch/SPP/SPB/SPL postconditions
   through `db.js`; use the accepted relay retirement result for relay truth.
   Final release requires positive evidence for every component and account
   presence.

Existing foundation outcomes map as follows; their definitions remain in the
prior designs and are not redefined here.

| Component | Foundation result | Durable component result |
|---|---|---|
| Dispatch | `released`, or `absent` while the account still exists | `verify_pending`, then `released` after exact D1 readback |
| Dispatch | `ownership_conflict` / throw | `cleanup_failed` with `dispatch_ownership_conflict` / `dispatch_release_failed` |
| SPP | `released`, or account-present `absent` | `verify_pending`, then `released` after exact D1 readback |
| SPP | `ownership_conflict` / throw | `cleanup_failed` with `spp_ownership_conflict` / `spp_release_failed` |
| SPB deny | `released` or the helper's already-denied `absent` | `purge_pending`; cleanup still performs authoritative lifecycle read |
| SPB deny | `ownership_conflict` / throw | `cleanup_failed` with `spb_ownership_conflict` / `spb_denial_failed` |
| SPB cleanup | `credential_expiry_pending` | `purge_pending`, `spb_credential_expiry_pending`, and absolute retry CAS from D7 |
| SPB cleanup | `cleaned` | `verify_pending`, then `released` only with the same pass's positive cleanup result and exact D1 absence |
| SPB cleanup | account-present `absent` before `spb_acquired` | `verify_pending`; only the later fresh account/instance postcondition may advance it to `released` |
| SPB cleanup | `retryable`, `denial_required`, ambiguous `absent`, `ownership_conflict` | `cleanup_failed` with `spb_cleanup_retryable`, `spb_denial_required`, `spb_lifecycle_absent`, or `spb_ownership_conflict` |
| SPL relay | `retired` | `released`; the strict result already contains all required relay checks |
| SPL relay | `retryable_residual` | `cleanup_failed` with the exact allow-listed `relay_<failedComponent>` translation |
| SPL relay | `failed` / throw | `cleanup_failed` with `relay_failed` |
| SPL binding | `released`, or account-present `absent`, after relay release | `verify_pending`, then `released` after exact D1 readback |
| SPL binding | `ownership_conflict` / throw | `cleanup_failed` with `spl_ownership_conflict` / `spl_release_failed` |

An account-present local `absent` is a verified no-local-resource
postcondition after an intent that may have preceded a crash. If the account is
gone, cascade deletion makes the same absence ambiguous. The reconciler still
attempts safe relay retirement and SPB lifecycle cleanup from the durable run
IDs, but records `account_missing`; a missing SPB tombstone records
`spb_lifecycle_absent`. It never reports release from cascade absence, matching
the risk established at
`docs/spb-sandbox-lifecycle-design.md:1184-1191`.

The one narrow SPB absence proof requires both account presence and a durable
provisioning phase before `spb_acquired` (`src/sandbox-run-lease.js:708-725`).
With no binding, no broker credential or R2 object can exist under the run
prefix, and activation could not have returned credentials because it follows
`spb_acquired`. If a binding committed but its acquired-phase CAS failed, the
lifecycle read finds that row and follows normal denial and purge. The absence
result remains `verify_pending` until the later fresh local postcondition proves
the account still exists and the instance is still empty; account deletion or
a conflicting binding between those reads fails closed. Absence at or after
`spb_acquired`, or after account loss, remains ambiguous and records
`spb_lifecycle_absent`.

The final `released` CAS requires all five stored component states to be
`released`, the exact local D1 verification result from the current pass, and
status `cleaning`. It atomically sets status/cleanup phase `released`,
`completed_at`, and `updated_at`. No stale failure update may match a released
row, and component updates use guards that forbid regressing `released`.
`cleaning` is not a mutex: concurrent idempotent passes may help, but only the
guarded terminal CAS can finish.

### D7: SPB Retry Clock And HTTP Contracts

Decision: amend only the in-process pending result of
`cleanupSpbSandboxBinding` to expose the tombstone's exact absolute expiry as
`retry_not_before_ms` alongside its existing relative value. This value is
already read as `sandbox_credential_expires_at` before the return
(`src/spb-sandbox-lifecycle.js:88-153`); no secret or identifier is added.

On `credential_expiry_pending`, the orchestrator uses a monotonic run-row CAS:
`spb_retry_not_before = MAX(COALESCE(spb_retry_not_before, 0), ?)` while the run
is in a cleanup status. It then derives both response fields from the stored
absolute value at response time:

`max(1, ceil((spb_retry_not_before - nowMs) / 1000))`.

The JSON `retry_after_seconds` and HTTP `Retry-After` header are the same
decimal integer. With the inherited fixed 90-second SPB credential TTL, a
fresh pending result is bounded from 1 through 90
(`docs/spb-sandbox-lifecycle-design.md:493-509`). A crash after reading the
tombstone but before the run CAS is recovered by re-reading the retained
tombstone on the next pass. A missing tombstone is never converted to zero or
success merely from an old retry timestamp. It becomes
`spb_lifecycle_absent`, except for D6's independently proven account-present,
pre-`spb_acquired` no-resource case.

#### Successful POST

POST returns `201`, `Cache-Control: no-store`, the existing admin security
headers, and exactly these top-level keys:

`run_id`, `contract_version`, `profile`, `lease_expires_at`, `capabilities`.

`lease_expires_at` is integer epoch milliseconds. `capabilities` has exactly
`scout`, `spl`, `spb`, and `spp`; each value has D4's literal journal key set.
No status discriminator or owner-only field is inserted into a capability.

#### Redacted GET report

GET returns `200`, no-store/admin headers, and exactly:

`run_id`, `contract_version`, `profile`, `status`, `provisioning_phase`,
`cleanup_phase`, `lease_expires_at`, `lease_live`, `retry_after_seconds`, and
`components`.

The components array is always ordered:

1. `dispatch`
2. `spp`
3. `spb`
4. `spl_relay`
5. `spl_binding`

Each object has exactly `component`, `state`, `residual_code`, and
`updated_at`. Times are integer epoch milliseconds; nullable values are emitted
as JSON null so the key set is fixed. GET reads only the durable row and D3's
clock predicate. It never mutates or calls a cleanup helper. For a stored
`active` component whose lease is no longer live, rendering changes its
effective state to `deny_pending` with `lease_expired`; this avoids falsely
reporting authorization while retaining the stored `active` status until the
reconciler CASes it forward. Every other component value is the last
server-verified durable result, never a caller assertion.

No GET field contains account ID, instance ID, token/hash, prefix, key,
credential, object key, email, content, raw helper result, or upstream body.

An authenticated GET of a known member path with a canonical but absent
`run_id` returns `404`, `Cache-Control: no-store`, the existing admin security
headers, and exactly `error`, `code`, and `run_id`:

`{"error":"sandbox run not found","code":"sandbox_run_not_found","run_id":"<caller-supplied run_id>"}`.

This is distinct from the uniform admin 404 for an unsupported method other
than HEAD, malformed member ID, collection GET/DELETE, member POST, or extra
path segment. The distinction lets an ambiguous POST outcome converge by
reading its known ID;
POST is never retried for credential replay. It creates no cross-account
inference channel because the route is hard-scoped to the one configured
`SANDBOX_ACCOUNT_ID`: from this route, a canonical ID either identifies that
account's run or is absent. The response never reveals whether the same ID is
present outside that scope and echoes only the caller-supplied value.
The implementation and exact serialized assertion are at
`src/sandbox-run-lease.js:964-969`, `:1011-1017`, and
`test/sandbox-run-get.test.js:131-168`.

HEAD for either an existing or absent canonical member path mirrors the
corresponding GET status and headers through the global rewrite, then strips
the body. It therefore cannot expose the GET report or the absent envelope's
fields (`src/index.js:959-966`; `test/sandbox-run-admin.test.js`).

#### DELETE status rules

DELETE calls D6 once. Its `200` and `202` responses use the same fixed report
shape; `409` and `503` use their closed error envelopes:

- `200` only for stored `released` after every component is independently
  verified; repeated DELETE of that row is byte-stable and side-effect free.
- `202` only when SPB credential expiry is the sole outstanding condition and
  all other components are released. It includes matching JSON and header
  retry values and is not a failure.
- `409` when any component has an ownership-conflict residual. Cleanup never
  touches the incumbent and the response exposes no incumbent identity.
- `503` for every other residual, account loss, D1/relay/R2 degradation,
  malformed verification, or cleanup exception.

Authenticated POST/DELETE `409` and `503` envelopes may include only their own
caller-supplied `run_id`, never the stored account/instance or another run ID.
An unknown well-formed DELETE member is `404` with no echoed ID; the preceding
GET-specific absence contract is the only exception. Malformed member IDs,
unsupported methods other than the deliberate HEAD mirror, and extra path
segments use the existing uniform admin not-found response. No route returns
`500` or a raw exception.

### D8: Module Placement And D1 Surface

Decision: add `src/sandbox-run-lease.js` as the only run policy and HTTP module.
It exports:

- `handleSandboxRunRequest(request, env, url, parts, ctx, securityHeaders)`
- `createSandboxRun(env, ctx, { accountId, runId, instanceId,
  contractVersion = 1, profile = 'full', nowMs })`
- `isSandboxRunLeaseLive(run, nowMs)`
- `reconcileSandboxRun(env, ctx, { runId, nowMs, trigger })`
- `reconcileExpiredSandboxRuns(env, ctx, { nowMs = Date.now() })`

`admin.js` supplies its existing security-header object after Access
validation, avoiding header duplication or an import cycle. The module returns
JSON only. It does not import session, HTML, handoff, email, billing, device, or
provisioning code. D4's `capability-issuance.js` is the only new shared service
module.

All literal SQL stays in `src/db.js`. The new DB surface is grouped as:

- run insert/read/reconciliation selection;
- exact provisioning-phase and activation CAS helpers;
- cleanup-request, phase, component, retry, and terminal CAS helpers;
- direct local component postcondition readback;
- sandbox-gated variants inside the existing dispatch/SPL/SPB/SPP writes;
- D3's three authorization joins and SPL binding/run projection.

DB helpers return rows, zero rows, or exceptions. They do not map HTTP,
foundation outcomes, component states, or residual codes. No SQL is added to
either new orchestration module.

`src/enable.js` keeps owner request/session/consent/handoff/audit order and uses
D4's neutral issuance functions. `src/sandbox-ownership.js` and
`src/spb-sandbox-lifecycle.js` keep lifecycle result mapping and release/cleanup
policy while delegating shared issuance mechanics. `src/dispatch-tokens.js`,
`src/spb-broker.js`, and `src/spp-authorize.js` update only the D3 time-aware
lookup calls. `src/relay-grant.js` owns both the ordinary cap and the exact
relay push, consistent with its existing service boundary
(`src/relay-grant.js:105-225`).

### D9: Bounded Reconciliation And Cron Attachment

Decision: `SANDBOX_RECONCILE_BATCH_SIZE = 10` is a module-private constant, not
an environment value or request parameter. The selector reads at most ten rows
in `cleanup_required`, `cleaning`, `expiry_pending`, or `cleanup_failed`, plus
rows in `provisioning` or `active` only when `lease_expires_at <= nowMs`. It
orders by `lease_expires_at ASC, created_at ASC, run_id ASC` and uses a literal
`LIMIT 10` (`src/db.js:1946-1961`).

One scheduled invocation performs at most one D6 pass per selected row. Each
pass has fixed local statements, one relay retirement attempt, and the existing
SPB cleanup caps of three joint passes and six maintenance credentials
(`src/spb-sandbox-lifecycle.js:16-18`). It never loops until a run releases.
Each row is wrapped in its own `try/catch`; failures increment `runs_failed`
and the loop continues. Selector/outer failure emits one counts-only
failure event. No run identifier enters either log.

Before invoking cleanup, the batch skips exactly a row whose SPB component is
`purge_pending` with residual `spb_credential_expiry_pending`, whose
`spb_retry_not_before` is a safe integer, and whose retry boundary is still in
the future. This honors the stored retry clock without excluding the row from
the deterministic due-run read (`src/sandbox-run-lease.js:455-511`).

The scheduled handler changes only the non-SPB branch at `src/index.js:968-982`:

1. `await runRetention(env)` first.
2. After it returns, `await reconcileExpiredSandboxRuns(env, ctx, ...)` inside
   a `try/catch` that emits only a stable event and counts.
3. Keep the `event.cron === '0 3 * * *'` branch exactly as-is: it awaits only
   `runSpbLapseSweep`.

This deliberately rejects the prep's `ctx.waitUntil` recommendation
(`docs/sandbox-run-lease-prep.md:519-555`). Sequential attachment is easier to
test and guarantees retention has completed before reconciliation can throw or
hang. A reconciliation hang can extend only the already-post-retention
invocation; it cannot delay or skip retention, and it cannot enter or delay the
separate `0 3 * * *` sweep branch. The reconciler catch prevents its throw from
failing the cron after retention.

The pre-existing retention cron assertion was strengthened, not relaxed: it
now pins the telemetry order `retention_sweep` before
`sandbox_run_reconcile_batch`. The additional warning is the new batch event;
retention's selection, cutoffs, effects, and deletions are unchanged. A second
case proves the retention deletion completes before a selector throw, and the
dedicated sweep case proves the `0 3 * * *` branch does not reconcile sandbox
runs (`test/retention.test.js:323-430`).

“Bounded batch” therefore means a stable ten-row query, one finite pass per row,
fixed per-component work, inherited SPB request caps, and no recursive drain of
the backlog. A backlog may delay physical cleanup by another six-hour tick, but
D3 authorization and SPL caps expire synchronously with the one-hour clock.

### D10: Telemetry And Secret Containment

Decision: the run controller writes no new identifier-bearing audit or hub
payload. D1 contains only the three allowed ownership UUIDs in their named
columns and normalized state/timestamps. It never stores plaintext dispatch,
Gemini, SPB, SPP, or R2 credentials; handoff data; email; prefix; object key;
journal content; or arbitrary request metadata.

Controller console records are JSON with exact allow-listed fields:

- `sandbox_run_create`: `event`, `outcome`, `components_completed`,
  `duration_ms`, `ts`;
- `sandbox_run_cleanup`: `event`, `trigger`, `outcome`,
  `components_released`, `components_pending`, `components_failed`,
  `components_conflicted`, `components_active`, `duration_ms`, `ts`;
- `sandbox_run_reconcile_batch`: `event`, `runs_examined`, `runs_advanced`,
  `runs_released`, `runs_failed`, `runs_skipped_for_retry`, `duration_ms`,
  `ts`;
- `sandbox_run_reconcile_batch_failed`: `event`, `runs_failed`.

`trigger` is only `post_failure | delete | scheduled`; outcomes and component
results are stable enums from this design. Errors never include `error.message`
or a caught value. If hub events are emitted, their details are the same stable
outcome/count subset and `tier: 'T4'`; they never include an admin principal or
any UUID. Existing foundation telemetry remains governed by the preceding
designs.

The only responses containing plaintext credentials are successful POST
responses after D5 activation. They are `no-store`. Failed POST, GET, DELETE,
logs, hub events, thrown errors, and D1 never contain them.

## Implementation Sequence

1. Add migration 0027, mirror it in `schema.sql` (including the “after 0027”
   header), and update `test/helpers.js` reset/dump/seed support. Add the
   migration test before any code references the table.
2. Add run-row insert/read, phase/status/component/retry/final CAS, stable batch
   selection, and direct verification helpers to `src/db.js`.
3. Add D3's joined authorization SQL and SPL projection/cap. Update the three
   production time call sites and the SPB post-sign CAS before issuing any new
   route credential.
4. Add the baseline-only `src/capability-issuance.js` seam and factor the four
   owner paths through it, preserving their exact response objects,
   handoff/audit ordering, and baseline SQL behavior. Do not add an uncalled
   run ownership branch at this stage.
5. Add the `ownership` descriptor, sandbox-only SPL `leaseExpiresAt`,
   run-fenced D1 write variants, and create-owned capped SPL grant together
   with `src/sandbox-run-lease.js` request validation, preflight, creation state
   machine, activation CAS, redacted report renderer, cleanup mapper, and
   bounded batch reconciler.
6. Route the three exact paths from authenticated `handleAdmin` and add only
   the `SANDBOX_ACCOUNT_ID` secret comments to `wrangler.toml`.
7. Attach the reconciler after awaited retention in the non-sweep scheduled
   branch, with per-run and outer counts-only catches.
8. Add the focused migration, route, payload, authorization, fault, cleanup,
   concurrency, cron, and leakage tests below. Keep owner behavior assertions
   unchanged and register each new source module in the static source inventory.
9. Run each requested focused check through `hop check`, followed by the
   explicitly required full `npm test` checks. Do not run `hop gate` for this
   lode.

## Test Plan

The 18 groups below map one-to-one to Definition of Done criteria 1 through 18.
Criterion 13 covers immediate lease enforcement; criterion 14 covers scheduled
cleanup isolation.

| Verification | Named tests and decisive assertions |
|---|---|
| S1 — migration/schema | `test/migration-0027-sandbox-run-lease.test.js` applies 0027 after local 0025+0026 shapes and asserts the exact ordered columns, types/nullability, seven statuses, ten provisioning phases, eight cleanup phases, six component states on all five components, closed residual sets, one-hour check, PK, three indexes, legacy-row preservation, duplicate-apply failure, every documented partial-apply recovery state, and `schema.sql` parity. Its legal-value loops and illegal inserts exercise each vocabulary directly. |
| S2 — two-layer admin boundary | `test/sandbox-run-admin.test.js` proves all three exact routes require Access, malformed/extra paths and unsupported methods retain `{error:'account not found'}`, unset/malformed `SANDBOX_ACCOUNT_ID` fails closed, and the pre-existing global HEAD rewrite mirrors member GET status/headers with an empty body for both existing and absent runs. Existing `test/admin.test.js` supplies wrong-key/issuer/audience/expiry, accepted email/service-principal, and exact admin security-header coverage; `test/static.test.js` continues to pin `workers_dev = false` and the custom route. |
| S3 — exact POST rejection | `test/sandbox-run-post.test.js` table-drives unreadable and non-object JSON, an empty/missing-key object, representative forbidden extras (`ttl`, `account_id`, `endpoint_url`), wrong version/type/profile, noncanonical IDs, absent account/Scout/key, non-approved Scout, and empty/undecryptable standing material. The malformed-input case asserts zero run/token/binding rows; baseline failures assert no run insertion. |
| S4 — no owner/session/handoff mutation | The successful `sandbox-run-post.test.js` case proves the standing key is read into the response but no plaintext capability is persisted or logged, and that neither a session nor `service_handoffs` row is created. Existing owner and foundation tests continue to pin their Scout/key, entitlement, handoff, and lifecycle behavior; the sandbox route does not call `ensureProvisionedKey`. |
| S5 — one nonterminal/exactly-once create | `test/sandbox-run-concurrency.test.js` races the same ID and different IDs for one account; each yields one `201`, one `409`, one row, and no credential in the losing response. `test/sandbox-run-post.test.js` separately pins sequential duplicate-ID `409` without replay, while the migration test proves multiple released rows are legal but a second nonterminal row is not. |
| S6 — durable intents/fault recovery | `test/sandbox-run-faults.test.js` makes each of the eight provisioning-phase CASes lose, injects fenced dispatch and SPB local-write throws, makes a successful SPL relay grant precede a throw before `spl_acquired`, makes response serialization throw after a winning activation, makes the activation CAS lose, and makes the winning insert throw. The local-write and post-grant cases pause automatic cleanup so authenticated GET proves the exact durable non-reversing intent phase before a later DELETE converges; the durable-`spb_intent` case additionally proves terminal release permits a fresh run for the account. The serialization case proves the run remains `active/active`, no credential escapes the closed fallback response, and DELETE converges. Other post-insert CAS losses release without returning credentials; insert failure leaves no row and emits the distinct stable `run_insert_failed` telemetry outcome. |
| S7 — journal payload/no persistence | `test/sandbox-run-payloads.test.js` asserts the literal exact sets `['account_id','created_at','dispatch_token','google_api_key']`, `['approved_at','service','state']`, `['account_id','broker_endpoint','broker_token','bucket','instance_id','prefix']`, and `['account_id','created_at','credential','endpoint_url','served_model_id']` against the real POST response. It also pins the exact top-level keys, no-store header, fixed endpoint/service values, SPB instance/prefix, absence of owner discriminators, and exact lease-capped relay body. The test does not invoke the external journal CLI. |
| S8 — owner factoring regression | The unchanged owner assertions in `test/enable-scout.test.js`, `test/enable-spl.test.js`, `test/enable-spb.test.js`, `test/enable-spp.test.js`, `test/handoff-scout.test.js`, `test/handoff-spl.test.js`, `test/handoff-spb.test.js`, `test/handoff-spp.test.js`, `test/provision-scout.test.js`, and `test/spp-boundary.test.js` pass with their existing object/byte and order contracts. `test/static.test.js` registers `capability-issuance.js` in its source inventory so the new seam is included in every static scan; no owner assertion was changed. |
| S9 — redacted fixed-order GET | `test/sandbox-run-get.test.js` pins the exact active report top-level fields, fixed component order and exact component fields; proves a boundary-expired stored-active row renders `lease_live: false` plus effective `deny_pending/lease_expired` without changing D1; and distinguishes a scoped canonical absent ID from an extra-segment admin 404 without account/instance leakage. A before/after `dbDumpText()` assertion proves GET does not mutate D1. |
| S10 — DELETE order/status | `test/sandbox-run-cleanup.test.js` pins independent denial, relay-before-SPL deletion, SPB purge, permanent evidence, and byte-stable repeated released `200`; expiry-only `202` with identical bounded JSON/header retry; redacted ownership-conflict `409` without incumbent mutation; account-present pre-acquisition SPB absence as verified release; interleaved account deletion/baseline binding insertion before fresh verification; and fail-closed `spb_lifecycle_absent` for account loss or absence at/after `spb_acquired`. |
| S11 — retry convergence | Four `test/sandbox-run-cleanup.test.js` cases landed with the scheduled-reconciliation commit and cover an allow-listed relay `retryable_residual`, partial R2 deletion, a D1 failure mid-cleanup, and process death after relay success before component acknowledgement. Each invokes the scheduled trigger and converges on a later pass without phase reversal or released-component regression. The inherited SPB drain/retry boundary remains covered by `test/spb-sandbox-cleanup.test.js`. |
| S12 — baseline/evidence preservation | The cleanup account-cascade case proves the no-FK evidence row survives with `account_missing` and never returns success. The two containment cases in `test/sandbox-run-concurrency.test.js` seed baseline, other-account, and other-run controls and prove DELETE/scheduled and scheduled/scheduled cleanup leave their D1 rows, relay instances, and R2 prefixes untouched while never deleting either evidence row. |
| S13 — immediate lease authorization and SPL cap | `test/dispatch-token.test.js`, `test/scout-status.test.js`, `test/spp-bindings-db.test.js`, `test/spp-authorize.test.js`, `test/spb-broker.test.js`, `test/sandbox-ownership.test.js`, and `test/spb-sandbox-lifecycle.test.js` cover the shared strict-future liveness contract, exact account/instance joins, baseline behavior and projections, denial cases, and SPB lookup-to-CAS lease loss. `test/relay-grant.test.js` and `test/billing-relay.test.js` pin the byte-identical null-run body, active min(base, lease-seconds) cap, and zero pushes for non-live/malformed joins; `test/sandbox-run-payloads.test.js` pins the create-owned positive grant. The provisioning-window ordinary-reconciliation race in Risks is deliberately accepted and has no test that would pin an unwanted regrant path. |
| S14 — cron isolation and bounded reconciliation | `test/retention.test.js` pins `retention_sweep` before `sandbox_run_reconcile_batch`, proves retention deletion completes before a selector throw is swallowed, and proves `0 3 * * *` runs only the SPB sweep. `test/sandbox-run-scheduled.test.js` proves deterministic `LIMIT 10` ordering with the remainder discoverable, per-run failure isolation, and exact retry-window skipping. `test/spb-sweep.test.js` continues to cover the dedicated sweep. |
| S15 — mint/create/delete races | `test/spb-broker.test.js` pins lookup-to-publication lease loss and both mint-versus-denial orderings. `test/sandbox-run-concurrency.test.js` proves cleanup can win the SPL grant window without a late activation or credential response, and that activation-before-DELETE reaches release without reactivation. |
| S16 — concurrent containment | `test/sandbox-run-concurrency.test.js` covers concurrent same/different-ID POSTs, create-versus-DELETE at the SPL grant boundary, activation-before-DELETE, DELETE-versus-DELETE, DELETE-versus-scheduled, and scheduled-versus-scheduled. The concurrent DELETE case observes exactly one successful terminal CAS while allowing either request's legal `200`/`202`/`503` result and proves the final row and all five components remain `released`. All cleanup races assert no baseline, other-account, or other-run token/binding/prefix/relay instance is adopted, revoked, listed, retired, or deleted, and both evidence rows remain. |
| S17 — complete leakage boundary | `test/sandbox-run-post.test.js`, `test/sandbox-run-faults.test.js`, and `test/sandbox-run-concurrency.test.js` use `dbDumpText()` and/or `installConsoleSpy()` against real capability plaintext and ownership IDs; cleanup's account-loss case captures D1/log output as well. They pin exact redacted `409`/`503` bodies, absence of capability material from D1 and telemetry, counts-only events, and no incumbent or cross-account details. |
| S18 — canonical account gate | The current partitioned gate passed at 114 Worker files / 981 tests, 4 passkey files / 21 tests, and 4 node files / 32 tests, covering migration, brand canon, owner/handoff, billing, retention, SPB sweep, all sandbox-run tests, partition completeness, static checks, and resource-measurement logic. The corrected pre-change baseline remains green at 110 Worker files / 904 tests plus static 1/10 (`docs/sandbox-run-lease-prep.md:1-111`). |

## Risks

- **SPL provisioning grant distinction.** The ordinary zero-cap rule and the
  required pre-activation positive grant cannot be the same call. D3's narrow
  create-owned grant is the smallest reconciliation: it is exact-instance,
  run-fenced, lease-capped, and protected by irreversible retirement. Accidentally
  routing it through ordinary account reconciliation would push zero and return
  unusable SPL capability; accidentally generalizing it would weaken the cap.
- **SPL provisioning-window ordinary-reconciliation race.** The exact window is
  after D5 step 4's create-owned positive grant and before step 7's activation
  CAS, while the stored run status remains `provisioning`. An ordinary
  reconciliation for the same account sees a non-active run, applies D3's
  required zero cap, and can overwrite the new grant with
  `entitled_until = 0`. The owner enable path requires a session and is not
  reachable for the synthetic account (`src/enable.js:475-480`); the Stripe webhook
  path is not reachable without operator action because the synthetic account
  has no subscription (`src/billing.js:175`). The single reachable trigger is
  an operator invoking Scout preapprove, approve, or revoke for the designated
  account: those admin paths call `reconcileAllServices` and therefore
  `reconcileSplEntitlement` (`src/admin.js:272`, `:300`, `:348`, `:395`,
  `:424`). The failure is fail-closed: SPL is denied rather than over-granted,
  but the journal's SPL capability is unusable for that run. Recovery is to
  DELETE the run and create a fresh `run_id`; no regrant path is added. This
  narrow, operator-triggered, recoverable window is accepted. Closing it by
  treating `provisioning` as grant-eligible would contradict criterion 13's
  requirement never to extend or re-grant a non-active run; moving the grant
  after activation would break the fixed side-effects-before-activation
  sequence. Both add worse semantics than accepting the fail-closed race.
- **Lost successful response.** A crash after activation strands an active
  one-hour run without replayable credentials. This is intentional exactly-once
  behavior. The caller must DELETE its known ID and use a fresh ID.
- **Retention of the designated account.** No code exempts it. If the operator
  removes every verified email and the account ages into retention, capability
  children cascade away while remote relay/R2 state may remain. The no-FK run
  row preserves evidence and cleanup reports residual instead of success, but
  operator repair may be required.
- **Six-hour physical-cleanup lag/backlog.** Authorization and SPL grant caps
  expire at one hour even if the ten-row scheduled batch is delayed. Remote and
  local tombstones may remain longer; a sustained backlog needs operational
  attention rather than an unbounded Worker invocation.
- **D1/remote transaction gap.** D1 cannot transact with the relay. Atomic
  run-fenced local writes, before/after phase CAS, a lease cap, and irreversible
  relay retirement cover both race orders; no design claims cross-service
  atomicity.
- **Wall-clock correctness.** Authorization, activation, retry rendering, and
  SPL seconds conversion depend on Worker time not moving backward. Boundary
  tests fix milliseconds/seconds explicitly; no renewal or stored expired flag
  masks a clock disagreement.
- **Persistent cleanup failure.** `cleanup_failed` remains nonterminal and
  blocks a new run. That is fail-closed. This design adds no force-release or
  operator override because either could strand remote state.
- **Schema width and CHECK maintenance.** Twenty-nine normalized columns are
  deliberate: one table satisfies scope and makes invalid vocabulary fail at
  D1. Future vocabulary changes require a table-rebuild migration, not a JSON
  compatibility alias.
- **Transient test infrastructure.** The earlier Undici socket close is a known
  non-reproducible flake, not a red baseline. The authoritative gate was green
  three consecutive times (`docs/sandbox-run-lease-prep.md:1-111`).

## For Jer

### Decided summary

- One 0027 `sandbox_runs` table, no account FK, seven statuses, ten provisioning
  phases, eight cleanup phases, five normalized component triples, and a
  partial unique index over the six nonterminal statuses.
- One fixed one-hour, nonrenewable lease. Liveness is only `active && now <
  lease_expires_at`; there is no stored `expired` state.
- One creation response, never replayed. Durable intents and run-fenced D1
  writes precede one activation CAS; only that CAS permits credentials to leave.
- One JSON-only module behind existing Access validation, one neutral issuance
  seam shared with owner paths, and all SQL in `db.js`. No session, HTML, or
  handoff participates in sandbox creation.
- One cleanup machine: quiesce, independent denial, relay retirement before SPL
  deletion, separate SPB expiry/purge, direct verification, permanent evidence.
- Absolute SPB retry time is copied monotonically from the tombstone; JSON and
  HTTP retry values match.
- Retention runs first; a literal ten-row reconciler runs sequentially afterward
  only in the non-SPB cron branch. No `waitUntil`.

### Options resolved and recommendations

1. **Status count:** use the scope's seven real statuses, not the prep's five
   and not invented symmetry states. The three additional cleanup statuses are
   observable HTTP/retry distinctions.
2. **Expiry authority:** derive liveness from active status plus the timestamp;
   reject a stored expired status because it can disagree with time.
3. **Activation failure semantics:** accept lost credentials after a winning
   activation/failed response delivery. Renewal or replay would violate
   creation-only exactly-once behavior.
4. **Retry representation:** store absolute milliseconds monotonically and
   mirror the derived relative integer in JSON and `Retry-After`. Never use an
   old run timestamp to excuse a missing SPB tombstone.
5. **Evidence survival:** omit the account FK and never delete run rows. A
   cascade-safe evidence row is required to report account loss honestly.
6. **Batch size:** fix ten rows and one pass each. This bounds work while the
   synchronous lease predicate supplies immediate denial independently of cron.
7. **Module shape:** use one run HTTP/orchestration module and one neutral
   issuance module. Splitting API from orchestration adds a third policy layer;
   putting it in `admin.js` or `enable.js` couples the sandbox to sessions/HTML.
8. **SPL pre-activation grant:** use the narrow direct create-owned grant in D3.
   A zero grant satisfies the ordinary cap but produces unusable SPL; a positive
   grant after activation violates the fixed side-effects-before-activation
   sequence. The recommended path preserves both owner reconciliation and the
   activation linearization while never exceeding the stored lease.
9. **Acceptance mapping:** use S1 through S18 one-to-one with Definition of Done
   criteria 1 through 18. Criterion 13 is immediate lease authorization and
   criterion 14 is scheduled cleanup isolation; every later group keeps the
   same number as the criterion it verifies.

### Payload discrepancy resolution

The SPP owner payload has both rejected extras—`state` and `instance_id`—and
SPB has `status` plus conditional `subscribe_url`. The shared primitives return
only the four journal tuples. Owner-only adapters reinsert those fields in the
current property order; the sandbox route never does. Nothing owner-visible is
allowed to change.

### Concurrency argument

The run insert/partial index selects the sole lease. Each intent CAS precedes a
local write whose SQL itself requires the exact provisioning run/phase, closing
the precheck race. Cleanup's status CAS either wins before that statement and
forces zero rows, or follows the committed row and releases it. The sole remote
issuance effect is capped SPL grant; irreversible relay retirement makes both
orders converge. Finally, activation can match only `provisioning/spp_acquired`
before expiry. Cleanup-first makes activation return zero and forbids a secret
response; activation-first owns creation, after which cleanup may only move the
status forward. No cleanup or stale issuer statement can reactivate a run or
regress a released component.

### Accepted risks

We accept lost create responses, a fixed ten-run cleanup backlog, reliance on
Worker wall clock, permanent nonterminal blocking on unresolved cleanup, the
narrow create-owned SPL grant distinction, and operator responsibility for the
designated account's verified email. We do not accept credential replay,
best-effort success, cascade absence as cleanup proof, a caller-selected value,
identifier-bearing telemetry, or a cleanup override.
