import { createExecutionContext, env as workerEnv, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { hashWithPepper } from '../src/crypto.js';
import { mintScopedCredential } from '../src/r2-credential.js';
import { EMPTY_SHA256_HASH } from '../src/s3.js';
import { prefixFor } from '../src/spb-broker.js';
import { runSpbLapseSweep } from '../src/spb-sweep.js';
import {
  installConsoleSpy,
  installS3FetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedSpbBinding,
} from './helpers.js';

const NOW = 1_700_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const OLD_LAPSE = NOW - 31 * DAY_MS;
const RECENT_LAPSE = NOW - 29 * DAY_MS;
const INSTANCE_A = '11111111-1111-1111-1111-111111111111';
const INSTANCE_B = '22222222-2222-2222-2222-222222222222';
const INSTANCE_C = '33333333-3333-3333-3333-333333333333';
const INSTANCE_D = '44444444-4444-4444-4444-444444444444';
const SANDBOX_RUN = 'aaaaaaaa-1111-1111-1111-111111111111';
const SPB_SERVICE = 'spb_hosted';

describe('spb lapse sweep', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sweeps due bindings, drains paged objects and multipart uploads, and leaves non-due rows', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spb-sweep@example.com', testEnv });
    const dueA = await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_A, lapsedAt: OLD_LAPSE });
    const dueB = await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_B, lapsedAt: OLD_LAPSE });
    const recent = await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_C, lapsedAt: RECENT_LAPSE });
    const active = await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_D, lapsedAt: null });
    const prefixA = prefixFor(dueA.accountId, dueA.instanceId);
    const prefixB = prefixFor(dueB.accountId, dueB.instanceId);
    const recentPrefix = prefixFor(recent.accountId, recent.instanceId);
    const activePrefix = prefixFor(active.accountId, active.instanceId);
    const { calls } = installSweepS3State(testEnv, {
      objectsByPrefix: {
        [prefixA]: Array.from({ length: 1001 }, (_, i) => `${prefixA}object-${i}`),
        [prefixB]: [`${prefixB}final`],
        [recentPrefix]: [`${recentPrefix}control`],
        [activePrefix]: [`${activePrefix}control`],
      },
      uploadsByPrefix: {
        [prefixA]: [
          { key: `${prefixA}multipart-a`, uploadId: 'upload-a' },
          { key: `${prefixA}multipart-b`, uploadId: 'upload-b' },
        ],
        [prefixB]: [
          { key: `${prefixB}multipart-c`, uploadId: 'upload-c' },
        ],
        [recentPrefix]: [
          { key: `${recentPrefix}control-upload`, uploadId: 'recent-upload' },
        ],
      },
    });
    const spy = installConsoleSpy();

    try {
      await runSpbLapseSweep(testEnv, createExecutionContext(), NOW);
    } finally {
      spy.restore();
    }

    await expect(bindingRow(dueA.accountId, dueA.instanceId)).resolves.toBeNull();
    await expect(bindingRow(dueB.accountId, dueB.instanceId)).resolves.toBeNull();
    await expect(bindingRow(recent.accountId, recent.instanceId)).resolves.not.toBeNull();
    await expect(bindingRow(active.accountId, active.instanceId)).resolves.not.toBeNull();
    await expect(auditRows()).resolves.toEqual([
      expect.objectContaining({
        account_id: account.accountId,
        instance_id: INSTANCE_A,
        prefix: prefixA,
        objects_deleted: 1001,
        multipart_aborted: 2,
        ts: NOW,
      }),
      expect.objectContaining({
        account_id: account.accountId,
        instance_id: INSTANCE_B,
        prefix: prefixB,
        objects_deleted: 1,
        multipart_aborted: 1,
        ts: NOW,
      }),
    ]);
    const summary = JSON.parse(spy.calls.find((call) => call.level === 'warn').args[0]);
    expect(summary).toMatchObject({
      event: 'spb_lapse_sweep',
      bindings_swept: 2,
      objects_deleted: 1002,
      multipart_aborted: 3,
    });
    expect(spy.calls.some((call) => call.level === 'error')).toBe(false);
    expectCallsContained(calls, testEnv, [prefixA, prefixB]);
    expect(JSON.stringify(calls)).not.toContain(recentPrefix);
    expect(JSON.stringify(calls)).not.toContain(activePrefix);

    const cred = await mintScopedCredential(testEnv, {
      prefix: prefixA,
      scope: 'maintenance',
      nowSeconds: Math.floor(NOW / 1000),
    });
    const prefixAList = calls.find((call) => call.method === 'GET' && call.url.searchParams.get('prefix') === prefixA);
    expect(prefixAList.headers['x-amz-security-token']).toBe(cred.sessionToken);
    expect(prefixAList.headers.authorization).toMatch(
      new RegExp(`^AWS4-HMAC-SHA256 Credential=${escapeRegExp(testEnv.R2_PARENT_ACCESS_KEY_ID)}/\\d{8}/auto/s3/aws4_request, SignedHeaders=.*x-amz-security-token.*Signature=[0-9a-f]{64}$`)
    );
    expect(prefixAList.headers['x-amz-content-sha256']).toBe(EMPTY_SHA256_HASH);
    const deleteCall = calls.find((call) => call.method === 'POST' && call.url.searchParams.has('delete'));
    expect(deleteCall.headers['x-amz-content-sha256']).toBe(await sha256Hex(deleteCall.bodyText));
    const abortCall = calls.find((call) => call.method === 'DELETE' && call.url.searchParams.has('uploadId'));
    expect(abortCall.headers['x-amz-content-sha256']).toBe(EMPTY_SHA256_HASH);
  });

  it('returns before DB selection, logging, and R2 calls when disabled', async () => {
    const testEnv = makeTestEnv();
    delete testEnv.SPB_SWEEP_ENABLED;
    const account = await seedAccount({ email: 'spb-disabled@example.com', testEnv });
    await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_A, lapsedAt: OLD_LAPSE });
    const { calls } = installS3FetchMock(testEnv, {
      default: () => {
        throw new Error('disabled sweep must not fetch');
      },
    });
    const spy = installConsoleSpy();

    try {
      await runSpbLapseSweep(testEnv, createExecutionContext(), NOW);
    } finally {
      spy.restore();
    }

    expect(calls).toHaveLength(0);
    await expect(bindingRow(account.accountId, INSTANCE_A)).resolves.not.toBeNull();
    await expect(auditRows()).resolves.toEqual([]);
    expect(spy.calls).toHaveLength(0);
  });

  it('treats an empty prefix as idempotent success', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spb-empty@example.com', testEnv });
    const binding = await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_A, lapsedAt: OLD_LAPSE });
    const prefix = prefixFor(binding.accountId, binding.instanceId);
    installSweepS3State(testEnv);
    const spy = installConsoleSpy();

    try {
      await runSpbLapseSweep(testEnv, createExecutionContext(), NOW);
    } finally {
      spy.restore();
    }

    await expect(bindingRow(account.accountId, INSTANCE_A)).resolves.toBeNull();
    await expect(auditRows()).resolves.toEqual([expect.objectContaining({
      account_id: account.accountId,
      instance_id: INSTANCE_A,
      prefix,
      objects_deleted: 0,
      multipart_aborted: 0,
    })]);
  });

  it('sweeps only baseline rows from mixed lapsed and sandbox lifecycle state', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spb-mixed-lifecycle@example.com', testEnv });
    const baseline = await seedSpbBinding({
      accountId: account.accountId,
      instanceId: INSTANCE_A,
      lapsedAt: OLD_LAPSE,
    });
    const runOwned = await seedSpbBinding({
      accountId: account.accountId,
      instanceId: INSTANCE_B,
      tokenHash: 'run-owned-token-hash',
      lapsedAt: OLD_LAPSE,
      sandboxRunId: SANDBOX_RUN,
    });
    const tombstone = await seedSpbBinding({
      accountId: account.accountId,
      instanceId: INSTANCE_C,
      tokenHash: null,
      lapsedAt: OLD_LAPSE,
      sandboxRunId: SANDBOX_RUN,
      sandboxCredentialExpiresAt: NOW - 1_000,
      sandboxDeniedAt: NOW - 500,
    });
    const baselinePrefix = prefixFor(baseline.accountId, baseline.instanceId);
    const runPrefix = prefixFor(runOwned.accountId, runOwned.instanceId);
    const tombstonePrefix = prefixFor(tombstone.accountId, tombstone.instanceId);
    const runBefore = await fullBindingRow(INSTANCE_B);
    const tombstoneBefore = await fullBindingRow(INSTANCE_C);
    const { calls } = installSweepS3State(testEnv, {
      objectsByPrefix: {
        [baselinePrefix]: [`${baselinePrefix}baseline-object`],
        [runPrefix]: [`${runPrefix}run-object`],
        [tombstonePrefix]: [`${tombstonePrefix}tombstone-object`],
      },
      uploadsByPrefix: {
        [baselinePrefix]: [{ key: `${baselinePrefix}baseline-upload`, uploadId: 'baseline-upload' }],
        [runPrefix]: [{ key: `${runPrefix}run-upload`, uploadId: 'run-upload' }],
        [tombstonePrefix]: [{ key: `${tombstonePrefix}tombstone-upload`, uploadId: 'tombstone-upload' }],
      },
    });
    const spy = installConsoleSpy();

    try {
      await runSpbLapseSweep(testEnv, createExecutionContext(), NOW);
    } finally {
      spy.restore();
    }

    await expect(fullBindingRow(INSTANCE_A)).resolves.toBeNull();
    await expect(fullBindingRow(INSTANCE_B)).resolves.toEqual(runBefore);
    await expect(fullBindingRow(INSTANCE_C)).resolves.toEqual(tombstoneBefore);
    await expect(auditRows()).resolves.toEqual([expect.objectContaining({
      account_id: account.accountId,
      instance_id: INSTANCE_A,
      prefix: baselinePrefix,
      objects_deleted: 1,
      multipart_aborted: 1,
      ts: NOW,
    })]);
    expectCallsContained(calls, testEnv, [baselinePrefix]);
    expect(JSON.stringify(calls)).not.toContain(runPrefix);
    expect(JSON.stringify(calls)).not.toContain(tombstonePrefix);
  });

  it('isolates delete failures and retries the failed binding idempotently', async () => {
    const testEnv = makeTestEnv();
    const failed = await seedAccount({ email: 'spb-fail@example.com', testEnv });
    const healthy = await seedAccount({ email: 'spb-healthy@example.com', testEnv });
    await seedSpbBinding({ accountId: failed.accountId, instanceId: INSTANCE_A, lapsedAt: OLD_LAPSE });
    await seedSpbBinding({ accountId: healthy.accountId, instanceId: INSTANCE_B, lapsedAt: OLD_LAPSE });
    const failedPrefix = prefixFor(failed.accountId, INSTANCE_A);
    const healthyPrefix = prefixFor(healthy.accountId, INSTANCE_B);
    const state = installSweepS3State(testEnv, {
      objectsByPrefix: {
        [failedPrefix]: [`${failedPrefix}partial`],
        [healthyPrefix]: [`${healthyPrefix}ok`],
      },
      failDeleteOnceForPrefix: new Set([failedPrefix]),
    });
    const spy = installConsoleSpy();

    try {
      await runSpbLapseSweep(testEnv, createExecutionContext(), NOW);
    } finally {
      spy.restore();
    }

    await expect(bindingRow(failed.accountId, INSTANCE_A)).resolves.not.toBeNull();
    await expect(bindingRow(healthy.accountId, INSTANCE_B)).resolves.toBeNull();
    await expect(auditRows()).resolves.toEqual([expect.objectContaining({
      account_id: healthy.accountId,
      instance_id: INSTANCE_B,
      objects_deleted: 1,
    })]);
    const failure = JSON.parse(spy.calls.find((call) => call.level === 'error').args[0]);
    expect(failure).toEqual({
      event: 'spb_lapse_sweep_failed',
      binding_index: 0,
      error_type: 'S3DeleteObjectsError',
    });
    expect(JSON.stringify(spy.calls)).not.toContain(failed.accountId);
    expect(JSON.stringify(spy.calls)).not.toContain(failedPrefix);

    state.failDeleteOnceForPrefix.clear();
    const retrySpy = installConsoleSpy();
    try {
      await runSpbLapseSweep(testEnv, createExecutionContext(), NOW);
    } finally {
      retrySpy.restore();
    }

    await expect(bindingRow(failed.accountId, INSTANCE_A)).resolves.toBeNull();
    await expect(auditRows()).resolves.toEqual([
      expect.objectContaining({ account_id: healthy.accountId, objects_deleted: 1 }),
      expect.objectContaining({ account_id: failed.accountId, objects_deleted: 0, multipart_aborted: 0 }),
    ]);
  });

  it('does not log secrets or UUID-shaped identifiers', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spb-secret@example.com', testEnv });
    const tokenHash = 'seeded-token-hash-123456789012345678901234567890';
    await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_A, lapsedAt: OLD_LAPSE, tokenHash });
    const prefix = prefixFor(account.accountId, INSTANCE_A);
    installSweepS3State(testEnv, {
      objectsByPrefix: { [prefix]: [`${prefix}secret-check`] },
    });
    const cred = await mintScopedCredential(testEnv, {
      prefix,
      scope: 'maintenance',
      nowSeconds: Math.floor(NOW / 1000),
    });
    const jwt = atob(cred.sessionToken).slice(4);
    const spy = installConsoleSpy();

    try {
      await runSpbLapseSweep(testEnv, createExecutionContext(), NOW);
      spy.assertNoSecrets([
        testEnv.R2_PARENT_SECRET_ACCESS_KEY,
        cred.secretAccessKey,
        cred.sessionToken,
        jwt,
        tokenHash,
      ]);
      const output = spy.calls.map(({ args }) => args.join(' ')).join('\n');
      expect(output).not.toMatch(/[A-Za-z0-9_-]{32,}/);
      const auditText = JSON.stringify(await auditRows());
      expect(auditText).not.toContain(testEnv.R2_PARENT_SECRET_ACCESS_KEY);
      expect(auditText).not.toContain(cred.secretAccessKey);
      expect(auditText).not.toContain(cred.sessionToken);
      expect(auditText).not.toContain(jwt);
      expect(auditText).not.toContain(tokenHash);
    } finally {
      spy.restore();
    }
  });

  it('emits one counts-only hub event when configured', async () => {
    const testEnv = makeTestEnv({
      HUB_WEBHOOK_URL: 'https://extro.solpbc.org/hooks/security',
      HUB_WEBHOOK_SECRET: 'hub-secret',
    });
    const account = await seedAccount({ email: 'spb-hub@example.com', testEnv });
    const binding = await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_A, lapsedAt: OLD_LAPSE });
    const prefix = prefixFor(binding.accountId, binding.instanceId);
    const hubCalls = [];
    const { fetchMock } = installSweepS3State(testEnv, {
      objectsByPrefix: { [prefix]: [`${prefix}hub-object`] },
    });
    vi.stubGlobal('fetch', vi.fn(async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      if (url.host === 'extro.solpbc.org') {
        hubCalls.push({
          url: url.toString(),
          headers: Object.fromEntries(new Headers(init.headers).entries()),
          body: JSON.parse(init.body),
        });
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return fetchMock(input, init);
    }));
    const ctx = createExecutionContext();
    const spy = installConsoleSpy();

    try {
      await runSpbLapseSweep(testEnv, ctx, NOW);
      await waitOnExecutionContext(ctx);
    } finally {
      spy.restore();
    }

    expect(hubCalls).toHaveLength(1);
    expect(hubCalls[0].headers['x-hub-secret']).toBe('hub-secret');
    expect(hubCalls[0].body).toMatchObject({
      office: 'cso',
      type: 'spb_lapse_sweep',
      tier: 'T4',
      bindings_swept: 1,
      objects_deleted: 1,
      multipart_aborted: 0,
    });
    expect(JSON.stringify(hubCalls[0].body)).not.toContain(account.accountId);
    expect(JSON.stringify(hubCalls[0].body)).not.toContain(prefix);
  });

  it('does not expose a client-triggered sweep through fetch routes', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'spb-client-trigger@example.com', testEnv });
    await seedEntitlement({ accountId: account.accountId, service: SPB_SERVICE, status: 'active' });
    const token = 'client-trigger-token';
    const tokenHash = await hashWithPepper(token, testEnv);
    await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_A, lapsedAt: OLD_LAPSE, tokenHash });
    const fetchMock = vi.fn(() => {
      throw new Error('client route must not call R2');
    });
    vi.stubGlobal('fetch', fetchMock);

    const landing = await worker.fetch(new Request('https://services.solstone.app/backup'), testEnv);
    expect(landing.status).toBe(200);
    const credentials = await worker.fetch(new Request('https://services.solstone.app/backup/credentials', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope: 'maintenance' }),
    }), testEnv);
    expect(credentials.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(bindingRow(account.accountId, INSTANCE_A)).resolves.not.toBeNull();
    await expect(auditRows()).resolves.toEqual([]);
  });
});

