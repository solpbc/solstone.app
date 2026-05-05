// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { jwtVerify, createRemoteJWKSet } from 'jose';
import {
  listScouts,
  getScout,
  approveScout,
  revokeScout,
  preApproveScout,
  setGeminiKey,
  listFeedback,
  listNews,
  postNews,
} from './db.js';
import { sendTransactionalEmail, renderApprovalEmail } from './email.js';

const JWKS_URL = 'https://solpbc.cloudflareaccess.com/cdn-cgi/access/certs';
const ISSUER = 'https://solpbc.cloudflareaccess.com';
const EXPECTED_AUD = '46f64ab0a7fe4148e2a36e4c6952e95026aa26cfcf01513ccabdbe8eb2f554e4';
const JWKS = createRemoteJWKSet(new URL(JWKS_URL));

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; frame-ancestors 'none'",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS },
  });
}

async function validateCfAccess(request) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: ISSUER,
      audience: EXPECTED_AUD,
    });
    if (typeof payload.email === 'string') {
      return { email: payload.email.toLowerCase() };
    }
    // Service tokens don't have email — check common_name
    if (payload.common_name) {
      return { service: payload.common_name };
    }
    return null;
  } catch {
    return null;
  }
}

async function getJsonBody(request) {
  const ct = request.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) {
    return request.json();
  }
  // Fall back to form data for backwards compatibility
  const form = await request.formData();
  const obj = {};
  for (const [key, value] of form.entries()) {
    obj[key] = value.toString().trim();
  }
  return obj;
}

export async function handleAdmin(request, env, path) {
  const admin = await validateCfAccess(request);
  if (!admin) {
    return json({ error: 'unauthorized — Cloudflare Access required' }, 403);
  }

  const db = env.DB;
  const method = request.method;

  // --- POST routes (specific patterns first) ---

  // POST /admin/scouts/pre-approve
  if (path === '/admin/scouts/pre-approve' && method === 'POST') {
    const body = await getJsonBody(request);
    const didOrHandle = body.did_or_handle;
    if (!didOrHandle) {
      return json({ error: 'did_or_handle required' }, 400);
    }
    const did = await preApproveScout(db, didOrHandle);
    return json({ ok: true, did, action: 'pre-approved' });
  }

  // POST /admin/scouts/:id/approve  (path param is the scout id; for atproto scouts this equals the DID — extro-scout sends DIDs unchanged and they still match)
  const approveMatch = path.match(/^\/admin\/scouts\/(.+)\/approve$/);
  if (approveMatch && method === 'POST') {
    const id = decodeURIComponent(approveMatch[1]);
    await approveScout(db, id);

    // Auto-send approval email — idempotent via approval_email_sent_at.
    // Only sends if the scout has an email and we haven't sent one before.
    let emailSent = false;
    try {
      const scout = await getScout(db, id);
      if (scout?.email && !scout.approval_email_sent_at) {
        const { subject, text, html: htmlBody } = renderApprovalEmail();
        await sendTransactionalEmail(env, {
          to: scout.email,
          subject,
          text,
          html: htmlBody,
        });
        await db
          .prepare("UPDATE scouts SET approval_email_sent_at = datetime('now') WHERE id = ?")
          .bind(id)
          .run();
        emailSent = true;
      }
    } catch (err) {
      console.error('approval email failed:', err.message);
    }

    return json({ ok: true, id, action: 'approved', approval_email_sent: emailSent });
  }

  // POST /admin/scouts/:id/revoke
  const revokeMatch = path.match(/^\/admin\/scouts\/(.+)\/revoke$/);
  if (revokeMatch && method === 'POST') {
    const id = decodeURIComponent(revokeMatch[1]);
    await revokeScout(db, id);
    return json({ ok: true, id, action: 'revoked' });
  }

  // POST /admin/scouts/:id/token
  const tokenMatch = path.match(/^\/admin\/scouts\/(.+)\/token$/);
  if (tokenMatch && method === 'POST') {
    const id = decodeURIComponent(tokenMatch[1]);
    const body = await getJsonBody(request);
    const key = body.gemini_key;
    if (!key) {
      return json({ error: 'gemini_key required' }, 400);
    }
    await setGeminiKey(db, id, key, env.ENCRYPTION_SECRET);
    return json({ ok: true, id, action: 'token_set' });
  }

  // POST /admin/news
  if (path === '/admin/news' && method === 'POST') {
    const body = await getJsonBody(request);
    const title = body.title;
    const bodyText = body.body;
    if (!title || !bodyText) {
      return json({ error: 'title and body required' }, 400);
    }
    await postNews(db, title, bodyText);
    return json({ ok: true, action: 'news_posted', title });
  }

  // --- GET routes ---

  // GET /admin/scouts — list all scouts
  if (path === '/admin/scouts' && method === 'GET') {
    const scouts = await listScouts(db);
    return json({ scouts });
  }

  // GET /admin/feedback — list all feedback
  if (path === '/admin/feedback' && method === 'GET') {
    const feedback = await listFeedback(db);
    return json({ feedback });
  }

  // GET /admin/news — list all news
  if (path === '/admin/news' && method === 'GET') {
    const news = await listNews(db);
    return json({ news });
  }

  // GET /admin/scouts/:id — scout detail with feedback (catch-all, must be last)
  const detailMatch = path.match(/^\/admin\/scouts\/(.+)$/);
  if (detailMatch && method === 'GET') {
    const id = decodeURIComponent(detailMatch[1]);
    const scout = await getScout(db, id);
    if (!scout) {
      return json({ error: 'scout not found' }, 404);
    }
    const allFeedback = await listFeedback(db);
    const scoutFeedback = allFeedback.filter((f) => f.scout_did === id);
    return json({ scout, feedback: scoutFeedback });
  }

  return json({ error: 'not found' }, 404);
}
