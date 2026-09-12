import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  OWNER_DATA_ENUMS,
  OWNER_DATA_INVENTORY,
  RATE_BUCKET_FAMILIES,
  ownerDeletionPlan,
} from '../src/owner-data-inventory.js';
import { resetDb } from './helpers.js';

describe('owner data inventory', () => {
  beforeEach(resetDb);

  it('covers every canonical table and column exactly once with a closed treatment', async () => {
    const { results } = await workerEnv.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all();
    const actualTables = results.map(({ name }) => name);
    const inventoryTables = OWNER_DATA_INVENTORY.map(({ name }) => name).sort();
    expect(inventoryTables).toEqual(actualTables);
    expect(new Set(inventoryTables).size).toBe(inventoryTables.length);

    for (const entry of OWNER_DATA_INVENTORY) {
      expect(OWNER_DATA_ENUMS.associations).toContain(entry.association);
      expect(OWNER_DATA_ENUMS.deletionTreatments).toContain(entry.deletion);
      expect(OWNER_DATA_ENUMS.exportTreatments).toContain(entry.exportTreatment);
      const { results: columns } = await workerEnv.DB.prepare(`PRAGMA table_info(${entry.name})`).all();
      expect(entry.columns.map(({ name }) => name).sort()).toEqual(columns.map(({ name }) => name).sort());
      expect(new Set(entry.columns.map(({ name }) => name)).size).toBe(entry.columns.length);
      for (const column of entry.columns) {
        expect(OWNER_DATA_ENUMS.columnTreatments).toContain(column.treatment);
        if (column.treatment === 'exported') {
          expect(column.publicName).toBeTruthy();
          expect(column.transform).toBeTruthy();
          expect(column.semantics).toBeTruthy();
        } else {
          expect(column.reason).toBeTruthy();
        }
      }
    }
  });

  it('makes deletion execution and rate families derive from the same inventory', () => {
    const directTables = OWNER_DATA_INVENTORY
      .filter(({ deletion }) => deletion === 'direct_owner_purge')
      .map(({ name }) => name).sort();
    const plannedTables = ownerDeletionPlan()
      .filter(({ kind }) => kind === 'account_id' || kind === 'account_primary_key')
      .map(({ table }) => table).sort();
    expect(plannedTables).toEqual(directTables);
    expect(new Set(RATE_BUCKET_FAMILIES.map(({ scope }) => scope)).size).toBe(RATE_BUCKET_FAMILIES.length);
    expect(RATE_BUCKET_FAMILIES.filter(({ association }) => association === 'account_id').map(({ scope }) => scope))
      .toEqual(expect.arrayContaining([
        'add_email_per_day', 'passkey_register_account',
        'delete_proof_otp_account', 'delete_proof_passkey_account',
        'export_proof_otp_account', 'export_proof_passkey_account',
      ]));
  });

  it('redacts the non-owner Scout actor principal by construction', () => {
    const actor = OWNER_DATA_INVENTORY.find(({ name }) => name === 'scout_lifecycle_events')
      .columns.find(({ name }) => name === 'actor_principal');
    expect(actor).toMatchObject({ treatment: 'non_owner_identity' });
    expect(actor.publicName).toBeUndefined();
  });
});
