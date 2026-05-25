import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { provisionScoutForAccount } from '../src/enable.js';
import {
  installConsoleSpy,
  installGcpFetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
} from './helpers.js';

describe('provisionScoutForAccount', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('provisions a Gemini key, mints a dispatch token, and returns the handoff payload shape', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    installProvisioningMock('provisioned-google-key');
    try {
      const result = await provisionScoutForAccount({
        env: testEnv,
        accountId: account.accountId,
        ctx: null,
      });

      expect(result).toEqual({
        google_api_key: 'provisioned-google-key',
        dispatch_token: expect.stringMatching(/^[A-Za-z0-9_-]+$/),
        account_id: account.accountId,
        created_at: expect.any(Number),
      });
      await expect(rowCount('provisioned_keys')).resolves.toBe(1);
      await expect(rowCount('account_dispatch_tokens')).resolves.toBe(1);
      spy.assertNoSecrets(['provisioned-google-key', result.dispatch_token]);
    } finally {
      spy.restore();
    }
  });
});

async function rowCount(table) {
  const row = await workerEnv.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
  return row.count;
}

function installProvisioningMock(keyString) {
  installGcpFetchMock({
    'POST oauth2.googleapis.com/token': async () => jsonResponse({
      access_token: 'gcp-access-token',
      expires_in: 3600,
      token_type: 'Bearer',
    }),
    'GET apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys': async () => jsonResponse({ keys: [] }),
    'POST apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys': async () => jsonResponse({
      name: 'operations/create-enable-key',
    }),
    'GET apikeys.googleapis.com/v2/operations/create-enable-key': async () => jsonResponse({
      done: true,
      response: { name: 'projects/test-gcp-project/locations/global/keys/enable-key' },
    }),
    'GET apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys/enable-key/keyString': async () => jsonResponse({
      keyString,
    }),
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
