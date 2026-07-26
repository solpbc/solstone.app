import { generateSessionToken, hashWithPepper } from './crypto.js';
import {
  getEntitlement,
  upsertSpbBinding,
  upsertSplBinding,
  upsertSppBinding,
} from './db.js';
import { mintDispatchToken } from './dispatch-tokens.js';
import { reconcileSplEntitlement, SPL_HOSTED_SERVICE } from './relay-grant.js';
import { reconcileSpbEntitlement, SPB_HOSTED_SERVICE } from './spb-entitlement.js';
import { reconcileSppEntitlement } from './spp-entitlement.js';

export async function issueScoutCapability({ env, accountId, googleApiKey }) {
  const dispatch = await mintDispatchToken(env, accountId);
  return {
    outcome: 'issued',
    capability: {
      google_api_key: googleApiKey,
      dispatch_token: dispatch.token,
      account_id: accountId,
      created_at: dispatch.createdAt,
    },
  };
}

export async function issueSplCapability({ env, accountId, instanceId, nowMs, ctx }) {
  if (instanceId) {
    const binding = await upsertSplBinding(env.DB, {
      accountId,
      instanceId,
      nowMs,
    });
    if (!binding) return { outcome: 'ownership_conflict' };
  }

  await reconcileSplEntitlement(env, accountId, nowMs, ctx);
  const entitlement = await getEntitlement(env.DB, {
    accountId,
    service: SPL_HOSTED_SERVICE,
  });
  if (!isOwnerEntitled(entitlement)) return { outcome: 'not_entitled' };
  return {
    outcome: 'issued',
    capability: {
      service: 'spl',
      state: 'approved',
      approved_at: new Date(nowMs).toISOString(),
    },
  };
}

export async function issueSpbCapability({
  env,
  accountId,
  instanceId,
  nowMs,
  brokerEndpoint,
  ctx,
}) {
  const brokerToken = generateSessionToken();
  const tokenHash = await hashWithPepper(brokerToken, env);
  const binding = await upsertSpbBinding(env.DB, {
    accountId,
    instanceId,
    tokenHash,
    nowMs,
  });
  if (!binding) return { outcome: 'ownership_conflict' };

  await reconcileSpbEntitlement(env, accountId, nowMs, ctx);
  const entitlement = await getEntitlement(env.DB, {
    accountId,
    service: SPB_HOSTED_SERVICE,
  });
  const capability = {
    broker_endpoint: brokerEndpoint,
    account_id: accountId,
    instance_id: instanceId,
    bucket: env.R2_BUCKET,
    prefix: `users/${accountId}/${instanceId}/`,
    broker_token: brokerToken,
  };
  return {
    outcome: isOwnerEntitled(entitlement) ? 'issued' : 'not_entitled',
    capability,
  };
}

export async function issueSppCapability({
  env,
  accountId,
  instanceId,
  nowMs,
  ctx,
  consentAckedAt,
  consentDisclosureVersion,
}) {
  const credential = generateSessionToken();
  const tokenHash = await hashWithPepper(credential, env);
  const binding = await upsertSppBinding(env.DB, {
    accountId,
    instanceId,
    tokenHash,
    nowMs,
    consentAckedAt,
    consentDisclosureVersion,
  });
  if (!binding) return { outcome: 'ownership_conflict' };

  await reconcileSppEntitlement(env, accountId, nowMs, ctx);
  return {
    outcome: 'issued',
    capability: {
      endpoint_url: env.SPP_ENGINE_ENDPOINT,
      served_model_id: env.SPP_ENGINE_MODEL,
      credential,
      account_id: accountId,
      created_at: new Date(nowMs).toISOString(),
    },
  };
}

function isOwnerEntitled(entitlement) {
  return entitlement?.status === 'active' || entitlement?.status === 'past_due';
}
