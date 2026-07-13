import { getScoutApplicationStatusByAccount, upsertEntitlement } from './db.js';

export const SPP_HOSTED_SERVICE = 'spp_hosted';
export const SPP_CONSENT_DISCLOSURE_VERSION = 'spp-consent-v2-audio';

export function isSppEntitledToServe(row, nowSeconds, env) {
  // nowSeconds/env unused: parity with isSpbEntitledToServe for future serving callers.
  return row?.status === 'active';
}

export async function reconcileSppEntitlement(env, accountId, nowMs, ctx) {
  // ctx unused: caller symmetry with the other reconcilers; SPP is comp-only, no billing/retention.
  const application = await getScoutApplicationStatusByAccount(env.DB, { accountId });
  const status = application?.status === 'approved' ? 'active' : 'lapsed';
  await upsertEntitlement(env.DB, {
    accountId,
    service: SPP_HOSTED_SERVICE,
    status,
    currentPeriodEnd: null,
    source: 'comp',
    sourceRef: null,
    nowMs,
  });
}
