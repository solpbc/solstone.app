import { hashWithPepper } from './crypto.js';
import { findSppBindingByTokenHash, getActiveDeletionForAccount, getEntitlement } from './db.js';
import { isSppEntitledToServe, SPP_HOSTED_SERVICE } from './spp-entitlement.js';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
};

// Bounded D1 failure taxonomy. `kind = 'd1'` told us D1 threw but never which D1
// fault, which left "why does D1 throw" unanswerable from the log alone — the
// open question after the 2026-08-24 recurrence.
//
// Each entry is (needle we look for, token we emit). The emitted value is always
// one of these fixed constants or 'unclassified'; a matched needle is never
// echoed back and no slice of the raw message is ever emitted. That is the
// property that keeps this Article 8 clean — a D1 message can embed a bound
// parameter, and a bound parameter here is the owner's entitlement token hash.
// Ordered most specific first; the first match wins.
const D1_REASONS = [
  ['network connection lost', 'network_lost'],
  ['storage caused object to be reset', 'storage_reset'],
  ['too many api requests', 'subrequest_limit'],
  ['unable to open database', 'unavailable'],
  ['database is locked', 'locked'],
  ['no such table', 'schema'],
  ['internal error', 'internal'],
  ['timed out', 'timeout'],
  ['exceeded', 'limit'],
];

function d1Reason(message) {
  const haystack = message.toLowerCase();
  for (const [needle, token] of D1_REASONS) {
    if (haystack.includes(needle)) return token;
  }
  return 'unclassified';
}

export async function handleSppAuthorize(req, env) {
  try {
    const expected = env.SPP_ENGINE_AUTH_SECRET || '';
    const serviceCredential = bearer(req.headers.get('Authorization'));
    if (!expected || !(await fixedLengthSecretEqual(serviceCredential, expected))) {
      console.warn('spp_authorize_refused_service');
      return empty(401);
    }

    const entitlementCredential = req.headers.get('X-Sol-Entitlement') || '';
    if (!entitlementCredential || entitlementCredential.length > 4096) {
      console.warn('spp_authorize_refused_entitlement');
      return empty(401);
    }

    const tokenHash = await hashWithPepper(entitlementCredential, env);
    const binding = await findSppBindingByTokenHash(env.DB, tokenHash);
    if (!binding) {
      console.warn('spp_authorize_refused_entitlement');
      return empty(401);
    }
    if (await getActiveDeletionForAccount(env.DB, binding.account_id)) {
      console.warn('spp_authorize_refused_deletion');
      return empty(401);
    }

    const entitlement = await getEntitlement(env.DB, {
      accountId: binding.account_id,
      service: SPP_HOSTED_SERVICE,
    });
    if (!isSppEntitledToServe(entitlement, Math.floor(Date.now() / 1000), env)) {
      console.warn('spp_authorize_refused_entitlement');
      return empty(401);
    }

    return empty(204);
  } catch (err) {
    // Bounded reason code only — never the raw message. The two D1 reads above are the
    // only calls here that can fail transiently, and a D1 fault surfaces as a generic
    // Error, so the name alone cannot distinguish it.
    const name = typeof err?.name === 'string' && err.name ? err.name : 'unknown';
    const message = String(err?.message || '');
    const kind = message.includes('D1_ERROR') ? 'd1' : 'other';
    const reason = kind === 'd1' ? d1Reason(message) : 'n/a';
    console.error('spp_authorize_failed', name, kind, reason);
    return empty(503);
  }
}

function bearer(value) {
  const match = (value || '').match(/^Bearer ([^\s]+)$/i);
  return match?.[1] || '';
}

async function fixedLengthSecretEqual(provided, expected) {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const left = new Uint8Array(providedHash);
  const right = new Uint8Array(expectedHash);
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left[i] ^ right[i];
  return mismatch === 0;
}

function empty(status) {
  return new Response(null, { status, headers: NO_STORE_HEADERS });
}
