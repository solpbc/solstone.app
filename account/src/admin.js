import { jwtVerify, createRemoteJWKSet } from 'jose';
import {
  decryptEmail,
  encryptEmail,
  generateSessionToken,
  hashWithPepper,
  timingSafeEqual,
} from './crypto.js';
import {
  createAccountWithEmail,
  createSession,
  findEmailByHash,
  getAccountTransparencyRow,
  getScoutApplicationByAccount,
  getScoutLifecycleMaxSequence,
  hasActiveProvisionedKeyMaterial,
  listEntitlementsForAccount,
  listScoutApplications,
  listScoutLifecycleEvents,
  transitionScoutStatusWithEvent,
} from './db.js';
import { json } from './index.js';
import { SPL_HOSTED_SERVICE } from './relay-grant.js';
import { SPB_HOSTED_SERVICE, reconcileAllServices } from './spb-entitlement.js';
import { importScoutRecords } from './scout-migrate.js';
import { SESSION_COOKIE } from './session.js';
import { aaguidLabel, disableActiveGeminiKey, uaLabel, truncateIp } from './settings.js';
import { SPP_HOSTED_SERVICE } from './spp-entitlement.js';
import { emitSecurityEvent } from './hub.js';
import { handleSandboxRunRequest } from './sandbox-run-lease.js';

const JWKS_URL = 'https://solpbc.cloudflareaccess.com/cdn-cgi/access/certs';
const ISSUER = 'https://solpbc.cloudflareaccess.com';
const JWKS = createRemoteJWKSet(new URL(JWKS_URL));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMPERSONATE_TTL_MS = 60 * 60 * 1000;
const HOSTED_SERVICES = [SPL_HOSTED_SERVICE, SPB_HOSTED_SERVICE, SPP_HOSTED_SERVICE];
const SCOUT_TRANSITION_ATTEMPTS = 3;
const SCOUT_LIFECYCLE_REASONS = {
  preapprove: {
    absent: ['invitation', 'operator_correction'],
    pending: ['application_approved', 'operator_correction'],
    revoked: ['eligibility_restored', 'operator_correction'],
  },
  approve: {
    pending: ['application_approved', 'operator_correction'],
  },
  revoke: {
    pending: ['owner_request', 'eligibility_ended', 'security_response', 'operator_correction'],
    approved: ['owner_request', 'eligibility_ended', 'security_response', 'operator_correction'],
  },
};

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; frame-ancestors 'none'",
};

function projectionUnavailable() {
  return json(
    { error: 'owner sign-in projection unavailable', code: 'owner_signin_projection_unavailable' },
    { status: 500, headers: SECURITY_HEADERS }
  );
}

function invalidScoutLifecycleReason() {
  return json(
    { error: 'valid Scout lifecycle reason_code required', code: 'invalid_scout_lifecycle_reason' },
    { status: 400, headers: SECURITY_HEADERS }
  );
}

function scoutLifecycleTransitionUnavailable() {
  return json(
    { error: 'Scout lifecycle transition unavailable', code: 'scout_lifecycle_transition_unavailable' },
    { status: 500, headers: SECURITY_HEADERS }
  );
}

function scoutLifecycleDownstreamUnavailable({ transitionCommitted, correlationId }) {
  return json(
    {
      error: 'Scout lifecycle downstream work unavailable',
      code: 'scout_lifecycle_downstream_unavailable',
      transition_committed: transitionCommitted,
      correlation_id: correlationId,
    },
    { status: 500, headers: SECURITY_HEADERS }
  );
}

function invalidScoutLifecycleHistoryLimit() {
  return json(
    { error: 'valid Scout lifecycle history limit required', code: 'invalid_scout_lifecycle_history_limit' },
    { status: 400, headers: SECURITY_HEADERS }
  );
}

function invalidScoutLifecycleHistoryCursor() {
  return json(
    { error: 'valid Scout lifecycle history cursor required', code: 'invalid_scout_lifecycle_history_cursor' },
    { status: 400, headers: SECURITY_HEADERS }
  );
}

