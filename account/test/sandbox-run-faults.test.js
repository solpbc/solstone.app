import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  orderedObject,
  sandboxRunErrorBody,
  SANDBOX_CLEANUP_PHASE,
  SANDBOX_COMPONENT_STATE,
  SANDBOX_ERROR,
  SANDBOX_LEASE_TTL_MS,
  SANDBOX_OUTER_ADMIN_ENVELOPE,
  SANDBOX_PROVISIONING_PHASE,
  SANDBOX_PROVISIONING_PHASES,
  SANDBOX_RESIDUAL_CODE,
  SANDBOX_RUN_STATUS,
} from '../src/sandbox-run-contract.js';
import { dbDumpText, installConsoleSpy, resetDb } from './helpers.js';
import { installJwksStubWith, mintToken } from './jwks-helper.js';
import {
  SANDBOX_INSTANCE_ID,
  SANDBOX_INSTANCE_ID_B,
  SANDBOX_NOW,
  SANDBOX_RUN_ID,
  SANDBOX_RUN_ID_B,
  STANDING_GEMINI_KEY,
  emptyS3Response,
  sandboxRequest,
  seedSandboxBaseline,
  validSandboxInput,
} from './sandbox-run-test-helpers.js';

const PHASE_BOUNDARIES = SANDBOX_PROVISIONING_PHASES.slice(1, -1);

