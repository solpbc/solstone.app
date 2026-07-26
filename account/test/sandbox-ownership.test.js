import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { mintDispatchToken, resolveDispatchToken } from '../src/dispatch-tokens.js';
import { upsertSplBinding, upsertSppBinding } from '../src/db.js';
import {
  claimSandboxSplBinding,
  claimSandboxSppBinding,
  mintSandboxDispatchToken,
  releaseSandboxDispatchTokens,
  releaseSandboxSplBinding,
  releaseSandboxSppBinding,
} from '../src/sandbox-ownership.js';
import {
  isSandboxRunLeaseLive,
  SANDBOX_CLEANUP_PHASE,
  SANDBOX_COMPONENT_STATE,
  SANDBOX_PROVISIONING_PHASE,
  SANDBOX_RUN_STATUS,
} from '../src/sandbox-run-contract.js';
import {
  installConsoleSpy,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedScoutApplication,
  seedSandboxRun,
  seedSplBinding,
  seedSppBinding,
} from './helpers.js';

const RUN_A = 'aaaaaaaa-1111-1111-1111-111111111111';
const RUN_B = 'bbbbbbbb-2222-2222-2222-222222222222';
const RUN_C = 'cccccccc-3333-3333-3333-333333333333';
const INSTANCE_A = '11111111-1111-1111-1111-111111111111';
const INSTANCE_B = '22222222-2222-2222-2222-222222222222';
const INSTANCE_C = '33333333-3333-3333-3333-333333333333';
const INSTANCE_D = '44444444-4444-4444-4444-444444444444';
const INSTANCE_E = '55555555-5555-5555-5555-555555555555';

const bindingKinds = [
  {
    name: 'SPL',
    table: 'spl_bindings',
    claim: claimSandboxSplBinding,
    release: releaseSandboxSplBinding,
    baseline(env, { accountId, instanceId, nowMs }) {
      return upsertSplBinding(env.DB, { accountId, instanceId, nowMs });
    },
    seed(values) {
      return seedSplBinding(values);
    },
  },
  {
    name: 'SPP',
    table: 'spp_bindings',
    claim: claimSandboxSppBinding,
    release: releaseSandboxSppBinding,
    baseline(env, { accountId, instanceId, nowMs }) {
      return upsertSppBinding(env.DB, {
        accountId,
        instanceId,
        tokenHash: `baseline-hash-${nowMs}`,
        nowMs,
        consentAckedAt: nowMs,
        consentDisclosureVersion: `consent-${nowMs}`,
      });
    },
    seed(values) {
      return seedSppBinding(values);
    },
  },
];

