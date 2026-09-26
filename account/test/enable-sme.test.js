import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { decryptEmail, encryptEmail, hashServiceHandoffNonce } from '../src/crypto.js';
import { verifyEnableResume } from '../src/enable.js';
import {
  TEST_CSRF,
  installConsoleSpy,
  makeTestEnv,
  resetDb,
  rowCount,
  seedAccount,
  seedEntitlement,
  seedScoutApplication,
  seedSession,
  seedSplBinding,
} from './helpers.js';

const VALID_NONCE = '7'.repeat(52);
const OTHER_NONCE = '8'.repeat(52);
const VALID_INSTANCE = '11111111-1111-1111-1111-111111111111';
const OTHER_INSTANCE = '22222222-2222-2222-2222-222222222222';
const SME_SERVICE = 'sme_hosted';

describe('/enable/solstone-me', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('rejects a missing or malformed nonce or instance with the generic error page', async () => {
    const cases = [
      smeUrl({ nonce: '' }),
      smeUrl({ nonce: 'bad' }),
      smeUrl({ instance: '' }),
      smeUrl({ instance: 'bad' }),
      `${smeUrl()}&instance=${OTHER_INSTANCE}`,
      smeUrl({ instance: undefined }),
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
    const query = `?nonce=${VALID_NONCE}&instance=${VALID_INSTANCE}`;
    const response = await worker.fetch(new Request(`https://services.solstone.app/enable/solstone-me${query}`), testEnv);
    const location = new URL(response.headers.get('Location'), 'https://services.solstone.app');
    const resume = await verifyEnableResume(location.searchParams.get('next'), location.searchParams.get('next_sig'), testEnv);

    expect(response.status).toBe(303);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(location.pathname).toBe('/');
    expect(resume).toEqual({ path: '/enable/solstone-me', queryString: query });
  });

  it('renders the consent screen around the mechanism, with hidden fields and a required acknowledgment', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(new Request(smeUrl(), { headers: { Cookie: session.cookie } }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toContain('sol pbc received a request to turn on solstone.me for your journal. it stays off until you allow it.');
    expect(body).toContain("sol pbc can approve it because it's tied to your sign-in. no journal content comes with it, only what identifies the request, and your allowing it is recorded.");
    expect(body).toContain("an agent you connect can search and read your journal, within what you let it see: your whole journal, or only the facets you choose. it reads. it can't add, change or delete anything.");
    expect(body).toContain('the solstone.me relay currently forwards encrypted bytes and keeps no record of the traffic.');
    expect(body).toContain('sol pbc can see the network addresses, when a connection happens, and how much moved.');
    expect(body).toContain("whoever controls that route or machine could obtain another valid certificate and change the route to read a future connection, including an agent's key.");
    expect(body).toContain('anyone holding that key can read what that agent may see until you disconnect the agent or revoke its key.');
    expect(body).toContain('details are in the <a href="https://solpbc.org/privacy#solstone-me">privacy policy</a>.');
    expect(body).toContain('the public record is permanent');
    expect(body).toContain('i understand that the public record of this address is permanent.');
    expect(body).toContain("the address is public once it's issued, and stays public for good");
    expect(body).toContain("it's an identifier, not your data: eight random characters with nothing of yours in it.");
    // The operator-approved calm (2026-09-21) drops the certificate-log mechanics; only the
    // privacy policy's floor sentence, the address's existence stays public for good, remains.
    expect(body).not.toMatch(/certificate log/i);
    const ack = body.match(/<label class="ack">[\s\S]*?<\/label>/)[0];
    expect(ack).not.toMatch(/reserv/i);
    expect(body).toContain('turning this off keeps the address. turning it back on uses the same one.');
    expect(body).toContain("turning it off doesn't cancel a subscription.");
    expect(body).toContain('<label class="ack">');
    expect(body).toContain('name="data_ack" value="yes" required');
    expect(body).toContain('name="action" value="cancel" type="submit" formnovalidate');
    expect(body).toContain('action="/enable/solstone-me/confirm"');
    expect(body).toContain('name="csrf" value=');
    expect(body).toContain(`name="nonce" value="${VALID_NONCE}"`);
    expect(body).toContain(`name="instance" value="${VALID_INSTANCE}"`);
    // The consent screen names no product and states no price.
    expect(body).not.toMatch(/connector/i);
    expect(body).not.toMatch(/anonymous/i);
    expect(body).not.toContain('$');
    // Showing the screen commits nothing.
    await expect(rowCount('sme_bindings')).resolves.toBe(0);
    await expect(rowCount('service_handoffs')).resolves.toBe(0);
  });

  it('enforces origin, csrf, cancel, and a required single instance on confirm', async () => {
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
      confirmRequest({ cookie: session.cookie, extraForm: { data_ack: 'yes' } }),
      confirmRequest({ cookie: session.cookie, extraForm: { instance: 'bad', data_ack: 'yes' } }),
      repeatedInstanceConfirmRequest(session.cookie),
    ]) {
      const response = await worker.fetch(request, testEnv);
      expect(response.status).toBe(400);
    }
    await expect(rowCount('sme_bindings')).resolves.toBe(0);
    await expect(rowCount('service_handoffs')).resolves.toBe(0);
    await expect(rowCount('entitlements')).resolves.toBe(0);
  });

  it('records no binding, handoff or entitlement without the acknowledgment, enforced server-side', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 1_000 });

    for (const extraForm of [{ instance: VALID_INSTANCE }, { instance: VALID_INSTANCE, data_ack: 'no' }, { instance: VALID_INSTANCE, data_ack: 'on' }]) {
      const response = await worker.fetch(confirmRequest({ cookie: session.cookie, extraForm }), testEnv);
      expect(response.status).toBe(400);
      expect(await response.text()).toContain("something didn't look right with that link.");
    }
    await expect(rowCount('sme_bindings')).resolves.toBe(0);
    await expect(rowCount('service_handoffs')).resolves.toBe(0);
    await expect(rowCount('entitlements')).resolves.toBe(0);
  });

  it('records the versioned consent and approves an approved scout at no charge', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 1_000 });

    const response = await worker.fetch(confirmRequest({ cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('solstone.me is on for your journal. you can close this tab.');
    const binding = await smeBindingRow(account.accountId, VALID_INSTANCE);
    expect(binding).toMatchObject({
      account_id: account.accountId,
      instance_id: VALID_INSTANCE,
      consent_acked_at: expect.any(Number),
      consent_disclosure_version: 'sme-consent-v2-pattern',
    });
    expect(binding.consent_acked_at).toBe(binding.last_seen_at);
    const payload = await decryptedHandoff(VALID_NONCE, testEnv);
    expect(payload).toEqual({ service: 'sme', state: 'approved', approved_at: expect.any(String) });
    expect(new Date(payload.approved_at).toISOString()).toBe(payload.approved_at);
    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({ status: 'active', source: 'comp' });
  });

  it('approves a paying owner and leaves their paid entitlement untouched', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedEntitlement({
      accountId: account.accountId,
      service: SME_SERVICE,
      status: 'active',
      currentPeriodEnd: 1_900_000_000,
      sourceRef: 'sub_sme_paid',
    });

    const response = await worker.fetch(confirmRequest({ cookie: session.cookie }), testEnv);

    expect(response.status).toBe(200);
    await expect(decryptedHandoff(VALID_NONCE, testEnv)).resolves.toMatchObject({ state: 'approved' });
    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'active',
      source: 'stripe',
      source_ref: 'sub_sme_paid',
      current_period_end: 1_900_000_000,
    });
  });

  it('saves consent for an owner who has not subscribed, and says a subscription is needed', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(confirmRequest({ cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('a subscription is needed');
    expect(body).toContain('href="/services/solstone-me"');
    expect(body).toContain('set up solstone.me');
    expect(body).not.toMatch(/subscribe/i);
    expect(body).toContain('your consent is saved;');
    expect(body).toContain('turn solstone.me on again in your journal.');
    expect(body).not.toMatch(/won't be asked again/i);
    await expect(smeBindingRow(account.accountId, VALID_INSTANCE)).resolves.toMatchObject({
      consent_disclosure_version: 'sme-consent-v2-pattern',
    });
    await expect(decryptedHandoff(VALID_NONCE, testEnv)).resolves.toEqual({
      service: 'sme',
      state: 'needs_subscription',
      subscribe_url: 'https://services.solstone.app/services/solstone-me',
    });
    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({ status: 'lapsed' });
  });

  it('reports needs_subscription exactly when the mint would refuse: past_due beyond the grace window', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedEntitlement({
      accountId: account.accountId,
      service: SME_SERVICE,
      status: 'past_due',
      currentPeriodEnd: Math.floor(Date.now() / 1000) - 15 * 86400,
    });

    await worker.fetch(confirmRequest({ cookie: session.cookie }), testEnv);

    await expect(decryptedHandoff(VALID_NONCE, testEnv)).resolves.toMatchObject({ state: 'needs_subscription' });
  });

  it('allocates no address, and never reads or writes the private-network binding', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedSplBinding({ accountId: account.accountId, instanceId: OTHER_INSTANCE });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 1_000 });

    await worker.fetch(confirmRequest({ cookie: session.cookie }), testEnv);

    await expect(rowCount('mcp_bridge_hostname_ledger')).resolves.toBe(0);
    await expect(rowCount('mcp_bridge_bindings')).resolves.toBe(0);
    await expect(rowCount('spl_bindings')).resolves.toBe(1);
    await expect(smeBindingRow(account.accountId, OTHER_INSTANCE)).resolves.toBeNull();
  });

  it('refreshes one binding for a repeated consent rather than adding another', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    await worker.fetch(confirmRequest({ cookie: session.cookie }), testEnv);
    await worker.fetch(confirmRequest({ cookie: session.cookie, nonce: OTHER_NONCE }), testEnv);

    await expect(rowCount('sme_bindings')).resolves.toBe(1);
    await expect(rowCount('service_handoffs')).resolves.toBe(2);
  });

  it('fails closed when the handoff nonce already exists, leaving the earlier handoff intact', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const sentinel = { service: 'sme', state: 'sentinel' };
    await insertSmeHandoff({ testEnv, accountId: account.accountId, nonce: VALID_NONCE, payload: sentinel });

    const response = await worker.fetch(confirmRequest({ cookie: session.cookie }), testEnv);

    expect(response.status).toBe(503);
    await expect(decryptedHandoff(VALID_NONCE, testEnv)).resolves.toEqual(sentinel);
  });

  it('sends a signed-out confirm back through sign-in and writes nothing', async () => {
    const testEnv = makeTestEnv();
    const response = await worker.fetch(confirmRequest({}), testEnv);

    expect(response.status).toBe(303);
    expect(new URL(response.headers.get('Location'), 'https://services.solstone.app').pathname).toBe('/');
    await expect(rowCount('sme_bindings')).resolves.toBe(0);
    await expect(rowCount('service_handoffs')).resolves.toBe(0);
  });

  it('keeps the nonce and instance out of logs', async () => {
    const spy = installConsoleSpy();
    try {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      await worker.fetch(confirmRequest({ cookie: session.cookie }), testEnv);
      spy.assertNoSecrets([VALID_NONCE, VALID_INSTANCE]);
    } finally {
      spy.restore();
    }
  });
});

