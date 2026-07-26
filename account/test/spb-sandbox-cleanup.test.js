import {
  createExecutionContext,
  env as workerEnv,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupSpbSandboxBinding } from '../src/spb-sandbox-lifecycle.js';
import { mintSandboxMaintenanceCredential } from '../src/r2-credential.js';
import { prefixFor } from '../src/spb-broker.js';
import {
  installConsoleSpy,
  installS3FetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedSpbBinding,
} from './helpers.js';

const NOW = 1_700_000_000_000;
const RUN_A = 'aaaaaaaa-1111-1111-1111-111111111111';
const RUN_B = 'bbbbbbbb-2222-2222-2222-222222222222';
const INSTANCE_A = '11111111-1111-1111-1111-111111111111';
const INSTANCE_B = '22222222-2222-2222-2222-222222222222';
const INSTANCE_C = '33333333-3333-3333-3333-333333333333';
const INSTANCE_D = '44444444-4444-4444-4444-444444444444';
const HUB_URL = 'https://extro.solpbc.org/hooks/security';

describe('SPB sandbox cleanup', () => {
  let consoleSpy;

  beforeEach(async () => {
    await resetDb();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    consoleSpy = installConsoleSpy();
  });

  afterEach(() => {
    consoleSpy.restore();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('cleans an empty prefix only after a distinct fresh max-keys verifier readback', async () => {
    const hubCalls = [];
    const testEnv = makeTestEnv({
      HUB_WEBHOOK_URL: HUB_URL,
      HUB_WEBHOOK_SECRET: 'hub-secret',
    });
    const target = await seedTombstone({ testEnv });
    let advancedVerifierClock = false;
    const state = installCleanupS3State(testEnv, {
      afterOperation({ operation }) {
        if (operation === 'multipart_list' && !advancedVerifierClock) {
          advancedVerifierClock = true;
          vi.setSystemTime(NOW + 1_000);
        }
      },
    });
    const s3Fetch = state.fetchMock;
    vi.stubGlobal('fetch', vi.fn(async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      if (url.href === HUB_URL) {
        hubCalls.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return s3Fetch(input, init);
    }));
    const firstCredential = await mintSandboxMaintenanceCredential(testEnv, {
      prefix: target.prefix,
      nowSeconds: Math.floor(NOW / 1000),
    });
    const verifierCredential = await mintSandboxMaintenanceCredential(testEnv, {
      prefix: target.prefix,
      nowSeconds: Math.floor((NOW + 1_000) / 1000),
    });
    const ctx = createExecutionContext();

    const result = await cleanupSpbSandboxBinding(testEnv, ctx, cleanupArgs(target));
    await waitOnExecutionContext(ctx);

    expect(result).toEqual({ outcome: 'cleaned' });
    await expect(bindingRow(INSTANCE_A)).resolves.toBeNull();
    expect(state.calls).toHaveLength(4);
    const objectReadback = state.calls.find((call) => call.operation === 'object_readback');
    const multipartReadback = state.calls.find((call) => call.operation === 'multipart_readback');
    expect(objectReadback.url.searchParams.get('max-keys')).toBe('1');
    expect(objectReadback.headers['x-amz-security-token'])
      .toBe(verifierCredential.sessionToken);
    expect(objectReadback.headers['x-amz-security-token'])
      .not.toBe(firstCredential.sessionToken);
    expect(multipartReadback.headers['x-amz-security-token'])
      .toBe(objectReadback.headers['x-amz-security-token']);
    await expect(sandboxAuditRows()).resolves.toEqual([cleanupAudit({
      outcome: 'cleaned',
      credentialsMinted: 2,
    })]);
    expect(hubCalls).toHaveLength(1);
    expect(Object.keys(hubCalls[0]).sort()).toEqual([
      'credentials_minted',
      'multipart_aborted',
      'objects_deleted',
      'office',
      'outcome',
      'retry_after_seconds',
      'tier',
      'ts',
      'type',
    ]);
    expect(hubCalls[0]).toMatchObject({
      type: 'spb_sandbox_cleanup',
      tier: 'T4',
      outcome: 'cleaned',
      credentials_minted: 2,
      objects_deleted: 0,
      multipart_aborted: 0,
      retry_after_seconds: 0,
    });
    const credentials = credentialSecrets(firstCredential)
      .concat(credentialSecrets(verifierCredential));
    consoleSpy.assertNoSecrets(credentials);
    assertForbiddenEverywhere(credentials.concat([
      target.account.accountId,
      RUN_A,
      INSTANCE_A,
      target.prefix,
    ]), {
      response: result,
      audits: await allSpbStorageRows(),
      hubCalls,
      consoleCalls: consoleSpy.calls,
    });
  });

  it('drains more than 1,000 objects and paged multipart uploads without leaving its prefix', async () => {
    const testEnv = makeTestEnv();
    const target = await seedTombstone({ testEnv });
    const baseline = await seedSpbBinding({
      accountId: target.account.accountId,
      instanceId: INSTANCE_B,
      tokenHash: 'baseline-token-hash',
    });
    const otherRun = await seedSpbBinding({
      accountId: target.account.accountId,
      instanceId: INSTANCE_C,
      tokenHash: null,
      sandboxRunId: RUN_B,
      sandboxDeniedAt: NOW - 1,
    });
    const otherInstance = await seedSpbBinding({
      accountId: target.account.accountId,
      instanceId: INSTANCE_D,
      tokenHash: null,
      sandboxRunId: RUN_A,
      sandboxDeniedAt: NOW - 1,
    });
    const baselinePrefix = prefixFor(baseline.accountId, baseline.instanceId);
    const otherRunPrefix = prefixFor(otherRun.accountId, otherRun.instanceId);
    const otherInstancePrefix = prefixFor(otherInstance.accountId, otherInstance.instanceId);
    const objects = Array.from({ length: 1_005 }, (_, index) => `${target.prefix}object-${index}`);
    const uploads = Array.from({ length: 3 }, (_, index) => ({
      key: `${target.prefix}upload-${index}`,
      uploadId: `upload-${index}`,
    }));
    const state = installCleanupS3State(testEnv, {
      objectsByPrefix: {
        [target.prefix]: objects,
        [baselinePrefix]: [`${baselinePrefix}control`],
        [otherRunPrefix]: [`${otherRunPrefix}control`],
        [otherInstancePrefix]: [`${otherInstancePrefix}control`],
      },
      uploadsByPrefix: {
        [target.prefix]: uploads,
        [baselinePrefix]: [{ key: `${baselinePrefix}control`, uploadId: 'baseline' }],
        [otherRunPrefix]: [{ key: `${otherRunPrefix}control`, uploadId: 'other-run' }],
        [otherInstancePrefix]: [{
          key: `${otherInstancePrefix}control`,
          uploadId: 'other-instance',
        }],
      },
    });

    await expect(cleanupSpbSandboxBinding(testEnv, null, cleanupArgs(target)))
      .resolves.toEqual({ outcome: 'cleaned' });

    const deletes = state.calls.filter((call) => call.operation === 'delete');
    expect(deletes).toHaveLength(2);
    expect(deletes.map((call) => keysFromDeleteBody(call.bodyText).length).sort((a, b) => a - b))
      .toEqual([5, 1_000]);
    expect(state.calls.filter((call) => call.operation === 'abort')).toHaveLength(3);
    expect(state.objectState.get(target.prefix)).toEqual([]);
    expect(state.uploadState.get(target.prefix)).toEqual([]);
    expect(state.objectState.get(baselinePrefix)).toEqual([`${baselinePrefix}control`]);
    expect(state.objectState.get(otherRunPrefix)).toEqual([`${otherRunPrefix}control`]);
    expect(state.objectState.get(otherInstancePrefix)).toEqual([`${otherInstancePrefix}control`]);
    for (const call of state.calls) {
      expect(call.url.host).toBe(`${testEnv.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
      const listedPrefix = call.url.searchParams.get('prefix');
      if (listedPrefix !== null) expect(listedPrefix).toBe(target.prefix);
      for (const key of keysFromDeleteBody(call.bodyText)) {
        expect(key.startsWith(target.prefix)).toBe(true);
      }
      if (call.operation === 'abort') expect(keyFromUrlPath(testEnv, call.url).startsWith(target.prefix)).toBe(true);
    }
    expect(JSON.stringify(state.calls)).not.toContain(baselinePrefix);
    expect(JSON.stringify(state.calls)).not.toContain(otherRunPrefix);
    expect(JSON.stringify(state.calls)).not.toContain(otherInstancePrefix);
    await expect(bindingRow(INSTANCE_B)).resolves.not.toBeNull();
    await expect(bindingRow(INSTANCE_C)).resolves.not.toBeNull();
    await expect(bindingRow(INSTANCE_D)).resolves.not.toBeNull();
    await expect(sandboxAuditRows()).resolves.toEqual([cleanupAudit({
      outcome: 'cleaned',
      credentialsMinted: 2,
      objectsDeleted: 1_005,
      multipartAborted: 3,
    })]);
  });

  it('repeats both drains when an upload completes into an object after the first object drain', async () => {
    const testEnv = makeTestEnv();
    const target = await seedTombstone({ testEnv });
    const state = installCleanupS3State(testEnv, {
      uploadsByPrefix: {
        [target.prefix]: [{ key: `${target.prefix}completed-object`, uploadId: 'upload-a' }],
      },
      completeUploadOnFirstMultipartDrain: true,
    });

    await expect(cleanupSpbSandboxBinding(testEnv, null, cleanupArgs(target)))
      .resolves.toEqual({ outcome: 'cleaned' });

    expect(state.calls.filter((call) => call.operation === 'object_readback')).toHaveLength(2);
    expect(state.calls.filter((call) => call.operation === 'object_list').length).toBeGreaterThan(2);
    expect(state.objectState.get(target.prefix)).toEqual([]);
    expect(state.uploadState.get(target.prefix)).toEqual([]);
    await expect(sandboxAuditRows()).resolves.toEqual([cleanupAudit({
      outcome: 'cleaned',
      credentialsMinted: 4,
      objectsDeleted: 1,
    })]);
  });

  it('returns retryable when uploads complete into objects between verifier reads', async () => {
    const testEnv = makeTestEnv();
    const target = await seedTombstone({ testEnv });
    const state = installCleanupS3State(testEnv, {
      completeUploadBetweenReadbacksCount: 3,
    });

    await expect(cleanupSpbSandboxBinding(testEnv, null, cleanupArgs(target)))
      .resolves.toEqual({ outcome: 'retryable' });

    expect(state.calls.filter((call) => call.operation === 'multipart_readback'))
      .toHaveLength(3);
    expect(state.calls.filter((call) => call.operation === 'object_readback'))
      .toHaveLength(3);
    await expect(bindingRow(INSTANCE_A)).resolves.not.toBeNull();
    await expect(sandboxAuditRows()).resolves.toEqual([cleanupAudit({
      outcome: 'retryable',
      credentialsMinted: 6,
      objectsDeleted: 2,
    })]);
  });

  it('holds at every future-expiry millisecond boundary and proceeds at equal, past, and null', async () => {
    const futureCases = [
      [NOW + 90_000, 90],
      [NOW + 1_001, 2],
      [NOW + 1_000, 1],
      [NOW + 1, 1],
    ];
    for (const [expiry, retryAfterSeconds] of futureCases) {
      await resetDb();
      const testEnv = makeTestEnv({ R2_PARENT_SECRET_ACCESS_KEY: Symbol('must not mint') });
      const target = await seedTombstone({ testEnv, expiry });
      const fetchMock = vi.fn(() => {
        throw new Error('expiry gate must not reach R2');
      });
      vi.stubGlobal('fetch', fetchMock);

      await expect(cleanupSpbSandboxBinding(testEnv, null, cleanupArgs(target))).resolves.toEqual({
        outcome: 'credential_expiry_pending',
        retry_after_seconds: retryAfterSeconds,
        retry_not_before_ms: expiry,
      });
      expect(fetchMock).not.toHaveBeenCalled();
      await expect(bindingRow(INSTANCE_A)).resolves.not.toBeNull();
      await expect(sandboxAuditRows()).resolves.toEqual([]);
    }

    for (const expiry of [NOW, NOW - 1, null]) {
      await resetDb();
      const testEnv = makeTestEnv();
      const target = await seedTombstone({ testEnv, expiry });
      installCleanupS3State(testEnv);
      await expect(cleanupSpbSandboxBinding(testEnv, null, cleanupArgs(target)))
        .resolves.toEqual({ outcome: 'cleaned' });
    }
  });

  it('re-mints only after crossing below the five-second threshold', async () => {
    const testEnv = makeTestEnv();
    const target = await seedTombstone({ testEnv });
    let objectLists = 0;
    const state = installCleanupS3State(testEnv, {
      objectsByPrefix: { [target.prefix]: [`${target.prefix}one`] },
      afterOperation({ operation }) {
        if (operation !== 'object_list') return;
        objectLists += 1;
        if (objectLists === 1) vi.setSystemTime(NOW + 85_000);
      },
      afterDelete() {
        vi.setSystemTime(NOW + 85_001);
      },
    });

    await expect(cleanupSpbSandboxBinding(testEnv, null, cleanupArgs(target)))
      .resolves.toEqual({ outcome: 'cleaned' });

    const firstList = state.calls.find((call) => call.operation === 'object_list');
    const deleteCall = state.calls.find((call) => call.operation === 'delete');
    const secondList = state.calls.filter((call) => call.operation === 'object_list')[1];
    expect(deleteCall.headers['x-amz-security-token'])
      .toBe(firstList.headers['x-amz-security-token']);
    expect(secondList.headers['x-amz-security-token'])
      .not.toBe(firstList.headers['x-amz-security-token']);
    await expect(sandboxAuditRows()).resolves.toEqual([cleanupAudit({
      outcome: 'cleaned',
      credentialsMinted: 3,
      objectsDeleted: 1,
    })]);
  });

  it('stops at six maintenance credentials and converges on a later attempt', async () => {
    const testEnv = makeTestEnv();
    const target = await seedTombstone({ testEnv });
    const state = installCleanupS3State(testEnv, {
      objectsByPrefix: {
        [target.prefix]: Array.from({ length: 3_001 }, (_, index) => `${target.prefix}${index}`),
      },
      afterOperation() {
        vi.setSystemTime(Date.now() + 86_000);
      },
    });

    await expect(cleanupSpbSandboxBinding(testEnv, null, cleanupArgs(target)))
      .resolves.toEqual({ outcome: 'retryable' });
    await expect(bindingRow(INSTANCE_A)).resolves.not.toBeNull();
    expect(state.calls).toHaveLength(6);
    await expect(sandboxAuditRows()).resolves.toEqual([cleanupAudit({
      outcome: 'retryable',
      credentialsMinted: 6,
      objectsDeleted: 3_000,
    })]);

    vi.setSystemTime(Date.now());
    installCleanupS3State(testEnv, {
      objectsByPrefix: {
        [target.prefix]: [...state.objectState.get(target.prefix)],
      },
    });
    await expect(cleanupSpbSandboxBinding(testEnv, null, {
      ...cleanupArgs(target),
      nowMs: Date.now(),
    })).resolves.toEqual({ outcome: 'cleaned' });
  });

  it('returns retryable after three non-empty joint readbacks, then converges', async () => {
    const testEnv = makeTestEnv();
    const target = await seedTombstone({ testEnv });
    const state = installCleanupS3State(testEnv, {
      objectsByPrefix: { [target.prefix]: [] },
      injectObjectBeforeReadbackCount: 3,
    });

    await expect(cleanupSpbSandboxBinding(testEnv, null, cleanupArgs(target)))
      .resolves.toEqual({ outcome: 'retryable' });
    await expect(bindingRow(INSTANCE_A)).resolves.not.toBeNull();
    await expect(sandboxAuditRows()).resolves.toEqual([cleanupAudit({
      outcome: 'retryable',
      credentialsMinted: 6,
      objectsDeleted: 2,
    })]);

    await expect(cleanupSpbSandboxBinding(testEnv, null, cleanupArgs(target)))
      .resolves.toEqual({ outcome: 'cleaned' });
    await expect(bindingRow(INSTANCE_A)).resolves.toBeNull();
  });

  it.each(['multipart_readback', 'object_readback'])(
    'preserves the tombstone when %s returns malformed HTTP 200 XML',
    async (operation) => {
      const testEnv = makeTestEnv();
      const target = await seedTombstone({ testEnv });
      installCleanupS3State(testEnv, {
        malformedReadbacks: new Set([operation]),
      });

      await expect(cleanupSpbSandboxBinding(testEnv, null, cleanupArgs(target)))
        .resolves.toEqual({ outcome: 'retryable' });
      await expect(bindingRow(INSTANCE_A)).resolves.not.toBeNull();
      await expect(sandboxAuditRows()).resolves.toEqual([cleanupAudit({
        outcome: 'retryable',
        credentialsMinted: 2,
      })]);
    }
  );

  it.each(['multipart_readback', 'object_readback'])(
    'requires a non-truncated %s before declaring cleanup verified',
    async (operation) => {
      const testEnv = makeTestEnv();
      const target = await seedTombstone({ testEnv });
      installCleanupS3State(testEnv, {
        truncatedReadbacks: new Set([operation]),
      });

      await expect(cleanupSpbSandboxBinding(testEnv, null, cleanupArgs(target)))
        .resolves.toEqual({ outcome: 'retryable' });
      await expect(bindingRow(INSTANCE_A)).resolves.not.toBeNull();
      await expect(sandboxAuditRows()).resolves.toEqual([cleanupAudit({
        outcome: 'retryable',
        credentialsMinted: 6,
      })]);
    }
  );

  it('audits successful object deletions before a partial delete failure', async () => {
    const testEnv = makeTestEnv();
    const target = await seedTombstone({ testEnv });
    const state = installCleanupS3State(testEnv, {
      objectsByPrefix: {
        [target.prefix]: [`${target.prefix}deleted`, `${target.prefix}failed`],
      },
      partialDeleteOnce: true,
    });

    await expect(cleanupSpbSandboxBinding(testEnv, null, cleanupArgs(target)))
      .resolves.toEqual({ outcome: 'retryable' });

    expect(state.objectState.get(target.prefix)).toEqual([`${target.prefix}failed`]);
    await expect(bindingRow(INSTANCE_A)).resolves.not.toBeNull();
    await expect(sandboxAuditRows()).resolves.toEqual([cleanupAudit({
      outcome: 'retryable',
      credentialsMinted: 1,
      objectsDeleted: 1,
    })]);
  });

  it.each([
    ['list', { objects: ['object'] }],
    ['delete', { objects: ['object'] }],
    ['abort', { uploads: [{ key: 'upload', uploadId: 'upload' }] }],
    ['readback', {}],
    ['signer', {}],
    ['audit', {}],
    ['final-delete', {}],
  ])('keeps the tombstone and converges after one injected %s failure', async (failure, contents) => {
    const baseEnv = makeTestEnv();
    const target = await seedTombstone({ testEnv: baseEnv });
    const objects = (contents.objects || []).map((key) => `${target.prefix}${key}`);
    const uploads = (contents.uploads || []).map((upload) => ({
      key: `${target.prefix}${upload.key}`,
      uploadId: upload.uploadId,
    }));
    const state = installCleanupS3State(baseEnv, {
      objectsByPrefix: { [target.prefix]: objects },
      uploadsByPrefix: { [target.prefix]: uploads },
      failOnce: new Set(['list', 'delete', 'abort', 'readback'].includes(failure) ? [failure] : []),
    });
    const maintenance = await mintSandboxMaintenanceCredential(baseEnv, {
      prefix: target.prefix,
      nowSeconds: Math.floor(NOW / 1000),
    });
    let firstEnv = baseEnv;
    if (failure === 'signer') {
      firstEnv = { ...baseEnv, R2_PARENT_SECRET_ACCESS_KEY: Symbol('injected signer failure') };
    } else if (failure === 'audit') {
      firstEnv = failOnceOnSql(baseEnv, /INSERT INTO spb_sandbox_audit/i);
    } else if (failure === 'final-delete') {
      firstEnv = failOnceOnSql(baseEnv, /DELETE FROM spb_bindings/i);
    }

    const first = await cleanupSpbSandboxBinding(firstEnv, null, cleanupArgs(target));

    expect(first).toEqual({ outcome: 'retryable' });
    await expect(bindingRow(INSTANCE_A)).resolves.not.toBeNull();
    consoleSpy.assertNoSecrets(credentialSecrets(maintenance));
    assertForbiddenEverywhere(credentialSecrets(maintenance), {
      response: first,
      audits: await allSpbStorageRows(),
      consoleCalls: consoleSpy.calls,
    });

    const second = await cleanupSpbSandboxBinding(baseEnv, null, cleanupArgs(target));

    expect(second).toEqual({ outcome: 'cleaned' });
    await expect(bindingRow(INSTANCE_A)).resolves.toBeNull();
    expect(state.objectState.get(target.prefix) || []).toEqual([]);
    expect(state.uploadState.get(target.prefix) || []).toEqual([]);
  });

  it('classifies lifecycle gates without R2 and never invents cleaned', async () => {
    const cases = [
      ['absent', null],
      ['ownership_conflict', { sandboxRunId: RUN_B, sandboxDeniedAt: NOW - 1 }],
      ['denial_required', { sandboxRunId: RUN_A, sandboxDeniedAt: null }],
    ];
    for (const [outcome, row] of cases) {
      await resetDb();
      const testEnv = makeTestEnv();
      const account = await seedAccount({ email: `${outcome}@example.com`, testEnv });
      if (row) {
        await seedSpbBinding({
          accountId: account.accountId,
          instanceId: INSTANCE_A,
          tokenHash: row.sandboxDeniedAt === null ? 'live-token' : null,
          sandboxRunId: row.sandboxRunId,
          sandboxDeniedAt: row.sandboxDeniedAt,
        });
      }
      const fetchMock = vi.fn(() => {
        throw new Error('lifecycle classification must not reach R2');
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await cleanupSpbSandboxBinding(testEnv, null, {
        sandboxRunId: RUN_A,
        accountId: account.accountId,
        instanceId: INSTANCE_A,
        nowMs: NOW,
      });

      expect(result).toEqual({ outcome });
      expect(result.outcome).not.toBe('cleaned');
      expect(fetchMock).not.toHaveBeenCalled();
      await expect(sandboxAuditRows()).resolves.toEqual([cleanupAudit({ outcome })]);
    }
  });

  it('classifies zero-row terminal deletes as absent or ownership_conflict, never cleaned', async () => {
    const absentEnv = makeTestEnv();
    const absent = await seedTombstone({ testEnv: absentEnv });
    installCleanupS3State(absentEnv);
    const deletedButHidden = interceptSql(absentEnv, /DELETE FROM spb_bindings/i, async (bound) => {
      await bound.all();
      return { results: [] };
    });

    await expect(cleanupSpbSandboxBinding(deletedButHidden, null, cleanupArgs(absent)))
      .resolves.toEqual({ outcome: 'absent' });
    expect((await sandboxAuditRows()).map(({ outcome }) => outcome)).toEqual(['cleaned', 'absent']);

    await resetDb();
    const conflictEnv = makeTestEnv();
    const conflict = await seedTombstone({ testEnv: conflictEnv });
    installCleanupS3State(conflictEnv);
    const hiddenDelete = interceptSql(conflictEnv, /DELETE FROM spb_bindings/i, async () => ({
      results: [],
    }));

    await expect(cleanupSpbSandboxBinding(hiddenDelete, null, cleanupArgs(conflict)))
      .resolves.toEqual({ outcome: 'ownership_conflict' });
    await expect(bindingRow(INSTANCE_A)).resolves.not.toBeNull();
    expect((await sandboxAuditRows()).map(({ outcome }) => outcome))
      .toEqual(['cleaned', 'ownership_conflict']);
  });
});

async function seedTombstone({
  testEnv,
  instanceId = INSTANCE_A,
  sandboxRunId = RUN_A,
  expiry = null,
} = {}) {
  const account = await seedAccount({ email: `cleanup-${instanceId}@example.com`, testEnv });
  await seedSpbBinding({
    accountId: account.accountId,
    instanceId,
    createdAt: NOW - 10_000,
    lastSeenAt: NOW - 9_000,
    tokenHash: null,
    sandboxRunId,
    sandboxCredentialExpiresAt: expiry,
    sandboxDeniedAt: NOW - 1_000,
  });
  return {
    account,
    instanceId,
    sandboxRunId,
    prefix: prefixFor(account.accountId, instanceId),
  };
}

function cleanupArgs(target) {
  return {
    sandboxRunId: target.sandboxRunId,
    accountId: target.account.accountId,
    instanceId: target.instanceId,
    nowMs: NOW,
  };
}

function installCleanupS3State(testEnv, {
  objectsByPrefix = {},
  uploadsByPrefix = {},
  failOnce = new Set(),
  completeUploadOnFirstMultipartDrain = false,
  completeUploadBetweenReadbacksCount = 0,
  injectObjectBeforeReadbackCount = 0,
  malformedReadbacks = new Set(),
  truncatedReadbacks = new Set(),
  partialDeleteOnce = false,
  afterOperation = () => {},
  afterDelete = () => {},
} = {}) {
  const objectState = new Map(
    Object.entries(objectsByPrefix).map(([prefix, keys]) => [prefix, [...keys]])
  );
  const uploadState = new Map(
    Object.entries(uploadsByPrefix).map(([prefix, uploads]) => [
      prefix,
      uploads.map((upload) => ({ ...upload })),
    ])
  );
  const objectSnapshots = new Map();
  const uploadSnapshots = new Map();
  let snapshotId = 0;
  let expectingMultipartReadback = false;
  let multipartReadbackComplete = false;
  let uploadCompleted = false;
  let betweenReadbackCompletions = 0;
  let readbackInjections = 0;
  let partialDeletePending = partialDeleteOnce;

  const installed = installS3FetchMock(testEnv, {
    default: async ({ method, url, bodyText }) => {
      let operation;
      if (method === 'GET' && url.searchParams.get('list-type') === '2') {
        operation = url.searchParams.get('max-keys') === '1' ? 'object_readback' : 'object_list';
      } else if (method === 'POST' && url.searchParams.has('delete')) {
        operation = 'delete';
      } else if (method === 'GET' && url.searchParams.has('uploads')) {
        operation = expectingMultipartReadback ? 'multipart_readback' : 'multipart_list';
        expectingMultipartReadback = false;
      } else if (method === 'DELETE' && url.searchParams.has('uploadId')) {
        operation = 'abort';
      } else {
        throw new Error(`unhandled cleanup R2 request: ${method} ${url.href}`);
      }

      const prefix = url.searchParams.get('prefix');
      if (
        operation === 'multipart_list'
        && completeUploadOnFirstMultipartDrain
        && !uploadCompleted
      ) {
        uploadCompleted = true;
        const uploads = uploadState.get(prefix) || [];
        const completed = uploads.shift();
        uploadState.set(prefix, uploads);
        if (completed) {
          objectState.set(prefix, [...(objectState.get(prefix) || []), completed.key]);
        }
      }
      if (
        operation === 'object_readback'
        && readbackInjections < injectObjectBeforeReadbackCount
      ) {
        readbackInjections += 1;
        objectState.set(prefix, [
          ...(objectState.get(prefix) || []),
          `${prefix}late-${readbackInjections}`,
        ]);
      }
      if (operation === 'object_readback' && multipartReadbackComplete) {
        multipartReadbackComplete = false;
        if (betweenReadbackCompletions < completeUploadBetweenReadbacksCount) {
          betweenReadbackCompletions += 1;
          objectState.set(prefix, [
            ...(objectState.get(prefix) || []),
            `${prefix}completed-between-${betweenReadbackCompletions}`,
          ]);
        }
      }

      const failureKey = operation === 'object_readback' || operation === 'multipart_readback'
        ? 'readback'
        : operation === 'object_list'
          ? 'list'
          : operation;
      if (failOnce.has(failureKey)) {
        failOnce.delete(failureKey);
        installed.calls.at(-1).operation = operation;
        afterOperation({ operation, url });
        return new Response('', { status: 500 });
      }
      if (malformedReadbacks.has(operation)) {
        installed.calls.at(-1).operation = operation;
        afterOperation({ operation, url });
        return xmlResponse('<UnexpectedListResult/>');
      }

      let response;
      if (operation === 'object_list' || operation === 'object_readback') {
        const maxKeys = url.searchParams.get('max-keys');
        let page = pageFromSnapshot({
          snapshots: objectSnapshots,
          snapshotId: () => ++snapshotId,
          token: url.searchParams.get('continuation-token'),
          values: objectState.get(prefix) || [],
          pageSize: maxKeys === null ? 1_000 : Number(maxKeys),
          tokenPrefix: 'objects',
        });
        if (truncatedReadbacks.has(operation)) {
          page = { page: [], isTruncated: true, nextToken: 'objects:truncated:1' };
        }
        response = xmlResponse(listObjectsXml(page));
      } else if (operation === 'delete') {
        const keys = keysFromDeleteBody(bodyText);
        if (partialDeletePending) {
          partialDeletePending = false;
          const deleted = keys.slice(0, -1);
          const failed = keys.at(-1);
          removeObjectKeys(objectState, deleted);
          response = xmlResponse(
            `<DeleteResult>${deleted
              .map((key) => `<Deleted><Key>${xmlEscape(key)}</Key></Deleted>`)
              .join('')}<Error><Key>${xmlEscape(failed)}</Key><Code>InternalError</Code><Message>partial failure</Message></Error></DeleteResult>`
          );
        } else {
          removeObjectKeys(objectState, keys);
          response = xmlResponse(
            `<DeleteResult>${keys.map((key) => `<Deleted><Key>${xmlEscape(key)}</Key></Deleted>`).join('')}</DeleteResult>`
          );
        }
      } else if (operation === 'multipart_list' || operation === 'multipart_readback') {
        let page = pageFromSnapshot({
          snapshots: uploadSnapshots,
          snapshotId: () => ++snapshotId,
          token: uploadToken(
            url.searchParams.get('key-marker'),
            url.searchParams.get('upload-id-marker')
          ),
          values: uploadState.get(prefix) || [],
          pageSize: 1,
          tokenPrefix: 'uploads',
        });
        if (truncatedReadbacks.has(operation)) {
          page = { page: [], isTruncated: true, nextToken: 'uploads:truncated:1' };
        }
        response = xmlResponse(listUploadsXml(page));
        if (operation === 'multipart_list' && !page.isTruncated && page.page.length === 0) {
          expectingMultipartReadback = true;
        }
        if (operation === 'multipart_readback') multipartReadbackComplete = true;
      } else {
        const key = keyFromUrlPath(testEnv, url);
        removeUpload(uploadState, key, url.searchParams.get('uploadId'));
        response = new Response(null, { status: 204 });
      }

      installed.calls.at(-1).operation = operation;
      if (operation === 'delete') afterDelete();
      afterOperation({ operation, url });
      return response;
    },
  });

  return {
    ...installed,
    objectState,
    uploadState,
    failOnce,
  };
}

function pageFromSnapshot({ snapshots, snapshotId, token, values, pageSize, tokenPrefix }) {
  let id;
  let offset;
  let snapshot;
  if (token) {
    [, id, offset] = token.split(':');
    snapshot = snapshots.get(id) || [];
    offset = Number(offset);
  } else {
    id = String(snapshotId());
    offset = 0;
    snapshot = [...values];
    snapshots.set(id, snapshot);
  }
  const page = snapshot.slice(offset, offset + pageSize);
  const nextOffset = offset + pageSize;
  return {
    page,
    isTruncated: nextOffset < snapshot.length,
    nextToken: nextOffset < snapshot.length ? `${tokenPrefix}:${id}:${nextOffset}` : null,
  };
}

function listObjectsXml({ page, isTruncated, nextToken }) {
  return `<ListBucketResult><IsTruncated>${isTruncated}</IsTruncated>${page
    .map((key) => `<Contents><Key>${xmlEscape(key)}</Key></Contents>`)
    .join('')}${nextToken ? `<NextContinuationToken>${xmlEscape(nextToken)}</NextContinuationToken>` : ''}</ListBucketResult>`;
}

function listUploadsXml({ page, isTruncated, nextToken }) {
  return `<ListMultipartUploadsResult><IsTruncated>${isTruncated}</IsTruncated>${page
    .map((upload) => `<Upload><Key>${xmlEscape(upload.key)}</Key><UploadId>${xmlEscape(upload.uploadId)}</UploadId></Upload>`)
    .join('')}${nextToken ? `<NextKeyMarker>${xmlEscape(nextToken)}</NextKeyMarker><NextUploadIdMarker>${xmlEscape(nextToken)}</NextUploadIdMarker>` : ''}</ListMultipartUploadsResult>`;
}

function uploadToken(keyMarker, uploadIdMarker) {
  return keyMarker && uploadIdMarker ? keyMarker : null;
}

function xmlResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/xml' },
  });
}

function removeObjectKeys(objectState, keys) {
  for (const [prefix, current] of objectState.entries()) {
    objectState.set(prefix, current.filter((key) => !keys.includes(key)));
  }
}

function removeUpload(uploadState, key, uploadId) {
  for (const [prefix, current] of uploadState.entries()) {
    uploadState.set(
      prefix,
      current.filter((upload) => upload.key !== key || upload.uploadId !== uploadId)
    );
  }
}

function keysFromDeleteBody(bodyText) {
  return Array.from(
    bodyText.matchAll(/<Key>([\s\S]*?)<\/Key>/g),
    (match) => xmlDecode(match[1])
  );
}

function keyFromUrlPath(testEnv, url) {
  return decodeURIComponent(url.pathname.slice(`/${testEnv.R2_BUCKET}/`.length));
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlDecode(value) {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function failOnceOnSql(testEnv, pattern) {
  let shouldFail = true;
  return {
    ...testEnv,
    DB: {
      prepare(sql) {
        const statement = testEnv.DB.prepare(sql);
        if (!pattern.test(sql)) return statement;
        function invoke(bound, method, args) {
          if (shouldFail) {
            shouldFail = false;
            throw new Error('injected db failure');
          }
          return bound[method](...args);
        }
        return {
          bind(...args) {
            const bound = statement.bind(...args);
            return {
              run: (...runArgs) => invoke(bound, 'run', runArgs),
              first: (...firstArgs) => invoke(bound, 'first', firstArgs),
              all: (...allArgs) => invoke(bound, 'all', allArgs),
            };
          },
          run: (...args) => invoke(statement, 'run', args),
          first: (...args) => invoke(statement, 'first', args),
          all: (...args) => invoke(statement, 'all', args),
        };
      },
      batch(statements) {
        return testEnv.DB.batch(statements);
      },
    },
  };
}

function interceptSql(testEnv, pattern, allHandler) {
  return {
    ...testEnv,
    DB: {
      prepare(sql) {
        const statement = testEnv.DB.prepare(sql);
        if (!pattern.test(sql)) return statement;
        return {
          bind(...args) {
            const bound = statement.bind(...args);
            return {
              run: (...runArgs) => bound.run(...runArgs),
              first: (...firstArgs) => bound.first(...firstArgs),
              all: (...allArgs) => allHandler(bound, allArgs),
            };
          },
          run: (...args) => statement.run(...args),
          first: (...args) => statement.first(...args),
          all: (...args) => allHandler(statement, args),
        };
      },
      batch(statements) {
        return testEnv.DB.batch(statements);
      },
    },
  };
}

async function bindingRow(instanceId) {
  const row = await workerEnv.DB
    .prepare('SELECT * FROM spb_bindings WHERE instance_id = ?')
    .bind(instanceId)
    .first();
  return row || null;
}

async function sandboxAuditRows() {
  const { results } = await workerEnv.DB
    .prepare('SELECT * FROM spb_sandbox_audit ORDER BY rowid')
    .all();
  return results || [];
}

async function allSpbStorageRows() {
  const out = {};
  for (const table of [
    'spb_bindings',
    'spb_sandbox_audit',
    'spb_mint_audit',
    'spb_sweep_audit',
  ]) {
    const { results } = await workerEnv.DB.prepare(`SELECT * FROM ${table}`).all();
    out[table] = results || [];
  }
  return out;
}

function cleanupAudit({
  outcome,
  credentialsMinted = 0,
  objectsDeleted = 0,
  multipartAborted = 0,
}) {
  return {
    event: 'cleanup',
    outcome,
    scope: null,
    ttl: null,
    credentials_minted: credentialsMinted,
    objects_deleted: objectsDeleted,
    multipart_aborted: multipartAborted,
    ts: NOW,
  };
}

function credentialSecrets(credential) {
  const jwt = atob(credential.sessionToken).slice(4);
  return [
    credential.accessKeyId,
    credential.secretAccessKey,
    credential.sessionToken,
    jwt,
  ];
}

function assertForbiddenEverywhere(forbidden, surfaces) {
  const text = JSON.stringify(surfaces);
  for (const value of forbidden.filter(Boolean)) expect(text).not.toContain(value);
}
