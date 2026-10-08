// The owner-facing identity of the spp service (confidential processing), in one place:
// its page, what its plan says at checkout, and whether it is on sale.
export const SPP_SERVICE_PATH = '/confidential-processing';
export const SPP_SUBSCRIBE_URL = `https://services.solstone.app${SPP_SERVICE_PATH}`;

// What the plan includes and what happens when the owner reaches it, as the terms require
// checkout to show (SPP_PLAN_TERMS in wrangler.toml). The words are the terms owner's, set in
// the same commit as the prices.
export function sppPlanTerms(env) {
  return typeof env.SPP_PLAN_TERMS === 'string' ? env.SPP_PLAN_TERMS.trim() : '';
}

// The service is on sale exactly when both Stripe prices have been created and their ids
// committed to STRIPE_PRICE_SPP_MONTHLY and STRIPE_PRICE_SPP_ANNUAL, and the plan terms are
// set. Until then every page reads as it did before the sale, checkout refuses, and a sign-in
// that is not entitled is not offered a subscription. Nothing can sell it without the terms.
export function sppOnSale(env) {
  const set = (value) => typeof value === 'string' && value.trim() !== '';
  return set(env.STRIPE_PRICE_SPP_MONTHLY) && set(env.STRIPE_PRICE_SPP_ANNUAL) && sppPlanTerms(env) !== '';
}
