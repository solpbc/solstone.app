import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { prefixFor } from '../src/spb-broker.js';
import { reconcileSandboxRun } from '../src/sandbox-run-lease.js';
import {
  SANDBOX_CLEANUP_PHASE,
  SANDBOX_CLEANUP_TRIGGER,
  SANDBOX_COMPONENT,
  SANDBOX_COMPONENT_STATE,
  SANDBOX_COMPONENTS,
  SANDBOX_ERROR,
  SANDBOX_PROVISIONING_PHASE,
  SANDBOX_RESIDUAL_CODE,
  SANDBOX_RUN_STATUS,
  sandboxRunErrorBody,
} from '../src/sandbox-run-contract.js';
import {
  dbDumpText,
  installConsoleSpy,
  installS3FetchMock,
  makeTestEnv,
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
  SANDBOX_NOW,
  SANDBOX_RUN_ID,
  emptyS3Response,
  makeRelayBinding,
  sandboxRequest,
} from './sandbox-run-test-helpers.js';

describe('sandbox run DELETE cleanup', () => {
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

  it('denies independently, retires relay before deleting SPL, purges SPB, and is byte-stable', async () => {
    const events = [];
    const relay = makeRelayBinding({
      onCall(call) {
        if (call.method === 'DELETE') events.push('relay_retire');
        return null;
      },
    });
    const seeded = await seedActiveRunResources({ relay });
    const baseDb = seeded.testEnv.DB;
    seeded.testEnv.DB = {
      prepare(sql) {
        if (/UPDATE account_dispatch_tokens\s+SET revoked_at/i.test(sql)) events.push('dispatch_deny');
        if (/UPDATE spb_bindings\s+SET token_hash = NULL/i.test(sql)) events.push('spb_deny');
        if (/DELETE FROM spp_bindings/i.test(sql)) events.push('spp_deny');
        if (/DELETE FROM spl_bindings/i.test(sql)) events.push('spl_release');
        return baseDb.prepare(sql);
      },
      batch(statements) {
        return baseDb.batch(statements);
      },
    };
    await installJwksStubWith(async (input) => emptyS3Response(input));
    const token = await mintToken();

    const first = await worker.fetch(
      sandboxRequest(`/admin/sandbox-runs/${SANDBOX_RUN_ID}`, token, { method: 'DELETE' }),
      seeded.testEnv
    );
    const firstText = await first.text();

    expect(first.status).toBe(200);
    expect(first.headers.get('Cache-Control')).toBe('no-store');
    const report = JSON.parse(firstText);
    expect(report.status).toBe(SANDBOX_RUN_STATUS.RELEASED);
    expect(report.cleanup_phase).toBe(SANDBOX_CLEANUP_PHASE.RELEASED);
    expect(report.components.map(({ state }) => state)).toEqual(
      SANDBOX_COMPONENTS.map(() => SANDBOX_COMPONENT_STATE.RELEASED)
    );
    expect(events.indexOf('dispatch_deny')).toBeLessThan(events.indexOf('relay_retire'));
    expect(events.indexOf('spp_deny')).toBeLessThan(events.indexOf('relay_retire'));
    expect(events.indexOf('spb_deny')).toBeLessThan(events.indexOf('relay_retire'));
    expect(events.indexOf('relay_retire')).toBeLessThan(events.indexOf('spl_release'));
    await expect(bindingCount('spl_bindings')).resolves.toBe(0);
    await expect(bindingCount('spp_bindings')).resolves.toBe(0);
    await expect(bindingCount('spb_bindings')).resolves.toBe(0);
    await expect(activeDispatchCount()).resolves.toBe(0);
    await expect(bindingCount('sandbox_runs')).resolves.toBe(1);

    const relayCalls = relay.calls.length;
    const second = await worker.fetch(
      sandboxRequest(`/admin/sandbox-runs/${SANDBOX_RUN_ID}`, token, { method: 'DELETE' }),
      seeded.testEnv
    );
    expect(second.status).toBe(200);
    await expect(second.text()).resolves.toBe(firstText);
    expect(relay.calls).toHaveLength(relayCalls);
  });

  it('returns only expiry_pending as 202 with matching retry fields', async () => {
    const relay = makeRelayBinding();
    const seeded = await seedActiveRunResources({
      relay,
      spbCredentialExpiresAt: SANDBOX_NOW + 90_000,
    });
    await installJwksStub();
    const token = await mintToken();

    const first = await worker.fetch(
      sandboxRequest(`/admin/sandbox-runs/${SANDBOX_RUN_ID}`, token, { method: 'DELETE' }),
      seeded.testEnv
    );
    const firstText = await first.text();
    const body = JSON.parse(firstText);

    expect(first.status).toBe(202);
    expect(first.headers.get('Retry-After')).toBe('90');
    expect(body.status).toBe(SANDBOX_RUN_STATUS.EXPIRY_PENDING);
    expect(body.retry_after_seconds).toBe(90);
    expect(body.components.find(({ component }) => component === SANDBOX_COMPONENT.SPB)).toMatchObject({
      state: SANDBOX_COMPONENT_STATE.PURGE_PENDING,
      residual_code: SANDBOX_RESIDUAL_CODE.SPB_CREDENTIAL_EXPIRY_PENDING,
    });
    expect(body.components.filter(({ component }) => component !== 'spb').every(
      ({ state }) => state === SANDBOX_COMPONENT_STATE.RELEASED
    )).toBe(true);
    const row = await runRow();
    expect(row.spb_retry_not_before).toBe(SANDBOX_NOW + 90_000);

    const second = await worker.fetch(
      sandboxRequest(`/admin/sandbox-runs/${SANDBOX_RUN_ID}`, token, { method: 'DELETE' }),
      seeded.testEnv
    );
    expect(second.status).toBe(202);
    expect(second.headers.get('Retry-After')).toBe('90');
    await expect(second.text()).resolves.toBe(firstText);
  });

  it('returns a redacted 409 for an ownership conflict without touching the incumbent', async () => {
    const relay = makeRelayBinding();
    const baseEnv = makeTestEnv();
    const account = await seedAccount({ email: 'sandbox-owner@example.com', testEnv: baseEnv });
    const incumbent = await seedAccount({ email: 'sandbox-incumbent@example.com', testEnv: baseEnv });
    await seedSandboxRun({
      runId: SANDBOX_RUN_ID,
      accountId: account.accountId,
      instanceId: SANDBOX_INSTANCE_ID,
      createdAt: SANDBOX_NOW - 1_000,
    });
    await seedSplBinding({
      accountId: incumbent.accountId,
      instanceId: SANDBOX_INSTANCE_ID,
      createdAt: SANDBOX_NOW - 1_000,
    });
    const testEnv = {
      ...baseEnv,
      SANDBOX_ACCOUNT_ID: account.accountId,
      RELAY: relay.binding,
    };
    await installJwksStub();
    const token = await mintToken();

    const response = await worker.fetch(
      sandboxRequest(`/admin/sandbox-runs/${SANDBOX_RUN_ID}`, token, { method: 'DELETE' }),
      testEnv
    );
    const text = await response.text();

    expect(response.status).toBe(409);
    expect(text).toBe(JSON.stringify({
      error: 'sandbox run cleanup conflict',
      code: 'sandbox_run_cleanup_conflict',
      run_id: SANDBOX_RUN_ID,
    }));
    expect(text).not.toContain(account.accountId);
    expect(text).not.toContain(incumbent.accountId);
    expect(text).not.toContain(SANDBOX_INSTANCE_ID);
    await expect(workerEnv.DB.prepare(
      'SELECT account_id FROM spl_bindings WHERE instance_id = ?'
    ).bind(SANDBOX_INSTANCE_ID).first()).resolves.toEqual({ account_id: incumbent.accountId });
    expect(relay.calls).toHaveLength(0);
  });

  it('preserves the evidence row and reports account cascade loss as 503', async () => {
    const relay = makeRelayBinding();
    const baseEnv = makeTestEnv();
    const account = await seedAccount({ testEnv: baseEnv });
    await seedSandboxRun({
      runId: SANDBOX_RUN_ID,
      accountId: account.accountId,
      instanceId: SANDBOX_INSTANCE_ID,
      createdAt: SANDBOX_NOW - 1_000,
    });
    await workerEnv.DB.prepare('DELETE FROM account_emails WHERE account_id = ?')
      .bind(account.accountId)
      .run();
    await workerEnv.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(account.accountId).run();
    const testEnv = {
      ...baseEnv,
      SANDBOX_ACCOUNT_ID: account.accountId,
      RELAY: relay.binding,
    };
    await installJwksStub();
    const token = await mintToken();
    const consoleSpy = installConsoleSpy();
    try {
      const before = await dbDumpText();
      const response = await worker.fetch(
        sandboxRequest(`/admin/sandbox-runs/${SANDBOX_RUN_ID}`, token, { method: 'DELETE' }),
        testEnv
      );
      const text = await response.text();

      expect(response.status).toBe(503);
      expect(text).toBe(JSON.stringify(
        sandboxRunErrorBody(SANDBOX_ERROR.CLEANUP_UNAVAILABLE, SANDBOX_RUN_ID)
      ));
      expect(await runRow()).toMatchObject({
        status: SANDBOX_RUN_STATUS.CLEANUP_FAILED,
        dispatch_residual_code: SANDBOX_RESIDUAL_CODE.ACCOUNT_MISSING,
        spp_residual_code: SANDBOX_RESIDUAL_CODE.ACCOUNT_MISSING,
        spb_residual_code: SANDBOX_RESIDUAL_CODE.SPB_LIFECYCLE_ABSENT,
        spl_binding_residual_code: SANDBOX_RESIDUAL_CODE.ACCOUNT_MISSING,
      });
      expect(await dbDumpText()).not.toBe(before);
      consoleSpy.assertNoSecrets([account.accountId, SANDBOX_INSTANCE_ID, SANDBOX_RUN_ID]);
    } finally {
      consoleSpy.restore();
    }
  });

  it.each([
    ['account loss before SPB acquisition', SANDBOX_PROVISIONING_PHASE.SPB_INTENT, false],
    ['an acquired SPB binding that is now absent', SANDBOX_PROVISIONING_PHASE.SPB_ACQUIRED, true],
  ])('keeps SPB lifecycle absence fail-closed for %s', async (_name, provisioningPhase, keepAccount) => {
    const relay = makeRelayBinding();
    const baseEnv = makeTestEnv();
    const account = await seedAccount({ testEnv: baseEnv });
    await seedSandboxRun({
      runId: SANDBOX_RUN_ID,
      accountId: account.accountId,
      instanceId: SANDBOX_INSTANCE_ID,
      status: SANDBOX_RUN_STATUS.PROVISIONING,
      provisioningPhase,
      dispatchState: SANDBOX_COMPONENT_STATE.DENY_PENDING,
      sppState: SANDBOX_COMPONENT_STATE.DENY_PENDING,
      spbState: SANDBOX_COMPONENT_STATE.DENY_PENDING,
      splRelayState: SANDBOX_COMPONENT_STATE.DENY_PENDING,
      splBindingState: SANDBOX_COMPONENT_STATE.DENY_PENDING,
    });
    if (!keepAccount) {
      await workerEnv.DB.prepare('DELETE FROM account_emails WHERE account_id = ?')
        .bind(account.accountId)
        .run();
      await workerEnv.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(account.accountId).run();
    }
    const testEnv = { ...baseEnv, RELAY: relay.binding };

    const result = await reconcileSandboxRun(testEnv, null, {
      runId: SANDBOX_RUN_ID,
      nowMs: SANDBOX_NOW,
      trigger: SANDBOX_CLEANUP_TRIGGER.DELETE,
    });

    expect(result.outcome).toBe('failed');
    await expect(runRow()).resolves.toMatchObject({
      status: SANDBOX_RUN_STATUS.CLEANUP_FAILED,
      provisioning_phase: provisioningPhase,
      spb_state: SANDBOX_COMPONENT_STATE.CLEANUP_FAILED,
      spb_residual_code: SANDBOX_RESIDUAL_CODE.SPB_LIFECYCLE_ABSENT,
    });
  });

  it('fails closed when the account disappears after the initial SPB postcondition read', async () => {
    const relay = makeRelayBinding();
    const baseEnv = makeTestEnv();
    const account = await seedAccount({ testEnv: baseEnv });
    await seedSandboxRun({
      runId: SANDBOX_RUN_ID,
      accountId: account.accountId,
      instanceId: SANDBOX_INSTANCE_ID,
      status: SANDBOX_RUN_STATUS.PROVISIONING,
      provisioningPhase: SANDBOX_PROVISIONING_PHASE.SPB_INTENT,
      dispatchState: SANDBOX_COMPONENT_STATE.DENY_PENDING,
      sppState: SANDBOX_COMPONENT_STATE.DENY_PENDING,
      spbState: SANDBOX_COMPONENT_STATE.DENY_PENDING,
      splRelayState: SANDBOX_COMPONENT_STATE.DENY_PENDING,
      splBindingState: SANDBOX_COMPONENT_STATE.DENY_PENDING,
    });
    const testEnv = interleaveLocalPostconditionRead(
      { ...baseEnv, RELAY: relay.binding },
      2,
      'after',
      async (db) => {
        await db.prepare('DELETE FROM account_emails WHERE account_id = ?')
          .bind(account.accountId)
          .run();
        await db.prepare('DELETE FROM accounts WHERE id = ?').bind(account.accountId).run();
      }
    );

    const result = await reconcileSandboxRun(testEnv, null, {
      runId: SANDBOX_RUN_ID,
      nowMs: SANDBOX_NOW,
      trigger: SANDBOX_CLEANUP_TRIGGER.DELETE,
    });

    expect(result.outcome).toBe('failed');
    await expect(runRow()).resolves.toMatchObject({
      status: SANDBOX_RUN_STATUS.CLEANUP_FAILED,
      provisioning_phase: SANDBOX_PROVISIONING_PHASE.SPB_INTENT,
      spb_state: SANDBOX_COMPONENT_STATE.CLEANUP_FAILED,
      spb_residual_code: SANDBOX_RESIDUAL_CODE.SPB_LIFECYCLE_ABSENT,
    });
  });

  it('fails closed when a baseline SPB binding appears before fresh verification', async () => {
    const relay = makeRelayBinding();
    const baseEnv = makeTestEnv();
    const account = await seedAccount({ testEnv: baseEnv });
    await seedSandboxRun({
      runId: SANDBOX_RUN_ID,
      accountId: account.accountId,
      instanceId: SANDBOX_INSTANCE_ID,
      status: SANDBOX_RUN_STATUS.PROVISIONING,
      provisioningPhase: SANDBOX_PROVISIONING_PHASE.SPB_INTENT,
      dispatchState: SANDBOX_COMPONENT_STATE.DENY_PENDING,
      sppState: SANDBOX_COMPONENT_STATE.DENY_PENDING,
      spbState: SANDBOX_COMPONENT_STATE.DENY_PENDING,
      splRelayState: SANDBOX_COMPONENT_STATE.DENY_PENDING,
      splBindingState: SANDBOX_COMPONENT_STATE.DENY_PENDING,
    });
    const testEnv = interleaveLocalPostconditionRead(
      { ...baseEnv, RELAY: relay.binding },
      3,
      'before',
      () => seedSpbBinding({
        accountId: account.accountId,
        instanceId: SANDBOX_INSTANCE_ID,
        createdAt: SANDBOX_NOW,
        tokenHash: 'baseline-race-token',
      })
    );

    const result = await reconcileSandboxRun(testEnv, null, {
      runId: SANDBOX_RUN_ID,
      nowMs: SANDBOX_NOW,
      trigger: SANDBOX_CLEANUP_TRIGGER.DELETE,
    });

    expect(result.outcome).toBe('conflict');
    await expect(runRow()).resolves.toMatchObject({
      status: SANDBOX_RUN_STATUS.CLEANUP_FAILED,
      provisioning_phase: SANDBOX_PROVISIONING_PHASE.SPB_INTENT,
      spb_state: SANDBOX_COMPONENT_STATE.CLEANUP_FAILED,
      spb_residual_code: SANDBOX_RESIDUAL_CODE.SPB_OWNERSHIP_CONFLICT,
    });
    await expect(workerEnv.DB.prepare(
      'SELECT token_hash, sandbox_run_id FROM spb_bindings WHERE instance_id = ?'
    ).bind(SANDBOX_INSTANCE_ID).first()).resolves.toEqual({
      token_hash: 'baseline-race-token',
      sandbox_run_id: null,
    });
  });

  it('converges after a relay retryable residual without regressing released components', async () => {
    let retirementAttempts = 0;
    const relay = makeRelayBinding({
      onCall(call) {
        if (call.method !== 'DELETE') return null;
        retirementAttempts += 1;
        if (retirementAttempts !== 1) return null;
        return jsonResponse({
          entry_denial_verified: true,
          sockets_closed: false,
          devices_revoked: true,
          entitlement_cleared: true,
          pending_grants_cleared: true,
          tombstone_verified: true,
          failed_component: 'instance_do_cleanup',
        }, 503);
      },
    });
    const seeded = await seedActiveRunResources({
      relay,
      createdAt: SANDBOX_NOW - 3_600_001,
    });
    installEmptyS3(seeded.testEnv);

    const first = await reconcileSandboxRun(seeded.testEnv, null, {
      runId: SANDBOX_RUN_ID,
      nowMs: SANDBOX_NOW,
      trigger: SANDBOX_CLEANUP_TRIGGER.SCHEDULED,
    });
    const afterFirst = await runRow();

    expect(first.outcome).toBe('failed');
    expect(afterFirst).toMatchObject({
      status: SANDBOX_RUN_STATUS.CLEANUP_FAILED,
      cleanup_phase: SANDBOX_CLEANUP_PHASE.RELAY_INTENT,
      dispatch_state: SANDBOX_COMPONENT_STATE.RELEASED,
      spp_state: SANDBOX_COMPONENT_STATE.RELEASED,
      spb_state: SANDBOX_COMPONENT_STATE.RELEASED,
      spl_relay_state: SANDBOX_COMPONENT_STATE.CLEANUP_FAILED,
      spl_relay_residual_code: SANDBOX_RESIDUAL_CODE.RELAY_INSTANCE_DO_CLEANUP,
      spl_binding_state: SANDBOX_COMPONENT_STATE.DENY_PENDING,
    });

    const second = await reconcileSandboxRun(seeded.testEnv, null, {
      runId: SANDBOX_RUN_ID,
      nowMs: SANDBOX_NOW,
      trigger: SANDBOX_CLEANUP_TRIGGER.SCHEDULED,
    });

    expect(second.outcome).toBe('released');
    await expect(runRow()).resolves.toMatchObject({
      status: SANDBOX_RUN_STATUS.RELEASED,
      cleanup_phase: SANDBOX_CLEANUP_PHASE.RELEASED,
      dispatch_state: SANDBOX_COMPONENT_STATE.RELEASED,
      spp_state: SANDBOX_COMPONENT_STATE.RELEASED,
      spb_state: SANDBOX_COMPONENT_STATE.RELEASED,
      spl_relay_state: SANDBOX_COMPONENT_STATE.RELEASED,
      spl_binding_state: SANDBOX_COMPONENT_STATE.RELEASED,
    });
    expect(retirementAttempts).toBe(2);
  });

  it('converges after a partial R2 deletion without regressing other released components', async () => {
    const relay = makeRelayBinding();
    const seeded = await seedActiveRunResources({
      relay,
      createdAt: SANDBOX_NOW - 3_600_001,
    });
    const prefix = prefixFor(seeded.account.accountId, SANDBOX_INSTANCE_ID);
    const state = installPartialDeleteS3(seeded.testEnv, prefix);

    const first = await reconcileSandboxRun(seeded.testEnv, null, {
      runId: SANDBOX_RUN_ID,
      nowMs: SANDBOX_NOW,
      trigger: SANDBOX_CLEANUP_TRIGGER.SCHEDULED,
    });

    expect(first.outcome).toBe('failed');
    await expect(runRow()).resolves.toMatchObject({
      status: SANDBOX_RUN_STATUS.CLEANUP_FAILED,
      dispatch_state: SANDBOX_COMPONENT_STATE.RELEASED,
      spp_state: SANDBOX_COMPONENT_STATE.RELEASED,
      spb_state: SANDBOX_COMPONENT_STATE.CLEANUP_FAILED,
      spb_residual_code: SANDBOX_RESIDUAL_CODE.SPB_CLEANUP_RETRYABLE,
      spl_relay_state: SANDBOX_COMPONENT_STATE.RELEASED,
      spl_binding_state: SANDBOX_COMPONENT_STATE.RELEASED,
    });
    expect(state.objects).toEqual([`${prefix}second`]);

    const second = await reconcileSandboxRun(seeded.testEnv, null, {
      runId: SANDBOX_RUN_ID,
      nowMs: SANDBOX_NOW,
      trigger: SANDBOX_CLEANUP_TRIGGER.SCHEDULED,
    });

    expect(second.outcome).toBe('released');
    expect(state.objects).toEqual([]);
    await expect(runRow()).resolves.toMatchObject({
      status: SANDBOX_RUN_STATUS.RELEASED,
      cleanup_phase: SANDBOX_CLEANUP_PHASE.RELEASED,
    });
  });

  it('isolates a D1 failure mid-cleanup and converges on the next pass', async () => {
    const relay = makeRelayBinding();
    const seeded = await seedActiveRunResources({
      relay,
      createdAt: SANDBOX_NOW - 3_600_001,
    });
    installEmptyS3(seeded.testEnv);
    const firstEnv = failOnceOnSql(seeded.testEnv, /UPDATE spb_bindings\s+SET token_hash = NULL/i);

    const first = await reconcileSandboxRun(firstEnv, null, {
      runId: SANDBOX_RUN_ID,
      nowMs: SANDBOX_NOW,
      trigger: SANDBOX_CLEANUP_TRIGGER.SCHEDULED,
    });

    expect(first.outcome).toBe('failed');
    await expect(runRow()).resolves.toMatchObject({
      status: SANDBOX_RUN_STATUS.CLEANUP_FAILED,
      dispatch_state: SANDBOX_COMPONENT_STATE.RELEASED,
      spp_state: SANDBOX_COMPONENT_STATE.RELEASED,
      spb_state: SANDBOX_COMPONENT_STATE.CLEANUP_FAILED,
      spb_residual_code: SANDBOX_RESIDUAL_CODE.SPB_DENIAL_FAILED,
      spl_relay_state: SANDBOX_COMPONENT_STATE.RELEASED,
      spl_binding_state: SANDBOX_COMPONENT_STATE.RELEASED,
    });

    const second = await reconcileSandboxRun(seeded.testEnv, null, {
      runId: SANDBOX_RUN_ID,
      nowMs: SANDBOX_NOW,
      trigger: SANDBOX_CLEANUP_TRIGGER.SCHEDULED,
    });

    expect(second.outcome).toBe('released');
    await expect(runRow()).resolves.toMatchObject({
      status: SANDBOX_RUN_STATUS.RELEASED,
      cleanup_phase: SANDBOX_CLEANUP_PHASE.RELEASED,
    });
  });

  it('retries idempotently after relay success precedes durable component acknowledgement', async () => {
    const relay = makeRelayBinding();
    const seeded = await seedActiveRunResources({
      relay,
      createdAt: SANDBOX_NOW - 3_600_001,
    });
    installEmptyS3(seeded.testEnv);
    const firstEnv = failOnceOnSql(
      seeded.testEnv,
      /UPDATE sandbox_runs\s+SET spl_relay_state = \?/i
    );

    const first = await reconcileSandboxRun(firstEnv, null, {
      runId: SANDBOX_RUN_ID,
      nowMs: SANDBOX_NOW,
      trigger: SANDBOX_CLEANUP_TRIGGER.SCHEDULED,
    });

    expect(first.outcome).toBe('failed');
    await expect(runRow()).resolves.toMatchObject({
      status: SANDBOX_RUN_STATUS.CLEANUP_FAILED,
      cleanup_phase: SANDBOX_CLEANUP_PHASE.RELAY_INTENT,
      dispatch_state: SANDBOX_COMPONENT_STATE.RELEASED,
      spp_state: SANDBOX_COMPONENT_STATE.RELEASED,
      spl_relay_state: SANDBOX_COMPONENT_STATE.DENY_PENDING,
    });
    expect(relay.calls.filter(({ method }) => method === 'DELETE')).toHaveLength(1);

    const second = await reconcileSandboxRun(seeded.testEnv, null, {
      runId: SANDBOX_RUN_ID,
      nowMs: SANDBOX_NOW,
      trigger: SANDBOX_CLEANUP_TRIGGER.SCHEDULED,
    });

    expect(second.outcome).toBe('released');
    expect(relay.calls.filter(({ method }) => method === 'DELETE')).toHaveLength(2);
    await expect(runRow()).resolves.toMatchObject({
      status: SANDBOX_RUN_STATUS.RELEASED,
      cleanup_phase: SANDBOX_CLEANUP_PHASE.RELEASED,
      dispatch_state: SANDBOX_COMPONENT_STATE.RELEASED,
      spp_state: SANDBOX_COMPONENT_STATE.RELEASED,
      spb_state: SANDBOX_COMPONENT_STATE.RELEASED,
      spl_relay_state: SANDBOX_COMPONENT_STATE.RELEASED,
      spl_binding_state: SANDBOX_COMPONENT_STATE.RELEASED,
    });
  });
});

