# SPB Lapse-Retention Sweep Design

Review-gate design, approved and implemented. The real-R2 spike script is manual-only and remains outside CI, cron, and worker runtime paths.

Inputs:

- Prep findings: `account/docs/spb-sweep-prep.md`.
- Current scheduled entry: `account/src/index.js:839-845`.
- Existing retention test compatibility point: `account/test/retention.test.js:290-299`.

## Goals

- Delete all R2 objects and incomplete multipart uploads under each lapsed SPB binding prefix after the 30-day covenant window.
- Keep the sweep scheduled-only. No client route should be able to trigger irreversible deletion.
- Make deletion idempotent so crashes or partial R2 failures leave the binding row for a later retry.
- Keep durable audit records while keeping console and hub output counts-only and secret-free.
- Keep the SigV4 implementation minimal and isolated; validate live R2 wire behavior with the manual real-R2 spike before enabling the production sweep.

## Decided Design

### D1: Deletion Mechanism And Credentials

Decision: self-mint one maintenance-scoped temporary R2 credential per swept binding, then use that credential for the S3 SigV4 client.

Mechanics:

- Add one S3 client module for all four required operations: `ListObjectsV2`, `DeleteObjects`, `ListMultipartUploads`, and `AbortMultipartUpload`.
- Do not add a `[[r2_buckets]]` binding. The binding API cannot cover multipart listing/abort, so S3 is required; using S3 for object listing/delete too keeps the deletion path DRY.
- For each binding, mint a `maintenance` scoped temporary credential for exactly `users/{account}/{instance}/`, reusing the broker's JWT credential shape.
- Sign S3 requests with the minted `accessKeyId`, derived `secretAccessKey`, and `x-amz-security-token`.
- SigV4 scope is region `auto`, service `s3`.
- Use path-style addressing: `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com/{bucket}/{key}`.
- The parent secret remains a signing key for scoped credentials and is never used directly against objects.

Rationale:

- This gives R2-enforced defense-in-depth for irreversible delete: a prefix-construction or row-selection bug should still be denied outside the one binding's prefix.
- It keeps the parent secret as signing-key-only.
- It remains DRY because the broker and sweep share one credential minting implementation.
- Code-level containment still matters: every prefix comes from the DB binding row via `prefixFor(accountId, instanceId)`, and tests must assert no request ever targets another bucket or prefix.

Former alternative resolved by Jer: parent-direct was simpler, but it would rely entirely on code/tests for prefix containment. The approved design accepts the additional `x-amz-security-token` signing surface to get R2-enforced prefix containment.

### D2: Cadence And Scheduled Wiring

Decision: add a dedicated daily sweep cron and dispatch by `event.cron`.

Mechanics:

- Add `"0 3 * * *"` to `account/wrangler.toml [triggers] crons`, keeping the existing `"0 */6 * * *"` retention cron.
- Add a named constant `SWEEP_CRON = '0 3 * * *'` in `account/src/index.js`.
- Update `scheduled(event, env, ctx)` so `event.cron === SWEEP_CRON` runs `runSpbLapseSweep(env, ctx)`, otherwise it runs `runRetention(env)`.
- Preserve the existing retention scheduled test unchanged. `account/test/retention.test.js:290-299` calls `worker.scheduled({}, makeTestEnv(), ctx)`, waits on the context, and expects one `retention_sweep` warning. With `event.cron` undefined, the new dispatcher falls through to retention.
- Add a new scheduled test for `worker.scheduled({ cron: '0 3 * * *' }, env, ctx)` that runs the sweep and does not emit a `retention_sweep` warning.

Rationale:

- Daily cadence matches the 30-day covenant's granularity.
- It isolates irreversible R2 deletion from the frequent six-hour token/DB garbage collection pass.
- Dispatch by cron avoids changing existing retention tests and minimizes unrelated churn.

### D3: Durable Sink, Console, And Hub

Decision: add a new audit table and keep console/hub counts-only.

Mechanics:

- Add migration `account/migrations/0018_spb_sweep_audit.sql`.
- Add table `spb_sweep_audit` with columns:
  - `account_id TEXT`
  - `instance_id TEXT`
  - `prefix TEXT`
  - `objects_deleted INTEGER`
  - `multipart_aborted INTEGER`
  - `ts INTEGER NOT NULL`
