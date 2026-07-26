# Generated Sandbox-Run V1 Contract Design

This design adds one generated, machine-readable description of the shipped
sandbox-run v1 HTTP contract. It composes with, and does not replace, the
existing lease design. That document remains authoritative for the protected
request boundary, shared capability payloads, cleanup evidence, retry behavior,
and HTTP responses (`docs/sandbox-run-lease-design.md:216-275`,
`docs/sandbox-run-lease-design.md:362-447`,
`docs/sandbox-run-lease-design.md:519-703`). The status, provisioning-phase,
cleanup-phase, component-state, and residual vocabularies remain authoritative
at `migrations/0027_sandbox_run_lease.sql:65-173`, `schema.sql:423-531`, and
`docs/sandbox-run-lease-design.md:62-159`; this document refers to those closed
groups without copying their members.

Research, byte-serving probes, response inventory, stored-residual analysis,
and adversarial-row mechanics are in
`docs/sandbox-run-contract-prep.md:1-677`. In particular, the probe established
that a Wrangler text rule can serve an imported JSON file exactly, while the
existing embedded-asset pattern avoids a new bundler rule
(`docs/sandbox-run-contract-prep.md:382-545`). This design takes the latter
path.

## Goals

- Make one JavaScript module the source of truth for the v1 selectors, ordered
  schemas, JS-level vocabularies/maps, validation rules, and deterministic
  artifact bytes currently distributed across the orchestrator, D1 helpers,
  capability constructors, and tests (`docs/sandbox-run-contract-prep.md:75-208`).
- Commit a UTF-8 JSON artifact whose bytes are deterministically reproduced by
  a generator and served unchanged from the authenticated admin route.
- Fail the canonical gate for source/artifact drift, SQL/source vocabulary
  drift in either direction, an oversized artifact, or a stale test
  restatement (`package.json:5-14`, `scripts/check-test-partitions.mjs:99-118`).
- Validate durable rows and response reports before serialization so malformed
  D1 evidence fails closed with the existing sandbox envelopes and never falls
  through to the uniform admin catch (`src/sandbox-run-lease.js:107-151`,
  `src/admin.js:147-190`).
- Reject missing or malformed response-bearing POST configuration before run
  insertion, credential generation, or remote mutation
  (`src/sandbox-run-lease.js:157-201`, `src/capability-issuance.js:87-160`).
- Preserve every shipped non-sandbox admin byte, the two-layer Access boundary,
  the literal audited SQL, and all lease/cleanup behavior not explicitly
  described here (`src/admin.js:54-62`, `src/admin.js:118-190`,
  `docs/sandbox-run-lease-design.md:519-703`).

## Non-Goals

- No new profile or contract version, and no change to the fixed request or
  response semantics in lease-design D2/D4/D6/D7
  (`docs/sandbox-run-lease-design.md:216-275`,
  `docs/sandbox-run-lease-design.md:362-447`,
  `docs/sandbox-run-lease-design.md:519-703`).
- No unauthenticated contract route, OpenAPI document, JSON-Schema framework,
  runtime configuration knob, account selector, endpoint selector, or relaxed
  unknown-value behavior. Unknown fields and enum members are outside v1.
- No Access weakening, no change to the admin security-header owner, and no
  change to `workers_dev = false` (`src/admin.js:54-62`,
  `src/admin.js:118-145`, `wrangler.toml:7-13`).
- No `[[rules]]`, no `?raw` import in product `src/`, and no other Wrangler or
  Vitest bundler configuration change (`wrangler.toml:1-5`,
  `vitest.worker.shared.js:3-16`).
- No edit to `migrations/0027_sandbox_run_lease.sql`, no new migration, and no
  schema behavior change. SQL text keeps its audited literals
  (`migrations/0027_sandbox_run_lease.sql:55-236`, `src/db.js:1872-2268`).
- No reconciliation-bound change. The module-private bound and literal SQL
  limit remain exactly where they are as an explicit follow-up outside this
  contract (`src/sandbox-run-lease.js:42`, `src/sandbox-run-lease.js:450-455`,
  `src/db.js:1946-1961`).
- No change to the separate UUID boundaries in `src/admin.js:35` or
  `src/relay-grant.js:12`, and no transfer of relay failed-component ownership
  from `src/relay-grant.js:13-33`.
- No deploy, Wrangler invocation, migration application, or test network
  access. No test may call a live Cloudflare, relay, GCP, R2, or JWKS endpoint
  (`test/jwks-helper.js:12-37`, `test/helpers.js:168-226`).

## Decided Design

### D1: Source Module, Exports, And Dependency Direction

Decision: add `src/sandbox-run-contract.js`. It is the sole sandbox-specific
JavaScript source for the contract selectors, lease duration, fixed broker
value used by issuance, exact create-request keys, cleanup-trigger descriptor,
ordered status/phase/state/residual groups, component descriptors, cleanup
predecessors, sandbox relay translations, response/error/header descriptors,
and artifact serializer. The current definition sites and consumers are fully
enumerated at `docs/sandbox-run-contract-prep.md:75-171`.

The module exports recursively frozen arrays and plain objects, not mutable
`Set` or `Map` instances. Private lookup sets may be derived once at module
initialization and never mutated afterward. This makes the exported schema
stable across requests without introducing request-scoped global state. The
existing module already relies on ordered object insertion for JSON bytes
(`src/sandbox-run-lease.js:256-267`, `src/sandbox-run-lease.js:868-894`,
`src/sandbox-run-lease.js:964-1017`); the new descriptors make that ordering
explicit and reusable.

The exported surface is grouped as follows:

