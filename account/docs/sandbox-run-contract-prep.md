# Sandbox-run v1 machine-readable contract: prep

This is investigation only. It records the shipped implementation and test
surface for the generated sandbox-run v1 contract; it does not propose product
source, test, script, configuration, or schema edits. The existing lease design
remains the authoritative prose for the status, phase, component-state, and
residual vocabularies (`docs/sandbox-run-lease-design.md:62-159`,
`docs/sandbox-run-lease-design.md:593-703`). This document intentionally names
those groups and cites their definitions without copying their members.

## 1. Baseline and repository state

`account/node_modules/` was absent and is ignored by Git (`../.gitignore:2`). I
ran the documented setup command, `npm install`, successfully, then ran the
canonical gate through Hopper. The gate order is the partition guard followed
by the worker, passkey, and node Vitest configurations (`package.json:5-9`).
(This records the pre-change order; the completed lode puts the contract drift
check first.)

Command:

```text
hop check -n 250 -- npm test
```

Verbatim result summary:

```text
hop check: `npm test` exited 0
test partitions: 122 files assigned exactly once (worker=114, passkey=4, node=4)

 Test Files  114 passed (114)
      Tests  981 passed (981)
   Duration  29.99s

 Test Files  4 passed (4)
      Tests  21 passed (21)
   Duration  1.42s

 Test Files  4 passed (4)
      Tests  32 passed (32)
   Duration  196ms
```

Yes: the partition checker produces visible output before any Vitest
configuration. Its success branch prints that line (`scripts/check-test-partitions.mjs:99-110`),
and `npm test` places it before the three sequential Vitest commands
(`package.json:5-9`).

## 2. Current end-to-end implementation

The global router sends every `/admin/*` request to `handleAdmin`
(`src/index.js:948-950`). `handleAdmin` authenticates Cloudflare Access before
dispatch, passes the admin security-header object into the sandbox module, and
uses one uniform not-found response whenever that module returns `null`
(`src/admin.js:118-145`, `src/admin.js:147-170`, `src/admin.js:187-190`).

`handleSandboxRunRequest` owns the exact collection POST and canonical member
GET/DELETE routes (`src/sandbox-run-lease.js:80-105`). POST validates a closed
four-key input, obtains the configured account, provisions four capabilities in
a fixed fenced sequence, activates the row with a CAS, and only then emits the
credential response (`src/sandbox-run-lease.js:81-97`,
`src/sandbox-run-lease.js:509-524`, `src/sandbox-run-lease.js:184-284`). GET is a
scoped D1 read and pure renderer (`src/sandbox-run-lease.js:107-123`). DELETE
does one reconciliation pass, classifies the returned durable row, and emits a
report or a closed error (`src/sandbox-run-lease.js:125-151`).

The orchestration module delegates all SQL to `src/db.js`, all four shared
issuance cores to `src/capability-issuance.js`, local ownership release to
`src/sandbox-ownership.js`, relay retirement to `src/relay-grant.js`, and SPB
denial/purge to `src/spb-sandbox-lifecycle.js`
(`src/sandbox-run-lease.js:1-39`). The intended layering is also explicit in the
lease design (`docs/sandbox-run-lease-design.md:705-743`).

## 3. Q1 — complete literal ownership inventory

### 3.1 Contract-source inventory

“Required consumer” below means the module currently reading or restating the
literal group and therefore the natural direct importer from the future source
of truth. A generator and parity tests are additional consumers, but their
filenames are not yet present and are therefore **unverified**.

Completeness was checked mechanically, not by sampling. A scratch probe extracts
every single-quoted literal from migration 0027's `sandbox_runs` table, walks
every JavaScript file under `src/`, and records every exact quoted occurrence
(`/home/extro/.hopper/scratchpad/sandbox-run-contract-gnex3g2d/vocab-scan.mjs:1-40`).
It deliberately includes spelling collisions so they can be classified rather
than silently discarded. Actual output:

```text
hop check: `node vocab-scan.mjs` exited 0
{
  "schema_literals": 57,
  "literals_with_src_consumers": 57,
  "schema_only_literals": 0,
  "files": {
    "src/admin.js": 1,
    "src/billing.js": 1,
    "src/capability-issuance.js": 1,
    "src/db.js": 17,
    "src/enable.js": 1,
    "src/html.js": 1,
    "src/index.js": 2,
    "src/reach.js": 1,
    "src/relay-grant.js": 1,
    "src/sandbox-ownership.js": 4,
    "src/sandbox-run-lease.js": 55,
    "src/scout-migrate.js": 1,
    "src/spb-entitlement.js": 1,
    "src/spb-sandbox-lifecycle.js": 2,
    "src/spp-entitlement.js": 1
  }
}
```

The inventory below covers the true sandbox consumers; §3.2 calls out true
touch points missing from the supplied list, and §3.3 accounts for the remaining
same-spelling false positives. The starting constants and non-schema literals
were separately traced from `src/sandbox-run-lease.js:41-74`,
`src/capability-issuance.js:24-160`, `src/sandbox-identifiers.js:1-11`,
`src/admin.js:54-62`, and `src/index.js:148-156`.

