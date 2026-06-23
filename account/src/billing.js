import { hashKey, timingSafeEqual } from './crypto.js';
import {
  getAccountByStripeCustomer,
  getEntitlement,
  getRelayDeviceSignal,
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
  verifyWebhookSignature,
} from './stripe.js';
import { SPL_HOSTED_SERVICE as SERVICE, reconcileSplEntitlement } from './relay-grant.js';
import { reconcileSpbEntitlement } from './spb-entitlement.js';

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
  const [menu, entitlement, deviceSignal, csrf] = await Promise.all([
    loadMenuContext(env, session.account_id, nowMs),
    getEntitlement(env.DB, { accountId: session.account_id, service: SERVICE }),
    getRelayDeviceSignal(env.DB, session.account_id),
    csrfToken(env),
  ]);
  return signedInHtml(renderServicesSpl({
    entitlement,
    csrf,
    flash: {
      checkout: url.searchParams.get('checkout') || '',
      billing: url.searchParams.get('billing') || '',
    },
    menu,
    deviceCount: deviceSignal.count,
    lastSeen: deviceSignal.lastSeenAt,
    nowMs,
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

  const customerRow = await getStripeCustomerByAccount(env.DB, { accountId });
  const menu = customerRow ? null : await loadMenuContext(env, accountId, guard.nowMs);
  if (!customerRow && !menu?.email) return signedInRedirect('/private-network?checkout=email');

  const checkout = await createCheckoutSession(env, {
    accountId,
    priceId,
    customer: customerRow?.stripe_customer_id || '',
    customerEmail: customerRow ? '' : menu.email,
    successUrl: CHECKOUT_SUCCESS_URL,
    cancelUrl: CHECKOUT_CANCEL_URL,
    idempotencyKey: crypto.randomUUID(),
  });
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
  const portal = await createPortalSession(env, {
    customer: customerRow.stripe_customer_id,
    returnUrl: PORTAL_RETURN_URL,
  });
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

function serviceTag(metadataHolder) {
  return metadataHolder?.metadata?.service === 'spb' ? 'spb' : 'spl';
}

async function reconcileForService(service, env, accountId, nowMs, ctx, opts) {
  if (service === 'spb') return reconcileSpbEntitlement(env, accountId, nowMs, ctx, opts);
  return reconcileSplEntitlement(env, accountId, nowMs, ctx, opts);
}

async function handleCheckoutCompleted(env, obj, nowMs, ctx) {
  const accountId = obj?.client_reference_id || '';
  const stripeCustomerId = typeof obj?.customer === 'string' ? obj.customer : '';
  const subscriptionId = typeof obj?.subscription === 'string' ? obj.subscription : '';
  if (!accountId || !stripeCustomerId || !subscriptionId) return;
  await upsertStripeCustomer(env.DB, { accountId, stripeCustomerId, nowMs });
  const subscription = await getSubscription(env, subscriptionId);
  await reconcileForService(serviceTag(subscription), env, accountId, nowMs, ctx, {
    paid: {
      status: 'active',
      currentPeriodEnd: subscriptionPeriodEnd(subscription),
      source: SOURCE,
      sourceRef: subscription.id,
    },
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
      };
  await reconcileForService(serviceTag(obj), env, accountId, nowMs, ctx, { paid });
}

async function handleSubscriptionDeleted(env, obj, nowMs, ctx) {
  const accountRow = await accountForStripeCustomer(env, obj?.customer);
  if (!accountRow) return;
  const accountId = accountRow.account_id;
  await reconcileForService(serviceTag(obj), env, accountId, nowMs, ctx, { paid: null });
}

async function handleInvoicePaid(env, obj, nowMs, ctx) {
  const accountRow = await accountForStripeCustomer(env, obj?.customer);
  const subscriptionId = typeof obj?.subscription === 'string' ? obj.subscription : '';
  if (!accountRow || !subscriptionId) return;
  const subscription = await getSubscription(env, subscriptionId);
  const accountId = accountRow.account_id;
  await reconcileForService(serviceTag(subscription), env, accountId, nowMs, ctx, {
    paid: {
      status: 'active',
      currentPeriodEnd: subscriptionPeriodEnd(subscription),
      source: SOURCE,
      sourceRef: subscription.id,
    },
  });
}

async function handleInvoicePaymentFailed(env, obj, nowMs, ctx) {
  const accountRow = await accountForStripeCustomer(env, obj?.customer);
  if (!accountRow) return;
  const accountId = accountRow.account_id;
  // Stripe copies subscription metadata onto invoice.subscription_details; no extra getSubscription call is made.
  await reconcileForService(serviceTag(obj.subscription_details), env, accountId, nowMs, ctx, {
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
