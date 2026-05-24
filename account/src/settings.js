import { decryptEmail, encryptEmail } from './crypto.js';
import {
  countAccountEmails,
  countActivePasskeys,
  countActiveSessions,
  deleteRevokedProvisionedKey,
  findActiveProvisionedKey,
  findRecentGeminiRevealAck,
  insertGeminiRevealAck,
  listPasskeyCredentialsForAccount,
  listProvisionedKeysAudit,
  listSessionsForAccount,
  removePasskey,
  renamePasskey,
  rotateGeminiBatch,
  revokeProvisionedKey,
  revokeOtherSessions,
  revokeSession,
  updateProvisionedKeyGcpLastUse,
  verifyOauthAccessToken,
} from './db.js';
import {
  gcpCreateApiKey,
  gcpDeleteKey,
  gcpFetchKeyString,
  gcpFindKeyByDisplayName,
  gcpPollOperation,
} from './gcp.js';
import {
  formatDate,
  formatRelativeTime,
  renderServicesScoutReveal,
  renderServicesScout,
  renderSignInPasskeys,
  renderSignInSessions,
  renderSignInShell,
} from './html.js';
import { forbidden, html, json, originAllowed, redirect } from './index.js';
import { normalizeFriendlyName } from './passkey.js';
import { computeDisplayName } from './provisioning.js';
import { clearSessionCookie, getValidSession } from './session.js';

const NO_STORE = { 'Cache-Control': 'no-store' };
const ZERO_AAGUID = '00000000-0000-0000-0000-000000000000';
const GEMINI_PROVIDER = 'gemini';
const REVEAL_ACK_TTL_MS = 24 * 60 * 60 * 1000;
const ROTATION_DELETE_GRACE_MS = 30_000;
const ROTATION_SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const AAGUID_LABELS = {
  'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': 'icloud keychain',
  'dd4ec289-e01d-41c9-bb89-70fa845d4bf2': 'icloud keychain',
  'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': 'google password manager',
  '08987058-cadc-4b81-b6e1-30de50dcbe96': 'windows hello',
  '9ddd1817-af5a-4672-a2b9-3e3dd95000a9': 'windows hello',
  '6028b017-b1d4-4c02-b4b3-afcdafc96bb2': 'windows hello',
  '53414d53-554e-4700-0000-000000000000': 'samsung pass',
  'bada5566-a7aa-401f-bd96-45619a55120d': '1password',
  '531126d6-e717-415c-9320-3d9aa6981239': 'dashlane',
  'd548826e-79b4-db40-a3d8-11116f7e8349': 'bitwarden',
  'b84e4048-15dc-4dd0-8640-f4f60813c8af': 'nordpass',
  '0ea242b4-43c4-4a1b-8b17-dd6d0b6baec6': 'keeper',
  '50726f74-6f6e-5061-7373-50726f746f6e': 'proton pass',
  '2fc0579f-8113-47ea-b116-bb5a8db9202a': 'yubikey',
  'fa2b99dc-9e39-4257-8f92-4a30d23c4118': 'yubikey',
  '90636e1f-ef82-43bf-bdcf-5255f139d12f': 'yubikey bio',
  'f8a011f3-8c0a-4d15-8006-17111f9edc7d': 'yubico security key',
  '42b4fb4a-2866-43b2-9bf7-6c6669c2e5d3': 'google titan security key',
  '260e3021-482d-442d-838c-7edfbe153b7e': 'feitian security key',
};

export async function handleSignInShell(req, env) {
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const { session } = guard;
  const sessionCount = await countActiveSessions(env.DB, session.account_id);
  const passkeyCount = await countActivePasskeys(env.DB, session.account_id);
  const emailCount = await countAccountEmails(env.DB, session.account_id);
  return signedInHtml(renderSignInShell({
    sessionCount,
    passkeyCount,
    emailCount,
  }));
}

export async function handleSignInSessions(req, env) {
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const { session, nowMs } = guard;
  const rows = await listSessionsForAccount(env.DB, session.account_id);
  const viewRows = await Promise.all(rows.map((row) => sessionViewRow(row, env)));
  return signedInHtml(renderSignInSessions({
    rows: viewRows,
    currentIdHash: session.id_hash,
    now: nowMs,
  }));
}

export async function handleSignInPasskeys(req, env) {
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const { session, nowMs } = guard;
  const rows = await listPasskeyCredentialsForAccount(env.DB, session.account_id);
  return signedInHtml(renderSignInPasskeys({
    rows: rows.map((row) => passkeyViewRow(row, nowMs)),
    enrollJsIncluded: true,
  }));
}

