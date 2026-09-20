// The owner-facing identity of the sme service, in one place.
//
// Anything that needs the service's customer-facing name lands here and in the modules
// that import from here, and nowhere else: the service page and its price card, the
// catalog row, the landing page, and the Stripe Product name and statement descriptor.
// The route path below is the coordinate checkout and portal redirects return to.
export const SME_SERVICE_PATH = '/services/sme';