| Export group | Contents and consumers |
|---|---|
| Fixed selectors and operational constants | Contract/profile selectors, lease duration, broker value, exact request-key order, and cleanup-trigger validator. `src/sandbox-run-lease.js` imports these instead of its current private constants (`src/sandbox-run-lease.js:41-45`, `src/sandbox-run-lease.js:184-195`, `src/sandbox-run-lease.js:509-524`). The reconciliation batch bound is deliberately absent. |
| Closed vocabulary descriptors | Named-member objects plus ordered arrays for the stored status, both phase groups, component states, per-component residuals, and the aggregate residual superset. Named access replaces raw JS literals; ordered arrays drive the artifact and parity tests (`migrations/0027_sandbox_run_lease.sql:65-173`, `schema.sql:423-531`). |
| Component and transition descriptors | Ordered component IDs with D1 state/residual/timestamp columns, the cleanup predecessor object, the cleanup-disposition subset, and the sandbox relay translation object. `src/sandbox-run-lease.js` and `src/db.js` import them (`src/sandbox-run-lease.js:58-74`, `src/db.js:2121-2127`, `src/db.js:2159-2167`, `src/db.js:2218-2227`). |
| Ordered HTTP schema descriptors | Exact create-request, capability, create-response, report, component-report, error, route, header, and outer-admin envelope descriptors. They carry ordered field names, types, nullability, format, fixed-value rules, and redaction/sensitivity classifications (`src/capability-issuance.js:24-160`, `src/sandbox-run-lease.js:868-1017`, `src/admin.js:141-145`, `src/admin.js:169-190`). |
| Constructors/ordering helpers | Small pure helpers construct objects by descriptor order and reject descriptor/value key mismatches. `src/capability-issuance.js` uses the capability descriptors; `src/sandbox-run-lease.js` uses the request/response/error descriptors. The helpers do not read bindings, clocks, or requests. |
| Validators | Boolean-only validators for create input, POST configuration, durable row, create response, report, component report, and fixed envelopes. They validate exact key sets/order where serialization order is contractual, scalar types/nullability, UUIDs, enum membership, timestamp formats, component order, state/residual relationships, terminal evidence, retry/report relationships, and the expired-lease projection (`src/sandbox-run-lease.js:76-78`, `src/sandbox-run-lease.js:868-906`, `schema.sql:533-581`). They return false rather than throwing. |
| Artifact exports | The deeply frozen artifact descriptor, deterministic serializer, byte-cap constant, and one module-level serialized body computed once at import. D2/D3 define its exact use. |

`src/sandbox-identifiers.js` changes only to export its existing `UUID_RE`; it
remains the single owner of the sandbox UUID grammar
(`src/sandbox-identifiers.js:1-11`). The contract module imports that regex and
derives the artifact pattern from `UUID_RE.source` and its case-insensitive
descriptor from `UUID_RE.flags`. It also records no case normalization, matching
the shipped validator behavior (`src/sandbox-identifiers.js:1-11`,
`src/sandbox-run-lease.js:509-524`). The regexes at `src/admin.js:35` and
`src/relay-grant.js:12` serve different boundaries and remain untouched.

The import graph is intentionally one-way:

- `src/sandbox-run-contract.js` imports only `UUID_RE` and
  `isCanonicalUuid` from `src/sandbox-identifiers.js`; it imports no Worker
  router, D1, capability, admin, relay, or environment module.
- `src/sandbox-run-lease.js` imports all sandbox policy, ordering, descriptor,
  validator, and serialized-body exports it needs. Its current private
  constants/maps and raw JS vocabulary comparisons are removed or replaced by
  named source members (`src/sandbox-run-lease.js:41-78`,
  `src/sandbox-run-lease.js:317-906`).
- `src/capability-issuance.js` imports only the four capability shape
  descriptors and the pure ordered-object helper. This is an allowed direction:
  the module is already sandbox-aware through fenced ownership and sandbox UUID
  validation, rather than a general-purpose utility
  (`src/capability-issuance.js:3-22`, `src/capability-issuance.js:166-290`). It
  continues to own issuance and all environment-derived values; the contract
  module owns only their serialized field order and schema.
- `src/db.js` imports the component-column object, cleanup predecessor object,
  cleanup-disposition subset, and named vocabulary members used by JS guards.
  No general DB helper outside the sandbox section consumes them
  (`src/db.js:1872-2306`).
- `src/sandbox-ownership.js` and `src/spb-sandbox-lifecycle.js` import the named
  default expected-phase members instead of restating them
  (`src/sandbox-ownership.js:13-55`,
  `src/spb-sandbox-lifecycle.js:19-24`).
- `src/admin.js` imports nothing from the contract module. It continues to own
  Access validation, its security headers, and its uniform outer responses
  (`src/admin.js:54-62`, `src/admin.js:118-190`). D5 pins those values with
  tests instead of reversing the dependency.

Adding the source file requires inserting `sandbox-run-contract.js` into the
explicit source inventory in `test/static.test.js:19-64`. That test is a closed
list, so omission would otherwise fail before contract-specific assertions run.

### D2: Deterministic Bytes And Runtime Serving

Decision: the source module constructs and deeply freezes its descriptor, calls
its deterministic serializer once at module initialization, and exports that
immutable string as `SANDBOX_RUN_CONTRACT_JSON`; the generator and tests enforce
the exported cap, avoiding a module-initialization throw that could disable
unrelated Worker routes. The branch inspects only method, path, and parsed query
to decide whether it matches. Once matched, no request or environment value can
influence the response bytes: the route returns that string directly without
invoking the serializer per request or consulting headers/body, D1, service
bindings, KV, `fetch`, or a clock. This follows the existing module-level CSS/font
serving pattern (`src/assets.js:1-3`, `src/assets.js:362-370`,
`src/index.js:310-330`) and the prep's tested recommendation
(`docs/sandbox-run-contract-prep.md:524-545`).

The committed JSON and the module-level string represent the same bytes in two
places. That duplication is explicit and accepted. It is safe only because the
generator's `--check` byte-compares them, the canonical gate runs that check,
the route test compares the response to the committed artifact, and source/SQL
parity tests fail in both directions. There is no runtime fallback that reads,
repairs, or rebuilds the committed file.

