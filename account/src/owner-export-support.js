import { SUPPORT_ID_REGEX } from './support-constants.js';
import { decodeCursor } from './support-wire.js';

export const SUPPORT_EXPORT_DEADLINE_MS = 15_000;
export const SUPPORT_BODY_BYTE_LIMIT = 262144;
export const SUPPORT_CLOSED_PAGE_LIMIT = 25;

const ACTIVE_STATUSES = new Set(['open', 'in-progress', 'waiting', 'proposed', 'resolved']);
const AUTHOR_KINDS = new Set(['human', 'operator', 'agent', 'anonymous', 'internal']);
const ATTACHMENT_STATUSES = new Set(['pending', 'removed']);

const LIST_KEYS = [
  'id', 'product', 'subject', 'description', 'status', 'category',
  'user_email', 'created_at', 'updated_at', 'resolved_at', 'close_scheduled_at',
];

const DETAIL_KEYS = [...LIST_KEYS, 'messages'];
const MESSAGE_KEYS = ['id', 'content', 'created_at', 'author_kind', 'attachments'];
const ATTACHMENT_KEYS = ['id', 'filename', 'content_type', 'size_bytes', 'status', 'triage_summary', 'triaged_at'];
const TOMBSTONE_KEYS = ['id', 'created_at', 'closed_at', 'status', 'content_removed'];

