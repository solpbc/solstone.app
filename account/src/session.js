import { hashWithPepper } from './crypto.js';
import { deleteSession, getSessionAccount } from './db.js';

export const SESSION_COOKIE = 'account_session';
export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function getValidSession(req, env, nowMs) {
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

export function getSessionToken(req) {
  const cookie = req.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? match[1] : null;
}