async function seedActiveRunResources({
  relay,
  spbCredentialExpiresAt = null,
  createdAt = SANDBOX_NOW - 1_000,
}) {
  const baseEnv = makeTestEnv();
  const account = await seedAccount({ testEnv: baseEnv, nowMs: createdAt });
  await seedSandboxRun({
    runId: SANDBOX_RUN_ID,
    accountId: account.accountId,
    instanceId: SANDBOX_INSTANCE_ID,
    createdAt,
  });
  await workerEnv.DB.prepare(
    `INSERT INTO account_dispatch_tokens (
       token_hash, account_id, created_at, revoked_at, sandbox_run_id
     ) VALUES ('sandbox-dispatch-hash', ?, ?, NULL, ?)`
  ).bind(account.accountId, createdAt, SANDBOX_RUN_ID).run();
  await seedSplBinding({
    accountId: account.accountId,
    instanceId: SANDBOX_INSTANCE_ID,
    createdAt,
    sandboxRunId: SANDBOX_RUN_ID,
  });
  await seedSppBinding({
    accountId: account.accountId,
    instanceId: SANDBOX_INSTANCE_ID,
    tokenHash: 'sandbox-spp-hash',
    createdAt,
    sandboxRunId: SANDBOX_RUN_ID,
  });
  await seedSpbBinding({
    accountId: account.accountId,
    instanceId: SANDBOX_INSTANCE_ID,
    tokenHash: 'sandbox-spb-hash',
    createdAt,
    sandboxRunId: SANDBOX_RUN_ID,
    sandboxCredentialExpiresAt: spbCredentialExpiresAt,
  });
  return {
    account,
    testEnv: {
      ...baseEnv,
      SANDBOX_ACCOUNT_ID: account.accountId,
      RELAY: relay.binding,
    },
  };
}

