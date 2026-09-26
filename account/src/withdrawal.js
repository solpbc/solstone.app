// Withdrawal from a paid subscription within 14 days of buying it: the owner's own page, one
// confirm, and then, in this order, the withdrawal recorded, the service ended, and an emailed
// acknowledgement, none of which waits on Stripe. The full refund and the immediate end of the
// Stripe subscription follow, and retry until they land. It sits beside the ordinary cancel,
// which is untouched: that one goes through Stripe's billing portal and ends at the period's end
// with no refund.
//
// The page carries a signed statement of exactly what it showed the owner (the subscription, its
// price and when it was bought), so the confirm records and acknowledges that without a Stripe
// call. Ownership and the purchase are checked against Stripe when the withdrawal is finished;
// a withdrawal that cannot be finished reaches a person.

import { renewalPlan } from './billing-page.js';
import { reconcileForService } from './billing.js';
import { base64UrlDecode, base64UrlEncode, hashKey, hashWithPepper, scopedHmac, timingSafeEqual } from './crypto.js';
import {
  claimSubscriptionWithdrawal,
  claimSubscriptionWithdrawalAck,
  claimSubscriptionWithdrawalAlert,
  getEntitlement,
  getStripeCustomerByAccount,
  getSubscriptionWithdrawal,
  getUnfinishedWithdrawalFor,
  markSubscriptionWithdrawalCompleted,
  releaseSubscriptionWithdrawalAck,
  releaseSubscriptionWithdrawalAlert,
  selectUnfinishedSubscriptionWithdrawals,
} from './db.js';
import { sendRenewalNoticeEmail } from './email.js';
import { renderNotFound, renderWithdrawal } from './html.js';
import { forbidden, html, originAllowed } from './index.js';
import { SPL_HOSTED_SERVICE } from './relay-grant.js';
import { renderWithdrawalAck, resolvePrimaryAddress } from './renewal-notices.js';
import {
  loadMenuContext,
  noStore,
  requireSignedInSession,
  signedInHtml,
  signedInRedirect,
} from './settings.js';
import { SME_HOSTED_SERVICE } from './sme-entitlement.js';
import { SME_SERVICE_PATH } from './sme-service.js';
import { SPB_HOSTED_SERVICE } from './spb-entitlement.js';
import {
  cancelSubscriptionNow,
  getSubscription,
  listPaidSubscriptionInvoices,
  refundChargeInFull,
  subscriptionPlan,
  subscriptionPurchasedAt,
} from './stripe.js';
import { withdrawalOn, withdrawalRuleShown, withdrawalUntil } from './withdrawal-rules.js';

export const WITHDRAWAL_PATH = '/billing/withdraw';

// The paid services a withdrawal can be made from, each with the page its door is on.
export const WITHDRAWAL_SERVICES = Object.freeze([
  { slug: 'private-network', service: SPL_HOSTED_SERVICE, tag: 'spl', name: 'private network', path: '/private-network' },
  { slug: 'backup', service: SPB_HOSTED_SERVICE, tag: 'spb', name: 'encrypted backup', path: '/services/backup' },
  { slug: 'solstone-me', service: SME_HOSTED_SERVICE, tag: 'sme', name: 'solstone.me', path: SME_SERVICE_PATH },
]);

const BY_SLUG = new Map(WITHDRAWAL_SERVICES.map((def) => [def.slug, def]));
const BY_SERVICE = new Map(WITHDRAWAL_SERVICES.map((def) => [def.service, def]));

// How long the page's signed statement stays good for a confirm.
const STATEMENT_TTL_MS = 60 * 60 * 1000;
// A submitted withdrawal is retried by the schedule for this long.
const RECOVERY_WINDOW_MS = 30 * 86400 * 1000;
// A person is alerted again if a withdrawal's refund still hasn't landed after this long.
const STUCK_AFTER_MS = 48 * 3600 * 1000;
const ALERT_ADDRESS = 'support@solstone.app';

export function withdrawalPathFor(service) {
  const def = BY_SERVICE.get(service);
  return def ? `${WITHDRAWAL_PATH}/${def.slug}` : null;
}

