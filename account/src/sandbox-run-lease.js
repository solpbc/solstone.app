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
  listSandboxRunsForReconciliation,
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
import {
  hasSandboxRunOwnershipConflict,
  isSandboxRunConfiguration,
  isSandboxRunCreateInput,
  isSandboxRunExpiryOnlyReport,
  isSandboxRunReport,
  isSandboxRunRow,
  orderedObject,
  renderSandboxRunReport,
  sandboxRunErrorBody,
  SANDBOX_BROKER_ENDPOINT,
  SANDBOX_CAPABILITIES_KEYS,
  SANDBOX_CLEANUP_PHASE,
  SANDBOX_CLEANUP_TRIGGER,
  SANDBOX_CLEANUP_TRIGGERS,
  SANDBOX_COMPONENT,
  SANDBOX_COMPONENT_FAILURE_RESIDUALS,
  SANDBOX_COMPONENT_OWNERSHIP_RESIDUALS,
  SANDBOX_COMPONENT_RELEASE_FAILURE_RESIDUALS,
  SANDBOX_COMPONENT_STATE,
  SANDBOX_COMPONENTS,
  SANDBOX_CONTRACT_VERSION,
  SANDBOX_CREATE_RESPONSE_KEYS,
  SANDBOX_ERROR,
  SANDBOX_LEASE_TTL_MS,
  SANDBOX_PROFILE,
  SANDBOX_PROVISIONING_PHASE,
  SANDBOX_PROVISIONING_PHASES,
  SANDBOX_RELAY_RESIDUALS,
  SANDBOX_RESIDUAL_CODE,
  SANDBOX_RUN_CONTRACT_JSON,
  SANDBOX_RUN_STATUS,
  SANDBOX_SPB_CLEANUP_OUTCOME_RESIDUALS,
} from './sandbox-run-contract.js';

const SANDBOX_RECONCILE_BATCH_SIZE = 10;

