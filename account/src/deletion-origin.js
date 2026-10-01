import { canonicalJson, framedHmacSha256Base64Url, timingSafeEqual } from './crypto.js';
import { DELETION_SERVICES, domainFor, hmacKeyFor, RETAINED_KEY_VERSIONS } from './deletion-services.js';

// The origin check. On first receipt of a purge it has never bound, a target
// asks the portal whether the portal originated that operation. The answer is
// one bit about one id the target already holds, so the question cannot list or
// enumerate anything. The frame is signed with that service's existing purge
// key under its own purpose, and it is good for five minutes either side of now.
export const ORIGIN_MAX_SKEW_MS = 300000;
const ORIGIN_FIELDS = ['version', 'key_version', 'service', 'operation_id', 'issued_at', 'integrity'];
const MAX_OPERATION_ID_LENGTH = 256;

export class OriginFrameError extends Error {
  constructor() {
    super('owner purge origin frame refused');
    this.name = 'OriginFrameError';
  }
}

export async function answerOrigin(env, frame, nowMs = Date.now()) {
  if (!frame || typeof frame !== 'object' || Array.isArray(frame)) throw new OriginFrameError();
  const keys = Object.keys(frame);
  if (keys.length !== ORIGIN_FIELDS.length || !ORIGIN_FIELDS.every((field) => Object.hasOwn(frame, field))) {
    throw new OriginFrameError();
  }
  const {
    version,
    key_version: keyVersion,
    service,
    operation_id: operationId,
    issued_at: issuedAt,
    integrity,
  } = frame;
  if (
    version !== 1
    || !RETAINED_KEY_VERSIONS.includes(keyVersion)
    || !DELETION_SERVICES.includes(service)
    || typeof operationId !== 'string'
    || operationId.length === 0
    || operationId.length > MAX_OPERATION_ID_LENGTH
    || !Number.isSafeInteger(issuedAt)
    || Math.abs(nowMs - issuedAt) > ORIGIN_MAX_SKEW_MS
    || typeof integrity !== 'string'
  ) {
    throw new OriginFrameError();
  }
  const key = hmacKeyFor(env, service, keyVersion);
  if (!key) throw new OriginFrameError();
  const expected = await framedHmacSha256Base64Url(key, domainFor(service, 'origin'), canonicalJson({
    version,
    key_version: keyVersion,
    service,
    operation_id: operationId,
    issued_at: issuedAt,
  }));
  if (!timingSafeEqual(integrity, expected)) throw new OriginFrameError();

  // The service operation row is committed before its envelope is built, so it
  // exists before any target can ask. This reads the D1 primary: the portal
  // uses no read replication or Sessions API, and this lookup must stay on the
  // primary if either is ever added.
  const row = await env.DB.prepare(
    `SELECT 1
     FROM account_deletion_service_ops AS o
     JOIN account_deletions AS d ON d.operation_id = o.operation_id
     WHERE o.service = ? AND o.service_operation_id = ? AND d.phase = 'purging'
     LIMIT 1`
  ).bind(service, operationId).first();
  return Boolean(row);
}