No Wrangler rule or raw import is added. The successful Text-module probe is
retained as research, not selected architecture
(`docs/sandbox-run-contract-prep.md:468-522`). The account's existing
`wrangler.toml` and Worker Vitest configuration remain byte-for-byte unchanged
(`wrangler.toml:1-5`, `vitest.worker.shared.js:8-16`).

The route receives `securityHeaders` through the existing authenticated admin
dispatch and builds its response from that argument
(`src/admin.js:141-166`). It adds the same JSON content type and no-store cache
control used by sandbox responses (`src/sandbox-run-lease.js:1220-1229`). It does
not introduce, import, or move a security-header constant. The artifact's header
section is descriptive; the runtime header values keep their sole owner at
`src/admin.js:54-62`.

#### Router Hoist For Poison Independence

The global router leaves `legacyRedirect` first, then dispatches `/admin/`
requests to `handleAdmin` before evaluating `env.DB`
(`src/index.js:296-308`). This ordering is necessary because the contract-route
independence test replaces `DB` with a throwing getter; an eager read before
admin dispatch would fail before the authenticated contract handler could
return its fixed bytes (`test/sandbox-run-contract.test.js:62-100`,
`test/sandbox-run-contract.test.js:440-450`).

The hoist is behavior-preserving for existing routes. The intervening literal
checks name distinct non-admin paths, and the segment-based checks require
non-admin first segments rather than `admin` (`src/index.js:310-363`,
`src/index.js:365-950`). Legacy redirect precedence remains unchanged because
it still runs before admin dispatch (`src/index.js:300-305`).

The change does not alter the two-layer `/admin/*` boundary: `handleAdmin`
continues to validate Cloudflare Access before dispatch, use its existing
security headers, and invoke the sandbox handler only after authentication
(`src/admin.js:54-62`, `src/admin.js:118-167`). The edge layer remains enforced
by `workers_dev = false` (`wrangler.toml:7-13`).

### D3: Artifact, Generator, Format, And Gate

Decision: commit the artifact at `docs/sandbox-run-contract-v1.json` and add the
generator at `scripts/generate-sandbox-run-contract.mjs`. The first three
top-level fields, in exact order, are:

1. `generated_by`, with the repository-root-relative string
   `account/scripts/generate-sandbox-run-contract.mjs`;
2. `source`, with the repository-root-relative string
   `account/src/sandbox-run-contract.js`;
3. `contract_version`, with the fixed selector already enforced at the request
   and D1 boundaries (`src/sandbox-run-lease.js:509-524`, `schema.sql:421-422`).

The remaining top-level order is `profile`, `lease`, `identifier_format`,
`vocabularies`, `components`, `requests`, `responses`, `errors`, `headers`, and
`routes`. Nested descriptor order is likewise owned by frozen arrays/objects in
the source, never by alphabetical sorting. The artifact describes the closed
groups by reference to the same source values used at runtime
(`migrations/0027_sandbox_run_lease.sql:65-173`,
`src/sandbox-run-lease.js:509-524`, `src/sandbox-run-lease.js:868-1017`).

The serializer is exactly two-space-indented JSON, LF line endings, UTF-8, no
comments, and exactly one trailing LF. It obtains that property by serializing
without a trailing newline and appending one LF; it never normalizes a file read
back from disk. Both serializer output and committed bytes must be less than
65,536 bytes. A byte length equal to or greater than 65,536 is a hard failure,
not a warning or truncation.

The artifact contains descriptors only. It may name response properties because
their exact names and order are the contract, but it contains no actual bucket,
endpoint, model, prefix, credential, identifier, hash, token, or example value.
Value-bearing properties have only type, required/nullability, format, and
sensitivity/redaction descriptors. The fixed broker value and all
environment-derived capability values remain runtime-only
(`src/sandbox-run-lease.js:43`, `src/capability-issuance.js:24-160`,
`docs/sandbox-run-contract-prep.md:133-150`).

The generator resolves repository paths from its own module URL rather than the
caller's working directory. It exposes testable functions that accept an
artifact path, while its CLI always targets the canonical path; this supports
temporary-directory tests without creating a runtime knob. Its command surface
is closed:

- With no arguments, generate entirely in memory, enforce the format and byte
  cap, and write exactly the canonical artifact bytes. A successful no-change
  run may avoid rewriting the file but must have the same result.
- With only `--check`, generate entirely in memory, enforce the generated size,
  read the committed artifact as bytes, enforce its size, and compare exact
  bytes. It writes nothing. A missing, stale, malformed, or oversized artifact
  prints one clear repository-relative diagnostic and exits non-zero.
- Any other argument combination prints usage, writes nothing, and exits
  non-zero.

`package.json` gains a discoverable generation script and inserts
`node scripts/generate-sandbox-run-contract.mjs --check` first in the canonical
`test` chain, before the partition guard and every Vitest configuration.
Artifact drift therefore fails before any partition-guard output or expensive
Worker startup, and the three Vitest configs remain sequential
(`package.json:5-14`, `scripts/check-test-partitions.mjs:99-110`,
`vitest.worker.config.js:1-4`, `vitest.node.config.js:1-14`).
`docs/test-resource-bounds.md:34-48` must be updated to describe the added
non-Vitest check; `scripts/measure-test-resources.mjs` needs no change because it
already launches canonical `npm test` (`scripts/measure-test-resources.mjs:23-33`,
`test/resource-measurement.test.js:26-31`).

### D4: JavaScript Ownership Versus Literal SQL

Decision: acceptance criterion 1's “no private duplicate array, object shape,
or state/residual literal” governs JavaScript structures and comparisons. It
does not authorize rebuilding SQL from JavaScript vocabularies. This is the
scope's D4 split: JS imports the source; SQL remains literal and is pinned by
canonical parity tests.

