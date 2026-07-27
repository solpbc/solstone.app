import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import contractArtifact from '../docs/sandbox-run-contract-v1.json?raw';
import worker from '../src/index.js';
import {
  isSandboxRunCreateResponse,
  isSandboxRunCapability,
  isSandboxRunComponentReport,
  isSandboxRunErrorBody,
  isSandboxOuterAdminEnvelope,
  isSandboxRunReport,
  isSandboxRunRow,
  orderedObject,
  renderSandboxRunReport,
  sandboxRunErrorBody,
  SANDBOX_ADMIN_SECURITY_HEADER_DESCRIPTORS,
  SANDBOX_CAPABILITIES_KEYS,
  SANDBOX_CLEANUP_PHASE,
  SANDBOX_COMPONENT_REPORT_KEYS,
  SANDBOX_COMPONENT_STATE,
  SANDBOX_COMPONENTS,
  SANDBOX_ERROR,
  SANDBOX_LEASE_TTL_MS,
  SANDBOX_OUTER_ADMIN_ENVELOPE,
  SANDBOX_PROVISIONING_PHASE,
  SANDBOX_REPORT_KEYS,
  SANDBOX_RESPONSE_HEADER_DESCRIPTORS,
  SANDBOX_RESIDUAL_CODE,
  SANDBOX_RUN_STATUS,
} from '../src/sandbox-run-contract.js';
import {
  dbDumpText,
  installConsoleSpy,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedSandboxRun,
} from './helpers.js';
import { installJwksStub, installJwksStubWith, mintToken } from './jwks-helper.js';
import {
  emptyS3Response,
  makeRelayBinding,
  SANDBOX_INSTANCE_ID,
  SANDBOX_NOW,
  SANDBOX_RUN_ID,
  sandboxRequest,
  seedSandboxBaseline,
  validSandboxInput,
} from './sandbox-run-test-helpers.js';

const publishedContract = JSON.parse(contractArtifact);

