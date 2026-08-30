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

// Reasons worth one immediate retry: shapes that plausibly clear on a second,
// independent attempt (a fresh connection, contention that already released, a
// slow cross-region hop landing fast the second time). Added 2026-08-30 after
// three `authorizer_unavailable` engine-health pages (08-07, 08-24, 08-30) traced
// the fast-fail mode to this account-portal D1 database sitting in WNAM against a
// Worker serving from IAD — D1's own query time stays sub-millisecond throughout
// every incident, so this is an occasional slow/failed round trip, not an
// overloaded service. A single retry does not weaken the fail-closed gate: both
// attempts run the identical query, and a second failure still returns 503 exactly
// as before. Excluded: `subrequest_limit` (retrying spends another subrequest
// against a budget already exhausted, and can push a borderline request over
// Workers' hard subrequest ceiling instead of helping), `schema` and `limit`
// (structural — a second attempt hits the same wall), and `unclassified` (unknown
// shape; do not guess it is safe to repeat). Grounding: `shared/agency/cto-41.md`.
const RETRY_ONCE_D1_REASONS = new Set([
  'network_lost',
  'storage_reset',
  'unavailable',
  'locked',
  'internal',
  'timeout',
]);

async function withD1RetryOnce(read) {
  try {
    return await read();
  } catch (err) {
    const message = String(err?.message || '');
    if (!message.includes('D1_ERROR') || !RETRY_ONCE_D1_REASONS.has(d1Reason(message))) {
      throw err;
    }
    return await read();
  }
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
    const binding = await withD1RetryOnce(() => findSppBindingByTokenHash(env.DB, tokenHash));
    if (!binding) {
      console.warn('spp_authorize_refused_entitlement');
      return empty(401);
    }
    if (await withD1RetryOnce(() => getActiveDeletionForAccount(env.DB, binding.account_id))) {
      console.warn('spp_authorize_refused_deletion');
      return empty(401);
    }

    const entitlement = await withD1RetryOnce(() =>
      getEntitlement(env.DB, {
        accountId: binding.account_id,
        service: SPP_HOSTED_SERVICE,
      })
    );
    if (!isSppEntitledToServe(entitlement, Math.floor(Date.now() / 1000), env)) {
      console.warn('spp_authorize_refused_entitlement');
      return empty(401);
    }

    return empty(204);
  } catch (err) {
    // Bounded reason code only — never the raw message. The three D1 reads above
    // (binding lookup, deletion check, entitlement lookup) are the only calls here
    // that can fail transiently, and a D1 fault surfaces as a generic Error, so the
    // name alone cannot distinguish it. Each read already gets one retry
    // (withD1RetryOnce) before a failure can reach here, so a 503 out of this
    // branch means both attempts failed, or the fault wasn't retry-eligible.
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
