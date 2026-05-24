import {
  decryptEmail,
  encryptEmail,
  generateOtp,
  generateSessionToken,
  hashKey,
  hashWithPepper,
  normalizeCode,
  timingSafeEqual,
} from './crypto.js';
import { handleAdmin } from './admin.js';
import {
  bumpOtpAttempts,
  bumpRateBucket,
  createAccountWithEmail,
  createSession,
  deleteOtp,
  deleteSession,
  countActiveDevices,
  findActiveProvisionedKey,
  findEmailByHash,
  getDashboardData,
  hasAnyActivePasskey,
  matchOtp,
  upsertOtp,
  updateAccountLastSignin,
} from './db.js';
import { sendOtpEmail } from './email.js';
import {
  decodeNextDevice,
  decodeNext,
  handleDeviceAuthorization,
  handleDeviceConfirm,
  handleDeviceGet,
  handleDevicePost,
  handleConnectConfirm,
  handleConnectGet,
  handleOauthToken,
  verifyNextDevice,
  verifyNext,
} from './oauth.js';
import {
  handleDeregisterDevice,
  handleListDevices,
  handleMintDispatchToken,
  handlePushDisable,
  handleRegisterDevice,
  handleRevokeAllDevices,
  handleRevokeDevice,
  handleServicesDevices,
} from './devices.js';
import { handlePushDedup, handlePushDispatch } from './push.js';
import {
  handleAddEmail,
  handleMakeEmailPrimary,
  handleRemoveEmail,
  handleSignInData,
  handleSignInEmails,
  handleVerifyEmailGet,
  handleVerifyEmailPost,
} from './emails.js';
import {
  renderError,
  renderForbidden,
  renderGoodbye,
  renderLanding,
  renderNotFound,
  renderServicesDashboard,
  renderVerify,
  VERIFY_ERROR,
} from './html.js';
import {
  passkeyAuthFinish,
  passkeyAuthStart,
  passkeyRegisterFinish,
  passkeyRegisterStart,
} from './passkey.js';
import { runRetention } from './retention.js';
import { clearSessionCookie, getSessionToken, getValidSession, sessionCookie } from './session.js';
import {
  handleRemovePasskey,
  handleGeminiRotate,
  handleRenamePasskey,
  handleRevokeOtherSessions,
  handleRevokeSession,
  handleScoutDisable,
  handleServicesScout,
  handleServicesScoutAck,
  handleServicesScoutForget,
  handleServicesScoutReveal,
  handleServicesScoutRotate,
  handleSignInPasskeys,
  handleSignInSessions,
  handleSignInShell,
} from './settings.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const ORIGIN = 'https://services.solstone.app';
const IP_HOUR_LIMIT = 10;
const EMAIL_DAY_LIMIT = 5;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const GEMINI_PROVIDER = 'gemini';

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; frame-src 'self' https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; frame-ancestors 'none'",
};

const LEGACY_REDIRECTS = [
  { method: 'GET', from: '/dashboard', to: '/' },
  { method: 'GET', from: '/settings', to: '/sign-in' },
  { method: 'GET', from: '/settings/sessions', to: '/sign-in/sessions' },
  { method: 'GET', from: '/settings/passkeys', to: '/sign-in/passkeys' },
  { method: 'GET', from: '/settings/emails', to: '/sign-in/emails' },
  { method: 'GET', from: '/settings/emails/verify', to: '/sign-in/emails/verify' },
  { method: 'GET', from: '/settings/data', to: '/sign-in/data' },
  { method: 'GET', from: '/settings/devices', to: '/services/devices' },
  { method: 'GET', from: '/settings/gemini', to: '/services/scout' },
  { method: 'POST', from: '/settings/sessions/revoke-others', to: '/sign-in/sessions/revoke-others' },
  { method: 'POST', from: '/settings/emails/add', to: '/sign-in/emails/add' },
  { method: 'POST', from: '/settings/emails/verify', to: '/sign-in/emails/verify' },
  { method: 'POST', from: '/settings/devices/revoke-all', to: '/services/devices/revoke-all' },
  { method: 'POST', from: '/settings/gemini/rotate', to: '/services/scout/rotate' },
  { method: 'POST', from: '/settings/gemini/ack', to: '/services/scout/ack' },
  { method: 'POST', from: '/settings/gemini/reveal', to: '/services/scout/reveal' },
  { method: 'POST', from: '/settings/gemini/forget', to: '/services/scout/forget' },
];

