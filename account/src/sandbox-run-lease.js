import { decryptEmail } from './crypto.js';
import {
  activateSandboxRun,
  advanceSandboxRunCleanupPhase,
  advanceSandboxRunProvisioningPhase,
  advanceSandboxRunRetryNotBefore,
  claimSandboxRunCleanup,
  findActiveProvisionedKey,
  findSandboxRunById,
  findSandboxRunForAccount,
  findSandboxRunProvisioningOwnership,
  getAccountTransparencyRow,
  getScoutApplicationStatusByAccount,
  insertSandboxRun,
  readSandboxRunLocalPostconditions,
  releaseSandboxRun,
  requestSandboxRunCleanup,
  setSandboxRunCleanupDisposition,
  updateSandboxRunComponent,
} from './db.js';
import {
  issueScoutCapability,
  issueSpbCapability,
  issueSplCapability,
  issueSppCapability,
} from './capability-issuance.js';
import { emitSecurityEvent } from './hub.js';
import { retireRelayInstance } from './relay-grant.js';
import {
  releaseSandboxDispatchTokens,
  releaseSandboxSplBinding,
  releaseSandboxSppBinding,
} from './sandbox-ownership.js';
import { isCanonicalUuid } from './sandbox-identifiers.js';
import {
  cleanupSpbSandboxBinding,
  denySpbSandboxBinding,
} from './spb-sandbox-lifecycle.js';

const LEASE_TTL_MS = 3_600_000;
const BROKER_ENDPOINT = 'https://services.solstone.app';
const REQUEST_KEYS = ['contract_version', 'instance_id', 'profile', 'run_id'];
const CLEANUP_TRIGGERS = new Set(['post_failure', 'delete', 'scheduled']);
const PROVISIONING_PHASES = [
  'created',
  'dispatch_intent',
  'dispatch_acquired',
  'spl_intent',
  'spl_acquired',
  'spb_intent',
  'spb_acquired',
  'spp_intent',
  'spp_acquired',
  'active',
];
const COMPONENTS = [
  ['dispatch', 'dispatch_state', 'dispatch_residual_code', 'dispatch_updated_at'],
  ['spp', 'spp_state', 'spp_residual_code', 'spp_updated_at'],
  ['spb', 'spb_state', 'spb_residual_code', 'spb_updated_at'],
  ['spl_relay', 'spl_relay_state', 'spl_relay_residual_code', 'spl_relay_updated_at'],
  ['spl_binding', 'spl_binding_state', 'spl_binding_residual_code', 'spl_binding_updated_at'],
];
const RELAY_RESIDUALS = {
  retired_state: 'relay_retired_state',
  instance_do_cleanup: 'relay_instance_do_cleanup',
  rk_do_cleanup: 'relay_rk_do_cleanup',
  device_revocation: 'relay_device_revocation',
  entitlement_clear: 'relay_entitlement_clear',
  pending_grant_clear: 'relay_pending_grant_clear',
  rk_registry_clear: 'relay_rk_registry_clear',
  verification: 'relay_verification',
};

export function isSandboxRunLeaseLive(run, nowMs) {
  return run?.status === 'active' && nowMs < run.lease_expires_at;
}

