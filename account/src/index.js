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
  findEmailByHash,
  getDashboardData,
  hasAnyActivePasskey,
  matchOtp,
  upsertOtp,
  updateAccountLastSignin,
} from './db.js';
import { sendOtpEmail } from './email.js';
import {
  handleDeregisterDevice,
  handleListDevices,
  handleMintDispatchToken,
  handleRegisterDevice,
  handleRevokeAllDevices,
  handleRevokeDevice,
  handleSettingsDevices,
} from './devices.js';
import {
  handleAddEmail,
  handleMakeEmailPrimary,
  handleRemoveEmail,
  handleSettingsData,
  handleSettingsEmails,
  handleVerifyEmailGet,
  handleVerifyEmailPost,
} from './emails.js';
import {
  renderDashboard,
  renderError,
  renderForbidden,
  renderGoodbye,
  renderLanding,
  renderNotFound,
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
  handleRenamePasskey,
  handleRevokeOtherSessions,
  handleRevokeSession,
  handleSettingsPasskeys,
  handleSettingsSessions,
  handleSettingsShell,
} from './settings.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const ORIGIN = 'https://account.solstone.app';
const IP_HOUR_LIMIT = 10;
const EMAIL_DAY_LIMIT = 5;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; frame-src 'self' https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; frame-ancestors 'none'",
};

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
      if (url.pathname === '/' && req.method === 'GET') {
        const session = await getValidSession(req, env, Date.now());
        if (session) return redirect('/dashboard');
        const csrf = await csrfToken(env);
        return html(renderLanding(env.TURNSTILE_SITE_KEY, csrf));
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

      if (url.pathname === '/dashboard' && req.method === 'GET') {
        const session = await getValidSession(req, env, Date.now());
        if (!session) {
          return redirect('/', 303, { 'Set-Cookie': clearSessionCookie() });
        }
        const now = Date.now();
        const data = await getDashboardData(db, session.account_id);
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
        const hasPasskey = await hasAnyActivePasskey(db, session.account_id);
        return html(renderDashboard({
          welcome: url.searchParams.get('welcome') === '1' || !hasPasskey,
          email,
          lastSignInAt: data?.lastSigninAt ?? null,
          now,
          decryptOk,
        }));
      }

      if (url.pathname === '/signout' && req.method === 'POST') {
        // No CSRF token here: the session cookie is SameSite=Lax, so a cross-site POST sends no cookie and falls through to the /goodbye no-op below.
        const token = getSessionToken(req);
        if (token) {
          const idHash = await hashWithPepper(token, env);
          await deleteSession(db, idHash);
        }
        return redirect('/goodbye', 303, { 'Set-Cookie': clearSessionCookie() });
      }

      if (url.pathname === '/goodbye' && req.method === 'GET') {
        return html(renderGoodbye());
      }

      if (parts.length === 2 && parts[1] === 'settings' && req.method === 'GET') {
        return handleSettingsShell(req, env);
      }

      if (
        parts.length === 3 &&
        parts[1] === 'settings' &&
        parts[2] === 'emails' &&
        req.method === 'GET'
      ) {
        return handleSettingsEmails(req, env);
      }

      if (
        parts.length === 4 &&
        parts[1] === 'settings' &&
        parts[2] === 'emails' &&
        parts[3] === 'add' &&
        req.method === 'POST'
      ) {
        return handleAddEmail(req, env, ctx);
      }

      if (
        parts.length === 4 &&
        parts[1] === 'settings' &&
        parts[2] === 'emails' &&
        parts[3] === 'verify' &&
        req.method === 'GET'
      ) {
        return handleVerifyEmailGet(req, env);
      }

      if (
        parts.length === 4 &&
        parts[1] === 'settings' &&
        parts[2] === 'emails' &&
        parts[3] === 'verify' &&
        req.method === 'POST'
      ) {
        return handleVerifyEmailPost(req, env);
      }

      if (
        parts.length === 3 &&
        parts[1] === 'settings' &&
        parts[2] === 'data' &&
        req.method === 'GET'
      ) {
        return handleSettingsData(req, env);
      }

      if (
        parts.length === 5 &&
        parts[1] === 'settings' &&
        parts[2] === 'emails' &&
        parts[4] === 'make-primary' &&
        req.method === 'POST'
      ) {
        return handleMakeEmailPrimary(req, env, parts[3]);
      }

      if (
        parts.length === 5 &&
        parts[1] === 'settings' &&
        parts[2] === 'emails' &&
        parts[4] === 'remove' &&
        req.method === 'POST'
      ) {
        return handleRemoveEmail(req, env, parts[3]);
      }

      if (
        parts.length === 3 &&
        parts[1] === 'settings' &&
        parts[2] === 'sessions' &&
        req.method === 'GET'
      ) {
        return handleSettingsSessions(req, env);
      }

      if (
        parts.length === 3 &&
        parts[1] === 'settings' &&
        parts[2] === 'passkeys' &&
        req.method === 'GET'
      ) {
        return handleSettingsPasskeys(req, env);
      }

      if (
        parts.length === 3 &&
        parts[1] === 'settings' &&
        parts[2] === 'devices' &&
        req.method === 'GET'
      ) {
        return handleSettingsDevices(req, env);
      }

      if (
        parts.length === 4 &&
        parts[1] === 'settings' &&
        parts[2] === 'sessions' &&
        parts[3] === 'revoke-others' &&
        req.method === 'POST'
      ) {
        return handleRevokeOtherSessions(req, env);
      }

      if (
        parts.length === 4 &&
        parts[1] === 'settings' &&
        parts[2] === 'devices' &&
        parts[3] === 'revoke-all' &&
        req.method === 'POST'
      ) {
        return handleRevokeAllDevices(req, env);
      }

      if (
        parts.length === 5 &&
        parts[1] === 'settings' &&
        parts[2] === 'sessions' &&
        parts[4] === 'revoke' &&
        req.method === 'POST'
      ) {
        return handleRevokeSession(req, env, parts[3]);
      }

      if (
        parts.length === 5 &&
        parts[1] === 'settings' &&
        parts[2] === 'devices' &&
        parts[4] === 'revoke' &&
        req.method === 'POST'
      ) {
        return handleRevokeDevice(req, env, parts[3]);
      }

      if (
        parts.length === 5 &&
        parts[1] === 'settings' &&
        parts[2] === 'passkeys' &&
        parts[4] === 'rename' &&
        req.method === 'POST'
      ) {
        return handleRenamePasskey(req, env, parts[3]);
      }

      if (
        parts.length === 5 &&
        parts[1] === 'settings' &&
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
  const verifyLocation = emailOk ? `/signin/verify?email=${encodeURIComponent(emailLower)}` : '/signin/verify';

  if (!turnstileOk) return redirect(verifyLocation);
  if (!emailOk) return redirect('/signin/verify');
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
  return html(renderVerify({ email, error: null, csrf }));
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

  if (!emailOk || !codeOk) {
    return html(renderVerify({
      email: renderEmail,
      emailInputValue: emailOk ? '' : emailForEcho,
      error: VERIFY_ERROR,
      csrf,
    }));
  }

  const nowMs = Date.now();
  const codeHash = await hashWithPepper(code, env);
  const emailLowerHash = await hashWithPepper(emailLower, env);
  const matched = await matchOtp(env.DB, { emailLowerHash, codeHash, nowMs });

  if (!matched) {
    await bumpOtpAttempts(env.DB, { emailLowerHash, nowMs, maxAttempts: OTP_MAX_ATTEMPTS });
    return html(renderVerify({ email: emailLower, error: VERIFY_ERROR, csrf }));
  }

  const existing = await findEmailByHash(env.DB, emailLowerHash);
  const isNew = !existing;
  if (isNew && env.SIGNUP_DISABLED === 'true') {
    console.warn(JSON.stringify({
      event: 'signup_disabled_rejection',
      email_lower_hash_prefix: emailLowerHash.slice(0, 12),
      ts: nowMs,
    }));
    return html(renderVerify({ email: emailLower, error: VERIFY_ERROR, csrf }));
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
  return redirect(isNew ? '/dashboard?welcome=1' : '/dashboard', 303, {
    'Set-Cookie': sessionCookie(sessionToken),
  });
}

export function isValidEmail(value) {
  return /.+@.+\..+/.test(value);
}

export function forbidden() {
  return new Response(null, { status: 403, headers: SECURITY_HEADERS });
}
