# SPB Sandbox Lifecycle Prep

Research only. No production code, schema, or migration was changed.

## Step 0 — Baseline

Command, run exactly once after dependencies were installed:

```text
cd account && hop check -- npm test
```

Exact result: exit 0, no pre-existing failures.

```text
hop check: `npm test` exited 0, showing last 50 of 467 lines

 Test Files  106 passed (106)
      Tests  852 passed (852)
   Start at  23:44:07
   Duration  20.81s (transform 13.76s, setup 0ms, collect 800.96s, tests 105.68s, environment 11ms, prepare 142.89s)

[vpw:dbg] Shutting down runtimes...

 RUN  v2.1.9 /home/extro/.hopper/worktrees/3vc75l4m/account

 ✓ test/static.test.js (10 tests) 68ms

 Test Files  1 passed (1)
      Tests  10 passed (10)
   Start at  23:44:28
   Duration  290ms (transform 26ms, setup 0ms, collect 28ms, tests 68ms, environment 0ms, prepare 62ms)
```

Combined gate count: 107 test files and 862 tests passed; 0 failed. The worker
run emitted the suite's expected test-path stderr (`otp_send_failed`,
`add_addr_collision`, and a content-free `spb_mint_refused` event), but no
suite failed.

## Current Schema And Entry Points

`spb_bindings` is defined by the consolidated schema at `schema.sql:322-335`
and originally by migration 0016 at
`migrations/0016_spb_entitlement.sql:60-71`. Its current columns are
`account_id`, `instance_id`, `created_at`, `last_seen_at`, nullable
`token_hash`, and nullable `lapsed_at`; the primary key is
`(account_id, instance_id)`, and only `account_id` has a secondary index.
Consequently, the same `instance_id` can currently exist under different
accounts.

The owner enable entry point is routed at `src/index.js:443-460`.
`handleEnableSpbConfirm` validates session/CSRF/instance, generates and hashes
the broker token, upserts the binding, reconciles entitlement, and emits an
encrypted handoff at `src/enable.js:567-629`. The credential entry point is
routed at `src/index.js:882-889`; `handleBackupCredentials` authenticates by
the token hash, checks entitlement and scope, signs an R2 credential, audits,
and returns it at `src/spb-broker.js:12-93`.

The customer lapse sweep is the separate daily `0 3 * * *` cron
(`wrangler.toml:125-126`, `src/index.js:145`, `src/index.js:967-972`).
`runSpbLapseSweep` selects due rows, self-mints one maintenance credential per
binding, drains the prefix, inserts an audit row, and deletes the binding at
`src/spb-sweep.js:19-64`.

## Step 1 — Complete `spb_bindings` Surface Map

### Production SQL and callers

All literal production SQL is in `src/db.js`; no other `src/` module contains
the table name.

| Helper / implicit write | Current literal SQL and behavior | Every production caller | Awareness needed by this lode |
|---|---|---|---|
| `upsertSpbBinding` (`src/db.js:1315-1328`) | `INSERT` of the six current columns, conflict target `(account_id, instance_id)`, then rotates `token_hash`, advances `last_seen_at`, and clears `lapsed_at`; uses `.run()` and returns no winner signal. | Imported at `src/enable.js:27`; called by the baseline owner flow at `src/enable.js:598`. | **Both.** Run ownership needs `sandbox_run_id`, global `instance_id` conflict handling, null-safe same-owner guarding, `RETURNING`, and a caller-visible zero-row loss. Denial safety must prevent a same-run retry from restoring a nulled token or clearing a tombstone. The baseline caller must not publish a success handoff after a zero-row conflict. |
| `markSpbBindingLapsed` (`src/db.js:1434-1439`) | `UPDATE spb_bindings SET lapsed_at = ? WHERE account_id = ? AND lapsed_at IS NULL`. It stamps every currently unlapsed binding for an account. | `reconcileSpbEntitlement` at `src/spb-entitlement.js:60`. | **Neither in the minimum lifecycle-isolation option.** Keeping this account-wide statement unchanged preserves current customer behavior byte-for-byte. Isolation can occur at due-row selection. If the chosen policy says run rows must never carry customer lapse state, this would instead become run-aware, but that is a larger change. |
| `clearSpbBindingLapsed` (`src/db.js:1441-1446`) | `UPDATE spb_bindings SET lapsed_at = NULL WHERE account_id = ?`. It clears every binding for an account. | `reconcileSpbEntitlement` at `src/spb-entitlement.js:36` and `:49`. | **Neither under the same minimum option.** A denial must remain authoritative through `token_hash = NULL` and `sandbox_denied_at`, not through `lapsed_at`; clearing lapse must never resurrect the token. |
| `selectDueLapsedBindings` (`src/db.js:1448-1460`) | Selects `account_id, instance_id` where `lapsed_at` is non-null and at/before the cutoff, ordered by `lapsed_at, rowid`. | `runSpbLapseSweep` at `src/spb-sweep.js:23`. | **Run-aware, and therefore denial-safe if every denial tombstone remains run-owned.** Adding a run exclusion here is the minimum way to keep customer sweep behavior unchanged for baseline rows while preventing selection of run rows and their tombstones. No separate `sandbox_denied_at` predicate is needed under that invariant. |
| `deleteSpbBinding` (`src/db.js:1462-1467`) | Unguarded `DELETE` by `(account_id, instance_id)` using `.run()`. | `runSpbLapseSweep` after its audit insert at `src/spb-sweep.js:52`. | **Neither if due selection is the chosen isolation boundary; both if used as a second guard.** A run/denial guard alone is insufficient because the sweep would already have purged R2 and would falsely count a zero-row delete as success. A guarded form therefore also needs `RETURNING` and caller handling. A sandbox denial purge must not call this hard-delete helper at all if the tombstone must survive. |
| `findSpbBindingByTokenHash` (`src/db.js:1469-1479`) | Selects `account_id, instance_id, lapsed_at` where `token_hash = ? AND token_hash IS NOT NULL`, returning the first row. | `handleBackupCredentials` at `src/spb-broker.js:28`; a null result becomes the existing 401 at `src/spb-broker.js:29-31`. | **Run-aware; denial-safe through the existing token predicate.** It must select `sandbox_run_id` so the broker can distinguish a run-owned token, force the 90-second TTL, and perform the post-sign expiry CAS. It does not need `sandbox_denied_at` to make post-denial authorization fail: denial atomically nulls the token, so the current predicate cannot return that row. It does not need to select `sandbox_credential_expires_at` if the post-sign atomic `UPDATE … MAX(COALESCE(...), proposed) … RETURNING` owns monotonicity and the winner signal. |
| Account foreign-key cascade (`schema.sql:331-332`) | `FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE` implicitly hard-deletes bindings. | Abandoned-account retention deletes parents at `src/retention.js:78`; the new-account email-collision rollback also deletes a parent at `src/db.js:201`, though that just-created account cannot already own a binding through the normal path. | **Neither today, but it is an implicit tombstone deletion surface.** If sandbox tombstones are required to outlive deletion of their account record, the current foreign-key model cannot provide that; the scoped lode should explicitly confirm that parent deletion remains authoritative. |