export async function collectOwnerSupportExport({
  env,
  accountId,
  verifiedEmails = [],
  decryptFailed = false,
  clock = Date.now,
}) {
  if (!env?.SUPPORT_WORKER?.fetch || !env?.SERVICES_AUTH_TOKEN) {
    return { complete: false, tickets: [], tombstones: [], reason: 'unconfigured' };
  }

  const startMs = clock();
  const normalizedVerifiedEmails = Array.from(new Set(
    (verifiedEmails || []).map((e) => (typeof e === 'string' ? e.trim().toLowerCase() : '')).filter(Boolean),
  ));

  const collectedTickets = [];
  const collectedTombstones = [];
  const ticketsById = new Map();
  const tombstonesById = new Map();

  function recordTicket(ticket) {
    if (tombstonesById.has(ticket.id)) {
      return { ok: false, reason: 'duplicate' };
    }
    if (ticketsById.has(ticket.id)) {
      const existing = ticketsById.get(ticket.id);
      if (JSON.stringify(existing) === JSON.stringify(ticket)) {
        return { ok: true, added: false };
      }
      return { ok: false, reason: 'duplicate' };
    }
    ticketsById.set(ticket.id, ticket);
    collectedTickets.push(ticket);
    return { ok: true, added: true };
  }

  function recordTombstone(tombstone) {
    if (ticketsById.has(tombstone.id)) {
      return { ok: false, reason: 'duplicate' };
    }
    if (tombstonesById.has(tombstone.id)) {
      const existing = tombstonesById.get(tombstone.id);
      if (JSON.stringify(existing) === JSON.stringify(tombstone)) {
        return { ok: true, added: false };
      }
      return { ok: false, reason: 'duplicate' };
    }
    tombstonesById.set(tombstone.id, tombstone);
    collectedTombstones.push(tombstone);
    return { ok: true, added: true };
  }

  function isOverDeadline() {
    return clock() - startMs > SUPPORT_EXPORT_DEADLINE_MS;
  }

  async function rawSupportFetch(path, { verifiedEmail = null } = {}) {
    if (isOverDeadline()) {
      return { ok: false, reason: 'deadline' };
    }

    const headers = {
      'X-Services-Auth': env.SERVICES_AUTH_TOKEN,
      'X-Services-Owner-ID': accountId,
    };
    if (verifiedEmail) {
      headers['X-Verified-Email'] = verifiedEmail;
    }

    let response;
    try {
      response = await env.SUPPORT_WORKER.fetch(new Request(`https://support.internal${path}`, {
        method: 'GET',
        headers,
        redirect: 'manual',
      }));
    } catch {
      return { ok: false, reason: 'throw' };
    }

    if (response.status >= 300 && response.status < 400) {
      return { ok: false, reason: 'redirect' };
    }

    if (response.status === 404) {
      return { ok: false, status: 404 };
    }

    if (response.status !== 200) {
      return { ok: false, reason: `http_${response.status}` };
    }

    let rawText;
    try {
      rawText = await response.text();
    } catch {
      return { ok: false, reason: 'throw' };
    }

    if (rawText.length > SUPPORT_BODY_BYTE_LIMIT) {
      return { ok: false, reason: 'oversize' };
    }

    let parsedJson;
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      return { ok: false, reason: 'malformed_body' };
    }

    return { ok: true, data: parsedJson };
  }

  async function fetchDetail(ticketId) {
    let detailRes = await rawSupportFetch(`/api/services/tickets/${encodeURIComponent(ticketId)}`);
    if (!detailRes.ok && detailRes.status === 404) {
      for (const email of normalizedVerifiedEmails) {
        detailRes = await rawSupportFetch(`/api/services/tickets/${encodeURIComponent(ticketId)}`, { verifiedEmail: email });
        if (detailRes.ok || detailRes.status !== 404) {
          break;
        }
      }
    }
    return detailRes;
  }

  // 1. Active list discovery: owner-first then email fanout
  const discoveredIds = [];
  const discoveredIdSet = new Set();

  const ownerListRes = await rawSupportFetch('/api/services/tickets');
  if (!ownerListRes.ok) {
    return { complete: false, tickets: [], tombstones: [], reason: ownerListRes.reason || `http_${ownerListRes.status}` };
  }

  const parsedOwnerList = parseStrictActiveList(ownerListRes.data);
  if (!parsedOwnerList.ok) {
    return { complete: false, tickets: [], tombstones: [], reason: parsedOwnerList.reason };
  }

  for (const item of parsedOwnerList.items) {
    if (!discoveredIdSet.has(item.id)) {
      discoveredIdSet.add(item.id);
      discoveredIds.push(item.id);
    }
  }

  for (const email of normalizedVerifiedEmails) {
    const emailListRes = await rawSupportFetch('/api/services/tickets', { verifiedEmail: email });
    if (!emailListRes.ok) {
      return {
        complete: false,
        tickets: collectedTickets,
        tombstones: collectedTombstones,
        reason: emailListRes.reason || `http_${emailListRes.status}`,
      };
    }
    const parsedEmailList = parseStrictActiveList(emailListRes.data);
    if (!parsedEmailList.ok) {
      return {
        complete: false,
        tickets: collectedTickets,
        tombstones: collectedTombstones,
        reason: parsedEmailList.reason,
      };
    }
    for (const item of parsedEmailList.items) {
      if (!discoveredIdSet.has(item.id)) {
        discoveredIdSet.add(item.id);
        discoveredIds.push(item.id);
      }
    }
  }

  // 2. Active detail fetch: owner-first, fallback to verified emails on 404
  for (const ticketId of discoveredIds) {
    const detailRes = await fetchDetail(ticketId);
    if (!detailRes.ok) {
      return {
        complete: false,
        tickets: collectedTickets,
        tombstones: collectedTombstones,
        reason: detailRes.reason || `http_${detailRes.status}`,
      };
    }

    // Check if detail is a tombstone
    const tombstoneCheck = parseStrictTombstone(detailRes.data);
    if (tombstoneCheck.ok) {
      if (tombstoneCheck.tombstone.id !== ticketId) {
        return {
          complete: false,
          tickets: collectedTickets,
          tombstones: collectedTombstones,
          reason: 'mismatch',
        };
      }
      // Retry once using fetchDetail to stabilize active -> tombstone
      const retryRes = await fetchDetail(ticketId);
      if (!retryRes.ok) {
        return {
          complete: false,
          tickets: collectedTickets,
          tombstones: collectedTombstones,
          reason: 'unstable',
        };
      }
      const retryTombstone = parseStrictTombstone(retryRes.data);
      const retryDetail = parseStrictDetail(retryRes.data, normalizedVerifiedEmails);
      if (retryTombstone.ok && retryTombstone.tombstone.id === ticketId) {
        const addResult = recordTombstone(retryTombstone.tombstone);
        if (!addResult.ok) {
          return {
            complete: false,
            tickets: collectedTickets,
            tombstones: collectedTombstones,
            reason: addResult.reason,
          };
        }
        continue;
      }
      if (retryDetail.ok && retryDetail.ticket.id === ticketId) {
        const addResult = recordTicket(retryDetail.ticket);
        if (!addResult.ok) {
          return {
            complete: false,
            tickets: collectedTickets,
            tombstones: collectedTombstones,
            reason: addResult.reason,
          };
        }
        continue;
      }
      return {
        complete: false,
        tickets: collectedTickets,
        tombstones: collectedTombstones,
        reason: 'unstable',
      };
    }

    const detailParse = parseStrictDetail(detailRes.data, normalizedVerifiedEmails);
    if (!detailParse.ok) {
      return {
        complete: false,
        tickets: collectedTickets,
        tombstones: collectedTombstones,
        reason: detailParse.reason,
      };
    }

    if (detailParse.ticket.id !== ticketId) {
      return {
        complete: false,
        tickets: collectedTickets,
        tombstones: collectedTombstones,
        reason: 'mismatch',
      };
    }

    const addResult = recordTicket(detailParse.ticket);
    if (!addResult.ok) {
      return {
        complete: false,
        tickets: collectedTickets,
        tombstones: collectedTombstones,
        reason: addResult.reason,
      };
    }
  }

  // 3. Closed history cursor walk: owner-only
  let currentCursor = null;
  const seenCursors = new Set();

  while (true) {
    if (isOverDeadline()) {
      return {
        complete: false,
        tickets: collectedTickets,
        tombstones: collectedTombstones,
        reason: 'deadline',
      };
    }

    const path = currentCursor === null
      ? '/api/services/tickets/closed'
      : `/api/services/tickets/closed?cursor=${encodeURIComponent(currentCursor)}`;

    const closedRes = await rawSupportFetch(path);
    if (!closedRes.ok) {
      return {
        complete: false,
        tickets: collectedTickets,
        tombstones: collectedTombstones,
        reason: closedRes.reason || `http_${closedRes.status}`,
      };
    }

    const parsedClosed = parseStrictClosedPage(closedRes.data);
    if (!parsedClosed.ok) {
      return {
        complete: false,
        tickets: collectedTickets,
        tombstones: collectedTombstones,
        reason: parsedClosed.reason,
      };
    }

    let newIdsAddedInPage = 0;
    for (const tomb of parsedClosed.tickets) {
      const addResult = recordTombstone(tomb);
      if (!addResult.ok) {
        return {
          complete: false,
          tickets: collectedTickets,
          tombstones: collectedTombstones,
          reason: addResult.reason,
        };
      }
      if (addResult.added) {
        newIdsAddedInPage++;
      }
    }

    if (parsedClosed.nextCursor === null) {
      break;
    }

    if (newIdsAddedInPage === 0) {
      return {
        complete: false,
        tickets: collectedTickets,
        tombstones: collectedTombstones,
        reason: 'cursor',
      };
    }

    if (seenCursors.has(parsedClosed.nextCursor)) {
      return {
        complete: false,
        tickets: collectedTickets,
        tombstones: collectedTombstones,
        reason: 'cursor',
      };
    }

    seenCursors.add(parsedClosed.nextCursor);
    currentCursor = parsedClosed.nextCursor;
  }

  if (decryptFailed) {
    return {
      complete: false,
      tickets: collectedTickets,
      tombstones: collectedTombstones,
      reason: 'decrypt',
    };
  }

  return {
    complete: true,
    tickets: collectedTickets,
    tombstones: collectedTombstones,
  };
}

