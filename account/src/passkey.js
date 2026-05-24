import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';

import { decryptEmail, generateSessionToken, hashKey, hashWithPepper } from './crypto.js';
import {
  bumpRateBucket,
  consumePasskeyChallenge,
  createSession,
  getDashboardData,
  getPasskeyCredential,
  getPasskeyUserHandle,
  getRateBucketCount,
  insertPasskeyChallenge,
  insertPasskeyCredential,
  listPasskeyCredentialsForAccount,
  setPasskeyUserHandleIfMissing,
  updateAccountLastSignin,
  updatePasskeyCredentialCounter,
} from './db.js';
import { getValidSession, sessionCookie } from './session.js';

const RP_ID = 'solstone.app';
const RP_NAME = 'solstone';
const EXPECTED_ORIGIN = 'https://services.solstone.app';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const REGISTER_PER_ACCOUNT_PER_HOUR = 5;
const REGISTER_PER_IP_PER_HOUR = 20;
const AUTH_PER_IP_PER_HOUR = 60;
const SUPPORTED_ALGORITHM_IDS = [-7, -257, -8];
const HINTS = ['client-device', 'hybrid'];

export async function passkeyRegisterStart(req, env) {
  try {
    const guard = await requirePasskeySession(req, env, 'passkey_register_start');
    if (guard instanceof Response) return guard;
    const { accountId, nowMs } = guard;
    const limited = await checkRegisterRateLimit(req, env, accountId, nowMs);
    if (limited) return limited;

    const handleB64u = await ensurePasskeyUserHandle(env.DB, accountId);
    if (!handleB64u) return fail('passkey_register_start_session', 401, 'sign-in required');

    const existing = await listPasskeyCredentialsForAccount(env.DB, accountId);
    const excludeCredentials = existing.map((row) => ({
      id: row.credential_id,
      type: 'public-key',
      transports: row.transports ? safeParseArray(row.transports) : undefined,
    }));
    const displayName = await getDisplayName(env, accountId);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: b64uDecode(handleB64u),
      userName: displayName,
      userDisplayName: displayName,
      timeout: 60_000,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
      },
      excludeCredentials,
      supportedAlgorithmIDs: SUPPORTED_ALGORITHM_IDS,
      hints: HINTS,
    });

    await insertPasskeyChallenge(env.DB, {
      challenge: options.challenge,
      accountId,
      purpose: 'register',
      createdAt: nowMs,
      expiresAt: nowMs + CHALLENGE_TTL_MS,
    });
    return jsonResponse({ options });
  } catch {
    return fail('passkey_register_start_failed', 500, 'passkey request failed');
  }
}

