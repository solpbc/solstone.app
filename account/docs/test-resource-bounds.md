# Account-Portal Test Resource Bounds

Implemented, gate-approved design for bounding the account-portal test suite
without reducing Worker-runtime fidelity or silently omitting new tests.

Inputs:

- Canonical partition membership and exact-set guard:
  `account/test/partitions.js:1-121` and
  `account/scripts/check-test-partitions.mjs:1-118`.
- Shared Worker/Miniflare definition and the three project configs:
  `account/vitest.worker.shared.js:1-51`,
  `account/vitest.worker.config.js:1-4`,
  `account/vitest.passkey.config.js:1-4`, and
  `account/vitest.node.config.js:1-14`.
- Cross-file cleanup policy and process-global helper seams:
  `account/test/setup.js:1-6` and
  `account/test/helpers.js:157-316`.
- Stable passkey mock identity and its four consumers:
  `account/test/simplewebauthn-server.mock.js:1-8`,
  `account/test/passkey-auth.test.js:1-23`,
  `account/test/passkey-register.test.js:1-21`,
  `account/test/passkey-origin.test.js:1-20`, and
  `account/test/passkey-rate.test.js:1-22`.
- Linux process sampler, metric assessment, and reporting contract:
  `account/scripts/measure-test-resources.mjs:1-548`.
- Pre-change representative D1/router test:
  `account/test/session.test.js:1-55`.
- Concrete pre-change leaked doubles:
  `account/test/dashboard.test.js:85-103`,
  `account/test/settings-emails.test.js:205-225`, and
  `account/test/provision-scout.test.js:12-42`.

## Topology And Safety

`npm test` runs the sandbox-run contract drift check, the partition guard, the
ordinary Worker project, the passkey Worker project, and the Node project in
that order with `&&`. It is fail-fast: a nonzero phase stops the chain and
remains the command's nonzero status. The two Worker phases cannot overlap,
and each uses `singleWorker: true` with `isolatedStorage: true`; the Node phase
cannot spawn Miniflare. A Vitest workspace is intentionally not used because
projects could run concurrently.

The Worker projects import one `vitest.worker.shared.js` definition for the
entrypoint, Wrangler config, compatibility settings, auxiliary workers, D1,
KV, and test-only bindings. The Node project imports none of that definition.
There is deliberately no `vitest.config.js`: bare `npx vitest` uses Node
defaults and fails loudly on Worker-only imports. The supported gate is
`npm test`.

The explicit arrays in `test/partitions.js` are the only assignment source of
truth. This inventory describes fidelity but does not repeat scheduling
assignment. The guard recursively discovers `test/**/*.test.js`, including
nested files, and requires every discovered file to appear exactly once.

## Isolation Evidence

The pre-change empirical eight-file subset used exactly one `workerd` with
`singleWorker: true`; per-test D1 rollback remained intact under
`isolatedStorage: true`; elapsed time improved from 2.579 s to 1.788 s.

Mock hoisting is per file in this Workers pool, while the project module cache
is shared. A cached `src/passkey.js` therefore retained the first inline
WebAuthn factory in the pre-change experiment. All four passkey files now keep
their per-file `vi.mock` registration but return the same cached object from
`test/simplewebauthn-server.mock.js`. Their existing `vi.clearAllMocks()` calls
remain in place. The shared `afterEach` then unstubs globals and restores all
mocks for every project.

No test uses `beforeAll`, and no test relies on a describe-scope or first-test
global stub surviving into a later test. The shared cleanup policy closes the
three observed end-of-file leaks in `dashboard.test.js`,
`settings-emails.test.js`, and `provision-scout.test.js` without weakening an
assertion.

## Measurement Command

Run `npm run test:resources` for one canonical `npm test`, or
`npm run test:resources -- --runs 2` for two children launched immediately and
concurrently. There is no retry, lock, queue, scheduler, daemon, or
cross-invocation coordination. Each child is launched detached; the sampler
resolves its actual process-group id from `/proc/<pid>/stat` before monitoring
or signaling it. The child must be its group leader, its group must differ from
the sampler's own group, and simultaneous children must resolve to distinct
groups. Signals are forwarded to each verified group with
`process.kill(-pgid, signal)`. A `workerd` is never targeted or killed to
improve teardown evidence.