export async function handleSandboxRunRequest(request, env, url, parts, ctx, securityHeaders) {
  if (
    request.method === 'GET'
    && url.pathname === '/admin/sandbox-runs/contract'
    && url.search === ''
    && parts.length === 4
  ) {
    return serializedJson(SANDBOX_RUN_CONTRACT_JSON, 200, securityHeaders);
  }

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
      const nowMs = Date.now();
      try {
        if (!isSandboxRunRow(existing, { runId, accountId })) {
          return unavailable(runId, securityHeaders);
        }
        const report = renderSandboxRunReport(existing, nowMs);
        if (!isSandboxRunReport(report, { row: existing, nowMs })) {
          return unavailable(runId, securityHeaders);
        }
        return responseJson(report, 200, securityHeaders);
      } catch {
        return unavailable(runId, securityHeaders);
      }
    }

    let result;
    try {
      result = await reconcileSandboxRun(env, ctx, {
        runId,
        nowMs: Date.now(),
        trigger: SANDBOX_CLEANUP_TRIGGER.DELETE,
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
    let report;
    try {
      const nowMs = Date.now();
      if (!isSandboxRunRow(row, { runId, accountId })) {
        return cleanupUnavailable(runId, securityHeaders);
      }
      report = renderSandboxRunReport(row, nowMs);
      if (!isSandboxRunReport(report, { row, nowMs })) {
        return cleanupUnavailable(runId, securityHeaders);
      }
    } catch {
      return cleanupUnavailable(runId, securityHeaders);
    }
    if (row.status === SANDBOX_RUN_STATUS.RELEASED) return responseJson(report, 200, securityHeaders);
    if (isSandboxRunExpiryOnlyReport(report)) {
      const retryAfter = report.retry_after_seconds;
      return responseJson(report, 202, securityHeaders, { 'Retry-After': String(retryAfter) });
    }
    if (hasSandboxRunOwnershipConflict(report)) return cleanupConflict(runId, securityHeaders);
    return cleanupUnavailable(runId, securityHeaders);
  }

  return null;
}

export async function createSandboxRun(env, ctx, {
  accountId,
  runId,
  instanceId,
  contractVersion = SANDBOX_CONTRACT_VERSION,
  profile = SANDBOX_PROFILE,
  nowMs,
}) {
  const startedAt = Date.now();
  let componentsCompleted = 0;
  let inserted = null;
  let insertAttempted = false;
  let createdAt = nowMs;
  if (!isSandboxRunConfiguration(env)) {
    emitCreateTelemetry(
      env,
      ctx,
      'config_unavailable',
      componentsCompleted,
      createdAt ?? Date.now(),
      startedAt
    );
    return { outcome: 'unavailable' };
  }
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
    const leaseExpiresAt = createdAt + SANDBOX_LEASE_TTL_MS;
    insertAttempted = true;
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

    await requireProvisioningPhase(
      env,
      inserted,
      SANDBOX_PROVISIONING_PHASE.CREATED,
      SANDBOX_PROVISIONING_PHASE.DISPATCH_INTENT,
      createdAt
    );
    const scout = await issueScoutCapability({
      env,
      accountId,
      googleApiKey,
      ownership: sandboxOwnership(inserted, SANDBOX_PROVISIONING_PHASE.DISPATCH_INTENT),
      nowMs: createdAt,
    });
    requireIssued(scout, SANDBOX_COMPONENT.DISPATCH);
    await requireOwnershipAndAdvance(
      env,
      inserted,
      SANDBOX_PROVISIONING_PHASE.DISPATCH_INTENT,
      SANDBOX_PROVISIONING_PHASE.DISPATCH_ACQUIRED,
      createdAt
    );
    componentsCompleted += 1;

    await requireProvisioningPhase(
      env,
      inserted,
      SANDBOX_PROVISIONING_PHASE.DISPATCH_ACQUIRED,
      SANDBOX_PROVISIONING_PHASE.SPL_INTENT,
      createdAt
    );
    const spl = await issueSplCapability({
      env,
      accountId,
      instanceId,
      ownership: sandboxOwnership(inserted, SANDBOX_PROVISIONING_PHASE.SPL_INTENT),
      nowMs: createdAt,
      ctx,
      leaseExpiresAt,
    });
    requireIssued(spl, SANDBOX_COMPONENT.SPL_BINDING);
    await requireOwnershipAndAdvance(
      env,
      inserted,
      SANDBOX_PROVISIONING_PHASE.SPL_INTENT,
      SANDBOX_PROVISIONING_PHASE.SPL_ACQUIRED,
      createdAt
    );
    componentsCompleted += 1;

    await requireProvisioningPhase(
      env,
      inserted,
      SANDBOX_PROVISIONING_PHASE.SPL_ACQUIRED,
      SANDBOX_PROVISIONING_PHASE.SPB_INTENT,
      createdAt
    );
    const spb = await issueSpbCapability({
      env,
      accountId,
      instanceId,
      ownership: sandboxOwnership(inserted, SANDBOX_PROVISIONING_PHASE.SPB_INTENT),
      nowMs: createdAt,
      brokerEndpoint: SANDBOX_BROKER_ENDPOINT,
      ctx,
    });
    requireIssued(spb, SANDBOX_COMPONENT.SPB);
    await requireOwnershipAndAdvance(
      env,
      inserted,
      SANDBOX_PROVISIONING_PHASE.SPB_INTENT,
      SANDBOX_PROVISIONING_PHASE.SPB_ACQUIRED,
      createdAt
    );
    componentsCompleted += 1;

    await requireProvisioningPhase(
      env,
      inserted,
      SANDBOX_PROVISIONING_PHASE.SPB_ACQUIRED,
      SANDBOX_PROVISIONING_PHASE.SPP_INTENT,
      createdAt
    );
    const spp = await issueSppCapability({
      env,
      accountId,
      instanceId,
      ownership: sandboxOwnership(inserted, SANDBOX_PROVISIONING_PHASE.SPP_INTENT),
      nowMs: createdAt,
      ctx,
      consentAckedAt: null,
      consentDisclosureVersion: null,
    });
    requireIssued(spp, SANDBOX_COMPONENT.SPP);
    await requireOwnershipAndAdvance(
      env,
      inserted,
      SANDBOX_PROVISIONING_PHASE.SPP_INTENT,
      SANDBOX_PROVISIONING_PHASE.SPP_ACQUIRED,
      createdAt
    );
    componentsCompleted += 1;

    const body = orderedObject(SANDBOX_CREATE_RESPONSE_KEYS, [
      runId,
      contractVersion,
      profile,
      leaseExpiresAt,
      orderedObject(SANDBOX_CAPABILITIES_KEYS, [
        scout.capability,
        spl.capability,
        spb.capability,
        spp.capability,
      ]),
    ]);
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
          ? SANDBOX_RESIDUAL_CODE.LEASE_EXPIRED_BEFORE_ACTIVATION
          : SANDBOX_RESIDUAL_CODE.ACTIVATION_CAS_LOST
      );
    }

    emitCreateTelemetry(env, ctx, 'created', componentsCompleted, createdAt, startedAt);
    return { outcome: 'created', body };
  } catch (error) {
    if (!inserted) {
      emitCreateTelemetry(
        env,
        ctx,
        insertAttempted ? 'run_insert_failed' : 'baseline_unavailable',
        componentsCompleted,
        createdAt ?? Date.now(),
        startedAt
      );
      return { outcome: 'unavailable' };
    }
    const residualCode = error?.residualCode || SANDBOX_RESIDUAL_CODE.ACTIVATION_CAS_LOST;
    try {
      await requestSandboxRunCleanup(env.DB, { runId, accountId, residualCode, nowMs: Date.now() });
    } catch {
      // The durable run remains discoverable for DELETE or scheduled reconciliation.
    }
    try {
      await reconcileSandboxRun(env, ctx, {
        runId,
        nowMs: Date.now(),
        trigger: SANDBOX_CLEANUP_TRIGGER.POST_FAILURE,
      });
    } catch {
      // A creation failure never becomes a partial credential response.
    }
    emitCreateTelemetry(env, ctx, 'failed', componentsCompleted, createdAt, startedAt);
    return { outcome: 'unavailable' };
  }
}