- Add index `idx_spb_sweep_audit_account_id` on `account_id`.
- No `CHECK` constraint. Counts and row shape are simple, and there is no bounded outcome enum like `spb_mint_audit`.
- Mirror the table and index into `account/schema.sql`.
- Add `spb_sweep_audit` to the reset drop list in `account/test/helpers.js:114-135`.
- Do not reuse `spb_mint_audit`: it has an outcome `CHECK`, no count columns, and represents credential minting rather than irreversible R2 cleanup.

Audit row:

- One row per swept binding.
- Store `account_id`, `instance_id`, `prefix`, `objects_deleted`, `multipart_aborted`, and `ts`.
- UUIDs are identifiers, not secrets; storing them is consistent with `spb_mint_audit`.
- Never store `token_hash`, `R2_PARENT_SECRET_ACCESS_KEY`, derived secrets, signatures, emails, IPs, names, or other owner PII.

Console:

- Success summary mirrors `retention_sweep` shape but is counts-only: event `spb_lapse_sweep`, `bindings_swept`, `objects_deleted`, `multipart_aborted`, `duration_ms`, `ts`.
- Do not include `account_id`, `instance_id`, or `prefix` in console output. Critical constraint: `account/test/retention.test.js:276-279` rejects hash/token-shaped strings, including `[A-Za-z0-9_-]{32,}`. A 36-character UUID and any prefix embedding it match that class.
- Per-binding failure log mirrors `retention_sweep_failed`: event `spb_lapse_sweep_failed`, `binding_index`, `error_type`.
- Use the loop index, not account ID, instance ID, prefix, key, upload ID, or token-shaped values.
- Per-binding try/catch ensures one failing prefix does not abort the whole run.

Hub:

- Emit one summary event through `emitSecurityEvent(env, ctx, payload)`.
- Payload: type `spb_lapse_sweep`, tier `T4`, `bindings_swept`, `objects_deleted`, `multipart_aborted`.
- Counts only. No account IDs, prefixes, keys, credentials, signatures, or PII.
- This is included for alerting parity with broker refusal events, but low-stakes because `emitSecurityEvent` no-ops when `HUB_WEBHOOK_URL` is unset at `account/src/hub.js:7-19`.

### D4: File Layout And Function Boundaries

Decision: isolate S3 signing, sweep orchestration, and DB helpers.

Files:

- `account/src/s3.js`
  - Minimal SigV4 signer and S3 operation helpers.
  - WebCrypto only: `crypto.subtle` HMAC-SHA256 and SHA-256.
  - No external dependency.
  - No MD5 in the initial design.
  - Operation helpers take `(env, ...)` and derive endpoint/bucket from `env`.
  - Path-style addressing for all operations.
  - Internal signer should canonicalize URI, sorted query params, lower-case headers, signed headers, and actual payload SHA-256.
  - Key path encoding must preserve `/` separators while percent-encoding each key segment according to SigV4 rules.
  - Query canonicalization must encode and sort subresources and pagination parameters; `?delete` signs as `delete=`, `?uploads` signs as `uploads=`.
  - XML generation/parsing helpers stay private to this module unless tests need direct imports.

- `account/src/spb-sweep.js`
  - Export `runSpbLapseSweep(env, ctx, nowMs = Date.now())`.
  - Mirror `runRetention` structure: start time, aggregate counts, indexed loop, per-binding try/catch, summary warn, failure error.
  - Define a single retention constant: `LAPSE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000`.
- Q2 is approved: gate at the top with `env.SPB_SWEEP_ENABLED !== 'true'` and return before DB selection or R2 requests.
  - Select due rows with cutoff `nowMs - LAPSE_RETENTION_MS`.
  - Generate prefix through the exported `prefixFor`.

- `account/src/spb-broker.js`
  - Export `prefixFor`.
  - No other behavior change.
  - This avoids duplicating `users/${accountId}/${instanceId}/`.

