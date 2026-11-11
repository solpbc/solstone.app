// The cancel function: one page per paid subscription, reachable from its service's page and
// the billing page, where the owner sees what they are canceling, may give their name, picks the
// type of cancel and when it ends, checks a summary, and presses one cancel button. Then, in this
// order, the declaration is recorded, its confirmation is emailed, a cancel for a serious reason
// opens a support request with its reason, and Stripe is told; none of it waits on the step after.
// The Stripe change, and in a renewed annual year the refund of the whole months left, retry on
// the schedule until they land, and one that cannot be finished reaches a person.
//
// The summary page carries a signed statement of exactly what it showed, so the confirm records
// and confirms that without a Stripe call, as the withdrawal does. The name and the reason travel
// only in that statement: the confirmation sent at the confirm carries them, and neither is
// stored. Everything here answers 404 while the subscription rules are off.

import { reconcileForService, reconcileSubscription } from './billing.js';
import { base64UrlDecode, base64UrlEncode, hashKey, hashWithPepper, scopedHmac, timingSafeEqual } from './crypto.js';
import {
  claimSubscriptionCancellation,
  claimSubscriptionCancellationSend,
  getEntitlement,
  getStripeCustomerByAccount,
  getSubscriptionCancellation,
  isCancellationRefundClaimed,
  listUnfinishedCancellationsFor,
  markSubscriptionCancellation,
  releaseSubscriptionCancellationSend,
  selectUnfinishedSubscriptionCancellations,
} from './db.js';
import { sendOperatorAlertEmail, sendRenewalNoticeEmail } from './email.js';
import { cancelCauseTicket, renderCancelContract, renderCancelContractDone, renderCancelContractReview, renderNotFound } from './html.js';
import { forbidden, html, originAllowed } from './index.js';
import { esc, formatPrice, resolvePrimaryAddress } from './renewal-notices.js';
import { cancelEnds, monthsLeftRefund, renewalInvoice, windowNeedsInvoices, withdrawalWindowStart } from './renewed-year.js';
import { loadMenuContext, noStore, requireSignedInSession, signedInHtml, signedInRedirect } from './settings.js';
import {
  cancelSubscriptionNow,
  getSubscription,
  listPaidSubscriptionInvoices,
  refundChargePart,
  scheduleSubscriptionCancel,
  subscriptionPlan,
  subscriptionPurchasedAt,
} from './stripe.js';
import { subscriptionRulesOn } from './subscription-rules.js';
import { acknowledgeSupport, callSupport } from './support-wire.js';
import { WITHDRAWAL_SERVICES } from './withdrawal.js';
import { formatLongDate, formatMomentUtc, withdrawalOn, withdrawalRuleShown } from './withdrawal-rules.js';

export const CANCEL_CONTRACT_PATH = '/billing/cancel-contract';
const BILLING_PATH = '/billing';

// How long the summary page's signed statement stays good for a confirm.
const STATEMENT_TTL_MS = 60 * 60 * 1000;
// A declaration is retried by the schedule for this long.
const RECOVERY_WINDOW_MS = 30 * 86400 * 1000;
// A person is alerted again if a declaration still hasn't landed at Stripe after this long.
const STUCK_AFTER_MS = 48 * 3600 * 1000;
const ALERT_ADDRESS = 'support@solstone.app';
const NAME_MAX = 200;
const REASON_MAX = 2000;
const DAY = 86400;

// Looked up at call time: this module and withdrawal.js import each other's graph.
const bySlug = (slug) => WITHDRAWAL_SERVICES.find((def) => def.slug === slug) || null;
const byService = (service) => WITHDRAWAL_SERVICES.find((def) => def.service === service) || null;

// Where a service page's "cancel contracts here" goes, or '' with the rules off.
export function cancelContractHref(env, slug = '') {
  if (!subscriptionRulesOn(env)) return '';
  return slug ? `${CANCEL_CONTRACT_PATH}?service=${encodeURIComponent(slug)}` : CANCEL_CONTRACT_PATH;
}

// The service pages' old cancel buttons, posted from a page rendered before the rules turned on,
// land on the cancel function instead. null with the rules off: the old route stays as it was.
export function cancelContractRedirect(env, slug) {
  const href = cancelContractHref(env, slug);
  return href ? signedInRedirect(href) : null;
}

// A paid subscription that can be cancelled here, whatever state its cancel is in.
function paidSubscription(entitlement) {
  return entitlement?.source === 'stripe'
    && typeof entitlement.source_ref === 'string'
    && entitlement.source_ref.startsWith('sub_')
    && (entitlement.status === 'active' || entitlement.status === 'past_due');
}

// The last day of service: the day before the boundary stored, or for a cancel that ends today,
// that day.
function lastServiceDay(endsAt, today = false) {
  return formatLongDate(today ? endsAt : endsAt - DAY);
}