The broker's three possible new columns have different purposes:

- `sandbox_run_id` is required in the token lookup result. A null value keeps
  today's baseline TTL/scope path. A non-null value selects the sandbox policy:
  a 90-second credential and a mandatory post-sign expiry CAS before return.
- `sandbox_denied_at` is not required in that read result. Once denial has
  nulled `token_hash`, the old bearer cannot satisfy
  `token_hash = ? AND token_hash IS NOT NULL`; the broker returns the existing
  pre-identity 401 without learning account, instance, run, or denial time.
  The post-sign CAS must still predicate on `sandbox_denied_at IS NULL` (and
  the token/owner identity) to close the lookup-versus-denial race.
- `sandbox_credential_expires_at` need not be read before signing. The broker
  computes the proposed expiry from the signed credential, then atomically
  advances the stored maximum. The probe below shows that the scalar-`MAX`
  form returns a row even when the stored expiry is already later, whereas a
  `< proposed` `WHERE` guard returns zero and conflates “already safely
  covered” with a real denial/ownership/token CAS loss.

`lapsed_at` remains identity-only in today's broker: the lookup selects it, but
`handleBackupCredentials` does not read it; entitlement decides serving at
`src/spb-broker.js:33-49`. Existing coverage states this explicitly at
`test/spb-broker.test.js:211-220`.

### Indirect production consumers

`reconcileSpbEntitlement` owns all lapse stamping/clearing
(`src/spb-entitlement.js:21-63`). Its callers are:

- the SPB enable path at `src/enable.js:599`;
- Stripe event reconciliation through `reconcileForService` at
  `src/billing.js:173-175`, reached from checkout completion
  (`src/billing.js:185`), subscription update (`:209`), subscription delete
  (`:216`), invoice paid (`:225`), and invoice failed (`:240`);
- `reconcileAllServices` at `src/spb-entitlement.js:65-68`, reached by admin
  scout approve/retry/preapprove/revoke paths at `src/admin.js:260`, `:288`,
  `:336`, `:383`, and `:412`; and
- direct test calls.

There is no cron caller of `reconcileSpbEntitlement` today. Cron reaches SPB
bindings through `selectDueLapsedBindings` and `deleteSpbBinding` instead.

`admin.js` does not import a binding helper or name `spb_bindings`; its only
touch is the reconciliation path above. `scout-migrate.js` does not touch SPB
bindings; its `backup_eligible` / `backup_state` fields at
`src/scout-migrate.js:231-232` are WebAuthn credential flags, not encrypted
backup state. `settings.js` has no SPB binding or helper reference; `admin.js`
imports only its Gemini-key action at `src/admin.js:27`.

### Test reads, writes, and fixture consumers

Every literal/dynamic test touch is:

- `resetDb` drops `spb_bindings` and then replays `schema.sql` at
  `test/helpers.js:118-153`.
- `seedSpbBinding` inserts the six current columns and returns them at
  `test/helpers.js:713-730`. The new nullable columns would default to null
  without breaking old calls, but this fixture must accept/insert/return them
  for run, denial, and expiry tests.
- Broker setup calls the fixture at `test/spb-broker.test.js:385-390`.
- Entitlement tests call it at `test/spb-entitlement.test.js:151`, `:167`,
  `:188`, and `:204`; their direct read selects the six old columns at
  `test/spb-entitlement.test.js:229-237`.
- Sweep tests call it at `test/spb-sweep.test.js:43-46`, `:134`, `:157`,
  `:182-183`, `:236`, `:277`, and `:327`; their direct read selects
  `account_id, instance_id, lapsed_at` at `test/spb-sweep.test.js:521-526`.
- Admin scout tests call it at `test/scouts-admin.test.js:228` and `:330`;
  their direct read selects `account_id, instance_id, lapsed_at` at
  `test/scouts-admin.test.js:656-660`.
- The scheduled-handler test calls it at `test/retention.test.js:336-340`.
- Enable tests dynamically count the table at `test/enable-spb.test.js:133`
  and directly select the six old columns at `test/enable-spb.test.js:346-354`.
- Migration 0016 drops the consolidated table (`test/migration-0016-spb-entitlement.test.js:9`),
  applies its own old DDL, checks the table/column/index shape at `:35-56`, and
  inserts one row directly at `:106-115`.
- Migration 0025 checks that the SPB sandbox-run index is absent at
  `test/migration-0025-sandbox-run-ownership.test.js:63`.

The direct read helpers use explicit column lists, not `SELECT *`, so nullable
column additions alone do not change their returned shapes.

## Step 2 — Required Grep Inventory And Schema Blast Radius

The required commands were run literally from `account/`.