- `account/src/db.js`
  - Add `selectDueLapsedBindings(db, cutoffMs)`: select `account_id`, `instance_id` from `spb_bindings` where `lapsed_at IS NOT NULL AND lapsed_at <= ?`, ordered by oldest lapse and stable row order.
  - Add `deleteSpbBinding(db, { accountId, instanceId })`: delete exactly one binding row by primary key.
  - Add `insertSpbSweepAudit(db, row)`.
  - Follow existing prepared-statement style.
  - No new `spb_bindings(lapsed_at)` index for now. The table is expected to be small; add an index only if observed volume warrants it.

### D5: Idempotence And Ordering

Decision: drain R2 first, then audit, then remove the binding row.

Per due binding:

1. Derive `prefix = prefixFor(account_id, instance_id)`.
2. Drain objects:
   - Page `ListObjectsV2` with `prefix`.
   - Delete listed keys with `DeleteObjects` in batches of at most 1000 keys.
   - Continue pagination with `continuation-token`.
   - After a paged pass, re-list the prefix from the start to confirm empty. This avoids token/deletion edge cases and handles late-visible objects without relying on a stale continuation token.
3. Drain multipart uploads:
   - Page `ListMultipartUploads` with `prefix`.
   - Abort each upload with `AbortMultipartUpload`.
   - Continue with `key-marker` and `upload-id-marker`.
   - Re-list from the start to confirm none remain, matching AWS's note that abort may need repetition if parts are racing.
4. Insert one `spb_sweep_audit` row with this run's counts.
5. Delete the `spb_bindings` row by `(account_id, instance_id)`.

Crash behavior:

- Crash before audit/delete: binding row remains and is reselected next run.
- Crash after some deletes: next run sees fewer or zero objects/uploads. Empty prefix is a no-op success that still audits `0/0` and removes the binding.
- Crash after audit but before binding delete: next run can create another audit row, likely `0/0`, then remove the binding. This tiny two-D1-write window is acceptable.
- Counts are per invocation. A crash can split counts across two runs; that is acceptable fidelity for an irreversible but idempotent sweep.

Failure behavior:

- If any R2 call returns a batch/object/upload error, throw within that binding.
- Log counts-only failure with `binding_index` and `error_type`.
- Do not write audit or delete the binding for that failed binding.
- Continue with the next due binding.

Subrequest budget:

- Workers paid plan has an approximately 1000-subrequest-per-invocation ceiling, so object deletion must use `DeleteObjects` batches rather than per-object DELETE.
- Multipart abort remains one request per upload after list pagination.
- Do not silently cap and pretend success. If volume forces an early break or platform subrequest failure, log a counts-only failure/deferred event and leave the binding row for a later retry.

## Wire Format Locked For Implementation

SigV4:

- Use actual SHA-256 hex in `x-amz-content-sha256` for every request.
- Bodyless GET/DELETE requests use the empty-body SHA-256 constant `e3b0c442...b855`.
- `POST ?delete` uses the actual SHA-256 hex of the XML body.
- Do not use `UNSIGNED-PAYLOAD`; this avoids the R2 doc gap identified in prep.
- Region is `auto`; service is `s3`; include `x-amz-security-token` from the minted credential.

DeleteObjects integrity header:

- Initial plan: no `Content-MD5`.
- Sign the actual body hash through `x-amz-content-sha256`.
- Rationale: this mirrors Cloudflare's recommended `aws4fetch` style, keeps the signer WebCrypto-only, and avoids building MD5 before the real-R2 spike.
- Fallback ladder if real R2 rejects `DeleteObjects` without MD5:
  1. Add `x-amz-checksum-sha256: base64(sha256(body))`, still WebCrypto-only, and sign that header.
  2. Only if R2 still rejects, add a tiny local MD5 helper for `Content-MD5`.
- This is the main place where the design intentionally differs from the prep doc's conservative AWS-S3 reading. The real-R2 spike is the arbiter.

Operation shapes:

- `ListObjectsV2`: GET `/{bucket}?list-type=2&prefix=...`, optional `continuation-token`.
- `DeleteObjects`: POST `/{bucket}?delete`, XML body, max 1000 keys.
- `ListMultipartUploads`: GET `/{bucket}?uploads&prefix=...`, optional `key-marker` and `upload-id-marker`.
- `AbortMultipartUpload`: DELETE `/{bucket}/{key}?uploadId=...`.

XML:

