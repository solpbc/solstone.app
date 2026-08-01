import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeConsistencyWarnings } from '../src/admin.js';
import worker from '../src/index.js';
import {
  fetchWithCtx,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedAccountEmail,
  seedCredential,
  seedEntitlement,
  seedScoutApplication,
  seedSession,
} from './helpers.js';
import { installJwksStub, mintToken } from './jwks-helper.js';

const PROJECTION_UNAVAILABLE_TEXT =
  '{"error":"owner sign-in projection unavailable","code":"owner_signin_projection_unavailable"}';

describe('admin owner sign-in projection', () => {
  beforeEach(async () => {
    await resetDb();
    await installJwksStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('projects absent, pending, approved, and revoked scout statuses in list and detail', async () => {
    const testEnv = makeTestEnv();
    const token = await mintToken();
    const absent = await seedAccount({ email: 'absent@example.com', nowMs: 1_000, testEnv });
    const pending = await seedAccount({ email: 'pending@example.com', nowMs: 2_000, testEnv });
    const approved = await seedAccount({ email: 'approved@example.com', nowMs: 3_000, testEnv });
    const revoked = await seedAccount({ email: 'revoked@example.com', nowMs: 4_000, testEnv });

    await seedScoutApplication({
      accountId: pending.accountId,
      status: 'pending',
      applied_at: 10_000,
      createdAt: 10_000,
    });
    await seedScoutApplication({
      accountId: approved.accountId,
      status: 'approved',
      applied_at: 20_000,
      approved_at: 21_000,
      createdAt: 20_000,
    });
    await seedScoutApplication({
      accountId: revoked.accountId,
      status: 'revoked',
      applied_at: 30_000,
      approved_at: 31_000,
      revoked_at: 32_000,
      createdAt: 30_000,
    });

    const list = await adminJson('/admin/accounts', token, testEnv);
    const listStatuses = Object.fromEntries(list.accounts.map((row) => [row.id, row.scout_status]));
    expect(listStatuses).toEqual({
      [absent.accountId]: 'absent',
      [pending.accountId]: 'pending',
      [approved.accountId]: 'approved',
      [revoked.accountId]: 'revoked',
    });

    const absentDetail = await adminJson(`/admin/accounts/${absent.accountId}`, token, testEnv);
    const pendingDetail = await adminJson(`/admin/accounts/${pending.accountId}`, token, testEnv);
    const approvedDetail = await adminJson(`/admin/accounts/${approved.accountId}`, token, testEnv);
    const revokedDetail = await adminJson(`/admin/accounts/${revoked.accountId}`, token, testEnv);
    expect(absentDetail.scout).toEqual({
      status: 'absent',
      applied_at: null,
      approved_at: null,
      revoked_at: null,
    });
    expect(pendingDetail.scout).toEqual({
      status: 'pending',
      applied_at: new Date(10_000).toISOString(),
      approved_at: null,
      revoked_at: null,
    });
    expect(approvedDetail.scout).toEqual({
      status: 'approved',
      applied_at: new Date(20_000).toISOString(),
      approved_at: new Date(21_000).toISOString(),
      revoked_at: null,
    });
    expect(revokedDetail.scout).toEqual({
      status: 'revoked',
      applied_at: new Date(30_000).toISOString(),
      approved_at: new Date(31_000).toISOString(),
      revoked_at: new Date(32_000).toISOString(),
    });
    for (const detail of [absentDetail, pendingDetail, approvedDetail, revokedDetail]) {
      expect(detail.scout).not.toHaveProperty('legacy_gemini_key');
    }
  });

  it('returns all hosted services in exact order when no entitlements exist', async () => {
    const testEnv = makeTestEnv();
    const token = await mintToken();
    const account = await seedAccount({ email: 'no-entitlements@example.com', testEnv });

    const body = await adminJson(`/admin/accounts/${account.accountId}`, token, testEnv);

    expect(body.service_entitlements).toEqual([
      { service: 'spl_hosted', status: null, source_basis: 'none' },
      { service: 'spb_hosted', status: null, source_basis: 'none' },
      { service: 'spp_hosted', status: null, source_basis: 'none' },
    ]);
  });

  it('maps entitlement source basis while preserving every status', async () => {
    const testEnv = makeTestEnv();
    const token = await mintToken();
    const first = await seedAccount({ email: 'entitlement-matrix-one@example.com', testEnv });
    const second = await seedAccount({ email: 'entitlement-matrix-two@example.com', testEnv });
    await seedEntitlement({ accountId: first.accountId, service: 'spl_hosted', status: 'active', source: 'comp' });
    await seedEntitlement({ accountId: first.accountId, service: 'spb_hosted', status: 'past_due' });
    await seedEntitlement({ accountId: first.accountId, service: 'spp_hosted', status: 'lapsed', source: 'comp' });
    await seedEntitlement({ accountId: second.accountId, service: 'spl_hosted', status: 'canceled' });
    await seedEntitlement({ accountId: second.accountId, service: 'spb_hosted', status: 'lapsed' });

    expect((await adminJson(`/admin/accounts/${first.accountId}`, token, testEnv)).service_entitlements).toEqual([
      { service: 'spl_hosted', status: 'active', source_basis: 'complimentary' },
      { service: 'spb_hosted', status: 'past_due', source_basis: 'paid' },
      { service: 'spp_hosted', status: 'lapsed', source_basis: 'complimentary' },
    ]);
    expect((await adminJson(`/admin/accounts/${second.accountId}`, token, testEnv)).service_entitlements).toEqual([
      { service: 'spl_hosted', status: 'canceled', source_basis: 'paid' },
      { service: 'spb_hosted', status: 'lapsed', source_basis: 'paid' },
      { service: 'spp_hosted', status: null, source_basis: 'none' },
    ]);
  });

  it('returns ordered consistency warnings for projection disagreements', async () => {
    const testEnv = makeTestEnv();
    const token = await mintToken();
    const approvedMissing = await approvedAccount('warnings-approved-missing@example.com', testEnv);
    const approvedPaidSpl = await approvedAccount('warnings-approved-paid-spl@example.com', testEnv);
    const approvedCompAll = await approvedAccount('warnings-approved-comp-all@example.com', testEnv);
    const approvedPastDue = await approvedAccount('warnings-approved-past-due@example.com', testEnv);
    const approvedCompLapsed = await approvedAccount('warnings-approved-comp-lapsed@example.com', testEnv);
    const pending = await seedAccount({ email: 'warnings-pending@example.com', testEnv });
    const revoked = await seedAccount({ email: 'warnings-revoked@example.com', testEnv });
    const absent = await seedAccount({ email: 'warnings-absent@example.com', testEnv });
    const agreeing = await seedAccount({ email: 'warnings-agreeing@example.com', testEnv });

    await seedEntitlement({ accountId: approvedPaidSpl.accountId, service: 'spl_hosted', status: 'active' });
    for (const service of ['spl_hosted', 'spb_hosted', 'spp_hosted']) {
      await seedEntitlement({ accountId: approvedCompAll.accountId, service, status: 'active', source: 'comp' });
    }
    await seedEntitlement({ accountId: approvedPastDue.accountId, service: 'spl_hosted', status: 'past_due' });
    await seedEntitlement({ accountId: approvedCompLapsed.accountId, service: 'spl_hosted', status: 'lapsed', source: 'comp' });
    await seedEntitlement({ accountId: approvedCompLapsed.accountId, service: 'spb_hosted', status: 'active', source: 'comp' });
    await seedEntitlement({ accountId: approvedCompLapsed.accountId, service: 'spp_hosted', status: 'active', source: 'comp' });
    await seedScoutApplication({ accountId: pending.accountId, status: 'pending', applied_at: 5_000 });
    await seedScoutApplication({
      accountId: revoked.accountId,
      status: 'revoked',
      applied_at: 6_000,
      approved_at: 7_000,
      revoked_at: 8_000,
    });
    await seedEntitlement({ accountId: pending.accountId, service: 'spb_hosted', status: 'active', source: 'comp' });
    await seedEntitlement({ accountId: revoked.accountId, service: 'spl_hosted', status: 'active', source: 'comp' });
    await seedEntitlement({ accountId: absent.accountId, service: 'spp_hosted', status: 'active', source: 'comp' });

    expect((await adminJson(`/admin/accounts/${approvedMissing.accountId}`, token, testEnv)).consistency_warnings).toEqual([
      'approved_scout_missing_entitlement:spl_hosted',
      'approved_scout_missing_entitlement:spb_hosted',
      'approved_scout_missing_entitlement:spp_hosted',
    ]);
    expect((await adminJson(`/admin/accounts/${approvedPaidSpl.accountId}`, token, testEnv)).consistency_warnings).toEqual([
      'approved_scout_missing_entitlement:spb_hosted',
      'approved_scout_missing_entitlement:spp_hosted',
    ]);
    expect((await adminJson(`/admin/accounts/${approvedCompAll.accountId}`, token, testEnv)).consistency_warnings).toEqual([]);
    expect((await adminJson(`/admin/accounts/${approvedPastDue.accountId}`, token, testEnv)).consistency_warnings).toEqual([
      'approved_scout_missing_entitlement:spb_hosted',
      'approved_scout_missing_entitlement:spp_hosted',
    ]);
    expect((await adminJson(`/admin/accounts/${approvedCompLapsed.accountId}`, token, testEnv)).consistency_warnings).toEqual([
      'approved_scout_missing_entitlement:spl_hosted',
    ]);
    expect((await adminJson(`/admin/accounts/${pending.accountId}`, token, testEnv)).consistency_warnings).toEqual([
      'nonapproved_scout_active_complimentary_entitlement:spb_hosted',
    ]);
    expect((await adminJson(`/admin/accounts/${revoked.accountId}`, token, testEnv)).consistency_warnings).toEqual([
      'nonapproved_scout_active_complimentary_entitlement:spl_hosted',
    ]);
    expect((await adminJson(`/admin/accounts/${absent.accountId}`, token, testEnv)).consistency_warnings).toEqual([
      'nonapproved_scout_active_complimentary_entitlement:spp_hosted',
    ]);
    expect((await adminJson(`/admin/accounts/${agreeing.accountId}`, token, testEnv)).consistency_warnings).toEqual([]);
  });

  it('computes warning rules directly in hosted-service order', () => {
    expect(computeConsistencyWarnings('approved', {
      spl_hosted: { status: 'active', source: 'stripe' },
      spb_hosted: { status: 'lapsed', source: 'comp' },
    })).toEqual([
      'approved_scout_missing_entitlement:spb_hosted',
      'approved_scout_missing_entitlement:spp_hosted',
    ]);
    expect(computeConsistencyWarnings('pending', {
      spb_hosted: { status: 'active', source: 'comp' },
      spp_hosted: { status: 'active', source: 'comp' },
    })).toEqual([
      'nonapproved_scout_active_complimentary_entitlement:spb_hosted',
      'nonapproved_scout_active_complimentary_entitlement:spp_hosted',
    ]);
    expect(computeConsistencyWarnings('approved', {
      spl_hosted: { status: 'past_due', source: 'stripe' },
      spb_hosted: { status: 'active', source: 'comp' },
      spp_hosted: { status: 'active', source: 'comp' },
    })).toEqual([]);
  });

  it('returns equivalent detail by uuid, primary email, and secondary email', async () => {
    const testEnv = makeTestEnv();
    const token = await mintToken();
    const account = await seedAccount({ email: 'equivalent-primary@example.com', nowMs: 1_000, testEnv });
    await seedAccountEmail({
      accountId: account.accountId,
      address: 'equivalent-secondary@example.com',
      createdAt: 2_000,
      testEnv,
    });
    await seedScoutApplication({ accountId: account.accountId, status: 'pending', applied_at: 3_000 });
    await seedEntitlement({ accountId: account.accountId, service: 'spl_hosted', status: 'past_due' });
    await seedEntitlement({ accountId: account.accountId, service: 'spb_hosted', status: 'lapsed', source: 'comp' });

    const byUuid = await adminJson(`/admin/accounts/${account.accountId}`, token, testEnv);
    const byPrimary = await adminJson('/admin/accounts/equivalent-primary@example.com', token, testEnv);
    const bySecondary = await adminJson('/admin/accounts/equivalent-secondary@example.com', token, testEnv);

    expect(byPrimary).toEqual(byUuid);
    expect(bySecondary).toEqual(byUuid);
  });

  it('returns projection-unavailable when the list query fails', async () => {
    await expectProjectionUnavailable('/admin/accounts', (sql) => /n_passkeys/i.test(sql));
  });

  it('returns projection-unavailable when detail account resolution fails', async () => {
    await expectProjectionUnavailable(
      '/admin/accounts/00000000-0000-0000-0000-000000000001',
      (sql) => /SELECT id, primary_email_id, created_at, last_signin_at FROM accounts WHERE id = \?/i.test(sql)
    );
  });

  it('returns projection-unavailable when the detail scout lookup fails', async () => {
    const account = await seedAccount({ email: 'fault-scout@example.com', testEnv: makeTestEnv() });
    await expectProjectionUnavailable(
      `/admin/accounts/${account.accountId}`,
      (sql) => /FROM scout_applications/i.test(sql)
    );
  });

  it('returns projection-unavailable when the detail entitlement lookup fails', async () => {
    const account = await seedAccount({ email: 'fault-entitlement@example.com', testEnv: makeTestEnv() });
    await expectProjectionUnavailable(
      `/admin/accounts/${account.accountId}`,
      (sql) => /SELECT service, status, source\s+FROM entitlements/i.test(sql)
    );
  });

  it('keeps unknown uuid and email detail requests as account-not-found 404s', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();

    await expectAccountNotFound(
      await worker.fetch(adminRequest('/admin/accounts/00000000-0000-0000-0000-000000000001', token), testEnv)
    );
    await expectAccountNotFound(
      await worker.fetch(adminRequest('/admin/accounts/unknown@example.com', token), testEnv)
    );
  });

  it('preserves every pre-projection list and detail field exactly', async () => {
    const testEnv = makeTestEnv();
    const token = await mintToken();
    const account = await seedAccount({ email: 'compat-primary@example.com', nowMs: 1_000, testEnv });
    const secondary = await seedAccountEmail({
      accountId: account.accountId,
      address: 'compat-secondary@example.com',
      verifiedAt: null,
      createdAt: 2_000,
      testEnv,
    });
    await seedCredential({ accountId: account.accountId, credentialId: 'compat-passkey', createdAt: 3_000 });
    const sessionNow = Date.now();
    const session = await seedSession(account.accountId, { nowMs: sessionNow, testEnv });

    const list = await adminJson('/admin/accounts', token, testEnv);
    const { scout_status: scoutStatus, ...priorListRow } = list.accounts.find((row) => row.id === account.accountId);
    expect(scoutStatus).toBe('absent');
    expect(priorListRow).toEqual({
      id: account.accountId,
      primary_email: 'compat-primary@example.com',
      n_passkeys: 1,
      n_sessions: 1,
      n_emails: 2,
      created_at: new Date(1_000).toISOString(),
      last_signin_at: new Date(1_000).toISOString(),
    });

    const detail = await adminJson(`/admin/accounts/${account.accountId}`, token, testEnv);
    const {
      scout,
      service_entitlements: serviceEntitlements,
      consistency_warnings: consistencyWarnings,
      ...priorDetail
    } = detail;
    expect(scout.status).toBe('absent');
    expect(serviceEntitlements).toHaveLength(3);
    expect(consistencyWarnings).toEqual([]);
    expect(priorDetail).toEqual({
      account: {
        id: account.accountId,
        primary_email: 'compat-primary@example.com',
        created_at: new Date(1_000).toISOString(),
        last_signin_at: new Date(1_000).toISOString(),
      },
      emails: [
        {
          id: account.accountEmailId,
          address: 'compat-primary@example.com',
          is_primary: true,
          verified_at: new Date(1_000).toISOString(),
          created_at: new Date(1_000).toISOString(),
        },
        {
          id: secondary.id,
          address: 'compat-secondary@example.com',
          is_primary: false,
          verified_at: null,
          created_at: new Date(2_000).toISOString(),
        },
      ],
      passkeys: [
        {
          credential_id: 'compat-passkey',
          friendly_name: null,
          aaguid_label: null,
          created_at: new Date(3_000).toISOString(),
          last_used_at: null,
          revoked_at: null,
        },
      ],
      sessions: [
        {
          id_hash: session.idHash,
          ua_label: 'unknown device',
          ip_trunc: null,
          created_at: new Date(sessionNow).toISOString(),
          last_active_at: new Date(sessionNow).toISOString(),
          expires_at: new Date(sessionNow + 14 * 24 * 60 * 60 * 1000).toISOString(),
          revoked_at: null,
        },
      ],
    });
  });

  it('does not expose sensitive scout or entitlement fields', async () => {
    const testEnv = makeTestEnv();
    const token = await mintToken();
    const account = await seedAccount({ email: 'sensitive@example.com', testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 1_000 });
    await workerEnv.DB
      .prepare('UPDATE scout_applications SET use_case = ?, data_acked_at = ? WHERE account_id = ?')
      .bind('SENSITIVE_USE_CASE', 123, account.accountId)
      .run();
    await seedEntitlement({
      accountId: account.accountId,
      service: 'spl_hosted',
      status: 'active',
      sourceRef: 'sub_seeded',
    });

    const response = await worker.fetch(adminRequest(`/admin/accounts/${account.accountId}`, token), testEnv);
    const text = await response.text();

    expect(response.status).toBe(200);
    for (const value of [
      'SENSITIVE_USE_CASE',
      'sub_seeded',
      'use_case',
      'data_acked_at',
      'source_ref',
      'current_period_end',
      'enabled_at',
    ]) {
      expect(text).not.toContain(value);
    }
    expect(JSON.parse(text).scout).not.toHaveProperty('legacy_gemini_key');
  });

  it('leaves scout and entitlement records unchanged during detail reads', async () => {
    const testEnv = makeTestEnv();
    const token = await mintToken();
    const account = await seedAccount({ email: 'read-only@example.com', testEnv });
    await seedScoutApplication({
      accountId: account.accountId,
      status: 'approved',
      applied_at: 1_000,
      approved_at: 2_000,
      createdAt: 1_000,
    });
    await seedEntitlement({
      accountId: account.accountId,
      service: 'spl_hosted',
      status: 'active',
      source: 'comp',
      updatedAt: 3_000,
    });
    const before = await projectionDbState(account.accountId);

    await adminJson(`/admin/accounts/${account.accountId}`, token, testEnv);

    expect(await projectionDbState(account.accountId)).toEqual(before);
  });
});

async function approvedAccount(email, testEnv) {
  const account = await seedAccount({ email, testEnv });
  await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 1_000 });
  return account;
}