describe('sandbox-run generated contract route', () => {
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

  it('serves the exact committed bytes and headers independently of sandbox runtime state', async () => {
    await installJwksStubWith(() => {
      throw new Error('contract route reached non-JWKS fetch');
    });
    const token = await mintToken();
    const envs = [
      { CF_ACCESS_AUD: makeTestEnv().CF_ACCESS_AUD },
      makeTestEnv(),
      poisonContractEnvironment(makeTestEnv().CF_ACCESS_AUD),
    ];

    const responses = [];
    for (const [index, testEnv] of envs.entries()) {
      const consolePoisons = index === 2
        ? ['error', 'warn', 'log', 'info'].map((level) => (
            vi.spyOn(console, level).mockImplementation(() => {
              throw new Error(`contract route called console.${level}`);
            })
          ))
        : [];
      try {
        const response = await worker.fetch(
          sandboxRequest('/admin/sandbox-runs/contract', token),
          testEnv
        );
        responses.push(await responseSnapshot(response));
      } finally {
        for (const poison of consolePoisons) poison.mockRestore();
      }
    }

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.body).toBe(contractArtifact);
      expect(response.headers).toEqual(expectedHeaders(SANDBOX_RESPONSE_HEADER_DESCRIPTORS));
    }
    expect(responses[1]).toEqual(responses[0]);
    expect(responses[2]).toEqual(responses[0]);
  });

  it('keeps Access first, rejects every non-exact route as uniform 404, and mirrors GET for HEAD', async () => {
    await installJwksStub();
    const token = await mintToken();
    const testEnv = { CF_ACCESS_AUD: makeTestEnv().CF_ACCESS_AUD };

    const accessRequired = await worker.fetch(
      sandboxRequest('/admin/sandbox-runs/contract', null),
      testEnv
    );
    await expectOuterEnvelope(accessRequired, SANDBOX_OUTER_ADMIN_ENVELOPE.ACCESS_REQUIRED);
    const nonSandboxAccessRequired = await worker.fetch(
      sandboxRequest('/admin/accounts', null),
      testEnv
    );
    await expectOuterEnvelope(
      nonSandboxAccessRequired,
      SANDBOX_OUTER_ADMIN_ENVELOPE.ACCESS_REQUIRED
    );
    const nonSandboxNotFound = await worker.fetch(
      sandboxRequest('/admin/contract-parity-unknown', token),
      testEnv
    );
    await expectOuterEnvelope(nonSandboxNotFound, SANDBOX_OUTER_ADMIN_ENVELOPE.NOT_FOUND);

    for (const [path, method] of [
      ['/admin/sandbox-runs/contract?version=1', 'GET'],
      ['/admin/sandbox-runs/contract/extra', 'GET'],
      ['/admin/sandbox-runs/contract', 'POST'],
      ['/admin/sandbox-runs/contract', 'DELETE'],
    ]) {
      const response = await worker.fetch(sandboxRequest(path, token, { method }), testEnv);
      await expectOuterEnvelope(response, SANDBOX_OUTER_ADMIN_ENVELOPE.NOT_FOUND);
    }

    const canonical = await worker.fetch(
      sandboxRequest('/admin/sandbox-runs/contract', token),
      testEnv
    );
    const emptyQuery = await worker.fetch(
      sandboxRequest('/admin/sandbox-runs/contract?', token),
      testEnv
    );
    expect(await responseSnapshot(emptyQuery)).toEqual(await responseSnapshot(canonical));

    const get = await worker.fetch(sandboxRequest('/admin/sandbox-runs/contract', token), testEnv);
    const head = await worker.fetch(
      sandboxRequest('/admin/sandbox-runs/contract', token, { method: 'HEAD' }),
      testEnv
    );
    expect(head.status).toBe(get.status);
    expect(headerEntries(head.headers)).toEqual(headerEntries(get.headers));
    await expect(head.text()).resolves.toBe('');
  });

  it('publishes operation-specific success, absence, and error references', () => {
    expect(publishedContract.operations).toEqual({
      common_access: {
        required_before_route_resolution: true,
        failure: 'errors.outer_admin.access_required',
      },
      contract_get: {
        method: 'GET',
        path: '/admin/sandbox-runs/contract',
        query: 'must-be-empty',
        success: { status: 200, body: 'this-artifact' },
        non_exact_route: 'errors.outer_admin.not_found',
      },
      create: {
        method: 'POST',
        path: '/admin/sandbox-runs',
        success: { status: 201, body: 'responses.create' },
        response_identity: [
          { request_field: 'run_id', response_field: 'run_id' },
          { request_field: 'instance_id', response_field: 'capabilities.spb.instance_id' },
        ],
        errors: {
          invalid_request: 'errors.sandbox.invalid_request',
          conflict: 'errors.sandbox.conflict',
          unavailable: 'errors.sandbox.unavailable',
        },
      },
      report_get: {
        method: 'GET',
        path: '/admin/sandbox-runs/{run_id}',
        success: { status: 200, body: 'responses.report' },
        absent: 'errors.sandbox.not_found',
        unavailable: 'errors.sandbox.unavailable',
      },
      cleanup_delete: {
        method: 'DELETE',
        path: '/admin/sandbox-runs/{run_id}',
        success: {
          released: { status: 200, body: 'responses.report' },
          expiry_only: { status: 202, body: 'responses.report' },
        },
        absent: 'errors.outer_admin.not_found',
        errors: {
          initial_unavailable: 'errors.sandbox.unavailable',
          conflict: 'errors.sandbox.cleanup_conflict',
          cleanup_unavailable: 'errors.sandbox.cleanup_unavailable',
        },
      },
      head: { behavior: 'global-get-mirror-with-empty-body' },
    });
    for (const reference of contractReferences(publishedContract.operations)) {
      expect(resolveContractReference(reference)).toBeDefined();
    }
  });
});

