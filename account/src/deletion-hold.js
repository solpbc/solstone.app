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
import { getStripeCustomerByAccount } from './db.js';
import { reconcileSubscription } from './billing.js';
import { syncAccountEntitlementToRelay } from './relay-grant.js';
import { reconcileAllServices } from './spb-entitlement.js';
import {
  listCustomerSubscriptions,
  listVoidedRenewals,
  pauseSubscriptionCollection,
  resumeSubscriptionCollection,
} from './stripe.js';

// Statuses that can still raise an invoice. A canceled or incomplete_expired
// subscription has nothing left to collect.
const COLLECTING_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete']);
const RESTORE_RETRY_MS = 15 * 60 * 1000;

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