// What a service page and the billing page show about a subscription: its renewal price, and
// the withdraw door while the period runs. With the door off this is exactly the renewal lookup
// the pages made before, and nothing more is read.
//
// The door is shown whether or not a cancel is pending, and when the page's Stripe read fails
// (then with no date): it must stay available for the whole period, and the withdraw page itself
// says so if the period turns out to be over. `purchasedAt` is given only while the door may
// still restate the rule with its date.
export async function billingView(env, entitlement, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!withdrawalOn(env) || !withdrawable(entitlement)) return { plan: await renewalPlan(env, entitlement), withdrawal: null };
  const sub = await readSubscription(env, entitlement.source_ref);
  const renews = !entitlement.cancel_at_period_end && entitlement.status === 'active' && entitlement.current_period_end != null;
  return { plan: renews && sub ? subscriptionPlan(sub) : null, withdrawal: door(entitlement, sub, nowSeconds) };
}

// The billing page's price and door for one paid service, from one read of its subscription.
export async function billingEntryView(env, entitlement, { priced, readPlan }, nowSeconds) {
  if (!withdrawalOn(env) || !withdrawable(entitlement)) {
    return { plan: priced ? await readPlan(env, entitlement.source_ref) : null, withdrawal: null };
  }
  const sub = await readSubscription(env, entitlement.source_ref);
  return { plan: priced && sub ? subscriptionPlan(sub) : null, withdrawal: door(entitlement, sub, nowSeconds) };
}

function door(entitlement, sub, nowSeconds) {
  const path = withdrawalPathFor(entitlement.service);
  if (!sub) return { path, purchasedAt: null };
  const purchasedAt = subscriptionPurchasedAt(sub);
  const until = withdrawalUntil(purchasedAt);
  if (until == null || nowSeconds >= until) return null;
  return { path, purchasedAt: withdrawalRuleShown(purchasedAt, nowSeconds) ? purchasedAt : null };
}

async function readSubscription(env, subscriptionRef) {
  try {
    return await getSubscription(env, subscriptionRef);
  } catch {
    console.warn('stripe_plan_read_failed');
    return null;
  }
}

function withdrawable(entitlement) {
  return entitlement?.source === 'stripe'
    && typeof entitlement.source_ref === 'string'
    && entitlement.source_ref.startsWith('sub_')
    && (entitlement.status === 'active' || entitlement.status === 'past_due')
    && BY_SERVICE.has(entitlement.service);
}

export async function handleWithdrawalPage(req, env, slug) {
  const def = BY_SLUG.get(slug);
  if (!withdrawalOn(env) || !def) return noStore(html(renderNotFound(), { status: 404 }));
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const { session, nowMs } = guard;
  const accountId = session.account_id;
  const [menu, entitlement, csrf, primaryEmail, pending] = await Promise.all([
    loadMenuContext(env, accountId, nowMs),
    getEntitlement(env.DB, { accountId, service: def.service }),
    csrfToken(env),
    resolvePrimaryAddress(env, accountId),
    getUnfinishedWithdrawalFor(env.DB, { accountId, service: def.service }),
  ]);
  const flash = new URL(req.url).searchParams.get('withdrawal') || '';
  const base = { def, menu, csrf, primaryEmail };

  // A withdrawal already on record is reported on, never offered again.
  if (pending) {
    return signedInHtml(renderWithdrawal({ ...base, state: flash === 'error' ? 'failed' : 'finishing', submittedAt: pending.submitted_at }));
  }
  if (!withdrawable(entitlement)) return signedInHtml(renderWithdrawal({ ...base, state: 'none' }));

  const sub = await readSubscription(env, entitlement.source_ref);
  const plan = sub ? subscriptionPlan(sub) : null;
  const purchasedAt = sub ? subscriptionPurchasedAt(sub) : null;
  if (!sub || !plan || purchasedAt == null) return signedInHtml(renderWithdrawal({ ...base, state: 'unavailable' }));
  const nowSeconds = Math.floor(nowMs / 1000);
  if (nowSeconds >= withdrawalUntil(purchasedAt)) {
    return signedInHtml(renderWithdrawal({ ...base, state: 'closed', purchasedAt }));
  }
  const statement = await signStatement(env, accountId, {
    subscriptionRef: entitlement.source_ref,
    purchasedAt,
    unitAmount: plan.unitAmount,
    interval: plan.interval,
    issuedAt: nowMs,
  });
  return signedInHtml(renderWithdrawal({
    ...base,
    state: 'open',
    purchasedAt,
    ruleShown: withdrawalRuleShown(purchasedAt, nowSeconds),
    plan,
    statement,
  }));
}

