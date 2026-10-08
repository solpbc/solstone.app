// The journal mirror is core/contracts/service-enable-proof.json
import contract from '../protocol/service-enable-proof.json';
import { base64UrlDecode } from './crypto.js';
import { parseHomeReachCaPubkey, readHomeReachAssertion } from './reach.js';

const decoder = new TextDecoder();

export async function verifyServiceEnableProof({ assertion, caPubkey, instanceId, nonce, service }) {
  try {
    if (
      typeof assertion !== 'string' ||
      typeof caPubkey !== 'string' ||
      typeof instanceId !== 'string' ||
      typeof nonce !== 'string' ||
      typeof service !== 'string'
    ) {
      return false;
    }

    const ca = await parseHomeReachCaPubkey(caPubkey);
    if (!ca) return false;

    const parts = assertion.split('.');
    if (parts.length !== 3) return false;

    const header = JSON.parse(decoder.decode(base64UrlDecode(parts[0])));
    if (header?.alg !== contract.alg || header?.typ !== contract.typ) return false;

    const claims = await readHomeReachAssertion(
      assertion,
      ca.key,
      ca.spkiBytes,
      instanceId,
      contract.scope
    );
    if (!claims) return false;
    if (claims.aud !== contract.aud) return false;

    if (claims.service !== service || !contract.services.includes(service)) return false;
    if (claims.nonce !== nonce) return false;

    if (!Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp)) return false;

    const now = Math.floor(Date.now() / 1000);
    if (
      claims.exp <= now ||
      claims.iat > now + contract.clock_skew_seconds ||
      claims.exp <= claims.iat ||
      claims.exp - claims.iat > contract.lifetime_seconds
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
