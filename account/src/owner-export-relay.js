export const RELAY_EXPORT_MAX_IN_FLIGHT = 8;
export const RELAY_EXPORT_DEADLINE_MS = 10_000;
export const RELAY_BODY_BYTE_LIMIT = 8192;

const INSTANCE_ID_RE = /^[0-9a-fA-F-]{10,64}$/;
const CA_FP_RE = /^sha256:[0-9a-f]{64}$/;
const EXPECTED_RELAY_KEYS = [
  'instance_id',
  'ca_fp',
  'created_at',
  'rotated_at',
  'revoked_at',
  'entitled_until',
  'entitled',
];

const defaultClock = {
  now: () => Date.now(),
  abortAfter(ms, controller) {
    return setTimeout(() => controller.abort(), ms);
  },
};

export function relayExpectedInstanceIds(splInstanceIds = [], sppInstanceIds = []) {
  return [...new Set([...(splInstanceIds || []), ...(sppInstanceIds || [])])].sort();
}

function readJsonString(text, startIndex) {
  let index = startIndex + 1;
  let escape = false;
  while (index < text.length) {
    const c = text[index];
    if (escape) {
      escape = false;
    } else if (c === '\\') {
      escape = true;
    } else if (c === '"') {
      return { raw: text.slice(startIndex + 1, index), endIndex: index };
    }
    index++;
  }
  return null;
}

export function detectDuplicateTopLevelJsonMembers(text) {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return false;

  const seenKeys = new Set();
  let index = 0;
  const len = trimmed.length;

  while (index < len && trimmed[index] !== '{') index++;
  if (index >= len) return false;
  index++; // skip '{'

  let depth = 1;

  while (index < len && depth > 0) {
    const char = trimmed[index];

    if (depth === 1) {
      if (/\s/.test(char) || char === ',') {
        index++;
        continue;
      }
      if (char === '}') {
        depth = 0;
        break;
      }
      if (char === '"') {
        // Read top-level key
        const keyRes = readJsonString(trimmed, index);
        if (!keyRes) return false;
        let parsedKey;
        try {
          parsedKey = JSON.parse(`"${keyRes.raw}"`);
        } catch {
          return false;
        }
        index = keyRes.endIndex + 1;

        // Skip whitespace to ':'
        while (index < len && /\s/.test(trimmed[index])) index++;
        if (index >= len || trimmed[index] !== ':') return false;

        if (seenKeys.has(parsedKey)) {
          return true; // Duplicate top-level member detected!
        }
        seenKeys.add(parsedKey);
        index++; // Skip ':'

        // Skip whitespace after ':'
        while (index < len && /\s/.test(trimmed[index])) index++;
        if (index >= len) return false;

        // Skip one JSON value
        const valChar = trimmed[index];
        if (valChar === '"') {
          const valRes = readJsonString(trimmed, index);
          if (!valRes) return false;
          index = valRes.endIndex + 1;
          continue;
        } else if (valChar === '{' || valChar === '[') {
          depth = 2;
          index++;
          continue;
        } else {
          // Primitive: number / boolean / null
          while (index < len && trimmed[index] !== ',' && trimmed[index] !== '}' && !/\s/.test(trimmed[index])) {
            index++;
          }
          continue;
        }
      }
      index++;
      continue;
    }

    // depth >= 2
    if (char === '"') {
      const innerRes = readJsonString(trimmed, index);
      if (!innerRes) return false;
      index = innerRes.endIndex + 1;
      continue;
    } else if (char === '{' || char === '[') {
      depth++;
      index++;
      continue;
    } else if (char === '}' || char === ']') {
      depth--;
      index++;
      continue;
    }

    index++;
  }

  return false;
}