describe('sandbox ownership boundary', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects noncanonical identifiers at every helper boundary before effects', async () => {
    const prepare = vi.fn(() => {
      throw new Error('D1 must not be reached');
    });
    const testEnv = { ...makeTestEnv(), DB: { prepare } };
    const invalid = 'not-a-uuid';
    const calls = [
      () => mintSandboxDispatchToken(testEnv, { sandboxRunId: invalid, accountId: INSTANCE_A }),
      () => claimSandboxSplBinding(testEnv, {
        sandboxRunId: RUN_A, accountId: invalid, instanceId: INSTANCE_A,
      }),
      () => claimSandboxSppBinding(testEnv, {
        sandboxRunId: RUN_A, accountId: INSTANCE_A, instanceId: invalid,
      }),
      () => releaseSandboxDispatchTokens(testEnv, { sandboxRunId: invalid, accountId: INSTANCE_A }),
      () => releaseSandboxSplBinding(testEnv, {
        sandboxRunId: RUN_A, accountId: invalid, instanceId: INSTANCE_A,
      }),
      () => releaseSandboxSppBinding(testEnv, {
        sandboxRunId: RUN_A, accountId: INSTANCE_A, instanceId: invalid,
      }),
    ];

    for (const invoke of calls) {
      const error = await invoke().catch((caught) => caught);
      expect(error).toBeInstanceOf(TypeError);
      expect(error.message).toBe('invalid sandbox ownership identifier');
      expect(error.message).not.toContain(invalid);
    }
    expect(prepare).not.toHaveBeenCalled();
  });

  it('accepts the canonical UUID shape case-insensitively', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedSandboxRun({
      runId: RUN_A.toUpperCase(),
      accountId: account.accountId,
      instanceId: INSTANCE_A.toUpperCase(),
      status: SANDBOX_RUN_STATUS.PROVISIONING,
      provisioningPhase: SANDBOX_PROVISIONING_PHASE.SPL_INTENT,
      createdAt: 1_000,
      dispatchState: SANDBOX_COMPONENT_STATE.DENY_PENDING,
      sppState: SANDBOX_COMPONENT_STATE.DENY_PENDING,
      spbState: SANDBOX_COMPONENT_STATE.DENY_PENDING,
      splRelayState: SANDBOX_COMPONENT_STATE.DENY_PENDING,
      splBindingState: SANDBOX_COMPONENT_STATE.DENY_PENDING,
    });

    await expect(claimSandboxSplBinding(testEnv, {
      sandboxRunId: RUN_A.toUpperCase(),
      accountId: account.accountId,
      instanceId: INSTANCE_A.toUpperCase(),
      nowMs: 1_000,
    })).resolves.toEqual({ outcome: 'claimed' });
  });

  it('uses active status and a strict future expiry as the single lease authority', () => {
    expect(isSandboxRunLeaseLive({
      status: SANDBOX_RUN_STATUS.ACTIVE,
      lease_expires_at: 2_001,
    }, 2_000)).toBe(true);
    expect(isSandboxRunLeaseLive({
      status: SANDBOX_RUN_STATUS.PROVISIONING,
      lease_expires_at: 2_001,
    }, 2_000)).toBe(false);
    expect(isSandboxRunLeaseLive({
      status: SANDBOX_RUN_STATUS.ACTIVE,
      lease_expires_at: 2_000,
    }, 2_000)).toBe(false);
  });
});

describe.each(bindingKinds)('$name sandbox binding claims', (kind) => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('claims and refreshes only while the exact run intent remains current', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: `${kind.name.toLowerCase()}-retry@example.com`, testEnv });
    const phase = kind.name === 'SPL'
      ? SANDBOX_PROVISIONING_PHASE.SPL_INTENT
      : SANDBOX_PROVISIONING_PHASE.SPP_INTENT;
    await seedProvisioningRun({ accountId: account.accountId, instanceId: INSTANCE_A, phase });
    const spy = installConsoleSpy();
    try {
      const first = await kind.claim(testEnv, {
        sandboxRunId: RUN_A,
        accountId: account.accountId,
        instanceId: INSTANCE_A,
        nowMs: 1_000,
      });
      const before = await bindingRow(kind.table, INSTANCE_A);
      const second = await kind.claim(testEnv, {
        sandboxRunId: RUN_A,
        accountId: account.accountId,
        instanceId: INSTANCE_A,
        nowMs: 2_000,
      });
      const after = await bindingRow(kind.table, INSTANCE_A);

      expect(first).toMatchObject({ outcome: 'claimed' });
      expect(second).toMatchObject({ outcome: 'claimed' });
      expect(after.created_at).toBe(1_000);
      expect(after.last_seen_at).toBe(2_000);
      expect(after.account_id).toBe(before.account_id);
      expect(after.instance_id).toBe(before.instance_id);
      expect(after.sandbox_run_id).toBe(before.sandbox_run_id);
      if (kind.name === 'SPL') expect(after).toEqual({ ...before, last_seen_at: 2_000 });
      if (first.credential) spy.assertNoSecrets([first.credential, second.credential]);
    } finally {
      spy.restore();
    }
  });

  it('returns run_fence_lost without a write for missing, mismatched, or quiesced ownership', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: `${kind.name.toLowerCase()}-fence@example.com`, testEnv });
    const phase = kind.name === 'SPL'
      ? SANDBOX_PROVISIONING_PHASE.SPL_INTENT
      : SANDBOX_PROVISIONING_PHASE.SPP_INTENT;
    await seedProvisioningRun({ accountId: account.accountId, instanceId: INSTANCE_A, phase });
    await workerEnv.DB.prepare(
      `UPDATE sandbox_runs SET status = '${SANDBOX_RUN_STATUS.CLEANUP_REQUIRED}', cleanup_phase = '${SANDBOX_CLEANUP_PHASE.DENY_INTENT}' WHERE run_id = ?`
    ).bind(RUN_A).run();

    await expect(kind.claim(testEnv, {
      sandboxRunId: RUN_A,
      accountId: account.accountId,
      instanceId: INSTANCE_A,
      nowMs: 2_000,
    })).resolves.toEqual({ outcome: 'run_fence_lost' });
    await expect(bindingCount(kind.table, INSTANCE_A)).resolves.toBe(0);
    await expect(kind.claim(testEnv, {
      sandboxRunId: RUN_B,
      accountId: account.accountId,
      instanceId: INSTANCE_B,
      nowMs: 3_000,
    })).resolves.toEqual({ outcome: 'run_fence_lost' });
    await expect(bindingCount(kind.table, INSTANCE_B)).resolves.toBe(0);
  });

  it('keeps a baseline incumbent byte-identical and reports ownership_conflict', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: `${kind.name.toLowerCase()}-incumbent@example.com`, testEnv });
    const phase = kind.name === 'SPL'
      ? SANDBOX_PROVISIONING_PHASE.SPL_INTENT
      : SANDBOX_PROVISIONING_PHASE.SPP_INTENT;
    await seedProvisioningRun({ accountId: account.accountId, instanceId: INSTANCE_A, phase });
    await kind.baseline(testEnv, { accountId: account.accountId, instanceId: INSTANCE_A, nowMs: 1_000 });
    const before = await bindingRow(kind.table, INSTANCE_A);

    await expect(kind.claim(testEnv, {
      sandboxRunId: RUN_A,
      accountId: account.accountId,
      instanceId: INSTANCE_A,
      nowMs: 2_000,
    })).resolves.toEqual({ outcome: 'ownership_conflict' });
    await expect(bindingRow(kind.table, INSTANCE_A)).resolves.toEqual(before);
  });
});