This command is Linux-only because its process and resource evidence comes from
`/proc`. Child `npm test` stdout and stderr are inherited and passed through
unmodified: the child bytes are the same as when `npm test` is run directly.
The measurement code itself never reads or prints environment values, bindings,
or `/proc/<pid>/cmdline`. The test suite operates on synthetic fixtures, so its
pass-through log lines contain test data, not production PII.

The sampler runs every 100 ms. The maximum valid observed gap is 1,000 ms:
ten nominal intervals allow scheduler and GC jitter during two simultaneous
full runs. Worker project phases last tens of seconds, so a one-second blind
spot cannot conceal an entire `workerd` lifetime; it can still hide an RSS or
task spike, so any larger gap invalidates the peak series. The simultaneous
two-run validation observed a maximum gap of 100.3 ms under measured load.
The 1,000 ms threshold is therefore about ten times the observed jitter while
remaining small relative to a tens-of-seconds Worker phase. Teardown allowance
is 10,000 ms after each npm child closes.

`/proc/<pid>/stat` is parsed from the final closing parenthesis around `comm`,
so spaces and parentheses in the command name cannot shift `pgrp`. RSS and
thread values are label-parsed from `/proc/<pid>/status`. PID disappearance
with `ENOENT` is a normal race; any other enumeration or stat read/parse error,
and any other in-scope status read/parse error, invalidates the measurement.

Reported metrics have these exact meanings:

- **Peak aggregate RSS:** maximum valid-sample sum of `VmRSS`, in KiB, for all
  non-zombie processes in launched groups; the same maximum is also reported
  per run. Shared pages may be counted once per process, so this is a scoped
  aggregate rather than a unique-physical-memory measurement.
- **Concurrent workerd peak:** maximum exact-`comm` `workerd` process count,
  per group and in aggregate.
- **Peak task/thread count:** maximum valid-sample sum of `Threads` for all
  non-zombie processes in launched groups, reported per run and in aggregate.
- **First post-close lingering workerd:** PID/count in the first valid sample
  after each child closes.
- **Final teardown observation:** workerd PID/count in the first post-close
  sample showing zero, or the count at the 10,000 ms deadline when no clean
  sample was observed. Its source is reported as `clean-sample` or `deadline`;
  the required final count is zero.
- **Teardown time:** monotonic time from child close to the first subsequent
  valid zero-workerd sample; otherwise `not-observed-within-10000ms`.
- **Valid sample count:** complete samples whose in-scope records all parsed.
- **Maximum observed gap:** largest monotonic interval between successive
  sampling-attempt start times, including an attempt later rejected.
- **Child exit status and wall time:** close-event code or signal, and monotonic
  spawn-to-close duration.
- **Spawn/close timestamps and overlap:** monotonic timestamps relative to the
  measurement start; two-run overlap is the intersection of the two child
  lifetimes.

Exit behavior is fail-closed:

| Exit | Conditions |
|---|---|
| 0 | Every child exits 0; metrics are available; each run observes one or fewer concurrent `workerd` processes and at least one during its lifetime; the aggregate peak does not exceed the requested run count; the final teardown observation is zero; and two-run mode has a positive-duration overlap. |
| 1 | A child exits nonzero or by signal; a per-run `workerd` peak exceeds one; the aggregate peak exceeds the requested run count; a final teardown observation is nonzero at 10,000 ms; or a present two-run overlap has zero duration. |
| 2 | Arguments are invalid; `/proc` or the sampler's own PGID cannot be read; a child cannot spawn; a child PGID cannot be read or is invalid, is not led by the detached child, matches the sampler's group, or duplicates another run; child close status is missing; a run has no valid live-child sample or observes no `workerd`; there are zero valid samples; aggregate RSS or task/thread peak is zero; a sampling gap exceeds 1,000 ms; process enumeration fails; a stat or in-scope status record is malformed or unreadable; a live group sample has zero processes, RSS, or tasks; the two-run overlap window is missing; or the sampler fails internally. |
| 128 + signal | SIGINT, SIGTERM, or SIGHUP was received; it is forwarded to every verified active group. |