describe('sandbox-run contract validators', () => {
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

  it('accepts real POST and report objects and rejects every ordered-shape permutation', async () => {
    const token = await mintToken();
    const baseline = await seedSandboxBaseline();
    const created = await worker.fetch(
      sandboxRequest('/admin/sandbox-runs', token, {
        method: 'POST',
        body: validSandboxInput(),
      }),
      baseline.testEnv
    );
    const createBody = await created.json();
    expect(isSandboxRunCreateResponse(createBody)).toBe(true);
    for (const name of SANDBOX_CAPABILITIES_KEYS) {
      expect(isSandboxRunCapability(createBody.capabilities[name], name)).toBe(true);
    }
    expect(isSandboxRunCreateResponse(reverseObject(createBody))).toBe(false);
    for (const name of SANDBOX_CAPABILITIES_KEYS) {
      const malformed = structuredClone(createBody);
      malformed.capabilities[name] = reverseObject(malformed.capabilities[name]);
      expect(isSandboxRunCreateResponse(malformed)).toBe(false);
    }
    const relationshipMutations = [
      (body) => { body.capabilities.spb.account_id = SANDBOX_RUN_ID; },
      (body) => {
        body.capabilities.spl.approved_at = new Date(
          Date.parse(body.capabilities.spl.approved_at) + 1
        ).toISOString();
      },
      (body) => { body.lease_expires_at += 1; },
      (body) => { body.capabilities.spb.broker_endpoint += '/'; },
      (body) => { body.capabilities.spb.prefix += 'extra/'; },
    ];
    for (const mutate of relationshipMutations) {
      const malformed = structuredClone(createBody);
      mutate(malformed);
      expect(isSandboxRunCreateResponse(malformed)).toBe(false);
    }

    const row = await runRow();
    const report = renderSandboxRunReport(row, SANDBOX_NOW);
    expect(isSandboxRunRow(row, {
      runId: SANDBOX_RUN_ID,
      accountId: baseline.account.accountId,
    })).toBe(true);
    expect(isSandboxRunReport(report, { row, nowMs: SANDBOX_NOW })).toBe(true);
    expect(Object.keys(report)).toEqual(SANDBOX_REPORT_KEYS);
    for (const [index, component] of report.components.entries()) {
      expect(isSandboxRunComponentReport(component, SANDBOX_COMPONENTS[index])).toBe(true);
    }
    expect(isSandboxRunReport(reverseObject(report))).toBe(false);

    const wrongComponentOrder = structuredClone(report);
    wrongComponentOrder.components.reverse();
    expect(isSandboxRunReport(wrongComponentOrder)).toBe(false);
    const unknownComponent = structuredClone(report);
    unknownComponent.components[0].component = 'unknown_component';
    expect(isSandboxRunReport(unknownComponent)).toBe(false);
    const wrongComponentKeys = structuredClone(report);
    wrongComponentKeys.components[0] = reverseObject(wrongComponentKeys.components[0]);
    expect(Object.keys(report.components[0])).toEqual(SANDBOX_COMPONENT_REPORT_KEYS);
    expect(isSandboxRunReport(wrongComponentKeys)).toBe(false);
    const impossibleRetry = structuredClone(report);
    impossibleRetry.retry_after_seconds = 1;
    expect(isSandboxRunReport(impossibleRetry)).toBe(false);
    const impossibleExpiredProjection = structuredClone(report);
    impossibleExpiredProjection.status = SANDBOX_RUN_STATUS.PROVISIONING;
    impossibleExpiredProjection.provisioning_phase = SANDBOX_PROVISIONING_PHASE.CREATED;
    impossibleExpiredProjection.lease_live = false;
    for (const component of impossibleExpiredProjection.components) {
      component.state = SANDBOX_COMPONENT_STATE.DENY_PENDING;
      component.residual_code = SANDBOX_RESIDUAL_CODE.LEASE_EXPIRED;
    }
    expect(isSandboxRunReport(impossibleExpiredProjection)).toBe(false);
    const missingReportField = structuredClone(report);
    delete missingReportField.cleanup_phase;
    expect(isSandboxRunReport(missingReportField)).toBe(false);
    const extraReportField = { ...report, extra: true };
    expect(isSandboxRunReport(extraReportField)).toBe(false);

    const expiredRow = {
      ...row,
      created_at: SANDBOX_NOW - SANDBOX_LEASE_TTL_MS - 1,
      lease_expires_at: SANDBOX_NOW - 1,
    };
    const expiredReport = renderSandboxRunReport(expiredRow, SANDBOX_NOW);
    const expiredRule = publishedContract.report_rules.expired_active_component_projection;
    expect(expiredRule.mutates_storage).toBe(false);
    expect(expiredReport.lease_live).toBe(expiredRule.when.lease_live);
    for (const component of expiredReport.components) {
      expect(component.state).toBe(expiredRule.report.state);
      expect(component.residual_code).toBe(expiredRule.report.residual_code);
    }
    expect(isSandboxRunReport(expiredReport, { row: expiredRow, nowMs: SANDBOX_NOW })).toBe(true);

    const farFutureSeconds = 9_000_000;
    const expiryRow = {
      ...row,
      status: SANDBOX_RUN_STATUS.EXPIRY_PENDING,
      cleanup_phase: SANDBOX_CLEANUP_PHASE.VERIFY,
      spb_retry_not_before: SANDBOX_NOW + farFutureSeconds * 1000,
      last_residual_code: SANDBOX_RESIDUAL_CODE.SPB_CREDENTIAL_EXPIRY_PENDING,
      dispatch_state: SANDBOX_COMPONENT_STATE.RELEASED,
      spp_state: SANDBOX_COMPONENT_STATE.RELEASED,
      spb_state: SANDBOX_COMPONENT_STATE.PURGE_PENDING,
      spb_residual_code: SANDBOX_RESIDUAL_CODE.SPB_CREDENTIAL_EXPIRY_PENDING,
      spl_relay_state: SANDBOX_COMPONENT_STATE.RELEASED,
      spl_binding_state: SANDBOX_COMPONENT_STATE.RELEASED,
    };
    const expiryReport = renderSandboxRunReport(expiryRow, SANDBOX_NOW);
    const expiryRule = publishedContract.report_rules.delete_accepted_expiry_only;
    expect(expiryRule.response_status).toBe(202);
    expect(expiryReport.status).toBe(expiryRule.report_status);
    expect(expiryReport.retry_after_seconds).toBe(farFutureSeconds);
    expect(expiryRule.retry_after_header).toEqual({
      name: 'Retry-After',
      decimal_equals_field: 'retry_after_seconds',
    });
    for (const component of expiryReport.components) {
      expect(component).toMatchObject(expiryRule.components[component.component]);
    }
    expect(isSandboxRunReport(expiryReport, { row: expiryRow, nowMs: SANDBOX_NOW })).toBe(true);
  });

  it('validates every exact sandbox and outer-admin error envelope', () => {
    for (const descriptor of Object.values(SANDBOX_ERROR)) {
      const body = sandboxRunErrorBody(descriptor, SANDBOX_RUN_ID);
      expect(isSandboxRunErrorBody(body, descriptor, SANDBOX_RUN_ID)).toBe(true);
      expect(isSandboxRunErrorBody(reverseObject(body), descriptor, SANDBOX_RUN_ID)).toBe(false);
    }
    for (const descriptor of Object.values(SANDBOX_OUTER_ADMIN_ENVELOPE)) {
      const body = orderedObject(descriptor.fields, [descriptor.error]);
      expect(isSandboxOuterAdminEnvelope(body, descriptor)).toBe(true);
      expect(isSandboxOuterAdminEnvelope({ ...body, extra: true }, descriptor)).toBe(false);
    }
  });

  it.each([
    ['unknown status', (row) => { row.status = 'unknown_status'; }],
    ['unknown provisioning phase', (row) => { row.provisioning_phase = 'unknown_phase'; }],
    ['unknown cleanup phase', (row) => { row.cleanup_phase = 'unknown_phase'; }],
    ['unknown component state', (row) => { row.dispatch_state = 'unknown_state'; }],
    ['unknown component residual', (row) => {
      row.dispatch_state = SANDBOX_COMPONENT_STATE.CLEANUP_FAILED;
      row.dispatch_residual_code = 'unknown_residual';
    }],
    ['invalid nullability', (row) => { row.instance_id = null; }],
    ['extra row field', (row) => { row.extra = true; }],
  ])('fails a poisoned GET closed without mutation or disclosure: %s', async (_name, mutate) => {
    const token = await mintToken();
    const baseEnv = makeTestEnv();
    const account = await seedAccount({ testEnv: baseEnv });
    await seedSandboxRun({
      runId: SANDBOX_RUN_ID,
      accountId: account.accountId,
      instanceId: SANDBOX_INSTANCE_ID,
      createdAt: SANDBOX_NOW,
    });
    const before = await dbDumpText();
    const consoleSpy = installConsoleSpy();
    const malformedMarker = `malformed-${_name}`;
    const testEnv = {
      ...baseEnv,
      SANDBOX_ACCOUNT_ID: account.accountId,
      DB: poisonScopedRead(baseEnv.DB, (row) => {
        const clone = { ...row };
        mutate(clone);
        clone.last_residual_code ??= null;
        return clone;
      }),
    };
    try {
      const response = await worker.fetch(
        sandboxRequest(`/admin/sandbox-runs/${SANDBOX_RUN_ID}`, token),
        testEnv
      );
      expect(response.status).toBe(SANDBOX_ERROR.UNAVAILABLE.status);
      const text = await response.text();
      expect(text).toBe(JSON.stringify(
        sandboxRunErrorBody(SANDBOX_ERROR.UNAVAILABLE, SANDBOX_RUN_ID)
      ));
      expect(text).not.toContain('unknown_');
      expect(text).not.toContain(malformedMarker);
      await expect(dbDumpText()).resolves.toBe(before);
      consoleSpy.assertNoSecrets([
        'unknown_status',
        'unknown_phase',
        'unknown_state',
        'unknown_residual',
        account.accountId,
        SANDBOX_RUN_ID,
        SANDBOX_INSTANCE_ID,
      ]);
    } finally {
      consoleSpy.restore();
    }
  });

  it.each([
    ['wrong integer affinity', { updatedAt: 'not-an-integer' }],
    ['impossible released evidence', {
      status: SANDBOX_RUN_STATUS.RELEASED,
      cleanupPhase: SANDBOX_CLEANUP_PHASE.RELEASED,
      completedAt: SANDBOX_NOW,
    }],
  ])('rejects a legally insertable adversarial row: %s', async (_name, overrides) => {
    const token = await mintToken();
    const baseEnv = makeTestEnv();
    const account = await seedAccount({ testEnv: baseEnv });
    await seedSandboxRun({
      runId: SANDBOX_RUN_ID,
      accountId: account.accountId,
      instanceId: SANDBOX_INSTANCE_ID,
      createdAt: SANDBOX_NOW,
      ...overrides,
    });
    const before = await dbDumpText();
    const response = await worker.fetch(
      sandboxRequest(`/admin/sandbox-runs/${SANDBOX_RUN_ID}`, token),
      { ...baseEnv, SANDBOX_ACCOUNT_ID: account.accountId }
    );
    expect(response.status).toBe(503);
    await expect(dbDumpText()).resolves.toBe(before);
  });
});

