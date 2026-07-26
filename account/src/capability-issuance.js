import { generateSessionToken, hashWithPepper } from './crypto.js';
import {
  findSandboxRunProvisioningOwnership,
  getEntitlement,
  insertDispatchTokenForSandboxRun,
  upsertSpbBinding,
  upsertSpbBindingForSandboxRun,
  upsertSplBinding,
  upsertSplBindingForSandboxRun,
  upsertSppBinding,
  upsertSppBindingForSandboxRun,
} from './db.js';
import { mintDispatchToken } from './dispatch-tokens.js';
import {
  entitledUntilFor,
  pushEntitlementGrant,
  reconcileSplEntitlement,
  SPL_HOSTED_SERVICE,
} from './relay-grant.js';
import { reconcileSpbEntitlement, SPB_HOSTED_SERVICE } from './spb-entitlement.js';
import { reconcileSppEntitlement, SPP_HOSTED_SERVICE } from './spp-entitlement.js';
import { requireCanonicalUuids } from './sandbox-identifiers.js';
import {
  orderedObject,
  SANDBOX_CAPABILITY_KEYS,
  SANDBOX_SPL_CAPABILITY_SERVICE,
  SANDBOX_SPL_CAPABILITY_STATE,
} from './sandbox-run-contract.js';

export async function issueScoutCapability({ env, accountId, googleApiKey, ownership, nowMs }) {
  const issued = await writeDispatchIssuance({ env, accountId, ownership, nowMs });
  if (issued.outcome !== 'issued') return issued;
  const { dispatch } = issued;
  return {
    outcome: 'issued',
    dispatch,
    capability: orderedObject(SANDBOX_CAPABILITY_KEYS.scout, [
      googleApiKey,
      dispatch.token,
      accountId,
      dispatch.createdAt,
    ]),
  };
}

export async function issueSplCapability({
  env,
  accountId,
  instanceId,
  ownership,
  nowMs,
  ctx,
  leaseExpiresAt,
}) {
  const sandbox = sandboxOwnership(ownership);
  if (instanceId) {
    const claimed = await writeSplBindingIssuance({ env, accountId, instanceId, ownership, nowMs });
    if (claimed.outcome !== 'issued') return claimed;
  }

  await reconcileSplEntitlement(env, accountId, nowMs, ctx, { syncRelay: !sandbox });
  const entitlement = await getEntitlement(env.DB, {
    accountId,
    service: SPL_HOSTED_SERVICE,
  });
  if (!isOwnerEntitled(entitlement)) return { outcome: 'not_entitled' };
  if (sandbox) {
    const current = await currentSandboxOwnership(env, accountId, sandbox);
    if (
      !current
      || !Number.isSafeInteger(leaseExpiresAt)
      || current.lease_expires_at !== leaseExpiresAt
    ) {
      return { outcome: 'run_fence_lost' };
    }
    const base = entitledUntilFor(entitlement, Math.floor(nowMs / 1000), env);
    const entitledUntil = Math.min(base, Math.floor(leaseExpiresAt / 1000));
    if (entitledUntil <= 0) return { outcome: 'not_entitled' };
    if (!await pushEntitlementGrant(env, { instanceId, entitledUntil })) {
      return { outcome: 'grant_failed' };
    }
  }
  return {
    outcome: 'issued',
    capability: orderedObject(SANDBOX_CAPABILITY_KEYS.spl, [
      SANDBOX_SPL_CAPABILITY_SERVICE,
      SANDBOX_SPL_CAPABILITY_STATE,
      new Date(nowMs).toISOString(),
    ]),
  };
}

export async function issueSpbCapability({
  env,
  accountId,
  instanceId,
  nowMs,
  brokerEndpoint,
  ownership,
  ctx,
}) {
  const issued = await writeSpbBindingIssuance({ env, accountId, instanceId, ownership, nowMs });
  if (issued.outcome !== 'issued') return issued;
  const { brokerToken } = issued;

  await reconcileSpbEntitlement(env, accountId, nowMs, ctx);
  const entitlement = await getEntitlement(env.DB, {
    accountId,
    service: SPB_HOSTED_SERVICE,
  });
  const capability = orderedObject(SANDBOX_CAPABILITY_KEYS.spb, [
    brokerEndpoint,
    accountId,
    instanceId,
    env.R2_BUCKET,
    `users/${accountId}/${instanceId}/`,
    brokerToken,
  ]);
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
  ownership,
}) {
  const sandbox = sandboxOwnership(ownership);
  const issued = await writeSppBindingIssuance({
    env,
    accountId,
    instanceId,
    ownership,
    nowMs,
    consentAckedAt,
    consentDisclosureVersion,
  });
  if (issued.outcome !== 'issued') return issued;
  const { credential } = issued;

  await reconcileSppEntitlement(env, accountId, nowMs, ctx);
  if (sandbox) {
    const entitlement = await getEntitlement(env.DB, {
      accountId,
      service: SPP_HOSTED_SERVICE,
    });
    if (entitlement?.status !== 'active') return { outcome: 'not_entitled' };
  }
  return {
    outcome: 'issued',
    capability: orderedObject(SANDBOX_CAPABILITY_KEYS.spp, [
      env.SPP_ENGINE_ENDPOINT,
      env.SPP_ENGINE_MODEL,
      credential,
      accountId,
      new Date(nowMs).toISOString(),
    ]),
  };
}

