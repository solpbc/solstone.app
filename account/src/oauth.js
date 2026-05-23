import { decryptEmail, generateSessionToken, hashKey, hashWithPepper, timingSafeEqual } from './crypto.js';
import { mintDispatchToken } from './devices.js';
import {
  consumeOauthCode,
  findActiveSameFamilyTokenNewerThan,
  findOauthTokenByRefreshHash,
  getDashboardData,
  insertOauthCode,
  insertOauthTokenPair,
  revokeOauthTokenFamily,
  rotateOauthRefreshToken,
} from './db.js';
import { layout } from './html.js';
import { json, originAllowed, redirect, html } from './index.js';
import { ensureProvisionedKey, ProvisioningBusyError } from './provisioning.js';
import { getValidSession } from './session.js';

const CLIENT_ID = 'solstone-cli';
const REQUIRED_SCOPE = 'solstone.gemini';
const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CONNECT_FIELDS = [
  'response_type',
  'client_id',
  'redirect_uri',
  'scope',
  'state',
  'code_challenge',
  'code_challenge_method',
];
const REDIRECT_URI_RE = /^http:\/\/(?:127\.0\.0\.1|\[::1\]):([0-9]{1,5})(?:\/[^?#]*)?$/;
const PKCE_CHALLENGE_RE = /^[A-Za-z0-9_-]{43,128}$/;
const PKCE_VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function handleConnectGet(req, env) {
  const url = new URL(req.url);
  const params = validateConnectParams(url.searchParams);
  if (!params.ok) return oauthError('invalid_request', 400, params.error);

  const session = await getValidSession(req, env, Date.now());
  if (!session) {
    const { next, nextSig } = await signNext(url.search.slice(1), env);
    return redirect(`/?next=${encodeURIComponent(next)}&next_sig=${encodeURIComponent(nextSig)}`, 303, {
      'Cache-Control': 'no-store',
    });
  }

  const csrf = await hashKey('csrf', 'account', env);
  const email = await primaryEmail(env, session.account_id);
  return html(renderConsent(params.value, csrf, email), { headers: { 'Cache-Control': 'no-store' } });
}

export async function handleConnectConfirm(req, env) {
  if (req.method !== 'POST') {
    return oauthError('invalid_request', 405, 'method not allowed');
  }
  if (!originAllowed(req)) return oauthError('invalid_request', 403, 'invalid origin');

  const session = await getValidSession(req, env, Date.now());
  if (!session) {
    return oauthError('invalid_request', 401, 'sign-in required');
  }

  const form = await readForm(req);
  if (!form) return oauthError('invalid_request', 400, 'invalid form');

  const csrf = await hashKey('csrf', 'account', env);
  if (!timingSafeEqual(form.get('csrf')?.toString() || '', csrf)) {
    return oauthError('invalid_request', 403, 'invalid csrf');
  }

  const params = validateConnectParams(formParams(form));
  if (!params.ok) return oauthError('invalid_request', 400, params.error);

  const nowMs = Date.now();
  const { code, codeHash } = await mintCode(env);
  await insertOauthCode(env.DB, {
    codeHash,
    accountId: session.account_id,
    clientId: params.value.client_id,
    redirectUri: params.value.redirect_uri,
    scope: params.value.scope,
    codeChallenge: params.value.code_challenge,
    codeChallengeMethod: params.value.code_challenge_method,
    nowMs,
  });
  const query = new URLSearchParams({ code, state: params.value.state });
  return redirect(`${params.value.redirect_uri}?${query.toString()}`, 303, { 'Cache-Control': 'no-store' });
}

export async function handleOauthToken(req, env) {
  if (req.method !== 'POST') return tokenError('invalid_request', 405, 'method not allowed');
  const form = await readForm(req);
  if (!form) return tokenError('invalid_request', 400, 'invalid form');

  const grantType = form.get('grant_type')?.toString() || '';
  if (grantType === 'authorization_code') return authorizationCodeGrant(form, env);
  if (grantType === 'refresh_token') return refreshTokenGrant(form, env);
  if (grantType === 'urn:ietf:params:oauth:grant-type:device_code') {
    return tokenError('unsupported_grant_type', 400);
  }
  return tokenError(grantType ? 'unsupported_grant_type' : 'invalid_request', 400);
}

export async function signNext(originalQueryString, env) {
  const next = base64Url(encoder.encode(originalQueryString));
  const nextSig = await hashWithPepper(next, env, 'HMAC_PEPPER');
  return { next, nextSig };
}

export async function verifyNext(next, nextSig, env) {
  if (typeof next !== 'string' || typeof nextSig !== 'string') return false;
  if (!/^[A-Za-z0-9_-]+$/.test(next)) return false;
  const expected = await hashWithPepper(next, env, 'HMAC_PEPPER');
  if (!timingSafeEqual(nextSig, expected)) return false;
  try {
    const params = validateConnectParams(new URLSearchParams(decodeNext(next)));
    return params.ok;
  } catch {
    return false;
  }
}

export function decodeNext(next) {
  return decoder.decode(base64UrlDecode(next));
}

export function validateConnectParams(params) {
  const values = {};
  const keys = Array.from(params.keys());
  if (keys.some((key) => !CONNECT_FIELDS.includes(key))) {
    return { ok: false, error: 'unknown parameter' };
  }
  for (const field of CONNECT_FIELDS) {
    const all = params.getAll(field);
    if (all.length !== 1 || !all[0]) return { ok: false, error: `invalid ${field}` };
    values[field] = all[0];
  }
  if (values.response_type !== 'code') return { ok: false, error: 'invalid response_type' };
  if (values.client_id !== CLIENT_ID) return { ok: false, error: 'invalid client_id' };
  if (!redirectUriValid(values.redirect_uri)) return { ok: false, error: 'invalid redirect_uri' };
  if (values.code_challenge_method !== 'S256') return { ok: false, error: 'invalid code_challenge_method' };
  if (!PKCE_CHALLENGE_RE.test(values.code_challenge)) return { ok: false, error: 'invalid code_challenge' };
  if (!values.scope.split(/\s+/).includes(REQUIRED_SCOPE)) return { ok: false, error: 'invalid scope' };
  if (!values.state) return { ok: false, error: 'invalid state' };
  return { ok: true, value: values };
}

async function authorizationCodeGrant(form, env) {
  const code = form.get('code')?.toString() || '';
  const redirectUri = form.get('redirect_uri')?.toString() || '';
  const clientId = form.get('client_id')?.toString() || '';
  const verifier = form.get('code_verifier')?.toString() || '';
  if (!code || !redirectUri || !clientId || !verifier) return tokenError('invalid_request', 400);
  if (clientId !== CLIENT_ID) return tokenError('invalid_client', 400);
  if (!PKCE_VERIFIER_RE.test(verifier)) return tokenError('invalid_request', 400);

  const nowMs = Date.now();
  const codeHash = await hashCode(code, env);
  const row = await consumeOauthCode(env.DB, { codeHash, nowMs });
  if (!row) return tokenError('invalid_grant', 400);
  if (row.client_id !== CLIENT_ID) return tokenError('invalid_client', 400);
  if (row.redirect_uri !== redirectUri) return tokenError('invalid_grant', 400);
  if (row.code_challenge_method !== 'S256') return tokenError('invalid_grant', 400);
  if (!await pkceVerifierMatches(verifier, row.code_challenge)) return tokenError('invalid_grant', 400);

  const tokenPair = await mintTokenPair(env, {
    accountId: row.account_id,
    scope: row.scope,
  });
  await insertOauthTokenPair(env.DB, {
    accountId: row.account_id,
    familyId: tokenPair.familyId,
    accessHash: tokenPair.accessHash,
    refreshHash: tokenPair.refreshHash,
    scope: row.scope,
    nowMs,
    accessTtlMs: ACCESS_TTL_MS,
    refreshTtlMs: REFRESH_TTL_MS,
  });
  const dispatch = await mintDispatchToken(env, row.account_id);
  let apiKey;
  try {
    apiKey = await ensureProvisionedKey({ env, accountId: row.account_id });
  } catch (error) {
    if (error instanceof ProvisioningBusyError) {
      return tokenError('server_error', 503, 'provisioning in flight', { 'Retry-After': '2' });
    }
    return tokenError('server_error', 500);
  }
  return tokenJson({
    access_token: tokenPair.accessToken,
    refresh_token: tokenPair.refreshToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_MS / 1000,
    scope: row.scope,
    provisioned: { gemini: { api_key: apiKey } },
    dispatch_token: dispatch.token,
    account_id: row.account_id,
  });
}

async function refreshTokenGrant(form, env) {
  const refreshToken = form.get('refresh_token')?.toString() || '';
  if (!refreshToken) return tokenError('invalid_request', 400);
  const nowMs = Date.now();
  const refreshHash = await hashRefreshToken(refreshToken, env);
  const row = await findOauthTokenByRefreshHash(env.DB, { refreshHash });
  if (!row) return tokenError('invalid_grant', 400);

  if (row.revoked_at != null) {
    const activeNewer = await findActiveSameFamilyTokenNewerThan(env.DB, {
      familyId: row.family_id,
      createdAt: row.created_at,
      nowMs,
    });
    if (activeNewer) await revokeOauthTokenFamily(env.DB, { familyId: row.family_id, nowMs });
    return tokenError('invalid_grant', 400);
  }
  if (row.refresh_expires_at <= nowMs) return tokenError('invalid_grant', 400);

  const rotationNowMs = Math.max(nowMs, Number(row.created_at) + 1);
  const tokenPair = await mintTokenPair(env, {
    accountId: row.account_id,
    scope: row.scope,
    familyId: row.family_id,
  });
  const rotated = await rotateOauthRefreshToken(env.DB, {
    oldId: row.id,
    accountId: row.account_id,
    familyId: row.family_id,
    newAccessHash: tokenPair.accessHash,
    newRefreshHash: tokenPair.refreshHash,
    scope: row.scope,
    nowMs: rotationNowMs,
    accessTtlMs: ACCESS_TTL_MS,
    refreshTtlMs: REFRESH_TTL_MS,
  });
  if (!rotated) return tokenError('invalid_grant', 400);
  return tokenJson({
    access_token: tokenPair.accessToken,
    refresh_token: tokenPair.refreshToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_MS / 1000,
    scope: row.scope,
  });
}

async function mintCode(env) {
  const code = generateSessionToken();
  return { code, codeHash: await hashCode(code, env) };
}

async function mintTokenPair(env, { scope, familyId = randomBase64Url(16) }) {
  const accessToken = generateSessionToken();
  const refreshToken = generateSessionToken();
  return {
    accessToken,
    refreshToken,
    familyId,
    accessHash: await hashAccessToken(accessToken, env),
    refreshHash: await hashRefreshToken(refreshToken, env),
    scope,
  };
}

async function pkceVerifierMatches(verifier, challenge) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(verifier));
  return timingSafeEqual(base64Url(new Uint8Array(digest)), challenge);
}