export async function reconcileSandboxRun(env, ctx, { runId, nowMs, trigger }) {
  if (!SANDBOX_CLEANUP_TRIGGERS.includes(trigger)) throw new TypeError('invalid sandbox cleanup trigger');
  const startedAt = Date.now();
  let run = await findSandboxRunById(env.DB, runId);
  if (!run) return { outcome: 'not_found', row: null };
  if (run.status === SANDBOX_RUN_STATUS.RELEASED) return { outcome: 'released', row: run };

  if (run.status === SANDBOX_RUN_STATUS.PROVISIONING || run.status === SANDBOX_RUN_STATUS.ACTIVE) {
    const residualCode = trigger === SANDBOX_CLEANUP_TRIGGER.SCHEDULED
      ? SANDBOX_RESIDUAL_CODE.LEASE_EXPIRED
      : null;
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
    return { outcome: row?.status === SANDBOX_RUN_STATUS.RELEASED ? 'released' : 'failed', row };
  }

  const accountId = run.account_id;
  const instanceId = run.instance_id;
  const componentResults = new Map();
  await bestEffortPhase(env, run, SANDBOX_CLEANUP_PHASE.DENY_INTENT, nowMs);

  componentResults.set(SANDBOX_COMPONENT.DISPATCH, await releaseLocalComponent({
    env,
    component: SANDBOX_COMPONENT.DISPATCH,
    release: () => releaseSandboxDispatchTokens(env, {
      sandboxRunId: runId,
      accountId,
      nowMs,
    }),
    releaseFailed: SANDBOX_RESIDUAL_CODE.DISPATCH_RELEASE_FAILED,
    ownershipConflict: SANDBOX_RESIDUAL_CODE.DISPATCH_OWNERSHIP_CONFLICT,
    run,
    nowMs,
  }));
  componentResults.set(SANDBOX_COMPONENT.SPP, await releaseLocalComponent({
    env,
    component: SANDBOX_COMPONENT.SPP,
    release: () => releaseSandboxSppBinding(env, {
      sandboxRunId: runId,
      accountId,
      instanceId,
    }),
    releaseFailed: SANDBOX_RESIDUAL_CODE.SPP_RELEASE_FAILED,
    ownershipConflict: SANDBOX_RESIDUAL_CODE.SPP_OWNERSHIP_CONFLICT,
    run,
    nowMs,
  }));
  componentResults.set(SANDBOX_COMPONENT.SPB, await denySpbComponent(env, ctx, run, nowMs));
  await bestEffortPhase(env, run, SANDBOX_CLEANUP_PHASE.DENIED, nowMs);

  const beforeRelay = await safeLocalPostconditions(env, run);
  if (bindingConflicts(beforeRelay?.spl_account_id, beforeRelay?.spl_sandbox_run_id, run)) {
    componentResults.set(SANDBOX_COMPONENT.SPL_BINDING, await persistComponent(
      env,
      run,
      SANDBOX_COMPONENT.SPL_BINDING,
      SANDBOX_COMPONENT_STATE.CLEANUP_FAILED,
      SANDBOX_RESIDUAL_CODE.SPL_OWNERSHIP_CONFLICT,
      nowMs
    ));
  }
  await bestEffortPhase(env, run, SANDBOX_CLEANUP_PHASE.RELAY_INTENT, nowMs);
  const relay = await retireRelayComponent(env, run, beforeRelay, nowMs);
  componentResults.set(SANDBOX_COMPONENT.SPL_RELAY, relay);
  if (relay.state === SANDBOX_COMPONENT_STATE.RELEASED) {
    await bestEffortPhase(env, run, SANDBOX_CLEANUP_PHASE.RELAY_RETIRED, nowMs);
  }

  if (relay.state === SANDBOX_COMPONENT_STATE.RELEASED
    && !componentResults.has(SANDBOX_COMPONENT.SPL_BINDING)) {
    componentResults.set(SANDBOX_COMPONENT.SPL_BINDING, await releaseLocalComponent({
      env,
      component: SANDBOX_COMPONENT.SPL_BINDING,
      release: () => releaseSandboxSplBinding(env, {
        sandboxRunId: runId,
        accountId,
        instanceId,
      }),
      releaseFailed: SANDBOX_RESIDUAL_CODE.SPL_RELEASE_FAILED,
      ownershipConflict: SANDBOX_RESIDUAL_CODE.SPL_OWNERSHIP_CONFLICT,
      run,
      nowMs,
    }));
  } else {
    componentResults.set(SANDBOX_COMPONENT.SPL_BINDING, {
      state: SANDBOX_COMPONENT_STATE.DENY_PENDING,
      residual: null,
    });
  }

  await bestEffortPhase(env, run, SANDBOX_CLEANUP_PHASE.SPB_EXPIRY, nowMs);
  const spbCleanup = await cleanupSpbComponent(
    env,
    ctx,
    run,
    componentResults.get(SANDBOX_COMPONENT.SPB),
    nowMs
  );
  componentResults.set(SANDBOX_COMPONENT.SPB, spbCleanup);
  await bestEffortPhase(env, run, SANDBOX_CLEANUP_PHASE.SPB_PURGE, nowMs);
  await bestEffortPhase(env, run, SANDBOX_CLEANUP_PHASE.VERIFY, nowMs);

  const local = await safeLocalPostconditions(env, run);
  await verifyLocalComponents(env, run, componentResults, local, nowMs);
  run = await findSandboxRunById(env.DB, runId);

  let outcome;
  if (local?.account_present === 1 && allComponentsReleased(run)) {
    run = await releaseSandboxRun(env.DB, { runId, accountId, nowMs }) || run;
    outcome = run.status === SANDBOX_RUN_STATUS.RELEASED ? 'released' : 'failed';
  } else if (isStoredExpiryOnly(run)) {
    run = await setSandboxRunCleanupDisposition(env.DB, {
      runId,
      accountId,
      status: SANDBOX_RUN_STATUS.EXPIRY_PENDING,
      residualCode: SANDBOX_RESIDUAL_CODE.SPB_CREDENTIAL_EXPIRY_PENDING,
      nowMs,
    }) || run;
    outcome = 'pending';
  } else {
    const residualCode = firstResidual(run) || (local
      ? SANDBOX_RESIDUAL_CODE.ACCOUNT_MISSING
      : SANDBOX_RESIDUAL_CODE.RELAY_FAILED);
    run = await setSandboxRunCleanupDisposition(env.DB, {
      runId,
      accountId,
      status: SANDBOX_RUN_STATUS.CLEANUP_FAILED,
      residualCode,
      nowMs,
    }) || run;
    outcome = hasStoredOwnershipConflict(run) ? 'conflict' : 'failed';
  }

  emitCleanupTelemetry(env, ctx, trigger, outcome, run, nowMs, startedAt);
  return { outcome, row: run };
}