| Literal or ordered group the new source must own | Current definition/evidence | Required consumer(s) |
|---|---|---|
| Fixed lease duration: `3_600_000` ms | Module constant and expiry calculation (`src/sandbox-run-lease.js:41`, `src/sandbox-run-lease.js:184-195`); D1 equality constraint (`migrations/0027_sandbox_run_lease.sql:175`, `schema.sql:533`) | Creation and any generated contract size/value assertion in `src/sandbox-run-lease.js`; D1 parity test must compare the schema constraint rather than create a second JS value (`test/migration-0027-sandbox-run-lease.test.js:320-334`). |
| Reconciliation batch bound: `10` | Module constant and runtime assertion (`src/sandbox-run-lease.js:42`, `src/sandbox-run-lease.js:450-455`); duplicated SQL literal (`src/db.js:1946-1961`) | `src/sandbox-run-lease.js` and `src/db.js`; the SQL can interpolate the imported fixed bound. |
| Fixed broker endpoint: `https://services.solstone.app` | Module constant and SPB issuer argument (`src/sandbox-run-lease.js:43`, `src/sandbox-run-lease.js:227-236`) | `src/sandbox-run-lease.js`; the SPB constructor remains the value consumer (`src/capability-issuance.js:87-112`). |
| Exact create-request key order (`contract_version`, `instance_id`, `profile`, `run_id`), contract selector `1`, and profile selector `full` | Request key list and validator (`src/sandbox-run-lease.js:44`, `src/sandbox-run-lease.js:509-524`); matching D1 constraints (`migrations/0027_sandbox_run_lease.sql:63-64`, `schema.sql:421-422`) | `src/sandbox-run-lease.js`; request tests should import the source rather than restate it (`test/sandbox-run-test-helpers.js:4-31`, `test/sandbox-run-post.test.js:36-75`). |
| Closed cleanup-trigger set: `post_failure`, `delete`, `scheduled` | Definition and guard (`src/sandbox-run-lease.js:45`, `src/sandbox-run-lease.js:317-318`) | POST-failure, DELETE, and scheduled callers in `src/sandbox-run-lease.js` (`src/sandbox-run-lease.js:303-308`, `src/sandbox-run-lease.js:125-131`, `src/sandbox-run-lease.js:469-474`). |
| Closed run-status vocabulary and its operational subsets | Authoritative constraints (`migrations/0027_sandbox_run_lease.sql:65-70`, `schema.sql:423-428`); insert conflict subset and seed value (`src/db.js:1883-1909`); reconciliation subset (`src/db.js:1946-1961`); cleanup transition subsets and terminal postcondition (`src/db.js:2061-2118`, `src/db.js:2197-2268`) | `src/db.js` for every SQL predicate/seed and `src/sandbox-run-lease.js` for liveness, routing, reconciliation, rendering, and classification (`src/sandbox-run-lease.js:76-78`, `src/sandbox-run-lease.js:317-447`, `src/sandbox-run-lease.js:868-906`). |
| Ordered provisioning-phase vocabulary | Ordered JS definition and ordering consumer (`src/sandbox-run-lease.js:46-57`, `src/sandbox-run-lease.js:841-843`); D1 constraint (`migrations/0027_sandbox_run_lease.sql:71-77`, `schema.sql:429-435`) | `src/sandbox-run-lease.js` provisioning and cleanup gates (`src/sandbox-run-lease.js:201-253`, `src/sandbox-run-lease.js:648-717`), D1 fencing/activation (`src/db.js:1964-2058`), and the exported claim facades whose defaults currently restate three members (`src/sandbox-ownership.js:13-55`, `src/spb-sandbox-lifecycle.js:19-24`). |
| Ordered cleanup-phase vocabulary and predecessor relation | D1 constraint (`migrations/0027_sandbox_run_lease.sql:78-83`, `schema.sql:436-441`) and predecessor map (`src/db.js:2159-2195`) | `src/db.js` phase CAS and `src/sandbox-run-lease.js` ordered cleanup calls (`src/sandbox-run-lease.js:343-415`). |
| Ordered component IDs plus state/residual/timestamp column tuples | Ordered renderer/orchestrator table (`src/sandbox-run-lease.js:58-64`, `src/sandbox-run-lease.js:845-865`, `src/sandbox-run-lease.js:883-892`) and duplicated DB column table (`src/db.js:2121-2157`) | `src/sandbox-run-lease.js` and `src/db.js`; both need the same order and tuples. |
| Closed component-state vocabulary | D1 constraints for all five columns (`migrations/0027_sandbox_run_lease.sql:105-173`, `schema.sql:463-531`) and state/residual relationship constraints (`migrations/0027_sandbox_run_lease.sql:184-223`, `schema.sql:542-581`) | Cleanup state construction/verification in `src/sandbox-run-lease.js` (`src/sandbox-run-lease.js:604-839`) and D1 update/terminal helpers in `src/db.js` (`src/db.js:2069-2087`, `src/db.js:2129-2268`). |
| Per-component residual vocabularies and the last-residual superset | Authoritative D1 lists (`migrations/0027_sandbox_run_lease.sql:89-173`, `schema.sql:447-531`) and creation/cleanup writers (`src/sandbox-run-lease.js:275-299`, `src/sandbox-run-lease.js:573-812`) | `src/sandbox-run-lease.js`, parity tests, and generated artifact. `src/db.js` stores supplied residuals and copies them into the aggregate column (`src/db.js:2069-2074`, `src/db.js:2129-2155`, `src/db.js:2218-2239`). |
| Relay failed-component to stored-residual translation | Translation map (`src/sandbox-run-lease.js:65-74`) and lookup/fallback (`src/sandbox-run-lease.js:644-664`); upstream failed-component vocabulary is separately defined (`src/relay-grant.js:13-33`, `src/relay-grant.js:178-190`) | `src/sandbox-run-lease.js`; `src/relay-grant.js` should continue to own the upstream response vocabulary because it is a different wire contract. |
| Lease-live predicate | Exact implementation (`src/sandbox-run-lease.js:76-78`) and authorization consumer (`src/relay-grant.js:1-8`, `src/relay-grant.js:135-151`) | Renderer and every sandbox authorization join/predicate (`src/sandbox-run-lease.js:868-890`, `src/db.js:531-550`, `src/db.js:1742-1803`, `src/db.js:1849-1869`). |
| POST top-level/capability key order and four exact capability field orders | POST object construction (`src/sandbox-run-lease.js:256-267`) and the four constructors (`src/capability-issuance.js:24-38`, `src/capability-issuance.js:40-85`, `src/capability-issuance.js:87-117`, `src/capability-issuance.js:119-160`) | `src/sandbox-run-lease.js`, `src/capability-issuance.js`, the artifact generator, and response parity tests (`test/sandbox-run-payloads.test.js:28-108`). |
| GET/DELETE report key order, component key order, and component order | Renderer (`src/sandbox-run-lease.js:868-894`) | `src/sandbox-run-lease.js`, generated artifact, GET test (`test/sandbox-run-get.test.js:12-23`, `test/sandbox-run-get.test.js:39-90`), and cleanup tests (`test/sandbox-run-cleanup.test.js:41-141`). |
| Error message/code/key-order tuples for the six sandbox errors | Shared serializer and six constructors (`src/sandbox-run-lease.js:964-1017`) | `src/sandbox-run-lease.js`, generated artifact, and the existing POST/GET/DELETE error assertions listed in §4.3. |
| UUID lexical grammar | Case-insensitive regular expression and boolean/throw helpers (`src/sandbox-identifiers.js:1-11`) | Sandbox route/input, shared issuance, and ownership/lifecycle modules (`src/sandbox-run-lease.js:35`, `src/sandbox-run-lease.js:100-105`, `src/capability-issuance.js:22`, `src/capability-issuance.js:265-274`, `src/sandbox-ownership.js:11-20`, `src/spb-sandbox-lifecycle.js:10-26`). |
| Actual sandbox response security-header set | Admin-specific constant supplied to the route (`src/admin.js:54-62`, `src/admin.js:158-166`) | `src/admin.js` remains the HTTP-boundary owner; the contract source/generator should describe or verify it without replacing the common admin header owner. The similarly named global constant is not the value used here (`src/index.js:148-156`). |