const LEGACY_PREFIX_REDIRECTS = [
  { method: 'POST', prefix: '/settings/sessions/', newPrefix: '/sign-in/sessions/' },
  { method: 'POST', prefix: '/settings/passkeys/', newPrefix: '/sign-in/passkeys/' },
  { method: 'POST', prefix: '/settings/emails/', newPrefix: '/sign-in/emails/' },
  { method: 'POST', prefix: '/settings/devices/', newPrefix: '/services/devices/' },
];

export function originAllowed(req) {
  const origin = req.headers.get('Origin');
  const referer = req.headers.get('Referer');
  return (
    (typeof origin === 'string' && origin.startsWith(ORIGIN)) ||
    (typeof referer === 'string' && referer.startsWith(ORIGIN))
  );
}

export function getClientIp(req) {
  return req.headers.get('CF-Connecting-IP') || req.headers.get('x-forwarded-for') || 'unknown';
}

export async function verifyTurnstile(env, token, ip) {
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token || '' });
  if (ip) body.set('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) return false;
    const json = await res.json();
    return json.success === true;
  } catch {
    return false;
  }
}

export function html(body, init = {}) {
  return new Response(body, {
    status: init.status || 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS, ...init.headers },
  });
}

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS,
      ...(init.headers || {}),
    },
  });
}

export function redirect(to, status = 303, headers = {}) {
  return new Response(null, {
    status,
    headers: { Location: to, ...SECURITY_HEADERS, ...headers },
  });
}

async function csrfToken(env) {
  return hashKey('csrf', 'account', env);
}

async function validResumeFromParams(params, env) {
  const next = params.get('next') || '';
  const nextSig = params.get('next_sig') || '';
  if (!next || !nextSig) return null;
  if (await verifyNext(next, nextSig, env)) return { kind: 'connect', next, nextSig };
  if (await verifyNextDevice(next, nextSig, env)) return { kind: 'device', next, nextSig };
  return null;
}

async function validResumeFromForm(form, env) {
  const next = form.get('next')?.toString() || '';
  const nextSig = form.get('next_sig')?.toString() || '';
  if (!next || !nextSig) return null;
  if (await verifyNext(next, nextSig, env)) return { kind: 'connect', next, nextSig };
  if (await verifyNextDevice(next, nextSig, env)) return { kind: 'device', next, nextSig };
  return null;
}

function withResume(location, resume) {
  if (!resume) return location;
  const separator = location.includes('?') ? '&' : '?';
  return `${location}${separator}next=${encodeURIComponent(resume.next)}&next_sig=${encodeURIComponent(resume.nextSig)}`;
}

function legacyRedirect(req, url) {
  const exact = LEGACY_REDIRECTS.find((entry) => entry.method === req.method && entry.from === url.pathname);
  if (exact) {
    const status = req.method === 'POST' ? 308 : 302;
    return redirect(exact.to + (url.search || ''), status, { 'Cache-Control': 'no-store' });
  }
  for (const entry of LEGACY_PREFIX_REDIRECTS) {
    if (entry.method !== req.method) continue;
    if (!url.pathname.startsWith(entry.prefix)) continue;
    const tail = url.pathname.slice(entry.prefix.length);
    if (!tail) continue;
    const status = req.method === 'POST' ? 308 : 302;
    return redirect(entry.newPrefix + tail + (url.search || ''), status, { 'Cache-Control': 'no-store' });
  }
  return null;
}

