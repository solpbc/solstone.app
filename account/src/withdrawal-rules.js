// The withdrawal right's two constants, kept apart from withdrawal.js so the renewal notices,
// checkout and pages can read them without importing the withdrawal handlers.

// Every paid subscription can be withdrawn from within 14 days of buying it, for a full
// refund. The period runs once, from the purchase: a renewal does not start another.
//
// The law ends the period at the end of the 14th day after the day of purchase, in the buyer's
// own day. Purchase + 15 days lands at or after that deadline in every timezone, and never more
// than a day past it, so that is the moment honoured and shown.
export const WITHDRAWAL_WINDOW_SECONDS = 15 * 86400;

// The door, the "start my service now" box and the withdrawal disclosures are one switch.
// It stays off (anything but the exact string "on") until the approved wording and the terms
// that promise the refund publish together, so a deploy before then shows owners none of it.
export function withdrawalOn(env) {
  return env?.WITHDRAWAL_DOOR === 'on';
}

// The last moment a subscription bought at `purchasedAt` (Unix seconds) can be withdrawn from.
export function withdrawalUntil(purchasedAt) {
  return Number.isInteger(purchasedAt) ? purchasedAt + WITHDRAWAL_WINDOW_SECONDS : null;
}

// UK consumer law lets a service start inside the withdrawal period only at the owner's
// express request, so while the door is on checkout needs the unticked "start my service now"
// box ticked, and records when it was. Enforced here, on the server, not by the form. With the
// door off nothing is asked and nothing changes.
export function startNowRequest(env, form, nowMs = Date.now()) {
  if (!withdrawalOn(env)) return { refused: false, withdrawal: false, requestedAt: '' };
  if (form?.get('start_now')?.toString() !== 'yes') return { refused: true, withdrawal: true, requestedAt: '' };
  return { refused: false, withdrawal: true, requestedAt: new Date(nowMs).toISOString() };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "September 25, 2026", in UTC.
export function formatLongDate(seconds) {
  if (!Number.isFinite(seconds)) return '';
  const d = new Date(seconds * 1000);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

// "October 10, 2026, 23:41 UTC": a moment to the minute, as the withdrawal deadline and the
// submission time are shown.
export function formatMomentUtc(seconds) {
  if (!Number.isFinite(seconds)) return '';
  const d = new Date(seconds * 1000);
  return `${formatLongDate(seconds)}, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}
