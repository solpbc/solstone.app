import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../migrations/0027_sandbox_run_lease.sql?raw';
import schema from '../schema.sql?raw';
import { resetDb, seedSandboxRun } from './helpers.js';

const ACCOUNT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACCOUNT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const INSTANCE_ID = '11111111-1111-1111-1111-111111111111';
const RUN_ID = '22222222-2222-2222-2222-222222222222';
const CREATED_AT = 1_000_000;
const LEASE_MS = 3_600_000;

const STATUSES = [
  'provisioning',
  'active',
  'cleanup_required',
  'cleaning',
  'expiry_pending',
  'cleanup_failed',
  'released',
];
const PROVISIONING_PHASES = [
  'created',
  'dispatch_intent',
  'dispatch_acquired',
  'spl_intent',
  'spl_acquired',
  'spb_intent',
  'spb_acquired',
  'spp_intent',
  'spp_acquired',
  'active',
];
const CLEANUP_PHASES = [
  'deny_intent',
  'denied',
  'relay_intent',
  'relay_retired',
  'spb_expiry',
  'spb_purge',
  'verify',
  'released',
];
const COMPONENT_STATES = [
  'active',
  'deny_pending',
  'purge_pending',
  'verify_pending',
  'released',
  'cleanup_failed',
];
const COMPONENTS = [
  {
    name: 'dispatch',
    state: 'dispatchState',
    residual: 'dispatchResidualCode',
    codes: [
      'lease_expired',
      'account_missing',
      'dispatch_issue_failed',
      'dispatch_release_failed',
      'dispatch_ownership_conflict',
    ],
  },
  {
    name: 'spp',
    state: 'sppState',
    residual: 'sppResidualCode',
    codes: [
      'lease_expired',
      'account_missing',
      'spp_issue_failed',
      'spp_release_failed',
      'spp_ownership_conflict',
    ],
  },
  {
    name: 'spb',
    state: 'spbState',
    residual: 'spbResidualCode',
    codes: [
      'lease_expired',
      'account_missing',
      'spb_issue_failed',
      'spb_denial_failed',
      'spb_denial_required',
      'spb_credential_expiry_pending',
      'spb_cleanup_retryable',
      'spb_lifecycle_absent',
      'spb_ownership_conflict',
    ],
  },
  {
    name: 'spl_relay',
    state: 'splRelayState',
    residual: 'splRelayResidualCode',
    codes: [
      'lease_expired',
      'account_missing',
      'spl_grant_failed',
      'relay_retired_state',
      'relay_instance_do_cleanup',
      'relay_rk_do_cleanup',
      'relay_device_revocation',
      'relay_entitlement_clear',
      'relay_pending_grant_clear',
      'relay_rk_registry_clear',
      'relay_verification',
      'relay_failed',
    ],
  },
  {
    name: 'spl_binding',
    state: 'splBindingState',
    residual: 'splBindingResidualCode',
    codes: [
      'lease_expired',
      'account_missing',
      'spl_issue_failed',
      'spl_release_failed',
      'spl_ownership_conflict',
    ],
  },
];
const LAST_RESIDUAL_CODES = [
  ...new Set(COMPONENTS.flatMap((component) => component.codes)),
  'lease_expired_before_activation',
  'activation_cas_lost',
];

