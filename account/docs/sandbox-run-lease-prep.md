# Sandbox Run Lease Prep

> **BASELINE IS GREEN.** An untouched-tree `npm test` rerun exited 0 three
> consecutive times: Worker config 110 files / 904 tests passed with zero
> errors, then static config 1 file / 10 tests passed. The earlier run below hit
> a non-reproducible Undici `other side closed` socket flake and consequently
> collected only 109 Worker files / 887 tests. Its verbatim evidence remains in
> Step 0 as a known transient, not as the baseline conclusion.

Research only. No production code, schema, migration, or permanent test file was
changed. One throwaway partial-index probe was required by Step 8 and was deleted
immediately after its focused run.

The implementation descriptions below are the pre-0027 research snapshot, not
a description of the subsequently shipped control plane. The final behavior is
recorded in `docs/sandbox-run-lease-design.md`; the evidence here is retained as
the basis for that design.

## Step 0 — Baseline

The first untouched attempt was:

```text
cd account && /usr/bin/time -p hop check -n 1200 -- npm test
```

It could not start because dependencies were absent. Verbatim result:

```text
hop check: `npm test` exited 127

> test
> vitest run --config vitest.config.js && vitest run --config vitest.static.config.js

sh: 1: vitest: not found
real 0.08
user 0.08
sys 0.01
```

After the repository-documented `npm install`, the same command ran the Worker
config. That attempt's assertions were all green, but it encountered one
unhandled error and collected only 109 of the expected 110 Worker files:

```text
 Test Files  109 passed (109)
      Tests  887 passed (887)
     Errors  1 error
   Start at  02:07:23
   Duration  23.69s (transform 18.37s, setup 0ms, collect 961.72s, tests 123.32s, environment 19ms, prepare 185.45s)

[vpw:dbg] Shutting down runtimes...
hop check: `npm test` exited 1
real 24.26
user 110.74
sys 22.07
```

The observed transient failure, verbatim:

```text
⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯

Vitest caught 1 unhandled error during the test run.
This might cause false positive tests. Resolve unhandled errors to make sure your tests are not affected.

⎯⎯⎯⎯⎯⎯ Unhandled Error ⎯⎯⎯⎯⎯⎯⎯
TypeError: fetch failed
 ❯ fetch node_modules/undici/index.js:112:15
 ❯ MessagePort.<anonymous> [worker eval]:28:22

Caused by: Error: other side closed
 ❯ Socket.onSocketEnd node_modules/undici/lib/client.js:1118:22
 ❯ Socket.emit node:events:521:24
 ❯ endReadableNT node:internal/streams/readable:1735:12
 ❯ process.processTicksAndRejections node:internal/process/task_queues:90:21
```

Because the package script connects the configs with `&&`, that failure meant
the static config did not start. It was therefore run independently through
`hop check`:

```text
cd account && /usr/bin/time -p hop check -n 1200 -- npx vitest run --config vitest.static.config.js

hop check: `npx vitest run --config vitest.static.config.js` exited 0

 Test Files  1 passed (1)
      Tests  10 passed (10)
   Start at  02:07:55
   Duration  282ms (transform 27ms, setup 0ms, collect 27ms, tests 74ms, environment 0ms, prepare 68ms)

real 0.62
user 2.97
sys 0.85
```

That attempt executed 110 files across the separately invoked configs: 897
tests passed with zero assertion failures and one unhandled Worker-config error;
its combined wall time was 24.88s. It was not a complete gate because the
Worker error prevented the package script's static-config leg.

The untouched tree was subsequently rerun with `cd account && npm test` three
consecutive times. Every rerun exited 0: the Worker config reported `Test Files
110 passed (110)`, `Tests 904 passed (904)`, and zero errors; the static config
reported `Test Files 1 passed (1)` and `Tests 10 passed (10)`. There are 111
`test/*.test.js` files in total, and `static.test.js` belongs to the static
config, so 110 is the correct full Worker collection. The authoritative
baseline is therefore **green**. The preserved trace above is a
non-reproducible Undici socket flake that cost one collected file and 17 tests,
not a pre-existing test failure.

## Pre-Implementation Substrate

The two preceding sandbox lodes deliberately stopped short of a run registry:
the ownership design excluded one at
`docs/sandbox-ownership-design.md:33-40`, and the SPB lifecycle design repeated
that boundary at `docs/spb-sandbox-lifecycle-design.md:49-55`. The current
schema instead carries nullable `sandbox_run_id` tags on dispatch tokens
(`schema.sql:132-145`), SPL bindings (`schema.sql:301-320`), SPB bindings
(`schema.sql:322-343`), and SPP bindings (`schema.sql:345-366`). There is no
`sandbox_runs` table in `schema.sql`; the latest checked-in migrations are 0025
and 0026 (`migrations/0025_sandbox_run_ownership.sql:1-43`,
`migrations/0026_spb_sandbox_lifecycle.sql:1-52`).

Tests rebuild D1 by dropping the known tables and replaying `schema.sql`
statement by statement (`test/helpers.js:118-154`). A run registry therefore
requires both the consolidated schema and that drop list to change, plus a
fixture capable of creating leased run rows. Existing ownership fixtures already
accept `sandboxRunId` for SPL (`test/helpers.js:656-671`), SPP
(`test/helpers.js:674-711`), and SPB (`test/helpers.js:714-754`).

One existing documentation inconsistency is relevant to review: the consolidated
schema header still says “after 0025” (`schema.sql:1`) even though the file
contains the 0026 SPB lifecycle columns and audit shape
(`schema.sql:322-343`, `:401-414`). This prep does not correct it.

## Step 1 — Authorization-Join Call-Site Inventory

### Production lookup surface

