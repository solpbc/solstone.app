import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptEmail, encryptEmail } from '../src/crypto.js';
import { computeDisplayName, ensureProvisionedKey } from '../src/provisioning.js';
import {
  installConsoleSpy,
  installGcpFetchMock,
  makeTestEnv,
  resetDb,
  rowCount,
  seedAccount,
} from './helpers.js';

describe('Gemini provisioning orchestrator', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns existing encrypted key and touches last_used_at', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const keyStringEncrypted = await encryptEmail('existing-gemini-key', testEnv);
    await insertProvisionedKey({
      accountId: account.accountId,
      displayName: computeDisplayName(account.accountId),
      keyStringEncrypted,
      createdAt: 1_000,
      lastUsedAt: null,
    });

    await expect(ensureProvisionedKey({ env: testEnv, accountId: account.accountId }))
      .resolves.toBe('existing-gemini-key');
    const row = await provisionedRow(account.accountId);
    expect(row.last_used_at).toBeGreaterThan(0);
  });

  it('inserts placeholder lock for first provisioning', async () => {
    const testEnv = makeTestEnv();
    installProvisioningMock({ apiKey: 'first-gemini-key' });
    const account = await seedAccount({ testEnv });

    await ensureProvisionedKey({ env: testEnv, accountId: account.accountId });
    const row = await provisionedRow(account.accountId);

    expect(row.display_name).toBe(computeDisplayName(account.accountId));
    expect(row.key_resource_name).toBe('projects/test-gcp-project/locations/global/keys/key-1');
    expect(row.key_string_encrypted).not.toBe('');
  });

  it('concurrent loser waits and re-reads completed row', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await insertProvisionedKey({
      id: 'placeholder',
      accountId: account.accountId,
      displayName: computeDisplayName(account.accountId),
      keyResourceName: '',
      keyStringEncrypted: '',
      createdAt: Date.now(),
    });
    const update = new Promise((resolve, reject) => setTimeout(async () => {
      try {
        await workerEnv.DB
          .prepare('UPDATE provisioned_keys SET key_resource_name = ?, key_string_encrypted = ? WHERE id = ?')
          .bind(
            'projects/test/locations/global/keys/key-1',
            await encryptEmail('completed-gemini-key', testEnv),
            'placeholder'
          )
          .run();
        resolve();
      } catch (error) {
        reject(error);
      }
    }, 50));

    await expect(ensureProvisionedKey({ env: testEnv, accountId: account.accountId }))
      .resolves.toBe('completed-gemini-key');
    await update;
  });

  it('in-flight placeholder older than 120s is reclaimed', async () => {
    const testEnv = makeTestEnv();
    installProvisioningMock({ apiKey: 'reclaimed-gemini-key' });
    const account = await seedAccount({ testEnv });
    await insertProvisionedKey({
      id: 'abandoned',
      accountId: account.accountId,
      displayName: computeDisplayName(account.accountId),
      keyResourceName: '',
      keyStringEncrypted: '',
      createdAt: Date.now() - 121_000,
    });

    await expect(ensureProvisionedKey({ env: testEnv, accountId: account.accountId }))
      .resolves.toBe('reclaimed-gemini-key');
  });

  it('adopt-before-reclaim stores existing displayName key', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    installProvisioningMock({
      apiKey: 'adopted-gemini-key',
      existingKey: {
        name: 'projects/test-gcp-project/locations/global/keys/adopted',
        displayName: computeDisplayName(account.accountId),
      },
    });

    await ensureProvisionedKey({ env: testEnv, accountId: account.accountId });
    const row = await provisionedRow(account.accountId);

    expect(row.key_resource_name).toBe('projects/test-gcp-project/locations/global/keys/adopted');
    await expect(decryptEmail(row.key_string_encrypted, testEnv)).resolves.toBe('adopted-gemini-key');
  });

  it('create/poll/fetch/encrypt/update completes new provisioning', async () => {
    const testEnv = makeTestEnv();
    installProvisioningMock({ apiKey: 'created-gemini-key' });
    const account = await seedAccount({ testEnv });

    await expect(ensureProvisionedKey({ env: testEnv, accountId: account.accountId }))
      .resolves.toBe('created-gemini-key');
    const row = await provisionedRow(account.accountId);
    expect(row.key_string_encrypted).not.toContain('created-gemini-key');
    await expect(decryptEmail(row.key_string_encrypted, testEnv)).resolves.toBe('created-gemini-key');
  });

  it('uses SCOUT_GCP_PROJECT for GCP find and create during provisioning', async () => {
    const testEnv = makeTestEnv({ SCOUT_GCP_PROJECT: 'scout-proj' });
    let findCalled = false;
    let createCalled = false;
    installGcpFetchMock({
      'POST oauth2.googleapis.com/token': async () => jsonResponse({
        access_token: 'gcp-access-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
      'GET apikeys.googleapis.com/v2/projects/scout-proj/locations/global/keys': async () => {
        findCalled = true;
        return jsonResponse({ keys: [] });
      },
      'POST apikeys.googleapis.com/v2/projects/scout-proj/locations/global/keys': async () => {
        createCalled = true;
        return jsonResponse({ name: 'operations/create-scout-key' });
      },
      'GET apikeys.googleapis.com/v2/operations/create-scout-key': async () => jsonResponse({
        done: true,
        response: { name: 'projects/scout-proj/locations/global/keys/key-1' },
      }),
      'GET apikeys.googleapis.com/v2/projects/scout-proj/locations/global/keys/key-1/keyString': async () => jsonResponse({
        keyString: 'scout-project-gemini-key',
      }),
    });
    const account = await seedAccount({ testEnv });

    await expect(ensureProvisionedKey({ env: testEnv, accountId: account.accountId }))
      .resolves.toBe('scout-project-gemini-key');
    const row = await provisionedRow(account.accountId);
    expect(findCalled).toBe(true);
    expect(createCalled).toBe(true);
    expect(row.key_resource_name).toBe('projects/scout-proj/locations/global/keys/key-1');
  });

  it('failure after key resource name triggers delete and placeholder cleanup', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    let deleteCalled = false;
    installProvisioningMock({
      apiKeyStatus: 500,
      onDelete: () => {
        deleteCalled = true;
      },
    });

    await expect(ensureProvisionedKey({ env: testEnv, accountId: account.accountId })).rejects.toThrow();
    expect(deleteCalled).toBe(true);
    expect(await rowCount('provisioned_keys')).toBe(0);
  });

  it('failed orphan delete logs key resource name only', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    installProvisioningMock({
      apiKeyStatus: 500,
      deleteStatus: 500,
    });

    await expect(ensureProvisionedKey({ env: testEnv, accountId: account.accountId })).rejects.toThrow();
    expect(spy.calls.some((call) => call.args[0] === 'gcp_orphan_key')).toBe(true);
    spy.assertNoSecrets(['created-gemini-key']);
  });

  it('deterministic displayName is stable, <=63 chars, and safe', () => {
    const accountId = '123e4567-e89b-12d3-a456-426614174000';
    const first = computeDisplayName(accountId);
    const second = computeDisplayName(accountId);

    expect(first).toBe(second);
    expect(first).toMatch(/^acct-[a-z0-9-]{31}$/);
    expect(first.length).toBeLessThanOrEqual(63);
  });
});

