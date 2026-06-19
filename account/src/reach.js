import { timingSafeEqual } from './crypto.js';
import { json } from './index.js';

const REACH_RELAY_TOKEN_TTL_SECONDS = 86400;
const encoder = new TextEncoder();

export async function handleReachRelayToken(req, env) {
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_input' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'invalid_input' }, { status: 400 });
  }

  const instanceId = body.instance_id;
  const assertion = body.assertion;
  const caPubkey = body.ca_pubkey;
  if (
    typeof instanceId !== 'string' ||
    !instanceId.trim() ||
    typeof assertion !== 'string' ||
    !assertion ||
    typeof caPubkey !== 'string' ||
    !caPubkey
  ) {
    return json({ error: 'invalid_input' }, { status: 400 });
  }

  let key;
  try {
    key = await crypto.subtle.importKey(
      'spki',
      spkiPemToBytes(caPubkey),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
  } catch {
    return json({ error: 'invalid_input' }, { status: 400 });
  }

  const ok = await verifyHomeReachAssertion(assertion, key, instanceId);
  if (!ok) return json({ error: 'invalid_token' }, { status: 401 });

  const iat = Math.floor(Date.now() / 1000);
  const token = await mintReachRelayToken(env, { instanceId, iat });
  const exp = iat + REACH_RELAY_TOKEN_TTL_SECONDS;
  const expiresAt = new Date(exp * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return json({
    token,
    token_type: 'Bearer',
    expires_in: REACH_RELAY_TOKEN_TTL_SECONDS,
    expires_at: expiresAt,
    instance_id: instanceId,
  });
}

export async function mintReachRelayToken(env, { instanceId, iat }) {
  const header = { alg: 'HS256', typ: 'reach-relay', kid: 'reach-relay-v1' };
  const claims = {
    iss: 'solstone-reach',
    aud: 'push-relay',
    scope: 'push.relay',
    instance_id: instanceId,
    iat,
    exp: iat + REACH_RELAY_TOKEN_TTL_SECONDS,
  };
  const signingInput = `${base64UrlEncode(encoder.encode(JSON.stringify(header)))}.${base64UrlEncode(encoder.encode(JSON.stringify(claims)))}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(env.REACH_RELAY_TOKEN_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  return `${signingInput}.${base64UrlEncode(new Uint8Array(sig))}`;
}

export async function verifyReachRelayToken(token, env) {
  try {
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(env.REACH_RELAY_TOKEN_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signingInput = `${parts[0]}.${parts[1]}`;
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
    const expected = base64UrlEncode(new Uint8Array(sig));
    if (!timingSafeEqual(expected, parts[2])) return null;

    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    if (header.alg !== 'HS256' || header.typ !== 'reach-relay' || header.kid !== 'reach-relay-v1') {
      return null;
    }
    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
    if (claims.iss !== 'solstone-reach' || claims.aud !== 'push-relay' || claims.scope !== 'push.relay') {
      return null;
    }
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== 'number' || claims.exp <= now) return null;
    if (typeof claims.instance_id !== 'string' || !claims.instance_id) return null;
    return { instanceId: claims.instance_id };
  } catch {
    return null;
  }
}

async function verifyHomeReachAssertion(assertion, key, instanceId) {
  try {
    const parts = assertion.split('.');
    if (parts.length !== 3) return false;

    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    if (header.alg !== 'ES256' || header.typ !== 'home-reach') return false;

    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== `home:${instanceId}`) return false;
    if (claims.aud !== 'solstone-reach') return false;
    if (claims.scope !== 'push.relay.enroll') return false;
    if (claims.instance_id !== instanceId) return false;
    if (typeof claims.exp !== 'number' || claims.exp <= now) return false;
    if (typeof claims.iat !== 'number' || claims.iat > now + 60 || claims.exp <= claims.iat) return false;

    const sigBytes = base64UrlDecode(parts[2]);
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      sigBytes,
      encoder.encode(`${parts[0]}.${parts[1]}`)
    );
    return ok === true;
  } catch {
    return false;
  }
}

function spkiPemToBytes(pem) {
  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
