// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { jwtVerify, createRemoteJWKSet } from 'jose';
import {
  listScouts,
  approveScout,
  revokeScout,
  preApproveScout,
  setGeminiKey,
  listFeedback,
  listNews,
  postNews,
} from './db.js';
import { renderAdmin } from './html.js';

const JWKS_URL = 'https://solpbc.cloudflareaccess.com/cdn-cgi/access/certs';
const ISSUER = 'https://solpbc.cloudflareaccess.com';
const JWKS = createRemoteJWKSet(new URL(JWKS_URL));

async function validateCfAccess(request, env) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: ISSUER,
      audience: env.CF_ACCESS_AUD,
    });
    if (typeof payload.email === 'string') {
      return { email: payload.email.toLowerCase() };
    }
    return null;
  } catch {
    return null;
  }
}

export async function handleAdmin(request, env, path) {
  const admin = await validateCfAccess(request, env);
  if (!admin) {
    return new Response('unauthorized — Cloudflare Access required', { status: 403 });
  }

  const db = env.DB;
  const method = request.method;

  // POST /admin/scouts/:did/approve
  const approveMatch = path.match(/^\/admin\/scouts\/(.+)\/approve$/);
  if (approveMatch && method === 'POST') {
    const did = decodeURIComponent(approveMatch[1]);
    await approveScout(db, did);
    return Response.redirect(new URL('/admin', request.url).toString(), 303);
  }

  // POST /admin/scouts/:did/revoke
  const revokeMatch = path.match(/^\/admin\/scouts\/(.+)\/revoke$/);
  if (revokeMatch && method === 'POST') {
    const did = decodeURIComponent(revokeMatch[1]);
    await revokeScout(db, did);
    return Response.redirect(new URL('/admin', request.url).toString(), 303);
  }

  // POST /admin/scouts/pre-approve
  if (path === '/admin/scouts/pre-approve' && method === 'POST') {
    const form = await request.formData();
    const didOrHandle = form.get('did_or_handle')?.toString().trim();
    if (!didOrHandle) {
      return new Response('did_or_handle required', { status: 400 });
    }
    await preApproveScout(db, didOrHandle);
    return Response.redirect(new URL('/admin', request.url).toString(), 303);
  }

  // POST /admin/scouts/:did/token
  const tokenMatch = path.match(/^\/admin\/scouts\/(.+)\/token$/);
  if (tokenMatch && method === 'POST') {
    const did = decodeURIComponent(tokenMatch[1]);
    const form = await request.formData();
    const key = form.get('gemini_key')?.toString().trim();
    if (!key) {
      return new Response('gemini_key required', { status: 400 });
    }
    await setGeminiKey(db, did, key, env.ENCRYPTION_SECRET);
    return Response.redirect(new URL('/admin', request.url).toString(), 303);
  }

  // POST /admin/news
  if (path === '/admin/news' && method === 'POST') {
    const form = await request.formData();
    const title = form.get('title')?.toString().trim();
    const body = form.get('body')?.toString().trim();
    if (!title || !body) {
      return new Response('title and body required', { status: 400 });
    }
    await postNews(db, title, body);
    return Response.redirect(new URL('/admin', request.url).toString(), 303);
  }

  // GET /admin
  if (path === '/admin' && method === 'GET') {
    const scouts = await listScouts(db);
    const feedback = await listFeedback(db);
    const news = await listNews(db);
    return new Response(renderAdmin(scouts, feedback, news, admin.email), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  return new Response('not found', { status: 404 });
}
