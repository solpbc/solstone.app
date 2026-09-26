import { timingSafeEqual } from './crypto.js';

export const STRIPE_API_VERSION = '2024-09-30.acacia';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const encoder = new TextEncoder();
const CHECKOUT_DISCLOSURE = 'by purchasing this service, you agree to enroll in an automatic renewal contract: it renews automatically at the end of each billing period, until you cancel. cancel anytime: sign in at services.solstone.app, open the service, use the manage billing button, and cancel on the billing page it opens. when you cancel, the service keeps working through the end of the period you have already paid for, then stops.';

// PLACEHOLDER pending the approved withdrawal wording. It is appended to the renewal
// disclosure above, which stays exactly as it is, and only while the withdrawal door is on.
export const CHECKOUT_WITHDRAWAL_DISCLOSURE = 'you can also withdraw for a full refund, wherever you live, until the end of the 14th day after the day you buy: sign in at services.solstone.app and use "withdraw from contract here" on the service\'s page or at services.solstone.app/billing, then confirm; or email support@solstone.app saying you withdraw. a withdrawal sent within the 14 days counts. withdrawing stops the service that day and we refund everything you paid for it. a renewal does not start a new 14 days. the withdrawal form and the details are in the terms: services.solstone.app/terms#withdrawal.';

// Stripe caps custom_text[submit][message] at 1,200 characters.
export const CHECKOUT_SUBMIT_TEXT_LIMIT = 1200;

export function checkoutDisclosure({ withdrawal = false } = {}) {
  return withdrawal ? `${CHECKOUT_DISCLOSURE} ${CHECKOUT_WITHDRAWAL_DISCLOSURE}` : CHECKOUT_DISCLOSURE;
}

// The services a Stripe subscription can be sold as. Checkout stamps one of these on
// the subscription as metadata.service, and the webhook reconciles by it. Adding a
// service here without a reconciler in billing.js is caught by test/billing-stripe.test.js.
export const BILLED_SERVICES = Object.freeze(['spl', 'spb', 'sme']);

// Whether Checkout must collect the customer's agreement to the terms before any charge.
// Stripe refuses `consent_collection[terms_of_service]` unless a terms URL is already set in
// the Dashboard's public details, so this is an explicit switch and not a default: it is
// turned on (STRIPE_TERMS_ASSENT = "required", exact string) only after that Dashboard step
// is done. While it is off, checkout takes no assent and logs that on every checkout.
export function termsAssentRequired(env) {
  if (env.STRIPE_TERMS_ASSENT === 'required') return true;
  console.warn('stripe_checkout_terms_assent_off');
  return false;
}

export async function createCheckoutSession(env, {
  accountId,
  priceId,
  customer,
  customerEmail,
  successUrl,
  cancelUrl,
  idempotencyKey,
  service,
  termsAssent = false,
  withdrawal = false,
}) {
  if (!idempotencyKey) throw new Error('stripe checkout requires idempotency key');
  if (!BILLED_SERVICES.includes(service)) throw new Error('stripe checkout requires a billed service');
  const body = new URLSearchParams();
  body.set('mode', 'subscription');
  body.set('client_reference_id', accountId);
  body.set('subscription_data[metadata][service]', service);
  body.set('subscription_data[metadata][account_id]', accountId);
  body.set('allow_promotion_codes', 'true');
  body.set('automatic_tax[enabled]', 'true');
  body.set('line_items[0][price]', priceId);
  body.set('line_items[0][quantity]', '1');
  body.set('custom_text[submit][message]', checkoutDisclosure({ withdrawal }));
  if (termsAssent) body.set('consent_collection[terms_of_service]', 'required');
  body.set('success_url', successUrl);
  body.set('cancel_url', cancelUrl);
  if (customer) {
    body.set('customer', customer);
  } else if (customerEmail) {
    body.set('customer_email', customerEmail);
  } else {
    throw new Error('stripe checkout requires customer or customer_email');
  }
  return stripeRequest(env, '/checkout/sessions', {
    method: 'POST',
    body,
    idempotencyKey,
  });
}

export async function createPortalSession(env, { customer, returnUrl, subscriptionId = '' }) {
  const body = new URLSearchParams();
  body.set('customer', customer);
  body.set('return_url', returnUrl);
  if (subscriptionId) {
    body.set('flow_data[type]', 'subscription_cancel');
    body.set('flow_data[subscription_cancel][subscription]', subscriptionId);
    body.set('flow_data[after_completion][type]', 'redirect');
    body.set('flow_data[after_completion][redirect][return_url]', returnUrl);
  }
  return stripeRequest(env, '/billing_portal/sessions', { method: 'POST', body });
}

