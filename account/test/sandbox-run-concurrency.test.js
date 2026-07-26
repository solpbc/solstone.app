import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { prefixFor } from '../src/spb-broker.js';
import { reconcileExpiredSandboxRuns } from '../src/sandbox-run-lease.js';
import {
  dbDumpText,
  installConsoleSpy,
  resetDb,
  seedAccount,
  seedSandboxRun,
  seedSpbBinding,
  seedSplBinding,
  seedSppBinding,
} from './helpers.js';
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

  it('contains DELETE-versus-scheduled cleanup to the exact run resources', async () => {
    await assertContainedCleanupRace('delete-versus-scheduled');
  });

  it('linearizes concurrent DELETEs without regressing or deleting evidence', async () => {
    await assertContainedCleanupRace('delete-versus-delete');
  });

  it('contains scheduled-versus-scheduled cleanup to the exact run resources', async () => {
    await assertContainedCleanupRace('scheduled-versus-scheduled');
  });
});

async function assertContainedCleanupRace(kind) {
  const s3Calls = [];
  await installJwksStubWith(async (input) => {
    const response = emptyS3Response(input);
    if (response) s3Calls.push(new URL(typeof input === 'string' ? input : input.url));
    return response;
  });
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
  const controls = await seedControlResources(baseline.testEnv);
  const controlsBefore = await controlRows(controls);
  const targetPrefix = prefixFor(baseline.account.accountId, SANDBOX_INSTANCE_ID);
  vi.setSystemTime(SANDBOX_NOW + 3_600_000);

  let terminalTransitions = 0;
  if (kind === 'delete-versus-delete') {
    baseline.testEnv.DB = observeTerminalTransitions(baseline.testEnv.DB, (count) => {
      terminalTransitions += count;
    });
  }

  let deleteResponses = [];
  if (kind === 'delete-versus-scheduled') {
    const [deleteResponse] = await Promise.all([
      worker.fetch(
        sandboxRequest(`/admin/sandbox-runs/${SANDBOX_RUN_ID}`, token, { method: 'DELETE' }),
        baseline.testEnv
      ),
      reconcileExpiredSandboxRuns(baseline.testEnv, null, { nowMs: Date.now() }),
    ]);
    deleteResponses = [deleteResponse];
  } else if (kind === 'delete-versus-delete') {
    deleteResponses = await Promise.all([
      worker.fetch(
        sandboxRequest(`/admin/sandbox-runs/${SANDBOX_RUN_ID}`, token, { method: 'DELETE' }),
        baseline.testEnv
      ),
      worker.fetch(
        sandboxRequest(`/admin/sandbox-runs/${SANDBOX_RUN_ID}`, token, { method: 'DELETE' }),
        baseline.testEnv
      ),
    ]);
  } else {
    await Promise.all([
      reconcileExpiredSandboxRuns(baseline.testEnv, null, { nowMs: Date.now() }),
      reconcileExpiredSandboxRuns(baseline.testEnv, null, { nowMs: Date.now() }),
    ]);
  }

  await expect(runRow()).resolves.toMatchObject({
    status: 'released',
    cleanup_phase: 'released',
    dispatch_state: 'released',
    spp_state: 'released',
    spb_state: 'released',
    spl_relay_state: 'released',
    spl_binding_state: 'released',
  });
  await expect(activeResourceCounts()).resolves.toEqual({
    dispatch: 0,
    spl: 0,
    spb: 0,
    spp: 0,
  });
  await expect(runCount()).resolves.toBe(2);
  await expect(controlRows(controls)).resolves.toEqual(controlsBefore);
  expect(baseline.relay.calls.filter(({ method }) => method === 'DELETE').every(
    ({ url }) => url.pathname.endsWith(`/${SANDBOX_INSTANCE_ID}`)
  )).toBe(true);
  expect(JSON.stringify(baseline.relay.calls)).not.toContain(controls.baselineInstanceId);
  expect(JSON.stringify(baseline.relay.calls)).not.toContain(controls.otherInstanceId);
  expect(s3Calls.length).toBeGreaterThan(0);
  for (const url of s3Calls) {
    expect(url.searchParams.get('prefix')).toBe(targetPrefix);
  }
  expect(JSON.stringify(s3Calls)).not.toContain(controls.baselinePrefix);
  expect(JSON.stringify(s3Calls)).not.toContain(controls.otherPrefix);
  if (kind === 'delete-versus-delete') expect(terminalTransitions).toBe(1);
  for (const deleteResponse of deleteResponses) {
    expect([200, 202, 503]).toContain(deleteResponse.status);
    const text = await deleteResponse.text();
    expect(text).not.toContain(controls.baselineAccountId);
    expect(text).not.toContain(controls.otherAccountId);
    expect(text).not.toContain(controls.otherRunId);
    const body = JSON.parse(text);
    if (deleteResponse.status === 200) {
      expect(body.status).toBe('released');
      expect(body.components.every(({ state }) => state === 'released')).toBe(true);
    } else if (deleteResponse.status === 202) {
      expect(body.status).toBe('expiry_pending');
      expect(deleteResponse.headers.get('Retry-After')).toBe(String(body.retry_after_seconds));
    } else {
      expect(body).toEqual({
        error: 'sandbox run cleanup unavailable',
        code: 'sandbox_run_cleanup_unavailable',
        run_id: SANDBOX_RUN_ID,
      });
    }
  }
}

