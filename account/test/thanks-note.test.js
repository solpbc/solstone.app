import { createExecutionContext, env as workerEnv, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import migration from '../migrations/0054_renewal_thanks_note.sql?raw';
import {
  maybeSendSubscriptionAck,
  renderThanksNote,
  runRenewalCatchUp,
  runRenewalOneOff,
} from '../src/renewal-notices.js';
import { claimRenewalNotice } from '../src/db.js';
import {
  installStripeFetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  signStripeWebhook,
} from './helpers.js';

const DAY = 86400;
const TAG_SERVICE = { spl: 'spl_hosted', spb: 'spb_hosted', sme: 'sme_hosted', spp: 'spp_hosted' };

function subscription({ id, tag, customer, start, created = start, status = 'active', interval = 'year', amount = 2000 }) {
  return {
    id,
    object: 'subscription',
    status,
    created,
    start_date: start,
    current_period_end: start + (interval === 'year' ? 365 : 30) * DAY,
    customer,
    metadata: { service: tag },
    items: { data: [{ quantity: 1, price: { unit_amount: amount, currency: 'usd', recurring: { interval } } }] },
  };
}

function json(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

// Stripe as one customer holds it: each subscription readable by id, and the list of them all.
function installStripe(subs) {
  const handlers = { 'GET api.stripe.com/v1/subscriptions': () => json({ object: 'list', data: [...subs].reverse(), has_more: false }) };
  for (const sub of subs) handlers[`GET api.stripe.com/v1/subscriptions/${sub.id}`] = () => json(sub);
  handlers.default = () => json({});
  return installStripeFetchMock(handlers);
}

function rulesEnv(overrides = {}) {
  return makeTestEnv({ SUBSCRIPTION_RULES: 'on', WITHDRAWAL_DOOR: 'on', ...overrides });
}

// An email binding that refuses the sends whose 1-based positions are listed.
function flakyEmail(failAt) {
  const sent = [];
  let attempts = 0;
  return {
    sent,
    async send(message) {
      attempts += 1;
      if (failAt.includes(attempts)) throw new Error('send failed');
      sent.push(message);
      return { messageId: `test-${attempts}` };
    },
  };
}

async function buy(testEnv, { accountId, sub }) {
  const service = TAG_SERVICE[sub.metadata.service];
  await seedEntitlement({ accountId, service, sourceRef: sub.id });
  await maybeSendSubscriptionAck(testEnv, { accountId, tag: sub.metadata.service, status: 'active', sourceRef: sub.id, subscription: sub });
}

async function notices(accountId) {
  const { results } = await workerEnv.DB
    .prepare('SELECT kind, service, content_key, subject, body, created_at FROM renewal_notices WHERE account_id = ? ORDER BY created_at, kind')
    .bind(accountId)
    .all();
  return results;
}

async function seedAck(accountId, { service, subscriptionRef, createdAt }) {
  await workerEnv.DB
    .prepare(`INSERT INTO renewal_notices (account_id, kind, service, renewal_at, content_key, subject, body, created_at)
              VALUES (?, 'ack', ?, 0, ?, 'confirmation', 'confirmation body', ?)`)
    .bind(accountId, service, subscriptionRef, createdAt)
    .run();
}

const THANKS_BODY = (service) => `thank you for your ${service} subscription!

we appreciate you being a part of our mission to give everyone a safe place for their digital memories.

your journal is always private, only yours.

jer
founder, sol pbc`;

describe('first-purchase thank-you note', () => {
  let nowSec;

  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
    nowSec = Math.floor(Date.now() / 1000);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the approved words for each of the four services, with no link or image', () => {
    const names = {
      spl_hosted: 'private network',
      spb_hosted: 'encrypted backup',
      sme_hosted: 'solstone.me',
      spp_hosted: 'confidential processing',
    };
    for (const [service, name] of Object.entries(names)) {
      const note = renderThanksNote({ service });
      expect(note.subject).toBe('thank you, from jer');
      expect(note.text).toBe(THANKS_BODY(name));
      expect(note.html).toContain(`<p>thank you for your ${name} subscription!</p>`);
      expect(note.html).toContain('<p>jer<br>founder, sol pbc</p>');
      expect(note.html).not.toMatch(/<a\b|<img\b|https?:|src=|href=/i);
    }
    expect(renderThanksNote({ service: 'unknown' })).toBeNull();
  });

  it('a first purchase through checkout sends the confirmation, then the note, and keeps a copy of each', async () => {
    const testEnv = rulesEnv();
    const { accountId } = await seedAccount({ email: 'first@example.com', testEnv });
    const sub = subscription({ id: 'sub_first', tag: 'spl', customer: 'cus_first', start: nowSec });
    installStripe([sub]);

    const rawBody = JSON.stringify({
      id: 'evt_first',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_first', client_reference_id: accountId, customer: 'cus_first', subscription: 'sub_first' } },
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(new Request('https://services.solstone.app/stripe/webhook', {
      method: 'POST',
      headers: { 'Stripe-Signature': await signStripeWebhook(rawBody, testEnv.STRIPE_WEBHOOK_SECRET) },
      body: rawBody,
    }), testEnv, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);

    expect(testEnv.EMAIL.sent.map((m) => m.subject)).toEqual([
      'your private network subscription: keep this for your records',
      'thank you, from jer',
    ]);
    const note = testEnv.EMAIL.sent[1];
    expect(note.from).toBe('solstone services <support@solstone.app>');
    expect(note.to).toBe('first@example.com');
    expect(note.text).toBe(THANKS_BODY('private network'));

    const rows = await notices(accountId);
    expect(rows.map((r) => r.kind)).toEqual(['ack', 'thanks']);
    expect(rows[1]).toMatchObject({ service: 'spl_hosted', content_key: 'sub_first', subject: 'thank you, from jer', body: note.text });
  });

  it('a second purchase on the same sign-in gets its confirmation and no note', async () => {
    const testEnv = rulesEnv();
    const { accountId } = await seedAccount({ email: 'second@example.com', testEnv });
    const first = subscription({ id: 'sub_one', tag: 'spl', customer: 'cus_two', start: nowSec - 2 * DAY });
    const second = subscription({ id: 'sub_two', tag: 'spb', customer: 'cus_two', start: nowSec, interval: 'month', amount: 499 });
    installStripe([first, second]);

    await buy(testEnv, { accountId, sub: first });
    expect(testEnv.EMAIL.sent.map((m) => m.subject)).toEqual([
      'your private network subscription: keep this for your records',
      'thank you, from jer',
    ]);

    await buy(testEnv, { accountId, sub: second });
    expect(testEnv.EMAIL.sent.map((m) => m.subject).slice(2)).toEqual([
      'your encrypted backup subscription: keep this for your records',
    ]);
    expect((await notices(accountId)).filter((r) => r.kind === 'thanks')).toHaveLength(1);
  });

  it('an earlier paid subscription known only to Stripe (lapsed, or withdrawn) means no note', async () => {
    const testEnv = rulesEnv();
    const { accountId } = await seedAccount({ email: 'returning@example.com', testEnv });
    const old = subscription({ id: 'sub_old', tag: 'sme', customer: 'cus_ret', start: nowSec - 200 * DAY, status: 'canceled', amount: 500 });
    const now = subscription({ id: 'sub_now', tag: 'sme', customer: 'cus_ret', start: nowSec, amount: 500 });
    installStripe([old, now]);

    await buy(testEnv, { accountId, sub: now });
    expect(testEnv.EMAIL.sent.map((m) => m.subject)).toEqual(['your solstone.me subscription: keep this for your records']);
  });

  it('a checkout whose payment never went through is no purchase, so the next one gets the note', async () => {
    const testEnv = rulesEnv();
    const { accountId } = await seedAccount({ email: 'retry-card@example.com', testEnv });
    const failed = subscription({ id: 'sub_failed', tag: 'spp', customer: 'cus_card', start: nowSec - DAY, status: 'incomplete_expired', amount: 999, interval: 'month' });
    const paid = subscription({ id: 'sub_paid', tag: 'spp', customer: 'cus_card', start: nowSec, amount: 999, interval: 'month' });
    installStripe([failed, paid]);

    await buy(testEnv, { accountId, sub: paid });
    expect(testEnv.EMAIL.sent.map((m) => m.subject)).toEqual([
      'your confidential processing subscription: keep this for your records',
      'thank you, from jer',
    ]);
  });

  it('a renewal produces no note', async () => {
    const testEnv = rulesEnv();
    const { accountId } = await seedAccount({ email: 'renewal@example.com', testEnv });
    const sub = subscription({ id: 'sub_renew', tag: 'spl', customer: 'cus_renew', start: nowSec - 365 * DAY });
    await seedAck(accountId, { service: 'spl_hosted', subscriptionRef: 'sub_renew', createdAt: (nowSec - 365 * DAY) * 1000 });
    const { calls } = installStripe([sub]);

    await buy(testEnv, { accountId, sub });
    expect(testEnv.EMAIL.sent).toHaveLength(0);
    expect(calls.filter((c) => c.url.pathname === '/v1/subscriptions')).toHaveLength(0);
  });

  it('no back-fill: a subscriber whose first purchase was confirmed before the note existed never gets it', async () => {
    const testEnv = rulesEnv();
    const { accountId } = await seedAccount({ email: 'existing@example.com', testEnv });
    // Bought two days ago and confirmed then; any later event for it (an update, a payment) finds no note owed.
    const sub = subscription({ id: 'sub_existing', tag: 'spl', customer: 'cus_existing', start: nowSec - 2 * DAY });
    await seedAck(accountId, { service: 'spl_hosted', subscriptionRef: 'sub_existing', createdAt: (nowSec - 2 * DAY) * 1000 });
    installStripe([sub]);

    await buy(testEnv, { accountId, sub });
    expect(testEnv.EMAIL.sent).toHaveLength(0);
    expect((await notices(accountId)).map((r) => r.kind)).toEqual(['ack']);
  });

  it('a confirmation that reaches an older subscription late carries no note', async () => {
    const testEnv = rulesEnv();
    const { accountId } = await seedAccount({ email: 'late@example.com', testEnv });
    const sub = subscription({ id: 'sub_late', tag: 'spl', customer: 'cus_late', start: nowSec - 30 * DAY });
    installStripe([sub]);

    await buy(testEnv, { accountId, sub });
    expect(testEnv.EMAIL.sent.map((m) => m.subject)).toEqual(['your private network subscription: keep this for your records']);
  });

  it('scout approval sends nothing, and a scout who later pays gets the note then', async () => {
    const testEnv = rulesEnv();
    const { accountId } = await seedAccount({ email: 'scout@example.com', testEnv });
    await seedEntitlement({ accountId, service: 'spl_hosted', source: 'comp', sourceRef: null, currentPeriodEnd: null });
    const { calls } = installStripe([]);
    await maybeSendSubscriptionAck(testEnv, { accountId, tag: 'spl', status: 'active', sourceRef: 'sub_none' });
    expect(testEnv.EMAIL.sent).toHaveLength(0);
    expect(calls).toHaveLength(0);

    const paid = subscription({ id: 'sub_scout_pays', tag: 'spp', customer: 'cus_scout', start: nowSec, amount: 9600 });
    installStripe([paid]);
    await buy(testEnv, { accountId, sub: paid });
    expect(testEnv.EMAIL.sent.map((m) => m.subject)).toEqual([
      'your confidential processing subscription: keep this for your records',
      'thank you, from jer',
    ]);
  });

  it('a failed send gives the claim back, and a later event for the purchase sends it', async () => {
    const email = flakyEmail([2]);
    const testEnv = rulesEnv({ EMAIL: email });
    const { accountId } = await seedAccount({ email: 'flaky@example.com', testEnv });
    const sub = subscription({ id: 'sub_flaky', tag: 'spb', customer: 'cus_flaky', start: nowSec, interval: 'month', amount: 499 });
    installStripe([sub]);

    await buy(testEnv, { accountId, sub });
    expect(email.sent.map((m) => m.subject)).toEqual(['your encrypted backup subscription: keep this for your records']);
    expect((await notices(accountId)).map((r) => r.kind)).toEqual(['ack']);

    // An event right behind the confirmation leaves the note alone, so it can't arrive first.
    await maybeSendSubscriptionAck(testEnv, { accountId, tag: 'spb', status: 'active', sourceRef: sub.id, subscription: sub });
    expect(email.sent).toHaveLength(1);

    // Two minutes on, the purchase's next event retries it.
    await workerEnv.DB.prepare("UPDATE renewal_notices SET created_at = created_at - 120000 WHERE account_id = ? AND kind = 'ack'").bind(accountId).run();
    await maybeSendSubscriptionAck(testEnv, { accountId, tag: 'spb', status: 'active', sourceRef: sub.id, subscription: sub });
    expect(email.sent.map((m) => m.subject)).toEqual([
      'your encrypted backup subscription: keep this for your records',
      'thank you, from jer',
    ]);
    expect((await notices(accountId)).filter((r) => r.kind === 'thanks')).toHaveLength(1);
  });

  it('overlapping events for one purchase send one confirmation and one note', async () => {
    const testEnv = rulesEnv();
    const { accountId } = await seedAccount({ email: 'overlap@example.com', testEnv });
    const sub = subscription({ id: 'sub_overlap', tag: 'sme', customer: 'cus_overlap', start: nowSec, amount: 500 });
    installStripe([sub]);
    await seedEntitlement({ accountId, service: 'sme_hosted', sourceRef: sub.id });

    const call = () => maybeSendSubscriptionAck(testEnv, { accountId, tag: 'sme', status: 'active', sourceRef: sub.id, subscription: sub });
    await Promise.all([call(), call(), call()]);
    expect(testEnv.EMAIL.sent.map((m) => m.subject)).toEqual([
      'your solstone.me subscription: keep this for your records',
      'thank you, from jer',
    ]);
  });

  it('no address means no note on retry', async () => {
    const testEnv = rulesEnv();
    const { accountId } = await seedAccount({ email: 'gone@example.com', testEnv });
    const sub = subscription({ id: 'sub_gone', tag: 'spl', customer: 'cus_gone', start: nowSec });
    installStripe([sub]);
    await seedEntitlement({ accountId, service: 'spl_hosted', sourceRef: sub.id });
    await seedAck(accountId, { service: 'spl_hosted', subscriptionRef: sub.id, createdAt: Date.now() - 120000 });
    await workerEnv.DB.prepare('UPDATE accounts SET primary_email_id = NULL WHERE id = ?').bind(accountId).run();

    await maybeSendSubscriptionAck(testEnv, { accountId, tag: 'spl', status: 'active', sourceRef: sub.id, subscription: sub });
    expect(testEnv.EMAIL.sent).toHaveLength(0);
    expect((await notices(accountId)).map((r) => r.kind)).toEqual(['ack']);
  });

  it('a second thank-you claim on the sign-in, for any service, is refused rather than raised', async () => {
    const testEnv = rulesEnv();
    const { accountId } = await seedAccount({ email: 'once@example.com', testEnv });
    const claim = (service, contentKey) => claimRenewalNotice(workerEnv.DB, {
      accountId, kind: 'thanks', service, renewalAt: 0, contentKey, subject: 's', body: 'b', nowMs: Date.now(),
    });
    expect(await claim('spl_hosted', 'sub_x')).toBe(true);
    expect(await claim('spb_hosted', 'sub_y')).toBe(false);
    expect(await claim('spl_hosted', 'sub_x')).toBe(false);
  });

  it('catch-up and one-off sends never carry the note', async () => {
    const testEnv = makeTestEnv();
    const { accountId } = await seedAccount({ email: 'catchup@example.com', testEnv });
    const sub = subscription({ id: 'sub_catchup', tag: 'spl', customer: 'cus_catchup', start: nowSec });
    installStripe([sub]);
    await seedEntitlement({ accountId, service: 'spl_hosted', sourceRef: sub.id });

    expect(await runRenewalCatchUp(testEnv)).toEqual({ sent: 1, skipped: 0 });
    await runRenewalOneOff(testEnv, { subject: 'a notice', body: 'a body' });
    expect(testEnv.EMAIL.sent.map((m) => m.subject)).not.toContain('thank you, from jer');
    expect((await notices(accountId)).filter((r) => r.kind === 'thanks')).toHaveLength(0);
  });
});

describe('migration 0054 renewal thanks note', () => {
  beforeEach(async () => {
    await resetDb();
    await workerEnv.DB.prepare('DROP TABLE renewal_notices').run();
    await workerEnv.DB.prepare(`
      CREATE TABLE renewal_notices (
        account_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('ack', 'reminder', 'oneoff', 'cooling_off', 'early_reminder')),
        service TEXT NOT NULL,
        renewal_at INTEGER NOT NULL,
        content_key TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (account_id, kind, service, renewal_at, content_key),
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      )
    `).run();
    await workerEnv.DB.prepare('INSERT INTO accounts (id, created_at) VALUES (?, ?)').bind('acct-0054', 1000).run();
    await workerEnv.DB.prepare(`INSERT INTO renewal_notices VALUES
      ('acct-0054', 'ack', 'spl_hosted', 0, 'sub_a', 's1', 'b1', 1),
      ('acct-0054', 'early_reminder', 'spl_hosted', 1800000000, '', 's2', 'b2', 2)`).run();
  });

  async function runMigration() {
    const executable = migration.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
    for (const statement of executable.split(';').map((s) => s.trim()).filter(Boolean)) {
      await workerEnv.DB.prepare(statement).run();
    }
  }

  const insertThanks = (service, contentKey) => workerEnv.DB
    .prepare(`INSERT INTO renewal_notices VALUES ('acct-0054', 'thanks', ?, 0, ?, 'thank you, from jer', 'body', 3)`)
    .bind(service, contentKey)
    .run();

  it('carries every row over and admits one thanks row per sign-in, naming its subscription', async () => {
    await runMigration();
    const { results } = await workerEnv.DB.prepare('SELECT kind, content_key, created_at FROM renewal_notices ORDER BY created_at').all();
    expect(results).toEqual([
      { kind: 'ack', content_key: 'sub_a', created_at: 1 },
      { kind: 'early_reminder', content_key: '', created_at: 2 },
    ]);
    await insertThanks('spl_hosted', 'sub_a');
    await expect(insertThanks('spb_hosted', 'sub_b')).rejects.toThrow();
    await workerEnv.DB.prepare("DELETE FROM renewal_notices WHERE kind = 'thanks'").run();
    await expect(insertThanks('spl_hosted', '')).rejects.toThrow();
  });
});
