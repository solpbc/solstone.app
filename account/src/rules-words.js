// The approved subscription-rules wording that more than one surface carries, and the branch
// resolver every one of those surfaces uses.
//
// A branch is written [TAG]...[/TAG]. resolveBranches keeps or drops every block of each tag it is
// given, wherever it sits and however many there are, then tidies the spaces a dropped block or
// a removed marker leaves. It returns null when a tag is left unresolved, so nothing ships with a
// branch marker in it.
export function resolveBranches(text, keep) {
  let out = text;
  for (const [tag, kept] of Object.entries(keep)) {
    out = kept
      ? out.replaceAll(`[${tag}]`, '').replaceAll(`[/${tag}]`, '')
      : out.replace(new RegExp(`\\[${tag}\\][\\s\\S]*?\\[/${tag}\\]`, 'g'), '');
  }
  if (/\[\/?[A-Z]+\]/.test(out)) return null;
  return out
    .split('\n')
    .map((line) => line.replaceAll(/ {2,}/g, ' ').trim())
    .join('\n')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim();
}

// The key facts: on the service page before Checkout, and repeated in the written confirmation.
// Lines are markdown: **bold**, *italic*, and a link to the terms. {{service}}, {{price}},
// {{interval}} and {{monthly_equivalent}} are filled by the surface, which formats them as it
// formats its other prices.
export const KEY_FACTS_PAGE_HEADING = 'before you subscribe: the key facts';
export const KEY_FACTS_EMAIL_HEADING = 'the key facts';

const KEY_FACTS_CONTINUES = "**it continues until you end it.** {{service}} is a subscription, and you keep paying until you cancel. [MONTHLY] you don't need to give notice: it ends at the end of the month you've paid for. [/MONTHLY] [ANNUAL] the first year runs to its end. once it has renewed, a cancel takes effect at the end of your current plan month, and we refund the whole months left. [/ANNUAL]";
const KEY_FACTS_PAY = '**what you pay.** {{price}} every {{interval}}, tax included. [ANNUAL] that\'s {{monthly_equivalent}} a month. [/ANNUAL] the price can change only from a renewal, and we tell you before it does.';
const KEY_FACTS_LEAST = "**the least you'll pay** is {{price}}, for the first {{interval}}, unless you withdraw within 14 days.";
const KEY_FACTS_END = '**how to end it.** sign in at services.solstone.app and use *cancel contracts here*, on this page or at services.solstone.app/billing, or email support@solstone.app saying you cancel.';
const KEY_FACTS_REMINDERS = '**renewal reminders.** [ANNUAL] 60 to 70 days, and again 35 to 40 days, before each renewal. [/ANNUAL] [MONTHLY] 25 to 28 days before the renewal at each six-month mark. [/MONTHLY]';
const KEY_FACTS_CHANGE_MIND = '**you can change your mind.** you can withdraw for a full refund until the end of the 14th day after you buy; an email saying you cancel in that time counts too. [ANNUAL] you can do it again after each renewal. [/ANNUAL]';
const KEY_FACTS_TERMS = 'the details are in the terms, with everything else: [services.solstone.app/terms](https://services.solstone.app/terms).';

const ON_THIS_PAGE = 'on this page';
const ON_YOUR_SERVICE_PAGE = 'on your {{service}} page there';

function fill(text, values) {
  const out = text.replaceAll(/\{\{([a-z_]+)\}\}/g, (match, key) => values[key] || match);
  return /\{\{[a-z_]+\}\}/.test(out) ? null : out;
}

function resolvePlan(line, interval, values) {
  const resolved = resolveBranches(line, { ANNUAL: interval === 'year', MONTHLY: interval === 'month' });
  return resolved == null ? null : fill(resolved, { ...values, interval });
}

// The six key facts of one plan, in order, as markdown. `email` reads them from the written
// confirmation, where the service page is "your {{service}} page there". null if a value is
// missing.
export function keyFactsLines({ interval, values, email = false }) {
  if (interval !== 'year' && interval !== 'month') return null;
  const end = email ? KEY_FACTS_END.replace(ON_THIS_PAGE, ON_YOUR_SERVICE_PAGE) : KEY_FACTS_END;
  const lines = [
    KEY_FACTS_CONTINUES,
    KEY_FACTS_PAY,
    KEY_FACTS_LEAST,
    end,
    KEY_FACTS_REMINDERS,
    `${KEY_FACTS_CHANGE_MIND} ${KEY_FACTS_TERMS}`,
  ].map((line) => resolvePlan(line, interval, values));
  return lines.includes(null) ? null : lines;
}

// A page offering two plans prints the facts of each plan apart, and the lines no plan changes,
// how to end it and the terms link, once after them.
export function keyFactsPlanLines({ interval, values }) {
  if (interval !== 'year' && interval !== 'month') return null;
  const lines = [KEY_FACTS_CONTINUES, KEY_FACTS_PAY, KEY_FACTS_LEAST, KEY_FACTS_REMINDERS, KEY_FACTS_CHANGE_MIND]
    .map((line) => resolvePlan(line, interval, values));
  return lines.includes(null) ? null : lines;
}

export const KEY_FACTS_SHARED_LINES = Object.freeze([KEY_FACTS_END, KEY_FACTS_TERMS]);
