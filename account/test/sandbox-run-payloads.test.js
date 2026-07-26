import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { resetDb } from './helpers.js';
import { installJwksStub, mintToken } from './jwks-helper.js';
import {
  SANDBOX_INSTANCE_ID,
  SANDBOX_NOW,
  SANDBOX_RUN_ID,
  sandboxRequest,
  seedSandboxBaseline,
  validSandboxInput,
} from './sandbox-run-test-helpers.js';

describe('sandbox run capability payload contract', () => {
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

  it('returns only the literal journal tuples after activation', async () => {
    const token = await mintToken();
    const baseline = await seedSandboxBaseline();
    const response = await worker.fetch(
      sandboxRequest('/admin/sandbox-runs', token, {
        method: 'POST',
        body: validSandboxInput(),
      }),
      baseline.testEnv
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(Object.keys(body)).toEqual([
      'run_id',
      'contract_version',
      'profile',
      'lease_expires_at',
      'capabilities',
    ]);
    expect(Object.keys(body.capabilities)).toEqual(['scout', 'spl', 'spb', 'spp']);
    expect(Object.keys(body.capabilities.scout).sort()).toEqual([
      'account_id',
      'created_at',
      'dispatch_token',
      'google_api_key',
    ]);
    expect(Object.keys(body.capabilities.spl).sort()).toEqual([
      'approved_at',
      'service',
      'state',
    ]);
    expect(Object.keys(body.capabilities.spb).sort()).toEqual([
      'account_id',
      'broker_endpoint',
      'broker_token',
      'bucket',
      'instance_id',
      'prefix',
    ]);
    expect(Object.keys(body.capabilities.spp).sort()).toEqual([
      'account_id',
      'created_at',
      'credential',
      'endpoint_url',
      'served_model_id',
    ]);
    expect(body).toMatchObject({
      run_id: SANDBOX_RUN_ID,
      contract_version: 1,
      profile: 'full',
      lease_expires_at: SANDBOX_NOW + 3_600_000,
      capabilities: {
        spl: {
          service: 'spl',
          state: 'approved',
          approved_at: new Date(SANDBOX_NOW).toISOString(),
        },
        spb: {
          broker_endpoint: 'https://services.solstone.app',
          instance_id: SANDBOX_INSTANCE_ID,
          bucket: baseline.testEnv.R2_BUCKET,
          prefix: `users/${baseline.account.accountId}/${SANDBOX_INSTANCE_ID}/`,
        },
        spp: {
          endpoint_url: baseline.testEnv.SPP_ENGINE_ENDPOINT,
          served_model_id: baseline.testEnv.SPP_ENGINE_MODEL,
        },
      },
    });
    expect(body.capabilities.scout).not.toHaveProperty('state');
    expect(body.capabilities.spb).not.toHaveProperty('status');
    expect(body.capabilities.spb).not.toHaveProperty('subscribe_url');
    expect(body.capabilities.spp).not.toHaveProperty('state');
    expect(baseline.relay.calls).toHaveLength(1);
    expect(baseline.relay.calls[0].bodyText).toBe(JSON.stringify({
      instance_id: SANDBOX_INSTANCE_ID,
      entitled_until: Math.floor((SANDBOX_NOW + 3_600_000) / 1000),
    }));
  });
});
