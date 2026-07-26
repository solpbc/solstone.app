import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { dbDumpText, installConsoleSpy, resetDb } from './helpers.js';
import { installJwksStubWith, mintToken } from './jwks-helper.js';
import {
  SANDBOX_INSTANCE_ID,
  SANDBOX_NOW,
  SANDBOX_RUN_ID,
  STANDING_GEMINI_KEY,
  emptyS3Response,
  sandboxRequest,
  seedSandboxBaseline,
  validSandboxInput,
} from './sandbox-run-test-helpers.js';

const PHASE_BOUNDARIES = [
  'dispatch_intent',
  'dispatch_acquired',
  'spl_intent',
  'spl_acquired',
  'spb_intent',
  'spb_acquired',
  'spp_intent',
  'spp_acquired',
];

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
      expect(text).toBe(JSON.stringify({
        error: 'sandbox run unavailable',
        code: 'sandbox_run_unavailable',
        run_id: SANDBOX_RUN_ID,
      }));
      expect(text).not.toContain(STANDING_GEMINI_KEY);
      const row = await runRow();
      expect(row.status).toBe('released');
      expect(row.cleanup_phase).toBe('released');
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
    expect(text).toBe(JSON.stringify({
      error: 'sandbox run unavailable',
      code: 'sandbox_run_unavailable',
      run_id: SANDBOX_RUN_ID,
    }));
    expect(text).not.toContain(STANDING_GEMINI_KEY);
    await assertDiscoverableAndConverges({
      token,
      testEnv: baseline.testEnv,
      expectedStatus: 'provisioning',
      expectedPhase: 'dispatch_intent',
      enableCleanup: fault.enableCleanup,
    });
  });

  it('preserves spl_intent after a successful relay grant and converges on a later cleanup pass', async () => {
    await installJwksStubWith(async (input) => emptyS3Response(input));
    const token = await mintToken();
    const baseline = await seedSandboxBaseline();
    const fault = provisioningFaultDb(baseline.testEnv.DB, {
      phaseAdvance: 'spl_acquired',
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
    expect(text).toBe(JSON.stringify({
      error: 'sandbox run unavailable',
      code: 'sandbox_run_unavailable',
      run_id: SANDBOX_RUN_ID,
    }));
    expect(text).not.toContain(STANDING_GEMINI_KEY);
    await assertDiscoverableAndConverges({
      token,
      testEnv: baseline.testEnv,
      expectedStatus: 'provisioning',
      expectedPhase: 'spl_intent',
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
    expect(text).toBe(JSON.stringify({ error: 'account not found' }));
    expect(text).not.toContain(STANDING_GEMINI_KEY);
    await assertDiscoverableAndConverges({
      token,
      testEnv: baseline.testEnv,
      expectedStatus: 'active',
      expectedPhase: 'active',
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
    await expect(response.json()).resolves.toEqual({
      error: 'sandbox run unavailable',
      code: 'sandbox_run_unavailable',
      run_id: SANDBOX_RUN_ID,
    });
    await expect(runRow()).resolves.toMatchObject({
      status: 'released',
      provisioning_phase: 'spp_acquired',
      cleanup_phase: 'released',
      last_residual_code: 'activation_cas_lost',
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

    const response = await worker.fetch(
      sandboxRequest('/admin/sandbox-runs', token, {
        method: 'POST',
        body: validSandboxInput(),
      }),
      baseline.testEnv
    );
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(text).toBe(JSON.stringify({
      error: 'sandbox run unavailable',
      code: 'sandbox_run_unavailable',
      run_id: SANDBOX_RUN_ID,
    }));
    expect(text).not.toContain('private D1 failure detail');
    await expect(runRow()).resolves.toBeNull();
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
            return { async all() { return { results: [] }; } };
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
    status: 'released',
    provisioning_phase: expectedPhase,
    cleanup_phase: 'released',
  });
  expect(deleteBody.components.every(({ state }) => state === 'released')).toBe(true);
  await expect(runRow()).resolves.toMatchObject({
    status: 'released',
    provisioning_phase: expectedPhase,
    cleanup_phase: 'released',
  });
}

function runRow() {
  return workerEnv.DB.prepare('SELECT * FROM sandbox_runs WHERE run_id = ?')
    .bind(SANDBOX_RUN_ID)
    .first();
}
