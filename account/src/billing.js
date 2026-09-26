import { hashKey, timingSafeEqual } from './crypto.js';
import {
  getAccountByStripeCustomer,
  getActiveDeletionForAccount,
  getEntitlement,
  getScoutApplicationStatusByAccount,
  getStripeCustomerByAccount,
  upsertStripeCustomer,
} from './db.js';
import { renderBillingReturn, renderServicesSpl } from './html.js';
import { forbidden, json, originAllowed } from './index.js';
import {
  loadMenuContext,
  noStore,
  requireSignedInSession,
  signedInHtml,
  signedInRedirect,
} from './settings.js';
import {
  createCheckoutSession,
  createPortalSession,
  getSubscription,
  subscriptionPeriodEnd,
  termsAssentRequired,
  verifyWebhookSignature,
} from './stripe.js';
import { SPL_HOSTED_SERVICE as SERVICE, reconcileSplEntitlement } from './relay-grant.js';
import { TAG_TO_HOSTED_SERVICE, maybeSendSubscriptionAck } from './renewal-notices.js';
import { reconcileSmeEntitlement } from './sme-entitlement.js';
import { reconcileSpbEntitlement } from './spb-entitlement.js';
import { notifySubscriptionCreated } from './subscription-created.js';
import { startNowRequest, withdrawalOn } from './withdrawal-rules.js';
import { billingView } from './withdrawal.js';

// One reconciler per billed service, keyed by the metadata.service tag checkout stamps.
// test/billing-stripe.test.js walks BILLED_SERVICES through the webhook, so a service
// added there without an entry here fails the gate.
const SERVICE_RECONCILERS = Object.freeze({
  spl: reconcileSplEntitlement,
  spb: reconcileSpbEntitlement,
  sme: reconcileSmeEntitlement,
});

const SOURCE = 'stripe';
const PUBLIC_ORIGIN = 'https://services.solstone.app';
const CHECKOUT_SUCCESS_URL = `${PUBLIC_ORIGIN}/billing/return?status=success`;
const CHECKOUT_CANCEL_URL = `${PUBLIC_ORIGIN}/billing/return?status=cancel`;
const PORTAL_RETURN_URL = `${PUBLIC_ORIGIN}/private-network`;

export async function handleServicesSpl(req, env) {
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const { session, nowMs } = guard;
  const url = new URL(req.url);
  const [menu, entitlement, csrf] = await Promise.all([
    loadMenuContext(env, session.account_id, nowMs),
    getEntitlement(env.DB, { accountId: session.account_id, service: SERVICE }),
    csrfToken(env),
  ]);
  return signedInHtml(renderServicesSpl({
    entitlement,
    ...await billingView(env, entitlement),
    startNowBox: withdrawalOn(env),
    csrf,
    flash: {
      checkout: url.searchParams.get('checkout') || '',
      billing: url.searchParams.get('billing') || '',
      withdrawal: url.searchParams.get('withdrawal') || '',
    },
    menu,
  }));
}

export async function handleBillingCheckout(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const form = await safeForm(req);
  if (!await validCsrf(form, env)) return noStore(forbidden());

  const plan = form.get('plan')?.toString() || '';
  const priceId = plan === 'annual'
    ? env.STRIPE_PRICE_ANNUAL
    : plan === 'monthly'
      ? env.STRIPE_PRICE_MONTHLY
      : '';
  if (!priceId) return signedInRedirect('/private-network?checkout=invalid');

  const accountId = guard.session.account_id;
  const scoutApp = await getScoutApplicationStatusByAccount(env.DB, { accountId });
  if (scoutApp?.status === 'approved') return signedInRedirect('/private-network?checkout=comped');

  const startNow = startNowRequest(env, form);
  if (startNow.refused) return signedInRedirect('/private-network?checkout=start_now');

  const customerRow = await getStripeCustomerByAccount(env.DB, { accountId });
  const menu = customerRow ? null : await loadMenuContext(env, accountId, guard.nowMs);
  if (!customerRow && !menu?.email) return signedInRedirect('/private-network?checkout=email');

  let checkout;
  try {
    checkout = await createCheckoutSession(env, {
      accountId,
      priceId,
      customer: customerRow?.stripe_customer_id || '',
      customerEmail: customerRow ? '' : menu.email,
      successUrl: CHECKOUT_SUCCESS_URL,
      cancelUrl: CHECKOUT_CANCEL_URL,
      idempotencyKey: crypto.randomUUID(),
      service: 'spl',
      termsAssent: termsAssentRequired(env),
      withdrawal: startNow.withdrawal,
      startNowRequestedAt: startNow.requestedAt,
    });
  } catch {
    return signedInRedirect('/private-network?checkout=error');
  }
  if (!checkout?.url) return signedInRedirect('/private-network?checkout=error');
  return signedInRedirect(checkout.url);
}