function hasExactKeys(obj, expectedKeys) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  if (keys.length !== expectedKeys.length) return false;
  return expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(obj, key));
}

function normalizeId(id) {
  if (typeof id === 'number') {
    if (Number.isSafeInteger(id) && id > 0) {
      return String(id);
    }
    return null;
  }
  if (typeof id === 'string' && SUPPORT_ID_REGEX.test(id)) {
    if (id.startsWith('-')) {
      return null;
    }
    if (/^\d+$/.test(id)) {
      if (id === '0' || (id.startsWith('0') && id.length > 1)) return null;
      const num = Number(id);
      if (!Number.isSafeInteger(num) || num <= 0) {
        return null;
      }
    }
    return id;
  }
  return null;
}

function parseIsoTimestamp(ts) {
  if (typeof ts === 'number') {
    if (Number.isFinite(ts) && Number.isSafeInteger(ts) && ts > 0) {
      const d = new Date(ts);
      if (!Number.isNaN(d.getTime())) {
        return d.toISOString();
      }
    }
    return null;
  }
  if (typeof ts === 'string') {
    if (!ts.trim()) return null;
    const ms = Date.parse(ts);
    if (Number.isFinite(ms) && ms > 0) {
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) {
        return d.toISOString();
      }
    }
  }
  return null;
}

