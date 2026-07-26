import {
  getEntitlement,
  getScoutApplicationStatusByAccount,
  listSplBindings,
  upsertEntitlement,
} from './db.js';

export const SPL_HOSTED_SERVICE = 'spl_hosted';
export const COMP_ENTITLED_THROUGH = 4102444800;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RETIREMENT_CHECK_KEYS = [
  'entry_denial_verified',
  'sockets_closed',
  'devices_revoked',
  'entitlement_cleared',
  'pending_grants_cleared',
  'tombstone_verified',
];
const RETIREMENT_SUCCESS_KEYS = ['state', ...RETIREMENT_CHECK_KEYS];
const RETIREMENT_RESIDUAL_KEYS = [...RETIREMENT_CHECK_KEYS, 'failed_component'];
const RETIREMENT_STATES = new Set(['retired', 'already_retired', 'absent']);
const RETIREMENT_COMPONENTS = new Set([
  'retired_state',
  'instance_do_cleanup',
  'rk_do_cleanup',
  'device_revocation',
  'entitlement_clear',
  'pending_grant_clear',
  'rk_registry_clear',
  'verification',
]);

export function entitledUntilFor(entitlementRow, nowSeconds, env) {
  const grace = Number(env.RELAY_GRACE_DAYS || 14) * 86400;
  if (!entitlementRow) return 0;
  if (entitlementRow.status === 'active') {
    if (entitlementRow.source === 'comp') return COMP_ENTITLED_THROUGH;
    return entitlementRow.current_period_end || nowSeconds + grace;
  }
  if (entitlementRow.status === 'past_due') return nowSeconds + grace;
  if (entitlementRow.status === 'canceled' || entitlementRow.status === 'lapsed') return 0;
  return 0;
}

export function paidSignalFromRow(row) {
  if (row && row.source !== 'comp' && (row.status === 'active' || row.status === 'past_due')) {
    return {
      status: row.status,
      currentPeriodEnd: row.current_period_end,
      source: row.source,
      sourceRef: row.source_ref,
    };
  }
  return null;
}

export async function reconcileSplEntitlement(env, accountId, nowMs, ctx, opts = {}) {
  const row = await getEntitlement(env.DB, { accountId, service: SPL_HOSTED_SERVICE });
  const paid = opts.paid !== undefined ? opts.paid : paidSignalFromRow(row);

  if (paid) {
    await upsertEntitlement(env.DB, {
      accountId,
      service: SPL_HOSTED_SERVICE,
      status: paid.status,
      currentPeriodEnd: paid.currentPeriodEnd ?? null,
      source: paid.source,
      sourceRef: paid.sourceRef ?? null,
      nowMs,
    });
  } else {
    const application = await getScoutApplicationStatusByAccount(env.DB, { accountId });
    if (application?.status === 'approved') {
      await upsertEntitlement(env.DB, {
        accountId,
        service: SPL_HOSTED_SERVICE,
        status: 'active',
        currentPeriodEnd: null,
        source: 'comp',
        sourceRef: null,
        nowMs,
      });
    } else {
      await upsertEntitlement(env.DB, {
        accountId,
        service: SPL_HOSTED_SERVICE,
        status: 'lapsed',
        currentPeriodEnd: null,
        source: row?.source ?? 'comp',
        sourceRef: null,
        nowMs,
      });
    }
  }

  const sync = syncAccountEntitlementToRelay(env, accountId);
  if (typeof ctx?.waitUntil === 'function') {
    ctx.waitUntil(sync);
  } else {
    await sync;
  }
}

export async function pushEntitlementGrant(env, { instanceId, entitledUntil }) {
  let status = 'error';
  try {
    const target = `${env.RELAY_GRANT_URL}/admin/entitlement`;
    const init = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RELAY_GRANT_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ instance_id: instanceId, entitled_until: entitledUntil }),
    };
    // Prefer the worker-to-worker service binding (env.RELAY) so the entitlement
    // grant push travels in-process instead of over the public internet. The
    // relay still validates the same Bearer GRANT_SECRET, so its bearer-gated
    // /admin/entitlement endpoint stays unchanged for self-hosters and the
    // operator CLI. Fall back to a public fetch when the binding is absent
    // (local dev / tests / any deploy without RELAY bound).
    const response = env.RELAY ? await env.RELAY.fetch(target, init) : await fetch(target, init);
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

export async function retireRelayInstance(env, { instanceId }) {
  if (typeof instanceId !== 'string' || !UUID_RE.test(instanceId)) {
    throw new TypeError('invalid relay instance identifier');
  }

  let status = 'error';
  try {
    if (typeof env.RELAY_GRANT_SECRET !== 'string' || !env.RELAY_GRANT_SECRET) {
      return relayRetirementFailed(status);
    }
    const configured = new URL(env.RELAY_GRANT_URL);
    if (configured.protocol !== 'https:') return relayRetirementFailed(status);
    const target = new URL(`/admin/instances/${encodeURIComponent(instanceId)}`, configured.origin).href;
    const init = {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${env.RELAY_GRANT_SECRET}`,
      },
      redirect: 'manual',
    };
    const response = env.RELAY ? await env.RELAY.fetch(target, init) : await fetch(target, init);
    status = response.status;

    if (response.status === 200) {
      const body = await response.json();
      if (!hasExactKeys(body, RETIREMENT_SUCCESS_KEYS)) return relayRetirementFailed(status);
      if (!RETIREMENT_STATES.has(body.state)) return relayRetirementFailed(status);
      if (!RETIREMENT_CHECK_KEYS.every((key) => body[key] === true)) {
        return relayRetirementFailed(status);
      }
      return {
        outcome: 'retired',
        relayState: body.state,
        checks: retirementChecks(body),
      };
    }

    if (response.status === 503) {
      const body = await response.json();
      if (
        hasExactKeys(body, RETIREMENT_RESIDUAL_KEYS)
        && RETIREMENT_CHECK_KEYS.every((key) => typeof body[key] === 'boolean')
        && RETIREMENT_COMPONENTS.has(body.failed_component)
      ) {
        console.error('relay_instance_retire_failed', status);
        return {
          outcome: 'retryable_residual',
          failedComponent: body.failed_component,
          checks: retirementChecks(body),
        };
      }
    }

    return relayRetirementFailed(status);
  } catch {
    return relayRetirementFailed(status);
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

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function retirementChecks(body) {
  return Object.fromEntries(RETIREMENT_CHECK_KEYS.map((key) => [key, body[key]]));
}

function relayRetirementFailed(status) {
  console.error('relay_instance_retire_failed', status);
  return { outcome: 'failed' };
}
