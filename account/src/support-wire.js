/**
 * Support binding wire contract. Keep all response parsing and outcome classification
 * in this module so an envelope mismatch is fixed in one place.
 *
 * | Method/path | Request | Successful response |
 * | --- | --- | --- |
 * | GET /api/services/tickets | owner id; optional verified email for legacy discovery/claim | existing bare/enveloped active list |
 * | POST /api/services/tickets | owner id + verified email + idempotency key; { product, subject, description } | 201 { id, created_at, status } |
 * | GET /api/services/tickets/{id} | owner id first; verified email only while discovering an unclaimed active row | active detail, exact tombstone, or close_in_progress |
 * | POST /api/services/tickets/{id}/messages | owner id + idempotency key; { content } | 201 { ticket_id, message_id, created_at, status: "accepted" } |
 * | POST /api/services/tickets/{id}/attachments | owner id + idempotency key; multipart files | 201 { ticket_id, attachment_ids, status: "accepted" } |
 * | POST /api/services/tickets/{id}/close | owner id + idempotency key | 200 exact tombstone |
 * | POST /api/services/tickets/{id}/resolution | owner id + idempotency key; { outcome: "solved" \| "still_need_help" } | solved: tombstone; still_needed: 200 { id, status, close_scheduled_at: null } |
 * | GET /api/services/tickets/closed?cursor=... | owner id only | { tickets: [five-field tombstones], next_cursor } |
 * | POST /api/services/idempotency/ack | owner id + original idempotency key; { mutation } | 204 after terminal result, repeated acknowledgement, or same-principal retired/erased marker |
 *
 * An exact tombstone has id, created_at, closed_at, status: "closed", and
 * content_removed: true.
 *
 * Cursor ids are canonical decimal without a leading zero. Active and tombstone row
 * ids instead follow the permissive route regex because they address /support/{id};
 * the portal forwards server-supplied cursors opaquely and never builds one from a row.
 *
 * Outcome classifications are confirmed success (200/201), operation_in_progress,
 * idempotency_conflict, invalid_idempotency_key, invalid_state, not-owned/not-found,
 * operation_erased, operation_retired, close_in_progress, tombstone, and ambiguous
 * thrown/5xx/malformed/lost responses.
 *
 * X-Services-Auth is always sent. X-Services-Owner-ID is always sent. X-Verified-Email
 * is sent only for create and legacy discovery/claim. Idempotency-Key is sent on every
 * mutation and acknowledgement.
 */

import { base64UrlDecode, base64UrlEncode } from './crypto.js';
import { SUPPORT_ID_REGEX } from './support-constants.js';

const SUPPORT_ORIGIN = 'https://support.internal';
const ACTIVE_STATUSES = new Set(['open', 'in-progress', 'waiting', 'proposed', 'resolved']);
const ATTACHMENT_STATUSES = new Set(['pending', 'removed']);
const MUTATION_KINDS = new Set([
  'ticket.create',
  'ticket.message',
  'ticket.attachments',
  'ticket.resolution',
  'ticket.close',
]);
const CURSOR_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CANONICAL_DECIMAL = /^(?:0|[1-9][0-9]*)$/;
const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();

export async function callSupport(env, {
  method,
  path,
  ownerId,
  verifiedEmail,
  idempotencyKey,
  json = null,
  formData = null,
}) {
  if (!env.SUPPORT_WORKER || !env.SERVICES_AUTH_TOKEN) return ambiguous('binding_unavailable');
  const headers = new Headers({
    'X-Services-Auth': env.SERVICES_AUTH_TOKEN,
    'X-Services-Owner-ID': ownerId,
  });
  if (typeof verifiedEmail === 'string') headers.set('X-Verified-Email', verifiedEmail);
  if (method === 'POST' && typeof idempotencyKey === 'string') headers.set('Idempotency-Key', idempotencyKey);
  let body;
  if (json != null) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(json);
  } else if (formData != null) {
    body = formData;
  }
  try {
    const response = await env.SUPPORT_WORKER.fetch(new Request(`${SUPPORT_ORIGIN}${path}`, {
      method,
      headers,
      body,
    }));
    return classifySupportResponse(response, {
      method,
      path: new URL(`${SUPPORT_ORIGIN}${path}`).pathname,
    });
  } catch {
    return ambiguous('transport');
  }
}