function installEmptyS3(testEnv) {
  return installS3FetchMock(testEnv, {
    default: ({ method, url }) => {
      if (method === 'GET' && url.searchParams.get('list-type') === '2') {
        return xmlResponse('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>');
      }
      if (method === 'GET' && url.searchParams.has('uploads')) {
        return xmlResponse('<ListMultipartUploadsResult><IsTruncated>false</IsTruncated></ListMultipartUploadsResult>');
      }
      throw new Error(`unexpected R2 request: ${method}`);
    },
  });
}

function installPartialDeleteS3(testEnv, prefix) {
  const state = {
    objects: [`${prefix}first`, `${prefix}second`],
    partialPending: true,
  };
  installS3FetchMock(testEnv, {
    default: ({ method, url, bodyText }) => {
      if (method === 'GET' && url.searchParams.get('list-type') === '2') {
        return xmlResponse(
          `<ListBucketResult><IsTruncated>false</IsTruncated>${state.objects
            .map((key) => `<Contents><Key>${key}</Key></Contents>`)
            .join('')}</ListBucketResult>`
        );
      }
      if (method === 'GET' && url.searchParams.has('uploads')) {
        return xmlResponse('<ListMultipartUploadsResult><IsTruncated>false</IsTruncated></ListMultipartUploadsResult>');
      }
      if (method === 'POST' && url.searchParams.has('delete')) {
        const keys = Array.from(bodyText.matchAll(/<Key>([^<]+)<\/Key>/g), (match) => match[1]);
        if (state.partialPending) {
          state.partialPending = false;
          state.objects = state.objects.filter((key) => key !== keys[0]);
          return xmlResponse(
            `<DeleteResult><Deleted><Key>${keys[0]}</Key></Deleted><Error><Key>${keys[1]}</Key><Code>InternalError</Code><Message>partial failure</Message></Error></DeleteResult>`
          );
        }
        state.objects = state.objects.filter((key) => !keys.includes(key));
        return xmlResponse(
          `<DeleteResult>${keys.map((key) => `<Deleted><Key>${key}</Key></Deleted>`).join('')}</DeleteResult>`
        );
      }
      throw new Error(`unexpected R2 request: ${method}`);
    },
  });
  return state;
}

