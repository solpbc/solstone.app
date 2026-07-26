import {
  createExecutionContext,
  env as workerEnv,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashWithPepper } from '../src/crypto.js';
import {
  advanceSpbSandboxCredentialExpiry,
  clearSpbBindingLapsed,
  findSpbBindingByTokenHash,
  markSpbBindingLapsed,
  upsertSpbBinding,
} from '../src/db.js';
import {
  claimSpbSandboxBinding,
  denySpbSandboxBinding,
} from '../src/spb-sandbox-lifecycle.js';
import {
  installConsoleSpy,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedSandboxRun,
} from './helpers.js';

const RUN_A = 'aaaaaaaa-1111-1111-1111-111111111111';
const RUN_B = 'bbbbbbbb-2222-2222-2222-222222222222';
const INSTANCE_A = '11111111-1111-1111-1111-111111111111';
const INSTANCE_B = '22222222-2222-2222-2222-222222222222';
const INSTANCE_C = '33333333-3333-3333-3333-333333333333';

describe('SPB sandbox lifecycle', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('guarded upsert inserts and refreshes the exact owner without decreasing expiry', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const first = await claimSpbSandboxBinding(testEnv, {
      sandboxRunId: RUN_A,
      accountId: account.accountId,
      instanceId: INSTANCE_A,
      nowMs: 1_000,
    });
    const firstHash = await hashWithPepper(first.credential, testEnv);
    await seedSandboxRun({
      runId: RUN_A,
      accountId: account.accountId,
      instanceId: INSTANCE_A,
      createdAt: 0,
    });

    expect(first).toMatchObject({ outcome: 'claimed', credential: expect.any(String) });
    await expect(advanceSpbSandboxCredentialExpiry(testEnv.DB, {
      proposedExpiryMs: 91_000,
      tokenHash: firstHash,
      accountId: account.accountId,
      instanceId: INSTANCE_A,
      sandboxRunId: RUN_A,
      nowMs: 1_000,
    })).resolves.toMatchObject({ sandbox_credential_expires_at: 91_000 });

    const second = await claimSpbSandboxBinding(testEnv, {
      sandboxRunId: RUN_A,
      accountId: account.accountId,
      instanceId: INSTANCE_A,
      nowMs: 2_000,
    });
    const refreshed = await bindingRow(INSTANCE_A);

    expect(second).toMatchObject({ outcome: 'claimed', credential: expect.any(String) });
    expect(second.credential).not.toBe(first.credential);
    expect(refreshed).toMatchObject({
      account_id: account.accountId,
      instance_id: INSTANCE_A,
      sandbox_run_id: RUN_A,
      created_at: 1_000,
      last_seen_at: 2_000,
      token_hash: await hashWithPepper(second.credential, testEnv),
      lapsed_at: null,
      sandbox_credential_expires_at: 91_000,
      sandbox_denied_at: null,
    });
  });

  it('returns null without changing an incumbent and distinguishes that loss from an exception', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await claimSpbSandboxBinding(testEnv, {
      sandboxRunId: RUN_A,
      accountId: account.accountId,
      instanceId: INSTANCE_A,
      nowMs: 1_000,
    });
    const before = await bindingRow(INSTANCE_A);

    await expect(upsertSpbBinding(testEnv.DB, {
      accountId: account.accountId,
      instanceId: INSTANCE_A,
      tokenHash: 'baseline-loser-hash',
      nowMs: 2_000,
    })).resolves.toBeNull();
    await expect(bindingRow(INSTANCE_A)).resolves.toEqual(before);

    const operationalFailure = new Error('D1 unavailable');
    const failingDb = {
      prepare() {
        throw operationalFailure;
      },
    };
    await expect(upsertSpbBinding(failingDb, {
      accountId: account.accountId,
      instanceId: INSTANCE_B,
      tokenHash: 'unwritten-hash',
      nowMs: 3_000,
    })).rejects.toBe(operationalFailure);
  });

  it('serializes baseline-vs-run, run-vs-run, and cross-account claims to one owner', async () => {
    const testEnv = makeTestEnv();
    const accountA = await seedAccount({ email: 'spb-run-a@example.com', testEnv });
    const accountB = await seedAccount({ email: 'spb-run-b@example.com', testEnv });

    const baselineVsRun = await Promise.all([
      upsertSpbBinding(testEnv.DB, {
        accountId: accountA.accountId,
        instanceId: INSTANCE_A,
        tokenHash: 'baseline-hash',
        nowMs: 1_000,
      }).then(claimResult),
      claimSpbSandboxBinding(testEnv, {
        sandboxRunId: RUN_A,
        accountId: accountA.accountId,
        instanceId: INSTANCE_A,
        nowMs: 1_001,
      }),
    ]);
    expect(outcomes(baselineVsRun)).toEqual(['claimed', 'ownership_conflict']);
    await expect(bindingCount(INSTANCE_A)).resolves.toBe(1);

    const runVsRun = await Promise.all([
      claimSpbSandboxBinding(testEnv, {
        sandboxRunId: RUN_A,
        accountId: accountA.accountId,
        instanceId: INSTANCE_B,
        nowMs: 2_000,
      }),
      claimSpbSandboxBinding(testEnv, {
        sandboxRunId: RUN_B,
        accountId: accountA.accountId,
        instanceId: INSTANCE_B,
        nowMs: 2_001,
      }),
    ]);
    expect(outcomes(runVsRun)).toEqual(['claimed', 'ownership_conflict']);
    await expect(bindingCount(INSTANCE_B)).resolves.toBe(1);

    const crossAccount = await Promise.all([
      claimSpbSandboxBinding(testEnv, {
        sandboxRunId: RUN_A,
        accountId: accountA.accountId,
        instanceId: INSTANCE_C,
        nowMs: 3_000,
      }),
      claimSpbSandboxBinding(testEnv, {
        sandboxRunId: RUN_A,
        accountId: accountB.accountId,
        instanceId: INSTANCE_C,
        nowMs: 3_001,
      }),
    ]);
    expect(outcomes(crossAccount)).toEqual(['claimed', 'ownership_conflict']);
    await expect(bindingCount(INSTANCE_C)).resolves.toBe(1);
  });

  it('denial clears only the exact token and preserves lifecycle state with identifier-free evidence', async () => {
    const hubCalls = [];
    vi.stubGlobal('fetch', vi.fn(async (_input, init = {}) => {
      hubCalls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }));
    const testEnv = makeTestEnv({
      HUB_WEBHOOK_URL: 'https://extro.solpbc.org/hooks/security',
      HUB_WEBHOOK_SECRET: 'hub-secret',
    });
    const account = await seedAccount({ testEnv });
    const claimed = await claimSpbSandboxBinding(testEnv, {
      sandboxRunId: RUN_A,
      accountId: account.accountId,
      instanceId: INSTANCE_A,
      nowMs: 1_000,
    });
    const control = await claimSpbSandboxBinding(testEnv, {
      sandboxRunId: RUN_A,
      accountId: account.accountId,
      instanceId: INSTANCE_B,
      nowMs: 1_100,
    });
    const tokenHash = await hashWithPepper(claimed.credential, testEnv);
    await seedSandboxRun({
      runId: RUN_A,
      accountId: account.accountId,
      instanceId: INSTANCE_A,
      createdAt: 0,
    });
    await advanceSpbSandboxCredentialExpiry(testEnv.DB, {
      proposedExpiryMs: 91_000,
      tokenHash,
      accountId: account.accountId,
      instanceId: INSTANCE_A,
      sandboxRunId: RUN_A,
      nowMs: 2_000,
    });
    const before = await bindingRow(INSTANCE_A);
    const controlBefore = await bindingRow(INSTANCE_B);
    const ctx = createExecutionContext();
    const spy = installConsoleSpy();

    try {
      await expect(denySpbSandboxBinding(testEnv, ctx, {
        sandboxRunId: RUN_A,
        accountId: account.accountId,
        instanceId: INSTANCE_A,
        nowMs: 10_000,
      })).resolves.toEqual({ outcome: 'released' });
      await waitOnExecutionContext(ctx);
      spy.assertNoSecrets([claimed.credential, control.credential]);
    } finally {
      spy.restore();
    }

    const after = await bindingRow(INSTANCE_A);
    expect(after).toEqual({
      ...before,
      token_hash: null,
      sandbox_denied_at: 10_000,
    });
    expect(after.account_id).toBe(before.account_id);
    expect(after.instance_id).toBe(before.instance_id);
    expect(after.sandbox_run_id).toBe(before.sandbox_run_id);
    expect(after.created_at).toBe(before.created_at);
    expect(after.sandbox_credential_expires_at).toBe(before.sandbox_credential_expires_at);
    await expect(bindingRow(INSTANCE_B)).resolves.toEqual(controlBefore);
    await expect(findSpbBindingByTokenHash(testEnv.DB, tokenHash, 10_000)).resolves.toBeNull();
    await expect(auditRows()).resolves.toEqual([{
      event: 'denial',
      outcome: 'released',
      scope: null,
      ttl: null,
      credentials_minted: null,
      objects_deleted: null,
      multipart_aborted: null,
      ts: 10_000,
    }]);
    expect(hubCalls).toHaveLength(1);
    expect(hubCalls[0]).toMatchObject({
      office: 'cso',
      type: 'spb_sandbox_denial',
      tier: 'T4',
      outcome: 'released',
      bindings_denied: 1,
    });
    const evidence = JSON.stringify({ audit: await auditRows(), hubCalls });
    expect(evidence).not.toContain(claimed.credential);
    expect(evidence).not.toContain(tokenHash);
    expect(evidence).not.toContain(account.accountId);
    expect(evidence).not.toContain(RUN_A);
    expect(evidence).not.toContain(INSTANCE_A);
  });

  it('redacts upstream denial failures behind a stable message-free error', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await claimSpbSandboxBinding(testEnv, {
      sandboxRunId: RUN_A,
      accountId: account.accountId,
      instanceId: INSTANCE_A,
      nowMs: 1_000,
    });
    const upstreamText = 'D1 upstream leaked internal detail';
    const failingEnv = {
      ...testEnv,
      DB: {
        prepare(sql) {
          if (!/UPDATE spb_bindings\s+SET token_hash = NULL/i.test(sql)) {
            return testEnv.DB.prepare(sql);
          }
          return {
            bind() {
              return {
                all() {
                  throw new Error(upstreamText);
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

    const error = await denySpbSandboxBinding(failingEnv, null, {
      sandboxRunId: RUN_A,
      accountId: account.accountId,
      instanceId: INSTANCE_A,
      nowMs: 2_000,
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SpbSandboxDenialError');
    expect(error.message).toBe('');
    expect(String(error)).not.toContain(upstreamText);
    await expect(auditRows()).resolves.toEqual([{
      event: 'denial',
      outcome: 'internal_error',
      scope: null,
      ttl: null,
      credentials_minted: null,
      objects_deleted: null,
      multipart_aborted: null,
      ts: 2_000,
    }]);
  });

  it('classifies re-denial as absent and another owner as ownership_conflict', async () => {
    const testEnv = makeTestEnv();
    const accountA = await seedAccount({ email: 'spb-deny-a@example.com', testEnv });
    const accountB = await seedAccount({ email: 'spb-deny-b@example.com', testEnv });
    await claimSpbSandboxBinding(testEnv, {
      sandboxRunId: RUN_A,
      accountId: accountA.accountId,
      instanceId: INSTANCE_A,
      nowMs: 1_000,
    });

    await expect(denySpbSandboxBinding(testEnv, null, {
      sandboxRunId: RUN_A,
      accountId: accountA.accountId,
      instanceId: INSTANCE_A,
      nowMs: 2_000,
    })).resolves.toEqual({ outcome: 'released' });
    await expect(denySpbSandboxBinding(testEnv, null, {
      sandboxRunId: RUN_A,
      accountId: accountA.accountId,
      instanceId: INSTANCE_A,
      nowMs: 3_000,
    })).resolves.toEqual({ outcome: 'absent' });
    await expect(denySpbSandboxBinding(testEnv, null, {
      sandboxRunId: RUN_A,
      accountId: accountB.accountId,
      instanceId: INSTANCE_A,
      nowMs: 4_000,
    })).resolves.toEqual({ outcome: 'ownership_conflict' });
    await expect(denySpbSandboxBinding(testEnv, null, {
      sandboxRunId: RUN_B,
      accountId: accountA.accountId,
      instanceId: INSTANCE_A,
      nowMs: 5_000,
    })).resolves.toEqual({ outcome: 'ownership_conflict' });
    expect((await auditRows()).map(({ outcome }) => outcome)).toEqual([
      'released',
      'absent',
      'ownership_conflict',
      'ownership_conflict',
    ]);
  });

  it('keeps denial irreversible in both same-run upsert orderings', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });

    const first = await claimSpbSandboxBinding(testEnv, {
      sandboxRunId: RUN_A,
      accountId: account.accountId,
      instanceId: INSTANCE_A,
      nowMs: 1_000,
    });
    const refreshed = await claimSpbSandboxBinding(testEnv, {
      sandboxRunId: RUN_A,
      accountId: account.accountId,
      instanceId: INSTANCE_A,
      nowMs: 2_000,
    });
    expect(refreshed.credential).not.toBe(first.credential);
    await denySpbSandboxBinding(testEnv, null, {
      sandboxRunId: RUN_A,
      accountId: account.accountId,
      instanceId: INSTANCE_A,
      nowMs: 3_000,
    });
    expect(await bindingRow(INSTANCE_A)).toMatchObject({
      token_hash: null,
      sandbox_denied_at: 3_000,
    });

    const second = await claimSpbSandboxBinding(testEnv, {
      sandboxRunId: RUN_A,
      accountId: account.accountId,
      instanceId: INSTANCE_B,
      nowMs: 4_000,
    });
    const secondHash = await hashWithPepper(second.credential, testEnv);
    await denySpbSandboxBinding(testEnv, null, {
      sandboxRunId: RUN_A,
      accountId: account.accountId,
      instanceId: INSTANCE_B,
      nowMs: 5_000,
    });
    const tombstone = await bindingRow(INSTANCE_B);
    const loser = await claimSpbSandboxBinding(testEnv, {
      sandboxRunId: RUN_A,
      accountId: account.accountId,
      instanceId: INSTANCE_B,
      nowMs: 6_000,
    });

    expect(loser).toEqual({ outcome: 'ownership_conflict' });
    expect(loser).not.toHaveProperty('credential');
    await expect(advanceSpbSandboxCredentialExpiry(testEnv.DB, {
      proposedExpiryMs: 95_000,
      tokenHash: secondHash,
      accountId: account.accountId,
      instanceId: INSTANCE_B,
      sandboxRunId: RUN_A,
      nowMs: 6_000,
    })).resolves.toBeNull();
    await expect(bindingRow(INSTANCE_B)).resolves.toEqual(tombstone);
  });

  it('clearSpbBindingLapsed cannot restore a denied token', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const claimed = await claimSpbSandboxBinding(testEnv, {
      sandboxRunId: RUN_A,
      accountId: account.accountId,
      instanceId: INSTANCE_A,
      nowMs: 1_000,
    });
    await markSpbBindingLapsed(testEnv.DB, { accountId: account.accountId, nowMs: 2_000 });
    await denySpbSandboxBinding(testEnv, null, {
      sandboxRunId: RUN_A,
      accountId: account.accountId,
      instanceId: INSTANCE_A,
      nowMs: 3_000,
    });

    await clearSpbBindingLapsed(testEnv.DB, { accountId: account.accountId });

    await expect(bindingRow(INSTANCE_A)).resolves.toMatchObject({
      token_hash: null,
      lapsed_at: null,
      sandbox_run_id: RUN_A,
      sandbox_denied_at: 3_000,
    });
    await expect(findSpbBindingByTokenHash(
      testEnv.DB,
      await hashWithPepper(claimed.credential, testEnv),
      3_000
    )).resolves.toBeNull();
  });

  it('reports missing lifecycle state as absent, never released', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });

    const result = await denySpbSandboxBinding(testEnv, null, {
      sandboxRunId: RUN_A,
      accountId: account.accountId,
      instanceId: INSTANCE_A,
      nowMs: 1_000,
    });

    expect(result).toEqual({ outcome: 'absent' });
    expect(result.outcome).not.toBe('released');
    await expect(auditRows()).resolves.toEqual([{
      event: 'denial',
      outcome: 'absent',
      scope: null,
      ttl: null,
      credentials_minted: null,
      objects_deleted: null,
      multipart_aborted: null,
      ts: 1_000,
    }]);
  });

  it('rejects noncanonical identifiers before hashing or D1 work', async () => {
    const prepare = vi.fn(() => {
      throw new Error('D1 must not be reached');
    });
    const testEnv = { ...makeTestEnv(), DB: { prepare } };

    await expect(claimSpbSandboxBinding(testEnv, {
      sandboxRunId: 'not-a-run',
      accountId: INSTANCE_A,
      instanceId: INSTANCE_B,
    })).rejects.toThrow('invalid sandbox ownership identifier');
    await expect(denySpbSandboxBinding(testEnv, null, {
      sandboxRunId: RUN_A,
      accountId: 'not-an-account',
      instanceId: INSTANCE_B,
    })).rejects.toThrow('invalid sandbox ownership identifier');
    expect(prepare).not.toHaveBeenCalled();
  });
});

function claimResult(row) {
  return { outcome: row ? 'claimed' : 'ownership_conflict' };
}

function outcomes(results) {
  return results.map(({ outcome }) => outcome).sort();
}

async function bindingRow(instanceId) {
  const row = await workerEnv.DB
    .prepare(
      `SELECT account_id,
              instance_id,
              created_at,
              last_seen_at,
              token_hash,
              lapsed_at,
              sandbox_run_id,
              sandbox_credential_expires_at,
              sandbox_denied_at
       FROM spb_bindings
       WHERE instance_id = ?`
    )
    .bind(instanceId)
    .first();
  return row || null;
}

async function bindingCount(instanceId) {
  const row = await workerEnv.DB
    .prepare('SELECT COUNT(*) AS count FROM spb_bindings WHERE instance_id = ?')
    .bind(instanceId)
    .first();
  return row.count;
}

async function auditRows() {
  const { results } = await workerEnv.DB
    .prepare(
      `SELECT event,
              outcome,
              scope,
              ttl,
              credentials_minted,
              objects_deleted,
              multipart_aborted,
              ts
       FROM spb_sandbox_audit
       ORDER BY rowid`
    )
    .all();
  return results || [];
}