The following JS duplicates move to or import from
`src/sandbox-run-contract.js`:

- the orchestrator constants, ordered phase array, component tuples, sandbox
  relay translation, liveness/status comparisons, cleanup state/residual
  selections, report shape, and six sandbox error descriptors
  (`src/sandbox-run-lease.js:41-78`, `src/sandbox-run-lease.js:317-447`,
  `src/sandbox-run-lease.js:502-906`, `src/sandbox-run-lease.js:964-1017`);
- `SANDBOX_COMPONENT_COLUMNS`,
  `SANDBOX_CLEANUP_PHASE_PREDECESSOR`, and the cleanup-disposition JS allowlist
  (`src/db.js:2121-2127`, `src/db.js:2159-2167`, `src/db.js:2218-2227`);
- the three default expected phases in the exported ownership/lifecycle
  facades (`src/sandbox-ownership.js:13-55`,
  `src/spb-sandbox-lifecycle.js:19-24`);
- capability and report key-order descriptions currently repeated in runtime
  constructors and tests (`src/capability-issuance.js:24-160`,
  `test/sandbox-run-payloads.test.js:42-102`,
  `test/sandbox-run-get.test.js:12-88`).

All SQL text remains visibly literal. That includes insert seeds/conflict
predicates, reconciliation selection, provisioning fences, activation,
cleanup-request/claim, component guards, retry/disposition, and terminal
postconditions (`src/db.js:455-550`, `src/db.js:1369-1606`,
`src/db.js:1742-1803`, `src/db.js:1849-2268`). No enum list is interpolated
into a statement. Statement text and shape remain unchanged, and every dynamic
value continues to be a bound parameter. The existing allowlisted component
column interpolation remains driven by the imported frozen column descriptor
(`src/db.js:2129-2155`).

A Node parity test reads `src/db.js`, fails loudly unless it locates each named
sandbox DB function, filters that function's quoted literals against the
contract vocabulary universe, and compares the resulting set bidirectionally
with a statement-specific expected subset declared in the test by reference to
named source members. The production source carries no SQL-parity scaffolding.
The test separately parses the relevant CHECK and
index predicates from migration 0027 and `schema.sql`. This preserves greppable,
auditable SQL while making any addition, removal, or substitution fail the
gate. D9 defines placement and the aggregate-residual proof.

The reconciliation batch-size/SQL-limit pair is excluded from the source and
from contract parity. It remains an out-of-scope internal-bound duplication
exactly as shipped (`src/sandbox-run-lease.js:42`, `src/db.js:1957`). No SQL
interpolation is introduced for it.

The relay failed-component vocabulary remains a different wire contract owned
by `src/relay-grant.js:13-33`. Only the sandbox-side translation map moves to
the contract source and is imported by the orchestrator
(`src/sandbox-run-lease.js:65-74`, `src/sandbox-run-lease.js:644-664`). Neither
module imports the other's vocabulary owner, and tests must not collapse the
two sets merely because some spellings are related
(`docs/sandbox-run-contract-prep.md:164-177`).

### D5: Outer Admin Envelopes And Header Ownership

Decision: confirm the proposed lean. `src/admin.js` does not import the
sandbox-specific contract module. The Access-required and uniform admin
not-found bodies remain literal at the general admin boundary, including for
all non-sandbox routes (`src/admin.js:141-145`, `src/admin.js:169-190`). The
contract source carries descriptors of those outer envelopes because callers
can receive them, but a canonical runtime parity test—not an import—pins the
descriptor to the shipped bytes.

The parity test sends a missing-assertion request to a non-sandbox admin route
for the 403 case and a valid assertion to a non-sandbox unknown route for the
uniform 404 case. It compares status, raw serialized body, and the complete
header set to the source descriptors. It repeats representative sandbox
unsupported-method/malformed-path cases to prove they reach the same 404
(`test/sandbox-run-admin.test.js:23-51`). This protects criterion 6 without
making the general admin boundary depend on a sandbox module.

The runtime security-header object also stays at `src/admin.js:54-62` and is
threaded into the sandbox handler at `src/admin.js:158-166`. The source header
descriptor is checked against real responses. It is not imported by admin, does
not replace that object, and does not use the different generic portal CSP at
`src/index.js:148-156` (`docs/sandbox-run-contract-prep.md:176-208`).

### D6: Row/Report Validation, Provenance, And Failure Mapping

Decision: validate at the last handler boundary before serialization and map
every invalid object to an existing sandbox response. Validation is pure and
boolean; the handler wraps row validation, rendering, and report validation so
neither malformed data nor an unexpected render exception can escape to
`src/admin.js:188-190`.

For GET, after the account-scoped D1 read succeeds and absence is handled, the
handler validates the row against the expected request run ID and configured
account ID before rendering (`src/sandbox-run-lease.js:113-139`,
`src/db.js:1943-1949`). It then renders once with one captured `nowMs` and
validates the report, including exact key/component order and clock-derived
invariants (`src/sandbox-run-contract.js:539-638`). An invalid row or report
returns 503 `sandbox_run_unavailable` with the caller's `run_id`, performs no
write, and does not reveal the malformed value. The existing scoped-absence 404
remains unchanged (`src/sandbox-run-lease.js:116-139`,
`src/sandbox-run-lease.js:1248-1278`).

POST runtime validation is limited to configuration at D7; create-response and
capability validators remain source exports exercised by tests against real 201
bodies, without adding a new rejection point before the activation CAS
(`src/sandbox-run-lease.js:256-313`,
`docs/sandbox-run-lease-design.md:449-517`).