export async function handleWithdrawalConfirm(req, env, ctx, slug) {
  const def = BY_SLUG.get(slug);
  if (!withdrawalOn(env) || !def) return noStore(html(renderNotFound(), { status: 404 }));
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const form = await safeForm(req);
  if (!await validCsrf(form, env)) return noStore(forbidden());
  const accountId = guard.session.account_id;
  const nowMs = guard.nowMs;
  const pagePath = `${WITHDRAWAL_PATH}/${def.slug}`;

  const entitlement = await getEntitlement(env.DB, { accountId, service: def.service });
  let record = withdrawable(entitlement)
    ? await getSubscriptionWithdrawal(env.DB, { subscriptionRef: entitlement.source_ref })
    : await getUnfinishedWithdrawalFor(env.DB, { accountId, service: def.service });
  if (record && record.account_id !== accountId) return signedInRedirect(`${def.path}?withdrawal=missing`);

  let statement = null;
  if (!record) {
    if (!withdrawable(entitlement)) return signedInRedirect(`${def.path}?withdrawal=missing`);
    // Recorded from what we hold and what the page showed, with no Stripe call.
    statement = await verifyStatement(env, accountId, form.get('statement')?.toString() || '', nowMs);
    if (!statement || statement.subscriptionRef !== entitlement.source_ref) return signedInRedirect(pagePath);
    if (Math.floor(nowMs / 1000) >= withdrawalUntil(statement.purchasedAt)) return signedInRedirect(pagePath);
    record = await claimSubscriptionWithdrawal(env.DB, {
      subscriptionRef: statement.subscriptionRef,
      accountId,
      service: def.service,
      purchasedAt: statement.purchasedAt,
      nowMs,
    });
    if (!record || record.account_id !== accountId) return signedInRedirect(`${def.path}?withdrawal=missing`);
  }

  const outcome = await completeWithdrawal(env, ctx, record, { nowMs, statement });
  if (!outcome.completed) return signedInRedirect(`${pagePath}?withdrawal=error`);
  return signedInRedirect(`${def.path}?withdrawal=${outcome.acknowledged ? 'done' : 'done_unsent'}`);
}

// Finishes a recorded withdrawal, as far as it has not got yet. Safe to run again at any point:
// the entitlement lapse is idempotent, the acknowledgement is claimed before it is sent, a charge
// already refunded is not refunded again, and an ended subscription is not ended again.
// `statement` is what the owner's page showed, present only on the confirm itself.
export async function completeWithdrawal(env, ctx, record, { nowMs = Date.now(), statement = null } = {}) {
  const def = BY_SERVICE.get(record.service);
  if (!def) return { completed: false, acknowledged: false };
  const subscriptionRef = record.subscription_ref;

  // 1 · the service ends now, whatever Stripe is doing.
  await lapseEntitlement(env, ctx, record, def, nowMs);

  // 2 · the acknowledgement, from the page's statement, or from Stripe on a resend.
  let acknowledged = record.acknowledged_at != null;
  let sub = null;
  if (!acknowledged) {
    let plan = statement ? { unitAmount: statement.unitAmount, interval: statement.interval } : null;
    if (!plan) {
      sub = await readSubscription(env, subscriptionRef);
      plan = sub ? subscriptionPlan(sub) : null;
    }
    acknowledged = plan ? await sendAcknowledgement(env, record, plan, nowMs) : false;
  }

  // 3 · the refund, then the end of the Stripe subscription, checked against Stripe first.
  if (record.completed_at == null) {
    try {
      sub = sub || await getSubscription(env, subscriptionRef);
      const customer = await getStripeCustomerByAccount(env.DB, { accountId: record.account_id });
      // Ownership, the service, and the purchase time the page showed, all as Stripe records them.
      if (sub?.id !== subscriptionRef || !customer || sub.customer !== customer.stripe_customer_id || sub.metadata?.service !== def.tag
        || subscriptionPurchasedAt(sub) !== record.purchased_at) {
        const error = new Error('withdrawal subscription does not match the sign-in');
        error.code = 'withdrawal_mismatch';
        throw error;
      }
      await refundSubscriptionInFull(env, subscriptionRef, await listPaidSubscriptionInvoices(env, subscriptionRef));
      if (sub.status !== 'canceled') await cancelSubscriptionNow(env, subscriptionRef);
    } catch (error) {
      const detail = { status: error?.status ?? null, code: error?.code ?? null };
      await logWithdrawal(env, 'withdrawal_finish_failed', record, detail);
      await alertPerson(env, record, 'failure_alerted_at', detail, nowMs);
      if (nowMs - record.submitted_at >= STUCK_AFTER_MS) await alertPerson(env, record, 'stuck_alerted_at', detail, nowMs);
      return { completed: false, acknowledged };
    }
    await markSubscriptionWithdrawalCompleted(env.DB, { subscriptionRef, nowMs });
    await logWithdrawal(env, 'withdrawal_completed', record);
  }
  return { completed: true, acknowledged };
}