| Lookup | Exact current projection and negative result | Every production caller |
|---|---|---|
| `findActiveDispatchToken` (`src/db.js:491-497`) | `SELECT account_id`; filters by exact `token_hash` and `revoked_at IS NULL`; returns the row or `null`. | Imported only by `src/dispatch-tokens.js:1-3`; called by `resolveDispatchToken` at `:15-19`. |
| `findSppBindingByTokenHash` (`src/db.js:1601-1611`) | `SELECT account_id, instance_id`; filters by exact non-null `token_hash`; returns the row or `null`. | Imported by `src/spp-authorize.js:1-3`; called by `handleSppAuthorize` at `:25-30`, where null is the same empty 401 used for an unknown entitlement credential. |
| `findSpbBindingByTokenHash` (`src/db.js:1518-1528`) | `SELECT account_id, instance_id, lapsed_at, sandbox_run_id`; filters by exact non-null `token_hash`; returns the row or `null`. | Imported by `src/spb-broker.js:1-8`; called by `handleBackupCredentials` at `:28-43`, where null takes the content-free pre-identity 401 path at `:35-38`. |

The complete dispatch authorization chain is:

1. `resolveDispatchToken` rejects a blank/non-string token, hashes it with
   `DISPATCH_TOKEN_PEPPER`, calls `findActiveDispatchToken`, and projects only
   `{ accountId }` (`src/dispatch-tokens.js:14-20`).
2. `resolveBearerAccount` parses the Bearer header, maps missing/unresolved
   values to `{ error: 'invalid_token' }`/401, and otherwise returns that
   projected account (`src/dispatch-tokens.js:22-33`).
3. `handleScoutStatus` calls `resolveBearerAccount` before either account-scoped
   read, then reads the application and active key only for the resolved account
   (`src/enable.js:296-309`).
4. The router exposes that chain only at `GET /account/scout/status`
   (`src/index.js:844-852`).

`devices.js` imports `mintDispatchToken` and `resolveDispatchToken` at
`src/devices.js:8` and re-exports both at `:17`. No production module imports
either re-export: `src/index.js:47-56` imports only device HTTP handlers, while
`src/enable.js:10` and `src/sandbox-ownership.js:9` import the dispatch module
directly. The re-exports are consumed by `test/dispatch-token.test.js:3` and the
mint half by `test/scout-status.test.js:4`; no other module imports them.

### Tests that pin lookup and null behavior

These are the current tests whose behavior or fixture setup must be reconciled
with a lease join. Direct helper equality pins the current SELECT projections;
HTTP-level equality pins the caller-visible positive and null branches.

| Lookup | Test file and title | Assertion that would move if lease filtering changes |
|---|---|---|
| Dispatch | `test/dispatch-token.test.js` — “mints and resolves a dispatch token” | `expect(resolved).toEqual({ accountId: account.accountId })` (`:15-30`). |
| Dispatch | same file — “returns null for mutated plaintext”; “returns null for revoked token rows”; “uses DISPATCH_TOKEN_PEPPER not HMAC_PEPPER” | Each expects `resolveDispatchToken(...).resolves.toBeNull()` (`:41-59`, `:83-90`). |
| Dispatch | same file — “keeps prior dispatch tokens valid when minting again”; “does not resolve account B from account A's token” | Both expect exact account projections for every active baseline row (`:62-80`). |
| Dispatch/status | `test/scout-status.test.js` — “rejects garbage token”; “rejects SERVER-REVOKED dispatch token” | Both pin 401 plus `{ error: 'invalid_token' }` (`:115-120`, `:129-147`). Missing and malformed Bearer tests stop before the lookup (`:108-127`). |
| Dispatch/status | `test/sandbox-ownership.test.js` — “mints hash-only rows and releases every exact-run token without touching other rows” | Released run tokens resolve null, while another run, another account, and a baseline token remain resolvable (`:303-358`). A join that requires a run row would make those unregistered non-null run fixtures fail before release. |
| Dispatch/status | same file — “denies the old Scout status token without changing Scout or key state” | The sandbox token is 200 before release and 401 afterward (`:386-419`). |
| SPP | `test/spp-bindings-db.test.js` — “round-trips tokens and preserves created_at on upsert” | Exact lookup result is `{ account_id, instance_id }`; the rotated-out hash is null and the new hash resolves (`:17-70`). |
| SPP | `test/spp-authorize.test.js` — “authorizes an active portal binding without returning identity data”; parameterized “fails closed for unknown entitlement credential”; “rejects a real binding whose entitlement is no longer active” | The live binding is 204 (`:15-24`), unknown token is 401 (`:26-40`), and entitlement failure remains a post-identity 401 (`:42-57`). |
| SPP | `test/sandbox-ownership.test.js` — “stops authorization immediately without changing entitlement or engine configuration” | A run-owned binding is 204 before release and 401 after deletion (`:438-480`). It currently has no registry row to join. |
| SPB | `test/spb-broker.test.js` — “mints backup credentials with the Cloudflare R2 local-signing JWT shape” | A baseline lookup reaches the 200 mint and its seven-key result (`:53-102`). |
| SPB | same file — “durably advances the exact serialized 90-second sandbox expiry before responding”; “returns a lower-expiry sandbox credential without decreasing the durable maximum”; “uses only counts-only sandbox evidence for post-identity entitlement and scope refusals”; “discards every signed field when token rotation wins after signing and before the CAS”; “keeps a winning expiry CAS durable when response production fails afterward”; “serializes mint-versus-denial in both orders without an untracked credential”; “records only sandbox internal-error evidence after resolving run ownership” | Every title enters through a non-null-run binding and would fall into the pre-identity null/401 path if the new join could not find its run (`:105-194`, `:196-315`, `:316-461`). None currently seeds a run registry. |
| SPB | same file — “does not write D1 audit rows for pre-identity auth refusals” | Missing/malformed/unknown/wrong-pepper credentials all remain pre-identity 401s with no D1 mint audit (`:554-578`). |
| SPB | same file — “serializes mint-versus-denial in both orders without an untracked credential” | Denial nulling the token makes the raced lookup/CAS return 401, while a prior winning mint remains tracked (`:366-421`). |
| SPB | `test/spb-sandbox-lifecycle.test.js` — “denial clears only the exact token and preserves lifecycle state with identifier-free evidence”; “clearSpbBindingLapsed cannot restore a denied token” | Both directly expect `findSpbBindingByTokenHash(...).resolves.toBeNull()` after denial (`:175-238`, `:425-453`). |
| SPB/owner handoff | `test/enable-spb.test.js` — “mints a broker token that authenticates against the backup credential broker” | The owner-issued baseline token reaches a 200 broker response (`:258-285`). |