async function classifySupportResponse(response, { method, path }) {
  const mutation = method === 'POST' && path !== '/api/services/idempotency/ack';
  const retryAfter = response.headers.get('Retry-After');
  if (response.status === 404) return result('notFound');

  if (response.status === 200 || response.status === 201) {
    if (mutation && !hasReplaySignal(response)) return ambiguous('malformed_success');
    const body = await readJson(response);
    if (!body.ok) return ambiguous('malformed_success');
    if (!mutation) {
      const parsed = parseReadResponse(path, body.value);
      return parsed.ok ? result('success', { data: parsed.value }) : ambiguous('malformed_success');
    }
    const tombstone = parseTombstone(body.value);
    if (tombstone.ok) return result('tombstone', { data: tombstone.value, acknowledgeable: true });
    const descriptor = parseMutationDescriptor(path, body.value);
    if (!descriptor.ok) return ambiguous('malformed_success');
    return result('success', { data: descriptor.value, acknowledgeable: true });
  }

  const body = await readJson(response);
  const error = body.ok && isObject(body.value) && typeof body.value.error === 'string'
    ? body.value.error
    : null;
  if (response.status === 409 && error === 'operation_in_progress' && retryAfter) {
    return result('operationInProgress', { retryAfter });
  }
  if (response.status === 409 && error === 'idempotency_conflict') return result('idempotencyConflict');
  if (response.status === 400 && error === 'invalid_idempotency_key') return result('invalidIdempotencyKey');
  if (response.status === 409 && error === 'invalid_state') {
    return result('invalidState', { acknowledgeable: mutation && hasReplaySignal(response) });
  }
  if (response.status === 410 && error === 'operation_erased') return result('operationErased');
  if (response.status === 410 && error === 'operation_retired') return result('operationRetired');
  if (response.status === 409 && error === 'close_in_progress' && retryAfter) {
    return result('closeInProgress', { retryAfter });
  }
  return ambiguous('unrecognized_response');
}

export async function acknowledgeSupport(env, { ownerId, idempotencyKey, mutation }) {
  if (!MUTATION_KINDS.has(mutation) || !env.SUPPORT_WORKER || !env.SERVICES_AUTH_TOKEN) {
    return { confirmed: false };
  }
  const headers = new Headers({
    'X-Services-Auth': env.SERVICES_AUTH_TOKEN,
    'X-Services-Owner-ID': ownerId,
    'Idempotency-Key': idempotencyKey,
    'Content-Type': 'application/json',
  });
  try {
    const response = await env.SUPPORT_WORKER.fetch(new Request(`${SUPPORT_ORIGIN}/api/services/idempotency/ack`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ mutation }),
    }));
    return { confirmed: response.status === 204 };
  } catch {
    return { confirmed: false };
  }
}

export function parseTickets(data) {
  const rows = Array.isArray(data)
    ? data
    : isObject(data) && exactKeys(data, ['tickets']) && Array.isArray(data.tickets)
      ? data.tickets
      : null;
  if (!rows) return failure();
  const tickets = [];
  for (const row of rows) {
    const parsed = parseTicket(row);
    if (!parsed.ok) return failure();
    tickets.push(parsed.value);
  }
  return success(tickets);
}

export function parseClosedHistory(data) {
  if (!isObject(data) || !exactKeys(data, ['tickets', 'next_cursor']) || !Array.isArray(data.tickets)) return failure();
  if (data.next_cursor !== null && (typeof data.next_cursor !== 'string' || !decodeCursor(data.next_cursor).ok)) return failure();
  const tickets = [];
  for (const row of data.tickets) {
    const parsed = parseTombstone(row);
    if (!parsed.ok) return failure();
    tickets.push(parsed.value);
  }
  return success({ tickets, nextCursor: data.next_cursor });
}

function parseTicket(row) {
  if (!isObject(row)) return failure();
  const id = validId(row.id);
  const subject = nonEmptyString(row.subject);
  const status = typeof row.status === 'string' && ACTIVE_STATUSES.has(row.status) ? row.status : null;
  const updatedAtMs = parseTimestamp(row.updated_at);
  const closeScheduledAtMs = row.close_scheduled_at === undefined || row.close_scheduled_at === null
    ? null
    : parseTimestamp(row.close_scheduled_at);
  if (!id || !subject || !status || updatedAtMs == null || closeScheduledAtMs === null && row.close_scheduled_at != null) return failure();
  return success({ id, subject, status, updatedAtMs, closeScheduledAtMs });
}

