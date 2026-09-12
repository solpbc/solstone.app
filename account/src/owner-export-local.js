import { decryptEmail } from './crypto.js';
import { OWNER_DATA_INVENTORY } from './owner-data-inventory.js';
import { passkeyLabel, truncateIp, uaLabel } from './settings.js';

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const OWNER_LOCAL_RECORD_LIMIT = 10_000;
export const OWNER_LOCAL_BYTE_LIMIT = 4 * 1024 * 1024;
export const OWNER_LOCAL_DEADLINE_MS = 10_000;

const SUPPORTED_TRANSFORMS = new Set([
  'identity',
  'epoch_ms_to_iso',
  'epoch_s_to_iso',
  'decrypt_email',
  'decrypt_truncate_ip',
  'ua_label',
  'passkey_label',
  'sqlite_boolean',
]);

// Columns a transform reads in addition to its own. They are selected for the
// transform's use only and never emitted; the denied-coordinate and
// denied-public-name checks still apply to what is emitted.
const TRANSFORM_EXTRA_INPUTS = {
  passkey_label: ['aaguid'],
};

const ALLOWED_TRANSFORM_SOURCES = {
  'account_emails.address_encrypted': {
    transform: 'decrypt_email',
    disallowedPublicNames: new Set(['address_encrypted']),
  },
  'sessions.last_ip_encrypted': {
    transform: 'decrypt_truncate_ip',
    disallowedPublicNames: new Set(['last_ip_encrypted', 'ip_encrypted', 'network_address_encrypted']),
  },
  'sessions.last_user_agent': {
    transform: 'ua_label',
    disallowedPublicNames: new Set(['last_user_agent', 'user_agent', 'raw_user_agent']),
  },
};

const DENIED_COORDINATES = new Set([
  // accounts
  'accounts.passkey_user_handle',
  // account_emails
  'account_emails.address_encrypted',
  'account_emails.address_lower_hash',
  'account_emails.verification_code_hash',
  // sessions
  'sessions.id_hash',
  'sessions.last_ip_encrypted',
  'sessions.last_user_agent',
  // passkey_credentials
  'passkey_credentials.credential_id',
  'passkey_credentials.public_key',
  'passkey_credentials.counter',
  'passkey_credentials.aaguid',
  'passkey_credentials.transports',
  // account_devices
  'account_devices.push_token',
  'account_devices.push_token_env',
  'account_devices.device_pubkey',
  'account_devices.device_pubkey_alg',
  // scout_lifecycle_events
  'scout_lifecycle_events.actor_principal',
  // spb / spp
  'spb_mint_audit.prefix',
  'spb_sweep_audit.prefix',
  'spb_bindings.token_hash',
  'spp_bindings.token_hash',
  'spb_retired_tokens.token_hash',
  // transient / auth / proofs
  'otp_tokens.code_hash',
  'otp_tokens.email_lower_hash',
  'passkey_challenges.challenge',
  'account_dispatch_tokens.token_hash',
  'service_handoffs.handoff_hash',
  'service_handoffs.payload_encrypted',
  'enable_scout_codes.code_hash',
  'enable_scout_codes.nonce_hash',
  'enable_scout_codes.ip_hash',
  'account_deletion_proofs.token_hash',
  'account_deletion_proofs.session_id_hash',
  'account_deletion_proofs.otp_code_hash',
  'account_deletion_proofs.passkey_challenge',
  'spb_mint_reservations.token_hash',
  'spb_mint_reservations.reservation_token_hash',
]);

const DENIED_PUBLIC_NAMES = new Set([
  'passkey_user_handle',
  'address_encrypted',
  'address_lower_hash',
  'verification_code_hash',
  'id_hash',
  'last_ip_encrypted',
  'last_user_agent',
  'credential_id',
  'public_key',
  'counter',
  'aaguid',
  'transports',
  'push_token',
  'push_token_env',
  'device_pubkey',
  'device_pubkey_alg',
  'actor_principal',
  'prefix',
  'token_hash',
  'code_hash',
  'email_lower_hash',
  'challenge',
  'handoff_hash',
  'payload_encrypted',
  'nonce_hash',
  'ip_hash',
  'session_id_hash',
  'otp_code_hash',
  'passkey_challenge',
  'ca_fp',
]);