For DELETE, the initial scoped row remains an authorization/existence check and
is not the response provenance (`src/sandbox-run-lease.js:107-120`). After one
reconciliation pass, the handler chooses `result.row` or, only if absent, the
existing scoped fallback (`src/sandbox-run-lease.js:125-144`). It validates the
chosen row, renders once with one captured `nowMs`, validates the report, and
only then applies the existing HTTP disposition predicates. Any invalid
post-reconciliation row or report returns 503
`sandbox_run_cleanup_unavailable` with the caller's `run_id`
(`src/sandbox-run-lease.js:143-151`, `src/sandbox-run-lease.js:1003-1009`). It
does not roll back or rewrite cleanup work already committed by D1.

The one handler validation point covers every current DELETE row provenance:

| Provenance reaching `row` | Current path | Required adversarial proof |
|---|---|---|
| Reconciler initial or claim-loss reread | Early terminal return at `src/sandbox-run-lease.js:320-340` | Poison the applicable unscoped `.first()` while leaving the handler's initial scoped read real; assert the selected row is rejected before rendering. A claim-loss case may leave the cleanup-request write durable (`src/db.js:2061-2118`). |
| Reconciler final SELECT | The second normal-path unscoped read at `src/sandbox-run-lease.js:419` | Poison that `.first()` and make the subsequent terminal/disposition CAS return zero rows without executing it, so `|| run` preserves the poisoned clone (`src/sandbox-run-lease.js:421-443`). All earlier component/phase writes delegate to real D1, leaving the actual row in a nonterminal retryable state. |
| Terminal/disposition `UPDATE ... RETURNING *` | A successful helper replaces the line-419 row at `src/sandbox-run-lease.js:421-443`, using `src/db.js:2218-2268` | Let a nonterminal disposition execute against real D1, then replace only its returned `results[0]` with a malformed clone. The durable D1 row remains retryable, while the handler proves that an UPDATE-returned row is validated. |
| Handler fallback scoped read | `result.row` is false at `src/sandbox-run-lease.js:135-144` | Let cleanup-request execute, simulate a zero-row claim, return null from the claim-loss unscoped reread, and poison only the second scoped `.first()`. The first scoped read remains real; D1 retains the cleanup request for retry. |

This explicitly resolves the prep's overwrite risk
(`docs/sandbox-run-contract-prep.md:568-603`). A test that poisons only the final
SELECT is insufficient when a later successful `UPDATE ... RETURNING *`
replaces it; each provenance test must control the next return exactly as the
table specifies.

Durability assertions always query the real base DB, never the proxy. They use
`dbDumpText()` or a direct `SELECT *` helper to prove that evidence changed,
then remove the proxy and run an ordinary retry to convergence
(`test/helpers.js:462-495`, `test/sandbox-run-cleanup.test.js:372-430`,
`test/sandbox-run-cleanup.test.js:472-505`,
`test/sandbox-run-cleanup.test.js:734-737`). Validation failures are not logged
with row contents, identifiers, residuals, or credentials.

### D7: POST Configuration Validation And Telemetry

Decision: add one pure source validator for the three response-bearing settings
and call it at the top of `createSandboxRun`, immediately after local telemetry
counters are initialized and before `readStandingGoogleApiKey`
(`src/sandbox-run-lease.js:157-171`). This placement precedes every D1 insert,
credential/token generation, entitlement reconciliation, relay call, and
capability construction (`src/sandbox-run-lease.js:184-267`,
`src/capability-issuance.js:24-160`).

The checks are exact:

- `R2_BUCKET` must be a primitive, non-empty, already-trimmed string. The
  validator does not normalize it or attempt to encode Cloudflare's external
  naming rules.
- `SPP_ENGINE_ENDPOINT` must be a primitive string accepted as an absolute URL,
  use the HTTPS scheme, and contain no embedded username or password. The
  validator preserves the supplied string; it does not canonicalize it.
- `SPP_ENGINE_MODEL` must be a primitive, non-empty, already-trimmed string.

Those fields currently feed the SPB/SPP capability constructors directly
(`src/capability-issuance.js:105-112`,
`src/capability-issuance.js:152-158`). The artifact records only their response
field types/sensitivity, never the configured values.

Invalid configuration emits one `sandbox_run_create` event with new outcome
`config_unavailable`, `components_completed` zero, and the existing duration/
timestamp fields; no invalid value is logged or sent to the hub
(`src/sandbox-run-lease.js:912-927`). It returns the internal unavailable
outcome, which the route maps to the existing exact 503
`sandbox_run_unavailable` envelope (`src/sandbox-run-lease.js:81-97`,
`src/sandbox-run-lease.js:987-993`). A distinct telemetry outcome is preferred
over reusing `baseline_unavailable`: configuration is an operator defect,
whereas the existing label describes missing account/Scout/key evidence
(`src/sandbox-run-lease.js:170-181`, `src/sandbox-run-lease.js:526-538`).

`test/sandbox-run-post.test.js` gains a table covering each missing, wrong-type,
blank, and invalid-URL setting. Each case asserts the existing response bytes,
zero run/capability mutations, no relay/fetch use, one redacted telemetry event,
and no leaked configured value. The successful no-secret test at
`test/sandbox-run-post.test.js:162-199` remains a success case because
`makeTestEnv` already supplies valid values (`test/helpers.js:68-79`); it gains
an assertion that its create telemetry outcome remains the ordinary success
outcome.

### D8: Authenticated Contract Route And Match Order

Decision: add exactly `GET /admin/sandbox-runs/contract` inside
`handleSandboxRunRequest`. Its branch is the first branch in that handler,
before collection POST, canonical UUID-member matching, and every call to
`configuredSandboxAccountId` (`src/sandbox-run-lease.js:77-115`,
`src/sandbox-run-lease.js:603-605`). Access validation still happens first in
`handleAdmin` (`src/admin.js:141-166`).

The branch matches only the exact pathname, GET method, expected path segment
count, and `url.search === ''`. A non-empty query string, extra segment, or any
other method returns `null` from the sandbox handler and therefore receives the
existing uniform admin 404 (`src/admin.js:158-170`,
`src/admin.js:187-190`). It does not consult the configured sandbox account, so
the authenticated schema remains available when route-specific runtime
bindings/configuration are absent or poisoned.