The four capability constructors' exact value/env dependencies are:

| Capability | Value and environment reads |
|---|---|
| Scout | The response fields use the decrypted standing-key argument, a newly minted dispatch token, the configured account ID, and the dispatch issuance timestamp (`src/capability-issuance.js:24-38`, `src/capability-issuance.js:166-195`). The fenced write uses `env.DB`, and token hashing explicitly reads `env.DISPATCH_TOKEN_PEPPER` (`src/capability-issuance.js:174-183`, `src/crypto.js:35-42`). Before the constructor, the orchestrator reads the standing key from `env.DB` and decrypts it using `env.ENCRYPTION_SECRET` (`src/sandbox-run-lease.js:526-538`, `src/crypto.js:26-32`, `src/crypto.js:112-119`). |
| SPL | The response fields use two fixed capability literals and `new Date(nowMs).toISOString()` (`src/capability-issuance.js:77-85`). Issuance reads `env.DB`; lease capping reads `env.RELAY_GRACE_DAYS`; the relay push reads `env.RELAY_GRANT_URL`, `env.RELAY_GRANT_SECRET`, and optional `env.RELAY` (`src/capability-issuance.js:49-76`, `src/relay-grant.js:35-44`, `src/relay-grant.js:107-139`). |
| SPB | The response fields use the caller-supplied broker endpoint/account/instance, `env.R2_BUCKET`, a deterministic prefix, and a newly minted token (`src/capability-issuance.js:87-117`). Binding/entitlement work reads `env.DB`, and token hashing reads the default `env.HMAC_PEPPER` (`src/capability-issuance.js:96-104`, `src/capability-issuance.js:212-227`, `src/crypto.js:35-42`). |
| SPP | The response fields use `env.SPP_ENGINE_ENDPOINT`, `env.SPP_ENGINE_MODEL`, a newly minted credential, the account ID, and an ISO timestamp (`src/capability-issuance.js:119-160`). Binding/entitlement work reads `env.DB`, and credential hashing reads the default `env.HMAC_PEPPER` (`src/capability-issuance.js:129-148`, `src/capability-issuance.js:230-262`, `src/crypto.js:35-42`). |

Property insertion order is exactly the order shown by those constructor object
literals (`src/capability-issuance.js:31-36`,
`src/capability-issuance.js:79-83`, `src/capability-issuance.js:105-112`,
`src/capability-issuance.js:152-158`).

The UUID regex is
`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`
(`src/sandbox-identifiers.js:1`). Neither
helper transforms or returns an identifier (`src/sandbox-identifiers.js:3-11`),
and request validation returns the original parsed object
(`src/sandbox-run-lease.js:509-524`); therefore accepted letter case is
preserved, not normalized.

### 3.2 Sites outside the supplied starting list

The supplied list is not complete. The exhaustive `src/**/*.js` search found
these additional contract touch points:

- Most run-status, phase, state, and residual uses occur throughout the cleanup
  implementation, not just its leading constants and renderer
  (`src/sandbox-run-lease.js:317-447`, `src/sandbox-run-lease.js:502-505`,
  `src/sandbox-run-lease.js:550-602`, `src/sandbox-run-lease.js:604-839`,
  `src/sandbox-run-lease.js:841-865`, `src/sandbox-run-lease.js:896-910`).
- D1 provisioning fences for dispatch, SPL, SPB, and SPP restate run/phase
  predicates (`src/db.js:455-492`, `src/db.js:1369-1409`,
  `src/db.js:1454-1515`, `src/db.js:1556-1606`). The sandbox-aware
  authorization reads also restate the live-run status predicate
  (`src/db.js:531-550`, `src/db.js:1742-1803`, `src/db.js:1849-1869`).
- Exported claim helpers outside the orchestrator carry three default expected
  phases (`src/sandbox-ownership.js:13-55`,
  `src/spb-sandbox-lifecycle.js:19-24`).
- The actual admin header constant is `src/admin.js:54-62`, and it is the object
  passed at `src/admin.js:158-166`; the supplied `src/index.js:148-156` constant
  is a different CSP.
- Two other modules define the same lexical UUID regex for their own account
  and relay boundaries (`src/admin.js:35`, `src/relay-grant.js:12`). They are not
  current consumers of `sandbox-identifiers.js`.
- Relay retirement defines the upstream component names translated by the
  sandbox map (`src/relay-grant.js:13-33`, `src/relay-grant.js:178-190`).

### 3.3 False-positive analysis