export async function reconcileExpiredSandboxRuns(env, ctx, { nowMs = Date.now() } = {}) {
  const startedAt = Date.now();
  const runs = await listSandboxRunsForReconciliation(env.DB, { nowMs });
  if (runs.length > SANDBOX_RECONCILE_BATCH_SIZE) {
    throw new Error('sandbox reconciliation batch exceeded its fixed bound');
  }
  const counts = {
    runs_examined: runs.length,
    runs_advanced: 0,
    runs_released: 0,
    runs_failed: 0,
    runs_skipped_for_retry: 0,
  };

  for (const run of runs) {
    if (isSandboxRunRetryDeferred(run, nowMs)) {
      counts.runs_skipped_for_retry += 1;
      continue;
    }
    try {
      const result = await reconcileSandboxRun(env, ctx, {
        runId: run.run_id,
        nowMs,
        trigger: SANDBOX_CLEANUP_TRIGGER.SCHEDULED,
      });
      counts.runs_advanced += 1;
      if (result.outcome === 'released') counts.runs_released += 1;
      else if (result.outcome === 'failed' || result.outcome === 'conflict') counts.runs_failed += 1;
    } catch {
      counts.runs_failed += 1;
    }
  }

  const event = {
    event: 'sandbox_run_reconcile_batch',
    ...counts,
    duration_ms: Math.max(0, Date.now() - startedAt),
    ts: nowMs,
  };
  console.warn(JSON.stringify(event));
  emitSecurityEvent(env, ctx, {
    type: event.event,
    tier: 'T4',
    ...counts,
  });
  return counts;
}

function configuredSandboxAccountId(env) {
  return isCanonicalUuid(env.SANDBOX_ACCOUNT_ID) ? env.SANDBOX_ACCOUNT_ID : null;
}

function isSandboxRunRetryDeferred(run, nowMs) {
  return run?.spb_state === SANDBOX_COMPONENT_STATE.PURGE_PENDING
    && run?.spb_residual_code === SANDBOX_RESIDUAL_CODE.SPB_CREDENTIAL_EXPIRY_PENDING
    && Number.isSafeInteger(run.spb_retry_not_before)
    && nowMs < run.spb_retry_not_before;
}