function scoutLifecycleHistoryUnavailable() {
  return json(
    { error: 'Scout lifecycle history unavailable', code: 'scout_lifecycle_history_unavailable' },
    { status: 500, headers: SECURITY_HEADERS }
  );
}

async function validateCfAccess(request, env) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: ISSUER,
      audience: env.CF_ACCESS_AUD,
    });
    const hasEmail = Object.prototype.hasOwnProperty.call(payload, 'email');
    const hasService = Object.prototype.hasOwnProperty.call(payload, 'common_name');
    if (hasEmail === hasService) return null;
    if (hasEmail) {
      if (typeof payload.email !== 'string') return null;
      const email = payload.email.trim().toLowerCase();
      return email ? { email } : null;
    }
    if (typeof payload.common_name !== 'string' || !payload.common_name.trim()) return null;
    return { service: payload.common_name };
  } catch {
    return null;
  }
}

export async function handleAdmin(request, env, url, ctx) {
  const admin = await validateCfAccess(request, env);
  if (!admin) {
    return json({ error: 'cloudflare access required' }, { status: 403, headers: SECURITY_HEADERS });
  }

  try {
    const parts = url.pathname.split('/');
    if (parts[2] === 'scouts') {
      return await handleScoutAdmin(request, env, url, parts, admin, ctx);
    }
    if (parts[2] === 'migrate') {
      return await handleScoutMigrate(request, env, parts);
    }
    if (parts.length === 3 && parts[2] === 'impersonate') {
      return await impersonateAccount(request, env, admin, ctx);
    }
    if (parts[2] === 'sandbox-runs') {
      const response = await handleSandboxRunRequest(
        request,
        env,
        url,
        parts,
        ctx,
        SECURITY_HEADERS
      );
      if (response) return response;
    }
    if (request.method !== 'GET') {
      return json({ error: 'account not found' }, { status: 404, headers: SECURITY_HEADERS });
    }
    if (url.pathname === '/admin/accounts') {
      try {
        return await listAccounts(env);
      } catch {
        return projectionUnavailable();
      }
    }
    if (parts.length === 4 && parts[1] === 'admin' && parts[2] === 'accounts') {
      const seg = decodeURIComponent(parts[3]);
      try {
        return await showAccount(env, seg);
      } catch {
        return projectionUnavailable();
      }
    }
    return json({ error: 'account not found' }, { status: 404, headers: SECURITY_HEADERS });
  } catch {
    return json({ error: 'account not found' }, { status: 404, headers: SECURITY_HEADERS });
  }
}

async function handleScoutMigrate(request, env, parts) {
  if (!(request.method === 'POST' && parts.length === 4 && parts[3] === 'scout')) {
    return json({ error: 'migrate route not found' }, { status: 404, headers: SECURITY_HEADERS });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'records array required' }, { status: 400, headers: SECURITY_HEADERS });
  }

  if (!Array.isArray(body?.records)) {
    return json({ error: 'records array required' }, { status: 400, headers: SECURITY_HEADERS });
  }

  const dryRun = body?.dry_run !== false;
  const result = await importScoutRecords({ env, records: body.records, dryRun });
  return json(result, { headers: SECURITY_HEADERS });
}