export async function passkeyRegisterFinish(req, env) {
  try {
    const guard = await requirePasskeySession(req, env, 'passkey_register_finish');
    if (guard instanceof Response) return guard;
    const { accountId, nowMs } = guard;

    const body = await parseJsonBody(req, 'passkey_register_finish_body');
    if (body instanceof Response) return body;
    const response = body?.response;
    if (!response || typeof response !== 'object') {
      return fail('passkey_register_finish_response', 400, 'response required');
    }
    const friendlyName = normalizeFriendlyName(body?.friendly_name);
    const expectedChallenge = response?.response?.clientDataJSON
      ? extractChallengeFromClientData(response.response.clientDataJSON)
      : null;
    if (!expectedChallenge) {
      return fail('passkey_register_finish_client_data', 400, 'invalid client data');
    }

    const challengeRow = await consumePasskeyChallenge(env.DB, {
      challenge: expectedChallenge,
      purpose: 'register',
      nowMs,
    });
    if (!challengeRow || challengeRow.account_id !== accountId) {
      return fail('passkey_register_finish_challenge', 400, 'challenge expired or invalid');
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
    } catch {
      return fail('passkey_register_verify_failed', 400, 'registration could not be verified');
    }
    if (!verification.verified || !verification.registrationInfo) {
      return fail('passkey_register_finish_verify', 400, 'registration could not be verified');
    }

    const info = verification.registrationInfo;
    const credential = info.credential;
    const transports = Array.isArray(credential.transports)
      ? credential.transports
      : Array.isArray(response.response?.transports)
        ? response.response.transports
        : null;
    try {
      await insertPasskeyCredential(env.DB, {
        credentialId: credential.id,
        accountId,
        publicKey: credential.publicKey,
        counter: credential.counter || 0,
        aaguid: info.aaguid || null,
        transports: transports ? JSON.stringify(transports) : null,
        backupEligible: info.credentialDeviceType === 'multiDevice',
        backupState: info.credentialBackedUp === true,
        deviceType: info.credentialDeviceType || null,
        friendlyName,
        createdAt: nowMs,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return fail('passkey_register_finish_insert', 409, 'passkey already registered');
    }

    return jsonResponse({
      ok: true,
      credential_id: credential.id,
      friendly_name: friendlyName,
    });
  } catch {
    return fail('passkey_register_finish_failed', 500, 'passkey request failed');
  }
}

export async function passkeyAuthStart(req, env) {
  try {
    const guard = methodAndOriginGuard(req, env, 'passkey_auth_start');
    if (guard) return guard;
    const nowMs = Date.now();
    const ip = req.headers.get('CF-Connecting-IP') || '';
    const ipKey = await hashKey('passkey_auth_ip', ip, env);
    const ipCount = await getRateBucketCount(env.DB, ipKey, HOUR_MS, nowMs);
    if (ipCount >= AUTH_PER_IP_PER_HOUR) {
      return fail('passkey_auth_start_rate', 429, 'too many attempts; try again later');
    }
    await bumpRateBucket(env.DB, ipKey, HOUR_MS, nowMs);

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: 'preferred',
      allowCredentials: [],
      timeout: 60_000,
    });
    await insertPasskeyChallenge(env.DB, {
      challenge: options.challenge,
      accountId: null,
      purpose: 'authenticate',
      createdAt: nowMs,
      expiresAt: nowMs + CHALLENGE_TTL_MS,
    });
    return jsonResponse({ options });
  } catch {
    return fail('passkey_auth_start_failed', 500, 'passkey request failed');
  }
}

export async function passkeyAuthFinish(req, env) {
  try {
    const guard = methodAndOriginGuard(req, env, 'passkey_auth_finish');
    if (guard) return guard;
    const nowMs = Date.now();

    const body = await parseJsonBody(req, 'passkey_auth_finish_body');
    if (body instanceof Response) return body;
    const response = body?.response;
    if (!response || typeof response !== 'object') {
      return fail('passkey_auth_finish_response', 400, 'response required');
    }

    const challenge = response?.response?.clientDataJSON
      ? extractChallengeFromClientData(response.response.clientDataJSON)
      : null;
    if (!challenge) return fail('passkey_auth_finish_client_data', 400, 'invalid client data');

    const challengeRow = await consumePasskeyChallenge(env.DB, {
      challenge,
      purpose: 'authenticate',
      nowMs,
    });
    if (!challengeRow) {
      return fail('passkey_auth_finish_challenge', 400, 'challenge expired or invalid');
    }

    const credentialId = response?.id;
    if (!credentialId || typeof credentialId !== 'string') {
      return fail('passkey_auth_finish_id', 401, 'sign-in failed');
    }
    const credentialRow = await getPasskeyCredential(env.DB, credentialId);
    if (!credentialRow) return fail('passkey_auth_finish_not_found', 401, 'sign-in failed');

    const expectedHandle = await getPasskeyUserHandle(env.DB, credentialRow.account_id);
    const reportedHandle = response?.response?.userHandle || null;
    if (!expectedHandle || !reportedHandle || reportedHandle !== expectedHandle) {
      return fail('passkey_auth_finish_handle', 401, 'sign-in failed');
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPID: RP_ID,
        credential: {
          id: credentialRow.credential_id,
          publicKey: toUint8Array(credentialRow.public_key),
          counter: credentialRow.counter || 0,
        },
        requireUserVerification: false,
      });
    } catch {
      return fail('passkey_auth_verify_failed', 401, 'sign-in failed');
    }
    if (!verification.verified) return fail('passkey_auth_finish_verify', 401, 'sign-in failed');

    const newCounter = verification.authenticationInfo?.newCounter ?? credentialRow.counter ?? 0;
    await updatePasskeyCredentialCounter(env.DB, credentialRow.credential_id, newCounter, nowMs);
    await updateAccountLastSignin(env.DB, credentialRow.account_id, nowMs);

    const sessionToken = generateSessionToken();
    const idHash = await hashWithPepper(sessionToken, env);
    await createSession(env.DB, { idHash, accountId: credentialRow.account_id, nowMs });
    return jsonResponse(
      { ok: true, redirect: '/dashboard' },
      200,
      { 'Set-Cookie': sessionCookie(sessionToken) }
    );
  } catch {
    return fail('passkey_auth_finish_failed', 500, 'passkey request failed');
  }
}

