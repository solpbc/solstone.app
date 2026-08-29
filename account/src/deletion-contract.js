import {
  canonicalJson,
  decryptEmail,
  framedHmacSha256Base64Url,
  generateSessionToken,
  sha256Base64Url,
  timingSafeEqual,
} from './crypto.js';

const REQUEST_MAX_LIFETIME_MS = 604800000;
const ATTESTATION_MAX_LIFETIME_MS = 300000;
// Matches owner-purge-v1.json integrity.key_versions.current.
const CURRENT_KEY_VERSION = 2;
const PURGE_PATH = '/internal/deletion/purge';
const CONFIRM_PATH = '/internal/deletion/purge/confirm';
const RESPONSE_FIELDS = {
  version: 'number',
  key_version: 'number',
  service: 'string',
  operation_id: 'string',
  request_digest: 'string',
  disposition: 'string',
  integrity: 'string',
};

export async function advanceDeletionServiceOperation(env, { deletion, service, nowMs = Date.now() }) {
  if (!await leaseIsLive(env.DB, deletion)) return 'retryable';

  let snapshot;
  try {
    snapshot = await serviceSnapshot(env, deletion.snapshot_encrypted, service);
  } catch {
    return 'retryable';
  }
  if (!snapshot) return 'retryable';

  let op = await latestServiceOperation(env.DB, deletion.operation_id, service);
  if (op?.state === 'confirmed') return 'confirmed';
  if (!op || op.key_version == null || op.envelope_issued_at == null) {
    op = await createOperation(env, deletion, service, snapshot, nowMs);
    if (!op) return 'retryable';
  }

  if (op.envelope_expires_at == null || Number(op.envelope_expires_at) <= nowMs) return 'retryable';

  let envelope;
  try {
    const expectedDigest = await requestDigest(service, op.key_version, snapshot);
    if (op.request_digest !== expectedDigest) return 'retryable';
    envelope = await envelopeFor(env, op, snapshot);
  } catch {
    return 'retryable';
  }
  if (!envelope) return 'retryable';

  if (op.state !== 'complete') {
    if (!await leaseIsLive(env.DB, deletion)) return 'retryable';
    const rawDelivery = await callService(env, service, PURGE_PATH, { envelope });
    const delivery = await validResponse(env, service, rawDelivery, op);
    if (!delivery || delivery.disposition !== 'complete') {
      await setState(env, deletion, op.id, 'pending', nowMs);
      return 'retryable';
    }
    if (!await setState(env, deletion, op.id, 'complete', nowMs)) return 'retryable';
  }

  let attestation;
  try {
    attestation = await attestationFor(env, op, nowMs);
  } catch {
    return 'retryable';
  }
  if (!attestation || !await leaseIsLive(env.DB, deletion)) return 'retryable';

  const rawConfirmation = await callService(env, service, CONFIRM_PATH, { envelope, attestation });
  const confirmation = await validResponse(env, service, rawConfirmation, op);
  if (!confirmation || confirmation.disposition !== 'confirmed') {
    await setState(env, deletion, op.id, 'complete', nowMs);
    return 'retryable';
  }
  return await setState(env, deletion, op.id, 'confirmed', nowMs) ? 'confirmed' : 'retryable';
}

export async function remintExpiredDeletionServiceOperation(env, { deletion, service, nowMs = Date.now() }) {
  if (!await leaseIsLive(env.DB, deletion)) return null;
  const op = await latestServiceOperation(env.DB, deletion.operation_id, service);
  if (!op || op.envelope_expires_at == null || Number(op.envelope_expires_at) > nowMs) return null;

  let snapshot;
  try {
    snapshot = await serviceSnapshot(env, deletion.snapshot_encrypted, service);
  } catch {
    return null;
  }
  return snapshot ? createOperation(env, deletion, service, snapshot, nowMs) : null;
}