describe('migration 0027 sandbox-run lease', () => {
  beforeEach(async () => {
    await resetDb();
    await installPost0026Pre0027Shape();
    await insertAccounts();
  });

  it('applies after 0025 and 0026, preserves legacy ownership rows, and adds the exact columns', async () => {
    await insertLegacyOwnershipRows();

    await runMigration();

    expect(columnShape(await tableColumns('sandbox_runs'))).toEqual(expectedColumns());
    await expect(foreignKeys('sandbox_runs')).resolves.toEqual([]);
    await expect(predecessorShapes()).resolves.toEqual({
      dispatch: ['token_hash', 'account_id', 'created_at', 'revoked_at', 'sandbox_run_id'],
      spl: ['account_id', 'instance_id', 'created_at', 'last_seen_at', 'sandbox_run_id'],
      spb: [
        'account_id',
        'instance_id',
        'created_at',
        'last_seen_at',
        'token_hash',
        'lapsed_at',
        'sandbox_run_id',
        'sandbox_credential_expires_at',
        'sandbox_denied_at',
      ],
      spp: [
        'account_id',
        'instance_id',
        'token_hash',
        'created_at',
        'last_seen_at',
        'consent_acked_at',
        'consent_disclosure_version',
        'sandbox_run_id',
      ],
      audit: [
        'event',
        'outcome',
        'scope',
        'ttl',
        'credentials_minted',
        'objects_deleted',
        'multipart_aborted',
        'ts',
      ],
    });
    await expect(legacyOwnershipRows()).resolves.toEqual(expectedLegacyOwnershipRows());
  });

  it('accepts exactly the seven statuses and rejects an illegal status', async () => {
    await runMigration();

    let sequence = 1;
    for (const status of STATUSES) {
      await seedSandboxRun(runForStatus(sequence++, status));
    }

    await expect(seedSandboxRun(validRun(sequence, { status: 'expired' })))
      .rejects.toThrow(/CHECK constraint failed/i);
  });

  it('accepts exactly the ten provisioning phases and rejects an illegal phase', async () => {
    await runMigration();

    let sequence = 100;
    for (const provisioningPhase of PROVISIONING_PHASES) {
      const status = provisioningPhase === 'active' ? 'active' : 'provisioning';
      await seedSandboxRun(validRun(sequence++, {
        status,
        provisioningPhase,
        ...componentStates(status === 'active' ? 'active' : 'deny_pending'),
      }));
    }

    await expect(seedSandboxRun(validRun(sequence, {
      status: 'provisioning',
      provisioningPhase: 'dispatching',
      ...componentStates('deny_pending'),
    }))).rejects.toThrow(/CHECK constraint failed/i);
  });

  it('accepts exactly the eight cleanup phases and rejects an illegal phase', async () => {
    await runMigration();

    let sequence = 200;
    for (const cleanupPhase of CLEANUP_PHASES) {
      const released = cleanupPhase === 'released';
      await seedSandboxRun(validRun(sequence++, {
        status: released ? 'released' : 'cleaning',
        cleanupPhase,
        completedAt: released ? CREATED_AT + sequence : null,
        ...componentStates(released ? 'released' : 'deny_pending'),
      }));
    }

    await expect(seedSandboxRun(validRun(sequence, {
      status: 'cleaning',
      cleanupPhase: 'purging',
      ...componentStates('deny_pending'),
    }))).rejects.toThrow(/CHECK constraint failed/i);
  });

  it('enforces the six component states on all five components', async () => {
    await runMigration();

    let sequence = 300;
    for (const component of COMPONENTS) {
      for (const state of COMPONENT_STATES) {
        const residualCode = state === 'cleanup_failed'
          ? component.codes.find((code) => code !== 'spb_credential_expiry_pending')
          : null;
        await seedSandboxRun(validRun(sequence++, {
          status: 'cleaning',
          cleanupPhase: 'deny_intent',
          [component.state]: state,
          [component.residual]: residualCode,
        }));
      }

      await expect(seedSandboxRun(validRun(sequence++, {
        status: 'cleaning',
        cleanupPhase: 'deny_intent',
        [component.state]: 'unknown',
      }))).rejects.toThrow(/CHECK constraint failed/i);
    }
  });

  it('enforces every component residual vocabulary and state relationship', async () => {
    await runMigration();

    let sequence = 400;
    for (const component of COMPONENTS) {
      for (const code of component.codes) {
        const isSpbWait = code === 'spb_credential_expiry_pending';
        await seedSandboxRun(validRun(sequence++, {
          status: 'cleaning',
          cleanupPhase: 'deny_intent',
          [component.state]: isSpbWait ? 'purge_pending' : 'cleanup_failed',
          [component.residual]: code,
        }));
      }

      await expect(seedSandboxRun(validRun(sequence++, {
        status: 'cleaning',
        cleanupPhase: 'deny_intent',
        [component.state]: 'cleanup_failed',
        [component.residual]: 'not_a_residual',
      }))).rejects.toThrow(/CHECK constraint failed/i);

      await expect(seedSandboxRun(validRun(sequence++, {
        status: 'cleaning',
        cleanupPhase: 'deny_intent',
        [component.state]: 'active',
        [component.residual]: component.codes[0],
      }))).rejects.toThrow(/CHECK constraint failed/i);

      await expect(seedSandboxRun(validRun(sequence++, {
        status: 'cleaning',
        cleanupPhase: 'deny_intent',
        [component.state]: 'cleanup_failed',
        [component.residual]: null,
      }))).rejects.toThrow(/CHECK constraint failed/i);
    }

    await expect(seedSandboxRun(validRun(sequence++, {
      status: 'cleaning',
      cleanupPhase: 'spb_expiry',
      spbState: 'cleanup_failed',
      spbResidualCode: 'spb_credential_expiry_pending',
    }))).rejects.toThrow(/CHECK constraint failed/i);
  });

  it('enforces the closed last-residual vocabulary', async () => {
    await runMigration();

    let sequence = 600;
    for (const lastResidualCode of LAST_RESIDUAL_CODES) {
      await seedSandboxRun(validRun(sequence++, { lastResidualCode }));
    }

    await expect(seedSandboxRun(validRun(sequence, {
      lastResidualCode: 'raw_upstream_error',
    }))).rejects.toThrow(/CHECK constraint failed/i);
  });

  it('enforces the fixed contract, profile, one-hour lease, and terminal markers', async () => {
    await runMigration();

    await expect(seedSandboxRun(validRun(698, {
      contractVersion: 2,
    }))).rejects.toThrow(/CHECK constraint failed/i);

    await expect(seedSandboxRun(validRun(699, {
      profile: 'partial',
    }))).rejects.toThrow(/CHECK constraint failed/i);

    await expect(seedSandboxRun(validRun(700, {
      leaseExpiresAt: CREATED_AT + LEASE_MS - 1,
    }))).rejects.toThrow(/CHECK constraint failed/i);

    await expect(seedSandboxRun(validRun(701, {
      status: 'released',
      cleanupPhase: 'released',
      completedAt: null,
      ...componentStates('released'),
    }))).rejects.toThrow(/CHECK constraint failed/i);

    await expect(seedSandboxRun(validRun(702, {
      status: 'active',
      cleanupPhase: null,
      completedAt: CREATED_AT,
    }))).rejects.toThrow(/CHECK constraint failed/i);
  });

  it('creates the exact indexes and enforces one nonterminal run per account', async () => {
    await runMigration();

    await expect(indexShape('sandbox_runs', 'idx_sandbox_runs_account_id'))
      .resolves.toEqual({ unique: 0, partial: 0, columns: ['account_id'] });
    await expect(indexShape('sandbox_runs', 'idx_sandbox_runs_reconcile'))
      .resolves.toEqual({
        unique: 0,
        partial: 0,
        columns: ['status', 'lease_expires_at', 'created_at', 'run_id'],
      });
    await expect(indexShape('sandbox_runs', 'idx_sandbox_runs_one_nonterminal_account'))
      .resolves.toEqual({ unique: 1, partial: 1, columns: ['account_id'] });
    const partialSql = await indexSql('idx_sandbox_runs_one_nonterminal_account');
    for (const status of STATUSES.filter((status) => status !== 'released')) {
      expect(partialSql).toContain(`'${status}'`);
    }
    expect(partialSql).not.toContain("'released'");

    await seedSandboxRun(releasedRun(800, { accountId: ACCOUNT_A }));
    await seedSandboxRun(releasedRun(801, { accountId: ACCOUNT_A }));
    await seedSandboxRun(validRun(802, { accountId: ACCOUNT_A }));
    await expect(seedSandboxRun(validRun(803, {
      accountId: ACCOUNT_A,
      status: 'cleanup_failed',
      cleanupPhase: 'deny_intent',
      dispatchState: 'cleanup_failed',
      dispatchResidualCode: 'dispatch_release_failed',
    }))).rejects.toThrow(
      /UNIQUE constraint failed: sandbox_runs\.account_id: SQLITE_CONSTRAINT/
    );
  });

  it('fails loudly on duplicate application while allowing the verified index suffix to re-run', async () => {
    await runMigration();

    await expect(runMigration()).rejects.toThrow(/table sandbox_runs already exists/i);
    await expect(runStatements(migrationStatements().slice(1))).resolves.toBeUndefined();
  });

  it('recovers a verified exact table with missing ordinary indexes', async () => {
    await runMigration();
    await workerEnv.DB.prepare('DROP INDEX idx_sandbox_runs_account_id').run();
    await workerEnv.DB.prepare('DROP INDEX idx_sandbox_runs_reconcile').run();

    await expect(runStatements(migrationStatements().slice(1))).resolves.toBeUndefined();
    await expect(indexShape('sandbox_runs', 'idx_sandbox_runs_account_id'))
      .resolves.toEqual({ unique: 0, partial: 0, columns: ['account_id'] });
    await expect(indexShape('sandbox_runs', 'idx_sandbox_runs_reconcile'))
      .resolves.toEqual({
        unique: 0,
        partial: 0,
        columns: ['status', 'lease_expires_at', 'created_at', 'run_id'],
      });
  });

  it('stops loudly on duplicate nonterminal rows before restoring the partial index', async () => {
    await runMigration();
    await workerEnv.DB.prepare('DROP INDEX idx_sandbox_runs_one_nonterminal_account').run();
    await seedSandboxRun(validRun(900, { accountId: ACCOUNT_A }));
    await seedSandboxRun(validRun(901, {
      accountId: ACCOUNT_A,
      status: 'cleanup_failed',
      cleanupPhase: 'deny_intent',
      dispatchState: 'cleanup_failed',
      dispatchResidualCode: 'dispatch_release_failed',
    }));

    await expect(runStatements(migrationStatements().slice(3))).rejects.toThrow(
      /UNIQUE constraint failed: sandbox_runs\.account_id: SQLITE_CONSTRAINT/
    );
    await expect(workerEnv.DB
      .prepare('SELECT COUNT(*) AS count FROM sandbox_runs WHERE account_id = ?')
      .bind(ACCOUNT_A)
      .first()).resolves.toEqual({ count: 2 });
    await expect(indexShape('sandbox_runs', 'idx_sandbox_runs_one_nonterminal_account'))
      .resolves.toBeNull();

    const second = validRun(901);
    await workerEnv.DB
      .prepare(
        `UPDATE sandbox_runs
         SET status = 'released',
             cleanup_phase = 'released',
             completed_at = ?,
             dispatch_state = 'released',
             dispatch_residual_code = NULL,
             spp_state = 'released',
             spp_residual_code = NULL,
             spb_state = 'released',
             spb_residual_code = NULL,
             spl_relay_state = 'released',
             spl_relay_residual_code = NULL,
             spl_binding_state = 'released',
             spl_binding_residual_code = NULL
         WHERE run_id = ?`
      )
      .bind(CREATED_AT + LEASE_MS, second.runId)
      .run();
    await expect(runStatements(migrationStatements().slice(3))).resolves.toBeUndefined();
    await expect(indexShape('sandbox_runs', 'idx_sandbox_runs_one_nonterminal_account'))
      .resolves.toEqual({ unique: 1, partial: 1, columns: ['account_id'] });
  });

  it('rejects a pre-existing unverified table instead of masking it with IF NOT EXISTS', async () => {
    await workerEnv.DB
      .prepare('CREATE TABLE sandbox_runs (run_id TEXT PRIMARY KEY)')
      .run();

    await expect(runMigration()).rejects.toThrow(/table sandbox_runs already exists/i);
    await expect(indexShape('sandbox_runs', 'idx_sandbox_runs_account_id')).resolves.toBeNull();
  });

  it('continues safely from an exact table-only partial application', async () => {
    const statements = migrationStatements();
    await runStatements(statements.slice(0, 1));

    await expect(runStatements(statements.slice(1))).resolves.toBeUndefined();
    await expect(indexShape('sandbox_runs', 'idx_sandbox_runs_one_nonterminal_account'))
      .resolves.toEqual({ unique: 1, partial: 1, columns: ['account_id'] });
  });

  it('matches the consolidated schema table, constraints, and indexes exactly', async () => {
    await runMigration();
    const migratedShape = await storageShape();

    await resetDb();
    const schemaShape = await storageShape();

    expect(normalizedCreateTableSql(schema)).toBe(normalizedCreateTableSql(migration));
    expect(schemaShape).toEqual(migratedShape);
  });
});

