import {
  decryptEmail,
  encryptEmail,
  hashKey,
  hashServiceHandoffNonce,
  hashWithPepper,
  timingSafeEqual,
} from './crypto.js';
import { mintDispatchToken } from './devices.js';
import {
  bumpRateBucket,
  consumeEnableScoutCode,
  consumeServiceHandoff,
  findEnableScoutCodeByHash,
  findServiceHandoffStatus,
  getAccountTransparencyRow,
  insertEnableScoutCode,
  insertServiceHandoff,
} from './db.js';
import {
  DEVICE_CODE_PART_LENGTH,
  DEVICE_CODE_REGEX,
  DEVICE_CODE_TTL_MS,
  HANDOFF_TTL_MS,
  NONCE_ALPHABET,
  NONCE_LENGTH_CHARS,
  NONCE_REGEX,
} from './enable-constants.js';
import {
  renderEnableScoutConsent,
  renderEnableScoutDone,
  renderEnableScoutEntry,
  renderEnableScoutError,
} from './html.js';
import { forbidden, getClientIp, html, json, originAllowed, redirect } from './index.js';
import { ensureProvisionedKey, ProvisioningBusyError } from './provisioning.js';
import { clearSessionCookie, getValidSession } from './session.js';

const HOUR_MS = 60 * 60 * 1000;
const ENABLE_CODE_IP_HOUR_LIMIT = 10;
const HANDOFF_POLL_MS = 1500;
const HANDOFF_POLL_BUDGET_MS = 30_000;
const ENABLE_PATH = '/enable/scout';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function provisionScoutForAccount({ env, accountId, ctx }) {
  const googleApiKey = await ensureProvisionedKey({ env, accountId });
  const dispatch = await mintDispatchToken(env, accountId);
  return {
    google_api_key: googleApiKey,
    dispatch_token: dispatch.token,
    account_id: accountId,
    created_at: dispatch.createdAt,
  };
}

export async function signEnableResume(path, queryString, env) {
  const resume = normalizeResume(path, queryString);
  if (!resume) return null;
  const next = base64Url(encoder.encode(JSON.stringify(resume)));
  const nextSig = await hashWithPepper(next, env, 'HMAC_PEPPER');
  return { next, nextSig };
}

export async function verifyEnableResume(next, nextSig, env) {
  if (typeof next !== 'string' || typeof nextSig !== 'string') return null;
  if (!/^[A-Za-z0-9_-]+$/.test(next)) return null;
  const expected = await hashWithPepper(next, env, 'HMAC_PEPPER');
  if (!timingSafeEqual(nextSig, expected)) return null;
  try {
    return decodeEnableResume(next);
  } catch {
    return null;
  }
}

export function decodeEnableResume(next) {
  const decoded = JSON.parse(decoder.decode(base64UrlDecode(next)));
  const resume = normalizeResume(decoded.path, decoded.queryString);
  if (!resume) throw new Error('invalid resume');
  return resume;
}

export async function handleEnableScoutGet(req, env) {
  const url = new URL(req.url);
  const parsed = parseEnableRequest(url);
  if (parsed.error) return enableError(parsed.error, parsed.status || 400);
  const csrf = await csrfToken(env);

  if (parsed.mode === 'entry') {
    return noStoreHtml(renderEnableScoutEntry({ csrf }));
  }

  const session = await getValidSession(req, env, Date.now());
  if (!session) return signInRedirect(env, parsed.resumePath, parsed.resumeQuery);

  if (parsed.mode === 'code') {
    const codeRow = await activeCodeRow(env, parsed.code);
    if (!codeRow) {
      return noStoreHtml(renderEnableScoutEntry({
        csrf,
        code: parsed.code,
        error: 'that code did not work. check it and try again.',
      }), { status: 400 });
    }
    const status = await findServiceHandoffStatus(env.DB, { handoffHash: codeRow.nonce_hash });
    if (status) {
      return noStoreHtml(renderEnableScoutEntry({
        csrf,
        code: parsed.code,
        error: 'that code was already used.',
      }), { status: 400 });
    }
  }

  return noStoreHtml(renderEnableScoutConsent({
    csrf,
    nonce: parsed.mode === 'nonce' ? parsed.nonce : '',
    code: parsed.mode === 'code' ? parsed.code : '',
    accountId: session.account_id,
  }));
}

