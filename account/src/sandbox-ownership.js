import {
  writeDispatchIssuance,
  writeSplBindingIssuance,
  writeSppBindingIssuance,
} from './capability-issuance.js';
import {
  releaseDispatchTokensForSandboxRun,
  releaseSplBindingOwnership,
  releaseSppBindingOwnership,
} from './db.js';
import { requireCanonicalUuids } from './sandbox-identifiers.js';
import { SANDBOX_PROVISIONING_PHASE } from './sandbox-run-contract.js';

export async function mintSandboxDispatchToken(env, {
  sandboxRunId,
  accountId,
  instanceId,
  expectedPhase = SANDBOX_PROVISIONING_PHASE.DISPATCH_INTENT,
  nowMs = Date.now(),
}) {
  requireCanonicalUuids(sandboxRunId, accountId, instanceId);
  const result = await writeDispatchIssuance({
    env,
    accountId,
    ownership: sandboxOwnership(sandboxRunId, instanceId, expectedPhase),
    nowMs,
  });
  return result.outcome === 'issued' ? result.dispatch : { outcome: result.outcome };
}

export async function claimSandboxSplBinding(env, {
  sandboxRunId,
  accountId,
  instanceId,
  expectedPhase = SANDBOX_PROVISIONING_PHASE.SPL_INTENT,
  nowMs = Date.now(),
}) {
  requireCanonicalUuids(sandboxRunId, accountId, instanceId);
  const result = await writeSplBindingIssuance({
    env,
    accountId,
    instanceId,
    ownership: sandboxOwnership(sandboxRunId, instanceId, expectedPhase),
    nowMs,
  });
  return result.outcome === 'issued'
    ? { outcome: 'claimed' }
    : { outcome: result.outcome };
}

export async function claimSandboxSppBinding(env, {
  sandboxRunId,
  accountId,
  instanceId,
  expectedPhase = SANDBOX_PROVISIONING_PHASE.SPP_INTENT,
  nowMs = Date.now(),
}) {
  requireCanonicalUuids(sandboxRunId, accountId, instanceId);
  const result = await writeSppBindingIssuance({
    env,
    accountId,
    instanceId,
    ownership: sandboxOwnership(sandboxRunId, instanceId, expectedPhase),
    nowMs,
    consentAckedAt: null,
    consentDisclosureVersion: null,
  });
  return result.outcome === 'issued'
    ? { outcome: 'claimed', credential: result.credential }
    : { outcome: result.outcome };
}

// Revoke every active token for one exact run+account so partial same-run retries
// converge; baseline tokens and every other run or account remain untouched.
export async function releaseSandboxDispatchTokens(env, {
  sandboxRunId,
  accountId,
  nowMs = Date.now(),
}) {
  requireCanonicalUuids(sandboxRunId, accountId);
  const result = await releaseDispatchTokensForSandboxRun(env.DB, {
    accountId,
    sandboxRunId,
    nowMs,
  });
  if (result.revokedRows.length > 0) return { outcome: 'released' };
  if (result.runRows.some((row) => row.account_id !== accountId)) {
    return { outcome: 'ownership_conflict' };
  }
  return { outcome: 'absent' };
}

export async function releaseSandboxSplBinding(env, {
  sandboxRunId,
  accountId,
  instanceId,
}) {
  requireCanonicalUuids(sandboxRunId, accountId, instanceId);
  return releaseBindingResult(await releaseSplBindingOwnership(env.DB, {
    accountId,
    instanceId,
    sandboxRunId,
  }));
}

export async function releaseSandboxSppBinding(env, {
  sandboxRunId,
  accountId,
  instanceId,
}) {
  requireCanonicalUuids(sandboxRunId, accountId, instanceId);
  return releaseBindingResult(await releaseSppBindingOwnership(env.DB, {
    accountId,
    instanceId,
    sandboxRunId,
  }));
}

function releaseBindingResult(result) {
  if (result.deletedRows.length > 0) return { outcome: 'released' };
  if (result.incumbent) return { outcome: 'ownership_conflict' };
  return { outcome: 'absent' };
}

function sandboxOwnership(runId, instanceId, expectedPhase) {
  return { kind: 'sandbox_run', runId, instanceId, expectedPhase };
}
