// The renewed annual year. Once an annual subscription has renewed, the 14 days to withdraw
// reopen, counted from that renewal, and refund that renewal in full. After them, a cancel ends
// at the end of the current service month and refunds the whole months after it. The first year
// and monthly plans are unchanged: a cancel there ends at the end of the paid period, with no
// refund. All of it applies only while the subscription rules are on.

import { subscriptionPeriodEnd, subscriptionPeriodStart, subscriptionPurchasedAt } from './stripe.js';
import { subscriptionRulesOn } from './subscription-rules.js';

const DAY = 86400;

// How far apart Stripe's first period start and the subscription's start may be and still be the
// first year, and how much earlier than the window's start an invoice may be dated and still be
// that renewal's.
export const RENEWAL_TOLERANCE_SECONDS = DAY;

// The renewal that started the current year of an annual subscription, in Unix seconds, or null
// when the plan is not annual or is still in its first year.
export function renewalStart(sub) {
  const interval = sub?.items?.data?.[0]?.price?.recurring?.interval;
  const purchasedAt = subscriptionPurchasedAt(sub);
  const periodStart = subscriptionPeriodStart(sub);
  if (interval !== 'year' || purchasedAt == null || !Number.isInteger(periodStart)) return null;
  return periodStart > purchasedAt + RENEWAL_TOLERANCE_SECONDS ? periodStart : null;
}

// When the withdrawal window opened: the renewal, in a renewed annual year while the rules are on;
// otherwise the purchase, as before.
export function withdrawalWindowStart(env, sub) {
  const renewal = subscriptionRulesOn(env) ? renewalStart(sub) : null;
  return renewal ?? subscriptionPurchasedAt(sub);
}

// The paid invoices a withdrawal refunds: with the rules on, those of the window it was made in
// (in the first year, all of them); with them off, every one, as before.
export function invoicesToRefund(env, invoices, windowStart) {
  if (!subscriptionRulesOn(env)) return invoices;
  return invoices.filter((invoice) => Number(invoice?.created) >= windowStart - RENEWAL_TOLERANCE_SECONDS);
}

// Service month k of a renewed year starts k calendar months after the renewal, at the same time
// of day, on the same day of the month or, in a shorter month, on its last day: the way Stripe
// itself steps a period from an anchor on the 29th to the 31st. So month 12 starts when Stripe's
// year ends.
export function serviceMonthStart(renewal, k) {
  const d = new Date(renewal * 1000);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + k;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Math.floor(Date.UTC(
    year, month, Math.min(d.getUTCDate(), lastDay),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(),
  ) / 1000);
}

// The current service month: the largest k (0 to 11) whose start is at or before now.
export function currentServiceMonth(renewal, nowSeconds) {
  let k = 0;
  while (k < 11 && serviceMonthStart(renewal, k + 1) <= nowSeconds) k += 1;
  return k;
}

// The refund for a cancel with `monthsLeft` whole service months after the current one: one
// twelfth of what the renewal paid, tax included, for each, rounded to the cent.
export function monthsLeftRefund(amountPaid, monthsLeft) {
  return Math.round((amountPaid * monthsLeft) / 12);
}

// When a cancel made now would end the subscription, at the earliest and at the end of the paid
// period. In a renewed annual year (rules on) the earliest is the end of the current service
// month, with `monthsLeft` whole months after it to refund; anywhere else it is the period's end.
export function cancelEnds(env, sub, nowSeconds) {
  const periodEnd = subscriptionPeriodEnd(sub);
  const paidPeriod = { endsAt: periodEnd, atPeriodEnd: true, monthsLeft: 0 };
  const renewal = subscriptionRulesOn(env) ? renewalStart(sub) : null;
  if (renewal == null || !Number.isInteger(periodEnd)) return { earliest: paidPeriod, periodEnd: paidPeriod, renewal: null };
  const k = currentServiceMonth(renewal, nowSeconds);
  const monthEnd = serviceMonthStart(renewal, k + 1);
  const earliest = monthEnd >= periodEnd ? paidPeriod : { endsAt: monthEnd, atPeriodEnd: false, monthsLeft: 11 - k };
  return { earliest, periodEnd: paidPeriod, renewal };
}

// The invoice that paid for the current renewed year: the renewal Stripe raised at its start.
export function renewalInvoice(invoices, renewal) {
  return invoices
    .filter((invoice) => invoice?.billing_reason === 'subscription_cycle'
      && Number(invoice.created) >= renewal - RENEWAL_TOLERANCE_SECONDS
      && Number.isInteger(invoice.amount_paid) && invoice.amount_paid > 0)
    .sort((a, b) => Number(a.created) - Number(b.created))[0] || null;
}
