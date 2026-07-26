import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  orderedObject,
  sandboxRunErrorBody,
  SANDBOX_COMPONENT_REPORT_KEYS,
  SANDBOX_COMPONENT_STATE,
  SANDBOX_COMPONENTS,
  SANDBOX_CONTRACT_VERSION,
  SANDBOX_ERROR,
  SANDBOX_LEASE_TTL_MS,
  SANDBOX_OUTER_ADMIN_ENVELOPE,
  SANDBOX_PROFILE,
  SANDBOX_PROVISIONING_PHASE,
  SANDBOX_REPORT_KEYS,
  SANDBOX_RESIDUAL_CODE,
  SANDBOX_RUN_STATUS,
} from '../src/sandbox-run-contract.js';
import { dbDumpText, makeTestEnv, resetDb, seedAccount, seedSandboxRun } from './helpers.js';
import { installJwksStub, mintToken } from './jwks-helper.js';
import {
  SANDBOX_INSTANCE_ID,
  SANDBOX_NOW,
  SANDBOX_RUN_ID,
  sandboxRequest,
} from './sandbox-run-test-helpers.js';

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
    expect(Object.keys(body)).toEqual(SANDBOX_REPORT_KEYS);
    expect(body).toMatchObject({
      run_id: SANDBOX_RUN_ID,
      contract_version: SANDBOX_CONTRACT_VERSION,
      profile: SANDBOX_PROFILE,
      status: SANDBOX_RUN_STATUS.ACTIVE,
      provisioning_phase: SANDBOX_PROVISIONING_PHASE.ACTIVE,
      cleanup_phase: null,
      lease_live: true,
      retry_after_seconds: null,
    });
    expect(body.components.map(({ component }) => component)).toEqual(
      SANDBOX_COMPONENTS.map((component) => component.name)
    );
    for (const component of body.components) {
      expect(Object.keys(component)).toEqual(SANDBOX_COMPONENT_REPORT_KEYS);
      expect(component.state).toBe(SANDBOX_COMPONENT_STATE.ACTIVE);
      expect(component.residual_code).toBeNull();
    }
    await expect(dbDumpText()).resolves.toBe(before);
  });

  it('renders a dead active lease as deny_pending without mutating the stored row', async () => {
    const token = await mintToken();
    const baseEnv = makeTestEnv();
    const account = await seedAccount({ testEnv: baseEnv });
    const testEnv = { ...baseEnv, SANDBOX_ACCOUNT_ID: account.accountId };
    const createdAt = SANDBOX_NOW - SANDBOX_LEASE_TTL_MS;
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

    expect(body.status).toBe(SANDBOX_RUN_STATUS.ACTIVE);
    expect(body.lease_live).toBe(false);
    expect(body.components).toEqual(body.components.map((component) => ({
      ...component,
      state: SANDBOX_COMPONENT_STATE.DENY_PENDING,
      residual_code: SANDBOX_RESIDUAL_CODE.LEASE_EXPIRED,
    })));
    const stored = await testEnv.DB.prepare(
      'SELECT status, dispatch_state, spp_state, spb_state, spl_relay_state, spl_binding_state FROM sandbox_runs WHERE run_id = ?'
    ).bind(SANDBOX_RUN_ID).first();
    expect(stored).toEqual({
      status: SANDBOX_RUN_STATUS.ACTIVE,
      dispatch_state: SANDBOX_COMPONENT_STATE.ACTIVE,
      spp_state: SANDBOX_COMPONENT_STATE.ACTIVE,
      spb_state: SANDBOX_COMPONENT_STATE.ACTIVE,
      spl_relay_state: SANDBOX_COMPONENT_STATE.ACTIVE,
      spl_binding_state: SANDBOX_COMPONENT_STATE.ACTIVE,
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
    expect(text).toBe(JSON.stringify(
      sandboxRunErrorBody(SANDBOX_ERROR.NOT_FOUND, SANDBOX_RUN_ID)
    ));
    expect(text).not.toContain(configured.accountId);
    expect(text).not.toContain(other.accountId);
    expect(text).not.toContain(SANDBOX_INSTANCE_ID);

    const unknown = await worker.fetch(
      sandboxRequest(`/admin/sandbox-runs/${SANDBOX_RUN_ID}/extra`, token),
      testEnv
    );
    expect(unknown.status).toBe(404);
    await expect(unknown.json()).resolves.toEqual(orderedObject(
      SANDBOX_OUTER_ADMIN_ENVELOPE.NOT_FOUND.fields,
      [SANDBOX_OUTER_ADMIN_ENVELOPE.NOT_FOUND.error]
    ));
  });
});
