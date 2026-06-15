import { createExecutionContext, env as workerEnv, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { hashWithPepper } from '../src/crypto.js';
import { COMP_ENTITLED_THROUGH, SPL_HOSTED_SERVICE } from '../src/relay-grant.js';
import {
  makeTestEnv,
  resetDb,
  rowCount,
  seedAccount,
  seedEntitlement,
  seedScoutApplication,
  seedSplBinding,
} from './helpers.js';
import {
  installJwksStub,
  installJwksStubWith,
  mintToken,
} from './jwks-helper.js';

describe('admin scout endpoints', () => {
  beforeEach(async () => {
    await resetDb();
    await installJwksStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('requires valid CF Access for scout routes', async () => {
    await expectJsonError(
      await worker.fetch(adminRequest('/admin/scouts'), makeTestEnv()),
      403,
      'cloudflare access required'
    );

    const badToken = await mintToken({ badSignature: true });
    await expectJsonError(
      await worker.fetch(adminRequest('/admin/scouts', badToken), makeTestEnv()),
      403,
      'cloudflare access required'
    );
  });

  it('accepts human-email and service-token principals', async () => {
    const humanToken = await mintToken();
    const serviceToken = await mintToken({ payload: { common_name: 'service-token' } });

    await expectScoutListOk(humanToken);
    await expectScoutListOk(serviceToken);
  });

  it('opens only named scout POST routes', async () => {
    const token = await mintToken();

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
      await worker.fetch(adminRequest('/admin/scouts/pre-approve', token), makeTestEnv()),
      404,
      'scout route not found'
    );
    await expectJsonError(
      await worker.fetch(adminRequest('/admin/scouts', token, { method: 'DELETE' }), makeTestEnv()),
      404,
      'scout route not found'
    );
  });

  it('lists scout applications with status filter, primary email, timestamps, and active_key', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const active = await seedAccount({ email: 'active@example.com', nowMs: 1_000, testEnv });
    const placeholder = await seedAccount({ email: 'placeholder@example.com', nowMs: 2_000, testEnv });
    const revoked = await seedAccount({ email: 'revoked@example.com', nowMs: 3_000, testEnv });

    await seedScoutApplication({
      accountId: active.accountId,
      status: 'approved',
      approved_at: 4_000,
      createdAt: 10_000,
    });
    await seedScoutApplication({
      accountId: placeholder.accountId,
      status: 'pending',
      applied_at: 5_000,
      createdAt: 20_000,
    });
    await seedScoutApplication({
      accountId: revoked.accountId,
      status: 'revoked',
      revoked_at: 6_000,
      createdAt: 30_000,
    });
    await seedProvisionedKey({ accountId: active.accountId, keyStringEncrypted: 'non-empty-key' });
    await seedProvisionedKey({ accountId: placeholder.accountId, keyStringEncrypted: '' });
    await seedProvisionedKey({ accountId: revoked.accountId, keyStringEncrypted: 'revoked-key', revokedAt: 7_000 });

    const response = await worker.fetch(adminRequest('/admin/scouts', token), testEnv);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.scouts).toHaveLength(3);
    expect(body.scouts.find((row) => row.account_id === active.accountId)).toMatchObject({
      account_id: active.accountId,
      primary_email: 'active@example.com',
      status: 'approved',
      applied_at: null,
      approved_at: new Date(4_000).toISOString(),
      revoked_at: null,
      active_key: true,
    });
    expect(body.scouts.find((row) => row.account_id === placeholder.accountId)).toMatchObject({
      primary_email: 'placeholder@example.com',
      status: 'pending',
      applied_at: new Date(5_000).toISOString(),
      approved_at: null,
      revoked_at: null,
      active_key: false,
    });
    expect(body.scouts.find((row) => row.account_id === revoked.accountId)).toMatchObject({
      primary_email: 'revoked@example.com',
      status: 'revoked',
      revoked_at: new Date(6_000).toISOString(),
      active_key: false,
    });

    const filtered = await worker.fetch(adminRequest('/admin/scouts?status=approved', token), testEnv);
    const filteredBody = await filtered.json();
    expect(filtered.status).toBe(200);
    expect(filteredBody.scouts.map((row) => row.account_id)).toEqual([active.accountId]);
  });

  it('keeps list rows when primary email decryption fails', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'corrupt@example.com', nowMs: 1_000, testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 2_000 });
    await workerEnv.DB
      .prepare('UPDATE account_emails SET address_encrypted = ? WHERE account_id = ?')
      .bind('not-valid-ciphertext', account.accountId)
      .run();

    const response = await worker.fetch(adminRequest('/admin/scouts', token), testEnv);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.scouts).toHaveLength(1);
    expect(body.scouts[0]).toMatchObject({
      account_id: account.accountId,
      primary_email: null,
      status: 'approved',
    });
  });

  it('approves pending applications and preserves approved/revoked semantics without touching keys or GCP', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const pending = await seedAccount({ email: 'pending@example.com', nowMs: 1_000, testEnv });
    const approved = await seedAccount({ email: 'approved@example.com', nowMs: 2_000, testEnv });
    const revoked = await seedAccount({ email: 'revoked@example.com', nowMs: 3_000, testEnv });
    await seedScoutApplication({ accountId: pending.accountId, status: 'pending', applied_at: 4_000 });
    await seedScoutApplication({ accountId: approved.accountId, status: 'approved', approved_at: 5_000 });
    await seedScoutApplication({ accountId: revoked.accountId, status: 'revoked', revoked_at: 6_000 });
    const approvedBefore = await applicationRow(approved.accountId);
    const revokedBefore = await applicationRow(revoked.accountId);
    const keyCountBefore = await rowCount('provisioned_keys');

    const pendingResponse = await worker.fetch(
      adminRequest(`/admin/scouts/${pending.accountId}/approve`, token, { method: 'POST' }),
      testEnv
    );
    expect(pendingResponse.status).toBe(200);
    await expect(pendingResponse.json()).resolves.toEqual({ account_id: pending.accountId, status: 'approved' });
    const pendingAfter = await applicationRow(pending.accountId);
    expect(pendingAfter.status).toBe('approved');
    expect(pendingAfter.approved_at).toBeGreaterThan(0);

    const approvedResponse = await worker.fetch(
      adminRequest(`/admin/scouts/${approved.accountId}/approve`, token, { method: 'POST' }),
      testEnv
    );
    expect(approvedResponse.status).toBe(200);
    await expect(approvedResponse.json()).resolves.toEqual({ account_id: approved.accountId, status: 'approved' });
    await expect(applicationRow(approved.accountId)).resolves.toEqual(approvedBefore);

    const revokedResponse = await worker.fetch(
      adminRequest(`/admin/scouts/${revoked.accountId}/approve`, token, { method: 'POST' }),
      testEnv
    );
    expect(revokedResponse.status).toBe(409);
    expect(await revokedResponse.json()).toEqual({ error: 'revoked is terminal; use pre-approve' });
    await expect(applicationRow(revoked.accountId)).resolves.toEqual(revokedBefore);

    await expectJsonError(
      await worker.fetch(
        adminRequest('/admin/scouts/unknown-account/approve', token, { method: 'POST' }),
        testEnv
      ),
      404,
      'scout application not found'
    );
    await expect(rowCount('provisioned_keys')).resolves.toBe(keyCountBefore);
    expectNoGoogleFetches();
  });

  it('approves a scout with an spl binding, writes comp entitlement, and pushes relay grant', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'approve-comp@example.com', nowMs: 1_000, testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'pending', applied_at: 2_000 });
    await seedSplBinding({ accountId: account.accountId });
    const { calls } = await installJwksRelayRecorder();
    const ctx = createExecutionContext();

    const response = await worker.fetch(
      adminRequest(`/admin/scouts/${account.accountId}/approve`, token, { method: 'POST' }),
      testEnv,
      ctx
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ account_id: account.accountId, status: 'approved' });
    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'active',
      source: 'comp',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({
      instance_id: '11111111-1111-1111-1111-111111111111',
      entitled_until: COMP_ENTITLED_THROUGH,
    });
  });

  it('revokes pending and approved applications without touching keys or GCP', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const pending = await seedAccount({ email: 'pending-revoke@example.com', nowMs: 1_000, testEnv });
    const approved = await seedAccount({ email: 'approved-revoke@example.com', nowMs: 2_000, testEnv });
    await seedScoutApplication({ accountId: pending.accountId, status: 'pending', applied_at: 3_000 });
    await seedScoutApplication({ accountId: approved.accountId, status: 'approved', approved_at: 4_000 });
    const keyCountBefore = await rowCount('provisioned_keys');

    const pendingResponse = await worker.fetch(
      adminRequest(`/admin/scouts/${pending.accountId}/revoke`, token, { method: 'POST' }),
      testEnv
    );
    expect(pendingResponse.status).toBe(200);
    await expect(pendingResponse.json()).resolves.toEqual({ account_id: pending.accountId, status: 'revoked' });
    const pendingAfter = await applicationRow(pending.accountId);
    expect(pendingAfter.status).toBe('revoked');
    expect(pendingAfter.revoked_at).toBeGreaterThan(0);

    const approvedResponse = await worker.fetch(
      adminRequest(`/admin/scouts/${approved.accountId}/revoke`, token, { method: 'POST' }),
      testEnv
    );
    expect(approvedResponse.status).toBe(200);
    await expect(approvedResponse.json()).resolves.toEqual({ account_id: approved.accountId, status: 'revoked' });

    const beforeSecond = await applicationRow(approved.accountId);
    const secondResponse = await worker.fetch(
      adminRequest(`/admin/scouts/${approved.accountId}/revoke`, token, { method: 'POST' }),
      testEnv
    );
    expect(secondResponse.status).toBe(200);
    await expect(secondResponse.json()).resolves.toEqual({ account_id: approved.accountId, status: 'revoked' });
    await expect(applicationRow(approved.accountId)).resolves.toEqual(beforeSecond);

    await expectJsonError(
      await worker.fetch(
        adminRequest('/admin/scouts/unknown-account/revoke', token, { method: 'POST' }),
        testEnv
      ),
      404,
      'scout application not found'
    );
    await expect(rowCount('provisioned_keys')).resolves.toBe(keyCountBefore);
    expectNoGoogleFetches();
  });

  it('revokes a comp-only scout, lapses entitlement, and pushes zero relay grant', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'revoke-comp@example.com', nowMs: 1_000, testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 2_000 });
    await seedEntitlement({
      accountId: account.accountId,
      status: 'active',
      currentPeriodEnd: null,
      source: 'comp',
      sourceRef: null,
    });
    await seedSplBinding({ accountId: account.accountId });
    const { calls } = await installJwksRelayRecorder();
    const ctx = createExecutionContext();

    const response = await worker.fetch(
      adminRequest(`/admin/scouts/${account.accountId}/revoke`, token, { method: 'POST' }),
      testEnv,
      ctx
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ account_id: account.accountId, status: 'revoked' });
    await expect(applicationRow(account.accountId)).resolves.toMatchObject({ status: 'revoked' });
    await expect(entitlementRow(account.accountId)).resolves.toMatchObject({
      status: 'lapsed',
      source: 'comp',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({
      instance_id: '11111111-1111-1111-1111-111111111111',
      entitled_until: 0,
    });
  });

  it('revokes an approved scout and turns off its active Gemini key', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'approved-active-key@example.com', nowMs: 1_000, testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 2_000 });
    const seededKey = await seedProvisionedKey({
      accountId: account.accountId,
      keyStringEncrypted: 'active-key',
      revokedAt: null,
    });
    const deleted = [];
    await installJwksStubWith(async (input, init = {}) => {
      const href = typeof input === 'string' ? input : input.url;
      const url = new URL(href);
      const method = (init.method || 'GET').toUpperCase();
      if (method === 'POST' && url.host === 'oauth2.googleapis.com' && url.pathname === '/token') {
        return jsonResponse({
          access_token: 'gcp-access-token',
          expires_in: 3600,
          token_type: 'Bearer',
        });
      }
      if (
        method === 'DELETE' &&
        url.host === 'apikeys.googleapis.com' &&
        url.pathname === `/v2/${seededKey.keyResourceName}`
      ) {
        deleted.push(seededKey.keyResourceName);
        return new Response('');
      }
      return null;
    });
    installImmediateTimeout();
    const ctx = createExecutionContext();
    const waitSpy = vi.spyOn(ctx, 'waitUntil');

    const response = await worker.fetch(
      adminRequest(`/admin/scouts/${account.accountId}/revoke`, token, { method: 'POST' }),
      testEnv,
      ctx
    );
    await waitOnExecutionContext(ctx);
    const application = await applicationRow(account.accountId);
    const keyRow = await provisionedKeyRow(seededKey.id);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ account_id: account.accountId, status: 'revoked' });
    expect(application.status).toBe('revoked');
    expect(keyRow.revoked_at).toBeGreaterThan(0);
    // Gemini delete and entitlement relay sync both schedule work.
    expect(waitSpy).toHaveBeenCalledTimes(2);
    expect(deleted).toEqual([seededKey.keyResourceName]);
  });

  it('revokes an approved scout whose key is already revoked without scheduling a GCP delete', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'approved-revoked-key@example.com', nowMs: 1_000, testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 2_000 });
    await seedProvisionedKey({
      accountId: account.accountId,
      keyStringEncrypted: 'already-revoked-key',
      revokedAt: 3_000,
    });
    await installJwksStubWith();
    const ctx = createExecutionContext();
    const waitSpy = vi.spyOn(ctx, 'waitUntil');

    const response = await worker.fetch(
      adminRequest(`/admin/scouts/${account.accountId}/revoke`, token, { method: 'POST' }),
      testEnv,
      ctx
    );
    await waitOnExecutionContext(ctx);
    const application = await applicationRow(account.accountId);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ account_id: account.accountId, status: 'revoked' });
    expect(application.status).toBe('revoked');
    // Entitlement relay sync still runs; no Gemini delete is scheduled.
    expect(waitSpy).toHaveBeenCalledTimes(1);
    expectNoGoogleFetches();
  });

  it('pre-approves fresh emails with verified primary email and approved application', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const response = await worker.fetch(
      adminRequest('/admin/scouts/pre-approve', token, {
        method: 'POST',
        body: { email: 'Fresh@Example.com' },
      }),
      testEnv
    );
    const body = await response.json();
    const emailHash = await hashWithPepper('fresh@example.com', testEnv);
    const emailRow = await emailByHash(emailHash);
    const application = await applicationRow(body.account_id);

    expect(response.status).toBe(200);
    expect(body).toEqual({ account_id: body.account_id, status: 'approved' });
    expect(await rowCount('accounts')).toBe(1);
    expect(await rowCount('account_emails')).toBe(1);
    expect(await rowCount('scout_applications')).toBe(1);
    expect(emailRow.account_id).toBe(body.account_id);
    expect(emailRow.primary_email_id).toBe(emailRow.id);
    expect(emailRow.is_primary).toBe(1);
    expect(emailRow.verified_at).toBeGreaterThan(0);
    expect(application.status).toBe('approved');
    expect(application.approved_at).toBeGreaterThan(0);
    expect(application.data_acked_at).toBeNull();
  });

  it('pre-approves fresh emails with a comp entitlement row', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();

    const response = await worker.fetch(
      adminRequest('/admin/scouts/pre-approve', token, {
        method: 'POST',
        body: { email: 'Comped@Example.com' },
      }),
      testEnv
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ account_id: body.account_id, status: 'approved' });
    await expect(entitlementRow(body.account_id)).resolves.toMatchObject({
      status: 'active',
      source: 'comp',
    });
  });

  it('pre-approve reuses existing accounts and transitions pending or revoked applications', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const existing = await seedAccount({ email: 'existing@example.com', nowMs: 1_000, testEnv });
    const pending = await seedAccount({ email: 'pending-owner@example.com', nowMs: 2_000, testEnv });
    const revoked = await seedAccount({ email: 'revoked-owner@example.com', nowMs: 3_000, testEnv });
    await seedScoutApplication({ accountId: pending.accountId, status: 'pending', applied_at: 4_000 });
    await seedScoutApplication({ accountId: revoked.accountId, status: 'revoked', revoked_at: 5_000 });

    const existingResponse = await preApprove(token, 'existing@example.com', testEnv);
    expect(existingResponse.status).toBe(200);
    await expect(existingResponse.json()).resolves.toEqual({ account_id: existing.accountId, status: 'approved' });
    expect(await rowCount('accounts')).toBe(3);
    expect(await rowCount('account_emails')).toBe(3);
    expect(await applicationRow(existing.accountId)).toMatchObject({
      account_id: existing.accountId,
      status: 'approved',
      revoked_at: null,
    });

    const pendingResponse = await preApprove(token, 'pending-owner@example.com', testEnv);
    expect(pendingResponse.status).toBe(200);
    const pendingAfter = await applicationRow(pending.accountId);
    expect(pendingAfter.status).toBe('approved');
    expect(pendingAfter.approved_at).toBeGreaterThan(0);

    const revokedResponse = await preApprove(token, 'revoked-owner@example.com', testEnv);
    expect(revokedResponse.status).toBe(200);
    const revokedAfter = await applicationRow(revoked.accountId);
    expect(revokedAfter.status).toBe('approved');
    expect(revokedAfter.revoked_at).toBeNull();
  });

  it('pre-approve handles concurrent identity creation for the same fresh email', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();

    const responses = await Promise.all([
      preApprove(token, 'race@example.com', testEnv),
      preApprove(token, 'race@example.com', testEnv),
    ]);
    const bodies = await Promise.all(responses.map((response) => response.json()));

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(bodies[0].account_id).toBe(bodies[1].account_id);
    expect(await rowCount('accounts')).toBe(1);
    expect(await rowCount('account_emails')).toBe(1);
    expect(await rowCount('scout_applications')).toBe(1);
    await expect(applicationRow(bodies[0].account_id)).resolves.toMatchObject({
      status: 'approved',
      revoked_at: null,
    });
  });

  it('rejects malformed pre-approve email without writes', async () => {
    const token = await mintToken();
    const response = await worker.fetch(
      adminRequest('/admin/scouts/pre-approve', token, {
        method: 'POST',
        body: { email: 'not-an-email' },
      }),
      makeTestEnv()
    );

    await expectJsonError(response, 400, 'valid email required');
    expect(await rowCount('accounts')).toBe(0);
    expect(await rowCount('account_emails')).toBe(0);
    expect(await rowCount('scout_applications')).toBe(0);
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

async function expectScoutListOk(token) {
  const response = await worker.fetch(adminRequest('/admin/scouts', token), makeTestEnv());
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ scouts: [] });
}