async function readForm(req) {
  try {
    return await req.formData();
  } catch {
    return new FormData();
  }
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const db = env.DB;

    try {
      const legacy = legacyRedirect(req, url);
      if (legacy) return legacy;

      if (url.pathname === '/' && req.method === 'GET') {
        const session = await getValidSession(req, env, Date.now());
        const resume = await validResumeFromParams(url.searchParams, env);
        if (session) {
          if (resume?.kind === 'connect') return redirect(`/connect?${decodeNext(resume.next)}`);
          if (resume?.kind === 'device') return redirect(`/device?user_code=${encodeURIComponent(decodeNextDevice(resume.next))}`);
          return handleServicesDashboard(req, env, session);
        }
        if (getSessionToken(req)) {
          return redirect('/', 303, { 'Set-Cookie': clearSessionCookie(), 'Cache-Control': 'no-store' });
        }
        const csrf = await csrfToken(env);
        return html(renderLanding(env.TURNSTILE_SITE_KEY, csrf, resume || {}));
      }

      if (url.pathname === '/signin/start' && req.method === 'POST') {
        return handleSigninStart(req, env);
      }

      if (url.pathname === '/signin/verify' && req.method === 'GET') {
        return handleSigninVerifyGet(req, env);
      }

      if (url.pathname === '/signin/verify' && req.method === 'POST') {
        return handleSigninVerifyPost(req, env);
      }

      if (
        parts.length === 2 &&
        parts[1] === 'connect' &&
        req.method === 'GET'
      ) {
        return handleConnectGet(req, env);
      }

      if (
        parts.length === 2 &&
        parts[1] === 'device' &&
        req.method === 'GET'
      ) {
        return handleDeviceGet(req, env);
      }

      if (
        parts.length === 2 &&
        parts[1] === 'device' &&
        req.method === 'POST'
      ) {
        return handleDevicePost(req, env);
      }

      if (
        parts.length === 3 &&
        parts[1] === 'connect' &&
        parts[2] === 'confirm'
      ) {
        return handleConnectConfirm(req, env);
      }

      if (
        parts.length === 3 &&
        parts[1] === 'device' &&
        parts[2] === 'confirm' &&
        req.method === 'POST'
      ) {
        return handleDeviceConfirm(req, env);
      }

      if (
        parts.length === 3 &&
        parts[1] === 'oauth' &&
        parts[2] === 'device_authorization' &&
        req.method === 'POST'
      ) {
        return handleDeviceAuthorization(req, env);
      }

      if (
        parts.length === 3 &&
        parts[1] === 'oauth' &&
        parts[2] === 'token' &&
        req.method === 'POST'
      ) {
        return handleOauthToken(req, env, ctx);
      }

      if (
        parts.length === 4 &&
        parts[1] === 'keys' &&
        parts[2] === 'gemini' &&
        parts[3] === 'rotate' &&
        req.method === 'POST'
      ) {
        return handleGeminiRotate(req, env, ctx, { allowBearer: true, responseMode: 'json' });
      }

      if (url.pathname === '/passkey/register/start') {
        return passkeyRegisterStart(req, env);
      }

      if (url.pathname === '/passkey/register/finish') {
        return passkeyRegisterFinish(req, env);
      }

      if (url.pathname === '/passkey/auth/start') {
        return passkeyAuthStart(req, env);
      }

      if (url.pathname === '/passkey/auth/finish') {
        return passkeyAuthFinish(req, env);
      }

      if (url.pathname === '/signout' && req.method === 'POST') {
        // No CSRF token here: the session cookie is SameSite=Lax, so a cross-site POST sends no cookie and falls through to the /goodbye no-op below.
        const token = getSessionToken(req);
        if (token) {
          const idHash = await hashWithPepper(token, env);
          await deleteSession(db, idHash);
        }
        return redirect('/goodbye', 303, { 'Set-Cookie': clearSessionCookie(), 'Cache-Control': 'no-store' });
      }

      if (url.pathname === '/goodbye' && req.method === 'GET') {
        return html(renderGoodbye());
      }

      if (parts.length === 2 && parts[1] === 'sign-in' && req.method === 'GET') {
        return handleSignInShell(req, env);
      }

      if (
        parts.length === 3 &&
        parts[1] === 'sign-in' &&
        parts[2] === 'emails' &&
        req.method === 'GET'
      ) {
        return handleSignInEmails(req, env);
      }

      if (
        parts.length === 4 &&
        parts[1] === 'sign-in' &&
        parts[2] === 'emails' &&
        parts[3] === 'add' &&
        req.method === 'POST'
      ) {
        return handleAddEmail(req, env, ctx);
      }

      if (
        parts.length === 4 &&
        parts[1] === 'sign-in' &&
        parts[2] === 'emails' &&
        parts[3] === 'verify' &&
        req.method === 'GET'
      ) {
        return handleVerifyEmailGet(req, env);
      }

      if (
        parts.length === 4 &&
        parts[1] === 'sign-in' &&
        parts[2] === 'emails' &&
        parts[3] === 'verify' &&
        req.method === 'POST'
      ) {
        return handleVerifyEmailPost(req, env);
      }

      if (
        parts.length === 3 &&
        parts[1] === 'sign-in' &&
        parts[2] === 'data' &&
        req.method === 'GET'
      ) {
        return handleSignInData(req, env);
      }

      if (
        parts.length === 5 &&
        parts[1] === 'sign-in' &&
        parts[2] === 'emails' &&
        parts[4] === 'make-primary' &&
        req.method === 'POST'
      ) {
        return handleMakeEmailPrimary(req, env, parts[3]);
      }

      if (
        parts.length === 5 &&
        parts[1] === 'sign-in' &&
        parts[2] === 'emails' &&
        parts[4] === 'remove' &&
        req.method === 'POST'
      ) {
        return handleRemoveEmail(req, env, parts[3]);
      }

      if (
        parts.length === 3 &&
        parts[1] === 'sign-in' &&
        parts[2] === 'sessions' &&
        req.method === 'GET'
      ) {
        return handleSignInSessions(req, env);
      }

      if (
        parts.length === 3 &&
        parts[1] === 'sign-in' &&
        parts[2] === 'passkeys' &&
        req.method === 'GET'
      ) {
        return handleSignInPasskeys(req, env);
      }

      if (
        parts.length === 3 &&
        parts[1] === 'services' &&
        parts[2] === 'devices' &&
        req.method === 'GET'
      ) {
        return handleServicesDevices(req, env);
      }

      if (
        parts.length === 3 &&
        parts[1] === 'services' &&
        parts[2] === 'scout' &&
        req.method === 'GET'
      ) {
        return handleServicesScout(req, env);
      }

      if (
        parts.length === 4 &&
        parts[1] === 'sign-in' &&
        parts[2] === 'sessions' &&
        parts[3] === 'revoke-others' &&
        req.method === 'POST'
      ) {
        return handleRevokeOtherSessions(req, env);
      }

      if (
        parts.length === 4 &&
        parts[1] === 'services' &&
        parts[2] === 'devices' &&
        parts[3] === 'revoke-all' &&
        req.method === 'POST'
      ) {
        return handleRevokeAllDevices(req, env);
      }

      if (
        parts.length === 4 &&
        parts[1] === 'services' &&
        parts[2] === 'push' &&
        parts[3] === 'disable' &&
        req.method === 'POST'
      ) {
        return handlePushDisable(req, env);
      }

      if (
        parts.length === 4 &&
        parts[1] === 'services' &&
        parts[2] === 'scout' &&
        parts[3] === 'rotate' &&
        req.method === 'POST'
      ) {
        return handleServicesScoutRotate(req, env, ctx);
      }

      if (
        parts.length === 4 &&
        parts[1] === 'services' &&
        parts[2] === 'scout' &&
        parts[3] === 'ack' &&
        req.method === 'POST'
      ) {
        return handleServicesScoutAck(req, env);
      }

      if (
        parts.length === 4 &&
        parts[1] === 'services' &&
        parts[2] === 'scout' &&
        parts[3] === 'reveal' &&
        req.method === 'POST'
      ) {
        return handleServicesScoutReveal(req, env);
      }

      if (
        parts.length === 4 &&
        parts[1] === 'services' &&
        parts[2] === 'scout' &&
        parts[3] === 'forget' &&
        req.method === 'POST'
      ) {
        return handleServicesScoutForget(req, env);
      }

      if (
        parts.length === 4 &&
        parts[1] === 'services' &&
        parts[2] === 'scout' &&
        parts[3] === 'disable' &&
        req.method === 'POST'
      ) {
        return handleScoutDisable(req, env, ctx);
      }

      if (
        parts.length === 5 &&
        parts[1] === 'sign-in' &&
        parts[2] === 'sessions' &&
        parts[4] === 'revoke' &&
        req.method === 'POST'
      ) {
        return handleRevokeSession(req, env, parts[3]);
      }

      if (
        parts.length === 5 &&
        parts[1] === 'services' &&
        parts[2] === 'devices' &&
        parts[4] === 'revoke' &&
        req.method === 'POST'
      ) {
        return handleRevokeDevice(req, env, parts[3]);
      }

      if (
        parts.length === 5 &&
        parts[1] === 'sign-in' &&
        parts[2] === 'passkeys' &&
        parts[4] === 'rename' &&
        req.method === 'POST'
      ) {
        return handleRenamePasskey(req, env, parts[3]);
      }

      if (
        parts.length === 5 &&
        parts[1] === 'sign-in' &&
        parts[2] === 'passkeys' &&
        parts[4] === 'remove' &&
        req.method === 'POST'
      ) {
        return handleRemovePasskey(req, env, parts[3]);
      }

      if (
        parts.length === 3 &&
        parts[1] === 'account' &&
        parts[2] === 'devices' &&
        req.method === 'GET'
      ) {
        return handleListDevices(req, env);
      }

      if (
        parts.length === 4 &&
        parts[1] === 'account' &&
        parts[2] === 'devices' &&
        parts[3] === 'register' &&
        req.method === 'POST'
      ) {
        return handleRegisterDevice(req, env);
      }

      if (
        parts.length === 4 &&
        parts[1] === 'account' &&
        parts[2] === 'devices' &&
        parts[3] === 'deregister' &&
        req.method === 'POST'
      ) {
        return handleDeregisterDevice(req, env);
      }

      if (
        parts.length === 3 &&
        parts[1] === 'account' &&
        parts[2] === 'dispatch-token' &&
        req.method === 'POST'
      ) {
        return handleMintDispatchToken(req, env);
      }

      if (
        parts.length === 3 &&
        parts[1] === 'push' &&
        parts[2] === 'dispatch' &&
        req.method === 'POST'
      ) {
        return handlePushDispatch(req, env);
      }

      if (
        parts.length === 3 &&
        parts[1] === 'push' &&
        parts[2] === 'dedup' &&
        req.method === 'POST'
      ) {
        return handlePushDedup(req, env);
      }

      if (url.pathname === '/admin/accounts' || url.pathname.startsWith('/admin/')) {
        return handleAdmin(req, env, url);
      }

      return html(renderNotFound(), { status: 404 });
    } catch (error) {
      console.error('account portal request failed');
      return html(renderError(), { status: 500 });
    }
  },
  async scheduled(event, env, ctx) {
    await runRetention(env);
  },
};

