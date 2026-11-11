import { decryptEmail, hashWithPepper } from './crypto.js';
import {
  claimRenewalNotice,
  deleteRenewalNotice,
  getActiveDeletionForAccount,
  getDashboardData,
  getEntitlement,
  hasRenewalAck,
  selectRenewalCandidatePage,
  selectRenewalCatchUpCandidatePage,
  selectRenewalOneOffCandidatePage,
} from './db.js';
import { sendRenewalNoticeEmail } from './email.js';
import { SPL_HOSTED_SERVICE } from './relay-grant.js';
import { SME_HOSTED_SERVICE } from './sme-entitlement.js';
import { SPB_HOSTED_SERVICE } from './spb-entitlement.js';
import { SPP_HOSTED_SERVICE } from './spp-entitlement.js';
import { getSubscription, listPaidSubscriptionInvoices, subscriptionPeriodEnd } from './stripe.js';
import { invoicePaidAt, renewalInvoice, renewalStart, serviceMonthStart } from './renewed-year.js';
import { KEY_FACTS_EMAIL_HEADING, keyFactsLines, resolveBranches } from './rules-words.js';
import { placeholder, subscriptionRulesOn } from './subscription-rules.js';
import { formatLongDate, formatMomentUtc, withdrawalOn } from './withdrawal-rules.js';

export const TAG_TO_HOSTED_SERVICE = Object.freeze({
  spl: SPL_HOSTED_SERVICE,
  spb: SPB_HOSTED_SERVICE,
  sme: SME_HOSTED_SERVICE,
  spp: SPP_HOSTED_SERVICE,
});

export const SERVICE_HUMAN_NAMES = Object.freeze({
  [SPL_HOSTED_SERVICE]: 'private network',
  [SPB_HOSTED_SERVICE]: 'encrypted backup',
  [SME_HOSTED_SERVICE]: 'solstone.me',
  [SPP_HOSTED_SERVICE]: 'confidential processing',
});

const L1_SUBJECT_TEMPLATE = 'your {{service}} subscription: keep this for your records';
const CATCH_UP_SUBJECT_TEMPLATE = 'your {{service}} subscription: the written confirmation we owed you';
const L2_SUBJECT_TEMPLATE = 'your {{service}} subscription renews on {{renewal_date}}';

const L1_BODY_TEMPLATE = `you just subscribed to **{{service}}**. here's what that means, in writing, so you can keep it. it doesn't expire, and it isn't the only copy: the current terms are always at [services.solstone.app/terms](https://services.solstone.app/terms).

**the plan.** {{service}}, {{price}} every {{interval}}.

**it renews on its own.** at the end of each {{interval}}, {{service}} renews automatically at the plan's then-current price, using the payment method on file, until you cancel. [ANNUAL] we'll email you again, 25 to 40 days before each renewal, to say it's coming and how to cancel. [/ANNUAL] [MONTHLY] we'll email you again once a year, 25 to 40 days before the renewal that carries you past each full year, to say it's coming and how to cancel. [/MONTHLY]

**canceling takes as few steps as subscribing did.** the billing portal, linked from [services.solstone.app](https://services.solstone.app), cancels it. no phone call, no email, no retention maze. if you cancel, {{service}} keeps working through the end of the period you've already paid for, then stops; we don't prorate a cancellation you make on your own.

questions: support@solstone.app.

sol pbc`;

// PLACEHOLDER pending the approved withdrawal wording: the drafted words and model form. Inserted
// into the written confirmation after the canceling paragraph and before its closing lines, only
// while the withdrawal door is on; nothing else in the confirmation changes.
const L1_WITHDRAWAL_BLOCK = [
  `**you can also withdraw, for a full refund.** until the end of the 14th day after {{purchase_date}}, you can withdraw from this subscription wherever you live, even if you've started using {{service}}. sign in at [services.solstone.app](https://services.solstone.app) and use *withdraw from contract here* on your {{service}} page there or at [services.solstone.app/billing](https://services.solstone.app/billing), then confirm. or email support@solstone.app saying you withdraw; you can use the form below, but you don't have to. a withdrawal you send by then counts, even if it reaches us later. withdrawing ends {{service}} that day, and we refund everything you paid for this subscription within 14 days of your withdrawal, the same way you paid. you get this once, counted from this purchase; a renewal doesn't start a new one.`,
  `**withdrawal form** (fill this in and send it only if you want to withdraw):`,
  `to: sol pbc, 16095 East 109th Place, Commerce City, CO 80022, United States · support@solstone.app`,
  `I hereby give notice that I withdraw from my contract for the provision of the following service: {{service}}`,
  `ordered on: {{purchase_date}}`,
  `name: ______`,
  `address: ______`,
  `signature (only if you send this on paper): ______`,
  `date: ______`,
].join('\n\n');

const L1_CLOSING = `questions: support@solstone.app.`;

const CATCH_UP_BODY_TEMPLATE = `you're subscribed to **{{service}}**, and this is the written confirmation Colorado's automatic-renewal law entitles you to. we're sending it now because the send path didn't exist when you first subscribed; every new subscriber gets this right after checkout from here on. keep it. it doesn't expire, and it isn't the only copy: the current terms are always at [services.solstone.app/terms](https://services.solstone.app/terms).

**the plan.** {{service}}, {{price}} every {{interval}}.

**it renews on its own.** at the end of each {{interval}}, {{service}} renews automatically at the plan's then-current price, using the payment method on file, until you cancel. [ANNUAL] we'll email you again, 25 to 40 days before each renewal, to say it's coming and how to cancel. [/ANNUAL] [MONTHLY] we'll email you again once a year, 25 to 40 days before the renewal that carries you past each full year, to say it's coming and how to cancel. [/MONTHLY]

**canceling takes as few steps as subscribing did.** the billing portal, linked from [services.solstone.app](https://services.solstone.app), cancels it. no phone call, no email, no retention maze. if you cancel, {{service}} keeps working through the end of the period you've already paid for, then stops; we don't prorate a cancellation you make on your own.

questions: support@solstone.app.

sol pbc`;

