import { exportJWK, importJWK, importPKCS8, SignJWT } from 'jose';
import { base64UrlEncode } from './crypto.js';
import {
  clearSmeJournalUpdateRefused,
  claimSolstoneMeDnsCapacityAlert,
  commitMcpBridgeProvisionalVerification,
  confirmRefreshMcpBridgeVerification,
  findUniqueSmeBindingAccount,
  getActiveDeletionForAccount,
  getEntitlement,
  getMcpBridgeBinding,
  releaseMcpBridgeDnsLease,
  replaceMcpBridgePin,
  reserveMcpBridgeBinding,
  setMcpBridgeFirstPin,
  stampSmeJournalUpdateRefused,
  takeMcpBridgeDnsLease,
} from './db.js';
import { emitSecurityEvent } from './hub.js';
import { json } from './index.js';
import {
  MCP_BRIDGE_REGISTER_SCOPE,
  parseHomeReachCaPubkey,
  readHomeReachAssertion,
} from './reach.js';
import { SME_HOSTED_SERVICE, isSmeEntitledToServe } from './sme-entitlement.js';
import {
  applyLabelBatch,
  countZoneRecords,
  labelRecordsMatch,
  listLabelRecords,
  planLabelBatch,
  readDnsRecordCeiling,
  solstoneMeDnsReady,
} from './solstone-me-dns.js';

const BRIDGE_HOST_SUFFIX = '.solstone.me';
const BRIDGE_TOKEN_TTL_SECONDS = 600;
const LABEL_BYTES = 5;
const LABEL_MAX_ATTEMPTS = 8;
const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';
const ACME_URI_RE = /^https:\/\/(acme-v02|acme-staging-v02)\.api\.letsencrypt\.org\/acme\/acct\/[0-9]{1,20}$/;

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

function logBridgeTokenFailure(step, err) {
  const name = typeof err?.name === 'string' && err.name ? err.name : 'unknown';
  const message = String(err?.message || '');
  const kind = message.includes('D1_ERROR') ? 'd1' : 'other';
  const reason = kind === 'd1' ? d1Reason(message) : 'n/a';
  console.error('mcp_bridge_token_failed', step, name, kind, reason);
}