export async function handleSandboxRunRequest(request, env, url, parts, ctx, securityHeaders) {
  if (request.method === 'POST' && url.pathname === '/admin/sandbox-runs' && parts.length === 3) {
    const input = await readCreateInput(request);
    if (!input) return invalidRequest(securityHeaders);
    const accountId = configuredSandboxAccountId(env);
    if (!accountId) return unavailable(input.run_id, securityHeaders);
    const result = await createSandboxRun(env, ctx, {
      accountId,
      runId: input.run_id,
      instanceId: input.instance_id,
      contractVersion: input.contract_version,
      profile: input.profile,
    });
    if (result.outcome === 'created') {
      return responseJson(result.body, 201, securityHeaders);
    }
    if (result.outcome === 'conflict') return conflict(input.run_id, securityHeaders);
    return unavailable(input.run_id, securityHeaders);
  }

  if (
    parts.length === 4
    && parts[1] === 'admin'
    && parts[2] === 'sandbox-runs'
    && isCanonicalUuid(parts[3])
    && (request.method === 'GET' || request.method === 'DELETE')
  ) {
    const runId = parts[3];
    const accountId = configuredSandboxAccountId(env);
    if (!accountId) return unavailable(runId, securityHeaders);
    let existing;
    try {
      existing = await findSandboxRunForAccount(env.DB, { runId, accountId });
    } catch {
      return unavailable(runId, securityHeaders);
    }
    if (!existing) {
      return request.method === 'GET'
        ? sandboxRunNotFound(runId, securityHeaders)
        : null;
    }
    if (request.method === 'GET') {
      return responseJson(renderSandboxRun(existing, Date.now()), 200, securityHeaders);
    }

    let result;
    try {
      result = await reconcileSandboxRun(env, ctx, {
        runId,
        nowMs: Date.now(),
        trigger: 'delete',
      });
    } catch {
      return cleanupUnavailable(runId, securityHeaders);
    }
    let row = result.row;
    if (!row) {
      try {
        row = await findSandboxRunForAccount(env.DB, { runId, accountId });
      } catch {
        return cleanupUnavailable(runId, securityHeaders);
      }
    }
    if (!row) return unavailable(runId, securityHeaders);
    const report = renderSandboxRun(row, Date.now());
    if (row.status === 'released') return responseJson(report, 200, securityHeaders);
    if (isExpiryOnly(report)) {
      const retryAfter = report.retry_after_seconds;
      return responseJson(report, 202, securityHeaders, { 'Retry-After': String(retryAfter) });
    }
    if (hasOwnershipConflict(report)) return cleanupConflict(runId, securityHeaders);
    return cleanupUnavailable(runId, securityHeaders);
  }

  return null;
}

export async function createSandboxRun(env, ctx, {
  accountId,
  runId,
  instanceId,
  contractVersion = 1,
  profile = 'full',
  nowMs,
}) {
  const startedAt = Date.now();
  let componentsCompleted = 0;
  let inserted = null;
  let createdAt = nowMs;
  try {
    const googleApiKey = await readStandingGoogleApiKey(env, accountId);
    if (!googleApiKey) {
      emitCreateTelemetry(
        env,
        ctx,
        'baseline_unavailable',
        componentsCompleted,
        createdAt ?? Date.now(),
        startedAt
      );
      return { outcome: 'unavailable' };
    }

    createdAt ??= Date.now();
    const leaseExpiresAt = createdAt + LEASE_TTL_MS;
    inserted = await insertSandboxRun(env.DB, {
      runId,
      accountId,
      instanceId,
      contractVersion,
      profile,
      createdAt,
      leaseExpiresAt,
    });
    if (!inserted) {
      emitCreateTelemetry(env, ctx, 'conflict', componentsCompleted, createdAt, startedAt);
      return { outcome: 'conflict' };
    }

    await requireProvisioningPhase(env, inserted, 'created', 'dispatch_intent', createdAt);
    const scout = await issueScoutCapability({
      env,
      accountId,
      googleApiKey,
      ownership: sandboxOwnership(inserted, 'dispatch_intent'),
      nowMs: createdAt,
    });
    requireIssued(scout, 'dispatch');
    await requireOwnershipAndAdvance(env, inserted, 'dispatch_intent', 'dispatch_acquired', createdAt);
    componentsCompleted += 1;

    await requireProvisioningPhase(env, inserted, 'dispatch_acquired', 'spl_intent', createdAt);
    const spl = await issueSplCapability({
      env,
      accountId,
      instanceId,
      ownership: sandboxOwnership(inserted, 'spl_intent'),
      nowMs: createdAt,
      ctx,
      leaseExpiresAt,
    });
    requireIssued(spl, 'spl');
    await requireOwnershipAndAdvance(env, inserted, 'spl_intent', 'spl_acquired', createdAt);
    componentsCompleted += 1;

    await requireProvisioningPhase(env, inserted, 'spl_acquired', 'spb_intent', createdAt);
    const spb = await issueSpbCapability({
      env,
      accountId,
      instanceId,
      ownership: sandboxOwnership(inserted, 'spb_intent'),
      nowMs: createdAt,
      brokerEndpoint: BROKER_ENDPOINT,
      ctx,
    });
    requireIssued(spb, 'spb');
    await requireOwnershipAndAdvance(env, inserted, 'spb_intent', 'spb_acquired', createdAt);
    componentsCompleted += 1;

    await requireProvisioningPhase(env, inserted, 'spb_acquired', 'spp_intent', createdAt);
    const spp = await issueSppCapability({
      env,
      accountId,
      instanceId,
      ownership: sandboxOwnership(inserted, 'spp_intent'),
      nowMs: createdAt,
      ctx,
      consentAckedAt: null,
      consentDisclosureVersion: null,
    });
    requireIssued(spp, 'spp');
    await requireOwnershipAndAdvance(env, inserted, 'spp_intent', 'spp_acquired', createdAt);
    componentsCompleted += 1;

    const body = {
      run_id: runId,
      contract_version: contractVersion,
      profile,
      lease_expires_at: leaseExpiresAt,
      capabilities: {
        scout: scout.capability,
        spl: spl.capability,
        spb: spb.capability,
        spp: spp.capability,
      },
    };
    const activationNowMs = Date.now();
    const activated = await activateSandboxRun(env.DB, {
      runId,
      accountId,
      instanceId,
      nowMs: activationNowMs,
    });
    if (!activated) {
      throw creationFailure(
        activationNowMs >= leaseExpiresAt
          ? 'lease_expired_before_activation'
          : 'activation_cas_lost'
      );
    }

    emitCreateTelemetry(env, ctx, 'created', componentsCompleted, createdAt, startedAt);
    return { outcome: 'created', body };
  } catch (error) {
    if (!inserted) {
      emitCreateTelemetry(
        env,
        ctx,
        'baseline_unavailable',
        componentsCompleted,
        createdAt ?? Date.now(),
        startedAt
      );
      return { outcome: 'unavailable' };
    }
    const residualCode = error?.residualCode || 'activation_cas_lost';
    try {
      await requestSandboxRunCleanup(env.DB, { runId, accountId, residualCode, nowMs: Date.now() });
    } catch {
      // The durable run remains discoverable for DELETE or scheduled reconciliation.
    }
    try {
      await reconcileSandboxRun(env, ctx, {
        runId,
        nowMs: Date.now(),
        trigger: 'post_failure',
      });
    } catch {
      // A creation failure never becomes a partial credential response.
    }
    emitCreateTelemetry(env, ctx, 'failed', componentsCompleted, createdAt, startedAt);
    return { outcome: 'unavailable' };
  }
}

