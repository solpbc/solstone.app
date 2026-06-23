import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { encryptEmail } from '../src/crypto.js';
import {
  TEST_CSRF,
  emailAddRequest,
  installGcpFetchMock,
  makeSupportWorker,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedCredential,
  seedDevice,
  seedEntitlement,
  seedSession,
  startRequest,
  stubTurnstile,
} from './helpers.js';

const VALID_ENABLE_NONCE = '2'.repeat(52);

const FORBIDDEN_PHRASES = [
  'your account',
  'your sol pbc account',
  'account settings',
  'account security',
  'create an account',
  'sign up for solstone',
  'sign up for sol pbc',
  'manage your account',
  'set up your sol pbc account',
  'log in to solstone',
  'log in required',
  'premium services',
  'your service plan',
  'free trial',
  'service status: trial',
  'machine',
  'let solstone',
  'solstone is hosting',
  'private container',
  'solstone private notifications',
  'solstone host',
  'solstone hosted',
  'private link',
];

const SERVICE_VERBS = [
  'activate',
  'subscribe to',
  'sign up for',
  'upgrade your',
  'unlock',
];

const forbiddenRe = new RegExp(FORBIDDEN_PHRASES.map(escapeRe).join('|'), 'i');
const serviceVerbRe = new RegExp(SERVICE_VERBS.map(escapeRe).join('|'), 'i');
const stripHref = (html) => html.replace(/href="[^"]*"/gi, 'href=""');
const enableSurfaceStrictRe = /\b(sign\s+in|signed\s+in|signing\s+in|log\s+in|logged\s+in|your\s+account|account\s+settings|linked|authenticate)\b/i;
const VALID_PUSH_NONCE = '2'.repeat(52);
const VALID_PUSH_DEVICE_TOKEN = 'A'.repeat(64);
const VALID_PUSH_BUNDLE_ID = 'app.solstone.swift';
const VALID_SPL_NONCE = '3'.repeat(52);
const VALID_SPL_ENTITLED_NONCE = '4'.repeat(52);
const VALID_SPB_NONCE = '5'.repeat(52);
const VALID_SPB_ENTITLED_NONCE = '6'.repeat(52);
const VALID_SPB_INSTANCE = '11111111-1111-1111-1111-111111111111';