export async function handleEnableScoutPost(req, env) {
  if (!originAllowed(req)) return noStoreResponse(forbidden());
  const form = await readForm(req);
  const csrf = await csrfToken(env);
  if (!form || !timingSafeEqual(form.get('csrf')?.toString() || '', csrf)) {
    return noStoreHtml(renderEnableScoutError({ message: 'that request could not be completed.' }), { status: 403 });
  }
  const code = normalizeDeviceCode(form.get('code')?.toString() || '');
  if (!DEVICE_CODE_REGEX.test(code)) {
    return noStoreHtml(renderEnableScoutEntry({
      csrf,
      code,
      error: 'enter the code from your terminal.',
    }), { status: 400 });
  }
  const row = await activeCodeRow(env, code);
  if (!row) {
    return noStoreHtml(renderEnableScoutEntry({
      csrf,
      code,
      error: 'that code did not work. check it and try again.',
    }), { status: 400 });
  }
  const status = await findServiceHandoffStatus(env.DB, { handoffHash: row.nonce_hash });
  if (status) {
    return noStoreHtml(renderEnableScoutEntry({
      csrf,
      code,
      error: 'that code was already used.',
    }), { status: 400 });
  }
  return redirect(`${ENABLE_PATH}?code=${encodeURIComponent(code)}`, 303, { 'Cache-Control': 'no-store' });
}

export async function handleEnableScoutConfirm(req, env, ctx) {
  if (!originAllowed(req)) return noStoreResponse(forbidden());
  const form = await readForm(req);
  if (!form) return noStoreHtml(renderEnableScoutError({ message: 'that request could not be completed.' }), { status: 400 });

  const nonce = (form.get('nonce')?.toString() || '').trim().toUpperCase();
  const code = normalizeDeviceCode(form.get('code')?.toString() || '');
  const source = parsePostedSource({ nonce, code });
  if (!source) return noStoreHtml(renderEnableScoutError({ message: 'that request could not be completed.' }), { status: 400 });

  if ((form.get('action')?.toString() || '') === 'cancel') {
    return redirect('/', 303, { 'Cache-Control': 'no-store' });
  }

  const session = await getValidSession(req, env, Date.now());
  if (!session) {
    return signInRedirect(env, ENABLE_PATH, source.mode === 'nonce' ? `?nonce=${source.nonce}` : `?code=${source.code}`);
  }
  const account = await getAccountTransparencyRow(env.DB, session.account_id);
  if (!account) {
    return redirect('/', 303, { 'Set-Cookie': clearSessionCookie(), 'Cache-Control': 'no-store' });
  }

  const csrf = await csrfToken(env);
  if (!timingSafeEqual(form.get('csrf')?.toString() || '', csrf)) {
    return noStoreHtml(renderEnableScoutError({ message: 'that request could not be completed.' }), { status: 403 });
  }

  const originalAccountId = form.get('account_id')?.toString() || '';
  if (originalAccountId !== session.account_id) {
    const query = source.mode === 'nonce' ? `?nonce=${source.nonce}` : `?code=${encodeURIComponent(source.code)}`;
    return redirect(`${ENABLE_PATH}${query}`, 303, { 'Cache-Control': 'no-store' });
  }

  let handoffHash;
  let codeHash = null;
  if (source.mode === 'nonce') {
    handoffHash = await hashServiceHandoffNonce(source.nonce, env);
  } else {
    codeHash = await hashServiceHandoffNonce(source.code, env);
    const row = await findEnableScoutCodeByHash(env.DB, { codeHash });
    if (!activeCodeRowOk(row)) {
      return noStoreHtml(renderEnableScoutEntry({
        csrf,
        code: source.code,
        error: 'that code did not work. check it and try again.',
      }), { status: 400 });
    }
    handoffHash = row.nonce_hash;
    const status = await findServiceHandoffStatus(env.DB, { handoffHash });
    if (status) {
      return noStoreHtml(renderEnableScoutEntry({
        csrf,
        code: source.code,
        error: 'that code was already used.',
      }), { status: 400 });
    }
  }

  let provisioned;
  try {
    provisioned = await provisionScoutForAccount({ env, accountId: session.account_id, ctx });
  } catch (error) {
    if (error instanceof ProvisioningBusyError) {
      return noStoreHtml(renderEnableScoutError({ message: "something didn't finish. try again in a moment." }), {
        status: 503,
        headers: { 'Retry-After': '2' },
      });
    }
    return noStoreHtml(renderEnableScoutError({ message: "something didn't finish. try again in a moment." }), { status: 503 });
  }

  const payload = { ...provisioned };
  const nowMs = Date.now();
  const payloadEncrypted = await encryptEmail(JSON.stringify(payload), env);
  let inserted;
  try {
    inserted = await insertServiceHandoff(env.DB, {
      handoffHash,
      accountId: session.account_id,
      service: 'scout',
      payloadEncrypted,
      createdAt: nowMs,
      expiresAt: nowMs + HANDOFF_TTL_MS,
    });
  } catch {
    return noStoreHtml(renderEnableScoutError({ message: "something didn't finish. try again in a moment." }), { status: 503 });
  }

  if (!inserted.ok) {
    if (source.mode === 'code') {
      return noStoreHtml(renderEnableScoutEntry({
        csrf,
        code: source.code,
        error: 'that code was already used.',
      }), { status: 400 });
    }
    return noStoreHtml(renderEnableScoutDone());
  }

  if (source.mode === 'code') {
    try {
      const consumed = await consumeEnableScoutCode(env.DB, {
        codeHash,
        nonceHash: handoffHash,
        accountId: session.account_id,
        nowMs,
      });
      if (!consumed) throw new Error('code consume failed');
    } catch {
      return noStoreHtml(renderEnableScoutError({ message: "something didn't finish. try again in a moment." }), { status: 503 });
    }
  }

  return noStoreHtml(renderEnableScoutDone());
}