async function installPost0026Pre0027Shape() {
  await workerEnv.DB.prepare('DROP TABLE IF EXISTS sandbox_runs').run();
}

async function insertAccounts() {
  for (const accountId of [ACCOUNT_A, ACCOUNT_B]) {
    await workerEnv.DB
      .prepare(
        'INSERT INTO accounts (id, primary_email_id, created_at, last_signin_at) VALUES (?, NULL, ?, ?)'
      )
      .bind(accountId, CREATED_AT, CREATED_AT)
      .run();
  }
}

async function insertLegacyOwnershipRows() {
  await workerEnv.DB
    .prepare(
      `INSERT INTO account_dispatch_tokens (
         token_hash, account_id, created_at, revoked_at, sandbox_run_id
       ) VALUES (?, ?, ?, ?, ?)`
    )
    .bind('legacy-dispatch-hash', ACCOUNT_A, 1_001, null, RUN_ID)
    .run();
  await workerEnv.DB
    .prepare(
      `INSERT INTO spl_bindings (
         account_id, instance_id, created_at, last_seen_at, sandbox_run_id
       ) VALUES (?, ?, ?, ?, ?)`
    )
    .bind(ACCOUNT_A, INSTANCE_ID, 1_002, 1_003, RUN_ID)
    .run();
  await workerEnv.DB
    .prepare(
      `INSERT INTO spb_bindings (
         account_id, instance_id, created_at, last_seen_at, token_hash, lapsed_at,
         sandbox_run_id, sandbox_credential_expires_at, sandbox_denied_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(ACCOUNT_A, INSTANCE_ID, 1_004, 1_005, null, 1_006, RUN_ID, 1_007, 1_008)
    .run();
  await workerEnv.DB
    .prepare(
      `INSERT INTO spp_bindings (
         account_id, instance_id, token_hash, created_at, last_seen_at,
         consent_acked_at, consent_disclosure_version, sandbox_run_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      ACCOUNT_A,
      INSTANCE_ID,
      'legacy-spp-hash',
      1_009,
      1_010,
      1_011,
      'legacy-consent',
      RUN_ID
    )
    .run();
}

async function predecessorShapes() {
  return {
    dispatch: await columnNames('account_dispatch_tokens'),
    spl: await columnNames('spl_bindings'),
    spb: await columnNames('spb_bindings'),
    spp: await columnNames('spp_bindings'),
    audit: await columnNames('spb_sandbox_audit'),
  };
}

async function legacyOwnershipRows() {
  return {
    dispatch: await workerEnv.DB.prepare('SELECT * FROM account_dispatch_tokens').first(),
    spl: await workerEnv.DB.prepare('SELECT * FROM spl_bindings').first(),
    spb: await workerEnv.DB.prepare('SELECT * FROM spb_bindings').first(),
    spp: await workerEnv.DB.prepare('SELECT * FROM spp_bindings').first(),
  };
}

function expectedLegacyOwnershipRows() {
  return {
    dispatch: {
      token_hash: 'legacy-dispatch-hash',
      account_id: ACCOUNT_A,
      created_at: 1_001,
      revoked_at: null,
      sandbox_run_id: RUN_ID,
    },
    spl: {
      account_id: ACCOUNT_A,
      instance_id: INSTANCE_ID,
      created_at: 1_002,
      last_seen_at: 1_003,
      sandbox_run_id: RUN_ID,
    },
    spb: {
      account_id: ACCOUNT_A,
      instance_id: INSTANCE_ID,
      created_at: 1_004,
      last_seen_at: 1_005,
      token_hash: null,
      lapsed_at: 1_006,
      sandbox_run_id: RUN_ID,
      sandbox_credential_expires_at: 1_007,
      sandbox_denied_at: 1_008,
    },
    spp: {
      account_id: ACCOUNT_A,
      instance_id: INSTANCE_ID,
      token_hash: 'legacy-spp-hash',
      created_at: 1_009,
      last_seen_at: 1_010,
      consent_acked_at: 1_011,
      consent_disclosure_version: 'legacy-consent',
      sandbox_run_id: RUN_ID,
    },
  };
}

function runForStatus(sequence, status) {
  if (status === 'provisioning') {
    return validRun(sequence, {
      status,
      provisioningPhase: 'created',
      ...componentStates('deny_pending'),
    });
  }
  if (status === 'active') return validRun(sequence);
  if (status === 'released') return releasedRun(sequence);
  if (status === 'expiry_pending') {
    return validRun(sequence, {
      status,
      cleanupPhase: 'spb_expiry',
      ...componentStates('released'),
      spbState: 'purge_pending',
      spbResidualCode: 'spb_credential_expiry_pending',
    });
  }
  if (status === 'cleanup_failed') {
    return validRun(sequence, {
      status,
      cleanupPhase: 'deny_intent',
      ...componentStates('deny_pending'),
      dispatchState: 'cleanup_failed',
      dispatchResidualCode: 'dispatch_release_failed',
    });
  }
  return validRun(sequence, {
    status,
    cleanupPhase: 'deny_intent',
    ...componentStates('deny_pending'),
  });
}

function releasedRun(sequence, overrides = {}) {
  return validRun(sequence, {
    status: 'released',
    cleanupPhase: 'released',
    completedAt: CREATED_AT + sequence,
    ...componentStates('released'),
    ...overrides,
  });
}

function validRun(sequence, overrides = {}) {
  const createdAt = CREATED_AT + sequence;
  return {
    runId: idFor('a', sequence),
    accountId: idFor('b', sequence),
    instanceId: idFor('c', sequence),
    contractVersion: 1,
    profile: 'full',
    status: 'active',
    provisioningPhase: 'active',
    cleanupPhase: null,
    createdAt,
    leaseExpiresAt: createdAt + LEASE_MS,
    updatedAt: createdAt,
    spbRetryNotBefore: null,
    completedAt: null,
    lastResidualCode: null,
    dispatchState: 'active',
    dispatchResidualCode: null,
    dispatchUpdatedAt: createdAt,
    sppState: 'active',
    sppResidualCode: null,
    sppUpdatedAt: createdAt,
    spbState: 'active',
    spbResidualCode: null,
    spbUpdatedAt: createdAt,
    splRelayState: 'active',
    splRelayResidualCode: null,
    splRelayUpdatedAt: createdAt,
    splBindingState: 'active',
    splBindingResidualCode: null,
    splBindingUpdatedAt: createdAt,
    ...overrides,
  };
}

function componentStates(state) {
  return {
    dispatchState: state,
    dispatchResidualCode: null,
    sppState: state,
    sppResidualCode: null,
    spbState: state,
    spbResidualCode: null,
    splRelayState: state,
    splRelayResidualCode: null,
    splBindingState: state,
    splBindingResidualCode: null,
  };
}

function idFor(digit, sequence) {
  const fixed = digit.repeat(8);
  const short = digit.repeat(4);
  const tail = sequence.toString(16).padStart(12, '0');
  return `${fixed}-${short}-${short}-${short}-${tail}`;
}

function expectedColumns() {
  const required = (name, type, primaryKey = 0) => ({
    name,
    type,
    notnull: 1,
    defaultValue: null,
    primaryKey,
  });
  const nullable = (name, type) => ({
    name,
    type,
    notnull: 0,
    defaultValue: null,
    primaryKey: 0,
  });
  return [
    required('run_id', 'TEXT', 1),
    required('account_id', 'TEXT'),
    required('instance_id', 'TEXT'),
    required('contract_version', 'INTEGER'),
    required('profile', 'TEXT'),
    required('status', 'TEXT'),
    required('provisioning_phase', 'TEXT'),
    nullable('cleanup_phase', 'TEXT'),
    required('created_at', 'INTEGER'),
    required('lease_expires_at', 'INTEGER'),
    required('updated_at', 'INTEGER'),
    nullable('spb_retry_not_before', 'INTEGER'),
    nullable('completed_at', 'INTEGER'),
    nullable('last_residual_code', 'TEXT'),
    required('dispatch_state', 'TEXT'),
    nullable('dispatch_residual_code', 'TEXT'),
    required('dispatch_updated_at', 'INTEGER'),
    required('spp_state', 'TEXT'),
    nullable('spp_residual_code', 'TEXT'),
    required('spp_updated_at', 'INTEGER'),
    required('spb_state', 'TEXT'),
    nullable('spb_residual_code', 'TEXT'),
    required('spb_updated_at', 'INTEGER'),
    required('spl_relay_state', 'TEXT'),
    nullable('spl_relay_residual_code', 'TEXT'),
    required('spl_relay_updated_at', 'INTEGER'),
    required('spl_binding_state', 'TEXT'),
    nullable('spl_binding_residual_code', 'TEXT'),
    required('spl_binding_updated_at', 'INTEGER'),
  ];
}

function migrationStatements() {
  const executable = migration
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  return executable.split(';').map((part) => part.trim()).filter(Boolean);
}

function runMigration() {
  return runStatements(migrationStatements());
}

async function runStatements(statements) {
  for (const statement of statements) await workerEnv.DB.prepare(statement).run();
}

async function tableColumns(table) {
  const { results } = await workerEnv.DB.prepare(`PRAGMA table_info(${table})`).all();
  return results;
}

async function columnNames(table) {
  return (await tableColumns(table)).map((column) => column.name);
}

function columnShape(columns) {
  return columns.map((column) => ({
    name: column.name,
    type: column.type,
    notnull: column.notnull,
    defaultValue: column.dflt_value,
    primaryKey: column.pk,
  }));
}

async function foreignKeys(table) {
  const { results } = await workerEnv.DB.prepare(`PRAGMA foreign_key_list(${table})`).all();
  return results;
}

async function indexShape(table, name) {
  const { results: indexes } = await workerEnv.DB.prepare(`PRAGMA index_list(${table})`).all();
  const index = indexes.find((candidate) => candidate.name === name);
  if (!index) return null;
  const { results: columns } = await workerEnv.DB.prepare(`PRAGMA index_info(${name})`).all();
  return {
    unique: index.unique,
    partial: index.partial,
    columns: columns.map((column) => column.name),
  };
}

async function indexSql(name) {
  const row = await workerEnv.DB
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?")
    .bind(name)
    .first();
  return row?.sql || null;
}

async function storageShape() {
  const { results: indexes } = await workerEnv.DB.prepare('PRAGMA index_list(sandbox_runs)').all();
  const indexShapes = [];
  for (const index of indexes) {
    const { results: columns } = await workerEnv.DB
      .prepare(`PRAGMA index_info(${index.name})`)
      .all();
    indexShapes.push({
      name: index.name,
      unique: index.unique,
      partial: index.partial,
      origin: index.origin,
      columns: columns.map((column) => column.name),
      sql: await indexSql(index.name),
    });
  }
  return {
    columns: columnShape(await tableColumns('sandbox_runs')),
    foreignKeys: await foreignKeys('sandbox_runs'),
    tableSql: normalizeSql(await tableSql('sandbox_runs')),
    indexes: indexShapes.sort((left, right) => left.name.localeCompare(right.name)),
  };
}

async function tableSql(table) {
  const row = await workerEnv.DB
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(table)
    .first();
  return row?.sql || null;
}

function normalizedCreateTableSql(source) {
  const match = source.match(
    /CREATE TABLE(?: IF NOT EXISTS)? sandbox_runs \([\s\S]*?\n\);/
  );
  return normalizeSql(match?.[0] || '').replace(
    'CREATE TABLE IF NOT EXISTS sandbox_runs',
    'CREATE TABLE sandbox_runs'
  );
}

function normalizeSql(value) {
  return String(value)
    .replace(/\s+/g, ' ')
    .replace('CREATE TABLE IF NOT EXISTS sandbox_runs', 'CREATE TABLE sandbox_runs')
    .trim();
}
