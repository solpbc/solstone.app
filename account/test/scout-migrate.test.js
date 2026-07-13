import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  installConsoleSpy,
  installGcpFetchMock,
  makeTestEnv,
  resetDb,
  rowCount,
  seedAccount,
  seedCredential,
} from './helpers.js';
import { installJwksStub, mintToken } from './jwks-helper.js';

describe('admin scout migration importer', () => {
  beforeEach(async () => {
    await resetDb();
    await installJwksStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('requires CF Access and only opens the migrate POST route', async () => {
    await expectJsonError(
      await worker.fetch(adminRequest('/admin/migrate/scout', null, {
        method: 'POST',
        body: { records: [] },
      }), makeTestEnv()),
      403,
      'cloudflare access required'
    );

    const token = await mintToken();
    const ok = await worker.fetch(adminRequest('/admin/migrate/scout', token, {
      method: 'POST',
      body: { records: [] },
    }), makeTestEnv());
    expect(ok.status).toBe(200);
    await expect(ok.json()).resolves.toEqual({ dry_run: true, results: [] });

    await expectJsonError(
      await worker.fetch(adminRequest('/admin/migrate/other', token, {
        method: 'POST',
        body: { records: [] },
      }), makeTestEnv()),
      404,
      'migrate route not found'
    );
    await expectJsonError(
      await worker.fetch(adminRequest('/admin/accounts', token, { method: 'POST' }), makeTestEnv()),
      404,
      'account not found'
    );
    await expectJsonError(
      await worker.fetch(adminRequest('/admin/other', token, { method: 'POST' }), makeTestEnv()),
      404,
      'account not found'
    );
    await expectJsonError(
      await worker.fetch(adminRequest('/admin/migrate/scout', token, {
        method: 'POST',
        body: { not_records: [] },
      }), makeTestEnv()),
      400,
      'records array required'
    );
    await expectJsonError(
      await worker.fetch(adminRequest('/admin/migrate/scout', token, {
        method: 'POST',
        body: null,
      }), makeTestEnv()),
      400,
      'records array required'
    );
  });

  it('dry-runs without writing accounts, applications, or keys', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const existing = await seedAccount({ email: 'existing@example.com', testEnv });
    await primeAdminAuth(token, testEnv);
    const gcp = installProvisioningMock();
    const before = await countCoreRows();

    const response = await worker.fetch(adminRequest('/admin/migrate/scout', token, {
      method: 'POST',
      body: {
        records: [
          { email: 'existing@example.com', status: 'approved', data_acknowledged: true },
          { email: 'new@example.com', status: 'approved', data_acknowledged: true },
        ],
      },
    }), testEnv);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      dry_run: true,
      results: [
        {
          email: 'existing@example.com',
          account: 'matched',
          account_id: existing.accountId,
          status: 'approved',
          key: 'would-mint',
        },
        {
          email: 'new@example.com',
          account: 'would-create',
          account_id: null,
          status: 'approved',
          key: 'would-mint',
        },
      ],
    });
    await expect(countCoreRows()).resolves.toEqual(before);
    expect(createKeyPosts(gcp.calls)).toHaveLength(0);
  });

  it('real-runs migrated application state and data ack semantics without fabricating lifecycle events', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    await primeAdminAuth(token, testEnv);
    installProvisioningMock({ keyString: 'carry-key' });
    const approvedAt = Date.parse('2024-01-02T00:00:00.000Z');

    const response = await worker.fetch(adminRequest('/admin/migrate/scout', token, {
      method: 'POST',
      body: {
        dry_run: false,
        records: [
          {
            email: 'approved-acked@example.com',
            status: 'approved',
            use_case: 'carry use',
            data_acknowledged: true,
            applied_at: 1_000,
            approved_at: '2024-01-02T00:00:00.000Z',
          },
          {
            email: 'approved-acked-fallback@example.com',
            status: 'approved',
            data_acknowledged: 1,
            approved_at: null,
          },
          {
            email: 'approved-unacked@example.com',
            status: 'approved',
            data_acknowledged: false,
            approved_at: 2_000,
          },
          {
            email: 'applied-acked@example.com',
            status: 'applied',
            data_acknowledged: 1,
            applied_at: 3_000,
          },
        ],
      },
    }), testEnv);
    const body = await response.json();

    expect(response.status).toBe(200);
    const approvedAcked = byEmail(body, 'approved-acked@example.com');
    const approvedFallback = byEmail(body, 'approved-acked-fallback@example.com');
    const approvedUnacked = byEmail(body, 'approved-unacked@example.com');
    const appliedAcked = byEmail(body, 'applied-acked@example.com');

    expect(approvedAcked).toMatchObject({ account: 'created', status: 'approved', key: 'minted' });
    await expect(applicationRow(approvedAcked.account_id)).resolves.toMatchObject({
      status: 'approved',
      use_case: 'carry use',
      data_acked_at: approvedAt,
      applied_at: 1_000,
      approved_at: approvedAt,
      revoked_at: null,
    });

    const fallbackRow = await applicationRow(approvedFallback.account_id);
    expect(fallbackRow.status).toBe('approved');
    expect(typeof fallbackRow.data_acked_at).toBe('number');
    expect(fallbackRow.approved_at).toBeNull();

    await expect(applicationRow(approvedUnacked.account_id)).resolves.toMatchObject({
      status: 'approved',
      data_acked_at: null,
      approved_at: 2_000,
    });

    const appliedRow = await applicationRow(appliedAcked.account_id);
    expect(appliedRow.status).toBe('pending');
    expect(typeof appliedRow.data_acked_at).toBe('number');
    expect(appliedRow.applied_at).toBe(3_000);
    expect(appliedAcked).toMatchObject({
      status: 'pending',
      key: 'skipped',
      key_reason: 'not approved',
    });
    await expect(rowCount('scout_lifecycle_events')).resolves.toBe(0);
  });

  it('coerces timestamps before storage and renders valid scout list timestamps', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const iso = '2024-03-04T05:06:07.000Z';
    const isoMs = Date.parse(iso);

    const response = await worker.fetch(adminRequest('/admin/migrate/scout', token, {
      method: 'POST',
      body: {
        dry_run: false,
        records: [
          { email: 'ms@example.com', status: 'approved', data_acknowledged: false, approved_at: 4_000 },
          { email: 'iso@example.com', status: 'approved', data_acknowledged: false, approved_at: iso },
          { email: 'null@example.com', status: 'approved', data_acknowledged: false, approved_at: null },
          { email: 'invalid@example.com', status: 'approved', data_acknowledged: false, approved_at: 'not-a-date' },
        ],
      },
    }), testEnv);
    const body = await response.json();

    expect(response.status).toBe(200);
    const msRow = await applicationRow(byEmail(body, 'ms@example.com').account_id);
    expect(typeof msRow.approved_at).toBe('number');
    expect(msRow.approved_at).toBe(4_000);

    const isoRow = await applicationRow(byEmail(body, 'iso@example.com').account_id);
    expect(typeof isoRow.approved_at).toBe('number');
    expect(isoRow.approved_at).toBe(isoMs);

    await expect(applicationRow(byEmail(body, 'null@example.com').account_id))
      .resolves.toMatchObject({ approved_at: null });

    const invalidResult = byEmail(body, 'invalid@example.com');
    expect(invalidResult.warnings).toEqual(['approved_at']);
    await expect(applicationRow(invalidResult.account_id))
      .resolves.toMatchObject({ approved_at: null });

    const listResponse = await worker.fetch(adminRequest('/admin/scouts', token), testEnv);
    const listBody = await listResponse.json();
    expect(listResponse.status).toBe(200);
    expect(listBody.scouts.find((row) => row.primary_email === 'ms@example.com').approved_at)
      .toBe(new Date(4_000).toISOString());
    expect(listBody.scouts.find((row) => row.primary_email === 'iso@example.com').approved_at)
      .toBe(iso);
    expect(listBody.scouts.find((row) => row.primary_email === 'null@example.com').approved_at)
      .toBeNull();
    expect(JSON.stringify(listBody)).not.toContain('Invalid Date');
  });

  it('mints keys in SCOUT_GCP_PROJECT instead of the service-account fallback', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv({ SCOUT_GCP_PROJECT: 'scout-prod-project' });
    await primeAdminAuth(token, testEnv);
    const spy = installConsoleSpy();
    const gcp = installProvisioningMock({
      projectId: 'scout-prod-project',
      keyString: 'scout-prod-key',
    });
    try {
      const response = await worker.fetch(adminRequest('/admin/migrate/scout', token, {
        method: 'POST',
        body: {
          dry_run: false,
          records: [
            { email: 'project@example.com', status: 'approved', data_acknowledged: true },
          ],
        },
      }), testEnv);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(byEmail(body, 'project@example.com')).toMatchObject({ key: 'minted' });
      expect(createKeyPosts(gcp.calls).map((call) => call.url.pathname)).toContain(
        '/v2/projects/scout-prod-project/locations/global/keys'
      );
      expect(createKeyPosts(gcp.calls).map((call) => call.url.pathname)).not.toContain(
        '/v2/projects/test-gcp-project/locations/global/keys'
      );
      spy.assertNoSecrets(['scout-prod-key']);
    } finally {
      spy.restore();
    }
  });

  it('reports mint failure mid-batch and recovers on rerun without duplicates', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    await primeAdminAuth(token, testEnv);
    const spy = installConsoleSpy();
    let failCreate = true;
    installProvisioningMock({
      keyString: 'recovered-key',
      failCreate: () => {
        if (!failCreate) return false;
        failCreate = false;
        return true;
      },
    });
    const records = [
      { email: 'recover@example.com', status: 'approved', data_acknowledged: true },
      { email: 'sibling@example.com', status: 'revoked', data_acknowledged: true },
    ];
    try {
      const firstResponse = await worker.fetch(adminRequest('/admin/migrate/scout', token, {
        method: 'POST',
        body: { dry_run: false, records },
      }), testEnv);
      const first = await firstResponse.json();
      const failed = byEmail(first, 'recover@example.com');
      const sibling = byEmail(first, 'sibling@example.com');

      expect(firstResponse.status).toBe(200);
      expect(failed).toMatchObject({ key: 'error', account: 'created', status: 'approved' });
      expect(failed.key_reason).toContain('GCP API key creation failed');
      await expect(applicationRow(failed.account_id)).resolves.toMatchObject({ status: 'approved' });
      expect(sibling).toMatchObject({ account: 'created', status: 'revoked', key: 'skipped' });
      await expect(applicationRow(sibling.account_id)).resolves.toMatchObject({ status: 'revoked' });
      await expect(rowCount('accounts')).resolves.toBe(2);
      await expect(rowCount('scout_applications')).resolves.toBe(2);
      await expect(activeKeyCount(failed.account_id)).resolves.toBe(0);

      const secondResponse = await worker.fetch(adminRequest('/admin/migrate/scout', token, {
        method: 'POST',
        body: { dry_run: false, records },
      }), testEnv);
      const second = await secondResponse.json();
      const recovered = byEmail(second, 'recover@example.com');

      expect(secondResponse.status).toBe(200);
      expect(['minted', 'exists']).toContain(recovered.key);
      expect(recovered.account).toBe('matched');
      await expect(activeKeyCount(recovered.account_id)).resolves.toBe(1);
      await expect(rowCount('accounts')).resolves.toBe(2);
      await expect(rowCount('scout_applications')).resolves.toBe(2);
      spy.assertNoSecrets(['recovered-key']);
    } finally {
      spy.restore();
    }
  });

  it('is idempotent across identical real-run batches', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    await primeAdminAuth(token, testEnv);
    installProvisioningMock({ keyString: 'idempotent-key' });
    const records = [
      { email: 'idempotent@example.com', status: 'approved', data_acknowledged: true },
      { email: 'pending-idempotent@example.com', status: 'applied', data_acknowledged: 1 },
    ];

    const firstResponse = await worker.fetch(adminRequest('/admin/migrate/scout', token, {
      method: 'POST',
      body: { dry_run: false, records },
    }), testEnv);
    const first = await firstResponse.json();
    const firstCounts = await countCoreRows();

    const secondResponse = await worker.fetch(adminRequest('/admin/migrate/scout', token, {
      method: 'POST',
      body: { dry_run: false, records },
    }), testEnv);
    const second = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(byEmail(first, 'idempotent@example.com')).toMatchObject({ account: 'created', key: 'minted' });
    expect(byEmail(second, 'idempotent@example.com')).toMatchObject({ account: 'matched', key: 'exists' });
    expect(byEmail(second, 'pending-idempotent@example.com')).toMatchObject({
      account: 'matched',
      status: 'pending',
      key: 'skipped',
    });
    await expect(countCoreRows()).resolves.toEqual(firstCounts);
    await expect(activeKeyCount(byEmail(second, 'idempotent@example.com').account_id)).resolves.toBe(1);
  });

  it('imports revoked records without lifecycle substitutions or keys', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();

    const response = await worker.fetch(adminRequest('/admin/migrate/scout', token, {
      method: 'POST',
      body: {
        dry_run: false,
        records: [
          {
            email: 'revoked@example.com',
            status: 'revoked',
            data_acknowledged: true,
            applied_at: null,
            approved_at: null,
            revoked_at: null,
          },
        ],
      },
    }), testEnv);
    const body = await response.json();
    const result = byEmail(body, 'revoked@example.com');

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      account: 'created',
      status: 'revoked',
      key: 'skipped',
      key_reason: 'not approved',
    });
    await expect(applicationRow(result.account_id)).resolves.toMatchObject({
      status: 'revoked',
      applied_at: null,
      approved_at: null,
      revoked_at: null,
    });
    await expect(rowCount('provisioned_keys')).resolves.toBe(0);
  });

  it('skips unknown statuses and missing, blank, or invalid emails without writes', async () => {
    const token = await mintToken();
    const response = await worker.fetch(adminRequest('/admin/migrate/scout', token, {
      method: 'POST',
      body: {
        dry_run: false,
        records: [
          { email: 'unknown@example.com', status: 'unknown' },
          {},
          { email: '   ', status: 'approved' },
          { email: 'not-an-email', status: 'approved' },
        ],
      },
    }), makeTestEnv());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([
      { email: 'unknown@example.com', skipped: 'unknown status: unknown' },
      { email: null, skipped: 'missing email' },
      { email: null, skipped: 'missing email' },
      { email: 'not-an-email', skipped: 'invalid email' },
    ]);
    await expect(rowCount('accounts')).resolves.toBe(0);
    await expect(rowCount('account_emails')).resolves.toBe(0);
    await expect(rowCount('scout_applications')).resolves.toBe(0);
    await expect(rowCount('provisioned_keys')).resolves.toBe(0);
  });

  it('matches existing accounts without duplicating them', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const existing = await seedAccount({ email: 'matched@example.com', testEnv });
    const before = await countCoreRows();

    const response = await worker.fetch(adminRequest('/admin/migrate/scout', token, {
      method: 'POST',
      body: {
        dry_run: false,
        records: [
          { email: 'matched@example.com', status: 'applied', data_acknowledged: false },
        ],
      },
    }), testEnv);
    const body = await response.json();
    const result = byEmail(body, 'matched@example.com');

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      account: 'matched',
      account_id: existing.accountId,
      status: 'pending',
      key: 'skipped',
    });
    expect(await rowCount('accounts')).toBe(before.accounts);
    expect(await rowCount('account_emails')).toBe(before.account_emails);
    expect(await rowCount('scout_applications')).toBe(before.scout_applications + 1);
  });

  it('migrates passkey public keys as binary blobs', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const anchorAccount = await seedAccount({ email: 'anchor@example.com', testEnv });
    const cose = new Uint8Array([0xa5, 0x01, 0x02, 0x20, 0xfd, 0x00, 0xff, 0x7f, 0x80]);
    await seedCredential({
      accountId: anchorAccount.accountId,
      credentialId: 'anchor',
      publicKey: cose,
    });

    expect([...new Uint8Array((await passkeyRow('anchor')).public_key)]).toEqual([...cose]);

    const response = await worker.fetch(adminRequest('/admin/migrate/scout', token, {
      method: 'POST',
      body: {
        dry_run: false,
        records: [
          {
            email: 'binary-passkey@example.com',
            status: 'approved',
            data_acknowledged: false,
            passkey_user_handle: 'binary-handle',
            passkeys: [
              { credential_id: 'migrated-1', public_key: b64u(cose) },
            ],
          },
        ],
      },
    }), testEnv);

    expect(response.status).toBe(200);
    expect([...new Uint8Array((await passkeyRow('migrated-1')).public_key)]).toEqual([...cose]);
  });

  it('creates a new account with its scout passkey handle and credentials', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();

    const response = await worker.fetch(adminRequest('/admin/migrate/scout', token, {
      method: 'POST',
      body: {
        dry_run: false,
        records: [
          {
            email: 'new-passkeys@example.com',
            status: 'approved',
            data_acknowledged: false,
            passkey_user_handle: 'new-passkeys-handle',
            passkeys: [
              { credential_id: 'new-passkey-1', public_key: b64u(new Uint8Array([1, 2, 3])) },
              { credential_id: 'new-passkey-2', public_key: b64u(new Uint8Array([4, 5, 6])) },
            ],
          },
        ],
      },
    }), testEnv);
    const body = await response.json();
    const result = byEmail(body, 'new-passkeys@example.com');

    expect(response.status).toBe(200);
    expect(result).toMatchObject({ account: 'created', key: 'skipped' });
    expect(result.passkeys).toEqual({ migrated: 2 });
    await expect(accountHandle(result.account_id)).resolves.toBe('new-passkeys-handle');
    const rows = await passkeyRowsForAccount(result.account_id);
    expect(rows.map((row) => row.credential_id).sort()).toEqual(['new-passkey-1', 'new-passkey-2']);
    expect(rows.every((row) => row.account_id === result.account_id)).toBe(true);
  });

  it('counts already migrated passkeys and is idempotent on rerun', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const existing = await seedAccount({ email: 'partial-passkeys@example.com', testEnv });
    await seedCredential({
      accountId: existing.accountId,
      credentialId: 'partial-existing',
      publicKey: new Uint8Array([7, 7, 7]),
      userHandle: 'partial-handle',
    });
    const records = [
      {
        email: 'partial-passkeys@example.com',
        status: 'approved',
        data_acknowledged: false,
        passkey_user_handle: 'partial-handle',
        passkeys: [
          { credential_id: 'partial-existing', public_key: b64u(new Uint8Array([7, 7, 7])) },
          { credential_id: 'partial-new', public_key: b64u(new Uint8Array([8, 8, 8])) },
        ],
      },
    ];

    const firstResponse = await worker.fetch(adminRequest('/admin/migrate/scout', token, {
      method: 'POST',
      body: { dry_run: false, records },
    }), testEnv);
    const first = await firstResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(byEmail(first, 'partial-passkeys@example.com').passkeys).toEqual({ migrated: 2 });
    await expect(rowCount('passkey_credentials')).resolves.toBe(2);

    const secondResponse = await worker.fetch(adminRequest('/admin/migrate/scout', token, {
      method: 'POST',
      body: { dry_run: false, records },
    }), testEnv);
    const second = await secondResponse.json();

    expect(secondResponse.status).toBe(200);
    expect(byEmail(second, 'partial-passkeys@example.com').passkeys).toEqual({ migrated: 2 });
    await expect(rowCount('passkey_credentials')).resolves.toBe(2);
    await expect(accountHandle(existing.accountId)).resolves.toBe('partial-handle');
  });

  it('skips passkeys on same-account handle conflict while migrating the record', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const existing = await seedAccount({ email: 'handle-conflict@example.com', testEnv });
    await setAccountHandle(existing.accountId, 'HANDLE-A');
    installProvisioningMock({ keyString: 'conflict-key' });

    const response = await worker.fetch(adminRequest('/admin/migrate/scout', token, {
      method: 'POST',
      body: {
        dry_run: false,
        records: [
          {
            email: 'handle-conflict@example.com',
            status: 'approved',
            data_acknowledged: true,
            passkey_user_handle: 'HANDLE-B',
            passkeys: [
              { credential_id: 'handle-conflict-passkey', public_key: b64u(new Uint8Array([9, 9, 9])) },
            ],
          },
        ],
      },
    }), testEnv);
    const body = await response.json();
    const result = byEmail(body, 'handle-conflict@example.com');

    expect(response.status).toBe(200);
    expect(result).toMatchObject({ account: 'matched', key: 'minted' });
    expect(result.passkeys).toEqual({
      migrated: 0,
      skipped: [{ credential_id: 'handle-conflict-passkey', reason: 'handle conflict' }],
    });
    await expect(accountHandle(existing.accountId)).resolves.toBe('HANDLE-A');
    await expect(rowCount('passkey_credentials')).resolves.toBe(0);
    await expect(applicationRow(existing.accountId)).resolves.toMatchObject({ status: 'approved' });
    await expect(activeKeyCount(existing.accountId)).resolves.toBe(1);
  });

  it('catches cross-account handle collisions and continues the batch', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const owner = await seedAccount({ email: 'shared-owner@example.com', testEnv });
    await setAccountHandle(owner.accountId, 'SHARED');

    const response = await worker.fetch(adminRequest('/admin/migrate/scout', token, {
      method: 'POST',
      body: {
        dry_run: false,
        records: [
          {
            email: 'shared-collision@example.com',
            status: 'approved',
            data_acknowledged: false,
            passkey_user_handle: 'SHARED',
            passkeys: [
              { credential_id: 'shared-collision-passkey', public_key: b64u(new Uint8Array([1, 1, 1])) },
            ],
          },
          {
            email: 'shared-sibling@example.com',
            status: 'approved',
            data_acknowledged: false,
            passkey_user_handle: 'SIBLING',
            passkeys: [
              { credential_id: 'shared-sibling-passkey', public_key: b64u(new Uint8Array([2, 2, 2])) },
            ],
          },
        ],
      },
    }), testEnv);
    const body = await response.json();
    const collided = byEmail(body, 'shared-collision@example.com');
    const sibling = byEmail(body, 'shared-sibling@example.com');

    expect(response.status).toBe(200);
    expect(collided.passkeys).toEqual({
      migrated: 0,
      skipped: [{ credential_id: 'shared-collision-passkey', reason: 'handle collision' }],
    });
    await expect(accountHandle(collided.account_id)).resolves.toBeNull();
    await expect(passkeyRowsForAccount(collided.account_id)).resolves.toEqual([]);
    expect(sibling.passkeys).toEqual({ migrated: 1 });
    await expect(accountHandle(sibling.account_id)).resolves.toBe('SIBLING');
    expect((await passkeyRowsForAccount(sibling.account_id)).map((row) => row.credential_id))
      .toEqual(['shared-sibling-passkey']);
  });

  it('sets a missing handle and proceeds when the same handle is already present', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const existing = await seedAccount({ email: 'set-handle@example.com', testEnv });

    const firstResponse = await worker.fetch(adminRequest('/admin/migrate/scout', token, {
      method: 'POST',
      body: {
        dry_run: false,
        records: [
          {
            email: 'set-handle@example.com',
            status: 'approved',
            data_acknowledged: false,
            passkey_user_handle: 'SET-HANDLE',
            passkeys: [
              { credential_id: 'set-handle-first', public_key: b64u(new Uint8Array([3, 3, 3])) },
            ],
          },
        ],
      },
    }), testEnv);
    const first = await firstResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(byEmail(first, 'set-handle@example.com').passkeys).toEqual({ migrated: 1 });
    await expect(accountHandle(existing.accountId)).resolves.toBe('SET-HANDLE');

    const secondResponse = await worker.fetch(adminRequest('/admin/migrate/scout', token, {
      method: 'POST',
      body: {
        dry_run: false,
        records: [
          {
            email: 'set-handle@example.com',
            status: 'approved',
            data_acknowledged: false,
            passkey_user_handle: 'SET-HANDLE',
            passkeys: [
              { credential_id: 'set-handle-second', public_key: b64u(new Uint8Array([4, 4, 4])) },
            ],
          },
        ],
      },
    }), testEnv);
    const second = await secondResponse.json();

    expect(secondResponse.status).toBe(200);
    expect(byEmail(second, 'set-handle@example.com').passkeys).toEqual({ migrated: 1 });
    await expect(accountHandle(existing.accountId)).resolves.toBe('SET-HANDLE');
    expect((await passkeyRowsForAccount(existing.accountId)).map((row) => row.credential_id).sort())
      .toEqual(['set-handle-first', 'set-handle-second']);
  });

  it('isolates per-passkey failures within a scout record', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const other = await seedAccount({ email: 'passkey-owner@example.com', testEnv });
    await seedCredential({
      accountId: other.accountId,
      credentialId: 'owned-elsewhere',
      publicKey: new Uint8Array([5, 5, 5]),
    });

    const response = await worker.fetch(adminRequest('/admin/migrate/scout', token, {
      method: 'POST',
      body: {
        dry_run: false,
        records: [
          {
            email: 'isolated-passkeys@example.com',
            status: 'approved',
            data_acknowledged: false,
            passkey_user_handle: 'isolated-handle',
            passkeys: [
              { credential_id: 'bad-public-key', public_key: null },
              { credential_id: 'isolated-valid', public_key: b64u(new Uint8Array([6, 6, 6])) },
              { credential_id: 'owned-elsewhere', public_key: b64u(new Uint8Array([5, 5, 5])) },
            ],
          },
        ],
      },
    }), testEnv);
    const body = await response.json();
    const result = byEmail(body, 'isolated-passkeys@example.com');

    expect(response.status).toBe(200);
    expect(result.passkeys).toEqual({
      migrated: 1,
      skipped: [
        { credential_id: 'bad-public-key', reason: 'public_key decode failed' },
        { credential_id: 'owned-elsewhere', reason: 'owned by another account' },
      ],
    });
    await expect(passkeyRow('isolated-valid')).resolves.toMatchObject({ account_id: result.account_id });
    await expect(applicationRow(result.account_id)).resolves.toMatchObject({ status: 'approved' });
  });

  it('preserves scout passkey metadata and falls back created_at', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();

    const response = await worker.fetch(adminRequest('/admin/migrate/scout', token, {
      method: 'POST',
      body: {
        dry_run: false,
        records: [
          {
            email: 'passkey-metadata@example.com',
            status: 'approved',
            data_acknowledged: false,
            passkey_user_handle: 'metadata-handle',
            passkeys: [
              {
                credential_id: 'metadata-fixed',
                public_key: b64u(new Uint8Array([7, 1, 7])),
                created_at: 1_700_000_000_000,
                transports: '["internal"]',
                backup_eligible: 1,
                backup_state: 0,
              },
              {
                credential_id: 'metadata-fallback',
                public_key: b64u(new Uint8Array([7, 2, 7])),
                created_at: null,
              },
            ],
          },
        ],
      },
    }), testEnv);

    expect(response.status).toBe(200);
    await expect(passkeyRow('metadata-fixed')).resolves.toMatchObject({
      created_at: 1_700_000_000_000,
      transports: '["internal"]',
      backup_eligible: 1,
      backup_state: 0,
      device_type: null,
    });
    const fallback = await passkeyRow('metadata-fallback');
    expect(typeof fallback.created_at).toBe('number');
    expect(fallback.created_at).toBeGreaterThan(0);
  });

  it('dry-runs scout passkeys without writing and reports the plan', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const before = await countCoreRows();

    const response = await worker.fetch(adminRequest('/admin/migrate/scout', token, {
      method: 'POST',
      body: {
        records: [
          {
            email: 'dry-run-passkeys@example.com',
            status: 'approved',
            data_acknowledged: false,
            passkey_user_handle: 'dry-run-handle',
            passkeys: [
              { credential_id: 'dry-run-valid', public_key: b64u(new Uint8Array([8, 1, 8])) },
              { credential_id: 'dry-run-bad', public_key: null },
            ],
          },
        ],
      },
    }), testEnv);
    const body = await response.json();
    const result = byEmail(body, 'dry-run-passkeys@example.com');

    expect(response.status).toBe(200);
    expect(body.dry_run).toBe(true);
    expect(result.passkeys).toEqual({
      would_migrate: 1,
      skipped: [{ credential_id: 'dry-run-bad', reason: 'public_key decode failed' }],
    });
    expect(result.passkeys.migrated).toBeUndefined();
    await expect(rowCount('passkey_credentials')).resolves.toBe(0);
    await expect(countCoreRows()).resolves.toEqual(before);
  });

  it('returns one result for every input record in order', async () => {
    const token = await mintToken();
    const records = [
      { email: 'first@example.com', status: 'applied' },
      { email: 'second@example.com', status: 'unknown' },
      {},
      { email: 'bad', status: 'approved' },
      { email: 'last@example.com', status: 'revoked' },
    ];

    const response = await worker.fetch(adminRequest('/admin/migrate/scout', token, {
      method: 'POST',
      body: { records },
    }), makeTestEnv());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.dry_run).toBe(true);
    expect(body.results).toHaveLength(records.length);
    expect(body.results.map((row) => row.email)).toEqual([
      'first@example.com',
      'second@example.com',
      null,
      'bad',
      'last@example.com',
    ]);
    expect(body.results[0]).toMatchObject({ account: 'would-create', status: 'pending' });
    expect(body.results[1]).toEqual({ email: 'second@example.com', skipped: 'unknown status: unknown' });
    expect(body.results[2]).toEqual({ email: null, skipped: 'missing email' });
    expect(body.results[3]).toEqual({ email: 'bad', skipped: 'invalid email' });
    expect(body.results[4]).toMatchObject({ account: 'would-create', status: 'revoked' });
  });
});