async function handleScoutAdmin(request, env, url, parts, admin, ctx) {
  if (request.method === 'GET' && parts.length === 3) {
    return listScouts(env, url.searchParams.get('status'));
  }
  if (request.method === 'GET' && parts.length === 5 && parts[4] === 'history') {
    return listScoutHistory(env, decodeURIComponent(parts[3]), url);
  }
  const actor = admin.email
    ? { kind: 'operator', principal: admin.email }
    : { kind: 'service', principal: admin.service };
  if (request.method === 'POST' && parts.length === 4 && parts[3] === 'pre-approve') {
    return preApproveScout(request, env, actor, ctx);
  }
  if (request.method === 'POST' && parts.length === 5 && parts[4] === 'approve') {
    return approveScout(request, env, decodeURIComponent(parts[3]), actor, ctx);
  }
  if (request.method === 'POST' && parts.length === 5 && parts[4] === 'revoke') {
    return revokeScout(request, env, decodeURIComponent(parts[3]), actor, ctx);
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

async function approveScout(request, env, accountId, actor, ctx) {
  const nowMs = Date.now();
  const reasonCode = await readScoutLifecycleReason(request, 'approve');
  if (!reasonCode) return invalidScoutLifecycleReason();

  for (let attempt = 0; attempt < SCOUT_TRANSITION_ATTEMPTS; attempt += 1) {
    let application;
    try {
      application = await getScoutApplicationByAccount(env.DB, { accountId });
    } catch {
      return scoutLifecycleTransitionUnavailable();
    }
    if (!application) {
      return json({ error: 'scout application not found' }, { status: 404, headers: SECURITY_HEADERS });
    }
    if (application.status === 'revoked') {
      return json({ error: 'revoked is terminal; use pre-approve' }, { status: 409, headers: SECURITY_HEADERS });
    }
    if (application.status === 'approved') {
      const downstreamError = await runScoutDownstream(
        () => reconcileAllServices(env, accountId, nowMs, ctx),
        { transitionCommitted: false, correlationId: null }
      );
      if (downstreamError) return downstreamError;
      return scoutStatusResponse(accountId, 'approved', null);
    }
    if (!isScoutLifecycleReasonCompatible('approve', application.status, reasonCode)) {
      return invalidScoutLifecycleReason();
    }

    let transition;
    try {
      transition = await transitionScoutStatusWithEvent(env.DB, {
        accountId,
        action: 'approve',
        fromStatus: application.status,
        toStatus: 'approved',
        actorKind: actor.kind,
        actorPrincipal: actor.principal,
        reasonCode,
        nowMs,
      });
    } catch {
      return scoutLifecycleTransitionUnavailable();
    }
    if (!transition.transitioned) continue;

    const downstreamError = await runScoutDownstream(
      () => reconcileAllServices(env, accountId, nowMs, ctx),
      { transitionCommitted: true, correlationId: transition.correlationId }
    );
    if (downstreamError) return downstreamError;
    return scoutStatusResponse(accountId, 'approved', transition.correlationId);
  }
  return scoutLifecycleTransitionUnavailable();
}

async function revokeScout(request, env, accountId, actor, ctx) {
  const nowMs = Date.now();
  const reasonCode = await readScoutLifecycleReason(request, 'revoke');
  if (!reasonCode) return invalidScoutLifecycleReason();

  for (let attempt = 0; attempt < SCOUT_TRANSITION_ATTEMPTS; attempt += 1) {
    let application;
    try {
      application = await getScoutApplicationByAccount(env.DB, { accountId });
    } catch {
      return scoutLifecycleTransitionUnavailable();
    }
    if (!application) {
      return json({ error: 'scout application not found' }, { status: 404, headers: SECURITY_HEADERS });
    }
    if (application.status === 'revoked') return scoutStatusResponse(accountId, 'revoked', null);
    if (!isScoutLifecycleReasonCompatible('revoke', application.status, reasonCode)) {
      return invalidScoutLifecycleReason();
    }

    let transition;
    try {
      transition = await transitionScoutStatusWithEvent(env.DB, {
        accountId,
        action: 'revoke',
        fromStatus: application.status,
        toStatus: 'revoked',
        actorKind: actor.kind,
        actorPrincipal: actor.principal,
        reasonCode,
        nowMs,
      });
    } catch {
      return scoutLifecycleTransitionUnavailable();
    }
    if (!transition.transitioned) continue;

    const downstreamError = await runScoutDownstream(async () => {
      await disableActiveGeminiKey({ env, accountId, nowMs, ctx });
      await reconcileAllServices(env, accountId, nowMs, ctx);
    }, { transitionCommitted: true, correlationId: transition.correlationId });
    if (downstreamError) return downstreamError;
    return scoutStatusResponse(accountId, 'revoked', transition.correlationId);
  }
  return scoutLifecycleTransitionUnavailable();
}

async function preApproveScout(request, env, actor, ctx) {
  const nowMs = Date.now();
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
  const reasonCode = validScoutLifecycleReason('preapprove', body?.reason_code);
  if (!reasonCode) return invalidScoutLifecycleReason();

  const emailLower = email.toLowerCase();
  let accountId;
  try {
    const addressLowerHash = await hashWithPepper(emailLower, env);
    const addressEncrypted = await encryptEmail(emailLower, env);
    ({ accountId } = await createAccountWithEmail(env.DB, {
      addressEncrypted,
      addressLowerHash,
      nowMs,
    }));
  } catch {
    return scoutLifecycleTransitionUnavailable();
  }

  for (let attempt = 0; attempt < SCOUT_TRANSITION_ATTEMPTS; attempt += 1) {
    let application;
    try {
      application = await getScoutApplicationByAccount(env.DB, { accountId });
    } catch {
      return scoutLifecycleTransitionUnavailable();
    }
    if (application?.status === 'approved') {
      const downstreamError = await runScoutDownstream(
        () => reconcileAllServices(env, accountId, nowMs, ctx),
        { transitionCommitted: false, correlationId: null }
      );
      if (downstreamError) return downstreamError;
      return scoutStatusResponse(accountId, 'approved', null);
    }
    const fromStatus = application?.status ?? 'absent';
    if (!isScoutLifecycleReasonCompatible('preapprove', fromStatus, reasonCode)) {
      return invalidScoutLifecycleReason();
    }

    let transition;
    try {
      transition = await transitionScoutStatusWithEvent(env.DB, {
        accountId,
        action: 'preapprove',
        fromStatus,
        toStatus: 'approved',
        actorKind: actor.kind,
        actorPrincipal: actor.principal,
        reasonCode,
        nowMs,
      });
    } catch {
      return scoutLifecycleTransitionUnavailable();
    }
    if (!transition.transitioned) continue;

    const downstreamError = await runScoutDownstream(
      () => reconcileAllServices(env, accountId, nowMs, ctx),
      { transitionCommitted: true, correlationId: transition.correlationId }
    );
    if (downstreamError) return downstreamError;
    return scoutStatusResponse(accountId, 'approved', transition.correlationId);
  }
  return scoutLifecycleTransitionUnavailable();
}

async function listScoutHistory(env, accountId, url) {
  let account;
  try {
    account = await getAccountTransparencyRow(env.DB, accountId);
  } catch {
    return scoutLifecycleHistoryUnavailable();
  }
  if (!account) return json({ error: 'account not found' }, { status: 404, headers: SECURITY_HEADERS });

  const rawLimit = url.searchParams.get('limit');
  let limit = 50;
  if (rawLimit !== null) {
    if (!/^\d+$/.test(rawLimit)) return invalidScoutLifecycleHistoryLimit();
    limit = Number(rawLimit);
    if (limit < 1 || limit > 100) return invalidScoutLifecycleHistoryLimit();
  }

  const rawCursor = url.searchParams.get('cursor');
  let cursor;
  try {
    cursor = rawCursor === null ? null : await decodeScoutLifecycleCursor(rawCursor, env);
  } catch {
    return scoutLifecycleHistoryUnavailable();
  }
  if (rawCursor !== null && !isValidScoutLifecycleCursor(cursor, accountId)) {
    return invalidScoutLifecycleHistoryCursor();
  }

  let currentMaxSequence;
  try {
    currentMaxSequence = await getScoutLifecycleMaxSequence(env.DB, accountId);
  } catch {
    return scoutLifecycleHistoryUnavailable();
  }
  if (cursor && cursor.s > currentMaxSequence) return invalidScoutLifecycleHistoryCursor();

  const snapshotSequence = cursor?.s ?? currentMaxSequence;
  const boundary = cursor?.b ?? snapshotSequence;
  let rows;
  try {
    rows = await listScoutLifecycleEvents(env.DB, accountId, {
      maxSequence: boundary,
      limit: limit + 1,
    });
  } catch {
    return scoutLifecycleHistoryUnavailable();
  }

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const events = pageRows.map((row) => ({
    correlation_id: row.correlation_id,
    sequence: row.sequence,
    action: row.action,
    from_status: row.from_status,
    to_status: row.to_status,
    actor_kind: row.actor_kind,
    actor_principal: row.actor_principal,
    reason_code: row.reason_code,
    occurred_at: isoOrNull(row.occurred_at),
  }));
  let nextCursor = null;
  if (hasMore) {
    try {
      nextCursor = await encodeScoutLifecycleCursor({
        a: accountId,
        s: snapshotSequence,
        b: pageRows[pageRows.length - 1].sequence - 1,
      }, env);
    } catch {
      return scoutLifecycleHistoryUnavailable();
    }
  }
  return json(
    {
      account_id: accountId,
      snapshot_sequence: snapshotSequence,
      events,
      next_cursor: nextCursor,
    },
    { headers: SECURITY_HEADERS }
  );
}

async function readScoutLifecycleReason(request, action) {
  let body;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  return validScoutLifecycleReason(action, body?.reason_code);
}

function validScoutLifecycleReason(action, reasonCode) {
  if (typeof reasonCode !== 'string') return null;
  const valid = Object.values(SCOUT_LIFECYCLE_REASONS[action] || {}).some((codes) => codes.includes(reasonCode));
  return valid ? reasonCode : null;
}

function isScoutLifecycleReasonCompatible(action, fromStatus, reasonCode) {
  return SCOUT_LIFECYCLE_REASONS[action]?.[fromStatus]?.includes(reasonCode) === true;
}

async function runScoutDownstream(work, committed) {
  try {
    await work();
    return null;
  } catch {
    return scoutLifecycleDownstreamUnavailable(committed);
  }
}

function scoutStatusResponse(accountId, status, correlationId) {
  return json(
    { account_id: accountId, status, correlation_id: correlationId },
    { headers: SECURITY_HEADERS }
  );
}

async function encodeScoutLifecycleCursor(cursor, env) {
  const payload = btoa(JSON.stringify(cursor))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  const signature = await hashWithPepper(`scout-lifecycle-history:${payload}`, env);
  return `${payload}.${signature}`;
}

async function decodeScoutLifecycleCursor(value, env) {
  const parts = value.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || payload.length % 4 === 1) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(signature)) return null;
  const expected = await hashWithPepper(`scout-lifecycle-history:${payload}`, env);
  if (!timingSafeEqual(signature, expected)) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
  } catch {
    return null;
  }
}

