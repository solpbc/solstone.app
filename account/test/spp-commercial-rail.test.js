import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { reconcileSppEntitlement, isSppEntitledToServe } from '../src/spp-entitlement.js';
import { sppOnSale } from '../src/spp-service.js';
import { getEntitlement, upsertSppBinding } from '../src/db.js';
import { hashWithPepper } from '../src/crypto.js';
import {
  TEST_CSRF,
  installStripeFetchMock,
  makeFakeRateLimit,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedScoutApplication,
  seedSession,
  signStripeWebhook,
} from './helpers.js';

const ON_SALE = {
  STRIPE_PRICE_SPP_ANNUAL: 'price_spp_annual_test',
  STRIPE_PRICE_SPP_MONTHLY: 'price_spp_monthly_test',
  SPP_PLAN_TERMS: 'plan terms placeholder for tests',
};
const NONCE = '6'.repeat(52);
const INSTANCE_A = '11111111-1111-1111-1111-111111111111';
const INSTANCE_B = '22222222-2222-2222-2222-222222222222';
const ORIGIN = 'https://services.solstone.app';
const SUBSCRIBE_URL = 'https://services.solstone.app/confidential-processing';

function onSaleEnv(extra = {}) {
  return makeTestEnv({ ...ON_SALE, ...extra });
}

async function confirm(testEnv, session, { nonce = NONCE, instance = INSTANCE_A } = {}) {
  return worker.fetch(new Request(`${ORIGIN}/enable/spp/confirm`, {
    method: 'POST',
    headers: { Cookie: session.cookie, Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: TEST_CSRF, nonce, action: 'allow', instance, data_ack: 'yes' }),
  }), testEnv, { waitUntil() {} });
}

async function poll(testEnv, nonce = NONCE) {
  return worker.fetch(new Request(`${ORIGIN}/handoff/spp?nonce=${nonce}`), testEnv);
}

async function sppBindings(accountId) {
  return (await workerEnv.DB.prepare('SELECT instance_id FROM spp_bindings WHERE account_id = ? ORDER BY instance_id')
    .bind(accountId).all()).results.map((row) => row.instance_id);
}

async function paidSpp(accountId, overrides = {}) {
  return seedEntitlement({
    accountId,
    service: 'spp_hosted',
    status: 'active',
    source: 'stripe',
    sourceRef: 'sub_spp_paid',
    currentPeriodEnd: Math.floor(Date.now() / 1000) + 30 * 86400,
    ...overrides,
  });
}

describe('confidential processing: the on-sale switch', () => {
  it('is on only with both prices and the plan terms', () => {
    expect(sppOnSale({})).toBe(false);
    expect(sppOnSale({ ...ON_SALE, SPP_PLAN_TERMS: '' })).toBe(false);
    expect(sppOnSale({ ...ON_SALE, STRIPE_PRICE_SPP_MONTHLY: '' })).toBe(false);
    expect(sppOnSale({ ...ON_SALE, STRIPE_PRICE_SPP_ANNUAL: ' ' })).toBe(false);
    expect(sppOnSale(ON_SALE)).toBe(true);
  });
});

describe('confidential processing: entitlement', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('serves a failed payment for 14 days past the paid period, then stops', () => {
    const end = 1_800_000_000;
    const row = { status: 'past_due', current_period_end: end };
    expect(isSppEntitledToServe(row, end + 14 * 86400, { RELAY_GRACE_DAYS: '14' })).toBe(true);
    expect(isSppEntitledToServe(row, end + 14 * 86400 + 1, { RELAY_GRACE_DAYS: '14' })).toBe(false);
    expect(isSppEntitledToServe({ status: 'lapsed', current_period_end: end }, end, {})).toBe(false);
  });

  it('a paid subscription always wins over a scout approval or revocation', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await paidSpp(account.accountId);

    await seedScoutApplication({ accountId: account.accountId, status: 'approved' });
    await reconcileSppEntitlement(testEnv, account.accountId, Date.now());
    let row = await getEntitlement(workerEnv.DB, { accountId: account.accountId, service: 'spp_hosted' });
    expect(row.source).toBe('stripe');
    expect(row.source_ref).toBe('sub_spp_paid');

    await workerEnv.DB.prepare("UPDATE scout_applications SET status = 'revoked' WHERE account_id = ?").bind(account.accountId).run();
    await reconcileSppEntitlement(testEnv, account.accountId, Date.now());
    row = await getEntitlement(workerEnv.DB, { accountId: account.accountId, service: 'spp_hosted' });
    expect(row.source).toBe('stripe');
    expect(row.status).toBe('active');
  });

  it('when a paid subscription ends, an approved scout falls back to complimentary', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved' });
    await paidSpp(account.accountId);
    await reconcileSppEntitlement(testEnv, account.accountId, Date.now(), null, { paid: null });
    const row = await getEntitlement(workerEnv.DB, { accountId: account.accountId, service: 'spp_hosted' });
    expect(row.source).toBe('comp');
    expect(row.status).toBe('active');
  });
});

