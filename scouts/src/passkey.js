// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

// Passkey (WebAuthn) registration + authentication for return-access.
// Layered on top of atmos + email auth — enrollment requires an existing
// session; recovery falls back to the original auth path.
//
// RP ID is the apex `solstone.app` so the same passkey carries forward to
// `account.solstone.app` after the planned migration with zero re-enrollment.

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

import {
  createSession,
  getActivePasskeysForScout,
  insertPasskeyCredential,
  getPasskeyCredentialById,
  updatePasskeyCredentialOnAuth,
  insertPasskeyChallenge,
  consumePasskeyChallenge,
  setPasskeyUserHandleIfMissing,
  getPasskeyUserHandle,
  bumpRateBucket,
  getRateBucketCount,
} from './db.js';

import { hashKey } from './otp.js';

const RP_ID = 'solstone.app';
const RP_NAME = 'solstone';
const EXPECTED_ORIGIN = 'https://scouts.solstone.app';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;       // 5 minutes
const SESSION_MAX_AGE = 14 * 24 * 60 * 60;    // 2 weeks (matches OTP path)

// Rate limits — D1 rate_buckets, same substrate as the OTP path.
const REGISTER_PER_SCOUT_PER_HOUR = 5;
const REGISTER_PER_IP_PER_HOUR = 20;
const AUTH_PER_IP_PER_HOUR = 60;

const SESSION_COOKIE = 'scouts_session';

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