function isValidScoutLifecycleCursor(cursor, accountId) {
  return cursor !== null
    && typeof cursor === 'object'
    && !Array.isArray(cursor)
    && Object.keys(cursor).sort().join(',') === 'a,b,s'
    && typeof cursor.a === 'string'
    && cursor.a === accountId
    && Number.isSafeInteger(cursor.s)
    && Number.isSafeInteger(cursor.b)
    && cursor.b >= 1
    && cursor.b <= cursor.s;
}

async function impersonateAccount(request, env, admin, ctx) {
  if (request.method !== 'POST') {
    return json({ error: 'account not found' }, { status: 404, headers: SECURITY_HEADERS });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'account not found' }, { status: 404, headers: SECURITY_HEADERS });
  }

  const seg = typeof body?.account_id === 'string'
    ? body.account_id
    : (typeof body?.email === 'string' ? body.email : '');
  if (!seg) {
    return json({ error: 'account not found' }, { status: 404, headers: SECURITY_HEADERS });
  }

  const account = await resolveAccount(env, seg);
  if (!account) {
    return json({ error: 'account not found' }, { status: 404, headers: SECURITY_HEADERS });
  }

  const operator = admin.email || admin.service;
  const allowlist = parseImpersonateAllowlist(env);
  if (!allowlist.has(account.id.toLowerCase())) {
    const reason = allowlist.size === 0 ? 'disabled' : 'not_allowlisted';
    console.warn(JSON.stringify({ event: 'admin_impersonate_denied', operator, account_id: account.id, reason }));
    emitSecurityEvent(env, ctx, { type: 'impersonate_denied', tier: 'T4', operator, account_id: account.id, reason });
    return json({ error: 'account not found' }, { status: 404, headers: SECURITY_HEADERS });
  }

  const nowMs = Date.now();
  const token = generateSessionToken();
  const idHash = await hashWithPepper(token, env);
  const marker = `impersonation by ${operator}`;
  await createSession(env.DB, {
    idHash,
    accountId: account.id,
    nowMs,
    ttlMs: IMPERSONATE_TTL_MS,
    lastUserAgent: marker,
  });
  console.warn(JSON.stringify({ event: 'admin_impersonate', operator, account_id: account.id, session_id_hash: idHash }));
  emitSecurityEvent(env, ctx, {
    type: 'impersonate',
    tier: 'T4',
    operator,
    account_id: account.id,
    session_id_hash: idHash,
    expires_at: new Date(nowMs + IMPERSONATE_TTL_MS).toISOString(),
  });
  return json(
    {
      account_id: account.id,
      session_token: token,
      cookie_name: SESSION_COOKIE,
      expires_at: new Date(nowMs + IMPERSONATE_TTL_MS).toISOString(),
    },
    { headers: SECURITY_HEADERS }
  );
}