The success response is 200 with the module-level artifact string and the exact
header set described in D2. It never passes the string through `responseJson`,
because that helper would quote it as a JSON string
(`src/sandbox-run-lease.js:964-970`). A small response helper accepts the already
serialized body, copies the supplied admin security headers, and adds only JSON
content type and no-store cache control.

HEAD needs no route-specific branch. The global Worker rewrites HEAD to GET
before routing and reconstructs a null-body response with the GET status,
status text, and headers (`src/index.js:959-967`). Existing HEAD tests establish
the same pattern for sandbox members and general routes
(`test/sandbox-run-admin.test.js:54-78`, `test/head-requests.test.js:5-40`).

### D9: Canonical Parity Tests And Partition Placement

Decision: add two files and rewrite the migration test:

- `test/sandbox-run-contract.test.js` joins the Worker partition adjacent to the
  existing sandbox-run files in `test/partitions.js:71-79`. It covers source
  validators, GET/DELETE adversarial rows, outer envelopes, route matching,
  authentication, exact route bytes/headers, HEAD, and poison-env independence.
- `test/sandbox-run-contract-parity.test.js` joins the Node partition before
  `test/static.test.js` in `test/partitions.js:124-129`. Node is the correct home
  for filesystem artifact reads, temporary generator outputs, child-process
  CLI checks, and literal source/SQL parsing (`vitest.node.config.js:1-14`).
- `test/migration-0027-sandbox-run-lease.test.js` remains in the Worker
  partition (`test/partitions.js:45-79`) so its acceptance/rejection cases still
  exercise real D1, but it imports source vocabularies/descriptors instead of
  declaring private copies (`test/migration-0027-sandbox-run-lease.test.js:14-130`,
  `test/migration-0027-sandbox-run-lease.test.js:184-318`).

The Node parity file asserts:

- source serialization equals the committed artifact byte-for-byte; format,
  metadata order/values, one trailing LF, UTF-8 encoding, and both byte lengths
  satisfy D3;
- generator normal mode writes exact bytes to a temporary path, `--check`
  writes nothing, and missing/stale/oversized/unknown-argument paths fail with
  clear messages;
- forbidden concrete values/examples are absent while every required descriptor
  and exact field order is present;
- all JS consumer modules use source imports and contain no private
  vocabulary/shape restatement, with explicit exclusions for literal SQL and
  the distinct relay/admin false positives identified at
  `docs/sandbox-run-contract-prep.md:153-177`;
- each migration/schema CHECK group and every named sandbox SQL statement in
  D4 has bidirectional set equality with its assigned source group.

The aggregate residual assertion keeps the prep's four-part structure exactly:

1. Compare each source per-component residual set bidirectionally with its D1
   constraint set (`migrations/0027_sandbox_run_lease.sql:105-173`,
   `schema.sql:463-531`).
2. Compute the union of those independently checked sets and assert every union
   member belongs to the aggregate set (`migrations/0027_sandbox_run_lease.sql:89-104`,
   `schema.sql:447-462`).
3. Assert aggregate-minus-union bidirectionally equals the separate
   two-member creation-failure set, and assert that set is disjoint from every
   per-component set (`src/sandbox-run-lease.js:268-299`).
4. Assert aggregate equality to union plus the creation-only set, so additions
   or removals on either side fail rather than being hidden by construction
   (`test/migration-0027-sandbox-run-lease.test.js:126-130`,
   `docs/sandbox-run-contract-prep.md:299-341`).

The migration test separately iterates the imported source sets against real
D1. This gives three independent boundaries: source versus migration text,
source versus consolidated schema text, and source values versus executed D1
CHECK behavior.

### D10: Test Rewrites, Adversarial Matrix, And Poison Proof

#### Existing-test rewrite/delete list

The implementation removes private expected-shape/vocabulary declarations and
imports the source descriptors or named members instead:

| Existing block | Rewrite |
|---|---|
| `test/sandbox-run-payloads.test.js:42-102` | Import create/capability descriptors for all field-order and forbidden-extra assertions. Replace the sorted inner-key comparisons at lines 50-75 with direct `Object.keys` comparisons against each ordered capability descriptor. This is a required coverage fix: sorting currently proves a set, not the four serialization orders (`docs/sandbox-run-contract-prep.md:210-213`). Keep runtime/env-derived value assertions separate. |
| `test/migration-0027-sandbox-run-lease.test.js:14-130` | Delete every local vocabulary array and aggregate spread. Import the source groups and component descriptors. A test-only mechanical column-to-fixture-name adapter may remain; it is representation plumbing, not a second vocabulary. Keep the executed acceptance/rejection loops at lines 184-318. |
| `test/sandbox-run-get.test.js:12-23`, `test/sandbox-run-get.test.js:61-129` | Delete the local top-level keys and import report/component order descriptors plus named expected members. Preserve no-write, strict liveness-boundary, and expired-projection assertions. |
| `test/sandbox-run-cleanup.test.js:72-83`, `test/sandbox-run-cleanup.test.js:120-130` | Import report and named state/residual descriptors. Preserve byte-stable retry/terminal behavior. Apply the same rewrite to stored-vocabulary assertions at the ranges catalogued in `docs/sandbox-run-contract-prep.md:663-673`. |
| `test/sandbox-run-test-helpers.js:4-31` | Import contract/profile selectors and create-request ordering; retain only test IDs and request transport construction. |
| `test/sandbox-run-faults.test.js:239-265` | Import the named creation-only residual member rather than repeating it; add direct coverage for the other member through source/branch parity without copying either list (`docs/sandbox-run-contract-prep.md:333-341`). |
| `test/sandbox-run-admin.test.js:23-78` and `test/admin.test.js:196-205` | Keep behavioral coverage and add complete descriptor-driven body/header equality in the canonical contract test; do not import the source into production admin code. |
| `test/static.test.js:19-64`, `test/static.test.js:99-133` | Add the new source filename to the closed list. Keep existing CSS/font byte-parity tests unchanged; artifact parity belongs in the new Node file. |