describe.each(bindingKinds)('$name sandbox binding release', (kind) => {
  beforeEach(async () => {
    await resetDb();
  });

  it('distinguishes released, absent, and ownership_conflict without adopting another owner', async () => {
    const testEnv = makeTestEnv();
    const accountA = await seedAccount({ email: `${kind.name.toLowerCase()}-release-a@example.com`, testEnv });
    const accountB = await seedAccount({ email: `${kind.name.toLowerCase()}-release-b@example.com`, testEnv });
    await kind.seed({ accountId: accountA.accountId, instanceId: INSTANCE_A, sandboxRunId: RUN_A });
    await kind.seed({ accountId: accountA.accountId, instanceId: INSTANCE_B, sandboxRunId: null });
    await kind.seed({ accountId: accountA.accountId, instanceId: INSTANCE_C, sandboxRunId: RUN_B });
    await kind.seed({ accountId: accountB.accountId, instanceId: INSTANCE_D, sandboxRunId: RUN_A });
    const baselineBefore = await bindingRow(kind.table, INSTANCE_B);
    const otherRunBefore = await bindingRow(kind.table, INSTANCE_C);
    const otherAccountBefore = await bindingRow(kind.table, INSTANCE_D);

    await expect(kind.release(testEnv, {
      sandboxRunId: RUN_A, accountId: accountA.accountId, instanceId: INSTANCE_A,
    })).resolves.toEqual({ outcome: 'released' });
    await expect(bindingRow(kind.table, INSTANCE_A)).resolves.toBeNull();
    await expect(kind.release(testEnv, {
      sandboxRunId: RUN_A, accountId: accountA.accountId, instanceId: INSTANCE_A,
    })).resolves.toEqual({ outcome: 'absent' });
    await expect(kind.release(testEnv, {
      sandboxRunId: RUN_A, accountId: accountA.accountId, instanceId: INSTANCE_E,
    })).resolves.toEqual({ outcome: 'absent' });

    for (const instanceId of [INSTANCE_B, INSTANCE_C, INSTANCE_D]) {
      await expect(kind.release(testEnv, {
        sandboxRunId: RUN_A,
        accountId: accountA.accountId,
        instanceId,
      })).resolves.toEqual({ outcome: 'ownership_conflict' });
    }
    await expect(bindingRow(kind.table, INSTANCE_B)).resolves.toEqual(baselineBefore);
    await expect(bindingRow(kind.table, INSTANCE_C)).resolves.toEqual(otherRunBefore);
    await expect(bindingRow(kind.table, INSTANCE_D)).resolves.toEqual(otherAccountBefore);
  });
});