describe('confidential processing: turning it on once on sale', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('before the sale, a sign-in with no access is still refused at the consent page and nothing is written', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const page = await worker.fetch(new Request(`${ORIGIN}/enable/spp?nonce=${NONCE}&instance=${INSTANCE_A}`, {
      headers: { Cookie: session.cookie },
    }), testEnv);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('scout approval required');
    expect(await poll(testEnv).then((r) => r.json())).toEqual({ state: 'early_access' });
    expect(await getEntitlement(workerEnv.DB, { accountId: account.accountId, service: 'spp_hosted' })).toBeNull();
  });

  it('needs_subscription waits without binding, then finishes by itself once the subscription is active', async () => {
    const testEnv = onSaleEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const page = await worker.fetch(new Request(`${ORIGIN}/enable/spp?nonce=${NONCE}&instance=${INSTANCE_A}`, {
      headers: { Cookie: session.cookie },
    }), testEnv);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('action="/enable/spp/confirm"');

    const confirmed = await confirm(testEnv, session);
    expect(confirmed.status).toBe(200);
    expect(await confirmed.text()).toContain('data-enable-state="needs-subscription"');
    expect(await sppBindings(account.accountId)).toEqual([]);

    for (let i = 0; i < 2; i += 1) {
      const waiting = await poll(testEnv);
      expect(waiting.status).toBe(200);
      expect(await waiting.json()).toEqual({ state: 'needs_subscription', subscribe_url: SUBSCRIBE_URL });
    }
    expect(await sppBindings(account.accountId)).toEqual([]);

    await paidSpp(account.accountId);
    const approved = await poll(testEnv);
    const body = await approved.json();
    expect(body.state).toBe('approved');
    expect(body.instance_id).toBe(INSTANCE_A);
    expect(typeof body.credential).toBe('string');
    expect(await sppBindings(account.accountId)).toEqual([INSTANCE_A]);
    const tokenHash = await hashWithPepper(body.credential, testEnv);
    const bound = await workerEnv.DB.prepare('SELECT token_hash FROM spp_bindings WHERE account_id = ?').bind(account.accountId).first();
    expect(bound.token_hash).toBe(tokenHash);

    const again = await poll(testEnv);
    expect(again.status).toBe(410);
  });

  it('a past_due subscription inside its grace turns on; past the grace it waits', async () => {
    const testEnv = onSaleEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const nowSec = Math.floor(Date.now() / 1000);
    await paidSpp(account.accountId, { status: 'past_due', currentPeriodEnd: nowSec - 20 * 86400 });
    await confirm(testEnv, session);
    expect(await poll(testEnv).then((r) => r.json())).toEqual({ state: 'needs_subscription', subscribe_url: SUBSCRIBE_URL });

    await paidSpp(account.accountId, { status: 'past_due', currentPeriodEnd: nowSec - 2 * 86400 });
    expect((await poll(testEnv).then((r) => r.json())).state).toBe('approved');
  });

  it('one paid subscription covers one journal: a second journal is refused, the first keeps working', async () => {
    const testEnv = onSaleEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await paidSpp(account.accountId);

    await confirm(testEnv, session, { instance: INSTANCE_A });
    expect((await poll(testEnv).then((r) => r.json())).state).toBe('approved');

    const other = '9'.repeat(52);
    const refused = await confirm(testEnv, session, { nonce: other, instance: INSTANCE_B });
    expect(await refused.text()).toContain('data-enable-state="journal-limit"');
    expect(await poll(testEnv, other).then((r) => r.json())).toEqual({ state: 'journal_limit', subscribe_url: SUBSCRIBE_URL });
    expect(await sppBindings(account.accountId)).toEqual([INSTANCE_A]);

    // Turning the covered journal on again is always allowed.
    const third = 'A'.repeat(52);
    await confirm(testEnv, session, { nonce: third, instance: INSTANCE_A });
    expect((await poll(testEnv, third).then((r) => r.json())).state).toBe('approved');
  });

  it('a subscription bought while waiting does not get past the cap either', async () => {
    const testEnv = onSaleEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await upsertSppBinding(workerEnv.DB, {
      accountId: account.accountId, instanceId: INSTANCE_A, tokenHash: 'h', nowMs: 1, consentAckedAt: 1, consentDisclosureVersion: 'v',
    });
    await confirm(testEnv, session, { instance: INSTANCE_B });
    expect((await poll(testEnv).then((r) => r.json())).state).toBe('needs_subscription');
    await paidSpp(account.accountId);
    expect(await poll(testEnv).then((r) => r.json())).toEqual({ state: 'journal_limit', subscribe_url: SUBSCRIBE_URL });
    expect(await sppBindings(account.accountId)).toEqual([INSTANCE_A]);
  });

  it('two journals waiting on one subscription: only the first to ask is turned on', async () => {
    const testEnv = onSaleEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const other = '9'.repeat(52);
    await confirm(testEnv, session, { instance: INSTANCE_A });
    await confirm(testEnv, session, { nonce: other, instance: INSTANCE_B });
    await paidSpp(account.accountId);
    const [first, second] = await Promise.all([poll(testEnv), poll(testEnv, other)]);
    const states = [(await first.json()).state, (await second.json()).state].sort();
    expect(states).toEqual(['approved', 'journal_limit']);
    expect(await sppBindings(account.accountId)).toHaveLength(1);
  });

  it('a journal already bound is turned on again even when older bindings exist', async () => {
    const testEnv = onSaleEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    for (const instanceId of [INSTANCE_A, INSTANCE_B]) {
      await upsertSppBinding(workerEnv.DB, {
        accountId: account.accountId, instanceId, tokenHash: `h-${instanceId}`, nowMs: 1, consentAckedAt: 1, consentDisclosureVersion: 'v',
      });
    }
    await paidSpp(account.accountId);
    await confirm(testEnv, session, { instance: INSTANCE_A });
    expect((await poll(testEnv).then((r) => r.json())).state).toBe('approved');
    expect(await sppBindings(account.accountId)).toEqual([INSTANCE_A, INSTANCE_B]);
  });

  it('releasing the covered journal lets another be turned on, and stops the released credential', async () => {
    const testEnv = onSaleEnv({ SPP_AUTHORIZE_PUBLIC_LIMIT: makeFakeRateLimit(100) });
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await paidSpp(account.accountId);
    await confirm(testEnv, session, { instance: INSTANCE_A });
    const { credential } = await poll(testEnv).then((r) => r.json());
    const other = '9'.repeat(52);
    await confirm(testEnv, session, { nonce: other, instance: INSTANCE_B });
    expect((await poll(testEnv, other).then((r) => r.json())).state).toBe('journal_limit');

    const page = await (await worker.fetch(new Request(`${ORIGIN}/confidential-processing`, { headers: { Cookie: session.cookie } }), testEnv)).text();
    expect(page).toContain('action="/confidential-processing/release"');
    const released = await worker.fetch(new Request(`${ORIGIN}/confidential-processing/release`, {
      method: 'POST',
      headers: { Cookie: session.cookie, Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf: TEST_CSRF, instance: INSTANCE_A }),
    }), testEnv);
    expect(released.headers.get('Location')).toContain('journal=released');
    const access = await worker.fetch(new Request(`${ORIGIN}/spp/access`, { headers: { 'X-Sol-Entitlement': credential, 'CF-Connecting-IP': '198.51.100.7' } }), testEnv);
    expect(access.status).toBe(401);

    const third = 'A'.repeat(52);
    await confirm(testEnv, session, { nonce: third, instance: INSTANCE_B });
    expect((await poll(testEnv, third).then((r) => r.json())).state).toBe('approved');
    expect(await sppBindings(account.accountId)).toEqual([INSTANCE_B]);
  });

  it('a second submit of the same turn-on does not replace the credential', async () => {
    const testEnv = onSaleEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved' });
    await confirm(testEnv, session);
    const before = await workerEnv.DB.prepare('SELECT token_hash FROM spp_bindings WHERE account_id = ?').bind(account.accountId).first();
    const again = await confirm(testEnv, session);
    expect(again.status).toBe(200);
    const after = await workerEnv.DB.prepare('SELECT token_hash FROM spp_bindings WHERE account_id = ?').bind(account.accountId).first();
    expect(after.token_hash).toBe(before.token_hash);
    const { credential } = await poll(testEnv).then((r) => r.json());
    expect(await hashWithPepper(credential, testEnv)).toBe(before.token_hash);
  });

  it('a turn-on left waiting when the sale is switched off gets the before-sale answer', async () => {
    const account = await seedAccount({ testEnv: onSaleEnv() });
    const session = await seedSession(account.accountId, { testEnv: onSaleEnv() });
    await confirm(onSaleEnv(), session);
    expect(await poll(makeTestEnv()).then((r) => r.json())).toEqual({ state: 'early_access' });
  });

  it('scouts are unchanged: approved at once, and not capped', async () => {
    const testEnv = onSaleEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved' });
    await confirm(testEnv, session, { instance: INSTANCE_A });
    expect((await poll(testEnv).then((r) => r.json())).state).toBe('approved');
    const other = '9'.repeat(52);
    await confirm(testEnv, session, { nonce: other, instance: INSTANCE_B });
    expect((await poll(testEnv, other).then((r) => r.json())).state).toBe('approved');
    expect(await sppBindings(account.accountId)).toEqual([INSTANCE_A, INSTANCE_B]);
    const row = await getEntitlement(workerEnv.DB, { accountId: account.accountId, service: 'spp_hosted' });
    expect(row.source).toBe('comp');
  });
});

