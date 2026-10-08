import { hashWithPepper } from './crypto.js';
import { findSppBindingByTokenHash, getActiveDeletionForAccount, getEntitlement } from './db.js';
import { isSppEntitledToServe, SPP_HOSTED_SERVICE } from './spp-entitlement.js';
import { SPP_SUBSCRIBE_URL } from './spp-service.js';

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

    return await authorizeByOwnerCredential(req, env, {
      refused: 'spp_authorize_refused_entitlement',
      refusedDeletion: 'spp_authorize_refused_deletion',
      failed: 'spp_authorize_failed',
    });
  } catch (err) {
    return failed(err, 'spp_authorize_failed');
  }
}

// G3 / Shape C (security-reviewed 2026-09-22: the sealed engine carries no portal
// credential): the sealed appliance publishes no engine-side secret, so the engine
// cannot present one. This route runs the identical owner-credential predicate as
// handleSppAuthorize above with NO service-bearer check at all — reachable by anyone, exactly
// like curling it with the real engine's own bearer already was in practice (the bearer never
// protected an owner; only X-Sol-Entitlement does). It is additive: the sealed appliance's
// gateway is the only intended caller, spp-engine-01 keeps using /internal/spp/authorize
// unchanged until the operator-approved cutover, and this route uses distinct event names so its
// traffic is never confused with the internal route's in logs or alerting.
export async function handleSppAuthorizePublic(req, env) {
  try {
    const admitted = await admitByCallerTier(req, env);
    if (admitted !== true) return admitted;
    return await authorizeByOwnerCredential(req, env, {
      refused: 'spp_authorize_public_refused_entitlement',
      refusedDeletion: 'spp_authorize_public_refused_deletion',
      failed: 'spp_authorize_public_failed',
    });
  } catch (err) {
    return failed(err, 'spp_authorize_public_failed');
  }
}

// CSO G3 condition 4: a high limit for our engines' egress IPs and a low one for every
// other caller, applied before the pepper hash and the D1 reads a junk request would
// otherwise cost. It lives here because the zone's single rate-limit rule cannot match
// on ip.src on our plan. The caller IP keys a Cloudflare-local counter only; it is never
// logged, stored or echoed. A missing binding fails closed rather than going unlimited.
async function admitByCallerTier(req, env) {
  const callerIp = req.headers.get('CF-Connecting-IP') || '';
  const engineIps = new Set(
    String(env.SPP_ENGINE_EGRESS_IPS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
  const isEngine = callerIp !== '' && engineIps.has(callerIp);
  const limiter = isEngine ? env.SPP_AUTHORIZE_ENGINE_LIMIT : env.SPP_AUTHORIZE_PUBLIC_LIMIT;
  if (!limiter || typeof limiter.limit !== 'function') {
    console.error('spp_authorize_public_failed', 'Error', 'other', 'rate_limit_binding_missing');
    return empty(503);
  }
  const key = isEngine ? callerIp : publicLimitKey(callerIp);
  const { success } = await limiter.limit({ key });
  if (!success) {
    console.warn(isEngine ? 'spp_authorize_public_limited_engine' : 'spp_authorize_public_limited');
    return empty(429);
  }
  return true;
}

// The ordinary tier counts an IPv6 caller by its /64, the block one host normally holds,
// so rotating addresses inside it does not buy a fresh budget. IPv4 counts per address.
export function publicLimitKey(ip) {
  if (!ip) return 'unknown';
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = ip.includes('::')
    ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
    : left;
  const prefix = groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, '') || '0');
  while (prefix.length < 4) prefix.push('0');
  return `${prefix.join(':')}::/64`;
}

async function authorizeByOwnerCredential(req, env, events) {
  const entitlementCredential = req.headers.get('X-Sol-Entitlement') || '';
  if (!entitlementCredential || entitlementCredential.length > 4096) {
    console.warn(events.refused);
    return empty(401);
  }

  const tokenHash = await hashWithPepper(entitlementCredential, env);
  const binding = await withD1RetryOnce(() => findSppBindingByTokenHash(env.DB, tokenHash));
  if (!binding) {
    console.warn(events.refused);
    return empty(401);
  }
  if (await withD1RetryOnce(() => getActiveDeletionForAccount(env.DB, binding.account_id))) {
    console.warn(events.refusedDeletion);
    return empty(401);
  }

  const entitlement = await withD1RetryOnce(() =>
    getEntitlement(env.DB, {
      accountId: binding.account_id,
      service: SPP_HOSTED_SERVICE,
    })
  );
  if (!isSppEntitledToServe(entitlement, Math.floor(Date.now() / 1000), env)) {
    console.warn(events.refused);
    return empty(401);
  }

  return empty(204);
}

// The journal's own content-free check: does the confidential processing credential it holds
// still have access? It answers the same question the engine's authorize does, by the same
// predicate, and adds where the owner can turn it back on. A journal asks before the first
// request on each new channel, which is when the engine authorizes too, so the portal learns
// nothing about the owner that the engine's authorize does not already.
export async function handleSppAccess(req, env) {
  try {
    const limiter = env.SPP_ACCESS_LIMIT;
    if (!limiter || typeof limiter.limit !== 'function') {
      console.error('spp_access_failed', 'Error', 'other', 'rate_limit_binding_missing');
      return empty(503);
    }
    const { success } = await limiter.limit({ key: publicLimitKey(req.headers.get('CF-Connecting-IP') || '') });
    if (!success) return empty(429);
    const entitlementCredential = req.headers.get('X-Sol-Entitlement') || '';
    if (!entitlementCredential || entitlementCredential.length > 4096) return empty(401);
    const tokenHash = await hashWithPepper(entitlementCredential, env);
    const binding = await withD1RetryOnce(() => findSppBindingByTokenHash(env.DB, tokenHash));
    if (!binding) return empty(401);
    if (await withD1RetryOnce(() => getActiveDeletionForAccount(env.DB, binding.account_id))) return empty(401);
    const entitlement = await withD1RetryOnce(() =>
      getEntitlement(env.DB, { accountId: binding.account_id, service: SPP_HOSTED_SERVICE })
    );
    const body = isSppEntitledToServe(entitlement, Math.floor(Date.now() / 1000), env)
      ? { state: 'active' }
      : { state: 'ended', subscribe_url: SPP_SUBSCRIBE_URL };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...NO_STORE_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return failed(err, 'spp_access_failed');
  }
}

function failed(err, eventName) {
  // Bounded reason code only — never the raw message. The three D1 reads in
  // authorizeByOwnerCredential (binding lookup, deletion check, entitlement lookup) are the
  // only calls that can fail transiently, and a D1 fault surfaces as a generic Error, so the
  // name alone cannot distinguish it. Each read already gets one retry (withD1RetryOnce) before
  // a failure can reach here, so a 503 out of this branch means both attempts failed, or the
  // fault wasn't retry-eligible.
  const name = typeof err?.name === 'string' && err.name ? err.name : 'unknown';
  const message = String(err?.message || '');
  const kind = message.includes('D1_ERROR') ? 'd1' : 'other';
  const reason = kind === 'd1' ? d1Reason(message) : 'n/a';
  console.error(eventName, name, kind, reason);
  return empty(503);
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
