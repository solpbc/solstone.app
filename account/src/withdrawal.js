// Withdrawal from a paid subscription within 14 days of buying it: the owner's own page,
// then a full refund of what they paid, the subscription ended at once, and an emailed
// acknowledgement. It sits beside the ordinary cancel, which is untouched: that one goes
// through Stripe's billing portal and ends at the period's end with no refund.
//
// Order matters. A submission is recorded first, so a retry (by the owner, or by the scheduled
// recovery) resumes it even after the 14 days are over, and the right is used once per
// subscription. The acknowledgement goes out next, as soon as what was paid is known, whether or
// not the refund has gone through yet: withdrawing is the owner's act, not ours. The refund is
// made before the subscription is ended, so a failure in between leaves a live subscription, a
// door still on the page, and a retry that finishes the job; the other order could end the
// service and strand the refund.

import { renewalPlan } from './billing-page.js';
import { reconcileForService } from './billing.js';
import { decryptEmail, encryptEmail, hashKey, hashWithPepper, timingSafeEqual } from './crypto.js';
import {
  claimSubscriptionWithdrawal,
  claimSubscriptionWithdrawalAck,
  clearSubscriptionWithdrawalAddress,
  setSubscriptionWithdrawalAddress,
  setSubscriptionWithdrawalAmount,
  getEntitlement,
  getStripeCustomerByAccount,
  getSubscriptionWithdrawal,
  markSubscriptionWithdrawalCompleted,
  releaseSubscriptionWithdrawalAck,
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
import { withdrawalOn, withdrawalUntil } from './withdrawal-rules.js';

export const WITHDRAWAL_PATH = '/billing/withdraw';

// The paid services a withdrawal can be made from, each with the page its door is on.
export const WITHDRAWAL_SERVICES = Object.freeze([
  { slug: 'private-network', service: SPL_HOSTED_SERVICE, tag: 'spl', name: 'private network', path: '/private-network' },
  { slug: 'backup', service: SPB_HOSTED_SERVICE, tag: 'spb', name: 'encrypted backup', path: '/services/backup' },
  { slug: 'solstone-me', service: SME_HOSTED_SERVICE, tag: 'sme', name: 'solstone.me', path: SME_SERVICE_PATH },
]);

const BY_SLUG = new Map(WITHDRAWAL_SERVICES.map((def) => [def.slug, def]));
const BY_SERVICE = new Map(WITHDRAWAL_SERVICES.map((def) => [def.service, def]));

// A submitted withdrawal is retried by the schedule for this long before it is left to an operator.
const RECOVERY_WINDOW_MS = 30 * 86400 * 1000;

export function withdrawalPathFor(service) {
  const def = BY_SERVICE.get(service);
  return def ? `${WITHDRAWAL_PATH}/${def.slug}` : null;
}

// What a service page and the billing page show about a subscription: its renewal price, and
// the withdraw door while the 14 days run. With the door off this is exactly the renewal
// lookup the pages made before, and nothing more is read.
//
// The door is shown whether or not a cancel is pending, and a failed Stripe read shows it too
// (with no date): the door must stay available for the whole period, and the withdraw page
// itself says so if the period turns out to be over.
export async function billingView(env, entitlement, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!withdrawalOn(env)) return { plan: await renewalPlan(env, entitlement), withdrawal: null };
  if (!withdrawable(entitlement)) return { plan: await renewalPlan(env, entitlement), withdrawal: null };
  const path = withdrawalPathFor(entitlement.service);
  let sub = null;
  try {
    sub = await getSubscription(env, entitlement.source_ref);
  } catch {
    console.warn('stripe_plan_read_failed');
  }
  const renews = !entitlement.cancel_at_period_end && entitlement.status === 'active' && entitlement.current_period_end != null;
  const plan = renews && sub ? subscriptionPlan(sub) : null;
  if (!sub) return { plan, withdrawal: { path, until: null } };
  const until = withdrawalUntil(subscriptionPurchasedAt(sub));
  if (until == null || nowSeconds >= until) return { plan, withdrawal: null };
  return { plan, withdrawal: { path, until } };
}