describe('confidential processing: the content-free access check', () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function check(testEnv, credential) {
    return worker.fetch(new Request(`${ORIGIN}/spp/access`, {
      headers: credential ? { 'X-Sol-Entitlement': credential, 'CF-Connecting-IP': '198.51.100.7' } : { 'CF-Connecting-IP': '198.51.100.7' },
    }), testEnv);
  }

  it('answers active, ended with the way back, or 401 for an unknown credential', async () => {
    const testEnv = onSaleEnv({ SPP_AUTHORIZE_PUBLIC_LIMIT: makeFakeRateLimit(100) });
    const account = await seedAccount({ testEnv });
    const tokenHash = await hashWithPepper('cred-1', testEnv);
    await upsertSppBinding(workerEnv.DB, {
      accountId: account.accountId, instanceId: INSTANCE_A, tokenHash, nowMs: 1, consentAckedAt: 1, consentDisclosureVersion: 'v',
    });

    await paidSpp(account.accountId);
    let res = await check(testEnv, 'cred-1');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ state: 'active' });

    await paidSpp(account.accountId, { status: 'lapsed' });
    res = await check(testEnv, 'cred-1');
    expect(await res.json()).toEqual({ state: 'ended', subscribe_url: SUBSCRIBE_URL });

    expect((await check(testEnv, 'unknown')).status).toBe(401);
    expect((await check(testEnv, '')).status).toBe(401);
  });

  it('is rate limited on the public tier', async () => {
    const testEnv = onSaleEnv({ SPP_AUTHORIZE_PUBLIC_LIMIT: makeFakeRateLimit(0) });
    expect((await check(testEnv, 'x')).status).toBe(429);
  });
});

