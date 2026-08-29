import { exportJWK, importJWK, importPKCS8, SignJWT } from 'jose';
import { base64UrlEncode } from './crypto.js';
import {
  findUniqueSplBindingAccount,
  getActiveDeletionForAccount,
  getMcpBridgeBinding,
  reserveMcpBridgeBinding,
} from './db.js';
import { json } from './index.js';
import {
  MCP_BRIDGE_REGISTER_SCOPE,
  parseHomeReachCaPubkey,
  verifyHomeReachAssertion,
} from './reach.js';

const BRIDGE_HOST_SUFFIX = '.solstone.me';
const BRIDGE_TOKEN_TTL_SECONDS = 600;
const LABEL_BYTES = 5;
const LABEL_MAX_ATTEMPTS = 8;
const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

export async function handleMcpBridgeToken(req, env) {
  const body = await readJson(req);
  if (!isMcpBridgeRequest(body)) return json({ error: 'invalid_input' }, { status: 400 });

  const ca = await parseHomeReachCaPubkey(body.ca_pubkey);
  if (!ca) return json({ error: 'invalid_input' }, { status: 400 });
  const assertionValid = await verifyHomeReachAssertion(
    body.assertion,
    ca.key,
    ca.spkiBytes,
    body.instance_id,
    MCP_BRIDGE_REGISTER_SCOPE
  );
  if (!assertionValid) return json({ error: 'invalid_token' }, { status: 401 });

  const cnfJwk = await validateMcpBridgePublicJwk(body.cnf_jwk);
  if (!cnfJwk) return json({ error: 'invalid_input' }, { status: 400 });

  let signing;
  try {
    signing = await loadMcpBridgeSigningMaterial(env);
  } catch {
    return json({ error: 'bridge_configuration_unavailable' }, { status: 503 });
  }

  let account;
  try {
    account = await findUniqueSplBindingAccount(env.DB, body.instance_id);
  } catch {
    return json({ error: 'binding_lookup_unavailable' }, { status: 503 });
  }
  if (!account) return json({ error: 'invalid_token' }, { status: 401 });

  try {
    if (await getActiveDeletionForAccount(env.DB, account.accountId)) {
      return json({ error: 'deletion_in_progress' }, { status: 409 });
    }
  } catch {
    return json({ error: 'binding_lookup_unavailable' }, { status: 503 });
  }

  let binding;
  try {
    binding = await getMcpBridgeBinding(env.DB, {
      accountId: account.accountId,
      instanceId: body.instance_id,
    });
  } catch {
    return json({ error: 'binding_lookup_unavailable' }, { status: 503 });
  }

  let label = binding?.label;
  if (!label) {
    try {
      label = await allocateMcpBridgeLabel(env.DB, {
        accountId: account.accountId,
        instanceId: body.instance_id,
        nowMs: Date.now(),
      });
    } catch {
      return json({ error: 'hostname_assignment_unavailable' }, { status: 503 });
    }
  }

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + BRIDGE_TOKEN_TTL_SECONDS;
  const hostname = `${label}${BRIDGE_HOST_SUFFIX}`;
  let token;
  try {
    token = await mintMcpBridgeToken(signing, {
      instanceId: body.instance_id,
      hostname,
      cnfJwk,
      iat,
    });
  } catch {
    return json({ error: 'token_mint_unavailable' }, { status: 503 });
  }
  return json({
    token,
    token_type: 'Bearer',
    expires_in: BRIDGE_TOKEN_TTL_SECONDS,
    expires_at: new Date(exp * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    instance_id: body.instance_id,
    hostname,
    bridge_id: signing.bridgeId,
    bridge_addresses: signing.addresses,
  });
}

export async function handleMcpBridgeJwks(_req, env) {
  try {
    const signing = await loadMcpBridgeSigningMaterial(env);
    return json(
      { keys: [signing.publicJwk] },
      { headers: { 'Cache-Control': 'public, max-age=300' } }
    );
  } catch {
    return json({ error: 'jwks_unavailable' }, { status: 503 });
  }
}

export async function validateMcpBridgePublicJwk(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const allowed = new Set(['kty', 'crv', 'x', 'alg', 'use', 'key_ops']);
  if (Object.keys(value).some((key) => !allowed.has(key))) return null;
  if (Object.hasOwn(value, 'd')) return null;
  if (value.kty !== 'OKP' || value.crv !== 'Ed25519') return null;
  if (!isCanonicalEd25519X(value.x)) return null;
  if (Object.hasOwn(value, 'alg') && value.alg !== 'EdDSA') return null;
  if (Object.hasOwn(value, 'use') && value.use !== 'sig') return null;
  if (
    Object.hasOwn(value, 'key_ops')
    && (!Array.isArray(value.key_ops) || value.key_ops.length !== 1 || value.key_ops[0] !== 'verify')
  ) return null;

  const canonical = { kty: 'OKP', crv: 'Ed25519', x: value.x };
  try {
    await importJWK(canonical, 'EdDSA');
    return canonical;
  } catch {
    return null;
  }
}

export async function loadMcpBridgeSigningMaterial(env) {
  const kid = requiredConfigString(env.MCP_BRIDGE_TOKEN_KID);
  const bridgeId = requiredConfigString(env.MCP_BRIDGE_ID);
  const privateKeyPem = requiredConfigString(env.MCP_BRIDGE_TOKEN_PRIVATE_KEY);
  const addresses = parseBridgeAddresses(env.MCP_BRIDGE_ADDRESSES);
  if (!kid || !bridgeId || !privateKeyPem || !addresses) throw new Error('invalid MCP bridge config');

  const privateKey = await importPKCS8(privateKeyPem, 'EdDSA', { extractable: true });
  const privateJwk = await exportJWK(privateKey);
  if (
    privateJwk.kty !== 'OKP'
    || privateJwk.crv !== 'Ed25519'
    || !isCanonicalEd25519X(privateJwk.x)
  ) throw new Error('invalid MCP bridge key');

  return {
    privateKey,
    kid,
    bridgeId,
    addresses,
    publicJwk: {
      kty: 'OKP',
      crv: 'Ed25519',
      x: privateJwk.x,
      kid,
      use: 'sig',
      alg: 'EdDSA',
    },
  };
}

export async function mintMcpBridgeToken(signing, { instanceId, hostname, cnfJwk, iat }) {
  return new SignJWT({
    hostname,
    cnf: { jwk: cnfJwk },
  })
    .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT', kid: signing.kid })
    .setIssuer('services.solstone.app')
    .setAudience(signing.bridgeId)
    .setSubject(`home:${instanceId}`)
    .setIssuedAt(iat)
    .setExpirationTime(iat + BRIDGE_TOKEN_TTL_SECONDS)
    .sign(signing.privateKey);
}

export async function allocateMcpBridgeLabel(db, { accountId, instanceId, nowMs }, randomBytes = randomLabelBytes) {
  for (let attempt = 0; attempt < LABEL_MAX_ATTEMPTS; attempt++) {
    const label = labelFromRandomBytes(await randomBytes());
    try {
      await reserveMcpBridgeBinding(db, { accountId, instanceId, label, nowMs });
      return label;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const existing = await getMcpBridgeBinding(db, { accountId, instanceId });
      if (existing) return existing.label;
    }
  }
  throw new Error('MCP bridge label collisions exhausted');
}

export function labelFromRandomBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== LABEL_BYTES) {
    throw new Error('MCP bridge label requires five random bytes');
  }
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  let label = '';
  for (let shift = 35n; shift >= 0n; shift -= 5n) {
    label += BASE32[Number((value >> shift) & 0x1fn)];
  }
  return label;
}

function isMcpBridgeRequest(body) {
  return Boolean(
    body
    && typeof body === 'object'
    && !Array.isArray(body)
    && typeof body.instance_id === 'string'
    && body.instance_id.trim()
    && typeof body.assertion === 'string'
    && body.assertion
    && typeof body.ca_pubkey === 'string'
    && body.ca_pubkey
    && Object.hasOwn(body, 'cnf_jwk')
  );
}

function isCanonicalEd25519X(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '=');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.length === 32 && base64UrlEncode(bytes) === value;
  } catch {
    return false;
  }
}

function requiredConfigString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseBridgeAddresses(value) {
  if (typeof value !== 'string') return null;
  const addresses = value.split(',').map((address) => address.trim());
  return addresses.length > 0 && addresses.every(isIpv4Address) ? addresses : null;
}

function isIpv4Address(value) {
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => (
    /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255
  ));
}

function randomLabelBytes() {
  return crypto.getRandomValues(new Uint8Array(LABEL_BYTES));
}

function isUniqueViolation(error) {
  return typeof error?.message === 'string' && error.message.includes('UNIQUE constraint failed');
}

async function readJson(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