- The same status-looking words occur in entitlement state machines, including
  the shared capability issuer, relay/billing modules, and owner/admin display
  paths
  (`src/capability-issuance.js:142-164`, `src/relay-grant.js:35-48`,
  `src/spb-entitlement.js:14-45`, `src/spp-entitlement.js:6-16`,
  `src/billing.js:180-255`, `src/enable.js:875-890`,
  `src/admin.js:747-758`, `src/index.js:990-1001`,
  `src/html.js:804-818`). Those values
  describe entitlements, not sandbox-run rows, and must not be folded into the
  sandbox vocabulary merely because the spelling matches.
- Result/outcome words in ownership and SPB lifecycle helpers describe function
  outcomes rather than stored component states (`src/sandbox-ownership.js:74-121`,
  `src/spb-sandbox-lifecycle.js:44-84`). Mapping remains the orchestrator's job
  (`src/sandbox-run-lease.js:604-727`).
- The relay failed-component names and their sandbox residual translations are
  deliberately different concepts (`src/relay-grant.js:13-33`,
  `src/sandbox-run-lease.js:65-74`).
- The migration action string in Scout migration is unrelated to the
  provisioning phase with the same spelling (`src/scout-migrate.js:80-92`).
  Similarly, WebCrypto verification and user-facing “verify” text are unrelated
  to the cleanup phase (`src/reach.js:118-140`, `src/html.js:516-524`).
- The index and admin security-header constants share five values but have
  intentionally different CSPs: the generic portal policy includes Turnstile
  origins (`src/index.js:148-156`), while the admin policy excludes them
  (`src/admin.js:54-62`, `test/admin.test.js:196-205`).

## 4. Q2 — shipped byte-level HTTP behavior

### 4.1 Serialization and exact header set

Every sandbox response is `JSON.stringify` with no replacer, spacing, or final
newline (`src/sandbox-run-lease.js:964-970`). Insertion order in the cited
object literals is therefore serialized body key order.

All sandbox success responses and all six sandbox error responses have this
exact case-insensitive header set:

