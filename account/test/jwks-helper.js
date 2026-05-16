import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { vi } from 'vitest';
import { TEST_CF_ACCESS_AUD } from './helpers.js';

export const CF_ACCESS_ISSUER = 'https://solpbc.cloudflareaccess.com';
export const CF_ACCESS_JWKS_URL = `${CF_ACCESS_ISSUER}/cdn-cgi/access/certs`;
export const SCOUTS_AUD = '46f64ab0a7fe4148e2a36e4c6952e95026aa26cfcf01513ccabdbe8eb2f554e4';

const servedKey = makeKeyPair('test-key-1');
const badKey = makeKeyPair('bad-key');

export async function installJwksStub() {
  const { publicJwk } = await servedKey;
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const href = typeof url === 'string' ? url : url.url;
    if (href === CF_ACCESS_JWKS_URL) {
      return new Response(JSON.stringify({ keys: [publicJwk] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  }));
}

export async function mintToken({
  iss = CF_ACCESS_ISSUER,
  aud = TEST_CF_ACCESS_AUD,
  exp = '2h',
  payload = { email: 'jer@solpbc.org' },
  badSignature = false,
} = {}) {
  const key = badSignature ? await badKey : await servedKey;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: key.kid })
    .setIssuer(iss)
    .setAudience(aud)
    .setExpirationTime(exp)
    .sign(key.privateKey);
}

async function makeKeyPair(kid) {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = kid;
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
  return { kid, publicKey, privateKey, publicJwk };
}