describe('brand canon', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps forbidden account/service-plan copy and lowercase gemini out of HTML surfaces', async () => {
    const support = makeSupportWorker({
      'GET /api/services/tickets': async () => json({ tickets: [
        { id: 'REQ_CANON', subject: 'canon request', status: 'open', updated_at: Date.now() },
      ] }),
      'GET /api/services/tickets/REQ_CANON': async () => json({
        ticket: { id: 'REQ_CANON', subject: 'canon request', status: 'open', updated_at: Date.now() },
        messages: [{ author_kind: 'human', content: 'canon message', created_at: Date.now() }],
        attachments: [],
      }),
    });
    const testEnv = makeTestEnv({ SUPPORT_WORKER: support });
    installGcpFetchMock({
      'POST oauth2.googleapis.com/token': async () => json({ access_token: 'token', expires_in: 3600, token_type: 'Bearer' }),
      'GET apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys': async () => json({
        keys: [{
          name: 'projects/test-gcp-project/locations/global/keys/scout-active',
          displayName: 'scout-active',
          lastUseTime: '2026-05-24T00:00:00Z',
        }],
      }),
    });

    const withPasskey = await seedAccount({ email: 'canon@example.com', testEnv });
    const withPasskeySession = await seedSession(withPasskey.accountId, { testEnv });
    await seedCredential({ accountId: withPasskey.accountId, credentialId: 'canon-passkey' });
    await seedDevice({ accountId: withPasskey.accountId, deviceId: 'canon-device' });
    await seedProvisionedKey({
      testEnv,
      accountId: withPasskey.accountId,
      displayName: 'scout-active',
      keyResourceName: 'projects/test-gcp-project/locations/global/keys/scout-active',
      keyString: 'canon-scout-key',
    });

    const noPasskey = await seedAccount({ email: 'welcome@example.com', testEnv });
    const noPasskeySession = await seedSession(noPasskey.accountId, { testEnv });
    const noScout = await seedAccount({ email: 'empty-scout@example.com', testEnv });
    const noScoutSession = await seedSession(noScout.accountId, { testEnv });
    await seedCredential({ accountId: noScout.accountId, credentialId: 'empty-passkey' });
    const splActive = await seedAccount({ email: 'spl-active@example.com', testEnv });
    const splActiveSession = await seedSession(splActive.accountId, { testEnv });
    await seedEntitlement({ accountId: splActive.accountId, status: 'active' });
    const splEmpty = await seedAccount({ email: 'spl-empty@example.com', testEnv });
    const splEmptySession = await seedSession(splEmpty.accountId, { testEnv });
    const spbActive = await seedAccount({ email: 'spb-active@example.com', testEnv });
    const spbActiveSession = await seedSession(spbActive.accountId, { testEnv });
    await seedEntitlement({ accountId: spbActive.accountId, service: 'spb_hosted', status: 'active' });
    const spbEmpty = await seedAccount({ email: 'spb-empty@example.com', testEnv });
    const spbEmptySession = await seedSession(spbEmpty.accountId, { testEnv });

    const surfaces = [
      ['signed-out landing', await get('/', testEnv)],
      ['signed-in services dashboard', await get('/', testEnv, withPasskeySession.cookie), true],
      ['signed-in welcome services dashboard', await get('/', testEnv, noPasskeySession.cookie), true],
      ['sign-in hub', await get('/sign-in', testEnv, withPasskeySession.cookie), true],
      ['sessions', await get('/sign-in/sessions', testEnv, withPasskeySession.cookie), true],
      ['passkeys', await get('/sign-in/passkeys', testEnv, withPasskeySession.cookie), true],
      ['emails', await get('/sign-in/emails', testEnv, withPasskeySession.cookie), true],
      ['data', await get('/transparency', testEnv, withPasskeySession.cookie), true],
      ['scout active', await get('/scout', testEnv, withPasskeySession.cookie), true],
      ['scout empty', await get('/scout', testEnv, noScoutSession.cookie), true],
      ['private-network active', await get('/private-network', testEnv, splActiveSession.cookie), true],
      ['private-network empty', await get('/private-network', testEnv, splEmptySession.cookie), true],
      ['operated backup active', await get('/services/spb', testEnv, spbActiveSession.cookie), true],
      ['operated backup empty', await get('/services/spb', testEnv, spbEmptySession.cookie), true],
      ['devices', await get('/devices', testEnv, withPasskeySession.cookie), true],
      ['support list', await get('/support', testEnv, withPasskeySession.cookie), true],
      ['support detail', await get('/support/REQ_CANON', testEnv, withPasskeySession.cookie), true],
      ['support not found', await get('/support/bad.id', testEnv, withPasskeySession.cookie), true],
      ['enable scout consent', await get(`/enable/scout?nonce=${VALID_ENABLE_NONCE}`, testEnv, withPasskeySession.cookie), true],
      ['enable scout no-nonce error', await get('/enable/scout', testEnv)],
      ['verify code', await get('/signin/verify', testEnv)],
      ['goodbye', await get('/goodbye', testEnv)],
      ['not found', await get('/not-found', testEnv)],
      ['forbidden', await post('/signin/verify', testEnv, new URLSearchParams({ email: 'x@example.com', code: '123456' }))],
      ['error', await errorResponse()],
    ];

    const violations = [];
    for (const [name, response, signedIn = false] of surfaces) {
      const body = await response.text();
      const scanBody = stripHref(body);
      if (forbiddenRe.test(scanBody)) violations.push(`${name}: forbidden phrase`);
      if (serviceVerbRe.test(scanBody)) violations.push(`${name}: service verb`);
      if (/\bgemini\b/.test(scanBody)) violations.push(`${name}: lowercase gemini`);
      if (signedIn) expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
    expect(violations).toEqual([]);
  });

  it('keeps enable handoff surfaces clean under the stricter service regex', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'push-canon@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const splAccount = await seedAccount({ email: 'spl-canon@example.com', testEnv });
    const splSession = await seedSession(splAccount.accountId, { testEnv });
    await seedEntitlement({ accountId: splAccount.accountId, status: 'active' });
    const consent = await get(pushPath(), testEnv, session.cookie);
    const done = await post('/enable/push/confirm', testEnv, new URLSearchParams({
      csrf: TEST_CSRF,
      nonce: VALID_PUSH_NONCE,
      device_token: VALID_PUSH_DEVICE_TOKEN,
      platform: 'ios',
      bundle_id: VALID_PUSH_BUNDLE_ID,
      action: 'allow',
    }), session.cookie);
    const error = await get('/enable/push', testEnv);
    const splUnentitledConsent = await get(`/enable/spl?nonce=${VALID_SPL_NONCE}`, testEnv, session.cookie);
    const splNeedsSubscription = await post('/enable/spl/confirm', testEnv, new URLSearchParams({
      csrf: TEST_CSRF,
      nonce: VALID_SPL_NONCE,
      action: 'allow',
    }), session.cookie);
    const splEntitledConsent = await get(`/enable/spl?nonce=${VALID_SPL_ENTITLED_NONCE}`, testEnv, splSession.cookie);
    const splApproved = await post('/enable/spl/confirm', testEnv, new URLSearchParams({
      csrf: TEST_CSRF,
      nonce: VALID_SPL_ENTITLED_NONCE,
      action: 'allow',
    }), splSession.cookie);
    const splError = await get('/enable/spl', testEnv);
    const spbAccount = await seedAccount({ email: 'spb-canon@example.com', testEnv });
    const spbSession = await seedSession(spbAccount.accountId, { testEnv });
    const spbEntitledAccount = await seedAccount({ email: 'spb-entitled-canon@example.com', testEnv });
    const spbEntitledSession = await seedSession(spbEntitledAccount.accountId, { testEnv });
    await seedEntitlement({ accountId: spbEntitledAccount.accountId, service: 'spb_hosted', status: 'active' });
    const spbUnentitledConsent = await get(`/enable/spb?nonce=${VALID_SPB_NONCE}`, testEnv, spbSession.cookie);
    const spbNeedsSubscription = await post('/enable/spb/confirm', testEnv, new URLSearchParams({
      csrf: TEST_CSRF,
      nonce: VALID_SPB_NONCE,
      instance: VALID_SPB_INSTANCE,
      action: 'allow',
    }), spbSession.cookie);
    const spbEntitledConsent = await get(`/enable/spb?nonce=${VALID_SPB_ENTITLED_NONCE}&instance=${VALID_SPB_INSTANCE}`, testEnv, spbEntitledSession.cookie);
    const spbApproved = await post('/enable/spb/confirm', testEnv, new URLSearchParams({
      csrf: TEST_CSRF,
      nonce: VALID_SPB_ENTITLED_NONCE,
      instance: VALID_SPB_INSTANCE,
      action: 'allow',
    }), spbEntitledSession.cookie);
    const spbError = await get('/enable/spb', testEnv);

    expect('your sign-in').not.toMatch(enableSurfaceStrictRe);
    for (const [name, response] of [
      ['enable notifications consent', consent],
      ['enable notifications done', done],
      ['enable notifications error', error],
      ['enable spl unentitled consent', splUnentitledConsent],
      ['enable spl needs subscription', splNeedsSubscription],
      ['enable spl entitled consent', splEntitledConsent],
      ['enable spl approved', splApproved],
      ['enable spl error', splError],
      ['enable spb unentitled consent', spbUnentitledConsent],
      ['enable spb needs subscription', spbNeedsSubscription],
      ['enable spb entitled consent', spbEntitledConsent],
      ['enable spb approved', spbApproved],
      ['enable spb error', spbError],
    ]) {
      const body = await response.text();
      const scanBody = stripHref(body);
      expect(scanBody, name).not.toMatch(forbiddenRe);
      expect(body, name).not.toMatch(enableSurfaceStrictRe);
    }
  });

  it('keeps forbidden copy out of transactional emails', async () => {
    const testEnv = makeTestEnv();
    stubTurnstile(true);

    await worker.fetch(startRequest('otp@example.com'), testEnv);
    scanEmail('otp', testEnv.EMAIL.sent[0]);

    const account = await seedAccount({ email: 'owner@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const ctx = createExecutionContext();
    await worker.fetch(emailAddRequest({ address: 'verify@example.com', cookie: session.cookie }), testEnv, ctx);
    await waitOnExecutionContext(ctx);
    scanEmail('verify', testEnv.EMAIL.sent[1]);
  });
});