async function expectProjectionUnavailable(path, shouldThrow) {
  const token = await mintToken();
  const baseEnv = makeTestEnv();
  const throwingEnv = makeTestEnv({
    DB: {
      prepare(sql) {
        if (shouldThrow(sql)) throw new Error('query failed');
        return baseEnv.DB.prepare(sql);
      },
    },
  });

  const response = await worker.fetch(adminRequest(path, token), throwingEnv);
  const text = await response.text();
  const body = JSON.parse(text);

  expect(response.status).toBe(500);
  expect(text).toBe(PROJECTION_UNAVAILABLE_TEXT);
  expect(body).toEqual({
    error: 'owner sign-in projection unavailable',
    code: 'owner_signin_projection_unavailable',
  });
  expect(Object.keys(body)).toEqual(['error', 'code']);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('X-Frame-Options')).toBe('DENY');
}

async function expectAccountNotFound(response) {
  expect(response.status).toBe(404);
  await expect(response.json()).resolves.toEqual({ error: 'account not found' });
}

function adminRequest(path, token = null) {
  const headers = {};
  if (token) headers['Cf-Access-Jwt-Assertion'] = token;
  return new Request(`https://services.solstone.app${path}`, { headers });
}

async function adminJson(path, token, testEnv) {
  const { response } = await fetchWithCtx(worker, adminRequest(path, token), testEnv);
  expect(response.status).toBe(200);
  return response.json();
}

async function projectionDbState(accountId) {
  const [applications, entitlements, application, entitlement] = await Promise.all([
    workerEnv.DB.prepare('SELECT COUNT(*) AS count FROM scout_applications WHERE account_id = ?').bind(accountId).first(),
    workerEnv.DB.prepare('SELECT COUNT(*) AS count FROM entitlements WHERE account_id = ?').bind(accountId).first(),
    workerEnv.DB.prepare('SELECT updated_at FROM scout_applications WHERE account_id = ?').bind(accountId).first(),
    workerEnv.DB.prepare('SELECT updated_at FROM entitlements WHERE account_id = ? AND service = ?')
      .bind(accountId, 'spl_hosted')
      .first(),
  ]);
  return { applications, entitlements, application, entitlement };
}
