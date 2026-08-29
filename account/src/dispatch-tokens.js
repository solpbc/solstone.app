import { generateSessionToken, hashWithPepper } from './crypto.js';
import { findActiveDispatchToken, getActiveDeletionForAccount, insertDispatchToken } from './db.js';
import { json } from './index.js';

export async function mintDispatchToken(env, accountId) {
  const token = generateSessionToken();
  const tokenHash = await hashWithPepper(token, env, 'DISPATCH_TOKEN_PEPPER');
  const nowMs = Date.now();
  // No cap column: capability narrowness is enforced by resolveDispatchToken call sites.
  await insertDispatchToken(env.DB, { tokenHash, accountId, nowMs });
  return { token, accountId, createdAt: new Date(nowMs).toISOString() };
}

// Capability narrowness is enforced structurally by dispatch-token call sites.
export async function resolveDispatchToken(env, plaintext) {
  if (typeof plaintext !== 'string' || !plaintext) return null;
  const tokenHash = await hashWithPepper(plaintext, env, 'DISPATCH_TOKEN_PEPPER');
  const row = await findActiveDispatchToken(env.DB, tokenHash);
  if (!row || await getActiveDeletionForAccount(env.DB, row.account_id)) return null;
  return { accountId: row.account_id };
}

export async function resolveBearerAccount(req, env) {
  const auth = req.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return invalidToken();
  const resolved = await resolveDispatchToken(env, match[1]);
  if (!resolved) return invalidToken();
  return resolved;
}

export function invalidToken() {
  return json({ error: 'invalid_token' }, { status: 401 });
}
