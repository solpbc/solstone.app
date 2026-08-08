import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  TEST_CSRF,
  makeSupportWorker,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedSession,
} from './helpers.js';

const REJECTED_ORIGINS = [
  ['missing Origin', null], ['http scheme', 'http://services.solstone.app'],
  ['deceptive prefix', 'https://services.solstone.app.evil.test'], ['foreign origin', 'https://evil.example'],
  ['localhost', 'http://localhost:8787'], ['null origin', 'null'], ['malformed origin', 'not a url'],
];

describe('support origin enforcement', () => {
  beforeEach(async () => { await resetDb(); vi.restoreAllMocks(); });

  for (const route of supportPostRoutes()) {
    it(`accepts the exact origin for ${route.name}`, async () => {
      const { testEnv, session, support } = await signedInSupportEnv();
      const response = await worker.fetch(route.request(session.cookie, { origin: 'https://services.solstone.app' }), testEnv);
      expect(response.status).toBe(200);
      expect(support.requests).not.toHaveLength(0);
    });

    for (const [name, origin] of REJECTED_ORIGINS) {
      it(`rejects ${name} for ${route.name} before binding I/O`, async () => {
        const { testEnv, session, support } = await signedInSupportEnv();
        const response = await worker.fetch(route.request(session.cookie, { origin }), testEnv);
        expect(response.status).toBe(403);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(support.requests).toHaveLength(0);
      });
    }

    it(`rejects Referer-only requests for ${route.name} before binding I/O`, async () => {
      const { testEnv, session, support } = await signedInSupportEnv();
      const response = await worker.fetch(route.request(session.cookie, { origin: null, referer: 'https://services.solstone.app/support' }), testEnv);
      expect(response.status).toBe(403);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(support.requests).toHaveLength(0);
    });

    if (route.invalidPath) {
      it(`rejects a foreign origin before invalid-id validation for ${route.name}`, async () => {
        const { testEnv, session, support } = await signedInSupportEnv();
        const request = supportRequest(route.invalidPath, session.cookie, route.fields, { origin: 'https://evil.example' }, route.file);
        const response = await worker.fetch(request, testEnv);
        expect(response.status).toBe(403);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(support.requests).toHaveLength(0);
      });
    }
  }
});

function supportPostRoutes() {
  return [
    { name: 'create', path: '/support', fields: { product: 'solstone', subject: 'help me', description: 'details here', attachment_operation_key: KEY_B } },
    { name: 'reply', path: '/support/REQ_1/reply', invalidPath: '/support/bad.id/reply', fields: { content: 'reply body', attachment_operation_key: KEY_B } },
    { name: 'attachments', path: '/support/REQ_1/attachments', invalidPath: '/support/bad.id/attachments', fields: {}, file: new File(['bytes'], 'proof.log', { type: 'text/plain' }) },
    { name: 'resolution', path: '/support/REQ_1/resolution', invalidPath: '/support/bad.id/resolution', fields: { outcome: 'still_need_help' } },
    { name: 'close', path: '/support/REQ_1/close', invalidPath: '/support/bad.id/close', fields: { confirmation: 'remove_details', confirmation_control: 'checkbox' } },
  ].map((route) => ({ ...route, request: (cookie, options) => supportRequest(route.path, cookie, route.fields, options, route.file) }));
}

async function signedInSupportEnv() {
  const support = makeSupportWorker({
    'POST /api/services/tickets': () => json({ id: 'REQ_NEW', created_at: Date.now(), status: 'open' }),
    'POST /api/services/tickets/REQ_1/messages': () => json({ ticket_id: 'REQ_1', message_id: 'MSG_1', created_at: Date.now(), status: 'accepted' }),
    'POST /api/services/tickets/REQ_1/attachments': () => json({ ticket_id: 'REQ_1', attachment_ids: ['ATT_1'], status: 'accepted' }),
    'POST /api/services/tickets/REQ_1/resolution': () => json({ id: 'REQ_1', status: 'open', close_scheduled_at: null }),
    'POST /api/services/tickets/REQ_1/close': () => json(tombstone()),
    'POST /api/services/idempotency/ack': () => new Response(null, { status: 204 }),
    'GET /api/services/tickets/REQ_1': () => json(detail()),
  });
  const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
  const account = await seedAccount({ email: 'primary@example.com', testEnv });
  const session = await seedSession(account.accountId, { testEnv });
  return { testEnv, session, support };
}

function supportRequest(path, cookie, fields, { origin, referer } = {}, file = null) {
  const body = new FormData();
  body.set('csrf', TEST_CSRF);
  body.set('operation_key', KEY_A);
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  if (file) body.append('file', file);
  const headers = { Cookie: cookie };
  if (origin != null) headers.Origin = origin;
  if (referer != null) headers.Referer = referer;
  return new Request(`https://services.solstone.app${path}`, { method: 'POST', headers, body });
}

function detail() { return { ticket: { id: 'REQ_1', subject: 'detail', status: 'open', updated_at: Date.now() }, messages: [], attachments: [] }; }
function tombstone() { return { id: 'REQ_1', created_at: '2026-08-01T00:00:00.000Z', closed_at: '2026-08-02T00:00:00.000Z', status: 'closed', content_removed: true }; }
function json(body) { return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }); }
const KEY_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const KEY_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
