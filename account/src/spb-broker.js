import { SignJWT } from 'jose';
import { hashWithPepper } from './crypto.js';
import {
  findSpbBindingByTokenHash,
  getEntitlement,
  insertSpbMintAudit,
} from './db.js';
import { emitSecurityEvent } from './hub.js';
import { json } from './index.js';
import { isSpbEntitledToServe, SPB_HOSTED_SERVICE } from './spb-entitlement.js';

const BACKUP_ACTIONS = [
  'HeadObject',
  'GetObject',
  'GetBucketLocation',
  'ListObjectsV1',
  'ListObjectsV2',
  'ListMultipartUploads',
  'ListParts',
  'PutObject',
  'CreateMultipartUpload',
  'UploadPart',
  'CompleteMultipartUpload',
  'AbortMultipartUpload',
];
const MAINTENANCE_ACTIONS = [...BACKUP_ACTIONS, 'DeleteObject', 'DeleteObjects'];
const SPB_MINT_TTL_BACKUP = 3600;
const SPB_MINT_TTL_MAINTENANCE = 900;
const SCOPES = {
  backup: { actions: BACKUP_ACTIONS, ttl: SPB_MINT_TTL_BACKUP },
  maintenance: { actions: MAINTENANCE_ACTIONS, ttl: SPB_MINT_TTL_MAINTENANCE },
};
const encoder = new TextEncoder();

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
    const scopeConfig = scopeConfigFor(scope);
    if (!scopeConfig) {
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

    const { actions, ttl } = scopeConfig;
    const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const jwt = await new SignJWT({
      bucket: env.R2_BUCKET,
      paths: { prefixPaths: [prefix] },
      actions,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(env.R2_PARENT_ACCESS_KEY_ID)
      .setSubject(env.R2_ACCOUNT_ID)
      .setAudience(host)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + ttl)
      .sign(encoder.encode(env.R2_PARENT_SECRET_ACCESS_KEY));
    const secretAccessKey = await sha256Hex(jwt);
    const sessionToken = btoa(`jwt/${jwt}`);
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
      access_key_id: env.R2_PARENT_ACCESS_KEY_ID,
      secret_access_key: secretAccessKey,
      session_token: sessionToken,
      endpoint: `https://${host}`,
      bucket: env.R2_BUCKET,
      prefix,
      expires_at: expiresAt,
    });
  } catch {
    console.error('spb_mint_failed');
    return json({ error: 'internal_error' }, { status: 500 });
  }
}

function refusePreIdentity(env, ctx, outcome, body, status) {
  alertRefusal(env, ctx, outcome, null, null);
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

function scopeConfigFor(scope) {
  if (typeof scope !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(SCOPES, scope) ? SCOPES[scope] : null;
}

function prefixFor(accountId, instanceId) {
  return `users/${accountId}/${instanceId}/`;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
