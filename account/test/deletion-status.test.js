import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { hashWithPepper } from '../src/crypto.js';
import { DELETION_STATUS_SIGN_IN_LINE as SIGN_IN_LINE, DELETION_STATUS_SIGN_IN_LINK as SIGN_IN_LINK } from '../src/html.js';
import { makeTestEnv, resetDb, seedAccount, seedSession } from './helpers.js';

const NEXT_RETRY = Date.parse('2024-12-03T12:00:00.000Z');

describe('deletion status', () => {
  beforeEach(resetDb);

  it('names delayed relay cleanup and the scheduled retry date', async () => {
    const env = makeTestEnv();
    await deletion(env, { operationId: 'relay-op' });
    await workerEnv.DB.prepare(
      `INSERT INTO account_deletion_service_ops (
         id, operation_id, service, state, attempt_count
       ) VALUES ('relay-service-op', 'relay-op', 'relay', 'pending', 1)`
    ).run();

    const response = await statusRequest(env);

    expect(await response.text()).toContain('relay cleanup delayed; next retry 2024-12-03');
  });

  it('names delayed backup cleanup when service cleanup is terminal', async () => {
    const env = makeTestEnv();
    await deletion(env, { operationId: 'backup-op', stripePurgeState: 'deleted' });

    const response = await statusRequest(env);

    expect(await response.text()).toContain('backup cleanup delayed; next retry 2024-12-03');
  });

  it('names a pending service reconciliation and the scheduled retry date', async () => {
    const env = makeTestEnv();
    await deletion(env, {
      operationId: 'reconciliation-op',
      lastErrorCode: 'service_reconciliation_pending',
    });

    const response = await statusRequest(env);

    expect(await response.text()).toContain('service reconciliation pending; next retry 2024-12-03');
  });

  it('names delayed billing cleanup after backup is verified empty', async () => {
    const env = makeTestEnv();
    await deletion(env, {
      operationId: 'stripe-op',
      backupEmptyVerifiedAt: NEXT_RETRY - 1,
      stripePurgeState: 'retryable',
    });

    const response = await statusRequest(env);

    expect(await response.text()).toContain('billing cleanup delayed; next retry 2024-12-03');
  });

  it('uses the lowercase unavailable message when no receipt is present', async () => {
    const env = makeTestEnv();

    const response = await worker.fetch(new Request('https://services.solstone.app/account/delete/status'), env);

    expect(await response.text()).toContain('deletion status unavailable');
  });

  it('returns a non-identifying expired link response for a presented unknown receipt', async () => {
    const env = makeTestEnv();

    const response = await statusRequest(env);

    expect(response.status).toBe(410);
    const body = await response.text();
    expect(body).toContain('expired link');
    expect(body).not.toContain('deletion status unavailable');
  });

  it('offers cancellation only to the matching signed-in owner while the hold is open', async () => {
    const env = makeTestEnv();
    const owner = await seedAccount({ testEnv: env });
    const other = await seedAccount({ email: 'other@example.com', testEnv: env });
    const ownerSession = await seedSession(owner.accountId, { testEnv: env });
    const otherSession = await seedSession(other.accountId, { testEnv: env });
    await workerEnv.DB.prepare(
      `INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, cancellation_deadline_at, status_token_hash)
       VALUES ('hold', ?, 'frozen', ?, ?, ?)`
    ).bind(owner.accountId, Date.now(), Date.now() + 60_000, await hashWithPepper('status-token', env)).run();

    const statusOnlyResponse = await statusRequest(env);
    const statusOnlyBody = await statusOnlyResponse.text();
    expect(statusOnlyResponse.headers.get('Cache-Control')).toBe('no-store');
    expect(statusOnlyBody).toContain('<div class="card">');
    expect(statusOnlyBody).not.toContain('href="/account/delete"');
    expect(statusOnlyBody).not.toContain('href="/transparency"');
    expect(statusOnlyBody).not.toContain('class="usermenu"');
    expect(await (await statusRequest(env, otherSession.cookie)).text()).not.toContain('href="/account/delete"');
    const ownerResponse = await statusRequest(env, ownerSession.cookie);
    expect(ownerResponse.headers.get('Cache-Control')).toBe('no-store');
    expect(await ownerResponse.text()).toContain('href="/account/delete">cancel deletion request</a>');

    await workerEnv.DB.prepare("UPDATE account_deletions SET cancellation_deadline_at = 0 WHERE operation_id = 'hold'").run();
    expect(await (await statusRequest(env, ownerSession.cookie)).text()).not.toContain('href="/account/delete"');
  });

  it('does not restore signed-in pages from the old session during the hold', async () => {
    const env = makeTestEnv();
    env.OWNER_EXPORT_ENABLED = 'true';
    const owner = await seedAccount({ email: 'deleting@example.com', testEnv: env });
    const session = await seedSession(owner.accountId, { testEnv: env });
    await workerEnv.DB.prepare(
      `INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, cancellation_deadline_at, status_token_hash)
       VALUES ('hold', ?, 'frozen', ?, ?, ?)`
    ).bind(owner.accountId, Date.now(), Date.now() + 60_000, await hashWithPepper('status-token', env)).run();

    const signIn = await worker.fetch(new Request('https://services.solstone.app/sign-in', {
      headers: { Cookie: session.cookie },
    }), env);
    expect(signIn.status).toBe(303);
    expect(signIn.headers.get('Set-Cookie')).toContain('Max-Age=0');

    const transparency = await worker.fetch(new Request('https://services.solstone.app/transparency', {
      headers: { Cookie: session.cookie },
    }), env);
    expect(transparency.headers.get('Cache-Control')).toBe('no-store');
    const body = await transparency.text();
    expect(body).not.toContain('deleting@example.com');
    expect(body).not.toContain('class="usermenu"');

    const statusCookie = 'account_deletion_status=status-token';
    for (const path of ['/account/delete', '/account/export']) {
      const response = await worker.fetch(new Request(`https://services.solstone.app${path}`, {
        headers: { Cookie: statusCookie },
      }), env);
      expect(response.status).toBe(303);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
    const statusOnlyTransparency = await worker.fetch(new Request('https://services.solstone.app/transparency', {
      headers: { Cookie: statusCookie },
    }), env);
    const statusOnlyBody = await statusOnlyTransparency.text();
    expect(statusOnlyTransparency.headers.get('Cache-Control')).toBe('no-store');
    expect(statusOnlyBody).not.toContain('deleting@example.com');
    expect(statusOnlyBody).not.toContain('class="usermenu"');
  });

  it('tells a receipt-only viewer they can sign in again to cancel while the hold is open', async () => {
    const env = makeTestEnv();
    const owner = await seedAccount({ testEnv: env });
    await holdDeletion(env, owner.accountId, { phase: 'frozen' });

    const response = await statusRequest(env);
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain('waiting for the safety period');
    expect(body).toContain(SIGN_IN_LINE);
    expect(body).toContain(SIGN_IN_LINK);
    expect(body).not.toContain('cancel deletion request');
    expect(body).not.toContain('href="/account/delete"');

    await workerEnv.DB.prepare("UPDATE account_deletions SET phase = 'requested' WHERE operation_id = 'hold'").run();
    const requested = await (await statusRequest(env)).text();
    expect(requested).toContain('access ended');
    expect(requested).toContain(SIGN_IN_LINK);
  });

  it('the sign-in link opens the sign-in form for a receipt-only viewer', async () => {
    const env = makeTestEnv();
    const owner = await seedAccount({ testEnv: env });
    await holdDeletion(env, owner.accountId, { phase: 'frozen' });

    const response = await worker.fetch(new Request('https://services.solstone.app/?signin', {
      headers: { Cookie: 'account_deletion_status=status-token' },
    }), env);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('name="email"');
  });

  it('shows the cancel button instead of the sign-in line to the signed-in owner', async () => {
    const env = makeTestEnv();
    const owner = await seedAccount({ testEnv: env });
    const session = await seedSession(owner.accountId, { testEnv: env });
    await holdDeletion(env, owner.accountId, { phase: 'frozen' });

    const body = await (await statusRequest(env, session.cookie)).text();
    expect(body).toContain('href="/account/delete">cancel deletion request</a>');
    expect(body).not.toContain(SIGN_IN_LINE);
    expect(body).not.toContain(SIGN_IN_LINK);
  });

  it('does not offer sign-in once the safety period has ended', async () => {
    const env = makeTestEnv();
    const owner = await seedAccount({ testEnv: env });
    const session = await seedSession(owner.accountId, { testEnv: env });
    await holdDeletion(env, owner.accountId, { phase: 'frozen', deadline: Date.now() - 1 });

    for (const cookie of ['', session.cookie]) {
      const body = await (await statusRequest(env, cookie)).text();
      expect(body).toContain('waiting for the safety period');
      expect(body).not.toContain(SIGN_IN_LINK);
      expect(body).not.toContain('cancel deletion request');
    }
  });

  it('does not offer sign-in while purging, once canceled, complete, or expired', async () => {
    const env = makeTestEnv();
    const owner = await seedAccount({ testEnv: env });
    await holdDeletion(env, owner.accountId, { phase: 'purging' });
    await workerEnv.DB.prepare("UPDATE account_deletions SET lease_token = 'lease' WHERE operation_id = 'hold'").run();
    const purging = await (await statusRequest(env)).text();
    expect(purging).toContain('deletion in progress');
    expect(purging).not.toContain(SIGN_IN_LINK);

    await workerEnv.DB.prepare("UPDATE account_deletions SET phase = 'cancelled', lease_token = NULL WHERE operation_id = 'hold'").run();
    const cancelled = await (await statusRequest(env)).text();
    expect(cancelled).toContain('deletion request canceled');
    expect(cancelled).not.toContain(SIGN_IN_LINK);

    await workerEnv.DB.prepare('DELETE FROM account_deletions').run();
    await workerEnv.DB.prepare(
      `INSERT INTO account_deletion_completions (token_hash, state, completed_at, expires_at)
       VALUES (?, 'complete', ?, ?)`
    ).bind(await hashWithPepper('status-token', env), Date.now(), Date.now() + 60_000).run();
    const complete = await (await statusRequest(env)).text();
    expect(complete).toContain('complete');
    expect(complete).not.toContain(SIGN_IN_LINK);

    await workerEnv.DB.prepare('UPDATE account_deletion_completions SET expires_at = 0').run();
    const expired = await statusRequest(env);
    expect(expired.status).toBe(410);
    expect(await expired.text()).not.toContain(SIGN_IN_LINK);
  });

  it('shows the canceled verdict on the existing status link', async () => {
    const env = makeTestEnv();
    const account = await seedAccount({ testEnv: env });
    await workerEnv.DB.prepare(
      `INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, cancellation_deadline_at, status_token_hash)
       VALUES ('canceled', ?, 'cancelled', 0, 0, ?)`
    ).bind(account.accountId, await hashWithPepper('status-token', env)).run();

    const response = await statusRequest(env);
    expect(await response.text()).toContain('deletion request canceled');
  });
});

async function deletion(env, {
  operationId,
  backupEmptyVerifiedAt = null,
  stripePurgeState = null,
  lastErrorCode = null,
} = {}) {
  await workerEnv.DB.prepare(
    `INSERT INTO account_deletions (
       operation_id, account_id, phase, requested_at, cancellation_deadline_at,
       next_attempt_at, backup_empty_verified_at, stripe_purge_state, last_error_code, status_token_hash
     ) VALUES (?, 'account', 'purging', 0, 0, ?, ?, ?, ?, ?)`
  ).bind(
    operationId,
    NEXT_RETRY,
    backupEmptyVerifiedAt,
    stripePurgeState,
    lastErrorCode,
    await hashWithPepper('status-token', env)
  ).run();
}

async function holdDeletion(env, accountId, { phase, deadline = Date.now() + 60_000 }) {
  await workerEnv.DB.prepare(
    `INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, cancellation_deadline_at, status_token_hash)
     VALUES ('hold', ?, ?, ?, ?, ?)`
  ).bind(accountId, phase, Date.now(), deadline, await hashWithPepper('status-token', env)).run();
}

function statusRequest(env, sessionCookie = '') {
  return worker.fetch(new Request('https://services.solstone.app/account/delete/status', {
    headers: { Cookie: `account_deletion_status=status-token; ${sessionCookie}` },
  }), env);
}