export async function handleServicesScout(req, env) {
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const { session, nowMs } = guard;
  const url = new URL(req.url);
  const rows = await listProvisionedKeysAudit(env.DB, { accountId: session.account_id, provider: GEMINI_PROVIDER });
  const active = rows.find((row) => row.revoked_at == null) || null;
  if (active) await refreshGcpLastUse(env, active, nowMs);
  const recentAck = await findRecentGeminiRevealAck(env.DB, {
    accountId: session.account_id,
    since: nowMs - REVEAL_ACK_TTL_MS,
  });
  return signedInHtml(renderServicesScout({
    active,
    rows,
    hasRecentAck: recentAck != null,
    nowMs,
    flash: {
      rotated: url.searchParams.get('rotated') || '',
      reveal: url.searchParams.get('reveal') || '',
      ack: url.searchParams.get('ack') || '',
      forget: url.searchParams.get('forget') || '',
      disable: url.searchParams.get('disable') || '',
    },
  }));
}

export async function handleGeminiRotate(req, env, ctx, { allowBearer = true, responseMode = 'json' } = {}) {
  const nowMs = Date.now();
  const auth = await rotationAuth(req, env, { allowBearer, responseMode, nowMs });
  if (auth instanceof Response) return auth;

  const oldKey = await findActiveProvisionedKey(env.DB, { accountId: auth.accountId, provider: GEMINI_PROVIDER });
  if (!oldKey) return rotationError(responseMode, 'no_active_key', 400);

  const newDisplayName = computeRotationDisplayName(auth.accountId, nowMs);
  let newKeyResourceName = null;
  let newKeyString = null;
  let rotationCommitted = false;
  try {
    const operationName = await gcpCreateApiKey({
      env,
      displayName: newDisplayName,
      requestId: crypto.randomUUID(),
    });
    newKeyResourceName = await gcpPollOperation({ env, opName: operationName });
    newKeyString = await gcpFetchKeyString({ env, keyName: newKeyResourceName });
    const keyStringEncrypted = await encryptEmail(newKeyString, env);
    const newRow = {
      id: crypto.randomUUID(),
      displayName: newDisplayName,
      keyResourceName: newKeyResourceName,
      keyStringEncrypted,
      createdAt: nowMs,
      lastUsedAt: null,
      lastUsedFetchedAt: null,
    };
    const rotated = await rotateGeminiBatch(env.DB, {
      accountId: auth.accountId,
      oldKeyId: oldKey.id,
      newRow,
      nowMs,
    });
    if (!rotated.ok) {
      await cleanupOrphanKey(env, newKeyResourceName);
      if (rotated.reason === 'conflict') return rotationConflict(responseMode);
      throw new Error('gemini rotation batch failed');
    }
    rotationCommitted = true;

    ctx.waitUntil(new Promise((resolve) => {
      setTimeout(resolve, ROTATION_DELETE_GRACE_MS);
    }).then(() => gcpDeleteKey({ env, keyName: oldKey.key_resource_name })
      .catch(() => console.error('gemini_rotate_old_key_delete_failed', { key_resource_name: oldKey.key_resource_name }))));

    if (responseMode === 'redirect') return signedInRedirect('/services/scout?rotated=ok');
    return json({ ok: true, key_id: rotated.newRow.id, rotated_at: nowMs });
  } catch (error) {
    if (newKeyResourceName && !rotationCommitted) await cleanupOrphanKey(env, newKeyResourceName);
    return rotationError(responseMode, 'rotation_failed', 500);
  }
}

export async function handleServicesScoutRotate(req, env, ctx) {
  return handleGeminiRotate(req, env, ctx, { allowBearer: false, responseMode: 'redirect' });
}

export async function handleServicesScoutAck(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  await insertGeminiRevealAck(env.DB, { accountId: guard.session.account_id, ackedAt: guard.nowMs });
  return signedInRedirect('/services/scout?ack=ok');
}

export async function handleServicesScoutReveal(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const recentAck = await findRecentGeminiRevealAck(env.DB, {
    accountId: guard.session.account_id,
    since: guard.nowMs - REVEAL_ACK_TTL_MS,
  });
  if (!recentAck) return signedInRedirect('/services/scout?reveal=ack_required');

  const active = await findActiveProvisionedKey(env.DB, { accountId: guard.session.account_id, provider: GEMINI_PROVIDER });
  if (!active?.key_string_encrypted) return signedInRedirect('/services/scout?reveal=missing');
  const apiKey = await decryptEmail(active.key_string_encrypted, env);
  return signedInHtml(renderServicesScoutReveal({ apiKey }));
}

export async function handleServicesScoutForget(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const form = await safeForm(req);
  const keyId = form?.get('key_id')?.toString() || '';
  const deleted = keyId
    ? await deleteRevokedProvisionedKey(env.DB, { accountId: guard.session.account_id, keyId })
    : false;
  if (!deleted) return signedInHtml('<h1>could not forget key</h1><p>rotate before removing an active key.</p>', { status: 400 });
  return signedInRedirect('/services/scout?forget=ok');
}

