import { jwtVerify, createRemoteJWKSet } from 'jose';
import { decryptEmail, encryptEmail, hashWithPepper } from './crypto.js';
import {
  approveScoutApplication,
  createAccountWithEmail,
  findEmailByHash,
  getScoutApplicationByAccount,
  listScoutApplications,
  revokeScoutApplication,
  upsertScoutApplicationApproved,
} from './db.js';
import { json } from './index.js';
import { aaguidLabel, uaLabel, truncateIp } from './settings.js';

const JWKS_URL = 'https://solpbc.cloudflareaccess.com/cdn-cgi/access/certs';
const ISSUER = 'https://solpbc.cloudflareaccess.com';
const JWKS = createRemoteJWKSet(new URL(JWKS_URL));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; frame-ancestors 'none'",
};

async function validateCfAccess(request, env) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: ISSUER,
      audience: env.CF_ACCESS_AUD,
    });
    if (typeof payload.email === 'string') return { email: payload.email.toLowerCase() };
    if (payload.common_name) return { service: payload.common_name };
    return null;
  } catch {
    return null;
  }
}

export async function handleAdmin(request, env, url) {
  const admin = await validateCfAccess(request, env);
  if (!admin) {
    return json({ error: 'cloudflare access required' }, { status: 403, headers: SECURITY_HEADERS });
  }

  try {
    const parts = url.pathname.split('/');
    if (parts[2] === 'scouts') {
      return await handleScoutAdmin(request, env, url, parts);
    }
    if (request.method !== 'GET') {
      return json({ error: 'account not found' }, { status: 404, headers: SECURITY_HEADERS });
    }
    if (url.pathname === '/admin/accounts') return await listAccounts(env);
    if (parts.length === 4 && parts[1] === 'admin' && parts[2] === 'accounts') {
      return await showAccount(env, decodeURIComponent(parts[3]));
    }
    return json({ error: 'account not found' }, { status: 404, headers: SECURITY_HEADERS });
  } catch {
    return json({ error: 'account not found' }, { status: 404, headers: SECURITY_HEADERS });
  }
}

async function handleScoutAdmin(request, env, url, parts) {
  if (request.method === 'GET' && parts.length === 3) {
    return listScouts(env, url.searchParams.get('status'));
  }
  if (request.method === 'POST' && parts.length === 4 && parts[3] === 'pre-approve') {
    return preApproveScout(request, env);
  }
  if (request.method === 'POST' && parts.length === 5 && parts[4] === 'approve') {
    return approveScout(env, decodeURIComponent(parts[3]));
  }
  if (request.method === 'POST' && parts.length === 5 && parts[4] === 'revoke') {
    return revokeScout(env, decodeURIComponent(parts[3]));
  }
  return json({ error: 'scout route not found' }, { status: 404, headers: SECURITY_HEADERS });
}

async function listScouts(env, status) {
  const rows = await listScoutApplications(env.DB, { status: status || undefined });
  const scouts = await Promise.all((rows || []).map(async (row) => ({
    account_id: row.account_id,
    primary_email: row.primary_address_encrypted
      ? await decryptOrNull(row.primary_address_encrypted, env)
      : null,
    status: row.status,
    applied_at: isoOrNull(row.applied_at),
    approved_at: isoOrNull(row.approved_at),
    revoked_at: isoOrNull(row.revoked_at),
    active_key: row.active_key === 1,
  })));
  return json({ scouts }, { headers: SECURITY_HEADERS });
}

async function approveScout(env, accountId) {
  const application = await getScoutApplicationByAccount(env.DB, { accountId });
  if (!application) {
    return json({ error: 'scout application not found' }, { status: 404, headers: SECURITY_HEADERS });
  }
  if (application.status === 'revoked') {
    return json({ error: 'revoked is terminal; use pre-approve' }, { status: 409, headers: SECURITY_HEADERS });
  }
  if (application.status === 'approved') {
    return json({ account_id: accountId, status: 'approved' }, { headers: SECURITY_HEADERS });
  }
  await approveScoutApplication(env.DB, { accountId, nowMs: Date.now() });
  return json({ account_id: accountId, status: 'approved' }, { headers: SECURITY_HEADERS });
}

async function revokeScout(env, accountId) {
  const application = await getScoutApplicationByAccount(env.DB, { accountId });
  if (!application) {
    return json({ error: 'scout application not found' }, { status: 404, headers: SECURITY_HEADERS });
  }
  if (application.status === 'revoked') {
    return json({ account_id: accountId, status: 'revoked' }, { headers: SECURITY_HEADERS });
  }
  await revokeScoutApplication(env.DB, { accountId, nowMs: Date.now() });
  return json({ account_id: accountId, status: 'revoked' }, { headers: SECURITY_HEADERS });
}

async function preApproveScout(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'valid email required' }, { status: 400, headers: SECURITY_HEADERS });
  }

  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  if (!isEmailLike(email)) {
    return json({ error: 'valid email required' }, { status: 400, headers: SECURITY_HEADERS });
  }

  const emailLower = email.toLowerCase();
  const addressLowerHash = await hashWithPepper(emailLower, env);
  const addressEncrypted = await encryptEmail(emailLower, env);
  const nowMs = Date.now();
  const { accountId } = await createAccountWithEmail(env.DB, {
    addressEncrypted,
    addressLowerHash,
    nowMs,
  });
  await upsertScoutApplicationApproved(env.DB, { accountId, nowMs });
  return json({ account_id: accountId, status: 'approved' }, { headers: SECURITY_HEADERS });
}