The safe join shape is a design decision, but the evidence constrains it: null
`sandbox_run_id` is the baseline authorization class and must remain authorized
without a run row (`schema.sql:301-303`; `test/spb-broker.test.js:97-102`), while
a non-null run ID must become conditional on a live lease. Existing non-null-run
tests will need a run fixture rather than a compatibility exception; silently
authorizing a missing run would defeat the lease.

## Step 2 — Factoring Blast Radius In `enable.js`

### Shared storage/serving mechanics

All four owner flows currently construct an ordinary object, serialize it with
`JSON.stringify`, encrypt it, and insert it into `service_handoffs`: Scout at
`src/enable.js:267-283`, SPL at `:499-516`, SPB at `:610-629`, and SPP at
`:759-779`. `insertServiceHandoff` reports a duplicate nonce separately from an
operational exception (`src/db.js:615-636`). Each handoff endpoint atomically
consumes the encrypted row, decrypts, parses, and reserializes it through the
common JSON response helper (`src/enable.js:391-415`, `:524-548`, `:638-662`,
`:790-815`; `src/index.js:225-234`).

No listed test compares raw plaintext response bytes to a literal string. The
tests use exact parsed-object equality, which freezes keys and values but not
whitespace or key ordering. The current owner-visible bytes are nevertheless
deterministic because both storage and response use `JSON.stringify` on objects
created in the source order above (`src/enable.js:274`, `:508`, `:622`, `:771`;
`src/index.js:225-226`).

### Per-path assertions and ordering boundaries

| Path | Shape/key-set assertions | Ordering/side-effect assertions |
|---|---|---|
| Scout | Approved exact equality is `expect(payload).toEqual({ state: 'approved', google_api_key, dispatch_token, account_id, created_at })` (`test/enable-scout.test.js:101-107`). Pending exact equality pins `state, account_id, since, dispatch_token` (`:285-290`, `:359-364`). Revoked exact equality pins only `state, account_id` (`:529-549`). `test/provision-scout.test.js` independently pins the four-key provision result without `state` (`:17-35`). | Provisioning gets/reuses the Gemini key before minting the dispatch token (`src/enable.js:92-100`), and the completed provision precedes handoff insertion (`:253-283`). “does not create another GCP key when handoff insert fails and the user retries” pins one GCP create across a failed insert and retry (`test/enable-scout.test.js:115-142`). “returns the global error page without a success handoff when the apply batch fails” pins application mutation before pending issuance (`:298-316`). |
| SPL | Approved exact equality pins `{ service: 'spl', state: 'approved', approved_at }` (`test/enable-spl.test.js:131-155`, `:277-314`). Needs-subscription exact equality pins `{ service: 'spl', state: 'needs_subscription', subscribe_url }` (`:185-210`). | Optional binding claim happens before reconciliation and payload insertion (`src/enable.js:487-516`). A claim conflict leaves the incumbent byte-identical and writes no handoff (`test/enable-spl.test.js:241-264`). Insert/encryption failures return 503 with no consumable handoff (`:161-182`). Inline relay grant bodies are pinned after reconciliation (`:217-238`). |
| SPB | Needs-subscription exact equality pins the six binding fields plus `status` and `subscribe_url` (`test/enable-spb.test.js:139-169`). Approved exact equality pins the same six binding fields plus `status`, without `subscribe_url` (`:209-235`). | Token generation/hash and guarded binding claim precede reconciliation; reconciliation precedes payload encryption/insertion (`src/enable.js:594-629`). “returns the SPB error before reconciliation or handoff when the baseline claim loses” pins exactly that fail-closed order, including no entitlement and no handoff mutation (`test/enable-spb.test.js:172-206`). |
| SPP | Approved exact equality pins `state, endpoint_url, served_model_id, credential, account_id, instance_id, created_at` (`test/enable-spp.test.js:305-337`). The non-scout response separately pins the one-key `{ state: 'early_access' }` payload (`:103-124`, `:227-244`, `:436-454`). | Scout approval is re-read before token mint/binding (`src/enable.js:739-757`); binding and entitlement precede handoff insertion, and the minted audit occurs only after a successful fresh handoff insert (`:747-787`). A binding conflict produces no handoff/audit (`test/enable-spp.test.js:359-386`); a duplicate handoff produces no minted audit and preserves the old payload (`:420-433`). |

The `handoff-*` suites pin lossless service-scoped round trips rather than owner
issuance logic. SPL defines an exact three-key constant and expects it back
unchanged (`test/handoff-spl.test.js:14-18`, `:41-63`, `:70-86`); SPB defines
and exactly compares its seven-key approved constant
(`test/handoff-spb.test.js:15-23`, `:46-68`, `:75-91`); SPP does the same for its
seven-key owner shape (`test/handoff-spp.test.js:16-24`, `:47-69`, `:76-92`).
The Scout handoff test checks the secret values but its seeded object omits
`state`, so it does not independently freeze the full approved key set
(`test/handoff-scout.test.js:35-68`).

`test/spp-boundary.test.js` does not inspect a handoff payload or call order. It
pins owner-visible SPP copy across consent, early access, landing, settings,
data-reference, and catalog HTML (`:80-137`), so factoring must not change those
renderers as a side effect.

The remaining handoff-adjacent suites do not add an owner payload contract:
`test/service-handoff-pepper.test.js` pins pepper derivation and nonce hashing
only (`:5-37`), while migrations 0018 and 0022 use opaque sentinel
`payload_encrypted` values to prove table-copy/index behavior
(`test/migration-0018-service-handoffs-spb.test.js:16-63`,
`test/migration-0022-spp-service-handoffs.test.js:16-65`).

### Frozen owner-visible byte templates

With values represented by angle-bracket placeholders, current source order
produces these bytes:

