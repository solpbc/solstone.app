export const DNS_FETCH_TIMEOUT_MS = 5000;
const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

export function readDnsRecordCeiling(env) {
  const raw = env?.SOLSTONE_ME_DNS_RECORD_CEILING;
  if (raw === undefined || raw === null || raw === '') return 190;
  if (typeof raw === 'number' && Number.isSafeInteger(raw) && raw > 0) return raw;
  if (typeof raw === 'string' && /^[1-9][0-9]*$/.test(raw.trim())) {
    const parsed = Number(raw.trim());
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

export function solstoneMeDnsReady(env) {
  return Boolean(
    typeof env?.SOLSTONE_ME_ZONE_ID === 'string' &&
    env.SOLSTONE_ME_ZONE_ID.trim() &&
    typeof env?.SOLSTONE_ME_DNS_API_TOKEN === 'string' &&
    env.SOLSTONE_ME_DNS_API_TOKEN.trim()
  );
}

export async function listLabelRecords(env, hostname) {
  const zoneId = env.SOLSTONE_ME_ZONE_ID;
  const token = env.SOLSTONE_ME_DNS_API_TOKEN;
  const url = `${CLOUDFLARE_API_BASE}/zones/${encodeURIComponent(zoneId)}/dns_records?name=${encodeURIComponent(hostname)}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(DNS_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, reason: 'list_failed' };
    const data = await res.json();
    if (!data || data.success !== true || !Array.isArray(data.result)) {
      return { ok: false, reason: 'list_failed' };
    }
    const totalCount = data.result_info?.total_count;
    if (typeof totalCount === 'number' && totalCount > data.result.length) {
      return { ok: false, reason: 'list_incomplete' };
    }
    return { ok: true, records: data.result };
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return { ok: false, reason: 'timeout' };
    }
    return { ok: false, reason: 'list_failed' };
  }
}

export async function countZoneRecords(env) {
  const zoneId = env.SOLSTONE_ME_ZONE_ID;
  const token = env.SOLSTONE_ME_DNS_API_TOKEN;
  const url = `${CLOUDFLARE_API_BASE}/zones/${encodeURIComponent(zoneId)}/dns_records?per_page=1`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(DNS_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, reason: 'count_failed' };
    const data = await res.json();
    if (!data || data.success !== true || typeof data.result_info?.total_count !== 'number') {
      return { ok: false, reason: 'count_malformed' };
    }
    const totalCount = data.result_info.total_count;
    if (!Number.isSafeInteger(totalCount) || totalCount < 0) {
      return { ok: false, reason: 'count_malformed' };
    }
    return { ok: true, totalCount };
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return { ok: false, reason: 'timeout' };
    }
    return { ok: false, reason: 'count_failed' };
  }
}

export async function applyLabelBatch(env, body) {
  const zoneId = env.SOLSTONE_ME_ZONE_ID;
  const token = env.SOLSTONE_ME_DNS_API_TOKEN;
  const url = `${CLOUDFLARE_API_BASE}/zones/${encodeURIComponent(zoneId)}/dns_records/batch`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(DNS_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, reason: 'batch_failed' };
    const data = await res.json();
    if (!data || data.success !== true) return { ok: false, reason: 'batch_failed' };
    return { ok: true };
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return { ok: false, reason: 'timeout' };
    }
    return { ok: false, reason: 'batch_failed' };
  }
}

export function labelRecordsMatch(records, { hostname, accountUri, addresses }) {
  if (!Array.isArray(records)) return false;
  const expectedCaaValue = `letsencrypt.org; accounturi=${accountUri}; validationmethods=tls-alpn-01`;
  const distinctAddresses = new Set(addresses);

  let caaCount = 0;
  const seenAddresses = new Set();

  for (const record of records) {
    if (record?.name !== hostname || record?.proxied !== false || record?.ttl !== 60) {
      return false;
    }
    if (record.type === 'CAA') {
      if (
        record.data?.flags === 0 &&
        record.data?.tag === 'issue' &&
        record.data?.value === expectedCaaValue
      ) {
        caaCount++;
      } else {
        return false;
      }
    } else if (record.type === 'A') {
      const ip = record.content;
      if (distinctAddresses.has(ip) && !seenAddresses.has(ip)) {
        seenAddresses.add(ip);
      } else {
        return false;
      }
    } else {
      return false;
    }
  }

  return caaCount === 1 && seenAddresses.size === distinctAddresses.size;
}

export function planLabelBatch(records, { hostname, accountUri, addresses }) {
  if (labelRecordsMatch(records, { hostname, accountUri, addresses })) {
    return null;
  }

  const expectedCaaValue = `letsencrypt.org; accounturi=${accountUri}; validationmethods=tls-alpn-01`;
  const targetAddresses = [...new Set(addresses)];
  const deletes = [];
  const patches = [];
  const posts = [];

  const caaRecords = [];
  const aRecords = [];
  const otherRecords = [];

  for (const rec of (records || [])) {
    if (rec.type === 'CAA') {
      caaRecords.push(rec);
    } else if (rec.type === 'A') {
      aRecords.push(rec);
    } else {
      otherRecords.push(rec);
    }
  }

  // Handle CAA records
  if (caaRecords.length > 0) {
    const perfectCaaIndex = caaRecords.findIndex(
      (r) =>
        r.name === hostname &&
        r.proxied === false &&
        r.ttl === 60 &&
        r.data?.flags === 0 &&
        r.data?.tag === 'issue' &&
        r.data?.value === expectedCaaValue
    );

    let chosenCaa;
    let chosenIndex;
    if (perfectCaaIndex !== -1) {
      chosenCaa = caaRecords[perfectCaaIndex];
      chosenIndex = perfectCaaIndex;
    } else {
      chosenCaa = caaRecords[0];
      chosenIndex = 0;
      patches.push({
        id: chosenCaa.id,
        type: 'CAA',
        name: hostname,
        proxied: false,
        ttl: 60,
        data: { flags: 0, tag: 'issue', value: expectedCaaValue },
      });
    }

    for (let i = 0; i < caaRecords.length; i++) {
      if (i !== chosenIndex) {
        deletes.push({ id: caaRecords[i].id });
      }
    }
  } else {
    posts.push({
      type: 'CAA',
      name: hostname,
      proxied: false,
      ttl: 60,
      data: { flags: 0, tag: 'issue', value: expectedCaaValue },
    });
  }

  // Handle A records
  const matchedAddressSet = new Set();
  for (const rec of aRecords) {
    if (
      rec.name === hostname &&
      rec.proxied === false &&
      rec.ttl === 60 &&
      targetAddresses.includes(rec.content) &&
      !matchedAddressSet.has(rec.content)
    ) {
      matchedAddressSet.add(rec.content);
    } else {
      deletes.push({ id: rec.id });
    }
  }

  for (const addr of targetAddresses) {
    if (!matchedAddressSet.has(addr)) {
      posts.push({
        type: 'A',
        name: hostname,
        content: addr,
        proxied: false,
        ttl: 60,
      });
    }
  }

  // Handle other record types (CNAME, AAAA, TXT, etc.)
  for (const rec of otherRecords) {
    deletes.push({ id: rec.id });
  }

  // Post A records before a new CAA: a CAA alone at the label stops the zone's
  // wildcard from answering A there, and batch changes reach the edge one
  // record at a time.
  posts.sort((a, b) => (a.type === 'A' ? 0 : 1) - (b.type === 'A' ? 0 : 1));

  return { deletes, patches, posts };
}
