// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { SignJWT, exportJWK, importJWK, generateKeyPair, calculateJwkThumbprint } from 'jose';

const CLIENT_ID = 'https://scouts.solstone.app/client-metadata.json';
const REDIRECT_URI = 'https://scouts.solstone.app/callback';
const SCOPE = 'atproto transition:generic';

const CLIENT_METADATA = {
  client_id: CLIENT_ID,
  application_type: 'web',
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  redirect_uris: [REDIRECT_URI],
  scope: SCOPE,
  token_endpoint_auth_method: 'none',
  dpop_bound_access_tokens: true,
  client_name: 'solstone scouts',
  client_uri: 'https://scouts.solstone.app',
};

export function getClientMetadata() {
  return CLIENT_METADATA;
}

// Resolve a Bluesky handle to a DID
export async function resolveHandle(handle) {
  handle = handle.trim().toLowerCase().replace(/^@/, '');

  // Try DNS TXT _atproto.{handle} first
  try {
    const dnsRes = await fetch(
      `https://dns.google/resolve?name=_atproto.${handle}&type=TXT`,
      { headers: { Accept: 'application/dns-json' } }
    );
    if (dnsRes.ok) {
      const dns = await dnsRes.json();
      if (dns.Answer) {
        for (const ans of dns.Answer) {
          const txt = ans.data?.replace(/"/g, '') || '';
          if (txt.startsWith('did=')) return txt.slice(4);
        }
      }
    }
  } catch {}

  // Fallback: HTTPS well-known
  try {
    const res = await fetch(`https://${handle}/.well-known/atproto-did`);
    if (res.ok) {
      const did = (await res.text()).trim();
      if (did.startsWith('did:')) return did;
    }
  } catch {}

  // Fallback: bsky.social resolveHandle XRPC
  const xrpcRes = await fetch(
    `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
  );
  if (!xrpcRes.ok) throw new Error(`could not resolve handle: ${handle}`);
  const { did } = await xrpcRes.json();
  return did;
}

// Resolve a DID to its DID document
async function resolveDidDocument(did) {
  if (did.startsWith('did:plc:')) {
    const res = await fetch(`https://plc.directory/${did}`);
    if (!res.ok) throw new Error(`could not resolve DID: ${did}`);
    return res.json();
  }
  if (did.startsWith('did:web:')) {
    const domain = did.slice(8).replace(/%3A/g, ':');
    const res = await fetch(`https://${domain}/.well-known/did.json`);
    if (!res.ok) throw new Error(`could not resolve DID: ${did}`);
    return res.json();
  }
  throw new Error(`unsupported DID method: ${did}`);
}

// Extract PDS endpoint from DID document
function getPdsEndpoint(didDoc) {
  const service = didDoc.service?.find(
    (s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer'
  );
  if (!service?.serviceEndpoint) throw new Error('no PDS endpoint in DID document');
  return service.serviceEndpoint;
}

// Discover the authorization server from a PDS via protected resource metadata
async function discoverAuthServer(pdsUrl) {
  // Step 1: fetch the resource server metadata to find the authorization server
  const rsRes = await fetch(`${pdsUrl}/.well-known/oauth-protected-resource`);
  if (!rsRes.ok) throw new Error(`could not fetch protected resource metadata from ${pdsUrl}`);
  const rsMeta = await rsRes.json();
  const authServers = rsMeta.authorization_servers;
  if (!authServers?.length) throw new Error(`no authorization servers listed for ${pdsUrl}`);
  const authServerUrl = authServers[0];

  // Step 2: fetch the authorization server metadata
  const asRes = await fetch(`${authServerUrl}/.well-known/oauth-authorization-server`);
  if (!asRes.ok) throw new Error(`could not fetch auth server metadata from ${authServerUrl}`);
  return asRes.json();
}

// Generate a PKCE code verifier and challenge
function generatePkce() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const verifier = base64url(bytes);
  return verifier;
}

async function computeChallenge(verifier) {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return base64url(new Uint8Array(digest));
}

// Generate a DPoP key pair and export for storage
async function generateDpopKeyPair() {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  const privateJwk = await exportJWK(privateKey);
  // Ensure kty and crv are on both
  privateJwk.kty = publicJwk.kty = 'EC';
  privateJwk.crv = publicJwk.crv = 'P-256';
  return { publicJwk, privateJwk };
}

// Create a DPoP proof JWT
async function createDpopProof(privateJwk, method, url, nonce) {
  const privateKey = await importJWK(privateJwk, 'ES256');
  const publicJwk = { ...privateJwk };
  delete publicJwk.d;

  const builder = new SignJWT({
    htm: method,
    htu: url.split('?')[0],
    jti: crypto.randomUUID(),
    ...(nonce ? { nonce } : {}),
  })
    .setProtectedHeader({
      alg: 'ES256',
      typ: 'dpop+jwt',
      jwk: publicJwk,
    })
    .setIssuedAt();

  return builder.sign(privateKey);
}

// Start the OAuth login flow — returns a redirect URL
export async function startLogin(handle, db) {
  // 1. Resolve identity chain
  const did = await resolveHandle(handle);
  const didDoc = await resolveDidDocument(did);
  const pdsUrl = getPdsEndpoint(didDoc);
  const authServerMeta = await discoverAuthServer(pdsUrl);

  // 2. Generate PKCE + DPoP
  const codeVerifier = generatePkce();
  const codeChallenge = await computeChallenge(codeVerifier);
  const { publicJwk, privateJwk } = await generateDpopKeyPair();
  const dpopJkt = await calculateJwkThumbprint(publicJwk, 'sha256');
  const state = crypto.randomUUID();

  // 3. Store state in D1 (including resolved DID for sub verification)
  await db
    .prepare(
      'INSERT INTO oauth_state (state, code_verifier, dpop_private_key, authorization_server, redirect_uri, did) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .bind(state, codeVerifier, JSON.stringify(privateJwk), JSON.stringify(authServerMeta), REDIRECT_URI, did)
    .run();

  // 4. Pushed Authorization Request (PAR) — mandatory per AT Protocol spec
  const parEndpoint = authServerMeta.pushed_authorization_request_endpoint;
  if (!parEndpoint) throw new Error('authorization server does not support PAR (required by AT Protocol)');

  const dpopProof = await createDpopProof(privateJwk, 'POST', parEndpoint);

  const parParams = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    login_hint: handle,
    dpop_jkt: dpopJkt,
  });

  let parRes = await fetch(parEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      DPoP: dpopProof,
    },
    body: parParams.toString(),
  });

  // Handle DPoP nonce requirement (server returns use_dpop_nonce error with DPoP-Nonce header)
  if (parRes.status === 400 || parRes.status === 401) {
    const nonce = parRes.headers.get('DPoP-Nonce');
    if (nonce) {
      const retryProof = await createDpopProof(privateJwk, 'POST', parEndpoint, nonce);
      parRes = await fetch(parEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          DPoP: retryProof,
        },
        body: parParams.toString(),
      });
    }
  }

  if (!parRes.ok) {
    const errBody = await parRes.text();
    throw new Error(`PAR request failed (${parRes.status}): ${errBody}`);
  }

  const { request_uri } = await parRes.json();
  const authUrl = new URL(authServerMeta.authorization_endpoint);
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('request_uri', request_uri);
  return authUrl.toString();
}