function installSweepS3State(testEnv, {
  objectsByPrefix = {},
  uploadsByPrefix = {},
  failDeleteOnceForPrefix = new Set(),
  failAbortOnceForPrefix = new Set(),
} = {}) {
  const objectState = new Map(Object.entries(objectsByPrefix).map(([prefix, keys]) => [prefix, [...keys]]));
  const uploadState = new Map(Object.entries(uploadsByPrefix).map(([prefix, uploads]) => [prefix, uploads.map((upload) => ({ ...upload }))]));
  const objectSnapshots = new Map();
  const uploadSnapshots = new Map();
  let snapshotId = 0;

  const installed = installS3FetchMock(testEnv, {
    default: async ({ method, url, bodyText, init }) => {
      if (method === 'GET' && url.searchParams.get('list-type') === '2') {
        return xmlResponse(listObjectsXml(pageFromSnapshot({
          snapshots: objectSnapshots,
          snapshotId: () => ++snapshotId,
          token: url.searchParams.get('continuation-token'),
          values: objectState.get(url.searchParams.get('prefix')) || [],
          pageSize: 1000,
          tokenPrefix: 'objects',
        })));
      }
      if (method === 'POST' && url.searchParams.has('delete')) {
        const keys = keysFromDeleteBody(bodyText);
        const failPrefix = Array.from(failDeleteOnceForPrefix).find((prefix) => keys.some((key) => key.startsWith(prefix)));
        removeObjectKeys(objectState, keys);
        if (failPrefix) {
          failDeleteOnceForPrefix.delete(failPrefix);
          return xmlResponse(`<DeleteResult><Error><Key>${xmlEscape(keys[0])}</Key><Code>InternalError</Code><Message>fail once</Message></Error></DeleteResult>`);
        }
        return xmlResponse(`<DeleteResult>${keys.map((key) => `<Deleted><Key>${xmlEscape(key)}</Key></Deleted>`).join('')}</DeleteResult>`);
      }
      if (method === 'GET' && url.searchParams.has('uploads')) {
        return xmlResponse(listUploadsXml(pageFromSnapshot({
          snapshots: uploadSnapshots,
          snapshotId: () => ++snapshotId,
          token: uploadToken(url.searchParams.get('key-marker'), url.searchParams.get('upload-id-marker')),
          values: uploadState.get(url.searchParams.get('prefix')) || [],
          pageSize: 1,
          tokenPrefix: 'uploads',
        })));
      }
      if (method === 'DELETE' && url.searchParams.has('uploadId')) {
        const key = keyFromUrlPath(testEnv, url);
        const uploadId = url.searchParams.get('uploadId');
        const failPrefix = Array.from(failAbortOnceForPrefix).find((prefix) => key.startsWith(prefix));
        if (failPrefix) {
          failAbortOnceForPrefix.delete(failPrefix);
          return new Response('', { status: 500 });
        }
        removeUpload(uploadState, key, uploadId);
        return new Response(null, { status: 204 });
      }
      throw new Error(`unhandled sweep R2 request: ${method} ${url.href}`);
    },
  });

  return {
    ...installed,
    objectState,
    uploadState,
    failDeleteOnceForPrefix,
    failAbortOnceForPrefix,
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
    uploadState.set(prefix, current.filter((upload) => upload.key !== key || upload.uploadId !== uploadId));
  }
}

