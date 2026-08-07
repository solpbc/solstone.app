import { describe, expect, it } from 'vitest';
import {
  acknowledgeSupport,
  callSupport,
  decodeCursor,
  encodeCursor,
  mergeTickets,
  parseAuthorKind,
  parseClosedHistory,
  parseDetail,
  parseTickets,
} from '../src/support-wire.js';
import { base64UrlEncode } from '../src/crypto.js';
import { makeSupportWorker, makeTestEnv } from './helpers.js';

const OWNER_ID = '5c2ee533-57ba-4193-84a3-cdd1b5f2ad81';
const KEY = 'a'.repeat(43);
const NOW = '2026-08-12T15:17:47.154Z';

describe('support wire', () => {
  it.each([
    ['success replay', 200, messageDescriptor(), {}, 'success', false, true],
    ['success', 201, messageDescriptor(), {}, 'success', false, true],
    ['operation in progress', 409, { error: 'operation_in_progress' }, { 'Retry-After': '12' }, 'operationInProgress', '12', false],
    ['idempotency conflict', 409, { error: 'idempotency_conflict' }, {}, 'idempotencyConflict', false, false],
    ['invalid key', 400, { error: 'invalid_idempotency_key' }, {}, 'invalidIdempotencyKey', false, false],
    ['invalid state', 409, { error: 'invalid_state' }, {}, 'invalidState', false, true],
    ['not found', 404, { error: 'not_found' }, {}, 'notFound', false, false],
    ['operation erased', 410, { error: 'operation_erased' }, {}, 'operationErased', false, false],
    ['operation retired', 410, { error: 'operation_retired' }, {}, 'operationRetired', false, false],
    ['close in progress', 409, { error: 'close_in_progress' }, { 'Retry-After': '9' }, 'closeInProgress', '9', false],
    ['unknown error is ambiguous', 409, { error: 'other' }, {}, 'ambiguous', false, false],
  ])('classifies %s and records binding headers', async (
    _name,
    status,
    body,
    headers,
    classification,
    retryAfter,
    acknowledgeable,
  ) => {
    const support = makeSupportWorker({
      'POST /api/services/tickets/REQ_1/messages': () => json(body, status, headers),
    });
    const env = makeTestEnv({ SUPPORT_WORKER: support });

    const result = await callSupport(env, {
      method: 'POST',
      path: '/api/services/tickets/REQ_1/messages',
      ownerId: OWNER_ID,
      idempotencyKey: KEY,
      json: { content: 'hello' },
    });

    expect(result.classification).toBe(classification);
    expect(result.retryAfter || false).toBe(retryAfter);
    expect(result.acknowledgeable).toBe(acknowledgeable);
    expect(support.requests[0]).toMatchObject({
      headers: {
        servicesAuth: 'test-services-auth-token',
        ownerId: OWNER_ID,
        idempotencyKey: KEY,
        hasVerifiedEmail: false,
      },
      body: { content: 'hello' },
    });
  });

  it.each([
    ['detail', 'GET', '/api/services/tickets/REQ_1'],
    ['close mutation', 'POST', '/api/services/tickets/REQ_1/close'],
  ])('classifies close-in-progress %s responses with the retry hint', async (_name, method, path) => {
    const support = makeSupportWorker({
      [`${method} ${path}`]: () => json({ error: 'close_in_progress' }, 409, { 'Retry-After': '7' }),
    });
    const result = await callSupport(makeTestEnv({ SUPPORT_WORKER: support }), {
      method, path, ownerId: OWNER_ID, idempotencyKey: KEY, json: method === 'POST' ? {} : null,
    });

    expect(result).toMatchObject({ classification: 'closeInProgress', retryAfter: '7', acknowledgeable: false });
  });

  it('classifies a mutation tombstone instead of successful message acceptance', async () => {
    const support = makeSupportWorker({
      'POST /api/services/tickets/REQ_1/messages': () => json(tombstone()),
    });
    const result = await callSupport(makeTestEnv({ SUPPORT_WORKER: support }), {
      method: 'POST',
      path: '/api/services/tickets/REQ_1/messages',
      ownerId: OWNER_ID,
      idempotencyKey: KEY,
      json: { content: 'hello' },
    });

    expect(result).toMatchObject({ classification: 'tombstone', acknowledgeable: true });
  });

  it.each([
    ['/api/services/tickets', { id: 'REQ_NEW', created_at: NOW, status: 'open' }],
    ['/api/services/tickets/REQ_1/attachments', { ticket_id: 'REQ_1', attachment_ids: ['ATT_1'], status: 'accepted' }],
    ['/api/services/tickets/REQ_1/resolution', { id: 'REQ_1', status: 'open', close_scheduled_at: null }],
    ['/api/services/tickets/REQ_1/close', tombstone()],
  ])('accepts the exact mutation descriptor for %s', async (path, body) => {
    const support = makeSupportWorker({ [`POST ${path}`]: () => json(body) });
    const result = await callSupport(makeTestEnv({ SUPPORT_WORKER: support }), {
      method: 'POST', path, ownerId: OWNER_ID, idempotencyKey: KEY, json: { value: 'x' },
    });

    expect(result.classification).toBe(path.endsWith('/close') ? 'tombstone' : 'success');
    expect(result.acknowledgeable).toBe(true);
  });

  it('treats malformed successes, missing retry hints, throws, and unavailable bindings as ambiguous', async () => {
    const malformed = makeSupportWorker({
      'POST /api/services/tickets/REQ_1/messages': () => json({ ok: true }),
    });
    const noHint = makeSupportWorker({
      'POST /api/services/tickets/REQ_1/messages': () => json({ error: 'operation_in_progress' }, 409),
    });
    const throwing = makeSupportWorker({
      'POST /api/services/tickets/REQ_1/messages': () => { throw new Error('lost'); },
    });
    for (const support of [malformed, noHint, throwing]) {
      const result = await callSupport(makeTestEnv({ SUPPORT_WORKER: support }), messageRequest());
      expect(result.classification).toBe('ambiguous');
      expect(result.acknowledgeable).toBe(false);
    }
    expect((await callSupport(makeTestEnv({ SUPPORT_WORKER: null }), messageRequest())).classification).toBe('ambiguous');
  });

  it('sends verified email only when explicitly supplied', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets': () => json([]),
    });
    const env = makeTestEnv({ SUPPORT_WORKER: support });
    await callSupport(env, { method: 'GET', path: '/api/services/tickets', ownerId: OWNER_ID });
    await callSupport(env, {
      method: 'GET', path: '/api/services/tickets', ownerId: OWNER_ID, verifiedEmail: 'legacy@example.com',
    });

    expect(support.requests.map((request) => request.headers.hasVerifiedEmail)).toEqual([false, true]);
    expect(support.requests.map((request) => request.headers.verifiedEmail)).toEqual([null, 'legacy@example.com']);
  });

  it('forwards a closed-history cursor unchanged in the real request query string', async () => {
    const cursor = encodeCursor({ closedAt: NOW, id: '33' }).value;
    const support = makeSupportWorker({
      'GET /api/services/tickets/closed': () => json({ tickets: [tombstone()], next_cursor: null }),
    });
    const result = await callSupport(makeTestEnv({ SUPPORT_WORKER: support }), {
      method: 'GET', path: `/api/services/tickets/closed?cursor=${cursor}`, ownerId: OWNER_ID,
    });

    expect(result.classification).toBe('success');
    expect(support.requests[0]).toMatchObject({
      search: `?cursor=${cursor}`,
      searchParams: [['cursor', cursor]],
      headers: { ownerId: OWNER_ID, hasVerifiedEmail: false },
    });
  });

  it('strictly parses each accepted active, history, detail, and tombstone shape', () => {
    expect(parseTickets([ticket('REQ_1')])).toMatchObject({ ok: true });
    expect(parseTickets({ tickets: [ticket('REQ_1')] })).toMatchObject({ ok: true });
    const cursor = encodeCursor({ closedAt: NOW, id: '33' });
    expect(parseClosedHistory({ tickets: [tombstone()], next_cursor: cursor.value })).toMatchObject({ ok: true });
    expect(parseDetail({
      ticket: ticket('REQ_1'), messages: [message()], attachments: [attachment()],
    })).toMatchObject({ ok: true, value: { type: 'active' } });
    expect(parseDetail({ ...ticket('REQ_1'), messages: [message()], attachments: [] })).toMatchObject({
      ok: true, value: { type: 'active' },
    });
    expect(parseDetail(tombstone())).toMatchObject({ ok: true, value: { type: 'tombstone' } });
  });

  it('rejects malformed rows and envelopes instead of defaulting or dropping them', () => {
    expect(parseTickets({ tickets: [{ ...ticket('REQ_1'), subject: '' }] }).ok).toBe(false);
    expect(parseTickets({ tickets: [{ ...ticket('REQ_1'), status: 'other' }] }).ok).toBe(false);
    expect(parseTickets({ tickets: [{ ...ticket('REQ_1'), updated_at: 'not a date' }] }).ok).toBe(false);
    expect(parseTickets({ tickets: [{ ...ticket('REQ_1'), id: 'bad.id' }] }).ok).toBe(false);
    expect(parseDetail({ ticket: ticket('REQ_1'), messages: {}, attachments: [] }).ok).toBe(false);
    expect(parseDetail({ ...tombstone(), extra: true }).ok).toBe(false);
    expect(parseDetail(({ ...tombstone(), content_removed: undefined })).ok).toBe(false);
    expect(parseDetail({ ticket: ticket('REQ_1'), messages: [], attachments: [{ filename: '', status: 'pending' }] }).ok).toBe(false);
    expect(parseClosedHistory({ tickets: [tombstone()], next_cursor: 'bad' }).ok).toBe(false);
  });

  it('maps all author kinds and flags missing or unknown authors', () => {
    expect(parseAuthorKind('human')).toEqual({ label: 'you', warning: false });
    expect(parseAuthorKind('operator')).toEqual({ label: 'solstone support', warning: false });
    expect(parseAuthorKind('agent')).toEqual({ label: 'sol', warning: false });
    expect(parseAuthorKind('anonymous')).toEqual({ label: 'you (via the form)', warning: false });
    expect(parseAuthorKind('internal')).toEqual({ label: 'support update', warning: false });
    expect(parseAuthorKind()).toEqual({ label: 'unknown sender', warning: true });
    expect(parseAuthorKind('robot')).toEqual({ label: 'unknown sender', warning: true });
  });

  it('merges newest rows and uses numeric then deterministic descending id order', () => {
    const merged = mergeTickets([
      { ...ticket('REQ_DUP'), updatedAtMs: 10, subject: 'older' },
      { ...ticket('REQ_DUP'), updatedAtMs: 11, subject: 'newer' },
      { ...ticket('9'), updatedAtMs: 5 },
      { ...ticket('10'), updatedAtMs: 5 },
      { ...ticket('REQ_A'), updatedAtMs: 1 },
      { ...ticket('REQ_B'), updatedAtMs: 1 },
    ]);
    expect(merged.find((row) => row.id === 'REQ_DUP').subject).toBe('newer');
    expect(merged.map((row) => row.id)).toEqual(['REQ_DUP', '10', '9', 'REQ_B', 'REQ_A']);
  });

  it('encodes, decodes, and rejects malformed opaque cursors', () => {
    expect(encodeCursor({ closedAt: NOW, id: '33' }).value).toBe('MjAyNi0wOC0xMlQxNToxNzo0Ny4xNTRaCjMz');
    expect(decodeCursor('MjAyNi0wOC0xMlQxNToxNzo0Ny4xNTRaCjMz').value).toEqual({ closedAt: NOW, id: '33' });
    expect(encodeCursor({ closedAt: NOW, id: '9' }).value.endsWith('Cjk')).toBe(true);
    expect(encodeCursor({ closedAt: NOW, id: '10' }).value.endsWith('CjEw')).toBe(true);
    expect(encodeCursor({ closedAt: NOW, id: '9' }).value).toBe('MjAyNi0wOC0xMlQxNToxNzo0Ny4xNTRaCjk');
    expect(encodeCursor({ closedAt: NOW, id: '10' }).value).toBe('MjAyNi0wOC0xMlQxNToxNzo0Ny4xNTRaCjEw');
    expect(decodeCursor('MjAyNi0wOC0xMlQxNToxNzo0Ny4xNTRaCjk').value).toEqual({ closedAt: NOW, id: '9' });
    expect(decodeCursor('MjAyNi0wOC0xMlQxNToxNzo0Ny4xNTRaCjEw').value).toEqual({ closedAt: NOW, id: '10' });
    for (const value of [
      'A',
      base64UrlEncode(new TextEncoder().encode(`${NOW}\n33\n34`)),
      base64UrlEncode(new TextEncoder().encode(NOW)),
      base64UrlEncode(new TextEncoder().encode('2026-08-12T15:17:47Z\n33')),
      base64UrlEncode(new TextEncoder().encode(`${NOW}\n033`)),
      'MjAyNi0wOC0xMlQxNToxNzo0Ny4xNTRaCjMz=',
      base64UrlEncode(new Uint8Array([0xff, 0xfe])),
    ]) {
      expect(decodeCursor(value).ok).toBe(false);
    }
  });

  it('acknowledges each allowed mutation kind and keeps excluded outcomes unacknowledgeable', async () => {
    const support = makeSupportWorker({
      'POST /api/services/idempotency/ack': () => new Response(null, { status: 204 }),
    });
    const env = makeTestEnv({ SUPPORT_WORKER: support });
    for (const mutation of ['ticket.create', 'ticket.message', 'ticket.attachments', 'ticket.resolution', 'ticket.close']) {
      await expect(acknowledgeSupport(env, { ownerId: OWNER_ID, idempotencyKey: KEY, mutation })).resolves.toEqual({ confirmed: true });
    }
    expect(support.requests.map((request) => request.body)).toEqual([
      { mutation: 'ticket.create' },
      { mutation: 'ticket.message' },
      { mutation: 'ticket.attachments' },
      { mutation: 'ticket.resolution' },
      { mutation: 'ticket.close' },
    ]);
    expect(support.requests.every((request) => request.headers.idempotencyKey === KEY && request.headers.ownerId === OWNER_ID)).toBe(true);
  });

  it('treats ack 404s and thrown transports as unconfirmed', async () => {
    const missing = makeSupportWorker({
      'POST /api/services/idempotency/ack': () => new Response(null, { status: 404 }),
    });
    const throwing = makeSupportWorker({
      'POST /api/services/idempotency/ack': () => { throw new Error('lost'); },
    });
    await expect(acknowledgeSupport(makeTestEnv({ SUPPORT_WORKER: missing }), ackRequest())).resolves.toEqual({ confirmed: false });
    await expect(acknowledgeSupport(makeTestEnv({ SUPPORT_WORKER: throwing }), ackRequest())).resolves.toEqual({ confirmed: false });
  });
});

function messageRequest() {
  return {
    method: 'POST',
    path: '/api/services/tickets/REQ_1/messages',
    ownerId: OWNER_ID,
    idempotencyKey: KEY,
    json: { content: 'hello' },
  };
}

function ackRequest() {
  return { ownerId: OWNER_ID, idempotencyKey: KEY, mutation: 'ticket.message' };
}

function ticket(id, overrides = {}) {
  return { id, subject: 'subject', status: 'open', updated_at: NOW, ...overrides };
}

function message() {
  return { author_kind: 'human', content: 'hello', created_at: NOW };
}

function attachment() {
  return { filename: 'log.txt', status: 'pending' };
}

function tombstone() {
  return { id: 'REQ_1', created_at: NOW, closed_at: NOW, status: 'closed', content_removed: true };
}

function messageDescriptor() {
  return { ticket_id: 'REQ_1', message_id: 'MSG_1', created_at: NOW, status: 'accepted' };
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
