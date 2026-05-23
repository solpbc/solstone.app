import { decryptEmail, encryptEmail } from './crypto.js';
import {
  claimAbandonedProvisioningPlaceholder,
  deleteProvisioningPlaceholder,
  findActiveProvisionedKey,
  insertProvisioningPlaceholder,
  touchProvisionedKeyLastUsed,
  updateProvisionedKeyMaterial,
} from './db.js';
import {
  gcpCreateApiKey,
  gcpDeleteKey,
  gcpFetchKeyString,
  gcpFindKeyByDisplayName,
  gcpPollOperation,
} from './gcp.js';

const PROVIDER = 'gemini';
const IN_FLIGHT_RECLAIM_MS = 120_000;
const WAIT_ATTEMPTS = 15;
const WAIT_MS = 2_000;
const DISPLAY_NAME_RE = /^[a-z0-9-]{1,63}$/;
const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';
const encoder = new TextEncoder();

export class ProvisioningBusyError extends Error {}
export class ProvisioningDisplayNameError extends Error {}

export async function ensureProvisionedKey({ env, accountId }) {
  const displayName = computeDisplayName(accountId);

  for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt++) {
    const nowMs = Date.now();
    const row = await findActiveProvisionedKey(env.DB, { accountId, provider: PROVIDER });
    if (!row) {
      const id = crypto.randomUUID();
      try {
        await insertProvisioningPlaceholder(env.DB, { id, accountId, provider: PROVIDER, displayName, nowMs });
        return provisionWithLock({ env, id, displayName });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    } else if (row.key_string_encrypted) {
      const keyString = await decryptEmail(row.key_string_encrypted, env);
      await touchProvisionedKeyLastUsed(env.DB, { id: row.id, nowMs });
      return keyString;
    } else if (row.created_at < nowMs - IN_FLIGHT_RECLAIM_MS) {
      const claimed = await claimAbandonedProvisioningPlaceholder(env.DB, {
        id: row.id,
        accountId,
        provider: PROVIDER,
        nowMs,
        abandonedBeforeMs: nowMs - IN_FLIGHT_RECLAIM_MS,
      });
      if (claimed) return provisionWithLock({ env, id: row.id, displayName: row.display_name || displayName });
    }

    if (attempt === WAIT_ATTEMPTS - 1) break;
    await sleep(WAIT_MS);
  }

  throw new ProvisioningBusyError('provisioning in flight');
}

export function computeDisplayName(accountId) {
  const encoded = base32Encode(encoder.encode(String(accountId))).slice(0, 31).padEnd(31, 'a');
  const displayName = `acct-${encoded}`;
  if (!DISPLAY_NAME_RE.test(displayName)) {
    throw new ProvisioningDisplayNameError('invalid provisioning displayName');
  }
  return displayName;
}

async function provisionWithLock({ env, id, displayName }) {
  let createdKeyName = null;
  let materialStored = false;
  try {
    const adopted = await gcpFindKeyByDisplayName({ env, displayName });
    let keyName = adopted?.name || null;
    if (!keyName) {
      keyName = await createAndPollKey({ env, displayName });
      createdKeyName = keyName;
    }
    const keyString = await gcpFetchKeyString({ env, keyName });
    const keyStringEncrypted = await encryptEmail(keyString, env);
    await updateProvisionedKeyMaterial(env.DB, {
      id,
      keyResourceName: keyName,
      keyStringEncrypted,
      nowMs: Date.now(),
    });
    materialStored = true;
    return keyString;
  } catch (error) {
    if (createdKeyName && !materialStored) {
      await gcpDeleteKey({ env, keyName: createdKeyName })
        .catch(() => console.error('gcp_orphan_key', { keyResourceName: createdKeyName }));
    }
    await deleteProvisioningPlaceholder(env.DB, { id });
    throw error;
  }
}

async function createAndPollKey({ env, displayName }) {
  const operationName = await gcpCreateApiKey({
    env,
    displayName,
    requestId: crypto.randomUUID(),
  });
  return gcpPollOperation({ env, opName: operationName });
}

function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isUniqueViolation(error) {
  return typeof error?.message === 'string' && error.message.includes('UNIQUE constraint failed');
}