async function hashAccessToken(token, env) {
  return hashWithPepper(token, env, 'OAUTH_TOKEN_PEPPER');
}

async function hashRefreshToken(token, env) {
  return hashWithPepper(token, env, 'OAUTH_TOKEN_PEPPER');
}

async function hashCode(code, env) {
  return hashWithPepper(code, env, 'HMAC_PEPPER');
}

function renderConsent(params, csrf, email) {
  const hidden = [...CONNECT_FIELDS.map((field) => hiddenInput(field, params[field])), hiddenInput('csrf', csrf)].join('\n  ');
  return layout({
    title: 'Connect Solstone CLI',
    body: `<h1 style="text-transform:none">Connect Solstone CLI</h1>
<p>The Solstone CLI is requesting permission to mint a Gemini API key on your account.</p>
<p class="meta">signed in as ${esc(email || 'your account')}</p>
<div class="welcome">
  <ul>
    <li>Mint and access a Gemini API key for this account</li>
    <li>Issue a dispatch token for CLI ↔ desktop coordination</li>
  </ul>
</div>
<form method="post" action="/connect/confirm">
  ${hidden}
  <button type="submit">Allow</button>
  <a href="/dashboard" style="margin-left:12px">Cancel</a>
</form>`,
  });
}

async function primaryEmail(env, accountId) {
  const data = await getDashboardData(env.DB, accountId);
  if (!data?.addressEncrypted) return '';
  try {
    return await decryptEmail(data.addressEncrypted, env);
  } catch {
    return '';
  }
}