export function passkeyOriginAllowed(req, _env) {
  const origin = req.headers.get('Origin');
  const referer = req.headers.get('Referer');
  if (!origin && !referer) return true;
  return (
    (typeof origin === 'string' && origin.startsWith(EXPECTED_ORIGIN)) ||
    (typeof referer === 'string' && referer.startsWith(EXPECTED_ORIGIN))
  );
}

function methodAndOriginGuard(req, env, tagBase) {
  if (req.method !== 'POST') return fail(`${tagBase}_method`, 405, 'method not allowed');
  if (!passkeyOriginAllowed(req, env)) return fail(`${tagBase}_origin`, 403, 'invalid request');
  return null;
}

async function requirePasskeySession(req, env, tagBase) {
  const guard = methodAndOriginGuard(req, env, tagBase);
  if (guard) return guard;
  const nowMs = Date.now();
  const session = await getValidSession(req, env, nowMs);
  if (!session) return fail(`${tagBase}_session`, 401, 'sign-in required');
  return { accountId: session.account_id, nowMs };
}

async function checkRegisterRateLimit(req, env, accountId, nowMs) {
  const ip = req.headers.get('CF-Connecting-IP') || '';
  const ipKey = await hashKey('passkey_register_ip', ip, env);
  const accountKey = await hashKey('passkey_register_account', accountId, env);
  const ipCount = await getRateBucketCount(env.DB, ipKey, HOUR_MS, nowMs);
  const accountCount = await getRateBucketCount(env.DB, accountKey, HOUR_MS, nowMs);
  if (ipCount >= REGISTER_PER_IP_PER_HOUR || accountCount >= REGISTER_PER_ACCOUNT_PER_HOUR) {
    return fail('passkey_register_start_rate', 429, 'too many attempts; try again later');
  }
  await bumpRateBucket(env.DB, ipKey, HOUR_MS, nowMs);
  await bumpRateBucket(env.DB, accountKey, HOUR_MS, nowMs);
  return null;
}

async function ensurePasskeyUserHandle(db, accountId) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  await setPasskeyUserHandleIfMissing(db, accountId, b64uEncode(bytes));
  return getPasskeyUserHandle(db, accountId);
}

async function getDisplayName(env, accountId) {
  const data = await getDashboardData(env.DB, accountId);
  if (!data?.addressEncrypted) return 'solstone account';
  try {
    return await decryptEmail(data.addressEncrypted, env);
  } catch {
    return 'solstone account';
  }
}

async function parseJsonBody(req, tag) {
  try {
    return await req.json();
  } catch {
    return fail(tag, 400, 'invalid body');
  }
}

export function normalizeFriendlyName(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 64) : null;
}

function extractChallengeFromClientData(clientDataJSONB64u) {
  try {
    const text = new TextDecoder().decode(b64uDecode(clientDataJSONB64u));
    const parsed = JSON.parse(text);
    return typeof parsed?.challenge === 'string' ? parsed.challenge : null;
  } catch {
    return null;
  }
}

function b64uEncode(bytes) {
  let str = '';
  for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uDecode(value) {
  const pad = value.length % 4 === 2 ? '==' : value.length % 4 === 3 ? '=' : '';
  const bin = atob(value.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return value;
}

function safeParseArray(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isUniqueViolation(error) {
  return typeof error?.message === 'string' && error.message.includes('UNIQUE constraint failed');
}

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

function fail(tag, status, message) {
  console.error(tag);
  return jsonResponse({ error: message }, status);
}
