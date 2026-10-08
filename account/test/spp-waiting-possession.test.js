import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { decryptEmail, encryptEmail } from '../src/crypto.js';
import { upsertSplBinding, upsertSppBinding } from '../src/db.js';
import { generateReachKeyPair, mintHomeReachAssertion } from './reach-helper.js';
import { TEST_CSRF, makeTestEnv, resetDb, seedAccount, seedEntitlement, seedSession } from './helpers.js';

const ORIGIN = 'https://services.solstone.app';
const NONCE = '6'.repeat(52);
const SALE = {
  STRIPE_PRICE_SPP_ANNUAL: 'price_test_annual',
  STRIPE_PRICE_SPP_MONTHLY: 'price_test_monthly',
  SPP_PLAN_TERMS: 'test terms',
};
const TABLES = ['spp_bindings', 'spl_bindings', 'service_handoffs', 'spp_mint_audit', 'entitlements'];
async function snapshot() {
  const rows = {};
  for (const table of TABLES) rows[table] = (await workerEnv.DB.prepare(`SELECT * FROM ${table}`).all()).results;
  return rows;
}
async function pending(testEnv, session, kp, extra = {}) {
  return worker.fetch(new Request(`${ORIGIN}/enable/spp/confirm`, {
    method: 'POST',
    headers: { Cookie: session.cookie, Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: TEST_CSRF, nonce: NONCE, action: 'allow', instance: kp.instanceId, data_ack: 'yes', ...extra }),
  }), testEnv);
}
async function poll(testEnv) {
  return worker.fetch(new Request(`${ORIGIN}/handoff/spp?nonce=${NONCE}`), testEnv);
}
async function setup() {
  const testEnv = makeTestEnv({ ...SALE, SERVICE_ENABLE_PROOF_REQUIRED: 'false' });
  const account = await seedAccount({ testEnv });
  const session = await seedSession(account.accountId, { testEnv });
  const kp = await generateReachKeyPair();
  return { testEnv, account, session, kp };
}
async function paid(accountId) {
  await seedEntitlement({ accountId, service: 'spp_hosted', status: 'active', source: 'stripe', sourceRef: 'sub_test',
    currentPeriodEnd: Math.floor(Date.now() / 1000) + 86400 });
}
describe('SPP waiting consent retains its possession authorization', () => {
  beforeEach(resetDb);
  afterEach(() => vi.restoreAllMocks());

  it.each(['missing', false, 'true'])('refuses unsigned OFF-to-ON pending consent with marker %s before any effects', async (marker) => {
    const { testEnv, account, session, kp } = await setup();
    expect((await pending(testEnv, session, kp, { possession_proved: 'true' })).status).toBe(200);
    const row = await workerEnv.DB.prepare('SELECT handoff_hash, payload_encrypted FROM service_handoffs').first();
    const payload = JSON.parse(await decryptEmail(row.payload_encrypted, testEnv));
    expect(payload.possession_proved).toBe(false); // Client marker is ignored.
    if (marker === 'missing') delete payload.possession_proved;
    else payload.possession_proved = marker;
    await workerEnv.DB.prepare('UPDATE service_handoffs SET payload_encrypted = ? WHERE handoff_hash = ?')
      .bind(await encryptEmail(JSON.stringify(payload), testEnv), row.handoff_hash).run();
    await paid(account.accountId);
    const before = await snapshot();
    const response = await poll({ ...testEnv, SERVICE_ENABLE_PROOF_REQUIRED: 'true' });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_request' });
    expect(await snapshot()).toEqual(before);
  });

  it('a current binding for another service does not authorize an unsigned pending SPP claim', async () => {
    const { testEnv, account, session, kp } = await setup();
    await pending(testEnv, session, kp);
    await upsertSplBinding(workerEnv.DB, { accountId: account.accountId, instanceId: kp.instanceId, nowMs: Date.now() });
    await paid(account.accountId);
    const before = await snapshot();
    expect((await poll({ ...testEnv, SERVICE_ENABLE_PROOF_REQUIRED: 'true' })).status).toBe(400);
    expect(await snapshot()).toEqual(before);
  });

  it('allows unsigned pending consent only while the same account currently holds the SPP binding', async () => {
    const { testEnv, account, session, kp } = await setup();
    await pending(testEnv, session, kp);
    await upsertSppBinding(workerEnv.DB, { accountId: account.accountId, instanceId: kp.instanceId, tokenHash: 'old',
      nowMs: Date.now(), consentAckedAt: Date.now(), consentDisclosureVersion: 'test' });
    await paid(account.accountId);
    const response = await poll({ ...testEnv, SERVICE_ENABLE_PROOF_REQUIRED: 'true' });
    expect(response.status).toBe(200);
    expect((await response.json()).state).toBe('approved');
  });

  it('finishes consent verified at admission after proof expiry within the existing waiting TTL', async () => {
    const { testEnv, account, session, kp } = await setup();
    const admitted = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(admitted);
    const iat = Math.floor(admitted / 1000);
    const assertion = await mintHomeReachAssertion({ instanceId: kp.instanceId, privateKey: kp.privateKey,
      claims: { scope: 'services.enable', service: 'spp', nonce: NONCE, iat, exp: iat + 1800 } });
    const required = { ...testEnv, SERVICE_ENABLE_PROOF_REQUIRED: 'true' };
    expect((await pending(required, session, kp, { assertion, ca_pubkey: kp.publicKeyPem })).status).toBe(200);
    const row = await workerEnv.DB.prepare('SELECT payload_encrypted FROM service_handoffs').first();
    const payload = JSON.parse(await decryptEmail(row.payload_encrypted, testEnv));
    expect(payload.possession_proved).toBe(true);
    expect(payload).not.toHaveProperty('assertion');
    vi.mocked(Date.now).mockReturnValue(admitted + 31 * 60 * 1000);
    await paid(account.accountId);
    const response = await poll(required);
    expect(response.status).toBe(200);
    const approved = await response.json();
    expect(approved.state).toBe('approved');
    expect(approved.instance_id).toBe(kp.instanceId);
    expect(typeof approved.credential).toBe('string');
    expect((await poll(required)).status).toBe(410);
  });
});