function failOnceOnSql(testEnv, pattern) {
  let shouldFail = true;
  return {
    ...testEnv,
    DB: {
      prepare(sql) {
        const statement = testEnv.DB.prepare(sql);
        if (!pattern.test(sql)) return statement;
        return {
          bind(...values) {
            const bound = statement.bind(...values);
            return {
              run: (...args) => bound.run(...args),
              first: (...args) => bound.first(...args),
              async all(...args) {
                if (shouldFail) {
                  shouldFail = false;
                  throw new Error('injected db failure');
                }
                return bound.all(...args);
              },
            };
          },
        };
      },
      batch(statements) {
        return testEnv.DB.batch(statements);
      },
    },
  };
}

function interleaveLocalPostconditionRead(testEnv, targetRead, timing, callback) {
  const baseDb = testEnv.DB;
  let reads = 0;
  return {
    ...testEnv,
    DB: {
      prepare(sql) {
        const statement = baseDb.prepare(sql);
        if (!/EXISTS\(SELECT 1 FROM accounts WHERE id = \?\) AS account_present/i.test(sql)) {
          return statement;
        }
        return {
          bind(...values) {
            const bound = statement.bind(...values);
            return {
              run: (...args) => bound.run(...args),
              all: (...args) => bound.all(...args),
              async first(...args) {
                reads += 1;
                if (reads === targetRead && timing === 'before') await callback(baseDb);
                const row = await bound.first(...args);
                if (reads === targetRead && timing === 'after') await callback(baseDb);
                return row;
              },
            };
          },
        };
      },
      batch(statements) {
        return baseDb.batch(statements);
      },
    },
  };
}

function xmlResponse(body) {
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function runRow() {
  return workerEnv.DB.prepare('SELECT * FROM sandbox_runs WHERE run_id = ?')
    .bind(SANDBOX_RUN_ID)
    .first();
}

async function bindingCount(table) {
  const row = await workerEnv.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
  return Number(row.count);
}

async function activeDispatchCount() {
  const row = await workerEnv.DB.prepare(
    'SELECT COUNT(*) AS count FROM account_dispatch_tokens WHERE revoked_at IS NULL'
  ).first();
  return Number(row.count);
}
