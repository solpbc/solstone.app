import { decryptEmail, generateSessionToken, scopedHmac, timingSafeEqual } from './crypto.js';

const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export async function advanceDeletionServiceOperation(env, { deletion, service, nowMs = Date.now() }) {
  if (!await leaseIsLive(env.DB, deletion)) return 'retryable';
  let op = await latestServiceOperation(env.DB, deletion.operation_id, service);
  const snapshot = await serviceSnapshot(env, deletion.snapshot_encrypted, service);
  const associationDigest = await digest(env, snapshot, service);
  if (!op || (op.state === 'retryable' && op.envelope_expires_at <= nowMs)) {
    op = await createOperation(env, deletion, service, snapshot, associationDigest, nowMs);
    if (!op) return 'retryable';
  }
  if (op.request_digest !== associationDigest) return 'non_complete_refusal';
  if (op.state === 'complete' || op.state === 'non_complete_refusal') return op.state;
  if (op.envelope_expires_at <= nowMs) return 'retryable';

  const envelope = await envelopeFor(env, deletion.operation_id, op, snapshot, nowMs);
  if (!await leaseIsLive(env.DB, deletion)) return 'retryable';
  const delivery = await callService(env, service, '/internal/deletion/purge', envelope);
  if (!delivery || !await validResponse(env, service, delivery, envelope, associationDigest)) {
    await setState(env, deletion, op.id, 'retryable', nowMs);
    return 'retryable';
  }
  if (delivery.state === 'retryable') {
    await setState(env, deletion, op.id, 'retryable', nowMs);
    return 'retryable';
  }
  if (delivery.state !== 'complete') {
    return await setState(env, deletion, op.id, 'non_complete_refusal', nowMs)
      ? 'non_complete_refusal'
      : 'retryable';
  }
  if (!await setState(env, deletion, op.id, 'delivered', nowMs)) return 'retryable';
  if (!await leaseIsLive(env.DB, deletion)) return 'retryable';
  const confirmation = await callService(env, service, '/internal/deletion/purge/confirm', envelope);
  if (!confirmation || !await validResponse(env, service, confirmation, envelope, associationDigest)) {
    await setState(env, deletion, op.id, 'retryable', nowMs);
    return 'retryable';
  }
  if (confirmation.state === 'complete') {
    return await setState(env, deletion, op.id, 'complete', nowMs, confirmation.receipt || null)
      ? 'complete'
      : 'retryable';
  }
  await setState(env, deletion, op.id, 'retryable', nowMs);
  return 'retryable';
}

export async function remintExpiredDeletionServiceOperation(env, { deletion, service, nowMs = Date.now() }) {
  if (!await leaseIsLive(env.DB, deletion)) return null;
  const op = await latestServiceOperation(env.DB, deletion.operation_id, service);
  if (!op || op.state === 'complete' || op.envelope_expires_at == null || op.envelope_expires_at > nowMs) return null;
  const snapshot = await serviceSnapshot(env, deletion.snapshot_encrypted, service);
  const associationDigest = await digest(env, snapshot, service);
  if (op.request_digest !== associationDigest) return null;
  return createOperation(env, deletion, service, snapshot, associationDigest, nowMs);
}

async function createOperation(env, deletion, service, snapshot, requestDigest, nowMs) {
  const id = generateSessionToken();
  const serviceOperationId = generateSessionToken();
  const expiresAt = nowMs + EXPIRY_MS;
  const result = await env.DB.prepare(
    `INSERT INTO account_deletion_service_ops (
       id, operation_id, service, service_operation_id, request_digest, state,
       envelope_expires_at, next_attempt_at, attempt_count
     )
     SELECT ?, ?, ?, ?, ?, 'pending', ?, ?, 0
     WHERE EXISTS (
       SELECT 1 FROM account_deletions
       WHERE operation_id = ? AND lease_token = ? AND phase = 'purging'
     )`
  ).bind(
    id,
    deletion.operation_id,
    service,
    serviceOperationId,
    requestDigest,
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

async function envelopeFor(env, deletionOperationId, op, snapshot, nowMs) {
  const value = {
    version: 1,
    deletion_operation_id: deletionOperationId,
    service_operation_id: op.service_operation_id,
    service: op.service,
    association_snapshot: snapshot,
    request_digest: op.request_digest,
    issued_at: nowMs,
    expires_at: op.envelope_expires_at,
  };
  return { ...value, hmac: await sign(env, op.service, canonical(value)) };
}

async function validResponse(env, service, body, envelope, associationDigest) {
  if (!body || typeof body !== 'object') return false;
  if (body.deletion_operation_id !== envelope.deletion_operation_id
    || body.service_operation_id !== envelope.service_operation_id
    || body.request_digest !== envelope.request_digest
    || body.association_digest !== associationDigest
    || typeof body.hmac !== 'string') return false;
  const unsigned = { ...body };
  delete unsigned.hmac;
  return timingSafeEqual(body.hmac, await sign(env, service, canonical(unsigned)));
}

async function callService(env, service, path, envelope) {
  const binding = service === 'relay' ? env.RELAY : env.SUPPORT_WORKER;
  if (!binding) return null;
  try {
    const response = await binding.fetch(`https://${service}.internal${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(envelope),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function setState(env, deletion, id, state, nowMs, receipt = null) {
  const result = await env.DB.prepare(
    `UPDATE account_deletion_service_ops
     SET state = ?, attempt_count = attempt_count + 1, next_attempt_at = ?, confirmation_receipt_digest = ?
     WHERE id = ?
       AND EXISTS (
         SELECT 1 FROM account_deletions
         WHERE operation_id = ? AND lease_token = ? AND phase = 'purging'
       )`
  ).bind(state, nowMs, receipt, id, deletion.operation_id, deletion.lease_token).run();
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
  const full = encrypted ? JSON.parse(await decryptEmail(encrypted, env)) : {};
  if (service === 'relay') return full.relay || { spl_instance_ids: [], spp_instance_ids: [] };
  return { support_owner_id: full.support_owner_id || null };
}

async function digest(env, value, service) {
  return scopedHmac(canonical(value), secretFor(env, service), `purge-contract-v1:${service}:digest`);
}

async function sign(env, service, value) {
  return scopedHmac(value, secretFor(env, service), `purge-contract-v1:${service}`);
}

function secretFor(env, service) {
  return service === 'relay' ? env.RELAY_GRANT_SECRET : env.SERVICES_AUTH_TOKEN;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
