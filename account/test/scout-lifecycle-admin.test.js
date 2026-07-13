import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  makeTestEnv,
  resetDb,
  rowCount,
  seedAccount,
  seedScoutApplication,
} from './helpers.js';
import { installJwksStub, mintToken } from './jwks-helper.js';

const NOW = 1_780_100_200_300;

describe('admin Scout lifecycle contracts', () => {
  beforeEach(async () => {
    await resetDb();
    await installJwksStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ['preapprove', 'absent', 'approved', 'invitation'],
    ['preapprove', 'pending', 'approved', 'application_approved'],
    ['preapprove', 'revoked', 'approved', 'eligibility_restored'],
    ['approve', 'pending', 'approved', 'application_approved'],
    ['revoke', 'pending', 'revoked', 'owner_request'],
    ['revoke', 'approved', 'revoked', 'security_response'],
  ])('uses one timestamp for %s %s to %s', async (action, fromStatus, toStatus, reasonCode) => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const token = await mintToken({ payload: { email: 'Operator@Example.COM' } });
    const testEnv = makeTestEnv();
    let account;
    let response;
    if (action === 'preapprove') {
      const email = `${fromStatus}-time@example.com`;
      if (fromStatus !== 'absent') {
        account = await seedAccount({ email, testEnv });
        await seedScoutApplication({
          accountId: account.accountId,
          status: fromStatus,
          applied_at: fromStatus === 'pending' ? 1_000 : null,
          revoked_at: fromStatus === 'revoked' ? 1_000 : null,
        });
      }
      response = await worker.fetch(adminRequest('/admin/scouts/pre-approve', token, {
        method: 'POST',
        body: { email, reason_code: reasonCode },
      }), testEnv);
    } else {
      account = await seedAccount({ email: `${action}-${fromStatus}-time@example.com`, testEnv });
      await seedScoutApplication({
        accountId: account.accountId,
        status: fromStatus,
        applied_at: fromStatus === 'pending' ? 1_000 : null,
        approved_at: fromStatus === 'approved' ? 1_000 : null,
      });
      response = await worker.fetch(adminRequest(`/admin/scouts/${account.accountId}/${action}`, token, {
        method: 'POST',
        body: { reason_code: reasonCode },
      }), testEnv);
    }

    const body = await expectStatusResponse(response, account?.accountId, toStatus, true);
    const row = await applicationRow(body.account_id);
    const event = await eventRow(body.account_id, 1);
    expect(event).toMatchObject({
      action,
      from_status: fromStatus,
      to_status: toStatus,
      actor_kind: 'operator',
      actor_principal: 'operator@example.com',
      reason_code: reasonCode,
      occurred_at: NOW,
    });
    expect(event.occurred_at).toBe(row.updated_at);
    if (toStatus === 'approved') expect(event.occurred_at).toBe(row.approved_at);
    if (toStatus === 'revoked') expect(event.occurred_at).toBe(row.revoked_at);
    if (fromStatus === 'absent') {
      expect(row.applied_at).toBeNull();
      expect(event.occurred_at).toBe(row.created_at);
    }
  });

  it('records service common_name as a service actor principal', async () => {
    const token = await mintToken({ payload: { common_name: 'scout-automation' } });
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'pending', applied_at: 1_000 });

    const response = await worker.fetch(adminRequest(`/admin/scouts/${account.accountId}/approve`, token, {
      method: 'POST',
      body: { reason_code: 'operator_correction' },
    }), testEnv);

    await expectStatusResponse(response, account.accountId, 'approved', true);
    await expect(eventRow(account.accountId, 1)).resolves.toMatchObject({
      actor_kind: 'service',
      actor_principal: 'scout-automation',
    });
  });

  it.each([
    ['missing token', null],
    ['dual claims', { email: 'operator@example.com', common_name: 'automation' }],
    ['empty email', { email: '' }],
    ['empty common name', { common_name: '' }],
    ['whitespace email', { email: '   ' }],
    ['whitespace common name', { common_name: '   ' }],
  ])('rejects %s before reason validation or database work', async (_name, payload) => {
    const token = payload === null ? null : await mintToken({ payload });
    const response = await worker.fetch(adminRequest('/admin/scouts/not-an-account/approve', token, {
      method: 'POST',
      body: null,
    }), makeTestEnv());

    expect(response.status).toBe(403);
    expect(await response.text()).toBe('{"error":"cloudflare access required"}');
    await expect(rowCount('scout_lifecycle_events')).resolves.toBe(0);
  });

  it('validates preapprove email before reason and reason before account creation', async () => {
    const token = await mintToken();
    const badEmail = await worker.fetch(adminRequest('/admin/scouts/pre-approve', token, {
      method: 'POST',
      body: { email: 'not-an-email', reason_code: 'not-valid' },
    }), makeTestEnv());
    expect(badEmail.status).toBe(400);
    expect(await badEmail.text()).toBe('{"error":"valid email required"}');

    const badReason = await worker.fetch(adminRequest('/admin/scouts/pre-approve', token, {
      method: 'POST',
      body: { email: 'valid@example.com', reason_code: 'not-valid' },
    }), makeTestEnv());
    await expectInvalidReason(badReason);
    await expect(rowCount('accounts')).resolves.toBe(0);
    await expect(rowCount('account_emails')).resolves.toBe(0);
  });

  it.each(['approve', 'revoke'])('requires a known %s reason before application lookup', async (action) => {
    const token = await mintToken();
    const response = await worker.fetch(adminRequest(`/admin/scouts/unknown/${action}`, token, {
      method: 'POST',
      body: { reason_code: 'not-valid' },
    }), makeTestEnv());

    await expectInvalidReason(response);
  });

  it('rejects a known reason that is incompatible with the freshly read state', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'incompatible@example.com', testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'pending', applied_at: 1_000 });
    const before = await applicationRow(account.accountId);

    const response = await worker.fetch(adminRequest('/admin/scouts/pre-approve', token, {
      method: 'POST',
      body: { email: 'incompatible@example.com', reason_code: 'invitation' },
    }), testEnv);

    await expectInvalidReason(response);
    await expect(applicationRow(account.accountId)).resolves.toEqual(before);
    await expect(rowCount('scout_lifecycle_events')).resolves.toBe(0);
  });

  it('accepts a union-valid reason on approved preapprove without rewriting the row', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'approved-preapprove@example.com', testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 1_000 });
    const before = await applicationRow(account.accountId);

    const response = await worker.fetch(adminRequest('/admin/scouts/pre-approve', token, {
      method: 'POST',
      body: { email: 'approved-preapprove@example.com', reason_code: 'eligibility_restored' },
    }), testEnv);

    await expectStatusResponse(response, account.accountId, 'approved', false);
    await expect(applicationRow(account.accountId)).resolves.toEqual(before);
    await expect(rowCount('scout_lifecycle_events')).resolves.toBe(0);
    await expect(workerEnv.DB
      .prepare("SELECT status FROM entitlements WHERE account_id = ? AND service = 'spl_hosted'")
      .bind(account.accountId)
      .first()).resolves.toEqual({ status: 'active' });
  });

  it('does no downstream work when revoke is already revoked', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'revoked', revoked_at: 1_000 });
    const before = await applicationRow(account.accountId);

    const response = await worker.fetch(adminRequest(`/admin/scouts/${account.accountId}/revoke`, token, {
      method: 'POST',
      body: { reason_code: 'owner_request' },
    }), failOnPrepare(testEnv, /FROM entitlements|FROM provisioned_keys/i));

    await expectStatusResponse(response, account.accountId, 'revoked', false);
    await expect(applicationRow(account.accountId)).resolves.toEqual(before);
    await expect(rowCount('scout_lifecycle_events')).resolves.toBe(0);
  });

  it('returns the transition envelope for status reads, account creation, and CAS failures', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'pending', applied_at: 1_000 });

    const readFailure = await worker.fetch(adminRequest(`/admin/scouts/${account.accountId}/approve`, token, {
      method: 'POST',
      body: { reason_code: 'application_approved' },
    }), failOnPrepare(testEnv, /FROM scout_applications\s+WHERE account_id/i));
    await expectTransitionUnavailable(readFailure);

    const createFailure = await worker.fetch(adminRequest('/admin/scouts/pre-approve', token, {
      method: 'POST',
      body: { email: 'create-failure@example.com', reason_code: 'invitation' },
    }), failOnPrepare(testEnv, /INSERT INTO accounts/i));
    await expectTransitionUnavailable(createFailure);

    const batchFailure = await worker.fetch(adminRequest(`/admin/scouts/${account.accountId}/approve`, token, {
      method: 'POST',
      body: { reason_code: 'application_approved' },
    }), failAllBatches(testEnv));
    await expectTransitionUnavailable(batchFailure);
    await expect(applicationRow(account.accountId)).resolves.toMatchObject({ status: 'pending' });
    await expect(rowCount('scout_lifecycle_events')).resolves.toBe(0);
  });

  it('reports a synchronous downstream failure after a committed transition', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'pending', applied_at: 1_000 });

    const response = await worker.fetch(adminRequest(`/admin/scouts/${account.accountId}/approve`, token, {
      method: 'POST',
      body: { reason_code: 'application_approved' },
    }), failOnPrepare(testEnv, /FROM entitlements/i));
    const event = await eventRow(account.accountId, 1);

    expect(response.status).toBe(500);
    expect(await response.text()).toBe(JSON.stringify({
      error: 'Scout lifecycle downstream work unavailable',
      code: 'scout_lifecycle_downstream_unavailable',
      transition_committed: true,
      correlation_id: event.correlation_id,
    }));
    await expect(applicationRow(account.accountId)).resolves.toMatchObject({ status: 'approved' });
  });

  it('reports a synchronous downstream failure truthfully on an idempotent no-op', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 1_000 });
    const before = await applicationRow(account.accountId);

    const response = await worker.fetch(adminRequest(`/admin/scouts/${account.accountId}/approve`, token, {
      method: 'POST',
      body: { reason_code: 'operator_correction' },
    }), failOnPrepare(testEnv, /FROM entitlements/i));

    expect(response.status).toBe(500);
    expect(await response.text()).toBe('{"error":"Scout lifecycle downstream work unavailable","code":"scout_lifecycle_downstream_unavailable","transition_committed":false,"correlation_id":null}');
    await expect(applicationRow(account.accountId)).resolves.toEqual(before);
    await expect(rowCount('scout_lifecycle_events')).resolves.toBe(0);
  });

  it('re-reads after a deterministic CAS miss and answers from the new state', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'pending', applied_at: 1_000 });
    const racedEnv = mutateBeforeFirstBatch(testEnv, async () => {
      await testEnv.DB
        .prepare("UPDATE scout_applications SET status = 'approved', approved_at = ?, updated_at = ? WHERE account_id = ?")
        .bind(2_000, 2_000, account.accountId)
        .run();
    });

    const response = await worker.fetch(adminRequest(`/admin/scouts/${account.accountId}/approve`, token, {
      method: 'POST',
      body: { reason_code: 'application_approved' },
    }), racedEnv);

    await expectStatusResponse(response, account.accountId, 'approved', false);
    await expect(rowCount('scout_lifecycle_events')).resolves.toBe(0);
  });

  it('returns transition unavailable after three forced CAS misses', async () => {
    const token = await mintToken();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedScoutApplication({ accountId: account.accountId, status: 'pending', applied_at: 1_000 });
    const { env, batchCalls } = missEveryBatch(testEnv);

    const response = await worker.fetch(adminRequest(`/admin/scouts/${account.accountId}/approve`, token, {
      method: 'POST',
      body: { reason_code: 'application_approved' },
    }), env);

    await expectTransitionUnavailable(response);
    expect(batchCalls()).toBe(3);
    await expect(applicationRow(account.accountId)).resolves.toMatchObject({ status: 'pending' });
    await expect(rowCount('scout_lifecycle_events')).resolves.toBe(0);
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

async function expectStatusResponse(response, accountId, status, committed) {
  const text = await response.text();
  const body = JSON.parse(text);
  expect(response.status).toBe(200);
  expect(body).toEqual({
    account_id: accountId ?? body.account_id,
    status,
    correlation_id: committed ? expect.stringMatching(/^[0-9a-f-]{36}$/i) : null,
  });
  expect(text).toBe(JSON.stringify({
    account_id: body.account_id,
    status,
    correlation_id: body.correlation_id,
  }));
  return body;
}

async function expectInvalidReason(response) {
  expect(response.status).toBe(400);
  expect(await response.text()).toBe('{"error":"valid Scout lifecycle reason_code required","code":"invalid_scout_lifecycle_reason"}');
}

async function expectTransitionUnavailable(response) {
  expect(response.status).toBe(500);
  expect(await response.text()).toBe('{"error":"Scout lifecycle transition unavailable","code":"scout_lifecycle_transition_unavailable"}');
}

async function applicationRow(accountId) {
  return workerEnv.DB.prepare('SELECT * FROM scout_applications WHERE account_id = ?').bind(accountId).first();
}

async function eventRow(accountId, sequence) {
  return workerEnv.DB
    .prepare('SELECT * FROM scout_lifecycle_events WHERE account_id = ? AND sequence = ?')
    .bind(accountId, sequence)
    .first();
}

function failOnPrepare(testEnv, pattern) {
  return {
    ...testEnv,
    DB: {
      prepare(sql) {
        if (pattern.test(sql)) throw new Error('injected query failure');
        return testEnv.DB.prepare(sql);
      },
      batch: (statements) => testEnv.DB.batch(statements),
    },
  };
}

function failAllBatches(testEnv) {
  return {
    ...testEnv,
    DB: {
      prepare: (...args) => testEnv.DB.prepare(...args),
      batch() {
        throw new Error('injected batch failure');
      },
    },
  };
}

function mutateBeforeFirstBatch(testEnv, mutate) {
  let first = true;
  return {
    ...testEnv,
    DB: {
      prepare: (...args) => testEnv.DB.prepare(...args),
      async batch(statements) {
        if (first) {
          first = false;
          await mutate();
        }
        return testEnv.DB.batch(statements);
      },
    },
  };
}

function missEveryBatch(testEnv) {
  let calls = 0;
  return {
    env: {
      ...testEnv,
      DB: {
        prepare: (...args) => testEnv.DB.prepare(...args),
        batch() {
          calls += 1;
          return Promise.resolve([{ results: [] }, { results: [] }]);
        },
      },
    },
    batchCalls: () => calls,
  };
}