async function readCreateInput(request) {
  let value;
  try {
    value = await request.json();
  } catch {
    return null;
  }
  return isSandboxRunCreateInput(value) ? value : null;
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
  if (!advanced) throw creationFailure(SANDBOX_RESIDUAL_CODE.ACTIVATION_CAS_LOST);
}

async function requireOwnershipAndAdvance(env, run, fromPhase, toPhase, nowMs) {
  const owned = await findSandboxRunProvisioningOwnership(env.DB, {
    runId: run.run_id,
    accountId: run.account_id,
    instanceId: run.instance_id,
    expectedPhase: fromPhase,
  });
  if (!owned) throw creationFailure(SANDBOX_RESIDUAL_CODE.ACTIVATION_CAS_LOST);
  await requireProvisioningPhase(env, run, fromPhase, toPhase, nowMs);
}

function requireIssued(result, component) {
  if (result?.outcome === 'issued') return;
  if (result?.outcome === 'run_fence_lost') {
    throw creationFailure(SANDBOX_RESIDUAL_CODE.ACTIVATION_CAS_LOST);
  }
  if (component === SANDBOX_COMPONENT.DISPATCH) {
    throw creationFailure(result?.outcome === 'ownership_conflict'
      ? SANDBOX_RESIDUAL_CODE.DISPATCH_OWNERSHIP_CONFLICT
      : SANDBOX_RESIDUAL_CODE.DISPATCH_ISSUE_FAILED);
  }
  if (component === SANDBOX_COMPONENT.SPL_BINDING) {
    if (result?.outcome === 'grant_failed') {
      throw creationFailure(SANDBOX_RESIDUAL_CODE.SPL_GRANT_FAILED);
    }
    throw creationFailure(result?.outcome === 'ownership_conflict'
      ? SANDBOX_RESIDUAL_CODE.SPL_OWNERSHIP_CONFLICT
      : SANDBOX_RESIDUAL_CODE.SPL_ISSUE_FAILED);
  }
  if (component === SANDBOX_COMPONENT.SPB) {
    throw creationFailure(result?.outcome === 'ownership_conflict'
      ? SANDBOX_RESIDUAL_CODE.SPB_OWNERSHIP_CONFLICT
      : SANDBOX_RESIDUAL_CODE.SPB_ISSUE_FAILED);
  }
  throw creationFailure(result?.outcome === 'ownership_conflict'
    ? SANDBOX_RESIDUAL_CODE.SPP_OWNERSHIP_CONFLICT
    : SANDBOX_RESIDUAL_CODE.SPP_ISSUE_FAILED);
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
  if (run[`${component}_state`] === SANDBOX_COMPONENT_STATE.RELEASED) {
    return { state: SANDBOX_COMPONENT_STATE.RELEASED, residual: null };
  }
  try {
    const result = await release();
    if (result.outcome === 'ownership_conflict') {
      return persistComponent(
        env,
        run,
        component,
        SANDBOX_COMPONENT_STATE.CLEANUP_FAILED,
        ownershipConflict,
        nowMs
      );
    }
    return persistComponent(env, run, component, SANDBOX_COMPONENT_STATE.VERIFY_PENDING, null, nowMs);
  } catch {
    return persistComponent(
      env,
      run,
      component,
      SANDBOX_COMPONENT_STATE.CLEANUP_FAILED,
      releaseFailed,
      nowMs
    );
  }
}

async function denySpbComponent(env, ctx, run, nowMs) {
  if (run.spb_state === SANDBOX_COMPONENT_STATE.RELEASED) {
    return { state: SANDBOX_COMPONENT_STATE.RELEASED, residual: null };
  }
  try {
    const result = await denySpbSandboxBinding(env, ctx, {
      sandboxRunId: run.run_id,
      accountId: run.account_id,
      instanceId: run.instance_id,
      nowMs,
    });
    if (result.outcome === 'ownership_conflict') {
      return persistComponent(
        env,
        run,
        SANDBOX_COMPONENT.SPB,
        SANDBOX_COMPONENT_STATE.CLEANUP_FAILED,
        SANDBOX_RESIDUAL_CODE.SPB_OWNERSHIP_CONFLICT,
        nowMs
      );
    }
    return persistComponent(
      env,
      run,
      SANDBOX_COMPONENT.SPB,
      SANDBOX_COMPONENT_STATE.PURGE_PENDING,
      null,
      nowMs
    );
  } catch {
    return persistComponent(
      env,
      run,
      SANDBOX_COMPONENT.SPB,
      SANDBOX_COMPONENT_STATE.CLEANUP_FAILED,
      SANDBOX_RESIDUAL_CODE.SPB_DENIAL_FAILED,
      nowMs
    );
  }
}

