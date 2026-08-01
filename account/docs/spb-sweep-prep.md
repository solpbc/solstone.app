# SPB Lapse-Retention Sweep Prep

Research only. No production code was changed.

## Sources

- Cloudflare R2 S3 compatibility: https://developers.cloudflare.com/r2/api/s3/api/
- Cloudflare R2 authentication: https://developers.cloudflare.com/r2/api/tokens/
- Cloudflare R2 temporary credentials: https://developers.cloudflare.com/r2/api/s3/temporary-credentials/
- Cloudflare R2 `aws4fetch` example: https://developers.cloudflare.com/r2/examples/aws/aws4fetch/
- Cloudflare R2 AWS SDK v3 example: https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
- AWS S3 SigV4 header auth: https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sig-v4-header-based-auth.html
- AWS IAM SigV4 request construction: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html
- AWS S3 API ListObjectsV2: https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html
- AWS S3 API DeleteObjects: https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObjects.html
- AWS S3 API ListMultipartUploads: https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListMultipartUploads.html
- AWS S3 API AbortMultipartUpload: https://docs.aws.amazon.com/AmazonS3/latest/API/API_AbortMultipartUpload.html

## Current Implementation

The account Worker is the relevant worker. `account/src/index.js:274` exports the Worker object, `account/src/index.js:275` is the `fetch` handler, and `account/src/index.js:837` is the scheduled handler. The scheduled handler only calls `runRetention(env)` at `account/src/index.js:838`. The cron is configured at `account/wrangler.toml:107-108` as `0 */6 * * *`; R2 vars are `R2_ACCOUNT_ID` and `R2_BUCKET="solstone-backups"` at `account/wrangler.toml:104-105`. Parent R2 credentials are documented as secrets at `account/wrangler.toml:81-84`.

`runRetention` currently performs D1-only cleanup statements in `account/src/retention.js:22-121`. It does not read `spb_bindings`, call `fetch`, touch R2, or dispatch background work. The only current R2-related production code is the SPB credential broker route at `account/src/index.js:782-788`, implemented by `handleBackupCredentials` in `account/src/spb-broker.js:35-132`.

The broker is a client-handoff path, not a server-side S3 client. It finds the SPB binding by bearer token hash at `account/src/spb-broker.js:44-58`, derives a prefix with module-local `prefixFor(accountId, instanceId)` at `account/src/spb-broker.js:167-169`, checks entitlement at `account/src/spb-broker.js:59-72`, signs an HS256 JWT with `jose` and `R2_PARENT_SECRET_ACCESS_KEY` at `account/src/spb-broker.js:92-104`, returns `secret_access_key = sha256Hex(jwt)` and `session_token = btoa("jwt/" + jwt)` at `account/src/spb-broker.js:105-127`, and writes non-secret audit rows at `account/src/spb-broker.js:109-117`.

`jose` is only useful for the broker's JWT temporary credential minting. It is irrelevant to AWS SigV4 request signing, which needs canonicalization plus HMAC-SHA256/SHA-256.

## R2 S3 API And SigV4 Wire Format

### Endpoint And Addressing

R2's S3-compatible endpoint is:

```text
https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com
```

Cloudflare documents this endpoint in the R2 S3 compatibility and authentication docs. It also documents `region: "auto"` in S3 SDK examples. Cloudflare's `aws4fetch` example uses path-style requests:

```text
GET https://{ACCOUNT_ID}.r2.cloudflarestorage.com/my-bucket?list-type=2
```

Use path-style addressing for the sweep:

```text
/{bucket}
/{bucket}/{key}
```

This matches the broker's returned shape (`endpoint`, `bucket`, `prefix`) and avoids relying on virtual-host bucket subdomains.

### SigV4 Inputs

Use AWS SigV4 header auth with:

- Algorithm: `AWS4-HMAC-SHA256`.
- Region: `auto` for R2.
- Service: `s3`.
- Credential scope: `{yyyymmdd}/auto/s3/aws4_request`.
- Required request headers: `host`, `x-amz-date`, `x-amz-content-sha256`, `authorization`.
- Also sign every included `x-amz-*` header, and sign `content-md5` / `content-type` if included.

Canonical request shape:

```text
{METHOD}
{CanonicalURI}
{CanonicalQueryString}
{CanonicalHeaders}

{SignedHeaders}
{HashedPayload}
```

String-to-sign shape:

```text
AWS4-HMAC-SHA256
{amzDate}
{yyyymmdd}/auto/s3/aws4_request
{hexSha256(canonicalRequest)}
```

Signing key derivation:

```text
kDate = HMAC("AWS4" + secret, yyyymmdd)
kRegion = HMAC(kDate, "auto")
kService = HMAC(kRegion, "s3")
kSigning = HMAC(kService, "aws4_request")
signature = hex(HMAC(kSigning, stringToSign))
```

Authorization header:

```text
AWS4-HMAC-SHA256 Credential={accessKeyId}/{yyyymmdd}/auto/s3/aws4_request,SignedHeaders={signedHeaders},Signature={signature}
```

`crypto.subtle` is sufficient for the SigV4 signing chain: SHA-256 digest and HMAC-SHA256 signing. This repo already uses `crypto.subtle.digest("SHA-256", ...)` in `account/src/crypto.js:41` and `account/src/spb-broker.js:171-173`, and HMAC-SHA256 via `crypto.subtle.importKey`/`sign` in `account/src/crypto.js:76-84`.

Payload hash policy:

- AWS S3 requires `x-amz-content-sha256` on SigV4 requests and allows either a real SHA-256 payload hash or the literal `UNSIGNED-PAYLOAD`.
- Cloudflare's official presigned URL examples show R2 accepting `X-Amz-Content-Sha256=UNSIGNED-PAYLOAD` for object GET/PUT presigned URLs.
- I did not find an official Cloudflare statement explicitly confirming header-signed `POST /{bucket}?delete` accepts `UNSIGNED-PAYLOAD` for the XML body.
- Conservative implementation: use the actual SHA-256 hex of the XML body for `DeleteObjects`, and use either actual empty-body SHA-256 (`e3b0...b855`) or `UNSIGNED-PAYLOAD` for bodyless GET/DELETE requests. Actual hashes everywhere are simplest and avoid the R2 doc gap.

Separate from SigV4, AWS general-purpose S3 requires `Content-MD5` for `DeleteObjects`. R2's compatibility matrix marks `DeleteObjects` implemented and does not list `Content-MD5` as unsupported for that operation. Treat `Content-MD5` as required/accepted for R2 multi-object delete unless a real-R2 spike proves R2 permits omission. Note: WebCrypto does not provide MD5, so `crypto.subtle` is sufficient for SigV4 but not for generating a `Content-MD5` header; a tiny local MD5 helper or another approach would be needed if implementation uses `DeleteObjects`.

### ListObjectsV2

Request:

```http
GET /{bucket}?list-type=2&prefix={urlEncodedPrefix} HTTP/1.1
Host: {R2_ACCOUNT_ID}.r2.cloudflarestorage.com
x-amz-date: {amzDate}
x-amz-content-sha256: {emptyBodySha256 or UNSIGNED-PAYLOAD}
Authorization: AWS4-HMAC-SHA256 ...
```

Pagination:

```text
continuation-token={urlEncodedNextContinuationToken}
```

Response XML root is `ListBucketResult`. Parse:

- `IsTruncated`
- `NextContinuationToken`
- each `Contents/Key`
- optionally `KeyCount`

Empty detection: no `<Contents>` blocks, or `KeyCount` is `0`. Continue pagination only when `IsTruncated` is `true` and `NextContinuationToken` is present.

### DeleteObjects

Request:

