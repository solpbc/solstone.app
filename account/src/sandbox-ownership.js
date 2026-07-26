import { generateSessionToken, hashWithPepper } from './crypto.js';
import {
  releaseDispatchTokensForSandboxRun,
  releaseSplBindingOwnership,
  releaseSppBindingOwnership,
  upsertSplBinding,
  upsertSppBinding,
} from './db.js';
import { mintDispatchToken } from './dispatch-tokens.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function mintSandboxDispatchToken(env, { sandboxRunId, accountId }) {
  requireCanonicalUuids(sandboxRunId, accountId);
  return mintDispatchToken(env, accountId, sandboxRunId);
}

export async function claimSandboxSplBinding(env, {
  sandboxRunId,
  accountId,
  instanceId,
  nowMs = Date.now(),
}) {
  requireCanonicalUuids(sandboxRunId, accountId, instanceId);
  const row = await upsertSplBinding(env.DB, {
    accountId,
    instanceId,
    nowMs,
    sandboxRunId,
  });
  return row ? { outcome: 'claimed' } : { outcome: 'ownership_conflict' };
}

export async function claimSandboxSppBinding(env, {
  sandboxRunId,
  accountId,
  instanceId,
  nowMs = Date.now(),
}) {
  requireCanonicalUuids(sandboxRunId, accountId, instanceId);
  const credential = generateSessionToken();
  const tokenHash = await hashWithPepper(credential, env);
  const row = await upsertSppBinding(env.DB, {
    accountId,
    instanceId,
    tokenHash,
    nowMs,
    consentAckedAt: null,
    consentDisclosureVersion: null,
    sandboxRunId,
  });
  return row
    ? { outcome: 'claimed', credential }
    : { outcome: 'ownership_conflict' };
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

function requireCanonicalUuids(...values) {
  if (values.some((value) => typeof value !== 'string' || !UUID_RE.test(value))) {
    throw new TypeError('invalid sandbox ownership identifier');
  }
}