async function listAccounts(env) {
  const nowMs = Date.now();
  const { results } = await env.DB
    .prepare(
      `SELECT accounts.id, accounts.created_at, accounts.last_signin_at,
              pe.address_encrypted AS primary_address_encrypted,
              sa.status AS scout_status,
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
       LEFT JOIN scout_applications sa ON sa.account_id = accounts.id
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
    scout_status: row.scout_status ?? 'absent',
  })));
  return json({ accounts }, { headers: SECURITY_HEADERS });
}

async function showAccount(env, seg) {
  const account = await resolveAccount(env, seg);
  if (!account) return json({ error: 'account not found' }, { status: 404, headers: SECURITY_HEADERS });

  const detailResults = await Promise.allSettled([
    getPrimaryEmail(env, account),
    listEmails(env, account.id),
    listPasskeys(env, account.id),
    listSessions(env, account.id),
    getScoutApplicationByAccount(env.DB, { accountId: account.id }),
    hasActiveProvisionedKeyMaterial(env.DB, { accountId: account.id, provider: 'gemini' }),
    listEntitlementsForAccount(env.DB, { accountId: account.id }),
  ]);
  const failed = detailResults.find((result) => result.status === 'rejected');
  if (failed) throw failed.reason;
  const [primaryEmail, emails, passkeys, sessions, application, hasLegacyGeminiKey, entitlementRows] =
    detailResults.map((result) => result.value);
  const scoutStatus = application?.status ?? 'absent';
  const scout = {
    status: scoutStatus,
    applied_at: isoOrNull(application?.applied_at),
    approved_at: isoOrNull(application?.approved_at),
    revoked_at: isoOrNull(application?.revoked_at),
    legacy_gemini_key: hasLegacyGeminiKey ? 'active' : 'inactive',
  };
  const rowsByService = Object.fromEntries(entitlementRows.map((row) => [row.service, row]));
  const serviceEntitlements = HOSTED_SERVICES.map((service) => {
    const row = rowsByService[service];
    return {
      service,
      status: row?.status ?? null,
      source_basis: !row ? 'none' : (row.source === 'comp' ? 'complimentary' : 'paid'),
    };
  });
  const consistencyWarnings = computeConsistencyWarnings(scoutStatus, rowsByService);

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
      scout,
      service_entitlements: serviceEntitlements,
      consistency_warnings: consistencyWarnings,
    },
    { headers: SECURITY_HEADERS }
  );
}

export function computeConsistencyWarnings(scoutStatus, rowsByService) {
  const warnings = [];
  for (const service of HOSTED_SERVICES) {
    const row = rowsByService[service];
    if (scoutStatus === 'approved') {
      const paid = row && row.source !== 'comp' && (row.status === 'active' || row.status === 'past_due');
      const complimentary = row && row.source === 'comp' && row.status === 'active';
      if (!(paid || complimentary)) warnings.push(`approved_scout_missing_entitlement:${service}`);
    } else if (row && row.source === 'comp' && row.status === 'active') {
      warnings.push(`nonapproved_scout_active_complimentary_entitlement:${service}`);
    }
  }
  return warnings;
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

function parseImpersonateAllowlist(env) {
  return new Set(
    String(env.IMPERSONATE_ALLOWED ?? '')
      .split(',')
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isEmailLike(value) {
  // Intentional duplicate of index.js isValidEmail to avoid an index.js <-> admin.js import cycle.
  return /.+@.+\..+/.test(value);
}
