import {
  deleteSpbBinding,
  insertSpbSweepAudit,
  selectDueLapsedBindings,
} from './db.js';
import { emitSecurityEvent } from './hub.js';
import { mintScopedCredential } from './r2-credential.js';
import {
  abortMultipartUpload,
  deleteObjects,
  listMultipartUploads,
  listObjectsV2,
} from './s3.js';
import { prefixFor } from './spb-broker.js';

export const LAPSE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const DELETE_BATCH_SIZE = 1000;

export async function runSpbLapseSweep(env, ctx, nowMs = Date.now()) {
  if (env.SPB_SWEEP_ENABLED !== 'true') return;

  const startMs = Date.now();
  const bindings = await selectDueLapsedBindings(env.DB, nowMs - LAPSE_RETENTION_MS);
  let bindingsSwept = 0;
  let objectsDeleted = 0;
  let multipartAborted = 0;

  for (let i = 0; i < bindings.length; i++) {
    const binding = bindings[i];
    try {
      const accountId = binding.account_id;
      const instanceId = binding.instance_id;
      const prefix = prefixFor(accountId, instanceId);
      const cred = await mintScopedCredential(env, {
        prefix,
        scope: 'maintenance',
        nowSeconds: Math.floor(nowMs / 1000),
      });
      if (!cred) throw namedError('SpbSweepCredentialError', 'maintenance credential mint failed');

      const bindingObjectsDeleted = await drainObjects(env, cred, prefix, nowMs);
      const bindingMultipartAborted = await drainMultipartUploads(env, cred, prefix, nowMs);

      await insertSpbSweepAudit(env.DB, {
        accountId,
        instanceId,
        prefix,
        objectsDeleted: bindingObjectsDeleted,
        multipartAborted: bindingMultipartAborted,
        ts: nowMs,
      });
      await deleteSpbBinding(env.DB, { accountId, instanceId });

      bindingsSwept += 1;
      objectsDeleted += bindingObjectsDeleted;
      multipartAborted += bindingMultipartAborted;
    } catch (err) {
      console.error(JSON.stringify({
        event: 'spb_lapse_sweep_failed',
        binding_index: i,
        error_type: err?.name || 'Error',
      }));
    }
  }

  console.warn(JSON.stringify({
    event: 'spb_lapse_sweep',
    bindings_swept: bindingsSwept,
    objects_deleted: objectsDeleted,
    multipart_aborted: multipartAborted,
    duration_ms: Date.now() - startMs,
    ts: Date.now(),
  }));
  emitSecurityEvent(env, ctx, {
    type: 'spb_lapse_sweep',
    tier: 'T4',
    bindings_swept: bindingsSwept,
    objects_deleted: objectsDeleted,
    multipart_aborted: multipartAborted,
  });
}

export async function drainObjects(env, cred, prefix, nowMs) {
  let totalDeleted = 0;

  for (;;) {
    let continuationToken = null;
    let listedCount = 0;

    do {
      const page = await listObjectsV2(env, cred, { prefix, continuationToken, nowMs });
      listedCount += page.keys.length;
      for (const batch of chunks(page.keys, DELETE_BATCH_SIZE)) {
        const result = await deleteObjects(env, cred, { keys: batch, nowMs });
        if (result.errors.length > 0) throw namedError('S3DeleteObjectsError', 'delete objects returned errors');
        totalDeleted += result.deleted.length;
      }
      if (page.isTruncated && !page.nextContinuationToken) {
        throw namedError('S3ListObjectsError', 'truncated list missing continuation token');
      }
      continuationToken = page.isTruncated ? page.nextContinuationToken : null;
    } while (continuationToken);

    if (listedCount === 0) return totalDeleted;
  }
}

export async function drainMultipartUploads(env, cred, prefix, nowMs) {
  let totalAborted = 0;

  for (;;) {
    let keyMarker = null;
    let uploadIdMarker = null;
    let listedCount = 0;

    do {
      const page = await listMultipartUploads(env, cred, {
        prefix,
        keyMarker,
        uploadIdMarker,
        nowMs,
      });
      listedCount += page.uploads.length;
      for (const upload of page.uploads) {
        await abortMultipartUpload(env, cred, { key: upload.key, uploadId: upload.uploadId, nowMs });
        totalAborted += 1;
      }
      if (page.isTruncated && (!page.nextKeyMarker || !page.nextUploadIdMarker)) {
        throw namedError('S3ListMultipartUploadsError', 'truncated multipart list missing markers');
      }
      keyMarker = page.isTruncated ? page.nextKeyMarker : null;
      uploadIdMarker = page.isTruncated ? page.nextUploadIdMarker : null;
    } while (keyMarker && uploadIdMarker);

    if (listedCount === 0) return totalAborted;
  }
}

function chunks(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

function namedError(name, message) {
  const error = new Error(message);
  error.name = name;
  return error;
}
