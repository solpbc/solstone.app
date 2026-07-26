import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { dbDumpText, makeTestEnv, resetDb, seedAccount, seedSandboxRun } from './helpers.js';
import { installJwksStub, mintToken } from './jwks-helper.js';
import {
  SANDBOX_INSTANCE_ID,
  SANDBOX_NOW,
  SANDBOX_RUN_ID,
  sandboxRequest,
} from './sandbox-run-test-helpers.js';

const TOP_LEVEL_KEYS = [
  'run_id',
  'contract_version',
  'profile',
  'status',
  'provisioning_phase',
  'cleanup_phase',
  'lease_expires_at',
  'lease_live',
  'retry_after_seconds',
  'components',
];

describe('sandbox run GET', () => {
  beforeEach(async () => {
    await resetDb();
    vi.useFakeTimers();
    vi.setSystemTime(SANDBOX_NOW);
    await installJwksStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('returns the fixed redacted component report without writing or calling cleanup', async () => {
    const token = await mintToken();
    const baseEnv = makeTestEnv();
    const account = await seedAccount({ testEnv: baseEnv });
    const testEnv = { ...baseEnv, SANDBOX_ACCOUNT_ID: account.accountId };
    await seedSandboxRun({
      runId: SANDBOX_RUN_ID,
      accountId: account.accountId,
      instanceId: SANDBOX_INSTANCE_ID,
      createdAt: SANDBOX_NOW - 1_000,
    });
    const before = await dbDumpText();

    const response = await worker.fetch(
      sandboxRequest(`/admin/sandbox-runs/${SANDBOX_RUN_ID}`, token),
      testEnv
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(Object.keys(body)).toEqual(TOP_LEVEL_KEYS);
    expect(body).toMatchObject({
      run_id: SANDBOX_RUN_ID,
      contract_version: 1,
      profile: 'full',
      status: 'active',
      provisioning_phase: 'active',
      cleanup_phase: null,
      lease_live: true,
      retry_after_seconds: null,
    });
    expect(body.components.map(({ component }) => component)).toEqual([
      'dispatch',
      'spp',
      'spb',
      'spl_relay',
      'spl_binding',
    ]);
    for (const component of body.components) {
      expect(Object.keys(component)).toEqual([
        'component',
        'state',
        'residual_code',
        'updated_at',
      ]);
      expect(component.state).toBe('active');
      expect(component.residual_code).toBeNull();
    }
    await expect(dbDumpText()).resolves.toBe(before);
  });

  it('renders a dead active lease as deny_pending without mutating the stored row', async () => {
    const token = await mintToken();
    const baseEnv = makeTestEnv();
    const account = await seedAccount({ testEnv: baseEnv });
    const testEnv = { ...baseEnv, SANDBOX_ACCOUNT_ID: account.accountId };
    const createdAt = SANDBOX_NOW - 3_600_000;
    await seedSandboxRun({
      runId: SANDBOX_RUN_ID,
      accountId: account.accountId,
      instanceId: SANDBOX_INSTANCE_ID,
      createdAt,
    });

    const response = await worker.fetch(
      sandboxRequest(`/admin/sandbox-runs/${SANDBOX_RUN_ID}`, token),
      testEnv
    );
    const body = await response.json();

    expect(body.status).toBe('active');
    expect(body.lease_live).toBe(false);
    expect(body.components).toEqual(body.components.map((component) => ({
      ...component,
      state: 'deny_pending',
      residual_code: 'lease_expired',
    })));
    const stored = await testEnv.DB.prepare(
      'SELECT status, dispatch_state, spp_state, spb_state, spl_relay_state, spl_binding_state FROM sandbox_runs WHERE run_id = ?'
    ).bind(SANDBOX_RUN_ID).first();
    expect(stored).toEqual({
      status: 'active',
      dispatch_state: 'active',
      spp_state: 'active',
      spb_state: 'active',
      spl_relay_state: 'active',
      spl_binding_state: 'active',
    });
  });

  it('distinguishes a scoped absent run from an unknown admin route without cross-account detail', async () => {
    const token = await mintToken();
    const baseEnv = makeTestEnv();
    const configured = await seedAccount({ email: 'configured-sandbox@example.com', testEnv: baseEnv });
    const other = await seedAccount({ email: 'other-sandbox@example.com', testEnv: baseEnv });
    await seedSandboxRun({
      runId: SANDBOX_RUN_ID,
      accountId: other.accountId,
      instanceId: SANDBOX_INSTANCE_ID,
      createdAt: SANDBOX_NOW,
    });
    const testEnv = { ...baseEnv, SANDBOX_ACCOUNT_ID: configured.accountId };

    const absent = await worker.fetch(
      sandboxRequest(`/admin/sandbox-runs/${SANDBOX_RUN_ID}`, token),
      testEnv
    );
    const text = await absent.text();

    expect(absent.status).toBe(404);
    expect(absent.headers.get('Cache-Control')).toBe('no-store');
    expect(absent.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(text).toBe(JSON.stringify({
      error: 'sandbox run not found',
      code: 'sandbox_run_not_found',
      run_id: SANDBOX_RUN_ID,
    }));
    expect(text).not.toContain(configured.accountId);
    expect(text).not.toContain(other.accountId);
    expect(text).not.toContain(SANDBOX_INSTANCE_ID);

    const unknown = await worker.fetch(
      sandboxRequest(`/admin/sandbox-runs/${SANDBOX_RUN_ID}/extra`, token),
      testEnv
    );
    expect(unknown.status).toBe(404);
    await expect(unknown.json()).resolves.toEqual({ error: 'account not found' });
  });
});
