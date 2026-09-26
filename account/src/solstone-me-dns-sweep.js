import {
  getMcpBridgeBindingLabel,
  listMcpBridgeBindingLabels,
  listMcpBridgeHostnameLedgerLabels,
} from './db.js';
import {
  applyLabelBatch,
  listZoneRecords,
  solstoneMeDnsReady,
} from './solstone-me-dns.js';

const LABEL_PATTERN = /^[a-z2-7]{8}$/;
const MANAGED_NAME_PATTERN = /^[a-z2-7]{8}\.solstone\.me$/;
const PROTECTED_NAMES = new Set([
  'solstone.me',
  'www.solstone.me',
  'bridge.solstone.me',
  '*.solstone.me',
]);

export function classifySolstoneMeOrphans(records, bindingLabels, ledgerLabels) {
  const validBindings = new Set(
    (bindingLabels || []).filter((l) => typeof l === 'string' && LABEL_PATTERN.test(l))
  );
  const validLedgers = new Set(
    (ledgerLabels || []).filter((l) => typeof l === 'string' && LABEL_PATTERN.test(l))
  );

  const namesInZone = new Set();
  for (const rec of (records || [])) {
    if (rec?.name) {
      namesInZone.add(rec.name);
    }
  }

  const orphans = [];
  for (const name of namesInZone) {
    if (PROTECTED_NAMES.has(name)) continue;
    if (!MANAGED_NAME_PATTERN.test(name)) continue;
    const label = name.slice(0, 8);
    if (validLedgers.has(label) && !validBindings.has(label)) {
      orphans.push(name);
    }
  }

  return orphans.sort();
}

export async function runSolstoneMeOrphanDnsSweep(env, hooks = {}) {
  try {
    if (!solstoneMeDnsReady(env)) {
      console.error(JSON.stringify({ event: 'solstone_me_orphan_dns_sweep', reason: 'not_configured' }));
      return;
    }

    const listRes = await listZoneRecords(env);
    if (!listRes.ok) {
      const reason = ['list_failed', 'list_incomplete', 'timeout'].includes(listRes.reason)
        ? listRes.reason
        : 'list_failed';
      console.error(JSON.stringify({ event: 'solstone_me_orphan_dns_sweep', reason }));
      return;
    }

    const [bindingLabels, ledgerLabels] = await Promise.all([
      listMcpBridgeBindingLabels(env.DB),
      listMcpBridgeHostnameLedgerLabels(env.DB),
    ]);

    const orphans = classifySolstoneMeOrphans(listRes.records, bindingLabels, ledgerLabels);

    if (typeof hooks?.afterClassify === 'function') {
      await hooks.afterClassify(orphans);
    }

    const recordsByName = new Map();
    for (const rec of listRes.records) {
      if (!rec?.name) continue;
      if (!recordsByName.has(rec.name)) {
        recordsByName.set(rec.name, []);
      }
      recordsByName.get(rec.name).push(rec);
    }

    for (const orphanHostname of orphans) {
      const label = orphanHostname.slice(0, 8);
      const existing = await getMcpBridgeBindingLabel(env.DB, label);
      if (existing) continue;

      const records = recordsByName.get(orphanHostname) || [];
      const deletes = records
        .filter((r) => r.type === 'CAA' || r.type === 'A')
        .map((r) => ({ id: r.id }));

      if (deletes.length === 0) continue;

      const batchRes = await applyLabelBatch(env, {
        deletes,
        patches: [],
        posts: [],
      });

      if (!batchRes.ok) {
        const reason = batchRes.reason === 'timeout' ? 'timeout' : 'batch_failed';
        console.error(JSON.stringify({ event: 'solstone_me_orphan_dns_sweep', reason }));
      }
    }
  } catch {
    console.error(JSON.stringify({ event: 'solstone_me_orphan_dns_sweep', reason: 'sweep_failed' }));
  }
}