// The entitlement lapses through the same reconciler the subscription-deleted webhook runs, and
// only while it is still this subscription's.
async function lapseEntitlement(env, ctx, record, def, nowMs) {
  const entitlement = await getEntitlement(env.DB, { accountId: record.account_id, service: record.service });
  if (entitlement?.source !== 'stripe' || entitlement.source_ref !== record.subscription_ref) return;
  if (entitlement.status !== 'active' && entitlement.status !== 'past_due') return;
  await reconcileForService(def.tag, env, record.account_id, nowMs, ctx, { paid: null });
}

// Refunds every paid invoice of the subscription in full: the purchase, any change of plan since,
// and a renewal that charged before the cancel landed.
async function refundSubscriptionInFull(env, subscriptionRef, invoices) {
  for (const invoice of invoices) {
    if (!Number.isInteger(invoice?.amount_paid) || invoice.amount_paid <= 0) continue;
    if (typeof invoice.charge !== 'string' || !invoice.charge) {
      // Paid without a card charge (credit balance, or out of band): nothing to refund against.
      const error = new Error('withdrawal refund has no charge');
      error.code = 'withdrawal_no_charge';
      throw error;
    }
    await refundChargeInFull(env, { chargeId: invoice.charge });
  }
}

async function sendAcknowledgement(env, record, plan, nowMs) {
  const subscriptionRef = record.subscription_ref;
  const primaryEmail = await resolvePrimaryAddress(env, record.account_id);
  const rendered = primaryEmail
    ? renderWithdrawalAck({
      service: record.service,
      interval: plan.interval,
      unitAmount: plan.unitAmount,
      purchasedAt: record.purchased_at,
      submittedAtMs: record.submitted_at,
      primaryEmail,
    })
    : null;
  if (!rendered) {
    await logWithdrawal(env, 'withdrawal_ack_skipped', record, { reason: primaryEmail ? 'unrenderable' : 'no_email' });
    return false;
  }
  if (!await claimSubscriptionWithdrawalAck(env.DB, { subscriptionRef, nowMs })) return true;
  try {
    await sendRenewalNoticeEmail({ env, address: primaryEmail, subject: rendered.subject, text: rendered.text, html: rendered.html });
  } catch {
    await releaseSubscriptionWithdrawalAck(env.DB, { subscriptionRef, nowMs });
    await logWithdrawal(env, 'withdrawal_ack_send_failed', record);
    return false;
  }
  await logWithdrawal(env, 'withdrawal_ack_sent', record);
  return true;
}

