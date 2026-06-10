import { generateSessionToken, hashWithPepper } from './crypto.js';
import { findActiveDispatchToken, insertDispatchToken } from './db.js';

export async function mintDispatchToken(env, accountId) {
  const token = generateSessionToken();
  const tokenHash = await hashWithPepper(token, env, 'DISPATCH_TOKEN_PEPPER');
  const nowMs = Date.now();
  // No cap column: capability narrowness is enforced by resolveDispatchToken call sites.
  await insertDispatchToken(env.DB, { tokenHash, accountId, nowMs });
  return { token, accountId, createdAt: new Date(nowMs).toISOString() };
}

// Capability narrowness is enforced structurally: this verifier is invoked
// only from the L4 dispatch path. No `cap` column on the table.
export async function resolveDispatchToken(env, plaintext) {
  if (typeof plaintext !== 'string' || !plaintext) return null;
  const tokenHash = await hashWithPepper(plaintext, env, 'DISPATCH_TOKEN_PEPPER');
  const row = await findActiveDispatchToken(env.DB, tokenHash);
  return row ? { accountId: row.account_id } : null;
}