const L2_BODY_TEMPLATE = `sol pbc runs your **{{service}}** subscription, and it's set to renew on **{{renewal_date}}** for another {{interval}}, at **{{price}}**, using the payment method on file.

if you want to keep it, there's nothing to do. it renews on its own.

if you'd rather not, cancel before then from the billing portal, linked from [services.solstone.app](https://services.solstone.app). it takes as few steps as subscribing did, and you'll keep {{service}} through the end of the period you've already paid for.

questions: support@solstone.app.

sol pbc`;

// The approved wording under the subscription rules: the renewal reminder (one template for the
// early and the main annual reminder and the six-monthly one), the renewal cooling-off notice,
// and the written confirmation's changes. None of it is sent while the switch is off. A [box]
// paragraph renders set apart in both parts; a paragraph of "- " lines renders as a list.
// It keeps the subject of the reminder it replaces.
const RULES_REMINDER_SUBJECT = L2_SUBJECT_TEMPLATE;
const RULES_REMINDER_BODY = [
  '**{{service}} renews on {{renewal_date}}**',
  '[box]**to stop it renewing, cancel by {{cancel_by_date}}.**[/box]',
  "this is a reminder: your **{{service}}** subscription renews on **{{renewal_date}}**, and you'll be charged **{{price}}** for another {{interval}}, using the payment method on file, unless you cancel before then. [PREV] you paid {{previous_price}} last time. [/PREV] [HIGHER] this renewal is {{increase}} more. [/HIGHER] the renewal after it is on {{next_renewal_date}}.",
  "[MONTHLY] if it renews, the least you'll pay is that {{price}}. [/MONTHLY] [ANNUAL] if it renews, you can still withdraw for a full refund until the end of the 14th day after it does. after that, the least you'll pay is one month of it, {{monthly_equivalent}}: a cancel ends it at the end of your current plan month, and we refund the whole months left. [/ANNUAL]",
  '**to cancel by {{cancel_by_date}},** sign in at [services.solstone.app](https://services.solstone.app) and use *cancel contracts here* on your {{service}} page there or at [services.solstone.app/billing](https://services.solstone.app/billing), or email support@solstone.app saying you cancel.',
  "[EARLY] we'll remind you again closer to the date. [/EARLY] if you want to keep it, there's nothing to do.",
  'questions: support@solstone.app.',
  'sol pbc',
].join('\n\n');

const COOLING_OFF_SUBJECT = 'your {{service}} subscription renewed: you can cancel it for a full refund for 14 days';
const COOLING_OFF_BODY = [
  '**you can cancel this renewal for a full refund until the end of the 14th day after {{window_date}}**',
  'your **{{service}}** subscription has renewed for another year, and you paid **{{renewal_paid}}** on {{window_date}}, and it continues.',
  '**this is your right to withdraw, which cancels the renewal and refunds all of it.** it runs until the end of the 14th day after {{window_date}}, even if you keep using {{service}} until then. sign in at [services.solstone.app](https://services.solstone.app) and use *withdraw from contract here* on your {{service}} page there or at [services.solstone.app/billing](https://services.solstone.app/billing), then confirm, or email support@solstone.app saying you withdraw or cancel. a withdrawal you send by then counts, even if it reaches us later.',
  "**if you withdraw,** {{service}} stops that day, and we refund everything you paid for this renewal, {{renewal_paid}}, the same way you paid, within 14 days. nothing is taken off that refund, and using {{service}} doesn't cost you this right.",
  '**if you use *cancel contracts here* instead,** now or after those 14 days, {{service}} keeps working to the end of your current plan month, and we refund the whole months left.',
  'questions: support@solstone.app.',
  'sol pbc',
].join('\n\n');

// The written confirmation under the subscription rules. {{key_facts}} is the key facts block,
// the withdrawal block goes before {{who_we_are}} while the door is on, and the Terms section
// named in "your rights" is the service's own.
const RULES_L1_BODY_TEMPLATE = [
  "you just subscribed to **{{service}}**. here's what that means, in writing, so you can keep it. it doesn't expire, and it isn't the only copy: the current terms are always at [services.solstone.app/terms](https://services.solstone.app/terms).",
  '**the plan.** {{service}}, {{price}} every {{interval}}.',
  '{{key_facts}}',
  "**it renews on its own.** at the end of each {{interval}}, {{service}} renews automatically at the plan's then-current price, using the payment method on file, until you cancel. [ANNUAL] we'll email you twice before each renewal, 60 to 70 days and 35 to 40 days before it, with the date to cancel by and how to cancel. [/ANNUAL] [MONTHLY] we'll email you 25 to 28 days before the renewal at each six-month mark, to say it's coming and how to cancel. [/MONTHLY]",
  '**canceling takes as few steps as subscribing did.** sign in at [services.solstone.app](https://services.solstone.app) and use *cancel contracts here* on your {{service}} page there or at [services.solstone.app/billing](https://services.solstone.app/billing), or email support@solstone.app saying you cancel. within your 14 days to withdraw (below), an email saying you cancel counts as a withdrawal, unless you tell us to keep {{service}} running. no phone call, no retention maze. [MONTHLY] if you cancel, {{service}} keeps working through the end of the month you\'ve paid for, then stops. [/MONTHLY] [ANNUAL] if you cancel in this first year, {{service}} keeps working through the end of the year you\'ve paid for, then stops. once it has renewed, a cancel ends it at the end of your current plan month, and we refund the whole months left. [/ANNUAL]',
  '{{who_we_are}}',
].join('\n\n');

const RULES_L1_WHO_WE_ARE = [
  '**who we are.** sol pbc, 16095 East 109th Place, Commerce City, CO 80022, United States · support@solstone.app · +1 563 663 5487. questions and complaints go to either, and an answer to a complaint says what we\'ll do about it.',
  "**your rights.** if {{service}} isn't as described or doesn't work, the law where you live may give you rights about it, and nothing here limits them. {{service}} works with the solstone software on your own devices; section {{section}} of the terms says what it does and anything it needs.",
  'questions: support@solstone.app.',
  'sol pbc',
].join('\n\n');

const L1_WITHDRAWAL_LAST_SENTENCE = "you get this once, counted from this purchase; a renewal doesn't start a new one.";
const RULES_L1_WITHDRAWAL_LAST_SENTENCE = "[ANNUAL] each renewal gives you 14 more days to withdraw, counted from the day you pay for it, for a refund of that renewal. [/ANNUAL] [MONTHLY] you get this once, counted from this purchase; a monthly renewal doesn't start a new one. [/MONTHLY]";