```text
$ grep -rn "seedSpbBinding" test/
test/spb-broker.test.js:14:  seedSpbBinding,
test/spb-broker.test.js:385:  await seedSpbBinding({
test/spb-entitlement.test.js:13:  seedSpbBinding,
test/spb-entitlement.test.js:151:    await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_ID, lapsedAt: null });
test/spb-entitlement.test.js:167:    await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_ID, lapsedAt: 999 });
test/spb-entitlement.test.js:188:    await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_ID, lapsedAt: 999 });
test/spb-entitlement.test.js:204:    await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_ID });
test/spb-sweep.test.js:16:  seedSpbBinding,
test/spb-sweep.test.js:43:    const dueA = await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_A, lapsedAt: OLD_LAPSE });
test/spb-sweep.test.js:44:    const dueB = await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_B, lapsedAt: OLD_LAPSE });
test/spb-sweep.test.js:45:    const recent = await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_C, lapsedAt: RECENT_LAPSE });
test/spb-sweep.test.js:46:    const active = await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_D, lapsedAt: null });
test/spb-sweep.test.js:134:    await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_A, lapsedAt: OLD_LAPSE });
test/spb-sweep.test.js:157:    const binding = await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_A, lapsedAt: OLD_LAPSE });
test/spb-sweep.test.js:182:    await seedSpbBinding({ accountId: failed.accountId, instanceId: INSTANCE_A, lapsedAt: OLD_LAPSE });
test/spb-sweep.test.js:183:    await seedSpbBinding({ accountId: healthy.accountId, instanceId: INSTANCE_B, lapsedAt: OLD_LAPSE });
test/spb-sweep.test.js:236:    await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_A, lapsedAt: OLD_LAPSE, tokenHash });
test/spb-sweep.test.js:277:    const binding = await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_A, lapsedAt: OLD_LAPSE });
test/spb-sweep.test.js:327:    await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_A, lapsedAt: OLD_LAPSE, tokenHash });
test/scouts-admin.test.js:14:  seedSpbBinding,
test/scouts-admin.test.js:228:    await seedSpbBinding({ accountId: account.accountId, lapsedAt: 999 });
test/scouts-admin.test.js:330:    await seedSpbBinding({ accountId: account.accountId });
test/helpers.js:713:export async function seedSpbBinding({
test/retention.test.js:11:  seedSpbBinding,
test/retention.test.js:336:    await seedSpbBinding({
```

```text
$ grep -rn "upsertSpbBinding\|deleteSpbBinding\|findSpbBindingByTokenHash\|markSpbBindingLapsed\|clearSpbBindingLapsed\|selectDueLapsedBindings" src/ test/
src/db.js:1315:export async function upsertSpbBinding(db, { accountId, instanceId, tokenHash, nowMs }) {
src/db.js:1434:export async function markSpbBindingLapsed(db, { accountId, nowMs }) {
src/db.js:1441:export async function clearSpbBindingLapsed(db, { accountId }) {
src/db.js:1448:export async function selectDueLapsedBindings(db, cutoffMs) {
src/db.js:1462:export async function deleteSpbBinding(db, { accountId, instanceId }) {
src/db.js:1469:export async function findSpbBindingByTokenHash(db, tokenHash) {
src/enable.js:27:  upsertSpbBinding,
src/enable.js:598:  await upsertSpbBinding(env.DB, { accountId, instanceId: instance, tokenHash, nowMs });
src/spb-sweep.js:2:  deleteSpbBinding,
src/spb-sweep.js:4:  selectDueLapsedBindings,
src/spb-sweep.js:23:  const bindings = await selectDueLapsedBindings(env.DB, nowMs - LAPSE_RETENTION_MS);
src/spb-sweep.js:52:      await deleteSpbBinding(env.DB, { accountId, instanceId });
src/spb-broker.js:3:  findSpbBindingByTokenHash,
src/spb-broker.js:28:    const binding = await findSpbBindingByTokenHash(env.DB, tokenHash);
src/spb-entitlement.js:2:  clearSpbBindingLapsed,
src/spb-entitlement.js:5:  markSpbBindingLapsed,
src/spb-entitlement.js:36:    await clearSpbBindingLapsed(env.DB, { accountId });
src/spb-entitlement.js:49:      await clearSpbBindingLapsed(env.DB, { accountId });
src/spb-entitlement.js:60:      await markSpbBindingLapsed(env.DB, { accountId, nowMs });
```