export async function handleScoutDisable(req, env, ctx) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const active = await findActiveProvisionedKey(env.DB, {
    accountId: guard.session.account_id,
    provider: GEMINI_PROVIDER,
  });
  if (!active) return signedInRedirect('/services/scout?disable=none');
  const revoked = await revokeProvisionedKey(env.DB, {
    accountId: guard.session.account_id,
    keyId: active.id,
    nowMs: guard.nowMs,
  });
  if (!revoked) return signedInRedirect('/services/scout?disable=none');
  ctx.waitUntil(new Promise((resolve) => {
    setTimeout(resolve, ROTATION_DELETE_GRACE_MS);
  }).then(() => gcpDeleteKey({ env, keyName: active.key_resource_name })
    .catch(() => console.error('scout_disable_old_key_delete_failed', { key_resource_name: active.key_resource_name }))));
  return signedInRedirect('/services/scout?disable=ok');
}

export async function handleRevokeSession(req, env, idHash) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const { session, nowMs } = guard;
  if (!idHash || idHash === session.id_hash) return noStore(forbidden());
  await revokeSession(env.DB, { idHash, accountId: session.account_id, nowMs });
  return signedInRedirect('/sign-in/sessions');
}

export async function handleRevokeOtherSessions(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const { session, nowMs } = guard;
  await revokeOtherSessions(env.DB, {
    accountId: session.account_id,
    currentIdHash: session.id_hash,
    nowMs,
  });
  return signedInRedirect('/sign-in/sessions');
}

export async function handleRenamePasskey(req, env, credentialId) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  if (!credentialId) return noStore(forbidden());
  const form = await req.formData();
  const friendlyName = normalizeFriendlyName(form.get('friendly_name'));
  await renamePasskey(env.DB, {
    credentialId,
    accountId: guard.session.account_id,
    friendlyName,
  });
  return signedInRedirect('/sign-in/passkeys');
}

export async function handleRemovePasskey(req, env, credentialId) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  if (!credentialId) return noStore(forbidden());
  await removePasskey(env.DB, {
    credentialId,
    accountId: guard.session.account_id,
    nowMs: guard.nowMs,
  });
  return signedInRedirect('/sign-in/passkeys');
}

export async function requireSignedInSession(req, env) {
  const nowMs = Date.now();
  const session = await getValidSession(req, env, nowMs);
  if (!session) {
    return signedInRedirect('/', { 'Set-Cookie': clearSessionCookie() });
  }
  return { session, nowMs };
}

export function signedInHtml(body, init = {}) {
  return html(body, {
    ...init,
    headers: { ...NO_STORE, ...(init.headers || {}) },
  });
}

export function signedInRedirect(to, headers = {}) {
  return redirect(to, 303, { ...NO_STORE, ...headers });
}

export function noStore(response) {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

async function rotationAuth(req, env, { allowBearer, responseMode, nowMs }) {
  const authHeader = req.headers.get('Authorization') || '';
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i)?.[1] || '';
  if (allowBearer && bearer) {
    const row = await verifyOauthAccessToken(env, bearer, nowMs);
    if (row) {
      // Explicit OAuth Bearer grants win over ambient browser cookies.
      return { accountId: row.account_id, mode: 'bearer', scope: row.scope, familyId: row.family_id };
    }
  }

  // Browser-session rotation is same-origin guarded; CLI Bearer rotation is not.
  if (!originAllowed(req)) {
    return responseMode === 'redirect' ? noStore(forbidden()) : rotationError(responseMode, 'forbidden', 403);
  }
  const session = await getValidSession(req, env, nowMs);
  if (!session) return rotationError(responseMode, 'unauthorized', 401);
  return { accountId: session.account_id, mode: 'session' };
}

function rotationError(responseMode, error, status) {
  if (responseMode === 'redirect') {
    const value = error === 'rotation_conflict' ? 'conflict' : error;
    return signedInRedirect(`/services/scout?rotated=${encodeURIComponent(value)}`);
  }
  return json({ error }, { status });
}

function rotationConflict(responseMode) {
  return rotationError(responseMode, 'rotation_conflict', 409);
}

async function cleanupOrphanKey(env, keyResourceName) {
  await gcpDeleteKey({ env, keyName: keyResourceName })
    .catch(() => console.error('gcp_orphan_key', { key_resource_name: keyResourceName }));
}