async function expectJsonError(response, status, error) {
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toEqual({ error });
}

async function seedProvisionedKey({
  accountId,
  keyStringEncrypted,
  revokedAt = null,
}) {
  const id = crypto.randomUUID();
  const keyResourceName = `projects/test/locations/global/keys/${id}`;
  await workerEnv.DB
    .prepare(
      `INSERT INTO provisioned_keys (
         id, account_id, provider, display_name, key_resource_name,
         key_string_encrypted, created_at, revoked_at
       ) VALUES (?, ?, 'gemini', ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      accountId,
      `display-${id}`,
      keyResourceName,
      keyStringEncrypted,
      1_000,
      revokedAt
    )
    .run();
  return { id, keyResourceName };
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

async function entitlementRow(accountId) {
  return workerEnv.DB
    .prepare('SELECT account_id, service, status, current_period_end, source, source_ref, updated_at FROM entitlements WHERE account_id = ? AND service = ?')
    .bind(accountId, SPL_HOSTED_SERVICE)
    .first();
}

async function provisionedKeyRow(id) {
  return workerEnv.DB
    .prepare('SELECT id, key_resource_name, revoked_at FROM provisioned_keys WHERE id = ?')
    .bind(id)
    .first();
}

async function emailByHash(addressLowerHash) {
  return workerEnv.DB
    .prepare(
      `SELECT ae.id, ae.account_id, ae.is_primary, ae.verified_at, a.primary_email_id
       FROM account_emails ae
       JOIN accounts a ON a.id = ae.account_id
       WHERE ae.address_lower_hash = ?`
    )
    .bind(addressLowerHash)
    .first();
}

function preApprove(token, email, testEnv) {
  return worker.fetch(
    adminRequest('/admin/scouts/pre-approve', token, {
      method: 'POST',
      body: { email },
    }),
    testEnv
  );
}

function expectNoGoogleFetches() {
  const calls = globalThis.fetch?.mock?.calls || [];
  const googleCall = calls.find(([input]) => {
    const href = typeof input === 'string' ? input : input.url;
    const host = new URL(href).host;
    return host.includes('googleapis.com');
  });
  expect(googleCall).toBeUndefined();
}

function installImmediateTimeout() {
  return vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback) => {
    callback();
    return 1;
  });
}

async function installJwksRelayRecorder() {
  const calls = [];
  await installJwksStubWith(async (input, init = {}) => {
    const href = typeof input === 'string' ? input : input.url;
    const url = new URL(href);
    const method = (init.method || 'GET').toUpperCase();
    if (method === 'POST' && url.host === 'link.solstone.app' && url.pathname === '/admin/entitlement') {
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ method, url, init, body });
      return jsonResponse({ ok: true });
    }
    return null;
  });
  return { calls };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
