import {
  getActiveDeletionForAccount,
  getEntitlement,
  getScoutApplicationStatusByAccount,
  upsertEntitlement,
} from './db.js';
import { paidSignalFromRow } from './relay-grant.js';

export const SME_HOSTED_SERVICE = 'sme_hosted';
// Identifies the disclosure an owner acknowledged. Change the card text only together with a
// new version; the bump only records which text was acknowledged, and asks no existing owner
// to consent again.
// v2: turn-on-screens-one-pattern card text + calmed SME_PERMANENCE_PARTS
// (the one-pattern turn-on screens adopted 2026-09-21 with operator approval).
export const SME_CONSENT_DISCLOSURE_VERSION = 'sme-consent-v2-pattern';

// A paid service keeps working through a failed payment for the same 14-day grace
// spb uses (RELAY_GRACE_DAYS), counted from the end of the paid period. This is the
// only place the connector's lapse timing lives: when the window changes, it changes here.
export function isSmeEntitledToServe(row, nowSeconds, env) {
  const grace = Number(env.RELAY_GRACE_DAYS || 14) * 86400;
  if (!row) return false;
  if (row.status === 'active') return true;
  if (row.status === 'past_due') return nowSeconds <= (row.current_period_end ?? 0) + grace;
  return false;
}

// ctx is unused: caller symmetry with the other reconcilers. The connector has no
// relay push and no lapse teardown; entitlement is read at mint time.
export async function reconcileSmeEntitlement(env, accountId, nowMs, ctx, opts = {}) {
  if (await getActiveDeletionForAccount(env.DB, accountId)) return;
  const row = await getEntitlement(env.DB, { accountId, service: SME_HOSTED_SERVICE });
  const paid = opts.paid !== undefined ? opts.paid : paidSignalFromRow(row);

  if (paid) {
    await upsertEntitlement(env.DB, {
      accountId,
      service: SME_HOSTED_SERVICE,
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
      service: SME_HOSTED_SERVICE,
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
    service: SME_HOSTED_SERVICE,
    status: 'lapsed',
    currentPeriodEnd: null,
    source: row?.source ?? 'comp',
    sourceRef: null,
    cancelAtPeriodEnd: false,
    nowMs,
  });
}