export async function handleBillingPortal(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const form = await safeForm(req);
  if (!await validCsrf(form, env)) return noStore(forbidden());

  const customerRow = await getStripeCustomerByAccount(env.DB, { accountId: guard.session.account_id });
  if (!customerRow) return signedInRedirect('/private-network?billing=missing');
  let portal;
  try {
    portal = await createPortalSession(env, {
      customer: customerRow.stripe_customer_id,
      returnUrl: PORTAL_RETURN_URL,
    });
  } catch {
    return signedInRedirect('/private-network?billing=error');
  }
  if (!portal?.url) return signedInRedirect('/private-network?billing=error');
  return signedInRedirect(portal.url);
}

export async function handleBillingCancel(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const form = await safeForm(req);
  if (!await validCsrf(form, env)) return noStore(forbidden());

  const [customerRow, entitlement] = await Promise.all([
    getStripeCustomerByAccount(env.DB, { accountId: guard.session.account_id }),
    getEntitlement(env.DB, { accountId: guard.session.account_id, service: SERVICE }),
  ]);
  if (!customerRow || entitlement?.source !== SOURCE || !entitlement.source_ref) {
    return signedInRedirect('/private-network?billing=missing');
  }
  let portal;
  try {
    portal = await createPortalSession(env, {
      customer: customerRow.stripe_customer_id,
      returnUrl: PORTAL_RETURN_URL,
      subscriptionId: entitlement.source_ref,
    });
  } catch {
    return signedInRedirect('/private-network?billing=error');
  }
  if (!portal?.url) return signedInRedirect('/private-network?billing=error');
  return signedInRedirect(portal.url);
}

export async function handleBillingReturn(req, env) {
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const menu = await loadMenuContext(env, guard.session.account_id, guard.nowMs);
  const url = new URL(req.url);
  return signedInHtml(renderBillingReturn({
    status: url.searchParams.get('status') || '',
    menu,
  }));
}

export async function handleStripeWebhook(req, env, ctx) {
  const rawBody = await req.text();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const valid = await verifyWebhookSignature(
    rawBody,
    req.headers.get('Stripe-Signature') || '',
    env.STRIPE_WEBHOOK_SECRET,
    nowSeconds
  );
  if (!valid) return json({ ok: false }, { status: 400 });

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ ok: false }, { status: 400 });
  }

  await applyStripeEvent(env, event, Date.now(), ctx);
  return json({ ok: true });
}

async function applyStripeEvent(env, event, nowMs, ctx) {
  const obj = event?.data?.object;
  switch (event?.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(env, obj, nowMs, ctx);
      return;
    case 'customer.subscription.updated':
      await handleSubscriptionChanged(env, obj, nowMs, ctx);
      return;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(env, obj, nowMs, ctx);
      return;
    case 'invoice.paid':
      await handleInvoicePaid(env, obj, nowMs, ctx);
      return;
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(env, obj, nowMs, ctx);
      return;
    default:
      return;
  }
}

// The service a Stripe object was sold as. Every checkout this portal creates stamps
// metadata.service, so an object without a known tag is not one of ours to reconcile:
// guessing a service here is how one product's payment grants another product's entitlement.
function serviceTag(metadataHolder) {
  const tag = metadataHolder?.metadata?.service;
  return typeof tag === 'string' && Object.hasOwn(SERVICE_RECONCILERS, tag) ? tag : null;
}

export async function reconcileForService(service, env, accountId, nowMs, ctx, opts) {
  if (!service) {
    console.error('stripe_event_service_unknown');
    return;
  }
  if (await getActiveDeletionForAccount(env.DB, accountId)) return;
  return SERVICE_RECONCILERS[service](env, accountId, nowMs, ctx, opts);
}

async function handleCheckoutCompleted(env, obj, nowMs, ctx) {
  const accountId = obj?.client_reference_id || '';
  const stripeCustomerId = typeof obj?.customer === 'string' ? obj.customer : '';
  const subscriptionId = typeof obj?.subscription === 'string' ? obj.subscription : '';
  if (!accountId || !stripeCustomerId || !subscriptionId) return;
  if (await getActiveDeletionForAccount(env.DB, accountId)) return;
  await upsertStripeCustomer(env.DB, { accountId, stripeCustomerId, nowMs });
  const subscription = await getSubscription(env, subscriptionId);
  const tag = serviceTag(subscription);
  await reconcileForService(tag, env, accountId, nowMs, ctx, {
    paid: {
      status: 'active',
      currentPeriodEnd: subscriptionPeriodEnd(subscription),
      source: SOURCE,
      sourceRef: subscription.id,
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    },
  });
  if (tag === 'spl' || tag === 'spb' || tag === 'sme') {
    const deletion = await getActiveDeletionForAccount(env.DB, accountId);
    const entitlement = deletion
      ? null
      : await getEntitlement(env.DB, { accountId, service: TAG_TO_HOSTED_SERVICE[tag] });
    if (!deletion && entitlement?.status === 'active' && entitlement?.source === SOURCE) {
      try {
        await notifySubscriptionCreated(env, ctx, {
          service: tag,
          nowMs,
          checkoutSessionId: obj.id,
        });
      } catch {
        // Notify failures must not skip the renewal ack.
      }
    }
  }
  await maybeSendSubscriptionAck(env, {
    accountId,
    tag,
    status: 'active',
    sourceRef: subscription.id,
    subscription,
  });
}