```text
scout approved: {"state":"approved","google_api_key":"<key>","dispatch_token":"<token>","account_id":"<account>","created_at":"<iso>"}
scout pending:  {"state":"pending","account_id":"<account>","since":<milliseconds>,"dispatch_token":"<token>"}
scout revoked:  {"state":"revoked","account_id":"<account>"}

spl approved:   {"service":"spl","state":"approved","approved_at":"<iso>"}
spl unentitled: {"service":"spl","state":"needs_subscription","subscribe_url":"<url>"}

spb approved:   {"broker_endpoint":"<url>","account_id":"<account>","instance_id":"<instance>","bucket":"<bucket>","prefix":"<prefix>","broker_token":"<token>","status":"approved"}
spb unentitled: {"broker_endpoint":"<url>","account_id":"<account>","instance_id":"<instance>","bucket":"<bucket>","prefix":"<prefix>","broker_token":"<token>","status":"needs_subscription","subscribe_url":"<url>"}

spp approved:   {"state":"approved","endpoint_url":"<url>","served_model_id":"<model>","credential":"<token>","account_id":"<account>","instance_id":"<instance>","created_at":"<iso>"}
spp refused:    {"state":"early_access"}
```

Those templates follow the literal object construction and conditional append
sites (`src/enable.js:235-274`, `:499-505`, `:610-619`, `:665-677`, `:759-767`).
A shared sandbox issuance primitive is therefore allowed to change **nothing
owner-visible**: not keys, values, omission rules, source order/serialized bytes,
encryption/one-shot delivery, or side-effect order. It may share lower-level
value generation only if the existing owner objects and sequencing remain at
these call sites, or expose a separate internal contract adapter.

## Step 3 — Payload Contract Reconciliation

The journal sandbox validator first compares `set(payload)` for exact equality;
extra and missing keys both raise `PayloadValidationError`
(`~/projects/solstone-journal/solstone/think/sandbox_profile/capabilities.py:154-164`).
Its field sources are `_HANDOFF_FIELDS` for Scout and SPP, a local SPL tuple, and
SPB `_BINDING_FIELDS`
(`~/projects/solstone-journal/solstone/think/sandbox_profile/capabilities.py:27-33`).

| Capability | Journal exact key set | Approved owner payload key set | Owner-only extras |
|---|---|---|---|
| `scout` | `google_api_key, dispatch_token, account_id, created_at` (`~/projects/solstone-journal/solstone/think/services/scout.py:25-27`) | `state, google_api_key, dispatch_token, account_id, created_at` (`src/enable.js:92-100`, `:267-268`) | `state` |
| `spl` | `service, state, approved_at` (`~/projects/solstone-journal/solstone/think/sandbox_profile/capabilities.py:31-33`) | `service, state, approved_at` (`src/enable.js:499-505`) | none for the approved variant; the owner needs-subscription variant replaces `approved_at` with `subscribe_url` and is rejected because the sandbox validator requires an approved classification (`capabilities.py:185-192`). |
| `spb` | `broker_endpoint, account_id, instance_id, bucket, prefix, broker_token` (`~/projects/solstone-journal/solstone/think/services/spb_handoff.py:18-25`) | Those six plus `status` (`src/enable.js:610-618`) | `status`; when unentitled, `subscribe_url` is appended conditionally at `src/enable.js:619`, so that variant has `status, subscribe_url` as extras. |
| `spp` | `endpoint_url, served_model_id, credential, account_id, created_at` (`~/projects/solstone-journal/solstone/think/services/spp.py:32-38`) | `state, endpoint_url, served_model_id, credential, account_id, instance_id, created_at` (`src/enable.js:759-767`) | **`state` and `instance_id`** |

The independently verified SPP result therefore confirms the stated correction:
the owner payload has two rejected fields, not one. The journal exact validator
uses `_SPP_FIELDS` and then the ordinary SPP value validator
(`~/projects/solstone-journal/solstone/think/sandbox_profile/capabilities.py:215-220`),
so neither extra is tolerated.

Scout's table row is specifically the approved owner shape. Owner pending and
revoked payloads have different tuples (`src/enable.js:235-271`) and cannot pass
the sandbox Scout exact-field plus non-empty-string validation
(`~/projects/solstone-journal/solstone/think/sandbox_profile/capabilities.py:177-182`;
`~/projects/solstone-journal/solstone/think/services/scout.py:69-80`). A sandbox
POST must therefore return the approved journal tuple, not reuse the owner
wrapper with `state` and not return pending/revoked variants.

The CLI input boundary is one JSON object of at most 64 KiB. It reads
`MAX_STDIN_BYTES + 1`, rejects more than 64 KiB, uses a duplicate-key-rejecting
decoder, rejects trailing content, and rejects non-object JSON
(`~/projects/solstone-journal/solstone/think/sandbox_profile/cli.py:181-211`);
the constant is `64 * 1024` at `cli.py:37`. The manifest contract is
`CONTRACT_VERSION = 1`, `PROFILE = "full"`, and `APPLY_CAPABILITIES =
("scout", "spl", "spb", "spp")`
(`~/projects/solstone-journal/solstone/think/sandbox_profile/manifest.py:16-17`,
`:21-39`).

SPB has one additional response constraint: after exact/nonblank field checks,
the journal reads its prepared runtime `instance_id` and rejects a payload whose
`instance_id` differs with `spb_instance_mismatch`
(`~/projects/solstone-journal/solstone/think/sandbox_profile/capabilities.py:195-212`).
Consequently, the sandbox POST may return only an SPB binding for the runtime
instance supplied by the prepared journal; it cannot substitute a server-minted
or unrelated instance ID.

## Step 4 — SPL Relay Cap Mechanics

`listSplBindings` currently returns only `instance_id`
(`src/db.js:1453-1459`). `syncAccountEntitlementToRelay` reads one account
entitlement, computes one `entitledUntil`, and sends that identical value to
every returned binding (`src/relay-grant.js:198-206`). The wire body is exactly
`{ instance_id, entitled_until }` (`src/relay-grant.js:105-116`).

### Production reconciliation callers

`reconcileSplEntitlement` has three production entry classes:

1. The owner SPL confirm awaits it after an optional successful binding claim
   (`src/enable.js:487-497`).
2. `reconcileAllServices` calls it before SPB and SPP reconciliation
   (`src/spb-entitlement.js:65-69`). Every production caller of
   `reconcileAllServices` is in the admin Scout lifecycle: already-approved and
   newly-approved paths (`src/admin.js:258-264`, `:285-292`), revoke after key
   disable (`:334-339`), and already/newly preapproved paths (`:381-387`,
   `:409-416`). The admin router reaches those handlers at
   `src/admin.js:213-219`.