// The section of the terms that describes each service.
const TERMS_SECTIONS = Object.freeze({
  [SPL_HOSTED_SERVICE]: '11',
  [SPB_HOSTED_SERVICE]: '12',
  [SPP_HOSTED_SERVICE]: '13',
  [SME_HOSTED_SERVICE]: '14',
});

// Fills {{name}} from values and renders; null if a value it needs is missing or a slot is left.
function renderFilled(subjectTemplate, bodyTemplate, values) {
  const fill = (t) => t.replaceAll(/\{\{([a-z_]+)\}\}/g, (m, key) => values[key] || m);
  const subject = fill(subjectTemplate);
  const rawBody = fill(bodyTemplate);
  if (/\{\{[a-z_]+\}\}/.test(rawBody) || /\{\{[a-z_]+\}\}/.test(subject)) return null;
  return { subject, ...renderMarkdownEmail(rawBody, { quoteLabels: true }) };
}

// The next renewal after `renewal`, the way Stripe steps a period from its anchor: the anchor's
// day of the month, or a shorter month's last day.
export function nextRenewalAfter(anchor, renewal, interval) {
  if (!Number.isInteger(anchor) || !Number.isInteger(renewal)) return null;
  const a = new Date(anchor * 1000);
  const r = new Date(renewal * 1000);
  const months = (r.getUTCFullYear() - a.getUTCFullYear()) * 12 + r.getUTCMonth() - a.getUTCMonth();
  return serviceMonthStart(anchor, months + (interval === 'year' ? 12 : 1));
}

// The renewal reminder under the subscription rules. `previousAmount` is the last payment, or
// null when none has been made; `early` is the earlier of an annual plan's two reminders. The
// cancel-by date is two days before the renewal's UTC date, so its end falls before the charge
// wherever the buyer is. Its dates are written out, in UTC, as the cooling-off notice's are.
export function renderRulesReminder({ service, interval, unitAmount, previousAmount = null, renewalSeconds, nextRenewalSeconds, early = false }) {
  if ((interval !== 'year' && interval !== 'month') || !Number.isInteger(renewalSeconds) || !Number.isInteger(nextRenewalSeconds)) return null;
  const prev = Number.isInteger(previousAmount) && previousAmount > 0;
  const higher = prev && unitAmount > previousAmount;
  const body = resolveBranches(RULES_REMINDER_BODY, {
    ANNUAL: interval === 'year',
    MONTHLY: interval === 'month',
    EARLY: early && interval === 'year',
    PREV: prev,
    HIGHER: higher,
  });
  if (!body) return null;
  return renderFilled(RULES_REMINDER_SUBJECT, body, {
    service: SERVICE_HUMAN_NAMES[service],
    interval,
    price: formatPrice(unitAmount),
    previous_price: prev ? formatPrice(previousAmount) : null,
    increase: higher ? formatPrice(unitAmount - previousAmount) : null,
    monthly_equivalent: formatPrice(Math.round(unitAmount / 12)),
    renewal_date: formatLongDate(renewalSeconds),
    cancel_by_date: formatLongDate(renewalSeconds - 2 * 86400),
    next_renewal_date: formatLongDate(nextRenewalSeconds),
  });
}

// The notice sent when an annual renewal is paid: its 14 days to withdraw run from that payment.
export function renderCoolingOffNotice({ service, amountPaid, paidAt }) {
  if (!Number.isInteger(paidAt)) return null;
  return renderFilled(COOLING_OFF_SUBJECT, COOLING_OFF_BODY, {
    service: SERVICE_HUMAN_NAMES[service],
    renewal_paid: formatPrice(amountPaid),
    window_date: formatLongDate(paidAt),
  });
}

// The written confirmation's body under the subscription rules, before its values are filled.
function rulesAckTemplate({ service, interval, unitAmount, withdrawal }) {
  const serviceName = SERVICE_HUMAN_NAMES[service];
  const facts = keyFactsLines({
    interval,
    email: true,
    values: { service: serviceName, price: formatPrice(unitAmount), monthly_equivalent: formatPrice(Math.round(unitAmount / 12)) },
  });
  if (!facts) return null;
  let template = RULES_L1_BODY_TEMPLATE
    .replace('{{key_facts}}', `**${KEY_FACTS_EMAIL_HEADING}**\n\n${facts.map((line) => `- ${line}`).join('\n')}`)
    .replace('{{who_we_are}}', withdrawal
      ? `${L1_WITHDRAWAL_BLOCK.replace(L1_WITHDRAWAL_LAST_SENTENCE, RULES_L1_WITHDRAWAL_LAST_SENTENCE)}\n\n${RULES_L1_WHO_WE_ARE}`
      : RULES_L1_WHO_WE_ARE);
  template = resolveBranches(template, { ANNUAL: interval === 'year', MONTHLY: interval === 'month' });
  return template && template.replaceAll('{{section}}', TERMS_SECTIONS[service]);
}

export function selectInterval(template, interval) {
  if (interval !== 'year' && interval !== 'month') return null;
  const keep = interval === 'year' ? 'ANNUAL' : 'MONTHLY';
  const drop = interval === 'year' ? 'MONTHLY' : 'ANNUAL';
  let text = template.replace(new RegExp(` \\[${drop}\\][\\s\\S]*?\\[/${drop}\\]`), '');
  text = text.replace(`[${keep}] `, '').replace(`[/${keep}]`, '');
  return text.split('\n\n').map((paragraph) => paragraph.trim()).join('\n\n');
}

export function formatPrice(unitAmount) {
  if (!Number.isInteger(unitAmount) || unitAmount <= 0) return null;
  if (unitAmount % 100 === 0) return `$${unitAmount / 100}`;
  return `$${(unitAmount / 100).toFixed(2)}`;
}

