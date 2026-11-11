// What a sign-in deletion does to billing while it is held, and what keeping the
// sign-in gives back.
//
// From confirm until the purge completes, no renewal is charged: collection is
// paused on every live subscription, so Stripe voids any invoice it raises in
// the meantime. The purge then deletes the Stripe customer, which ends the
// subscriptions. Keeping the sign-in resumes collection; a subscription whose
// renewal was voided during the hold is charged at keep, and its new period
// starts then. Already-paid days that fell inside the hold are neither refunded
// nor extended. Every service is then reconciled from its entitlement, so what
// was on before confirm is on again.
//
// Pausing is idempotent, so the coordinator simply applies the hold again on
// its first pass after confirm. A keep marks its row owed by setting
// next_attempt_at, which no cancelled row otherwise uses, and clears it when
// the restore finishes; the coordinator retries any keep still owed.
//
// With the subscription rules on, a subscription in a renewed annual year is
// refunded at the purge as a cancel would be: one twelfth of what its renewal
// paid for each whole plan month after the one the confirm fell in, since the
// services stop at confirm. It is made before the Stripe customer is deleted,
// once per renewal invoice, and never when a cancel or withdrawal already
// refunded that renewal. It retries with the purge, and a person is alerted at
// its first failure; after RENEWAL_REFUND_RETRY_MS the purge goes on without it.
import { hashWithPepper } from './crypto.js';
import { getStripeCustomerByAccount, getSubscriptionWithdrawal, isCancellationRefundClaimed } from './db.js';
import { reconcileSubscription } from './billing.js';
import { sendOperatorAlertEmail } from './email.js';
import { syncAccountEntitlementToRelay } from './relay-grant.js';
import { cancelEnds, monthsLeftRefund, renewalInvoice, renewalStart } from './renewed-year.js';
import { reconcileAllServices } from './spb-entitlement.js';
import {
  getCharge,
  listCustomerSubscriptions,
  listPaidSubscriptionInvoices,
  listVoidedRenewals,
  pauseSubscriptionCollection,
  refundChargeAtDeletion,
  resumeSubscriptionCollection,
} from './stripe.js';
import { subscriptionRulesOn } from './subscription-rules.js';
import { WITHDRAWAL_SERVICES } from './withdrawal.js';

// Statuses that can still raise an invoice. A canceled or incomplete_expired
// subscription has nothing left to collect.
const COLLECTING_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete']);
const RESTORE_RETRY_MS = 15 * 60 * 1000;
// How long after the purge begins the renewed-year refund holds the Stripe customer's deletion.
export const RENEWAL_REFUND_RETRY_MS = 48 * 60 * 60 * 1000;
// Marks, on the deletion row, that a person has been alerted to a refund the purge could not make.
const REFUND_ALERTED = 'refund_alerted';
const ALERT_ADDRESS = 'support@solstone.app';

// Everything the hold does at confirm, and again on the coordinator's passes until it all
// lands: no renewal is charged, and the private-network grant goes to 0. The other services
// already refuse while a deletion is active.
export async function applyDeletionHold(env, deletion) {
  const [billing, relay] = await Promise.all([
    holdBillingForDeletion(env, deletion),
    syncAccountEntitlementToRelay(env, deletion.account_id).catch(() => false),
  ]);
  return billing && relay;
}

export async function holdBillingForDeletion(env, deletion) {
  try {
    const customer = await getStripeCustomerByAccount(env.DB, { accountId: deletion.account_id });
    if (!customer?.stripe_customer_id) return true;
    const subscriptions = await listCustomerSubscriptions(env, customer.stripe_customer_id);
    for (const subscription of subscriptions) {
      if (!COLLECTING_STATUSES.has(subscription.status) || subscription.pause_collection) continue;
      await pauseSubscriptionCollection(env, subscription.id);
    }
    return true;
  } catch {
    return false;
  }
}

