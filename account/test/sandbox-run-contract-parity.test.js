// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  SANDBOX_CLEANUP_PHASE,
  SANDBOX_CLEANUP_PHASES,
  SANDBOX_COMPONENT_RESIDUAL_CODES,
  SANDBOX_COMPONENT_STATE,
  SANDBOX_COMPONENT_STATES,
  SANDBOX_CREATION_ONLY_RESIDUAL_CODES,
  SANDBOX_ERROR,
  SANDBOX_LAST_RESIDUAL_CODES,
  SANDBOX_LEASE_TTL_MS,
  SANDBOX_PROVISIONING_PHASE,
  SANDBOX_PROVISIONING_PHASES,
  SANDBOX_RESIDUAL_CODE,
  SANDBOX_RUN_CONTRACT,
  SANDBOX_RUN_CONTRACT_JSON,
  SANDBOX_RUN_CONTRACT_MAX_BYTES,
  SANDBOX_RUN_STATUS,
  SANDBOX_RUN_STATUSES,
} from '../src/sandbox-run-contract.js';
import {
  assertContractSize,
  checkContract,
  generateContractBytes,
  runCli,
  writeContract,
} from '../scripts/generate-sandbox-run-contract.mjs';

const accountDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = join(accountDir, 'docs/sandbox-run-contract-v1.json');
const dbPath = join(accountDir, 'src/db.js');
const migrationPath = join(accountDir, 'migrations/0027_sandbox_run_lease.sql');
const schemaPath = join(accountDir, 'schema.sql');

