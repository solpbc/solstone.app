import { decryptEmail } from './crypto.js';
import {
  applyScoutPendingWithEvent,
  countAccountEmails,
  countActivePasskeys,
  countActiveSessions,
  getDashboardData,
  getScoutApplicationByAccount,
  listPasskeyCredentialsForAccount,
  listSessionsForAccount,
  removePasskey,
  renamePasskey,
  revokeOtherSessions,
  revokeSession,
  setScoutApplicationDataAcked,
} from './db.js';
import { MAX_USE_CASE_LEN } from './enable-constants.js';
import {
  formatDate,
  formatRelativeTime,
  renderError,
  renderServicesScout,
  renderSignInPasskeys,
  renderSignInSessions,
  renderSignInShell,
} from './html.js';
import { forbidden, html, json, originAllowed, redirect } from './index.js';
import { normalizeFriendlyName } from './passkey.js';
import { clearSessionCookie, getValidSession } from './session.js';

const NO_STORE = { 'Cache-Control': 'no-store' };
const ZERO_AAGUID = '00000000-0000-0000-0000-000000000000';
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
  const { session, nowMs } = guard;
  const menu = await loadMenuContext(env, session.account_id, nowMs);
  const sessionCount = await countActiveSessions(env.DB, session.account_id);
  const passkeyCount = await countActivePasskeys(env.DB, session.account_id);
  const emailCount = await countAccountEmails(env.DB, session.account_id);
  return signedInHtml(renderSignInShell({
    sessionCount,
    passkeyCount,
    emailCount,
    menu,
  }));
}

export async function handleSignInSessions(req, env) {
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const { session, nowMs } = guard;
  const menu = await loadMenuContext(env, session.account_id, nowMs);
  const rows = await listSessionsForAccount(env.DB, session.account_id);
  const viewRows = await Promise.all(rows.map((row) => sessionViewRow(row, env)));
  return signedInHtml(renderSignInSessions({
    rows: viewRows,
    currentIdHash: session.id_hash,
    now: nowMs,
    menu,
  }));
}

export async function handleSignInPasskeys(req, env) {
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const { session, nowMs } = guard;
  const menu = await loadMenuContext(env, session.account_id, nowMs);
  const rows = await listPasskeyCredentialsForAccount(env.DB, session.account_id);
  return signedInHtml(renderSignInPasskeys({
    rows: rows.map((row) => passkeyViewRow(row, nowMs)),
    enrollJsIncluded: true,
    menu,
  }));
}

export async function handleServicesScout(req, env) {
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const { session, nowMs } = guard;
  const menu = await loadMenuContext(env, session.account_id, nowMs);
  const url = new URL(req.url);
  const application = await getScoutApplicationByAccount(env.DB, { accountId: session.account_id });
  return signedInHtml(renderServicesScout({
    application,
    nowMs,
    flash: {
      apply: url.searchParams.get('apply') || '',
    },
    menu,
  }));
}

export async function handleServicesScoutApply(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;

  const form = await safeForm(req);
  if (form?.get('data_ack')?.toString() !== 'yes') return signedInRedirect('/scout?apply=no_ack');

  const rawUseCase = form?.get('use_case')?.toString() || '';
  const trimmedUseCase = rawUseCase.trim();
  const useCase = trimmedUseCase ? trimmedUseCase.slice(0, MAX_USE_CASE_LEN) : null;
  const accountId = guard.session.account_id;
  const app = await getScoutApplicationByAccount(env.DB, { accountId });
  if (!app || app.status === 'pending') {
    try {
      await applyScoutPendingWithEvent(env.DB, { accountId, useCase, dataAckedAt: guard.nowMs, nowMs: guard.nowMs });
    } catch {
      return signedInHtml(renderError(), { status: 500 });
    }
    return signedInRedirect('/scout?apply=ok');
  }
  if (app.status === 'approved') {
    await setScoutApplicationDataAcked(env.DB, { accountId, nowMs: guard.nowMs });
    return signedInRedirect('/scout?apply=acked');
  }
  return signedInRedirect('/scout');
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

export async function loadMenuContext(env, accountId, nowMs) {
  const data = await getDashboardData(env.DB, accountId);
  let email = null;
  let decryptOk = false;
  if (data?.addressEncrypted) {
    try {
      email = await decryptEmail(data.addressEncrypted, env);
      decryptOk = true;
    } catch {
      console.error('menu_decrypt_failed');
    }
  }
  return { email, lastSignInAt: data?.lastSigninAt ?? null, now: nowMs, decryptOk };
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