describe('sandbox dispatch ownership', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('mints hash-only rows and releases every exact-run token without touching other rows', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const accountA = await seedAccount({ email: 'dispatch-a@example.com', testEnv });
    const accountB = await seedAccount({ email: 'dispatch-b@example.com', testEnv });
    try {
      await seedProvisioningRun({
        accountId: accountA.accountId,
        instanceId: INSTANCE_A,
        phase: SANDBOX_PROVISIONING_PHASE.DISPATCH_INTENT,
      });
      const targetA = await mintSandboxDispatchToken(testEnv, {
        sandboxRunId: RUN_A, accountId: accountA.accountId, instanceId: INSTANCE_A,
      });
      const targetB = await mintSandboxDispatchToken(testEnv, {
        sandboxRunId: RUN_A, accountId: accountA.accountId, instanceId: INSTANCE_A,
      });
      const otherAccount = await mintDispatchToken(testEnv, accountB.accountId, RUN_C);
      const baseline = await mintDispatchToken(testEnv, accountA.accountId);
      await seedSandboxRun({
        runId: RUN_C,
        accountId: accountB.accountId,
        instanceId: INSTANCE_C,
        createdAt: 0,
      });
      const before = await dispatchRows();

      expect(before.find((row) => row.token_hash === targetA.tokenHash)).toMatchObject({
        account_id: accountA.accountId,
        sandbox_run_id: RUN_A,
        revoked_at: null,
      });
      expect(JSON.stringify(before)).not.toContain(targetA.token);
      expect(JSON.stringify(before)).not.toContain(targetB.token);

      const released = await releaseSandboxDispatchTokens(testEnv, {
        sandboxRunId: RUN_A,
        accountId: accountA.accountId,
        nowMs: 2_000,
      });
      expect(released).toEqual({ outcome: 'released' });
      const after = await dispatchRows();
      for (const target of [targetA, targetB]) {
        expect(after.find((row) => row.token_hash === target.tokenHash)?.revoked_at).toBe(2_000);
        await expect(resolveDispatchToken(testEnv, target.token)).resolves.toBeNull();
      }
      for (const untouched of [otherAccount, baseline]) {
        expect(after.find((row) => row.token_hash === untouched.tokenHash))
          .toEqual(before.find((row) => row.token_hash === untouched.tokenHash));
        await expect(resolveDispatchToken(testEnv, untouched.token)).resolves.toEqual({
          accountId: untouched.accountId,
        });
      }

      await expect(releaseSandboxDispatchTokens(testEnv, {
        sandboxRunId: RUN_A,
        accountId: accountA.accountId,
        nowMs: 3_000,
      })).resolves.toEqual({ outcome: 'absent' });
      await expect(dispatchRows()).resolves.toEqual(after);
      spy.assertNoSecrets([
        targetA.token, targetA.tokenHash, targetB.token, targetB.tokenHash,
        otherAccount.token, otherAccount.tokenHash,
        baseline.token, baseline.tokenHash, accountA.accountId, accountB.accountId, RUN_A, RUN_B, RUN_C,
      ]);
    } finally {
      spy.restore();
      vi.useRealTimers();
    }
  });

  it('returns ownership_conflict without mutation for a mixed-account run anomaly', async () => {
    const testEnv = makeTestEnv();
    const accountA = await seedAccount({ email: 'dispatch-conflict-a@example.com', testEnv });
    const accountB = await seedAccount({ email: 'dispatch-conflict-b@example.com', testEnv });
    await mintDispatchToken(testEnv, accountA.accountId, RUN_A);
    await mintDispatchToken(testEnv, accountB.accountId, RUN_A);
    const before = await dispatchRows();

    await expect(releaseSandboxDispatchTokens(testEnv, {
      sandboxRunId: RUN_A,
      accountId: accountA.accountId,
      nowMs: 2_000,
    })).resolves.toEqual({ outcome: 'ownership_conflict' });
    await expect(dispatchRows()).resolves.toEqual(before);
  });

  it('denies the old Scout status token without changing Scout or key state', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'dispatch-status@example.com', testEnv });
    await seedScoutApplication({
      accountId: account.accountId,
      status: 'approved',
      approved_at: 1_000,
      createdAt: 1_000,
    });
    await insertProvisionedKey(account.accountId);
    try {
      await seedProvisioningRun({
        accountId: account.accountId,
        instanceId: INSTANCE_A,
        phase: SANDBOX_PROVISIONING_PHASE.DISPATCH_INTENT,
        createdAt: 0,
      });
      const minted = await mintSandboxDispatchToken(testEnv, {
        sandboxRunId: RUN_A,
        accountId: account.accountId,
        instanceId: INSTANCE_A,
      });
      await activateSeededRun(RUN_A);
      const applicationBefore = await accountRow('scout_applications', account.accountId);
      const keyBefore = await accountRow('provisioned_keys', account.accountId);
      const before = await worker.fetch(statusRequest(minted.token), testEnv);
      expect(before.status).toBe(200);
      expect(await before.clone().text()).not.toContain(minted.token);

      await expect(releaseSandboxDispatchTokens(testEnv, {
        sandboxRunId: RUN_A,
        accountId: account.accountId,
        nowMs: 2_000,
      })).resolves.toEqual({ outcome: 'released' });
      const after = await worker.fetch(statusRequest(minted.token), testEnv);

      expect(after.status).toBe(401);
      expect(await after.clone().text()).not.toContain(minted.token);
      await expect(after.json()).resolves.toEqual({ error: 'invalid_token' });
      await expect(accountRow('scout_applications', account.accountId)).resolves.toEqual(applicationBefore);
      await expect(accountRow('provisioned_keys', account.accountId)).resolves.toEqual(keyBefore);
      spy.assertNoSecrets([
        minted.token, minted.tokenHash, account.accountId, RUN_A, 'dispatch-status@example.com',
      ]);
    } finally {
      spy.restore();
    }
  });
});