export async function markKeepRestoreOwed(env, operationId, nowMs) {
  await env.DB.prepare(
    "UPDATE account_deletions SET next_attempt_at = ? WHERE operation_id = ? AND phase = 'cancelled'"
  ).bind(nowMs, operationId).run();
}

// Safe to repeat: only a subscription that is still paused is resumed, and a
// restart is keyed to the renewal it replaces.
export async function restoreAfterKeep(env, deletion, nowMs = Date.now(), ctx = undefined) {
  if (deletion.phase !== 'cancelled' || !deletion.account_id) return true;
  const accountId = deletion.account_id;
  let restored = true;
  try {
    const customer = await getStripeCustomerByAccount(env.DB, { accountId });
    if (customer?.stripe_customer_id) {
      const subscriptions = await listCustomerSubscriptions(env, customer.stripe_customer_id);
      for (const subscription of subscriptions) {
        if (!subscription.pause_collection) continue;
        const [voided] = await listVoidedRenewals(env, subscription.id, deletion.requested_at);
        const resumed = await resumeSubscriptionCollection(env, subscription, { restartAfter: voided?.id || '' });
        await reconcileSubscription(env, accountId, resumed, nowMs, ctx);
      }
    }
    await reconcileAllServices(env, accountId, nowMs, ctx);
  } catch {
    restored = false;
  }
  await env.DB.prepare(
    "UPDATE account_deletions SET next_attempt_at = ? WHERE operation_id = ? AND phase = 'cancelled'"
  ).bind(restored ? null : nowMs + RESTORE_RETRY_MS, deletion.operation_id).run();
  return restored;
}