export function parseDetail(data) {
  const tombstone = parseTombstone(data);
  if (tombstone.ok) return success({ type: 'tombstone', tombstone: tombstone.value });

  const envelope = isObject(data) && isObject(data.ticket)
    ? { ticket: data.ticket, messages: data.messages, attachments: data.attachments }
    : isObject(data)
      ? { ticket: data, messages: data.messages, attachments: data.attachments }
      : null;
  if (!envelope || !Array.isArray(envelope.messages)) return failure();
  if (envelope.attachments !== undefined && !Array.isArray(envelope.attachments)) return failure();
  const ticket = parseTicket(envelope.ticket);
  if (!ticket.ok) return failure();

  const messages = [];
  const attachments = [];
  let hasAuthorWarning = false;
  for (const row of envelope.messages) {
    const parsed = parseMessage(row);
    if (!parsed.ok) return failure();
    messages.push(parsed.value);
    hasAuthorWarning ||= parsed.value.authorWarning;
    if (Array.isArray(row.attachments)) {
      for (const attachment of row.attachments) {
        const parsedAttachment = parseAttachment(attachment);
        if (!parsedAttachment.ok) return failure();
        attachments.push(parsedAttachment.value);
      }
    } else if (Object.hasOwn(row, 'attachments')) {
      return failure();
    }
  }
  for (const attachment of envelope.attachments || []) {
    const parsed = parseAttachment(attachment);
    if (!parsed.ok) return failure();
    attachments.push(parsed.value);
  }
  return success({
    type: 'active',
    request: ticket.value,
    messages,
    attachments,
    hasAuthorWarning,
  });
}

function parseMessage(row) {
  if (!isObject(row) || typeof row.content !== 'string') return failure();
  const createdAtMs = parseTimestamp(row.created_at);
  if (createdAtMs == null) return failure();
  const author = parseAuthorKind(row.author_kind);
  return success({
    author_kind: row.author_kind,
    authorLabel: author.label,
    authorWarning: author.warning,
    content: row.content,
    createdAtMs,
  });
}

export function parseAuthorKind(value) {
  const labels = {
    human: 'you',
    operator: 'solstone support',
    agent: 'sol',
    anonymous: 'you (via the form)',
    internal: 'support update',
  };
  if (typeof value === 'string' && Object.hasOwn(labels, value)) {
    return { label: labels[value], warning: false };
  }
  return { label: 'unknown sender', warning: true };
}

function parseAttachment(row) {
  if (!isObject(row)) return failure();
  const filename = nonEmptyString(row.filename);
  const status = typeof row.status === 'string' && ATTACHMENT_STATUSES.has(row.status) ? row.status : null;
  if (
    !filename
    || !status
    || (row.triage_summary !== undefined
      && row.triage_summary !== null
      && typeof row.triage_summary !== 'string')
  ) return failure();
  return success({ filename, status, triage_summary: row.triage_summary ?? '' });
}

function parseTombstone(data) {
  if (!isObject(data) || !exactKeys(data, ['id', 'created_at', 'closed_at', 'status', 'content_removed'])) return failure();
  const id = validId(data.id);
  const createdAtMs = parseTimestamp(data.created_at);
  const closedAtMs = parseTimestamp(data.closed_at);
  if (!id || createdAtMs == null || closedAtMs == null || data.status !== 'closed' || data.content_removed !== true) return failure();
  return success({ id, createdAtMs, closedAtMs, status: 'closed', content_removed: true });
}

export function mergeTickets(rows) {
  const byId = new Map();
  for (const row of rows) {
    const current = byId.get(row.id);
    if (!current || row.updatedAtMs > current.updatedAtMs) byId.set(row.id, row);
  }
  return Array.from(byId.values()).sort((a, b) => (
    b.updatedAtMs - a.updatedAtMs || compareTicketIdsDescending(a.id, b.id)
  ));
}

export function encodeCursor({ closedAt, id }) {
  if (!isCanonicalCursorTimestamp(closedAt) || typeof id !== 'string' || !CANONICAL_DECIMAL.test(id)) return failure();
  return success(base64UrlEncode(encoder.encode(`${closedAt}\n${id}`)));
}