3. Stripe's `reconcileForService` sends non-SPB events to SPL reconciliation
   (`src/billing.js:169-176`). Its five callers are checkout completed
   (`:178-193`), subscription updated (`:195-210`), subscription deleted
   (`:212-217`), invoice paid (`:219-233`), and invoice payment failed
   (`:235-247`). They are selected only after signature verification and event
   parsing in `handleStripeWebhook` (`:124-143`), routed at
   `src/index.js:938-945`.

There is no cron caller of either reconciliation function. The scheduled handler
calls only `runSpbLapseSweep` for `0 3 * * *` and `runRetention` for every other
cron (`src/index.js:967-973`); its only entitlement-related imports are constants
used by page rendering (`src/index.js:113-117`, `:979-986`).

### Required cap shape

At minimum `listSplBindings` must additionally select `sandbox_run_id`, which is
already stored on every SPL binding (`schema.sql:304-317`). Once the run table
exists, the bounded-read version should return the run's absolute lease expiry
in the same query (a left join for the nullable run ID), yielding
`instance_id, sandbox_run_id, lease_expires_at`. Doing so avoids one run lookup
per binding while retaining the current account-bounded collection read.

Recommended per-binding calculation, assuming run lease timestamps are stored in
milliseconds like existing Worker lifecycle timestamps:

```text
base = entitledUntilFor(entitlement, nowSeconds, env)
bindingEntitledUntil = sandbox_run_id === null
  ? base
  : Math.min(base, Math.floor(lease_expires_at / 1000))
```

The null branch must pass the already computed `base` to
`pushEntitlementGrant` unchanged. That makes a baseline binding's JSON body
byte-identical to today; only a run-owned row is capped. Missing/invalid lease
data for a non-null run must fail closed rather than receive the account-wide
grant. The seconds conversion is required because relay grants and Stripe period
ends are seconds (`src/relay-grant.js:34-43`, `:105-116`), while binding and
retention timestamps are milliseconds (`src/db.js:1293-1311`,
`src/retention.js:1-5`).

Tests that pin the current POST grant body are:

- `test/relay-grant.test.js`: the direct relay-safe shape
  (`:50-66`, `:68-98`), every-binding fanout (`:151-169`), zero grants
  (`:171-187`), and reconciliation-derived comp/lapse grants (`:189-285`).
- `test/enable-spl.test.js`: new unentitled binding gets zero and an active
  binding gets the exact paid period (`:185-210`, `:217-238`).
- `test/billing-relay.test.js`: Stripe reconciliation posts the exact paid
  period (`:35-49`).
- `test/scouts-admin.test.js`: admin approval and revoke pin comp-through and
  zero bodies (`:246-256`, `:348-358`).

`test/relay-retire.test.js` does **not** pin the entitlement-grant POST body. It
pins the separate `DELETE /admin/instances/:id` request and the strict retirement
response vocabulary (`:35-118`, `:120-150`). It remains relevant to the SPL
relay teardown component, not to grant capping.

## Step 5 — SPB Retry-Not-Before Derivation

`cleanupSpbSandboxBinding` reads the tombstone and, when its absolute
`sandbox_credential_expires_at` is still in the future, returns
`{ outcome: 'credential_expiry_pending', retry_after_seconds }`, where the
relative value is `ceil((expiry - nowMs) / 1000)`
(`src/spb-sandbox-lifecycle.js:99-149`). The durable expiry is monotonically
advanced by `advanceSpbSandboxCredentialExpiry`
(`src/db.js:1530-1555`), called after signing and before returning a sandbox
credential (`src/spb-broker.js:99-118`). Sandbox external credentials have a
fixed 90-second TTL (`src/r2-credential.js:25`, `:55-66`), and tests pin the
serialized expiry and durable maximum (`test/spb-broker.test.js:105-194`).

To render a fresh, bounded `retry_after_seconds` on a later GET, the run row
should store an **absolute** `retry_not_before` timestamp, not the relative
seconds returned by one cleanup attempt. GET can then render
`max(1, ceil((retry_not_before - nowMs) / 1000))` while the timestamp is future
and clear/ignore it after the bound. The design should validate it as a safe
integer and cap any externally rendered value to the fixed sandbox-credential
window; the normal source cannot legitimately create an unbounded delay because
the credential TTL is 90 seconds (`src/r2-credential.js:25`, `:64-65`).

It is technically possible to derive the value on every read from the SPB
tombstone using `findSpbSandboxLifecycleByInstance`, whose projection includes
`sandbox_credential_expires_at` (`src/db.js:1584-1599`). That is not sufficient
as the only run-level source:

- verified cleanup deletes the tombstone (`src/spb-sandbox-lifecycle.js:268-310`);
- `spb_bindings.account_id` has `ON DELETE CASCADE` (`schema.sql:333-335`); and
- the accepted lifecycle risk explicitly says account deletion can remove a
  tombstone before cleanup, after which `absent` is not proof of R2 purge
  (`docs/spb-sandbox-lifecycle-design.md:1184-1191`).

Recommendation: copy the absolute tombstone expiry into run-level
`retry_not_before` whenever cleanup reports `credential_expiry_pending`, and
persist it in the same CAS that records the component result. Tombstone reads
remain the authority for attempting cleanup; the run copy is the authority for
rendering a stable retry bound after that attempt. If the tombstone disappears
before the controller ever observes its expiry, the value is unknowable and the
run must report an `spb_lifecycle_absent` residual rather than invent zero.

## Step 6 — Residual Vocabulary Map

### Exact foundation outcomes