```http
POST /{bucket}?delete HTTP/1.1
Host: {R2_ACCOUNT_ID}.r2.cloudflarestorage.com
Content-Type: application/xml
Content-MD5: {base64(md5(xmlBodyBytes))}
x-amz-date: {amzDate}
x-amz-content-sha256: {hexSha256(xmlBodyBytes)}
Authorization: AWS4-HMAC-SHA256 ...

<Delete>
  <Object><Key>users/acct/inst/file1</Key></Object>
  <Object><Key>users/acct/inst/file2</Key></Object>
</Delete>
```

Canonical query string should be `delete=` for the subresource, even if the URL is emitted as `?delete`.

Batch size: max 1000 keys per request.

Required header: use `Content-MD5`. AWS allows additional checksum headers for directory buckets, but this bucket is normal S3/R2 path-style, and R2 docs do not document `x-amz-checksum-sha256` as a `DeleteObjects` alternative. Do not plan on `x-amz-checksum-sha256` replacing `Content-MD5` without a real-R2 spike.

Response XML root is `DeleteResult`. Parse:

- `Deleted/Key`
- `Error/Key`
- `Error/Code`
- `Error/Message`

Treat any `<Error>` as a failed batch/object and log enough non-secret context to retry/debug.

### ListMultipartUploads

Request:

```http
GET /{bucket}?uploads&prefix={urlEncodedPrefix} HTTP/1.1
Host: {R2_ACCOUNT_ID}.r2.cloudflarestorage.com
x-amz-date: {amzDate}
x-amz-content-sha256: {emptyBodySha256 or UNSIGNED-PAYLOAD}
Authorization: AWS4-HMAC-SHA256 ...
```

Canonical query string should include `uploads=`.

Pagination:

```text
key-marker={urlEncodedNextKeyMarker}
upload-id-marker={urlEncodedNextUploadIdMarker}
```

Response XML root is `ListMultipartUploadsResult`. Parse:

- `IsTruncated`
- `NextKeyMarker`
- `NextUploadIdMarker`
- each `Upload/Key`
- each `Upload/UploadId`

Empty detection: no `<Upload>` blocks. Continue only when `IsTruncated` is `true` and both next markers needed by general-purpose S3 are present.

### AbortMultipartUpload

Request:

```http
DELETE /{bucket}/{urlEncodedKey}?uploadId={urlEncodedUploadId} HTTP/1.1
Host: {R2_ACCOUNT_ID}.r2.cloudflarestorage.com
x-amz-date: {amzDate}
x-amz-content-sha256: {emptyBodySha256 or UNSIGNED-PAYLOAD}
Authorization: AWS4-HMAC-SHA256 ...
```

Success response is HTTP 204 with no body. AWS notes abort may need to be repeated if part uploads are still racing; for a retention sweep, listing again after abort pagination is the simplest verification/retry shape.

### XML Parsing In Workers

There is no XML parser dependency in `account/package.json`, and `rg` found no `DOMParser`/XML parser usage in `account/src` or `account/test`. Workers should not rely on browser DOM APIs here.

Simplest robust approach for these narrow S3 XML shapes:

- Generate request XML with explicit escaping for `&`, `<`, `>`, `"`, and `'`.
- Parse only known repeated blocks with non-greedy regexes:
  - `<Contents ...>...</Contents>`
  - `<Upload ...>...</Upload>`
  - `<Deleted ...>...</Deleted>`
  - `<Error ...>...</Error>`
- Extract simple tags from those blocks (`Key`, `UploadId`, etc.) and decode XML entities.
- Avoid a general XML parser abstraction unless later responses require namespaces, attributes, or nested unknown structures. These S3 response fields are simple text elements.

## No-Client-Trigger Invariant

`account/src/index.js` is an explicit route ladder. Routes/touch points:

- Legacy redirects: `LEGACY_REDIRECTS` and `LEGACY_PREFIX_REDIRECTS` at `account/src/index.js:138-165`, applied at `account/src/index.js:281-282`.
- `GET /portal.css`: `account/src/index.js:284-292`.
- `GET /fonts/:file`: `account/src/index.js:294-307`.
- `GET /`: `account/src/index.js:309-325`.
- `POST /signin/start`: `account/src/index.js:327-329`.
- `GET /signin/verify`: `account/src/index.js:331-333`.
- `POST /signin/verify`: `account/src/index.js:335-337`.
- `GET /enable/scout`: `account/src/index.js:339-346`.
- `POST /enable/scout/confirm`: `account/src/index.js:348-356`.
- `GET /handoff/scout`: `account/src/index.js:358-365`.
- `GET /enable/push`: `account/src/index.js:367-374`.
- `POST /enable/push/confirm`: `account/src/index.js:376-384`.
- `GET /handoff/push`: `account/src/index.js:386-393`.
- `GET /enable/spl`: `account/src/index.js:395-402`.
- `POST /enable/spl/confirm`: `account/src/index.js:404-412`.
- `GET /handoff/spl`: `account/src/index.js:414-421`.
- Passkey start/finish routes: `account/src/index.js:423-437`.
- `POST /signout`: `account/src/index.js:439-447`.
- `GET /goodbye`: `account/src/index.js:449-451`.
- `GET /terms`: `account/src/index.js:453-455`.
- `GET /private-network`: `account/src/index.js:457-461`.
- `GET /backup`: `account/src/index.js:463-465`.
- `GET /notifications`: `account/src/index.js:467-469`.
- `GET /sealed-container`: retired (spc mothballed 2026-07-12); 302-redirects to `/` via `LEGACY_REDIRECTS` in `account/src/index.js`.
- `GET /sign-in`: `account/src/index.js:475-477`.
- `GET /sign-in/emails`: `account/src/index.js:479-486`.
- `POST /sign-in/emails/add`: `account/src/index.js:488-496`.
- `GET /sign-in/emails/verify`: `account/src/index.js:498-506`.
- `POST /sign-in/emails/verify`: `account/src/index.js:508-516`.
- `GET /transparency`: `account/src/index.js:518-524`.
- `POST /sign-in/emails/:id/make-primary`: `account/src/index.js:526-534`.
- `POST /sign-in/emails/:id/remove`: `account/src/index.js:536-544`.
- `GET /sign-in/sessions`: `account/src/index.js:546-553`.
- `GET /sign-in/passkeys`: `account/src/index.js:555-562`.
- `GET /devices`: `account/src/index.js:564-570`.
- `GET /scout`: `account/src/index.js:572-580`.
- `POST /sign-in/sessions/revoke-others`: `account/src/index.js:582-590`.
- `POST /devices/revoke-all`: `account/src/index.js:592-599`.
- `POST /push/disable`: `account/src/index.js:601-608`.
- `POST /scout/apply`: `account/src/index.js:620-626`.
- `POST /sign-in/sessions/:id/revoke`: `account/src/index.js:646-654`.
- `POST /devices/:id/revoke`: `account/src/index.js:656-663`.
- `POST /sign-in/passkeys/:id/rename`: `account/src/index.js:665-673`.
- `POST /sign-in/passkeys/:id/remove`: `account/src/index.js:675-683`.
- `GET /support`: `account/src/index.js:685-687`.
- `POST /support`: `account/src/index.js:689-691`.
- `GET /support/:id`: `account/src/index.js:693-695`.
- `POST /support/:id/reply`: `account/src/index.js:697-704`.
- `GET /account/devices`: `account/src/index.js:706-713`.
- `POST /account/devices/register`: `account/src/index.js:715-723`.
- `POST /account/devices/deregister`: `account/src/index.js:725-733`.
- `POST /account/dispatch-token`: `account/src/index.js:735-742`.
- `GET /account/scout/status`: `account/src/index.js:744-752`.
- `POST /push/dispatch`: `account/src/index.js:754-761`.
- `POST /push/dedup`: `account/src/index.js:763-770`.
- `POST /reach/push/relay-token`: `account/src/index.js:772-780`.
- `POST /backup/credentials`: `account/src/index.js:782-789`.
- `POST /billing/checkout`: `account/src/index.js:791-798`.
- `POST /billing/portal`: `account/src/index.js:800-807`.
- `GET /billing/return`: `account/src/index.js:809-816`.
- `POST /stripe/webhook`: `account/src/index.js:818-825`.
- `/admin/accounts` and `/admin/*`: `account/src/index.js:827-829`.
- 404 fallback: `account/src/index.js:831`.
- Scheduled retention: `account/src/index.js:837-839`.