async function retireRelayComponent(env, run, local, nowMs) {
  if (run.spl_relay_state === SANDBOX_COMPONENT_STATE.RELEASED) {
    return { state: SANDBOX_COMPONENT_STATE.RELEASED, residual: null };
  }
  if (bindingConflicts(local?.spl_account_id, local?.spl_sandbox_run_id, run)) {
    return persistComponent(
      env,
      run,
      SANDBOX_COMPONENT.SPL_RELAY,
      SANDBOX_COMPONENT_STATE.CLEANUP_FAILED,
      SANDBOX_RESIDUAL_CODE.RELAY_FAILED,
      nowMs
    );
  }
  const splAttempted = phaseAtLeast(run.provisioning_phase, SANDBOX_PROVISIONING_PHASE.SPL_INTENT);
  const exactBinding = bindingMatches(local?.spl_account_id, local?.spl_sandbox_run_id, run);
  if (!splAttempted && !exactBinding && local?.account_present === 1) {
    return persistComponent(
      env,
      run,
      SANDBOX_COMPONENT.SPL_RELAY,
      SANDBOX_COMPONENT_STATE.RELEASED,
      null,
      nowMs
    );
  }
  try {
    const result = await retireRelayInstance(env, { instanceId: run.instance_id });
    if (result.outcome === 'retired') {
      return persistComponent(
        env,
        run,
        SANDBOX_COMPONENT.SPL_RELAY,
        SANDBOX_COMPONENT_STATE.RELEASED,
        null,
        nowMs
      );
    }
    if (result.outcome === 'retryable_residual') {
      const residual = SANDBOX_RELAY_RESIDUALS[result.failedComponent]
        || SANDBOX_RESIDUAL_CODE.RELAY_FAILED;
      return persistComponent(
        env,
        run,
        SANDBOX_COMPONENT.SPL_RELAY,
        SANDBOX_COMPONENT_STATE.CLEANUP_FAILED,
        residual,
        nowMs
      );
    }
    return persistComponent(
      env,
      run,
      SANDBOX_COMPONENT.SPL_RELAY,
      SANDBOX_COMPONENT_STATE.CLEANUP_FAILED,
      SANDBOX_RESIDUAL_CODE.RELAY_FAILED,
      nowMs
    );
  } catch {
    return persistComponent(
      env,
      run,
      SANDBOX_COMPONENT.SPL_RELAY,
      SANDBOX_COMPONENT_STATE.CLEANUP_FAILED,
      SANDBOX_RESIDUAL_CODE.RELAY_FAILED,
      nowMs
    );
  }
}

async function cleanupSpbComponent(env, ctx, run, denial, nowMs) {
  if (denial.state === SANDBOX_COMPONENT_STATE.RELEASED) return denial;
  if (denial.residual) return denial;
  const local = await safeLocalPostconditions(env, run);
  if (
    !phaseAtLeast(run.provisioning_phase, SANDBOX_PROVISIONING_PHASE.SPB_INTENT)
    && !bindingMatches(local?.spb_account_id, local?.spb_sandbox_run_id, run)
    && local?.account_present === 1
  ) {
    return persistComponent(
      env,
      run,
      SANDBOX_COMPONENT.SPB,
      SANDBOX_COMPONENT_STATE.VERIFY_PENDING,
      null,
      nowMs
    );
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
        return persistComponent(
          env,
          run,
          SANDBOX_COMPONENT.SPB,
          SANDBOX_COMPONENT_STATE.CLEANUP_FAILED,
          SANDBOX_RESIDUAL_CODE.SPB_CLEANUP_RETRYABLE,
          nowMs
        );
      }
      return persistComponent(
        env,
        run,
        SANDBOX_COMPONENT.SPB,
        SANDBOX_COMPONENT_STATE.PURGE_PENDING,
        SANDBOX_RESIDUAL_CODE.SPB_CREDENTIAL_EXPIRY_PENDING,
        nowMs
      );
    }
    if (result.outcome === 'cleaned') {
      return persistComponent(
        env,
        run,
        SANDBOX_COMPONENT.SPB,
        SANDBOX_COMPONENT_STATE.VERIFY_PENDING,
        null,
        nowMs
      );
    }
    if (
      result.outcome === 'absent'
      && local?.account_present === 1
      && !phaseAtLeast(run.provisioning_phase, SANDBOX_PROVISIONING_PHASE.SPB_ACQUIRED)
    ) {
      // No binding means no broker credential or R2 object was visible while the
      // account still existed. Activation is later than spb_acquired, so this run
      // never returned credentials. Keep the result reversible until the fresh
      // local postcondition below proves the account and instance are still safe.
      return persistComponent(
        env,
        run,
        SANDBOX_COMPONENT.SPB,
        SANDBOX_COMPONENT_STATE.VERIFY_PENDING,
        null,
        nowMs
      );
    }
    const residual = SANDBOX_SPB_CLEANUP_OUTCOME_RESIDUALS[result.outcome]
      || SANDBOX_RESIDUAL_CODE.SPB_CLEANUP_RETRYABLE;
    return persistComponent(
      env,
      run,
      SANDBOX_COMPONENT.SPB,
      SANDBOX_COMPONENT_STATE.CLEANUP_FAILED,
      residual,
      nowMs
    );
  } catch {
    return persistComponent(
      env,
      run,
      SANDBOX_COMPONENT.SPB,
      SANDBOX_COMPONENT_STATE.CLEANUP_FAILED,
      SANDBOX_RESIDUAL_CODE.SPB_CLEANUP_RETRYABLE,
      nowMs
    );
  }
}

