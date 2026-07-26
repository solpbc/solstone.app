import { describe, expect, it } from 'vitest';
import {
  BACKUP_ACTIONS,
  MAINTENANCE_ACTIONS,
  mintSandboxExternalCredential,
  mintSandboxMaintenanceCredential,
  mintScopedCredential,
  SCOPES,
  SPB_MINT_TTL_BACKUP,
  SPB_MINT_TTL_MAINTENANCE,
  SPB_MINT_TTL_OPERATED,
  SPB_SANDBOX_TTL_SECONDS,
} from '../src/r2-credential.js';
import { makeTestEnv } from './helpers.js';

const NOW_SECONDS = 1_700_000_000;
const PREFIX = 'users/account/instance/';

describe('R2 credential scopes', () => {
  it('mints only backup and operated external sandbox credentials for exactly 90 seconds', async () => {
    const testEnv = makeTestEnv();

    for (const [scope, actions] of [
      ['backup', BACKUP_ACTIONS],
      ['operated', MAINTENANCE_ACTIONS],
    ]) {
      const credential = await mintSandboxExternalCredential(testEnv, {
        prefix: PREFIX,
        scope,
        nowSeconds: NOW_SECONDS,
      });
      const claims = decodeClaims(credential.sessionToken);

      expect(credential.ttl).toBe(SPB_SANDBOX_TTL_SECONDS);
      expect(credential.nowSeconds).toBe(NOW_SECONDS);
      expect(claims.iat).toBe(NOW_SECONDS);
      expect(claims.exp).toBe(NOW_SECONDS + 90);
      expect(claims.actions).toEqual(actions);
      expect(claims.paths).toEqual({ prefixPaths: [PREFIX] });
    }

    for (const scope of ['maintenance', 'bogus', null, undefined]) {
      await expect(mintSandboxExternalCredential(testEnv, {
        prefix: PREFIX,
        scope,
        nowSeconds: NOW_SECONDS,
      })).resolves.toBeNull();
    }
  });

  it('mints the cleanup-only maintenance action set for exactly 90 seconds', async () => {
    const testEnv = makeTestEnv();
    const credential = await mintSandboxMaintenanceCredential(testEnv, {
      prefix: PREFIX,
      nowSeconds: NOW_SECONDS,
    });
    const claims = decodeClaims(credential.sessionToken);

    expect(credential.ttl).toBe(90);
    expect(claims.iat).toBe(NOW_SECONDS);
    expect(claims.exp).toBe(NOW_SECONDS + 90);
    expect(claims.actions).toEqual(MAINTENANCE_ACTIONS);
    expect(claims.actions).toEqual(expect.arrayContaining(['DeleteObject', 'DeleteObjects']));
    expect(claims.paths).toEqual({ prefixPaths: [PREFIX] });
  });

  it('keeps the existing customer scope TTLs and actions unchanged', async () => {
    expect(SCOPES).toEqual({
      backup: { actions: BACKUP_ACTIONS, ttl: SPB_MINT_TTL_BACKUP },
      operated: { actions: MAINTENANCE_ACTIONS, ttl: SPB_MINT_TTL_OPERATED },
      maintenance: { actions: MAINTENANCE_ACTIONS, ttl: SPB_MINT_TTL_MAINTENANCE },
    });
    expect({
      backup: SPB_MINT_TTL_BACKUP,
      operated: SPB_MINT_TTL_OPERATED,
      maintenance: SPB_MINT_TTL_MAINTENANCE,
    }).toEqual({
      backup: 259_200,
      operated: 259_200,
      maintenance: 86_400,
    });

    for (const [scope, expected] of Object.entries(SCOPES)) {
      const credential = await mintScopedCredential(makeTestEnv(), {
        prefix: PREFIX,
        scope,
        nowSeconds: NOW_SECONDS,
      });
      const claims = decodeClaims(credential.sessionToken);
      expect(credential.ttl).toBe(expected.ttl);
      expect(claims.exp - claims.iat).toBe(expected.ttl);
      expect(claims.actions).toEqual(expected.actions);
    }
  });
});

function decodeClaims(sessionToken) {
  const jwt = atob(sessionToken).slice(4);
  const payload = jwt.split('.')[1];
  const padded = payload.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - (payload.length % 4)) % 4);
  return JSON.parse(atob(padded));
}
