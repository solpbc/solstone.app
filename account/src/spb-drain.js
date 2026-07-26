import {
  abortMultipartUpload,
  deleteObjects,
  listMultipartUploads,
  listObjectsV2,
} from './s3.js';

const DELETE_BATCH_SIZE = 1000;

export async function drainObjects(env, {
  prefix,
  getRequestAuth,
  onDeleted = () => {},
}) {
  let totalDeleted = 0;

  for (;;) {
    let continuationToken = null;
    let listedCount = 0;

    do {
      const listAuth = await getRequestAuth();
      const page = await listObjectsV2(env, listAuth.credential, {
        prefix,
        continuationToken,
        nowMs: listAuth.nowMs,
      });
      listedCount += page.keys.length;
      for (const batch of chunks(page.keys, DELETE_BATCH_SIZE)) {
        const deleteAuth = await getRequestAuth();
        const result = await deleteObjects(env, deleteAuth.credential, {
          keys: batch,
          nowMs: deleteAuth.nowMs,
        });
        if (result.errors.length > 0) {
          throw namedError('S3DeleteObjectsError', 'delete objects returned errors');
        }
        totalDeleted += result.deleted.length;
        onDeleted(result.deleted.length);
      }
      if (page.isTruncated && !page.nextContinuationToken) {
        throw namedError('S3ListObjectsError', 'truncated list missing continuation token');
      }
      continuationToken = page.isTruncated ? page.nextContinuationToken : null;
    } while (continuationToken);

    if (listedCount === 0) return totalDeleted;
  }
}

export async function drainMultipartUploads(env, {
  prefix,
  getRequestAuth,
  onAborted = () => {},
}) {
  let totalAborted = 0;

  for (;;) {
    let keyMarker = null;
    let uploadIdMarker = null;
    let listedCount = 0;

    do {
      const listAuth = await getRequestAuth();
      const page = await listMultipartUploads(env, listAuth.credential, {
        prefix,
        keyMarker,
        uploadIdMarker,
        nowMs: listAuth.nowMs,
      });
      listedCount += page.uploads.length;
      for (const upload of page.uploads) {
        const abortAuth = await getRequestAuth();
        await abortMultipartUpload(env, abortAuth.credential, {
          key: upload.key,
          uploadId: upload.uploadId,
          nowMs: abortAuth.nowMs,
        });
        totalAborted += 1;
        onAborted(1);
      }
      if (page.isTruncated && (!page.nextKeyMarker || !page.nextUploadIdMarker)) {
        throw namedError(
          'S3ListMultipartUploadsError',
          'truncated multipart list missing markers'
        );
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
