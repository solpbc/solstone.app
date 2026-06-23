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

export const SPB_MINT_TTL_BACKUP = 3600;
export const SPB_MINT_TTL_MAINTENANCE = 900;

export const SCOPES = {
  backup: { actions: BACKUP_ACTIONS, ttl: SPB_MINT_TTL_BACKUP },
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
