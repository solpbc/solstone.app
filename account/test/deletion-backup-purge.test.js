import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAccountDeletionCoordinator } from '../src/deletion-coordinator.js';
import { encryptEmail } from '../src/crypto.js';
import { prefixFor } from '../src/spb-broker.js';
import {
  installS3FetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
} from './helpers.js';

const NOW = 1_700_000_000_000;
const INSTANCE_ID = '11111111-1111-1111-1111-111111111111';

describe('deletion backup purge', () => {
  beforeEach(resetDb);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('drains paginated backup objects and records a fresh empty verification', async () => {
    const env = makeTestEnv();
    const account = await seedAccount({ email: 'backup-paged@example.com', testEnv: env });
    const prefix = prefixFor(account.accountId, INSTANCE_ID);
    const s3 = installBackupS3State(env, {
      objectsByPrefix: {
        [prefix]: Array.from({ length: 1001 }, (_, index) => `${prefix}object-${index}`),
      },
    });
    await purgingDeletion(env, account.accountId, { frozenAt: NOW - 1, nextAttemptAt: NOW });

    const result = await runAccountDeletionCoordinator(env, NOW);

    expect(result).toMatchObject({ claimed: true, phase: 'purging', backup: 'complete' });
    expect(s3.objectState.get(prefix)).toEqual([]);
    expect(s3.calls.filter((call) => call.method === 'POST' && call.url.searchParams.has('delete'))).toHaveLength(2);
    expect(s3.calls.filter((call) => call.url.searchParams.get('continuation-token')).length).toBeGreaterThan(0);
    await expect(deletionRow()).resolves.toMatchObject({
      backup_safe_after: NOW - 1,
      backup_empty_verified_at: NOW,
    });
  });

  it('drains all 26 pages for an owner prefix without touching a control prefix', async () => {
    const env = makeTestEnv();
    const account = await seedAccount({ email: 'backup-26-pages@example.com', testEnv: env });
    const control = await seedAccount({ email: 'backup-26-pages-control@example.com', testEnv: env });
    const prefix = prefixFor(account.accountId, INSTANCE_ID);
    const controlPrefix = prefixFor(control.accountId, INSTANCE_ID);
    const s3 = installBackupS3State(env, {
      objectsByPrefix: {
        [prefix]: Array.from({ length: 25_476 }, (_, index) => `${prefix}object-${index}`),
        [controlPrefix]: [`${controlPrefix}control`],
      },
    });
    await purgingDeletion(env, account.accountId, { frozenAt: NOW - 1, nextAttemptAt: NOW });

    const result = await runAccountDeletionCoordinator(env, NOW);

    expect(result).toMatchObject({ claimed: true, phase: 'purging', backup: 'complete' });
    expect(s3.objectState.get(prefix)).toEqual([]);
    expect(s3.objectState.get(controlPrefix)).toEqual([`${controlPrefix}control`]);
    expect(s3.calls.filter((call) => call.method === 'POST' && call.url.searchParams.has('delete'))).toHaveLength(26);
    expect(s3.calls.filter((call) => call.url.searchParams.get('continuation-token'))).toHaveLength(25);
    expect(s3.calls.some((call) => call.url.searchParams.get('prefix') === controlPrefix)).toBe(false);
  });

  it('leaves backup purge retryable when final verification finds a residual object', async () => {
    const env = makeTestEnv();
    const account = await seedAccount({ email: 'backup-residual@example.com', testEnv: env });
    const control = await seedAccount({ email: 'backup-control@example.com', testEnv: env });
    const prefix = prefixFor(account.accountId, INSTANCE_ID);
    const controlPrefix = prefixFor(control.accountId, INSTANCE_ID);
    const s3 = installBackupS3State(env, {
      objectsByPrefix: {
        [prefix]: [`${prefix}initial`],
        [controlPrefix]: [`${controlPrefix}control`],
      },
      residualAfterDrainForPrefix: prefix,
    });
    await purgingDeletion(env, account.accountId, { frozenAt: NOW - 1, nextAttemptAt: NOW });

    const result = await runAccountDeletionCoordinator(env, NOW);

    expect(result).toMatchObject({ claimed: true, phase: 'purging', backup: 'retryable' });
    expect(s3.objectState.get(prefix)).toEqual([`${prefix}residual`]);
    expect(s3.calls.some((call) => call.url.searchParams.get('prefix') === controlPrefix)).toBe(false);
    expect(JSON.stringify(s3.calls)).not.toContain(controlPrefix);
    await expect(deletionRow()).resolves.toMatchObject({ backup_empty_verified_at: null, attempt_count: 1 });
  });

  it('waits past every recorded credential expiry before it drains', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const env = makeTestEnv();
    const account = await seedAccount({ email: 'backup-wait@example.com', testEnv: env });
    const prefix = prefixFor(account.accountId, INSTANCE_ID);
    const s3 = installBackupS3State(env, { objectsByPrefix: { [prefix]: [`${prefix}after-wait`] } });
    const frozenAt = NOW - 1_000;
    const safeAfter = NOW + 15 * 60 * 1000;
    await workerEnv.DB.prepare(
      `INSERT INTO spb_mint_audit (account_id, instance_id, prefix, scope, ttl, outcome, ts)
       VALUES (?, ?, ?, 'backup', 1, 'minted', ?)`
    ).bind(account.accountId, INSTANCE_ID, prefix, frozenAt - 1).run();
    await workerEnv.DB.prepare(
      `INSERT INTO spb_mint_reservations (id, account_id, instance_id, scope, reserved_expires_at, state, created_at)
       VALUES ('reservation', ?, ?, 'backup', ?, 'finalized', ?)`
    ).bind(account.accountId, INSTANCE_ID, safeAfter, NOW).run();
    await purgingDeletion(env, account.accountId, { frozenAt, nextAttemptAt: NOW });

    await runAccountDeletionCoordinator(env, Date.now());
    expect(s3.calls).toEqual([]);
    await expect(deletionRow()).resolves.toMatchObject({ backup_safe_after: safeAfter, backup_empty_verified_at: null });

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    await runAccountDeletionCoordinator(env, Date.now());
    expect(s3.calls).toEqual([]);

    const waiting = await deletionRow();
    await vi.advanceTimersByTimeAsync(waiting.next_attempt_at - Date.now() + 1);
    const result = await runAccountDeletionCoordinator(env, Date.now());

    expect(result).toMatchObject({ claimed: true, phase: 'purging', backup: 'complete' });
    expect(s3.calls.length).toBeGreaterThan(0);
    await expect(deletionRow()).resolves.toMatchObject({ backup_empty_verified_at: Date.now() });
  });
});