async function verifyLocalComponents(env, run, results, local, nowMs) {
  if (!local) return;
  const accountPresent = local.account_present === 1;
  if (!accountPresent) {
    await persistComponent(
      env,
      run,
      SANDBOX_COMPONENT.DISPATCH,
      SANDBOX_COMPONENT_STATE.CLEANUP_FAILED,
      SANDBOX_RESIDUAL_CODE.ACCOUNT_MISSING,
      nowMs
    );
    await persistComponent(
      env,
      run,
      SANDBOX_COMPONENT.SPP,
      SANDBOX_COMPONENT_STATE.CLEANUP_FAILED,
      SANDBOX_RESIDUAL_CODE.ACCOUNT_MISSING,
      nowMs
    );
    await persistComponent(
      env,
      run,
      SANDBOX_COMPONENT.SPL_BINDING,
      SANDBOX_COMPONENT_STATE.CLEANUP_FAILED,
      SANDBOX_RESIDUAL_CODE.ACCOUNT_MISSING,
      nowMs
    );
    if (results.get(SANDBOX_COMPONENT.SPB)?.state !== SANDBOX_COMPONENT_STATE.CLEANUP_FAILED) {
      await persistComponent(
        env,
        run,
        SANDBOX_COMPONENT.SPB,
        SANDBOX_COMPONENT_STATE.CLEANUP_FAILED,
        SANDBOX_RESIDUAL_CODE.SPB_LIFECYCLE_ABSENT,
        nowMs
      );
    }
    return;
  }

  if (!results.get(SANDBOX_COMPONENT.DISPATCH)?.residual) {
    const residual = Number(local.dispatch_conflict_count) > 0
      ? SANDBOX_RESIDUAL_CODE.DISPATCH_OWNERSHIP_CONFLICT
      : Number(local.dispatch_active_count) === 0
        ? null
        : SANDBOX_RESIDUAL_CODE.DISPATCH_RELEASE_FAILED;
    await persistComponent(
      env,
      run,
      SANDBOX_COMPONENT.DISPATCH,
      residual ? SANDBOX_COMPONENT_STATE.CLEANUP_FAILED : SANDBOX_COMPONENT_STATE.RELEASED,
      residual,
      nowMs
    );
  }

  if (!results.get(SANDBOX_COMPONENT.SPP)?.residual) {
    const residual = bindingResidual(
      local.spp_account_id,
      local.spp_sandbox_run_id,
      run,
      SANDBOX_COMPONENT.SPP
    );
    await persistComponent(
      env,
      run,
      SANDBOX_COMPONENT.SPP,
      residual ? SANDBOX_COMPONENT_STATE.CLEANUP_FAILED : SANDBOX_COMPONENT_STATE.RELEASED,
      residual,
      nowMs
    );
  }

  const spb = results.get(SANDBOX_COMPONENT.SPB);
  if (!spb?.residual || spb.residual === SANDBOX_RESIDUAL_CODE.SPB_CREDENTIAL_EXPIRY_PENDING) {
    if (spb?.residual === SANDBOX_RESIDUAL_CODE.SPB_CREDENTIAL_EXPIRY_PENDING) {
      await persistComponent(
        env,
        run,
        SANDBOX_COMPONENT.SPB,
        SANDBOX_COMPONENT_STATE.PURGE_PENDING,
        spb.residual,
        nowMs
      );
    } else {
      const residual = bindingResidual(
        local.spb_account_id,
        local.spb_sandbox_run_id,
        run,
        SANDBOX_COMPONENT.SPB
      );
      await persistComponent(
        env,
        run,
        SANDBOX_COMPONENT.SPB,
        residual ? SANDBOX_COMPONENT_STATE.CLEANUP_FAILED : SANDBOX_COMPONENT_STATE.RELEASED,
        residual,
        nowMs
      );
    }
  }

  if (results.get(SANDBOX_COMPONENT.SPL_RELAY)?.state === SANDBOX_COMPONENT_STATE.RELEASED
    && !results.get(SANDBOX_COMPONENT.SPL_BINDING)?.residual) {
    const residual = bindingResidual(
      local.spl_account_id,
      local.spl_sandbox_run_id,
      run,
      SANDBOX_COMPONENT.SPL_BINDING
    );
    await persistComponent(
      env,
      run,
      SANDBOX_COMPONENT.SPL_BINDING,
      residual ? SANDBOX_COMPONENT_STATE.CLEANUP_FAILED : SANDBOX_COMPONENT_STATE.RELEASED,
      residual,
      nowMs
    );
  }
}

