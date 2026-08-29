import { decryptEmail, generateSessionToken, scopedHmac, timingSafeEqual } from './crypto.js';

const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export async function advanceDeletionServiceOperation(env, { deletion, service, nowMs = Date.now() }) {
  let op = await env.DB.prepare(
    `SELECT * FROM account_deletion_service_ops WHERE operation_id = ? AND service = ? ORDER BY rowid DESC LIMIT 1`
  ).bind(deletion.operation_id, service).first();
  const snapshot = await serviceSnapshot(env, deletion.snapshot_encrypted, service);
  const associationDigest = await digest(env, snapshot, service);
  if (!op || (op.state === 'retryable' && op.envelope_expires_at <= nowMs)) {
    op = await createOperation(env, deletion.operation_id, service, snapshot, associationDigest, nowMs);
  }
  if (op.request_digest !== associationDigest) return 'non_complete_refusal';
  if (op.state === 'complete' || op.state === 'confirmed_absent' || op.state === 'non_complete_refusal') return op.state;
  if (op.envelope_expires_at <= nowMs) return 'retryable';

  const envelope = await envelopeFor(env, deletion.operation_id, op, snapshot, nowMs);
  const delivery = await callService(env, service, '/internal/deletion/purge', envelope);
  if (!delivery || !await validResponse(env, service, delivery, envelope, associationDigest)) {
    await setState(env, op.id, 'retryable', nowMs);
    return 'retryable';
  }
  if (delivery.state === 'retryable') {
    await setState(env, op.id, 'retryable', nowMs);
    return 'retryable';
  }
  if (delivery.state !== 'complete') {
    await setState(env, op.id, 'non_complete_refusal', nowMs);
    return 'non_complete_refusal';
  }
  await setState(env, op.id, 'delivered', nowMs);
  const confirmation = await callService(env, service, '/internal/deletion/purge/confirm', envelope);
  if (!confirmation || !await validResponse(env, service, confirmation, envelope, associationDigest)) {
    await setState(env, op.id, 'retryable', nowMs);
    return 'retryable';
  }
  if (confirmation.state === 'complete') {
    await setState(env, op.id, 'complete', nowMs, confirmation.receipt || null);
    return 'complete';
  }
  if (confirmation.state === 'absent' && confirmation.no_matching_association === true && nowMs < op.envelope_expires_at) {
    await setState(env, op.id, 'confirmed_absent', nowMs, confirmation.receipt || null);
    return 'confirmed_absent';
  }
  await setState(env, op.id, 'retryable', nowMs);
  return 'retryable';
}

async function createOperation(env, deletionOperationId, service, snapshot, requestDigest, nowMs) {
  const id = generateSessionToken();
  const serviceOperationId = generateSessionToken();
  const expiresAt = nowMs + EXPIRY_MS;
  await env.DB.prepare(
    `INSERT INTO account_deletion_service_ops (
       id, operation_id, service, service_operation_id, request_digest, state,
       envelope_expires_at, next_attempt_at, attempt_count
     ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, 0)`
  ).bind(id, deletionOperationId, service, serviceOperationId, requestDigest, expiresAt, nowMs).run();
  return env.DB.prepare('SELECT * FROM account_deletion_service_ops WHERE id = ?').bind(id).first();
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

async function setState(env, id, state, nowMs, receipt = null) {
  await env.DB.prepare(
    `UPDATE account_deletion_service_ops
     SET state = ?, attempt_count = attempt_count + 1, next_attempt_at = ?, confirmation_receipt_digest = ?
     WHERE id = ?`
  ).bind(state, nowMs, receipt, id).run();
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