export async function readSandboxRun(env, { runId, accountId, nowMs }) {
  const row = accountId
    ? await findSandboxRunForAccount(env.DB, { runId, accountId })
    : await findSandboxRunById(env.DB, runId);
  return row ? renderSandboxRun(row, nowMs) : null;
}

export async function reconcileSandboxRun(env, ctx, { runId, nowMs, trigger }) {
  if (!CLEANUP_TRIGGERS.has(trigger)) throw new TypeError('invalid sandbox cleanup trigger');
  const startedAt = Date.now();
  let run = await findSandboxRunById(env.DB, runId);
  if (!run) return { outcome: 'not_found', row: null };
  if (run.status === 'released') return { outcome: 'released', row: run };

  if (run.status === 'provisioning' || run.status === 'active') {
    const residualCode = trigger === 'scheduled' ? 'lease_expired' : null;
    await requestSandboxRunCleanup(env.DB, {
      runId,
      accountId: run.account_id,
      residualCode,
      nowMs,
    });
  }
  run = await claimSandboxRunCleanup(env.DB, {
    runId,
    accountId: run.account_id,
    nowMs,
  });
  if (!run) {
    const row = await findSandboxRunById(env.DB, runId);
    return { outcome: row?.status === 'released' ? 'released' : 'failed', row };
  }

  const accountId = run.account_id;
  const instanceId = run.instance_id;
  const componentResults = new Map();
  await bestEffortPhase(env, run, 'deny_intent', nowMs);

  componentResults.set('dispatch', await releaseLocalComponent({
    env,
    component: 'dispatch',
    release: () => releaseSandboxDispatchTokens(env, {
      sandboxRunId: runId,
      accountId,
      nowMs,
    }),
    releaseFailed: 'dispatch_release_failed',
    ownershipConflict: 'dispatch_ownership_conflict',
    run,
    nowMs,
  }));
  componentResults.set('spp', await releaseLocalComponent({
    env,
    component: 'spp',
    release: () => releaseSandboxSppBinding(env, {
      sandboxRunId: runId,
      accountId,
      instanceId,
    }),
    releaseFailed: 'spp_release_failed',
    ownershipConflict: 'spp_ownership_conflict',
    run,
    nowMs,
  }));
  componentResults.set('spb', await denySpbComponent(env, ctx, run, nowMs));
  await bestEffortPhase(env, run, 'denied', nowMs);

  const beforeRelay = await safeLocalPostconditions(env, run);
  if (bindingConflicts(beforeRelay?.spl_account_id, beforeRelay?.spl_sandbox_run_id, run)) {
    componentResults.set('spl_binding', await persistComponent(
      env,
      run,
      'spl_binding',
      'cleanup_failed',
      'spl_ownership_conflict',
      nowMs
    ));
  }
  await bestEffortPhase(env, run, 'relay_intent', nowMs);
  const relay = await retireRelayComponent(env, run, beforeRelay, nowMs);
  componentResults.set('spl_relay', relay);
  if (relay.state === 'released') await bestEffortPhase(env, run, 'relay_retired', nowMs);

  if (relay.state === 'released' && !componentResults.has('spl_binding')) {
    componentResults.set('spl_binding', await releaseLocalComponent({
      env,
      component: 'spl_binding',
      release: () => releaseSandboxSplBinding(env, {
        sandboxRunId: runId,
        accountId,
        instanceId,
      }),
      releaseFailed: 'spl_release_failed',
      ownershipConflict: 'spl_ownership_conflict',
      run,
      nowMs,
    }));
  } else {
    componentResults.set('spl_binding', { state: 'deny_pending', residual: null });
  }

  await bestEffortPhase(env, run, 'spb_expiry', nowMs);
  const spbCleanup = await cleanupSpbComponent(env, ctx, run, componentResults.get('spb'), nowMs);
  componentResults.set('spb', spbCleanup);
  await bestEffortPhase(env, run, 'spb_purge', nowMs);
  await bestEffortPhase(env, run, 'verify', nowMs);

  const local = await safeLocalPostconditions(env, run);
  await verifyLocalComponents(env, run, componentResults, local, nowMs);
  run = await findSandboxRunById(env.DB, runId);

  let outcome;
  if (local?.account_present === 1 && allComponentsReleased(run)) {
    run = await releaseSandboxRun(env.DB, { runId, accountId, nowMs }) || run;
    outcome = run.status === 'released' ? 'released' : 'failed';
  } else if (isStoredExpiryOnly(run)) {
    run = await setSandboxRunCleanupDisposition(env.DB, {
      runId,
      accountId,
      status: 'expiry_pending',
      residualCode: 'spb_credential_expiry_pending',
      nowMs,
    }) || run;
    outcome = 'pending';
  } else {
    const residualCode = firstResidual(run) || (local ? 'account_missing' : 'relay_failed');
    run = await setSandboxRunCleanupDisposition(env.DB, {
      runId,
      accountId,
      status: 'cleanup_failed',
      residualCode,
      nowMs,
    }) || run;
    outcome = hasStoredOwnershipConflict(run) ? 'conflict' : 'failed';
  }

  emitCleanupTelemetry(env, ctx, trigger, outcome, run, nowMs, startedAt);
  return { outcome, row: run };
}

