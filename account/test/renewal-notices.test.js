import { createExecutionContext, env as workerEnv, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { hashWithPepper } from '../src/crypto.js';
import {
  addCalendarMonths,
  addCalendarYears,
  computeOneOffContentKey,
  formatPrice,
  formatRenewalDate,
  isAnniversaryRenewal,
  maybeSendSubscriptionAck,
  renderLegalNotice,
  renderOneOffHtml,
  runRenewalCatchUp,
  runRenewalOneOff,
  runRenewalReminders,
  selectInterval,
  validateSubscription,
} from '../src/renewal-notices.js';
import {
  claimRenewalNotice,
  deleteRenewalNotice,
  hasRenewalAck,
} from '../src/db.js';
import { OWNER_DATA_INVENTORY } from '../src/owner-data-inventory.js';
import {
  installConsoleSpy,
  installStripeFetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedSession,
  signStripeWebhook,
} from './helpers.js';
import { installJwksStubWith, mintToken } from './jwks-helper.js';

async function postWebhook(testEnv, rawBody, t) {
  const signature = await signStripeWebhook(rawBody, testEnv.STRIPE_WEBHOOK_SECRET, t);
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request('https://services.solstone.app/stripe/webhook', {
    method: 'POST',
    headers: { 'Stripe-Signature': signature },
    body: rawBody,
  }), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function runScheduled(testEnv, cron = '0 4 * * *') {
  const ctx = createExecutionContext();
  await worker.scheduled({ cron }, testEnv, ctx);
  await waitOnExecutionContext(ctx);
}

describe('Colorado Renewal Notices', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('Schema, Inventory, Cascade Deletion', () => {
    it('has renewal_notices registered in OWNER_DATA_INVENTORY with deletionOrder 175', () => {
      const entry = OWNER_DATA_INVENTORY.find((t) => t.name === 'renewal_notices');
      expect(entry).toBeDefined();
      expect(entry.deletionOrder).toBe(175);
      expect(entry.association).toBe('account_id');
      expect(entry.deletion).toBe('direct_owner_purge');
      expect(entry.exportTreatment).toBe('exportable');
      expect(entry.description).toBe('renewal notices sent to you');
    });

    it('cascades deletion of renewal_notices when account is deleted', async () => {
      const accountId = crypto.randomUUID();
      const nowMs = Date.now();
      await workerEnv.DB.prepare('INSERT INTO accounts (id, created_at) VALUES (?, ?)')
        .bind(accountId, nowMs)
        .run();

      const claimed = await claimRenewalNotice(workerEnv.DB, {
        accountId,
        kind: 'ack',
        service: 'spl_hosted',
        renewalAt: 0,
        contentKey: '',
        subject: 'test subject',
        body: 'test body',
        nowMs,
      });
      expect(claimed).toBe(true);

      const before = await workerEnv.DB.prepare('SELECT * FROM renewal_notices WHERE account_id = ?')
        .bind(accountId)
        .all();
      expect(before.results.length).toBe(1);

      await workerEnv.DB.prepare('DELETE FROM accounts WHERE id = ?')
        .bind(accountId)
        .run();

      const after = await workerEnv.DB.prepare('SELECT * FROM renewal_notices WHERE account_id = ?')
        .bind(accountId)
        .all();
      expect(after.results.length).toBe(0);
    });
  });

  describe('Legal Templates Character-for-Character and Transform Tests', () => {
    it('selectInterval selects interval, trims paragraphs, strips other block, rejects unknown', () => {
      const template = `intro paragraph.

plan. [ANNUAL] annual text here. [/ANNUAL] [MONTHLY] monthly text here. [/MONTHLY]

closing paragraph.`;

      const annual = selectInterval(template, 'year');
      expect(annual).toBe(`intro paragraph.\n\nplan. annual text here.\n\nclosing paragraph.`);

      const monthly = selectInterval(template, 'month');
      expect(monthly).toBe(`intro paragraph.\n\nplan. monthly text here.\n\nclosing paragraph.`);

      expect(selectInterval(template, 'week')).toBeNull();
      expect(selectInterval(template, 'day')).toBeNull();
    });

    it('formatPrice formats positive integers correctly and refuses invalid', () => {
      expect(formatPrice(2000)).toBe('$20');
      expect(formatPrice(249)).toBe('$2.49');
      expect(formatPrice(1050)).toBe('$10.50');
      expect(formatPrice(100)).toBe('$1');
      expect(formatPrice(0)).toBeNull();
      expect(formatPrice(-500)).toBeNull();
      expect(formatPrice(20.5)).toBeNull();
      expect(formatPrice(NaN)).toBeNull();
    });

    it('matches exact locked text for L1 annual private network', () => {
      const rendered = renderLegalNotice({
        kind: 'ack',
        service: 'spl_hosted',
        interval: 'year',
        unitAmount: 2000,
      });
      expect(rendered).not.toBeNull();
      expect(rendered.subject).toBe('your private network subscription: keep this for your records');
      const expectedText = `you just subscribed to private network. here's what that means, in writing, so you can keep it. it doesn't expire, and it isn't the only copy: the current terms are always at https://services.solstone.app/terms.

the plan. private network, $20 every year.

it renews on its own. at the end of each year, private network renews automatically at the plan's then-current price, using the payment method on file, until you cancel. we'll email you again, 25 to 40 days before each renewal, to say it's coming and how to cancel.

canceling takes as few steps as subscribing did. the billing portal, linked from https://services.solstone.app, cancels it. no phone call, no email, no retention maze. if you cancel, private network keeps working through the end of the period you've already paid for, then stops; we don't prorate a cancellation you make on your own.

questions: support@solstone.app.

sol pbc`;
      expect(rendered.text).toBe(expectedText);
      expect(rendered.html).toContain('<a href="https://services.solstone.app/terms">services.solstone.app/terms</a>');
      expect(rendered.html).toContain('<a href="https://services.solstone.app">services.solstone.app</a>');
      expect(rendered.html).toContain('<strong>the plan.</strong>');
      expect(rendered.html).toContain('<!DOCTYPE html>');
    });

    it('matches exact locked text for L1 monthly encrypted backup ($2.49)', () => {
      const rendered = renderLegalNotice({
        kind: 'ack',
        service: 'spb_hosted',
        interval: 'month',
        unitAmount: 249,
      });
      expect(rendered).not.toBeNull();
      expect(rendered.subject).toBe('your encrypted backup subscription: keep this for your records');
      expect(rendered.text).toContain('the plan. encrypted backup, $2.49 every month.');
      expect(rendered.text).toContain("we'll email you again once a year, 25 to 40 days before the renewal that carries you past each full year, to say it's coming and how to cancel.");
      expect(rendered.text).not.toContain('**');
      expect(rendered.text).not.toContain('{{');
    });

    it('matches exact locked text for Catch-up solstone.me', () => {
      const rendered = renderLegalNotice({
        kind: 'catch_up',
        service: 'sme_hosted',
        interval: 'year',
        unitAmount: 2000,
      });
      expect(rendered).not.toBeNull();
      expect(rendered.subject).toBe('your solstone.me subscription: the written confirmation we owed you');
      expect(rendered.text).toContain("you're subscribed to solstone.me, and this is the written confirmation Colorado's automatic-renewal law entitles you to.");
      expect(rendered.text).toContain('the plan. solstone.me, $20 every year.');
    });

    it('matches exact locked text for L2 reminder private network', () => {
      const renewalSec = 1799999999;
      const renewalDateStr = formatRenewalDate(renewalSec);
      const rendered = renderLegalNotice({
        kind: 'reminder',
        service: 'spl_hosted',
        interval: 'year',
        unitAmount: 2000,
        renewalSeconds: renewalSec,
      });
      expect(rendered).not.toBeNull();
      expect(rendered.subject).toBe(`your private network subscription renews on ${renewalDateStr}`);
      expect(rendered.text).toBe(`sol pbc runs your private network subscription, and it's set to renew on ${renewalDateStr} for another year, at $20, using the payment method on file.

if you want to keep it, there's nothing to do. it renews on its own.

if you'd rather not, cancel before then from the billing portal, linked from https://services.solstone.app. it takes as few steps as subscribing did, and you'll keep private network through the end of the period you've already paid for.

questions: support@solstone.app.

sol pbc`);
    });

    it('one-off content key hashes exactly length\\nsubject\\nlength\\nbody with SHA-256', async () => {
      const subject = 'important update';
      const body = 'hello world\n\nanother line';
      const key = await computeOneOffContentKey(subject, body);
      expect(key).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(key)).toBe(true);

      const payload = new TextEncoder().encode(`${subject.length}\n${subject}\n${body.length}\n${body}`);
      const expectedBuffer = await crypto.subtle.digest('SHA-256', payload);
      const expectedKey = Array.from(new Uint8Array(expectedBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      expect(key).toBe(expectedKey);
    });

    it('renderOneOffHtml escapes input and wraps in p tags', () => {
      const body = 'First line with <script>alert(1)</script> & "quotes".\n\nSecond paragraph.';
      const html = renderOneOffHtml(body);
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;.');
      expect(html).toContain('<p>Second paragraph.</p>');
      expect(html).toContain('<!DOCTYPE html>');
    });
  });

  describe('Anniversary Calculations', () => {
    it('annual subscription qualifies every year', () => {
      const S = Math.floor(Date.UTC(2026, 0, 15, 0, 0, 0) / 1000);
      const R1 = Math.floor(Date.UTC(2027, 0, 15, 0, 0, 0) / 1000);
      const R2 = Math.floor(Date.UTC(2028, 0, 15, 0, 0, 0) / 1000);

      expect(isAnniversaryRenewal(S, R1, 'year')).toBe(true);
      expect(isAnniversaryRenewal(S, R2, 'year')).toBe(true);
    });

    it('monthly subscription qualifies only on months 12, 24, 36... and not months 1-11, 13-23', () => {
      const S = Math.floor(Date.UTC(2026, 0, 15, 0, 0, 0) / 1000);

      for (let m = 1; m <= 11; m++) {
        const Rm = addCalendarMonths(S, m);
        expect(isAnniversaryRenewal(S, Rm, 'month')).toBe(false);
      }

      const R12 = addCalendarMonths(S, 12);
      expect(isAnniversaryRenewal(S, R12, 'month')).toBe(true);

      for (let m = 13; m <= 23; m++) {
        const Rm = addCalendarMonths(S, m);
        expect(isAnniversaryRenewal(S, Rm, 'month')).toBe(false);
      }

      const R24 = addCalendarMonths(S, 24);
      expect(isAnniversaryRenewal(S, R24, 'month')).toBe(true);
    });
  });

  describe('Defect 3 Acceptance Criteria Tests', () => {
    // 1. L1 webhook for annual private network, monthly encrypted backup, solstone.me annual & monthly, and EMAIL_PATH_DISABLED
    it('1. L1 webhook sends locked words for annual private network, monthly encrypted backup, solstone.me annual/monthly, and with EMAIL_PATH_DISABLED', async () => {
      const testEnv = makeTestEnv({ EMAIL_PATH_DISABLED: 'true' });
      const account1 = await seedAccount({ email: 'spl-owner@example.com', testEnv });
      const nowSec = 1736899200;

      installStripeFetchMock({
        'GET api.stripe.com/v1/subscriptions/sub_spl_ann': () => new Response(JSON.stringify({
          id: 'sub_spl_ann',
          object: 'subscription',
          status: 'active',
          start_date: nowSec,
          current_period_end: nowSec + 365 * 86400,
          customer: 'cus_spl_ann',
          metadata: { service: 'spl' },
          items: {
            data: [{
              quantity: 1,
              price: {
                unit_amount: 2000,
                currency: 'usd',
                recurring: { interval: 'year' },
              },
            }],
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
        'GET api.stripe.com/v1/subscriptions/sub_spb_mo': () => new Response(JSON.stringify({
          id: 'sub_spb_mo',
          object: 'subscription',
          status: 'active',
          start_date: nowSec,
          current_period_end: nowSec + 30 * 86400,
          customer: 'cus_spb_mo',
          metadata: { service: 'spb' },
          items: {
            data: [{
              quantity: 1,
              price: {
                unit_amount: 499,
                currency: 'usd',
                recurring: { interval: 'month' },
              },
            }],
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
        'GET api.stripe.com/v1/subscriptions/sub_sme_ann': () => new Response(JSON.stringify({
          id: 'sub_sme_ann',
          object: 'subscription',
          status: 'active',
          start_date: nowSec,
          current_period_end: nowSec + 365 * 86400,
          customer: 'cus_sme_ann',
          metadata: { service: 'sme' },
          items: {
            data: [{
              quantity: 1,
              price: {
                unit_amount: 500,
                currency: 'usd',
                recurring: { interval: 'year' },
              },
            }],
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
        'GET api.stripe.com/v1/subscriptions/sub_sme_mo': () => new Response(JSON.stringify({
          id: 'sub_sme_mo',
          object: 'subscription',
          status: 'active',
          start_date: nowSec,
          current_period_end: nowSec + 30 * 86400,
          customer: 'cus_sme_mo',
          metadata: { service: 'sme' },
          items: {
            data: [{
              quantity: 1,
              price: {
                unit_amount: 500,
                currency: 'usd',
                recurring: { interval: 'month' },
              },
            }],
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      });

      // SPL annual webhook
      const splRes = await postWebhook(testEnv, JSON.stringify({
        id: 'evt_spl_ann',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_spl_ann',
            client_reference_id: account1.accountId,
            customer: 'cus_spl_ann',
            subscription: 'sub_spl_ann',
          },
        },
      }));
      expect(splRes.status).toBe(200);

      expect(testEnv.EMAIL.sent.length).toBe(1);
      const email1 = testEnv.EMAIL.sent[0];
      expect(email1.from).toBe('solstone services <services@solstone.app>');
      expect(email1.to).toBe('spl-owner@example.com');
      expect(email1.subject).toBe('your private network subscription: keep this for your records');
      const expectedSplText = `you just subscribed to private network. here's what that means, in writing, so you can keep it. it doesn't expire, and it isn't the only copy: the current terms are always at https://services.solstone.app/terms.

the plan. private network, $20 every year.

it renews on its own. at the end of each year, private network renews automatically at the plan's then-current price, using the payment method on file, until you cancel. we'll email you again, 25 to 40 days before each renewal, to say it's coming and how to cancel.

canceling takes as few steps as subscribing did. the billing portal, linked from https://services.solstone.app, cancels it. no phone call, no email, no retention maze. if you cancel, private network keeps working through the end of the period you've already paid for, then stops; we don't prorate a cancellation you make on your own.

questions: support@solstone.app.

sol pbc`;
      expect(email1.text).toBe(expectedSplText);
      expect(email1.html).toBeTruthy();
      expect(email1.html).toContain('https://services.solstone.app/terms');
      expect(email1.html).toContain('https://services.solstone.app');
      expect(email1.html).toContain('private network');

      // SPB monthly webhook ($4.99)
      const account2 = await seedAccount({ email: 'spb-owner@example.com', testEnv });
      const spbRes = await postWebhook(testEnv, JSON.stringify({
        id: 'evt_spb_mo',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_spb_mo',
            client_reference_id: account2.accountId,
            customer: 'cus_spb_mo',
            subscription: 'sub_spb_mo',
          },
        },
      }));
      expect(spbRes.status).toBe(200);
      expect(testEnv.EMAIL.sent.length).toBe(2);
      const email2 = testEnv.EMAIL.sent[1];
      expect(email2.subject).toBe('your encrypted backup subscription: keep this for your records');
      expect(email2.text).toContain('the plan. encrypted backup, $4.99 every month.');
      expect(email2.text).toContain("we'll email you again once a year, 25 to 40 days before the renewal that carries you past each full year, to say it's coming and how to cancel.");
      expect(email2.text).not.toContain("we'll email you again, 25 to 40 days before each renewal");

      // SME annual webhook ($5.00 -> $5)
      const account3 = await seedAccount({ email: 'sme-ann@example.com', testEnv });
      const smeAnnRes = await postWebhook(testEnv, JSON.stringify({
        id: 'evt_sme_ann',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_sme_ann',
            client_reference_id: account3.accountId,
            customer: 'cus_sme_ann',
            subscription: 'sub_sme_ann',
          },
        },
      }));
      expect(smeAnnRes.status).toBe(200);
      expect(testEnv.EMAIL.sent.length).toBe(3);
      const email3 = testEnv.EMAIL.sent[2];
      expect(email3.subject).toBe('your solstone.me subscription: keep this for your records');
      expect(email3.text).toContain('the plan. solstone.me, $5 every year.');
      expect(email3.text).toContain("we'll email you again, 25 to 40 days before each renewal, to say it's coming and how to cancel.");

      // SME monthly webhook ($5/mo)
      const account4 = await seedAccount({ email: 'sme-mo@example.com', testEnv });
      const smeMoRes = await postWebhook(testEnv, JSON.stringify({
        id: 'evt_sme_mo',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_sme_mo',
            client_reference_id: account4.accountId,
            customer: 'cus_sme_mo',
            subscription: 'sub_sme_mo',
          },
        },
      }));
      expect(smeMoRes.status).toBe(200);
      expect(testEnv.EMAIL.sent.length).toBe(4);
      const email4 = testEnv.EMAIL.sent[3];
      expect(email4.subject).toBe('your solstone.me subscription: keep this for your records');
      expect(email4.text).toContain('the plan. solstone.me, $5 every month.');
      expect(email4.text).toContain("we'll email you again once a year, 25 to 40 days before the renewal that carries you past each full year, to say it's coming and how to cancel.");
    });

    // 2. Sequential vs Overlapping Checkouts
    it('2. Two sequential checkouts send 1 email and 1 ack row; two overlapping checkouts send 1 email and 1 ack row', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ email: 'checkout-dedup@example.com', testEnv });
      const nowSec = 1736899200;

      installStripeFetchMock({
        'GET api.stripe.com/v1/subscriptions/sub_seq_1': () => new Response(JSON.stringify({
          id: 'sub_seq_1',
          object: 'subscription',
          status: 'active',
          start_date: nowSec,
          current_period_end: nowSec + 365 * 86400,
          customer: 'cus_seq',
          metadata: { service: 'spl' },
          items: {
            data: [{
              quantity: 1,
              price: {
                unit_amount: 2000,
                currency: 'usd',
                recurring: { interval: 'year' },
              },
            }],
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      });

      // Sequential
      const payload1 = JSON.stringify({
        id: 'evt_seq_1',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_seq_1',
            client_reference_id: account.accountId,
            customer: 'cus_seq',
            subscription: 'sub_seq_1',
          },
        },
      });
      const res1 = await postWebhook(testEnv, payload1);
      expect(res1.status).toBe(200);
      expect(testEnv.EMAIL.sent.length).toBe(1);

      const res2 = await postWebhook(testEnv, payload1);
      expect(res2.status).toBe(200);
      expect(testEnv.EMAIL.sent.length).toBe(1);

      const rowsSeq = await workerEnv.DB.prepare('SELECT * FROM renewal_notices WHERE account_id = ? AND kind = ? AND service = ?')
        .bind(account.accountId, 'ack', 'spl_hosted')
        .all();
      expect(rowsSeq.results.length).toBe(1);

      // Overlapping
      const overlapAccount = await seedAccount({ email: 'overlap-user@example.com', testEnv });
      installStripeFetchMock({
        'GET api.stripe.com/v1/subscriptions/sub_overlap_1': () => new Response(JSON.stringify({
          id: 'sub_overlap_1',
          object: 'subscription',
          status: 'active',
          start_date: nowSec,
          current_period_end: nowSec + 365 * 86400,
          customer: 'cus_overlap',
          metadata: { service: 'spl' },
          items: {
            data: [{
              quantity: 1,
              price: {
                unit_amount: 2000,
                currency: 'usd',
                recurring: { interval: 'year' },
              },
            }],
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      });

      let firstCallResolve;
      const firstCallStarted = new Promise((r) => { firstCallResolve = r; });
      let secondRequestFinished = false;
      let sendCount = 0;
      const originalSent = testEnv.EMAIL.sent;

      testEnv.EMAIL = {
        sent: originalSent,
        async send(msg) {
          sendCount++;
          if (sendCount === 1) {
            firstCallResolve();
            while (!secondRequestFinished) {
              await new Promise((r) => setTimeout(r, 10));
            }
          }
          this.sent.push(msg);
        },
      };

      const overlapPayload = JSON.stringify({
        id: 'evt_overlap_1',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_overlap_1',
            client_reference_id: overlapAccount.accountId,
            customer: 'cus_overlap',
            subscription: 'sub_overlap_1',
          },
        },
      });

      const p1 = postWebhook(testEnv, overlapPayload);
      await firstCallStarted;
      const p2 = postWebhook(testEnv, overlapPayload).then((res) => {
        secondRequestFinished = true;
        return res;
      });

      const [resp1, resp2] = await Promise.all([p1, p2]);
      expect(resp1.status).toBe(200);
      expect(resp2.status).toBe(200);

      // Only 1 email added for overlapAccount
      const overlapEmails = testEnv.EMAIL.sent.filter((e) => e.to === 'overlap-user@example.com');
      expect(overlapEmails.length).toBe(1);

      const rowsOverlap = await workerEnv.DB.prepare('SELECT * FROM renewal_notices WHERE account_id = ? AND kind = ? AND service = ?')
        .bind(overlapAccount.accountId, 'ack', 'spl_hosted')
        .all();
      expect(rowsOverlap.results.length).toBe(1);
    });

    // 3. Catch-up after L1 and vice versa
    it('3. Catch-up after L1 returns 200 { sent: 0, skipped: 0 }; catch-up before checkout prevents second email', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ email: 'catchup-l1@example.com', testEnv });
      const nowSec = 1736899200;

      const stripe = installStripeFetchMock({
        'GET api.stripe.com/v1/subscriptions/sub_c1': () => new Response(JSON.stringify({
          id: 'sub_c1',
          object: 'subscription',
          status: 'active',
          start_date: nowSec,
          current_period_end: nowSec + 365 * 86400,
          customer: 'cus_c1',
          metadata: { service: 'spl' },
          items: {
            data: [{
              quantity: 1,
              price: {
                unit_amount: 2000,
                currency: 'usd',
                recurring: { interval: 'year' },
              },
            }],
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      });
      await installJwksStubWith((input, init) => stripe.fetchMock(input, init));
      const jwt = await mintToken();

      // Send L1 via checkout webhook
      const resWebhook = await postWebhook(testEnv, JSON.stringify({
        id: 'evt_c1',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_c1',
            client_reference_id: account.accountId,
            customer: 'cus_c1',
            subscription: 'sub_c1',
          },
        },
      }));
      expect(resWebhook.status).toBe(200);
      expect(testEnv.EMAIL.sent.length).toBe(1);

      // Now run catch-up
      const resCatchUp = await worker.fetch(new Request('https://services.solstone.app/admin/renewal-notices/catch-up', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': jwt,
        },
        body: JSON.stringify({ confirm: true }),
      }), testEnv);
      expect(resCatchUp.status).toBe(200);
      expect(await resCatchUp.json()).toEqual({ sent: 0, skipped: 0 });
      expect(testEnv.EMAIL.sent.length).toBe(1);

      // Reverse order on new account: Catch-up first, then checkout
      const account2 = await seedAccount({ email: 'catchup-first@example.com', testEnv });
      await seedEntitlement({
        accountId: account2.accountId,
        service: 'spl_hosted',
        status: 'active',
        source: 'stripe',
        sourceRef: 'sub_c2',
      });

      const stripe2 = installStripeFetchMock({
        'GET api.stripe.com/v1/subscriptions/sub_c2': () => new Response(JSON.stringify({
          id: 'sub_c2',
          object: 'subscription',
          status: 'active',
          start_date: nowSec,
          current_period_end: nowSec + 365 * 86400,
          customer: 'cus_c2',
          metadata: { service: 'spl' },
          items: {
            data: [{
              quantity: 1,
              price: {
                unit_amount: 2000,
                currency: 'usd',
                recurring: { interval: 'year' },
              },
            }],
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      });
      await installJwksStubWith((input, init) => stripe2.fetchMock(input, init));

      const resCatchUp2 = await worker.fetch(new Request('https://services.solstone.app/admin/renewal-notices/catch-up', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': jwt,
        },
        body: JSON.stringify({ confirm: true }),
      }), testEnv);
      expect(resCatchUp2.status).toBe(200);
      expect(await resCatchUp2.json()).toEqual({ sent: 1, skipped: 0 });
      expect(testEnv.EMAIL.sent.length).toBe(2);

      // Now checkout arrives for account2
      const resWebhook2 = await postWebhook(testEnv, JSON.stringify({
        id: 'evt_c2',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_c2',
            client_reference_id: account2.accountId,
            customer: 'cus_c2',
            subscription: 'sub_c2',
          },
        },
      }));
      expect(resWebhook2.status).toBe(200);
      expect(testEnv.EMAIL.sent.length).toBe(2); // No second email
    });

    // 4. Catch-up, L2, and one-off ignore comp, past_due, and spp_hosted
    it('4. Catch-up, L2, and one-off each ignore source=comp, status=past_due, and spp_hosted', async () => {
      const testEnv = makeTestEnv();
      const qualAccount = await seedAccount({ email: 'qualifying@example.com', testEnv });
      const compAccount = await seedAccount({ email: 'comp@example.com', testEnv });
      const pastDueAccount = await seedAccount({ email: 'pastdue@example.com', testEnv });
      const sppAccount = await seedAccount({ email: 'spp@example.com', testEnv });

      const nowSec = 1736899200;
      const renewalSec = nowSec + 30 * 86400;

      // Qualifying entitlement
      await seedEntitlement({
        accountId: qualAccount.accountId,
        service: 'spl_hosted',
        status: 'active',
        source: 'stripe',
        sourceRef: 'sub_qual',
        currentPeriodEnd: renewalSec,
      });

      // Comp entitlement
      await seedEntitlement({
        accountId: compAccount.accountId,
        service: 'spl_hosted',
        status: 'active',
        source: 'comp',
        sourceRef: 'comp_ref',
        currentPeriodEnd: renewalSec,
      });

      // Past due entitlement
      await seedEntitlement({
        accountId: pastDueAccount.accountId,
        service: 'spl_hosted',
        status: 'past_due',
        source: 'stripe',
        sourceRef: 'sub_past_due',
        currentPeriodEnd: renewalSec,
      });

      // SPP hosted entitlement
      await seedEntitlement({
        accountId: sppAccount.accountId,
        service: 'spp_hosted',
        status: 'active',
        source: 'stripe',
        sourceRef: 'sub_spp',
        currentPeriodEnd: renewalSec,
      });

      const stripe = installStripeFetchMock({
        'GET api.stripe.com/v1/subscriptions/sub_qual': () => new Response(JSON.stringify({
          id: 'sub_qual',
          object: 'subscription',
          status: 'active',
          start_date: addCalendarYears(renewalSec, -1),
          current_period_end: renewalSec,
          customer: 'cus_qual',
          metadata: { service: 'spl' },
          items: {
            data: [{
              quantity: 1,
              price: {
                unit_amount: 2000,
                currency: 'usd',
                recurring: { interval: 'year' },
              },
            }],
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      });
      await installJwksStubWith((input, init) => stripe.fetchMock(input, init));
      const jwt = await mintToken();

      // 4a. Catch-up
      const catchUpRes = await worker.fetch(new Request('https://services.solstone.app/admin/renewal-notices/catch-up', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': jwt,
        },
        body: JSON.stringify({ confirm: true }),
      }), testEnv);
      expect(catchUpRes.status).toBe(200);
      expect(await catchUpRes.json()).toEqual({ sent: 1, skipped: 0 });
      expect(testEnv.EMAIL.sent.map((e) => e.to)).toEqual(['qualifying@example.com']);

      // 4b. L2 reminder
      testEnv.EMAIL.sent.length = 0;
      const dateSpy = vi.spyOn(Date, 'now').mockReturnValue((renewalSec - 30 * 86400) * 1000);
      try {
        await runScheduled(testEnv);
        expect(testEnv.EMAIL.sent.map((e) => e.to)).toEqual(['qualifying@example.com']);
      } finally {
        dateSpy.mockRestore();
      }

      // 4c. One-off
      testEnv.EMAIL.sent.length = 0;
      const oneOffRes = await worker.fetch(new Request('https://services.solstone.app/admin/renewal-notices/one-off', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': jwt,
        },
        body: JSON.stringify({
          confirm: true,
          subject: 'Important notice',
          body: 'Hello members',
        }),
      }), testEnv);
      expect(oneOffRes.status).toBe(200);
      expect(await oneOffRes.json()).toEqual({ sent: 1, skipped: 0 });
      expect(testEnv.EMAIL.sent.map((e) => e.to)).toEqual(['qualifying@example.com']);
    });

    // 5. Annual L2 through scheduled and window boundary checks
    it('5. Annual L2 through scheduled respects exact window boundaries and anniversary years', async () => {
      const testEnv = makeTestEnv();
      const startSec = Math.floor(Date.UTC(2026, 0, 15, 0, 0, 0) / 1000);
      const renewal2027Sec = Math.floor(Date.UTC(2027, 0, 15, 0, 0, 0) / 1000);
      const renewal2028Sec = Math.floor(Date.UTC(2028, 0, 15, 0, 0, 0) / 1000);

      const makeSubResponse = (id, periodEndSec) => new Response(JSON.stringify({
        id,
        object: 'subscription',
        status: 'active',
        start_date: startSec,
        current_period_end: periodEndSec,
        customer: `cus_${id}`,
        metadata: { service: 'spl' },
        items: {
          data: [{
            quantity: 1,
            price: {
              unit_amount: 2000,
              currency: 'usd',
              recurring: { interval: 'year' },
            },
          }],
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });

      let currentPeriodEndC = renewal2027Sec;
      installStripeFetchMock({
        'GET api.stripe.com/v1/subscriptions/sub_ann_a': () => makeSubResponse('sub_ann_a', renewal2027Sec),
        'GET api.stripe.com/v1/subscriptions/sub_ann_b': () => makeSubResponse('sub_ann_b', renewal2027Sec),
        'GET api.stripe.com/v1/subscriptions/sub_ann_c': () => makeSubResponse('sub_ann_c', currentPeriodEndC),
      });

      const accountA = await seedAccount({ email: 'account-a@example.com', testEnv });
      const accountB = await seedAccount({ email: 'account-b@example.com', testEnv });
      const accountC = await seedAccount({ email: 'account-c@example.com', testEnv });

      await seedEntitlement({
        accountId: accountA.accountId,
        service: 'spl_hosted',
        status: 'active',
        source: 'stripe',
        sourceRef: 'sub_ann_a',
        currentPeriodEnd: renewal2027Sec,
      });

      // 41 days before: sends 0
      let dateSpy = vi.spyOn(Date, 'now').mockReturnValue((renewal2027Sec - 41 * 86400) * 1000);
      try {
        await runScheduled(testEnv);
        expect(testEnv.EMAIL.sent.length).toBe(0);
      } finally {
        dateSpy.mockRestore();
      }

      // 24 days before: sends 0
      dateSpy = vi.spyOn(Date, 'now').mockReturnValue((renewal2027Sec - 24 * 86400) * 1000);
      try {
        await runScheduled(testEnv);
        expect(testEnv.EMAIL.sent.length).toBe(0);
      } finally {
        dateSpy.mockRestore();
      }

      // 40 days + 1 second before: sends 0
      dateSpy = vi.spyOn(Date, 'now').mockReturnValue((renewal2027Sec - 40 * 86400 - 1) * 1000);
      try {
        await runScheduled(testEnv);
        expect(testEnv.EMAIL.sent.length).toBe(0);
      } finally {
        dateSpy.mockRestore();
      }

      // 25 days - 1 second before: sends 0
      dateSpy = vi.spyOn(Date, 'now').mockReturnValue((renewal2027Sec - 25 * 86400 + 1) * 1000);
      try {
        await runScheduled(testEnv);
        expect(testEnv.EMAIL.sent.length).toBe(0);
      } finally {
        dateSpy.mockRestore();
      }

      // Exactly 40 days before on Account A: sends 1
      dateSpy = vi.spyOn(Date, 'now').mockReturnValue((renewal2027Sec - 40 * 86400) * 1000);
      try {
        await runScheduled(testEnv);
        expect(testEnv.EMAIL.sent.length).toBe(1);
        expect(testEnv.EMAIL.sent[0].to).toBe('account-a@example.com');
      } finally {
        dateSpy.mockRestore();
      }

      // Exactly 25 days before on Account B: sends 1
      await seedEntitlement({
        accountId: accountB.accountId,
        service: 'spl_hosted',
        status: 'active',
        source: 'stripe',
        sourceRef: 'sub_ann_b',
        currentPeriodEnd: renewal2027Sec,
      });
      dateSpy = vi.spyOn(Date, 'now').mockReturnValue((renewal2027Sec - 25 * 86400) * 1000);
      try {
        await runScheduled(testEnv);
        expect(testEnv.EMAIL.sent.length).toBe(2);
        expect(testEnv.EMAIL.sent[1].to).toBe('account-b@example.com');
      } finally {
        dateSpy.mockRestore();
      }

      // 30 days before on Account C: sends 1 with locked L2 plain text for $20 / year / 2027-01-15
      await seedEntitlement({
        accountId: accountC.accountId,
        service: 'spl_hosted',
        status: 'active',
        source: 'stripe',
        sourceRef: 'sub_ann_c',
        currentPeriodEnd: renewal2027Sec,
      });
      dateSpy = vi.spyOn(Date, 'now').mockReturnValue((renewal2027Sec - 30 * 86400) * 1000);
      try {
        await runScheduled(testEnv);
        expect(testEnv.EMAIL.sent.length).toBe(3);
        const emailC = testEnv.EMAIL.sent[2];
        expect(emailC.to).toBe('account-c@example.com');
        expect(emailC.subject).toBe('your private network subscription renews on 2027-01-15');
        const expectedL2Text = `sol pbc runs your private network subscription, and it's set to renew on 2027-01-15 for another year, at $20, using the payment method on file.

if you want to keep it, there's nothing to do. it renews on its own.

if you'd rather not, cancel before then from the billing portal, linked from https://services.solstone.app. it takes as few steps as subscribing did, and you'll keep private network through the end of the period you've already paid for.

questions: support@solstone.app.

sol pbc`;
        expect(emailC.text).toBe(expectedL2Text);

        // Second scheduled scan in that window: sends 0
        await runScheduled(testEnv);
        expect(testEnv.EMAIL.sent.length).toBe(3);
      } finally {
        dateSpy.mockRestore();
      }

      // 30 days before 2028-01-15: updates to 2028 period end, sends 1 more
      currentPeriodEndC = renewal2028Sec;
      await workerEnv.DB.prepare('UPDATE entitlements SET current_period_end = ? WHERE account_id = ?')
        .bind(renewal2028Sec, accountC.accountId)
        .run();
      dateSpy = vi.spyOn(Date, 'now').mockReturnValue((renewal2028Sec - 30 * 86400) * 1000);
      try {
        await runScheduled(testEnv);
        expect(testEnv.EMAIL.sent.length).toBe(4);
        const emailC2 = testEnv.EMAIL.sent[3];
        expect(emailC2.to).toBe('account-c@example.com');
        expect(emailC2.subject).toBe('your private network subscription renews on 2028-01-15');
      } finally {
        dateSpy.mockRestore();
      }
    });

    // 6. Monthly end-to-end walk through scheduled
    it('6. Monthly end-to-end walk through scheduled qualifies only on months 12 and 24', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ email: 'monthly-walk@example.com', testEnv });
      const startSec = Math.floor(Date.UTC(2026, 0, 15, 0, 0, 0) / 1000);

      let currentPeriodEnd = addCalendarMonths(startSec, 11);
      installStripeFetchMock({
        'GET api.stripe.com/v1/subscriptions/sub_mo_walk': () => new Response(JSON.stringify({
          id: 'sub_mo_walk',
          object: 'subscription',
          status: 'active',
          start_date: startSec,
          current_period_end: currentPeriodEnd,
          customer: 'cus_mo_walk',
          metadata: { service: 'spb' },
          items: {
            data: [{
              quantity: 1,
              price: {
                unit_amount: 499,
                currency: 'usd',
                recurring: { interval: 'month' },
              },
            }],
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      });

      await seedEntitlement({
        accountId: account.accountId,
        service: 'spb_hosted',
        status: 'active',
        source: 'stripe',
        sourceRef: 'sub_mo_walk',
        currentPeriodEnd,
      });

      // 30 days before 2026-12-15 (month 11): sends 0
      let dateSpy = vi.spyOn(Date, 'now').mockReturnValue((currentPeriodEnd - 30 * 86400) * 1000);
      try {
        await runScheduled(testEnv);
        expect(testEnv.EMAIL.sent.length).toBe(0);
      } finally {
        dateSpy.mockRestore();
      }

      // 30 days before 2027-01-15 (month 12): sends 1
      currentPeriodEnd = addCalendarMonths(startSec, 12);
      await workerEnv.DB.prepare('UPDATE entitlements SET current_period_end = ? WHERE account_id = ?')
        .bind(currentPeriodEnd, account.accountId)
        .run();
      dateSpy = vi.spyOn(Date, 'now').mockReturnValue((currentPeriodEnd - 30 * 86400) * 1000);
      try {
        await runScheduled(testEnv);
        expect(testEnv.EMAIL.sent.length).toBe(1);
        expect(testEnv.EMAIL.sent[0].subject).toBe('your encrypted backup subscription renews on 2027-01-15');

        // Second scan in same window: sends 0
        await runScheduled(testEnv);
        expect(testEnv.EMAIL.sent.length).toBe(1);
      } finally {
        dateSpy.mockRestore();
      }

      // Months 13 through 23: sends 0
      for (let m = 13; m <= 23; m++) {
        currentPeriodEnd = addCalendarMonths(startSec, m);
        await workerEnv.DB.prepare('UPDATE entitlements SET current_period_end = ? WHERE account_id = ?')
          .bind(currentPeriodEnd, account.accountId)
          .run();
        dateSpy = vi.spyOn(Date, 'now').mockReturnValue((currentPeriodEnd - 30 * 86400) * 1000);
        try {
          await runScheduled(testEnv);
          expect(testEnv.EMAIL.sent.length).toBe(1);
        } finally {
          dateSpy.mockRestore();
        }
      }

      // Month 24 (2028-01-15): sends 1 more
      currentPeriodEnd = addCalendarMonths(startSec, 24);
      await workerEnv.DB.prepare('UPDATE entitlements SET current_period_end = ? WHERE account_id = ?')
        .bind(currentPeriodEnd, account.accountId)
        .run();
      dateSpy = vi.spyOn(Date, 'now').mockReturnValue((currentPeriodEnd - 30 * 86400) * 1000);
      try {
        await runScheduled(testEnv);
        expect(testEnv.EMAIL.sent.length).toBe(2);
        expect(testEnv.EMAIL.sent[1].subject).toBe('your encrypted backup subscription renews on 2028-01-15');
      } finally {
        dateSpy.mockRestore();
      }
    });

    // 7. Overlapping L2 scheduled calls concurrency test
    it('7. Two overlapping L2 scheduled calls result in exactly one email and one reminder row', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ email: 'l2-overlap@example.com', testEnv });
      const nowSec = 1736899200;
      const renewalSec = nowSec + 30 * 86400;

      installStripeFetchMock({
        'GET api.stripe.com/v1/subscriptions/sub_l2_ov': () => new Response(JSON.stringify({
          id: 'sub_l2_ov',
          object: 'subscription',
          status: 'active',
          start_date: addCalendarYears(renewalSec, -1),
          current_period_end: renewalSec,
          customer: 'cus_l2_ov',
          metadata: { service: 'spl' },
          items: {
            data: [{
              quantity: 1,
              price: {
                unit_amount: 2000,
                currency: 'usd',
                recurring: { interval: 'year' },
              },
            }],
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      });

      await seedEntitlement({
        accountId: account.accountId,
        service: 'spl_hosted',
        status: 'active',
        source: 'stripe',
        sourceRef: 'sub_l2_ov',
        currentPeriodEnd: renewalSec,
      });

      let firstSendResolve;
      const firstSendStarted = new Promise((r) => { firstSendResolve = r; });
      let secondScanFinished = false;
      let sendCount = 0;

      testEnv.EMAIL = {
        sent: [],
        async send(msg) {
          sendCount++;
          if (sendCount === 1) {
            firstSendResolve();
            while (!secondScanFinished) {
              await new Promise((r) => setTimeout(r, 10));
            }
          }
          this.sent.push(msg);
        },
      };

      const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(nowSec * 1000);
      try {
        const p1 = runScheduled(testEnv);
        await firstSendStarted;
        const p2 = runScheduled(testEnv).then(() => {
          secondScanFinished = true;
        });

        await Promise.all([p1, p2]);

        expect(testEnv.EMAIL.sent.length).toBe(1);
        const rows = await workerEnv.DB.prepare('SELECT * FROM renewal_notices WHERE account_id = ? AND kind = ? AND renewal_at = ?')
          .bind(account.accountId, 'reminder', renewalSec)
          .all();
        expect(rows.results.length).toBe(1);
      } finally {
        dateSpy.mockRestore();
      }
    });

    // 8. One-off HTML escaping, 101 accounts pagination, and service dedup
    it('8. One-off stores raw text, escapes HTML, paginates >100 accounts, and deduplicates multi-service accounts', async () => {
      const testEnv = makeTestEnv();
      const stripe = installStripeFetchMock({});
      await installJwksStubWith((input, init) => stripe.fetchMock(input, init));
      const jwt = await mintToken();

      // Seed 101 qualifying accounts
      for (let i = 0; i < 101; i++) {
        const acc = await seedAccount({ email: `user${i}@example.com`, testEnv });
        await seedEntitlement({
          accountId: acc.accountId,
          service: 'spl_hosted',
          status: 'active',
          source: 'stripe',
          sourceRef: `sub_${i}`,
        });
        if (i === 0) {
          // Account 0 also has a second active service
          await seedEntitlement({
            accountId: acc.accountId,
            service: 'spb_hosted',
            status: 'active',
            source: 'stripe',
            sourceRef: 'sub_0_spb',
          });
        }
      }

      const res = await worker.fetch(new Request('https://services.solstone.app/admin/renewal-notices/one-off', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': jwt,
        },
        body: JSON.stringify({
          confirm: true,
          subject: 'Terms & Conditions Update',
          body: 'Here is a <b>bold</b> statement & a note.\n\nSecond paragraph.',
        }),
      }), testEnv);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ sent: 101, skipped: 0 });
      expect(testEnv.EMAIL.sent.length).toBe(101);

      const email0 = testEnv.EMAIL.sent[0];
      expect(email0.subject).toBe('Terms & Conditions Update');
      expect(email0.text).toBe('Here is a <b>bold</b> statement & a note.\n\nSecond paragraph.');
      expect(email0.html).toContain('&lt;b&gt;bold&lt;/b&gt; statement &amp; a note.');
      expect(email0.html).toContain('<p>Second paragraph.</p>');
    });

    // 9. Catch-up skips account with null primary_email_id
    it('9. Catch-up skips account whose primary_email_id is null and logs reason no_email', async () => {
      const consoleSpy = installConsoleSpy();
      const testEnv = makeTestEnv();
      const goodAccount = await seedAccount({ email: 'good-email@example.com', testEnv });
      const badAccount = await seedAccount({ email: 'bad-email@example.com', testEnv });

      // Null out primary_email_id on badAccount
      await workerEnv.DB.prepare('UPDATE accounts SET primary_email_id = NULL WHERE id = ?')
        .bind(badAccount.accountId)
        .run();

      await seedEntitlement({
        accountId: goodAccount.accountId,
        service: 'spl_hosted',
        status: 'active',
        source: 'stripe',
        sourceRef: 'sub_good',
      });
      await seedEntitlement({
        accountId: badAccount.accountId,
        service: 'spl_hosted',
        status: 'active',
        source: 'stripe',
        sourceRef: 'sub_bad_email',
      });

      const stripe = installStripeFetchMock({
        'GET api.stripe.com/v1/subscriptions/sub_good': () => new Response(JSON.stringify({
          id: 'sub_good',
          object: 'subscription',
          status: 'active',
          start_date: 1736899200,
          current_period_end: 1768435200,
          customer: 'cus_good',
          metadata: { service: 'spl' },
          items: {
            data: [{
              quantity: 1,
              price: {
                unit_amount: 2000,
                currency: 'usd',
                recurring: { interval: 'year' },
              },
            }],
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      });
      await installJwksStubWith((input, init) => stripe.fetchMock(input, init));
      const jwt = await mintToken();

      const res = await worker.fetch(new Request('https://services.solstone.app/admin/renewal-notices/catch-up', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': jwt,
        },
        body: JSON.stringify({ confirm: true }),
      }), testEnv);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ sent: 1, skipped: 1 });
      expect(testEnv.EMAIL.sent.length).toBe(1);
      expect(testEnv.EMAIL.sent[0].to).toBe('good-email@example.com');

      const warnCall = consoleSpy.calls.find((c) => c.level === 'warn' && c.args[0].includes('renewal_notice_skipped'));
      expect(warnCall).toBeDefined();
      const parsed = JSON.parse(warnCall.args[0]);
      expect(parsed.reason).toBe('no_email');
      expect(parsed.account_id).toBeUndefined();
      expect(parsed.account_ref).toBe(await hashWithPepper(`hub:account:${badAccount.accountId}`, testEnv));
      expect(warnCall.args[0]).not.toContain(badAccount.accountId);

      const badRow = await workerEnv.DB.prepare('SELECT * FROM renewal_notices WHERE account_id = ?')
        .bind(badAccount.accountId)
        .first();
      expect(badRow).toBeNull();
      consoleSpy.restore();
    });

    // 10. Catch-up skips unusable Stripe subscriptions
    it('10. Catch-up skips accounts where Stripe errors or price is malformed (stripe_unusable)', async () => {
      const consoleSpy = installConsoleSpy();
      const testEnv = makeTestEnv();
      const goodAcc = await seedAccount({ email: 'good-stripe@example.com', testEnv });
      const errAcc = await seedAccount({ email: 'err-stripe@example.com', testEnv });
      const bareAcc = await seedAccount({ email: 'bare-stripe@example.com', testEnv });

      await seedEntitlement({
        accountId: goodAcc.accountId,
        service: 'spl_hosted',
        status: 'active',
        source: 'stripe',
        sourceRef: 'sub_good_st',
      });
      await seedEntitlement({
        accountId: errAcc.accountId,
        service: 'spl_hosted',
        status: 'active',
        source: 'stripe',
        sourceRef: 'sub_err_st',
      });
      await seedEntitlement({
        accountId: bareAcc.accountId,
        service: 'spl_hosted',
        status: 'active',
        source: 'stripe',
        sourceRef: 'sub_bare_st',
      });

      const stripe = installStripeFetchMock({
        'GET api.stripe.com/v1/subscriptions/sub_good_st': () => new Response(JSON.stringify({
          id: 'sub_good_st',
          object: 'subscription',
          status: 'active',
          start_date: 1736899200,
          current_period_end: 1768435200,
          customer: 'cus_good_st',
          metadata: { service: 'spl' },
          items: {
            data: [{
              quantity: 1,
              price: {
                unit_amount: 2000,
                currency: 'usd',
                recurring: { interval: 'year' },
              },
            }],
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
        'GET api.stripe.com/v1/subscriptions/sub_err_st': () => new Response(JSON.stringify({
          error: { message: 'Subscription deleted' },
        }), { status: 404, headers: { 'Content-Type': 'application/json' } }),
        'GET api.stripe.com/v1/subscriptions/sub_bare_st': () => new Response(JSON.stringify({
          id: 'sub_bare_st',
          object: 'subscription',
          status: 'active',
          start_date: 1736899200,
          current_period_end: 1768435200,
          customer: 'cus_bare_st',
          metadata: { service: 'spl' },
          items: {
            data: [{
              quantity: 1,
              price: 'price_bare', // Not an object!
            }],
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      });
      await installJwksStubWith((input, init) => stripe.fetchMock(input, init));
      const jwt = await mintToken();

      const res = await worker.fetch(new Request('https://services.solstone.app/admin/renewal-notices/catch-up', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': jwt,
        },
        body: JSON.stringify({ confirm: true }),
      }), testEnv);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ sent: 1, skipped: 2 });
      expect(testEnv.EMAIL.sent.length).toBe(1);
      expect(testEnv.EMAIL.sent[0].to).toBe('good-stripe@example.com');

      const errRow = await workerEnv.DB.prepare('SELECT * FROM renewal_notices WHERE account_id = ?')
        .bind(errAcc.accountId)
        .first();
      expect(errRow).toBeNull();
      const bareRow = await workerEnv.DB.prepare('SELECT * FROM renewal_notices WHERE account_id = ?')
        .bind(bareAcc.accountId)
        .first();
      expect(bareRow).toBeNull();
      consoleSpy.restore();
    });

    // 11. Custom EMAIL that throws for one address and succeeds for another
    it('11. When email send fails for one account, logs send_failed, rolls back row, and allows retry on later run', async () => {
      const consoleSpy = installConsoleSpy();
      const testEnv = makeTestEnv();
      const failAccount = await seedAccount({ email: 'fail-email@example.com', testEnv });
      const passAccount = await seedAccount({ email: 'pass-email@example.com', testEnv });

      await seedEntitlement({
        accountId: failAccount.accountId,
        service: 'spl_hosted',
        status: 'active',
        source: 'stripe',
        sourceRef: 'sub_fail_user',
      });
      await seedEntitlement({
        accountId: passAccount.accountId,
        service: 'spl_hosted',
        status: 'active',
        source: 'stripe',
        sourceRef: 'sub_pass_user',
      });

      const makeSub = (id, cus) => ({
        id,
        object: 'subscription',
        status: 'active',
        start_date: 1736899200,
        current_period_end: 1768435200,
        customer: cus,
        metadata: { service: 'spl' },
        items: {
          data: [{
            quantity: 1,
            price: {
              unit_amount: 2000,
              currency: 'usd',
              recurring: { interval: 'year' },
            },
          }],
        },
      });

      const stripe = installStripeFetchMock({
        'GET api.stripe.com/v1/subscriptions/sub_fail_user': () => new Response(JSON.stringify(makeSub('sub_fail_user', 'cus_fail')), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
        'GET api.stripe.com/v1/subscriptions/sub_pass_user': () => new Response(JSON.stringify(makeSub('sub_pass_user', 'cus_pass')), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      });
      await installJwksStubWith((input, init) => stripe.fetchMock(input, init));
      const jwt = await mintToken();

      let shouldFail = true;
      testEnv.EMAIL = {
        sent: [],
        async send(msg) {
          if (shouldFail && msg.to === 'fail-email@example.com') {
            throw new Error('APNs / SES transient error');
          }
          this.sent.push(msg);
        },
      };

      const res = await worker.fetch(new Request('https://services.solstone.app/admin/renewal-notices/catch-up', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': jwt,
        },
        body: JSON.stringify({ confirm: true }),
      }), testEnv);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ sent: 1, skipped: 1 });
      expect(testEnv.EMAIL.sent.length).toBe(1);
      expect(testEnv.EMAIL.sent[0].to).toBe('pass-email@example.com');

      const failRow = await workerEnv.DB.prepare('SELECT * FROM renewal_notices WHERE account_id = ?')
        .bind(failAccount.accountId)
        .first();
      expect(failRow).toBeNull();

      const passRow = await workerEnv.DB.prepare('SELECT * FROM renewal_notices WHERE account_id = ?')
        .bind(passAccount.accountId)
        .first();
      expect(passRow).toBeDefined();

      const errCall = consoleSpy.calls.find((c) => c.level === 'error' && c.args[0].includes('renewal_notice_send_failed'));
      expect(errCall).toBeDefined();
      expect(JSON.parse(errCall.args[0]).account_id).toBeUndefined();
      expect(JSON.parse(errCall.args[0]).account_ref).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(consoleSpy.calls.map((c) => c.args[0]).join('\n')).not.toContain(failAccount.accountId);

      // Second run with failure resolved
      shouldFail = false;
      const res2 = await worker.fetch(new Request('https://services.solstone.app/admin/renewal-notices/catch-up', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': jwt,
        },
        body: JSON.stringify({ confirm: true }),
      }), testEnv);
      expect(res2.status).toBe(200);
      expect(await res2.json()).toEqual({ sent: 1, skipped: 0 });
      expect(testEnv.EMAIL.sent.length).toBe(2);
      expect(testEnv.EMAIL.sent[1].to).toBe('fail-email@example.com');

      const failRowAfter = await workerEnv.DB.prepare('SELECT * FROM renewal_notices WHERE account_id = ?')
        .bind(failAccount.accountId)
        .first();
      expect(failRowAfter).toBeDefined();
      consoleSpy.restore();
    });

    // 12. Auth and Route Checks
    it('12. Enforces CF Access on catch-up and one-off, rejects user sessions, non-POST, and non-admin paths', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ email: 'session-user@example.com', testEnv });
      const { cookie } = await seedSession(account.accountId, { testEnv });

      // No CF Access header -> 403
      const resNoAuth = await worker.fetch(new Request('https://services.solstone.app/admin/renewal-notices/catch-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      }), testEnv);
      expect(resNoAuth.status).toBe(403);
      expect(await resNoAuth.json()).toEqual({ error: 'cloudflare access required' });

      // Customer account_session cookie without Access header -> 403
      const resSessionCookie = await worker.fetch(new Request('https://services.solstone.app/admin/renewal-notices/catch-up', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
        },
        body: JSON.stringify({ confirm: true }),
      }), testEnv);
      expect(resSessionCookie.status).toBe(403);

      // GET on admin paths without CF Access -> 403, with CF Access -> 404 (sends nothing)
      const resGetNoAuth = await worker.fetch(new Request('https://services.solstone.app/admin/renewal-notices/catch-up', {
        method: 'GET',
      }), testEnv);
      expect(resGetNoAuth.status).toBe(403);

      const stripe = installStripeFetchMock({});
      await installJwksStubWith((input, init) => stripe.fetchMock(input, init));
      const jwt = await mintToken();

      const resGetWithAuth = await worker.fetch(new Request('https://services.solstone.app/admin/renewal-notices/catch-up', {
        method: 'GET',
        headers: { 'Cf-Access-Jwt-Assertion': jwt },
      }), testEnv);
      expect(resGetWithAuth.status).toBe(404);

      const resGetOneOffWithAuth = await worker.fetch(new Request('https://services.solstone.app/admin/renewal-notices/one-off', {
        method: 'GET',
        headers: { 'Cf-Access-Jwt-Assertion': jwt },
      }), testEnv);
      expect(resGetOneOffWithAuth.status).toBe(404);

      // POST to non-admin path -> 404
      const resNonAdmin = await worker.fetch(new Request('https://services.solstone.app/renewal-notices/catch-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      }), testEnv);
      expect(resNonAdmin.status).toBe(404);

      expect(testEnv.EMAIL.sent.length).toBe(0);
    });
  });
});