export async function collectOwnerLocalExport({
  db,
  env,
  accountId,
  inventory = OWNER_DATA_INVENTORY,
  clock = Date.now,
}) {
  if (!db || !env || typeof accountId !== 'string' || !accountId) {
    return { ok: false, error: 'invalid_identifier' };
  }

  const exportableClasses = (inventory || []).filter(
    (entry) => entry && entry.exportTreatment === 'exportable'
  );

  // 1. Pre-query validation: transforms, identifiers, deny coordinates
  for (const tableEntry of exportableClasses) {
    if (!IDENTIFIER_RE.test(tableEntry.name)) {
      return { ok: false, error: 'invalid_identifier' };
    }

    const exportedColumns = (tableEntry.columns || []).filter(
      (col) => col && col.treatment === 'exported'
    );

    for (const column of exportedColumns) {
      if (!IDENTIFIER_RE.test(column.name) || !IDENTIFIER_RE.test(column.publicName)) {
        return { ok: false, error: 'invalid_identifier' };
      }

      if (!column.transform || !SUPPORTED_TRANSFORMS.has(column.transform)) {
        return { ok: false, error: 'unsupported_transform' };
      }

      const coordinate = `${tableEntry.name}.${column.name}`;
      const allowedException = ALLOWED_TRANSFORM_SOURCES[coordinate];

      if (DENIED_PUBLIC_NAMES.has(column.publicName)) {
        return { ok: false, error: 'deny_coordinate' };
      }

      if (DENIED_COORDINATES.has(coordinate)) {
        if (!allowedException) {
          return { ok: false, error: 'deny_coordinate' };
        }
        if (
          column.transform !== allowedException.transform ||
          allowedException.disallowedPublicNames.has(column.publicName)
        ) {
          return { ok: false, error: 'deny_coordinate' };
        }
      }
    }
  }

  // 2. Query execution and transforms per exportable class
  const classes = [];
  let totalRecordCount = 0;
  let totalBytes = 0;
  const startedAt = clock();
  const encoder = new TextEncoder();

  for (const tableEntry of exportableClasses) {
    if (clock() - startedAt > OWNER_LOCAL_DEADLINE_MS) return { ok: false, error: 'resource_limit' };
    const exportedColumns = (tableEntry.columns || []).filter(
      (col) => col && col.treatment === 'exported'
    );

    const extraInputs = [...new Set(exportedColumns.flatMap((col) => TRANSFORM_EXTRA_INPUTS[col.transform] || []))]
      .filter((name) => !exportedColumns.some((col) => col.name === name));
    if (extraInputs.some((name) => !IDENTIFIER_RE.test(name))) {
      return { ok: false, error: 'invalid_identifier' };
    }
    const selectColumns = [...exportedColumns.map((col) => col.name), ...extraInputs].map((name) => `"${name}"`).join(', ');
    const idColumn = tableEntry.association === 'account_primary_key' ? '"id"' : '"account_id"';
    const remainingRecords = OWNER_LOCAL_RECORD_LIMIT - totalRecordCount;
    if (remainingRecords <= 0) return { ok: false, error: 'resource_limit' };
    const sql = `SELECT ${selectColumns} FROM "${tableEntry.name}" WHERE ${idColumn} = ? ORDER BY rowid ASC LIMIT ?`;

    let rows;
    try {
      const queryResult = await db.prepare(sql).bind(accountId, remainingRecords + 1).all();
      rows = queryResult?.results || [];
    } catch {
      return { ok: false, error: 'query_failed' };
    }
    if (rows.length > remainingRecords) return { ok: false, error: 'resource_limit' };

    const records = [];
    for (const row of rows) {
      if (clock() - startedAt > OWNER_LOCAL_DEADLINE_MS) return { ok: false, error: 'resource_limit' };
      const record = {};
      for (const column of exportedColumns) {
        const rawValue = row[column.name];
        let transformedValue;

        switch (column.transform) {
          case 'identity':
            transformedValue = rawValue;
            break;
          case 'epoch_ms_to_iso':
            if (rawValue == null) {
              transformedValue = null;
            } else if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
              transformedValue = new Date(rawValue).toISOString();
            } else {
              return { ok: false, error: 'transform_failed' };
            }
            break;
          case 'epoch_s_to_iso':
            if (rawValue == null) {
              transformedValue = null;
            } else if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
              transformedValue = new Date(rawValue * 1000).toISOString();
            } else {
              return { ok: false, error: 'transform_failed' };
            }
            break;
          case 'decrypt_email':
            if (rawValue == null) {
              transformedValue = null;
            } else if (typeof rawValue === 'string') {
              try {
                transformedValue = await decryptEmail(rawValue, env);
              } catch {
                return { ok: false, error: 'decrypt_failed' };
              }
            } else {
              return { ok: false, error: 'decrypt_failed' };
            }
            break;
          case 'decrypt_truncate_ip':
            if (rawValue == null) {
              transformedValue = null;
            } else if (typeof rawValue === 'string') {
              try {
                const decryptedIp = await decryptEmail(rawValue, env);
                transformedValue = truncateIp(decryptedIp);
              } catch {
                return { ok: false, error: 'decrypt_failed' };
              }
            } else {
              return { ok: false, error: 'decrypt_failed' };
            }
            break;
          case 'ua_label':
            transformedValue = uaLabel(rawValue);
            break;
          case 'passkey_label':
            transformedValue = passkeyLabel(rawValue, row.aaguid);
            break;
          case 'sqlite_boolean':
            if (rawValue == null) {
              transformedValue = null;
            } else if (rawValue === 1 || rawValue === true) {
              transformedValue = true;
            } else if (rawValue === 0 || rawValue === false) {
              transformedValue = false;
            } else {
              return { ok: false, error: 'transform_failed' };
            }
            break;
          default:
            return { ok: false, error: 'unsupported_transform' };
        }

        if (DENIED_PUBLIC_NAMES.has(column.publicName)) {
          return { ok: false, error: 'deny_coordinate' };
        }

        record[column.publicName] = transformedValue;
      }
      records.push(record);
      totalBytes += encoder.encode(JSON.stringify(record)).byteLength;
      if (totalBytes > OWNER_LOCAL_BYTE_LIMIT) return { ok: false, error: 'resource_limit' };
    }

    const fields = {};
    for (const column of exportedColumns) {
      fields[column.publicName] = {
        transform: column.transform,
        semantics: column.semantics,
      };
    }

    classes.push({
      name: tableEntry.name,
      description: tableEntry.description,
      fields,
      records,
    });

    totalRecordCount += records.length;
  }

  return {
    ok: true,
    classes,
    completeness: {
      complete: true,
      class_count: classes.length,
      record_count: totalRecordCount,
    },
  };
}
