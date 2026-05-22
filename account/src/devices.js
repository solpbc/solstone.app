import { generateSessionToken, hashWithPepper } from './crypto.js';
import {
  bumpDeviceLastSeen,
  findActiveDispatchToken,
  findDeviceByPushKey,
  getDeviceById,
  insertDevice,
  insertDispatchToken,
  listDevicesForAccount,
  revokeAllDevicesForAccount,
  revokeDevice,
  revokeDeviceById,
  revokeDevicePriorAndInsertNew,
} from './db.js';
import { renderSettingsDevices } from './html.js';
import { forbidden, json, originAllowed } from './index.js';
import { normalizeFriendlyName } from './passkey.js';
import { noStore, requireSettingsSession, settingsHtml, settingsRedirect } from './settings.js';

const PLATFORMS = ['ios', 'macos', 'android'];
const PUSH_TOKEN_ENVS = ['production', 'sandbox'];

export async function mintDispatchToken(env, accountId) {
  const token = generateSessionToken();
  const tokenHash = await hashWithPepper(token, env, 'DISPATCH_TOKEN_PEPPER');
  const createdAt = Date.now();
  // No cap column: capability narrowness is enforced by resolveDispatchToken call sites.
  await insertDispatchToken(env.DB, { tokenHash, accountId, nowMs: createdAt });
  return { token, accountId, createdAt };
}

// Capability narrowness is enforced structurally: this verifier is invoked
// only from the future L4 dispatch path. No `cap` column on the table.
export async function resolveDispatchToken(env, plaintext) {
  if (typeof plaintext !== 'string' || !plaintext) return null;
  const tokenHash = await hashWithPepper(plaintext, env, 'DISPATCH_TOKEN_PEPPER');
  const row = await findActiveDispatchToken(env.DB, tokenHash);
  return row ? { accountId: row.account_id } : null;
}

export async function deviceRevoke(env, deviceId) {
  if (!deviceId) return;
  await revokeDeviceById(env.DB, { deviceId, nowMs: Date.now() });
}

export async function handleRegisterDevice(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSettingsSession(req, env);
  if (guard instanceof Response) return guard;
  const { session, nowMs } = guard;

  const body = await readJsonObject(req);
  if (body instanceof Response) return body;

  const platform = typeof body.platform === 'string' ? body.platform : null;
  const pushToken = typeof body.push_token === 'string' ? body.push_token : null;
  const pushTokenEnv = typeof body.push_token_env === 'string' ? body.push_token_env : null;
  const bundleId = typeof body.bundle_id === 'string' ? body.bundle_id : null;
  if (!platform || !pushToken || !pushTokenEnv || !bundleId) {
    return json({ error: 'missing_field' }, { status: 400 });
  }
  if (!PLATFORMS.includes(platform)) {
    return json({ error: 'invalid_platform' }, { status: 400 });
  }
  if (!PUSH_TOKEN_ENVS.includes(pushTokenEnv)) {
    return json({ error: 'invalid_input' }, { status: 400 });
  }

  const deviceLabel = normalizeFriendlyName(body.device_label);
  const appVersion = normalizeFriendlyName(body.app_version);
  const existing = await findDeviceByPushKey(env.DB, { pushToken, bundleId, pushTokenEnv });
  if (existing && existing.account_id === session.account_id) {
    try {
      await bumpDeviceLastSeen(env.DB, { deviceId: existing.device_id, nowMs });
    } catch {
      console.error('device_last_seen_bump_failed');
    }
    return json({ ok: true, device_id: existing.device_id });
  }

  const newDevice = {
    deviceId: crypto.randomUUID(),
    accountId: session.account_id,
    platform,
    pushToken,
    pushTokenEnv,
    bundleId,
    deviceLabel,
    appVersion,
    nowMs,
  };

  if (existing) {
    await revokeDevicePriorAndInsertNew(env.DB, {
      priorDeviceId: existing.device_id,
      newDevice,
      nowMs,
    });
  } else {
    await insertDevice(env.DB, newDevice);
  }
  return json({ ok: true, device_id: newDevice.deviceId });
}

export async function handleDeregisterDevice(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSettingsSession(req, env);
  if (guard instanceof Response) return guard;

  const body = await readJsonObject(req);
  if (body instanceof Response) return body;
  const deviceId = typeof body.device_id === 'string' ? body.device_id : '';
  const row = deviceId ? await getDeviceById(env.DB, deviceId) : null;
  if (!row || row.account_id !== guard.session.account_id) {
    return json({ error: 'forbidden' }, { status: 403 });
  }

  await revokeDevice(env.DB, {
    deviceId,
    accountId: guard.session.account_id,
    nowMs: guard.nowMs,
  });
  return json({ ok: true });
}

export async function handleListDevices(req, env) {
  const guard = await requireSettingsSession(req, env);
  if (guard instanceof Response) return guard;
  const devices = await listDevicesForAccount(env.DB, guard.session.account_id);
  return json({ devices });
}

export async function handleMintDispatchToken(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSettingsSession(req, env);
  if (guard instanceof Response) return guard;
  const minted = await mintDispatchToken(env, guard.session.account_id);
  return json({
    token: minted.token,
    account_id: minted.accountId,
    created_at: minted.createdAt,
  });
}

export async function handleSettingsDevices(req, env) {
  const guard = await requireSettingsSession(req, env);
  if (guard instanceof Response) return guard;
  const devices = await listDevicesForAccount(env.DB, guard.session.account_id);
  return settingsHtml(renderSettingsDevices({ devices, nowMs: guard.nowMs }));
}

export async function handleRevokeDevice(req, env, deviceId) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSettingsSession(req, env);
  if (guard instanceof Response) return guard;
  const row = deviceId ? await getDeviceById(env.DB, deviceId) : null;
  if (!row || row.account_id !== guard.session.account_id) return noStore(forbidden());
  await revokeDevice(env.DB, {
    deviceId,
    accountId: guard.session.account_id,
    nowMs: guard.nowMs,
  });
  return settingsRedirect('/settings/devices');
}

export async function handleRevokeAllDevices(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSettingsSession(req, env);
  if (guard instanceof Response) return guard;
  await revokeAllDevicesForAccount(env.DB, {
    accountId: guard.session.account_id,
    nowMs: guard.nowMs,
  });
  return settingsRedirect('/settings/devices');
}

async function readJsonObject(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_input' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'invalid_input' }, { status: 400 });
  }
  return body;
}
