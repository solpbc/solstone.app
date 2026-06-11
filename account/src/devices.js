import {
  getDeviceById,
  listDevicesForAccount,
  revokeAllDevicesForAccount,
  revokeDevice,
  revokeDeviceById,
} from './db.js';
import { mintDispatchToken, resolveDispatchToken } from './dispatch-tokens.js';
import { registerDeviceForAccount } from './enable.js';
import { renderServicesDevices } from './html.js';
import { forbidden, json, originAllowed } from './index.js';
import { normalizeFriendlyName } from './passkey.js';
import { loadMenuContext, noStore, requireSignedInSession, signedInHtml, signedInRedirect } from './settings.js';

const PLATFORMS = ['ios', 'macos', 'android'];
const PUSH_TOKEN_ENVS = ['production', 'sandbox'];
export { mintDispatchToken, resolveDispatchToken };

export async function deviceRevoke(env, deviceId) {
  if (!deviceId) return;
  await revokeDeviceById(env.DB, { deviceId, nowMs: Date.now() });
}

export async function handleRegisterDevice(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
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
  const registered = await registerDeviceForAccount({
    env,
    accountId: session.account_id,
    deviceToken: pushToken,
    platform,
    bundleId,
    pushTokenEnv,
    deviceLabel,
    appVersion,
    nowMs,
  });
  return json({ ok: true, device_id: registered.deviceId });
}

export async function handleDeregisterDevice(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
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
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const devices = await listDevicesForAccount(env.DB, guard.session.account_id);
  return json({ devices });
}

export async function handleMintDispatchToken(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const minted = await mintDispatchToken(env, guard.session.account_id);
  return json({
    token: minted.token,
    account_id: minted.accountId,
    created_at: minted.createdAt,
  });
}

export async function handleServicesDevices(req, env) {
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const menu = await loadMenuContext(env, guard.session.account_id, guard.nowMs);
  const url = new URL(req.url);
  const devices = await listDevicesForAccount(env.DB, guard.session.account_id);
  return signedInHtml(renderServicesDevices({
    devices,
    nowMs: guard.nowMs,
    disableFlash: url.searchParams.get('disable') || '',
    menu,
  }));
}

export async function handleRevokeDevice(req, env, deviceId) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  const row = deviceId ? await getDeviceById(env.DB, deviceId) : null;
  if (!row || row.account_id !== guard.session.account_id) return noStore(forbidden());
  await revokeDevice(env.DB, {
    deviceId,
    accountId: guard.session.account_id,
    nowMs: guard.nowMs,
  });
  return signedInRedirect('/devices');
}

export async function handleRevokeAllDevices(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  await revokeAllDevicesForAccount(env.DB, {
    accountId: guard.session.account_id,
    nowMs: guard.nowMs,
  });
  return signedInRedirect('/devices');
}

export async function handlePushDisable(req, env) {
  if (!originAllowed(req)) return noStore(forbidden());
  const guard = await requireSignedInSession(req, env);
  if (guard instanceof Response) return guard;
  await revokeAllDevicesForAccount(env.DB, {
    accountId: guard.session.account_id,
    nowMs: guard.nowMs,
  });
  return signedInRedirect('/devices?disable=ok');
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