function isOwnerEntitled(entitlement) {
  return entitlement?.status === 'active' || entitlement?.status === 'past_due';
}

export async function writeDispatchIssuance({ env, accountId, ownership, nowMs }) {
  const sandbox = sandboxOwnership(ownership);
  if (!sandbox) {
    return {
      outcome: 'issued',
      dispatch: await mintDispatchToken(env, accountId, null, nowMs),
    };
  }
  const token = generateSessionToken();
  const tokenHash = await hashWithPepper(token, env, 'DISPATCH_TOKEN_PEPPER');
  const row = await insertDispatchTokenForSandboxRun(env.DB, {
    tokenHash,
    accountId,
    sandboxRunId: sandbox.runId,
    instanceId: sandbox.instanceId,
    expectedPhase: sandbox.expectedPhase,
    nowMs,
  });
  if (!row) return { outcome: await fencedWriteFailure(env, accountId, sandbox) };
  return {
    outcome: 'issued',
    dispatch: {
      token,
      tokenHash,
      accountId,
      sandboxRunId: sandbox.runId,
      createdAt: new Date(nowMs).toISOString(),
    },
  };
}

export async function writeSplBindingIssuance({ env, accountId, instanceId, ownership, nowMs }) {
  const sandbox = sandboxOwnership(ownership);
  const binding = sandbox
    ? await upsertSplBindingForSandboxRun(env.DB, {
        accountId,
        instanceId,
        nowMs,
        sandboxRunId: sandbox.runId,
        expectedPhase: sandbox.expectedPhase,
      })
    : await upsertSplBinding(env.DB, { accountId, instanceId, nowMs });
  if (binding) return { outcome: 'issued', binding };
  return { outcome: sandbox ? await fencedWriteFailure(env, accountId, sandbox) : 'ownership_conflict' };
}

export async function writeSpbBindingIssuance({ env, accountId, instanceId, ownership, nowMs }) {
  const sandbox = sandboxOwnership(ownership);
  const brokerToken = generateSessionToken();
  const tokenHash = await hashWithPepper(brokerToken, env);
  const binding = sandbox
    ? await upsertSpbBindingForSandboxRun(env.DB, {
        accountId,
        instanceId,
        tokenHash,
        nowMs,
        sandboxRunId: sandbox.runId,
        expectedPhase: sandbox.expectedPhase,
      })
    : await upsertSpbBinding(env.DB, { accountId, instanceId, tokenHash, nowMs });
  if (binding) return { outcome: 'issued', binding, brokerToken };
  return { outcome: sandbox ? await fencedWriteFailure(env, accountId, sandbox) : 'ownership_conflict' };
}

export async function writeSppBindingIssuance({
  env,
  accountId,
  instanceId,
  ownership,
  nowMs,
  consentAckedAt,
  consentDisclosureVersion,
}) {
  const sandbox = sandboxOwnership(ownership);
  const credential = generateSessionToken();
  const tokenHash = await hashWithPepper(credential, env);
  const binding = sandbox
    ? await upsertSppBindingForSandboxRun(env.DB, {
        accountId,
        instanceId,
        tokenHash,
        nowMs,
        consentAckedAt,
        consentDisclosureVersion,
        sandboxRunId: sandbox.runId,
        expectedPhase: sandbox.expectedPhase,
      })
    : await upsertSppBinding(env.DB, {
        accountId,
        instanceId,
        tokenHash,
        nowMs,
        consentAckedAt,
        consentDisclosureVersion,
      });
  if (binding) return { outcome: 'issued', binding, credential };
  return { outcome: sandbox ? await fencedWriteFailure(env, accountId, sandbox) : 'ownership_conflict' };
}

function sandboxOwnership(ownership) {
  if (ownership?.kind === 'baseline') return null;
  if (
    ownership?.kind !== 'sandbox_run'
    || typeof ownership.expectedPhase !== 'string'
  ) {
    throw new TypeError('invalid capability ownership');
  }
  requireCanonicalUuids(ownership.runId, ownership.instanceId);
  return ownership;
}

function currentSandboxOwnership(env, accountId, ownership) {
  return findSandboxRunProvisioningOwnership(env.DB, {
    runId: ownership.runId,
    accountId,
    instanceId: ownership.instanceId,
    expectedPhase: ownership.expectedPhase,
  });
}

async function fencedWriteFailure(env, accountId, ownership) {
  return await currentSandboxOwnership(env, accountId, ownership)
    ? 'ownership_conflict'
    : 'run_fence_lost';
}