function configuredSandboxAccountId(env) {
  return isCanonicalUuid(env.SANDBOX_ACCOUNT_ID) ? env.SANDBOX_ACCOUNT_ID : null;
}

async function readCreateInput(request) {
  let value;
  try {
    value = await request.json();
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.length !== REQUEST_KEYS.length || keys.some((key, index) => key !== REQUEST_KEYS[index])) {
    return null;
  }
  if (value.contract_version !== 1 || value.profile !== 'full') return null;
  if (!isCanonicalUuid(value.run_id) || !isCanonicalUuid(value.instance_id)) return null;
  return value;
}

async function readStandingGoogleApiKey(env, accountId) {
  try {
    const account = await getAccountTransparencyRow(env.DB, accountId);
    if (!account) return null;
    const scout = await getScoutApplicationStatusByAccount(env.DB, { accountId });
    if (scout?.status !== 'approved') return null;
    const key = await findActiveProvisionedKey(env.DB, { accountId, provider: 'gemini' });
    if (!key?.key_string_encrypted) return null;
    const plaintext = await decryptEmail(key.key_string_encrypted, env);
    return typeof plaintext === 'string' && plaintext.trim() ? plaintext : null;
  } catch {
    return null;
  }
}

function sandboxOwnership(run, expectedPhase) {
  return {
    kind: 'sandbox_run',
    runId: run.run_id,
    instanceId: run.instance_id,
    expectedPhase,
  };
}

