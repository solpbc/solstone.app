import { hashWithPepper } from './crypto.js';
import {
  advanceSpbSandboxCredentialExpiry,
  findSpbBindingByTokenHash,
  getEntitlement,
  insertSpbMintAudit,
  insertSpbSandboxAudit,
} from './db.js';
import { emitSecurityEvent } from './hub.js';
import { json } from './index.js';
import {
  mintSandboxExternalCredential,
  mintScopedCredential,
} from './r2-credential.js';
import { isSpbEntitledToServe, SPB_HOSTED_SERVICE } from './spb-entitlement.js';

export async function handleBackupCredentials(req, env, ctx) {
  let sandboxIdentityResolved = false;
  let nowMs;
  try {
    nowMs = Date.now();
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
    const binding = await findSpbBindingByTokenHash(env.DB, tokenHash, nowMs);
    if (!binding) {
      return refusePreIdentity(env, ctx, 'refused_binding', { error: 'invalid_token' }, 401);
    }

    const accountId = binding.account_id;
    const instanceId = binding.instance_id;
    const sandboxRunId = binding.sandbox_run_id;
    sandboxIdentityResolved = sandboxRunId !== null;
    const prefix = prefixFor(accountId, instanceId);
    const entitlement = await getEntitlement(env.DB, { accountId, service: SPB_HOSTED_SERVICE });
    if (!isSpbEntitledToServe(entitlement, nowSeconds, env)) {
      if (sandboxIdentityResolved) {
        await recordSandboxMint(env, ctx, {
          outcome: 'refused_entitlement',
          scope: null,
          ttl: null,
          credentialsMinted: 0,
          nowMs,
        });
      } else {
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
      }
      return json({ error: 'needs_subscription' }, { status: 402 });
    }

    const body = await readJson(req);
    const scope = body?.scope;
    const credential = sandboxIdentityResolved
      ? await mintSandboxExternalCredential(env, { prefix, scope, nowSeconds })
      : await mintScopedCredential(env, { prefix, scope, nowSeconds });
    if (!credential) {
      if (sandboxIdentityResolved) {
        await recordSandboxMint(env, ctx, {
          outcome: 'refused_scope',
          scope: null,
          ttl: null,
          credentialsMinted: 0,
          nowMs,
        });
      } else {
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
      }
      return json({ error: 'invalid_scope' }, { status: 400 });
    }

    const proposedExpiryMs = (credential.nowSeconds + credential.ttl) * 1000;

    if (sandboxIdentityResolved) {
      const advanced = await advanceSpbSandboxCredentialExpiry(env.DB, {
        proposedExpiryMs,
        tokenHash,
        accountId,
        instanceId,
        sandboxRunId,
        nowMs,
      });
      if (!advanced) {
        await recordSandboxMint(env, ctx, {
          outcome: 'mint_cas_lost',
          scope,
          ttl: credential.ttl,
          credentialsMinted: 0,
          nowMs,
        });
        return json({ error: 'invalid_token' }, { status: 401 });
      }
      await recordSandboxMint(env, ctx, {
        outcome: 'minted',
        scope,
        ttl: credential.ttl,
        credentialsMinted: 1,
        nowMs,
      });
    } else {
      await audit(env, {
        accountId,
        instanceId,
        prefix,
        scope,
        ttl: credential.ttl,
        outcome: 'minted',
        ts: nowMs,
      });
    }

    return credentialResponse(credential, prefix, proposedExpiryMs);
  } catch {
    if (sandboxIdentityResolved) {
      try {
        await recordSandboxMint(env, ctx, {
          outcome: 'internal_error',
          scope: null,
          ttl: null,
          credentialsMinted: 0,
          nowMs,
        });
      } catch {
        // The response remains fail-closed if durable error evidence is unavailable.
      }
    } else {
      console.error('spb_mint_failed');
    }
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

async function recordSandboxMint(env, ctx, {
  outcome,
  scope,
  ttl,
  credentialsMinted,
  nowMs,
}) {
  await insertSpbSandboxAudit(env.DB, {
    event: 'mint',
    outcome,
    scope,
    ttl,
    credentialsMinted,
    objectsDeleted: null,
    multipartAborted: null,
    ts: nowMs,
  });
  console.warn(JSON.stringify({
    event: 'spb_sandbox_mint',
    outcome,
    credentials_minted: credentialsMinted,
    ts: nowMs,
  }));
  emitSecurityEvent(env, ctx, {
    type: 'spb_sandbox_mint',
    tier: 'T4',
    outcome,
    credentials_minted: credentialsMinted,
  });
}

function credentialResponse(credential, prefix, expiryMs) {
  return json({
    access_key_id: credential.accessKeyId,
    secret_access_key: credential.secretAccessKey,
    session_token: credential.sessionToken,
    endpoint: `https://${credential.host}`,
    bucket: credential.bucket,
    prefix,
    expires_at: new Date(expiryMs).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  });
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