#### Adversarial validation matrix

Tests prefer real D1 rows whenever SQLite accepts the malformed shape and use a
proxy only when CHECK constraints make insertion impossible. The shipped helper
exposes every row field (`test/helpers.js:705-815`), and the prep probe proved
which malformed types/cross-field combinations are insertable
(`docs/sandbox-run-contract-prep.md:605-640`).

| Case | Injection mechanism | Required assertion |
|---|---|---|
| Unknown run status | Scoped GET `.first()` proxy; D1 CHECK rejects a real row (`schema.sql:423-428`) | GET returns the existing unavailable 503, exact body/headers, and `dbDumpText()` is unchanged. |
| Unknown provisioning or cleanup phase | Scoped GET proxy; D1 CHECK rejects both (`schema.sql:429-441`) | Same no-mutation GET disposition; direct validator also rejects each group. |
| Unknown component identity | Direct component/report-validator object, because component IDs are response descriptors rather than stored row values (`src/sandbox-run-lease.js:58-64`, `src/sandbox-run-lease.js:883-892`) | Validator rejects the extra/replaced component and wrong array order. |
| Unknown component state or residual | Scoped GET proxy and each DELETE provenance proxy; D1 CHECK rejects real insertion (`schema.sql:463-581`) | GET uses unavailable; DELETE uses cleanup-unavailable and preserves base-D1 retry evidence. |
| Invalid required nullability or illegal state/residual pairing | Proxy when NOT NULL/CHECK rejects insertion (`schema.sql:417-446`, `schema.sql:542-581`) | No thrown value reaches admin; no malformed field is serialized or logged. |
| Wrong scalar types | Real `seedSandboxRun` rows for text accepted by integer-affinity columns and malformed non-null identity/evidence fields; proxy only for types rejected by CHECK (`test/helpers.js:705-815`, `docs/sandbox-run-contract-prep.md:605-640`) | Row/report validators reject; GET remains mutation-free and DELETE follows D6 durability rules. |
| Wrong top-level, capability, or component key order | Direct source-validator objects, not a D1 proxy, because renderer object literals determine response order (`src/sandbox-run-lease.js:256-267`, `src/sandbox-run-lease.js:868-894`) | Validators reject every permutation; runtime payload tests compare unsorted `Object.keys`. |
| Impossible terminal/component evidence | Real row accepted by the current table relationship checks (`schema.sql:533-581`, `docs/sandbox-run-contract-prep.md:607-618`) | GET fails closed; DELETE provenance tests show earlier cleanup evidence remains retryable. |
| Impossible retry/report combination | Real row where D1 affinity/relationship checks permit it, plus direct report-validator objects for combinations no row can produce (`schema.sql:442-581`, `src/sandbox-run-lease.js:868-906`) | Validator enforces nullability, positive integer derivation, component disposition, and the source's deliberately unclamped retry calculation (`docs/sandbox-run-contract-prep.md:215-234`). |
| Extra or missing row/report fields | Proxy for row shape and direct validator for report shape | Exact v1 key set fails in both directions; unknown fields are not ignored. |

Every GET case records a before/after `dbDumpText()` and proves byte equality.
Every DELETE case uses the provenance-specific mechanism in D6, reads durable
evidence through the real DB, removes the proxy, and proves ordinary retry
convergence (`test/helpers.js:462-495`,
`test/sandbox-run-cleanup.test.js:372-430`,
`test/sandbox-run-cleanup.test.js:472-505`).

#### Contract-route environment poison proof

The authenticated route test fetches the artifact under three environment
shapes and compares exact status, raw body bytes, and the complete header set:

1. route-specific bindings/config omitted, retaining only the Access audience
   needed by `validateCfAccess` (`src/admin.js:118-145`);
2. the ordinary populated `makeTestEnv` shape (`test/helpers.js:24-79`);
3. throwing poisons for `DB`, `RELAY`, `GCP_TOKEN_CACHE`,
   `SANDBOX_ACCOUNT_ID`, every non-JWKS `fetch`, and console methods.

The third shape uses only `installJwksStubWith` to answer the Access JWKS URL
and throw for every other fetch, plus `mintToken` for a valid assertion
(`test/jwks-helper.js:25-52`). Binding objects/getters throw on any access. The
three responses must equal the committed artifact imported raw in the test and
must have identical complete headers. The test also proves zero console calls,
GET-only matching, query rejection, Access-required 403, and the global HEAD
mirror. Together with Node source/artifact parity, this proves the route serves
committed bytes and cannot depend on runtime state.

## Implementation Sequence

1. Add `src/sandbox-run-contract.js` and export `UUID_RE` from
   `src/sandbox-identifiers.js`. Define/freeze the descriptors, named
   vocabularies, validators, serializer, byte cap, and module-level body first;
   update the `test/static.test.js:19-64` source list in the same change.
2. Convert JS consumers in dependency order: capability object construction;
   D1 component/predecessor/disposition guards; ownership/lifecycle default
   phases; then the sandbox orchestrator's constants, comparisons, object
   shapes, errors, and liveness logic. Leave all SQL and distinct relay/admin
   boundaries literal (`src/capability-issuance.js:24-160`,
   `src/db.js:1872-2268`, `src/sandbox-run-lease.js:41-1017`).
3. Add `scripts/generate-sandbox-run-contract.mjs`, generate and commit
   `docs/sandbox-run-contract-v1.json`, then update `package.json` and
   `docs/test-resource-bounds.md` for the fail-fast `--check` gate order.
4. Add POST configuration validation before baseline lookup; keep create-response
   and capability validation in tests only (`src/sandbox-run-lease.js:157-284`).
