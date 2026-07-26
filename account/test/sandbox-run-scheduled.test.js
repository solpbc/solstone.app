import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reconcileExpiredSandboxRuns } from '../src/sandbox-run-lease.js';
import {
  installConsoleSpy,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedSandboxRun,
} from './helpers.js';

const NOW = 1_700_000_000_000;
const HOUR_MS = 60 * 60 * 1000;

describe('scheduled sandbox run reconciliation', () => {
  beforeEach(async () => {
    await resetDb();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('processes one deterministic batch of ten and leaves the remainder discoverable', async () => {
    const testEnv = makeTestEnv();
    const runIds = [];
    for (let index = 0; index < 11; index += 1) {
      const runId = uuidFor(index + 1, 'a');
      runIds.push(runId);
      await seedDormantDueRun(testEnv, {
        runId,
        instanceId: uuidFor(index + 1, '1'),
        createdAt: NOW - HOUR_MS - (11 - index) * 1_000,
      });
    }
    const consoleSpy = installConsoleSpy();
    let counts;
    try {
      counts = await reconcileExpiredSandboxRuns(testEnv, null, { nowMs: NOW });
    } finally {
      consoleSpy.restore();
    }

    expect(counts).toEqual({
      runs_examined: 10,
      runs_advanced: 10,
      runs_released: 10,
      runs_failed: 0,
      runs_skipped_for_retry: 0,
    });
    const rows = await runRows();
    expect(rows.filter(({ status }) => status === 'released').map(({ run_id }) => run_id))
      .toEqual(runIds.slice(0, 10));
    expect(rows.find(({ run_id }) => run_id === runIds[10])).toMatchObject({
      status: 'provisioning',
      cleanup_phase: null,
    });
    expect(rows).toHaveLength(11);

    const nextSpy = installConsoleSpy();
    let nextCounts;
    try {
      nextCounts = await reconcileExpiredSandboxRuns(testEnv, null, { nowMs: NOW });
    } finally {
      nextSpy.restore();
    }
    expect(nextCounts).toEqual({
      runs_examined: 1,
      runs_advanced: 1,
      runs_released: 1,
      runs_failed: 0,
      runs_skipped_for_retry: 0,
    });
    await expect(runRow(runIds[10])).resolves.toMatchObject({ status: 'released' });
  });

  it('isolates one run lookup failure and advances the next selected run', async () => {
    const baseEnv = makeTestEnv();
    const failedRunId = uuidFor(1, 'a');
    const healthyRunId = uuidFor(2, 'a');
    await seedDormantDueRun(baseEnv, {
      runId: failedRunId,
      instanceId: uuidFor(1, '1'),
      createdAt: NOW - HOUR_MS - 2_000,
    });
    await seedDormantDueRun(baseEnv, {
      runId: healthyRunId,
      instanceId: uuidFor(2, '1'),
      createdAt: NOW - HOUR_MS - 1_000,
    });
    const testEnv = {
      ...baseEnv,
      DB: failRunLookupOnce(baseEnv.DB, failedRunId),
    };
    const consoleSpy = installConsoleSpy();
    let counts;
    try {
      counts = await reconcileExpiredSandboxRuns(testEnv, null, { nowMs: NOW });
    } finally {
      consoleSpy.restore();
    }

    expect(counts).toEqual({
      runs_examined: 2,
      runs_advanced: 1,
      runs_released: 1,
      runs_failed: 1,
      runs_skipped_for_retry: 0,
    });
    await expect(runRow(failedRunId)).resolves.toMatchObject({ status: 'provisioning' });
    await expect(runRow(healthyRunId)).resolves.toMatchObject({ status: 'released' });
  });

  it('skips a run until its stored SPB retry boundary without invoking cleanup', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'sandbox-retry-window@example.com', testEnv });
    const runId = uuidFor(1, 'b');
    await seedSandboxRun({
      runId,
      accountId: account.accountId,
      instanceId: uuidFor(1, '2'),
      status: 'expiry_pending',
      provisioningPhase: 'active',
      cleanupPhase: 'verify',
      createdAt: NOW - HOUR_MS - 1,
      spbRetryNotBefore: NOW + 1,
      lastResidualCode: 'spb_credential_expiry_pending',
      dispatchState: 'released',
      sppState: 'released',
      spbState: 'purge_pending',
      spbResidualCode: 'spb_credential_expiry_pending',
      splRelayState: 'released',
      splBindingState: 'released',
    });
    const before = await runRow(runId);
    const fetchMock = vi.fn(() => {
      throw new Error('retry-deferred run must not reach a remote helper');
    });
    vi.stubGlobal('fetch', fetchMock);
    const consoleSpy = installConsoleSpy();
    let counts;
    try {
      counts = await reconcileExpiredSandboxRuns(testEnv, null, { nowMs: NOW });
    } finally {
      consoleSpy.restore();
    }

    expect(counts).toEqual({
      runs_examined: 1,
      runs_advanced: 0,
      runs_released: 0,
      runs_failed: 0,
      runs_skipped_for_retry: 1,
    });
    await expect(runRow(runId)).resolves.toEqual(before);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

async function seedDormantDueRun(testEnv, { runId, instanceId, createdAt }) {
  const account = await seedAccount({
    email: `sandbox-scheduled-${runId}@example.com`,
    nowMs: createdAt,
    testEnv,
  });
  await seedSandboxRun({
    runId,
    accountId: account.accountId,
    instanceId,
    status: 'provisioning',
    provisioningPhase: 'created',
    createdAt,
    dispatchState: 'deny_pending',
    sppState: 'deny_pending',
    spbState: 'deny_pending',
    splRelayState: 'deny_pending',
    splBindingState: 'deny_pending',
  });
}

function failRunLookupOnce(db, runId) {
  let shouldFail = true;
  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      if (sql !== 'SELECT * FROM sandbox_runs WHERE run_id = ?') return statement;
      return {
        bind(...values) {
          const bound = statement.bind(...values);
          return {
            async first(...args) {
              if (shouldFail && values[0] === runId) {
                shouldFail = false;
                throw new Error('injected run lookup failure');
              }
              return bound.first(...args);
            },
          };
        },
      };
    },
    batch(statements) {
      return db.batch(statements);
    },
  };
}

function uuidFor(index, fill) {
  return `${index.toString(16).padStart(8, '0')}-${fill.repeat(4)}-4${fill.repeat(3)}-8${fill.repeat(3)}-${fill.repeat(12)}`;
}

function runRow(runId) {
  return workerEnv.DB.prepare('SELECT * FROM sandbox_runs WHERE run_id = ?').bind(runId).first();
}

async function runRows() {
  const { results } = await workerEnv.DB
    .prepare('SELECT run_id, status, cleanup_phase FROM sandbox_runs ORDER BY lease_expires_at, created_at, run_id')
    .all();
  return results;
}