function adminRequest(path, token, { method = 'GET', body } = {}) {
  const headers = {};
  if (token) headers['Cf-Access-Jwt-Assertion'] = token;
  const init = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return new Request(`https://services.solstone.app${path}`, init);
}

async function primeAdminAuth(token, testEnv) {
  const response = await worker.fetch(adminRequest('/admin/scouts', token), testEnv);
  expect(response.status).toBe(200);
}

function installProvisioningMock({
  projectId = 'test-gcp-project',
  keyString = 'migrated-google-key',
  failCreate = () => false,
} = {}) {
  let createCount = 0;
  return installGcpFetchMock({
    'POST oauth2.googleapis.com/token': async () => jsonResponse({
      access_token: 'gcp-access-token',
      expires_in: 3600,
      token_type: 'Bearer',
    }),
    default: async ({ method, url }) => {
      const keyListPath = `/v2/projects/${projectId}/locations/global/keys`;
      if (method === 'GET' && url.host === 'apikeys.googleapis.com' && url.pathname === keyListPath) {
        return jsonResponse({ keys: [] });
      }
      if (method === 'POST' && url.host === 'apikeys.googleapis.com' && url.pathname === keyListPath) {
        if (failCreate()) return new Response('create failed', { status: 500 });
        createCount += 1;
        return jsonResponse({ name: `operations/create-migrated-key-${createCount}` });
      }
      if (
        method === 'GET' &&
        url.host === 'apikeys.googleapis.com' &&
        url.pathname.startsWith('/v2/operations/create-migrated-key-')
      ) {
        const suffix = url.pathname.split('-').pop();
        return jsonResponse({
          done: true,
          response: { name: `projects/${projectId}/locations/global/keys/migrated-key-${suffix}` },
        });
      }
      if (
        method === 'GET' &&
        url.host === 'apikeys.googleapis.com' &&
        url.pathname.startsWith(`/v2/projects/${projectId}/locations/global/keys/migrated-key-`) &&
        url.pathname.endsWith('/keyString')
      ) {
        return jsonResponse({ keyString });
      }
      throw new Error(`unhandled provisioning mock: ${method} ${url.href}`);
    },
  });
}