async function handleServicesDashboard(req, env, session) {
  const url = new URL(req.url);
  const now = Date.now();
  const [data, hasPasskey, scoutKey, deviceCount] = await Promise.all([
    getDashboardData(env.DB, session.account_id),
    hasAnyActivePasskey(env.DB, session.account_id),
    findActiveProvisionedKey(env.DB, { accountId: session.account_id, provider: GEMINI_PROVIDER }),
    countActiveDevices(env.DB, session.account_id),
  ]);
  let email = null;
  let decryptOk = false;
  if (data?.addressEncrypted) {
    try {
      email = await decryptEmail(data.addressEncrypted, env);
      decryptOk = true;
    } catch {
      console.error('dashboard_decrypt_failed');
    }
  }
  return html(renderServicesDashboard({
    welcome: url.searchParams.get('welcome') === '1' || !hasPasskey,
    email,
    lastSignInAt: data?.lastSigninAt ?? null,
    now,
    decryptOk,
    scoutActive: scoutKey != null,
    deviceCount,
  }), { headers: { 'Cache-Control': 'no-store' } });
}

async function handleSigninStart(req, env) {
  // Lode A.1 contract invariants for /signin/start:
  //   1. CSRF synchronizer token verified before any other work.
  //   2. NEVER read account_emails before mint/send (no enumeration).
  //   3. Four sign-in hash calls run before every token-admitted branch return.
  //   4. Rate buckets bumped BEFORE OTP write.
  //   5. OTP row written on every admit, regardless of whether an account exists for the email.
  //   6. NO Set-Cookie under any branch.
  const form = await readForm(req);
  const csrf = await csrfToken(env);
  if (!timingSafeEqual(form.get('csrf')?.toString() || '', csrf)) {
    return html(renderForbidden(), { status: 403 });
  }

  const emailLower = (form.get('email')?.toString() || '').trim().toLowerCase();
  const turnstileToken = form.get('cf-turnstile-response')?.toString() || '';
  const nowMs = Date.now();
  const ip = getClientIp(req);
  const code = generateOtp();
  const turnstileOk = await verifyTurnstile(env, turnstileToken, ip);
  const codeHash = await hashWithPepper(code, env);
  const emailLowerHash = await hashWithPepper(emailLower, env);
  const ipBucketKey = await hashKey('signin_ip', ip, env);
  const emailBucketKey = await hashKey('signin_email', emailLower, env);
  const emailOk = isValidEmail(emailLower);
  const resume = await validResumeFromForm(form, env);
  const verifyLocation = withResume(
    emailOk ? `/signin/verify?email=${encodeURIComponent(emailLower)}` : '/signin/verify',
    resume
  );

  if (!turnstileOk) return redirect(verifyLocation);
  if (!emailOk) return redirect(verifyLocation);
  if (env.EMAIL_PATH_DISABLED === 'true') return redirect(verifyLocation);

  const ipCount = await bumpRateBucket(env.DB, ipBucketKey, HOUR_MS, nowMs);
  if (ipCount > IP_HOUR_LIMIT) return redirect(verifyLocation);

  const emailCount = await bumpRateBucket(env.DB, emailBucketKey, DAY_MS, nowMs);
  if (emailCount > EMAIL_DAY_LIMIT) return redirect(verifyLocation);

  await upsertOtp(env.DB, { emailLowerHash, emailLower, codeHash, nowMs, ttlMs: OTP_TTL_MS });
  try {
    await sendOtpEmail({ env, address: emailLower, code });
  } catch {
    console.error('otp_send_failed');
    await deleteOtp(env.DB, { emailLowerHash, codeHash });
  }

  return redirect(verifyLocation);
}

