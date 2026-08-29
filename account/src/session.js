import { encryptEmail, hashWithPepper } from './crypto.js';
import { bumpSessionActivity, deleteSession, getActiveDeletionForAccount, getSessionAccount } from './db.js';
import { getClientIp } from './index.js';

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
  // The owner must still be able to complete a fresh proof or cancel during the
  // safety period; every other session-backed route treats deletion as signed out.
  const deletionRoute = new URL(req.url).pathname.startsWith('/account/delete');
  if (!deletionRoute && await getActiveDeletionForAccount(env.DB, row.account_id)) return null;
  if (row.expires_at < nowMs) {
    await deleteSession(env.DB, idHash);
    return null;
  }
  try {
    const ipEncrypted = await encryptEmail(getClientIp(req), env);
    const rawUserAgent = req.headers.get('User-Agent');
    const userAgent = rawUserAgent == null ? null : rawUserAgent.slice(0, 512);
    await bumpSessionActivity(env.DB, {
      idHash,
      accountId: row.account_id,
      nowMs,
      ipEncrypted,
      userAgent,
    });
  } catch {
    console.error('activity_bump_failed');
  }
  return { ...row, id_hash: idHash };
}

export function getSessionToken(req) {
  const cookie = req.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? match[1] : null;
}
