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

function runRow() {
  return workerEnv.DB.prepare('SELECT * FROM sandbox_runs WHERE run_id = ?')
    .bind(SANDBOX_RUN_ID)
    .first();
}
