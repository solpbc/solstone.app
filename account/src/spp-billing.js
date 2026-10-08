import { hashKey, timingSafeEqual } from './crypto.js';
import {
  getEntitlement,
  getScoutApplicationStatusByAccount,
  getStripeCustomerByAccount,
  recordSubscriptionStartRequest,
} from './db.js';
import { renderServicesSpp } from './html.js';
import { forbidden, originAllowed } from './index.js';
import {
  loadMenuContext,
  noStore,
  requireSignedInSession,
  signedInHtml,
  signedInRedirect,
} from './settings.js';
import { SPP_HOSTED_SERVICE as SERVICE } from './spp-entitlement.js';
import { SPP_SERVICE_PATH, sppOnSale, sppPlanTerms } from './spp-service.js';
import {
  createCheckoutSession,
  createPortalSession,
  termsAssentRequired,
} from './stripe.js';
import { startNowRequest, withdrawalOn } from './withdrawal-rules.js';
import { billingView } from './withdrawal.js';

const PUBLIC_ORIGIN = 'https://services.solstone.app';
const CHECKOUT_SUCCESS_URL = `${PUBLIC_ORIGIN}${SPP_SERVICE_PATH}?checkout=success`;
const CHECKOUT_CANCEL_URL = `${PUBLIC_ORIGIN}${SPP_SERVICE_PATH}?checkout=cancel`;
const PORTAL_RETURN_URL = `${PUBLIC_ORIGIN}${SPP_SERVICE_PATH}`;

// The signed-in confidential processing page. Before the service is on sale it reads exactly as
// it did for scouts; once on sale it carries the price, billing and the withdraw door.
export async function handleServicesSpp(req, env) {
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const { session, nowMs } = guard;
  const url = new URL(req.url);
  const onSale = sppOnSale(env);
  const [menu, entitlement, csrf] = await Promise.all([
    loadMenuContext(env, session.account_id, nowMs),
    getEntitlement(env.DB, { accountId: session.account_id, service: SERVICE }),
    csrfToken(env),
  ]);
  if (!onSale) return signedInHtml(renderServicesSpp({ entitlement, menu }));
  return signedInHtml(renderServicesSpp({
    entitlement,
    ...await billingView(env, entitlement),
    onSale,
    startNowBox: withdrawalOn(env),
    csrf,
    flash: {
      checkout: url.searchParams.get('checkout') || '',
      billing: url.searchParams.get('billing') || '',
      withdrawal: url.searchParams.get('withdrawal') || '',
    },
    menu,
    planTerms: sppPlanTerms(env),
  }));
}

export async function handleSppCheckout(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const form = await safeForm(req);
  if (!await validCsrf(form, env)) return noStore(forbidden());
  if (!sppOnSale(env)) return signedInRedirect(`${SPP_SERVICE_PATH}?checkout=invalid`);

  const plan = form.get('plan')?.toString() || '';
  const priceId = plan === 'annual'
    ? env.STRIPE_PRICE_SPP_ANNUAL
    : plan === 'monthly'
      ? env.STRIPE_PRICE_SPP_MONTHLY
      : '';
  if (!priceId) return signedInRedirect(`${SPP_SERVICE_PATH}?checkout=invalid`);

  const accountId = guard.session.account_id;
  const [scoutApp, entitlement] = await Promise.all([
    getScoutApplicationStatusByAccount(env.DB, { accountId }),
    getEntitlement(env.DB, { accountId, service: SERVICE }),
  ]);
  if (scoutApp?.status === 'approved') return signedInRedirect(`${SPP_SERVICE_PATH}?checkout=comped`);
  // A sign-in holds one confidential processing subscription; a second would pay twice for it.
  if (entitlement?.source === 'stripe' && (entitlement.status === 'active' || entitlement.status === 'past_due')) {
    return signedInRedirect(`${SPP_SERVICE_PATH}?checkout=covered`);
  }

  const startNow = startNowRequest(env, form);
  if (startNow.refused) return signedInRedirect(`${SPP_SERVICE_PATH}?checkout=start_now`);

  const customerRow = await getStripeCustomerByAccount(env.DB, { accountId });
  const menu = customerRow ? null : await loadMenuContext(env, accountId, guard.nowMs);
  if (!customerRow && !menu?.email) return signedInRedirect(`${SPP_SERVICE_PATH}?checkout=email`);

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
      service: 'spp',
      termsAssent: termsAssentRequired(env),
      withdrawal: startNow.withdrawal,
      planTerms: sppPlanTerms(env),
    });
  } catch {
    return signedInRedirect(`${SPP_SERVICE_PATH}?checkout=error`);
  }
  if (!checkout?.url) return signedInRedirect(`${SPP_SERVICE_PATH}?checkout=error`);
  if (startNow.requestedAt != null) {
    // The start-now request is kept with us, keyed by the checkout it rode, and tied to the
    // subscription when that checkout completes.
    try {
      await recordSubscriptionStartRequest(env.DB, {
        checkoutSessionRef: checkout.id,
        accountId,
        service: SERVICE,
        requestedAt: startNow.requestedAt,
      });
    } catch {
      return signedInRedirect(`${SPP_SERVICE_PATH}?checkout=error`);
    }
  }
  return signedInRedirect(checkout.url);
}

export async function handleSppPortal(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const form = await safeForm(req);
  if (!await validCsrf(form, env)) return noStore(forbidden());

  const customerRow = await getStripeCustomerByAccount(env.DB, { accountId: guard.session.account_id });
  if (!customerRow) return signedInRedirect(`${SPP_SERVICE_PATH}?billing=missing`);
  let portal;
  try {
    portal = await createPortalSession(env, {
      customer: customerRow.stripe_customer_id,
      returnUrl: PORTAL_RETURN_URL,
    });
  } catch {
    return signedInRedirect(`${SPP_SERVICE_PATH}?billing=error`);
  }
  if (!portal?.url) return signedInRedirect(`${SPP_SERVICE_PATH}?billing=error`);
  return signedInRedirect(portal.url);
}

// Its own cancel door: Stripe's cancel flow for this subscription, which ends it at the end of
// the paid period.
export async function handleSppCancel(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const form = await safeForm(req);
  if (!await validCsrf(form, env)) return noStore(forbidden());

  const [customerRow, entitlement] = await Promise.all([
    getStripeCustomerByAccount(env.DB, { accountId: guard.session.account_id }),
    getEntitlement(env.DB, { accountId: guard.session.account_id, service: SERVICE }),
  ]);
  if (!customerRow || entitlement?.source !== 'stripe' || !entitlement.source_ref) {
    return signedInRedirect(`${SPP_SERVICE_PATH}?billing=missing`);
  }
  let portal;
  try {
    portal = await createPortalSession(env, {
      customer: customerRow.stripe_customer_id,
      returnUrl: PORTAL_RETURN_URL,
      subscriptionId: entitlement.source_ref,
    });
  } catch {
    return signedInRedirect(`${SPP_SERVICE_PATH}?billing=error`);
  }
  if (!portal?.url) return signedInRedirect(`${SPP_SERVICE_PATH}?billing=error`);
  return signedInRedirect(portal.url);
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