describe('sandbox-run generated contract parity', () => {
  it('is the deterministic, bounded, repository-root-described artifact', async () => {
    const committed = await readFile(artifactPath);
    const generated = generateContractBytes();

    expect(committed.equals(generated)).toBe(true);
    expect(committed.toString('utf8')).toBe(SANDBOX_RUN_CONTRACT_JSON);
    expect(committed.byteLength).toBeLessThan(SANDBOX_RUN_CONTRACT_MAX_BYTES);
    expect(generated.byteLength).toBeLessThan(SANDBOX_RUN_CONTRACT_MAX_BYTES);
    expect(committed.subarray(-2).toString('utf8')).not.toBe('\n\n');
    expect(committed.subarray(-1).toString('utf8')).toBe('\n');
    expect(committed.includes(Buffer.from('\r'))).toBe(false);

    const parsed = JSON.parse(committed.toString('utf8'));
    expect(Object.keys(parsed).slice(0, 3)).toEqual([
      'generated_by',
      'source',
      'contract_version',
    ]);
    expect(parsed.generated_by).toBe('account/scripts/generate-sandbox-run-contract.mjs');
    expect(parsed.source).toBe('account/src/sandbox-run-contract.js');
    expect(parsed.contract_version).toBe(SANDBOX_RUN_CONTRACT.contract_version);
    expect(isDeepFrozen(SANDBOX_RUN_CONTRACT)).toBe(true);
  });

  it('writes and checks exact bytes while failing closed for every invalid generator mode', async () => {
    const scratch = await mkdtemp(join(tmpdir(), 'sandbox-run-contract-'));
    const candidate = join(scratch, 'contract.json');
    const missing = join(scratch, 'missing.json');
    try {
      await writeContract({ artifactPath: candidate });
      await expect(readFile(candidate)).resolves.toEqual(generateContractBytes());
      const before = await readFile(candidate);
      await expect(checkContract({ artifactPath: candidate })).resolves.toEqual(before);
      await expect(readFile(candidate)).resolves.toEqual(before);

      await writeFile(candidate, Buffer.concat([before.subarray(0, -1), Buffer.from(' \n')]));
      await expect(checkContract({ artifactPath: candidate })).rejects.toThrow('is stale');
      await expect(checkContract({ artifactPath: missing })).rejects.toThrow('is missing');
      expect(() => assertContractSize(
        Buffer.alloc(SANDBOX_RUN_CONTRACT_MAX_BYTES),
        'generated sandbox-run contract'
      )).toThrow('must be smaller');
      await expect(checkContract({
        artifactPath: candidate,
        generatedBytes: Buffer.alloc(SANDBOX_RUN_CONTRACT_MAX_BYTES),
      })).rejects.toThrow('must be smaller');
      await expect(runCli(['--unknown'])).rejects.toThrow('usage:');
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });

  it('contains descriptors but no shipped environment values, concrete identifiers, or token shapes', async () => {
    const text = await readFile(artifactPath, 'utf8');
    for (const forbidden of [
      'solstone-backups',
      'processing.solstone.app',
      'Qwen',
      'test-hmac-pepper',
      'sandbox-standing-gemini-key-material',
    ]) {
      expect(text).not.toContain(forbidden);
    }
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(text).not.toMatch(/\b(?:eyJ|sk_|whsec_)[A-Za-z0-9._-]{12,}\b/);
  });

  it('matches migration and consolidated-schema vocabularies bidirectionally', async () => {
    const [migration, schema] = await Promise.all([
      readFile(migrationPath, 'utf8'),
      readFile(schemaPath, 'utf8'),
    ]);
    const groups = {
      status: SANDBOX_RUN_STATUSES,
      provisioning_phase: SANDBOX_PROVISIONING_PHASES,
      cleanup_phase: SANDBOX_CLEANUP_PHASES,
      dispatch_state: SANDBOX_COMPONENT_STATES,
      spp_state: SANDBOX_COMPONENT_STATES,
      spb_state: SANDBOX_COMPONENT_STATES,
      spl_relay_state: SANDBOX_COMPONENT_STATES,
      spl_binding_state: SANDBOX_COMPONENT_STATES,
      dispatch_residual_code: SANDBOX_COMPONENT_RESIDUAL_CODES.dispatch,
      spp_residual_code: SANDBOX_COMPONENT_RESIDUAL_CODES.spp,
      spb_residual_code: SANDBOX_COMPONENT_RESIDUAL_CODES.spb,
      spl_relay_residual_code: SANDBOX_COMPONENT_RESIDUAL_CODES.spl_relay,
      spl_binding_residual_code: SANDBOX_COMPONENT_RESIDUAL_CODES.spl_binding,
      last_residual_code: SANDBOX_LAST_RESIDUAL_CODES,
    };
    for (const [column, expected] of Object.entries(groups)) {
      expectSameSet(extractConstraintValues(migration, column), expected);
      expectSameSet(extractConstraintValues(schema, column), expected);
    }
    expect(migration).toContain(`created_at + ${SANDBOX_LEASE_TTL_MS}`);
    expect(schema).toContain(`created_at + ${SANDBOX_LEASE_TTL_MS}`);
  });

  it('asserts the aggregate residual vocabulary is exactly the component union plus a disjoint creation set', () => {
    const componentUnion = new Set(Object.values(SANDBOX_COMPONENT_RESIDUAL_CODES).flat());
    const aggregate = new Set(SANDBOX_LAST_RESIDUAL_CODES);
    const creationOnly = new Set(SANDBOX_CREATION_ONLY_RESIDUAL_CODES);

    for (const codes of Object.values(SANDBOX_COMPONENT_RESIDUAL_CODES)) {
      for (const code of codes) expect(aggregate.has(code)).toBe(true);
      for (const code of creationOnly) expect(codes).not.toContain(code);
    }
    const difference = [...aggregate].filter((code) => !componentUnion.has(code));
    expectSameSet(difference, creationOnly);
    expectSameSet(creationOnly, difference);
    expectSameSet(aggregate, new Set([...componentUnion, ...creationOnly]));
  });

  it('pins each audited sandbox SQL function to named source members without rebuilding SQL', async () => {
    const dbSource = await readFile(dbPath, 'utf8');
    const expected = new Map([
      ['insertDispatchTokenForSandboxRun', [SANDBOX_RUN_STATUS.PROVISIONING]],
      ['findActiveDispatchToken', [SANDBOX_RUN_STATUS.ACTIVE]],
      ['upsertSplBindingForSandboxRun', [SANDBOX_RUN_STATUS.PROVISIONING]],
      ['upsertSpbBindingForSandboxRun', [SANDBOX_RUN_STATUS.PROVISIONING]],
      ['upsertSppBindingForSandboxRun', [SANDBOX_RUN_STATUS.PROVISIONING]],
      ['findSpbBindingByTokenHash', [SANDBOX_RUN_STATUS.ACTIVE]],
      ['advanceSpbSandboxCredentialExpiry', [SANDBOX_RUN_STATUS.ACTIVE]],
      ['findSppBindingByTokenHash', [SANDBOX_RUN_STATUS.ACTIVE]],
      ['insertSandboxRun', [
        SANDBOX_RUN_STATUS.PROVISIONING,
        SANDBOX_RUN_STATUS.ACTIVE,
        SANDBOX_RUN_STATUS.CLEANUP_REQUIRED,
        SANDBOX_RUN_STATUS.CLEANING,
        SANDBOX_RUN_STATUS.EXPIRY_PENDING,
        SANDBOX_RUN_STATUS.CLEANUP_FAILED,
        SANDBOX_PROVISIONING_PHASE.CREATED,
        SANDBOX_COMPONENT_STATE.DENY_PENDING,
      ]],
      ['listSandboxRunsForReconciliation', [
        SANDBOX_RUN_STATUS.CLEANUP_REQUIRED,
        SANDBOX_RUN_STATUS.CLEANING,
        SANDBOX_RUN_STATUS.EXPIRY_PENDING,
        SANDBOX_RUN_STATUS.CLEANUP_FAILED,
        SANDBOX_RUN_STATUS.PROVISIONING,
        SANDBOX_RUN_STATUS.ACTIVE,
      ]],
      ['findSandboxRunProvisioningOwnership', [SANDBOX_RUN_STATUS.PROVISIONING]],
      ['advanceSandboxRunProvisioningPhase', [SANDBOX_RUN_STATUS.PROVISIONING]],
      ['activateSandboxRun', [
        SANDBOX_RUN_STATUS.ACTIVE,
        SANDBOX_RUN_STATUS.PROVISIONING,
        SANDBOX_PROVISIONING_PHASE.SPP_ACQUIRED,
      ]],
      ['requestSandboxRunCleanup', [
        SANDBOX_RUN_STATUS.CLEANUP_REQUIRED,
        SANDBOX_CLEANUP_PHASE.DENY_INTENT,
        SANDBOX_COMPONENT_STATE.ACTIVE,
        SANDBOX_COMPONENT_STATE.DENY_PENDING,
        SANDBOX_RUN_STATUS.PROVISIONING,
      ]],
      ['claimSandboxRunCleanup', [
        SANDBOX_RUN_STATUS.CLEANING,
        SANDBOX_CLEANUP_PHASE.DENY_INTENT,
        SANDBOX_RUN_STATUS.CLEANUP_REQUIRED,
        SANDBOX_RUN_STATUS.EXPIRY_PENDING,
        SANDBOX_RUN_STATUS.CLEANUP_FAILED,
      ]],
      ['updateSandboxRunComponent', [SANDBOX_RUN_STATUS.RELEASED]],
      ['advanceSandboxRunCleanupPhase', [SANDBOX_RUN_STATUS.CLEANING]],
      ['advanceSandboxRunRetryNotBefore', [
        SANDBOX_RUN_STATUS.CLEANUP_REQUIRED,
        SANDBOX_RUN_STATUS.CLEANING,
        SANDBOX_RUN_STATUS.EXPIRY_PENDING,
        SANDBOX_RUN_STATUS.CLEANUP_FAILED,
      ]],
      ['setSandboxRunCleanupDisposition', [SANDBOX_RUN_STATUS.CLEANING]],
      ['releaseSandboxRun', [
        SANDBOX_RUN_STATUS.RELEASED,
        SANDBOX_RUN_STATUS.CLEANING,
        SANDBOX_CLEANUP_PHASE.VERIFY,
      ]],
    ]);
    const universe = new Set([
      ...SANDBOX_RUN_STATUSES,
      ...SANDBOX_PROVISIONING_PHASES,
      ...SANDBOX_CLEANUP_PHASES,
      ...SANDBOX_COMPONENT_STATES,
      ...SANDBOX_LAST_RESIDUAL_CODES,
    ]);
    for (const [name, values] of expected) {
      const source = extractFunction(dbSource, name);
      const literals = [...source.matchAll(/'([^']+)'/g)]
        .map((match) => match[1])
        .filter((value) => universe.has(value));
      expectSameSet(literals, values);
    }
    expect(dbSource).toContain('LIMIT 10');
    expect(dbSource).not.toContain('const SANDBOX_COMPONENT_COLUMNS');
    expect(dbSource).not.toContain('const SANDBOX_CLEANUP_PHASE_PREDECESSOR');
  });

  it('keeps JavaScript contract structures single-owned while preserving distinct boundaries', async () => {
    const [lease, issuance, db, ownership, lifecycle, admin, relay] = await Promise.all([
      readFile(join(accountDir, 'src/sandbox-run-lease.js'), 'utf8'),
      readFile(join(accountDir, 'src/capability-issuance.js'), 'utf8'),
      readFile(dbPath, 'utf8'),
      readFile(join(accountDir, 'src/sandbox-ownership.js'), 'utf8'),
      readFile(join(accountDir, 'src/spb-sandbox-lifecycle.js'), 'utf8'),
      readFile(join(accountDir, 'src/admin.js'), 'utf8'),
      readFile(join(accountDir, 'src/relay-grant.js'), 'utf8'),
    ]);
    for (const duplicate of [
      'const LEASE_TTL_MS',
      'const REQUEST_KEYS',
      'const CLEANUP_TRIGGERS',
      'const PROVISIONING_PHASES',
      'const COMPONENTS',
      'const RELAY_RESIDUALS',
      'function renderSandboxRun(',
      SANDBOX_ERROR.INVALID_REQUEST.error,
      SANDBOX_ERROR.CLEANUP_UNAVAILABLE.error,
    ]) {
      expect(lease).not.toContain(duplicate);
    }
    expect(issuance).not.toContain('capability: {');
    expect(db).not.toContain('const SANDBOX_COMPONENT_COLUMNS');
    expect(db).not.toContain('const SANDBOX_CLEANUP_PHASE_PREDECESSOR');
    expect(ownership).not.toMatch(/expectedPhase\s*=\s*'/);
    expect(lifecycle).not.toMatch(/expectedPhase\s*=\s*'/);
    expect(admin).not.toContain("from './sandbox-run-contract.js'");
    expect(relay).toContain('const RETIREMENT_COMPONENTS =');
    expect(lease).toContain('const SANDBOX_RECONCILE_BATCH_SIZE = 10');
    expect(db).toContain('LIMIT 10');
  });
});

function extractConstraintValues(source, column) {
  const tableStart = source.search(/CREATE TABLE(?: IF NOT EXISTS)? sandbox_runs \(/);
  if (tableStart < 0) throw new Error('could not locate sandbox_runs table');
  const table = source.slice(tableStart);
  const start = table.indexOf(`${column} TEXT`);
  if (start < 0) throw new Error(`could not locate ${column} constraint`);
  const tail = table.slice(start);
  const marker = `${column} IN (`;
  const valuesStart = tail.indexOf(marker);
  if (valuesStart < 0) throw new Error(`could not locate ${column} vocabulary`);
  const bodyStart = valuesStart + marker.length;
  const bodyEnd = tail.indexOf(')', bodyStart);
  if (bodyEnd < 0) throw new Error(`could not close ${column} vocabulary`);
  const values = [...tail.slice(bodyStart, bodyEnd).matchAll(/'([^']+)'/g)].map((match) => match[1]);
  if (values.length === 0) throw new Error(`${column} vocabulary was empty`);
  return values;
}

function extractFunction(source, name) {
  const marker = `export async function ${name}`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`could not locate ${name} in src/db.js`);
  const next = source.indexOf('\nexport async function ', start + marker.length);
  return source.slice(start, next < 0 ? source.length : next);
}

function expectSameSet(actual, expected) {
  const actualValues = [...new Set(actual)].sort();
  const expectedValues = [...new Set(expected)].sort();
  expect(actualValues).toEqual(expectedValues);
  expect(expectedValues).toEqual(actualValues);
}

function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}
