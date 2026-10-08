import {
  getActiveDeletionForAccount,
  getEntitlement,
  getScoutApplicationStatusByAccount,
  upsertEntitlement,
} from './db.js';
import { paidSignalFromRow } from './relay-grant.js';

export const SPP_HOSTED_SERVICE = 'spp_hosted';
// v3: turn-on-screens-one-pattern card text (adopted 2026-09-21 with operator approval).
export const SPP_CONSENT_DISCLOSURE_VERSION = 'spp-consent-v3-pattern';

// A paid subscription keeps working through a failed payment for the same 14-day grace
// encrypted backup and solstone.me use (RELAY_GRACE_DAYS), counted from the end of the paid
// period. The engine's authorize, the access check and the turn-on all decide by this.
export function isSppEntitledToServe(row, nowSeconds, env) {
  const grace = Number(env?.RELAY_GRACE_DAYS || 14) * 86400;
  if (!row) return false;
  if (row.status === 'active') return true;
  if (row.status === 'past_due') return nowSeconds <= (row.current_period_end ?? 0) + grace;
  return false;
}

// Paid first: a paying owner's subscription decides, and a scout approval or revocation never
// lapses or overwrites it. Without one, an approved scout is complimentary; otherwise lapsed.
// ctx is unused: caller symmetry with the other reconcilers.
export async function reconcileSppEntitlement(env, accountId, nowMs, ctx, opts = {}) {
  if (await getActiveDeletionForAccount(env.DB, accountId)) return;
  const row = await getEntitlement(env.DB, { accountId, service: SPP_HOSTED_SERVICE });
  const paid = opts.paid !== undefined ? opts.paid : paidSignalFromRow(row);

  if (paid) {
    await upsertEntitlement(env.DB, {
      accountId,
      service: SPP_HOSTED_SERVICE,
      status: paid.status,
      currentPeriodEnd: paid.currentPeriodEnd ?? null,
      source: paid.source,
      sourceRef: paid.sourceRef ?? null,
      cancelAtPeriodEnd: paid.cancelAtPeriodEnd ?? null,
      nowMs,
    });
    return;
  }
  const application = await getScoutApplicationStatusByAccount(env.DB, { accountId });
  if (application?.status === 'approved') {
    await upsertEntitlement(env.DB, {
      accountId,
      service: SPP_HOSTED_SERVICE,
      status: 'active',
      currentPeriodEnd: null,
      source: 'comp',
      sourceRef: null,
      cancelAtPeriodEnd: false,
      nowMs,
    });
    return;
  }
  await upsertEntitlement(env.DB, {
    accountId,
    service: SPP_HOSTED_SERVICE,
    status: 'lapsed',
    currentPeriodEnd: null,
    source: row?.source ?? 'comp',
    sourceRef: null,
    cancelAtPeriodEnd: false,
    nowMs,
  });
}