- Generate request XML with explicit escaping for `&`, `<`, `>`, `"`, and `'`.
- Parse only these response block shapes with narrow non-greedy regexes:
  - `Contents` blocks for object keys.
  - `Upload` blocks for multipart keys/upload IDs.
  - `Deleted` blocks for delete counts.
  - `Error` blocks for delete failures.
- Decode XML entities in extracted text.
- Do not depend on `DOMParser`; no XML parser dependency exists in the current Worker/test setup.

## Implementation Sequence

1. Add migration/schema/test-reset support for `spb_sweep_audit`.
2. Add DB helpers for selecting due bindings, inserting sweep audit rows, and deleting one SPB binding.
3. Export `prefixFor` from `spb-broker.js`.
4. Add `account/src/s3.js` with signer, XML helpers, and S3 operation helpers.
5. Add `account/src/spb-sweep.js` orchestration.
6. Wire `SWEEP_CRON` and scheduled dispatch in `account/src/index.js`.
7. Add `"0 3 * * *"` to `account/wrangler.toml`.
8. Add test helper `installS3FetchMock` and sweep tests.
9. Add or update docs/runbook notes after real-R2 spike outcome, especially if checksum fallback changes.

## Test Plan

### Test Helper

Add `installS3FetchMock(testEnv, handlers)` following `installGcpFetchMock` at `account/test/helpers.js:157-180`.

Requirements:

- Allow only host `${testEnv.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`.
- Reject any path not under `/${testEnv.R2_BUCKET}`.
- Record every request as method, URL, headers, and body text.
- Route by method plus host/path/query, with keys for list objects, delete, list uploads, and abort upload.
- Return XML responses with `Content-Type: application/xml`.
- Expose calls for containment and no-secret assertions.

### Migration 0018

Mirror `account/test/migration-0017-spb-mint-audit.test.js:12-34`.

Assertions:

- Table `spb_sweep_audit` exists.
- Columns are exactly `account_id`, `instance_id`, `prefix`, `objects_deleted`, `multipart_aborted`, `ts`.
- Index `idx_spb_sweep_audit_account_id` exists.
- Migration can re-run.
- No outcome `CHECK` expectations.

### DB Selection

Use `seedSpbBinding` from `account/test/helpers.js:619-636`.

Cases:

- `lapsed_at = now - 31d` is selected and swept.
- `lapsed_at = now - 29d` is not selected.
- `lapsed_at = null` is not selected.
- Multiple rows for one account but different `instance_id` produce independent prefixes and independent sweep outcomes.

### Object Deletion

Cases:

- Multi-page `ListObjectsV2` with `NextContinuationToken`.
- `DeleteObjects` batches at 1000 keys and handles a final partial batch.
- Final re-list returns empty before audit/delete.
- `DeleteObjects` response with `<Error>` causes that binding to fail, remain selected, skip audit, and allow later bindings to continue.
- Empty prefix is a success: audit `0/0`, then binding row removed.

### Multipart Abort

Cases:

- Multi-page `ListMultipartUploads` with `NextKeyMarker` and `NextUploadIdMarker`.
- Abort each listed upload with `AbortMultipartUpload`.
- Count only successful abort responses.
- Final re-list returns empty before audit/delete.
- Abort failure leaves the binding row, skips audit, logs counts-only failure, and continues to next binding.

### Ordering And Idempotence

Assertions:

- Binding row remains if any R2 operation fails before audit/delete.
- Audit row is written only after objects and multipart uploads are drained.
- Binding row is deleted only after audit insert.
- Re-run after a partial previous delete sees empty prefix, writes `0/0`, and removes the binding.
- Counts are per invocation, not lifetime totals.

### Containment

Assertions over recorded S3 calls:

- Every request host is the configured R2 account host.
- Every request bucket path is `/${testEnv.R2_BUCKET}`.
- Every object key parsed from `DeleteObjects` XML starts with the swept prefix.
- Every abort URL key starts with the swept prefix.
- No request targets an out-of-prefix control object/upload.
- Request body XML escaping preserves weird but valid key characters.

### No Secrets And Counts-Only Logs

Use `installConsoleSpy` from `account/test/helpers.js:249-263`.

Assertions:

- Console output and JSON-stringified audit rows do not contain `R2_PARENT_SECRET_ACCESS_KEY`, token hashes, access key IDs, signatures, session tokens, or object bodies.
- Console success summary contains only event, counts, duration, and timestamp.
- Console failure output contains `binding_index` and `error_type`, not UUIDs/prefixes/keys.
- Apply the generic UUID/token-shaped regex from `account/test/retention.test.js:276-279` to console output, not to audit rows, because audit rows legitimately contain UUID identifiers.

### Hub Event

Cases:

- With no `HUB_WEBHOOK_URL`, no fetch occurs.
- With `HUB_WEBHOOK_URL`, one summary event is emitted through `ctx.waitUntil`.
- Payload is counts-only: `type`, `tier`, `bindings_swept`, `objects_deleted`, `multipart_aborted`, plus hub wrapper fields.
- No account IDs, prefixes, keys, credentials, signatures, or PII.

### Scheduled Wiring

Cases:

- Existing `worker.scheduled({}, makeTestEnv(), ctx)` test stays unchanged and emits `retention_sweep`.
- New `worker.scheduled({ cron: '0 3 * * *' }, env, ctx)` runs the sweep and does not emit `retention_sweep`.
- If Q2 kill-switch is approved, scheduled sweep with default env does not touch S3; scheduled sweep with `SPB_SWEEP_ENABLED: 'true'` performs the sweep.

### No Client Trigger

Cases:

- Install an S3 fetch mock that throws on any request.
- Exercise representative `worker.fetch` routes, especially `GET /backup` and `POST /backup/credentials`.
- Assert no route invokes `runSpbLapseSweep` or any S3 operation.
- Confirm only the scheduled `{ cron: SWEEP_CRON }` path can touch S3.

## Open Questions For Jer

### Q1: Credential Choice

Decision: self-minted maintenance-scoped temporary credential per binding.

Tradeoff resolved: parent-direct is simpler and keeps one server-side SigV4 mode, but a prefix-construction bug would be contained only by code/tests. Prefix-scoped maintenance temp creds add R2-enforced defense-in-depth for irreversible delete; even a bad key should be denied outside the prefix. The implementation accepts session-token signing and per-binding minting for this safety property.

### Q2: Rollout Kill-Switch

Decision: yes.

Add `SPB_SWEEP_ENABLED`, default off, mirroring the broker's `SPB_MINT_ENABLED` comment at `account/wrangler.toml:85-86`. This is a rollout gate, not a configurable retention-duration knob, so it does not violate the no-env-knobs constraint for retention duration. Gate exactly at the top of `runSpbLapseSweep`: if `env.SPB_SWEEP_ENABLED !== 'true'`, return before selecting rows, signing requests, touching R2, writing audit rows, logging summaries, or emitting hub events.

### Q3: Real-R2 Verification

Decision: Jer runs the manual real-R2 spike VPE-direct with vaulted credentials before enabling the production sweep.

Prep found `wrangler` installed but no R2 parent creds in the shell or worktree env. The implemented script is `account/scripts/spb-sweep-spike.mjs`, with runbook `account/docs/spb-sweep-spike.md`; it must be run manually by Jer with vaulted env vars and must not be wired into CI, cron, or worker runtime paths. The script:

1. Generates throwaway prefixes under `users/spb-sweep-spike/` and `users/spb-sweep-spike-control/`.
2. Mints separate maintenance-scoped credentials for the test and control prefixes.
3. Puts two small objects under the test prefix and one control object under the control prefix.
4. Starts one deliberately incomplete multipart upload under the test prefix.
5. Runs the same `account/src/s3.js` operation helpers the sweep uses against the test prefix only.
6. Asserts test-prefix objects are gone, the test-prefix upload is aborted, the control object remains, and counts match.
7. Performs best-effort cleanup under only the two spike roots.
8. Leaves `SPB_SWEEP_ENABLED` off until the spike prints `SPIKE PASS`.

## Review Notes

- The only intentional tension with prep is `DeleteObjects` integrity: prep's conservative AWS reading treated `Content-MD5` as required, but this design follows the approved call to start with no MD5, actual `x-amz-content-sha256`, and a WebCrypto-only fallback ladder.
- The signer must stay small and well-tested. The dangerous pieces are canonical path/query/header construction and XML body signing, not the HMAC primitives.
- Console output must remain counts-only. Accidentally logging a prefix or UUID will violate the existing no-secret regex style.
