import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { decryptEmail, hashServiceHandoffNonce, hashWithPepper } from '../src/crypto.js';
import { verifyEnableResume } from '../src/enable.js';
import {
  TEST_CSRF,
  installConsoleSpy,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedScoutApplication,
  seedSession,
} from './helpers.js';

const VALID_NONCE = '2'.repeat(52);
const OTHER_NONCE = '3'.repeat(52);
const VALID_INSTANCE = '11111111-1111-1111-1111-111111111111';
const OTHER_INSTANCE = '22222222-2222-2222-2222-222222222222';
const SPB_SERVICE = 'spb_hosted';

describe('/enable/spb', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('rejects missing or malformed query params with the generic error page', async () => {
    const cases = [
      spbUrl({ nonce: '' }),
      spbUrl({ nonce: 'bad' }),
    ];

    for (const url of cases) {
      const response = await worker.fetch(new Request(url), makeTestEnv());
      const body = await response.text();
      expect(response.status).toBe(400);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Location')).toBeNull();
      expect(body).toContain("something didn't look right with that link.");
    }
  });

  it('redirects signed-out requests through the byte-preserving resume flow', async () => {
    const testEnv = makeTestEnv();
    const query = `?nonce=${VALID_NONCE}`;
    const response = await worker.fetch(new Request(`https://services.solstone.app/enable/spb${query}`), testEnv);
    const location = new URL(response.headers.get('Location'), 'https://services.solstone.app');
    const resume = await verifyEnableResume(location.searchParams.get('next'), location.searchParams.get('next_sig'), testEnv);

    expect(response.status).toBe(303);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(location.pathname).toBe('/');
    expect(resume).toEqual({ path: '/enable/spb', queryString: query });
  });

  it('redirects signed-out requests with a valid instance in the resume flow', async () => {
    const testEnv = makeTestEnv();
    const query = `?nonce=${VALID_NONCE}&instance=${VALID_INSTANCE}`;
    const response = await worker.fetch(new Request(`https://services.solstone.app/enable/spb${query}`), testEnv);
    const location = new URL(response.headers.get('Location'), 'https://services.solstone.app');
    const resume = await verifyEnableResume(location.searchParams.get('next'), location.searchParams.get('next_sig'), testEnv);

    expect(response.status).toBe(303);
    expect(resume).toEqual({ path: '/enable/spb', queryString: query });
  });

  it('renders signed-in consent with hidden csrf, nonce, and valid instance fields', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const response = await worker.fetch(new Request(spbUrl({ instance: VALID_INSTANCE }), {
      headers: { Cookie: session.cookie },
    }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toContain('this journal is asking to enable encrypted backup.');
    expect(body).toContain('name="csrf" value=');
    expect(body).toContain(`name="nonce" value="${VALID_NONCE}"`);
    expect(body).toContain(`name="instance" value="${VALID_INSTANCE}"`);
  });

  it('ignores malformed or repeated instance params on consent', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const malformed = await worker.fetch(new Request(spbUrl({ instance: 'zz' }), {
      headers: { Cookie: session.cookie },
    }), testEnv);
    const repeated = await worker.fetch(new Request(`${spbUrl()}&instance=${VALID_INSTANCE}&instance=${OTHER_INSTANCE}`, {
      headers: { Cookie: session.cookie },
    }), testEnv);

    for (const response of [malformed, repeated]) {
      const body = await response.text();
      expect(response.status).toBe(200);
      expect(body).not.toContain('name="instance"');
      expect(body).toContain('<a href="/services/spb">set up encrypted backup</a> — sol pbc keeps the encrypted copy for you.');
    }
  });

  it('enforces origin, csrf, cancel, and required instance guards on confirm', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const badOrigin = await worker.fetch(confirmRequest({ cookie: session.cookie, origin: 'https://bad.example' }), testEnv);
    expect(badOrigin.status).toBe(403);
    expect(badOrigin.headers.get('Cache-Control')).toBe('no-store');

    const badCsrf = await worker.fetch(confirmRequest({ cookie: session.cookie, csrf: 'bad' }), testEnv);
    expect(badCsrf.status).toBe(403);

    const cancel = await worker.fetch(confirmRequest({ cookie: session.cookie, action: 'cancel' }), testEnv);
    expect(cancel.status).toBe(303);
    expect(cancel.headers.get('Location')).toBe('/');

    for (const request of [
      confirmRequest({ cookie: session.cookie, extraForm: {} }),
      confirmRequest({ cookie: session.cookie, extraForm: { instance: 'bad' } }),
      repeatedInstanceConfirmRequest(session.cookie),
    ]) {
      const response = await worker.fetch(request, testEnv);
      expect(response.status).toBe(400);
    }
    await expect(rowCount('spb_bindings')).resolves.toBe(0);
    await expect(rowCount('service_handoffs')).resolves.toBe(0);
  });

  it('writes a needs-subscription handoff and token binding when unentitled', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(confirmRequest({
      cookie: session.cookie,
      extraForm: { instance: VALID_INSTANCE },
    }), testEnv);
    const body = await response.text();
    const payload = await decryptedHandoff(VALID_NONCE, testEnv);
    const binding = await spbBindingRow(account.accountId, VALID_INSTANCE);

    expect(response.status).toBe(200);
    expect(body).toContain('set up encrypted backup');
    expect(payload).toEqual({
      broker_endpoint: 'https://services.solstone.app',
      account_id: account.accountId,
      instance_id: VALID_INSTANCE,
      bucket: testEnv.R2_BUCKET,
      prefix: `users/${account.accountId}/${VALID_INSTANCE}/`,
      broker_token: expect.any(String),
      status: 'needs_subscription',
      subscribe_url: 'https://services.solstone.app/services/spb',
    });
    expect(binding).toMatchObject({
      account_id: account.accountId,
      instance_id: VALID_INSTANCE,
      token_hash: await hashWithPepper(payload.broker_token, testEnv),
    });
    expect(binding.lapsed_at).toBeGreaterThan(0);
  });

  it('writes an approved handoff and token binding when entitled', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedEntitlement({ accountId: account.accountId, service: SPB_SERVICE, status: 'active' });

    const response = await worker.fetch(confirmRequest({
      cookie: session.cookie,
      extraForm: { instance: VALID_INSTANCE },
    }), testEnv);
    const body = await response.text();
    const payload = await decryptedHandoff(VALID_NONCE, testEnv);
    const binding = await spbBindingRow(account.accountId, VALID_INSTANCE);

    expect(response.status).toBe(200);
    expect(body).toContain('encrypted backup is approved for this journal. you can close this tab.');
    expect(payload).toEqual({
      broker_endpoint: 'https://services.solstone.app',
      account_id: account.accountId,
      instance_id: VALID_INSTANCE,
      bucket: testEnv.R2_BUCKET,
      prefix: `users/${account.accountId}/${VALID_INSTANCE}/`,
      broker_token: expect.any(String),
      status: 'approved',
    });
    expect(binding.token_hash).toBe(await hashWithPepper(payload.broker_token, testEnv));
    expect(binding.lapsed_at).toBeNull();
  });

  it('approves comped scouts through reconcileSpbEntitlement', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 1_000 });

    const response = await worker.fetch(confirmRequest({
      cookie: session.cookie,
      extraForm: { instance: VALID_INSTANCE },
    }), testEnv);
    const payload = await decryptedHandoff(VALID_NONCE, testEnv);

    expect(response.status).toBe(200);
    expect(payload.status).toBe('approved');
    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'active',
      source: 'comp',
    });
  });

  it('mints a broker token that authenticates against the backup credential broker', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedEntitlement({ accountId: account.accountId, service: SPB_SERVICE, status: 'active' });

    const confirm = await worker.fetch(confirmRequest({
      cookie: session.cookie,
      extraForm: { instance: VALID_INSTANCE },
    }), testEnv);
    const payload = await decryptedHandoff(VALID_NONCE, testEnv);
    const binding = await spbBindingRow(account.accountId, VALID_INSTANCE);
    const broker = await worker.fetch(new Request('https://services.solstone.app/backup/credentials', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${payload.broker_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope: 'backup' }),
    }), testEnv);
    const brokerBody = await broker.json();

    expect(confirm.status).toBe(200);
    expect(binding.token_hash).toBe(await hashWithPepper(payload.broker_token, testEnv));
    expect(broker.status).toBe(200);
    expect(brokerBody.bucket).toBe(testEnv.R2_BUCKET);
    expect(brokerBody.prefix).toBe(`users/${account.accountId}/${VALID_INSTANCE}/`);
  });

  it('does not leak the cleartext broker token to logs, locations, or response bodies', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedEntitlement({ accountId: account.accountId, service: SPB_SERVICE, status: 'active' });
    try {
      const response = await worker.fetch(confirmRequest({
        cookie: session.cookie,
        extraForm: { instance: VALID_INSTANCE },
      }), testEnv);
      const payload = await decryptedHandoff(VALID_NONCE, testEnv);
      const row = await serviceHandoffRow(VALID_NONCE, testEnv);
      const body = await response.text();
      const bad = await worker.fetch(confirmRequest({
        cookie: session.cookie,
        nonce: OTHER_NONCE,
        extraForm: { instance: 'bad', broker_token: payload.broker_token },
      }), testEnv);
      const badBody = await bad.text();

      expect(response.headers.get('Location')).toBeNull();
      expect(body).not.toContain(payload.broker_token);
      expect(bad.headers.get('Location')).toBeNull();
      expect(badBody).not.toContain(payload.broker_token);
      spy.assertNoSecrets([VALID_NONCE, payload.broker_token, row.payload_encrypted]);
    } finally {
      spy.restore();
    }
  });
});