When the sampler can emit its report, unavailable resource fields are labeled
unavailable rather than shown as threshold-passing zeroes. The
metrics-unavailable reason list deduplicates repeated failures in
first-observed order. Any child test failure is printed prominently even when
metrics-unavailable precedence makes the final status 2.

## Baseline

The only pre-change before row is `test/session.test.js`, chosen because it
uses D1 and routes requests through `worker.fetch`: 494,288 KiB peak aggregate
RSS, one concurrent `workerd`, 99 peak tasks, and 1.357 s wall time.

## Fidelity Inventory

Markers are `E` = `cloudflare:test` environment/bindings, `D` = D1 semantics,
`R` = `worker.fetch`/`SELF.fetch` through the real router, `S` = a real
Miniflare service binding, and `N` = no Worker runtime. No current test uses
the real `extro-support` or `spl-relay` service binding, so no row has `S`.

### Authentication, Sessions, And Email Identity

| Test | Product behavior protected | Runtime |
|---|---|---|
| `crypto.test.js` | crypto helpers | E |
| `session-activity.test.js` | session activity metadata | E/D/R |
| `session.test.js` | session cookie, hashing, and raw-token exclusion | E/D/R |
| `settings-email-actions.test.js` | primary-email and removal actions | E/D/R |
| `settings-email-verify.test.js` | added-email verification | E/D/R |
| `settings-emails.test.js` | email list and add flow | E/D/R |
| `settings.test.js` | settings session management | E/D/R |
| `signin-start.test.js` | sign-in start and Turnstile boundary | E/D/R |
| `signin-verify.test.js` | OTP sign-in verification | E/D/R |

### Passkeys

| Test | Product behavior protected | Runtime |
|---|---|---|
| `passkey-auth.test.js` | passkey authentication | E/D/R |
| `passkey-origin.test.js` | passkey origin and response headers | E/D/R |
| `passkey-rate.test.js` | passkey rate limits | E/D/R |
| `passkey-register.test.js` | passkey registration | E/D/R |
| `settings-passkeys.test.js` | passkey settings surface | E/D/R |

### Portal, Public Pages, And Owner Settings

| Test | Product behavior protected | Runtime |
|---|---|---|
| `assets.test.js` | public portal assets | E/R |
| `brand-canon.test.js` | runtime brand canon over routes and email | E/D/R |
| `catalog.test.js` | services catalog | E/D/R |
| `dashboard.test.js` | signed-in catalog and decrypt failure | E/D/R |
| `goodbye.test.js` | goodbye page | E/R |
| `head-requests.test.js` | HEAD request parity | E/D/R |
| `landing.test.js` | root landing page | E/D/R |
| `landings.test.js` | service landing pages | E/D/R |
| `legacy-redirects.test.js` | customer-facing redirects | E/D/R |
| `settings-data.test.js` | transparency data view | E/D/R |
| `settings-gemini.test.js` | Gemini settings dashboard | E/D/R |
| `terms.test.js` | terms page | E/D/R |

`brand-canon.test.js` is a Worker/D1/router behavior test. It does not read
`src/` text and is not a Node-project candidate; the earlier premise to that
effect was incorrect.

### Devices, Push, And Reach

