import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { decryptEmail, encryptEmail, hashServiceHandoffNonce, hashWithPepper } from '../src/crypto.js';
import { verifyEnableResume } from '../src/enable.js';
import {
  TEST_CSRF,
  installConsoleSpy,
  makeTestEnv,
  resetDb,
  rowCount,
  seedAccount,
  seedScoutApplication,
  seedSession,
} from './helpers.js';

const VALID_NONCE = '7'.repeat(52);
const OTHER_NONCE = '8'.repeat(52);
const VALID_INSTANCE = '11111111-1111-1111-1111-111111111111';
const OTHER_INSTANCE = '22222222-2222-2222-2222-222222222222';
const SPP_SERVICE = 'spp_hosted';

describe('/enable/spp', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('rejects missing or malformed query params with the generic error page', async () => {
    const cases = [
      sppUrl({ nonce: '' }),
      sppUrl({ nonce: 'bad' }),
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
    const response = await worker.fetch(new Request(`https://services.solstone.app/enable/spp${query}`), testEnv);
    const location = new URL(response.headers.get('Location'), 'https://services.solstone.app');
    const resume = await verifyEnableResume(location.searchParams.get('next'), location.searchParams.get('next_sig'), testEnv);

    expect(response.status).toBe(303);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(location.pathname).toBe('/');
    expect(resume).toEqual({ path: '/enable/spp', queryString: query });
  });

  it('redirects signed-out requests with a valid instance in the resume flow', async () => {
    const testEnv = makeTestEnv();
    const query = `?nonce=${VALID_NONCE}&instance=${VALID_INSTANCE}`;
    const response = await worker.fetch(new Request(`https://services.solstone.app/enable/spp${query}`), testEnv);
    const location = new URL(response.headers.get('Location'), 'https://services.solstone.app');
    const resume = await verifyEnableResume(location.searchParams.get('next'), location.searchParams.get('next_sig'), testEnv);

    expect(response.status).toBe(303);
    expect(resume).toEqual({ path: '/enable/spp', queryString: query });
  });

  it('renders approved-scout consent with hidden csrf, nonce, and instance fields', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 1_000 });

    const response = await worker.fetch(new Request(sppUrl({ instance: VALID_INSTANCE }), {
      headers: { Cookie: session.cookie },
    }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toContain("this journal is asking to turn on confidential processing. here's exactly what that means — and it stays off until you allow it.");
    expect(body).toContain('href="/confidential-processing/data"');
    expect(body).toContain('name="data_ack" value="yes" required');
    expect(body).toContain('i understand what turning this on sends, and that my journal must verify the service before anything is sent.');
    expect(body).toContain('name="action" value="cancel" type="submit" formnovalidate');
    expect(body).toContain('name="csrf" value=');
    expect(body).toContain(`name="nonce" value="${VALID_NONCE}"`);
    expect(body).toContain(`name="instance" value="${VALID_INSTANCE}"`);
  });

  it('creates a content-free early-access handoff and refusal audit for a non-scout with an instance', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(new Request(sppUrl({ instance: VALID_INSTANCE }), {
      headers: { Cookie: session.cookie },
    }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('confidential processing is coming');
    await expect(decryptedHandoff(VALID_NONCE, testEnv)).resolves.toEqual({ state: 'early_access' });
    await expect(rowCount('service_handoffs')).resolves.toBe(1);
    await expect(rowCount('spp_mint_audit')).resolves.toBe(1);
    await expect(sppMintAuditRow(account.accountId, VALID_INSTANCE)).resolves.toMatchObject({
      scope: 'inference',
      outcome: 'refused_entitlement',
    });
    await expect(rowCount('spp_bindings')).resolves.toBe(0);
    await expect(entitlementRow(account.accountId)).resolves.toBeNull();
  });

  it('returns a non-scout early-access handoff once through the polling endpoint', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const enable = await worker.fetch(new Request(sppUrl({ instance: VALID_INSTANCE }), {
      headers: { Cookie: session.cookie },
    }), testEnv);
    const first = await worker.fetch(
      new Request(`https://services.solstone.app/handoff/spp?nonce=${VALID_NONCE}`),
      testEnv
    );
    const second = await worker.fetch(
      new Request(`https://services.solstone.app/handoff/spp?nonce=${VALID_NONCE}`),
      testEnv
    );

    expect(enable.status).toBe(200);
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ state: 'early_access' });
    expect(second.status).toBe(410);
    await expect(second.json()).resolves.toEqual({ error: 'gone' });
  });

  it('renders early access without an enrollment affordance or audit when no instance is present', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const response = await worker.fetch(new Request(sppUrl(), {
      headers: { Cookie: session.cookie },
    }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('confidential processing is coming');
    expect(body).not.toContain('action="/enable/spp/confirm"');
    expect(body).not.toContain('name="action"');
    await expect(decryptedHandoff(VALID_NONCE, testEnv)).resolves.toEqual({ state: 'early_access' });
    await expect(rowCount('service_handoffs')).resolves.toBe(1);
    await expect(rowCount('spp_mint_audit')).resolves.toBe(0);
  });

  it('keeps repeated non-scout GETs idempotent', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const request = () => new Request(sppUrl({ instance: VALID_INSTANCE }), {
      headers: { Cookie: session.cookie },
    });

    const first = await worker.fetch(request(), testEnv);
    const second = await worker.fetch(request(), testEnv);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await expect(rowCount('service_handoffs')).resolves.toBe(1);
    await expect(decryptedHandoff(VALID_NONCE, testEnv)).resolves.toEqual({ state: 'early_access' });
    await expect(rowCount('spp_mint_audit')).resolves.toBe(1);
    await expect(rowCount('spp_bindings')).resolves.toBe(0);
    await expect(entitlementRow(account.accountId)).resolves.toBeNull();
  });

  it('fails closed without a handoff or audit when early-access encryption fails', async () => {
    const testEnv = makeTestEnv();
    const brokenEnv = makeTestEnv({ ENCRYPTION_SECRET: 'AAAA' });
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(new Request(sppUrl({ instance: VALID_INSTANCE }), {
      headers: { Cookie: session.cookie },
    }), brokenEnv);

    expect(response.status).toBe(503);
    await expect(rowCount('service_handoffs')).resolves.toBe(0);
    await expect(rowCount('spp_mint_audit')).resolves.toBe(0);
  });

  it('treats a duplicate non-scout handoff as success without overwriting or re-auditing', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const sentinel = { state: 'sentinel', marker: 'pre-existing' };
    await insertSppHandoff({ testEnv, accountId: account.accountId, nonce: VALID_NONCE, payload: sentinel });
    const preparedSql = [];
    const recordingEnv = recordPreparedSql(testEnv, preparedSql);

    const response = await worker.fetch(new Request(sppUrl({ instance: VALID_INSTANCE }), {
      headers: { Cookie: session.cookie },
    }), recordingEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('confidential processing is coming');
    expect(preparedSql.some((sql) => /INSERT INTO service_handoffs/i.test(sql))).toBe(true);
    await expect(decryptedHandoff(VALID_NONCE, testEnv)).resolves.toEqual(sentinel);
    await expect(rowCount('service_handoffs')).resolves.toBe(1);
    await expect(rowCount('spp_mint_audit')).resolves.toBe(0);
    await expect(rowCount('spp_bindings')).resolves.toBe(0);
  });

  it('keeps the non-scout early-access handoff content-free and out of logs', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    try {
      const response = await worker.fetch(new Request(sppUrl({ instance: VALID_INSTANCE }), {
        headers: { Cookie: session.cookie },
      }), testEnv);
      const row = await serviceHandoffRow(VALID_NONCE, testEnv);
      const payload = await decryptedHandoff(VALID_NONCE, testEnv);
      const serialized = JSON.stringify(payload);

      expect(response.status).toBe(200);
      expect(payload).toEqual({ state: 'early_access' });
      expect(serialized).not.toContain(account.accountId);
      expect(serialized).not.toContain(VALID_INSTANCE);
      spy.assertNoSecrets([VALID_NONCE, row.payload_encrypted]);
    } finally {
      spy.restore();
    }
  });

  for (const status of ['pending', 'revoked']) {
    it(`renders early access for a ${status} scout application`, async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ email: `${status}-spp@example.com`, testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      await seedScoutApplication({ accountId: account.accountId, status });

      const response = await worker.fetch(new Request(sppUrl({ instance: VALID_INSTANCE }), {
        headers: { Cookie: session.cookie },
      }), testEnv);
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).toContain('confidential processing is coming');
      expect(body).not.toContain('action="/enable/spp/confirm"');
      expect(body).not.toContain('name="action"');
      await expect(decryptedHandoff(VALID_NONCE, testEnv)).resolves.toEqual({ state: 'early_access' });
      await expect(rowCount('spp_mint_audit')).resolves.toBe(1);
      await expect(sppMintAuditRow(account.accountId, VALID_INSTANCE)).resolves.toMatchObject({
        scope: 'inference',
        outcome: 'refused_entitlement',
      });
    });
  }

  it('enforces origin, csrf, cancel, and required instance guards on confirm', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 1_000 });

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
    await expect(rowCount('spp_bindings')).resolves.toBe(0);
    await expect(rowCount('service_handoffs')).resolves.toBe(0);
    await expect(rowCount('spp_mint_audit')).resolves.toBe(0);
  });

  it('mints an approved handoff, binding, audit, and entitlement for an approved scout', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 1_000 });
    const contentSentinel = 'private-journal-content-sentinel';

    const response = await worker.fetch(confirmRequest({
      cookie: session.cookie,
      extraForm: {
        instance: VALID_INSTANCE,
        data_ack: 'yes',
        content: contentSentinel,
      },
    }), testEnv);
    const body = await response.text();
    const payload = await decryptedHandoff(VALID_NONCE, testEnv);
    const storedHandoff = await serviceHandoffRow(VALID_NONCE, testEnv);
    const binding = await sppBindingRow(account.accountId, VALID_INSTANCE);
    const audit = await sppMintAuditRow(account.accountId, VALID_INSTANCE);

    expect(response.status).toBe(200);
    expect(body).toContain('confidential processing is approved for this journal.');
    expect(payload).toEqual({
      state: 'approved',
      endpoint_url: testEnv.SPP_ENGINE_ENDPOINT,
      served_model_id: testEnv.SPP_ENGINE_MODEL,
      credential: expect.any(String),
      account_id: account.accountId,
      instance_id: VALID_INSTANCE,
      created_at: expect.any(String),
    });
    expect(new Date(payload.created_at).toISOString()).toBe(payload.created_at);
    expect(binding).toMatchObject({
      account_id: account.accountId,
      instance_id: VALID_INSTANCE,
      token_hash: await hashWithPepper(payload.credential, testEnv),
      consent_acked_at: expect.any(Number),
      consent_disclosure_version: 'spp-consent-v1',
    });
    expect(binding.consent_acked_at).toBe(binding.last_seen_at);
    expect(JSON.stringify(binding)).not.toContain(payload.credential);
    expect(JSON.stringify(binding)).not.toContain(contentSentinel);
    expect(storedHandoff.payload_encrypted).not.toContain(payload.credential);
    expect(storedHandoff.payload_encrypted).not.toContain(contentSentinel);
    expect(JSON.stringify(payload)).not.toContain(contentSentinel);
    expect(audit).toMatchObject({ scope: 'inference', outcome: 'minted' });
    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'active',
      source: 'comp',
    });
  });

  it('rejects an approved scout without data acknowledgment before any write', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 1_000 });

    const response = await worker.fetch(confirmRequest({
      cookie: session.cookie,
      extraForm: { instance: VALID_INSTANCE },
    }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(body).toContain("something didn't look right with that link.");
    await expect(rowCount('spp_bindings')).resolves.toBe(0);
    await expect(rowCount('service_handoffs')).resolves.toBe(0);
    await expect(rowCount('spp_mint_audit')).resolves.toBe(0);
    await expect(entitlementRow(account.accountId)).resolves.toBeNull();
  });

  it('fails closed without a minted audit when the handoff nonce already exists', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 1_000 });
    const sentinel = { state: 'sentinel', marker: 'pre-existing-spp-handoff' };
    await insertSppHandoff({ testEnv, accountId: account.accountId, nonce: VALID_NONCE, payload: sentinel });

    const response = await worker.fetch(confirmRequest({ cookie: session.cookie }), testEnv);

    expect(response.status).toBe(503);
    await expect(sppMintAuditRow(account.accountId, VALID_INSTANCE)).resolves.toBeNull();
    await expect(rowCount('spp_mint_audit')).resolves.toBe(0);
    await expect(decryptedHandoff(VALID_NONCE, testEnv)).resolves.toEqual(sentinel);
  });

  it('refuses non-scout issuance with a content-free early-access handoff, no credential or binding', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(confirmRequest({ cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('confidential processing is coming');
    expect(body).not.toContain('credential');
    await expect(decryptedHandoff(VALID_NONCE, testEnv)).resolves.toEqual({ state: 'early_access' });
    await expect(rowCount('spp_bindings')).resolves.toBe(0);
    await expect(rowCount('service_handoffs')).resolves.toBe(1);
    await expect(rowCount('spp_mint_audit')).resolves.toBe(1);
    await expect(sppMintAuditRow(account.accountId, VALID_INSTANCE)).resolves.toMatchObject({
      scope: 'inference',
      outcome: 'refused_entitlement',
    });
  });

  it('does not leak the cleartext credential to logs, locations, or response bodies', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 1_000 });
    try {
      const response = await worker.fetch(confirmRequest({ cookie: session.cookie }), testEnv);
      const payload = await decryptedHandoff(VALID_NONCE, testEnv);
      const row = await serviceHandoffRow(VALID_NONCE, testEnv);
      const body = await response.text();
      const bad = await worker.fetch(confirmRequest({
        cookie: session.cookie,
        nonce: OTHER_NONCE,
        extraForm: { instance: 'bad', credential: payload.credential },
      }), testEnv);
      const badBody = await bad.text();

      expect(response.headers.get('Location')).toBeNull();
      expect(body).not.toContain(payload.credential);
      expect(bad.headers.get('Location')).toBeNull();
      expect(badBody).not.toContain(payload.credential);
      spy.assertNoSecrets([VALID_NONCE, payload.credential, row.payload_encrypted]);
    } finally {
      spy.restore();
    }
  });
});