function formParams(form) {
  const params = new URLSearchParams();
  for (const field of CONNECT_FIELDS) params.set(field, form.get(field)?.toString() || '');
  return params;
}

async function readForm(req) {
  try {
    return await req.formData();
  } catch {
    return null;
  }
}

function redirectUriValid(value) {
  const match = value.match(REDIRECT_URI_RE);
  if (!match) return false;
  const port = Number(match[1]);
  return Number.isInteger(port) && port >= 1024 && port <= 65535;
}

function oauthError(error, status, description = '', headers = {}) {
  return json(errorBody(error, description), {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

function tokenError(error, status, description = '', headers = {}) {
  return tokenJson(errorBody(error, description), status, headers);
}

function tokenJson(body, status = 200, headers = {}) {
  return json(body, {
    status,
    headers: { Pragma: 'no-cache', ...headers },
  });
}

function errorBody(error, description) {
  const body = { error };
  if (description) body.error_description = description;
  return body;
}

function hiddenInput(name, value) {
  return `<input type="hidden" name="${escAttr(name)}" value="${escAttr(value)}">`;
}

function randomBase64Url(size) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return base64Url(bytes);
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const pad = value.length % 4 === 2 ? '==' : value.length % 4 === 3 ? '=' : value.length % 4 === 0 ? '' : null;
  if (pad == null) throw new Error('invalid base64url');
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escAttr(value) {
  return esc(value).replace(/"/g, '&quot;');
}