// The plan as Stripe has it, or null when it can't be read: a resend then waits for the next pass.
async function readPlan(env, subscriptionRef) {
  try {
    const sub = await getSubscription(env, subscriptionRef);
    return sub?.id === subscriptionRef ? subscriptionPlan(sub) : null;
  } catch {
    console.warn('stripe_plan_read_failed');
    return null;
  }
}

// The one paid subscription a page is for: offered (with its plan, when a cancel would end it, the
// refund in a renewed year, and an open withdrawal window), already set to end (with its date),
// or unavailable when its details didn't load. null when the sign-in has no paid subscription to
// this service.
async function loadChoice(env, accountId, def, nowSeconds) {
  const [entitlement, unfinished] = await Promise.all([
    getEntitlement(env.DB, { accountId, service: def.service }),
    listUnfinishedCancellationsFor(env.DB, { accountId }),
  ]);
  if (!paidSubscription(entitlement)) return null;
  const subscriptionRef = entitlement.source_ref;
  const declared = unfinished.find((row) => row.subscription_ref === subscriptionRef);
  if (declared || entitlement.cancel_at_period_end) {
    // The last day of service, as the confirmation email gives it.
    const endsAt = declared ? declared.ends_at : entitlement.current_period_end;
    return { def, subscriptionRef, offered: false, endDate: lastServiceDay(endsAt, declared?.ends_today === 1) };
  }
  const unavailable = { def, subscriptionRef, offered: false, unavailable: true };
  let sub = null;
  try {
    sub = await getSubscription(env, subscriptionRef);
  } catch {
    console.warn('stripe_plan_read_failed');
  }
  const plan = sub?.id === subscriptionRef ? subscriptionPlan(sub) : null;
  const purchasedAt = subscriptionPurchasedAt(sub);
  if (!plan || purchasedAt == null) return unavailable;
  const ends = cancelEnds(env, sub, nowSeconds);
  if (!Number.isInteger(ends.earliest.endsAt)) return unavailable;
  let invoices = null;
  if (windowNeedsInvoices(env, sub)) {
    try {
      invoices = await listPaidSubscriptionInvoices(env, subscriptionRef);
    } catch {
      console.warn('stripe_invoice_read_failed');
      return unavailable;
    }
  }
  const renewal = ends.renewal != null ? renewalInvoice(invoices || [], ends.renewal) : null;
  // A renewed year whose renewal is unpaid, while Stripe retries it, has paid for nothing past
  // today: it ends today, so a retry that succeeds later can't charge for a year it won't give.
  // Ending the subscription stops Stripe collecting its open invoice.
  const earliest = ends.renewal != null && !renewal
    ? { endsAt: nowSeconds, atPeriodEnd: false, monthsLeft: 0, today: true }
    : ends.earliest;
  // The whole months after the current plan month, refunded on a cancel that ends at its end or
  // today: only in a renewed year, with a paid renewal whose refund no declaration has claimed.
  let refund = null;
  if (renewal && !earliest.atPeriodEnd && earliest.monthsLeft > 0) {
    const amount = monthsLeftRefund(renewal.amount_paid, earliest.monthsLeft);
    if (amount > 0 && !await isCancellationRefundClaimed(env.DB, renewal.id)) {
      refund = { invoiceRef: renewal.id, amount, months: earliest.monthsLeft };
    }
  }
  const windowStart = withdrawalWindowStart(env, sub, invoices);
  return {
    def,
    subscriptionRef,
    offered: true,
    plan,
    purchasedAt,
    earliest,
    periodEnd: ends.periodEnd,
    refund,
    windowAt: windowShown(env, windowStart, nowSeconds) ? windowStart : null,
  };
}

// Whether a withdrawal window is open and its rule may still be stated with its date, as the door
// does.
function windowShown(env, windowAt, nowSeconds) {
  return Number.isInteger(windowAt) && withdrawalOn(env) && withdrawalRuleShown(windowAt, nowSeconds);
}

// What the page shows of an offered subscription, formatted.
function formView(choice) {
  return {
    serviceName: choice.def.name,
    price: formatPrice(choice.plan.unitAmount),
    interval: choice.plan.interval,
    purchaseDate: formatLongDate(choice.purchasedAt),
    earliestDate: lastServiceDay(choice.earliest.endsAt, choice.earliest.today),
    earliestIsPeriodEnd: choice.earliest.atPeriodEnd,
    // When the earliest end is already today, there is no separate "today" to offer.
    earliestToday: Boolean(choice.earliest.today),
    refund: choice.refund ? formatPrice(choice.refund.amount) : null,
    refundMonths: choice.refund?.months ?? null,
    // The year-end option only when there is a month to refund.
    yearEndDate: choice.refund ? lastServiceDay(choice.periodEnd.endsAt) : null,
  };
}