export async function getSubscription(env, subscriptionId) {
  return stripeRequest(env, `/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: 'GET' });
}

// A subscription's price and interval. These are read live when a page renders and never
// stored: the privacy policy's list of what we keep says when a subscription renews, not
// what it costs. A subscription object carries no card or billing-address data.
export function subscriptionPlan(sub) {
  const items = sub?.items?.data;
  if (!Array.isArray(items) || items.length !== 1 || items[0].quantity !== 1) return null;
  const price = items[0].price;
  const unitAmount = price?.unit_amount;
  const interval = price?.recurring?.interval;
  if (!Number.isInteger(unitAmount) || unitAmount <= 0 || price.currency !== 'usd') return null;
  if (interval !== 'year' && interval !== 'month') return null;
  return { unitAmount, interval, taxIncluded: price.tax_behavior === 'inclusive' };
}

// null when the plan can't be read, so a page renders without a price rather than failing.
export async function readSubscriptionPlan(env, subscriptionId) {
  if (!subscriptionId) return null;
  try {
    return subscriptionPlan(await getSubscription(env, subscriptionId));
  } catch {
    console.warn('stripe_plan_read_failed');
    return null;
  }
}

export async function verifyWebhookSignature(rawBody, sigHeader, secret, nowSeconds) {
  if (!rawBody || !sigHeader || !secret) return false;
  const parsed = parseStripeSignature(sigHeader);
  if (!parsed.timestamp || parsed.signatures.length === 0) return false;
  if (Math.abs(nowSeconds - parsed.timestamp) > 300) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signedPayload = `${parsed.timestamp}.${rawBody}`;
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const expected = hexEncode(new Uint8Array(signature));
  return parsed.signatures.some((actual) => timingSafeEqual(expected, actual));
}

// When a subscription was bought, in Unix seconds: the start of the withdrawal period.
export function subscriptionPurchasedAt(sub) {
  const start = sub?.start_date ?? sub?.created;
  return Number.isInteger(start) && start > 0 ? start : null;
}

// The paid invoices of one subscription. At the pinned API version an invoice names the
// charge that paid it, which is what a refund is made against.
export async function listPaidSubscriptionInvoices(env, subscriptionId) {
  const query = new URLSearchParams({ subscription: subscriptionId, status: 'paid', limit: '100' });
  const list = await stripeRequest(env, `/invoices?${query}`, { method: 'GET' });
  return Array.isArray(list?.data) ? list.data : [];
}

// A full refund of one charge. The idempotency key and Stripe's own refusal to refund a
// charge twice both make a repeat of this call refund nothing more.
export async function refundChargeInFull(env, { chargeId, subscriptionId }) {
  const body = new URLSearchParams();
  body.set('charge', chargeId);
  body.set('reason', 'requested_by_customer');
  body.set('metadata[subscription]', subscriptionId);
  body.set('metadata[withdrawal]', 'true');
  try {
    return await stripeRequest(env, '/refunds', {
      method: 'POST',
      body,
      idempotencyKey: `withdrawal-refund-${chargeId}`,
    });
  } catch (error) {
    if (error?.code === 'charge_already_refunded') return { already: true };
    throw error;
  }
}

// Ends a subscription now. Stripe's defaults are the ones wanted: no proration and no final
// invoice. This is only the withdrawal path; an ordinary cancel goes through the billing portal
// and ends at the period's end.
export async function cancelSubscriptionNow(env, subscriptionId) {
  return stripeRequest(env, `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: 'DELETE',
    idempotencyKey: `withdrawal-cancel-${subscriptionId}`,
  });
}

export function subscriptionPeriodEnd(sub) {
  return sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end ?? null;
}

export async function deleteStripeCustomer(env, stripeCustomerId) {
  try {
    const response = await fetch(`${STRIPE_API_BASE}/customers/${encodeURIComponent(stripeCustomerId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Stripe-Version': STRIPE_API_VERSION },
    });
    if (response.status === 404) return { state: 'absent' };
    if (!response.ok) return { state: 'retryable' };
    const body = await response.json().catch(() => null);
    return body?.deleted === true ? { state: 'deleted' } : { state: 'retryable' };
  } catch {
    return { state: 'retryable' };
  }
}

async function stripeRequest(env, path, { method, body = null, idempotencyKey = '' }) {
  const headers = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    'Stripe-Version': STRIPE_API_VERSION,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  const init = { method, headers };
  if (body) {
    init.body = body.toString();
  }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const response = await fetch(`${STRIPE_API_BASE}${path}`, init);
  if (!response.ok) {
    const error = new Error(`stripe request failed: ${response.status}`);
    error.status = response.status;
    const detail = await response.json().catch(() => null);
    if (typeof detail?.error?.code === 'string') error.code = detail.error.code;
    throw error;
  }
  return response.json();
}

function parseStripeSignature(sigHeader) {
  const out = { timestamp: null, signatures: [] };
  for (const part of sigHeader.split(',')) {
    const [key, value] = part.split('=', 2);
    if (key === 't') {
      const timestamp = Number(value);
      if (Number.isInteger(timestamp)) out.timestamp = timestamp;
    } else if (key === 'v1' && value) {
      out.signatures.push(value);
    }
  }
  return out;
}

function hexEncode(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
