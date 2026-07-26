import { generateSessionToken, hashWithPepper } from './crypto.js';
import { findActiveDispatchToken, insertDispatchToken } from './db.js';
import { json } from './index.js';

export async function mintDispatchToken(env, accountId, sandboxRunId = null) {
  const token = generateSessionToken();
  const tokenHash = await hashWithPepper(token, env, 'DISPATCH_TOKEN_PEPPER');
  const nowMs = Date.now();
  // No cap column: capability narrowness is enforced by resolveDispatchToken call sites.
  await insertDispatchToken(env.DB, { tokenHash, accountId, nowMs, sandboxRunId });
  return { token, tokenHash, accountId, sandboxRunId, createdAt: new Date(nowMs).toISOString() };
}

// Capability narrowness is enforced structurally by dispatch-token call sites.
export async function resolveDispatchToken(env, plaintext) {
  if (typeof plaintext !== 'string' || !plaintext) return null;
  const nowMs = Date.now();
  const tokenHash = await hashWithPepper(plaintext, env, 'DISPATCH_TOKEN_PEPPER');
  const row = await findActiveDispatchToken(env.DB, tokenHash, nowMs);
  return row ? { accountId: row.account_id } : null;
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