// Handle the OAuth callback — returns { did, handle }
export async function handleCallback(code, state, db) {
  // 1. Look up state
  const row = await db
    .prepare('SELECT * FROM oauth_state WHERE state = ?')
    .bind(state)
    .first();
  if (!row) throw new Error('invalid or expired OAuth state');

  // Clean up used state
  await db.prepare('DELETE FROM oauth_state WHERE state = ?').bind(state).run();

  const codeVerifier = row.code_verifier;
  const privateJwk = JSON.parse(row.dpop_private_key);
  const authServerMeta = JSON.parse(row.authorization_server);
  const tokenEndpoint = authServerMeta.token_endpoint;

  // 2. Create DPoP proof for token request
  const dpopProof = await createDpopProof(privateJwk, 'POST', tokenEndpoint);

  // 3. Exchange code for tokens
  const tokenParams = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: codeVerifier,
  });

  let tokenRes = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      DPoP: dpopProof,
    },
    body: tokenParams.toString(),
  });

  // Handle DPoP nonce requirement
  if (tokenRes.status === 400 || tokenRes.status === 401) {
    const nonce = tokenRes.headers.get('DPoP-Nonce');
    if (nonce) {
      const retryProof = await createDpopProof(privateJwk, 'POST', tokenEndpoint, nonce);
      tokenRes = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          DPoP: retryProof,
        },
        body: tokenParams.toString(),
      });
    }
  }

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    throw new Error(`token exchange failed (${tokenRes.status}): ${errBody}`);
  }

  const tokenData = await tokenRes.json();

  // 4. Extract and verify the sub claim
  const did = tokenData.sub;
  if (!did || !did.startsWith('did:')) {
    throw new Error('token response missing valid sub (DID)');
  }

  // Verify sub matches the DID resolved during login initiation
  if (row.did && did !== row.did) {
    throw new Error('token sub does not match resolved identity — possible impersonation');
  }

  // Verify the identity chain: DID → PDS → auth server must be consistent
  const didDoc = await resolveDidDocument(did);
  const verifyPds = getPdsEndpoint(didDoc);
  const verifyRsMeta = await fetch(`${verifyPds}/.well-known/oauth-protected-resource`).then((r) =>
    r.ok ? r.json() : null
  );
  if (
    !verifyRsMeta?.authorization_servers?.length ||
    verifyRsMeta.authorization_servers[0] !== authServerMeta.issuer
  ) {
    throw new Error('identity chain verification failed — PDS auth server mismatch');
  }

  // Extract handle from DID document and verify bidirectionally
  const handle =
    didDoc.alsoKnownAs?.find((a) => a.startsWith('at://'))?.slice(5) || did;

  return { did, handle };
}

// Clean up expired OAuth states (call periodically)
export async function cleanupOAuthState(db) {
  // Delete states older than 10 minutes
  await db
    .prepare("DELETE FROM oauth_state WHERE created_at < datetime('now', '-10 minutes')")
    .run();
}

function base64url(bytes) {
  const str = btoa(String.fromCharCode(...bytes));
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
