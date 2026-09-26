import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BINDINGS_SQL,
  LEDGER_SQL,
  parseWranglerD1Json,
  runRelayAddress,
  runSolstoneMeDnsCli,
  runStatus,
} from '../scripts/solstone-me-dns.mjs';
import { installFakeSolstoneMeZone } from './fake-solstone-me-zone.js';
import { installConsoleSpy } from './helpers.js';

const TEST_ZONE_ID = 'TEST_ZONE_ID_DO_NOT_LOG';
const TEST_TOKEN = 'TEST_DNS_TOKEN_DO_NOT_LOG';
const TEST_ACME_URI = 'https://acme.example/TEST_ACME_URI_DO_NOT_LOG';
const SECRET_EMAIL = 'secret-email@example.com';

function scriptEnv(overrides = {}) {
  return {
    SOLSTONE_ME_ZONE_ID: TEST_ZONE_ID,
    SOLSTONE_ME_DNS_API_TOKEN: TEST_TOKEN,
    ...overrides,
  };
}

function caaData(uri = TEST_ACME_URI) {
  return {
    flags: 0,
    tag: 'issue',
    value: `letsencrypt.org; accounturi=${uri}; validationmethods=tls-alpn-01`,
  };
}

function makeDeps({
  bindings = [],
  ledger = [],
  env = scriptEnv(),
  readerError = null,
} = {}) {
  const stdout = [];
  const stderr = [];
  const readerCalls = [];

  const readWranglerOutput = vi.fn(async (sql) => {
    readerCalls.push(sql);
    if (readerError) throw readerError;
    if (sql === BINDINGS_SQL) {
      return JSON.stringify([{
        success: true,
        results: bindings,
        meta: { secret_contact: SECRET_EMAIL },
      }]);
    }
    if (sql === LEDGER_SQL) {
      return JSON.stringify([{
        success: true,
        results: ledger,
        meta: { secret_contact: SECRET_EMAIL },
      }]);
    }
    throw new Error(`unexpected sql: ${sql}`);
  });

  return {
    env,
    readWranglerOutput,
    writeOut: (s) => stdout.push(s),
    writeErr: (s) => stderr.push(s),
    getStdout: () => stdout.join(''),
    getStderr: () => stderr.join(''),
    readerCalls,
  };
}

