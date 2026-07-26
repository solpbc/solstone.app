import { generateSessionToken, hashWithPepper } from './crypto.js';
import {
  deleteSpbSandboxTombstone,
  denySpbSandboxBindingOwnership,
  findSpbSandboxLifecycleByInstance,
  insertSpbSandboxAudit,
  upsertSpbBinding,
} from './db.js';
import { emitSecurityEvent } from './hub.js';
import { mintSandboxMaintenanceCredential } from './r2-credential.js';
import { requireCanonicalUuids } from './sandbox-identifiers.js';
import { listMultipartUploads, listObjectsV2 } from './s3.js';
import { drainMultipartUploads, drainObjects } from './spb-drain.js';
import { prefixFor } from './spb-broker.js';

const MAX_JOINT_PASSES = 3;
const MAX_MAINTENANCE_CREDENTIALS = 6;
const CREDENTIAL_REFRESH_WINDOW_MS = 5_000;

export async function claimSpbSandboxBinding(env, {
  sandboxRunId,
  accountId,
  instanceId,
  nowMs = Date.now(),
}) {
  requireCanonicalUuids(sandboxRunId, accountId, instanceId);
  const credential = generateSessionToken();
  const tokenHash = await hashWithPepper(credential, env);
  const row = await upsertSpbBinding(env.DB, {
    accountId,
    instanceId,
    tokenHash,
    nowMs,
    sandboxRunId,
  });
  return row
    ? { outcome: 'claimed', credential }
    : { outcome: 'ownership_conflict' };
}

export async function denySpbSandboxBinding(env, ctx, {
  sandboxRunId,
  accountId,
  instanceId,
  nowMs = Date.now(),
}) {
  requireCanonicalUuids(sandboxRunId, accountId, instanceId);

  let outcome;
  try {
    const denied = await denySpbSandboxBindingOwnership(env.DB, {
      accountId,
      instanceId,
      sandboxRunId,
      sandboxDeniedAt: nowMs,
    });
    if (denied) {
      outcome = 'released';
    } else {
      const incumbent = await findSpbSandboxLifecycleByInstance(env.DB, instanceId);
      if (!incumbent) {
        outcome = 'absent';
      } else if (
        incumbent.account_id === accountId
        && incumbent.sandbox_run_id === sandboxRunId
        && incumbent.sandbox_denied_at !== null
      ) {
        outcome = 'absent';
      } else {
        outcome = 'ownership_conflict';
      }
    }
    await recordDenial(env, ctx, { outcome, nowMs });
    return { outcome };
  } catch {
    try {
      await recordDenial(env, ctx, { outcome: 'internal_error', nowMs });
    } catch {
      // Denial never reports success without durable evidence.
    }
    throw namedError('SpbSandboxDenialError');
  }
}