async function refreshGcpLastUse(env, active, nowMs) {
  try {
    const key = await gcpFindKeyByDisplayName({ env, displayName: active.display_name });
    const lastUse = parseGcpLastUse(key);
    await updateProvisionedKeyGcpLastUse(env.DB, {
      id: active.id,
      accountId: active.account_id,
      lastUsedAt: lastUse,
      fetchedAt: nowMs,
    });
    active.last_used_fetched_at = nowMs;
    if (lastUse != null) active.last_used_at = lastUse;
    if (lastUse == null) {
      active.last_used_at = null;
      console.error('gcp_lastused_unavailable');
    }
  } catch {
    await updateProvisionedKeyGcpLastUse(env.DB, {
      id: active.id,
      accountId: active.account_id,
      lastUsedAt: null,
      fetchedAt: nowMs,
    }).catch(() => {});
    active.last_used_fetched_at = nowMs;
    active.last_used_at = null;
    console.error('gcp_lastused_unavailable');
  }
}

function parseGcpLastUse(key) {
  const raw = key?.last_use_time || key?.lastUseTime || null;
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

export function computeRotationDisplayName(accountId, nowMs = Date.now()) {
  const date = new Date(nowMs).toISOString().slice(0, 10).replace(/-/g, '');
  return `${computeDisplayName(accountId)}-r-${date}-${randomRotationSuffix()}`;
}

function randomRotationSuffix() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let value = '';
  for (const byte of bytes) value += ROTATION_SUFFIX_ALPHABET[byte % ROTATION_SUFFIX_ALPHABET.length];
  return value;
}

async function safeForm(req) {
  try {
    return await req.formData();
  } catch {
    return null;
  }
}

async function sessionViewRow(row, env) {
  let ipLabel = '—';
  if (row.last_ip_encrypted) {
    try {
      ipLabel = truncateIp(await decryptEmail(row.last_ip_encrypted, env));
    } catch {
      ipLabel = '—';
    }
  }
  return {
    ...row,
    deviceLabel: uaLabel(row.last_user_agent),
    ipLabel,
  };
}

function passkeyViewRow(row, nowMs) {
  const friendlyName = typeof row.friendly_name === 'string' && row.friendly_name.trim()
    ? row.friendly_name
    : null;
  const mappedLabel = friendlyName ? null : aaguidLabel(row.aaguid);
  return {
    credential_id: row.credential_id,
    name: friendlyName || mappedLabel || 'passkey',
    friendlyNameInput: row.friendly_name || '',
    addedText: `added ${formatDate(row.created_at)}`,
    lastUsedText: row.last_used_at == null
      ? 'never used'
      : `last used ${formatRelativeTime(row.last_used_at, nowMs)}`,
  };
}

export function uaLabel(ua) {
  const value = typeof ua === 'string' ? ua.trim() : '';
  if (!value) return 'unknown device';
  const browser = detectBrowser(value);
  if (!browser) return value.slice(0, 64);
  return `${browser} on ${detectOs(value)}`;
}

function detectBrowser(ua) {
  if (/\bEdg(?:A|iOS)?\//.test(ua)) return 'edge';
  if (/\b(?:Firefox|FxiOS)\//.test(ua)) return 'firefox';
  if (/\b(?:Chrome|Chromium|CriOS)\//.test(ua)) return 'chrome';
  if (/\bSafari\//.test(ua)) return 'safari';
  return null;
}

function detectOs(ua) {
  if (/(?:iPhone|iPad|iPod)/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Macintosh|Mac OS X/.test(ua)) return 'macos';
  if (/Windows/.test(ua)) return 'windows';
  if (/Linux/.test(ua)) return 'linux';
  return 'device';
}

export function aaguidLabel(aaguid) {
  const value = typeof aaguid === 'string' ? aaguid.trim().toLowerCase() : '';
  if (!value || value === ZERO_AAGUID) return null;
  const label = AAGUID_LABELS[value];
  if (label) return label;
  console.error('passkey_label_unmapped');
  return null;
}

export function truncateIp(ip) {
  const value = typeof ip === 'string' ? ip.trim() : '';
  if (!value || value === 'unknown') return '—';
  if (value.includes(':')) return truncateIpv6(value);
  const octets = value.split('.');
  if (octets.length !== 4) return '—';
  const parsed = octets.map((octet) => Number(octet));
  if (parsed.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return '—';
  return `${parsed[0]}.${parsed[1]}.${parsed[2]}.x`;
}

function truncateIpv6(value) {
  const groups = expandIpv6(value.toLowerCase());
  if (!groups) return '—';
  return `${groups.slice(0, 4).join(':')}::/64`;
}

function expandIpv6(value) {
  if (!/^[0-9a-f:]+$/.test(value)) return null;
  if ((value.match(/::/g) || []).length > 1) return null;
  const parts = value.split('::');
  const left = parts[0] ? parts[0].split(':') : [];
  const right = parts[1] ? parts[1].split(':') : [];
  if ([...left, ...right].some((group) => !group || group.length > 4)) return null;
  const missing = 8 - left.length - right.length;
  if (parts.length === 1 && missing !== 0) return null;
  if (parts.length === 2 && missing < 1) return null;
  return [...left, ...Array(Math.max(0, missing)).fill('0'), ...right];
}