async function requireProvisioningPhase(env, run, fromPhase, toPhase, nowMs) {
  const advanced = await advanceSandboxRunProvisioningPhase(env.DB, {
    runId: run.run_id,
    accountId: run.account_id,
    instanceId: run.instance_id,
    fromPhase,
    toPhase,
    nowMs,
  });
  if (!advanced) throw creationFailure('activation_cas_lost');
}

async function requireOwnershipAndAdvance(env, run, fromPhase, toPhase, nowMs) {
  const owned = await findSandboxRunProvisioningOwnership(env.DB, {
    runId: run.run_id,
    accountId: run.account_id,
    instanceId: run.instance_id,
    expectedPhase: fromPhase,
  });
  if (!owned) throw creationFailure('activation_cas_lost');
  await requireProvisioningPhase(env, run, fromPhase, toPhase, nowMs);
}

function requireIssued(result, component) {
  if (result?.outcome === 'issued') return;
  if (result?.outcome === 'run_fence_lost') throw creationFailure('activation_cas_lost');
  if (component === 'dispatch') {
    throw creationFailure(result?.outcome === 'ownership_conflict'
      ? 'dispatch_ownership_conflict'
      : 'dispatch_issue_failed');
  }
  if (component === 'spl') {
    if (result?.outcome === 'grant_failed') throw creationFailure('spl_grant_failed');
    throw creationFailure(result?.outcome === 'ownership_conflict'
      ? 'spl_ownership_conflict'
      : 'spl_issue_failed');
  }
  if (component === 'spb') {
    throw creationFailure(result?.outcome === 'ownership_conflict'
      ? 'spb_ownership_conflict'
      : 'spb_issue_failed');
  }
  throw creationFailure(result?.outcome === 'ownership_conflict'
    ? 'spp_ownership_conflict'
    : 'spp_issue_failed');
}

function creationFailure(residualCode) {
  const error = new Error();
  error.name = 'SandboxRunCreationError';
  error.residualCode = residualCode;
  return error;
}

async function releaseLocalComponent({
  env,
  component,
  release,
  releaseFailed,
  ownershipConflict,
  run,
  nowMs,
}) {
  if (run[`${component}_state`] === 'released') return { state: 'released', residual: null };
  try {
    const result = await release();
    if (result.outcome === 'ownership_conflict') {
      return persistComponent(env, run, component, 'cleanup_failed', ownershipConflict, nowMs);
    }
    return persistComponent(env, run, component, 'verify_pending', null, nowMs);
  } catch {
    return persistComponent(env, run, component, 'cleanup_failed', releaseFailed, nowMs);
  }
}

async function denySpbComponent(env, ctx, run, nowMs) {
  if (run.spb_state === 'released') return { state: 'released', residual: null };
  try {
    const result = await denySpbSandboxBinding(env, ctx, {
      sandboxRunId: run.run_id,
      accountId: run.account_id,
      instanceId: run.instance_id,
      nowMs,
    });
    if (result.outcome === 'ownership_conflict') {
      return persistComponent(env, run, 'spb', 'cleanup_failed', 'spb_ownership_conflict', nowMs);
    }
    return persistComponent(env, run, 'spb', 'purge_pending', null, nowMs);
  } catch {
    return persistComponent(env, run, 'spb', 'cleanup_failed', 'spb_denial_failed', nowMs);
  }
}

