/*
Operator DNS tool for solstone.me address labels.

  node scripts/solstone-me-dns.mjs status --addresses <ipv4>[,<ipv4>...]
  node scripts/solstone-me-dns.mjs relay-address --from <ipv4> --to <ipv4> [--apply] [--worker-config-updated]

Reads bindings and the hostname ledger through `wrangler d1 execute account-portal --remote --json` with cwd `account/`. Requires SOLSTONE_ME_ZONE_ID and SOLSTONE_ME_DNS_API_TOKEN in the environment. relay-address is a dry run unless --apply is set. --apply also requires --worker-config-updated, confirming MCP_BRIDGE_ADDRESSES already names the new address. This script cannot read that secret.
*/

import { classifySolstoneMeOrphans } from '../src/solstone-me-dns-sweep.js';
import {
  applyLabelBatch,
  labelRecordsMatch,
  listLabelRecords,
  listZoneRecords,
} from '../src/solstone-me-dns.js';

export const BINDINGS_SQL = 'SELECT label, acme_account_uri FROM mcp_bridge_bindings';
export const LEDGER_SQL = 'SELECT label FROM mcp_bridge_hostname_ledger';

const LABEL_PATTERN = /^[a-z2-7]{8}$/;

function isIpv4Address(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
}

export function parseWranglerD1Json(stdout) {
  try {
    const data = JSON.parse(stdout);
    if (Array.isArray(data) && data.length > 0 && data[0]?.success === true && Array.isArray(data[0]?.results)) {
      return { ok: true, results: data[0].results };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

export async function runStatus(argv, deps = {}) {
  const writeOut = deps.writeOut || ((s) => globalThis.process?.stdout?.write(s));
  const writeErr = deps.writeErr || ((s) => globalThis.process?.stderr?.write(s));

  let rawAddresses = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--addresses') {
      if (i + 1 >= argv.length) {
        writeErr('addresses required\n');
        return 1;
      }
      rawAddresses = argv[++i];
    } else {
      writeErr('unknown argument\n');
      return 1;
    }
  }

  if (rawAddresses === null) {
    writeErr('addresses required\n');
    return 1;
  }

  const addressTokens = rawAddresses.split(',');
  const parsedAddresses = [];
  for (const token of addressTokens) {
    const trimmed = token.trim();
    if (!trimmed || !isIpv4Address(trimmed)) {
      writeErr('invalid address\n');
      return 1;
    }
    parsedAddresses.push(trimmed);
  }
  const addresses = [...new Set(parsedAddresses)];

  const env = deps.env || {};
  if (!env.SOLSTONE_ME_ZONE_ID || !env.SOLSTONE_ME_DNS_API_TOKEN) {
    writeErr('dns not configured\n');
    return 1;
  }

  let bindingsRes, ledgerRes;
  try {
    const [bindingsOut, ledgerOut] = await Promise.all([
      deps.readWranglerOutput(BINDINGS_SQL),
      deps.readWranglerOutput(LEDGER_SQL),
    ]);
    bindingsRes = parseWranglerD1Json(bindingsOut);
    ledgerRes = parseWranglerD1Json(ledgerOut);
    if (!bindingsRes.ok || !ledgerRes.ok) {
      writeErr('d1 read failed\n');
      return 1;
    }
  } catch {
    writeErr('d1 read failed\n');
    return 1;
  }

  const listRes = await listZoneRecords(env);
  if (!listRes.ok) {
    writeErr('dns list failed\n');
    return 1;
  }

  const validBindings = bindingsRes.results
    .filter((r) => typeof r?.label === 'string' && LABEL_PATTERN.test(r.label))
    .sort((a, b) => a.label.localeCompare(b.label));

  const bindingLabels = validBindings.map((r) => r.label);
  const ledgerLabels = ledgerRes.results
    .filter((r) => typeof r?.label === 'string' && LABEL_PATTERN.test(r.label))
    .map((r) => r.label);

  const orphans = classifySolstoneMeOrphans(listRes.records, bindingLabels, ledgerLabels);

  const recordsByName = new Map();
  for (const rec of listRes.records) {
    if (!rec?.name) continue;
    if (!recordsByName.has(rec.name)) {
      recordsByName.set(rec.name, []);
    }
    recordsByName.get(rec.name).push(rec);
  }

  let allMatched = true;
  for (const row of validBindings) {
    const hostname = `${row.label}.solstone.me`;
    const hasPin = typeof row.acme_account_uri === 'string' && row.acme_account_uri.length > 0;
    const records = recordsByName.get(hostname) || [];
    const isMatch = hasPin && labelRecordsMatch(records, {
      hostname,
      accountUri: row.acme_account_uri,
      addresses,
    });
    writeOut(`address ${row.label} pin=${hasPin} match=${isMatch}\n`);
    if (!isMatch) {
      allMatched = false;
    }
  }

  writeOut('orphans\n');
  for (const orphanName of orphans) {
    const orphanLabel = orphanName.split('.')[0];
    writeOut(`${orphanLabel}\n`);
  }

  if (orphans.length > 0) {
    allMatched = false;
  }

  return allMatched ? 0 : 1;
}

export async function runRelayAddress(argv, deps = {}) {
  const writeOut = deps.writeOut || ((s) => globalThis.process?.stdout?.write(s));
  const writeErr = deps.writeErr || ((s) => globalThis.process?.stderr?.write(s));

  let fromIp = null;
  let toIp = null;
  let isApply = false;
  let workerConfigUpdated = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--from') {
      if (i + 1 >= argv.length) {
        writeErr('from and to required\n');
        return 1;
      }
      fromIp = argv[++i];
    } else if (arg === '--to') {
      if (i + 1 >= argv.length) {
        writeErr('from and to required\n');
        return 1;
      }
      toIp = argv[++i];
    } else if (arg === '--apply') {
      isApply = true;
    } else if (arg === '--worker-config-updated') {
      workerConfigUpdated = true;
    } else {
      writeErr('unknown argument\n');
      return 1;
    }
  }

  if (fromIp === null || toIp === null) {
    writeErr('from and to required\n');
    return 1;
  }

  const trimmedFrom = fromIp.trim();
  const trimmedTo = toIp.trim();

  if (!isIpv4Address(trimmedFrom) || !isIpv4Address(trimmedTo)) {
    writeErr('invalid address\n');
    return 1;
  }

  if (trimmedFrom === trimmedTo) {
    writeErr('from and to must differ\n');
    return 1;
  }

  if (isApply && !workerConfigUpdated) {
    writeErr('worker config not confirmed\n');
    return 1;
  }

  const env = deps.env || {};
  if (!env.SOLSTONE_ME_ZONE_ID || !env.SOLSTONE_ME_DNS_API_TOKEN) {
    writeErr('dns not configured\n');
    return 1;
  }

  let bindingsRes;
  try {
    const bindingsOut = await deps.readWranglerOutput(BINDINGS_SQL);
    bindingsRes = parseWranglerD1Json(bindingsOut);
    if (!bindingsRes.ok) {
      writeErr('d1 read failed\n');
      return 1;
    }
  } catch {
    writeErr('d1 read failed\n');
    return 1;
  }

  const listRes = await listZoneRecords(env);
  if (!listRes.ok) {
    writeErr('dns list failed\n');
    return 1;
  }

  const recordsByName = new Map();
  for (const rec of listRes.records) {
    if (!rec?.name) continue;
    if (!recordsByName.has(rec.name)) {
      recordsByName.set(rec.name, []);
    }
    recordsByName.get(rec.name).push(rec);
  }

  const validBindings = bindingsRes.results
    .filter((r) => typeof r?.label === 'string' && LABEL_PATTERN.test(r.label))
    .sort((a, b) => a.label.localeCompare(b.label));

  const plans = [];
  for (const row of validBindings) {
    const label = row.label;
    const hostname = `${label}.solstone.me`;
    const hasPin = typeof row.acme_account_uri === 'string' && row.acme_account_uri.length > 0;

    if (!hasPin) {
      plans.push({ label, hostname, hasPin: false, skipUnpinned: true });
      continue;
    }

    const records = recordsByName.get(hostname) || [];
    const aRecords = records.filter((r) => r.type === 'A');
    const fromAs = aRecords.filter((r) => r.content === trimmedFrom);
    const toPresent = aRecords.some((r) => r.content === trimmedTo);

    let patches = [];
    let deletes = [];

    if (toPresent) {
      deletes = fromAs.map((r) => ({ id: r.id }));
    } else if (fromAs.length > 0) {
      patches = [{ id: fromAs[0].id, content: trimmedTo }];
      deletes = fromAs.slice(1).map((r) => ({ id: r.id }));
    }

    const initialDistinctA = [...new Set(aRecords.map((r) => r.content))];
    const postMoveDistinctA = initialDistinctA.map((ip) => (ip === trimmedFrom ? trimmedTo : ip));
    const targetAddresses = [...new Set(postMoveDistinctA)];

    plans.push({
      label,
      hostname,
      hasPin: true,
      skipUnpinned: false,
      patches,
      deletes,
      row,
      targetAddresses,
    });
  }

  for (const plan of plans) {
    if (plan.skipUnpinned) {
      writeOut(`address ${plan.label} skip unpinned\n`);
    } else {
      writeOut(`address ${plan.label} patch ${plan.patches.length} delete ${plan.deletes.length}\n`);
    }
  }

  if (!isApply) {
    return 0;
  }

  // Apply phase
  for (const plan of plans) {
    if (!plan.skipUnpinned && (plan.patches.length > 0 || plan.deletes.length > 0)) {
      await applyLabelBatch(env, {
        deletes: plan.deletes,
        patches: plan.patches,
        posts: [],
      });
    }
  }

  // Verify phase
  let verifyOk = true;
  for (const plan of plans) {
    if (plan.skipUnpinned) {
      writeErr(`verify failed ${plan.label}\n`);
      verifyOk = false;
      continue;
    }

    const labelListRes = await listLabelRecords(env, plan.hostname);
    if (!labelListRes.ok) {
      writeErr(`verify failed ${plan.label}\n`);
      verifyOk = false;
      continue;
    }

    const matched = labelRecordsMatch(labelListRes.records, {
      hostname: plan.hostname,
      accountUri: plan.row.acme_account_uri,
      addresses: plan.targetAddresses,
    });

    if (!matched) {
      writeErr(`verify failed ${plan.label}\n`);
      verifyOk = false;
    }
  }

  return verifyOk ? 0 : 1;
}

export async function runSolstoneMeDnsCli(argv, deps = {}) {
  const writeErr = deps.writeErr || ((s) => globalThis.process?.stderr?.write(s));
  const command = argv[0];
  const rest = argv.slice(1);

  if (command === 'status') {
    return runStatus(rest, deps);
  }
  if (command === 'relay-address') {
    return runRelayAddress(rest, deps);
  }

  writeErr('unknown argument\n');
  return 1;
}

const isDirectRun = (() => {
  try {
    const argv1 = globalThis.process?.argv?.[1];
    if (!argv1) return false;
    const scriptPath = decodeURIComponent(new URL(import.meta.url).pathname);
    if (scriptPath === argv1) return true;
    const cwd = globalThis.process?.cwd?.() || '';
    const combined = (cwd + '/' + argv1).replace(/\/\.\//g, '/');
    return scriptPath === combined;
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  try {
    const { spawnWranglerD1 } = await import(new URL('./solstone-me-dns-spawn.mjs', import.meta.url).href);
    const code = await runSolstoneMeDnsCli(process.argv.slice(2), {
      env: process.env,
      readWranglerOutput: spawnWranglerD1,
    });
    process.exit(code);
  } catch {
    process.exit(1);
  }
}
