import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { createDeletionProof, markDeletionProofVerified } from '../src/db.js';
import { makeTestEnv, resetDb, seedAccount, seedSession } from './helpers.js';

describe('deletion routes', () => {
  beforeEach(resetDb);

  it('renders the exact request heading and owner-controlled-data boundary', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const response = await worker.fetch(request('/account/delete', { cookie: session.cookie }), testEnv);
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain('<h1>delete sign-in and your services</h1>');
    expect(body).toContain('does not delete a journal, device, or bucket you control');
  });

  it('rejects a deletion proof request without an exact origin', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const response = await worker.fetch(request('/account/delete/proof/otp', { cookie: session.cookie, method: 'POST', form: { purpose: 'delete' }, origin: 'https://services.solstone.app.evil.test' }), testEnv);
    expect(response.status).toBe(403);
    expect(await count('account_deletion_proofs')).toBe(0);
  });

  it('derives the deleting owner from the session and issues a receipt cookie', async () => {
    const testEnv = makeTestEnv();
    const owner = await seedAccount({ testEnv });
    const other = await seedAccount({ email: 'other@example.com', testEnv });
    const session = await seedSession(owner.accountId, { testEnv });
    await createDeletionProof(workerEnv.DB, {
      tokenHash: 'proof', accountId: owner.accountId, sessionIdHash: session.idHash, purpose: 'delete', method: 'otp',
      issuedAt: Date.now(), expiresAt: Date.now() + 60_000, otpCodeHash: 'hash',
    });
    await markDeletionProofVerified(workerEnv.DB, { tokenHash: 'proof', nowMs: Date.now() });
    const response = await worker.fetch(request('/account/delete/confirm', {
      cookie: session.cookie, method: 'POST', form: { account_id: other.accountId },
    }), testEnv);
    const row = await workerEnv.DB.prepare('SELECT account_id, phase FROM account_deletions').first();
    expect(response.status).toBe(303);
    expect(response.headers.get('Set-Cookie')).toMatch(/^account_deletion_status=[A-Za-z0-9_-]+;/);
    expect(row).toMatchObject({ account_id: owner.accountId, phase: 'frozen' });
  });

  it('rejects cancellation after purging without restoring access', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await workerEnv.DB.prepare(
      "INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, cancellation_deadline_at, status_token_hash) VALUES ('op', ?, 'purging', 1, 2, 'status')"
    ).bind(account.accountId).run();
    const response = await worker.fetch(request('/account/delete/cancel', { cookie: session.cookie, method: 'POST' }), testEnv);
    expect(response.status).toBe(409);
    await expect(workerEnv.DB.prepare("SELECT phase FROM account_deletions WHERE operation_id = 'op'").first()).resolves.toMatchObject({ phase: 'purging' });
  });

  it('returns a clean conflict for a duplicate confirm', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await workerEnv.DB.prepare(
      "INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, cancellation_deadline_at, status_token_hash) VALUES ('active', ?, 'frozen', 1, 2, 'status')"
    ).bind(account.accountId).run();
    await createDeletionProof(workerEnv.DB, {
      tokenHash: 'duplicate-proof', accountId: account.accountId, sessionIdHash: session.idHash, purpose: 'delete', method: 'otp',
      issuedAt: Date.now(), expiresAt: Date.now() + 60_000, otpCodeHash: 'hash',
    });
    await markDeletionProofVerified(workerEnv.DB, { tokenHash: 'duplicate-proof', nowMs: Date.now() });
    const response = await worker.fetch(request('/account/delete/confirm', { cookie: session.cookie, method: 'POST' }), testEnv);
    expect(response.status).toBe(409);
  });
});

function request(path, { cookie, method = 'GET', form, origin = 'https://services.solstone.app' } = {}) {
  const headers = { Cookie: cookie };
  const init = { method, headers };
  if (method === 'POST') {
    headers.Origin = origin;
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = new URLSearchParams(form || {}).toString();
  }
  return new Request(`https://services.solstone.app${path}`, init);
}

async function count(table) {
  const row = await workerEnv.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
  return row.count;
}