| Test | Product behavior protected | Runtime |
|---|---|---|
| `devices-deregister.test.js` | device deregistration | E/D/R |
| `devices-helpers.test.js` | device data helpers | E/D |
| `devices-list.test.js` | device listing | E/D/R |
| `devices-register.test.js` | device registration | E/D/R |
| `devices-settings.test.js` | device settings | E/D/R |
| `dispatch-token.test.js` | dispatch-token persistence | E/D |
| `enable-push.test.js` | push enablement | E/D/R |
| `handoff-push.test.js` | push handoff | E/D/R |
| `push-auth.test.js` | push relay authorization | E |
| `push-dedup.test.js` | push deduplication endpoint | E/R |
| `push-dispatch.test.js` | push dispatch endpoint | E/R |
| `push-jwt.test.js` | APNs JWT minting | E |
| `reach-relay-token.test.js` | reach relay-token endpoint | E/R |

### Service Enablement And Handoffs

| Test | Product behavior protected | Runtime |
|---|---|---|
| `enable-resume.test.js` | enable-resume signatures | E |
| `enable-scout.test.js` | Scout enablement | E/D/R |
| `enable-spb.test.js` | backup enablement | E/D/R |
| `enable-spl.test.js` | SPL enablement | E/D/R |
| `enable-spp.test.js` | SPP enablement | E/D/R |
| `handoff-scout.test.js` | Scout handoff | E/D/R |
| `handoff-spb.test.js` | backup handoff | E/D/R |
| `handoff-spl.test.js` | SPL handoff | E/D/R |
| `handoff-spp.test.js` | SPP handoff | E/D/R |
| `kill-switch.test.js` | account-path kill switches | E/D/R |
| `service-handoff-pepper.test.js` | handoff-token peppering | E |
| `services-disable.test.js` | service disable endpoints | E/D/R |

### Billing, Relay, Backup, And Private Processing

| Test | Product behavior protected | Runtime |
|---|---|---|
| `billing-relay.test.js` | billing webhook relay synchronization | E/D/R |
| `billing-stripe.test.js` | Stripe billing core | E/D/R |
| `private-network.test.js` | private-network boundary | E/D/R |
| `r2-credential.test.js` | R2 credential scopes | E |
| `relay-grant.test.js` | relay-grant helpers | E/D |
| `relay-retire.test.js` | relay-instance retirement | E |
| `sandbox-ownership.test.js` | sandbox ownership boundary | E/D/R |
| `spb-billing.test.js` | encrypted-backup billing | E/D/R |
| `spb-broker.test.js` | backup credential broker | E/D/R |
| `spb-entitlement.test.js` | backup entitlement helpers | E/D |
| `spb-sandbox-cleanup.test.js` | sandbox object cleanup | E/D |
| `spb-sandbox-lifecycle.test.js` | sandbox lifecycle orchestration | E/D |
| `spb-sweep.test.js` | backup lapse sweep | E/D/R |
| `spp-authorize.test.js` | private-processing authorization | E/D/R |
| `spp-bindings-db.test.js` | private-processing binding data | E/D |
| `spp-boundary.test.js` | private-processing copy boundary | E/D/R |
| `spp-entitlement.test.js` | private-processing entitlement helpers | E/D |

### Provisioning And Scout Lifecycle

| Test | Product behavior protected | Runtime |
|---|---|---|
| `gcp.test.js` | GCP API Keys client | E |
| `gemini-rotate.test.js` | Gemini key rotation | E/D/R |
| `provision-scout.test.js` | account Scout provisioning | E/D |
| `provisioning.test.js` | Gemini provisioning orchestration | E/D |
| `scout-applications-db.test.js` | Scout application data builders | E/D |
| `scout-history-admin.test.js` | admin Scout lifecycle history | E/D/R |
| `scout-lifecycle-admin.test.js` | admin Scout lifecycle contracts | E/D/R |
| `scout-lifecycle-races.test.js` | Scout request races | E/D/R |
| `scout-migrate.test.js` | admin Scout migration importer | E/D/R |
| `scout-status.test.js` | account Scout status | E/D/R |
| `scouts-admin.test.js` | admin Scout endpoints | E/D/R |

### Administration, Support, And Retention

