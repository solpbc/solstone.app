// One switch for the subscription rules that take effect together with their approved wording:
// the cancel function, the renewed annual year (the withdrawal period reopening after a renewal,
// then a cancel ending at the end of the current service month with the whole months left
// refunded), the reminder schedule and notices, and the key information shown before checkout.
//
// It stays off (anything but the exact string "on") until that wording and the terms that
// promise these rules publish together, so a deploy before then changes nothing an owner sees
// or receives.
export function subscriptionRulesOn(env) {
  return env?.SUBSCRIPTION_RULES === 'on';
}

// Marks owner-facing text that is a stand-in for the approved wording: a string built with
// placeholder(), or a block under a comment reading "PLACEHOLDER pending the approved
// subscription-rules wording". Every one is replaced before the switch turns on, and the static
// suite refuses wrangler.toml turning it on while any remains.
export const PLACEHOLDER_TAG = '[placeholder]';
export function placeholder(text) {
  return `${PLACEHOLDER_TAG} ${text}`;
}
