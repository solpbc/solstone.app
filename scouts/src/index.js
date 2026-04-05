// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { getClientMetadata, startLogin, handleCallback, cleanupOAuthState } from './oauth.js';
import {
  createSession,
  getSession,
  deleteSession,
  upsertScout,
  getScout,
  applyScout,
  getGeminiKey,
  acknowledgeData,
  submitFeedback,
  listNews,
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
} from './html.js';

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
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; frame-ancestors 'none'",
};

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
          await upsertScout(db, did, handle);
          const session = await createSession(db, did);
          return redirect('/dashboard', {
            'Set-Cookie': sessionCookie(session.id),
          });
        } catch (err) {
          return html(renderError(`sign-in failed: ${err.message}`), 500);
        }
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

      const scout = await getScout(db, session.did);
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
        await acknowledgeData(db, scout.did);
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
            const geminiKey = await getGeminiKey(db, scout.did, env.ENCRYPTION_SECRET);
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
        const email = form.get('email')?.toString().trim();
        const useCase = form.get('use_case')?.toString().trim();
        if (!email) {
          return html(renderError('email is required'), 400);
        }
        await applyScout(db, scout.did, email, useCase);
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
        await submitFeedback(db, scout.did, category, body);
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

  // Scheduled cleanup of expired sessions and OAuth state
  async scheduled(event, env) {
    const db = env.DB;
    await Promise.all([
      db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run(),
      cleanupOAuthState(db),
    ]);
  },
};