async function get(path, testEnv, cookie = '') {
  const headers = cookie ? { Cookie: cookie } : {};
  return worker.fetch(new Request(`https://services.solstone.app${path}`, { headers }), testEnv);
}

async function post(path, testEnv, body, cookie = '') {
  const headers = {
    Origin: 'https://services.solstone.app',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (cookie) headers.Cookie = cookie;
  return worker.fetch(new Request(`https://services.solstone.app${path}`, {
    method: 'POST',
    headers,
    body,
  }), testEnv);
}

async function errorResponse() {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    return await worker.fetch(new Request('https://services.solstone.app/', {
      headers: { Cookie: 'account_session=bad-token' },
    }), makeTestEnv({
      DB: {
        prepare() {
          throw new Error('db unavailable');
        },
      },
    }));
  } finally {
    error.mockRestore();
  }
}

async function seedProvisionedKey({
  testEnv,
  accountId,
  id = crypto.randomUUID(),
  displayName,
  keyResourceName,
  keyString,
  createdAt = Date.now(),
}) {
  await testEnv.DB
    .prepare(
      `INSERT INTO provisioned_keys (
         id, account_id, provider, display_name, key_resource_name,
         key_string_encrypted, created_at
       ) VALUES (?, ?, 'gemini', ?, ?, ?, ?)`
    )
    .bind(id, accountId, displayName, keyResourceName, await encryptEmail(keyString, testEnv), createdAt)
    .run();
}

function scanEmail(name, message) {
  expect(message, `${name} email sent`).toBeTruthy();
  expect(message.from).toBe('solstone services <services@solstone.app>');
  for (const field of ['from', 'subject', 'text', 'html']) {
    expect(message[field], `${name} email ${field}`).not.toMatch(forbiddenRe);
    expect(message[field], `${name} email ${field}`).not.toMatch(serviceVerbRe);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function pushPath() {
  return `/enable/push?nonce=${VALID_PUSH_NONCE}&device_token=${VALID_PUSH_DEVICE_TOKEN}&platform=ios&bundle_id=${VALID_PUSH_BUNDLE_ID}`;
}

function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
