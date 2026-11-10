// The cancel function: one page, reachable from every paid service's page and the billing page,
// where the owner gives their name, confirms their email, picks the subscription and when it
// ends, checks a summary, and presses one cancel button. Then, in this order, the declaration is
// recorded, its confirmation is emailed, and Stripe is told; none of it waits on the step after.
// The Stripe change, and in a renewed annual year the refund of the whole months left, retry on
// the schedule until they land, and one that cannot be finished reaches a person.
//
// The summary page carries a signed statement of exactly what it showed, so the confirm records
// and confirms that without a Stripe call, as the withdrawal does. Everything here answers 404
// while the subscription rules are off.

import { reconcileSubscription } from './billing.js';
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
import { renderCancelContract, renderCancelContractDone, renderCancelContractReview, renderNotFound } from './html.js';
import { forbidden, html, originAllowed } from './index.js';
import { esc, formatPrice, resolvePrimaryAddress } from './renewal-notices.js';
import { cancelEnds, monthsLeftRefund, renewalInvoice } from './renewed-year.js';
import { loadMenuContext, noStore, requireSignedInSession, signedInHtml, signedInRedirect } from './settings.js';
import {
  getSubscription,
  listPaidSubscriptionInvoices,
  refundChargePart,
  scheduleSubscriptionCancel,
} from './stripe.js';
import { subscriptionRulesOn } from './subscription-rules.js';
import { WITHDRAWAL_SERVICES } from './withdrawal.js';
import { formatMomentUtc } from './withdrawal-rules.js';

export const CANCEL_CONTRACT_PATH = '/billing/cancel-contract';

// How long the summary page's signed statement stays good for a confirm.
const STATEMENT_TTL_MS = 60 * 60 * 1000;
// A declaration is retried by the schedule for this long.
const RECOVERY_WINDOW_MS = 30 * 86400 * 1000;
// A person is alerted again if a declaration still hasn't landed at Stripe after this long.
const STUCK_AFTER_MS = 48 * 3600 * 1000;
const ALERT_ADDRESS = 'support@solstone.app';
const NAME_MAX = 200;

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

// The account's paid subscriptions, each either offered (with when it would end) or already set to
// end (with its date). `onlySlug` limits the Stripe reads to one.
async function loadChoices(env, accountId, nowSeconds, onlySlug = '') {
  const [entitlements, unfinished] = await Promise.all([
    Promise.all(WITHDRAWAL_SERVICES.map((def) => getEntitlement(env.DB, { accountId, service: def.service }))),
    listUnfinishedCancellationsFor(env.DB, { accountId }),
  ]);
  const choices = await Promise.all(WITHDRAWAL_SERVICES.map(async (def, index) => {
    const entitlement = entitlements[index];
    if (!paidSubscription(entitlement) || (onlySlug && def.slug !== onlySlug)) return null;
    const subscriptionRef = entitlement.source_ref;
    const declared = unfinished.find((row) => row.subscription_ref === subscriptionRef);
    if (declared || entitlement.cancel_at_period_end) {
      return { def, subscriptionRef, offered: false, endsAt: declared ? declared.ends_at : entitlement.current_period_end };
    }
    let sub = null;
    try {
      sub = await getSubscription(env, subscriptionRef);
    } catch {
      console.warn('stripe_plan_read_failed');
    }
    if (sub?.id !== subscriptionRef) return { def, subscriptionRef, offered: false, unavailable: true };
    return { def, subscriptionRef, offered: true, ...cancelEnds(env, sub, nowSeconds) };
  }));
  return choices.filter(Boolean);
}

function readInput(form) {
  const name = (form?.get('name')?.toString() || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, NAME_MAX);
  return {
    name,
    slug: form?.get('service')?.toString() || '',
    end: form?.get('end')?.toString() === 'period_end' ? 'period_end' : 'earliest',
  };
}