function bindingResidual(accountId, sandboxRunId, run, component) {
  if (accountId === null || accountId === undefined) return null;
  if (accountId === run.account_id && sandboxRunId === run.run_id) {
    return SANDBOX_COMPONENT_RELEASE_FAILURE_RESIDUALS[component];
  }
  return SANDBOX_COMPONENT_OWNERSHIP_RESIDUALS[component];
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
    return {
      state: SANDBOX_COMPONENT_STATE.CLEANUP_FAILED,
      residual: residual || SANDBOX_COMPONENT_FAILURE_RESIDUALS[component],
    };
  }
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
  return SANDBOX_PROVISIONING_PHASES.indexOf(actual) >= SANDBOX_PROVISIONING_PHASES.indexOf(expected);
}

function allComponentsReleased(run) {
  return SANDBOX_COMPONENTS.every((component) => (
    run?.[component.state_column] === SANDBOX_COMPONENT_STATE.RELEASED
  ));
}

function isStoredExpiryOnly(run) {
  return run?.dispatch_state === SANDBOX_COMPONENT_STATE.RELEASED
    && run?.spp_state === SANDBOX_COMPONENT_STATE.RELEASED
    && run?.spb_state === SANDBOX_COMPONENT_STATE.PURGE_PENDING
    && run?.spb_residual_code === SANDBOX_RESIDUAL_CODE.SPB_CREDENTIAL_EXPIRY_PENDING
    && run?.spl_relay_state === SANDBOX_COMPONENT_STATE.RELEASED
    && run?.spl_binding_state === SANDBOX_COMPONENT_STATE.RELEASED;
}

function firstResidual(run) {
  return SANDBOX_COMPONENTS.map((component) => run?.[component.residual_column]).find(Boolean)
    || run?.last_residual_code
    || null;
}

function hasStoredOwnershipConflict(run) {
  return SANDBOX_COMPONENTS.some((component) => (
    run?.[component.residual_column]?.endsWith('_ownership_conflict')
  ));
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
  for (const component of SANDBOX_COMPONENTS) {
    const state = run?.[component.state_column];
    const residual = run?.[component.residual_column];
    if (state === SANDBOX_COMPONENT_STATE.RELEASED) counts.components_released += 1;
    else if (residual?.endsWith('_ownership_conflict')) counts.components_conflicted += 1;
    else if (state === SANDBOX_COMPONENT_STATE.CLEANUP_FAILED) counts.components_failed += 1;
    else if (state === SANDBOX_COMPONENT_STATE.ACTIVE) counts.components_active += 1;
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
  return serializedJson(JSON.stringify(body), status, securityHeaders, extraHeaders);
}

function serializedJson(body, status, securityHeaders, extraHeaders = {}) {
  const headers = new Headers(securityHeaders);
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', 'no-store');
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);
  return new Response(body, { status, headers });
}

function invalidRequest(headers) {
  return responseJson(
    sandboxRunErrorBody(SANDBOX_ERROR.INVALID_REQUEST),
    SANDBOX_ERROR.INVALID_REQUEST.status,
    headers
  );
}

function conflict(runId, headers) {
  return responseJson(
    sandboxRunErrorBody(SANDBOX_ERROR.CONFLICT, runId),
    SANDBOX_ERROR.CONFLICT.status,
    headers
  );
}

function unavailable(runId, headers) {
  return responseJson(
    sandboxRunErrorBody(SANDBOX_ERROR.UNAVAILABLE, runId),
    SANDBOX_ERROR.UNAVAILABLE.status,
    headers
  );
}

function cleanupConflict(runId, headers) {
  return responseJson(
    sandboxRunErrorBody(SANDBOX_ERROR.CLEANUP_CONFLICT, runId),
    SANDBOX_ERROR.CLEANUP_CONFLICT.status,
    headers
  );
}

function cleanupUnavailable(runId, headers) {
  return responseJson(
    sandboxRunErrorBody(SANDBOX_ERROR.CLEANUP_UNAVAILABLE, runId),
    SANDBOX_ERROR.CLEANUP_UNAVAILABLE.status,
    headers
  );
}

function sandboxRunNotFound(runId, headers) {
  return responseJson(
    sandboxRunErrorBody(SANDBOX_ERROR.NOT_FOUND, runId),
    SANDBOX_ERROR.NOT_FOUND.status,
    headers
  );
}