| Header | Exact value | Evidence |
|---|---|---|
| `Content-Type` | `application/json` | `src/sandbox-run-lease.js:964-969` |
| `Cache-Control` | `no-store` | `src/sandbox-run-lease.js:964-969` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | `src/admin.js:54-62` |
| `X-Frame-Options` | `DENY` | `src/admin.js:54-62` |
| `X-Content-Type-Options` | `nosniff` | `src/admin.js:54-62` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | `src/admin.js:54-62` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | `src/admin.js:54-62` |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; frame-ancestors 'none'` | `src/admin.js:54-62` |

DELETE 202 adds exactly `Retry-After` whose value is `String` of the same decimal
integer placed in the JSON field (`src/sandbox-run-lease.js:146-149`). No other
header is added by the sandbox response constructor
(`src/sandbox-run-lease.js:964-970`). Existing tests assert selected headers and
the HEAD equality described below, but no test currently asserts this entire
named set against an expected set (`test/sandbox-run-get.test.js:58-60`,
`test/sandbox-run-payloads.test.js:40-41`, `test/admin.test.js:196-205`).

### 4.2 Success responses

| Response | Exact body key order | Existing assertion and coverage |
|---|---|---|
| POST 201 | `run_id`, `contract_version`, `profile`, `lease_expires_at`, `capabilities`; nested capability order is `scout`, `spl`, `spb`, `spp`. Scout fields: `google_api_key`, `dispatch_token`, `account_id`, `created_at`. SPL fields: `service`, `state`, `approved_at`. SPB fields: `broker_endpoint`, `account_id`, `instance_id`, `bucket`, `prefix`, `broker_token`. SPP fields: `endpoint_url`, `served_model_id`, `credential`, `account_id`, `created_at`. | Construction is `src/sandbox-run-lease.js:256-267` and `src/capability-issuance.js:24-160`. `test/sandbox-run-payloads.test.js:28-108` asserts status, top-level/capability order, exact field sets, fixed/env-derived values, and forbidden extras. It sorts each inner key set (`test/sandbox-run-payloads.test.js:50-75`), so it does **not** assert the four inner serialization orders or the entire raw body. |
| GET 200 | `run_id`, `contract_version`, `profile`, `status`, `provisioning_phase`, `cleanup_phase`, `lease_expires_at`, `lease_live`, `retry_after_seconds`, `components`; each component is `component`, `state`, `residual_code`, `updated_at`, in the component order defined at `src/sandbox-run-lease.js:58-64`. | Construction is `src/sandbox-run-lease.js:868-894`. `test/sandbox-run-get.test.js:12-23` and `test/sandbox-run-get.test.js:39-90` assert status, top-level order, component order, component key order, redaction, and no write. They do not assert the entire raw body or full expected header set. |
| DELETE 200 | Same report order as GET. The 200 branch is selected only after the durable terminal postcondition (`src/sandbox-run-lease.js:143-145`, `src/db.js:2242-2268`). | `test/sandbox-run-cleanup.test.js:41-102` asserts status, report outcome/component values, no-store, side-effect ordering, and that a repeated DELETE body is byte-identical (`test/sandbox-run-cleanup.test.js:94-101`). It does not compare the first body to a committed byte string or assert the full header set. |
| DELETE 202 | Same report order as GET, plus `Retry-After` described above. The branch additionally requires the exact report predicate at `src/sandbox-run-lease.js:896-906`. | `test/sandbox-run-cleanup.test.js:104-141` asserts 202, matching decimal header/JSON values, sole pending component shape, persisted retry clock, and repeated byte equality. It exercises one 90-second value but does not prove the absence of an upper clamp. |

The retry calculation has a lower clamp only:
`Math.max(1, Math.ceil((storedAbsoluteMs - nowMs) / 1000))`
(`src/sandbox-run-lease.js:868-872`). There is no upper-bound operation in that
expression, so an insertable or proxied future timestamp can produce any larger
safe integer. The design prose's 90-second operational bound comes from the
upstream credential TTL, not from response rendering
(`docs/sandbox-run-lease-design.md:593-616`). No current response test covers a
value greater than that upstream TTL (`test/sandbox-run-cleanup.test.js:104-141`).

The `lease_live` rule is strict: the row status must equal the single serving
status literal cited at `src/sandbox-run-lease.js:76-78`, and `nowMs` must be
strictly less than `lease_expires_at`. Equality is therefore not live. The
boundary and non-mutating behavior are covered by
`test/sandbox-run-get.test.js:92-129`.

The expired-render invariant is also exact: if a component retains the stored
serving state while `lease_live` is false, rendering substitutes the
denial-pending state and lease-expiry residual defined at
`src/sandbox-run-lease.js:883-890`; it does not mutate D1
(`test/sandbox-run-get.test.js:92-129`). All other component state/residual
pairs are emitted from the row (`src/sandbox-run-lease.js:883-892`).

### 4.3 Six sandbox error envelopes

| Constructor | HTTP status and exact serialized body | Existing assertion |
|---|---|---|
| Invalid request | 400, `{"error":"invalid sandbox run request","code":"invalid_sandbox_run_request"}` (`src/sandbox-run-lease.js:972-977`) | Parsed-object equality for every invalid shape, not raw bytes or complete headers (`test/sandbox-run-post.test.js:36-75`). |
| Create/member unavailable | 503, `{"error":"sandbox run unavailable","code":"sandbox_run_unavailable","run_id":"<caller value>"}` (`src/sandbox-run-lease.js:987-993`) | Parsed equality for baseline/config failures (`test/sandbox-run-post.test.js:77-116`, `test/sandbox-run-admin.test.js:81-96`) and raw equality for insert failure (`test/sandbox-run-faults.test.js:267-307`). |
| Create conflict | 409, `{"error":"sandbox run conflict","code":"sandbox_run_conflict","run_id":"<caller value>"}` (`src/sandbox-run-lease.js:979-985`) | Raw equality (`test/sandbox-run-post.test.js:137-160`). |
| Cleanup conflict | 409, `{"error":"sandbox run cleanup conflict","code":"sandbox_run_cleanup_conflict","run_id":"<caller value>"}` (`src/sandbox-run-lease.js:995-1001`) | Raw equality and redaction (`test/sandbox-run-cleanup.test.js:143-186`). |
| Cleanup unavailable | 503, `{"error":"sandbox run cleanup unavailable","code":"sandbox_run_cleanup_unavailable","run_id":"<caller value>"}` (`src/sandbox-run-lease.js:1003-1009`) | Raw equality and durable evidence (`test/sandbox-run-cleanup.test.js:188-235`). |
| Scoped member absent | 404, `{"error":"sandbox run not found","code":"sandbox_run_not_found","run_id":"<caller value>"}` (`src/sandbox-run-lease.js:1011-1017`) | Raw equality, headers subset, redaction, and cross-account ambiguity (`test/sandbox-run-get.test.js:131-168`). |

The Access failure is a separate boundary envelope: 403 with the one-key body
`{"error":"cloudflare access required"}` (`src/admin.js:141-145`), asserted as
a parsed object for POST/GET/DELETE (`test/sandbox-run-admin.test.js:23-32`). The
uniform admin absence/error envelope is 404 with
`{"error":"account not found"}` (`src/admin.js:169-170`,
`src/admin.js:187-190`), asserted for unsupported/malformed sandbox paths and an
unknown DELETE (`test/sandbox-run-admin.test.js:34-51`). Both use the same eight
headers in §4.1 because `json` supplies content/cache headers and lets the admin
CSP override the generic CSP (`src/index.js:226-235`, `src/admin.js:54-62`). No
test currently asserts their raw bodies plus complete expected header sets.

### 4.4 Authenticated absence split and HEAD

For a canonical member path, the sandbox route first performs the account-scoped
read (`src/sandbox-run-lease.js:107-115`, `src/db.js:1938-1944`). An absent GET
is converted inside that route to the three-key sandbox absence envelope, while
an absent DELETE returns `null` (`src/sandbox-run-lease.js:116-120`). `handleAdmin`
then converts the latter into its uniform one-key 404 because DELETE is not GET
(`src/admin.js:158-170`). Both sides are asserted by
`test/sandbox-run-get.test.js:131-168` and
`test/sandbox-run-admin.test.js:34-51`.

HEAD is rewritten to GET before routing, then reconstructed with a null body and
the exact GET status, status text, and header object (`src/index.js:959-967`).
The sandbox-specific test compares every returned header for both existing and
absent canonical members (`test/sandbox-run-admin.test.js:54-78`). The older
cross-route precedent checks mirrored status/content type and empty body
(`test/head-requests.test.js:5-40`). Thus status and headers mirror byte-for-byte;
the response body is deliberately absent.

### 4.5 Timestamp representations

- POST `lease_expires_at` is an integer epoch-millisecond value computed from
  the integer creation clock plus the fixed lease (`src/sandbox-run-lease.js:184-195`,
  `src/sandbox-run-lease.js:256-267`); the payload test asserts the exact integer
  (`test/sandbox-run-payloads.test.js:76-85`).
- GET/DELETE `lease_expires_at` and every component `updated_at` are emitted
  directly from D1 integer columns (`schema.sql:442-445`,
  `schema.sql:475-532`, `src/sandbox-run-lease.js:873-890`). Under legal
  production writes they are integer epoch milliseconds; adversarial SQLite
  affinity is covered separately in §7.3.
- Scout `created_at`, SPL `approved_at`, and SPP `created_at` are
  `new Date(nowMs).toISOString()` strings (`src/capability-issuance.js:79-83`,
  `src/capability-issuance.js:152-158`, `src/capability-issuance.js:185-194`).
  That shipped operation produces UTC RFC3339 strings with milliseconds. The
  SPL timestamp is asserted exactly (`test/sandbox-run-payloads.test.js:76-86`);
  the Scout and SPP tests currently assert field presence but not their exact
  string values (`test/sandbox-run-payloads.test.js:50-75`).

## 5. Q3 — `last_residual_code` is intentionally a strict superset

The D1 aggregate list contains the union of all five per-component residual
lists plus exactly two creation-failure-only tail members
(`migrations/0027_sandbox_run_lease.sql:89-173`, `schema.sql:447-531`). The
authoritative design states the same shape and purpose without making the
aggregate field part of the public report (`docs/sandbox-run-lease-design.md:150-159`,
`docs/sandbox-run-lease-design.md:629-656`).

The two extra members are selected only when activation fails or loses its CAS
and are passed to the cleanup-request writer
(`src/sandbox-run-lease.js:268-299`). That writer stores the supplied member in
`last_residual_code` (`src/db.js:2061-2101`). Normal activation clears the
column (`src/db.js:2009-2058`); component updates copy their component residual
into it (`src/db.js:2129-2155`); and final cleanup disposition may replace it
with the selected cleanup residual (`src/db.js:2218-2239`). The internal
cleanup classifier reads component residuals first and the aggregate only as a
fallback (`src/sandbox-run-lease.js:858-861`). The public renderer reads only
the five component residual columns, never `last_residual_code`
(`src/sandbox-run-lease.js:868-894`). Therefore those two creation-only members
cannot appear in a v1 report through the shipped renderer.

The migration test currently constructs the aggregate list as the component
union plus those two members (`test/migration-0027-sandbox-run-lease.test.js:53-130`)
and tests acceptance/rejection (`test/migration-0027-sandbox-run-lease.test.js:262-318`).
That construction can hide coordinated drift. The parity test must instead:

1. Compare each source per-component residual set bidirectionally with its D1
   constraint set (`migrations/0027_sandbox_run_lease.sql:105-173`,
   `schema.sql:463-531`).
2. Compute the union of those independently checked sets and assert every union
   member belongs to the aggregate set (`migrations/0027_sandbox_run_lease.sql:89-104`,
   `schema.sql:447-462`).
3. Assert the aggregate-minus-union difference is bidirectionally equal to the
   separate two-member creation-failure set defined by the source, and assert
   that set is disjoint from every per-component set
   (`src/sandbox-run-lease.js:275-299`).
4. Also assert aggregate equality to union-plus-creation-only members, so an
   addition or deletion on either side fails rather than being absorbed by a
   spread expression (`test/migration-0027-sandbox-run-lease.test.js:126-130`).

The activation-CAS member has direct durable-write coverage
(`test/sandbox-run-faults.test.js:239-265`). I found no test that directly
forces the time-expiry member at the same source branch; that coverage is
currently **unverified** (`src/sandbox-run-lease.js:268-280`).

## 6. Q4 — serving exact committed bytes

### 6.1 Existing configuration and precedent

The account Wrangler config has no `[[rules]]`; it defines the module entrypoint,
compatibility date, and `nodejs_compat` only (`wrangler.toml:1-5`). The Worker
Vitest configuration delegates to a shared config that reads that same Wrangler
file and repeats the entrypoint/compatibility settings
(`vitest.worker.config.js:1-4`, `vitest.worker.shared.js:3-16`). The locked pool
is `@cloudflare/vitest-pool-workers` 0.5.41 with its own Wrangler 3.100.0, while
the installed top-level Wrangler resolved within v3 to 3.114.17
(`package-lock.json:31-50`, `package-lock.json:75-103`,
`package-lock.json:3586-3606`).

An exhaustive `rg -n "\\?raw|\\.json['\"]" src` returned no matches; because a
zero-match search has no `file:line`, this is command evidence rather than a
source citation. Tests already use `?raw` for SQL, which confirms the statement
is specifically about `src/` (`test/migration-0027-sandbox-run-lease.test.js:1-5`).

The current drift-prevention pattern embeds CSS in a JS template literal and
compares it to the source file (`src/assets.js:1-3`,
`test/static.test.js:99-101`); the route serves that embedded string
(`src/index.js:305-312`). Fonts embed base64, decode at runtime, and compare the
decoded bytes to committed files (`src/assets.js:362-370`,
`src/index.js:315-327`, `test/static.test.js:130-133`). The supplied font line
reference was stale: `src/assets.js:131-135` is currently CSS; the font evidence
is at the lines just cited.

### 6.2 Probes

All probe files are outside the repository under
`/home/extro/.hopper/scratchpad/sandbox-run-contract-gnex3g2d/`. No Wrangler CLI
command was run. The top-level Wrangler check used its local
`unstable_startWorker` API in local/no-metrics mode
(`/home/extro/.hopper/scratchpad/sandbox-run-contract-gnex3g2d/wrangler-probe.mjs:1-44`).

#### Default JSON module

The worker imports a committed JSON module as an object and serializes it
(`/home/extro/.hopper/scratchpad/sandbox-run-contract-gnex3g2d/json/src/index.js:1-9`).
The probe Wrangler config needs no module rule
(`/home/extro/.hopper/scratchpad/sandbox-run-contract-gnex3g2d/json/wrangler.toml:1-4`),
and the pool config points at that file and entrypoint
(`/home/extro/.hopper/scratchpad/sandbox-run-contract-gnex3g2d/json/vitest.worker.config.js:1-16`).

Actual pool command output:

```text
hop check: `/home/extro/.hopper/worktrees/gnex3g2d/account/node_modules/.bin/vitest run --config vitest.worker.config.js` exited 0

 RUN  v2.1.9 /home/extro/.hopper/scratchpad/sandbox-run-contract-gnex3g2d/json