async function listAccounts(env) {
  const nowMs = Date.now();
  const { results } = await env.DB
    .prepare(
      `SELECT accounts.id, accounts.created_at, accounts.last_signin_at,
              pe.address_encrypted AS primary_address_encrypted,
              (SELECT COUNT(*) FROM passkey_credentials pc
                WHERE pc.account_id = accounts.id AND pc.revoked_at IS NULL) AS n_passkeys,
              (SELECT COUNT(*) FROM sessions s
                WHERE s.account_id = accounts.id AND s.revoked_at IS NULL AND s.expires_at > ?) AS n_sessions,
              (SELECT COUNT(*) FROM account_emails ae
                WHERE ae.account_id = accounts.id) AS n_emails
       FROM accounts
       LEFT JOIN account_emails pe
         ON pe.id = accounts.primary_email_id
        AND pe.account_id = accounts.id
       ORDER BY accounts.created_at DESC, accounts.id DESC`
    )
    .bind(nowMs)
    .all();
  const accounts = await Promise.all((results || []).map(async (row) => ({
    id: row.id,
    primary_email: row.primary_address_encrypted
      ? await decryptOrNull(row.primary_address_encrypted, env)
      : null,
    n_passkeys: row.n_passkeys,
    n_sessions: row.n_sessions,
    n_emails: row.n_emails,
    created_at: isoOrNull(row.created_at),
    last_signin_at: isoOrNull(row.last_signin_at),
  })));
  return json({ accounts }, { headers: SECURITY_HEADERS });
}

async function showAccount(env, seg) {
  const account = await resolveAccount(env, seg);
  if (!account) return json({ error: 'account not found' }, { status: 404, headers: SECURITY_HEADERS });

  const [primaryEmail, emails, passkeys, sessions] = await Promise.all([
    getPrimaryEmail(env, account),
    listEmails(env, account.id),
    listPasskeys(env, account.id),
    listSessions(env, account.id),
  ]);

  return json(
    {
      account: {
        id: account.id,
        primary_email: primaryEmail,
        created_at: isoOrNull(account.created_at),
        last_signin_at: isoOrNull(account.last_signin_at),
      },
      emails,
      passkeys,
      sessions,
    },
    { headers: SECURITY_HEADERS }
  );
}

async function resolveAccount(env, seg) {
  if (UUID_RE.test(seg)) return getAccountById(env, seg);
  if (!isEmailLike(seg)) return null;
  const row = await findEmailByHash(env.DB, await hashWithPepper(seg.toLowerCase(), env));
  if (!row) return null;
  return getAccountById(env, row.account_id);
}

async function getAccountById(env, id) {
  return env.DB
    .prepare('SELECT id, primary_email_id, created_at, last_signin_at FROM accounts WHERE id = ?')
    .bind(id)
    .first();
}

async function getPrimaryEmail(env, account) {
  if (!account.primary_email_id) return null;
  const row = await env.DB
    .prepare('SELECT address_encrypted FROM account_emails WHERE id = ?')
    .bind(account.primary_email_id)
    .first();
  return row?.address_encrypted ? decryptOrNull(row.address_encrypted, env) : null;
}

async function listEmails(env, accountId) {
  const { results } = await env.DB
    .prepare(
      `SELECT id, address_encrypted, is_primary, verified_at, created_at
       FROM account_emails
       WHERE account_id = ?
       ORDER BY is_primary DESC, created_at DESC`
    )
    .bind(accountId)
    .all();
  return Promise.all((results || []).map(async (row) => ({
    id: row.id,
    address: await decryptOrNull(row.address_encrypted, env),
    is_primary: row.is_primary === 1,
    verified_at: isoOrNull(row.verified_at),
    created_at: isoOrNull(row.created_at),
  })));
}

async function listPasskeys(env, accountId) {
  const { results } = await env.DB
    .prepare(
      `SELECT credential_id, friendly_name, aaguid, created_at, last_used_at, revoked_at
       FROM passkey_credentials
       WHERE account_id = ?
       ORDER BY created_at DESC`
    )
    .bind(accountId)
    .all();
  return (results || []).map((row) => ({
    credential_id: row.credential_id,
    friendly_name: row.friendly_name,
    aaguid_label: aaguidLabel(row.aaguid),
    created_at: isoOrNull(row.created_at),
    last_used_at: isoOrNull(row.last_used_at),
    revoked_at: isoOrNull(row.revoked_at),
  }));
}

async function listSessions(env, accountId) {
  const { results } = await env.DB
    .prepare(
      `SELECT id_hash, last_ip_encrypted, last_user_agent, created_at, last_active_at, expires_at, revoked_at
       FROM sessions
       WHERE account_id = ?
       ORDER BY created_at DESC`
    )
    .bind(accountId)
    .all();
  return Promise.all((results || []).map(async (row) => ({
    id_hash: row.id_hash,
    ua_label: uaLabel(row.last_user_agent),
    ip_trunc: row.last_ip_encrypted ? await decryptIpOrNull(row.last_ip_encrypted, env) : null,
    created_at: isoOrNull(row.created_at),
    last_active_at: isoOrNull(row.last_active_at),
    expires_at: isoOrNull(row.expires_at),
    revoked_at: isoOrNull(row.revoked_at),
  })));
}

async function decryptOrNull(value, env) {
  try {
    return await decryptEmail(value, env);
  } catch {
    return null;
  }
}

async function decryptIpOrNull(value, env) {
  const ip = await decryptOrNull(value, env);
  return ip ? truncateIp(ip) : null;
}

function isoOrNull(ms) {
  return ms == null ? null : new Date(ms).toISOString();
}

function isEmailLike(value) {
  // Intentional duplicate of index.js isValidEmail to avoid an index.js <-> admin.js import cycle.
  return /.+@.+\..+/.test(value);
}