export async function cleanupSpbSandboxBinding(env, ctx, {
  sandboxRunId,
  accountId,
  instanceId,
  nowMs = Date.now(),
}) {
  requireCanonicalUuids(sandboxRunId, accountId, instanceId);
  const startMs = Date.now();
  const progress = {
    credentialsMinted: 0,
    objectsDeleted: 0,
    multipartAborted: 0,
  };

  let lifecycle;
  try {
    lifecycle = await findSpbSandboxLifecycleByInstance(env.DB, instanceId);
  } catch {
    return finishRetryable(env, ctx, { progress, nowMs, startMs });
  }
  if (!lifecycle) {
    return finishCleanupOutcome(env, ctx, {
      outcome: 'absent',
      progress,
      nowMs,
      startMs,
    });
  }
  if (
    lifecycle.account_id !== accountId
    || lifecycle.sandbox_run_id !== sandboxRunId
  ) {
    return finishCleanupOutcome(env, ctx, {
      outcome: 'ownership_conflict',
      progress,
      nowMs,
      startMs,
    });
  }
  if (lifecycle.sandbox_denied_at === null) {
    return finishCleanupOutcome(env, ctx, {
      outcome: 'denial_required',
      progress,
      nowMs,
      startMs,
    });
  }
  if (
    lifecycle.sandbox_credential_expires_at !== null
    && nowMs < lifecycle.sandbox_credential_expires_at
  ) {
    const retryAfterSeconds = Math.ceil(
      (lifecycle.sandbox_credential_expires_at - nowMs) / 1000
    );
    emitCleanupTelemetry(env, ctx, {
      outcome: 'credential_expiry_pending',
      progress,
      retryAfterSeconds,
      nowMs,
      startMs,
    });
    return {
      outcome: 'credential_expiry_pending',
      retry_after_seconds: retryAfterSeconds,
    };
  }

  const prefix = prefixFor(accountId, instanceId);
  let drainCredential = null;
  let drainCredentialExpiresAt = 0;

  async function mintRequestCredential() {
    if (progress.credentialsMinted >= MAX_MAINTENANCE_CREDENTIALS) {
      throw namedError('SpbSandboxCredentialLimitError');
    }
    progress.credentialsMinted += 1;
    const mintNowMs = Date.now();
    const credential = await mintSandboxMaintenanceCredential(env, {
      prefix,
      nowSeconds: Math.floor(mintNowMs / 1000),
    });
    return {
      credential,
      expiresAt: (credential.nowSeconds + credential.ttl) * 1000,
    };
  }

  async function getRequestAuth() {
    const requestNowMs = Date.now();
    if (
      !drainCredential
      || drainCredentialExpiresAt - requestNowMs < CREDENTIAL_REFRESH_WINDOW_MS
    ) {
      const minted = await mintRequestCredential();
      drainCredential = minted.credential;
      drainCredentialExpiresAt = minted.expiresAt;
    }
    return { credential: drainCredential, nowMs: Date.now() };
  }

  try {
    for (let pass = 0; pass < MAX_JOINT_PASSES; pass += 1) {
      drainCredential = null;
      drainCredentialExpiresAt = 0;
      await drainObjects(env, {
        prefix,
        getRequestAuth,
        onDeleted(count) {
          progress.objectsDeleted += count;
        },
      });
      await drainMultipartUploads(env, {
        prefix,
        getRequestAuth,
        onAborted(count) {
          progress.multipartAborted += count;
        },
      });

      const verifier = await mintRequestCredential();
      // Multipart must be read first: after it is empty, no remaining upload can
      // commit an object that escapes the later object readback.
      const multipartReadback = await listMultipartUploads(env, verifier.credential, {
        prefix,
        nowMs: Date.now(),
      });
      const objectReadback = await listObjectsV2(env, verifier.credential, {
        prefix,
        maxKeys: 1,
        nowMs: Date.now(),
      });
      if (
        !multipartReadback.isTruncated
        && multipartReadback.uploads.length === 0
        && !objectReadback.isTruncated
        && objectReadback.keys.length === 0
      ) {
        return finishVerifiedCleanup(env, ctx, {
          lifecycle,
          sandboxRunId,
          accountId,
          instanceId,
          progress,
          nowMs,
          startMs,
        });
      }
    }
  } catch {
    // The tombstone remains authoritative. Completed R2 deletes/aborts are
    // idempotent progress; a retry re-lists source state and converges.
    return finishRetryable(env, ctx, { progress, nowMs, startMs });
  }

  return finishRetryable(env, ctx, { progress, nowMs, startMs });
}

async function recordDenial(env, ctx, { outcome, nowMs }) {
  await insertSpbSandboxAudit(env.DB, {
    event: 'denial',
    outcome,
    scope: null,
    ttl: null,
    credentialsMinted: null,
    objectsDeleted: null,
    multipartAborted: null,
    ts: nowMs,
  });
  const bindingsDenied = outcome === 'released' ? 1 : 0;
  console.warn(JSON.stringify({
    event: 'spb_sandbox_denial',
    outcome,
    bindings_denied: bindingsDenied,
    ts: nowMs,
  }));
  emitSecurityEvent(env, ctx, {
    type: 'spb_sandbox_denial',
    tier: 'T4',
    outcome,
    bindings_denied: bindingsDenied,
  });
}

