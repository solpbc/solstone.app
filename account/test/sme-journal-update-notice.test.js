import { exportJWK, generateKeyPair } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { installFakeSolstoneMeZone } from './fake-solstone-me-zone.js';
import {
  fetchWithCtx,
  installStripeFetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedSession,
  seedSmeBinding,
} from './helpers.js';
import { generateReachKeyPair, mintHomeReachAssertion } from './reach-helper.js';

describe('sme journal update notice on /services/solstone-me', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders data-notice="sme-journal-update" for entitled account within 7 days', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'entitled-refused@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedEntitlement({
      accountId: account.accountId,
      service: 'sme_hosted',
      status: 'active',
      currentPeriodEnd: 1_800_000_000,
    });
    installStripeFetchMock({
      'GET api.stripe.com/v1/subscriptions/sub_seeded': async () => new Response(JSON.stringify({
        object: 'subscription',
        items: { data: [{ quantity: 1, price: { unit_amount: 500, currency: 'usd', recurring: { interval: 'year' } } }] },
      })),
    });

    const nowMs = Date.now();
    await testEnv.DB.prepare(`
      INSERT INTO sme_bindings (
        account_id, instance_id, created_at, last_seen_at, consent_acked_at, consent_disclosure_version, journal_update_refused_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      account.accountId,
      '5f843f91-5fcd-8a5a-9c8b-5009debd8d00',
      nowMs - 10000,
      nowMs - 1000,
      nowMs - 10000,
      'v1',
      nowMs - 2 * 86400000
    ).run();

    const response = await get('/services/solstone-me', testEnv, session.cookie);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('data-notice="sme-journal-update"');
  });

  it('renders data-notice="sme-journal-update" for unentitled account within 7 days', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'unentitled-refused@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const nowMs = Date.now();
    await testEnv.DB.prepare(`
      INSERT INTO sme_bindings (
        account_id, instance_id, created_at, last_seen_at, consent_acked_at, consent_disclosure_version, journal_update_refused_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      account.accountId,
      '5f843f91-5fcd-8a5a-9c8b-5009debd8d00',
      nowMs - 10000,
      nowMs - 1000,
      nowMs - 10000,
      'v1',
      nowMs - 2 * 86400000
    ).run();

    const response = await get('/services/solstone-me', testEnv, session.cookie);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('data-notice="sme-journal-update"');
  });

  it('is absent when journal_update_refused_at is exactly nowMs - 7 * 86400000 or older', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'exact-boundary@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const nowMs = Date.now();
    await testEnv.DB.prepare(`
      INSERT INTO sme_bindings (
        account_id, instance_id, created_at, last_seen_at, consent_acked_at, consent_disclosure_version, journal_update_refused_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      account.accountId,
      '5f843f91-5fcd-8a5a-9c8b-5009debd8d00',
      nowMs - 10 * 86400000,
      nowMs - 7 * 86400000,
      nowMs - 10 * 86400000,
      'v1',
      nowMs - 7 * 86400000 // exact boundary
    ).run();

    const response = await get('/services/solstone-me', testEnv, session.cookie);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).not.toContain('data-notice="sme-journal-update"');
  });

  it('keeps the hook when a second binding is still inside the window after first is cleared', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'multi-binding@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const nowMs = Date.now();
    // Binding 1: cleared (null)
    await testEnv.DB.prepare(`
      INSERT INTO sme_bindings (
        account_id, instance_id, created_at, last_seen_at, consent_acked_at, consent_disclosure_version, journal_update_refused_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      account.accountId,
      '5f843f91-5fcd-8a5a-9c8b-5009debd8d01',
      nowMs - 10000,
      nowMs - 1000,
      nowMs - 10000,
      'v1',
      null
    ).run();

    // Binding 2: refused 1 day ago
    await testEnv.DB.prepare(`
      INSERT INTO sme_bindings (
        account_id, instance_id, created_at, last_seen_at, consent_acked_at, consent_disclosure_version, journal_update_refused_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      account.accountId,
      '5f843f91-5fcd-8a5a-9c8b-5009debd8d02',
      nowMs - 10000,
      nowMs - 1000,
      nowMs - 10000,
      'v1',
      nowMs - 86400000
    ).run();

    const response = await get('/services/solstone-me', testEnv, session.cookie);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('data-notice="sme-journal-update"');
  });

  it('removes the hook when a bridge request carrying a valid URI returns 200 on fast path', async () => {
    const testEnv = makeTestEnv({
      SOLSTONE_ME_ZONE_ID: 'test-solstone-me-zone-id',
      SOLSTONE_ME_DNS_API_TOKEN: 'test-solstone-me-dns-token',
    });
    installStripeFetchMock({
      'GET api.stripe.com/v1/subscriptions/sub_seeded': async () => new Response(JSON.stringify({
        object: 'subscription',
        items: { data: [{ quantity: 1, price: { unit_amount: 500, currency: 'usd', recurring: { interval: 'year' } } }] },
      })),
    });
    const home = await generateReachKeyPair();
    const account = await seedAccount({ email: 'fastpath-clear@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedEntitlement({
      accountId: account.accountId,
      service: 'sme_hosted',
      status: 'active',
      currentPeriodEnd: 1_800_000_000,
    });
    const fakeZone = installFakeSolstoneMeZone();

    const nowMs = Date.now();
    // Initially refused 1 day ago
    await testEnv.DB.prepare(`
      INSERT INTO sme_bindings (
        account_id, instance_id, created_at, last_seen_at, consent_acked_at, consent_disclosure_version, journal_update_refused_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      account.accountId,
      home.instanceId,
      nowMs - 10000,
      nowMs - 1000,
      nowMs - 10000,
      'v1',
      nowMs - 86400000
    ).run();

    // Notice is visible initially
    let response = await get('/services/solstone-me', testEnv, session.cookie);
    expect(await response.text()).toContain('data-notice="sme-journal-update"');

    // Perform initial mint to get verified
    const uri = 'https://acme-v02.api.letsencrypt.org/acme/acct/123456';
    const { publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    const mintPayload = {
      instance_id: home.instanceId,
      assertion: await mintHomeReachAssertion({
        instanceId: home.instanceId,
        privateKey: home.privateKey,
        claims: {
          scope: 'mcp.bridge.register',
          acme_account_uri: uri,
        },
      }),
      ca_pubkey: home.publicKeyPem,
      cnf_jwk: await exportJWK(publicKey),
    };

    // First request writes and clears refusal
    let bridgeRes = await fetchWithCtx(worker, new Request('https://services.solstone.app/reach/mcp/bridge-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mintPayload),
    }), testEnv);
    expect(bridgeRes.response.status).toBe(200);

    // Re-stamp refusal to test that fast-path clears it without DNS fetch
    await testEnv.DB.prepare(
      'UPDATE sme_bindings SET journal_update_refused_at = ? WHERE account_id = ?'
    ).bind(nowMs - 86400000, account.accountId).run();

    // Fast-path bridge request
    fakeZone.fetchSpy.mockClear();
    bridgeRes = await fetchWithCtx(worker, new Request('https://services.solstone.app/reach/mcp/bridge-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mintPayload),
    }), testEnv);
    expect(bridgeRes.response.status).toBe(200);
    expect(fakeZone.fetchSpy).not.toHaveBeenCalled();

    // Notice is now absent
    response = await get('/services/solstone-me', testEnv, session.cookie);
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain('data-notice="sme-journal-update"');
  });
});

function get(path, env, cookie = '') {
  return worker.fetch(new Request(`https://services.solstone.app${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
  }), env);
}