[vpw:inf] Starting single runtime for vitest.worker.config.js...
[mf:wrn] The latest compatibility date supported by the installed Cloudflare Workers Runtime is "2024-12-30",
but you've requested "2025-04-01". Falling back to "2024-12-30"...
 ✓ probe.test.js (1 test) 8ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Duration  535ms (transform 11ms, setup 0ms, collect 12ms, tests 8ms, environment 1ms, prepare 110ms)
```

Actual top-level Wrangler v3 output:

```text
hop check: `node ../wrangler-probe.mjs /home/extro/.hopper/scratchpad/sandbox-run-contract-gnex3g2d/json` exited 0
No bindings found.
⎔ Starting local server...
[wrangler:inf] Ready on http://localhost:8787
{"wrangler":"3.114.17","case":"json","status":200,"bytes":41,"exact":true,"committed_exact":false}
⎔ Shutting down local server...
[wrangler:inf] GET / 200 OK (4ms)
```

Conclusion: a default JSON module works in both runtimes, but it yields a parsed
value rather than the source text. The serializer produced the expected
canonical 41 bytes, while `committed_exact:false` records that the committed
file's final newline was not served
(`/home/extro/.hopper/scratchpad/sandbox-run-contract-gnex3g2d/json/src/contract.json:1`,
`/home/extro/.hopper/scratchpad/sandbox-run-contract-gnex3g2d/wrangler-probe.mjs:13-41`).

#### Wrangler Text module rule

The text probe adds this rule:

```toml
[[rules]]
type = "Text"
globs = ["**/*.json"]
fallthrough = true
```

The exact config is at
`/home/extro/.hopper/scratchpad/sandbox-run-contract-gnex3g2d/text/wrangler.toml:1-9`.
The Worker imports the JSON file as a string and serves it directly
(`/home/extro/.hopper/scratchpad/sandbox-run-contract-gnex3g2d/text/src/index.js:1-9`).
No special Vitest transform is required: the pool merely reads the Wrangler
config, as the repository already does
(`/home/extro/.hopper/scratchpad/sandbox-run-contract-gnex3g2d/text/vitest.worker.config.js:1-16`,
`vitest.worker.shared.js:8-15`). `fallthrough = true` retains Wrangler's other
module rules; it is therefore part of the required Wrangler change.

Actual pool command output:

```text
hop check: `/home/extro/.hopper/worktrees/gnex3g2d/account/node_modules/.bin/vitest run --config vitest.worker.config.js` exited 0

 RUN  v2.1.9 /home/extro/.hopper/scratchpad/sandbox-run-contract-gnex3g2d/text