function cleanText(value, max) {
  return (value?.toString() || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function readInput(form) {
  const type = form?.get('type')?.toString() === 'cause' ? 'cause' : 'cancel';
  const end = form?.get('end')?.toString();
  return {
    name: cleanText(form?.get('name'), NAME_MAX),
    slug: form?.get('service')?.toString() || '',
    type,
    reason: type === 'cause' ? cleanText(form?.get('reason'), REASON_MAX) : '',
    end: end === 'period_end' || (end === 'today' && type === 'cause') ? end : 'earliest',
  };
}

const EMPTY_INPUT = { name: '', slug: '', type: 'cancel', reason: '', end: 'earliest' };

// GET shows the page for ?service=. A POST is the summary's "back", which brings back what was
// entered. With no service, or one the sign-in has no paid subscription to, it is the billing page.
export async function handleCancelContractForm(req, env) {
  if (!subscriptionRulesOn(env)) return noStore(html(renderNotFound(), { status: 404 }));
  if (req.method === 'POST' && !originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  let input = { ...EMPTY_INPUT, slug: new URL(req.url).searchParams.get('service') || '' };
  if (req.method === 'POST') {
    const form = await safeForm(req);
    if (!await validCsrf(form, env)) return noStore(forbidden());
    input = readInput(form);
  }
  const def = bySlug(input.slug);
  const choice = def ? await loadChoice(env, guard.session.account_id, def, Math.floor(guard.nowMs / 1000)) : null;
  if (!choice) return signedInRedirect(BILLING_PATH);
  return renderForm(env, guard, choice, input);
}

async function renderForm(env, { session, nowMs }, choice, input, { error = '', focusReason = false } = {}) {
  const accountId = session.account_id;
  const [menu, csrf, primaryEmail] = await Promise.all([
    loadMenuContext(env, accountId, nowMs),
    csrfToken(env),
    resolvePrimaryAddress(env, accountId),
  ]);
  return signedInHtml(renderCancelContract({
    menu, csrf, primaryEmail, choice, view: choice.offered ? formView(choice) : null, input, focusReason, error,
  }));
}

export async function handleCancelContractReview(req, env) {
  if (!subscriptionRulesOn(env)) return noStore(html(renderNotFound(), { status: 404 }));
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const form = await safeForm(req);
  if (!await validCsrf(form, env)) return noStore(forbidden());
  const { session, nowMs } = guard;
  const accountId = session.account_id;
  const nowSeconds = Math.floor(nowMs / 1000);
  const input = readInput(form);
  const def = bySlug(input.slug);
  const choice = def ? await loadChoice(env, accountId, def, nowSeconds) : null;
  if (!choice) return signedInRedirect(BILLING_PATH);
  const primaryEmail = await resolvePrimaryAddress(env, accountId);
  if (!choice.offered || !primaryEmail) return renderForm(env, guard, choice, input, { error: choice.unavailable ? 'unavailable' : '' });
  // A cancel for a serious reason needs its reason: the page comes back with the field focused.
  if (input.type === 'cause' && !input.reason) return renderForm(env, guard, choice, input, { focusReason: true });

  const cause = input.type === 'cause';
  const today = Boolean(choice.earliest.today) || (cause && input.end === 'today');
  const yearEnd = !today && input.end === 'period_end' && choice.refund != null;
  const ends = today
    ? { endsAt: nowSeconds, atPeriodEnd: false }
    : (yearEnd ? choice.periodEnd : choice.earliest);
  const refund = yearEnd ? null : choice.refund;
  const declaration = {
    subscriptionRef: choice.subscriptionRef,
    slug: def.slug,
    name: input.name,
    cause,
    reason: cause ? input.reason : '',
    today,
    planAmount: choice.plan.unitAmount,
    planInterval: choice.plan.interval,
    endsAt: ends.endsAt,
    atPeriodEnd: ends.atPeriodEnd,
    refundInvoiceRef: refund?.invoiceRef ?? null,
    refundAmount: refund?.amount ?? null,
    refundMonths: refund?.months ?? null,
    windowAt: choice.windowAt,
    issuedAt: nowMs,
  };
  const [menu, csrf, statement] = await Promise.all([
    loadMenuContext(env, accountId, nowMs),
    csrfToken(env),
    signStatement(env, accountId, declaration),
  ]);
  return signedInHtml(renderCancelContractReview({
    menu,
    csrf,
    statement,
    input: { ...input, end: today ? 'today' : (yearEnd ? 'period_end' : 'earliest') },
    declaration: summaryView(def, declaration, primaryEmail),
  }));
}

export async function handleCancelContractConfirm(req, env, ctx) {
  if (!subscriptionRulesOn(env)) return noStore(html(renderNotFound(), { status: 404 }));
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const form = await safeForm(req);
  if (!await validCsrf(form, env)) return noStore(forbidden());
  const { session, nowMs } = guard;
  const accountId = session.account_id;

  const statement = await verifyStatement(env, accountId, form.get('statement')?.toString() || '', nowMs);
  const def = statement ? bySlug(statement.slug) : null;
  if (!statement || !def) return signedInRedirect(CANCEL_CONTRACT_PATH);

  // A second press of the same summary finds the first declaration.
  let record = await getSubscriptionCancellation(env.DB, { subscriptionRef: statement.subscriptionRef, issuedAt: statement.issuedAt });
  if (record && record.account_id !== accountId) return signedInRedirect(CANCEL_CONTRACT_PATH);
  if (!record) {
    // Checked against what we hold, with no Stripe call, so an outage still records the cancel: the
    // subscription is still this service's, has no cancel pending, and the end has not passed.
    const [entitlement, unfinished] = await Promise.all([
      getEntitlement(env.DB, { accountId, service: def.service }),
      listUnfinishedCancellationsFor(env.DB, { accountId }),
    ]);
    if (!paidSubscription(entitlement) || entitlement.source_ref !== statement.subscriptionRef || entitlement.cancel_at_period_end
      || unfinished.some((row) => row.subscription_ref === statement.subscriptionRef)
      || (!statement.today && !statement.atPeriodEnd && statement.endsAt <= Math.floor(nowMs / 1000))) {
      return signedInRedirect(`${CANCEL_CONTRACT_PATH}?service=${def.slug}`);
    }
    // Recorded from what the summary showed, with no Stripe call, and without the name or reason.
    record = await claimSubscriptionCancellation(env.DB, {
      subscriptionRef: statement.subscriptionRef,
      issuedAt: statement.issuedAt,
      accountId,
      service: def.service,
      cause: statement.cause,
      endsToday: statement.today,
      endsAt: statement.endsAt,
      atPeriodEnd: statement.atPeriodEnd,
      refundInvoiceRef: statement.refundInvoiceRef,
      refundAmount: statement.refundAmount,
      refundMonths: statement.refundMonths,
      windowAt: statement.windowAt,
      nowMs,
    });
    if (!record || record.account_id !== accountId) return signedInRedirect(CANCEL_CONTRACT_PATH);
    await logCancellation(env, 'cancellation_recorded', record);
  }

  const outcome = await completeCancellation(env, ctx, record, { nowMs, statement });
  const [menu, email] = await Promise.all([loadMenuContext(env, accountId, nowMs), resolvePrimaryAddress(env, accountId)]);
  return signedInHtml(renderCancelContractDone({
    menu,
    // The summary line again, as recorded: a refund another declaration claimed first is not shown.
    declaration: {
      ...summaryView(def, { ...statement, refundAmount: record.refund_amount }, email || ''),
      submitted: formatMomentUtc(Math.floor(record.submitted_at / 1000)),
    },
    emailed: outcome.acknowledged,
    backHref: def.path,
  }));
}

// The summary line's values: what the summary and the done page show, and the support request
// carries.
function summaryView(def, d, email) {
  return {
    serviceName: def.name,
    price: formatPrice(d.planAmount),
    interval: d.planInterval,
    reason: d.cause ? d.reason : null,
    endDate: lastServiceDay(d.endsAt, d.today),
    refund: d.refundAmount ? formatPrice(d.refundAmount) : null,
    email,
  };
}

// Finishes a recorded declaration, as far as it has not got yet. Safe to run again at any point:
// the email is claimed before it is sent, setting the same end at Stripe again changes nothing,
// and the refund is marked once made and carries an idempotency key naming its invoice. At the
// confirm, `statement` carries the name and reason for the email and a cancel for a serious
// reason's support request.
export async function completeCancellation(env, ctx, record, { nowMs = Date.now(), statement = null } = {}) {
  const def = byService(record.service);
  if (!def) return { completed: false, acknowledged: false };
  const subscriptionRef = record.subscription_ref;
  const key = { subscriptionRef, issuedAt: record.issued_at };
  const endsToday = record.ends_today === 1;

  // 1 · the confirmation email, from the record and, at the confirm, the statement.
  let acknowledged = record.acknowledged_at != null;
  if (!acknowledged) acknowledged = await sendConfirmation(env, record, def, nowMs, statement);

  // 2 · a cancel for a serious reason: its reason goes to support. Tried on every press of the
  // summary, since only the statement carries the reason; the request's key opens it once.
  if (record.cause === 1 && statement?.reason) await openCauseTicket(env, record, def, statement);

  // 3 · a cancel that ends today ends the service now, as a withdrawal does; then the end at
  // Stripe, then the refund of the whole months left, checked against Stripe first.
  if (record.completed_at == null) {
    try {
      if (endsToday) await lapseEntitlement(env, ctx, record, def, nowMs);
      const sub = await getSubscription(env, subscriptionRef);
      const customer = await getStripeCustomerByAccount(env.DB, { accountId: record.account_id });
      if (sub?.id !== subscriptionRef || !customer || sub.customer !== customer.stripe_customer_id || sub.metadata?.service !== def.tag) {
        const error = new Error('cancellation subscription does not match the sign-in');
        error.code = 'cancellation_mismatch';
        throw error;
      }
      if (sub.status !== 'canceled') {
        const updated = endsToday
          ? await cancelSubscriptionNow(env, subscriptionRef, { idempotencyKey: `cancel-today-${subscriptionRef}` })
          : await scheduleSubscriptionCancel(env, subscriptionRef, { atPeriodEnd: record.at_period_end === 1, cancelAt: record.ends_at });
        // The pages show the cancel at once, rather than when Stripe's event arrives.
        const entitlement = await getEntitlement(env.DB, { accountId: record.account_id, service: record.service });
        if (entitlement?.source_ref === subscriptionRef && updated?.id === subscriptionRef) {
          await reconcileSubscription(env, record.account_id, updated, nowMs, ctx);
        }
      }
      if (record.refund_invoice_ref && record.refunded_at == null) {
        const invoices = await listPaidSubscriptionInvoices(env, subscriptionRef);
        const invoice = invoices.find((candidate) => candidate?.id === record.refund_invoice_ref);
        if (typeof invoice?.charge !== 'string' || !invoice.charge) {
          const error = new Error('cancellation refund has no charge');
          error.code = 'cancellation_no_charge';
          throw error;
        }
        await refundChargePart(env, { chargeId: invoice.charge, amount: record.refund_amount, invoiceId: invoice.id });
        await markSubscriptionCancellation(env.DB, { ...key, column: 'refunded_at', nowMs });
      }
    } catch (error) {
      const detail = { status: error?.status ?? null, code: error?.code ?? null };
      await logCancellation(env, 'cancellation_finish_failed', record, detail);
      await alertPerson(env, record, 'failure_alerted_at', detail, nowMs);
      if (nowMs - record.submitted_at >= STUCK_AFTER_MS) await alertPerson(env, record, 'stuck_alerted_at', detail, nowMs);
      return { completed: false, acknowledged };
    }
    await markSubscriptionCancellation(env.DB, { ...key, column: 'completed_at', nowMs });
    await logCancellation(env, 'cancellation_completed', record);
  }
  return { completed: true, acknowledged };
}

// The entitlement lapses through the same reconciler the subscription-deleted webhook runs, and
// only while it is still this subscription's.
async function lapseEntitlement(env, ctx, record, def, nowMs) {
  const entitlement = await getEntitlement(env.DB, { accountId: record.account_id, service: record.service });
  if (entitlement?.source !== 'stripe' || entitlement.source_ref !== record.subscription_ref) return;
  if (entitlement.status !== 'active' && entitlement.status !== 'past_due') return;
  await reconcileForService(def.tag, env, record.account_id, nowMs, ctx, { paid: null });
}

// Opens a support request from the owner's own sign-in, carrying the type and the summary line
// with the reason. The reason is in no row: if the request can't be opened, a person is told, with
// nothing about the owner, so they can ask for it.
async function openCauseTicket(env, record, def, statement) {
  const email = await resolvePrimaryAddress(env, record.account_id);
  const options = {
    ownerId: record.account_id,
    idempotencyKey: await scopedHmac(`${record.subscription_ref}:${record.issued_at}`, env.HMAC_PEPPER, 'cancel-cause-ticket'),
    mutation: 'ticket.create',
    path: '/api/services/tickets',
    verifiedEmail: email || undefined,
    json: { product: 'general', ...cancelCauseTicket(summaryView(def, { ...statement, refundAmount: record.refund_amount }, email || '')) },
  };
  const result = email ? await callSupport(env, { method: 'POST', ...options }) : { classification: 'no_email' };
  if (result.classification === 'success') {
    if (result.acknowledgeable) await acknowledgeSupport(env, options);
    await logCancellation(env, 'cancellation_ticket_opened', record);
    return;
  }
  // Opened and acknowledged by an earlier press.
  if (result.classification === 'operationRetired') return;
  await logCancellation(env, 'cancellation_ticket_failed', record, { classification: result.classification ?? null });
  const subject = `a cancellation for a serious reason did not reach support: ${def.name}`;
  const text = [
    `a ${def.name} cancellation for a serious reason has been recorded, and opening its support request has not gone through.`,
    "the reason is only in the owner's confirmation email; it is never stored. this mail carries nothing about the owner, so find the cancellation with this lookup, run from solstone.app/account, and write to the owner at the Stripe customer's email to ask for it:",
    'npx wrangler d1 execute account-portal --remote --command "'
      + 'SELECT c.subscription_ref, c.issued_at, c.submitted_at, s.stripe_customer_id '
      + 'FROM subscription_cancellations c LEFT JOIN stripe_customers s ON s.account_id = c.account_id '
      + `WHERE c.cause = 1 AND c.service = '${def.service}' ORDER BY c.submitted_at DESC LIMIT 5"`,
  ].join('\n\n');
  try {
    await sendOperatorAlertEmail({ env, address: ALERT_ADDRESS, subject, text, html: `<pre>${text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre>` });
  } catch {
    await logCancellation(env, 'cancellation_alert_send_failed', record);
  }
}

async function sendConfirmation(env, record, def, nowMs, statement) {
  const key = { subscriptionRef: record.subscription_ref, issuedAt: record.issued_at };
  const email = await resolvePrimaryAddress(env, record.account_id);
  if (!email) {
    await logCancellation(env, 'cancellation_email_skipped', record, { reason: 'no_email' });
    return false;
  }
  // The plan the summary showed or, on a resend, the plan as Stripe has it; the row keeps no price.
  const plan = statement ? { unitAmount: statement.planAmount, interval: statement.planInterval } : await readPlan(env, record.subscription_ref);
  if (!plan) {
    await logCancellation(env, 'cancellation_email_skipped', record, { reason: 'no_plan' });
    return false;
  }
  const rendered = renderCancellationEmail(emailView(env, record, def, email, statement, plan, nowMs));
  if (!await claimSubscriptionCancellationSend(env.DB, { ...key, column: 'acknowledged_at', nowMs })) return true;
  try {
    await sendRenewalNoticeEmail({ env, address: email, ...rendered });
  } catch {
    await releaseSubscriptionCancellationSend(env.DB, { ...key, column: 'acknowledged_at', nowMs });
    await logCancellation(env, 'cancellation_email_send_failed', record);
    return false;
  }
  await logCancellation(env, 'cancellation_email_sent', record);
  return true;
}

// The email's values. The name and the reason come only from the statement, so a resend from the
// schedule has neither. The withdrawal line shows only while that window is open and the cancel
// leaves the service running.
function emailView(env, record, def, email, statement, plan, nowMs) {
  const endsToday = record.ends_today === 1;
  const windowAt = !endsToday && windowShown(env, record.window_at, Math.floor(nowMs / 1000)) ? record.window_at : null;
  return {
    service: def.service,
    serviceName: def.name,
    endsToday,
    name: statement?.name || '',
    cause: record.cause === 1,
    reason: record.cause === 1 ? (statement?.reason || '') : '',
    email,
    price: formatPrice(plan.unitAmount),
    interval: plan.interval,
    endDate: lastServiceDay(record.ends_at, endsToday),
    refund: record.refund_amount ? formatPrice(record.refund_amount) : null,
    refundMonths: record.refund_months,
    windowDate: windowAt != null ? formatLongDate(windowAt) : '',
    submitted: formatMomentUtc(Math.floor(record.submitted_at / 1000)),
  };
}

// The confirmation email, in the approved wording. Each paragraph is a list of parts: plain text,
// or { b } bold, or { i } italic (quoted in the text part); branches that don't apply are left out.
const EMAIL_WORDS = {
  subject: (v) => `your ${v.serviceName} subscription ends on ${v.endDate}`,
  heading: (v) => `${v.serviceName} ends on ${v.endDate}`,
  lead: "we received your cancellation. keep this email: it's your record of it.",
  sent: (v) => [
    { b: 'what you sent us.' },
    ` a cancellation of your ${v.serviceName} subscription (${v.price} every ${v.interval}), to end on ${v.endDate}.`,
    v.reason ? ` you gave a serious reason: "${v.reason}".` : '',
  ],
  from: (v) => [
    { b: 'from.' },
    ` ${v.name ? `${v.name}, ` : ''}${v.email}, the address you're signed in with. this confirmation goes there.`,
  ],
  received: (v) => [{ b: 'received.' }, ` ${v.submitted}.`],
  now: (v) => [
    { b: 'what happens now.' },
    v.endsToday ? ` ${v.serviceName} stopped when you canceled, and it won't renew.` : ` ${v.serviceName} keeps working until ${v.endDate}, then stops, and it won't renew.`,
    v.refund ? ` we're refunding ${v.refund} for the ${v.refundMonths} whole ${v.refundMonths === 1 ? 'month' : 'months'} left, the same way you paid, within 14 days.` : '',
    v.cause ? " we'll answer your reason, and whether we refund more." : '',
    ...(v.windowDate ? [` you can still withdraw for a full refund until the end of the 14th day after ${v.windowDate}, with `, { i: 'withdraw from contract here' }, '.'] : []),
    v.service === 'spb_hosted' ? ' after it stops, we keep your encrypted backup copy for 30 days, then delete it for good. if you offloaded media into it, that copy is the only one, and subscribing again within those 30 days is the way to keep it.' : '',
    v.service === 'sme_hosted' ? ' your solstone.me address stays reserved for you, and subscribing again gives you the same one.' : '',
  ],
  changed: 'changed your mind? subscribe again anytime from services.solstone.app.',
  questions: 'questions: support@solstone.app.',
  signoff: 'sol pbc',
};

// Plain text has no italic, so an italic label is quoted there instead.
const partText = (part) => (typeof part === 'string' ? part : part.b ?? `"${part.i}"`);
const partHtml = (part) => (typeof part === 'string' ? esc(part) : part.b != null ? `<strong>${esc(part.b)}</strong>` : `<em>${esc(part.i)}</em>`);

export function renderCancellationEmail(v) {
  const heading = EMAIL_WORDS.heading(v);
  const paragraphs = [
    [EMAIL_WORDS.lead],
    EMAIL_WORDS.sent(v),
    EMAIL_WORDS.from(v),
    EMAIL_WORDS.received(v),
    EMAIL_WORDS.now(v),
    [EMAIL_WORDS.changed],
    [EMAIL_WORDS.questions],
    [EMAIL_WORDS.signoff],
  ].map((parts) => parts.filter((part) => part !== ''));
  const text = [heading, ...paragraphs.map((parts) => parts.map(partText).join(''))].join('\n\n');
  const htmlBody = `<!DOCTYPE html>
<html><body style="font-family: system-ui, -apple-system, sans-serif; color: #222; max-width: 520px; margin: 0 auto; padding: 24px;">
  <p style="font-size: 26px; font-weight: 700; line-height: 1.25; color: #1A1A1A; background: #FBEFDD; padding: 16px 20px; border-radius: 8px; margin: 0 0 20px;">${esc(heading)}</p>
  ${paragraphs.map((parts) => `<p>${parts.map(partHtml).join('')}</p>`).join('\n  ')}
</body></html>`;
  return { subject: EMAIL_WORDS.subject(v), text, html: htmlBody };
}

// A declaration that could not be finished at Stripe reaches a person: once at its first failed
// finish, and once more after 48 hours. Like the withdrawal's, the mail carries only the service
// and the error code, nothing about the owner, and the lookup that finds the row instead.
function cancellationLookupCommand(service) {
  return 'npx wrangler d1 execute account-portal --remote --command "'
    + 'SELECT c.subscription_ref, c.issued_at, c.ends_at, c.at_period_end, c.ends_today, c.refund_invoice_ref, c.refund_amount, c.refunded_at, c.submitted_at, s.stripe_customer_id '
    + 'FROM subscription_cancellations c LEFT JOIN stripe_customers s ON s.account_id = c.account_id '
    + `WHERE c.completed_at IS NULL AND c.service = '${service}' ORDER BY c.submitted_at"`;
}

async function alertPerson(env, record, column, detail, nowMs) {
  const key = { subscriptionRef: record.subscription_ref, issuedAt: record.issued_at };
  if (!await claimSubscriptionCancellationSend(env.DB, { ...key, column, nowMs })) return;
  const serviceName = byService(record.service).name;
  const stuck = column === 'stuck_alerted_at';
  const subject = stuck
    ? `a cancellation is still not at Stripe after 48 hours: ${serviceName}`
    : `a cancellation needs a person: ${serviceName}`;
  const text = [
    `a ${serviceName} cancellation has been recorded, and setting its end at Stripe, or refunding the months it leaves, has not gone through.`,
    `last error: ${detail.code || detail.status || 'unknown'}`,
    'the owner has their confirmation, which names the end date. the schedule retries every 15 minutes, for 30 days. this mail carries nothing about the owner, so find the cancellation with this lookup, run from solstone.app/account:',
    cancellationLookupCommand(record.service),
    [
      'each row is an unfinished cancellation of this service. ends_at is in seconds; the other times are in milliseconds. for each row:',
      "1. open the row's subscription_ref in the Stripe Dashboard, and check that the subscription's customer is the row's stripe_customer_id. if it isn't, or the last error is cancellation_mismatch, change nothing until you know why.",
      '2. otherwise, if the schedule keeps failing: if ends_today is 1, cancel the subscription now, with no proration. if at_period_end is 1, set it to cancel at the end of its period. otherwise, set it to cancel at ends_at, with no proration.',
      "3. if refund_invoice_ref is set and refunded_at is empty, open that invoice's payment in the Stripe Dashboard first. whatever it shows, mark the row refunded, so the schedule never refunds it again, with the same wrangler command running: UPDATE subscription_cancellations SET refunded_at = <now, in milliseconds> WHERE subscription_ref = '<subscription_ref>' AND issued_at = <issued_at>. if the payment already shows a refund, stop there: only mark the row. otherwise refund refund_amount cents, once, on that payment.",
      "4. the schedule then finds the end already set and marks the row finished on its next pass. if it is still unfinished an hour later, or is more than 30 days old, finish it by hand: UPDATE subscription_cancellations SET completed_at = <now, in milliseconds> WHERE subscription_ref = '<subscription_ref>' AND issued_at = <issued_at>",
    ].join('\n'),
  ].join('\n\n');
  try {
    await sendOperatorAlertEmail({ env, address: ALERT_ADDRESS, subject, text, html: `<pre>${text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre>` });
    await logCancellation(env, stuck ? 'cancellation_stuck_alerted' : 'cancellation_failure_alerted', record);
  } catch {
    await releaseSubscriptionCancellationSend(env.DB, { ...key, column, nowMs });
    await logCancellation(env, 'cancellation_alert_send_failed', record);
  }
}

// Scheduled: finishes any declaration a failed Stripe call or email send left unfinished. Rows exist
// only once the rules have been on, so with them off this reads an empty set and does nothing.
export async function runCancellationRecovery(env, ctx, nowMs = Date.now()) {
  const rows = await selectUnfinishedSubscriptionCancellations(env.DB, { submittedAfterMs: nowMs - RECOVERY_WINDOW_MS });
  for (const row of rows) {
    try {
      await completeCancellation(env, ctx, row, { nowMs });
    } catch {
      await logCancellation(env, 'cancellation_recovery_failed', row);
    }
  }
}

// The summary page's statement of what it showed, signed to this sign-in so the confirm can
// record it without asking Stripe again. It alone carries the name and the reason.
async function signStatement(env, accountId, d) {
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
    s: d.subscriptionRef,
    v: d.slug,
    n: d.name,
    c: d.cause ? 1 : 0,
    q: d.reason,
    d: d.today ? 1 : 0,
    a: d.planAmount,
    l: d.planInterval,
    x: d.endsAt,
    p: d.atPeriodEnd ? 1 : 0,
    i: d.refundInvoiceRef,
    r: d.refundAmount,
    m: d.refundMonths,
    w: d.windowAt,
    t: d.issuedAt,
  })));
  return `${payload}.${await scopedHmac(payload, env.HMAC_PEPPER, `cancel-statement:${accountId}`)}`;
}