async function createOperation(env, deletion, service, snapshot, nowMs) {
  if (!bearerFor(env, service) || !hmacKeyFor(env, service, CURRENT_KEY_VERSION)) return null;
  let digest;
  try {
    digest = await requestDigest(service, CURRENT_KEY_VERSION, snapshot);
  } catch {
    return null;
  }
  const id = generateSessionToken();
  const serviceOperationId = generateSessionToken();
  const expiresAt = nowMs + REQUEST_MAX_LIFETIME_MS;
  const result = await env.DB.prepare(
    `INSERT INTO account_deletion_service_ops (
       id, operation_id, service, service_operation_id, request_digest,
       key_version, envelope_issued_at, state, envelope_expires_at,
       next_attempt_at, attempt_count
     )
     SELECT ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, 0
     WHERE EXISTS (
       SELECT 1 FROM account_deletions
       WHERE operation_id = ? AND lease_token = ? AND phase = 'purging'
     )`
  ).bind(
    id,
    deletion.operation_id,
    service,
    serviceOperationId,
    digest,
    CURRENT_KEY_VERSION,
    nowMs,
    expiresAt,
    nowMs,
    deletion.operation_id,
    deletion.lease_token,
  ).run();
  if (result.meta?.changes !== 1) return null;
  return env.DB.prepare('SELECT * FROM account_deletion_service_ops WHERE id = ?').bind(id).first();
}

async function latestServiceOperation(db, operationId, service) {
  return db.prepare(
    `SELECT * FROM account_deletion_service_ops WHERE operation_id = ? AND service = ? ORDER BY rowid DESC LIMIT 1`
  ).bind(operationId, service).first();
}

async function envelopeFor(env, op, snapshot) {
  const value = {
    version: 1,
    key_version: op.key_version,
    operation_id: op.service_operation_id,
    service: op.service,
    association_snapshot: snapshot,
    request_digest: op.request_digest,
    issued_at: op.envelope_issued_at,
    expires_at: op.envelope_expires_at,
  };
  const integrity = await integrityFor(env, op.service, op.key_version, 'request', value);
  return integrity ? { ...value, integrity } : null;
}

async function attestationFor(env, op, nowMs) {
  const value = {
    version: 1,
    key_version: op.key_version,
    operation_id: op.service_operation_id,
    service: op.service,
    request_digest: op.request_digest,
    state: 'complete',
    issued_at: nowMs,
    expires_at: nowMs + ATTESTATION_MAX_LIFETIME_MS,
  };
  const integrity = await integrityFor(env, op.service, op.key_version, 'confirm', value);
  return integrity ? { ...value, integrity } : null;
}

async function requestDigest(service, keyVersion, snapshot) {
  return sha256Base64Url(canonicalJson({
    version: 1,
    key_version: keyVersion,
    service,
    association_snapshot: snapshot,
  }));
}

async function validResponse(env, service, raw, op) {
  let body;
  try {
    body = parseProtocolResponse(raw);
  } catch {
    return null;
  }
  if (
    body.version !== 1
    || !Number.isInteger(body.key_version)
    || body.key_version !== op.key_version
    || body.service !== service
    || body.operation_id !== op.service_operation_id
    || body.request_digest !== op.request_digest
  ) return null;

  const unsigned = { ...body };
  delete unsigned.integrity;
  let integrity;
  try {
    integrity = await integrityFor(env, service, op.key_version, 'response', unsigned);
  } catch {
    return null;
  }
  return integrity && timingSafeEqual(body.integrity, integrity) ? body : null;
}

async function integrityFor(env, service, keyVersion, purpose, value) {
  const key = hmacKeyFor(env, service, keyVersion);
  if (!key) return null;
  return framedHmacSha256Base64Url(key, domainFor(service, purpose), canonicalJson(value));
}

