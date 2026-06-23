#!/usr/bin/env node
import { mintScopedCredential } from '../src/r2-credential.js';
import {
  abortMultipartUpload,
  deleteObjects,
  listMultipartUploads,
  listObjectsV2,
  signedR2Fetch,
} from '../src/s3.js';

const REQUIRED_ENV = [
  'R2_ACCOUNT_ID',
  'R2_BUCKET',
  'R2_PARENT_ACCESS_KEY_ID',
  'R2_PARENT_SECRET_ACCESS_KEY',
];
const SPIKE_ROOT = 'users/spb-sweep-spike/';
const CONTROL_ROOT = 'users/spb-sweep-spike-control/';
const PART_SIZE_BYTES = 5 * 1024 * 1024;

const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing ${missing.join(', ')}; set vaulted R2 parent creds in env; do not paste secrets into the repo.`);
  process.exit(1);
}

const env = Object.fromEntries(REQUIRED_ENV.map((name) => [name, process.env[name]]));
const prefix = `${SPIKE_ROOT}${crypto.randomUUID()}/`;
const controlPrefix = `${CONTROL_ROOT}${crypto.randomUUID()}/`;
assertSpikePrefix(prefix);
assertSpikePrefix(controlPrefix);

let testCred = null;
let controlCred = null;
let exitCode = 0;

try {
  console.log('spb sweep spike: minting scoped maintenance credentials');
  testCred = await mintScopedCredential(env, { prefix, scope: 'maintenance' });
  controlCred = await mintScopedCredential(env, { prefix: controlPrefix, scope: 'maintenance' });
  if (!testCred || !controlCred) throw new Error('failed to mint maintenance-scoped credentials');

  const testKeys = [`${prefix}obj-1`, `${prefix}obj-2`];
  const controlKey = `${controlPrefix}control-obj`;
  const multipartKeys = [
    `${prefix}incomplete-multipart-1`,
    `${prefix}incomplete-multipart-2`,
  ];

  console.log('spb sweep spike: seeding objects and incomplete multipart uploads');
  await putObject(env, testCred, testKeys[0], 'spb sweep spike object 1\n');
  await putObject(env, testCred, testKeys[1], 'spb sweep spike object 2\n');
  await putObject(env, controlCred, controlKey, 'spb sweep spike control object\n');
  for (const [index, multipartKey] of multipartKeys.entries()) {
    const uploadId = await createMultipartUpload(env, testCred, multipartKey);
    await uploadPart(env, testCred, multipartKey, uploadId, 1, String(index + 1).repeat(PART_SIZE_BYTES));
  }
  console.log('spb sweep spike: seeded 3 objects and 2 incomplete multipart uploads');

  console.log('spb sweep spike: validating cursor signing');
  await validateCursorSigning(env, testCred, prefix);
  console.log('cursor signing OK (continuation-token + multipart markers accepted)');

  console.log('spb sweep spike: running sweep ops against test prefix');
  const objectsDeleted = await drainObjects(env, testCred, prefix);
  const multipartAborted = await drainMultipartUploads(env, testCred, prefix);

  console.log('spb sweep spike: verifying test prefix drained and control prefix untouched');
  const remainingTestObjects = await listAllObjectKeys(env, testCred, prefix);
  assertEqual(remainingTestObjects.length, 0, 'test prefix still has objects');
  const remainingTestUploads = await listAllUploads(env, testCred, prefix);
  assertEqual(remainingTestUploads.length, 0, 'test prefix still has multipart uploads');
  const remainingControlObjects = await listAllObjectKeys(env, controlCred, controlPrefix);
  if (!remainingControlObjects.includes(controlKey)) {
    throw new Error('control object was not present after test-prefix sweep');
  }

  console.log(`SPIKE PASS objectsDeleted=${objectsDeleted} multipartAborted=${multipartAborted}`);
} catch (error) {
  exitCode = 1;
  console.error(`SPIKE FAIL: ${error?.message || 'unknown failure'}`);
} finally {
  console.log('spb sweep spike: cleanup starting');
  await cleanupPrefix(env, testCred, prefix);
  await cleanupPrefix(env, controlCred, controlPrefix);
  console.log('spb sweep spike: cleanup finished');
}

process.exitCode = exitCode;

async function putObject(env, cred, key, body) {
  assertSpikeKey(key);
  const response = await signedR2Fetch(env, cred, { method: 'PUT', key, body });
  await expectOk(response, 'PutObject');
}

async function createMultipartUpload(env, cred, key) {
  assertSpikeKey(key);
  const response = await signedR2Fetch(env, cred, {
    method: 'POST',
    key,
    query: { uploads: '' },
  });
  const xml = await response.text();
  await expectOk(response, 'CreateMultipartUpload');
  const uploadId = tagText(xml, 'UploadId');
  if (!uploadId) throw new Error('CreateMultipartUpload returned no UploadId');
  return uploadId;
}

async function uploadPart(env, cred, key, uploadId, partNumber, body) {
  assertSpikeKey(key);
  const response = await signedR2Fetch(env, cred, {
    method: 'PUT',
    key,
    query: { partNumber: String(partNumber), uploadId },
    body,
  });
  await expectOk(response, 'UploadPart');
}

async function validateCursorSigning(env, cred, prefix) {
  assertSpikePrefix(prefix);
  const continuationToken = await firstPageContinuationToken(env, cred, prefix);
  const objectPage = await listObjectsV2(env, cred, { prefix, continuationToken });
  const remainingKeys = objectPage.keys.filter(isSpikeKey);
  if (remainingKeys.length === 0) {
    throw new Error('continuation-token cursor validation failed: production ListObjectsV2 returned no remaining object');
  }

  const { keyMarker, uploadIdMarker } = await firstPageMultipartMarkers(env, cred, prefix);
  const uploadPage = await listMultipartUploads(env, cred, { prefix, keyMarker, uploadIdMarker });
  const remainingUploads = uploadPage.uploads.filter((upload) => isSpikeKey(upload.key));
  if (remainingUploads.length === 0) {
    throw new Error('multipart-marker cursor validation failed: production ListMultipartUploads returned no remaining upload');
  }
}

async function firstPageContinuationToken(env, cred, prefix) {
  assertSpikePrefix(prefix);
  const response = await signedR2Fetch(env, cred, {
    method: 'GET',
    query: { 'list-type': '2', prefix, 'max-keys': '1' },
  });
  const xml = await response.text();
  await expectOk(response, 'ListObjectsV2 max-keys cursor probe');
  if (tagText(xml, 'IsTruncated') !== 'true') {
    throw new Error('continuation-token cursor validation failed: raw ListObjectsV2 was not truncated');
  }
  const token = tagText(xml, 'NextContinuationToken');
  if (!token) {
    throw new Error('continuation-token cursor validation failed: raw ListObjectsV2 returned no NextContinuationToken');
  }
  return token;
}

async function firstPageMultipartMarkers(env, cred, prefix) {
  assertSpikePrefix(prefix);
  const response = await signedR2Fetch(env, cred, {
    method: 'GET',
    query: { uploads: '', prefix, 'max-uploads': '1' },
  });
  const xml = await response.text();
  await expectOk(response, 'ListMultipartUploads max-uploads cursor probe');
  if (tagText(xml, 'IsTruncated') !== 'true') {
    throw new Error('multipart-marker cursor validation failed: raw ListMultipartUploads was not truncated');
  }
  const keyMarker = tagText(xml, 'NextKeyMarker');
  const uploadIdMarker = tagText(xml, 'NextUploadIdMarker');
  if (!keyMarker || !uploadIdMarker) {
    throw new Error('multipart-marker cursor validation failed: raw ListMultipartUploads returned incomplete markers');
  }
  return { keyMarker, uploadIdMarker };
}

async function drainObjects(env, cred, prefix) {
  assertSpikePrefix(prefix);
  let total = 0;
  for (;;) {
    const keys = await listAllObjectKeys(env, cred, prefix);
    if (keys.length === 0) return total;
    for (const batch of chunks(keys, 1000)) {
      const result = await deleteObjects(env, cred, { keys: batch });
      if (result.errors.length > 0) throw new Error(`DeleteObjects returned ${result.errors.length} errors`);
      total += result.deleted.length;
    }
  }
}

async function drainMultipartUploads(env, cred, prefix) {
  assertSpikePrefix(prefix);
  let total = 0;
  for (;;) {
    const uploads = await listAllUploads(env, cred, prefix);
    if (uploads.length === 0) return total;
    for (const upload of uploads) {
      assertSpikeKey(upload.key);
      await abortMultipartUpload(env, cred, upload);
      total += 1;
    }
  }
}

async function cleanupPrefix(env, cred, prefix) {
  if (!cred || !prefix) return;
  await bestEffort(`abort leftovers under ${rootLabel(prefix)}`, async () => {
    const uploads = await listAllUploads(env, cred, prefix);
    for (const upload of uploads) {
      if (isSpikeKey(upload.key)) await abortMultipartUpload(env, cred, upload);
    }
  });
  await bestEffort(`delete leftovers under ${rootLabel(prefix)}`, async () => {
    const keys = (await listAllObjectKeys(env, cred, prefix)).filter(isSpikeKey);
    for (const batch of chunks(keys, 1000)) {
      const result = await deleteObjects(env, cred, { keys: batch });
      if (result.errors.length > 0) throw new Error(`DeleteObjects returned ${result.errors.length} errors`);
    }
  });
}

async function listAllObjectKeys(env, cred, prefix) {
  assertSpikePrefix(prefix);
  const keys = [];
  let continuationToken = null;
  do {
    const page = await listObjectsV2(env, cred, { prefix, continuationToken });
    keys.push(...page.keys.filter(isSpikeKey));
    continuationToken = page.isTruncated ? page.nextContinuationToken : null;
    if (page.isTruncated && !continuationToken) throw new Error('ListObjectsV2 truncated without continuation token');
  } while (continuationToken);
  return keys;
}

async function listAllUploads(env, cred, prefix) {
  assertSpikePrefix(prefix);
  const uploads = [];
  let keyMarker = null;
  let uploadIdMarker = null;
  do {
    const page = await listMultipartUploads(env, cred, { prefix, keyMarker, uploadIdMarker });
    uploads.push(...page.uploads.filter((upload) => isSpikeKey(upload.key)));
    keyMarker = page.isTruncated ? page.nextKeyMarker : null;
    uploadIdMarker = page.isTruncated ? page.nextUploadIdMarker : null;
    if (page.isTruncated && (!keyMarker || !uploadIdMarker)) {
      throw new Error('ListMultipartUploads truncated without both next markers');
    }
  } while (keyMarker && uploadIdMarker);
  return uploads;
}

async function expectOk(response, label) {
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}`);
}

async function bestEffort(label, fn) {
  try {
    await fn();
  } catch (error) {
    console.warn(`cleanup warning (${label}): ${error?.message || 'unknown failure'}`);
  }
}

function assertSpikePrefix(value) {
  if (!String(value).startsWith('users/spb-sweep-spike')) {
    throw new Error('refusing to operate outside the SPB sweep spike roots');
  }
}

function assertSpikeKey(key) {
  if (!isSpikeKey(key)) throw new Error('refusing to operate on a non-spike key');
}

function isSpikeKey(key) {
  return String(key).startsWith(SPIKE_ROOT) || String(key).startsWith(CONTROL_ROOT);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

function rootLabel(prefix) {
  return prefix.startsWith(CONTROL_ROOT) ? CONTROL_ROOT : SPIKE_ROOT;
}

function tagText(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`));
  return match ? xmlDecode(match[1]) : null;
}

function xmlDecode(value) {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function chunks(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}