async function retireRelayComponent(env, run, local, nowMs) {
  if (run.spl_relay_state === 'released') return { state: 'released', residual: null };
  if (bindingConflicts(local?.spl_account_id, local?.spl_sandbox_run_id, run)) {
    return persistComponent(env, run, 'spl_relay', 'cleanup_failed', 'relay_failed', nowMs);
  }
  const splAttempted = phaseAtLeast(run.provisioning_phase, 'spl_intent');
  const exactBinding = bindingMatches(local?.spl_account_id, local?.spl_sandbox_run_id, run);
  if (!splAttempted && !exactBinding && local?.account_present === 1) {
    return persistComponent(env, run, 'spl_relay', 'released', null, nowMs);
  }
  try {
    const result = await retireRelayInstance(env, { instanceId: run.instance_id });
    if (result.outcome === 'retired') {
      return persistComponent(env, run, 'spl_relay', 'released', null, nowMs);
    }
    if (result.outcome === 'retryable_residual') {
      const residual = RELAY_RESIDUALS[result.failedComponent] || 'relay_failed';
      return persistComponent(env, run, 'spl_relay', 'cleanup_failed', residual, nowMs);
    }
    return persistComponent(env, run, 'spl_relay', 'cleanup_failed', 'relay_failed', nowMs);
  } catch {
    return persistComponent(env, run, 'spl_relay', 'cleanup_failed', 'relay_failed', nowMs);
  }
}

async function cleanupSpbComponent(env, ctx, run, denial, nowMs) {
  if (denial.state === 'released') return denial;
  if (denial.residual) return denial;
  const local = await safeLocalPostconditions(env, run);
  if (
    !phaseAtLeast(run.provisioning_phase, 'spb_intent')
    && !bindingMatches(local?.spb_account_id, local?.spb_sandbox_run_id, run)
    && local?.account_present === 1
  ) {
    return persistComponent(env, run, 'spb', 'verify_pending', null, nowMs);
  }
  try {
    const result = await cleanupSpbSandboxBinding(env, ctx, {
      sandboxRunId: run.run_id,
      accountId: run.account_id,
      instanceId: run.instance_id,
      nowMs,
    });
    if (result.outcome === 'credential_expiry_pending') {
      const persisted = await advanceSandboxRunRetryNotBefore(env.DB, {
        runId: run.run_id,
        accountId: run.account_id,
        retryNotBefore: result.retry_not_before_ms,
        nowMs,
      });
      if (!persisted) {
        return persistComponent(env, run, 'spb', 'cleanup_failed', 'spb_cleanup_retryable', nowMs);
      }
      return persistComponent(
        env,
        run,
        'spb',
        'purge_pending',
        'spb_credential_expiry_pending',
        nowMs
      );
    }
    if (result.outcome === 'cleaned') {
      return persistComponent(env, run, 'spb', 'verify_pending', null, nowMs);
    }
    const residual = {
      retryable: 'spb_cleanup_retryable',
      denial_required: 'spb_denial_required',
      absent: 'spb_lifecycle_absent',
      ownership_conflict: 'spb_ownership_conflict',
    }[result.outcome] || 'spb_cleanup_retryable';
    return persistComponent(env, run, 'spb', 'cleanup_failed', residual, nowMs);
  } catch {
    return persistComponent(env, run, 'spb', 'cleanup_failed', 'spb_cleanup_retryable', nowMs);
  }
}

async function verifyLocalComponents(env, run, results, local, nowMs) {
  if (!local) return;
  const accountPresent = local.account_present === 1;
  if (!accountPresent) {
    await persistComponent(env, run, 'dispatch', 'cleanup_failed', 'account_missing', nowMs);
    await persistComponent(env, run, 'spp', 'cleanup_failed', 'account_missing', nowMs);
    await persistComponent(env, run, 'spl_binding', 'cleanup_failed', 'account_missing', nowMs);
    if (results.get('spb')?.state !== 'cleanup_failed') {
      await persistComponent(env, run, 'spb', 'cleanup_failed', 'spb_lifecycle_absent', nowMs);
    }
    return;
  }

  if (!results.get('dispatch')?.residual) {
    const residual = Number(local.dispatch_conflict_count) > 0
      ? 'dispatch_ownership_conflict'
      : Number(local.dispatch_active_count) === 0
        ? null
        : 'dispatch_release_failed';
    await persistComponent(env, run, 'dispatch', residual ? 'cleanup_failed' : 'released', residual, nowMs);
  }

  if (!results.get('spp')?.residual) {
    const residual = bindingResidual(local.spp_account_id, local.spp_sandbox_run_id, run, 'spp');
    await persistComponent(env, run, 'spp', residual ? 'cleanup_failed' : 'released', residual, nowMs);
  }

  const spb = results.get('spb');
  if (!spb?.residual || spb.residual === 'spb_credential_expiry_pending') {
    if (spb?.residual === 'spb_credential_expiry_pending') {
      await persistComponent(env, run, 'spb', 'purge_pending', spb.residual, nowMs);
    } else {
      const residual = bindingResidual(local.spb_account_id, local.spb_sandbox_run_id, run, 'spb');
      await persistComponent(env, run, 'spb', residual ? 'cleanup_failed' : 'released', residual, nowMs);
    }
  }

  if (results.get('spl_relay')?.state === 'released' && !results.get('spl_binding')?.residual) {
    const residual = bindingResidual(local.spl_account_id, local.spl_sandbox_run_id, run, 'spl');
    await persistComponent(env, run, 'spl_binding', residual ? 'cleanup_failed' : 'released', residual, nowMs);
  }
}