| Helper | Returned outcome strings | Evidence |
|---|---|---|
| `mintSandboxDispatchToken` | No `outcome`; returns the mint object with plaintext token metadata. | `src/sandbox-ownership.js:12-15`; `src/dispatch-tokens.js:5-11` |
| `claimSandboxSplBinding` | `claimed`, `ownership_conflict` | `src/sandbox-ownership.js:17-31` |
| `claimSandboxSppBinding` | `claimed` plus credential, `ownership_conflict` | `src/sandbox-ownership.js:33-54` |
| `releaseSandboxDispatchTokens` | `released`, `ownership_conflict`, `absent` | `src/sandbox-ownership.js:58-74` |
| `releaseSandboxSplBinding`, `releaseSandboxSppBinding` | `released`, `ownership_conflict`, `absent` | `src/sandbox-ownership.js:76-105` |
| `claimSpbSandboxBinding` | `claimed` plus credential, `ownership_conflict` | `src/spb-sandbox-lifecycle.js:20-39` |
| `denySpbSandboxBinding` | `released`, `absent`, `ownership_conflict`; operational failure records `internal_error` and throws `SpbSandboxDenialError` rather than returning it | `src/spb-sandbox-lifecycle.js:41-82` |
| `cleanupSpbSandboxBinding` | `credential_expiry_pending` plus `retry_after_seconds`, `cleaned`, `retryable`, `denial_required`, `absent`, `ownership_conflict` | `src/spb-sandbox-lifecycle.js:85-149`, `:268-385` |
| `retireRelayInstance` | `retired` plus relay state/checks, `retryable_residual` plus failed component/checks, `failed`; an invalid instance identifier throws before an outcome is returned | `src/relay-grant.js:139-195`, `:220-223` |

For relay retirement, the nested accepted 200 states are `retired`,
`already_retired`, and `absent`; retryable failed components are
`retired_state`, `instance_do_cleanup`, `rk_do_cleanup`, `device_revocation`,
`entitlement_clear`, `pending_grant_clear`, `rk_registry_clear`, and
`verification` (`src/relay-grant.js:12-32`).

### Candidate GET mapping in fixed component order

Recommendation: expose components in the fixed array order **dispatch, SPP,
SPB, SPL relay, SPL binding**. Use one component state vocabulary
`pending | complete | retryable | blocked`, with a nullable `residual_code`.
Preserve raw helper outcomes in the run row for operator evidence; map them to
the external component state as follows.

| Component | Helper result | Candidate state / residual code |
|---|---|---|
| dispatch | `released`; or `absent` when the run row proves dispatch was claimed | `complete / null` |
| dispatch | `ownership_conflict`; unproven `absent` | `blocked / dispatch_ownership_conflict`; `blocked / dispatch_ownership_absent` |
| SPP | `released`; or proven idempotent `absent` | `complete / null` |
| SPP | `ownership_conflict`; unproven `absent` | `blocked / spp_ownership_conflict`; `blocked / spp_ownership_absent` |
| SPB | denial `released` followed by cleanup `cleaned` | `complete / null` |
| SPB | `credential_expiry_pending`; `retryable` | `retryable / spb_credential_expiry_pending`; `retryable / spb_cleanup_retryable` |
| SPB | `denial_required`; `ownership_conflict`; `absent` | `blocked / spb_denial_required`; `blocked / spb_ownership_conflict`; `blocked / spb_lifecycle_absent` |
| SPL relay | `retired` | `complete / null` |
| SPL relay | `retryable_residual` | `retryable / spl_relay_<failed_component>` using the eight validated components |
| SPL relay | `failed` | `blocked / spl_relay_failed` |
| SPL binding | `released`; or proven idempotent `absent` | `complete / null` |
| SPL binding | `ownership_conflict`; unproven `absent` | `blocked / spl_ownership_conflict`; `blocked / spl_ownership_absent` |

The “proven” qualifier follows the existing design: local `absent` can mean
never claimed, already released, or cascade-deleted, and only a prior `claimed`
result establishes acquisition (`docs/sandbox-ownership-design.md:190-193`).
SPB `absent` is stricter because it is explicitly not proof of R2 purge
(`docs/spb-sandbox-lifecycle-design.md:1184-1191`).

All current foundation helpers report an operation-time result, but several do
not provide a read-only later postcondition for GET:

- dispatch release leaves revoked rows in D1, and the only current run read is
  inside the mutating release batch (`src/db.js:455-488`); drift verification
  must read D1 directly by run/account and assert no active row and no mixed
  account;
- SPL/SPP release helpers are mutating `DELETE + SELECT` batches
  (`src/db.js:1395-1450`); a read-only GET must query the relevant incumbent by
  instance directly or trust a CAS-persisted component result;
- SPB has a read helper (`src/db.js:1584-1599`), but an absent row cannot verify
  R2 cleanup, so only `cleanupSpbSandboxBinding`'s `cleaned` result is a positive
  destructive postcondition (`src/spb-sandbox-lifecycle.js:185-230`, `:268-310`);
- SPL relay has no local D1 postcondition. Its positive evidence is the strict
  all-checks-true response from `retireRelayInstance`
  (`src/relay-grant.js:162-188`).

Recommendation: GET reads the durable run/component rows only. The reconciler
performs any direct D1 verification or external helper call and records its
result through CAS; GET must not invoke a mutating release/retirement helper.

## Step 7 — Cron Attachment

The Worker has two cron expressions, six-hour retention and daily SPB lapse
sweep (`wrangler.toml:125-126`). `scheduled()` distinguishes the daily sweep by
literal cron and `await`s one branch; it receives `ctx`, but `runRetention` does
not (`src/index.js:967-973`). `runRetention` itself awaits a fixed ordered list of
12 D1 statements and catches/logs the first failure (`src/retention.js:22-27`,
`:102-120`). Tests pin both branch selection and the fact that the daily sweep
does not run retention (`test/retention.test.js:322-364`).

