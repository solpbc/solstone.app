import {
  clearSpbBindingLapsed,
  getActiveDeletionForAccount,
  getEntitlement,
  getScoutApplicationStatusByAccount,
  markSpbBindingLapsed,
  upsertEntitlement,
} from './db.js';
import { paidSignalFromRow, reconcileSplEntitlement } from './relay-grant.js';
import { reconcileSppEntitlement } from './spp-entitlement.js';

export const SPB_HOSTED_SERVICE = 'spb_hosted';

export function isSpbEntitledToServe(row, nowSeconds, env) {
  const grace = Number(env.RELAY_GRACE_DAYS || 14) * 86400;
  if (!row) return false;
  if (row.status === 'active') return true;
  if (row.status === 'past_due') return nowSeconds <= (row.current_period_end ?? 0) + grace;
  return false;
}

export async function reconcileSpbEntitlement(env, accountId, nowMs, ctx, opts = {}) {
  // ctx is intentionally unused: SPB keeps caller symmetry but has no relay/background work.
  if (await getActiveDeletionForAccount(env.DB, accountId)) return;
  const row = await getEntitlement(env.DB, { accountId, service: SPB_HOSTED_SERVICE });
  const paid = opts.paid !== undefined ? opts.paid : paidSignalFromRow(row);

  if (paid) {
    await upsertEntitlement(env.DB, {
      accountId,
      service: SPB_HOSTED_SERVICE,
      status: paid.status,
      currentPeriodEnd: paid.currentPeriodEnd ?? null,
      source: paid.source,
      sourceRef: paid.sourceRef ?? null,
      nowMs,
    });
    await clearSpbBindingLapsed(env.DB, { accountId });
  } else {
    const application = await getScoutApplicationStatusByAccount(env.DB, { accountId });
    if (application?.status === 'approved') {
      await upsertEntitlement(env.DB, {
        accountId,
        service: SPB_HOSTED_SERVICE,
        status: 'active',
        currentPeriodEnd: null,
        source: 'comp',
        sourceRef: null,
        nowMs,
      });
      await clearSpbBindingLapsed(env.DB, { accountId });
    } else {
      await upsertEntitlement(env.DB, {
        accountId,
        service: SPB_HOSTED_SERVICE,
        status: 'lapsed',
        currentPeriodEnd: null,
        source: row?.source ?? 'comp',
        sourceRef: null,
        nowMs,
      });
      await markSpbBindingLapsed(env.DB, { accountId, nowMs });
    }
  }
}

export async function reconcileAllServices(env, accountId, nowMs, ctx) {
  await reconcileSplEntitlement(env, accountId, nowMs, ctx);
  await reconcileSpbEntitlement(env, accountId, nowMs, ctx);
  await reconcileSppEntitlement(env, accountId, nowMs, ctx);
}