async function purgingDeletion(env, accountId, { frozenAt, nextAttemptAt }) {
  const snapshot = JSON.stringify({
    relay: { spl_instance_ids: [], spp_instance_ids: [] },
    backup: { spb_instance_ids: [INSTANCE_ID] },
    support_owner_id: accountId,
  });
  await workerEnv.DB.prepare(
    `INSERT INTO account_deletions (
       operation_id, account_id, phase, requested_at, frozen_at, cancellation_deadline_at,
       next_attempt_at, snapshot_encrypted, snapshot_digest, status_token_hash
     ) VALUES ('op', ?, 'purging', ?, ?, ?, ?, ?, 'digest', 'status')`
  ).bind(
    accountId,
    frozenAt - 1,
    frozenAt,
    frozenAt,
    nextAttemptAt,
    await encryptEmail(snapshot, env)
  ).run();
}

async function deletionRow() {
  return workerEnv.DB.prepare(
    "SELECT backup_safe_after, backup_empty_verified_at, attempt_count, next_attempt_at FROM account_deletions WHERE operation_id = 'op'"
  ).first();
}

function installBackupS3State(testEnv, {
  objectsByPrefix = {},
  residualAfterDrainForPrefix = null,
} = {}) {
  const objectState = new Map(Object.entries(objectsByPrefix).map(([prefix, keys]) => [prefix, [...keys]]));
  const snapshots = new Map();
  let snapshotId = 0;
  let residualAdded = false;
  const installed = installS3FetchMock(testEnv, {
    default: async ({ method, url, bodyText }) => {
      if (method === 'GET' && url.searchParams.get('list-type') === '2') {
        const prefix = url.searchParams.get('prefix');
        const page = objectPage({
          snapshots,
          snapshotId: () => ++snapshotId,
          token: url.searchParams.get('continuation-token'),
          values: objectState.get(prefix) || [],
        });
        const response = xmlResponse(listObjectsXml(page));
        if (
          prefix === residualAfterDrainForPrefix
          && !residualAdded
          && !url.searchParams.get('continuation-token')
          && page.keys.length === 0
        ) {
          objectState.set(prefix, [`${prefix}residual`]);
          residualAdded = true;
        }
        return response;
      }
      if (method === 'POST' && url.searchParams.has('delete')) {
        const keys = Array.from(bodyText.matchAll(/<Key>([\s\S]*?)<\/Key>/g), (match) => match[1]);
        for (const [prefix, current] of objectState.entries()) {
          objectState.set(prefix, current.filter((key) => !keys.includes(key)));
        }
        return xmlResponse(`<DeleteResult>${keys.map((key) => `<Deleted><Key>${key}</Key></Deleted>`).join('')}</DeleteResult>`);
      }
      if (method === 'GET' && url.searchParams.has('uploads')) {
        return xmlResponse('<ListMultipartUploadsResult><IsTruncated>false</IsTruncated></ListMultipartUploadsResult>');
      }
      throw new Error(`unhandled backup purge request: ${method} ${url.href}`);
    },
  });
  return { ...installed, objectState };
}

function objectPage({ snapshots, snapshotId, token, values }) {
  let id;
  let offset;
  let snapshot;
  if (token) {
    [id, offset] = token.split(':');
    snapshot = snapshots.get(id) || [];
    offset = Number(offset);
  } else {
    id = String(snapshotId());
    offset = 0;
    snapshot = [...values];
    snapshots.set(id, snapshot);
  }
  const keys = snapshot.slice(offset, offset + 1000);
  const nextOffset = offset + keys.length;
  return {
    keys,
    isTruncated: nextOffset < snapshot.length,
    nextToken: nextOffset < snapshot.length ? `${id}:${nextOffset}` : null,
  };
}

function listObjectsXml({ keys, isTruncated, nextToken }) {
  return `<ListBucketResult><IsTruncated>${isTruncated}</IsTruncated>${keys
    .map((key) => `<Contents><Key>${key}</Key><LastModified>2026-01-01T00:00:00.000Z</LastModified><Size>1</Size></Contents>`)
    .join('')}${nextToken ? `<NextContinuationToken>${nextToken}</NextContinuationToken>` : ''}</ListBucketResult>`;
}

function xmlResponse(body) {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/xml' },
  });
}