// GET shows the form, preselecting ?service=. A POST is the summary's "change something", which
// brings back what was entered.
export async function handleCancelContractForm(req, env) {
  if (!subscriptionRulesOn(env)) return noStore(html(renderNotFound(), { status: 404 }));
  let input = { name: '', slug: new URL(req.url).searchParams.get('service') || '', end: 'earliest' };
  if (req.method === 'POST') {
    if (!originAllowed(req)) return noStore(forbidden());
  }
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  if (req.method === 'POST') {
    const form = await safeForm(req);
    if (!await validCsrf(form, env)) return noStore(forbidden());
    input = readInput(form);
  }
  return renderForm(env, guard, input);
}

async function renderForm(env, { session, nowMs }, input, error = '') {
  const accountId = session.account_id;
  const [menu, csrf, primaryEmail, choices] = await Promise.all([
    loadMenuContext(env, accountId, nowMs),
    csrfToken(env),
    resolvePrimaryAddress(env, accountId),
    loadChoices(env, accountId, Math.floor(nowMs / 1000)),
  ]);
  return signedInHtml(renderCancelContract({ menu, csrf, primaryEmail, choices, input, error }));
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
  const input = readInput(form);
  const def = bySlug(input.slug);
  const [choice] = def ? await loadChoices(env, accountId, Math.floor(nowMs / 1000), def.slug) : [];
  const primaryEmail = await resolvePrimaryAddress(env, accountId);
  if (!input.name) return renderForm(env, guard, input, 'name');
  if (!choice?.offered) return renderForm(env, guard, input, choice?.unavailable ? 'unavailable' : 'subscription');
  if (!primaryEmail) return renderForm(env, guard, input);

  const ends = input.end === 'period_end' ? choice.periodEnd : choice.earliest;
  let refund = null;
  if (!ends.atPeriodEnd && ends.monthsLeft > 0) {
    let invoices;
    try {
      invoices = await listPaidSubscriptionInvoices(env, choice.subscriptionRef);
    } catch {
      return renderForm(env, guard, input, 'unavailable');
    }
    const invoice = renewalInvoice(invoices, choice.renewal);
    const amount = invoice ? monthsLeftRefund(invoice.amount_paid, ends.monthsLeft) : 0;
    if (amount > 0 && !await isCancellationRefundClaimed(env.DB, invoice.id)) refund = { invoiceRef: invoice.id, amount };
  }
  const declaration = {
    subscriptionRef: choice.subscriptionRef,
    slug: def.slug,
    name: input.name,
    end: input.end,
    endsAt: ends.endsAt,
    atPeriodEnd: ends.atPeriodEnd,
    refundInvoiceRef: refund?.invoiceRef ?? null,
    refundAmount: refund?.amount ?? null,
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
    input,
    declaration: { ...declarationView(def, declaration), email: primaryEmail },
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
      || (!statement.atPeriodEnd && statement.endsAt <= Math.floor(nowMs / 1000))) {
      return signedInRedirect(`${CANCEL_CONTRACT_PATH}?service=${def.slug}`);
    }
    // Recorded from what the summary showed, with no Stripe call.
    record = await claimSubscriptionCancellation(env.DB, {
      subscriptionRef: statement.subscriptionRef,
      issuedAt: statement.issuedAt,
      accountId,
      service: def.service,
      name: statement.name,
      endsAt: statement.endsAt,
      atPeriodEnd: statement.atPeriodEnd,
      refundInvoiceRef: statement.refundInvoiceRef,
      refundAmount: statement.refundAmount,
      nowMs,
    });
    if (!record || record.account_id !== accountId) return signedInRedirect(CANCEL_CONTRACT_PATH);
    await logCancellation(env, 'cancellation_recorded', record);
  }

  const outcome = await completeCancellation(env, ctx, record, { nowMs });
  const [menu, email] = await Promise.all([loadMenuContext(env, accountId, nowMs), resolvePrimaryAddress(env, accountId)]);
  return signedInHtml(renderCancelContractDone({
    menu,
    declaration: { ...declarationView(def, rowDeclaration(record)), email, submittedAt: record.submitted_at },
    emailed: outcome.acknowledged,
  }));
}