function sppUrl(overrides = {}) {
  const params = new URLSearchParams({
    nonce: VALID_NONCE,
    ...overrides,
  });
  return `https://services.solstone.app/enable/spp?${params.toString()}`;
}

function confirmRequest({
  cookie,
  nonce = VALID_NONCE,
  action = 'allow',
  csrf = TEST_CSRF,
  origin = 'https://services.solstone.app',
  extraForm = {
    instance: VALID_INSTANCE,
    data_ack: 'yes',
  },
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
  return new Request('https://services.solstone.app/enable/spp/confirm', {
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
  return new Request('https://services.solstone.app/enable/spp/confirm', {
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
    .bind(await hashServiceHandoffNonce(nonce, testEnv), 'spp')
    .first();
}

async function insertSppHandoff({ testEnv, accountId, nonce, payload }) {
  const nowMs = Date.now();
  await workerEnv.DB
    .prepare(
      `INSERT INTO service_handoffs (
         handoff_hash, account_id, service, payload_encrypted, created_at, expires_at
       ) VALUES (?, ?, 'spp', ?, ?, ?)`
    )
    .bind(
      await hashServiceHandoffNonce(nonce, testEnv),
      accountId,
      await encryptEmail(JSON.stringify(payload), testEnv),
      nowMs,
      nowMs + 60_000
    )
    .run();
}

function recordPreparedSql(testEnv, sink) {
  return {
    ...testEnv,
    DB: {
      prepare(sql) {
        sink.push(sql);
        return testEnv.DB.prepare(sql);
      },
    },
  };
}

async function sppBindingRow(accountId, instanceId) {
  return workerEnv.DB
    .prepare(
      `SELECT account_id, instance_id, token_hash, created_at, last_seen_at,
              consent_acked_at, consent_disclosure_version
       FROM spp_bindings
       WHERE account_id = ? AND instance_id = ?`
    )
    .bind(accountId, instanceId)
    .first();
}

async function sppMintAuditRow(accountId, instanceId) {
  return workerEnv.DB
    .prepare(
      `SELECT account_id, instance_id, scope, outcome, ts
       FROM spp_mint_audit
       WHERE account_id = ? AND instance_id = ?`
    )
    .bind(accountId, instanceId)
    .first();
}

async function entitlementRow(accountId) {
  return workerEnv.DB
    .prepare('SELECT account_id, service, status, current_period_end, source, source_ref, updated_at FROM entitlements WHERE account_id = ? AND service = ?')
    .bind(accountId, SPP_SERVICE)
    .first();
}