export async function collectOwnerRelayExport({
  env,
  instanceIds = [],
  clock = defaultClock,
}) {
  const sortedIds = [...(instanceIds || [])].sort();
  if (sortedIds.length === 0) {
    return { complete: true, instances: [], accounting: [] };
  }

  if (!env?.RELAY || !env?.RELAY_GRANT_SECRET) {
    const accounting = sortedIds.map((id) => ({
      instance_id: id,
      reason: 'unconfigured',
    }));
    return { complete: false, instances: [], accounting };
  }

  const startedAt = clock.now();
  const deadlineAt = startedAt + RELAY_EXPORT_DEADLINE_MS;
  const abortController = new AbortController();
  const timer = clock.abortAfter ? clock.abortAfter(RELAY_EXPORT_DEADLINE_MS, abortController) : null;

  const instancesMap = new Map();
  const accountingMap = new Map();

  let queueIndex = 0;

  async function worker() {
    while (queueIndex < sortedIds.length) {
      const currentIndex = queueIndex++;
      const id = sortedIds[currentIndex];

      if (clock.now() >= deadlineAt || abortController.signal.aborted) {
        accountingMap.set(id, { instance_id: id, reason: 'deadline' });
        continue;
      }

      try {
        const result = await fetchSingleInstance({
          env,
          id,
          abortSignal: abortController.signal,
        });

        if (result.ok) {
          instancesMap.set(id, result.instance);
        } else {
          accountingMap.set(id, { instance_id: id, reason: result.reason });
        }
      } catch (err) {
        if (abortController.signal.aborted || err?.name === 'AbortError') {
          accountingMap.set(id, { instance_id: id, reason: 'deadline' });
        } else {
          accountingMap.set(id, { instance_id: id, reason: 'throw' });
        }
      }
    }
  }

  const workerCount = Math.min(RELAY_EXPORT_MAX_IN_FLIGHT, sortedIds.length);
  const workers = Array.from({ length: workerCount }, () => worker());

  try {
    await Promise.all(workers);
  } finally {
    if (timer && typeof timer === 'number') {
      clearTimeout(timer);
    }
  }

  const instances = [];
  const accounting = [];

  for (const id of sortedIds) {
    if (instancesMap.has(id)) {
      instances.push(instancesMap.get(id));
    } else if (accountingMap.has(id)) {
      accounting.push(accountingMap.get(id));
    } else {
      accounting.push({ instance_id: id, reason: 'deadline' });
    }
  }

  return {
    complete: accounting.length === 0,
    instances,
    accounting,
  };
}

async function fetchSingleInstance({ env, id, abortSignal }) {
  const url = `https://spl-relay.internal/admin/instances/${encodeURIComponent(id)}`;
  let response;

  try {
    response = await env.RELAY.fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${env.RELAY_GRANT_SECRET}`,
      },
      redirect: 'manual',
      signal: abortSignal,
    });
  } catch (err) {
    if (abortSignal?.aborted || err?.name === 'AbortError') {
      return { ok: false, reason: 'deadline' };
    }
    return { ok: false, reason: 'throw' };
  }

  if (response.status >= 300 && response.status < 400) {
    return { ok: false, reason: 'redirect' };
  }

  if (response.status !== 200) {
    return { ok: false, reason: `http_${response.status}` };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return { ok: false, reason: 'malformed_body' };
  }

  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > RELAY_BODY_BYTE_LIMIT) {
          try {
            await reader.cancel();
          } catch {
            // ignore cancel errors
          }
          return { ok: false, reason: 'oversize' };
        }
        chunks.push(value);
      }
    }
  } catch (err) {
    if (abortSignal?.aborted || err?.name === 'AbortError') {
      return { ok: false, reason: 'deadline' };
    }
    return { ok: false, reason: 'throw' };
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder().decode(combined);

  if (detectDuplicateTopLevelJsonMembers(text)) {
    return { ok: false, reason: 'duplicate_member' };
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'malformed_body' };
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, reason: 'invalid_envelope' };
  }

  const keys = Object.keys(body).sort();
  if (keys.length !== EXPECTED_RELAY_KEYS.length) {
    return { ok: false, reason: 'invalid_envelope' };
  }
  const expectedSorted = [...EXPECTED_RELAY_KEYS].sort();
  for (let i = 0; i < expectedSorted.length; i++) {
    if (keys[i] !== expectedSorted[i]) {
      return { ok: false, reason: 'invalid_envelope' };
    }
  }

  if (typeof body.instance_id !== 'string' || !INSTANCE_ID_RE.test(body.instance_id)) {
    return { ok: false, reason: 'invalid_envelope' };
  }

  if (body.instance_id !== id) {
    return { ok: false, reason: 'mismatch' };
  }

  if (typeof body.ca_fp !== 'string' || !CA_FP_RE.test(body.ca_fp)) {
    return { ok: false, reason: 'invalid_envelope' };
  }

  if (typeof body.created_at !== 'number' || !Number.isSafeInteger(body.created_at) || body.created_at < 0) {
    return { ok: false, reason: 'invalid_envelope' };
  }

  for (const field of ['rotated_at', 'revoked_at', 'entitled_until']) {
    const val = body[field];
    if (val !== null && (typeof val !== 'number' || !Number.isSafeInteger(val) || val < 0)) {
      return { ok: false, reason: 'invalid_envelope' };
    }
  }

  if (typeof body.entitled !== 'boolean') {
    return { ok: false, reason: 'invalid_envelope' };
  }

  let instance;
  try {
    const toIso = (epochS) => {
      if (epochS == null) return null;
      const d = new Date(epochS * 1000);
      if (Number.isNaN(d.getTime())) throw new Error('invalid_date');
      return d.toISOString();
    };

    instance = {
      instance_id: body.instance_id,
      created_at: toIso(body.created_at),
      rotated_at: toIso(body.rotated_at),
      revoked_at: toIso(body.revoked_at),
      entitled_until: toIso(body.entitled_until),
      entitled: body.entitled,
    };
  } catch {
    return { ok: false, reason: 'invalid_envelope' };
  }

  return { ok: true, instance };
}