function spbUrl(overrides = {}) {
  const params = new URLSearchParams({
    nonce: VALID_NONCE,
    ...overrides,
  });
  return `https://services.solstone.app/enable/spb?${params.toString()}`;
}

function confirmRequest({
  cookie,
  nonce = VALID_NONCE,
  action = 'allow',
  csrf = TEST_CSRF,
  origin = 'https://services.solstone.app',
  extraForm = { instance: VALID_INSTANCE },
} = {}) {
  const body = new URLSearchParams({
    csrf,
    nonce,
    action,
    ...extraForm,
  });
  const headers = {
    Origin: origin,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (cookie) headers.Cookie = cookie;
  return new Request('https://services.solstone.app/enable/spb/confirm', {
    method: 'POST',
    headers,
    body,
  });
}

function repeatedInstanceConfirmRequest(cookie) {
  const body = new URLSearchParams({
    csrf: TEST_CSRF,
    nonce: VALID_NONCE,
    action: 'allow',
  });
  body.append('instance', VALID_INSTANCE);
  body.append('instance', OTHER_INSTANCE);
  return new Request('https://services.solstone.app/enable/spb/confirm', {
    method: 'POST',
    headers: {
      Origin: 'https://services.solstone.app',
      Cookie: cookie,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
}

async function decryptedHandoff(nonce, testEnv) {
  const row = await serviceHandoffRow(nonce, testEnv);
  expect(row).not.toBeNull();
  return JSON.parse(await decryptEmail(row.payload_encrypted, testEnv));
}

async function serviceHandoffRow(nonce, testEnv) {
  return workerEnv.DB
    .prepare('SELECT payload_encrypted FROM service_handoffs WHERE handoff_hash = ? AND service = ?')
    .bind(await hashServiceHandoffNonce(nonce, testEnv), 'spb')
    .first();
}

async function spbBindingRow(accountId, instanceId) {
  return workerEnv.DB
    .prepare(
      `SELECT account_id, instance_id, created_at, last_seen_at, token_hash, lapsed_at
       FROM spb_bindings
       WHERE account_id = ? AND instance_id = ?`
    )
    .bind(accountId, instanceId)
    .first();
}

async function entitlementRow(accountId) {
  return workerEnv.DB
    .prepare('SELECT account_id, service, status, current_period_end, source, source_ref, updated_at FROM entitlements WHERE account_id = ? AND service = ?')
    .bind(accountId, SPB_SERVICE)
    .first();
}

async function rowCount(table) {
  const row = await workerEnv.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
  return row.count;
}