function sessionCookie(sessionId, maxAge = SESSION_MAX_AGE) {
  return `${SESSION_COOKIE}=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

// --- base64url helpers (browser-compatible, no Buffer) ---

function b64uEncode(bytes) {
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uDecode(s) {
  const pad = s.length % 4 === 2 ? '==' : s.length % 4 === 3 ? '=' : '';
  const std = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(std);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// --- helpers shared across register + auth ---

function hourBucket() {
  return new Date().toISOString().slice(0, 13); // 'YYYY-MM-DDTHH'
}

function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP') || '0.0.0.0';
}

async function recordChallenge(db, challengeB64u, scoutId, purpose) {
  const now = Date.now();
  await insertPasskeyChallenge(db, {
    challenge: challengeB64u,
    scoutId,
    purpose,
    expiresAt: now + CHALLENGE_TTL_MS,
    createdAt: now,
  });
}

async function ensurePasskeyUserHandle(db, scoutId) {
  const existing = await getPasskeyUserHandle(db, scoutId);
  if (existing) return existing;
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  const encoded = b64uEncode(buf);
  // Race-safe: if a concurrent request also wrote, the IF MISSING guard keeps
  // whichever landed first. We re-read to return the winning value.
  await setPasskeyUserHandleIfMissing(db, scoutId, encoded);
  return (await getPasskeyUserHandle(db, scoutId)) || encoded;
}

// --- request handlers ---

export async function handlePasskeyRoute(request, env, path, ctx) {
  if (env.PASSKEY_PATH_DISABLED === 'true') {
    return jsonResponse({ error: 'passkey path disabled' }, 503);
  }

  // Origin/Referer guard — same shape as the email path.
  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');
  const allowed = origin === EXPECTED_ORIGIN || (referer && referer.startsWith(`${EXPECTED_ORIGIN}/`));
  if (!allowed) {
    return jsonResponse({ error: 'invalid request' }, 403);
  }

  const method = request.method;

  if (path === '/passkey/register/start' && method === 'POST') {
    return registerStart(request, env, ctx);
  }
  if (path === '/passkey/register/finish' && method === 'POST') {
    return registerFinish(request, env, ctx);
  }
  if (path === '/passkey/auth/start' && method === 'POST') {
    return authStart(request, env);
  }
  if (path === '/passkey/auth/finish' && method === 'POST') {
    return authFinish(request, env);
  }
  return jsonResponse({ error: 'not found' }, 404);
}

// --- registration ---

async function registerStart(request, env, ctx) {
  const db = env.DB;
  const scout = ctx.scout;
  if (!scout) return jsonResponse({ error: 'sign-in required' }, 401);

  const ip = getClientIp(request);
  const ipKey = await hashKey('ip', ip, env.ENCRYPTION_SECRET);
  const scoutKey = await hashKey('scout', scout.id, env.ENCRYPTION_SECRET);
  const ipCount = await getRateBucketCount(db, 'ip-passkey-reg', ipKey, hourBucket());
  const scoutCount = await getRateBucketCount(db, 'scout-passkey-reg', scoutKey, hourBucket());
  await bumpRateBucket(db, 'ip-passkey-reg', ipKey, hourBucket());
  await bumpRateBucket(db, 'scout-passkey-reg', scoutKey, hourBucket());
  if (ipCount >= REGISTER_PER_IP_PER_HOUR || scoutCount >= REGISTER_PER_SCOUT_PER_HOUR) {
    return jsonResponse({ error: 'too many attempts; try again later' }, 429);
  }

  const handleB64u = await ensurePasskeyUserHandle(db, scout.id);
  const userIDBytes = b64uDecode(handleB64u);

  const existing = await getActivePasskeysForScout(db, scout.id);
  const excludeCredentials = existing.map((row) => ({
    id: row.credential_id,
    type: 'public-key',
    transports: row.transports ? safeParseArray(row.transports) : undefined,
  }));

  const displayName = scout.handle || scout.email || scout.id;

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: userIDBytes,
    userName: displayName,
    userDisplayName: displayName,
    timeout: 60_000,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'preferred',
    },
    excludeCredentials,
    supportedAlgorithmIDs: [-7, -257, -8],
    hints: ['client-device', 'hybrid'],
  });

  await recordChallenge(db, options.challenge, scout.id, 'register');

  return jsonResponse({ options });
}

async function registerFinish(request, env, ctx) {
  const db = env.DB;
  const scout = ctx.scout;
  if (!scout) return jsonResponse({ error: 'sign-in required' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid body' }, 400);
  }
  const response = body?.response;
  const friendlyName = typeof body?.friendly_name === 'string'
    ? body.friendly_name.slice(0, 64).trim() || null
    : null;
  if (!response || typeof response !== 'object') {
    return jsonResponse({ error: 'response required' }, 400);
  }

  const expectedChallenge = response?.response?.clientDataJSON
    ? extractChallengeFromClientData(response.response.clientDataJSON)
    : null;
  if (!expectedChallenge) {
    return jsonResponse({ error: 'invalid client data' }, 400);
  }

  const challengeRow = await consumePasskeyChallenge(db, expectedChallenge, 'register');
  if (!challengeRow || challengeRow.scout_id !== scout.id) {
    return jsonResponse({ error: 'challenge expired or invalid' }, 400);
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: false,
    });
  } catch (err) {
    console.error('passkey register verify failed:', err?.message || err);
    return jsonResponse({ error: 'registration could not be verified' }, 400);
  }
  if (!verification.verified || !verification.registrationInfo) {
    return jsonResponse({ error: 'registration could not be verified' }, 400);
  }

  const info = verification.registrationInfo;
  const credential = info.credential;
  const credentialIDB64u = credential.id;
  const publicKeyB64u = b64uEncode(credential.publicKey);
  const transports = Array.isArray(credential.transports) ? credential.transports : null;

  const now = Date.now();
  await insertPasskeyCredential(db, {
    credentialId: credentialIDB64u,
    scoutId: scout.id,
    publicKey: publicKeyB64u,
    counter: credential.counter || 0,
    aaguid: info.aaguid || null,
    transports: transports ? JSON.stringify(transports) : null,
    isDiscoverable: info.credentialDeviceType === 'multiDevice' || credential.transports?.includes('internal') ? 1 : 1,
    backupEligible: info.credentialBackedUp ? 1 : 0,
    backupState: info.credentialBackedUp ? 1 : 0,
    friendlyName: friendlyName,
    createdAt: now,
  });

  return jsonResponse({
    ok: true,
    credential_id: credentialIDB64u,
    friendly_name: friendlyName,
  });
}

// --- authentication ---

async function authStart(request, env) {
  const db = env.DB;
  const ip = getClientIp(request);
  const ipKey = await hashKey('ip', ip, env.ENCRYPTION_SECRET);
  const ipCount = await getRateBucketCount(db, 'ip-passkey-auth', ipKey, hourBucket());
  await bumpRateBucket(db, 'ip-passkey-auth', ipKey, hourBucket());
  if (ipCount >= AUTH_PER_IP_PER_HOUR) {
    return jsonResponse({ error: 'too many attempts; try again later' }, 429);
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: 'preferred',
    allowCredentials: [],
    timeout: 60_000,
  });

  await recordChallenge(db, options.challenge, null, 'authenticate');

  return jsonResponse({ options });
}

async function authFinish(request, env) {
  const db = env.DB;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid body' }, 400);
  }
  const response = body?.response;
  if (!response || typeof response !== 'object') {
    return jsonResponse({ error: 'response required' }, 400);
  }

  const challenge = response?.response?.clientDataJSON
    ? extractChallengeFromClientData(response.response.clientDataJSON)
    : null;
  if (!challenge) {
    return jsonResponse({ error: 'invalid client data' }, 400);
  }

  const challengeRow = await consumePasskeyChallenge(db, challenge, 'authenticate');
  if (!challengeRow) {
    return jsonResponse({ error: 'challenge expired or invalid' }, 400);
  }

  const credentialId = response?.id;
  if (!credentialId || typeof credentialId !== 'string') {
    return jsonResponse({ error: 'sign-in failed' }, 401);
  }

  const credRow = await getPasskeyCredentialById(db, credentialId);
  if (!credRow) {
    return jsonResponse({ error: 'sign-in failed' }, 401);
  }

  // userHandle binding: response.response.userHandle (base64url) must match
  // the scout's stored passkey_user_handle. Defends against credential
  // substitution.
  const expectedHandle = await getPasskeyUserHandle(db, credRow.scout_id);
  const reportedHandle = response?.response?.userHandle || null;
  if (!expectedHandle || !reportedHandle || reportedHandle !== expectedHandle) {
    return jsonResponse({ error: 'sign-in failed' }, 401);
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: credRow.credential_id,
        publicKey: b64uDecode(credRow.public_key),
        counter: credRow.counter || 0,
      },
      requireUserVerification: false,
    });
  } catch (err) {
    console.error('passkey auth verify failed:', err?.message || err);
    return jsonResponse({ error: 'sign-in failed' }, 401);
  }

  if (!verification.verified) {
    return jsonResponse({ error: 'sign-in failed' }, 401);
  }

  // Counter recorded but never enforced — synced passkeys stay at 0.
  const newCounter = verification.authenticationInfo?.newCounter ?? credRow.counter ?? 0;
  await updatePasskeyCredentialOnAuth(db, credRow.credential_id, newCounter, Date.now());

  const session = await createSession(db, credRow.scout_id);
  return jsonResponse(
    { ok: true, redirect: '/dashboard' },
    200,
    { 'Set-Cookie': sessionCookie(session.id) }
  );
}

// --- admin endpoints ---

export async function handleAdminPasskey(request, env, path) {
  const db = env.DB;
  const method = request.method;

  // POST /admin/scouts/<scout-id>/passkey/list  (GET would be more REST but
  // the existing admin uses POST + JSON body for everything; mirror that.)
  const listMatch = path.match(/^\/admin\/scouts\/(.+)\/passkey\/list$/);
  if (listMatch && method === 'POST') {
    const id = decodeURIComponent(listMatch[1]);
    const credentials = await getActivePasskeysForScout(db, id);
    return jsonResponse({
      passkeys: credentials.map((row) => ({
        credential_id: row.credential_id,
        scout_id: row.scout_id,
        friendly_name: row.friendly_name,
        aaguid: row.aaguid,
        transports: row.transports ? safeParseArray(row.transports) : [],
        created_at: row.created_at,
        last_used_at: row.last_used_at,
      })),
    });
  }

  // POST /admin/scouts/passkey/<credential-id>/revoke
  const revokeMatch = path.match(/^\/admin\/scouts\/passkey\/(.+)\/revoke$/);
  if (revokeMatch && method === 'POST') {
    const credentialId = decodeURIComponent(revokeMatch[1]);
    const cred = await getPasskeyCredentialById(db, credentialId);
    if (!cred) return jsonResponse({ error: 'credential not found' }, 404);
    await db
      .prepare("UPDATE passkey_credentials SET revoked_at = ? WHERE credential_id = ? AND revoked_at IS NULL")
      .bind(Date.now(), credentialId)
      .run();
    return jsonResponse({ ok: true, credential_id: credentialId, action: 'revoked' });
  }

  return null; // signal "not a passkey admin route"
}

// --- cron sweep ---

export async function cleanupPasskeyChallenges(db) {
  const now = Date.now();
  await db
    .prepare('DELETE FROM passkey_challenges WHERE used_at IS NULL AND expires_at < ?')
    .bind(now)
    .run();
  await db
    .prepare('DELETE FROM passkey_challenges WHERE used_at IS NOT NULL AND created_at < ?')
    .bind(now - 24 * 60 * 60 * 1000)
    .run();
}

// --- internal helpers ---

function safeParseArray(s) {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function extractChallengeFromClientData(clientDataJSONB64u) {
  try {
    const bytes = b64uDecode(clientDataJSONB64u);
    const text = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(text);
    return typeof parsed?.challenge === 'string' ? parsed.challenge : null;
  } catch {
    return null;
  }
}
