import { renewalPlan } from './billing-page.js';
import { hashKey, timingSafeEqual } from './crypto.js';
import {
  getEntitlement,
  getScoutApplicationStatusByAccount,
  getStripeCustomerByAccount,
} from './db.js';
import { renderNotFound, renderServicesSme } from './html.js';
import { forbidden, html, originAllowed } from './index.js';
import {
  loadMenuContext,
  noStore,
  requireSignedInSession,
  signedInHtml,
  signedInRedirect,
} from './settings.js';
import { SME_HOSTED_SERVICE } from './sme-entitlement.js';
import { SME_SERVICE_PATH, smeOnSale } from './sme-service.js';
import {
  createCheckoutSession,
  createPortalSession,
  termsAssentRequired,
} from './stripe.js';

const PUBLIC_ORIGIN = 'https://services.solstone.app';
const CHECKOUT_SUCCESS_URL = `${PUBLIC_ORIGIN}${SME_SERVICE_PATH}?checkout=success`;
const CHECKOUT_CANCEL_URL = `${PUBLIC_ORIGIN}${SME_SERVICE_PATH}?checkout=cancel`;
const PORTAL_RETURN_URL = `${PUBLIC_ORIGIN}${SME_SERVICE_PATH}`;

export async function handleServicesSme(req, env) {
  // Not on sale yet: the page does not exist, exactly as if the route were absent.
  if (!smeOnSale(env)) return noStore(html(renderNotFound(), { status: 404 }));
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const { session, nowMs } = guard;
  const url = new URL(req.url);
  const [menu, entitlement, csrf] = await Promise.all([
    loadMenuContext(env, session.account_id, nowMs),
    getEntitlement(env.DB, { accountId: session.account_id, service: SME_HOSTED_SERVICE }),
    csrfToken(env),
  ]);
  return signedInHtml(renderServicesSme({
    entitlement,
    plan: await renewalPlan(env, entitlement),
    csrf,
    flash: {
      checkout: url.searchParams.get('checkout') || '',
      billing: url.searchParams.get('billing') || '',
    },
    menu,
  }));
}

export async function handleSmeCheckout(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const form = await safeForm(req);
  if (!await validCsrf(form, env)) return noStore(forbidden());

  // Annual only, deliberately: there is one annual price and no monthly one to select,
  // so anything but annual is refused.
  const plan = form.get('plan')?.toString() || 'annual';
  const priceId = plan === 'annual' ? env.STRIPE_PRICE_SME_ANNUAL : '';
  if (!priceId) return signedInRedirect(`${SME_SERVICE_PATH}?checkout=invalid`);

  const accountId = guard.session.account_id;
  const scoutApp = await getScoutApplicationStatusByAccount(env.DB, { accountId });
  if (scoutApp?.status === 'approved') return signedInRedirect(`${SME_SERVICE_PATH}?checkout=comped`);

  // The permanent public record is disclosed on the page and acknowledged here, before any
  // subscription is taken. Enforced on the server, not by the form's required attribute.
  if (form.get('data_ack')?.toString() !== 'yes') return signedInRedirect(`${SME_SERVICE_PATH}?checkout=ack`);

  const customerRow = await getStripeCustomerByAccount(env.DB, { accountId });
  const menu = customerRow ? null : await loadMenuContext(env, accountId, guard.nowMs);
  if (!customerRow && !menu?.email) return signedInRedirect(`${SME_SERVICE_PATH}?checkout=email`);

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
      service: 'sme',
      termsAssent: termsAssentRequired(env),
    });
  } catch {
    return signedInRedirect(`${SME_SERVICE_PATH}?checkout=error`);
  }
  if (!checkout?.url) return signedInRedirect(`${SME_SERVICE_PATH}?checkout=error`);
  return signedInRedirect(checkout.url);
}

export async function handleSmePortal(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const form = await safeForm(req);
  if (!await validCsrf(form, env)) return noStore(forbidden());

  const customerRow = await getStripeCustomerByAccount(env.DB, { accountId: guard.session.account_id });
  if (!customerRow) return signedInRedirect(`${SME_SERVICE_PATH}?billing=missing`);
  const portal = await createPortalSession(env, {
    customer: customerRow.stripe_customer_id,
    returnUrl: PORTAL_RETURN_URL,
  });
  if (!portal?.url) return signedInRedirect(`${SME_SERVICE_PATH}?billing=error`);
  return signedInRedirect(portal.url);
}

export async function handleSmeCancel(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const form = await safeForm(req);
  if (!await validCsrf(form, env)) return noStore(forbidden());

  const [customerRow, entitlement] = await Promise.all([
    getStripeCustomerByAccount(env.DB, { accountId: guard.session.account_id }),
    getEntitlement(env.DB, { accountId: guard.session.account_id, service: SME_HOSTED_SERVICE }),
  ]);
  if (!customerRow || entitlement?.source !== 'stripe' || !entitlement.source_ref) {
    return signedInRedirect(`${SME_SERVICE_PATH}?billing=missing`);
  }
  let portal;
  try {
    portal = await createPortalSession(env, {
      customer: customerRow.stripe_customer_id,
      returnUrl: PORTAL_RETURN_URL,
      subscriptionId: entitlement.source_ref,
    });
  } catch {
    return signedInRedirect(`${SME_SERVICE_PATH}?billing=error`);
  }
  if (!portal?.url) return signedInRedirect(`${SME_SERVICE_PATH}?billing=error`);
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
