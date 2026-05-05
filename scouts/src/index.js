// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { getClientMetadata, startLogin, handleCallback, cleanupOAuthState } from './oauth.js';
import {
  createSession,
  getSession,
  deleteSession,
  upsertAtprotoScout,
  upsertEmailScout,
  applyEmailScout,
  findScoutByEmailLower,
  getScout,
  applyScout,
  getGeminiKey,
  acknowledgeData,
  submitFeedback,
  listNews,
  upsertOtpToken,
  getOtpToken,
  incrementOtpAttempts,
  consumeOtpToken,
  bumpRateBucket,
  getRateBucketCount,
  cleanupExpiredOtp,
  cleanupOldRateBuckets,
  expireStaleApplications,
} from './db.js';
import { handleAdmin } from './admin.js';
import {
  renderLanding,
  renderError,
  renderUnknown,
  renderApplied,
  renderApproved,
  renderRevoked,
  renderDataDisclosure,
  renderEmailStart,
  renderEmailVerify,
  renderEmailCheckInbox,
} from './html.js';
import { sendTransactionalEmail, renderOtpEmail } from './email.js';
import {
  generateOtp,
  hashCode,
  hashKey,
  otpExpiresAtIso,
  timingSafeEqual,
  normalizeCode,
  OTP_MAX_ATTEMPTS,
} from './otp.js';

const SESSION_COOKIE = 'scouts_session';
const SESSION_MAX_AGE = 14 * 24 * 60 * 60; // 2 weeks in seconds

function getSessionId(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? match[1] : null;
}