[vpw:inf] Starting single runtime for vitest.worker.config.js...
[mf:wrn] The latest compatibility date supported by the installed Cloudflare Workers Runtime is "2024-12-30",
but you've requested "2025-04-01". Falling back to "2024-12-30"...
 ✓ probe.test.js (1 test) 8ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Duration  534ms (transform 10ms, setup 0ms, collect 12ms, tests 8ms, environment 0ms, prepare 110ms)
```

Actual top-level Wrangler v3 output:

```text
hop check: `node ../wrangler-probe.mjs /home/extro/.hopper/scratchpad/sandbox-run-contract-gnex3g2d/text` exited 0
No bindings found.
⎔ Starting local server...
[wrangler:inf] Ready on http://localhost:8787
{"wrangler":"3.114.17","case":"text","status":200,"bytes":53,"exact":true,"committed_exact":true}
⎔ Shutting down local server...
[wrangler:inf] GET / 200 OK (3ms)
```

Conclusion: the `Text` rule serves the committed JSON bytes exactly under both
the pool's Wrangler/runtime stack and the repository's installed Wrangler v3.
It costs a new broad bundler rule in `wrangler.toml`; narrowing the glob to the
single artifact would reduce that scope. `?raw` was not needed and its behavior
in product `src/` remains **unverified**.

### 6.3 Assets-style alternative and recommendation

The smaller-config alternative is a source module that owns the contract data
and a deterministic serializer, computes one module-level served-body constant,
and exports that same constant to the route. A generator writes exactly that
serializer output; `--check` reads the committed artifact and fails unless its
bytes equal the served-body constant. The check must also fail unless both byte
lengths are less than 65,536, and the route must read neither `env` nor request
state when choosing/building the body. This mirrors the existing embedded-asset
and byte-parity pattern (`src/assets.js:1-3`, `src/assets.js:362-370`,
`test/static.test.js:99-101`, `test/static.test.js:130-133`). The eventual
artifact does not exist, so its actual size is currently **unverified**.

**Recommendation:** use the deterministic source serializer plus committed
artifact and strict `--check`, with a module-level embedded/serialized body as
the route value. It avoids a new Worker bundler rule and works in the already
tested JS-module path. The bytes are represented twice—once by the JS source
data/serializer result and once by the committed artifact—which is a real
duplication cost; byte-for-byte `--check`, bidirectional vocabulary parity, and
the shared size assertion make drift fail closed. The `Text` import is viable
and literally serves the one artifact, but the extra security-critical bundler
configuration is more moving parts for no runtime-state benefit.

## 7. Q5 — adversarial-row injection

### 7.1 Shipped proxy shape and GET target

The three shipped proxies all wrap a real D1 object with `prepare(sql)` and
`batch(statements)`. They regex-match only the target SQL; unmatched statements
delegate directly. Matched prepared statements return a wrapper whose
`bind(...values)` either delegates or returns a controlled `.all()` result or
throws. `phaseLosingDb` returns an empty `results` array for one phase CAS,
`activationLosingDb` does the same for activation, and `provisioningFaultDb`
adds stateful one-shot throws plus `enableCleanup`/`wasInjected`
(`test/sandbox-run-faults.test.js:314-393`).

A malformed GET proxy should preserve that shape but match exactly
`SELECT * FROM sandbox_runs WHERE run_id = ? AND account_id = ?`, retain
`.bind(runId, accountId)`, and override the bound statement's `.first()` with a
cloned malformed row (`src/db.js:1938-1944`). That is the only row read before
GET rendering (`src/sandbox-run-lease.js:107-123`). It should delegate every
other `prepare`, bound method, and `batch` call, as the shipped proxies do
(`test/sandbox-run-faults.test.js:314-393`).

### 7.2 DELETE target and durable-evidence proof

DELETE first performs the same scoped read before any cleanup
(`src/sandbox-run-lease.js:107-120`). That read must stay real, or an injected
absence returns `null` and no cleanup runs. Reconciliation then performs an
unscoped initial read, cleanup request/claim and component writes, local
verification, and an unscoped final read
(`src/sandbox-run-lease.js:317-341`, `src/sandbox-run-lease.js:343-419`). Both
unscoped reads use exactly `SELECT * FROM sandbox_runs WHERE run_id = ?`
(`src/db.js:1930-1936`). Therefore the malformed-row proxy must count that exact
query and poison the second normal-path `.first()`—the call at
`src/sandbox-run-lease.js:419`—not the initial call at line 320.

Placement matters. Today the row from line 419 is still used by terminal/pending/
failure classification and can be replaced by an `UPDATE ... RETURNING *` row
before `reconcileSandboxRun` returns (`src/sandbox-run-lease.js:421-447`,
`src/db.js:2218-2268`). A future row validator must therefore validate
immediately after the final read if the test is to poison that read alone. If
validation is deferred to `renderSandboxRun`, the final CAS return can erase the
poison; relying only on the handler's fallback scoped read is also insufficient,
because that read occurs only when `result.row` is false
(`src/sandbox-run-lease.js:135-144`). This is the concrete testability constraint
for the design.

The proxy must delegate every earlier `.all()`/`.run()` so D1 executes cleanup
writes. On validation failure, the DELETE handler catches and returns the closed
cleanup-unavailable envelope (`src/sandbox-run-lease.js:125-134`). The test can
prove durability by taking `dbDumpText()` before/after through the real base DB
(`test/helpers.js:462-495`) or, more readably, by querying the row directly as
the cleanup tests do (`test/sandbox-run-cleanup.test.js:734-737`). It should
assert changed cleanup/component evidence in the base row, remove the proxy,
retry the ordinary DELETE/reconciler, and assert convergence; existing tests
already use before/after dumps for durable failure evidence and direct row
assertions for retry convergence (`test/sandbox-run-cleanup.test.js:188-235`,
`test/sandbox-run-cleanup.test.js:372-430`,
`test/sandbox-run-cleanup.test.js:472-505`).

### 7.3 What `seedSandboxRun` can create legally

`seedSandboxRun` binds every row field directly and exposes nullability/type
controls (`test/helpers.js:705-815`). The schema is not a `STRICT` table: identity
columns are only `TEXT NOT NULL`, timestamp columns use SQLite affinity, and the
terminal constraint does not require all component states to match the terminal
run marker (`schema.sql:417-446`, `schema.sql:533-581`).

I ran a three-case Worker-pool probe against the real helper/schema. It proved
that D1 accepts malformed-but-non-null identity text, text in integer-affinity
evidence/timestamp columns, and a vocabulary-valid terminal/component
combination that the orchestrator cannot normally produce; it rejects a null
required field and unknown checked vocabulary values
(`/home/extro/.hopper/scratchpad/sandbox-run-contract-gnex3g2d/rows/probe.test.js:10-69`).

Actual output:

```text
hop check: `/home/extro/.hopper/worktrees/gnex3g2d/account/node_modules/.bin/vitest run --config vitest.worker.config.js` exited 0

 RUN  v2.1.9 /home/extro/.hopper/scratchpad/sandbox-run-contract-gnex3g2d/rows
 ✓ probe.test.js (3 tests) 90ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Duration  1.05s (transform 101ms, setup 5ms, collect 412ms, tests 90ms, environment 1ms, prepare 81ms)