describe('sandbox-run DELETE malformed-row provenance', () => {
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

  it('validates an early terminal row returned by the reconciler initial read', async () => {
    const seeded = await createActiveRun();
    const first = await deleteRun(seeded);
    expect(first.status).toBe(200);
    const baseDb = seeded.testEnv.DB;
    const before = await dbDumpText();
    seeded.testEnv.DB = poisonUnscopedRead(baseDb, 1, malformedRow);

    const response = await deleteRun(seeded);
    await expectCleanupUnavailable(response);
    await expect(dbDumpText()).resolves.toBe(before);

    seeded.testEnv.DB = baseDb;
    expect((await deleteRun(seeded)).status).toBe(200);
  });

  it('validates the claim-loss reread after preserving a durable cleanup request', async () => {
    const seeded = await createActiveRun();
    const baseDb = seeded.testEnv.DB;
    seeded.testEnv.DB = claimLossPoisonDb(baseDb, { poisonFallback: false });

    const response = await deleteRun(seeded);
    await expectCleanupUnavailable(response);
    const durable = await runRow();
    expect(durable.status).toBe(SANDBOX_RUN_STATUS.CLEANUP_REQUIRED);

    seeded.testEnv.DB = baseDb;
    expect((await deleteRun(seeded)).status).toBe(200);
  });

  it('validates the final SELECT while prior component writes remain durable and retryable', async () => {
    const seeded = await createActiveRun();
    const baseDb = seeded.testEnv.DB;
    seeded.testEnv.DB = finalSelectPoisonDb(baseDb);

    const response = await deleteRun(seeded);
    await expectCleanupUnavailable(response);
    const durable = await runRow();
    expect(durable.status).toBe(SANDBOX_RUN_STATUS.CLEANING);
    expect(durable.cleanup_phase).toBe(SANDBOX_CLEANUP_PHASE.VERIFY);
    expect(durable.dispatch_state).toBe(SANDBOX_COMPONENT_STATE.RELEASED);

    seeded.testEnv.DB = baseDb;
    expect((await deleteRun(seeded)).status).toBe(200);
  });

  it('validates a malformed disposition UPDATE RETURNING row without losing its durable evidence', async () => {
    const residualRelay = makeRelayBinding({
      onCall(call) {
        if (call.method !== 'DELETE') return null;
        return new Response(JSON.stringify({
          entry_denial_verified: true,
          sockets_closed: false,
          devices_revoked: true,
          entitlement_cleared: true,
          pending_grants_cleared: true,
          tombstone_verified: true,
          failed_component: 'instance_do_cleanup',
        }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      },
    });
    const seeded = await createActiveRun({ relay: residualRelay });
    const baseDb = seeded.testEnv.DB;
    seeded.testEnv.DB = dispositionReturningPoisonDb(baseDb);

    const response = await deleteRun(seeded);
    await expectCleanupUnavailable(response);
    const durable = await runRow();
    expect(durable.status).toBe(SANDBOX_RUN_STATUS.CLEANUP_FAILED);
    expect(durable.spl_relay_residual_code).toBe(SANDBOX_RESIDUAL_CODE.RELAY_INSTANCE_DO_CLEANUP);

    seeded.testEnv.DB = baseDb;
    seeded.testEnv.RELAY = makeRelayBinding().binding;
    expect((await deleteRun(seeded)).status).toBe(200);
  });

  it('validates the handler fallback scoped read after preserving a durable cleanup request', async () => {
    const seeded = await createActiveRun();
    const baseDb = seeded.testEnv.DB;
    seeded.testEnv.DB = claimLossPoisonDb(baseDb, { poisonFallback: true });

    const response = await deleteRun(seeded);
    await expectCleanupUnavailable(response);
    const durable = await runRow();
    expect(durable.status).toBe(SANDBOX_RUN_STATUS.CLEANUP_REQUIRED);

    seeded.testEnv.DB = baseDb;
    expect((await deleteRun(seeded)).status).toBe(200);
  });
});

function poisonContractEnvironment(audience) {
  const value = { CF_ACCESS_AUD: audience };
  for (const name of ['DB', 'RELAY', 'GCP_TOKEN_CACHE', 'SANDBOX_ACCOUNT_ID']) {
    Object.defineProperty(value, name, {
      enumerable: true,
      get() {
        throw new Error(`contract route read ${name}`);
      },
    });
  }
  return value;
}

function expectedHeaders(descriptors) {
  return descriptors
    .map(({ name, value }) => [name.toLowerCase(), value])
    .sort(([left], [right]) => left.localeCompare(right));
}

function headerEntries(headers) {
  return [...headers.entries()].sort(([left], [right]) => left.localeCompare(right));
}

async function responseSnapshot(response) {
  return {
    status: response.status,
    headers: headerEntries(response.headers),
    body: await response.text(),
  };
}

async function expectOuterEnvelope(response, descriptor) {
  expect(response.status).toBe(descriptor.status);
  const body = await response.text();
  expect(body).toBe(JSON.stringify(orderedObject(descriptor.fields, [descriptor.error])));
  expect(isSandboxOuterAdminEnvelope(JSON.parse(body), descriptor)).toBe(true);
  expect(headerEntries(response.headers)).toEqual(expectedHeaders([
    ...SANDBOX_ADMIN_SECURITY_HEADER_DESCRIPTORS,
    { name: 'Content-Type', value: 'application/json' },
    { name: 'Cache-Control', value: 'no-store' },
  ]));
}

function reverseObject(value) {
  return Object.fromEntries(Object.entries(value).reverse());
}

function contractReferences(value) {
  if (typeof value === 'string') return value.startsWith('errors.') ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(contractReferences);
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(contractReferences);
}

function resolveContractReference(reference) {
  return reference.split('.').reduce((value, key) => value?.[key], publishedContract);
}

function poisonScopedRead(baseDb, mutate) {
  return proxyDb(baseDb, (sql, statement) => {
    if (!/^SELECT \* FROM sandbox_runs WHERE run_id = \? AND account_id = \?$/i.test(sql)) return null;
    return {
      bind(...values) {
        const bound = statement.bind(...values);
        return {
          async first() {
            const row = await bound.first();
            return row ? mutate(row) : null;
          },
        };
      },
    };
  });
}

function poisonUnscopedRead(baseDb, targetRead, mutate) {
  let reads = 0;
  return proxyDb(baseDb, (sql, statement) => {
    if (!/^SELECT \* FROM sandbox_runs WHERE run_id = \?$/i.test(sql)) return null;
    return {
      bind(...values) {
        const bound = statement.bind(...values);
        return {
          async first() {
            const row = await bound.first();
            reads += 1;
            return row && reads === targetRead ? mutate(row) : row;
          },
        };
      },
    };
  });
}

function claimLossPoisonDb(baseDb, { poisonFallback }) {
  let unscopedReads = 0;
  let scopedReads = 0;
  return proxyDb(baseDb, (sql, statement) => {
    if (/UPDATE sandbox_runs\s+SET status = 'cleaning'/i.test(sql)) {
      return { bind() { return { async all() { return { results: [] }; } }; } };
    }
    if (/^SELECT \* FROM sandbox_runs WHERE run_id = \?$/i.test(sql)) {
      return {
        bind(...values) {
          const bound = statement.bind(...values);
          return {
            async first() {
              unscopedReads += 1;
              if (unscopedReads === 2) {
                const row = await bound.first();
                return poisonFallback ? null : malformedRow(row);
              }
              return bound.first();
            },
          };
        },
      };
    }
    if (poisonFallback && /^SELECT \* FROM sandbox_runs WHERE run_id = \? AND account_id = \?$/i.test(sql)) {
      return {
        bind(...values) {
          const bound = statement.bind(...values);
          return {
            async first() {
              scopedReads += 1;
              const row = await bound.first();
              return scopedReads === 2 ? malformedRow(row) : row;
            },
          };
        },
      };
    }
    return null;
  });
}

function finalSelectPoisonDb(baseDb) {
  let unscopedReads = 0;
  let poisoned = false;
  return proxyDb(baseDb, (sql, statement) => {
    if (/^SELECT \* FROM sandbox_runs WHERE run_id = \?$/i.test(sql)) {
      return {
        bind(...values) {
          const bound = statement.bind(...values);
          return {
            async first() {
              const row = await bound.first();
              unscopedReads += 1;
              if (unscopedReads === 2) {
                poisoned = true;
                return malformedRow(row);
              }
              return row;
            },
          };
        },
      };
    }
    if (poisoned && /UPDATE sandbox_runs\s+SET status = (?:'released'|\?)/i.test(sql)) {
      return { bind() { return { async all() { return { results: [] }; } }; } };
    }
    return null;
  });
}

function dispositionReturningPoisonDb(baseDb) {
  return proxyDb(baseDb, (sql, statement) => {
    if (!/UPDATE sandbox_runs\s+SET status = \?, last_residual_code = \?/i.test(sql)) return null;
    return {
      bind(...values) {
        const bound = statement.bind(...values);
        return {
          async all() {
            const result = await bound.all();
            return {
              ...result,
              results: result.results.map(malformedRow),
            };
          },
        };
      },
    };
  });
}

function proxyDb(baseDb, match) {
  return {
    prepare(sql) {
      const statement = baseDb.prepare(sql);
      return match(sql, statement) || statement;
    },
    batch(statements) {
      return baseDb.batch(statements);
    },
  };
}

function malformedRow(row) {
  return { ...row, dispatch_state: 'unknown_state' };
}

async function createActiveRun({ relay = makeRelayBinding() } = {}) {
  await installJwksStubWith(async (input) => emptyS3Response(input));
  const token = await mintToken();
  const baseline = await seedSandboxBaseline({ relay });
  const response = await worker.fetch(
    sandboxRequest('/admin/sandbox-runs', token, {
      method: 'POST',
      body: validSandboxInput(),
    }),
    baseline.testEnv
  );
  expect(response.status).toBe(201);
  return { ...baseline, token };
}

async function deleteRun(seeded) {
  const consoleSpy = installConsoleSpy();
  try {
    const response = await worker.fetch(
      sandboxRequest(`/admin/sandbox-runs/${SANDBOX_RUN_ID}`, seeded.token, { method: 'DELETE' }),
      seeded.testEnv
    );
    consoleSpy.assertNoSecrets([
      'unknown_state',
      seeded.account.accountId,
      SANDBOX_RUN_ID,
      SANDBOX_INSTANCE_ID,
    ]);
    return response;
  } finally {
    consoleSpy.restore();
  }
}

async function expectCleanupUnavailable(response) {
  expect(response.status).toBe(SANDBOX_ERROR.CLEANUP_UNAVAILABLE.status);
  await expect(response.json()).resolves.toEqual(
    sandboxRunErrorBody(SANDBOX_ERROR.CLEANUP_UNAVAILABLE, SANDBOX_RUN_ID)
  );
}

function runRow() {
  return workerEnv.DB.prepare('SELECT * FROM sandbox_runs WHERE run_id = ?').bind(SANDBOX_RUN_ID).first();
}