async function finishVerifiedCleanup(env, ctx, {
  lifecycle,
  sandboxRunId,
  accountId,
  instanceId,
  progress,
  nowMs,
  startMs,
}) {
  try {
    await insertCleanupAudit(env, { outcome: 'cleaned', progress, nowMs });
  } catch {
    return finishRetryable(env, ctx, {
      progress,
      nowMs,
      startMs,
    });
  }

  let deleted;
  try {
    deleted = await deleteSpbSandboxTombstone(env.DB, {
      accountId,
      instanceId,
      sandboxRunId,
      sandboxDeniedAt: lifecycle.sandbox_denied_at,
    });
  } catch {
    return finishRetryable(env, ctx, {
      progress,
      nowMs,
      startMs,
    });
  }
  if (deleted) {
    emitCleanupTelemetry(env, ctx, {
      outcome: 'cleaned',
      progress,
      retryAfterSeconds: 0,
      nowMs,
      startMs,
    });
    return { outcome: 'cleaned' };
  }

  let incumbent;
  try {
    incumbent = await findSpbSandboxLifecycleByInstance(env.DB, instanceId);
  } catch {
    return finishRetryable(env, ctx, {
      progress,
      nowMs,
      startMs,
    });
  }
  const outcome = incumbent ? 'ownership_conflict' : 'absent';
  try {
    await insertCleanupAudit(env, { outcome, progress, nowMs });
  } catch {
    return finishRetryable(env, ctx, {
      progress,
      nowMs,
      startMs,
    });
  }
  emitCleanupTelemetry(env, ctx, {
    outcome,
    progress,
    retryAfterSeconds: 0,
    nowMs,
    startMs,
  });
  return { outcome };
}

async function finishCleanupOutcome(env, ctx, {
  outcome,
  progress,
  nowMs,
  startMs,
}) {
  try {
    await insertCleanupAudit(env, { outcome, progress, nowMs });
  } catch {
    return finishRetryable(env, ctx, {
      progress,
      nowMs,
      startMs,
    });
  }
  emitCleanupTelemetry(env, ctx, {
    outcome,
    progress,
    retryAfterSeconds: 0,
    nowMs,
    startMs,
  });
  return { outcome };
}

async function finishRetryable(env, ctx, {
  progress,
  nowMs,
  startMs,
}) {
  try {
    await insertCleanupAudit(env, { outcome: 'retryable', progress, nowMs });
  } catch {
    // The tombstone still preserves retryability when D1 audit storage is unavailable.
  }
  emitCleanupTelemetry(env, ctx, {
    outcome: 'retryable',
    progress,
    retryAfterSeconds: 0,
    nowMs,
    startMs,
  });
  return { outcome: 'retryable' };
}

function insertCleanupAudit(env, { outcome, progress, nowMs }) {
  return insertSpbSandboxAudit(env.DB, {
    event: 'cleanup',
    outcome,
    scope: null,
    ttl: null,
    credentialsMinted: progress.credentialsMinted,
    objectsDeleted: progress.objectsDeleted,
    multipartAborted: progress.multipartAborted,
    ts: nowMs,
  });
}

function emitCleanupTelemetry(env, ctx, {
  outcome,
  progress,
  retryAfterSeconds,
  nowMs,
  startMs,
}) {
  console.warn(JSON.stringify({
    event: 'spb_sandbox_cleanup',
    outcome,
    credentials_minted: progress.credentialsMinted,
    objects_deleted: progress.objectsDeleted,
    multipart_aborted: progress.multipartAborted,
    retry_after_seconds: retryAfterSeconds,
    duration_ms: Math.max(0, Date.now() - startMs),
    ts: nowMs,
  }));
  emitSecurityEvent(env, ctx, {
    type: 'spb_sandbox_cleanup',
    tier: 'T4',
    outcome,
    credentials_minted: progress.credentialsMinted,
    objects_deleted: progress.objectsDeleted,
    multipart_aborted: progress.multipartAborted,
    retry_after_seconds: retryAfterSeconds,
  });
}

function namedError(name) {
  const error = new Error();
  error.name = name;
  return error;
}