function sessionCookie(sessionId, maxAge = SESSION_MAX_AGE) {
  return `${SESSION_COOKIE}=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; frame-src 'self' https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; frame-ancestors 'none'",
};

const ORIGIN = 'https://scouts.solstone.app';
const IP_HOUR_LIMIT = 10;       // /email/start per IP per hour
const EMAIL_DAY_LIMIT = 5;      // OTP starts per email per day
const RESEND_COOLDOWN_MS = 60 * 1000;

function originAllowed(request) {
  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');
  if (origin) return origin === ORIGIN;
  if (referer) return referer.startsWith(`${ORIGIN}/`);
  return false;
}

function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP') || '0.0.0.0';
}

function hourBucket() {
  return new Date().toISOString().slice(0, 13);  // 'YYYY-MM-DDTHH'
}

function dayBucket() {
  return new Date().toISOString().slice(0, 10);  // 'YYYY-MM-DD'
}

function isValidEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

async function verifyTurnstile(env, token, ip) {
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token || '' });
  if (ip) body.set('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) return false;
  const json = await res.json();
  return json.success === true;
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS },
  });
}

function redirect(url, headers = {}) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: url,
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      ...headers,
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const db = env.DB;

    try {
      // --- Public routes ---

      // Client metadata (AT Protocol OAuth discovery)
      if (path === '/client-metadata.json') {
        return new Response(JSON.stringify(getClientMetadata()), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            ...SECURITY_HEADERS,
          },
        });
      }

      // Landing page
      if (path === '/' && method === 'GET') {
        // If already logged in, redirect to dashboard
        const session = await getSession(db, getSessionId(request));
        if (session) return redirect('/dashboard');
        return html(renderLanding());
      }

      // Start OAuth login
      if (path === '/login' && method === 'POST') {
        const form = await request.formData();
        const handle = form.get('handle')?.toString().trim();
        if (!handle) {
          return html(renderLanding('please enter your handle'), 400);
        }
        try {
          const authUrl = await startLogin(handle, db);
          return redirect(authUrl);
        } catch (err) {
          return html(
            renderLanding(`sign-in failed — ${err.message}. try again in a moment.`),
            400
          );
        }
      }

      // OAuth callback
      if (path === '/callback' && method === 'GET') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        if (error) {
          const desc = url.searchParams.get('error_description') || error;
          return html(renderError(`authorization failed: ${desc}`), 400);
        }

        if (!code || !state) {
          return html(renderError('missing authorization code or state'), 400);
        }

        try {
          const { did, handle } = await handleCallback(code, state, db);
          const scout = await upsertAtprotoScout(db, did, handle);
          const session = await createSession(db, scout.id);
          return redirect('/dashboard', {
            'Set-Cookie': sessionCookie(session.id),
          });
        } catch (err) {
          return html(renderError(`sign-in failed: ${err.message}`), 500);
        }
      }

      // --- Email + OTP path ---

      const emailPathDisabled = env.EMAIL_PATH_DISABLED === 'true';

      // GET /email — start form
      if (path === '/email' && method === 'GET') {
        if (emailPathDisabled) return redirect('/');
        // If already logged in, dashboard wins.
        const existing = await getSession(db, getSessionId(request));
        if (existing) return redirect('/dashboard');
        return html(renderEmailStart({ siteKey: env.TURNSTILE_SITE_KEY }));
      }

      // POST /email/start
      if (path === '/email/start' && method === 'POST') {
        if (!originAllowed(request)) return html(renderError('invalid request'), 403);
        const form = await request.formData();
        const emailRaw = form.get('email')?.toString().trim() || '';
        const turnstileToken = form.get('cf-turnstile-response')?.toString();
        const emailLower = emailRaw.toLowerCase();

        if (!isValidEmail(emailLower)) {
          return html(
            renderEmailStart({
              siteKey: env.TURNSTILE_SITE_KEY,
              error: "that doesn't look like an email address.",
              email: emailRaw,
            }),
            400
          );
        }

        const ip = getClientIp(request);
        const ipKey = await hashKey('ip', ip, env.ENCRYPTION_SECRET);
        const emailKey = await hashKey('email', emailLower, env.ENCRYPTION_SECRET);

        const turnstileOk = await verifyTurnstile(env, turnstileToken, ip);
        if (!turnstileOk) {
          return html(
            renderEmailStart({
              siteKey: env.TURNSTILE_SITE_KEY,
              error: "couldn't verify you're not a bot. try again.",
              email: emailRaw,
            }),
            400
          );
        }

        const ipCount = await getRateBucketCount(db, 'ip', ipKey, hourBucket());
        const emailCount = await getRateBucketCount(db, 'email', emailKey, dayBucket());
        const ipBlocked = ipCount >= IP_HOUR_LIMIT;
        const emailBlocked = emailCount >= EMAIL_DAY_LIMIT;
        const killed = emailPathDisabled;

        // Always bump IP/email buckets so an attacker pays the cost.
        await bumpRateBucket(db, 'ip', ipKey, hourBucket());
        await bumpRateBucket(db, 'email', emailKey, dayBucket());

        if (!ipBlocked && !emailBlocked && !killed) {
          const code = generateOtp();
          const codeHash = await hashCode(code, env.ENCRYPTION_SECRET);
          await upsertOtpToken(db, emailLower, codeHash, otpExpiresAtIso());
          try {
            const { subject, text, html: htmlBody } = renderOtpEmail(code);
            await sendTransactionalEmail(env, {
              to: emailLower,
              subject,
              text,
              html: htmlBody,
            });
          } catch (err) {
            console.error('email send failed:', err.message);
            // Generic response regardless — no enumeration.
          }
        }

        return html(renderEmailCheckInbox({ email: emailLower }));
      }

      // GET /email/verify — show verify form (email pre-filled from query if present)
      if (path === '/email/verify' && method === 'GET') {
        if (emailPathDisabled) return redirect('/');
        const email = url.searchParams.get('email')?.toLowerCase() || '';
        return html(renderEmailVerify({ email }));
      }

      // POST /email/verify
      if (path === '/email/verify' && method === 'POST') {
        if (!originAllowed(request)) return html(renderError('invalid request'), 403);
        const form = await request.formData();
        const emailLower = form.get('email')?.toString().trim().toLowerCase() || '';
        const codeInput = normalizeCode(form.get('code')?.toString());

        if (!isValidEmail(emailLower) || codeInput.length !== 6 || !/^\d{6}$/.test(codeInput)) {
          return html(
            renderEmailVerify({
              email: emailLower,
              error: 'enter the 6-digit code from your email.',
            }),
            400
          );
        }

        const otp = await getOtpToken(db, emailLower);
        if (!otp || otp.consumed === 1 || new Date(otp.expires_at) < new Date()) {
          return html(
            renderEmailVerify({
              email: emailLower,
              error: 'that code expired. request a new one.',
            }),
            400
          );
        }

        await incrementOtpAttempts(db, emailLower);
        const candidateHash = await hashCode(codeInput, env.ENCRYPTION_SECRET);
        const matches = timingSafeEqual(candidateHash, otp.code_hash);

        if (!matches) {
          const remaining = OTP_MAX_ATTEMPTS - (otp.attempts + 1);
          if (remaining <= 0) {
            await consumeOtpToken(db, emailLower);
            return html(
              renderEmailVerify({
                email: emailLower,
                error: 'this code is locked. request a new one in 15 minutes.',
                locked: true,
              }),
              400
            );
          }
          return html(
            renderEmailVerify({
              email: emailLower,
              error: `that code didn't match. ${remaining} attempts left.`,
            }),
            400
          );
        }

        // Match. Consume the OTP, upsert/find the scout, create a session.
        await consumeOtpToken(db, emailLower);
        const scout = await upsertEmailScout(db, emailLower);
        const session = await createSession(db, scout.id);
        return redirect('/dashboard', {
          'Set-Cookie': sessionCookie(session.id),
        });
      }

      // POST /email/resend
      if (path === '/email/resend' && method === 'POST') {
        if (!originAllowed(request)) return html(renderError('invalid request'), 403);
        const form = await request.formData();
        const emailLower = form.get('email')?.toString().trim().toLowerCase() || '';
        const turnstileToken = form.get('cf-turnstile-response')?.toString();

        if (!isValidEmail(emailLower)) {
          return html(renderEmailCheckInbox({ email: emailLower }));
        }

        const ip = getClientIp(request);
        const ipKey = await hashKey('ip', ip, env.ENCRYPTION_SECRET);
        const emailKey = await hashKey('email', emailLower, env.ENCRYPTION_SECRET);

        // Cooldown: reject if last started_at was within 60s.
        const prior = await getOtpToken(db, emailLower);
        if (prior && Date.now() - new Date(prior.started_at).getTime() < RESEND_COOLDOWN_MS) {
          return html(renderEmailCheckInbox({ email: emailLower }));
        }

        // Light Turnstile re-check; resends face the same bot pressure.
        const turnstileOk = turnstileToken
          ? await verifyTurnstile(env, turnstileToken, ip)
          : true; // resend may not always include turnstile (button click); rely on cooldown + caps
        if (!turnstileOk) {
          return html(renderEmailCheckInbox({ email: emailLower }));
        }

        const ipCount = await getRateBucketCount(db, 'ip', ipKey, hourBucket());
        const emailCount = await getRateBucketCount(db, 'email', emailKey, dayBucket());
        await bumpRateBucket(db, 'ip', ipKey, hourBucket());
        await bumpRateBucket(db, 'email', emailKey, dayBucket());

        if (ipCount < IP_HOUR_LIMIT && emailCount < EMAIL_DAY_LIMIT && !emailPathDisabled) {
          const code = generateOtp();
          const codeHash = await hashCode(code, env.ENCRYPTION_SECRET);
          await upsertOtpToken(db, emailLower, codeHash, otpExpiresAtIso());
          try {
            const { subject, text, html: htmlBody } = renderOtpEmail(code);
            await sendTransactionalEmail(env, {
              to: emailLower,
              subject,
              text,
              html: htmlBody,
            });
          } catch (err) {
            console.error('email send failed:', err.message);
          }
        }

        return html(renderEmailCheckInbox({ email: emailLower }));
      }

      // --- Admin routes (CF Access protected) ---

      if (path.startsWith('/admin')) {
        return handleAdmin(request, env, path);
      }

      // --- Authenticated routes ---

      const session = await getSession(db, getSessionId(request));
      if (!session) {
        return redirect('/');
      }

      const scout = await getScout(db, session.scout_id);
      if (!scout) {
        // Session exists but scout was deleted — clear session
        await deleteSession(db, session.id);
        return redirect('/', {
          'Set-Cookie': sessionCookie('', 0),
        });
      }

      // Data disclosure page
      if (path === '/data' && method === 'GET') {
        if (scout.status !== 'approved') return redirect('/dashboard');
        return html(renderDataDisclosure(scout));
      }

      // Acknowledge data disclosure
      if (path === '/data/acknowledge' && method === 'POST') {
        if (scout.status !== 'approved') return redirect('/dashboard');
        await acknowledgeData(db, scout.id);
        return redirect('/dashboard');
      }

      // Dashboard
      if (path === '/dashboard' && method === 'GET') {
        const news = await listNews(db);

        switch (scout.status) {
          case 'unknown':
            return html(renderUnknown(scout));
          case 'applied':
            return html(renderApplied(scout, news));
          case 'approved': {
            const geminiKey = await getGeminiKey(db, scout.id, env.ENCRYPTION_SECRET);
            return html(renderApproved(scout, geminiKey, news));
          }
          case 'revoked':
            return html(renderRevoked(scout));
          default:
            return html(renderUnknown(scout));
        }
      }

      // Apply
      if (path === '/apply' && method === 'POST') {
        const form = await request.formData();
        const useCase = form.get('use_case')?.toString().trim();
        if (scout.auth_kind === 'email') {
          // Email already verified; only use_case + profile_link are user-supplied.
          const profileLink = form.get('profile_link')?.toString().trim();
          await applyEmailScout(db, scout.id, useCase, profileLink);
        } else {
          const email = form.get('email')?.toString().trim();
          if (!email) {
            return html(renderError('email is required'), 400);
          }
          await applyScout(db, scout.id, email, useCase);
        }
        return redirect('/dashboard');
      }

      // Submit feedback
      if (path === '/feedback' && method === 'POST') {
        if (scout.status !== 'approved') {
          return html(renderError('only approved scouts can submit feedback'), 403);
        }
        const form = await request.formData();
        const category = form.get('category')?.toString();
        const body = form.get('body')?.toString().trim();
        if (!category || !body) {
          return html(renderError('category and feedback text are required'), 400);
        }
        const validCategories = ['bug', 'idea', 'confusion', 'praise'];
        if (!validCategories.includes(category)) {
          return html(renderError('invalid feedback category'), 400);
        }
        await submitFeedback(db, scout.id, category, body);
        return redirect('/dashboard');
      }

      // News API (JSON)
      if (path === '/api/news' && method === 'GET') {
        const news = await listNews(db);
        return new Response(JSON.stringify(news), {
          headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS },
        });
      }

      // Logout
      if (path === '/logout' && method === 'POST') {
        await deleteSession(db, session.id);
        return redirect('/', {
          'Set-Cookie': sessionCookie('', 0),
        });
      }

      return html(renderError('page not found'), 404);
    } catch (err) {
      console.error('unhandled error:', err);
      return html(renderError('something went wrong — try again in a moment.'), 500);
    }
  },

  // Scheduled cleanup — sessions, OAuth state, OTP, rate buckets, expirations
  async scheduled(event, env) {
    const db = env.DB;
    await Promise.all([
      db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run(),
      cleanupOAuthState(db),
      cleanupExpiredOtp(db),
      cleanupOldRateBuckets(db),
      expireStaleApplications(db),
    ]);
  },
};
