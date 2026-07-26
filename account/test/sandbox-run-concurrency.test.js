import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { dbDumpText, installConsoleSpy, resetDb } from './helpers.js';
import { installJwksStub, installJwksStubWith, mintToken } from './jwks-helper.js';
import {
  SANDBOX_INSTANCE_ID,
  SANDBOX_INSTANCE_ID_B,
  SANDBOX_NOW,
  SANDBOX_RUN_ID,
  SANDBOX_RUN_ID_B,
  STANDING_GEMINI_KEY,
  emptyS3Response,
  makeRelayBinding,
  retiredRelayBody,
  sandboxRequest,
  seedSandboxBaseline,
  validSandboxInput,
} from './sandbox-run-test-helpers.js';

describe('sandbox run concurrency', () => {
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

  it.each([
    ['the same run id', validSandboxInput(), validSandboxInput()],
    [
      'different run ids for one account',
      validSandboxInput(),
      validSandboxInput({ runId: SANDBOX_RUN_ID_B, instanceId: SANDBOX_INSTANCE_ID_B }),
    ],
  ])('linearizes concurrent POSTs for %s to one credential response', async (_name, firstInput, secondInput) => {
    await installJwksStub();
    const token = await mintToken();
    const baseline = await seedSandboxBaseline();
    const consoleSpy = installConsoleSpy();
    try {
      const responses = await Promise.all([firstInput, secondInput].map((body) => worker.fetch(
        sandboxRequest('/admin/sandbox-runs', token, { method: 'POST', body }),
        baseline.testEnv
      )));
      const results = await Promise.all(responses.map(async (response) => ({
        status: response.status,
        text: await response.text(),
      })));

      expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);
      const winner = results.find(({ status }) => status === 201);
      const loser = results.find(({ status }) => status === 409);
      const capability = JSON.parse(winner.text);
      expect(loser.text).not.toContain(capability.capabilities.scout.dispatch_token);
      expect(loser.text).not.toContain(capability.capabilities.spb.broker_token);
      expect(loser.text).not.toContain(capability.capabilities.spp.credential);
      expect(await runCount()).toBe(1);
      consoleSpy.assertNoSecrets([
        STANDING_GEMINI_KEY,
        capability.capabilities.scout.dispatch_token,
        capability.capabilities.spb.broker_token,
        capability.capabilities.spp.credential,
        SANDBOX_RUN_ID,
        SANDBOX_RUN_ID_B,
        SANDBOX_INSTANCE_ID,
        SANDBOX_INSTANCE_ID_B,
        baseline.account.accountId,
      ]);
    } finally {
      consoleSpy.restore();
    }
  });

  it('lets cleanup win during the SPL grant window without a late activation or credential response', async () => {
    let releaseGrant;
    let grantStarted;
    let retired = false;
    const grantReached = new Promise((resolve) => { grantStarted = resolve; });
    const grantMayFinish = new Promise((resolve) => { releaseGrant = resolve; });
    const relay = makeRelayBinding({
      async onCall(call) {
        if (call.method === 'POST') {
          grantStarted();
          await grantMayFinish;
          return new Response(JSON.stringify({ ok: !retired }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (call.method === 'DELETE') {
          retired = true;
          return new Response(JSON.stringify(retiredRelayBody()), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return null;
      },
    });
    await installJwksStub();
    const token = await mintToken();
    const baseline = await seedSandboxBaseline({ relay });
    const createPromise = worker.fetch(
      sandboxRequest('/admin/sandbox-runs', token, {
        method: 'POST',
        body: validSandboxInput(),
      }),
      baseline.testEnv
    );
    await grantReached;

    const deleted = await worker.fetch(
      sandboxRequest(`/admin/sandbox-runs/${SANDBOX_RUN_ID}`, token, { method: 'DELETE' }),
      baseline.testEnv
    );
    releaseGrant();
    const created = await createPromise;
    const createText = await created.text();

    expect(deleted.status).toBe(200);
    expect((await deleted.json()).status).toBe('released');
    expect(created.status).toBe(503);
    expect(createText).toBe(JSON.stringify({
      error: 'sandbox run unavailable',
      code: 'sandbox_run_unavailable',
      run_id: SANDBOX_RUN_ID,
    }));
    expect(createText).not.toContain(STANDING_GEMINI_KEY);
    await expect(runRow()).resolves.toMatchObject({
      status: 'released',
      provisioning_phase: 'spl_intent',
      cleanup_phase: 'released',
    });
    await expect(activeResourceCounts()).resolves.toEqual({
      dispatch: 0,
      spl: 0,
      spb: 0,
      spp: 0,
    });
  });

  it('never reactivates a run when activation wins before DELETE', async () => {
    await installJwksStubWith(async (input) => emptyS3Response(input));
    const token = await mintToken();
    const baseline = await seedSandboxBaseline();
    const created = await worker.fetch(
      sandboxRequest('/admin/sandbox-runs', token, {
        method: 'POST',
        body: validSandboxInput(),
      }),
      baseline.testEnv
    );
    expect(created.status).toBe(201);

    const deleted = await worker.fetch(
      sandboxRequest(`/admin/sandbox-runs/${SANDBOX_RUN_ID}`, token, { method: 'DELETE' }),
      baseline.testEnv
    );
    expect(deleted.status).toBe(200);
    await expect(runRow()).resolves.toMatchObject({ status: 'released', cleanup_phase: 'released' });

    const dump = await dbDumpText();
    expect(dump).not.toContain((await created.json()).capabilities.scout.dispatch_token);
  });
});

async function runCount() {
  const row = await workerEnv.DB.prepare('SELECT COUNT(*) AS count FROM sandbox_runs').first();
  return Number(row.count);
}

function runRow() {
  return workerEnv.DB.prepare('SELECT * FROM sandbox_runs WHERE run_id = ?')
    .bind(SANDBOX_RUN_ID)
    .first();
}

async function activeResourceCounts() {
  const [dispatch, spl, spb, spp] = await Promise.all([
    workerEnv.DB.prepare(
      'SELECT COUNT(*) AS count FROM account_dispatch_tokens WHERE sandbox_run_id = ? AND revoked_at IS NULL'
    ).bind(SANDBOX_RUN_ID).first(),
    workerEnv.DB.prepare('SELECT COUNT(*) AS count FROM spl_bindings WHERE sandbox_run_id = ?')
      .bind(SANDBOX_RUN_ID).first(),
    workerEnv.DB.prepare('SELECT COUNT(*) AS count FROM spb_bindings WHERE sandbox_run_id = ?')
      .bind(SANDBOX_RUN_ID).first(),
    workerEnv.DB.prepare('SELECT COUNT(*) AS count FROM spp_bindings WHERE sandbox_run_id = ?')
      .bind(SANDBOX_RUN_ID).first(),
  ]);
  return {
    dispatch: Number(dispatch.count),
    spl: Number(spl.count),
    spb: Number(spb.count),
    spp: Number(spp.count),
  };
}