export function decodeCursor(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return failure();
  let decoded;
  try {
    decoded = decoder.decode(base64UrlDecode(value));
  } catch {
    return failure();
  }
  const newline = decoded.indexOf('\n');
  if (newline < 0 || newline !== decoded.lastIndexOf('\n')) return failure();
  const closedAt = decoded.slice(0, newline);
  const id = decoded.slice(newline + 1);
  if (!isCanonicalCursorTimestamp(closedAt) || !CANONICAL_DECIMAL.test(id)) return failure();
  const canonical = base64UrlEncode(encoder.encode(decoded));
  if (canonical !== value) return failure();
  return success({ closedAt, id });
}

function parseMutationDescriptor(path, data) {
  if (path === '/api/services/tickets') return parseCreateDescriptor(data);
  if (/\/messages$/.test(path)) return parseMessageDescriptor(data);
  if (/\/attachments$/.test(path)) return parseAttachmentDescriptor(data);
  if (/\/close$/.test(path)) return parseTombstone(data);
  if (/\/resolution$/.test(path)) return parseResolutionDescriptor(data);
  return failure();
}

function parseReadResponse(path, data) {
  if (path === '/api/services/tickets') return parseTickets(data);
  if (path === '/api/services/tickets/closed') return parseClosedHistory(data);
  if (/^\/api\/services\/tickets\/[^/]+$/.test(path)) return parseDetail(data);
  return failure();
}

function parseCreateDescriptor(data) {
  if (!isObject(data) || !exactKeys(data, ['id', 'created_at', 'status'])) return failure();
  const id = validId(data.id);
  const createdAtMs = parseTimestamp(data.created_at);
  const status = typeof data.status === 'string' && ACTIVE_STATUSES.has(data.status) ? data.status : null;
  return id && createdAtMs != null && status ? success({ id, createdAtMs, status }) : failure();
}

function parseMessageDescriptor(data) {
  if (!isObject(data) || !exactKeys(data, ['ticket_id', 'message_id', 'created_at', 'status'])) return failure();
  const ticketId = validId(data.ticket_id);
  const messageId = validId(data.message_id);
  const createdAtMs = parseTimestamp(data.created_at);
  return ticketId && messageId && createdAtMs != null && data.status === 'accepted'
    ? success({ ticketId, messageId, createdAtMs, status: 'accepted' })
    : failure();
}

function parseAttachmentDescriptor(data) {
  if (!isObject(data) || !exactKeys(data, ['ticket_id', 'attachment_ids', 'status']) || !Array.isArray(data.attachment_ids)) return failure();
  const ticketId = validId(data.ticket_id);
  const attachmentIds = data.attachment_ids.map(validId);
  return ticketId && attachmentIds.every(Boolean) && data.status === 'accepted'
    ? success({ ticketId, attachmentIds, status: 'accepted' })
    : failure();
}

function parseResolutionDescriptor(data) {
  if (!isObject(data) || !exactKeys(data, ['id', 'status', 'close_scheduled_at'])) return failure();
  const id = validId(data.id);
  const status = typeof data.status === 'string' && ACTIVE_STATUSES.has(data.status) ? data.status : null;
  return id && status && data.close_scheduled_at === null
    ? success({ id, status, closeScheduledAt: null })
    : failure();
}

function compareTicketIdsDescending(a, b) {
  if (CANONICAL_DECIMAL.test(a) && CANONICAL_DECIMAL.test(b)) {
    const left = BigInt(a);
    const right = BigInt(b);
    return left === right ? 0 : left > right ? -1 : 1;
  }
  // Legacy non-decimal ids remain visible in deterministic descending code-point order.
  return a === b ? 0 : a > b ? -1 : 1;
}

function isCanonicalCursorTimestamp(value) {
  if (typeof value !== 'string' || !CURSOR_TIMESTAMP.test(value)) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value;
}

function parseTimestamp(value) {
  const ms = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

function validId(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  return typeof value === 'string' && SUPPORT_ID_REGEX.test(value) ? value : null;
}

function hasReplaySignal(response) {
  const value = response.headers.get('Idempotency-Replay');
  return value === 'false' || value === 'true';
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function exactKeys(value, names) {
  const keys = Object.keys(value);
  return keys.length === names.length && names.every((name) => Object.hasOwn(value, name));
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readJson(response) {
  try {
    return success(await response.json());
  } catch {
    return failure();
  }
}

function result(classification, { data, retryAfter, acknowledgeable = false } = {}) {
  return { classification, data, retryAfter, acknowledgeable };
}

function ambiguous(reason) {
  return result('ambiguous', { data: { reason } });
}

function success(value) {
  return { ok: true, value };
}

function failure() {
  return { ok: false };
}