| Attachment option | Failure mode |
|---|---|
| Await reconciler **before** `runRetention` in the `else` branch | A throw skips retention; a hung promise prevents retention from starting. Rejected. |
| Await reconciler **after** `runRetention` in the `else` branch | A throw/hang cannot skip already-completed retention, but it rejects or indefinitely delays completion of the scheduled invocation. Better ordering, still unnecessarily coupled. |
| Put reconciler inside `runRetention` before or among the statement loop | A throw can be caught as a misleading retention failure, and a hang or slow batch delays later retention statements. It also expands a fixed 12-statement retention function with another lifecycle. Rejected (`src/retention.js:27-107`, `test/retention.test.js:263-290`). |
| Put reconciler inside `runRetention` after the loop | Retention statements finish first, but the function's completion and its existing success/failure telemetry become coupled to reconciliation. `runRetention` also has no `ctx` for background attachment (`src/retention.js:22`, `src/index.js:971`). Rejected. |
| In the `else` branch, first `await runRetention(env)`, then attach a deferred, caught reconciler promise with `ctx.waitUntil` | Retention completes before reconciliation starts. A synchronous throw is contained by `Promise.resolve().then(...)`; an async rejection is caught/logged; a hung reconciler does not postpone any retention statement. The separate `if (event.cron === SWEEP_CRON)` branch remains untouched, so the `0 3 * * *` sweep does not invoke or await reconciliation (`src/index.js:967-973`). Recommended. |

The repository already uses `ctx.waitUntil` for non-blocking security-event work
(`src/hub.js:1-18`) and for relay sync when a context exists
(`src/relay-grant.js:97-102`). The recommended attachment must defer invocation,
not merely pass an already-started promise, so reconciliation cannot compete
with retention's D1 statement loop before that loop finishes.

“Bounded batch” should match retention's finite-loop style, not mean “scan all
expired runs.” One invocation should select a stable order with an explicit
`LIMIT N`, process at most those N run rows, perform at most one finite phase
transition per row (or another explicitly capped count), and stop. It must not
use an unbounded `for (;;)` over all eligible runs. The existing retention loop
is bounded because its statement array has exactly 12 entries
(`src/retention.js:27-100`); SPB cleanup is separately bounded to three joint
passes and six maintenance credentials (`src/spb-sandbox-lifecycle.js:16-18`,
`:156-186`, `:232-239`). External calls in the reconciler also need request
timeouts so “finite rows” is not defeated by one hung fetch. Existing timeout
implementations are module-local functions in GCP and APNs code
(`src/gcp.js:154-175`, `src/push.js:383-396`), not an exported shared primitive,
so the reconciler's timeout placement remains a design decision.

## Step 8 — Concurrency Primitives

### Reused findings; not re-run

The prior disposable D1 probe and its literal transcript are at
`docs/spb-sandbox-lifecycle-prep.md:307-383`. It established:

1. conditional `UPDATE ... RETURNING` yields one row on a win and zero rows on a
   predicate loss (`docs/spb-sandbox-lifecycle-prep.md:385-389`);
2. scalar `MAX(COALESCE(...), proposed)` preserves a monotonic expiry while still
   returning a row for a lower proposal (`:390-411`);
3. `sandbox_run_id IS ?` is null-safe (`:395-398`); and
4. guarded `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE ... RETURNING`
   distinguishes insert/same-owner, zero-row ownership loss, and real constraint
   exceptions (`:399-403`).

The required interleavings and observable winner/loser postconditions are
already enumerated at `docs/spb-sandbox-lifecycle-prep.md:413-488`; they were not
re-probed. Current local release classification uses transactional `db.batch`
for dispatch (`src/db.js:455-488`) and SPL/SPP (`src/db.js:1395-1450`), while
one-row acquisition deliberately remains one guarded upsert because a batch adds
no acquisition safety (`docs/sandbox-ownership-design.md:96-101`, `:165-182`).

### Missing shape and minimal probe

Those findings did **not** cover a partial unique index or a conflict target that
matches its predicate. That exact shape forced one minimal throwaway
`test/sandbox-run-partial-index-probe.test.js`. It was run through:

```text
hop check -n 300 -- npx vitest run --config vitest.config.js test/sandbox-run-partial-index-probe.test.js
```

Literal relevant SQL:

```sql
CREATE UNIQUE INDEX _sandbox_run_one_nonterminal
  ON _sandbox_run_partial_probe(account_id)
  WHERE status IN ('pending', 'active', 'tearing_down');

INSERT INTO _sandbox_run_partial_probe (id, account_id, status, note)
VALUES (?, ?, ?, ?)
ON CONFLICT(account_id) WHERE status IN ('pending', 'active', 'tearing_down')
DO UPDATE SET note = excluded.note
WHERE _sandbox_run_partial_probe.id = excluded.id
RETURNING id, account_id, status, note;

INSERT INTO _sandbox_run_partial_probe (id, account_id, status, note)
VALUES (?, ?, ?, ?)
ON CONFLICT(account_id) DO NOTHING
RETURNING id;
```

Literal result transcript:

```json
{"results":{"inserted":[{"id":"run-active","account_id":"account-a","status":"active","note":"inserted"}],"sameRun":[{"id":"run-active","account_id":"account-a","status":"active","note":"same-run"}],"otherRun":[],"directConflict":{"threw":true,"message":"D1_ERROR: UNIQUE constraint failed: _sandbox_run_partial_probe.account_id: SQLITE_CONSTRAINT"},"unmatchedTarget":{"threw":true,"message":"D1_ERROR: ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint: SQLITE_ERROR"},"rows":[{"id":"run-active","account_id":"account-a","status":"active","note":"same-run"},{"id":"run-complete-a","account_id":"account-a","status":"complete","note":"complete-a"},{"id":"run-complete-b","account_id":"account-a","status":"complete","note":"complete-b"}]}}
```

Focused result:

```text
✓ test/sandbox-run-partial-index-probe.test.js (1 test) 14ms

Test Files  1 passed (1)
     Tests  1 passed (1)
Duration  1.05s
```

Findings:

1. Miniflare/D1 enforced at most one row per account whose status matched the
   partial predicate: two terminal `complete` rows coexisted, but a direct second
   nonterminal insert threw `SQLITE_CONSTRAINT`.
2. `INSERT ... ON CONFLICT` interacts usefully with the index only when the
   conflict target repeats the partial predicate. With the matching predicate,
   first insert and same-run retry returned one row, while a different run for
   the same account returned zero and left the incumbent unchanged.
3. `ON CONFLICT(account_id)` without the predicate did not match the partial
   unique index and threw `SQLITE_ERROR` even with `DO NOTHING`.

The probe file was deleted after the passing run; no probe file remains.

## Step 9 — Open Questions For Design