```

Real rows should therefore cover response timestamp type violations and
cross-field invariants. A canonical path ID can be retained while poisoning a
different identity or evidence field because the helper exposes each field
independently (`test/helpers.js:705-784`). Unknown status/phase/state/residual
members, forbidden nulls, and illegal state/residual relationships are rejected
by D1 and require the proxy mechanism (`schema.sql:423-581`). The migration tests
independently demonstrate those CHECK failures
(`test/migration-0027-sandbox-run-lease.test.js:184-318`).

## 8. Report-only implementation delete-list and duplicate bound

The reconciliation bound is duplicated between
`SANDBOX_RECONCILE_BATCH_SIZE` and SQL `LIMIT 10`
(`src/sandbox-run-lease.js:42`, `src/sandbox-run-lease.js:450-455`,
`src/db.js:1946-1961`). Putting the fixed bound in the new source naturally
unifies the pair: the orchestrator imports it for its assertion and `db.js`
imports it for interpolation into its fixed SQL. No change was made.

Tests that currently restate vocabulary or report structure and should be on the
implementation-stage delete/import list are:

- `test/sandbox-run-payloads.test.js:42-102`: POST top-level/capability shapes,
  values, and forbidden extras.
- `test/migration-0027-sandbox-run-lease.test.js:14-130`: all status/phase/state/
  residual arrays and the aggregate construction; the acceptance/rejection
  loops at `test/migration-0027-sandbox-run-lease.test.js:184-318` consume them.
- `test/sandbox-run-get.test.js:12-23` and
  `test/sandbox-run-get.test.js:61-88`: report top-level keys, component order,
  component keys, and values; `test/sandbox-run-get.test.js:92-129` restates the
  expired rendering invariant.
- `test/sandbox-run-cleanup.test.js:72-83` and
  `test/sandbox-run-cleanup.test.js:120-130`: terminal and pending report
  assertions. Further stored vocabulary assertions occur at
  `test/sandbox-run-cleanup.test.js:218-230`,
  `test/sandbox-run-cleanup.test.js:271-277`,
  `test/sandbox-run-cleanup.test.js:314-320`,
  `test/sandbox-run-cleanup.test.js:357-363`,
  `test/sandbox-run-cleanup.test.js:403-430`,
  `test/sandbox-run-cleanup.test.js:449-469`,
  `test/sandbox-run-cleanup.test.js:487-505`, and
  `test/sandbox-run-cleanup.test.js:526-552`.
- `test/sandbox-run-test-helpers.js:4-31`: fixed request selectors, IDs, and
  create-request construction.

No implementation action was taken on these sites.
