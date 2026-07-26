import { SignJWT } from 'jose';

export const BACKUP_ACTIONS = [
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
export const MAINTENANCE_ACTIONS = [...BACKUP_ACTIONS, 'DeleteObject', 'DeleteObjects'];

// One credential must cover a bounded operation: initial backup is capped at
// 49h and restore at 54h5m across its sequential phases. Maintenance is capped
// at 3h, so it keeps a shorter but operationally forgiving lifetime.
export const SPB_MINT_TTL_BACKUP = 72 * 60 * 60;
export const SPB_MINT_TTL_OPERATED = 72 * 60 * 60;
export const SPB_MINT_TTL_MAINTENANCE = 24 * 60 * 60;
export const SPB_SANDBOX_TTL_SECONDS = 90;

export const SCOPES = {
  backup: { actions: BACKUP_ACTIONS, ttl: SPB_MINT_TTL_BACKUP },
  operated: { actions: MAINTENANCE_ACTIONS, ttl: SPB_MINT_TTL_OPERATED },
  maintenance: { actions: MAINTENANCE_ACTIONS, ttl: SPB_MINT_TTL_MAINTENANCE },
};

const encoder = new TextEncoder();

export function scopeConfigFor(scope) {
  if (typeof scope !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(SCOPES, scope) ? SCOPES[scope] : null;
}

export async function mintScopedCredential(env, {
  prefix,
  scope,
  nowSeconds = Math.floor(Date.now() / 1000),
}) {
  const scopeConfig = scopeConfigFor(scope);
  if (!scopeConfig) return null;
  return mintCredential(env, {
    prefix,
    actions: scopeConfig.actions,
    ttl: scopeConfig.ttl,
    nowSeconds,
  });
}

export async function mintSandboxExternalCredential(env, {
  prefix,
  scope,
  nowSeconds = Math.floor(Date.now() / 1000),
}) {
  if (scope !== 'backup' && scope !== 'operated') return null;
  return mintCredential(env, {
    prefix,
    actions: SCOPES[scope].actions,
    ttl: SPB_SANDBOX_TTL_SECONDS,
    nowSeconds,
  });
}

export async function mintSandboxMaintenanceCredential(env, {
  prefix,
  nowSeconds = Math.floor(Date.now() / 1000),
}) {
  return mintCredential(env, {
    prefix,
    actions: MAINTENANCE_ACTIONS,
    ttl: SPB_SANDBOX_TTL_SECONDS,
    nowSeconds,
  });
}

async function mintCredential(env, { prefix, actions, ttl, nowSeconds }) {
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

  return {
    accessKeyId: env.R2_PARENT_ACCESS_KEY_ID,
    secretAccessKey: await sha256Hex(jwt),
    sessionToken: btoa(`jwt/${jwt}`),
    host,
    bucket: env.R2_BUCKET,
    ttl,
    nowSeconds,
  };
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