5. Add the authenticated contract-route branch before every account/member
   gate, using the existing security-header argument and precomputed body
   (`src/sandbox-run-lease.js:80-109`, `src/admin.js:158-166`).
6. Add GET and DELETE row/report validation at the exact handler boundaries in
   D6. Keep reconciliation and all DB helpers otherwise unchanged.
7. Add the Node artifact/source/SQL parity test and rewrite the migration test
   to use source sets. This pins the source before behavioral tests delete their
   private expected arrays.
8. Rewrite existing payload/GET/cleanup/helper/fault/admin tests, add the Worker
   contract/validator/poison tests, and register both new files in
   `test/partitions.js`.

## Test Plan

The implementation stage runs only the repository's requested narrow checks
while developing, each through `hop check`; the final requested gate is the
updated `npm test` chain. The design does not change the sequential Worker,
passkey, and Node project topology (`package.json:5-14`,
`vitest.worker.shared.js:3-16`, `vitest.node.config.js:1-14`).

Required coverage is:

- source immutability, deterministic serialization, exact artifact metadata/
  formatting/size, generator normal/check/error semantics, and canonical-gate
  ordering;
- bidirectional source/migration/schema/SQL parity, including D9's strict
  aggregate-residual superset proof;
- exact unsorted key order for all four capabilities, POST, reports,
  components, all six sandbox errors, and both outer admin errors
  (`src/capability-issuance.js:24-160`, `src/sandbox-run-lease.js:964-1017`,
  `src/admin.js:141-190`);
- valid-row acceptance across every legal run/phase/component state used by
  existing create/cleanup/concurrency tests, so validation does not reject a
  legitimate intermediate or retry (`test/sandbox-run-post.test.js:24-200`,
  `test/sandbox-run-cleanup.test.js:28-552`,
  `test/sandbox-run-concurrency.test.js:32-260`);
- D10's malformed matrix for GET and every DELETE provenance, including no
  mutation for GET, durable/retryable evidence for DELETE, redacted envelopes,
  no thrown admin fallback, and later convergence;
- POST configuration failure before D1/credential/remote effects, with the
  distinct redacted telemetry outcome and unchanged success behavior;
- exact authenticated contract bytes/headers across omitted, populated, and
  poisoned environments; method/query/extra-path uniform 404s; Access 403; and
  HEAD mirroring (`src/index.js:959-967`,
  `test/sandbox-run-admin.test.js:23-78`);
- byte-identical existing POST/GET/DELETE/error/admin responses and unchanged
  non-sandbox routes, including the current absence split
  (`test/sandbox-run-get.test.js:131-168`,
  `test/sandbox-run-admin.test.js:34-51`).

## Risks

### Descriptor/runtime divergence

The committed artifact, source descriptor, literal SQL, and general admin
boundary intentionally have more than one representation. The risk is accepted
only with exact byte tests, bidirectional set comparisons, runtime envelope
tests, and the gate-level generator check. One-way containment or a test that
constructs expected values from the same spread would not detect coordinated
drift (`docs/sandbox-run-contract-prep.md:299-341`).

### Rejecting legitimate durable intermediates

The row validator is stricter than SQLite affinity and some current table
relationships. It must encode the shipped orchestrator's reachable states,
including partially provisioned cleanup and concurrent retry evidence, rather
than assuming every nonterminal row resembles a steady-state GET. Existing
creation fault, concurrency, cleanup retry, and scheduled tests are the
acceptance corpus (`test/sandbox-run-faults.test.js:1-442`,
`test/sandbox-run-concurrency.test.js:32-260`,
`test/sandbox-run-cleanup.test.js:238-552`,
`test/sandbox-run-scheduled.test.js:15-225`).

### DELETE provenance masking

A final SELECT poison can be overwritten by a later `UPDATE ... RETURNING *`,
and a false result can trigger the handler's scoped fallback. D6 makes each
provenance explicit and requires a separate injection; a single generic proxy
test is insufficient (`src/sandbox-run-lease.js:135-144`,
`src/sandbox-run-lease.js:419-447`, `src/db.js:2218-2268`).

### Dependency cycles and source portability

The source module must remain a leaf over `sandbox-identifiers.js`. It must not
import `capability-issuance.js`, `relay-grant.js`, `sandbox-run-lease.js`, D1, or
admin; doing so would enlarge existing service/orchestrator cycles and make the
Node generator load the Worker graph (`src/sandbox-run-lease.js:1-39`,
`src/capability-issuance.js:1-22`, `src/relay-grant.js:1-8`). The chosen import
direction keeps the generator portable to Node.

### Poison-test false confidence

The contract route necessarily performs Access JWT verification before sandbox
dispatch. A global fetch poison that also blocks the JWKS stub tests auth
failure rather than route independence. D10 permits exactly the helper's JWKS
response and poisons every other fetch (`test/jwks-helper.js:12-37`). Likewise,
durability checks must bypass the proxy and read base D1 directly.

### Artifact sensitivity

Exact schema field names include names of sensitive response fields, but the
artifact must never include their values, examples, defaults, hashes, or
configured service locations. Node tests scan the entire artifact for known
test/runtime values and enforce descriptor-only shapes; route poison tests prove
no environment data can enter the body (`src/capability-issuance.js:24-160`,
`test/sandbox-run-payloads.test.js:76-102`).

## Review Summary

The design has no open implementation choice. It uses
`src/sandbox-run-contract.js`, a deterministic two-space/LF serializer, the
committed `docs/sandbox-run-contract-v1.json`, and
`scripts/generate-sandbox-run-contract.mjs`. The route serves one immutable
module-level string behind existing Access and admin headers. JS structures
import the source; SQL remains literal and parity-tested. Admin and relay keep
their current dependency ownership. GET/DELETE validate every possible final
row provenance before serialization, POST config validation occurs before any
effect, and two partitioned canonical tests cover artifact/SQL parity plus
runtime/adversarial behavior.
