import { hashWithPepper } from './crypto.js';
import { claimSubscriptionCreated } from './db.js';

function logDeliveryFailure(reason) {
  console.error(JSON.stringify({ event: 'subscription_created_delivery_failed', reason }));
}

async function deliverSubscriptionCreated(delivery) {
  const controller = new AbortController();
  let deadlineFired = false;
  const timeout = setTimeout(() => {
    deadlineFired = true;
    controller.abort();
  }, 10_000);
  try {
    const response = await fetch(delivery.url, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Secret': delivery.secret,
      },
      body: JSON.stringify(delivery.body),
      signal: controller.signal,
    });
    if (deadlineFired) {
      logDeliveryFailure('deadline');
      return;
    }
    if (!response || response.status < 200 || response.status >= 300) {
      logDeliveryFailure('http');
      return;
    }
  } catch (error) {
    if (deadlineFired || error?.name === 'AbortError') logDeliveryFailure('deadline');
    else logDeliveryFailure('transport');
  } finally {
    clearTimeout(timeout);
  }
}

function scheduleSubscriptionCreated(ctx, delivery) {
  if (typeof ctx?.waitUntil !== 'function') {
    logDeliveryFailure('schedule');
    return;
  }
  let accepted = false;
  const task = Promise.resolve().then(() => {
    if (!accepted) return;
    return deliverSubscriptionCreated(delivery);
  });
  try {
    ctx.waitUntil(task);
  } catch {
    logDeliveryFailure('schedule');
    return;
  }
  accepted = true;
}

export async function notifySubscriptionCreated(env, ctx, { service, nowMs, checkoutSessionId } = {}) {
  const url = env?.HUB_SUBSCRIPTION_CREATED_URL;
  if (typeof url !== 'string' || url.length === 0) return;
  if (typeof checkoutSessionId !== 'string' || checkoutSessionId.length === 0) return;
  if (service !== 'spl' && service !== 'spb' && service !== 'sme') return;

  let claimResult;
  try {
    const claimKey = await hashWithPepper(`subscription-created:${checkoutSessionId}`, env);
    claimResult = await claimSubscriptionCreated(env.DB, { claimKey, nowMs });
  } catch {
    logDeliveryFailure('claim');
    return;
  }

  if (claimResult === 'duplicate') {
    return;
  }
  if (claimResult !== 'established') {
    logDeliveryFailure('claim');
    return;
  }

  const delivery = {
    url,
    secret: env?.HUB_WEBHOOK_SECRET || '',
    body: {
      office: 'cxo',
      type: 'subscription.created',
      service,
      ts: new Date(nowMs).toISOString(),
    },
  };

  scheduleSubscriptionCreated(ctx, delivery);
}