async function handleSubscriptionChanged(env, obj, nowMs, ctx) {
  const accountRow = await accountForStripeCustomer(env, obj?.customer);
  if (!accountRow) return;
  const status = mapSubscriptionStatus(obj?.status);
  if (!status) return;
  const accountId = accountRow.account_id;
  const paid = status === 'lapsed'
    ? null
    : {
        status,
        currentPeriodEnd: subscriptionPeriodEnd(obj),
        source: SOURCE,
        sourceRef: obj?.id || null,
        cancelAtPeriodEnd: Boolean(obj?.cancel_at_period_end),
      };
  const tag = serviceTag(obj);
  await reconcileForService(tag, env, accountId, nowMs, ctx, { paid });
  if (status === 'active' && (tag === 'spl' || tag === 'spb' || tag === 'sme') && paid?.sourceRef) {
    await maybeSendSubscriptionAck(env, {
      accountId,
      tag,
      status,
      sourceRef: paid.sourceRef,
      subscription: obj,
    });
  }
}

async function handleSubscriptionDeleted(env, obj, nowMs, ctx) {
  const accountRow = await accountForStripeCustomer(env, obj?.customer);
  if (!accountRow) return;
  const accountId = accountRow.account_id;
  await reconcileForService(serviceTag(obj), env, accountId, nowMs, ctx, { paid: null });
}

// Where an invoice names its subscription depends on the Stripe API version the webhook
// endpoint delivers. This account's live endpoint is pinned to 2026-03-25.dahlia,
// which carries it at invoice.parent.subscription_details ({ subscription, metadata }) and
// has neither of the legacy fields. The pinned outbound version (see stripe.js) and older
// payloads carry invoice.subscription and invoice.subscription_details. Read the shape the
// account receives first and keep the legacy one as a fallback, so a pin change either way is
// survivable. Both handlers below resolve through here, so neither can drift from the other.
function invoiceSubscription(invoice) {
  const parent = invoice?.parent?.subscription_details;
  const details = parent || invoice?.subscription_details || null;
  const candidate = parent?.subscription ?? invoice?.subscription;
  return { subscriptionId: typeof candidate === 'string' ? candidate : '', details };
}

async function handleInvoicePaid(env, obj, nowMs, ctx) {
  const accountRow = await accountForStripeCustomer(env, obj?.customer);
  const { subscriptionId } = invoiceSubscription(obj);
  if (!accountRow || !subscriptionId) return;
  const subscription = await getSubscription(env, subscriptionId);
  const accountId = accountRow.account_id;
  const tag = serviceTag(subscription);
  await reconcileForService(tag, env, accountId, nowMs, ctx, {
    paid: {
      status: 'active',
      currentPeriodEnd: subscriptionPeriodEnd(subscription),
      source: SOURCE,
      sourceRef: subscription.id,
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    },
  });
  await maybeSendSubscriptionAck(env, {
    accountId,
    tag,
    status: 'active',
    sourceRef: subscription.id,
    subscription,
  });
}

async function handleInvoicePaymentFailed(env, obj, nowMs, ctx) {
  const accountRow = await accountForStripeCustomer(env, obj?.customer);
  if (!accountRow) return;
  const accountId = accountRow.account_id;
  // The invoice carries the subscription's metadata itself (see invoiceSubscription), so no
  // extra getSubscription call is made.
  await reconcileForService(serviceTag(invoiceSubscription(obj).details), env, accountId, nowMs, ctx, {
    paid: {
      status: 'past_due',
      currentPeriodEnd: null,
      source: SOURCE,
      sourceRef: null,
    },
  });
}

function mapSubscriptionStatus(status) {
  if (status === 'active' || status === 'trialing') return 'active';
  if (status === 'past_due' || status === 'unpaid') return 'past_due';
  if (status === 'canceled') return 'lapsed';
  return null;
}

async function accountForStripeCustomer(env, stripeCustomerId) {
  if (typeof stripeCustomerId !== 'string' || !stripeCustomerId) return null;
  return getAccountByStripeCustomer(env.DB, { stripeCustomerId });
}

async function validCsrf(form, env) {
  if (!form) return false;
  const expected = await csrfToken(env);
  return timingSafeEqual(form.get('csrf')?.toString() || '', expected);
}

async function csrfToken(env) {
  return hashKey('csrf', 'account', env);
}

async function safeForm(req) {
  try {
    return await req.formData();
  } catch {
    return null;
  }
}
