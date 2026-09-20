// The owner-facing identity of the sme service, in one place.
//
// Anything that needs the service's customer-facing name lands here and in the modules
// that import from here, and nowhere else: the service page and its price card, the
// catalog row, the landing page, and the Stripe Product name and statement descriptor.
// The route path below is the coordinate checkout and portal redirects return to.
export const SME_SERVICE_PATH = '/services/sme';

// The service is on sale exactly when its Stripe price has been created and its id committed
// to STRIPE_PRICE_SME_ANNUAL. Until then the service page answers 404 and the catalog carries
// no row for it, so nothing that deploys before launch can advertise or sell it.
export function smeOnSale(env) {
  return typeof env.STRIPE_PRICE_SME_ANNUAL === 'string' && env.STRIPE_PRICE_SME_ANNUAL.trim() !== '';
}