function parseStrictActiveList(data) {
  if (!Array.isArray(data)) {
    return { ok: false, reason: 'invalid_envelope' };
  }

  const items = [];
  for (const row of data) {
    if (!hasExactKeys(row, LIST_KEYS)) {
      return { ok: false, reason: 'invalid_envelope' };
    }

    const id = normalizeId(row.id);
    if (!id) return { ok: false, reason: 'invalid_envelope' };

    if (typeof row.product !== 'string' || !row.product.trim()) return { ok: false, reason: 'invalid_envelope' };
    if (typeof row.subject !== 'string' || !row.subject.trim()) return { ok: false, reason: 'invalid_envelope' };
    if (typeof row.description !== 'string') return { ok: false, reason: 'invalid_envelope' };
    if (!ACTIVE_STATUSES.has(row.status)) return { ok: false, reason: 'invalid_envelope' };

    if (row.category !== null && (typeof row.category !== 'string' || !row.category.trim())) {
      return { ok: false, reason: 'invalid_envelope' };
    }

    if (row.user_email !== null && typeof row.user_email !== 'string') {
      return { ok: false, reason: 'invalid_envelope' };
    }

    const createdAt = parseIsoTimestamp(row.created_at);
    const updatedAt = parseIsoTimestamp(row.updated_at);
    if (!createdAt || !updatedAt) return { ok: false, reason: 'invalid_envelope' };

    if (row.resolved_at !== null && !parseIsoTimestamp(row.resolved_at)) {
      return { ok: false, reason: 'invalid_envelope' };
    }

    if (row.close_scheduled_at !== null && !parseIsoTimestamp(row.close_scheduled_at)) {
      return { ok: false, reason: 'invalid_envelope' };
    }

    items.push({ id });
  }

  return { ok: true, items };
}

function parseStrictDetail(data, verifiedEmails) {
  if (!hasExactKeys(data, DETAIL_KEYS)) {
    return { ok: false, reason: 'invalid_envelope' };
  }

  const id = normalizeId(data.id);
  if (!id) return { ok: false, reason: 'invalid_envelope' };

  if (typeof data.product !== 'string' || !data.product.trim()) return { ok: false, reason: 'invalid_envelope' };
  if (typeof data.subject !== 'string' || !data.subject.trim()) return { ok: false, reason: 'invalid_envelope' };
  if (typeof data.description !== 'string') return { ok: false, reason: 'invalid_envelope' };
  if (!ACTIVE_STATUSES.has(data.status)) return { ok: false, reason: 'invalid_envelope' };

  if (data.category !== null && (typeof data.category !== 'string' || !data.category.trim())) {
    return { ok: false, reason: 'invalid_envelope' };
  }

  let userEmailToEmit = null;
  if (data.user_email !== null) {
    if (typeof data.user_email !== 'string') return { ok: false, reason: 'invalid_envelope' };
    const normalized = data.user_email.trim().toLowerCase();
    userEmailToEmit = verifiedEmails.includes(normalized) ? normalized : null;
  }

  const createdAt = parseIsoTimestamp(data.created_at);
  const updatedAt = parseIsoTimestamp(data.updated_at);
  if (!createdAt || !updatedAt) return { ok: false, reason: 'invalid_envelope' };

  const resolvedAt = data.resolved_at === null ? null : parseIsoTimestamp(data.resolved_at);
  if (data.resolved_at !== null && !resolvedAt) return { ok: false, reason: 'invalid_envelope' };

  const closeScheduledAt = data.close_scheduled_at === null ? null : parseIsoTimestamp(data.close_scheduled_at);
  if (data.close_scheduled_at !== null && !closeScheduledAt) return { ok: false, reason: 'invalid_envelope' };

  if (!Array.isArray(data.messages)) {
    return { ok: false, reason: 'invalid_envelope' };
  }

  const messages = [];
  for (const msg of data.messages) {
    if (!hasExactKeys(msg, MESSAGE_KEYS)) {
      return { ok: false, reason: 'invalid_envelope' };
    }

    const msgId = normalizeId(msg.id);
    if (!msgId) return { ok: false, reason: 'invalid_envelope' };

    if (typeof msg.content !== 'string') return { ok: false, reason: 'invalid_envelope' };
    if (!AUTHOR_KINDS.has(msg.author_kind)) return { ok: false, reason: 'invalid_envelope' };

    const msgCreatedAt = parseIsoTimestamp(msg.created_at);
    if (!msgCreatedAt) return { ok: false, reason: 'invalid_envelope' };

    if (!Array.isArray(msg.attachments)) {
      return { ok: false, reason: 'invalid_envelope' };
    }

    const attachments = [];
    for (const att of msg.attachments) {
      if (!hasExactKeys(att, ATTACHMENT_KEYS)) {
        return { ok: false, reason: 'invalid_envelope' };
      }

      const attId = normalizeId(att.id);
      if (!attId) return { ok: false, reason: 'invalid_envelope' };

      if (typeof att.filename !== 'string' || !att.filename.trim()) return { ok: false, reason: 'invalid_envelope' };
      if (typeof att.content_type !== 'string' || !att.content_type.trim()) return { ok: false, reason: 'invalid_envelope' };
      if (typeof att.size_bytes !== 'number' || !Number.isSafeInteger(att.size_bytes) || att.size_bytes < 0 || att.size_bytes > Number.MAX_SAFE_INTEGER) {
        return { ok: false, reason: 'invalid_envelope' };
      }
      if (!ATTACHMENT_STATUSES.has(att.status)) return { ok: false, reason: 'invalid_envelope' };

      if (att.triage_summary !== null && typeof att.triage_summary !== 'string') {
        return { ok: false, reason: 'invalid_envelope' };
      }

      const triagedAt = att.triaged_at === null ? null : parseIsoTimestamp(att.triaged_at);
      if (att.triaged_at !== null && !triagedAt) return { ok: false, reason: 'invalid_envelope' };

      attachments.push({
        id: attId,
        filename: att.filename.trim(),
        content_type: att.content_type.trim(),
        size_bytes: att.size_bytes,
        status: att.status,
        triage_summary: att.triage_summary,
        triaged_at: triagedAt,
      });
    }

    messages.push({
      id: msgId,
      content: msg.content,
      created_at: msgCreatedAt,
      author_kind: msg.author_kind,
      attachments,
    });
  }

  return {
    ok: true,
    ticket: {
      id,
      product: data.product.trim(),
      subject: data.subject.trim(),
      description: data.description,
      status: data.status,
      category: data.category ? data.category.trim() : null,
      user_email: userEmailToEmit,
      created_at: createdAt,
      updated_at: updatedAt,
      resolved_at: resolvedAt,
      close_scheduled_at: closeScheduledAt,
      messages,
    },
  };
}

