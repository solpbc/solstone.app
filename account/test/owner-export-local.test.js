import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectOwnerLocalExport,
  OWNER_LOCAL_BYTE_LIMIT,
  OWNER_LOCAL_DEADLINE_MS,
  OWNER_LOCAL_RECORD_LIMIT,
} from '../src/owner-export-local.js';
import { OWNER_DATA_INVENTORY } from '../src/owner-data-inventory.js';
import { encryptEmail } from '../src/crypto.js';
import {
  createDeletionProof,
  upsertSppBinding,
} from '../src/db.js';
import {
  installConsoleSpy,
  makeTestEnv,
  recordingDb,
  resetDb,
  seedAccount,
  seedAccountEmail,
  seedEntitlement,
  seedScoutApplication,
  seedSession,
  seedSplBinding,
} from './helpers.js';

const NOW = 1_700_000_123_456;
const INSTANCE_OWNER = '11111111-1111-1111-1111-111111111111';
const INSTANCE_CONTROL = '22222222-2222-2222-2222-222222222222';

describe('owner local export collector (AC1–3)', () => {
  beforeEach(resetDb);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('Sentinels and absolute-deny invariants (AC1)', () => {
    it('exports all 16 classes with sentinels and strictly leaks zero sensitive or control values', async () => {
      const consoleSpy = installConsoleSpy();
      const env = makeTestEnv();

      const owner = await seedAccount({ email: 'owner-sentinel@example.com', nowMs: NOW, testEnv: env });
      const control = await seedAccount({ email: 'control-sentinel@example.com', nowMs: NOW, testEnv: env });

      const ownerSentinels = await seedAllWithSentinels(env, owner, 'owner', INSTANCE_OWNER);
      const controlSentinels = await seedAllWithSentinels(env, control, 'control', INSTANCE_CONTROL);

      const result = await collectOwnerLocalExport({
        db: workerEnv.DB,
        env,
        accountId: owner.accountId,
      });

      expect(result.ok).toBe(true);
      expect(result.completeness).toEqual({
        complete: true,
        class_count: 16,
        record_count: expect.any(Number),
      });

      const exportableNames = OWNER_DATA_INVENTORY
        .filter((entry) => entry.exportTreatment === 'exportable')
        .map((entry) => entry.name);
      expect(result.classes.map((c) => c.name)).toEqual(exportableNames);

      const resultJson = JSON.stringify(result);

      // Verify no sensitive sentinels appear in result or stringify
      for (const sentinel of Object.values(ownerSentinels.sensitive)) {
        expect(resultJson).not.toContain(sentinel);
      }

      // Verify no control account values appear (public or sensitive)
      for (const sentinel of Object.values(controlSentinels.all)) {
        expect(resultJson).not.toContain(sentinel);
      }
      expect(resultJson).not.toContain(control.accountId);
      expect(resultJson).not.toContain(INSTANCE_CONTROL);

      // Verify raw UA was normalized to 'unknown device'
      const sessionClass = result.classes.find((c) => c.name === 'sessions');
      expect(sessionClass.records[0].device).toBe('unknown device');

      // Verify no ca_fp, raw UA, full IP, or raw ciphertext leak
      expect(resultJson).not.toContain('ca_fp');
      expect(resultJson).not.toContain('203.0.113.77');
      expect(resultJson).not.toContain('2001:db8:1234:5678:9abc:def0:1111:2222');
      expect(resultJson).not.toContain('SensitiveRawUserAgent');

      // Assert no secret in console spy
      consoleSpy.assertNoSecrets([
        ...Object.values(ownerSentinels.sensitive),
        ...Object.values(controlSentinels.sensitive),
      ]);

      // Non-exportable classes (13 tables) absent from result
      const nonExportableNames = OWNER_DATA_INVENTORY
        .filter((entry) => entry.exportTreatment !== 'exportable')
        .map((entry) => entry.name);
      for (const nonExp of nonExportableNames) {
        expect(result.classes.some((c) => c.name === nonExp)).toBe(false);
      }
    });

    it('denies export for every denied coordinate when mutated into inventory with identity transform', async () => {
      const consoleSpy = installConsoleSpy();
      const env = makeTestEnv();
      const owner = await seedAccount({ email: 'deny-test@example.com', nowMs: NOW, testEnv: env });
      await seedAllWithSentinels(env, owner, 'owner-deny', INSTANCE_OWNER);

      const denyCoordinates = [
        { table: 'accounts', col: 'passkey_user_handle' },
        { table: 'account_emails', col: 'address_encrypted' },
        { table: 'account_emails', col: 'address_lower_hash' },
        { table: 'account_emails', col: 'verification_code_hash' },
        { table: 'sessions', col: 'id_hash' },
        { table: 'sessions', col: 'last_ip_encrypted' },
        { table: 'sessions', col: 'last_user_agent' },
        { table: 'passkey_credentials', col: 'credential_id' },
        { table: 'passkey_credentials', col: 'public_key' },
        { table: 'passkey_credentials', col: 'counter' },
        { table: 'passkey_credentials', col: 'aaguid' },
        { table: 'passkey_credentials', col: 'transports' },
        { table: 'account_devices', col: 'push_token' },
        { table: 'account_devices', col: 'push_token_env' },
        { table: 'account_devices', col: 'device_pubkey' },
        { table: 'account_devices', col: 'device_pubkey_alg' },
        { table: 'scout_lifecycle_events', col: 'actor_principal' },
        { table: 'spb_mint_audit', col: 'prefix' },
        { table: 'spb_sweep_audit', col: 'prefix' },
        { table: 'spb_bindings', col: 'token_hash' },
        { table: 'spp_bindings', col: 'token_hash' },
        { table: 'spb_retired_tokens', col: 'token_hash' },
        { table: 'otp_tokens', col: 'code_hash' },
        { table: 'otp_tokens', col: 'email_lower_hash' },
        { table: 'passkey_challenges', col: 'challenge' },
        { table: 'account_dispatch_tokens', col: 'token_hash' },
        { table: 'service_handoffs', col: 'handoff_hash' },
        { table: 'service_handoffs', col: 'payload_encrypted' },
        { table: 'enable_scout_codes', col: 'code_hash' },
        { table: 'enable_scout_codes', col: 'nonce_hash' },
        { table: 'enable_scout_codes', col: 'ip_hash' },
        { table: 'account_deletion_proofs', col: 'token_hash' },
        { table: 'account_deletion_proofs', col: 'session_id_hash' },
        { table: 'account_deletion_proofs', col: 'otp_code_hash' },
        { table: 'account_deletion_proofs', col: 'passkey_challenge' },
        { table: 'spb_mint_reservations', col: 'token_hash' },
        { table: 'spb_mint_reservations', col: 'reservation_token_hash' },
      ];

      for (const { table, col } of denyCoordinates) {
        const sentinelVal = `sentinel-val-${table}-${col}`;
        const mutatedInventory = structuredClone(OWNER_DATA_INVENTORY);
        const tableEntry = mutatedInventory.find((t) => t.name === table);
        if (tableEntry) {
          tableEntry.exportTreatment = 'exportable';
          if (!tableEntry.association) tableEntry.association = 'account_foreign_key';

          const existingCol = (tableEntry.columns || []).find((c) => c.name === col);
          if (existingCol) {
            existingCol.treatment = 'exported';
            existingCol.publicName = col;
            existingCol.transform = 'identity';
          } else {
            tableEntry.columns.push({
              name: col,
              publicName: col,
              treatment: 'exported',
              transform: 'identity',
              semantics: 'denied test',
            });
          }

          const result = await collectOwnerLocalExport({
            db: workerEnv.DB,
            env,
            accountId: owner.accountId,
            inventory: mutatedInventory,
          });

          expect(result).toEqual({ ok: false, error: 'deny_coordinate' });
          expect(JSON.stringify(result)).not.toContain(col);
          expect(JSON.stringify(result)).not.toContain(sentinelVal);
        }
      }

      consoleSpy.assertNoSecrets(denyCoordinates.map((c) => c.col));
    });

    it('allows mapped transform sources while ensuring raw source names stay out of public records', async () => {
      const env = makeTestEnv();
      const owner = await seedAccount({ email: 'mapped-src@example.com', nowMs: NOW, testEnv: env });
      await seedAllWithSentinels(env, owner, 'owner-mapped', INSTANCE_OWNER);

      const result = await collectOwnerLocalExport({
        db: workerEnv.DB,
        env,
        accountId: owner.accountId,
      });

      expect(result.ok).toBe(true);
      const emails = result.classes.find((c) => c.name === 'account_emails').records;
      expect(emails[0]).toHaveProperty('address');
      expect(emails[0]).not.toHaveProperty('address_encrypted');

      const sessions = result.classes.find((c) => c.name === 'sessions').records;
      expect(sessions[0]).toHaveProperty('network_address');
      expect(sessions[0]).not.toHaveProperty('last_ip_encrypted');
      expect(sessions[0]).toHaveProperty('device');
      expect(sessions[0]).not.toHaveProperty('last_user_agent');
    });
  });

  describe('passkey label derivation', () => {
    it('exports the label the page shows: the owner name, else the authenticator model, else "passkey", never the raw aaguid', async () => {
      const env = makeTestEnv();
      const owner = await seedAccount({ email: 'passkey-label@example.com', nowMs: NOW, testEnv: env });
      const rows = [
        ['sentinel-cred-q1x', 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd', 'my laptop'],
        ['sentinel-cred-q2x', 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd', null],
        ['sentinel-cred-q3x', '08987058-cadc-4b81-b6e1-30de50dcbe96', '   '],
        ['sentinel-cred-q4x', 'sensitive-aaguid-unmapped-0000', null],
        ['sentinel-cred-q5x', '00000000-0000-0000-0000-000000000000', null],
      ];
      for (const [credentialId, aaguid, friendlyName] of rows) {
        await workerEnv.DB.prepare(
          `INSERT INTO passkey_credentials (
             credential_id, account_id, public_key, counter, aaguid, transports, device_type, friendly_name, created_at
           ) VALUES (?, ?, ?, 0, ?, '[]', 'single_device', ?, ?)`
        ).bind(credentialId, owner.accountId, new Uint8Array([1]), aaguid, friendlyName, NOW).run();
      }
      const consoleSpy = installConsoleSpy();

      const result = await collectOwnerLocalExport({ db: workerEnv.DB, env, accountId: owner.accountId });

      expect(result.ok).toBe(true);
      const passkeys = result.classes.find((c) => c.name === 'passkey_credentials');
      expect(passkeys.records.map((record) => record.name)).toEqual([
        'my laptop', 'icloud keychain', 'windows hello', 'passkey', 'passkey',
      ]);
      expect(passkeys.fields.name).toEqual({
        transform: 'passkey_label',
        semantics: 'the name you gave this passkey, or its authenticator model when unnamed, or just passkey',
      });
      const serialized = JSON.stringify(result);
      for (const [credentialId, aaguid] of rows) {
        expect(serialized).not.toContain(aaguid);
        expect(serialized).not.toContain(credentialId);
      }
      expect(Object.keys(passkeys.records[0]).sort()).toEqual(['created_at', 'device_type', 'last_used_at', 'name', 'revoked_at']);
      consoleSpy.restore?.();
    });
  });

  describe('IP and UA transformations and pins', () => {
    it('pins IPv4, IPv6, malformed IP, and null stored IP transformations', async () => {
      const env = makeTestEnv();
      const owner = await seedAccount({ email: 'ip-pin@example.com', nowMs: NOW, testEnv: env });

      // Session 1: IPv4
      const ip4Enc = await encryptEmail('203.0.113.77', env);
      await seedSession(owner.accountId, { nowMs: NOW, testEnv: env });
      await workerEnv.DB.prepare(
        "UPDATE sessions SET last_ip_encrypted = ? WHERE account_id = ?"
      ).bind(ip4Enc, owner.accountId).run();

      // Session 2: IPv6
      const ip6Enc = await encryptEmail('2001:db8:1234:5678:9abc:def0:1111:2222', env);
      await seedSession(owner.accountId, { nowMs: NOW + 10, testEnv: env });
      await workerEnv.DB.prepare(
        "UPDATE sessions SET last_ip_encrypted = ? WHERE rowid = (SELECT MAX(rowid) FROM sessions)"
      ).bind(ip6Enc).run();

      // Session 3: malformed IP
      const malEnc = await encryptEmail('not-an-ip-string', env);
      await seedSession(owner.accountId, { nowMs: NOW + 20, testEnv: env });
      await workerEnv.DB.prepare(
        "UPDATE sessions SET last_ip_encrypted = ? WHERE rowid = (SELECT MAX(rowid) FROM sessions)"
      ).bind(malEnc).run();

      // Session 4: null IP
      await seedSession(owner.accountId, { nowMs: NOW + 30, testEnv: env });
      await workerEnv.DB.prepare(
        "UPDATE sessions SET last_ip_encrypted = NULL WHERE rowid = (SELECT MAX(rowid) FROM sessions)"
      ).run();

      const result = await collectOwnerLocalExport({
        db: workerEnv.DB,
        env,
        accountId: owner.accountId,
      });

      expect(result.ok).toBe(true);
      const sessions = result.classes.find((c) => c.name === 'sessions').records;
      const ips = sessions.map((s) => s.network_address);

      expect(ips).toContain('203.0.113.x');
      expect(ips).toContain('2001:db8:1234:5678::/64');
      expect(ips).toContain('—');
      expect(ips).toContain(null);
    });

    it('pins recognized browser/OS and normalizes unrecognized UA to unknown device without leaking raw UA', async () => {
      const env = makeTestEnv();
      const owner = await seedAccount({ email: 'ua-pin@example.com', nowMs: NOW, testEnv: env });

      // Session 1: Safari on macOS
      await seedSession(owner.accountId, { nowMs: NOW, testEnv: env });
      await workerEnv.DB.prepare(
        "UPDATE sessions SET last_user_agent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15' WHERE account_id = ?"
      ).bind(owner.accountId).run();

      // Session 2: Unknown custom UA
      const secretCustomUa = 'MyCustomInternalCrawler/1.0 (SecretCorporation)';
      await seedSession(owner.accountId, { nowMs: NOW + 10, testEnv: env });
      await workerEnv.DB.prepare(
        "UPDATE sessions SET last_user_agent = ? WHERE rowid = (SELECT MAX(rowid) FROM sessions)"
      ).bind(secretCustomUa).run();

      // Session 3: Impersonation marker
      const impersonationUa = 'impersonation by operator@solpbc.org';
      await seedSession(owner.accountId, { nowMs: NOW + 20, testEnv: env });
      await workerEnv.DB.prepare(
        "UPDATE sessions SET last_user_agent = ? WHERE rowid = (SELECT MAX(rowid) FROM sessions)"
      ).bind(impersonationUa).run();

      const result = await collectOwnerLocalExport({
        db: workerEnv.DB,
        env,
        accountId: owner.accountId,
      });

      expect(result.ok).toBe(true);
      const sessions = result.classes.find((c) => c.name === 'sessions').records;
      const uas = sessions.map((s) => s.device);

      expect(uas).toContain('safari on macos');
      expect(uas).toContain('unknown device');
      expect(uas).toContain('impersonation by operator@solpbc.org');

      // Verify raw secret UA never appears
      expect(JSON.stringify(result)).not.toContain(secretCustomUa);
    });
  });

  describe('Inventory-driven SQL and projection (AC2)', () => {
    it('derives exact SQL statements matching inventory exported source names with quotes and rowid sort', async () => {
      const env = makeTestEnv();
      const owner = await seedAccount({ email: 'sql-test@example.com', nowMs: NOW, testEnv: env });

      const statements = [];
      const db = recordingDb(workerEnv.DB, statements);

      const result = await collectOwnerLocalExport({
        db,
        env,
        accountId: owner.accountId,
      });

      expect(result.ok).toBe(true);

      const exportableEntries = OWNER_DATA_INVENTORY.filter((e) => e.exportTreatment === 'exportable');
      expect(statements).toHaveLength(exportableEntries.length);

      for (let i = 0; i < exportableEntries.length; i++) {
        const entry = exportableEntries[i];
        const stmtSql = statements[i];

        const idCol = entry.name === 'accounts' ? '"id"' : '"account_id"';
        const exportedCols = entry.columns.filter((c) => c.treatment === 'exported');
        // passkey_label reads aaguid as a non-emitted input; it is selected last.
        const extraInputs = exportedCols.some((c) => c.transform === 'passkey_label')
          && !exportedCols.some((c) => c.name === 'aaguid') ? ['aaguid'] : [];
        const cols = [...exportedCols.map((c) => c.name), ...extraInputs]
          .map((name) => `"${name}"`)
          .join(', ');

        const expectedSql = `SELECT ${cols} FROM "${entry.name}" WHERE ${idCol} = ? ORDER BY rowid ASC LIMIT ?`;
        expect(stmtSql).toBe(expectedSql);
      }
    });

    it('expands SQL SELECT and projected fields when inventory is mutated to add an exportable field', async () => {
      const env = makeTestEnv();
      const owner = await seedAccount({ email: 'expand-test@example.com', nowMs: NOW, testEnv: env });

      const mutatedInventory = structuredClone(OWNER_DATA_INVENTORY);
      const accountsTable = mutatedInventory.find((t) => t.name === 'accounts');
      accountsTable.columns.push({
        name: 'primary_email_id',
        publicName: 'primary_email_id',
        treatment: 'exported',
        transform: 'identity',
        semantics: 'added primary email id',
      });

      const statements = [];
      const db = recordingDb(workerEnv.DB, statements);

      const result = await collectOwnerLocalExport({
        db,
        env,
        accountId: owner.accountId,
        inventory: mutatedInventory,
      });

      expect(result.ok).toBe(true);
      expect(statements[0]).toContain('"primary_email_id"');

      const accountsClass = result.classes.find((c) => c.name === 'accounts');
      expect(accountsClass.records[0]).toHaveProperty('primary_email_id');
    });

    it('fails before prepare when transform is invalid without issuing queries', async () => {
      const env = makeTestEnv();
      const owner = await seedAccount({ email: 'fail-before-prep@example.com', nowMs: NOW, testEnv: env });

      const mutatedInventory = structuredClone(OWNER_DATA_INVENTORY);
      mutatedInventory[0].columns[0].transform = 'unsupported_transform_type';

      const statements = [];
      const db = recordingDb(workerEnv.DB, statements);

      const result = await collectOwnerLocalExport({
        db,
        env,
        accountId: owner.accountId,
        inventory: mutatedInventory,
      });

      expect(result).toEqual({ ok: false, error: 'unsupported_transform' });
      expect(statements).toHaveLength(0);
    });

    it('proves timestamp epoch units are not inferred by verifying swap of epoch_ms vs epoch_s', async () => {
      const env = makeTestEnv();
      const owner = await seedAccount({ email: 'epoch-swap@example.com', nowMs: NOW, testEnv: env });

      // Normal ms projection
      const normalResult = await collectOwnerLocalExport({
        db: workerEnv.DB,
        env,
        accountId: owner.accountId,
      });
      const normalAccounts = normalResult.classes.find((c) => c.name === 'accounts').records[0];
      expect(normalAccounts.created_at).toBe(new Date(NOW).toISOString());

      // Mutated: swap ms to s on accounts.created_at
      const mutatedInventory = structuredClone(OWNER_DATA_INVENTORY);
      const accountsTable = mutatedInventory.find((t) => t.name === 'accounts');
      accountsTable.columns.find((c) => c.name === 'created_at').transform = 'epoch_s_to_iso';

      const mutatedResult = await collectOwnerLocalExport({
        db: workerEnv.DB,
        env,
        accountId: owner.accountId,
        inventory: mutatedInventory,
      });

      const mutatedAccounts = mutatedResult.classes.find((c) => c.name === 'accounts').records[0];
      expect(mutatedAccounts.created_at).not.toBe(new Date(NOW).toISOString());
    });
  });

  describe('Fatal vs empty handling (AC3)', () => {
    it('fails closed when local rows exceed the record or encoded-byte ceilings', async () => {
      const inventory = [{
        name: 'synthetic_records',
        association: 'account_foreign_key',
        exportTreatment: 'exportable',
        description: 'synthetic records',
        columns: [{
          name: 'value',
          publicName: 'value',
          treatment: 'exported',
          transform: 'identity',
          semantics: 'synthetic value',
        }],
      }];
      const dbWithRows = (rows) => ({
        prepare() {
          return { bind() { return { all: async () => ({ results: rows }) }; } };
        },
      });

      const tooMany = Array.from({ length: OWNER_LOCAL_RECORD_LIMIT + 1 }, () => ({ value: 'x' }));
      await expect(collectOwnerLocalExport({
        db: dbWithRows(tooMany), env: {}, accountId: 'owner', inventory,
      })).resolves.toEqual({ ok: false, error: 'resource_limit' });

      await expect(collectOwnerLocalExport({
        db: dbWithRows([{ value: 'x'.repeat(OWNER_LOCAL_BYTE_LIMIT + 1) }]),
        env: {},
        accountId: 'owner',
        inventory,
      })).resolves.toEqual({ ok: false, error: 'resource_limit' });
    });

    it('fails closed when local collection crosses its wall-clock deadline', async () => {
      const times = [0, OWNER_LOCAL_DEADLINE_MS + 1];
      const result = await collectOwnerLocalExport({
        db: { prepare() { throw new Error('deadline must fire before query'); } },
        env: {},
        accountId: 'owner',
        inventory: OWNER_DATA_INVENTORY,
        clock: () => times.shift() ?? OWNER_LOCAL_DEADLINE_MS + 1,
      });

      expect(result).toEqual({ ok: false, error: 'resource_limit' });
    });

    it('returns fatal query_failed with no partial classes or leaked sentinels when any query throws', async () => {
      const consoleSpy = installConsoleSpy();
      const env = makeTestEnv();
      const owner = await seedAccount({ email: 'query-fail@example.com', nowMs: NOW, testEnv: env });
      const ownerSentinels = await seedAllWithSentinels(env, owner, 'owner-qfail', INSTANCE_OWNER);

      const exportableEntries = OWNER_DATA_INVENTORY.filter((e) => e.exportTreatment === 'exportable');

      for (const entry of exportableEntries) {
        // Wrap db so it throws only for this table
        const wrappedDb = {
          prepare(sql) {
            if (sql.includes(`"${entry.name}"`)) {
              return {
                bind() {
                  return {
                    all: async () => { throw new Error(`Simulated query failure on ${entry.name}`); },
                  };
                },
              };
            }
            return workerEnv.DB.prepare(sql);
          },
        };

        const result = await collectOwnerLocalExport({
          db: wrappedDb,
          env,
          accountId: owner.accountId,
        });

        expect(result).toEqual({ ok: false, error: 'query_failed' });
        expect(result).not.toHaveProperty('classes');
        expect(result).not.toHaveProperty('completeness');
      }

      consoleSpy.assertNoSecrets(Object.values(ownerSentinels.sensitive));
    });

    it.each([
      {
        description: 'account_emails.address_encrypted',
        corrupt: async (accountId) => {
          await workerEnv.DB.prepare(
            "UPDATE account_emails SET address_encrypted = 'not:valid:encrypted:payload' WHERE account_id = ?"
          ).bind(accountId).run();
        },
      },
      {
        description: 'sessions.last_ip_encrypted',
        corrupt: async (accountId) => {
          await workerEnv.DB.prepare(
            "UPDATE sessions SET last_ip_encrypted = 'not:valid:encrypted:payload' WHERE account_id = ?"
          ).bind(accountId).run();
        },
      },
    ])('returns fatal decrypt_failed when $description contains corrupted data', async ({ corrupt }) => {
      const env = makeTestEnv();
      const owner = await seedAccount({ email: 'decrypt-corrupt@example.com', nowMs: NOW, testEnv: env });
      await seedSession(owner.accountId, { nowMs: NOW, testEnv: env });
      await corrupt(owner.accountId);

      const result = await collectOwnerLocalExport({
        db: workerEnv.DB,
        env,
        accountId: owner.accountId,
      });

      expect(result).toEqual({ ok: false, error: 'decrypt_failed' });
      expect(result).not.toHaveProperty('classes');
      expect(result).not.toHaveProperty('completeness');
    });

    it('preserves empty class as ok true with empty records array and complete completeness', async () => {
      const env = makeTestEnv();
      const owner = await seedAccount({ email: 'empty-class@example.com', nowMs: NOW, testEnv: env });

      const result = await collectOwnerLocalExport({
        db: workerEnv.DB,
        env,
        accountId: owner.accountId,
      });

      expect(result.ok).toBe(true);
      expect(result.completeness.complete).toBe(true);

      const spbSweep = result.classes.find((c) => c.name === 'spb_sweep_audit');
      expect(spbSweep.records).toEqual([]);
    });
  });
});

async function seedAllWithSentinels(env, account, tag, instanceId) {
  const sensitiveSentinels = {
    passkeyUserHandle: `sensitive-handle-${tag}`,
    addressLowerHash: `sensitive-addr-hash-${tag}`,
    verificationCodeHash: `sensitive-verify-hash-${tag}`,
    rawUserAgent: `SensitiveRawUserAgent-${tag}`,
    credentialId: `sensitive-cred-id-${tag}`,
    publicKeyBlob: `sensitive-pub-key-${tag}`,
    aaguid: `sensitive-aaguid-${tag}`,
    transports: `sensitive-transports-${tag}`,
    pushToken: `sensitive-push-token-${tag}`,
    devicePubkey: `sensitive-device-pubkey-${tag}`,
    devicePubkeyAlg: `sensitive-device-alg-${tag}`,
    actorPrincipal: `sensitive-actor-principal-${tag}`,
    spbMintPrefix: `sensitive-mint-prefix-${tag}`,
    spbSweepPrefix: `sensitive-sweep-prefix-${tag}`,
    dispatchTokenHash: `sensitive-dispatch-hash-${tag}`,
    handoffHash: `sensitive-handoff-hash-${tag}`,
    handoffPayload: `sensitive-handoff-payload-${tag}`,
    enableCodeHash: `sensitive-enable-code-hash-${tag}`,
    enableNonceHash: `sensitive-enable-nonce-hash-${tag}`,
    enableIpHash: `sensitive-enable-ip-hash-${tag}`,
    spbRetiredTokenHash: `sensitive-retired-token-hash-${tag}`,
    spbBindingTokenHash: `sensitive-spb-token-hash-${tag}`,
    sppBindingTokenHash: `sensitive-spp-token-hash-${tag}`,
    reservationId: `sensitive-reservation-id-${tag}`,
    deletionProofTokenHash: `sensitive-proof-token-hash-${tag}`,
    deletionProofSessionHash: `sensitive-proof-session-hash-${tag}`,
    deletionProofOtpHash: `sensitive-proof-otp-hash-${tag}`,
    passkeyChallenge: `sensitive-challenge-${tag}`,
    otpCodeHash: `sensitive-otp-code-hash-${tag}`,
    otpEmailLowerHash: `sensitive-otp-email-lower-hash-${tag}`,
    rateBucketKey: `sensitive-rate-key-${tag}`,
    deletionOpId: `sensitive-del-op-${tag}`,
    deletionSnapshotEnc: `sensitive-snapshot-enc-${tag}`,
    deletionCompletionTokenHash: `sensitive-completion-token-hash-${tag}`,
    deletionServiceOpId: `sensitive-service-op-id-${tag}`,
  };

  const publicSentinels = {
    friendlyName: `friendly-key-${tag}`,
    emailAddress: `${tag}-secondary@example.com`,
    scoutUseCase: `${tag} use case`,
    mcpLabel: tag === 'owner' ? 'owneraaa' : 'controla',
    instanceId,
  };

  // 1. accounts
  await workerEnv.DB.prepare(
    'UPDATE accounts SET passkey_user_handle = ? WHERE id = ?'
  ).bind(sensitiveSentinels.passkeyUserHandle, account.accountId).run();

  // 2. account_emails
  await seedAccountEmail({
    accountId: account.accountId,
    address: publicSentinels.emailAddress,
    verifiedAt: NOW,
    testEnv: env,
  });
  await workerEnv.DB.prepare(
    'UPDATE account_emails SET address_lower_hash = ?, verification_code_hash = ? WHERE account_id = ? AND is_primary = 0'
  ).bind(sensitiveSentinels.addressLowerHash, sensitiveSentinels.verificationCodeHash, account.accountId).run();

  const emailCiphertexts = await workerEnv.DB.prepare(
    'SELECT address_encrypted FROM account_emails WHERE account_id = ?'
  ).bind(account.accountId).all();
  emailCiphertexts.results.forEach((row, i) => {
    sensitiveSentinels[`addressCiphertext_${i}`] = row.address_encrypted;
  });

  // 3. sessions
  const encryptedIp = await encryptEmail('198.51.100.42', env);
  sensitiveSentinels.lastIpEncrypted = encryptedIp;
  await seedSession(account.accountId, { nowMs: NOW, testEnv: env });
  const sessionRow = await workerEnv.DB.prepare('SELECT id_hash FROM sessions WHERE account_id = ?').bind(account.accountId).first();
  sensitiveSentinels.sessionIdHash = sessionRow.id_hash;
  await workerEnv.DB.prepare(
    'UPDATE sessions SET last_ip_encrypted = ?, last_user_agent = ? WHERE account_id = ?'
  ).bind(encryptedIp, sensitiveSentinels.rawUserAgent, account.accountId).run();

  // 4. passkey_credentials
  await workerEnv.DB.prepare(
    `INSERT INTO passkey_credentials (
       credential_id, account_id, public_key, counter, aaguid, transports, device_type, friendly_name, created_at, last_used_at
     ) VALUES (?, ?, ?, 0, ?, ?, 'single_device', ?, ?, ?)`
  ).bind(
    sensitiveSentinels.credentialId,
    account.accountId,
    new TextEncoder().encode(sensitiveSentinels.publicKeyBlob),
    sensitiveSentinels.aaguid,
    JSON.stringify([sensitiveSentinels.transports]),
    publicSentinels.friendlyName,
    NOW,
    NOW
  ).run();

  // 5. account_devices
  await workerEnv.DB.prepare(
    `INSERT INTO account_devices (
       device_id, account_id, platform, push_token, push_token_env, bundle_id, device_label, app_version, device_pubkey, device_pubkey_alg, registered_at, last_seen_at
     ) VALUES (?, ?, 'ios', ?, 'sandbox', 'app.solstone', 'My iPhone', '1.0.0', ?, ?, ?, ?)`
  ).bind(
    `${tag}-device`,
    account.accountId,
    sensitiveSentinels.pushToken,
    sensitiveSentinels.devicePubkey,
    sensitiveSentinels.devicePubkeyAlg,
    NOW,
    NOW
  ).run();

  // 6. scout_applications
  await seedScoutApplication({
    accountId: account.accountId,
    status: 'approved',
    useCase: publicSentinels.scoutUseCase,
    dataAckedAt: NOW,
    appliedAt: NOW,
    approvedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  });

  // 7. scout_lifecycle_events
  await workerEnv.DB.prepare(
    `INSERT INTO scout_lifecycle_events (
       correlation_id, account_id, sequence, action, from_status, to_status,
       actor_kind, actor_principal, reason_code, occurred_at
     ) VALUES (?, ?, 1, 'approve', 'pending', 'approved', 'operator', ?, 'application_approved', ?)`
  ).bind(`${tag}-scout-event`, account.accountId, sensitiveSentinels.actorPrincipal, NOW).run();

  // 8. entitlements
  await seedEntitlement({
    accountId: account.accountId,
    service: 'spl_hosted',
    status: 'active',
    currentPeriodEnd: 1_700_000_123,
    source: 'stripe',
    sourceRef: `sub_${tag}`,
    enabledAt: NOW,
    updatedAt: NOW,
  });

  // 9. stripe_customers
  await workerEnv.DB.prepare(
    'INSERT INTO stripe_customers (account_id, stripe_customer_id, created_at) VALUES (?, ?, ?)'
  ).bind(account.accountId, `cus_${tag}`, NOW).run();

  // 10. spl_bindings
  await seedSplBinding({ accountId: account.accountId, instanceId, createdAt: NOW, lastSeenAt: NOW });

  // 11. mcp_bridge_hostname_ledger & bindings
  await workerEnv.DB.prepare(
    'INSERT OR IGNORE INTO mcp_bridge_hostname_ledger (label, created_at) VALUES (?, ?)'
  ).bind(publicSentinels.mcpLabel, NOW).run();

  await workerEnv.DB.prepare(
    'INSERT INTO mcp_bridge_bindings (account_id, instance_id, label, created_at) VALUES (?, ?, ?, ?)'
  ).bind(account.accountId, instanceId, publicSentinels.mcpLabel, NOW).run();

  // 12. spb_bindings
  await workerEnv.DB.prepare(
    `INSERT INTO spb_bindings (
       account_id, instance_id, created_at, last_seen_at, token_hash
     ) VALUES (?, ?, ?, ?, ?)`
  ).bind(account.accountId, instanceId, NOW, NOW, sensitiveSentinels.spbBindingTokenHash).run();

  // 13. spp_bindings
  await upsertSppBinding(workerEnv.DB, {
    accountId: account.accountId,
    instanceId,
    tokenHash: sensitiveSentinels.sppBindingTokenHash,
    nowMs: NOW,
    consentAckedAt: NOW,
    consentDisclosureVersion: 'v1',
  });

  // 14. spb_mint_audit
  await workerEnv.DB.prepare(
    `INSERT INTO spb_mint_audit (account_id, instance_id, prefix, scope, ttl, outcome, ts)
     VALUES (?, ?, ?, 'backup', 3600, 'minted', ?)`
  ).bind(account.accountId, instanceId, sensitiveSentinels.spbMintPrefix, NOW).run();

  // 15. spp_mint_audit
  await workerEnv.DB.prepare(
    `INSERT INTO spp_mint_audit (account_id, instance_id, scope, outcome, ts)
     VALUES (?, ?, 'inference', 'minted', ?)`
  ).bind(account.accountId, instanceId, NOW).run();

  // 16. spb_sweep_audit
  await workerEnv.DB.prepare(
    `INSERT INTO spb_sweep_audit (account_id, instance_id, prefix, objects_deleted, multipart_aborted, ts)
     VALUES (?, ?, ?, 1, 0, ?)`
  ).bind(account.accountId, instanceId, sensitiveSentinels.spbSweepPrefix, NOW).run();

  // Non-exportable tables:
  // 17. passkey_challenges
  await workerEnv.DB.prepare(
    `INSERT INTO passkey_challenges (challenge, account_id, purpose, created_at, expires_at)
     VALUES (?, ?, 'register', ?, ?)`
  ).bind(sensitiveSentinels.passkeyChallenge, account.accountId, NOW, NOW + 1000).run();

  // 18. account_dispatch_tokens
  await workerEnv.DB.prepare(
    'INSERT INTO account_dispatch_tokens (token_hash, account_id, created_at) VALUES (?, ?, ?)'
  ).bind(sensitiveSentinels.dispatchTokenHash, account.accountId, NOW).run();

  // 19. service_handoffs
  await workerEnv.DB.prepare(
    `INSERT INTO service_handoffs (handoff_hash, account_id, service, payload_encrypted, created_at, expires_at)
     VALUES (?, ?, 'scout', ?, ?, ?)`
  ).bind(sensitiveSentinels.handoffHash, account.accountId, new TextEncoder().encode(sensitiveSentinels.handoffPayload), NOW, NOW + 1000).run();

  // 20. enable_scout_codes
  await workerEnv.DB.prepare(
    `INSERT INTO enable_scout_codes (code_hash, nonce_hash, account_id, created_at, expires_at, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(sensitiveSentinels.enableCodeHash, sensitiveSentinels.enableNonceHash, account.accountId, NOW, NOW + 1000, sensitiveSentinels.enableIpHash).run();

  // 21. spb_retired_tokens
  await workerEnv.DB.prepare(
    'INSERT INTO spb_retired_tokens (token_hash, account_id, instance_id, retired_at) VALUES (?, ?, ?, ?)'
  ).bind(sensitiveSentinels.spbRetiredTokenHash, account.accountId, instanceId, NOW).run();

  // 22. spb_mint_reservations
  await workerEnv.DB.prepare(
    `INSERT INTO spb_mint_reservations (id, account_id, instance_id, scope, reserved_expires_at, state, created_at)
     VALUES (?, ?, ?, 'backup', ?, 'finalized', ?)`
  ).bind(sensitiveSentinels.reservationId, account.accountId, instanceId, NOW + 1000, NOW).run();

  // 23. account_deletion_proofs
  await createDeletionProof(workerEnv.DB, {
    tokenHash: sensitiveSentinels.deletionProofTokenHash,
    accountId: account.accountId,
    sessionIdHash: sensitiveSentinels.deletionProofSessionHash,
    purpose: 'export',
    method: 'otp',
    issuedAt: NOW,
    expiresAt: NOW + 1000,
    otpCodeHash: sensitiveSentinels.deletionProofOtpHash,
  });

  // 24. otp_tokens
  await workerEnv.DB.prepare(
    'INSERT INTO otp_tokens (email_lower_hash, code_hash, expires_at, started_at) VALUES (?, ?, ?, ?)'
  ).bind(sensitiveSentinels.otpEmailLowerHash, sensitiveSentinels.otpCodeHash, NOW + 1000, NOW).run();

  // 25. rate_buckets
  await workerEnv.DB.prepare(
    'INSERT INTO rate_buckets (key, count, window_start) VALUES (?, 1, ?)'
  ).bind(sensitiveSentinels.rateBucketKey, NOW).run();

  // 26. account_deletions
  await workerEnv.DB.prepare(
    `INSERT INTO account_deletions (
       operation_id, account_id, phase, requested_at, cancellation_deadline_at, snapshot_encrypted
     ) VALUES (?, ?, 'cancelled', ?, ?, ?)`
  ).bind(sensitiveSentinels.deletionOpId, account.accountId, NOW, NOW + 1000, sensitiveSentinels.deletionSnapshotEnc).run();

  // 27. account_deletion_service_ops
  await workerEnv.DB.prepare(
    'INSERT INTO account_deletion_service_ops (id, operation_id, service, state) VALUES (?, ?, \'relay\', \'confirmed\')'
  ).bind(sensitiveSentinels.deletionServiceOpId, sensitiveSentinels.deletionOpId).run();

  // 28. account_deletion_completions
  await workerEnv.DB.prepare(
    'INSERT INTO account_deletion_completions (token_hash, state, completed_at, expires_at) VALUES (?, \'complete\', ?, ?)'
  ).bind(sensitiveSentinels.deletionCompletionTokenHash, NOW, NOW + 10000).run();

  return {
    sensitive: sensitiveSentinels,
    public: publicSentinels,
    all: { ...sensitiveSentinels, ...publicSentinels },
  };
}
