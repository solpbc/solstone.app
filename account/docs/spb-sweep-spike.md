# SPB Sweep Real-R2 Spike

Manual runbook for the operator. This script is not wired into CI, cron, or `npm test`.

## What It Proves

- R2 accepts the live SigV4 request shape from `account/src/s3.js`.
- Self-minted `maintenance` scoped credentials from `account/src/r2-credential.js` can perform the required S3 operations under their prefix.
- `DeleteObjects`, `ListMultipartUploads`, and `AbortMultipartUpload` work against real R2.
- Production `ListObjectsV2` signs an R2-issued `continuation-token` correctly, validated by a raw `max-keys=1` cursor probe.
- Production `ListMultipartUploads` signs R2-issued `key-marker` and `upload-id-marker` values correctly, validated by a raw `max-uploads=1` cursor probe.
- A sweep using the test-prefix credential drains only the test prefix while a separate control prefix remains untouched.

## How To Run

Run from the repository root with Node 20+:

```sh
export R2_ACCOUNT_ID=...
export R2_BUCKET=...
export R2_PARENT_ACCESS_KEY_ID=...
export R2_PARENT_SECRET_ACCESS_KEY=...
node account/scripts/spb-sweep-spike.mjs
```

Use vaulted R2 parent credentials in the shell session. Do not paste secrets into the repo, docs, shell history, or test fixtures.

The script prints step logs and final counts only. It never prints the parent secret, derived secret, JWT, or session token. A successful cursor probe prints:

```text
cursor signing OK (continuation-token + multipart markers accepted)
```

## Safety Guarantees

- The script hardcodes spike roots:
  - `users/spb-sweep-spike/`
  - `users/spb-sweep-spike-control/`
- It creates randomized prefixes only under those roots.
- It refuses to operate on keys outside those two roots.
- It never targets real owner data under `users/{account}/{instance}/`.
- It uses scoped temporary credentials:
  - one maintenance credential for the test prefix
  - one maintenance credential for the control prefix
- Cleanup is best-effort and only touches the two spike roots.

## Expected Result

Success ends with:

```text
SPIKE PASS objectsDeleted=2 multipartAborted=2
```

The exact counts should be 2 deleted test objects and 2 aborted incomplete multipart uploads. The separate control object is asserted present before cleanup.

Failure prints:

```text
SPIKE FAIL: <reason>
```

and exits nonzero.

## Enablement Gate

Leave `SPB_SWEEP_ENABLED` unset or not `"true"` in production until this script prints `SPIKE PASS` with vaulted credentials against the real bucket. Flip `SPB_SWEEP_ENABLED` to `"true"` only after the live spike passes and cleanup has completed.