describe('solstone-me-dns operator script', () => {
  let fakeZone;
  beforeEach(() => {
    fakeZone = installFakeSolstoneMeZone({ zoneId: TEST_ZONE_ID });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('rejects bare JSON object in parseWranglerD1Json', () => {
    expect(parseWranglerD1Json(JSON.stringify({ results: [], success: true }))).toEqual({ ok: false });
    expect(parseWranglerD1Json('not json')).toEqual({ ok: false });
    expect(parseWranglerD1Json('[]')).toEqual({ ok: false });
    expect(parseWranglerD1Json(JSON.stringify([{ success: false, results: [] }]))).toEqual({ ok: false });
    expect(parseWranglerD1Json(JSON.stringify([{ success: true, results: [{ label: 'test' }] }]))).toEqual({
      ok: true,
      results: [{ label: 'test' }],
    });
  });

  it('status without --addresses: exits 1, reader not called, zone unchanged, stderr is addresses required', async () => {
    const initialRecords = fakeZone.getRecords();
    const deps = makeDeps();
    const code = await runStatus([], deps);

    expect(code).toBe(1);
    expect(deps.readWranglerOutput).not.toHaveBeenCalled();
    expect(fakeZone.getRecords()).toEqual(initialRecords);
    expect(deps.getStderr()).toBe('addresses required\n');
  });

  it('status with non-ip address: exits 1, reader not called, bad token not in stdout or stderr', async () => {
    const deps = makeDeps();
    const badToken = 'super-secret-bad-token-xyz';
    const code = await runStatus(['--addresses', badToken], deps);

    expect(code).toBe(1);
    expect(deps.readWranglerOutput).not.toHaveBeenCalled();
    expect(deps.getStderr()).toBe('invalid address\n');
    expect(deps.getStdout()).not.toContain(badToken);
    expect(deps.getStderr()).not.toContain(badToken);
  });

  it('status with address label having no records: exits 1, prints match=false', async () => {
    const deps = makeDeps({
      bindings: [{ label: 'norecord', acme_account_uri: TEST_ACME_URI }],
      ledger: [{ label: 'norecord' }],
    });

    const code = await runStatus(['--addresses', '20.186.92.169'], deps);

    expect(code).toBe(1);
    expect(deps.readerCalls).toEqual([BINDINGS_SQL, LEDGER_SQL]);
    expect(deps.getStdout()).toContain('address norecord pin=true match=false\n');
  });

  it('status with healthy address plus an orphan: exits 1, orphan listed under orphans only', async () => {
    const deps = makeDeps({
      bindings: [{ label: 'healthyy', acme_account_uri: TEST_ACME_URI }],
      ledger: [{ label: 'healthyy' }, { label: 'orphyyyy' }],
    });

    fakeZone.addRecord({ name: 'healthyy.solstone.me', type: 'CAA', data: caaData() });
    fakeZone.addRecord({ name: 'healthyy.solstone.me', type: 'A', content: '20.186.92.169' });
    fakeZone.addRecord({ name: 'orphyyyy.solstone.me', type: 'CAA', data: caaData() });

    const code = await runStatus(['--addresses', '20.186.92.169'], deps);

    expect(code).toBe(1);
    expect(deps.getStdout()).toContain('address healthyy pin=true match=true\n');
    expect(deps.getStdout()).not.toContain('address orphyyyy');
    expect(deps.getStdout()).toContain('orphans\norphyyyy\n');
  });

  it('relay-address dry run with orphan and www in zone: zone unchanged, only binding label in stdout', async () => {
    const deps = makeDeps({
      bindings: [{ label: 'relayaaa', acme_account_uri: TEST_ACME_URI }],
      ledger: [{ label: 'relayaaa' }, { label: 'orphyyyy' }],
    });

    fakeZone.addRecord({ name: 'relayaaa.solstone.me', type: 'CAA', data: caaData() });
    fakeZone.addRecord({ name: 'relayaaa.solstone.me', type: 'A', content: '1.1.1.1' });
    fakeZone.addRecord({ name: 'orphyyyy.solstone.me', type: 'A', content: '1.1.1.1' });
    fakeZone.addRecord({ name: 'www.solstone.me', type: 'A', content: '1.1.1.1' });

    const snapshot = JSON.stringify(fakeZone.getRecords());
    const code = await runRelayAddress(['--from', '1.1.1.1', '--to', '2.2.2.2'], deps);

    expect(code).toBe(0);
    expect(JSON.stringify(fakeZone.getRecords())).toBe(snapshot);
    expect(deps.getStdout()).toBe('address relayaaa patch 1 delete 0\n');
    expect(deps.getStdout()).not.toContain('orphyyyy');
    expect(deps.getStdout()).not.toContain('www');
  });

  it('relay-address --apply without --worker-config-updated: exits 1, reader not called, error written', async () => {
    const deps = makeDeps();
    const code = await runRelayAddress(['--from', '1.1.1.1', '--to', '2.2.2.2', '--apply'], deps);

    expect(code).toBe(1);
    expect(deps.readWranglerOutput).not.toHaveBeenCalled();
    expect(deps.getStderr()).toBe('worker config not confirmed\n');
  });

  it('relay-address with --from equal to --to: exits 1, reader not called', async () => {
    const deps = makeDeps();
    const code = await runRelayAddress(['--from', '1.1.1.1', '--to', '1.1.1.1'], deps);

    expect(code).toBe(1);
    expect(deps.readWranglerOutput).not.toHaveBeenCalled();
    expect(deps.getStderr()).toBe('from and to must differ\n');
  });

  it('relay-address --apply --worker-config-updated: patches A record, preserves CAA, and status passes', async () => {
    const deps = makeDeps({
      bindings: [{ label: 'applyaaa', acme_account_uri: TEST_ACME_URI }],
      ledger: [{ label: 'applyaaa' }],
    });

    const caa = fakeZone.addRecord({ name: 'applyaaa.solstone.me', type: 'CAA', data: caaData() });
    fakeZone.addRecord({ name: 'applyaaa.solstone.me', type: 'A', content: '1.1.1.1' });

    const code = await runRelayAddress(
      ['--from', '1.1.1.1', '--to', '2.2.2.2', '--apply', '--worker-config-updated'],
      deps
    );

    expect(code).toBe(0);
    expect(deps.getStdout()).toBe('address applyaaa patch 1 delete 0\n');

    const records = fakeZone.getRecords('applyaaa.solstone.me');
    expect(records).toHaveLength(2);
    const caaRec = records.find((r) => r.type === 'CAA');
    const aRec = records.find((r) => r.type === 'A');

    expect(caaRec.id).toBe(caa.id);
    expect(caaRec.data).toEqual(caaData());
    expect(aRec.content).toBe('2.2.2.2');

    // Run status with new IP -> exit 0
    const statusCode = await runStatus(['--addresses', '2.2.2.2'], deps);
    expect(statusCode).toBe(0);
  });

  it('relay-address when name already has an A record for --to: deletes --from A and leaves single --to A', async () => {
    const deps = makeDeps({
      bindings: [{ label: 'existaaa', acme_account_uri: TEST_ACME_URI }],
      ledger: [{ label: 'existaaa' }],
    });

    const caa = fakeZone.addRecord({ name: 'existaaa.solstone.me', type: 'CAA', data: caaData() });
    fakeZone.addRecord({ name: 'existaaa.solstone.me', type: 'A', content: '1.1.1.1' });
    const toA = fakeZone.addRecord({ name: 'existaaa.solstone.me', type: 'A', content: '2.2.2.2' });

    const code = await runRelayAddress(
      ['--from', '1.1.1.1', '--to', '2.2.2.2', '--apply', '--worker-config-updated'],
      deps
    );

    expect(code).toBe(0);
    expect(deps.getStdout()).toBe('address existaaa patch 0 delete 1\n');

    const records = fakeZone.getRecords('existaaa.solstone.me');
    expect(records).toHaveLength(2);
    expect(records.find((r) => r.id === caa.id)).toBeDefined();
    expect(records.find((r) => r.id === toA.id)).toBeDefined();
  });

  it('relay-address with unpinned binding: dry run skips unpinned, apply fails verify and leaves zone unchanged', async () => {
    const depsDry = makeDeps({
      bindings: [{ label: 'unpinaaa', acme_account_uri: null }],
      ledger: [{ label: 'unpinaaa' }],
    });

    fakeZone.addRecord({ name: 'unpinaaa.solstone.me', type: 'A', content: '1.1.1.1' });

    const dryCode = await runRelayAddress(['--from', '1.1.1.1', '--to', '2.2.2.2'], depsDry);
    expect(dryCode).toBe(0);
    expect(depsDry.getStdout()).toBe('address unpinaaa skip unpinned\n');

    const depsApply = makeDeps({
      bindings: [{ label: 'unpinaaa', acme_account_uri: null }],
      ledger: [{ label: 'unpinaaa' }],
    });

    const snapshot = fakeZone.getRecords();
    const applyCode = await runRelayAddress(
      ['--from', '1.1.1.1', '--to', '2.2.2.2', '--apply', '--worker-config-updated'],
      depsApply
    );
    expect(applyCode).toBe(1);
    expect(depsApply.getStderr()).toContain('verify failed unpinaaa\n');
    expect(fakeZone.getRecords()).toEqual(snapshot);
  });

  it('runSolstoneMeDnsCli routes commands and rejects unknown commands', async () => {
    const deps = makeDeps();
    expect(await runSolstoneMeDnsCli(['unknown-cmd'], deps)).toBe(1);
    expect(deps.getStderr()).toBe('unknown argument\n');
  });

  it('asserts no secrets, tokens, zone IDs, or ACME URIs leaked to stdout, stderr, or console', async () => {
    const spy = installConsoleSpy();
    const deps = makeDeps({
      bindings: [{ label: 'secretaa', acme_account_uri: TEST_ACME_URI }],
      ledger: [{ label: 'secretaa' }],
    });

    await runStatus(['--addresses', '20.186.92.169'], deps);
    await runRelayAddress(['--from', '1.1.1.1', '--to', '2.2.2.2'], deps);

    const fullOutput = deps.getStdout() + '\n' + deps.getStderr();
    expect(fullOutput).not.toContain(TEST_TOKEN);
    expect(fullOutput).not.toContain(TEST_ZONE_ID);
    expect(fullOutput).not.toContain(TEST_ACME_URI);
    expect(fullOutput).not.toContain(SECRET_EMAIL);

    spy.assertNoSecrets([TEST_TOKEN, TEST_ZONE_ID, TEST_ACME_URI, SECRET_EMAIL]);
    spy.restore();
  });
});