async function countCoreRows() {
  return {
    accounts: await rowCount('accounts'),
    account_emails: await rowCount('account_emails'),
    scout_applications: await rowCount('scout_applications'),
    provisioned_keys: await rowCount('provisioned_keys'),
  };
}

function createKeyPosts(calls) {
  return calls.filter((call) => (
    call.method === 'POST' &&
    call.url.host === 'apikeys.googleapis.com' &&
    call.url.pathname.endsWith('/keys')
  ));
}

function byEmail(body, email) {
  return body.results.find((row) => row.email === email);
}

async function expectJsonError(response, status, error) {
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toEqual({ error });
}

async function applicationRow(accountId) {
  return workerEnv.DB
    .prepare(
      `SELECT account_id, status, use_case, data_acked_at, applied_at,
              approved_at, revoked_at, created_at, updated_at
       FROM scout_applications
       WHERE account_id = ?`
    )
    .bind(accountId)
    .first();
}

async function activeKeyCount(accountId) {
  const row = await workerEnv.DB
    .prepare(
      `SELECT COUNT(*) AS count
       FROM provisioned_keys
       WHERE account_id = ?
         AND provider = 'gemini'
         AND revoked_at IS NULL
         AND key_string_encrypted != ''`
    )
    .bind(accountId)
    .first();
  return row.count;
}

async function passkeyRow(credentialId) {
  return workerEnv.DB
    .prepare('SELECT * FROM passkey_credentials WHERE credential_id = ?')
    .bind(credentialId)
    .first();
}

async function passkeyRowsForAccount(accountId) {
  const { results } = await workerEnv.DB
    .prepare('SELECT * FROM passkey_credentials WHERE account_id = ? ORDER BY credential_id')
    .bind(accountId)
    .all();
  return results || [];
}

async function accountHandle(accountId) {
  const row = await workerEnv.DB
    .prepare('SELECT passkey_user_handle FROM accounts WHERE id = ?')
    .bind(accountId)
    .first();
  return row?.passkey_user_handle ?? null;
}

async function setAccountHandle(accountId, handle) {
  await workerEnv.DB
    .prepare('UPDATE accounts SET passkey_user_handle = ? WHERE id = ?')
    .bind(handle, accountId)
    .run();
}

function b64u(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