async function verifyStatement(env, accountId, value, nowMs) {
  const [payload, signature, extra] = value.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  const expected = await scopedHmac(payload, env.HMAC_PEPPER, `cancel-statement:${accountId}`);
  if (!timingSafeEqual(signature, expected)) return null;
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
  } catch {
    return null;
  }
  const { s, v, n, c, q, d, a, l, x, p, i, r, m, w, t } = parsed || {};
  if (typeof s !== 'string' || !s.startsWith('sub_') || typeof v !== 'string' || typeof n !== 'string') return null;
  if ((c !== 0 && c !== 1) || typeof q !== 'string' || (c === 1 && !q) || (d !== 0 && d !== 1)) return null;
  if (!Number.isInteger(a) || a <= 0 || (l !== 'year' && l !== 'month')) return null;
  if (!Number.isInteger(x) || (p !== 0 && p !== 1)) return null;
  if (i !== null && !(typeof i === 'string' && i.startsWith('in_') && Number.isInteger(r) && r > 0 && Number.isInteger(m) && m >= 1 && m <= 11)) return null;
  if (w !== null && !Number.isInteger(w)) return null;
  if (!Number.isInteger(t) || nowMs - t > STATEMENT_TTL_MS || t > nowMs + 60_000) return null;
  return {
    subscriptionRef: s,
    slug: v,
    name: n,
    cause: c === 1,
    reason: c === 1 ? q : '',
    today: d === 1,
    planAmount: a,
    planInterval: l,
    endsAt: x,
    atPeriodEnd: p === 1,
    refundInvoiceRef: i,
    refundAmount: i ? r : null,
    refundMonths: i ? m : null,
    windowAt: w,
    issuedAt: t,
  };
}

// A peppered account reference, never the raw id: console lines are Logpush-retained.
async function logCancellation(env, event, record, extra = {}) {
  const line = JSON.stringify({
    event,
    account_ref: await hashWithPepper(`hub:account:${record.account_id}`, env),
    service: record.service,
    ...extra,
    ts: Date.now(),
  });
  if (event.endsWith('_failed')) console.error(line);
  else console.warn(line);
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