async function handleSigninVerifyGet(req, env) {
  const url = new URL(req.url);
  const emailLower = (url.searchParams.get('email') || '').trim().toLowerCase();
  const email = isValidEmail(emailLower) ? emailLower : '';
  const csrf = await csrfToken(env);
  const resume = await validResumeFromParams(url.searchParams, env);
  return html(renderVerify({
    email,
    error: null,
    csrf,
    next: resume?.next || '',
    nextSig: resume?.nextSig || '',
  }));
}

async function handleSigninVerifyPost(req, env) {
  // Lode A.1 contract invariants for /signin/verify:
  //   1. CSRF synchronizer token verified before any other work.
  //   2. Success uses atomic UPDATE ... RETURNING; misses use a second UPDATE for attempts.
  //   3. Failure responses never reveal account presence.
  //   4. NO PII in logs.
  //   5. Session-cookie format remains unchanged from Lode A.
  const form = await readForm(req);
  const csrf = await csrfToken(env);
  if (!timingSafeEqual(form.get('csrf')?.toString() || '', csrf)) {
    return html(renderForbidden(), { status: 403 });
  }

  const rawEmail = form.get('email')?.toString() || '';
  const emailForEcho = rawEmail.trim();
  const emailLower = emailForEcho.toLowerCase();
  const code = normalizeCode(form.get('code')?.toString() || '');
  const emailOk = isValidEmail(emailLower);
  const codeOk = /^\d{6}$/.test(code);
  const renderEmail = emailOk ? emailLower : '';
  const resume = await validResumeFromForm(form, env);

  if (!emailOk || !codeOk) {
    return html(renderVerify({
      email: renderEmail,
      emailInputValue: emailOk ? '' : emailForEcho,
      error: VERIFY_ERROR,
      csrf,
      next: resume?.next || '',
      nextSig: resume?.nextSig || '',
    }));
  }

  const nowMs = Date.now();
  const codeHash = await hashWithPepper(code, env);
  const emailLowerHash = await hashWithPepper(emailLower, env);
  const matched = await matchOtp(env.DB, { emailLowerHash, codeHash, nowMs });

  if (!matched) {
    await bumpOtpAttempts(env.DB, { emailLowerHash, nowMs, maxAttempts: OTP_MAX_ATTEMPTS });
    return html(renderVerify({
      email: emailLower,
      error: VERIFY_ERROR,
      csrf,
      next: resume?.next || '',
      nextSig: resume?.nextSig || '',
    }));
  }

  const existing = await findEmailByHash(env.DB, emailLowerHash);
  const isNew = !existing;
  if (isNew && env.SIGNUP_DISABLED === 'true') {
    console.warn(JSON.stringify({
      event: 'signup_disabled_rejection',
      email_lower_hash_prefix: emailLowerHash.slice(0, 12),
      ts: nowMs,
    }));
    return html(renderVerify({
      email: emailLower,
      error: VERIFY_ERROR,
      csrf,
      next: resume?.next || '',
      nextSig: resume?.nextSig || '',
    }));
  }
  const accountId = existing
    ? existing.account_id
    : (await createAccountWithEmail(env.DB, {
        addressEncrypted: await encryptEmail(matched.emailLower, env),
        addressLowerHash: emailLowerHash,
        nowMs,
      })).accountId;
  await updateAccountLastSignin(env.DB, accountId, nowMs);

  const sessionToken = generateSessionToken();
  const idHash = await hashWithPepper(sessionToken, env);
  await createSession(env.DB, { idHash, accountId, nowMs });
  const location = resume?.kind === 'connect'
    ? `/connect?${decodeNext(resume.next)}`
    : resume?.kind === 'device'
      ? `/device?user_code=${encodeURIComponent(decodeNextDevice(resume.next))}`
      : (isNew ? '/?welcome=1' : '/');
  return redirect(location, 303, {
    'Set-Cookie': sessionCookie(sessionToken),
  });
}

export function isValidEmail(value) {
  return /.+@.+\..+/.test(value);
}

export function forbidden() {
  return new Response(null, { status: 403, headers: SECURITY_HEADERS });
}
