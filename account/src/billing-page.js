// The one billing place: every paid service on the sign-in, with its price and one state line,
// and one way into Stripe's billing portal. Price and interval come live from each subscription
// at render and are never stored. Card, receipts and billing address stay at Stripe: nothing here
// fetches an invoice, a charge or a payment method.

import { hashKey, timingSafeEqual } from './crypto.js';
import { getEntitlement, getStripeCustomerByAccount } from './db.js';
import { billingEntryState, renderBilling } from './html.js';
import { forbidden, originAllowed } from './index.js';
import { SPL_HOSTED_SERVICE } from './relay-grant.js';
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
import { createPortalSession, readSubscriptionPlan } from './stripe.js';

const BILLING_PATH = '/billing';
const PORTAL_RETURN_URL = `https://services.solstone.app${BILLING_PATH}`;

// The paid services, in the order the home page lists them.
export const BILLING_SERVICES = Object.freeze([
  { service: SPL_HOSTED_SERVICE, name: 'private network', href: '/private-network' },
  { service: SPB_HOSTED_SERVICE, name: 'encrypted backup', href: '/services/backup' },
  { service: SME_HOSTED_SERVICE, name: 'solstone.me', href: SME_SERVICE_PATH },
]);

// A stopped subscription shows no price, so only a live one is read.
const PRICED_STATES = new Set(['renews', 'stopping', 'past_due']);

// The plan behind a service page's "renews on DATE at PRICE" line: only a paid subscription
// that is set to renew has one worth reading.
export async function renewalPlan(env, entitlement) {
  if (billingEntryState(entitlement) !== 'renews' || entitlement.current_period_end == null) return null;
  return readSubscriptionPlan(env, entitlement.source_ref);
}

export async function handleBilling(req, env) {
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const { session, nowMs } = guard;
  const accountId = session.account_id;
  const [menu, customer, csrf, ...entitlements] = await Promise.all([
    loadMenuContext(env, accountId, nowMs),
    getStripeCustomerByAccount(env.DB, { accountId }),
    csrfToken(env),
    ...BILLING_SERVICES.map(({ service }) => getEntitlement(env.DB, { accountId, service })),
  ]);
  const entries = await Promise.all(BILLING_SERVICES.map(async (def, index) => {
    const entitlement = entitlements[index];
    const state = billingEntryState(entitlement);
    if (!state) return null;
    const plan = PRICED_STATES.has(state) ? await readSubscriptionPlan(env, entitlement.source_ref) : null;
    return { ...def, entitlement, state, plan };
  }));
  const url = new URL(req.url);
  return signedInHtml(renderBilling({
    entries: entries.filter(Boolean),
    hasCustomer: Boolean(customer),
    csrf,
    flash: { billing: url.searchParams.get('billing') || '' },
    menu,
    nowSeconds: Math.floor(nowMs / 1000),
  }));
}

export async function handleBillingManage(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const form = await safeForm(req);
  if (!await validCsrf(form, env)) return noStore(forbidden());

  const customer = await getStripeCustomerByAccount(env.DB, { accountId: guard.session.account_id });
  if (!customer) return signedInRedirect(`${BILLING_PATH}?billing=missing`);
  let portal;
  try {
    portal = await createPortalSession(env, {
      customer: customer.stripe_customer_id,
      returnUrl: PORTAL_RETURN_URL,
    });
  } catch {
    return signedInRedirect(`${BILLING_PATH}?billing=error`);
  }
  if (!portal?.url) return signedInRedirect(`${BILLING_PATH}?billing=error`);
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