function bindingResidual(accountId, sandboxRunId, run, component) {
  if (accountId === null || accountId === undefined) return null;
  if (accountId === run.account_id && sandboxRunId === run.run_id) {
    return component === 'spb' ? 'spb_cleanup_retryable' : `${component}_release_failed`;
  }
  return `${component}_ownership_conflict`;
}

function bindingMatches(accountId, sandboxRunId, run) {
  return accountId === run.account_id && sandboxRunId === run.run_id;
}

function bindingConflicts(accountId, sandboxRunId, run) {
  return accountId != null && !bindingMatches(accountId, sandboxRunId, run);
}

async function persistComponent(env, run, component, state, residual, nowMs) {
  try {
    await updateSandboxRunComponent(env.DB, {
      runId: run.run_id,
      accountId: run.account_id,
      component,
      state,
      residualCode: residual,
      nowMs,
    });
    return { state, residual };
  } catch {
    return { state: 'cleanup_failed', residual: residual || componentFailure(component) };
  }
}

function componentFailure(component) {
  return {
    dispatch: 'dispatch_release_failed',
    spp: 'spp_release_failed',
    spb: 'spb_cleanup_retryable',
    spl_relay: 'relay_failed',
    spl_binding: 'spl_release_failed',
  }[component];
}

async function bestEffortPhase(env, run, phase, nowMs) {
  try {
    await advanceSandboxRunCleanupPhase(env.DB, {
      runId: run.run_id,
      accountId: run.account_id,
      phase,
      nowMs,
    });
  } catch {
    // Component work remains independently retryable from its durable states.
  }
}

async function safeLocalPostconditions(env, run) {
  try {
    return await readSandboxRunLocalPostconditions(env.DB, {
      runId: run.run_id,
      accountId: run.account_id,
      instanceId: run.instance_id,
    });
  } catch {
    return null;
  }
}

function phaseAtLeast(actual, expected) {
  return PROVISIONING_PHASES.indexOf(actual) >= PROVISIONING_PHASES.indexOf(expected);
}

function allComponentsReleased(run) {
  return COMPONENTS.every(([, stateColumn]) => run?.[stateColumn] === 'released');
}

function isStoredExpiryOnly(run) {
  return run?.dispatch_state === 'released'
    && run?.spp_state === 'released'
    && run?.spb_state === 'purge_pending'
    && run?.spb_residual_code === 'spb_credential_expiry_pending'
    && run?.spl_relay_state === 'released'
    && run?.spl_binding_state === 'released';
}

function firstResidual(run) {
  return COMPONENTS.map(([, , residualColumn]) => run?.[residualColumn]).find(Boolean)
    || run?.last_residual_code
    || null;
}

function hasStoredOwnershipConflict(run) {
  return COMPONENTS.some(([, , residualColumn]) => run?.[residualColumn]?.endsWith('_ownership_conflict'));
}