export async function handleEnableScoutCode(req, env) {
  if (req.method !== 'POST') return json({ error: 'invalid_request' }, { status: 405 });
  const nowMs = Date.now();
  const ipHash = await hashKey('enable_scout_code_ip', getClientIp(req), env);
  const count = await bumpRateBucket(env.DB, ipHash, HOUR_MS, nowMs);
  if (count > ENABLE_CODE_IP_HOUR_LIMIT) return json({ error: 'rate_limited' }, { status: 429 });

  for (let attempt = 0; attempt < 8; attempt++) {
    const nonce = randomNonce();
    const code = randomDeviceCode();
    const nonceHash = await hashServiceHandoffNonce(nonce, env);
    const codeHash = await hashServiceHandoffNonce(code, env);
    const ok = await insertEnableScoutCode(env.DB, {
      codeHash,
      nonceHash,
      ipHash,
      createdAt: nowMs,
      expiresAt: nowMs + DEVICE_CODE_TTL_MS,
    });
    if (!ok) continue;
    return json({ nonce, code, expires_in: DEVICE_CODE_TTL_MS / 1000 });
  }
  return json({ error: 'server_error' }, { status: 500 });
}

export async function handleHandoffScout(req, env) {
  const url = new URL(req.url);
  const nonce = (url.searchParams.get('nonce') || '').trim().toUpperCase();
  if (!NONCE_REGEX.test(nonce)) return handoffJson({ error: 'invalid_request' }, { status: 400 });

  const handoffHash = await hashServiceHandoffNonce(nonce, env);
  const started = Date.now();
  while (Date.now() - started <= HANDOFF_POLL_BUDGET_MS) {
    const nowMs = Date.now();
    const consumed = await consumeServiceHandoff(env.DB, { handoffHash, nowMs });
    if (consumed) {
      const plaintext = await decryptEmail(consumed.payload_encrypted, env);
      return handoffJson(JSON.parse(plaintext), { headers: { Pragma: 'no-cache' } });
    }

    const status = await findServiceHandoffStatus(env.DB, { handoffHash });
    if (status && (status.consumed_at != null || status.expires_at <= nowMs)) {
      return handoffJson({ error: 'gone' }, { status: 410 });
    }

    const elapsed = Date.now() - started;
    if (elapsed >= HANDOFF_POLL_BUDGET_MS) break;
    await sleep(Math.min(HANDOFF_POLL_MS, HANDOFF_POLL_BUDGET_MS - elapsed));
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

function parseEnableRequest(url) {
  const nonceParam = url.searchParams.get('nonce');
  const codeParam = url.searchParams.get('code');
  if (nonceParam && codeParam) return { error: 'invalid request', status: 400 };
  if (!nonceParam && !codeParam) return { mode: 'entry' };
  if (nonceParam) {
    const nonce = nonceParam.trim().toUpperCase();
    if (!NONCE_REGEX.test(nonce)) return { error: 'invalid request', status: 400 };
    return { mode: 'nonce', nonce, resumePath: ENABLE_PATH, resumeQuery: `?nonce=${nonce}` };
  }
  const code = normalizeDeviceCode(codeParam || '');
  if (!DEVICE_CODE_REGEX.test(code)) return { error: 'invalid request', status: 400 };
  return { mode: 'code', code, resumePath: ENABLE_PATH, resumeQuery: `?code=${code}` };
}

function parsePostedSource({ nonce, code }) {
  if (nonce && code) return null;
  if (nonce) return NONCE_REGEX.test(nonce) ? { mode: 'nonce', nonce } : null;
  if (code) return DEVICE_CODE_REGEX.test(code) ? { mode: 'code', code } : null;
  return null;
}

async function activeCodeRow(env, code) {
  const codeHash = await hashServiceHandoffNonce(code, env);
  const row = await findEnableScoutCodeByHash(env.DB, { codeHash });
  return activeCodeRowOk(row) ? row : null;
}

function activeCodeRowOk(row) {
  return row && row.consumed_at == null && row.expires_at > Date.now();
}

async function signInRedirect(env, path, queryString) {
  const resume = await signEnableResume(path, queryString, env);
  return redirect(`/?next=${encodeURIComponent(resume.next)}&next_sig=${encodeURIComponent(resume.nextSig)}`, 303, {
    'Cache-Control': 'no-store',
  });
}

async function csrfToken(env) {
  return hashKey('csrf', 'account', env);
}

async function readForm(req) {
  try {
    return await req.formData();
  } catch {
    return null;
  }
}

function normalizeResume(path, queryString) {
  if (path !== ENABLE_PATH || typeof queryString !== 'string' || !queryString.startsWith('?')) return null;
  const params = new URLSearchParams(queryString.slice(1));
  const nonceValues = params.getAll('nonce');
  const codeValues = params.getAll('code');
  if (nonceValues.length + codeValues.length !== 1) return null;
  if (nonceValues.length === 1 && !NONCE_REGEX.test(nonceValues[0])) return null;
  if (codeValues.length === 1 && !DEVICE_CODE_REGEX.test(normalizeDeviceCode(codeValues[0]))) return null;
  return { path, queryString };
}

function randomNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH_CHARS));
  let nonce = '';
  for (const byte of bytes) nonce += NONCE_ALPHABET[byte % NONCE_ALPHABET.length];
  return nonce;
}

function randomDeviceCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(DEVICE_CODE_PART_LENGTH * 2));
  let chars = '';
  for (const byte of bytes) chars += NONCE_ALPHABET[byte % NONCE_ALPHABET.length];
  return `SCOUT-${chars.slice(0, DEVICE_CODE_PART_LENGTH)}-${chars.slice(DEVICE_CODE_PART_LENGTH)}`;
}

function normalizeDeviceCode(value) {
  return String(value || '').trim().toUpperCase();
}

function enableError(message, status) {
  return noStoreHtml(renderEnableScoutError({ message }), { status });
}

function noStoreHtml(body, init = {}) {
  return html(body, {
    ...init,
    headers: { 'Cache-Control': 'no-store', ...(init.headers || {}) },
  });
}

function noStoreResponse(response) {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function handoffJson(body, init = {}) {
  return json(body, {
    ...init,
    headers: { ...(init.headers || {}) },
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
