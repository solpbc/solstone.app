import { hashKey, timingSafeEqual } from './crypto.js';
import {
  getEntitlement,
  getScoutApplicationStatusByAccount,
  getStripeCustomerByAccount,
} from './db.js';
import { renderServicesSpb } from './html.js';
import { forbidden, originAllowed } from './index.js';
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
} from './stripe.js';
import { SPB_HOSTED_SERVICE as SERVICE } from './spb-entitlement.js';

const PUBLIC_ORIGIN = 'https://services.solstone.app';
const SPB_SERVICE_PATH = '/services/backup';
const CHECKOUT_SUCCESS_URL = `${PUBLIC_ORIGIN}${SPB_SERVICE_PATH}?checkout=success`;
const CHECKOUT_CANCEL_URL = `${PUBLIC_ORIGIN}${SPB_SERVICE_PATH}?checkout=cancel`;
const PORTAL_RETURN_URL = `${PUBLIC_ORIGIN}${SPB_SERVICE_PATH}`;

export async function handleServicesSpb(req, env) {
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const { session, nowMs } = guard;
  const url = new URL(req.url);
  const restoreIntent = url.searchParams.get('intent') === 'restore';
  const restoreCheckout = url.searchParams.get('checkout') === 'success' && restoreIntent;
  const [menu, entitlement, csrf] = await Promise.all([
    loadMenuContext(env, session.account_id, nowMs),
    getEntitlement(env.DB, { accountId: session.account_id, service: SERVICE }),
    csrfToken(env),
  ]);
  return signedInHtml(renderServicesSpb({
    entitlement,
    csrf,
    flash: {
      checkout: url.searchParams.get('checkout') || '',
      billing: url.searchParams.get('billing') || '',
    },
    menu,
    restoreIntent,
    restoreCheckout,
  }));
}

export async function handleSpbCheckout(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const form = await safeForm(req);
  if (!await validCsrf(form, env)) return noStore(forbidden());

  const plan = form.get('plan')?.toString() || '';
  const restoreIntent = form.get('intent')?.toString() === 'restore';
  const priceId = plan === 'annual'
    ? env.STRIPE_PRICE_SPB_ANNUAL
    : plan === 'monthly'
      ? env.STRIPE_PRICE_SPB_MONTHLY
      : '';
  if (!priceId) return signedInRedirect(`${SPB_SERVICE_PATH}?checkout=invalid`);

  const accountId = guard.session.account_id;
  const scoutApp = await getScoutApplicationStatusByAccount(env.DB, { accountId });
  if (scoutApp?.status === 'approved') return signedInRedirect(`${SPB_SERVICE_PATH}?checkout=comped`);

  const customerRow = await getStripeCustomerByAccount(env.DB, { accountId });
  const menu = customerRow ? null : await loadMenuContext(env, accountId, guard.nowMs);
  if (!customerRow && !menu?.email) return signedInRedirect(`${SPB_SERVICE_PATH}?checkout=email`);

  const checkout = await createCheckoutSession(env, {
    accountId,
    priceId,
    customer: customerRow?.stripe_customer_id || '',
    customerEmail: customerRow ? '' : menu.email,
    successUrl: restoreIntent ? `${CHECKOUT_SUCCESS_URL}&intent=restore` : CHECKOUT_SUCCESS_URL,
    cancelUrl: CHECKOUT_CANCEL_URL,
    idempotencyKey: crypto.randomUUID(),
    service: 'spb',
  });
  if (!checkout?.url) return signedInRedirect(`${SPB_SERVICE_PATH}?checkout=error`);
  return signedInRedirect(checkout.url);
}

export async function handleSpbPortal(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const form = await safeForm(req);
  if (!await validCsrf(form, env)) return noStore(forbidden());

  const customerRow = await getStripeCustomerByAccount(env.DB, { accountId: guard.session.account_id });
  if (!customerRow) return signedInRedirect(`${SPB_SERVICE_PATH}?billing=missing`);
  const portal = await createPortalSession(env, {
    customer: customerRow.stripe_customer_id,
    returnUrl: PORTAL_RETURN_URL,
  });
  if (!portal?.url) return signedInRedirect(`${SPB_SERVICE_PATH}?billing=error`);
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
