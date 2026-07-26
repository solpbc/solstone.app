import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  isSandboxRunCreateResponse,
  SANDBOX_BROKER_ENDPOINT,
  SANDBOX_CAPABILITIES_KEYS,
  SANDBOX_CAPABILITY_KEYS,
  SANDBOX_CONTRACT_VERSION,
  SANDBOX_CREATE_RESPONSE_KEYS,
  SANDBOX_LEASE_TTL_MS,
  SANDBOX_PROFILE,
  SANDBOX_SPL_CAPABILITY_SERVICE,
  SANDBOX_SPL_CAPABILITY_STATE,
} from '../src/sandbox-run-contract.js';
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
    expect(Object.keys(body)).toEqual(SANDBOX_CREATE_RESPONSE_KEYS);
    expect(Object.keys(body.capabilities)).toEqual(SANDBOX_CAPABILITIES_KEYS);
    expect(Object.keys(body.capabilities.scout)).toEqual(SANDBOX_CAPABILITY_KEYS.scout);
    expect(Object.keys(body.capabilities.spl)).toEqual(SANDBOX_CAPABILITY_KEYS.spl);
    expect(Object.keys(body.capabilities.spb)).toEqual(SANDBOX_CAPABILITY_KEYS.spb);
    expect(Object.keys(body.capabilities.spp)).toEqual(SANDBOX_CAPABILITY_KEYS.spp);
    expect(isSandboxRunCreateResponse(body)).toBe(true);
    expect(body).toMatchObject({
      run_id: SANDBOX_RUN_ID,
      contract_version: SANDBOX_CONTRACT_VERSION,
      profile: SANDBOX_PROFILE,
      lease_expires_at: SANDBOX_NOW + SANDBOX_LEASE_TTL_MS,
      capabilities: {
        spl: {
          service: SANDBOX_SPL_CAPABILITY_SERVICE,
          state: SANDBOX_SPL_CAPABILITY_STATE,
          approved_at: new Date(SANDBOX_NOW).toISOString(),
        },
        spb: {
          broker_endpoint: SANDBOX_BROKER_ENDPOINT,
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