function parseStrictTombstone(data) {
  if (!hasExactKeys(data, TOMBSTONE_KEYS)) {
    return { ok: false, reason: 'invalid_envelope' };
  }

  const id = normalizeId(data.id);
  if (!id) return { ok: false, reason: 'invalid_envelope' };

  const createdAt = parseIsoTimestamp(data.created_at);
  const closedAt = parseIsoTimestamp(data.closed_at);
  if (!createdAt || !closedAt) return { ok: false, reason: 'invalid_envelope' };

  if (data.status !== 'closed' || data.content_removed !== true) {
    return { ok: false, reason: 'invalid_envelope' };
  }

  return {
    ok: true,
    tombstone: {
      id,
      created_at: createdAt,
      closed_at: closedAt,
      status: 'closed',
      content_removed: true,
    },
  };
}

function parseStrictClosedPage(data) {
  if (!hasExactKeys(data, ['tickets', 'next_cursor'])) {
    return { ok: false, reason: 'invalid_envelope' };
  }

  if (!Array.isArray(data.tickets)) {
    return { ok: false, reason: 'invalid_envelope' };
  }

  if (data.tickets.length > SUPPORT_CLOSED_PAGE_LIMIT) {
    return { ok: false, reason: 'over_limit' };
  }

  const tombstones = [];
  for (const raw of data.tickets) {
    const parsed = parseStrictTombstone(raw);
    if (!parsed.ok) return { ok: false, reason: parsed.reason };
    tombstones.push(parsed.tombstone);
  }

  if (data.next_cursor !== null) {
    if (typeof data.next_cursor !== 'string') {
      return { ok: false, reason: 'cursor' };
    }
    const decoded = decodeCursor(data.next_cursor);
    if (!decoded.ok) {
      return { ok: false, reason: 'cursor' };
    }
  }

  return {
    ok: true,
    tickets: tombstones,
    nextCursor: data.next_cursor,
  };
}