describe('confidential processing: buying it', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function checkout(testEnv, session, plan = 'annual') {
    return worker.fetch(new Request(`${ORIGIN}/confidential-processing/checkout`, {
      method: 'POST',
      headers: { Cookie: session.cookie, Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf: TEST_CSRF, plan }),
    }), testEnv);
  }

  it('refuses before the sale and never reaches Stripe', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const { calls } = installStripeFetchMock({});
    const res = await checkout(testEnv, session);
    expect(res.headers.get('Location')).toContain('/confidential-processing?checkout=invalid');
    expect(calls).toHaveLength(0);
  });

  it('on sale, sells monthly or annual tagged spp with the plan terms at checkout', async () => {
    const testEnv = onSaleEnv();
    const account = await seedAccount({ email: 'buyer@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const { calls } = installStripeFetchMock({
      'POST api.stripe.com/v1/checkout/sessions': () => new Response(JSON.stringify({ id: 'cs_spp', url: 'https://checkout.stripe.com/c/pay/cs_spp' }), { status: 200 }),
    });
    for (const [plan, price] of [['annual', 'price_spp_annual_test'], ['monthly', 'price_spp_monthly_test']]) {
      const res = await checkout(testEnv, session, plan);
      expect(res.headers.get('Location')).toBe('https://checkout.stripe.com/c/pay/cs_spp');
      const body = calls.at(-1).body;
      expect(body.get('line_items[0][price]')).toBe(price);
      expect(body.get('subscription_data[metadata][service]')).toBe('spp');
      expect(body.get('custom_text[after_submit][message]')).toBe(ON_SALE.SPP_PLAN_TERMS);
      expect(body.get('success_url')).toBe('https://services.solstone.app/confidential-processing?checkout=success');
    }
  });

  it('sends a scout, or a sign-in already paying, back without a second charge', async () => {
    const testEnv = onSaleEnv();
    const scout = await seedAccount({ email: 'scout@example.com', testEnv });
    await seedScoutApplication({ accountId: scout.accountId, status: 'approved' });
    const payer = await seedAccount({ email: 'payer@example.com', testEnv });
    await paidSpp(payer.accountId);
    const { calls } = installStripeFetchMock({});
    expect((await checkout(testEnv, await seedSession(scout.accountId, { testEnv }))).headers.get('Location')).toContain('checkout=comped');
    expect((await checkout(testEnv, await seedSession(payer.accountId, { testEnv }))).headers.get('Location')).toContain('checkout=covered');
    expect(calls).toHaveLength(0);
  });

  it('a completed checkout tagged spp becomes a paid entitlement', async () => {
    const testEnv = onSaleEnv();
    const account = await seedAccount({ testEnv });
    const periodEnd = Math.floor(Date.now() / 1000) + 365 * 86400;
    installStripeFetchMock({
      'GET api.stripe.com/v1/subscriptions/sub_spp_new': () => new Response(JSON.stringify({
        id: 'sub_spp_new', status: 'active', customer: 'cus_spp', current_period_end: periodEnd,
        start_date: Math.floor(Date.now() / 1000), metadata: { service: 'spp' },
        items: { data: [{ quantity: 1, price: { unit_amount: 9600, currency: 'usd', tax_behavior: 'inclusive', recurring: { interval: 'year' } } }] },
      }), { status: 200 }),
    });
    const raw = JSON.stringify({
      id: 'evt_spp', type: 'checkout.session.completed',
      data: { object: { id: 'cs_spp_new', client_reference_id: account.accountId, customer: 'cus_spp', subscription: 'sub_spp_new' } },
    });
    const sig = await signStripeWebhook(raw, testEnv.STRIPE_WEBHOOK_SECRET);
    const res = await worker.fetch(new Request(`${ORIGIN}/stripe/webhook`, {
      method: 'POST', headers: { 'Stripe-Signature': sig }, body: raw,
    }), testEnv, { waitUntil() {} });
    expect(res.status).toBe(200);
    const row = await getEntitlement(workerEnv.DB, { accountId: account.accountId, service: 'spp_hosted' });
    expect(row).toMatchObject({ status: 'active', source: 'stripe', source_ref: 'sub_spp_new', current_period_end: periodEnd });
  });
});

