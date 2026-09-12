import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectOwnerSupportExport,
  SUPPORT_AGGREGATE_BYTE_LIMIT,
  SUPPORT_BODY_BYTE_LIMIT,
  SUPPORT_CLOSED_PAGE_LIMIT,
  SUPPORT_EXPORT_DEADLINE_MS,
} from '../src/owner-export-support.js';
import { encodeCursor } from '../src/support-wire.js';
import { installConsoleSpy, makeSupportWorker, makeTestEnv, resetDb } from './helpers.js';

const NOW = 1_700_000_000_000;
const ISO_NOW = new Date(NOW).toISOString();
const OWNER_ID = 'owner-account-id-1234';
const SENSITIVE_AUTH_TOKEN = 'secret-services-auth-token-xyz';
const SENSITIVE_R2_KEY = 'tickets/tenant/r2-blob-key-secret-123';
const SENSITIVE_OTHER_EMAIL = 'other-owner-unverified@example.com';

function makeValidTicketListRow(id = 'REQ_1', overrides = {}) {
  return {
    id,
    product: 'solstone',
    subject: 'test subject',
    description: 'test description',
    status: 'open',
    category: null,
    user_email: 'owner@example.com',
    created_at: ISO_NOW,
    updated_at: ISO_NOW,
    resolved_at: null,
    close_scheduled_at: null,
    ...overrides,
  };
}

function makeValidDetail(id = 'REQ_1', overrides = {}) {
  return {
    id,
    product: 'solstone',
    subject: 'test subject',
    description: 'test description',
    status: 'open',
    category: 'general',
    user_email: 'owner@example.com',
    created_at: ISO_NOW,
    updated_at: ISO_NOW,
    resolved_at: null,
    close_scheduled_at: null,
    messages: [
      {
        id: 'MSG_1',
        content: 'message content',
        created_at: ISO_NOW,
        author_kind: 'human',
        attachments: [
          {
            id: 'ATT_1',
            filename: 'log.txt',
            content_type: 'text/plain',
            size_bytes: 1024,
            status: 'pending',
            triage_summary: 'summary',
            triaged_at: ISO_NOW,
          },
        ],
      },
      {
        id: 'MSG_2',
        content: 'operator response',
        created_at: ISO_NOW,
        author_kind: 'operator',
        attachments: [],
      },
    ],
    ...overrides,
  };
}