None of the fetch routes can delete an R2 prefix or invoke a sweep today. The only route that touches R2 concepts is `POST /backup/credentials`, and that only mints scoped temporary client credentials. The only sweep entry point is the scheduled handler, and today it is D1-only.

## Lapse Clock And Prefix Ground Truth

Schema:

- `spb_bindings` is declared at `account/schema.sql:271-284`.
- Columns: `account_id`, `instance_id`, `created_at`, `last_seen_at`, `token_hash`, `lapsed_at`.
- Primary key: `(account_id, instance_id)` at `account/schema.sql:280`.
- Migration source: `account/migrations/0016_spb_entitlement.sql:60-71`.

Writers:

- `markSpbBindingLapsed(db, { accountId, nowMs })` at `account/src/db.js:1030-1035` sets `lapsed_at = nowMs` only where it is currently null.
- `clearSpbBindingLapsed(db, { accountId })` at `account/src/db.js:1037-1042` clears all SPB binding rows for the account.
- Both helpers are imported only by `account/src/spb-entitlement.js:1-7`.
- `reconcileSpbEntitlement` stamps lapse at `account/src/spb-entitlement.js:49-60` and clears lapse for paid or comp-active states at `account/src/spb-entitlement.js:25-35` and `account/src/spb-entitlement.js:37-48`.

Indirect callers:

- Stripe/billing reconciliation dispatches SPB events to `reconcileSpbEntitlement` at `account/src/billing.js:174`.
- Admin scout approve/revoke paths call `reconcileAllServices` at `account/src/admin.js:145`, `account/src/admin.js:149`, `account/src/admin.js:164`, and `account/src/admin.js:191`; `reconcileAllServices` calls `reconcileSpbEntitlement` at `account/src/spb-entitlement.js:64-67`.

Readers:

- Broker identity lookup reads `spb_bindings` via `findSpbBindingByTokenHash` at `account/src/db.js:1044-1054`; broker uses the row at `account/src/spb-broker.js:50-58`.
- Current broker does not use `lapsed_at` to decide serving; entitlement decides serving at `account/src/spb-broker.js:59-72`. Test coverage confirms this at `account/test/spb-broker.test.js:193-202`.

Prefix:

- `prefixFor(accountId, instanceId)` is module-local at `account/src/spb-broker.js:167-169`.
- Prefix format is `users/${accountId}/${instanceId}/`.
- Because one account can have multiple `(account_id, instance_id)` rows, a sweep must operate per binding row/prefix, not per account only.

## Test Stub Pattern For S3

Existing patterns:

- `installHubStub` in `account/test/spb-broker.test.js:465-477` stubs global `fetch`, records URL, headers, parsed JSON body, and returns JSON OK.
- `installApnsFetchMock` in `account/test/helpers.js` records `{ method, url, init }`, denies unexpected hosts, looks up handlers by `METHOD host/path?query`, then returns the handler response.
- `installConsoleSpy` in `account/test/helpers.js:249-263` captures console calls and exposes `assertNoSecrets`; SPB broker tests use it at `account/test/spb-broker.test.js:237-254`.

Recommended S3 stub shape for sweep tests:

- Add an `installS3FetchMock(testEnv, handlers = {})` test helper.
- Allow only host `${testEnv.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`.
- Record all requests as `{ method, url, init, headers, bodyText }`.
- Reject any request whose path does not start with `/${testEnv.R2_BUCKET}`.
- Route handlers by keys:
  - `GET host/{bucket}?list-type=2...`
  - `POST host/{bucket}?delete` or `?delete=`
  - `GET host/{bucket}?uploads...`
  - `DELETE host/{bucket}/{key}?uploadId=...`
  - fallback `default` should throw.
