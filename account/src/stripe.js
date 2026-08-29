import { timingSafeEqual } from './crypto.js';

export const STRIPE_API_VERSION = '2024-09-30.acacia';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const encoder = new TextEncoder();

export async function createCheckoutSession(env, {
  accountId,
  priceId,
  customer,
  customerEmail,
  successUrl,
  cancelUrl,
  idempotencyKey,
  service = 'spl',
}) {
  if (!idempotencyKey) throw new Error('stripe checkout requires idempotency key');
  const body = new URLSearchParams();
  body.set('mode', 'subscription');
  body.set('client_reference_id', accountId);
  body.set('subscription_data[metadata][service]', service);
  body.set('subscription_data[metadata][account_id]', accountId);
  body.set('allow_promotion_codes', 'true');
  body.set('automatic_tax[enabled]', 'true');
  body.set('line_items[0][price]', priceId);
  body.set('line_items[0][quantity]', '1');
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

export async function createPortalSession(env, { customer, returnUrl }) {
  const body = new URLSearchParams();
  body.set('customer', customer);
  body.set('return_url', returnUrl);
  return stripeRequest(env, '/billing_portal/sessions', { method: 'POST', body });
}

export async function getSubscription(env, subscriptionId) {
  return stripeRequest(env, `/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: 'GET' });
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
  if (!response.ok) throw new Error(`stripe request failed: ${response.status}`);
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