function installProvisioningMock({
  apiKey = 'created-gemini-key',
  existingKey = null,
  apiKeyStatus = 200,
  deleteStatus = 200,
  onDelete = () => {},
} = {}) {
  installGcpFetchMock({
    'POST oauth2.googleapis.com/token': async () => jsonResponse({
      access_token: 'gcp-access-token',
      expires_in: 3600,
      token_type: 'Bearer',
    }),
    'GET apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys': async () => jsonResponse({
      keys: existingKey ? [existingKey] : [],
    }),
    'POST apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys': async () => jsonResponse({ name: 'operations/create-key' }),
    'GET apikeys.googleapis.com/v2/operations/create-key': async () => jsonResponse({
      done: true,
      response: { name: 'projects/test-gcp-project/locations/global/keys/key-1' },
    }),
    'GET apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys/key-1/keyString': async () => {
      if (apiKeyStatus !== 200) return new Response('failed', { status: apiKeyStatus });
      return jsonResponse({ keyString: apiKey });
    },
    'GET apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys/adopted/keyString': async () => jsonResponse({ keyString: apiKey }),
    'DELETE apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys/key-1': async () => {
      onDelete();
      return new Response(deleteStatus === 200 ? '' : 'failed', { status: deleteStatus });
    },
  });
}

async function insertProvisionedKey({
  id = crypto.randomUUID(),
  accountId,
  displayName,
  keyResourceName = 'projects/test/locations/global/keys/key-1',
  keyStringEncrypted,
  createdAt,
  lastUsedAt = null,
}) {
  await workerEnv.DB
    .prepare(
      `INSERT INTO provisioned_keys (
        id, account_id, provider, display_name, key_resource_name,
        key_string_encrypted, created_at, last_used_at
      ) VALUES (?, ?, 'gemini', ?, ?, ?, ?, ?)`
    )
    .bind(id, accountId, displayName, keyResourceName, keyStringEncrypted, createdAt, lastUsedAt)
    .run();
}

async function provisionedRow(accountId) {
  return workerEnv.DB
    .prepare('SELECT display_name, key_resource_name, key_string_encrypted, last_used_at FROM provisioned_keys WHERE account_id = ?')
    .bind(accountId)
    .first();
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
