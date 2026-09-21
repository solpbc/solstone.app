import { mintDispatchToken, resolveDispatchToken } from './dispatch-tokens.js';
import { forbidden, json, originAllowed } from './index.js';
import { noStore, requireSignedInSession } from './settings.js';

export { mintDispatchToken, resolveDispatchToken };

export async function handleMintDispatchToken(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const minted = await mintDispatchToken(env, guard.session.account_id);
  return json({
    token: minted.token,
    account_id: minted.accountId,
    created_at: minted.createdAt,
  });
}

