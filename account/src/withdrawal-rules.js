// The withdrawal right's two constants, kept apart from withdrawal.js so the renewal notices,
// checkout and pages can read them without importing the withdrawal handlers.

// Every paid subscription can be withdrawn from within 14 days of buying it, for a full
// refund. The period runs once, from the purchase: a renewal does not start another.
export const WITHDRAWAL_PERIOD_SECONDS = 14 * 86400;

// The door, the "start my service now" box and the withdrawal disclosures are one switch.
// It stays off (anything but the exact string "on") until the approved wording and the terms
// that promise the refund publish together, so a deploy before then shows owners none of it.
export function withdrawalOn(env) {
  return env?.WITHDRAWAL_DOOR === 'on';
}

// The last moment a subscription bought at `purchasedAt` (Unix seconds) can be withdrawn from.
export function withdrawalUntil(purchasedAt) {
  return Number.isInteger(purchasedAt) ? purchasedAt + WITHDRAWAL_PERIOD_SECONDS : null;
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