export function formatRenewalDate(seconds) {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

export function esc(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export async function computeOneOffContentKey(subject, body) {
  const payload = new TextEncoder().encode(`${subject.length}\n${subject}\n${body.length}\n${body}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', payload);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function addCalendarMonths(unixSeconds, months) {
  const d = new Date(unixSeconds * 1000);
  return Math.floor(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds(),
  ) / 1000);
}

export function addCalendarYears(unixSeconds, years) {
  const d = new Date(unixSeconds * 1000);
  return Math.floor(Date.UTC(
    d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds(),
  ) / 1000);
}

export function isAnniversaryRenewal(startDate, periodEnd, interval) {
  if (!Number.isInteger(startDate) || !Number.isInteger(periodEnd)) return false;
  if (interval !== 'year' && interval !== 'month') return false;
  const P = interval === 'month' ? addCalendarMonths(periodEnd, -1) : addCalendarYears(periodEnd, -1);
  for (let k = 1; k <= 100; k++) {
    const annK = addCalendarYears(startDate, k);
    if (P < annK && annK <= periodEnd) return true;
    if (annK > periodEnd) break;
  }
  return false;
}

// Under the subscription rules a monthly plan is reminded every six months: before the renewal
// in the sixth, twelfth, eighteenth... calendar month after the start. Counting calendar months,
// not adding them to the start's day, keeps a start on the 31st (renewing on the 28th or 30th
// in shorter months) on the same cadence.
export function isSixMonthRenewal(startDate, periodEnd) {
  if (!Number.isInteger(startDate) || !Number.isInteger(periodEnd)) return false;
  const s = new Date(startDate * 1000);
  const e = new Date(periodEnd * 1000);
  const months = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + e.getUTCMonth() - s.getUTCMonth();
  return months > 0 && months % 6 === 0;
}

export function validateSubscription(sub) {
  if (!sub || typeof sub !== 'object' || sub.object !== 'subscription') return null;
  if (!Array.isArray(sub.items?.data) || sub.items.data.length !== 1) return null;
  const item = sub.items.data[0];
  if (item.quantity !== 1) return null;
  const price = item.price;
  if (!price || typeof price !== 'object') return null;
  if (typeof price.unit_amount !== 'number' || !Number.isInteger(price.unit_amount) || price.unit_amount <= 0) return null;
  if (price.currency !== 'usd') return null;
  const interval = price.recurring?.interval;
  if (interval !== 'year' && interval !== 'month') return null;
  if (typeof sub.start_date !== 'number' || !Number.isInteger(sub.start_date)) return null;
  const periodEnd = subscriptionPeriodEnd(sub);
  if (typeof periodEnd !== 'number' || !Number.isInteger(periodEnd) || periodEnd <= 0) return null;
  return {
    unitAmount: price.unit_amount,
    interval,
    startDate: sub.start_date,
    periodEnd,
  };
}

// A paragraph written [box]...[/box] is set apart: bordered in HTML, ruled above and below in text.
const TEXT_BOX_RULE = '----------------------------------------';
const HTML_BOX_STYLE = 'border: 2px solid #222; border-radius: 6px; padding: 12px 16px;';
function unbox(para) {
  const m = /^\[box\]([\s\S]*)\[\/box\]$/.exec(para);
  return m ? { inner: m[1], boxed: true } : { inner: para, boxed: false };
}

// The notices' small markdown: **bold**, *italic*, and links to services.solstone.app (the root
// or the terms). Plain text drops the marks and keeps a link's address; HTML escapes and marks up.
// Under the subscription rules an *italic* span is a button label, which the plain text quotes
// ("cancel contracts here") so it still reads as one; otherwise the plain text drops the marks.
function renderMarkdownEmail(rawBody, { quoteLabels = false } = {}) {
  const plainParagraphs = rawBody.split('\n\n').map((para) => {
    const { inner, boxed } = unbox(para);
    let p = inner.replaceAll('**', '');
    p = p.replaceAll(/\*([^*\n]+)\*/g, quoteLabels ? '"$1"' : '$1');
    p = p.replaceAll(/\[([^\]]+)\]\((https:\/\/[^\)]+)\)/g, '$2');
    p = p.trim();
    return boxed ? `${TEXT_BOX_RULE}\n${p}\n${TEXT_BOX_RULE}` : p;
  });
  const text = plainParagraphs.join('\n\n');

  const htmlParagraphs = rawBody.split('\n\n').map((para) => {
    if (isList(para)) return `<ul>${para.split('\n').map((line) => `<li>${inlineHtml(line.slice(2))}</li>`).join('')}</ul>`;
    const { inner, boxed } = unbox(para);
    const p = inlineHtml(inner);
    return boxed ? `<p style="${HTML_BOX_STYLE}">${p}</p>` : `<p>${p}</p>`;
  });
  const html = `<!DOCTYPE html>\n<html><body style="font-family: system-ui, -apple-system, sans-serif; color: #222; max-width: 520px; margin: 0 auto; padding: 24px;">\n  ${htmlParagraphs.join('\n  ')}\n</body></html>`;
  return { text, html };
}

// A paragraph whose every line starts "- " is a list.
function isList(para) {
  return para.split('\n').every((line) => line.startsWith('- '));
}

function inlineHtml(source) {
  let p = esc(source);
  // Convert escaped markdown link [services.solstone.app/terms](https://services.solstone.app/terms)
  p = p.replaceAll(
    /\[(services\.solstone\.app(?:\/[a-z\/-]+)?)\]\((https:\/\/services\.solstone\.app(?:\/[a-z\/-]+(?:\?service=[a-z-]+)?)?)\)/g,
    '<a href="$2">$1</a>'
  );
  // Convert **span** to <strong>span</strong> (an *italic* may sit inside it), then *span* to <em>span</em>
  p = p.replaceAll(/\*\*((?:[^*]|\*(?!\*))+)\*\*/g, '<strong>$1</strong>');
  p = p.replaceAll(/\*([^*\n]+)\*/g, '<em>$1</em>');
  return p;
}

export function renderLegalNotice({ kind, service, interval, unitAmount, renewalSeconds, withdrawal = null, rules = false }) {
  const serviceName = SERVICE_HUMAN_NAMES[service];
  if (!serviceName) return null;
  const price = formatPrice(unitAmount);
  if (!price) return null;

  let subjectTemplate;
  let bodyTemplate;
  const renewalDate = renewalSeconds != null ? formatRenewalDate(renewalSeconds) : '';

  if (kind === 'ack') {
    subjectTemplate = L1_SUBJECT_TEMPLATE;
    bodyTemplate = L1_BODY_TEMPLATE;
  } else if (kind === 'catch_up') {
    subjectTemplate = CATCH_UP_SUBJECT_TEMPLATE;
    bodyTemplate = CATCH_UP_BODY_TEMPLATE;
  } else if (kind === 'reminder') {
    subjectTemplate = L2_SUBJECT_TEMPLATE;
    bodyTemplate = L2_BODY_TEMPLATE;
  } else {
    return null;
  }

  const subject = subjectTemplate
    .replaceAll('{{service}}', serviceName)
    .replaceAll('{{renewal_date}}', renewalDate);

  let templateWithInterval = bodyTemplate;
  if (kind === 'ack' && rules) {
    if (withdrawal && !Number.isInteger(withdrawal.purchasedAt)) return null;
    templateWithInterval = rulesAckTemplate({ service, interval, unitAmount, withdrawal });
    if (!templateWithInterval) return null;
    if (withdrawal) templateWithInterval = templateWithInterval.replaceAll('{{purchase_date}}', formatLongDate(withdrawal.purchasedAt));
  } else if (kind === 'ack' || kind === 'catch_up') {
    templateWithInterval = selectInterval(bodyTemplate, interval);
    if (!templateWithInterval) return null;
  }
  if (kind === 'ack' && withdrawal && !rules) {
    if (!Number.isInteger(withdrawal.purchasedAt)) return null;
    templateWithInterval = templateWithInterval.replace(
      `\n\n${L1_CLOSING}`,
      `\n\n${L1_WITHDRAWAL_BLOCK}\n\n${L1_CLOSING}`,
    )
      .replaceAll('{{purchase_date}}', formatLongDate(withdrawal.purchasedAt));
  }

  const rawBody = templateWithInterval
    .replaceAll('{{service}}', serviceName)
    .replaceAll('{{price}}', price)
    .replaceAll('{{interval}}', interval)
    .replaceAll('{{renewal_date}}', renewalDate);

  if (/\{\{[a-z_]+\}\}/.test(rawBody) || /\{\{[a-z_]+\}\}/.test(subject)) return null;

  const { text, html } = renderMarkdownEmail(rawBody, { quoteLabels: kind === 'ack' && rules });
  return { subject, text, html };
}

// PLACEHOLDER pending the approved wording: the drafted acknowledgement. It goes out as soon as
// the withdrawal is recorded, before and apart from any Stripe call, so it names no amount and
// speaks of the refund in the future tense.
const WITHDRAWAL_ACK_SUBJECT = 'you withdrew from your {{service}} subscription';
const WITHDRAWAL_ACK_BODY = [
  "we received your withdrawal. keep this email: it's your record of it.",
  '**what you sent us.** a withdrawal from your {{service}} subscription.',
  '**the subscription.** {{service}}, {{price}} every {{interval}}, bought on {{purchase_date}}.',
  '**from.** signed in as {{primary_email}}, and this confirmation is sent there.',
  '**sent.** {{submitted_at}}.',
  "**what happens now.** {{service}} stops today and won't renew, and we're refunding everything you paid for this subscription, the same way you paid, within 14 days; your bank may take a few more days to show it.[BACKUP] we keep your encrypted backup copy for 30 days from today, then delete it for good. if you offloaded media into it, that copy is the only one, and subscribing again within those 30 days is the way to keep it.[/BACKUP][SME] your solstone.me address stays reserved for you, and subscribing again gives you the same one.[/SME]",
  'questions: support@solstone.app.',
  'sol pbc',
].join('\n\n');

// PLACEHOLDER pending the approved subscription-rules wording:
// the acknowledgement of a withdrawal in a renewed annual year: the window counts from the
// renewal, and the refund is that renewal's.
const WITHDRAWAL_ACK_RENEWED = {
  subscription: ['**the subscription.** {{service}}, {{price}} every {{interval}}, bought on {{purchase_date}}.', placeholder('**the subscription.** {{service}}, {{price}} every {{interval}}, renewed on {{purchase_date}}.')],
  refund: ["we're refunding everything you paid for this subscription", placeholder("we're refunding what you paid for this renewal")],
};

function keepBlock(template, tag, keep) {
  return keep
    ? template.replace(`[${tag}]`, '').replace(`[/${tag}]`, '')
    : template.replace(new RegExp(`\\[${tag}\\][\\s\\S]*?\\[/${tag}\\]`), '');
}

// null when a value the acknowledgement must state is missing, so nothing half-filled is sent.
export function renderWithdrawalAck({ service, interval, unitAmount, purchasedAt, renewed = false, submittedAtMs, primaryEmail }) {
  const serviceName = SERVICE_HUMAN_NAMES[service];
  const price = formatPrice(unitAmount);
  if (!serviceName || !price || (interval !== 'year' && interval !== 'month') || !primaryEmail) return null;
  let body = renewed
    ? Object.values(WITHDRAWAL_ACK_RENEWED).reduce((text, [first, renewal]) => text.replace(first, renewal), WITHDRAWAL_ACK_BODY)
    : WITHDRAWAL_ACK_BODY;
  body = keepBlock(body, 'BACKUP', service === SPB_HOSTED_SERVICE);
  body = keepBlock(body, 'SME', service === SME_HOSTED_SERVICE);
  const values = {
    service: serviceName,
    price,
    interval,
    purchase_date: formatLongDate(purchasedAt),
    primary_email: primaryEmail,
    submitted_at: formatMomentUtc(Math.floor(submittedAtMs / 1000)),
  };
  if (!values.purchase_date || !values.submitted_at) return null;
  // One pass, so a stored value is never read as a placeholder or a mark.
  const raw = body.replaceAll(/\{\{([a-z_]+)\}\}/g, (match, key) => (key in values ? `\u0000${key}\u0000` : match));
  if (/\{\{[a-z_]+\}\}/.test(raw)) return null;
  const { text, html } = renderMarkdownEmail(raw);
  const fill = (out, escape) => out.replaceAll(/\u0000([a-z_]+)\u0000/g, (m, key) => (escape ? esc(values[key]) : values[key]));
  return {
    subject: WITHDRAWAL_ACK_SUBJECT.replaceAll('{{service}}', serviceName),
    text: fill(text, false),
    html: fill(html, true),
  };
}

export function renderOneOffHtml(body) {
  const paragraphs = body.split('\n\n').map((p) => `<p>${esc(p)}</p>`).join('\n  ');
  return `<!DOCTYPE html>\n<html><body style="font-family: system-ui, -apple-system, sans-serif; color: #222; max-width: 520px; margin: 0 auto; padding: 24px;">\n  ${paragraphs}\n</body></html>`;
}

// A peppered ref, never the raw id: every console line is Logpush-retained for 90 days
// and outlives an owner's deletion (same scheme as admin.js, 2026-09-12).
function accountRef(env, accountId) {
  return hashWithPepper(`hub:account:${accountId}`, env);
}

async function logSkip(env, { kind, accountId, service, renewalAt, reason }) {
  console.warn(JSON.stringify({
    event: 'renewal_notice_skipped',
    kind,
    account_ref: await accountRef(env, accountId),
    ...(service ? { service } : {}),
    ...(renewalAt != null && renewalAt > 0 ? { renewal_at: renewalAt } : {}),
    reason,
    ts: Date.now(),
  }));
}

async function logSendFailed(env, { kind, accountId, service, renewalAt }) {
  console.error(JSON.stringify({
    event: 'renewal_notice_send_failed',
    kind,
    account_ref: await accountRef(env, accountId),
    ...(service ? { service } : {}),
    ...(renewalAt != null && renewalAt > 0 ? { renewal_at: renewalAt } : {}),
    ts: Date.now(),
  }));
}

async function logSent(env, { kind, accountId, service, renewalAt }) {
  console.warn(JSON.stringify({
    event: 'renewal_notice_sent',
    kind,
    account_ref: await accountRef(env, accountId),
    ...(service ? { service } : {}),
    ...(renewalAt != null && renewalAt > 0 ? { renewal_at: renewalAt } : {}),
    ts: Date.now(),
  }));
}

export async function resolvePrimaryAddress(env, accountId) {
  const dashData = await getDashboardData(env.DB, accountId);
  if (!dashData?.addressEncrypted) return null;
  try {
    const address = await decryptEmail(dashData.addressEncrypted, env);
    return address || null;
  } catch {
    return null;
  }
}

export async function maybeSendSubscriptionAck(env, { accountId, tag, status, sourceRef, subscription = null }) {
  if (status !== 'active') return;
  const hostedService = TAG_TO_HOSTED_SERVICE[tag];
  if (!hostedService) return;
  if (typeof sourceRef !== 'string' || sourceRef.trim() === '') return;

  try {
    const ent = await getEntitlement(env.DB, { accountId, service: hostedService });
    if (!ent || ent.status !== 'active' || ent.source !== 'stripe' || !ent.source_ref) return;

    // The confirmation is per subscription, so which subscription (and when it started) is
    // read before deciding whether it has already gone out.
    let sub = subscription;
    if (!sub) {
      try {
        sub = await getSubscription(env, sourceRef);
      } catch {
        await logSkip(env, { kind: 'ack', accountId, service: hostedService, reason: 'stripe_unusable' });
        return;
      }
    }

    const parsed = validateSubscription(sub);
    if (!parsed || sub.id !== sourceRef) {
      await logSkip(env, { kind: 'ack', accountId, service: hostedService, reason: 'stripe_unusable' });
      return;
    }

    const alreadyAcked = await hasRenewalAck(env.DB, accountId, hostedService, {
      subscriptionRef: sourceRef,
      startedAtSeconds: parsed.startDate,
    });
    if (alreadyAcked) return;

    const deletion = await getActiveDeletionForAccount(env.DB, accountId);
    if (deletion) {
      await logSkip(env, { kind: 'ack', accountId, service: hostedService, reason: 'deletion' });
      return;
    }

    const address = await resolvePrimaryAddress(env, accountId);
    if (!address) {
      await logSkip(env, { kind: 'ack', accountId, service: hostedService, reason: 'no_email' });
      return;
    }

    const rendered = renderLegalNotice({
      kind: 'ack',
      service: hostedService,
      interval: parsed.interval,
      unitAmount: parsed.unitAmount,
      withdrawal: withdrawalOn(env)
        ? { purchasedAt: parsed.startDate }
        : null,
      rules: subscriptionRulesOn(env),
    });
    if (!rendered) {
      await logSkip(env, { kind: 'ack', accountId, service: hostedService, reason: 'stripe_unusable' });
      return;
    }

    const claimed = await claimRenewalNotice(env.DB, {
      accountId,
      kind: 'ack',
      service: hostedService,
      renewalAt: 0,
      contentKey: sourceRef,
      subject: rendered.subject,
      body: rendered.text,
      nowMs: Date.now(),
    });
    if (!claimed) return;

    try {
      await sendRenewalNoticeEmail({
        env,
        address,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });
    } catch {
      await deleteRenewalNotice(env.DB, {
        accountId,
        kind: 'ack',
        service: hostedService,
        renewalAt: 0,
        contentKey: sourceRef,
      });
      await logSendFailed(env, { kind: 'ack', accountId, service: hostedService });
      return;
    }

    await logSent(env, { kind: 'ack', accountId, service: hostedService });
  } catch {
    // catch own errors so caller always finishes cleanly
  }
}

export async function runRenewalReminders(env, nowMs = Date.now()) {
  const nowSec = Math.floor(nowMs / 1000);
  const rulesOn = subscriptionRulesOn(env);
  let afterAccountId = '';
  let afterService = '';
  const limit = 100;

  for (;;) {
    const page = await selectRenewalCandidatePage(env.DB, { afterAccountId, afterService, limit });
    if (page.length === 0) break;

    for (const candidate of page) {
      const { account_id: accountId, service: hostedService, source_ref: sourceRef } = candidate;
      try {
        const deletion = await getActiveDeletionForAccount(env.DB, accountId);
        if (deletion) {
          await logSkip(env, { kind: 'reminder', accountId, service: hostedService, reason: 'deletion' });
          continue;
        }

        const address = await resolvePrimaryAddress(env, accountId);
        if (!address) {
          await logSkip(env, { kind: 'reminder', accountId, service: hostedService, reason: 'no_email' });
          continue;
        }

        let sub;
        try {
          sub = await getSubscription(env, sourceRef);
        } catch {
          await logSkip(env, { kind: 'reminder', accountId, service: hostedService, reason: 'stripe_unusable' });
          continue;
        }

        const parsed = validateSubscription(sub);
        if (!parsed) {
          await logSkip(env, { kind: 'reminder', accountId, service: hostedService, reason: 'stripe_unusable' });
          continue;
        }

        // A renewed annual year's cooling-off notice goes when the renewal is paid, from the
        // webhook; this sends it if that was missed.
        if (rulesOn) {
          await maybeSendCoolingOffNotice(env, { accountId, service: hostedService, sub, parsed, address, nowSec, nowMs, invoice: null });
        }

        // A subscription set to end is not going to renew, so it gets no notice saying it will.
        if (sub.cancel_at_period_end || sub.cancel_at != null) {
          await logSkip(env, { kind: 'reminder', accountId, service: hostedService, reason: 'cancel_pending' });
          continue;
        }

        const renewal = parsed.periodEnd;
        const diff = renewal - nowSec;
        if (!rulesOn) {
          if (diff < 25 * 86400 || diff > 40 * 86400) continue;
          if (!isAnniversaryRenewal(parsed.startDate, renewal, parsed.interval)) continue;
          const rendered = renderLegalNotice({
            kind: 'reminder',
            service: hostedService,
            interval: parsed.interval,
            unitAmount: parsed.unitAmount,
            renewalSeconds: renewal,
          });
          if (!rendered) {
            await logSkip(env, { kind: 'reminder', accountId, service: hostedService, renewalAt: renewal, reason: 'stripe_unusable' });
            continue;
          }
          await claimAndSend(env, { accountId, kind: 'reminder', service: hostedService, renewalAt: renewal, rendered, address, nowMs });
          continue;
        }

        // Under the subscription rules: an annual plan is reminded 60 to 70 days before each
        // renewal and again 35 to 40 days before it; a monthly plan 25 to 28 days before the
        // renewal at each six-month mark. Each is claimed once per renewal.
        const within = (from, to) => diff >= from * 86400 && diff <= to * 86400;
        let kind = null;
        if (parsed.interval === 'year') {
          if (within(60, 70)) kind = 'early_reminder';
          else if (within(35, 40)) kind = 'reminder';
        } else if (within(25, 28) && isSixMonthRenewal(parsed.startDate, renewal)) {
          kind = 'reminder';
        }
        if (!kind) continue;

        let paid;
        try {
          paid = await listPaidSubscriptionInvoices(env, sourceRef);
        } catch {
          await logSkip(env, { kind, accountId, service: hostedService, renewalAt: renewal, reason: 'stripe_unusable' });
          continue;
        }
        const rendered = renderRulesReminder({
          service: hostedService,
          interval: parsed.interval,
          unitAmount: parsed.unitAmount,
          previousAmount: lastPayment(paid),
          renewalSeconds: renewal,
          nextRenewalSeconds: nextRenewalAfter(sub.billing_cycle_anchor ?? parsed.startDate, renewal, parsed.interval),
          early: kind === 'early_reminder',
        });
        if (!rendered) {
          await logSkip(env, { kind, accountId, service: hostedService, renewalAt: renewal, reason: 'stripe_unusable' });
          continue;
        }

        await claimAndSend(env, { accountId, kind, service: hostedService, renewalAt: renewal, rendered, address, nowMs });
      } catch {
        // Continue processing other candidates
      }
    }

    if (page.length < limit) break;
    const last = page[page.length - 1];
    afterAccountId = last.account_id;
    afterService = last.service;
  }
}

// Claim, then send; a failed send gives the claim back so a later run retries it.
async function claimAndSend(env, { accountId, kind, service, renewalAt, rendered, address, nowMs }) {
  const claimed = await claimRenewalNotice(env.DB, {
    accountId,
    kind,
    service,
    renewalAt,
    contentKey: '',
    subject: rendered.subject,
    body: rendered.text,
    nowMs,
  });
  if (!claimed) return;

  try {
    await sendRenewalNoticeEmail({
      env,
      address,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });
  } catch {
    await deleteRenewalNotice(env.DB, { accountId, kind, service, renewalAt, contentKey: '' });
    await logSendFailed(env, { kind, accountId, service, renewalAt });
    return;
  }

  await logSent(env, { kind, accountId, service, renewalAt });
}

// The amount of the last payment on a subscription, the purchase included, or null if none
// has been made.
function lastPayment(invoices) {
  const paid = invoices
    .filter((invoice) => Number.isInteger(invoice?.amount_paid) && invoice.amount_paid > 0)
    .sort((a, b) => Number(b.created ?? 0) - Number(a.created ?? 0));
  return paid[0]?.amount_paid ?? null;
}

// How long after a renewal the cron still looks for its payment, to send a cooling-off notice the
// webhook missed: past the longest retry schedule Stripe offers for a failed renewal payment.
const COOLING_OFF_BACKSTOP_SECONDS = 62 * 86400;

// An annual plan's renewal has been paid: its cooling-off notice goes out once for that renewal,
// in an email of its own, dated by the payment. From the webhook `invoice` is the paid renewal
// invoice; from the cron it is read, and the notice goes only if the payment was in the last day.
async function maybeSendCoolingOffNotice(env, { accountId, service, sub, parsed, address, nowSec, nowMs, invoice }) {
  const renewal = renewalStart(sub);
  if (parsed.interval !== 'year' || renewal == null || nowSec < renewal) return;
  let paidInvoice = invoice;
  if (!paidInvoice) {
    if (nowSec - renewal > COOLING_OFF_BACKSTOP_SECONDS) return;
    let invoices;
    try {
      invoices = await listPaidSubscriptionInvoices(env, sub.id);
    } catch {
      await logSkip(env, { kind: 'cooling_off', accountId, service, renewalAt: renewal, reason: 'stripe_unusable' });
      return;
    }
    paidInvoice = renewalInvoice(invoices, renewal);
    const paidAt = invoicePaidAt(paidInvoice);
    if (paidAt == null || nowSec - paidAt > 86400) return;
  } else if (renewalInvoice([paidInvoice], renewal) !== paidInvoice) {
    return;
  }
  const rendered = renderCoolingOffNotice({ service, amountPaid: paidInvoice.amount_paid, paidAt: invoicePaidAt(paidInvoice) });
  if (!rendered) {
    await logSkip(env, { kind: 'cooling_off', accountId, service, renewalAt: renewal, reason: 'stripe_unusable' });
    return;
  }
  await claimAndSend(env, { accountId, kind: 'cooling_off', service, renewalAt: renewal, rendered, address, nowMs });
}

// From the webhook, when an invoice is paid: with the subscription rules on, an annual renewal's
// invoice sends that renewal's cooling-off notice. Errors are its own, so the webhook finishes.
export async function maybeSendRenewalPaidNotice(env, { accountId, tag, subscription, invoice, nowMs = Date.now() }) {
  if (!subscriptionRulesOn(env) || invoice?.billing_reason !== 'subscription_cycle') return;
  const service = TAG_TO_HOSTED_SERVICE[tag];
  if (!service) return;
  try {
    const parsed = validateSubscription(subscription);
    if (!parsed || parsed.interval !== 'year') return;
    const ent = await getEntitlement(env.DB, { accountId, service });
    if (!ent || ent.status !== 'active' || ent.source !== 'stripe' || ent.source_ref !== subscription.id) return;
    if (await getActiveDeletionForAccount(env.DB, accountId)) {
      await logSkip(env, { kind: 'cooling_off', accountId, service, reason: 'deletion' });
      return;
    }
    const address = await resolvePrimaryAddress(env, accountId);
    if (!address) {
      await logSkip(env, { kind: 'cooling_off', accountId, service, reason: 'no_email' });
      return;
    }
    await maybeSendCoolingOffNotice(env, {
      accountId, service, sub: subscription, parsed, address, nowSec: Math.floor(nowMs / 1000), nowMs, invoice,
    });
  } catch {
    // The webhook always finishes; the cron sends it if this did not.
  }
}

export async function runRenewalCatchUp(env, nowMs = Date.now()) {
  // Its words predate the subscription rules and no wording for it is approved under them, so
  // with the rules on it sends nothing.
  if (subscriptionRulesOn(env)) return { sent: 0, skipped: 0 };
  let sent = 0;
  let skipped = 0;
  let afterAccountId = '';
  let afterService = '';
  const limit = 100;

  for (;;) {
    const page = await selectRenewalCatchUpCandidatePage(env.DB, { afterAccountId, afterService, limit });
    if (page.length === 0) break;

    for (const candidate of page) {
      const { account_id: accountId, service: hostedService, source_ref: sourceRef } = candidate;
      try {
        const deletion = await getActiveDeletionForAccount(env.DB, accountId);
        if (deletion) {
          await logSkip(env, { kind: 'ack', accountId, service: hostedService, reason: 'deletion' });
          skipped += 1;
          continue;
        }

        const address = await resolvePrimaryAddress(env, accountId);
        if (!address) {
          await logSkip(env, { kind: 'ack', accountId, service: hostedService, reason: 'no_email' });
          skipped += 1;
          continue;
        }

        let sub;
        try {
          sub = await getSubscription(env, sourceRef);
        } catch {
          await logSkip(env, { kind: 'ack', accountId, service: hostedService, reason: 'stripe_unusable' });
          skipped += 1;
          continue;
        }

        const parsed = validateSubscription(sub);
        if (!parsed) {
          await logSkip(env, { kind: 'ack', accountId, service: hostedService, reason: 'stripe_unusable' });
          skipped += 1;
          continue;
        }

        const rendered = renderLegalNotice({
          kind: 'catch_up',
          service: hostedService,
          interval: parsed.interval,
          unitAmount: parsed.unitAmount,
        });
        if (!rendered) {
          await logSkip(env, { kind: 'ack', accountId, service: hostedService, reason: 'stripe_unusable' });
          skipped += 1;
          continue;
        }

        const claimed = await claimRenewalNotice(env.DB, {
          accountId,
          kind: 'ack',
          service: hostedService,
          renewalAt: 0,
          contentKey: '',
          subject: rendered.subject,
          body: rendered.text,
          nowMs,
        });
        if (!claimed) continue;

        try {
          await sendRenewalNoticeEmail({
            env,
            address,
            subject: rendered.subject,
            text: rendered.text,
            html: rendered.html,
          });
        } catch {
          await deleteRenewalNotice(env.DB, {
            accountId,
            kind: 'ack',
            service: hostedService,
            renewalAt: 0,
            contentKey: '',
          });
          await logSendFailed(env, { kind: 'ack', accountId, service: hostedService });
          skipped += 1;
          continue;
        }

        await logSent(env, { kind: 'ack', accountId, service: hostedService });
        sent += 1;
      } catch {
        skipped += 1;
      }
    }

    if (page.length < limit) break;
    const last = page[page.length - 1];
    afterAccountId = last.account_id;
    afterService = last.service;
  }

  return { sent, skipped };
}

export async function runRenewalOneOff(env, { subject, body, nowMs = Date.now() }) {
  let sent = 0;
  let skipped = 0;
  let afterAccountId = '';
  const limit = 100;
  const contentKey = await computeOneOffContentKey(subject, body);
  const html = renderOneOffHtml(body);

  for (;;) {
    const page = await selectRenewalOneOffCandidatePage(env.DB, { afterAccountId, limit });
    if (page.length === 0) break;

    for (const candidate of page) {
      const { account_id: accountId } = candidate;
      try {
        const deletion = await getActiveDeletionForAccount(env.DB, accountId);
        if (deletion) {
          await logSkip(env, { kind: 'oneoff', accountId, reason: 'deletion' });
          skipped += 1;
          continue;
        }

        const address = await resolvePrimaryAddress(env, accountId);
        if (!address) {
          await logSkip(env, { kind: 'oneoff', accountId, reason: 'no_email' });
          skipped += 1;
          continue;
        }

        const claimed = await claimRenewalNotice(env.DB, {
          accountId,
          kind: 'oneoff',
          service: '',
          renewalAt: 0,
          contentKey,
          subject,
          body,
          nowMs,
        });
        if (!claimed) continue;

        try {
          await sendRenewalNoticeEmail({
            env,
            address,
            subject,
            text: body,
            html,
          });
        } catch {
          await deleteRenewalNotice(env.DB, {
            accountId,
            kind: 'oneoff',
            service: '',
            renewalAt: 0,
            contentKey,
          });
          await logSendFailed(env, { kind: 'oneoff', accountId });
          skipped += 1;
          continue;
        }

        await logSent(env, { kind: 'oneoff', accountId });
        sent += 1;
      } catch {
        skipped += 1;
      }
    }

    if (page.length < limit) break;
    const last = page[page.length - 1];
    afterAccountId = last.account_id;
  }

  return { sent, skipped };
}