function smeUrl(overrides = {}) {
  const params = new URLSearchParams({
    nonce: VALID_NONCE,
    instance: VALID_INSTANCE,
    ...overrides,
  });
  for (const [key, value] of [...params]) if (value === 'undefined') params.delete(key);
  return `https://services.solstone.app/enable/solstone-me?${params.toString()}`;
}

function confirmRequest({
  cookie,
  nonce = VALID_NONCE,
  action = 'allow',
  csrf = TEST_CSRF,
  origin = 'https://services.solstone.app',
  extraForm = { instance: VALID_INSTANCE, data_ack: 'yes' },
} = {}) {
  const body = new URLSearchParams({ csrf, nonce, action, ...extraForm });
  const headers = { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' };
  if (cookie) headers.Cookie = cookie;
  return new Request('https://services.solstone.app/enable/solstone-me/confirm', { method: 'POST', headers, body });
}

function repeatedInstanceConfirmRequest(cookie) {
  const body = new URLSearchParams({ csrf: TEST_CSRF, nonce: VALID_NONCE, action: 'allow', data_ack: 'yes' });
  body.append('instance', VALID_INSTANCE);
  body.append('instance', OTHER_INSTANCE);
  return new Request('https://services.solstone.app/enable/solstone-me/confirm', {
    method: 'POST',
    headers: { Origin: 'https://services.solstone.app', Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
}

async function decryptedHandoff(nonce, testEnv) {
  const row = await workerEnv.DB
    .prepare('SELECT payload_encrypted FROM service_handoffs WHERE handoff_hash = ? AND service = ?')
    .bind(await hashServiceHandoffNonce(nonce, testEnv), 'sme')
    .first();
  expect(row).not.toBeNull();
  return JSON.parse(await decryptEmail(row.payload_encrypted, testEnv));
}

async function insertSmeHandoff({ testEnv, accountId, nonce, payload }) {
  const nowMs = Date.now();
  await workerEnv.DB
    .prepare(
      `INSERT INTO service_handoffs (
         handoff_hash, account_id, service, payload_encrypted, created_at, expires_at
       ) VALUES (?, ?, 'sme', ?, ?, ?)`
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

async function smeBindingRow(accountId, instanceId) {
  return workerEnv.DB
    .prepare(
      `SELECT account_id, instance_id, created_at, last_seen_at, consent_acked_at, consent_disclosure_version
       FROM sme_bindings
       WHERE account_id = ? AND instance_id = ?`
    )
    .bind(accountId, instanceId)
    .first();
}

async function entitlementRow(accountId) {
  return workerEnv.DB
    .prepare('SELECT account_id, service, status, current_period_end, source, source_ref FROM entitlements WHERE account_id = ? AND service = ?')
    .bind(accountId, SME_SERVICE)
    .first();
}