export async function handleMcpBridgeToken(req, env, ctx) {
  if (env.MCP_BRIDGE_TOKEN_DISABLED === 'true') {
    return json({ error: 'bridge_token_disabled' }, { status: 503 });
  }
  const body = await readJson(req);
  if (!isMcpBridgeRequest(body)) return json({ error: 'invalid_input' }, { status: 400 });

  const ca = await parseHomeReachCaPubkey(body.ca_pubkey);
  if (!ca) return json({ error: 'invalid_input' }, { status: 400 });

  const claims = await readHomeReachAssertion(
    body.assertion,
    ca.key,
    ca.spkiBytes,
    body.instance_id,
    MCP_BRIDGE_REGISTER_SCOPE
  );
  if (!claims) return json({ error: 'invalid_token' }, { status: 401 });

  if (claims.exp - claims.iat > 300) {
    return json({ error: 'invalid_token' }, { status: 401 });
  }

  const requestAccountUri = claims.acme_account_uri;
  if (requestAccountUri !== undefined) {
    if (typeof requestAccountUri !== 'string' || !ACME_URI_RE.test(requestAccountUri)) {
      return json({ error: 'invalid_input' }, { status: 400 });
    }
  }

  const replaceClaim = claims.acme_account_replace;
  if (replaceClaim !== undefined && typeof replaceClaim !== 'boolean') {
    return json({ error: 'invalid_input' }, { status: 400 });
  }
  const isReplace = replaceClaim === true;

  const cnfJwk = await validateMcpBridgePublicJwk(body.cnf_jwk);
  if (!cnfJwk) return json({ error: 'invalid_input' }, { status: 400 });

  let signing;
  try {
    signing = await loadMcpBridgeSigningMaterial(env);
  } catch (err) {
    logBridgeTokenFailure('load_signing_material', err);
    return json({ error: 'bridge_configuration_unavailable' }, { status: 503 });
  }

  let account;
  try {
    account = await findUniqueSmeBindingAccount(env.DB, body.instance_id);
  } catch (err) {
    logBridgeTokenFailure('find_binding_account', err);
    return json({ error: 'binding_lookup_unavailable' }, { status: 503 });
  }
  if (!account) return json({ error: 'invalid_token' }, { status: 401 });

  try {
    if (await getActiveDeletionForAccount(env.DB, account.accountId)) {
      return json({ error: 'deletion_in_progress' }, { status: 409 });
    }
  } catch (err) {
    logBridgeTokenFailure('get_active_deletion', err);
    return json({ error: 'binding_lookup_unavailable' }, { status: 503 });
  }

  // The entitlement gate. It must run before getMcpBridgeBinding, and so before any
  // label allocation: allocateMcpBridgeLabel writes to mcp_bridge_hostname_ledger, which
  // is permanent and never reuses a label, so a refusal placed after it would burn a
  // label on every refused request. Refuse before anything is written.
  try {
    const entitlement = await getEntitlement(env.DB, {
      accountId: account.accountId,
      service: SME_HOSTED_SERVICE,
    });
    if (!isSmeEntitledToServe(entitlement, Math.floor(Date.now() / 1000), env)) {
      return json({ error: 'needs_subscription' }, { status: 402 });
    }
  } catch (err) {
    logBridgeTokenFailure('get_entitlement', err);
    return json({ error: 'entitlement_lookup_unavailable' }, { status: 503 });
  }

  if (!requestAccountUri) {
    let stamped;
    try {
      stamped = await stampSmeJournalUpdateRefused(env.DB, {
        accountId: account.accountId,
        instanceId: body.instance_id,
        nowMs: Date.now(),
      });
    } catch (err) {
      logBridgeTokenFailure('stamp_journal_update_refused', err);
      return json({ error: 'binding_lookup_unavailable' }, { status: 503 });
    }
    if (!stamped) {
      logBridgeTokenFailure('stamp_journal_update_refused', new Error('no rows updated'));
      return json({ error: 'binding_lookup_unavailable' }, { status: 503 });
    }
    return json({ error: 'journal_update_required' }, { status: 426 });
  }

  try {
    await clearSmeJournalUpdateRefused(env.DB, {
      accountId: account.accountId,
      instanceId: body.instance_id,
    });
  } catch (err) {
    logBridgeTokenFailure('clear_journal_update_refused', err);
    return json({ error: 'binding_lookup_unavailable' }, { status: 503 });
  }

  let binding;
  try {
    binding = await getMcpBridgeBinding(env.DB, {
      accountId: account.accountId,
      instanceId: body.instance_id,
    });
  } catch (err) {
    logBridgeTokenFailure('get_bridge_binding', err);
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
      binding = await getMcpBridgeBinding(env.DB, {
        accountId: account.accountId,
        instanceId: body.instance_id,
      });
    } catch (err) {
      logBridgeTokenFailure('allocate_label', err);
      return json({ error: 'hostname_assignment_unavailable' }, { status: 503 });
    }
  }

  // Pin decision
  if (!binding.acme_account_uri) {
    try {
      const ok = await setMcpBridgeFirstPin(env.DB, {
        accountId: account.accountId,
        instanceId: body.instance_id,
        accountUri: requestAccountUri,
        nowMs: Date.now(),
      });
      if (!ok) {
        binding = await getMcpBridgeBinding(env.DB, {
          accountId: account.accountId,
          instanceId: body.instance_id,
        });
        if (binding?.acme_account_uri !== requestAccountUri) {
          return json({ error: 'acme_account_changed' }, { status: 409 });
        }
      } else {
        binding.acme_account_uri = requestAccountUri;
        binding.acme_account_pinned_at = Date.now();
      }
    } catch (err) {
      logBridgeTokenFailure('set_bridge_pin', err);
      return json({ error: 'binding_lookup_unavailable' }, { status: 503 });
    }
  } else if (binding.acme_account_uri !== requestAccountUri) {
    if (!isReplace) {
      return json({ error: 'acme_account_changed' }, { status: 409 });
    }
    try {
      const ok = await replaceMcpBridgePin(env.DB, {
        accountId: account.accountId,
        instanceId: body.instance_id,
        newAccountUri: requestAccountUri,
        oldAccountUri: binding.acme_account_uri,
        nowMs: Date.now(),
      });
      if (!ok) {
        binding = await getMcpBridgeBinding(env.DB, {
          accountId: account.accountId,
          instanceId: body.instance_id,
        });
        if (binding?.acme_account_uri !== requestAccountUri) {
          return json({ error: 'acme_account_changed' }, { status: 409 });
        }
      } else {
        binding.acme_account_uri = requestAccountUri;
        binding.acme_account_replaced_at = Date.now();
      }
    } catch (err) {
      logBridgeTokenFailure('replace_bridge_pin', err);
      return json({ error: 'binding_lookup_unavailable' }, { status: 503 });
    }
  }

  const hostname = `${label}${BRIDGE_HOST_SUFFIX}`;
  const sortedAddresses = [...signing.addresses].sort();
  const canonicalAddressesJson = JSON.stringify(sortedAddresses);

  // Fast path check
  const now = Date.now();
  const verifiedAge = typeof binding.dns_verified_at === 'number' ? now - binding.dns_verified_at : Infinity;
  const verifiedUriMatches = binding.dns_verified_uri === binding.acme_account_uri && binding.dns_verified_uri === requestAccountUri;
  const verifiedAddressesMatches = binding.dns_verified_addresses === canonicalAddressesJson;

  const isFastPath =
    verifiedUriMatches &&
    verifiedAddressesMatches &&
    verifiedAge < 6 * 3600 * 1000 &&
    (binding.dns_verification_state === 'confirmed' ||
      (binding.dns_verification_state === 'provisional' && verifiedAge < 60 * 1000));

  if (isFastPath) {
    return mintAndReturnResponse(signing, body.instance_id, hostname, cnfJwk, binding.acme_account_replaced_at);
  }

  // Re-verify check
  const isReVerifyCandidate =
    verifiedUriMatches &&
    verifiedAddressesMatches &&
    (binding.dns_verification_state === 'confirmed' || binding.dns_verification_state === 'provisional');

  if (isReVerifyCandidate) {
    if (!solstoneMeDnsReady(env)) {
      console.error('mcp_bridge_dns_failed', 'not_configured');
      return mintAndReturnResponse(signing, body.instance_id, hostname, cnfJwk, binding.acme_account_replaced_at);
    }
    const listRes = await listLabelRecords(env, hostname);
    if (!listRes.ok) {
      console.error('mcp_bridge_dns_failed', listRes.reason);
      return mintAndReturnResponse(signing, body.instance_id, hostname, cnfJwk, binding.acme_account_replaced_at);
    }
    if (labelRecordsMatch(listRes.records, { hostname, accountUri: binding.acme_account_uri, addresses: signing.addresses })) {
      try {
        await confirmRefreshMcpBridgeVerification(env.DB, {
          accountId: account.accountId,
          instanceId: body.instance_id,
          leaseGeneration: binding.dns_lease_generation,
          verifiedUri: binding.dns_verified_uri,
          verifiedAddressesJson: binding.dns_verified_addresses,
          nowMs: Date.now(),
        });
      } catch {
        // ignore error
      }
      const fresh = await getMcpBridgeBinding(env.DB, { accountId: account.accountId, instanceId: body.instance_id });
      if (fresh?.acme_account_uri !== requestAccountUri) {
        return json({ error: 'acme_account_changed' }, { status: 409 });
      }
      if (
        fresh?.dns_verification_state &&
        fresh.dns_verified_uri === requestAccountUri &&
        fresh.dns_verified_addresses === canonicalAddressesJson &&
        (fresh.dns_lease_expires_at === null || fresh.dns_lease_expires_at <= Date.now())
      ) {
        return mintAndReturnResponse(signing, body.instance_id, hostname, cnfJwk, fresh.acme_account_replaced_at);
      }
      console.error('mcp_bridge_dns_failed', 'lease_held');
      return json({ error: 'hostname_records_unavailable' }, { status: 503 });
    }
    // If mismatch, fall through to write path
  }

  // Write path
  const ceiling = readDnsRecordCeiling(env);
  if (!solstoneMeDnsReady(env) || ceiling === null) {
    console.error('mcp_bridge_dns_failed', 'not_configured');
    return json({ error: 'hostname_records_unavailable' }, { status: 503 });
  }

  const lease = await takeMcpBridgeDnsLease(env.DB, {
    accountId: account.accountId,
    instanceId: body.instance_id,
    nowMs: Date.now(),
  });
  if (!lease.ok) {
    console.error('mcp_bridge_dns_failed', 'lease_held');
    return json({ error: 'hostname_records_unavailable' }, { status: 503 });
  }

  async function safeRelease() {
    try {
      await releaseMcpBridgeDnsLease(env.DB, {
        accountId: account.accountId,
        instanceId: body.instance_id,
        leaseGeneration: lease.generation,
      });
    } catch {}
  }

  let currentBinding = await getMcpBridgeBinding(env.DB, { accountId: account.accountId, instanceId: body.instance_id });
  let currentNow = Date.now();
  if (
    currentBinding?.dns_lease_generation !== lease.generation ||
    typeof currentBinding?.dns_lease_expires_at !== 'number' ||
    currentBinding.dns_lease_expires_at - currentNow < 10000
  ) {
    console.error('mcp_bridge_dns_failed', 'lease_expired');
    await safeRelease();
    return json({ error: 'hostname_records_unavailable' }, { status: 503 });
  }

  const listRes = await listLabelRecords(env, hostname);
  if (!listRes.ok) {
    console.error('mcp_bridge_dns_failed', listRes.reason);
    await safeRelease();
    return json({ error: 'hostname_records_unavailable' }, { status: 503 });
  }

  currentBinding = await getMcpBridgeBinding(env.DB, { accountId: account.accountId, instanceId: body.instance_id });
  currentNow = Date.now();
  if (
    currentBinding?.dns_lease_generation !== lease.generation ||
    typeof currentBinding?.dns_lease_expires_at !== 'number' ||
    currentBinding.dns_lease_expires_at - currentNow < 10000
  ) {
    console.error('mcp_bridge_dns_failed', 'lease_expired');
    await safeRelease();
    return json({ error: 'hostname_records_unavailable' }, { status: 503 });
  }

  const targetPinUri = currentBinding.acme_account_uri;
  if (!targetPinUri) {
    console.error('mcp_bridge_dns_failed', 'pin_missing');
    await safeRelease();
    return json({ error: 'hostname_records_unavailable' }, { status: 503 });
  }

  if (listRes.records.length === 0) {
    const countRes = await countZoneRecords(env);
    if (!countRes.ok) {
      console.error('mcp_bridge_dns_failed', countRes.reason);
      await safeRelease();
      return json({ error: 'hostname_records_unavailable' }, { status: 503 });
    }
    const distinctAddressCount = new Set(signing.addresses).size;
    if (countRes.totalCount + 1 + distinctAddressCount > ceiling) {
      console.error('mcp_bridge_dns_capacity', countRes.totalCount);
      try {
        const claimed = await claimSolstoneMeDnsCapacityAlert(env.DB, { nowMs: Date.now() });
        if (claimed) {
          emitSecurityEvent(env, ctx, {
            office: 'cto',
            type: 'solstone_me_dns_capacity',
            record_count: countRes.totalCount,
          });
        }
      } catch {}
      await safeRelease();
      return json({ error: 'hostname_capacity' }, { status: 503 });
    }
  }

  const plan = planLabelBatch(listRes.records, {
    hostname,
    accountUri: targetPinUri,
    addresses: signing.addresses,
  });

  if (plan !== null) {
    currentBinding = await getMcpBridgeBinding(env.DB, { accountId: account.accountId, instanceId: body.instance_id });
    currentNow = Date.now();
    if (
      currentBinding?.dns_lease_generation !== lease.generation ||
      typeof currentBinding?.dns_lease_expires_at !== 'number' ||
      currentBinding.dns_lease_expires_at - currentNow < 10000
    ) {
      console.error('mcp_bridge_dns_failed', 'lease_expired');
      await safeRelease();
      return json({ error: 'hostname_records_unavailable' }, { status: 503 });
    }

    const batchRes = await applyLabelBatch(env, plan);
    if (!batchRes.ok) {
      console.error('mcp_bridge_dns_failed', batchRes.reason);
      await safeRelease();
      return json({ error: 'hostname_records_unavailable' }, { status: 503 });
    }

    currentBinding = await getMcpBridgeBinding(env.DB, { accountId: account.accountId, instanceId: body.instance_id });
    currentNow = Date.now();
    if (
      currentBinding?.dns_lease_generation !== lease.generation ||
      typeof currentBinding?.dns_lease_expires_at !== 'number' ||
      currentBinding.dns_lease_expires_at - currentNow < 10000
    ) {
      console.error('mcp_bridge_dns_failed', 'lease_expired');
      await safeRelease();
      return json({ error: 'hostname_records_unavailable' }, { status: 503 });
    }

    const readbackRes = await listLabelRecords(env, hostname);
    if (!readbackRes.ok) {
      console.error('mcp_bridge_dns_failed', readbackRes.reason);
      await safeRelease();
      return json({ error: 'hostname_records_unavailable' }, { status: 503 });
    }

    if (!labelRecordsMatch(readbackRes.records, { hostname, accountUri: targetPinUri, addresses: signing.addresses })) {
      console.error('mcp_bridge_dns_failed', 'readback_mismatch');
      await safeRelease();
      return json({ error: 'hostname_records_unavailable' }, { status: 503 });
    }
  }

  let commitOk = false;
  try {
    commitOk = await commitMcpBridgeProvisionalVerification(env.DB, {
      accountId: account.accountId,
      instanceId: body.instance_id,
      leaseGeneration: lease.generation,
      verifiedUri: targetPinUri,
      verifiedAddressesJson: canonicalAddressesJson,
      nowMs: Date.now(),
    });
  } catch (err) {
    logBridgeTokenFailure('commit_provisional_verification', err);
  }

  if (!commitOk) {
    await safeRelease();
    currentBinding = await getMcpBridgeBinding(env.DB, { accountId: account.accountId, instanceId: body.instance_id });
    if (currentBinding?.acme_account_uri === requestAccountUri) {
      console.error('mcp_bridge_dns_failed', 'commit_failed');
      return json({ error: 'hostname_records_unavailable' }, { status: 503 });
    } else {
      return json({ error: 'acme_account_changed' }, { status: 409 });
    }
  }

  if (targetPinUri !== requestAccountUri) {
    return json({ error: 'acme_account_changed' }, { status: 409 });
  }

  currentBinding = await getMcpBridgeBinding(env.DB, { accountId: account.accountId, instanceId: body.instance_id });
  return mintAndReturnResponse(signing, body.instance_id, hostname, cnfJwk, currentBinding?.acme_account_replaced_at);
}

async function mintAndReturnResponse(signing, instanceId, hostname, cnfJwk, acmeAccountReplacedAt) {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + BRIDGE_TOKEN_TTL_SECONDS;
  let token;
  try {
    token = await mintMcpBridgeToken(signing, {
      instanceId,
      hostname,
      cnfJwk,
      iat,
    });
  } catch (err) {
    logBridgeTokenFailure('mint_token', err);
    return json({ error: 'token_mint_unavailable' }, { status: 503 });
  }
  const res = {
    token,
    token_type: 'Bearer',
    expires_in: BRIDGE_TOKEN_TTL_SECONDS,
    expires_at: new Date(exp * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    instance_id: instanceId,
    hostname,
    bridge_id: signing.bridgeId,
    bridge_addresses: signing.addresses,
  };
  if (typeof acmeAccountReplacedAt === 'number') {
    res.acme_account_replaced_at = new Date(Math.floor(acmeAccountReplacedAt / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  return json(res);
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