| Test | Product behavior protected | Runtime |
|---|---|---|
| `admin-impersonate.test.js` | admin impersonation endpoint | E/D/R |
| `admin-projection.test.js` | admin owner sign-in projection | E/D/R |
| `admin.test.js` | admin endpoints and Access checks | E/D/R |
| `retention.test.js` | retention cron | E/D |
| `support-copy.test.js` | support copy and leak checks | E/D/R |
| `support-create.test.js` | support request creation | E/D/R |
| `support-detail.test.js` | support request detail | E/D/R |
| `support-list.test.js` | support request listing | E/D/R |
| `support-reply.test.js` | support reply | E/D/R |
| `support-resume.test.js` | support resume and sign-in prompts | E/D/R |

### Migration And Schema Compatibility

Every migration test uses `cloudflare:test` bindings and D1, but not the real
router.

| Test | Product behavior protected | Runtime |
|---|---|---|
| `migration-0004.test.js` | session metadata migration | E/D |
| `migration-0005.test.js` | email verification migration | E/D |
| `migration-0006.test.js` | devices migration | E/D |
| `migration-0009.test.js` | service handoffs migration | E/D |
| `migration-0010.test.js` | push handoffs migration | E/D |
| `migration-0011.test.js` | Scout applications migration | E/D |
| `migration-0012.test.js` | SPL handoffs migration | E/D |
| `migration-0013.test.js` | billing entitlements migration | E/D |
| `migration-0014.test.js` | compensation-source migration | E/D |
| `migration-0016-spb-entitlement.test.js` | backup entitlement migration | E/D |
| `migration-0017-spb-mint-audit.test.js` | backup mint-audit migration | E/D |
| `migration-0018-service-handoffs-spb.test.js` | backup handoffs migration | E/D |
| `migration-0019-spb-sweep-audit.test.js` | backup sweep-audit migration | E/D |
| `migration-0020-spp-entitlement.test.js` | private-processing entitlement migration | E/D |
| `migration-0021-spp-mint-audit.test.js` | private-processing mint-audit migration | E/D |
| `migration-0022-spp-service-handoffs.test.js` | private-processing handoffs migration | E/D |
| `migration-0023-spp-consent.test.js` | private-processing consent migration | E/D |
| `migration-0024-scout-lifecycle-events.test.js` | Scout lifecycle-events migration | E/D |
| `migration-0025-sandbox-run-ownership.test.js` | sandbox ownership migration | E/D |
| `migration-0026-spb-sandbox-lifecycle.test.js` | sandbox lifecycle migration | E/D |

### Static And Test-Infrastructure Contracts

| Test | Product behavior protected | Runtime |
|---|---|---|
| `inline-bundle-size.test.js` | inline passkey bundle size and wiring | N |
| `partition-guard.test.js` | exact partition guard failure behavior | N |
| `resource-measurement.test.js` | sampler parsing and failure semantics | N |
| `static.test.js` | source, configuration, and asset contracts | N |

Before this infrastructure change, `static.test.js` and
`inline-bundle-size.test.js` were the only two files requiring no Worker
runtime. The two harness unit files also intentionally use Node only.

## Duplicate And Low-Signal Assessment

The disposition for every item is **document**, never delete or move.

| Coverage | Assessment |
|---|---|
| `brand-canon.test.js` | Cross-cutting overlap is high-signal because it enforces runtime owner-facing policy over multiple routes and email flows. |
| `catalog.test.js`, `dashboard.test.js` | HTML overlaps, but public/signed-in state and decrypt-failure behavior are distinct. |
| `landing.test.js`, `landings.test.js` | Copy overlaps brand checks, but root disclosure and route-specific service pages are distinct contracts. |
| `support-copy.test.js`, support CRUD tests | Exact copy overlaps route tests, but the cross-surface leak/copy contract is distinct. |
| `spp-boundary.test.js` | Overlaps SPP routes and brand checks but uniquely bans unsafe product claims. |
| `goodbye.test.js` | Low-volume signed-out copy check; retain as documented coverage. |
| `head-requests.test.js` | Low-volume but unique HTTP method parity check. |
