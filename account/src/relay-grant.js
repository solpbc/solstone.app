import { getEntitlement, listSplBindings } from './db.js';

export const SPL_HOSTED_SERVICE = 'spl_hosted';

export function entitledUntilFor(entitlementRow, nowSeconds, env) {
  const grace = Number(env.RELAY_GRACE_DAYS || 14) * 86400;
  if (!entitlementRow) return 0;
  if (entitlementRow.status === 'active') {
    return entitlementRow.current_period_end || nowSeconds + grace;
  }
  if (entitlementRow.status === 'past_due') return nowSeconds + grace;
  if (entitlementRow.status === 'canceled' || entitlementRow.status === 'lapsed') return 0;
  return 0;
}

export async function pushEntitlementGrant(env, { instanceId, entitledUntil }) {
  let status = 'error';
  try {
    const response = await fetch(`${env.RELAY_GRANT_URL}/admin/entitlement`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RELAY_GRANT_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ instance_id: instanceId, entitled_until: entitledUntil }),
    });
    status = response.status;
    if (response.status !== 200) {
      console.error('relay_grant_push_failed', status);
      return false;
    }
    const body = await response.json();
    if (body?.ok === true) return true;
    console.error('relay_grant_push_failed', status);
    return false;
  } catch {
    console.error('relay_grant_push_failed', status);
    return false;
  }
}

export async function syncAccountEntitlementToRelay(env, accountId) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const entitlement = await getEntitlement(env.DB, { accountId, service: SPL_HOSTED_SERVICE });
  const bindings = await listSplBindings(env.DB, accountId);
  if (!bindings.length) return;
  const entitledUntil = entitledUntilFor(entitlement, nowSeconds, env);
  for (const binding of bindings) {
    await pushEntitlementGrant(env, { instanceId: binding.instance_id, entitledUntil });
  }
}
