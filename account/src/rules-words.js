import { t } from '../../i18n/account.mjs';

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
export const KEY_FACTS_PAGE_HEADING = t('account.checkout.beforeyousubscribethekeyfacts');
export const KEY_FACTS_EMAIL_HEADING = t('account.checkout.thekeyfacts');

const KEY_FACTS_CONTINUES = t('account.checkout.itcontinuesuntilyouenditserviceisasubscription');
const KEY_FACTS_PAY = t('account.checkout.whatyoupaypriceeveryintervaltaxincludedannualt');
const KEY_FACTS_LEAST = t('account.checkout.theleastyoullpayispriceforthefirstintervalunle');
const KEY_FACTS_END = t('account.checkout.howtoenditsigninatservicessolstoneappandusecan');
const KEY_FACTS_REMINDERS = t('account.checkout.renewalremindersannual60to70daysandagain35to40');
const KEY_FACTS_CHANGE_MIND = t('account.checkout.youcanchangeyourmindyoucanwithdrawforafullrefu');
const KEY_FACTS_TERMS = t('account.checkout.thedetailsareinthetermswitheverythingelseservi');

const ON_THIS_PAGE = t('account.checkout.onthispage');
const ON_YOUR_SERVICE_PAGE = t('account.checkout.onyourservicepagethere');

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