async function seedControlResources(testEnv) {
  const baselineAccount = await seedAccount({
    email: 'sandbox-race-baseline@example.com',
    nowMs: SANDBOX_NOW,
    testEnv,
  });
  const otherAccount = await seedAccount({
    email: 'sandbox-race-other@example.com',
    nowMs: SANDBOX_NOW,
    testEnv,
  });
  const baselineInstanceId = '33333333-3333-4333-8333-333333333333';
  const otherInstanceId = '44444444-4444-4444-8444-444444444444';
  const otherRunId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  await seedSandboxRun({
    runId: otherRunId,
    accountId: otherAccount.accountId,
    instanceId: otherInstanceId,
    createdAt: SANDBOX_NOW + 1,
  });
  await workerEnv.DB.prepare(
    `INSERT INTO account_dispatch_tokens (
       token_hash, account_id, created_at, revoked_at, sandbox_run_id
     ) VALUES
       ('sandbox-race-baseline-token', ?, ?, NULL, NULL),
       ('sandbox-race-other-token', ?, ?, NULL, ?)`
  ).bind(
    baselineAccount.accountId,
    SANDBOX_NOW,
    otherAccount.accountId,
    SANDBOX_NOW,
    otherRunId
  ).run();
  await seedSplBinding({
    accountId: baselineAccount.accountId,
    instanceId: baselineInstanceId,
    createdAt: SANDBOX_NOW,
  });
  await seedSppBinding({
    accountId: baselineAccount.accountId,
    instanceId: baselineInstanceId,
    tokenHash: 'sandbox-race-baseline-spp',
    createdAt: SANDBOX_NOW,
  });
  await seedSpbBinding({
    accountId: baselineAccount.accountId,
    instanceId: baselineInstanceId,
    tokenHash: 'sandbox-race-baseline-spb',
    createdAt: SANDBOX_NOW,
  });
  await seedSplBinding({
    accountId: otherAccount.accountId,
    instanceId: otherInstanceId,
    createdAt: SANDBOX_NOW,
    sandboxRunId: otherRunId,
  });
  await seedSppBinding({
    accountId: otherAccount.accountId,
    instanceId: otherInstanceId,
    tokenHash: 'sandbox-race-other-spp',
    createdAt: SANDBOX_NOW,
    sandboxRunId: otherRunId,
  });
  await seedSpbBinding({
    accountId: otherAccount.accountId,
    instanceId: otherInstanceId,
    tokenHash: 'sandbox-race-other-spb',
    createdAt: SANDBOX_NOW,
    sandboxRunId: otherRunId,
  });
  return {
    baselineAccountId: baselineAccount.accountId,
    otherAccountId: otherAccount.accountId,
    baselineInstanceId,
    otherInstanceId,
    otherRunId,
    baselinePrefix: prefixFor(baselineAccount.accountId, baselineInstanceId),
    otherPrefix: prefixFor(otherAccount.accountId, otherInstanceId),
  };
}

async function controlRows({ baselineInstanceId, otherInstanceId }) {
  const [dispatch, spl, spb, spp] = await Promise.all([
    workerEnv.DB.prepare(
      `SELECT token_hash, account_id, revoked_at, sandbox_run_id
       FROM account_dispatch_tokens
       WHERE token_hash IN ('sandbox-race-baseline-token','sandbox-race-other-token')
       ORDER BY token_hash`
    ).all(),
    workerEnv.DB.prepare(
      'SELECT * FROM spl_bindings WHERE instance_id IN (?, ?) ORDER BY instance_id'
    ).bind(baselineInstanceId, otherInstanceId).all(),
    workerEnv.DB.prepare(
      'SELECT * FROM spb_bindings WHERE instance_id IN (?, ?) ORDER BY instance_id'
    ).bind(baselineInstanceId, otherInstanceId).all(),
    workerEnv.DB.prepare(
      'SELECT * FROM spp_bindings WHERE instance_id IN (?, ?) ORDER BY instance_id'
    ).bind(baselineInstanceId, otherInstanceId).all(),
  ]);
  return {
    dispatch: dispatch.results,
    spl: spl.results,
    spb: spb.results,
    spp: spp.results,
  };
}

function observeTerminalTransitions(baseDb, onTransition) {
  return {
    prepare(sql) {
      const statement = baseDb.prepare(sql);
      if (!/UPDATE sandbox_runs\s+SET status = 'released'/i.test(sql)) return statement;
      return {
        bind(...values) {
          const bound = statement.bind(...values);
          return {
            async all(...args) {
              const result = await bound.all(...args);
              onTransition(result?.results?.length || 0);
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