function renderSandboxRun(row, nowMs) {
  const leaseLive = isSandboxRunLeaseLive(row, nowMs);
  const retryAfter = row.status === 'expiry_pending' && Number.isSafeInteger(row.spb_retry_not_before)
    ? Math.max(1, Math.ceil((row.spb_retry_not_before - nowMs) / 1000))
    : null;
  return {
    run_id: row.run_id,
    contract_version: row.contract_version,
    profile: row.profile,
    status: row.status,
    provisioning_phase: row.provisioning_phase,
    cleanup_phase: row.cleanup_phase,
    lease_expires_at: row.lease_expires_at,
    lease_live: leaseLive,
    retry_after_seconds: retryAfter,
    components: COMPONENTS.map(([component, stateColumn, residualColumn, updatedColumn]) => {
      const storedState = row[stateColumn];
      const expiredActive = storedState === 'active' && !leaseLive;
      return {
        component,
        state: expiredActive ? 'deny_pending' : storedState,
        residual_code: expiredActive ? 'lease_expired' : row[residualColumn],
        updated_at: row[updatedColumn],
      };
    }),
  };
}

function isExpiryOnly(report) {
  const components = Object.fromEntries(report.components.map((component) => [component.component, component]));
  return report.status === 'expiry_pending'
    && Number.isSafeInteger(report.retry_after_seconds)
    && components.dispatch.state === 'released'
    && components.spp.state === 'released'
    && components.spb.state === 'purge_pending'
    && components.spb.residual_code === 'spb_credential_expiry_pending'
    && components.spl_relay.state === 'released'
    && components.spl_binding.state === 'released';
}

function hasOwnershipConflict(report) {
  return report.components.some((component) => component.residual_code?.endsWith('_ownership_conflict'));
}

function emitCreateTelemetry(env, ctx, outcome, componentsCompleted, nowMs, startedAt) {
  const event = {
    event: 'sandbox_run_create',
    outcome,
    components_completed: componentsCompleted,
    duration_ms: Math.max(0, Date.now() - startedAt),
    ts: nowMs,
  };
  console.warn(JSON.stringify(event));
  emitSecurityEvent(env, ctx, {
    type: event.event,
    tier: 'T4',
    outcome,
    components_completed: componentsCompleted,
  });
}

function emitCleanupTelemetry(env, ctx, trigger, outcome, run, nowMs, startedAt) {
  const counts = {
    components_released: 0,
    components_pending: 0,
    components_failed: 0,
    components_conflicted: 0,
    components_active: 0,
  };
  for (const [, stateColumn, residualColumn] of COMPONENTS) {
    const state = run?.[stateColumn];
    const residual = run?.[residualColumn];
    if (state === 'released') counts.components_released += 1;
    else if (residual?.endsWith('_ownership_conflict')) counts.components_conflicted += 1;
    else if (state === 'cleanup_failed') counts.components_failed += 1;
    else if (state === 'active') counts.components_active += 1;
    else counts.components_pending += 1;
  }
  const event = {
    event: 'sandbox_run_cleanup',
    trigger,
    outcome,
    ...counts,
    duration_ms: Math.max(0, Date.now() - startedAt),
    ts: nowMs,
  };
  console.warn(JSON.stringify(event));
  emitSecurityEvent(env, ctx, {
    type: event.event,
    tier: 'T4',
    trigger,
    outcome,
    ...counts,
  });
}

function responseJson(body, status, securityHeaders, extraHeaders = {}) {
  const headers = new Headers(securityHeaders);
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', 'no-store');
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);
  return new Response(JSON.stringify(body), { status, headers });
}

function invalidRequest(headers) {
  return responseJson({
    error: 'invalid sandbox run request',
    code: 'invalid_sandbox_run_request',
  }, 400, headers);
}

function conflict(runId, headers) {
  return responseJson({
    error: 'sandbox run conflict',
    code: 'sandbox_run_conflict',
    run_id: runId,
  }, 409, headers);
}

function unavailable(runId, headers) {
  return responseJson({
    error: 'sandbox run unavailable',
    code: 'sandbox_run_unavailable',
    run_id: runId,
  }, 503, headers);
}

function cleanupConflict(runId, headers) {
  return responseJson({
    error: 'sandbox run cleanup conflict',
    code: 'sandbox_run_cleanup_conflict',
    run_id: runId,
  }, 409, headers);
}

function cleanupUnavailable(runId, headers) {
  return responseJson({
    error: 'sandbox run cleanup unavailable',
    code: 'sandbox_run_cleanup_unavailable',
    run_id: runId,
  }, 503, headers);
}

function sandboxRunNotFound(runId, headers) {
  return responseJson({
    error: 'sandbox run not found',
    code: 'sandbox_run_not_found',
    run_id: runId,
  }, 404, headers);
}
