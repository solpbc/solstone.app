import { hashWithPepper } from './crypto.js';
import {
  findSpbBindingByTokenHash,
  getEntitlement,
  insertSpbMintAudit,
} from './db.js';
import { emitSecurityEvent } from './hub.js';
import { json } from './index.js';
import { mintScopedCredential } from './r2-credential.js';
import { isSpbEntitledToServe, SPB_HOSTED_SERVICE } from './spb-entitlement.js';

export async function handleBackupCredentials(req, env, ctx) {
  try {
    const nowMs = Date.now();
    const nowSeconds = Math.floor(nowMs / 1000);

    if (env.SPB_MINT_ENABLED !== 'true') {
      return refusePreIdentity(env, ctx, 'refused_killswitch', { error: 'mint_disabled' }, 503);
    }

    const auth = req.headers.get('Authorization') || '';
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return refusePreIdentity(env, ctx, 'refused_binding', { error: 'invalid_token' }, 401);
    }

    const tokenHash = await hashWithPepper(match[1], env);
    const binding = await findSpbBindingByTokenHash(env.DB, tokenHash);
    if (!binding) {
      return refusePreIdentity(env, ctx, 'refused_binding', { error: 'invalid_token' }, 401);
    }

    const accountId = binding.account_id;
    const instanceId = binding.instance_id;
    const prefix = prefixFor(accountId, instanceId);
    const entitlement = await getEntitlement(env.DB, { accountId, service: SPB_HOSTED_SERVICE });
    if (!isSpbEntitledToServe(entitlement, nowSeconds, env)) {
      await audit(env, {
        accountId,
        instanceId,
        prefix,
        scope: null,
        ttl: null,
        outcome: 'refused_entitlement',
        ts: nowMs,
      });
      alertRefusal(env, ctx, 'refused_entitlement', accountId, instanceId);
      return json({ error: 'needs_subscription' }, { status: 402 });
    }

    const body = await readJson(req);
    const scope = body?.scope;
    const credential = await mintScopedCredential(env, { prefix, scope, nowSeconds });
    if (!credential) {
      await audit(env, {
        accountId,
        instanceId,
        prefix,
        scope: null,
        ttl: null,
        outcome: 'refused_scope',
        ts: nowMs,
      });
      alertRefusal(env, ctx, 'refused_scope', accountId, instanceId);
      return json({ error: 'invalid_scope' }, { status: 400 });
    }

    const { accessKeyId, secretAccessKey, sessionToken, host, bucket, ttl } = credential;
    const expiresAt = new Date((nowSeconds + ttl) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');

    await audit(env, {
      accountId,
      instanceId,
      prefix,
      scope,
      ttl,
      outcome: 'minted',
      ts: nowMs,
    });

    return json({
      access_key_id: accessKeyId,
      secret_access_key: secretAccessKey,
      session_token: sessionToken,
      endpoint: `https://${host}`,
      bucket,
      prefix,
      expires_at: expiresAt,
    });
  } catch {
    console.error('spb_mint_failed');
    return json({ error: 'internal_error' }, { status: 500 });
  }
}

function refusePreIdentity(env, ctx, outcome, body, status) {
  // refused_killswitch is the expected operator state while minting is disabled (dark),
  // not a security anomaly — don't page on it (scanner/health-probe noise). Real probes
  // (refused_binding, a bad bearer token) still alert.
  if (outcome !== 'refused_killswitch') alertRefusal(env, ctx, outcome, null, null);
  console.warn(JSON.stringify({ event: 'spb_mint_refused', outcome }));
  return json(body, { status });
}

function alertRefusal(env, ctx, outcome, accountId, instanceId) {
  emitSecurityEvent(env, ctx, {
    type: 'spb_mint_refused',
    tier: 'T4',
    outcome,
    account_id: accountId ?? null,
    instance_id: instanceId ?? null,
  });
}

function audit(env, row) {
  return insertSpbMintAudit(env.DB, row);
}

async function readJson(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export function prefixFor(accountId, instanceId) {
  return `users/${accountId}/${instanceId}/`;
}