describe('sandbox SPP deny', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stops authorization immediately without changing entitlement or engine configuration', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(2_000);
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'sandbox-spp@example.com', testEnv });
    await seedEntitlement({
      accountId: account.accountId,
      service: 'spp_hosted',
      status: 'active',
      source: 'comp',
      currentPeriodEnd: null,
      updatedAt: 1_000,
    });
    const configBefore = {
      endpoint: testEnv.SPP_ENGINE_ENDPOINT,
      model: testEnv.SPP_ENGINE_MODEL,
      secret: testEnv.SPP_ENGINE_AUTH_SECRET,
    };
    const entitlementBefore = await entitlementRow(account.accountId);
    try {
      await seedProvisioningRun({
        accountId: account.accountId,
        instanceId: INSTANCE_A,
        phase: SANDBOX_PROVISIONING_PHASE.SPP_INTENT,
        createdAt: 0,
      });
      const claimed = await claimSandboxSppBinding(testEnv, {
        sandboxRunId: RUN_A,
        accountId: account.accountId,
        instanceId: INSTANCE_A,
        nowMs: 1_000,
      });
      await activateSeededRun(RUN_A);
      expect(claimed).toMatchObject({ outcome: 'claimed', credential: expect.any(String) });

      const before = await authorizeSpp(testEnv, claimed.credential);
      expect(before.status).toBe(204);
      await expect(releaseSandboxSppBinding(testEnv, {
        sandboxRunId: RUN_A,
        accountId: account.accountId,
        instanceId: INSTANCE_A,
      })).resolves.toEqual({ outcome: 'released' });
      const after = await authorizeSpp(testEnv, claimed.credential);

      expect(after.status).toBe(401);
      expect({
        endpoint: testEnv.SPP_ENGINE_ENDPOINT,
        model: testEnv.SPP_ENGINE_MODEL,
        secret: testEnv.SPP_ENGINE_AUTH_SECRET,
      }).toEqual(configBefore);
      await expect(entitlementRow(account.accountId)).resolves.toEqual(entitlementBefore);
      spy.assertNoSecrets([
        claimed.credential,
        account.accountId,
        RUN_A,
        INSTANCE_A,
        'sandbox-spp@example.com',
        testEnv.SPP_ENGINE_AUTH_SECRET,
      ]);
    } finally {
      spy.restore();
    }
  });
});