- Return XML response bodies with `Content-Type: application/xml`.
- Containment tests should assert every recorded URL uses bucket `solstone-backups`, and every listed/deleted/aborted key starts with the swept prefix. For `DeleteObjects`, parse the XML request body and assert all `<Key>` values are under the prefix. For aborts, assert the URL key path is under the prefix.
- Use `installConsoleSpy().assertNoSecrets([...])` around sweep tests with `R2_PARENT_SECRET_ACCESS_KEY`, access key, signatures if captured, and any object keys considered sensitive.

## emitSecurityEvent Shape

`emitSecurityEvent(env, ctx, payload)` is defined at `account/src/hub.js:7-19`.

Behavior:

- No-op if `env.HUB_WEBHOOK_URL` is unset at `account/src/hub.js:8`.
- Body is `JSON.stringify({ office: "cso", ts: new Date().toISOString(), ...payload })` at `account/src/hub.js:9`.
- POSTs to `env.HUB_WEBHOOK_URL` with `Content-Type: application/json` and `X-Hub-Secret: env.HUB_WEBHOOK_SECRET || ""` at `account/src/hub.js:10-16`.
- Catches fetch failures and uses `ctx.waitUntil(task)` if available at `account/src/hub.js:17-18`.
- File comments explicitly require never including raw tokens, credentials, or other secret material at `account/src/hub.js:1-6`.

SPB broker uses it only for mint refusals at `account/src/spb-broker.js:140-148`. Tests assert the payload keys are only `account_id`, `instance_id`, `office`, `outcome`, `tier`, `ts`, and `type` at `account/test/spb-broker.test.js:282-301`.

## Real-R2 Spike Feasibility

Do not run from the current environment yet.

Observed locally:

- `wrangler` is installed on the operator's `PATH`.
- `npx --no-install wrangler --version` from `account/` reports `4.92.0`.
- Shell env does not contain `R2_PARENT_ACCESS_KEY_ID`, `R2_PARENT_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `CLOUDFLARE_API_TOKEN`, `CF_API_TOKEN`, or `CLOUDFLARE_ACCOUNT_ID`.
- I found no `account/.dev.vars`, `account/.env`, or `account/.env.*` file.

Feasibility: tooling is present, but real R2 parent credentials are not available in this shell. A later spike needs credentials supplied through a safe channel or Cloudflare/Wrangler auth capable of retrieving/using them.

Spike sketch:

1. Use a throwaway prefix like `users/spb-sweep-test/{uuid}/` in bucket `solstone-backups`.
2. Put two small objects under that prefix and one control object outside the prefix.
3. Start one incomplete multipart upload under that prefix; optionally start one outside as a containment control.
4. Run only the sweep target code for that prefix.
5. Verify `ListObjectsV2` returns no contents under the prefix, the outside control remains, `ListMultipartUploads` returns no upload under the prefix, and outside uploads are untouched.
6. Cleanup all test objects/uploads.

## Key Patterns To Follow

- Keep the sweep scheduled-only. Do not expose a fetch route that lets a client trigger prefix deletion.
- Select rows from `spb_bindings` by `lapsed_at`, and sweep per `(account_id, instance_id)` prefix.
- Derive prefix from DB row data only: `users/${accountId}/${instanceId}/`.
- Enforce containment twice: before issuing S3 deletes/aborts, and in tests by recording every S3 request.
- Avoid logging secrets. Existing patterns log typed events and counts, not raw credentials/tokens.
- Prefer actual SHA-256 payload hashes for SigV4 to avoid `UNSIGNED-PAYLOAD` ambiguity on `POST ?delete`.
- Treat `Content-MD5` for `DeleteObjects` as the main R2/S3 divergence risk because it may require an MD5 helper outside WebCrypto.