describe('sandbox run provisioning faults', () => {
  beforeEach(async () => {
    await resetDb();
    vi.useFakeTimers();
    vi.setSystemTime(SANDBOX_NOW);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each(PHASE_BOUNDARIES)('converges after losing the %s phase CAS without a credential response', async (phase) => {
    await installJwksStubWith(async (input) => emptyS3Response(input));
    const token = await mintToken();
    const baseline = await seedSandboxBaseline();
    baseline.testEnv.DB = phaseLosingDb(baseline.testEnv.DB, phase);
    const consoleSpy = installConsoleSpy();
    try {
      const response = await worker.fetch(
        sandboxRequest('/admin/sandbox-runs', token, {
          method: 'POST',
          body: validSandboxInput(),
        }),
        baseline.testEnv
      );
      const text = await response.text();

      expect(response.status).toBe(503);
      expect(text).toBe(JSON.stringify(
        sandboxRunErrorBody(SANDBOX_ERROR.UNAVAILABLE, SANDBOX_RUN_ID)
      ));
      expect(text).not.toContain(STANDING_GEMINI_KEY);
      const row = await runRow();
      expect(row.status).toBe(SANDBOX_RUN_STATUS.RELEASED);
      expect(row.cleanup_phase).toBe(SANDBOX_CLEANUP_PHASE.RELEASED);
      expect(await dbDumpText()).not.toContain(STANDING_GEMINI_KEY);
      consoleSpy.assertNoSecrets([
        STANDING_GEMINI_KEY,
        SANDBOX_RUN_ID,
        SANDBOX_INSTANCE_ID,
        baseline.account.accountId,
      ]);
    } finally {
      consoleSpy.restore();
    }
  });

  it('keeps a fenced local-write failure discoverable until a later cleanup pass converges', async () => {
    await installJwksStubWith(async (input) => emptyS3Response(input));
    const token = await mintToken();
    const baseline = await seedSandboxBaseline();
    const fault = provisioningFaultDb(baseline.testEnv.DB, {
      localWrite: /INSERT INTO account_dispatch_tokens/i,
    });
    baseline.testEnv.DB = fault.db;

    const response = await worker.fetch(
      sandboxRequest('/admin/sandbox-runs', token, {
        method: 'POST',
        body: validSandboxInput(),
      }),
      baseline.testEnv
    );
    const text = await response.text();

    expect(fault.wasInjected()).toBe(true);
    expect(response.status).toBe(503);
    expect(text).toBe(JSON.stringify(
      sandboxRunErrorBody(SANDBOX_ERROR.UNAVAILABLE, SANDBOX_RUN_ID)
    ));
    expect(text).not.toContain(STANDING_GEMINI_KEY);
    await assertDiscoverableAndConverges({
      token,
      testEnv: baseline.testEnv,
      expectedStatus: SANDBOX_RUN_STATUS.PROVISIONING,
      expectedPhase: SANDBOX_PROVISIONING_PHASE.DISPATCH_INTENT,
      enableCleanup: fault.enableCleanup,
    });
  });

  it('releases a durable spb_intent whose fenced SPB write never committed', async () => {
    await installJwksStubWith(async (input) => emptyS3Response(input));
    const token = await mintToken();
    const baseline = await seedSandboxBaseline();
    const fault = provisioningFaultDb(baseline.testEnv.DB, {
      localWrite: /INSERT INTO spb_bindings/i,
    });
    baseline.testEnv.DB = fault.db;

    const response = await worker.fetch(
      sandboxRequest('/admin/sandbox-runs', token, {
        method: 'POST',
        body: validSandboxInput(),
      }),
      baseline.testEnv
    );
    const text = await response.text();

    expect(fault.wasInjected()).toBe(true);
    expect(response.status).toBe(503);
    expect(text).toBe(JSON.stringify(
      sandboxRunErrorBody(SANDBOX_ERROR.UNAVAILABLE, SANDBOX_RUN_ID)
    ));
    expect(text).not.toContain(STANDING_GEMINI_KEY);
    await expect(workerEnv.DB.prepare(
      'SELECT COUNT(*) AS count FROM spb_bindings WHERE sandbox_run_id = ?'
    ).bind(SANDBOX_RUN_ID).first()).resolves.toEqual({ count: 0 });
    await assertDiscoverableAndConverges({
      token,
      testEnv: baseline.testEnv,
      expectedStatus: SANDBOX_RUN_STATUS.PROVISIONING,
      expectedPhase: SANDBOX_PROVISIONING_PHASE.SPB_INTENT,
      enableCleanup: fault.enableCleanup,
    });

    const next = await worker.fetch(
      sandboxRequest('/admin/sandbox-runs', token, {
        method: 'POST',
        body: validSandboxInput({
          runId: SANDBOX_RUN_ID_B,
          instanceId: SANDBOX_INSTANCE_ID_B,
        }),
      }),
      baseline.testEnv
    );
    expect(next.status).toBe(201);
    await expect(next.json()).resolves.toMatchObject({ run_id: SANDBOX_RUN_ID_B });
  });

  it('preserves spl_intent after a successful relay grant and converges on a later cleanup pass', async () => {
    await installJwksStubWith(async (input) => emptyS3Response(input));
    const token = await mintToken();
    const baseline = await seedSandboxBaseline();
    const fault = provisioningFaultDb(baseline.testEnv.DB, {
      phaseAdvance: SANDBOX_PROVISIONING_PHASE.SPL_ACQUIRED,
    });
    baseline.testEnv.DB = fault.db;

    const response = await worker.fetch(
      sandboxRequest('/admin/sandbox-runs', token, {
        method: 'POST',
        body: validSandboxInput(),
      }),
      baseline.testEnv
    );
    const text = await response.text();

    expect(fault.wasInjected()).toBe(true);
    expect(baseline.relay.calls.map(({ method }) => method)).toEqual(['POST']);
    expect(response.status).toBe(503);
    expect(text).toBe(JSON.stringify(
      sandboxRunErrorBody(SANDBOX_ERROR.UNAVAILABLE, SANDBOX_RUN_ID)
    ));
    expect(text).not.toContain(STANDING_GEMINI_KEY);
    await assertDiscoverableAndConverges({
      token,
      testEnv: baseline.testEnv,
      expectedStatus: SANDBOX_RUN_STATUS.PROVISIONING,
      expectedPhase: SANDBOX_PROVISIONING_PHASE.SPL_INTENT,
      enableCleanup: fault.enableCleanup,
    });
  });

  it('keeps a winning activation discoverable when response serialization fails', async () => {
    await installJwksStubWith(async (input) => emptyS3Response(input));
    const token = await mintToken();
    const baseline = await seedSandboxBaseline();
    const originalStringify = JSON.stringify;
    let serializationFaults = 0;
    const stringify = vi.spyOn(JSON, 'stringify').mockImplementation((value, ...args) => {
      if (value?.capabilities) {
        serializationFaults += 1;
        throw new Error('injected response serialization failure');
      }
      return originalStringify(value, ...args);
    });

    const response = await worker.fetch(
      sandboxRequest('/admin/sandbox-runs', token, {
        method: 'POST',
        body: validSandboxInput(),
      }),
      baseline.testEnv
    );
    const text = await response.text();
    stringify.mockRestore();

    expect(serializationFaults).toBe(1);
    expect(response.status).toBe(404);
    expect(text).toBe(JSON.stringify(orderedObject(
      SANDBOX_OUTER_ADMIN_ENVELOPE.NOT_FOUND.fields,
      [SANDBOX_OUTER_ADMIN_ENVELOPE.NOT_FOUND.error]
    )));
    expect(text).not.toContain(STANDING_GEMINI_KEY);
    await assertDiscoverableAndConverges({
      token,
      testEnv: baseline.testEnv,
      expectedStatus: SANDBOX_RUN_STATUS.ACTIVE,
      expectedPhase: SANDBOX_PROVISIONING_PHASE.ACTIVE,
    });
  });

  it('discards all plaintext and cleans up when the activation CAS loses', async () => {
    await installJwksStubWith(async (input) => emptyS3Response(input));
    const token = await mintToken();
    const baseline = await seedSandboxBaseline();
    baseline.testEnv.DB = activationLosingDb(baseline.testEnv.DB);

    const response = await worker.fetch(
      sandboxRequest('/admin/sandbox-runs', token, {
        method: 'POST',
        body: validSandboxInput(),
      }),
      baseline.testEnv
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(
      sandboxRunErrorBody(SANDBOX_ERROR.UNAVAILABLE, SANDBOX_RUN_ID)
    );
    await expect(runRow()).resolves.toMatchObject({
      status: SANDBOX_RUN_STATUS.RELEASED,
      provisioning_phase: SANDBOX_PROVISIONING_PHASE.SPP_ACQUIRED,
      cleanup_phase: SANDBOX_CLEANUP_PHASE.RELEASED,
      last_residual_code: SANDBOX_RESIDUAL_CODE.ACTIVATION_CAS_LOST,
    });
  });

  it('records the separate activation-expiry residual when the activation CAS loses at expiry', async () => {
    await installJwksStubWith(async (input) => emptyS3Response(input));
    const token = await mintToken();
    const baseline = await seedSandboxBaseline();
    baseline.testEnv.DB = expiringActivationLosingDb(baseline.testEnv.DB, () => {
      vi.setSystemTime(SANDBOX_NOW + SANDBOX_LEASE_TTL_MS);
    });

    const response = await worker.fetch(
      sandboxRequest('/admin/sandbox-runs', token, {
        method: 'POST',
        body: validSandboxInput(),
      }),
      baseline.testEnv
    );

    expect(response.status).toBe(503);
    await expect(runRow()).resolves.toMatchObject({
      status: SANDBOX_RUN_STATUS.RELEASED,
      last_residual_code: SANDBOX_RESIDUAL_CODE.LEASE_EXPIRED_BEFORE_ACTIVATION,
    });
  });

  it('returns redacted 503 with no evidence row when the winning insert itself fails', async () => {
    await installJwksStubWith();
    const token = await mintToken();
    const baseline = await seedSandboxBaseline();
    const baseDb = baseline.testEnv.DB;
    baseline.testEnv.DB = {
      prepare(sql) {
        if (/INSERT INTO sandbox_runs/i.test(sql)) throw new Error('private D1 failure detail');
        return baseDb.prepare(sql);
      },
      batch(statements) {
        return baseDb.batch(statements);
      },
    };

    const consoleSpy = installConsoleSpy();
    try {
      const response = await worker.fetch(
        sandboxRequest('/admin/sandbox-runs', token, {
          method: 'POST',
          body: validSandboxInput(),
        }),
        baseline.testEnv
      );
      const text = await response.text();
      const createEvents = consoleSpy.calls
        .filter(({ level, args }) => level === 'warn' && typeof args[0] === 'string')
        .map(({ args }) => JSON.parse(args[0]))
        .filter(({ event }) => event === 'sandbox_run_create');

      expect(response.status).toBe(503);
      expect(text).toBe(JSON.stringify(
        sandboxRunErrorBody(SANDBOX_ERROR.UNAVAILABLE, SANDBOX_RUN_ID)
      ));
      expect(text).not.toContain('private D1 failure detail');
      expect(createEvents).toEqual([
        expect.objectContaining({ outcome: 'run_insert_failed', components_completed: 0 }),
      ]);
      await expect(runRow()).resolves.toBeNull();
    } finally {
      consoleSpy.restore();
    }
  });
});

function phaseLosingDb(baseDb, targetPhase) {
  return {
    prepare(sql) {
      const statement = baseDb.prepare(sql);
      if (!/UPDATE sandbox_runs\s+SET provisioning_phase = \?/i.test(sql)) return statement;
      return {
        bind(...values) {
          if (values[0] === targetPhase) {
            return { async all() { return { results: [] }; } };
          }
          return statement.bind(...values);
        },
      };
    },
    batch(statements) {
      return baseDb.batch(statements);
    },
  };
}

function activationLosingDb(baseDb) {
  return {
    prepare(sql) {
      if (/UPDATE sandbox_runs\s+SET status = 'active'/i.test(sql)) {
        return {
          bind() {
            return {
              async all() { return { results: [] }; },
            };
          },
        };
      }
      return baseDb.prepare(sql);
    },
    batch(statements) {
      return baseDb.batch(statements);
    },
  };
}

function expiringActivationLosingDb(baseDb, onFinalPhase) {
  return {
    prepare(sql) {
      if (/UPDATE sandbox_runs\s+SET status = 'active'/i.test(sql)) {
        return { bind() { return { async all() { return { results: [] }; } }; } };
      }
      const statement = baseDb.prepare(sql);
      if (!/UPDATE sandbox_runs\s+SET provisioning_phase = \?/i.test(sql)) return statement;
      return {
        bind(...values) {
          const bound = statement.bind(...values);
          if (values[0] !== SANDBOX_PROVISIONING_PHASE.SPP_ACQUIRED) return bound;
          return {
            async all() {
              const result = await bound.all();
              onFinalPhase();
              return result;
            },
          };
        },
      };
    },
    batch(statements) {
      return baseDb.batch(statements);
    },
  };
}

function provisioningFaultDb(baseDb, { localWrite = null, phaseAdvance = null }) {
  let cleanupEnabled = false;
  let injected = false;
  return {
    db: {
      prepare(sql) {
        if (!cleanupEnabled && /UPDATE sandbox_runs\s+SET status = 'cleanup_required'/i.test(sql)) {
          throw new Error('injected cleanup pause');
        }
        if (!injected && localWrite?.test(sql)) {
          injected = true;
          throw new Error('injected fenced local-write failure');
        }
        const statement = baseDb.prepare(sql);
        if (!phaseAdvance || !/UPDATE sandbox_runs\s+SET provisioning_phase = \?/i.test(sql)) {
          return statement;
        }
        return {
          bind(...values) {
            if (!injected && values[0] === phaseAdvance) {
              return {
                async all() {
                  injected = true;
                  throw new Error('injected post-side-effect phase failure');
                },
              };
            }
            return statement.bind(...values);
          },
        };
      },
      batch(statements) {
        return baseDb.batch(statements);
      },
    },
    enableCleanup() {
      cleanupEnabled = true;
    },
    wasInjected() {
      return injected;
    },
  };
}

async function assertDiscoverableAndConverges({
  token,
  testEnv,
  expectedStatus,
  expectedPhase,
  enableCleanup = () => {},
}) {
  const getResponse = await worker.fetch(
    sandboxRequest(`/admin/sandbox-runs/${SANDBOX_RUN_ID}`, token),
    testEnv
  );
  const getBody = await getResponse.json();
  expect(getResponse.status).toBe(200);
  expect(getBody).toMatchObject({
    run_id: SANDBOX_RUN_ID,
    status: expectedStatus,
    provisioning_phase: expectedPhase,
  });
  expect(getBody).not.toHaveProperty('capabilities');
  expect(JSON.stringify(getBody)).not.toContain(STANDING_GEMINI_KEY);

  enableCleanup();
  const deleteResponse = await worker.fetch(
    sandboxRequest(`/admin/sandbox-runs/${SANDBOX_RUN_ID}`, token, { method: 'DELETE' }),
    testEnv
  );
  const deleteBody = await deleteResponse.json();
  expect(deleteResponse.status).toBe(200);
  expect(deleteBody).toMatchObject({
    run_id: SANDBOX_RUN_ID,
    status: SANDBOX_RUN_STATUS.RELEASED,
    provisioning_phase: expectedPhase,
    cleanup_phase: SANDBOX_CLEANUP_PHASE.RELEASED,
  });
  expect(deleteBody.components.every(
    ({ state }) => state === SANDBOX_COMPONENT_STATE.RELEASED
  )).toBe(true);
  await expect(runRow()).resolves.toMatchObject({
    status: SANDBOX_RUN_STATUS.RELEASED,
    provisioning_phase: expectedPhase,
    cleanup_phase: SANDBOX_CLEANUP_PHASE.RELEASED,
  });
}

function runRow() {
  return workerEnv.DB.prepare('SELECT * FROM sandbox_runs WHERE run_id = ?')
    .bind(SANDBOX_RUN_ID)
    .first();
}
