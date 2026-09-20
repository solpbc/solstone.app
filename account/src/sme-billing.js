import { hashKey, timingSafeEqual } from './crypto.js';
import {
  getScoutApplicationStatusByAccount,
  getStripeCustomerByAccount,
} from './db.js';
import { forbidden, originAllowed } from './index.js';
import {
  loadMenuContext,
  noStore,
  requireSignedInSession,
  signedInRedirect,
} from './settings.js';
import { SME_SERVICE_PATH } from './sme-service.js';
import {
  createCheckoutSession,
  createPortalSession,
} from './stripe.js';

const PUBLIC_ORIGIN = 'https://services.solstone.app';
const CHECKOUT_SUCCESS_URL = `${PUBLIC_ORIGIN}${SME_SERVICE_PATH}?checkout=success`;
const CHECKOUT_CANCEL_URL = `${PUBLIC_ORIGIN}${SME_SERVICE_PATH}?checkout=cancel`;
const PORTAL_RETURN_URL = `${PUBLIC_ORIGIN}${SME_SERVICE_PATH}`;

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

  const customerRow = await getStripeCustomerByAccount(env.DB, { accountId });
  const menu = customerRow ? null : await loadMenuContext(env, accountId, guard.nowMs);
  if (!customerRow && !menu?.email) return signedInRedirect(`${SME_SERVICE_PATH}?checkout=email`);

  const checkout = await createCheckoutSession(env, {
    accountId,
    priceId,
    customer: customerRow?.stripe_customer_id || '',
    customerEmail: customerRow ? '' : menu.email,
    successUrl: CHECKOUT_SUCCESS_URL,
    cancelUrl: CHECKOUT_CANCEL_URL,
    idempotencyKey: crypto.randomUUID(),
    service: 'sme',
  });
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
