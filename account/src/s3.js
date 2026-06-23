export const EMPTY_SHA256_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
export const R2_SIGV4_REGION = 'auto';
export const R2_SIGV4_SERVICE = 's3';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_DELETE_OBJECTS = 1000;

// Unit tests validate request shape; Jer's live R2 spike validates real signature acceptance.
export async function signedR2Fetch(env, cred, {
  method,
  key = '',
  query = {},
  body = null,
  nowMs = Date.now(),
}) {
  const upperMethod = method.toUpperCase();
  const bucket = cred.bucket || env.R2_BUCKET;
  const host = cred.host || `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${uriEncode(bucket, false)}${key ? `/${uriEncode(key, false)}` : ''}`;
  const canonicalQuery = canonicalQueryString(query);
  const bodyText = body == null ? null : String(body);
  const bodyBytes = bodyText == null ? new Uint8Array() : encoder.encode(bodyText);
  const payloadHash = bodyText == null ? EMPTY_SHA256_HASH : await sha256HexBytes(bodyBytes);
  const { amzDate, dateStamp } = amzDates(nowMs);
  const scope = `${dateStamp}/${R2_SIGV4_REGION}/${R2_SIGV4_SERVICE}/aws4_request`;

  const signedHeaderValues = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    'x-amz-security-token': cred.sessionToken,
  };
  if (bodyText != null) signedHeaderValues['content-type'] = 'application/xml';

  const headerNames = Object.keys(signedHeaderValues).sort();
  const canonicalHeaders = headerNames
    .map((name) => `${name}:${canonicalHeaderValue(signedHeaderValues[name])}\n`)
    .join('');
  const signedHeaders = headerNames.join(';');
  const canonicalRequest = [
    upperMethod,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join('\n');
  const signature = await sigV4Signature(cred.secretAccessKey, dateStamp, stringToSign);
  const authorization = `AWS4-HMAC-SHA256 Credential=${cred.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers = {
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    'x-amz-security-token': cred.sessionToken,
    Authorization: authorization,
  };
  if (bodyText != null) headers['Content-Type'] = 'application/xml';

  const url = `https://${host}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ''}`;
  return fetch(url, {
    method: upperMethod,
    headers,
    body: bodyText,
  });
}

export async function listObjectsV2(env, cred, { prefix, continuationToken = null, nowMs = Date.now() }) {
  const query = { 'list-type': '2', prefix };
  if (continuationToken) query['continuation-token'] = continuationToken;
  const response = await signedR2Fetch(env, cred, { method: 'GET', query, nowMs });
  const xml = await response.text();
  if (!response.ok) throw s3Error('S3ListObjectsError', response.status);
  return {
    keys: blockTexts(xml, 'Contents', 'Key'),
    isTruncated: tagText(xml, 'IsTruncated') === 'true',
    nextContinuationToken: tagText(xml, 'NextContinuationToken'),
  };
}

export async function deleteObjects(env, cred, { keys, nowMs = Date.now() }) {
  if (keys.length > MAX_DELETE_OBJECTS) throw new Error('DeleteObjects supports at most 1000 keys');
  if (keys.length === 0) return { deleted: [], errors: [] };
  const body = `<?xml version="1.0" encoding="UTF-8"?><Delete>${keys
    .map((key) => `<Object><Key>${xmlEscape(key)}</Key></Object>`)
    .join('')}</Delete>`;
  const response = await signedR2Fetch(env, cred, {
    method: 'POST',
    query: { delete: '' },
    body,
    nowMs,
  });
  const xml = await response.text();
  if (!response.ok) throw s3Error('S3DeleteObjectsError', response.status);
  const deleted = blockTexts(xml, 'Deleted', 'Key');
  const errors = blocks(xml, 'Error').map((block) => ({
    key: tagText(block, 'Key'),
    code: tagText(block, 'Code'),
    message: tagText(block, 'Message'),
  }));
  return { deleted, errors };
}