describe('confidential processing: what the pages say', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('before the sale, the catalog and landing read as they always have', async () => {
    const testEnv = makeTestEnv();
    const catalog = await (await worker.fetch(new Request(`${ORIGIN}/`), testEnv)).text();
    expect(catalog).toContain('<span class="tag free">scouts</span>');
    expect(catalog).not.toContain('$96');
    const landing = await (await worker.fetch(new Request(`${ORIGIN}/confidential-processing`), testEnv)).text();
    expect(landing).toContain('available to approved scouts');
    expect(landing).not.toContain('$9.99');
  });

  it('on sale, the catalog, landing and service page carry the price and the subscribe path', async () => {
    const testEnv = onSaleEnv();
    const catalog = await (await worker.fetch(new Request(`${ORIGIN}/`), testEnv)).text();
    expect(catalog).toContain('$96<span class="per">/yr</span>');
    const landing = await (await worker.fetch(new Request(`${ORIGIN}/confidential-processing`), testEnv)).text();
    expect(landing).toContain('$9.99 / month');
    expect(landing).not.toContain('available to approved scouts');

    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    installStripeFetchMock({});
    const page = await (await worker.fetch(new Request(`${ORIGIN}/confidential-processing`, { headers: { Cookie: session.cookie } }), testEnv)).text();
    expect(page).toContain('action="/confidential-processing/checkout"');
    expect(page).toContain('data-plan-terms');
  });

  it('a scout page reads complimentary only once on sale', async () => {
    const off = await (await worker.fetch(new Request(`${ORIGIN}/scout`), makeTestEnv())).text();
    const on = await (await worker.fetch(new Request(`${ORIGIN}/scout`), onSaleEnv())).text();
    expect(off).not.toContain('complimentary for approved scouts. turn it on');
    expect(on).toContain('complimentary for approved scouts. turn it on');
  });
});