function bindingRow(table, instanceId) {
  return workerEnv.DB.prepare(`SELECT * FROM ${table} WHERE instance_id = ?`).bind(instanceId).first();
}

async function bindingCount(table, instanceId) {
  const row = await workerEnv.DB
    .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE instance_id = ?`)
    .bind(instanceId)
    .first();
  return Number(row.count);
}

async function seedProvisioningRun({ accountId, instanceId, phase, createdAt = 0 }) {
  return seedSandboxRun({
    runId: RUN_A,
    accountId,
    instanceId,
    status: SANDBOX_RUN_STATUS.PROVISIONING,
    provisioningPhase: phase,
    createdAt,
    dispatchState: SANDBOX_COMPONENT_STATE.DENY_PENDING,
    sppState: SANDBOX_COMPONENT_STATE.DENY_PENDING,
    spbState: SANDBOX_COMPONENT_STATE.DENY_PENDING,
    splRelayState: SANDBOX_COMPONENT_STATE.DENY_PENDING,
    splBindingState: SANDBOX_COMPONENT_STATE.DENY_PENDING,
  });
}

async function activateSeededRun(runId) {
  await workerEnv.DB.prepare(
    `UPDATE sandbox_runs
     SET status = ?,
         provisioning_phase = ?,
         dispatch_state = ?,
         spp_state = ?,
         spb_state = ?,
         spl_relay_state = ?,
         spl_binding_state = ?
     WHERE run_id = ?`
  ).bind(
    SANDBOX_RUN_STATUS.ACTIVE,
    SANDBOX_PROVISIONING_PHASE.ACTIVE,
    SANDBOX_COMPONENT_STATE.ACTIVE,
    SANDBOX_COMPONENT_STATE.ACTIVE,
    SANDBOX_COMPONENT_STATE.ACTIVE,
    SANDBOX_COMPONENT_STATE.ACTIVE,
    SANDBOX_COMPONENT_STATE.ACTIVE,
    runId
  ).run();
}

async function dispatchRows() {
  const { results } = await workerEnv.DB
    .prepare('SELECT * FROM account_dispatch_tokens ORDER BY token_hash')
    .all();
  return results;
}

async function insertProvisionedKey(accountId) {
  await workerEnv.DB
    .prepare(
      `INSERT INTO provisioned_keys (
         id, account_id, provider, display_name, key_resource_name,
         key_string_encrypted, created_at, revoked_at
       ) VALUES (?, ?, 'gemini', ?, ?, ?, ?, NULL)`
    )
    .bind(
      INSTANCE_E,
      accountId,
      'sandbox key',
      'projects/test/locations/global/keys/sandbox',
      'encrypted-key-material',
      1_000
    )
    .run();
}

function accountRow(table, accountId) {
  return workerEnv.DB.prepare(`SELECT * FROM ${table} WHERE account_id = ?`).bind(accountId).first();
}

function statusRequest(token) {
  return new Request('https://services.solstone.app/account/scout/status', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

function entitlementRow(accountId) {
  return workerEnv.DB
    .prepare('SELECT * FROM entitlements WHERE account_id = ? AND service = ?')
    .bind(accountId, 'spp_hosted')
    .first();
}

function authorizeSpp(testEnv, credential) {
  return worker.fetch(new Request('https://services.solstone.app/internal/spp/authorize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${testEnv.SPP_ENGINE_AUTH_SECRET}`,
      'X-Sol-Entitlement': credential,
    },
  }), testEnv);
}