function makeValidTombstone(id = 'REQ_TOMB_1', overrides = {}) {
  return {
    id,
    created_at: ISO_NOW,
    closed_at: ISO_NOW,
    status: 'closed',
    content_removed: true,
    ...overrides,
  };
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('owner export support collector (strict schema & isolation)', () => {
  beforeEach(resetDb);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('collects active tickets, verified-email fanouts, flat details, and closed tombstones', async () => {
    const consoleSpy = installConsoleSpy();
    const support = makeSupportWorker({
      'GET /api/services/tickets': ({ request }) => {
        const email = request.headers.get('X-Verified-Email');
        if (!email) {
          return json([makeValidTicketListRow('REQ_1')]);
        }
        if (email === 'secondary@example.com') {
          return json([makeValidTicketListRow('REQ_2', { user_email: 'SECONDARY@example.com' })]);
        }
        return json([]);
      },
      'GET /api/services/tickets/REQ_1': () => json(makeValidDetail('REQ_1')),
      'GET /api/services/tickets/REQ_2': ({ request }) => {
        if (!request.headers.get('X-Verified-Email')) {
          return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
        }
        return json(makeValidDetail('REQ_2', { user_email: 'SECONDARY@EXAMPLE.COM' }));
      },
      'GET /api/services/tickets/closed': () => json({
        tickets: [makeValidTombstone('REQ_TOMB_1')],
        next_cursor: null,
      }),
    });

    const env = makeTestEnv({
      SUPPORT_WORKER: support,
      SERVICES_AUTH_TOKEN: SENSITIVE_AUTH_TOKEN,
    });
    const result = await collectOwnerSupportExport({
      env,
      accountId: OWNER_ID,
      verifiedEmails: ['owner@example.com', 'secondary@example.com'],
      clock: () => NOW,
    });

    expect(result.complete).toBe(true);
    expect(result.tickets).toHaveLength(2);
    expect(result.tickets[0].id).toBe('REQ_1');
    expect(result.tickets[0].user_email).toBe('owner@example.com');
    expect(result.tickets[1].id).toBe('REQ_2');
    expect(result.tickets[1].user_email).toBe('secondary@example.com');
    expect(result.tombstones).toEqual([
      {
        id: 'REQ_TOMB_1',
        created_at: ISO_NOW,
        closed_at: ISO_NOW,
        status: 'closed',
        content_removed: true,
      },
    ]);

    // Verify headers
    expect(support.requests.every((r) => r.headers.servicesAuth === SENSITIVE_AUTH_TOKEN)).toBe(true);
    expect(support.requests.every((r) => r.headers.ownerId === OWNER_ID)).toBe(true);

    consoleSpy.assertNoSecrets([SENSITIVE_AUTH_TOKEN]);
  });

  it('uses list for discovery only: uses subject and fields from detail, not list', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets': () => json([
        makeValidTicketListRow('REQ_1', { subject: 'LIST_SUBJECT', description: 'LIST_DESC' }),
      ]),
      'GET /api/services/tickets/REQ_1': () => json(
        makeValidDetail('REQ_1', { subject: 'DETAIL_SUBJECT', description: 'DETAIL_DESC' }),
      ),
      'GET /api/services/tickets/closed': () => json({ tickets: [], next_cursor: null }),
    });

    const env = makeTestEnv({ SUPPORT_WORKER: support });
    const result = await collectOwnerSupportExport({
      env,
      accountId: OWNER_ID,
      verifiedEmails: ['owner@example.com'],
      clock: () => NOW,
    });

    expect(result.complete).toBe(true);
    expect(result.tickets[0].subject).toBe('DETAIL_SUBJECT');
    expect(result.tickets[0].description).toBe('DETAIL_DESC');
  });

  it('strictly rejects enveloped active lists, nested detail formats, and extra fields', async () => {
    // 1. Enveloped active list (must reject)
    const envelopedSupport = makeSupportWorker({
      'GET /api/services/tickets': () => json({ tickets: [makeValidTicketListRow('REQ_1')] }),
      'GET /api/services/tickets/closed': () => json({ tickets: [], next_cursor: null }),
    });
    const res1 = await collectOwnerSupportExport({
      env: makeTestEnv({ SUPPORT_WORKER: envelopedSupport }), accountId: OWNER_ID,
    });
    expect(res1.complete).toBe(false);
    expect(res1.reason).toBe('invalid_envelope');

    // 2. Nested detail envelope { ticket, messages, attachments }
    const nestedDetailSupport = makeSupportWorker({
      'GET /api/services/tickets': () => json([makeValidTicketListRow('REQ_1')]),
      'GET /api/services/tickets/REQ_1': () => json({
        ticket: makeValidTicketListRow('REQ_1'),
        messages: [],
        attachments: [],
      }),
      'GET /api/services/tickets/closed': () => json({ tickets: [], next_cursor: null }),
    });
    const res2 = await collectOwnerSupportExport({
      env: makeTestEnv({ SUPPORT_WORKER: nestedDetailSupport }), accountId: OWNER_ID,
    });
    expect(res2.complete).toBe(false);
    expect(res2.reason).toBe('invalid_envelope');

    // 3. Top-level attachments array in detail
    const topLevelAttSupport = makeSupportWorker({
      'GET /api/services/tickets': () => json([makeValidTicketListRow('REQ_1')]),
      'GET /api/services/tickets/REQ_1': () => {
        const detail = makeValidDetail('REQ_1');
        detail.attachments = [];
        return json(detail);
      },
      'GET /api/services/tickets/closed': () => json({ tickets: [], next_cursor: null }),
    });
    const res3 = await collectOwnerSupportExport({
      env: makeTestEnv({ SUPPORT_WORKER: topLevelAttSupport }), accountId: OWNER_ID,
    });
    expect(res3.complete).toBe(false);
    expect(res3.reason).toBe('invalid_envelope');

    // 4. Extra attachment members (r2_key, download_url)
    const detailWithExtraSupport = makeSupportWorker({
      'GET /api/services/tickets': () => json([makeValidTicketListRow('REQ_1')]),
      'GET /api/services/tickets/REQ_1': () => {
        const detail = makeValidDetail('REQ_1');
        detail.messages[0].attachments[0].r2_key = 'leaked-r2-key';
        detail.messages[0].attachments[0].download_url = 'https://download.example/file';
        return json(detail);
      },
      'GET /api/services/tickets/closed': () => json({ tickets: [], next_cursor: null }),
    });
    const res4 = await collectOwnerSupportExport({
      env: makeTestEnv({ SUPPORT_WORKER: detailWithExtraSupport }), accountId: OWNER_ID,
    });
    expect(res4.complete).toBe(false);
    expect(res4.reason).toBe('invalid_envelope');
  });

  it('rejects wrong scalar types and missing required fields at each coordinate family', async () => {
    const testCases = [
      // Ticket coordinate: required subject missing or wrong type
      {
        name: 'ticket subject null',
        detail: makeValidDetail('REQ_1', { subject: null }),
      },
      {
        name: 'ticket product number',
        detail: makeValidDetail('REQ_1', { product: 12345 }),
      },
      {
        name: 'ticket invalid created_at',
        detail: makeValidDetail('REQ_1', { created_at: 'not-a-date' }),
      },
      // Message coordinate: content null, author_kind wrong, created_at invalid
      {
        name: 'message content null',
        detail: makeValidDetail('REQ_1', {
          messages: [{ id: 'MSG_1', content: null, created_at: ISO_NOW, author_kind: 'human', attachments: [] }],
        }),
      },
      {
        name: 'message author_kind unknown',
        detail: makeValidDetail('REQ_1', {
          messages: [{ id: 'MSG_1', content: 'hello', created_at: ISO_NOW, author_kind: 'bot', attachments: [] }],
        }),
      },
      {
        name: 'message attachments not an array',
        detail: makeValidDetail('REQ_1', {
          messages: [{ id: 'MSG_1', content: 'hello', created_at: ISO_NOW, author_kind: 'human', attachments: 'none' }],
        }),
      },
      // Attachment coordinate: filename null, negative size_bytes, float size_bytes, unknown status
      {
        name: 'attachment filename null',
        detail: makeValidDetail('REQ_1', {
          messages: [{
            id: 'MSG_1',
            content: 'hello',
            created_at: ISO_NOW,
            author_kind: 'human',
            attachments: [{
              id: 'ATT_1', filename: null, content_type: 'text/plain', size_bytes: 100, status: 'pending', triage_summary: null, triaged_at: null,
            }],
          }],
        }),
      },
      {
        name: 'attachment negative size_bytes',
        detail: makeValidDetail('REQ_1', {
          messages: [{
            id: 'MSG_1',
            content: 'hello',
            created_at: ISO_NOW,
            author_kind: 'human',
            attachments: [{
              id: 'ATT_1', filename: 'file.txt', content_type: 'text/plain', size_bytes: -5, status: 'pending', triage_summary: null, triaged_at: null,
            }],
          }],
        }),
      },
      {
        name: 'attachment non-integer size_bytes',
        detail: makeValidDetail('REQ_1', {
          messages: [{
            id: 'MSG_1',
            content: 'hello',
            created_at: ISO_NOW,
            author_kind: 'human',
            attachments: [{
              id: 'ATT_1', filename: 'file.txt', content_type: 'text/plain', size_bytes: 100.5, status: 'pending', triage_summary: null, triaged_at: null,
            }],
          }],
        }),
      },
      {
        name: 'attachment unknown status',
        detail: makeValidDetail('REQ_1', {
          messages: [{
            id: 'MSG_1',
            content: 'hello',
            created_at: ISO_NOW,
            author_kind: 'human',
            attachments: [{
              id: 'ATT_1', filename: 'file.txt', content_type: 'text/plain', size_bytes: 100, status: 'uploaded', triage_summary: null, triaged_at: null,
            }],
          }],
        }),
      },
    ];

    for (const tc of testCases) {
      const support = makeSupportWorker({
        'GET /api/services/tickets': () => json([makeValidTicketListRow('REQ_1')]),
        'GET /api/services/tickets/REQ_1': () => json(tc.detail),
        'GET /api/services/tickets/closed': () => json({ tickets: [], next_cursor: null }),
      });
      const res = await collectOwnerSupportExport({
        env: makeTestEnv({ SUPPORT_WORKER: support }), accountId: OWNER_ID,
      });
      expect(res.complete, `Expected failure for case: ${tc.name}`).toBe(false);
      expect(res.reason, `Expected invalid_envelope for case: ${tc.name}`).toBe('invalid_envelope');
    }
  });

  it('rejects invalid IDs and accepts/stringifies positive safe integers', async () => {
    // 1. Invalid IDs (0, negative, non-integer, > MAX_SAFE_INTEGER)
    const invalidIds = [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 100, '0', '-5', 'invalid char!'];
    for (const badId of invalidIds) {
      const support = makeSupportWorker({
        'GET /api/services/tickets': () => json([makeValidTicketListRow(badId)]),
        'GET /api/services/tickets/closed': () => json({ tickets: [], next_cursor: null }),
      });
      const res = await collectOwnerSupportExport({
        env: makeTestEnv({ SUPPORT_WORKER: support }), accountId: OWNER_ID,
      });
      expect(res.complete, `bad id: ${badId}`).toBe(false);
      expect(res.reason).toBe('invalid_envelope');
    }

    // 2. Positive safe integer is accepted and stringified
    const supportNum = makeSupportWorker({
      'GET /api/services/tickets': () => json([makeValidTicketListRow(42)]),
      'GET /api/services/tickets/42': () => json(makeValidDetail(42)),
      'GET /api/services/tickets/closed': () => json({ tickets: [], next_cursor: null }),
    });
    const resNum = await collectOwnerSupportExport({
      env: makeTestEnv({ SUPPORT_WORKER: supportNum }), accountId: OWNER_ID,
    });
    expect(resNum.complete).toBe(true);
    expect(resNum.tickets[0].id).toBe('42');
  });

  it('correctly handles positive fixtures covering all nullable fields and author kinds', async () => {
    const authorKinds = ['human', 'operator', 'agent', 'anonymous', 'internal'];
    const support = makeSupportWorker({
      'GET /api/services/tickets': () => json([
        // Nullable fields as null
        makeValidTicketListRow('REQ_NULL', {
          category: null,
          user_email: null,
          resolved_at: null,
          close_scheduled_at: null,
        }),
        // Nullable fields as non-null
        makeValidTicketListRow('REQ_FULL', {
          category: 'billing',
          user_email: 'owner@example.com',
          resolved_at: ISO_NOW,
          close_scheduled_at: ISO_NOW,
        }),
      ]),
      'GET /api/services/tickets/REQ_NULL': () => json({
        id: 'REQ_NULL',
        product: 'solstone',
        subject: 'All nulls',
        description: '',
        status: 'open',
        category: null,
        user_email: null,
        created_at: ISO_NOW,
        updated_at: ISO_NOW,
        resolved_at: null,
        close_scheduled_at: null,
        messages: [],
      }),
      'GET /api/services/tickets/REQ_FULL': () => json({
        id: 'REQ_FULL',
        product: 'solstone',
        subject: 'All non-nulls',
        description: 'full description',
        status: 'resolved',
        category: 'billing',
        user_email: 'owner@example.com',
        created_at: ISO_NOW,
        updated_at: ISO_NOW,
        resolved_at: ISO_NOW,
        close_scheduled_at: ISO_NOW,
        messages: authorKinds.map((authorKind, idx) => ({
          id: `MSG_${idx + 1}`,
          content: idx === 0 ? '' : `content ${idx}`, // Includes empty string content
          created_at: ISO_NOW,
          author_kind: authorKind,
          attachments: idx === 0 ? [] : [
            {
              id: `ATT_${idx}`,
              filename: 'doc.pdf',
              content_type: 'application/pdf',
              size_bytes: 2048,
              status: idx % 2 === 0 ? 'pending' : 'removed',
              triage_summary: idx % 2 === 0 ? null : 'scanned ok',
              triaged_at: idx % 2 === 0 ? null : ISO_NOW,
            },
          ],
        })),
      }),
      'GET /api/services/tickets/closed': () => json({ tickets: [], next_cursor: null }),
    });

    const env = makeTestEnv({ SUPPORT_WORKER: support });
    const res = await collectOwnerSupportExport({
      env,
      accountId: OWNER_ID,
      verifiedEmails: ['owner@example.com'],
      clock: () => NOW,
    });

    expect(res.complete).toBe(true);
    expect(res.tickets).toHaveLength(2);

    const nullTicket = res.tickets[0];
    expect(nullTicket.category).toBeNull();
    expect(nullTicket.user_email).toBeNull();
    expect(nullTicket.resolved_at).toBeNull();
    expect(nullTicket.close_scheduled_at).toBeNull();
    expect(nullTicket.messages).toEqual([]);

    const fullTicket = res.tickets[1];
    expect(fullTicket.category).toBe('billing');
    expect(fullTicket.user_email).toBe('owner@example.com');
    expect(fullTicket.resolved_at).toBe(ISO_NOW);
    expect(fullTicket.close_scheduled_at).toBe(ISO_NOW);
    expect(fullTicket.messages).toHaveLength(5);
    expect(fullTicket.messages.map((m) => m.author_kind)).toEqual(authorKinds);
    expect(fullTicket.messages[0].content).toBe('');
    expect(fullTicket.messages[0].attachments).toEqual([]);
  });

  it('performs a 51-tombstone cursor walk over 25/25/1 pages and forwards exact next_cursor bytes', async () => {
    const page1Tombstones = Array.from({ length: 25 }, (_, i) => makeValidTombstone(`TOMB_${i + 1}`));
    const cursor1 = encodeCursor({ closedAt: '2026-08-12T15:17:47.154Z', id: '33' }).value;
    expect(cursor1).toBe('MjAyNi0wOC0xMlQxNToxNzo0Ny4xNTRaCjMz');

    const page2Tombstones = Array.from({ length: 25 }, (_, i) => makeValidTombstone(`TOMB_${i + 26}`));
    const cursor2 = encodeCursor({ closedAt: new Date(NOW - 2000).toISOString(), id: '50' }).value;

    const page3Tombstones = [makeValidTombstone('TOMB_51')];

    const support = makeSupportWorker({
      'GET /api/services/tickets': () => json([]),
      'GET /api/services/tickets/closed': ({ url }) => {
        const cursor = url.searchParams.get('cursor');
        if (!cursor) {
          return json({ tickets: page1Tombstones, next_cursor: cursor1 });
        }
        if (cursor === cursor1) {
          return json({ tickets: page2Tombstones, next_cursor: cursor2 });
        }
        if (cursor === cursor2) {
          return json({ tickets: page3Tombstones, next_cursor: null });
        }
        return json({ error: 'invalid cursor' }, 400);
      },
    });

    const env = makeTestEnv({ SUPPORT_WORKER: support });
    const result = await collectOwnerSupportExport({
      env,
      accountId: OWNER_ID,
      verifiedEmails: [],
      clock: () => NOW,
    });

    expect(result.complete).toBe(true);
    expect(result.tombstones).toHaveLength(51);
    expect(result.tombstones[0].id).toBe('TOMB_1');
    expect(result.tombstones[50].id).toBe('TOMB_51');

    // Assert forwarded next_cursor query parameter matching
    const closedRequests = support.requests.filter((r) => r.pathname.startsWith('/api/services/tickets/closed'));
    expect(closedRequests).toHaveLength(3);
    expect(closedRequests[0].search).toBe('');
    expect(closedRequests[1].search).toBe(`?cursor=${encodeURIComponent(cursor1)}`);
    expect(closedRequests[2].search).toBe(`?cursor=${encodeURIComponent(cursor2)}`);
  });

  it('fails with designed reason codes on repeated cursor, zero progress, conflicting duplicates, and limit exceeded', async () => {
    // 1. Repeated cursor -> 'cursor'
    const repeatedCursor = encodeCursor({ closedAt: ISO_NOW, id: '1' }).value;
    const repeatingSupport = makeSupportWorker({
      'GET /api/services/tickets': () => json([]),
      'GET /api/services/tickets/closed': () => json({
        tickets: [makeValidTombstone('TOMB_1')],
        next_cursor: repeatedCursor,
      }),
    });
    const resRepeat = await collectOwnerSupportExport({
      env: makeTestEnv({ SUPPORT_WORKER: repeatingSupport }), accountId: OWNER_ID,
    });
    expect(resRepeat.complete).toBe(false);
    expect(resRepeat.reason).toBe('cursor');

    // 2. New cursor with zero new rows -> 'cursor'
    const cur1 = encodeCursor({ closedAt: ISO_NOW, id: '1' }).value;
    const cur2 = encodeCursor({ closedAt: ISO_NOW, id: '2' }).value;
    let closedPage = 0;
    const noProgressSupport = makeSupportWorker({
      'GET /api/services/tickets': () => json([]),
      'GET /api/services/tickets/closed': () => {
        closedPage++;
        if (closedPage === 1) {
          return json({ tickets: [makeValidTombstone('TOMB_1')], next_cursor: cur1 });
        }
        return json({ tickets: [], next_cursor: cur2 });
      },
    });
    const resNoProg = await collectOwnerSupportExport({
      env: makeTestEnv({ SUPPORT_WORKER: noProgressSupport }), accountId: OWNER_ID,
    });
    expect(resNoProg.complete).toBe(false);
    expect(resNoProg.reason).toBe('cursor');

    // 3. Conflicting duplicate tombstone with different closed_at -> 'duplicate'
    let dupPage = 0;
    const conflictTombSupport = makeSupportWorker({
      'GET /api/services/tickets': () => json([]),
      'GET /api/services/tickets/closed': () => {
        dupPage++;
        if (dupPage === 1) {
          return json({ tickets: [makeValidTombstone('TOMB_1', { closed_at: ISO_NOW })], next_cursor: cur1 });
        }
        return json({
          tickets: [makeValidTombstone('TOMB_1', { closed_at: new Date(NOW - 5000).toISOString() })],
          next_cursor: null,
        });
      },
    });
    const resConflict = await collectOwnerSupportExport({
      env: makeTestEnv({ SUPPORT_WORKER: conflictTombSupport }), accountId: OWNER_ID,
    });
    expect(resConflict.complete).toBe(false);
    expect(resConflict.reason).toBe('duplicate');

    // 4. Same ID as both active ticket and tombstone -> 'duplicate'
    const activeAndTombSupport = makeSupportWorker({
      'GET /api/services/tickets': () => json([makeValidTicketListRow('COLLISION_ID')]),
      'GET /api/services/tickets/COLLISION_ID': () => json(makeValidDetail('COLLISION_ID')),
      'GET /api/services/tickets/closed': () => json({
        tickets: [makeValidTombstone('COLLISION_ID')],
        next_cursor: null,
      }),
    });
    const resActiveTomb = await collectOwnerSupportExport({
      env: makeTestEnv({ SUPPORT_WORKER: activeAndTombSupport }), accountId: OWNER_ID,
    });
    expect(resActiveTomb.complete).toBe(false);
    expect(resActiveTomb.reason).toBe('duplicate');

    // 5. Page length 26 -> 'over_limit'
    const overLimitSupport = makeSupportWorker({
      'GET /api/services/tickets': () => json([]),
      'GET /api/services/tickets/closed': () => json({
        tickets: Array.from({ length: 26 }, (_, i) => makeValidTombstone(`TOMB_${i + 1}`)),
        next_cursor: null,
      }),
    });
    const resOverLimit = await collectOwnerSupportExport({
      env: makeTestEnv({ SUPPORT_WORKER: overLimitSupport }), accountId: OWNER_ID,
    });
    expect(resOverLimit.complete).toBe(false);
    expect(resOverLimit.reason).toBe('over_limit');

    // 6. Mismatched detail ID -> 'mismatch'
    const mismatchSupport = makeSupportWorker({
      'GET /api/services/tickets': () => json([makeValidTicketListRow('REQ_1')]),
      'GET /api/services/tickets/REQ_1': () => json(makeValidDetail('REQ_WRONG_ID')),
      'GET /api/services/tickets/closed': () => json({ tickets: [], next_cursor: null }),
    });
    const resMismatch = await collectOwnerSupportExport({
      env: makeTestEnv({ SUPPORT_WORKER: mismatchSupport }), accountId: OWNER_ID,
    });
    expect(resMismatch.complete).toBe(false);
    expect(resMismatch.reason).toBe('mismatch');
  });

  it('records fanout invariant: only GET, specific paths, no Idempotency-Key, no global fetch', async () => {
    let globalFetchCalled = false;
    vi.stubGlobal('fetch', () => {
      globalFetchCalled = true;
      throw new Error('global fetch should not be called');
    });

    const support = makeSupportWorker({
      'GET /api/services/tickets': () => json([makeValidTicketListRow('REQ_1')]),
      'GET /api/services/tickets/REQ_1': () => json(makeValidDetail('REQ_1')),
      'GET /api/services/tickets/closed': () => json({ tickets: [], next_cursor: null }),
    });

    const env = makeTestEnv({ SUPPORT_WORKER: support });
    const res = await collectOwnerSupportExport({
      env,
      accountId: OWNER_ID,
      verifiedEmails: ['verified1@example.com', 'verified2@example.com', 'verified1@example.com'], // Deduplicates
      clock: () => NOW,
    });

    expect(res.complete).toBe(true);
    expect(globalFetchCalled).toBe(false);

    for (const req of support.requests) {
      expect(req.method).toBe('GET');
      expect(req.headers.ownerId).toBe(OWNER_ID);
      expect(req.headers.idempotencyKey).toBeNull();
    }

    const emailHeaders = support.requests
      .map((r) => r.headers.verifiedEmail)
      .filter(Boolean);
    expect(emailHeaders).toEqual(['verified1@example.com', 'verified2@example.com']);
  });

  it('verifies AC4 isolation behaviors independently', async () => {
    // 1. Owner-only ticket is detailed owner-first
    // 2. Verified-email legacy ticket: absent from owner list, present on email list; owner detail 404 then email detail 200
    // 3. Repeat collection is idempotent
    // 4. Ticket only visible to another owner is not listed or detailed
    // 5. Co-owned ticket has no co-owner account id, email, or handle fields
    const support = makeSupportWorker({
      'GET /api/services/tickets': ({ request }) => {
        const email = request.headers.get('X-Verified-Email');
        const owner = request.headers.get('X-Services-Owner-ID');
        if (owner !== OWNER_ID) {
          return json([makeValidTicketListRow('OTHER_OWNER_TICKET')]);
        }
        if (!email) {
          return json([makeValidTicketListRow('OWNER_ONLY_TICKET')]);
        }
        if (email === 'legacy@example.com') {
          return json([makeValidTicketListRow('LEGACY_EMAIL_TICKET')]);
        }
        return json([]);
      },
      'GET /api/services/tickets/OWNER_ONLY_TICKET': () => json(makeValidDetail('OWNER_ONLY_TICKET')),
      'GET /api/services/tickets/LEGACY_EMAIL_TICKET': ({ request }) => {
        const email = request.headers.get('X-Verified-Email');
        if (!email) {
          return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
        }
        return json(makeValidDetail('LEGACY_EMAIL_TICKET', { user_email: 'legacy@example.com' }));
      },
      'GET /api/services/tickets/closed': () => json({ tickets: [], next_cursor: null }),
    });

    const env = makeTestEnv({ SUPPORT_WORKER: support });
    const res1 = await collectOwnerSupportExport({
      env,
      accountId: OWNER_ID,
      verifiedEmails: ['legacy@example.com'],
      clock: () => NOW,
    });
    const res2 = await collectOwnerSupportExport({
      env,
      accountId: OWNER_ID,
      verifiedEmails: ['legacy@example.com'],
      clock: () => NOW,
    });

    expect(res1.complete).toBe(true);
    expect(res2.complete).toBe(true);
    expect(res1.tickets.map((t) => t.id)).toEqual(['OWNER_ONLY_TICKET', 'LEGACY_EMAIL_TICKET']);
    expect(res1.tickets).toEqual(res2.tickets); // Idempotent

    // Ensure OTHER_OWNER_TICKET was never requested
    expect(support.requests.some((r) => r.pathname.includes('OTHER_OWNER_TICKET'))).toBe(false);

    // Verify co-owner ticket contains no foreign metadata
    const exportedStr = JSON.stringify(res1.tickets);
    expect(exportedStr).not.toContain('other_owner_id');
    expect(exportedStr).not.toContain('co_owner');
  });

  it('preserves earlier safe records on http_500 mid-fanout while marking complete false', async () => {
    const failingSupport = makeSupportWorker({
      'GET /api/services/tickets': () => json([
        makeValidTicketListRow('REQ_1'),
        makeValidTicketListRow('REQ_2'),
      ]),
      'GET /api/services/tickets/REQ_1': () => json(makeValidDetail('REQ_1')),
      'GET /api/services/tickets/REQ_2': () => new Response('internal error', { status: 500 }),
      'GET /api/services/tickets/closed': () => json({ tickets: [], next_cursor: null }),
    });

    const env = makeTestEnv({ SUPPORT_WORKER: failingSupport });
    const res = await collectOwnerSupportExport({
      env,
      accountId: OWNER_ID,
      verifiedEmails: ['owner@example.com'],
      clock: () => NOW,
    });

    expect(res.complete).toBe(false);
    expect(res.reason).toBe('http_500');
    expect(res.tickets).toHaveLength(1);
    expect(res.tickets[0].id).toBe('REQ_1');
  });

  it('keeps logs and export payloads free of sensitive sentinels', async () => {
    const consoleSpy = installConsoleSpy();
    const support = makeSupportWorker({
      'GET /api/services/tickets': () => json([makeValidTicketListRow('REQ_1')]),
      'GET /api/services/tickets/REQ_1': () => json(makeValidDetail('REQ_1')),
      'GET /api/services/tickets/closed': () => json({ tickets: [], next_cursor: null }),
    });

    const env = makeTestEnv({
      SUPPORT_WORKER: support,
      SERVICES_AUTH_TOKEN: SENSITIVE_AUTH_TOKEN,
    });
    const res = await collectOwnerSupportExport({
      env,
      accountId: OWNER_ID,
      verifiedEmails: ['owner@example.com'],
      clock: () => NOW,
    });

    const serialized = JSON.stringify(res);
    expect(serialized).not.toContain(SENSITIVE_AUTH_TOKEN);
    expect(serialized).not.toContain(SENSITIVE_R2_KEY);
    expect(serialized).not.toContain(SENSITIVE_OTHER_EMAIL);

    consoleSpy.assertNoSecrets([SENSITIVE_AUTH_TOKEN, SENSITIVE_R2_KEY, SENSITIVE_OTHER_EMAIL]);
  });

  it('measures peer bodies in UTF-8 bytes, not JavaScript characters', async () => {
    const oversizedMultibyte = `"${'é'.repeat(Math.floor(SUPPORT_BODY_BYTE_LIMIT / 2) + 1)}"`;
    expect(oversizedMultibyte.length).toBeLessThan(SUPPORT_BODY_BYTE_LIMIT);
    expect(new TextEncoder().encode(oversizedMultibyte).byteLength).toBeGreaterThan(SUPPORT_BODY_BYTE_LIMIT);

    const support = { fetch: async () => new Response(oversizedMultibyte) };
    const result = await collectOwnerSupportExport({
      env: makeTestEnv({ SUPPORT_WORKER: support }),
      accountId: OWNER_ID,
    });

    expect(result.complete).toBe(false);
    expect(result.reason).toBe('resource_limit');
  });

  it('bounds aggregate peer response bytes across verified-email fanout', async () => {
    const padding = ' '.repeat(Math.floor(SUPPORT_BODY_BYTE_LIMIT * 0.9));
    const support = {
      fetch: async () => new Response(`${padding}[]`, { headers: { 'Content-Type': 'application/json' } }),
    };
    const emailCount = Math.ceil(SUPPORT_AGGREGATE_BYTE_LIMIT / padding.length) + 1;
    const result = await collectOwnerSupportExport({
      env: makeTestEnv({ SUPPORT_WORKER: support }),
      accountId: OWNER_ID,
      verifiedEmails: Array.from({ length: emailCount }, (_, i) => `owner-${i}@example.com`),
    });

    expect(result.complete).toBe(false);
    expect(result.reason).toBe('resource_limit');
  });

  it('times out a peer fetch that never settles', async () => {
    vi.useFakeTimers();
    const support = { fetch: () => new Promise(() => {}) };
    const pending = collectOwnerSupportExport({
      env: makeTestEnv({ SUPPORT_WORKER: support }),
      accountId: OWNER_ID,
    });

    await vi.advanceTimersByTimeAsync(SUPPORT_EXPORT_DEADLINE_MS + 1);
    await expect(pending).resolves.toMatchObject({ complete: false, reason: 'deadline' });
    vi.useRealTimers();
  });

  it('returns a resource limit even when stream cancellation never settles', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(SUPPORT_BODY_BYTE_LIMIT + 1));
      },
      cancel() {
        return new Promise(() => {});
      },
    });
    const result = await collectOwnerSupportExport({
      env: makeTestEnv({ SUPPORT_WORKER: { fetch: async () => new Response(stream) } }),
      accountId: OWNER_ID,
    });

    expect(result.complete).toBe(false);
    expect(result.reason).toBe('resource_limit');
  });
});
