import {
  createAccountWithEmail,
  findActiveProvisionedKey,
  findEmailByHash,
  getPasskeyCredential,
  getPasskeyUserHandle,
  insertPasskeyCredential,
  setPasskeyUserHandleIfMissing,
  upsertScoutApplicationMigrated,
} from './db.js';
import { encryptEmail, hashWithPepper } from './crypto.js';
import { b64uDecode } from './passkey.js';
import { ensureProvisionedKey } from './provisioning.js';
import { isValidEmail } from './index.js';

const STATUS_MAP = {
  approved: 'approved',
  applied: 'pending',
  revoked: 'revoked',
};

export async function importScoutRecords({ env, records, dryRun }) {
  const nowMs = Date.now();
  const results = [];

  for (const rec of records) {
    let email = null;
    try {
      email = typeof rec?.email === 'string' ? rec.email.trim() : '';
      if (!email) {
        results.push({ email: email || null, skipped: 'missing email' });
        continue;
      }
      if (!isValidEmail(email)) {
        results.push({ email, skipped: 'invalid email' });
        continue;
      }

      const mapped = STATUS_MAP[rec?.status];
      if (!mapped) {
        results.push({ email, skipped: `unknown status: ${rec?.status ?? 'null'}` });
        continue;
      }

      const warnings = [];
      const appliedAt = coerceFieldMs(rec?.applied_at, 'applied_at', warnings);
      const approvedAt = coerceFieldMs(rec?.approved_at, 'approved_at', warnings);
      const revokedAt = coerceFieldMs(rec?.revoked_at, 'revoked_at', warnings);
      const acked = rec?.data_acknowledged === true || rec?.data_acknowledged === 1;
      const dataAckedAt = acked ? (approvedAt ?? nowMs) : null;
      const emailLower = email.toLowerCase();
      const addressLowerHash = await hashWithPepper(emailLower, env);
      const existing = await findEmailByHash(env.DB, addressLowerHash);
      const wouldMintKey = mapped === 'approved' && acked;

      if (dryRun) {
        const keyReason = wouldMintKey ? null : keySkipReason(mapped, acked);
        const passkeys = await migrateRecordPasskeys({
          db: env.DB,
          accountId: existing ? existing.account_id : null,
          rec,
          nowMs,
          dryRun: true,
        });
        results.push({
          email,
          account: existing ? 'matched' : 'would-create',
          account_id: existing ? existing.account_id : null,
          status: mapped,
          key: wouldMintKey ? 'would-mint' : 'skipped',
          ...(keyReason ? { key_reason: keyReason } : {}),
          ...(warnings.length ? { warnings } : {}),
          ...(passkeys ? { passkeys } : {}),
        });
        continue;
      }

      let accountId;
      let action;
      if (existing) {
        accountId = existing.account_id;
        action = 'matched';
      } else {
        const addressEncrypted = await encryptEmail(emailLower, env);
        const created = await createAccountWithEmail(env.DB, {
          addressEncrypted,
          addressLowerHash,
          nowMs,
        });
        accountId = created.accountId;
        action = 'created';
      }

      await upsertScoutApplicationMigrated(env.DB, {
        accountId,
        status: mapped,
        useCase: rec?.use_case ?? null,
        dataAckedAt,
        appliedAt,
        approvedAt,
        revokedAt,
        nowMs,
      });

      let key;
      let keyReason = null;
      if (!wouldMintKey) {
        key = 'skipped';
        keyReason = keySkipReason(mapped, acked);
      } else {
        try {
          const had = await findActiveProvisionedKey(env.DB, { accountId, provider: 'gemini' });
          const hadKey = !!(had && had.key_string_encrypted);
          await ensureProvisionedKey({ env, accountId });
          key = hadKey ? 'exists' : 'minted';
        } catch (err) {
          key = 'error';
          keyReason = String(err?.message || err);
        }
      }

      const passkeys = await migrateRecordPasskeys({
        db: env.DB,
        accountId,
        rec,
        nowMs,
        dryRun: false,
      });
      results.push({
        email,
        account: action,
        account_id: accountId,
        status: mapped,
        key,
        ...(keyReason ? { key_reason: keyReason } : {}),
        ...(warnings.length ? { warnings } : {}),
        ...(passkeys ? { passkeys } : {}),
      });
    } catch (err) {
      results.push({ email, error: String(err?.message || err) });
    }
  }

  return { dry_run: dryRun, results };
}

function coerceFieldMs(value, field, warnings) {
  const coerced = coerceMs(value);
  if (value != null && coerced == null) warnings.push(field);
  return coerced;
}

function coerceMs(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

async function migrateRecordPasskeys({ db, accountId, rec, nowMs, dryRun }) {
  const passkeys = Array.isArray(rec?.passkeys) ? rec.passkeys : [];
  if (passkeys.length === 0) return null;

  const skipped = [];
  const countKey = dryRun ? 'would_migrate' : 'migrated';

  let handleSkipReason = null;
  if (accountId) {
    const current = await getPasskeyUserHandle(db, accountId);
    if (current == null) {
      if (!dryRun) {
        try {
          await setPasskeyUserHandleIfMissing(db, accountId, rec?.passkey_user_handle);
        } catch {
          handleSkipReason = 'handle collision';
        }
      }
    } else if (current !== rec?.passkey_user_handle) {
      handleSkipReason = 'handle conflict';
    }
  }

  if (handleSkipReason) {
    for (const pk of passkeys) {
      skipped.push({ credential_id: pk?.credential_id ?? null, reason: handleSkipReason });
    }
    return { [countKey]: 0, ...(skipped.length ? { skipped } : {}) };
  }

  let count = 0;
  for (const pk of passkeys) {
    const credentialId = pk?.credential_id ?? null;
    if (accountId) {
      const existing = await getPasskeyCredential(db, credentialId);
      if (existing) {
        if (existing.account_id === accountId) {
          count += 1;
          continue;
        }
        skipped.push({ credential_id: credentialId, reason: 'owned by another account' });
        continue;
      }
    }

    let publicKey;
    try {
      if (typeof pk?.public_key !== 'string' || pk.public_key.length === 0) throw new Error('empty');
      publicKey = b64uDecode(pk.public_key);
      if (!publicKey || publicKey.length === 0) throw new Error('empty');
    } catch {
      skipped.push({ credential_id: credentialId, reason: 'public_key decode failed' });
      continue;
    }

    if (dryRun) {
      count += 1;
      continue;
    }

    try {
      await insertPasskeyCredential(db, {
        credentialId,
        accountId,
        publicKey,
        counter: pk?.counter ?? 0,
        aaguid: pk?.aaguid ?? null,
        transports: pk?.transports ?? null,
        backupEligible: pk?.backup_eligible,
        backupState: pk?.backup_state,
        deviceType: null,
        friendlyName: pk?.friendly_name ?? null,
        createdAt: coerceMs(pk?.created_at) ?? nowMs,
      });
      count += 1;
    } catch {
      skipped.push({ credential_id: credentialId, reason: 'insert failed' });
    }
  }

  return { [countKey]: count, ...(skipped.length ? { skipped } : {}) };
}

function keySkipReason(mapped, acked) {
  return mapped !== 'approved' ? 'not approved' : 'data not acknowledged';
}