// A withdrawal that could not be finished reaches a person: once at its first failed finish, and
// once more if the refund still hasn't landed after 48 hours, well inside the 14 days the refund
// is owed in. The mail carries only the service and the error code, nothing about the owner: it
// lands in a mailbox that outlasts a deletion. The person finds the withdrawal in our own
// database, where it is deleted with the sign-in.
async function alertPerson(env, record, column, detail, nowMs) {
  const subscriptionRef = record.subscription_ref;
  if (!await claimSubscriptionWithdrawalAlert(env.DB, { subscriptionRef, column, nowMs })) return;
  const serviceName = BY_SERVICE.get(record.service).name;
  const stuck = column === 'stuck_alerted_at';
  const subject = stuck
    ? `a withdrawal is still unrefunded after 48 hours: ${serviceName}`
    : `a withdrawal needs a person: ${serviceName}`;
  const text = [
    `a ${serviceName} withdrawal has been recorded, and its refund or the end of its Stripe subscription has not gone through.`,
    `last error: ${detail.code || detail.status || 'unknown'}`,
    'the service already ended and the owner has their acknowledgement. the schedule retries every 15 minutes. find the withdrawal in the services database: subscription_withdrawals, where completed_at is empty. if Stripe keeps refusing, refund every paid invoice of that subscription in full and cancel it now in the Stripe Dashboard. the refund is owed within 14 days of the withdrawal.',
  ].join('\n\n');
  try {
    await sendRenewalNoticeEmail({ env, address: ALERT_ADDRESS, subject, text, html: `<pre>${text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre>` });
    await logWithdrawal(env, stuck ? 'withdrawal_stuck_alerted' : 'withdrawal_failure_alerted', record);
  } catch {
    await releaseSubscriptionWithdrawalAlert(env.DB, { subscriptionRef, column, nowMs });
    await logWithdrawal(env, 'withdrawal_alert_send_failed', record);
  }
}

// Scheduled: finishes any withdrawal a failed Stripe call or email send left unfinished.
export async function runWithdrawalRecovery(env, ctx, nowMs = Date.now()) {
  const rows = await selectUnfinishedSubscriptionWithdrawals(env.DB, { submittedAfterMs: nowMs - RECOVERY_WINDOW_MS });
  for (const row of rows) {
    try {
      await completeWithdrawal(env, ctx, row, { nowMs });
    } catch {
      await logWithdrawal(env, 'withdrawal_recovery_failed', row);
    }
  }
}

// The page's statement of what it showed: which subscription, its price, and when it was bought,
// signed to this sign-in so the confirm can record it without asking Stripe again.
async function signStatement(env, accountId, { subscriptionRef, purchasedAt, unitAmount, interval, issuedAt }) {
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ s: subscriptionRef, p: purchasedAt, a: unitAmount, i: interval, t: issuedAt })));
  return `${payload}.${await scopedHmac(payload, env.HMAC_PEPPER, `withdrawal-statement:${accountId}`)}`;
}

async function verifyStatement(env, accountId, value, nowMs) {
  const [payload, signature, extra] = value.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  const expected = await scopedHmac(payload, env.HMAC_PEPPER, `withdrawal-statement:${accountId}`);
  if (!timingSafeEqual(signature, expected)) return null;
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
  } catch {
    return null;
  }
  const { s, p, a, i, t } = parsed || {};
  if (typeof s !== 'string' || !s.startsWith('sub_') || !Number.isInteger(p) || !Number.isInteger(a) || a <= 0) return null;
  if ((i !== 'year' && i !== 'month') || !Number.isInteger(t) || nowMs - t > STATEMENT_TTL_MS || t > nowMs + 60_000) return null;
  return { subscriptionRef: s, purchasedAt: p, unitAmount: a, interval: i };
}

// A peppered account reference, never the raw id: console lines are Logpush-retained.
async function logWithdrawal(env, event, record, extra = {}) {
  const line = JSON.stringify({
    event,
    account_ref: await hashWithPepper(`hub:account:${record.account_id}`, env),
    service: record.service,
    ...extra,
    ts: Date.now(),
  });
  if (event.endsWith('_failed')) console.error(line);
  else console.warn(line);
}

async function csrfToken(env) {
  return hashKey('csrf', 'account', env);
}

async function validCsrf(form, env) {
  if (!form) return false;
  const expected = await csrfToken(env);
  return timingSafeEqual(form.get('csrf')?.toString() || '', expected);
}

async function safeForm(req) {
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