function expectCallsContained(calls, testEnv, prefixes) {
  const host = `${testEnv.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  for (const call of calls) {
    expect(call.url.host).toBe(host);
    expect(call.url.pathname === `/${testEnv.R2_BUCKET}` || call.url.pathname.startsWith(`/${testEnv.R2_BUCKET}/`)).toBe(true);
    const listedPrefix = call.url.searchParams.get('prefix');
    if (listedPrefix) expect(prefixes.some((prefix) => listedPrefix.startsWith(prefix))).toBe(true);
    if (call.method === 'POST' && call.url.searchParams.has('delete')) {
      for (const key of keysFromDeleteBody(call.bodyText)) {
        expect(prefixes.some((prefix) => key.startsWith(prefix))).toBe(true);
      }
    }
    if (call.method === 'DELETE' && call.url.searchParams.has('uploadId')) {
      const key = keyFromUrlPath(testEnv, call.url);
      expect(prefixes.some((prefix) => key.startsWith(prefix))).toBe(true);
    }
  }
}

function keysFromDeleteBody(bodyText) {
  return Array.from(bodyText.matchAll(/<Key>([\s\S]*?)<\/Key>/g), (match) => xmlDecode(match[1]));
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

async function bindingRow(accountId, instanceId) {
  const row = await workerEnv.DB
    .prepare('SELECT account_id, instance_id, lapsed_at FROM spb_bindings WHERE account_id = ? AND instance_id = ?')
    .bind(accountId, instanceId)
    .first();
  return row || null;
}

async function fullBindingRow(instanceId) {
  const row = await workerEnv.DB
    .prepare('SELECT * FROM spb_bindings WHERE instance_id = ?')
    .bind(instanceId)
    .first();
  return row || null;
}

async function auditRows() {
  const { results } = await workerEnv.DB
    .prepare(
      `SELECT account_id, instance_id, prefix, objects_deleted, multipart_aborted, ts
       FROM spb_sweep_audit
       ORDER BY ts, rowid`
    )
    .all();
  return results || [];
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