```text
$ grep -rn "spb_bindings" src/ test/ migrations/ schema.sql
src/db.js:1318:      `INSERT INTO spb_bindings (
src/db.js:1436:    .prepare('UPDATE spb_bindings SET lapsed_at = ? WHERE account_id = ? AND lapsed_at IS NULL')
src/db.js:1443:    .prepare('UPDATE spb_bindings SET lapsed_at = NULL WHERE account_id = ?')
src/db.js:1452:       FROM spb_bindings
src/db.js:1464:    .prepare('DELETE FROM spb_bindings WHERE account_id = ? AND instance_id = ?')
src/db.js:1473:       FROM spb_bindings
test/spb-entitlement.test.js:233:       FROM spb_bindings
test/migration-0025-sandbox-run-ownership.test.js:63:    await expect(indexShape('spb_bindings', 'idx_spb_bindings_sandbox_run_id')).resolves.toBeNull();
test/spb-sweep.test.js:523:    .prepare('SELECT account_id, instance_id, lapsed_at FROM spb_bindings WHERE account_id = ? AND instance_id = ?')
test/scouts-admin.test.js:658:    .prepare('SELECT account_id, instance_id, lapsed_at FROM spb_bindings WHERE account_id = ?')
test/migration-0016-spb-entitlement.test.js:9:    await workerEnv.DB.prepare('DROP TABLE IF EXISTS spb_bindings').run();
test/migration-0016-spb-entitlement.test.js:35:    await expect(tableExists('spb_bindings')).resolves.toBe(true);
test/migration-0016-spb-entitlement.test.js:36:    await expect(tableColumns('spb_bindings')).resolves.toEqual(expect.arrayContaining([
test/migration-0016-spb-entitlement.test.js:44:    await expect(indexExists('idx_spb_bindings_account_id')).resolves.toBe(true);
test/migration-0016-spb-entitlement.test.js:55:    await expect(tableExists('spb_bindings')).resolves.toBe(true);
test/migration-0016-spb-entitlement.test.js:56:    await expect(indexExists('idx_spb_bindings_account_id')).resolves.toBe(true);
test/migration-0016-spb-entitlement.test.js:109:      `INSERT INTO spb_bindings (
test/helpers.js:123:    'spb_bindings',
test/helpers.js:723:      `INSERT INTO spb_bindings (
test/enable-spb.test.js:133:    await expect(rowCount('spb_bindings')).resolves.toBe(0);
test/enable-spb.test.js:350:       FROM spb_bindings
migrations/0016_spb_entitlement.sql:14:-- 4. spb_bindings uses CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS,
migrations/0016_spb_entitlement.sql:60:CREATE TABLE IF NOT EXISTS spb_bindings (
migrations/0016_spb_entitlement.sql:71:CREATE INDEX IF NOT EXISTS idx_spb_bindings_account_id ON spb_bindings(account_id);
schema.sql:322:-- spb_bindings: schema hook for SPB hosted access. P1 records only binding
schema.sql:324:CREATE TABLE IF NOT EXISTS spb_bindings (
schema.sql:335:CREATE INDEX IF NOT EXISTS idx_spb_bindings_account_id ON spb_bindings(account_id);
```

### Global `instance_id` uniqueness

No current test inserts two SPB rows with the default instance
`11111111-1111-1111-1111-111111111111` for different accounts in one
reset interval. Therefore the exact existing-test break list caused solely by
the global unique index is **empty**.

The only test with two accounts and two SPB rows is
`test/spb-sweep.test.js:178-230`; it explicitly uses `INSTANCE_A` for the
failed account (`:182`) and distinct `INSTANCE_B` for the healthy account
(`:183`). The four-row case at `test/spb-sweep.test.js:40-128` also uses
distinct `INSTANCE_A` through `INSTANCE_D`. The two implicit-default calls in
`test/scouts-admin.test.js:228` and `:330` occur in separate tests, each
isolated by `resetDb` at `test/scouts-admin.test.js:49-51`. Every other fixture
call either supplies one explicit instance or creates only one SPB row.

This inspection says nothing about production duplicates. As with migration
0025's SPL/SPP preflight at
`migrations/0025_sandbox_run_ownership.sql:5-17`, a future global SPB index
needs a production duplicate preflight; index creation must fail loudly rather
than choose a row.

The current `upsertSpbBinding` conflict target is still the composite primary
key (`src/db.js:1321`). Once a global unique index exists, a cross-account
collision would otherwise be an unmatched unique-constraint exception, not the
desired zero-row ownership loss. The ownership upsert must target
`instance_id`, as the SPL/SPP precedents do at `src/db.js:1304-1308` and
`:1345-1352`.

### Consolidated-schema column/index shape

The three nullable column additions alone break no current test:

- all direct binding reads name old columns explicitly;
- `seedSpbBinding` names old insert columns, so SQLite supplies null for new
  nullable columns;
- migration 0016 drops the consolidated table and recreates its own 0016
  shape, and its column assertion uses `arrayContaining`
  (`test/migration-0016-spb-entitlement.test.js:35-43`).

The accompanying `idx_spb_bindings_sandbox_run_id` addition breaks exactly one
current assertion:
`test/migration-0025-sandbox-run-ownership.test.js:63`. Its `beforeEach` calls
`resetDb` (`:11-13`), so SPB currently comes from the latest consolidated
`schema.sql`. `installPre0025Tables` drops and locally recreates only dispatch,
SPL, and SPP at `:122-169`; it never resets SPB. Once schema 0026 creates
`idx_spb_bindings_sandbox_run_id`, `indexShape` at `:230-235` finds it and
returns `{ unique: 0, columns: ['sandbox_run_id'] }` instead of `null`.

The smallest robust harness change is to include `spb_bindings` in the locally
installed pre-change shape: drop it, recreate the six-column migration-0016
DDL, and recreate only `idx_spb_bindings_account_id` before running 0025. That
keeps the proof isolated from all post-0025 consolidated schema changes and
still demonstrates that applying migration 0025 itself does not create an SPB
run index. Merely dropping the new index is fewer lines, but leaves the test
running against post-0026 SPB columns and weakens the intended historical-shape
isolation.

## Step 3 — D1 CAS Primitive Probe

A disposable `test/spb-cas-probe.test.js` created a scratch table in the
Workers vitest pool. It was deleted after the probe. The probe was run through
`hop check` twice: the first 1/1 pass pretty-printed 144 lines, so `hop check`
showed only its last 50; the logging was changed to one line and the same 1/1
probe was repeated to retain the full literal transcript.

Command:

```text
hop check -- npx vitest run --config vitest.config.js test/spb-cas-probe.test.js
```

Literal SQL:

```sql
UPDATE _spb_cas_probe SET note = ? WHERE id = ? AND note = ? RETURNING id, note

UPDATE _spb_cas_probe
SET sandbox_credential_expires_at =
  MAX(COALESCE(sandbox_credential_expires_at, 0), ?)
WHERE id = ?
RETURNING id, sandbox_credential_expires_at

UPDATE _spb_cas_probe
SET sandbox_credential_expires_at =
  MAX(sandbox_credential_expires_at, ?)
WHERE id = ?
RETURNING id, sandbox_credential_expires_at

UPDATE _spb_cas_probe
SET sandbox_credential_expires_at = ?
WHERE id = ?
  AND (
    sandbox_credential_expires_at IS NULL
    OR sandbox_credential_expires_at < ?
  )
RETURNING id, sandbox_credential_expires_at

UPDATE _spb_cas_probe
SET note = ?
WHERE id = ? AND sandbox_run_id IS ?
RETURNING id, sandbox_run_id, note

INSERT INTO _spb_cas_probe (
  id, account_id, sandbox_run_id, sandbox_credential_expires_at, note
) VALUES (?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  sandbox_credential_expires_at =
    excluded.sandbox_credential_expires_at,
  note = excluded.note
WHERE account_id = excluded.account_id
  AND sandbox_run_id IS excluded.sandbox_run_id
RETURNING id, account_id, sandbox_run_id,
          sandbox_credential_expires_at, note

INSERT INTO _spb_cas_probe (id, account_id)
VALUES (?, NULL)
RETURNING id
```

Literal result log:

```json
{"sql":{"conditional_update":"UPDATE _spb_cas_probe SET note = ? WHERE id = ? AND note = ? RETURNING id, note","max_advance":"UPDATE _spb_cas_probe SET sandbox_credential_expires_at = MAX(COALESCE(sandbox_credential_expires_at, 0), ?) WHERE id = ? RETURNING id, sandbox_credential_expires_at","max_without_coalesce":"UPDATE _spb_cas_probe SET sandbox_credential_expires_at = MAX(sandbox_credential_expires_at, ?) WHERE id = ? RETURNING id, sandbox_credential_expires_at","where_guard_advance":"UPDATE _spb_cas_probe SET sandbox_credential_expires_at = ? WHERE id = ? AND ( sandbox_credential_expires_at IS NULL OR sandbox_credential_expires_at < ? ) RETURNING id, sandbox_credential_expires_at","is_comparison":"UPDATE _spb_cas_probe SET note = ? WHERE id = ? AND sandbox_run_id IS ? RETURNING id, sandbox_run_id, note","guarded_upsert":"INSERT INTO _spb_cas_probe ( id, account_id, sandbox_run_id, sandbox_credential_expires_at, note ) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET sandbox_credential_expires_at = excluded.sandbox_credential_expires_at, note = excluded.note WHERE account_id = excluded.account_id AND sandbox_run_id IS excluded.sandbox_run_id RETURNING id, account_id, sandbox_run_id, sandbox_credential_expires_at, note","exception":"INSERT INTO _spb_cas_probe (id, account_id) VALUES (?, NULL) RETURNING id"},"results":{"conditional_update":{"win":[{"id":"conditional","note":"updated"}],"loss":[],"stored":{"id":"conditional","account_id":"account-a","sandbox_run_id":null,"sandbox_credential_expires_at":null,"note":"updated"}},"max_advance":{"from_null":[{"id":"max","sandbox_credential_expires_at":100}],"lower_value":[{"id":"max","sandbox_credential_expires_at":100}],"stored":{"id":"max","account_id":"account-a","sandbox_run_id":null,"sandbox_credential_expires_at":100,"note":"max"}},"max_without_coalesce":[{"id":"max-null","sandbox_credential_expires_at":null}],"where_guard_advance":{"from_null":[{"id":"guard","sandbox_credential_expires_at":100}],"lower_value":[],"stored":{"id":"guard","account_id":"account-a","sandbox_run_id":null,"sandbox_credential_expires_at":100,"note":"guard"}},"is_comparison":{"null_match":[{"id":"is-null","sandbox_run_id":null,"note":"null-won"}],"null_mismatch":[],"run_match":[{"id":"is-run","sandbox_run_id":"run-a","note":"run-won"}],"run_mismatch":[]},"guarded_upsert":{"insert":[{"id":"claim","account_id":"account-a","sandbox_run_id":"run-a","sandbox_credential_expires_at":100,"note":"inserted"}],"same_owner":[{"id":"claim","account_id":"account-a","sandbox_run_id":"run-a","sandbox_credential_expires_at":200,"note":"same-owner"}],"conflict":[],"stored":{"id":"claim","account_id":"account-a","sandbox_run_id":"run-a","sandbox_credential_expires_at":200,"note":"same-owner"}},"exception":{"threw":true,"name":"Error","message":"D1_ERROR: NOT NULL constraint failed: _spb_cas_probe.account_id: SQLITE_CONSTRAINT"}}}
```

Test result:

```text
✓ test/spb-cas-probe.test.js (1 test) 18ms

Test Files  1 passed (1)
     Tests  1 passed (1)
Duration  935ms
```

Findings:

1. Conditional `UPDATE … RETURNING` is usable with `.all()`. A matching
   predicate returned the updated row. A failed predicate returned
   `results: []`, left the stored row unchanged, and did not throw.
2. In `UPDATE SET`, two-argument `MAX` is the scalar function. With
   `COALESCE`, null advanced to 100. Without `COALESCE`,
   `MAX(NULL, 100)` stored/returned null. With a later proposed value of 50,
   the scalar-`MAX` form returned the row with its existing 100, while the
   `< proposed` `WHERE` form returned zero rows and left 100 stored.
3. `sandbox_run_id IS ?` is null-safe in `UPDATE WHERE`: null matched bound
   null, a non-null run matched the identical value, and mismatches returned
   zero rows without mutation. This is the same ownership behavior used by
   migration-0025 upserts.
4. Both conditional `UPDATE … RETURNING` and
   `INSERT … ON CONFLICT … WHERE … RETURNING` work with `.all()`. Insert and
   same-owner retry returned a row; conflicting ownership returned
   `results: []`. A real constraint failure rejected with an exception, so
   zero rows and an operational failure are distinguishable.

For expiry semantics, a zero from the `< proposed` guard is not intrinsically
a CAS loss: it can mean the already-persisted expiry is later and therefore
already covers the new credential. But the same zero-row shape can also mean a
denial/token/owner predicate failed. Without another atomic classification,
that form cannot safely decide whether to return the signed credential.
The scalar-`MAX` form lets valid ownership return one row even for a lower
proposal, reserving zero rows for the other CAS predicates.

## Step 4 — Required Interleavings

The statements below are atomic shapes required to reason about the
interleavings; they are findings for the design stage, not approved final SQL.

1. **Mint CAS versus denial; denial commits first.**
   - Denial is one guarded
     `UPDATE spb_bindings SET token_hash = NULL, sandbox_denied_at = ?
     WHERE account_id = ? AND instance_id = ? AND sandbox_run_id IS ?
     AND sandbox_denied_at IS NULL RETURNING ...`.
   - A broker lookup after that update gets no row because the token is null.
     If lookup and signing already happened, the post-sign expiry update must
     include the exact account/instance/run/token plus
     `sandbox_denied_at IS NULL`; it returns zero.
   - Observable result: denial leaves one tombstone; the signed credential is
     discarded, no credential/expiry is persisted by the losing mint, and no
     credential is returned.

2. **Mint CAS versus denial; mint CAS commits first.**
   - Mint uses one
     `UPDATE … SET sandbox_credential_expires_at =
     MAX(COALESCE(sandbox_credential_expires_at, 0), ?)
     WHERE account_id = ? AND instance_id = ? AND sandbox_run_id IS ?
     AND sandbox_denied_at IS NULL AND token_hash = ?
     AND token_hash IS NOT NULL RETURNING ...`.
   - Observable result: the broker may return the 90-second credential because
     its maximum expiry is durably recorded. Denial then nulls the token and
     stamps the tombstone, preventing any later mint; purge must respect the
     recorded outstanding expiry because the already-returned R2 credential
     cannot be revoked by nulling the broker token.

3. **Denial versus same-run upsert; denial first.**
   - The guarded `INSERT … ON CONFLICT(instance_id) DO UPDATE … WHERE
     account_id = excluded.account_id AND sandbox_run_id IS
     excluded.sandbox_run_id AND sandbox_denied_at IS NULL RETURNING ...`
     returns zero against the tombstone.
   - Observable result: upsert does not restore `token_hash`, clear
     `sandbox_denied_at`, or report a claim.

4. **Denial versus same-run upsert; upsert first.**
   - The same guarded upsert may rotate the live token before denial. The
     subsequent guarded denial update atomically nulls whichever token is then
     stored.
   - Observable result: the upsert can report its pre-denial success, but its
     broker token stops authenticating after denial; the tombstone wins the
     durable final state.

5. **Baseline versus sandbox-run claim.**
   - The global unique index serializes both inserts on `instance_id`; the
     guarded upsert's null-safe run comparison treats null and non-null as
     different owners.
   - Observable result: from an empty table, exactly one returns a row and one
     returns zero; against an incumbent, only the identical ownership class
     can retry. No incumbent field changes on the loser.

6. **Run A versus Run B claim.**
   - The same single guarded upsert and global index enforce the race.
     `sandbox_run_id IS excluded.sandbox_run_id` fails for different runs.
   - Observable result: exactly one empty-table winner, or the incumbent run
     remains byte-identical and the other returns zero.

7. **Cross-account same-instance claim.**
   - The same upsert must target the global `instance_id` conflict and include
     `account_id = excluded.account_id`.
   - Observable result: one owner row globally; a different account gets a
     zero-row ownership conflict, not an exception and never a token rotation.

8. **Mint CAS loss after signing.**
   - “After signing” means the JWT-derived access key, secret, and session
     token exist only in local memory, but the conditional expiry `UPDATE …
     RETURNING` has not won. A denial, token rotation, deletion, or owner
     mismatch makes it return zero.
   - Observable result: discard all credential material; the CAS persists no
     expiry and the response returns no credential. Any counts-only audit
     policy is separate and must contain none of that material.

## Step 5 — Interaction With Customer Lapse Lifecycle

### Current behavior on new row shapes

For a hypothetical live run-owned row (`sandbox_run_id IS NOT NULL`),
`markSpbBindingLapsed` and `clearSpbBindingLapsed` still update it because both
statements filter only by account (`src/db.js:1434-1445`). A customer
entitlement lapse can therefore stamp the run row, and reactivation can clear
it. The stamp alone does not affect broker authorization today; the problem
begins when it becomes due.

For a denial tombstone (`token_hash NULL`, `sandbox_denied_at` set), those same
updates also stamp/clear `lapsed_at`. They do not resurrect the token, so the
broker's existing lookup remains a 401. However, after 30 days a stamped
tombstone satisfies today's due selector.

The current destructive sequence is:

1. `selectDueLapsedBindings` returns the row
   (`src/db.js:1448-1460`, `src/spb-sweep.js:23`).
2. `runSpbLapseSweep` derives the prefix and drains R2
   (`src/spb-sweep.js:31-43`).
3. `insertSpbSweepAudit` writes account, instance, prefix, and counts
   (`src/spb-sweep.js:44-51`, `src/db.js:1513-1529`).
4. `deleteSpbBinding` hard-deletes the row without an ownership/denial guard
   (`src/spb-sweep.js:52`, `src/db.js:1462-1467`).

On a run row, the customer sweep would therefore purge sandbox-owned R2 state
and erase ownership. On a denial tombstone, it would erase the durable denial
and make the globally unique instance claimable again. Neither is acceptable
if the sandbox tombstone is the retry/resurrection barrier.

### Candidate containment options

1. **Exclude run rows in `selectDueLapsedBindings`.**
   - Shape: add `AND sandbox_run_id IS NULL`.
   - For: smallest change; baseline customer rows are selected in exactly the
     same order and retain byte-identical lapse behavior; it prevents both R2
     purge and hard deletion before either starts; it also protects legacy
     run/tombstone rows that already carry `lapsed_at`.
   - Against: safety depends on the invariant that every denial tombstone
     remains run-owned. The generic delete helper itself remains unguarded.

2. **Do nothing.**
   - For: zero code change; post-denial bearer lookup still returns 401 until
     the row becomes due.
   - Against: it eventually purges run data and deletes both ownership and
     denial state. It does not meet the lifecycle isolation requirement.

3. **Guard only `deleteSpbBinding`.**
   - Shape: add `sandbox_run_id IS NULL` and ideally `RETURNING`.
   - For: prevents the final D1 hard delete.
   - Against: too late—the sweep has already purged R2 and inserted an
     identifier-bearing customer audit. With today's `.run()` helper, the
     caller would also report a successful swept binding on a zero-row delete.
     It cannot be the sole fix.

4. **Guard both selection and deletion.**
   - For: selection gives the minimum behavioral isolation; a returned-row
     delete can catch future caller/race mistakes.
   - Against: larger than the minimum, changes the delete helper contract and
     caller, and needs explicit zero-row semantics to avoid false success.

5. **Exclude run rows in `mark` and `clear`.**
   - For: keeps customer lapse state entirely off run rows.
   - Against: does not protect an already-stamped row, and changes two
     lifecycle statements rather than the single destructive boundary. A due
     selector still needs protection for legacy/partial states.

Research recommendation for design review: option 1 is the minimum
byte-preserving customer-lifecycle change. Option 4 is reasonable additional
guarding only if its returned-row semantics and false-success handling are
included. Guard-only and do-nothing do not prevent the purge. A sandbox denial
purge should independently keep its tombstone after both partial failure and
successful empty verification.

## Step 6 — Gap Analysis Against `spb-sweep.js`

### Fixed-point drain reuse

`drainObjects` at `src/spb-sweep.js:83-106` already:

- lists every page;
- deletes in batches of at most 1,000 (`:93-97`);
- rejects a truncated page without a continuation token (`:98-100`); and
- repeats complete pagination passes until an entire pass lists zero keys
  (`:86-105`).

`drainMultipartUploads` at `src/spb-sweep.js:108-137` similarly lists/aborts
every page, validates both pagination markers, and repeats full passes until a
pass lists zero uploads. This fixed-point structure handles mutation while
draining and the test stub deliberately snapshots each pagination pass at
`test/spb-sweep.test.js:350-455`.

The functions are private today. Adding `export` would not alter their runtime
behavior, so they are mechanically shareable as-is. Importing them from
`spb-sweep.js`, however, couples sandbox purge code to the customer scheduler,
D1 selection/audit/delete imports, and event logging in that module
(`src/spb-sweep.js:1-80`). The cleaner shared seam is a neutral drain module
alongside `s3.js`, containing `drainObjects`, `drainMultipartUploads`,
`chunks`, and their named-error construction; both the existing sweep and
sandbox lifecycle would call it. `s3.js` should remain the one-request wire
layer (`src/s3.js:10-140`), not absorb lifecycle orchestration. Extraction can
preserve the current sweep call order and behavior exactly.

The current order drains committed objects first and multipart uploads second
(`src/spb-sweep.js:41-42`). Each is independently fixed-point, but there is no
final object read after multipart work. A racing upload can complete into a
committed object after the object drain and before/during upload drain.

### Independent empty readback

There is no `HeadObject` or separate readback helper in `src/s3.js`.
Realistic options are:

1. **Fresh `listObjectsV2` with `max-keys=1` under a newly minted credential.**
   This proves no committed object is visible under the prefix at that read
   point. It does not prove there are no incomplete multipart uploads.
   `listObjectsV2` does **not** support a max-keys argument today: its signature
   accepts only `prefix`, `continuationToken`, and `nowMs`, and builds only
   `list-type`, `prefix`, and optional `continuation-token`
   (`src/s3.js:74-84`).
2. **Fresh `listObjectsV2` plus `listMultipartUploads`.**
   Under the newly minted credential, an empty object page and empty upload
   page prove both no visible committed objects and no visible incomplete
   multipart uploads at their respective read points. This is the strongest
   available prefix-level check using current S3 primitives; adding
   `max-keys=1` can bound the object read.
3. **`HeadObject`.**
   It proves presence/absence only for one known exact key. Heading a prefix is
   not a prefix-emptiness operation; heading all previously observed keys
   still cannot exclude a newly created key and says nothing about multipart
   uploads. It is therefore not an independent proof that an arbitrary prefix
   is empty.

“Newly minted” makes the verification independent of the drain credential's
remaining lifetime and auth state. The verifier credential must remain
in-memory only.

### Bounded credential re-mint

The customer sweep mints one 24-hour maintenance credential per binding
(`src/spb-sweep.js:34-39`; TTL at `src/r2-credential.js:24,29`) and passes the
same object through every request. A sandbox credential is only 90 seconds.
If a fixed-point purge outlives it, the next list/delete/abort request fails
authentication through the normal `s3.js` non-OK exception path; some prior
objects/uploads may already be gone, and no final readback occurs.

The reusable seam needs a bounded credential supplier/refresher rather than a
credential fixed for the entire operation: keep the current credential and
its expiry in local variables, refresh shortly before expiry or after the
specific auth-expiry result, cap re-mints by count/deadline, and give the
drain/readback calls only the current opaque credential. No credential, JWT,
token, signature, or hash may enter D1, logs, audits, thrown messages, or a
returned lifecycle result. Final independent verification should request a
new credential even if the drain credential remains usable.

### Partial failure and retryability

Today a mid-drain throw is caught per binding at `src/spb-sweep.js:57-63`.
The due binding remains, and no audit is inserted because audit/delete occur
only after both drains (`:44-52`); already completed R2 deletes/aborts remain
irreversible. The next cron retries from the remaining state. The failure test
demonstrates this at `test/spb-sweep.test.js:178-230`: its stub removes the
object before returning a delete error (`:374-382`), the first run keeps the
binding and audits only the healthy binding, and the retry succeeds with zero
deleted for the now-empty failed prefix.

Two consequences:

- counts accumulated before a throw are in memory and lost; mixed
  `DeleteObjects` success/error also throws before adding the returned deleted
  count (`src/spb-sweep.js:94-97`);
- audit insert and binding delete are separate statements, so a failure after
  audit insertion but before deletion can leave an audit row plus a due
  binding, producing another audit on retry.

A retryable sandbox purge needs different terminal state handling: denial must
leave the token-null tombstone selectable for retry; partial R2 effects must be
treated as idempotent progress; success requires a fresh independent empty
readback; and even verified success must not hard-delete the tombstone and
reopen the instance. If exact aggregate counts across partial attempts are
required, the shared drain must expose/record partial progress in a
content-free way rather than losing it on throw. Any audit row must obey the
identifier/content prohibition below.

## Step 7 — Audit Sink Cost

Acceptance criterion 11 forbids sandbox audits from storing an account, run,
or instance UUID; prefix; object key; token or hash; credential; email; or
content. Both current SPB audit tables contain nullable `account_id`,
`instance_id`, and `prefix`:

- `spb_mint_audit` at `schema.sql:360-370`;
- `spb_sweep_audit` at `schema.sql:382-391`.

Thus any reuse means binding all three columns to null, not merely omitting
them from logs.

### A. Extend `spb_mint_audit.outcome`

Current cost starts with its closed check:

```sql
outcome TEXT NOT NULL
  CHECK (outcome IN ('minted','refused_entitlement','refused_scope'))
```

at `migrations/0017_spb_mint_audit.sql:1-11` and `schema.sql:360-370`.
SQLite cannot add a CHECK member in place, so this option requires a full
table-copy rebuild, consolidated-schema update, preservation test, and
recreation of `idx_spb_mint_audit_account_id`.

The repository's rebuild precedents implement the table-copy core of SQLite's
generalized 12-step technique rather than twelve literal SQL statements:

1. document a `<table>_new` partial state;
2. `DROP TABLE IF EXISTS <table>_new`;
3. `CREATE TABLE <table>_new` with the full desired schema/checks;
4. name every destination column in `INSERT`;
5. select every source column explicitly;
6. copy all rows with `INSERT … SELECT`;
7. `DROP TABLE <table>`;
8. `ALTER TABLE <table>_new RENAME TO <table>`;
9. recreate each non-auto index;
10. make the completed desired shape safe to rerun;
11. recover “old and new both exist” by verifying the old authoritative table,
    dropping staging, and rerunning; and
12. recover “only new exists” by renaming it and recreating indexes.

Migration 0014 shows the no-secondary-index form at
`migrations/0014_entitlements_comp_source.sql:15-52`. Its partial-apply header
at `:5-13` covers: both tables exist before old-table drop; only `_new` exists
after old-table drop; and desired CHECK already exists, in which case rerun
rebuilds identically and preserves rows.

Migration 0018 shows the indexed form at
`migrations/0018_service_handoffs_spb.sql:21-61`. Its partial-apply header at
`:5-17` has the same two table states, but the only-`_new` recovery explicitly
renames and recreates both indexes (`:11-15`); a completed desired CHECK is
again safe to rebuild. A `spb_mint_audit` rebuild must follow that indexed
shape: staging drop/create, explicit seven-column copy, old drop, rename, and
account-index recreation, with equivalent recovery instructions.

Beyond the migration, the existing insert helper
`insertSpbMintAudit` (`src/db.js:1493-1501`) and migration/check tests need the
new outcome. This table has TTL/scope but no purge object/upload count columns,
so it is naturally cheaper for a mint/CAS outcome than for a purge-count
record. Reuse for sandbox events still requires null account/instance/prefix.

### B. Reuse `spb_sweep_audit` with null identifiers

Schema cost is zero: `account_id`, `instance_id`, and `prefix` are already
nullable and there is no outcome CHECK
(`migrations/0019_spb_sweep_audit.sql:4-13`). The existing insert helper at
`src/db.js:1513-1529` already has the two relevant count fields.

Code/test cost is passing null for all three identifiers and proving stored
rows contain only counts and timestamp. The account index remains present but
does not help those null-identity rows. The drawback is semantic overloading:
the same table would contain customer per-binding sweep records with
identifiers and sandbox counts-only records without a column that distinguishes
their kind. The migration file also has a pre-existing header typo:
`migrations/0019_spb_sweep_audit.sql:1` says “migration 0018”; this research
does not change it.

### C. Add a dedicated counts-only table

Following the additive patterns in
`migrations/0019_spb_sweep_audit.sql:4-13` and
`migrations/0021_spp_mint_audit.sql:3-9`, this costs:

- one idempotent `CREATE TABLE IF NOT EXISTS` migration containing only the
  permitted count/outcome/timestamp fields;
- the matching `schema.sql` definition;
- one `resetDb` drop-list entry (`test/helpers.js:118-143`);
- one DB insert helper and call site; and
- one migration test for exact columns, constraints (if any), insertion, and
  rerun, matching `test/migration-0019-spb-sweep-audit.test.js:6-31` or
  `test/migration-0021-spp-mint-audit.test.js:6-49`.

It requires no data copy, CHECK rebuild, or identifier index. Its higher file
and helper count buys the strongest structural guarantee that forbidden
identifiers/content cannot be inserted because those columns do not exist.

## Key Existing Patterns To Preserve

- Keep all SQL in `src/db.js`; orchestration/policy belongs in a focused module.
  The sandbox ownership precedent states this boundary at
  `docs/sandbox-ownership-design.md:203-236`.
- Use one guarded statement plus `RETURNING` as the atomic winner signal.
  One row is success; zero rows is a contention/CAS outcome; an exception is
  operational failure. Existing SPL/SPP SQL is at `src/db.js:1293-1365`.
- Use `IS` for nullable run ownership comparisons. The Workers-pool probe
  confirms null and non-null behavior.
- Never return owner/sandbox success after a zero-row write. The baseline SPB
  enable caller currently ignores the result because the helper returns none;
  this is a required caller touch point.
- Keep broker token lookup pre-identity and content-free. A denial's null token
  should continue to produce the existing generic 401 without exposing the
  tombstone.
- Keep R2 credentials memory-only. Existing signing returns the credential
  object at `src/r2-credential.js:39-70`; `signedR2Fetch` consumes it without
  persistence at `src/s3.js:10-71`.
- Preserve the denial tombstone across partial retries and verified purge;
  customer lapse sweep hard deletion is not a reusable sandbox terminal state.
- Audit only counts/outcomes permitted by criterion 11; no UUID, prefix, key,
  token/hash, credential, email, or content.
