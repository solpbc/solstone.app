import {
  encryptEmail,
  generateNonce,
  generateSessionToken,
  hashWithPepper,
} from './crypto.js';
import {
  bumpRateBucket,
  consumeNonce,
  createAccountWithEmail,
  createSession,
  deleteSession,
  findEmailByHash,
  getSessionAccount,
  insertNonce,
  updateAccountLastSignin,
} from './db.js';
import { sendMagicLinkEmail } from './email.js';
import {
  renderCheckInbox,
  renderDashboard,
  renderGoodbye,
  renderInvalidLink,
  renderLanding,
} from './html.js';

const SESSION_COOKIE = 'account_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 14; // 14 days
const SESSION_TTL_MS = SESSION_MAX_AGE * 1000;
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

export function hourBucket(nowMs = Date.now()) {
  return Math.floor(nowMs / HOUR_MS);
}

export function dayBucket(nowMs = Date.now()) {
  return Math.floor(nowMs / DAY_MS);
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

export function redirect(to, status = 303, headers = {}) {
  return new Response(null, {
    status,
    headers: { Location: to, ...SECURITY_HEADERS, ...headers },
  });
}

export function sessionCookie(value, maxAge = SESSION_MAX_AGE) {
  return `${SESSION_COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return sessionCookie('', 0);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const db = env.DB;

    try {
      if (url.pathname === '/' && req.method === 'GET') {
        const session = await getValidSession(req, env, Date.now());
        if (session) return redirect('/dashboard');
        return html(renderLanding(env.TURNSTILE_SITE_KEY));
      }

      if (url.pathname === '/signin/start' && req.method === 'POST') {
        return handleSigninStart(req, env);
      }

      if (url.pathname === '/signin/finish' && req.method === 'GET') {
        const nonce = url.searchParams.get('nonce') || '';
        if (!nonce) return html(renderInvalidLink());
        const nowMs = Date.now();
        const nonceHash = await hashWithPepper(nonce, env);
        const consumed = await consumeNonce(db, nonceHash, nowMs);
        if (!consumed) return html(renderInvalidLink());

        const existing = await findEmailByHash(db, consumed.emailLowerHash);
        const accountId = existing
          ? existing.account_id
          : (await createAccountWithEmail(db, {
              addressEncrypted: consumed.emailEncrypted,
              addressLowerHash: consumed.emailLowerHash,
              nowMs,
            })).accountId;
        await updateAccountLastSignin(db, accountId, nowMs);

        const sessionToken = generateSessionToken();
        const idHash = await hashWithPepper(sessionToken, env);
        await createSession(db, { idHash, accountId, nowMs });
        return redirect('/dashboard?welcome=1', 303, {
          'Set-Cookie': sessionCookie(sessionToken),
        });
      }

      if (url.pathname === '/dashboard' && req.method === 'GET') {
        const session = await getValidSession(req, env, Date.now());
        if (!session) {
          return redirect('/', 303, { 'Set-Cookie': clearSessionCookie() });
        }
        return html(renderDashboard({ welcome: url.searchParams.get('welcome') === '1' }));
      }

      if (url.pathname === '/signout' && req.method === 'POST') {
        if (!originAllowed(req)) return forbidden();
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

      return new Response(null, { status: 404, headers: SECURITY_HEADERS });
    } catch (error) {
      console.error('account portal request failed');
      return html(renderInvalidLink(), { status: 500 });
    }
  },
};

async function handleSigninStart(req, env) {
  // Lode A contract invariants for /signin/start:
  //   1. NEVER read account_emails before mint/send (no enumeration).
  //   2. Rate buckets bumped BEFORE nonce write.
  //   3. Nonce row written on every admit, regardless of whether an account exists for the email.
  //   4. Response bytes (body + headers) are byte-identical across admit/reject/turnstile-fail/ratecapped.
  //   5. NO Set-Cookie under any branch.
  if (!originAllowed(req)) return forbidden();

  const form = await req.formData();
  const emailLower = (form.get('email')?.toString() || '').trim().toLowerCase();
  const turnstileToken = form.get('cf-turnstile-response')?.toString() || '';
  const nowMs = Date.now();
  const ip = getClientIp(req);
  const turnstileOk = await verifyTurnstile(env, turnstileToken, ip);

  if (turnstileOk && isValidEmail(emailLower)) {
    const addressLowerHash = await hashWithPepper(emailLower, env);
    const ipBucketKey = await hashWithPepper(
      `signin_start:ip:${ip}:${hourBucket(nowMs)}`,
      env
    );
    const ipCount = await bumpRateBucket(env.DB, ipBucketKey, HOUR_MS, nowMs);

    if (ipCount <= IP_HOUR_LIMIT) {
      const emailBucketKey = `signin_start:email:${addressLowerHash}:${dayBucket(nowMs)}`;
      const emailCount = await bumpRateBucket(env.DB, emailBucketKey, DAY_MS, nowMs);

      if (emailCount <= EMAIL_DAY_LIMIT) {
        const nonce = generateNonce();
        const nonceHash = await hashWithPepper(nonce, env);
        const emailEncrypted = await encryptEmail(emailLower, env);
        await insertNonce(env.DB, { nonceHash, emailLowerHash: addressLowerHash, emailEncrypted, nowMs });
        const link = `${ORIGIN}/signin/finish?nonce=${encodeURIComponent(nonce)}`;
        try {
          await sendMagicLinkEmail(env, emailLower, link);
        } catch {
          console.error('magic-link send failed');
        }
      }
    }
  }

  return html(renderCheckInbox());
}

async function getValidSession(req, env, nowMs) {
  const token = getSessionToken(req);
  if (!token) return null;
  const idHash = await hashWithPepper(token, env);
  const row = await getSessionAccount(env.DB, idHash);
  if (!row) return null;
  if (row.expires_at < nowMs) {
    await deleteSession(env.DB, idHash);
    return null;
  }
  return row;
}

function getSessionToken(req) {
  const cookie = req.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? match[1] : null;
}

function isValidEmail(value) {
  return /.+@.+\..+/.test(value);
}

function forbidden() {
  return new Response(null, { status: 403, headers: SECURITY_HEADERS });
}