function rowDeclaration(row) {
  return {
    name: row.name,
    endsAt: row.ends_at,
    atPeriodEnd: row.at_period_end === 1,
    refundAmount: row.refund_amount,
  };
}

// What the summary, the done page and the email show of a declaration.
function declarationView(def, declaration) {
  return {
    serviceName: def.name,
    name: declaration.name,
    endsAt: declaration.endsAt,
    atPeriodEnd: declaration.atPeriodEnd,
    refundAmount: declaration.refundAmount ?? null,
  };
}

// Finishes a recorded declaration, as far as it has not got yet. Safe to run again at any point:
// the email is claimed before it is sent, setting the same end at Stripe again changes nothing,
// and the refund is marked once made and carries an idempotency key naming its invoice.
export async function completeCancellation(env, ctx, record, { nowMs = Date.now() } = {}) {
  const def = byService(record.service);
  if (!def) return { completed: false, acknowledged: false };
  const subscriptionRef = record.subscription_ref;
  const key = { subscriptionRef, issuedAt: record.issued_at };

  // 1 · the confirmation email, from the record alone.
  let acknowledged = record.acknowledged_at != null;
  if (!acknowledged) acknowledged = await sendConfirmation(env, record, def, nowMs);

  // 2 · the end at Stripe, then the refund of the whole months left, checked against Stripe first.
  if (record.completed_at == null) {
    try {
      const sub = await getSubscription(env, subscriptionRef);
      const customer = await getStripeCustomerByAccount(env.DB, { accountId: record.account_id });
      if (sub?.id !== subscriptionRef || !customer || sub.customer !== customer.stripe_customer_id || sub.metadata?.service !== def.tag) {
        const error = new Error('cancellation subscription does not match the sign-in');
        error.code = 'cancellation_mismatch';
        throw error;
      }
      if (sub.status !== 'canceled') {
        const updated = await scheduleSubscriptionCancel(env, subscriptionRef, { atPeriodEnd: record.at_period_end === 1, cancelAt: record.ends_at });
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

async function sendConfirmation(env, record, def, nowMs) {
  const key = { subscriptionRef: record.subscription_ref, issuedAt: record.issued_at };
  const email = await resolvePrimaryAddress(env, record.account_id);
  if (!email) {
    await logCancellation(env, 'cancellation_email_skipped', record, { reason: 'no_email' });
    return false;
  }
  const rendered = renderCancellationEmail({ ...declarationView(def, rowDeclaration(record)), email, submittedAt: record.submitted_at });
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

// PLACEHOLDER pending the approved wording: the confirmation email. Its subject and its first,
// largest line are the end date; then what the owner sent and when we received it.
const EMAIL_WORDS = {
  subject: (service, end) => `your ${service} subscription ends on ${end}`,
  headline: (service, end) => `${service} ends on ${end}.`,
  lead: "we received your cancellation. keep this email: it's your record of it.",
  sent: 'what you sent us',
  name: 'name',
  email: 'email',
  subscription: 'subscription',
  when: 'when it ends',
  earliest: 'at the earliest possible date',
  periodEnd: 'at the end of the paid period',
  refund: 'refund',
  refundLine: (amount) => `${amount} for the whole months after the one you're in, to the card you paid with, within 14 days`,
  received: 'we received it',
  closing: 'questions: support@solstone.app.',
};

export function renderCancellationEmail({ serviceName, name, email, endsAt, atPeriodEnd, refundAmount, submittedAt }) {
  const end = formatMomentUtc(endsAt);
  const rows = [
    [EMAIL_WORDS.name, name],
    [EMAIL_WORDS.email, email],
    [EMAIL_WORDS.subscription, serviceName],
    [EMAIL_WORDS.when, `${atPeriodEnd ? EMAIL_WORDS.periodEnd : EMAIL_WORDS.earliest}: ${end}`],
    ...(refundAmount ? [[EMAIL_WORDS.refund, EMAIL_WORDS.refundLine(formatPrice(refundAmount))]] : []),
    [EMAIL_WORDS.received, formatMomentUtc(Math.floor(submittedAt / 1000))],
  ];
  const headline = EMAIL_WORDS.headline(serviceName, end);
  const text = [
    headline,
    EMAIL_WORDS.lead,
    `${EMAIL_WORDS.sent}:\n${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}`,
    EMAIL_WORDS.closing,
    'sol pbc',
  ].join('\n\n');
  const htmlBody = `<!DOCTYPE html>
<html><body style="font-family: system-ui, -apple-system, sans-serif; color: #222; max-width: 520px; margin: 0 auto; padding: 24px;">
  <p style="font-size: 26px; font-weight: 700; line-height: 1.25; color: #1A1A1A; background: #FBEFDD; padding: 16px 20px; border-radius: 8px; margin: 0 0 20px;">${esc(headline)}</p>
  <p>${esc(EMAIL_WORDS.lead)}</p>
  <p><strong>${esc(EMAIL_WORDS.sent)}</strong></p>
  <p>${rows.map(([label, value]) => `${esc(label)}: ${esc(value)}`).join('<br>')}</p>
  <p>${esc(EMAIL_WORDS.closing)}</p>
  <p>sol pbc</p>
</body></html>`;
  return { subject: EMAIL_WORDS.subject(serviceName, end), text, html: htmlBody };
}

// A declaration that could not be finished at Stripe reaches a person: once at its first failed
// finish, and once more after 48 hours. Like the withdrawal's, the mail carries only the service
// and the error code, nothing about the owner, and the lookup that finds the row instead.
function cancellationLookupCommand(service) {
  return 'npx wrangler d1 execute account-portal --remote --command "'
    + 'SELECT c.subscription_ref, c.issued_at, c.ends_at, c.at_period_end, c.refund_invoice_ref, c.refund_amount, c.refunded_at, c.submitted_at, s.stripe_customer_id '
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
      '2. otherwise, if the schedule keeps failing: if at_period_end is 1, set the subscription to cancel at the end of its period. if it is 0, set it to cancel at ends_at, with no proration.',
      "3. if refund_invoice_ref is set and refunded_at is empty, first mark it refunded, so the schedule never refunds it again, with the same wrangler command running: UPDATE subscription_cancellations SET refunded_at = <now, in milliseconds> WHERE subscription_ref = '<subscription_ref>' AND issued_at = <issued_at>. then refund refund_amount cents, once, on that invoice's payment in the Stripe Dashboard.",
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
// record it without asking Stripe again.
async function signStatement(env, accountId, d) {
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
    s: d.subscriptionRef, v: d.slug, n: d.name, x: d.endsAt, p: d.atPeriodEnd ? 1 : 0, i: d.refundInvoiceRef, r: d.refundAmount, t: d.issuedAt,
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
  const { s, v, n, x, p, i, r, t } = parsed || {};
  if (typeof s !== 'string' || !s.startsWith('sub_') || typeof v !== 'string' || typeof n !== 'string' || !n) return null;
  if (!Number.isInteger(x) || (p !== 0 && p !== 1)) return null;
  if (i !== null && !(typeof i === 'string' && i.startsWith('in_') && Number.isInteger(r) && r > 0)) return null;
  if (!Number.isInteger(t) || nowMs - t > STATEMENT_TTL_MS || t > nowMs + 60_000) return null;
  return { subscriptionRef: s, slug: v, name: n, endsAt: x, atPeriodEnd: p === 1, refundInvoiceRef: i, refundAmount: i ? r : null, issuedAt: t };
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