export async function listMultipartUploads(env, cred, {
  prefix,
  keyMarker = null,
  uploadIdMarker = null,
  nowMs = Date.now(),
}) {
  const query = { uploads: '', prefix };
  if (keyMarker) query['key-marker'] = keyMarker;
  if (uploadIdMarker) query['upload-id-marker'] = uploadIdMarker;
  const response = await signedR2Fetch(env, cred, { method: 'GET', query, nowMs });
  const xml = await response.text();
  if (!response.ok) throw s3Error('S3ListMultipartUploadsError', response.status);
  return {
    uploads: blocks(xml, 'Upload').map((block) => ({
      key: tagText(block, 'Key'),
      uploadId: tagText(block, 'UploadId'),
    })).filter((upload) => upload.key && upload.uploadId),
    isTruncated: tagText(xml, 'IsTruncated') === 'true',
    nextKeyMarker: tagText(xml, 'NextKeyMarker'),
    nextUploadIdMarker: tagText(xml, 'NextUploadIdMarker'),
  };
}

export async function abortMultipartUpload(env, cred, { key, uploadId, nowMs = Date.now() }) {
  const response = await signedR2Fetch(env, cred, {
    method: 'DELETE',
    key,
    query: { uploadId },
    nowMs,
  });
  if (response.status !== 204) throw s3Error('S3AbortMultipartUploadError', response.status);
}

export function uriEncode(value, encodeSlash = true) {
  let out = '';
  for (const byte of encoder.encode(String(value))) {
    if (
      (byte >= 0x41 && byte <= 0x5a) ||
      (byte >= 0x61 && byte <= 0x7a) ||
      (byte >= 0x30 && byte <= 0x39) ||
      byte === 0x2d ||
      byte === 0x5f ||
      byte === 0x2e ||
      byte === 0x7e
    ) {
      out += String.fromCharCode(byte);
    } else if (byte === 0x2f && !encodeSlash) {
      out += '/';
    } else {
      out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    }
  }
  return out;
}

function canonicalQueryString(query) {
  return Object.entries(query)
    .filter(([, value]) => value != null)
    .map(([key, value]) => [uriEncode(key, true), uriEncode(value, true)])
    .sort(([keyA, valueA], [keyB, valueB]) => {
      if (keyA !== keyB) return keyA < keyB ? -1 : 1;
      if (valueA === valueB) return 0;
      return valueA < valueB ? -1 : 1;
    })
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function canonicalHeaderValue(value) {
  return String(value).trim().replace(/\s+/g, ' ');
}

function amzDates(nowMs) {
  const iso = new Date(nowMs).toISOString();
  const dateStamp = iso.slice(0, 10).replace(/-/g, '');
  const amzDate = `${dateStamp}T${iso.slice(11, 19).replace(/:/g, '')}Z`;
  return { amzDate, dateStamp };
}

async function sigV4Signature(secretAccessKey, dateStamp, stringToSign) {
  const kDate = await hmacSha256(encoder.encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion = await hmacSha256(kDate, R2_SIGV4_REGION);
  const kService = await hmacSha256(kRegion, R2_SIGV4_SERVICE);
  const kSigning = await hmacSha256(kService, 'aws4_request');
  const signature = await hmacSha256(kSigning, stringToSign);
  return hex(signature);
}

async function hmacSha256(keyBytes, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

async function sha256Hex(value) {
  return sha256HexBytes(encoder.encode(value));
}

async function sha256HexBytes(bytes) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function blocks(xml, tag) {
  return Array.from(xml.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g')), (match) => match[1]);
}

function blockTexts(xml, blockTag, tag) {
  return blocks(xml, blockTag).map((block) => tagText(block, tag)).filter(Boolean);
}

function tagText(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`));
  return match ? xmlDecode(match[1]) : null;
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlDecode(value) {
  return decoder.decode(encoder.encode(value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hexValue) => String.fromCodePoint(Number.parseInt(hexValue, 16)))
    .replace(/&#([0-9]+);/g, (_, decimalValue) => String.fromCodePoint(Number.parseInt(decimalValue, 10)))
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')));
}

function s3Error(name, status) {
  const error = new Error(`R2 S3 request failed: ${status}`);
  error.name = name;
  return error;
}