1. **Run authentication and `SANDBOX_ACCOUNT_ID`.** Recommendation: make
   `SANDBOX_ACCOUNT_ID` an unset-by-default Worker secret, not `[vars]`, and make
   missing/invalid configuration disable the route. The value is an
   authorization/safety boundary selecting the only account whose capabilities
   an internal caller may mint. The closest precedent is
   `IMPERSONATE_ALLOWED`: transient secret, unset means disabled, never a vars
   entry or hardcoded ID (`wrangler.toml:45-49`). `[vars]` currently contains
   public configuration and live feature switches (`wrangler.toml:96-123`).

2. **Run table and one-live-run rule.** Recommendation: add a new numbered
   migration plus consolidated schema table, and enforce one nonterminal run per
   account with the probed partial unique index. Use a matching partial conflict
   target and guarded same-run `RETURNING`; do not pre-read then insert. Current
   schema has only capability tags (`schema.sql:132-145`, `:301-366`), and the
   Step 8 probe supplies the missing D1 evidence.

3. **Status vocabulary.** Recommendation: run status
   `provisioning | active | reconciling | complete | failed`, with the partial
   index covering the first three. `failed` must be terminal only for a durable,
   operator-visible failure that cannot be retried automatically; retryable
   residuals remain `reconciling` so a new run cannot bypass them. This is a new
   vocabulary; no current run registry exists
   (`docs/sandbox-ownership-design.md:33-38`).

4. **Phase vocabulary.** Recommendation: keep phase orthogonal to status and use
   `issuing | leased | dispatch_release | spp_release | spb_deny |
   spb_cleanup | spl_relay_retire | spl_binding_release | done`, preserving the
   required teardown component order from Step 6. SPB denial and cleanup must be
   separate phases because cleanup can return `credential_expiry_pending`
   (`src/spb-sandbox-lifecycle.js:41-149`); SPL relay retirement must precede
   local binding deletion because the latter removes local ownership evidence
   (`docs/sandbox-ownership-design.md:184-193`).

5. **Lease clock, renewal, and maximum.** Decide the initial duration, maximum
   extension, and whether POST is idempotent renewal or creation-only.
   Recommendation: store absolute millisecond `lease_expires_at`, compare against
   Worker `Date.now()`, and CAS renewal only for the same run while status is
   `active`. Existing lifecycle/retention state consistently uses millisecond
   integers (`src/retention.js:1-5`; `src/spb-sandbox-lifecycle.js:85-92`). The
   actual duration is unverified and must not be guessed here.

6. **Authorization join semantics.** Recommendation: baseline rows
   (`sandbox_run_id IS NULL`) remain byte-identical; non-null rows authorize only
   when an exact run row is in the active status and its lease is future. Missing,
   expired, provisioning, reconciling, complete, and failed runs return the same
   current null/401 shape, with no identity leakage. Step 1 lists every lookup
   and test that constrains this. Existing non-null-run tests should seed run rows
   rather than create a missing-run exception.

7. **Issuance factoring and payload adapters.** Recommendation: keep owner
   payload builders and order untouched, and build journal-exact internal
   payloads separately from shared generated values. Owner payloads contain
   rejected extras for Scout, SPB, and SPP (Step 3), while tests freeze every
   owner key set and ordering boundary (Step 2). A single payload object cannot
   satisfy both contracts.

8. **SPB instance authority.** Decide whether POST accepts the prepared runtime
   instance as an authenticated input or obtains it from another signed channel.
   Recommendation: validate one canonical UUID at the request boundary, claim
   exactly it, and echo exactly it in the six-field SPB payload. The journal will
   reject any mismatch (`~/projects/solstone-journal/solstone/think/sandbox_profile/capabilities.py:195-212`).

9. **SPL lease cap representation.** Recommendation: have
   `listSplBindings` return `sandbox_run_id` and joined lease expiry, apply the
   cap per binding, and retain a literal null-run branch that passes today's
   entitlement seconds unchanged (`src/db.js:1453-1459`;
   `src/relay-grant.js:198-206`). Decide and test the fail-closed response for a
   non-null binding with a missing/malformed run.

10. **Retry persistence and 202 response.** Recommendation: store absolute
    `retry_not_before` on the run, derive relative seconds at GET time, and never
    infer zero from a missing SPB tombstone. The source value and cascade risk are
    established in Step 5. Decide the exact response envelope and whether the
    HTTP `Retry-After` header mirrors the JSON field.

11. **Component result storage and GET truth.** Recommendation: persist the five
    ordered component states, raw helper outcomes, residual codes, and update
    timestamps under run-row CAS. GET is read-only. Direct D1 verification belongs
    in reconciliation because current local helpers are mutating batches
    (`src/db.js:455-488`, `:1395-1450`), and relay truth exists only in the strict
    upstream response (`src/relay-grant.js:162-188`). Decide normalized columns
    versus one bounded JSON object; no current schema precedent decides that.

12. **Cron batch and isolation.** Recommendation: attach only after awaited
    retention in the non-SPB branch, defer/catch it through `ctx.waitUntil`, use a
    stable `LIMIT`, and cap work per row. Never place it before/inside retention
    or in the common path above the cron branch (`src/index.js:967-973`;
    `src/retention.js:102-120`). The exact batch size and external request timeout
    are unverified design choices.

13. **Account cascade policy.** Decide whether the synthetic account is protected
    from ordinary abandoned-account deletion or whether run reconciliation must
    tolerate its loss. Recommendation: explicitly protect the configured sandbox
    account before capability issuance, because dispatch/SPL/SPB/SPP all cascade
    from `accounts` (`schema.sql:132-139`, `:304-312`, `:323-335`, `:347-358`),
    and an SPB cascade makes absence non-evidence of cleanup
    (`docs/spb-sandbox-lifecycle-design.md:1184-1191`). Do not silently weaken
    general retention for other accounts.

14. **Baseline gate disposition.** The design/implementation stage starts from
    the reproduced green baseline: 110 Worker files / 904 tests and one static
    file / 10 tests, with `npm test` exiting 0 three consecutive times. Treat the
    preserved Undici trace as a known transient that lost one Worker file and 17
    tests, not as a red-baseline premise; do not fold an unrelated flake fix into
    this lode without explicit scope.
