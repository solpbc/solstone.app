import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  sandboxRunErrorBody,
  SANDBOX_ERROR,
} from '../src/sandbox-run-contract.js';
import {
  dbDumpText,
  installConsoleSpy,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedActiveGeminiKey,
  seedScoutApplication,
} from './helpers.js';
import { installJwksStub, mintToken } from './jwks-helper.js';
import {
  SANDBOX_INSTANCE_ID,
  SANDBOX_NOW,
  SANDBOX_RUN_ID,
  STANDING_GEMINI_KEY,
  sandboxRequest,
  seedSandboxBaseline,
  validSandboxInput,
} from './sandbox-run-test-helpers.js';

describe('sandbox run POST', () => {
  beforeEach(async () => {
    await resetDb();
    await installJwksStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('rejects every malformed or non-exact request before side effects', async () => {
    const token = await mintToken();
    const env = makeTestEnv({ SANDBOX_ACCOUNT_ID: SANDBOX_RUN_ID });
    const valid = validSandboxInput();
    const inputs = [
      '{',
      'null',
      '[]',
      '1',
      '{}',
      JSON.stringify({ ...valid, run_id: undefined }),
      JSON.stringify({ ...valid, ttl: 3_600_000 }),
      JSON.stringify({ ...valid, contract_version: '1' }),
      JSON.stringify({ ...valid, contract_version: 2 }),
      JSON.stringify({ ...valid, profile: 'partial' }),
      JSON.stringify({ ...valid, run_id: 'not-a-uuid' }),
      JSON.stringify({ ...valid, instance_id: 'not-a-uuid' }),
      JSON.stringify({ ...valid, account_id: SANDBOX_RUN_ID }),
      JSON.stringify({ ...valid, endpoint_url: 'https://example.com' }),
    ];

    for (const body of inputs) {
      const response = await worker.fetch(
        sandboxRequest('/admin/sandbox-runs', token, { method: 'POST', body }),
        env
      );
      expect(response.status).toBe(400);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      await expect(response.json()).resolves.toEqual(
        sandboxRunErrorBody(SANDBOX_ERROR.INVALID_REQUEST)
      );
    }

    await expect(rowCount('sandbox_runs')).resolves.toBe(0);
    await expect(rowCount('account_dispatch_tokens')).resolves.toBe(0);
    await expect(rowCount('spl_bindings')).resolves.toBe(0);
    await expect(rowCount('spb_bindings')).resolves.toBe(0);
    await expect(rowCount('spp_bindings')).resolves.toBe(0);
  });

  it.each([
    ['absent account', async () => makeTestEnv({ SANDBOX_ACCOUNT_ID: SANDBOX_RUN_ID })],
    ['absent Scout', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      await seedActiveGeminiKey({ accountId: account.accountId, testEnv });
      return { ...testEnv, SANDBOX_ACCOUNT_ID: account.accountId };
    }],
    ['non-approved Scout', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      await seedScoutApplication({ accountId: account.accountId, status: 'pending' });
      await seedActiveGeminiKey({ accountId: account.accountId, testEnv });
      return { ...testEnv, SANDBOX_ACCOUNT_ID: account.accountId };
    }],
    ['absent key', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      await seedScoutApplication({ accountId: account.accountId, status: 'approved' });
      return { ...testEnv, SANDBOX_ACCOUNT_ID: account.accountId };
    }],
  ])('fails closed before insertion for an unavailable baseline: %s', async (_name, arrange) => {
    const token = await mintToken();
    const testEnv = await arrange();
    const response = await worker.fetch(
      sandboxRequest('/admin/sandbox-runs', token, {
        method: 'POST',
        body: validSandboxInput(),
      }),
      testEnv
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(
      sandboxRunErrorBody(SANDBOX_ERROR.UNAVAILABLE, SANDBOX_RUN_ID)
    );
    await expect(rowCount('sandbox_runs')).resolves.toBe(0);
  });

  it.each([
    ['missing bucket', (testEnv) => { delete testEnv.R2_BUCKET; }],
    ['non-string bucket', (testEnv) => { testEnv.R2_BUCKET = 7; }],
    ['blank bucket', (testEnv) => { testEnv.R2_BUCKET = ' '; }],
    ['untrimmed bucket', (testEnv) => { testEnv.R2_BUCKET = ' bucket '; }],
    ['missing endpoint', (testEnv) => { delete testEnv.SPP_ENGINE_ENDPOINT; }],
    ['non-string endpoint', (testEnv) => { testEnv.SPP_ENGINE_ENDPOINT = 7; }],
    ['relative endpoint', (testEnv) => { testEnv.SPP_ENGINE_ENDPOINT = '/engine'; }],
    ['non-https endpoint', (testEnv) => { testEnv.SPP_ENGINE_ENDPOINT = 'http://engine.invalid'; }],
    ['credentialed endpoint', (testEnv) => {
      testEnv.SPP_ENGINE_ENDPOINT = 'https://operator:secret@engine.invalid';
    }],
    ['missing model', (testEnv) => { delete testEnv.SPP_ENGINE_MODEL; }],
    ['non-string model', (testEnv) => { testEnv.SPP_ENGINE_MODEL = 7; }],
    ['blank model', (testEnv) => { testEnv.SPP_ENGINE_MODEL = ' '; }],
    ['untrimmed model', (testEnv) => { testEnv.SPP_ENGINE_MODEL = ' model '; }],
  ])('rejects unavailable response configuration before every create side effect: %s', async (_name, poison) => {
    const token = await mintToken();
    const baseline = await seedSandboxBaseline();
    poison(baseline.testEnv);
    const before = await dbDumpText();
    const consoleSpy = installConsoleSpy();
    try {
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
      await expect(dbDumpText()).resolves.toBe(before);
      expect(baseline.relay.calls).toEqual([]);
      const createEvents = consoleSpy.calls
        .flatMap(({ args }) => args)
        .filter((value) => typeof value === 'string' && value.includes('sandbox_run_create'))
        .map((value) => JSON.parse(value));
      expect(createEvents).toHaveLength(1);
      expect(createEvents[0]).toMatchObject({
        event: 'sandbox_run_create',
        outcome: 'config_unavailable',
        components_completed: 0,
      });
      consoleSpy.assertNoSecrets([
        baseline.testEnv.R2_BUCKET,
        baseline.testEnv.SPP_ENGINE_ENDPOINT,
        baseline.testEnv.SPP_ENGINE_MODEL,
        SANDBOX_RUN_ID,
        SANDBOX_INSTANCE_ID,
        baseline.account.accountId,
      ].filter((value) => typeof value === 'string'));
    } finally {
      consoleSpy.restore();
    }
  });

  it.each(['', 'not-valid-ciphertext'])('fails closed for unusable standing key material', async (stored) => {
    const token = await mintToken();
    const baseline = await seedSandboxBaseline();
    await workerEnv.DB.prepare(
      'UPDATE provisioned_keys SET key_string_encrypted = ? WHERE account_id = ?'
    ).bind(stored, baseline.account.accountId).run();

    const response = await worker.fetch(
      sandboxRequest('/admin/sandbox-runs', token, {
        method: 'POST',
        body: validSandboxInput(),
      }),
      baseline.testEnv
    );

    expect(response.status).toBe(503);
    await expect(rowCount('sandbox_runs')).resolves.toBe(0);
  });

  it('returns 409 without replaying credentials for a duplicate run id', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(SANDBOX_NOW);
    const token = await mintToken();
    const baseline = await seedSandboxBaseline();
    const request = () => sandboxRequest('/admin/sandbox-runs', token, {
      method: 'POST',
      body: validSandboxInput(),
    });

    const first = await worker.fetch(request(), baseline.testEnv);
    expect(first.status).toBe(201);
    const second = await worker.fetch(request(), baseline.testEnv);
    const secondText = await second.text();

    expect(second.status).toBe(409);
    expect(secondText).toBe(JSON.stringify(
      sandboxRunErrorBody(SANDBOX_ERROR.CONFLICT, SANDBOX_RUN_ID)
    ));
    expect(secondText).not.toContain(STANDING_GEMINI_KEY);
    await expect(rowCount('sandbox_runs')).resolves.toBe(1);
  });

  it('keeps standing material out of D1 and telemetry on successful creation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(SANDBOX_NOW);
    const token = await mintToken();
    const baseline = await seedSandboxBaseline();
    const consoleSpy = installConsoleSpy();
    try {
      const response = await worker.fetch(
        sandboxRequest('/admin/sandbox-runs', token, {
          method: 'POST',
          body: validSandboxInput(),
        }),
        baseline.testEnv
      );
      const body = await response.json();
      const dump = await dbDumpText();

      expect(response.status).toBe(201);
      expect(body.capabilities.scout.google_api_key).toBe(STANDING_GEMINI_KEY);
      expect(dump).not.toContain(STANDING_GEMINI_KEY);
      expect(dump).not.toContain(body.capabilities.scout.dispatch_token);
      expect(dump).not.toContain(body.capabilities.spb.broker_token);
      expect(dump).not.toContain(body.capabilities.spp.credential);
      expect(await rowCount('service_handoffs')).toBe(0);
      expect(await rowCount('sessions')).toBe(0);
      const createEvents = consoleSpy.calls
        .flatMap(({ args }) => args)
        .filter((value) => typeof value === 'string' && value.includes('sandbox_run_create'))
        .map((value) => JSON.parse(value));
      expect(createEvents).toHaveLength(1);
      expect(createEvents[0].outcome).toBe('created');
      consoleSpy.assertNoSecrets([
        STANDING_GEMINI_KEY,
        body.capabilities.scout.dispatch_token,
        body.capabilities.spb.broker_token,
        body.capabilities.spp.credential,
        SANDBOX_RUN_ID,
        SANDBOX_INSTANCE_ID,
        baseline.account.accountId,
      ]);
    } finally {
      consoleSpy.restore();
    }
  });
});

async function rowCount(table) {
  const row = await workerEnv.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
  return Number(row.count);
}