// The billing page's price and door for one paid service, from one read of its subscription.
// With the door off, or for a subscription it does not apply to, this is the page's own price
// lookup, unchanged.
export async function billingEntryView(env, entitlement, { priced, readPlan }, nowSeconds) {
  if (!withdrawalOn(env) || !withdrawable(entitlement)) {
    return { plan: priced ? await readPlan(env, entitlement.source_ref) : null, withdrawal: null };
  }
  const path = withdrawalPathFor(entitlement.service);
  let sub = null;
  try {
    sub = await getSubscription(env, entitlement.source_ref);
  } catch {
    console.warn('stripe_plan_read_failed');
  }
  if (!sub) return { plan: null, withdrawal: { path, until: null } };
  const plan = priced ? subscriptionPlan(sub) : null;
  const until = withdrawalUntil(subscriptionPurchasedAt(sub));
  return { plan, withdrawal: until != null && nowSeconds < until ? { path, until } : null };
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
  const [menu, entitlement, csrf, address] = await Promise.all([
    loadMenuContext(env, accountId, nowMs),
    getEntitlement(env.DB, { accountId, service: def.service }),
    csrfToken(env),
    resolvePrimaryAddress(env, accountId),
  ]);
  const url = new URL(req.url);
  const base = { def, menu, csrf, address, flash: url.searchParams.get('withdrawal') || '' };
  if (!withdrawable(entitlement)) return signedInHtml(renderWithdrawal({ ...base, state: 'none' }));

  const pending = await getSubscriptionWithdrawal(env.DB, { subscriptionRef: entitlement.source_ref });
  if (pending && pending.account_id === accountId) {
    return signedInHtml(renderWithdrawal({ ...base, state: 'pending', submittedAt: pending.submitted_at }));
  }

  let sub;
  try {
    sub = await getSubscription(env, entitlement.source_ref);
  } catch {
    return signedInHtml(renderWithdrawal({ ...base, state: 'unavailable' }));
  }
  const purchasedAt = subscriptionPurchasedAt(sub);
  const until = withdrawalUntil(purchasedAt);
  const nowSeconds = Math.floor(nowMs / 1000);
  if (until == null || nowSeconds >= until) {
    return signedInHtml(renderWithdrawal({ ...base, state: 'closed', until }));
  }
  return signedInHtml(renderWithdrawal({
    ...base,
    state: 'open',
    purchasedAt,
    until,
    plan: subscriptionPlan(sub),
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
  const name = ownerName(form.get('name'));
  const address = confirmationAddress(form.get('email'));
  if (!address) return signedInRedirect(`${pagePath}?withdrawal=email`);

  const [entitlement, customer] = await Promise.all([
    getEntitlement(env.DB, { accountId, service: def.service }),
    getStripeCustomerByAccount(env.DB, { accountId }),
  ]);
  if (!withdrawable(entitlement) || !customer) return signedInRedirect(`${def.path}?withdrawal=missing`);
  const subscriptionRef = entitlement.source_ref;
  const addressEncrypted = await encryptEmail(address, env);

  let record = await getSubscriptionWithdrawal(env.DB, { subscriptionRef });
  if (record && record.account_id !== accountId) return signedInRedirect(`${def.path}?withdrawal=missing`);
  if (record) {
    await setSubscriptionWithdrawalAddress(env.DB, { subscriptionRef, addressEncrypted });
    record = await getSubscriptionWithdrawal(env.DB, { subscriptionRef });
  } else {
    let sub;
    try {
      sub = await getSubscription(env, subscriptionRef);
    } catch {
      return signedInRedirect(`${pagePath}?withdrawal=error`);
    }
    // The subscription must be this sign-in's, for this service, as Stripe itself records it.
    if (sub?.id !== subscriptionRef || sub.customer !== customer.stripe_customer_id || sub.metadata?.service !== def.tag) {
      return signedInRedirect(`${def.path}?withdrawal=missing`);
    }
    const purchasedAt = subscriptionPurchasedAt(sub);
    const until = withdrawalUntil(purchasedAt);
    if (until == null || Math.floor(nowMs / 1000) >= until) return signedInRedirect(`${pagePath}?withdrawal=closed`);
    record = await claimSubscriptionWithdrawal(env.DB, {
      subscriptionRef,
      accountId,
      service: def.service,
      purchasedAt,
      addressEncrypted,
      nowMs,
    });
    if (!record || record.account_id !== accountId) return signedInRedirect(`${def.path}?withdrawal=missing`);
  }

  const outcome = await completeWithdrawal(env, ctx, record, { nowMs, name });
  if (!outcome.completed) return signedInRedirect(`${pagePath}?withdrawal=error`);
  return signedInRedirect(`${def.path}?withdrawal=${outcome.acknowledged ? 'done' : 'done_unsent'}`);
}

// The name the owner typed, if any: used in the acknowledgement they are sent, and not stored.
function ownerName(value) {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text.slice(0, 200);
}

function confirmationAddress(value) {
  const text = String(value ?? '').trim();
  if (text.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return '';
  return text;
}

// Finishes a submitted withdrawal, as far as it has not got yet: the acknowledgement, then the
// refund, then the end of the subscription. Safe to run again at any point: a charge already
// refunded is not refunded again, an ended subscription is not ended again, and the
// acknowledgement is claimed before it is sent. `name` is only ever the one just typed; a
// resend from the schedule goes without it.
export async function completeWithdrawal(env, ctx, record, { nowMs = Date.now(), name = '' } = {}) {
  const def = BY_SERVICE.get(record.service);
  if (!def) return { completed: false, acknowledged: false };
  const subscriptionRef = record.subscription_ref;
  let acknowledged = record.acknowledged_at != null;

  let sub;
  let invoices;
  try {
    sub = await getSubscription(env, subscriptionRef);
    if (record.amount_paid == null || record.completed_at == null) {
      invoices = await listPaidSubscriptionInvoices(env, subscriptionRef);
    }
  } catch (error) {
    await logWithdrawal(env, 'withdrawal_stripe_failed', record, { status: error?.status ?? null, code: error?.code ?? null });
    return { completed: false, acknowledged };
  }
  let amountPaid = record.amount_paid;
  if (amountPaid == null) {
    amountPaid = invoices.reduce((sum, invoice) => sum + (Number.isInteger(invoice?.amount_paid) && invoice.amount_paid > 0 ? invoice.amount_paid : 0), 0);
    await setSubscriptionWithdrawalAmount(env.DB, { subscriptionRef, amountPaid });
  }

  if (!acknowledged) {
    acknowledged = await sendWithdrawalAcknowledgement(env, { ...record, amount_paid: amountPaid }, { sub, name, nowMs });
  }

  if (record.completed_at == null) {
    try {
      await refundSubscriptionInFull(env, subscriptionRef, invoices);
      if (sub?.status !== 'canceled') await cancelSubscriptionNow(env, subscriptionRef);
    } catch (error) {
      await logWithdrawal(env, 'withdrawal_stripe_failed', record, { status: error?.status ?? null, code: error?.code ?? null });
      return { completed: false, acknowledged };
    }
    await markSubscriptionWithdrawalCompleted(env.DB, { subscriptionRef, nowMs });
    await logWithdrawal(env, 'withdrawal_completed', record);
    // The entitlement lapses through the same reconciler the subscription-deleted webhook runs,
    // now rather than when the webhook lands, and only if it is still this subscription's.
    const entitlement = await getEntitlement(env.DB, { accountId: record.account_id, service: record.service });
    if (entitlement?.source === 'stripe' && entitlement.source_ref === subscriptionRef) {
      await reconcileForService(def.tag, env, record.account_id, nowMs, ctx, { paid: null });
    }
  }
  return { completed: true, acknowledged };
}

// Refunds every paid invoice of the subscription in full. Inside 14 days that is the purchase,
// plus any change of plan made since.
async function refundSubscriptionInFull(env, subscriptionRef, invoices) {
  for (const invoice of invoices) {
    if (!Number.isInteger(invoice?.amount_paid) || invoice.amount_paid <= 0) continue;
    if (typeof invoice.charge !== 'string' || !invoice.charge) {
      // Paid without a card charge (credit balance, or out of band): nothing to refund against.
      const error = new Error('withdrawal refund has no charge');
      error.code = 'withdrawal_no_charge';
      throw error;
    }
    await refundChargeInFull(env, { chargeId: invoice.charge, subscriptionId: subscriptionRef });
  }
}

async function sendWithdrawalAcknowledgement(env, record, { sub, name, nowMs }) {
  const subscriptionRef = record.subscription_ref;
  const signInEmail = await resolvePrimaryAddress(env, record.account_id);
  let address = signInEmail;
  if (record.acknowledgement_address_encrypted) {
    try {
      address = await decryptEmail(record.acknowledgement_address_encrypted, env) || signInEmail;
    } catch {
      address = signInEmail;
    }
  }
  const plan = subscriptionPlan(sub);
  const rendered = address && signInEmail && plan
    ? renderWithdrawalAck({
      service: record.service,
      interval: plan.interval,
      unitAmount: plan.unitAmount,
      amountPaid: record.amount_paid,
      purchasedAt: record.purchased_at,
      submittedAtMs: record.submitted_at,
      name,
      signInEmail,
      email: address,
    })
    : null;
  if (!rendered) {
    await logWithdrawal(env, 'withdrawal_ack_skipped', record, { reason: address && signInEmail ? 'unrenderable' : 'no_email' });
    return false;
  }
  if (!await claimSubscriptionWithdrawalAck(env.DB, { subscriptionRef, nowMs })) return true;
  try {
    await sendRenewalNoticeEmail({ env, address, subject: rendered.subject, text: rendered.text, html: rendered.html });
  } catch {
    await releaseSubscriptionWithdrawalAck(env.DB, { subscriptionRef, nowMs });
    await logWithdrawal(env, 'withdrawal_ack_send_failed', record);
    return false;
  }
  await clearSubscriptionWithdrawalAddress(env.DB, { subscriptionRef, acknowledgedAt: nowMs });
  await logWithdrawal(env, 'withdrawal_ack_sent', record);
  return true;
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