async function callService(env, service, path, body) {
  const binding = service === 'relay' ? env.RELAY : env.SUPPORT_WORKER;
  const bearer = bearerFor(env, service);
  if (!binding || !bearer) return null;
  try {
    const response = await binding.fetch(`https://${service}.internal${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

async function setState(env, deletion, id, state, nowMs) {
  const result = await env.DB.prepare(
    `UPDATE account_deletion_service_ops
     SET state = ?, attempt_count = attempt_count + 1, next_attempt_at = ?
     WHERE id = ?
       AND EXISTS (
         SELECT 1 FROM account_deletions
         WHERE operation_id = ? AND lease_token = ? AND phase = 'purging'
       )`
  ).bind(state, nowMs, id, deletion.operation_id, deletion.lease_token).run();
  return result.meta?.changes === 1;
}

async function leaseIsLive(db, deletion) {
  return Boolean(await db.prepare(
    `SELECT 1
     FROM account_deletions
     WHERE operation_id = ? AND lease_token = ? AND phase = 'purging'`
  ).bind(deletion.operation_id, deletion.lease_token).first());
}

async function serviceSnapshot(env, encrypted, service) {
  const full = encrypted ? JSON.parse(await decryptEmail(encrypted, env)) : null;
  const snapshot = service === 'relay' ? full?.relay : full?.support;
  return validServiceSnapshot(snapshot, service) ? snapshot : null;
}

function validServiceSnapshot(snapshot, service) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
  if (service === 'relay') {
    return exactKeys(snapshot, ['instance_ids'])
      && Array.isArray(snapshot.instance_ids)
      && snapshot.instance_ids.every((id) => typeof id === 'string');
  }
  return exactKeys(snapshot, ['portal_principal', 'verified_emails'])
    && typeof snapshot.portal_principal === 'string'
    && Array.isArray(snapshot.verified_emails)
    && snapshot.verified_emails.every((email) => typeof email === 'string');
}

function bearerFor(env, service) {
  const bearer = service === 'relay'
    ? env.ACCOUNT_RELAY_PURGE_BEARER_TOKEN
    : env.ACCOUNT_SUPPORT_PURGE_BEARER_TOKEN;
  return typeof bearer === 'string' && bearer ? bearer : null;
}

function hmacKeyFor(env, service, keyVersion) {
  const prefix = service === 'relay' ? 'ACCOUNT_RELAY_PURGE_HMAC_KEY_V' : 'ACCOUNT_SUPPORT_PURGE_HMAC_KEY_V';
  const key = env[`${prefix}${keyVersion}`];
  return typeof key === 'string' && key ? key : null;
}

function domainFor(service, purpose) {
  return `solpbc-owner-purge-v1:${service}:${purpose}`;
}

function parseProtocolResponse(raw) {
  if (typeof raw !== 'string') throw new Error('invalid response');
  let index = skipWhitespace(raw, 0);
  if (raw[index] !== '{') throw new Error('invalid response');
  index = skipWhitespace(raw, index + 1);
  const value = {};
  while (raw[index] !== '}') {
    const key = readJsonString(raw, index);
    if (!Object.hasOwn(RESPONSE_FIELDS, key.value) || Object.hasOwn(value, key.value)) throw new Error('invalid response');
    index = skipWhitespace(raw, key.index);
    if (raw[index] !== ':') throw new Error('invalid response');
    index = skipWhitespace(raw, index + 1);
    const parsed = RESPONSE_FIELDS[key.value] === 'string'
      ? readJsonString(raw, index)
      : readJsonNumber(raw, index);
    if (typeof parsed.value !== RESPONSE_FIELDS[key.value]) throw new Error('invalid response');
    value[key.value] = parsed.value;
    index = skipWhitespace(raw, parsed.index);
    if (raw[index] === ',') {
      index = skipWhitespace(raw, index + 1);
      continue;
    }
    if (raw[index] !== '}') throw new Error('invalid response');
  }
  index = skipWhitespace(raw, index + 1);
  if (index !== raw.length || !exactKeys(value, Object.keys(RESPONSE_FIELDS))) throw new Error('invalid response');
  return value;
}

function readJsonString(text, index) {
  if (text[index] !== '"') throw new Error('invalid response');
  const start = index;
  index += 1;
  while (index < text.length) {
    const code = text.charCodeAt(index);
    if (code < 0x20) throw new Error('invalid response');
    if (text[index] === '\\') {
      index += 2;
      continue;
    }
    if (text[index] === '"') {
      const source = text.slice(start, index + 1);
      let value;
      try {
        value = JSON.parse(source);
      } catch {
        throw new Error('invalid response');
      }
      return { value, index: index + 1 };
    }
    index += 1;
  }
  throw new Error('invalid response');
}

function readJsonNumber(text, index) {
  const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(index));
  if (!match) throw new Error('invalid response');
  const value = Number(match[0]);
  if (!Number.isFinite(value)) throw new Error('invalid response');
  return { value, index: index + match[0].length };
}

function skipWhitespace(text, index) {
  while (index < text.length && /[\t\n\r ]/.test(text[index])) index += 1;
  return index;
}

function exactKeys(value, names) {
  const keys = Object.keys(value);
  return keys.length === names.length && names.every((name) => Object.hasOwn(value, name));
}