// The coordinator's backstop for a keep whose restore did not finish inline.
export async function runOwedKeepRestores(env, nowMs = Date.now(), limit = 5) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM account_deletions
     WHERE phase = 'cancelled' AND account_id IS NOT NULL
       AND next_attempt_at IS NOT NULL AND next_attempt_at <= ?
     ORDER BY next_attempt_at ASC LIMIT ?`
  ).bind(nowMs, limit).all();
  for (const deletion of results || []) await restoreAfterKeep(env, deletion, nowMs);
}

// Run by the purge before it deletes the Stripe customer. 'complete' lets the deletion go on, and
// 'retryable' holds it for the purge's next pass.
export async function refundRenewedYearsAtPurge(env, deletion, stripeCustomerId, nowMs = Date.now()) {
  if (!subscriptionRulesOn(env)) return 'complete';
  const failed = { tag: null, code: null };
  try {
    const confirmedAt = Math.floor(Number(deletion.requested_at) / 1000);
    for (const sub of await listCustomerSubscriptions(env, stripeCustomerId)) {
      failed.tag = sub.metadata?.service ?? null;
      await refundRenewedYear(env, sub, confirmedAt);
    }
    return 'complete';
  } catch (error) {
    failed.code = error?.code ?? error?.status ?? null;
  }
  await logRefund(env, deletion, 'deletion_refund_failed', { code: failed.code });
  const givenUp = nowMs >= Number(deletion.cancellation_deadline_at) + RENEWAL_REFUND_RETRY_MS;
  if (deletion.stripe_purge_state == null) await alertPerson(env, deletion, failed, nowMs);
  return givenUp ? 'complete' : 'retryable';
}

// One subscription's refund, if it is owed and not already made. Throws when Stripe can't be read
// or the refund can't be made, so the purge retries it.
async function refundRenewedYear(env, sub, confirmedAt) {
  if (sub.status === 'canceled' || sub.status === 'incomplete_expired') return;
  const renewal = renewalStart(sub);
  // The first year, a monthly plan, or a renewal that came during the hold, after the confirm.
  if (renewal == null || confirmedAt < renewal) return;
  const { monthsLeft } = cancelEnds(env, sub, confirmedAt).earliest;
  if (!monthsLeft) return;
  // A withdrawal refunds the whole renewal itself.
  if (await getSubscriptionWithdrawal(env.DB, { subscriptionRef: sub.id })) return;
  const invoice = renewalInvoice(await listPaidSubscriptionInvoices(env, sub.id), renewal);
  if (!invoice || await isCancellationRefundClaimed(env.DB, invoice.id)) return;
  const amount = monthsLeftRefund(invoice.amount_paid, monthsLeft);
  if (amount <= 0) return;
  if (typeof invoice.charge !== 'string' || !invoice.charge) {
    const error = new Error('deletion refund has no charge');
    error.code = 'deletion_refund_no_charge';
    throw error;
  }
  // Anything already refunded on the renewal's charge, by this purge or by hand, means nothing more.
  const charge = await getCharge(env, invoice.charge);
  if (!Number.isInteger(charge?.amount_refunded)) {
    const error = new Error('deletion refund charge unreadable');
    error.code = 'deletion_refund_charge_unreadable';
    throw error;
  }
  if (charge.amount_refunded > 0) return;
  await refundChargeAtDeletion(env, { chargeId: invoice.charge, amount, invoiceId: invoice.id });
}

// Once per deletion, at the refund's first failure. Like the withdrawal's, the mail carries only the
// service and the error code, nothing about the owner, and the lookup that finds the sign-in in
// our own database while the purge still holds it.
async function alertPerson(env, deletion, failed, nowMs) {
  const serviceName = WITHDRAWAL_SERVICES.find((def) => def.tag === failed.tag)?.name || 'a paid service';
  const subject = `a refund for a closing sign-in needs a person: ${serviceName}`;
  const text = [
    `a sign-in is closing with an annual ${serviceName} subscription past its first year, which is owed a refund of the whole months left on its renewal, and making that refund at Stripe has not gone through.`,
    `last error: ${failed.code || 'unknown'}`,
    'the schedule retries with the rest of the purge for 48 hours after the purge begins, then deletes the Stripe customer anyway, and after that this lookup finds nothing. this mail carries nothing about the owner, so find the sign-in with this lookup, run from solstone.app/account:',
    'npx wrangler d1 execute account-portal --remote --command "'
      + 'SELECT d.operation_id, d.requested_at, d.cancellation_deadline_at, c.stripe_customer_id FROM account_deletions d '
      + 'LEFT JOIN stripe_customers c ON c.account_id = d.account_id '
      + `WHERE d.phase = 'purging' AND d.stripe_purge_state = '${REFUND_ALERTED}' ORDER BY d.requested_at"`,
    [
      'each row is a closing sign-in. requested_at, when its owner confirmed, is in milliseconds. for each row:',
      "1. open the row's stripe_customer_id in the Stripe Dashboard. for each annual subscription past its first year that is not canceled, open the invoice of its latest renewal and the payment that paid it.",
      '2. if any of that payment is already refunded, refund nothing more. otherwise refund one twelfth of what that renewal paid, rounded to the cent, for each whole plan month after the one requested_at falls in. plan months start on the renewal date\'s day of each month, or on a shorter month\'s last day.',
      '3. the schedule then finds the refund made, deletes the customer, and finishes the purge.',
    ].join('\n'),
  ].join('\n\n');
  try {
    await sendOperatorAlertEmail({ env, address: ALERT_ADDRESS, subject, text, html: `<pre>${text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre>` });
  } catch {
    await logRefund(env, deletion, 'deletion_refund_alert_send_failed');
    return;
  }
  await env.DB.prepare(
    'UPDATE account_deletions SET stripe_purge_state = ? WHERE operation_id = ? AND lease_token = ? AND stripe_purge_state IS NULL'
  ).bind(REFUND_ALERTED, deletion.operation_id, deletion.lease_token).run();
  await logRefund(env, deletion, 'deletion_refund_alerted');
}

// A peppered account reference, never the raw id: console lines are Logpush-retained.
async function logRefund(env, deletion, event, extra = {}) {
  const line = JSON.stringify({
    event,
    account_ref: await hashWithPepper(`hub:account:${deletion.account_id}`, env),
    ...extra,
    ts: Date.now(),
  });
  if (event.endsWith('_failed')) console.error(line);
  else console.warn(line);
}
