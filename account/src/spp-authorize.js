import { hashWithPepper } from './crypto.js';
import { findSppBindingByTokenHash, getEntitlement } from './db.js';
import { isSppEntitledToServe, SPP_HOSTED_SERVICE } from './spp-entitlement.js';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
};

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
    const kind = String(err?.message || '').includes('D1_ERROR') ? 'd1' : 'other';
    console.error('spp_authorize_failed', name, kind);
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
