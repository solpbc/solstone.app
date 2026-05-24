import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  makeTestEnv,
  recordingDb,
  resetDb,
  seedAccount,
  seedAccountEmail,
  seedSession,
} from './helpers.js';

describe('settings email primary and remove actions', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  it('promotes a verified secondary email with one db.batch', async () => {
    const { account, session } = await setupAccount();
    const secondary = await seedAccountEmail({
      accountId: account.accountId,
      address: 'primary-next@example.com',
      verifiedAt: Date.now(),
    });
    const statements = [];
    const testEnv = makeTestEnv({ DB: recordingDb(workerEnv.DB, statements) });

    const response = await worker.fetch(
      settingsPost(`/sign-in/emails/${secondary.id}/make-primary`, session.cookie),
      testEnv
    );
    const rows = await accountEmailRows(account.accountId);
    const accountRow = await workerEnv.DB
      .prepare('SELECT primary_email_id FROM accounts WHERE id = ?')
      .bind(account.accountId)
      .first();

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/sign-in/emails');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(statements).toContain('[batch]');
    expect(statements.some((sql) => /SET is_primary = CASE WHEN id = \? THEN 1 ELSE 0 END/i.test(sql))).toBe(true);
    expect(statements.some((sql) => /UPDATE accounts SET primary_email_id = \? WHERE id = \?/i.test(sql))).toBe(true);
    expect(accountRow.primary_email_id).toBe(secondary.id);
    expect(rows.filter((row) => row.is_primary === 1)).toHaveLength(1);
    expect(rows.find((row) => row.id === secondary.id).is_primary).toBe(1);
  });

  it('is idempotent for the already-primary row', async () => {
    const { testEnv, account, session } = await setupAccount();
    const before = await accountEmailRows(account.accountId);

    const response = await worker.fetch(
      settingsPost(`/sign-in/emails/${account.accountEmailId}/make-primary`, session.cookie),
      testEnv
    );
    const after = await accountEmailRows(account.accountId);

    expect(response.status).toBe(303);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(after).toEqual(before);
  });

  it('does not reveal unverified, cross-account, or missing rows on make-primary', async () => {
    const { testEnv, account, session } = await setupAccount({ email: 'actor@example.com' });
    const other = await seedAccount({ email: 'other@example.com', testEnv });
    const unverified = await seedAccountEmail({
      accountId: account.accountId,
      address: 'unverified-primary@example.com',
      code: '123456',
      expiresAt: Date.now() + 600_000,
      testEnv,
    });
    const foreign = await seedAccountEmail({
      accountId: other.accountId,
      address: 'foreign-primary@example.com',
      verifiedAt: Date.now(),
      testEnv,
    });

    for (const id of [unverified.id, foreign.id, 'missing-id']) {
      const response = await worker.fetch(settingsPost(`/sign-in/emails/${id}/make-primary`, session.cookie), testEnv);
      const body = response.status === 303 ? '' : await response.text();
      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/sign-in/emails');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(body).not.toContain('cannot remove');
    }
    expect((await accountEmail(unverified.id)).is_primary).toBe(0);
    expect((await accountEmail(foreign.id)).is_primary).toBe(0);
  });

  it('uses compiled-predicate DELETE without select-before-delete', async () => {
    const { account, session } = await setupAccount();
    const onlySecondary = await seedAccountEmail({
      accountId: account.accountId,
      address: 'blocked@example.com',
      verifiedAt: Date.now(),
    });
    await workerEnv.DB
      .prepare('UPDATE account_emails SET verified_at = NULL WHERE id = ?')
      .bind(account.accountEmailId)
      .run();
    const statements = [];
    const testEnv = makeTestEnv({ DB: recordingDb(workerEnv.DB, statements) });

    const response = await worker.fetch(
      settingsPost(`/sign-in/emails/${onlySecondary.id}/remove`, session.cookie),
      testEnv
    );
    const deleteIndex = statements.findIndex((sql) => /DELETE FROM account_emails/i.test(sql));
    const existenceIndex = statements.findIndex((sql) => /SELECT id FROM account_emails WHERE id = \? AND account_id = \?/i.test(sql));

    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(deleteIndex).toBeGreaterThanOrEqual(0);
    expect(statements[deleteIndex]).toMatch(/SELECT COUNT\(\*\) FROM account_emails/i);
    expect(existenceIndex).toBeGreaterThan(deleteIndex);
  });

  it('removes verified and unverified non-primary emails when allowed', async () => {
    const { testEnv, account, session } = await setupAccount();
    const verified = await seedAccountEmail({
      accountId: account.accountId,
      address: 'remove-verified@example.com',
      verifiedAt: Date.now(),
      testEnv,
    });
    const unverified = await seedAccountEmail({
      accountId: account.accountId,
      address: 'remove-unverified@example.com',
      code: '123456',
      expiresAt: Date.now() + 600_000,
      testEnv,
    });

    const removeVerified = await worker.fetch(
      settingsPost(`/sign-in/emails/${verified.id}/remove`, session.cookie),
      testEnv
    );
    const removeUnverified = await worker.fetch(
      settingsPost(`/sign-in/emails/${unverified.id}/remove`, session.cookie),
      testEnv
    );

    expect(removeVerified.status).toBe(303);
    expect(removeVerified.headers.get('Cache-Control')).toBe('no-store');
    expect(removeUnverified.status).toBe(303);
    expect(removeUnverified.headers.get('Cache-Control')).toBe('no-store');
    expect(await accountEmail(verified.id)).toBeNull();
    expect(await accountEmail(unverified.id)).toBeNull();
  });

  it('rejects removing the only verified email or the primary email with inline error', async () => {
    const { testEnv, account, session } = await setupAccount();
    const secondary = await seedAccountEmail({
      accountId: account.accountId,
      address: 'only-secondary@example.com',
      verifiedAt: Date.now(),
      testEnv,
    });
    await workerEnv.DB
      .prepare('UPDATE account_emails SET verified_at = NULL WHERE id = ?')
      .bind(account.accountEmailId)
      .run();

    const only = await worker.fetch(settingsPost(`/sign-in/emails/${secondary.id}/remove`, session.cookie), testEnv);
    const onlyBody = await only.text();
    await workerEnv.DB
      .prepare('UPDATE account_emails SET verified_at = ? WHERE id = ?')
      .bind(Date.now(), account.accountEmailId)
      .run();
    const primary = await worker.fetch(settingsPost(`/sign-in/emails/${account.accountEmailId}/remove`, session.cookie), testEnv);
    const primaryBody = await primary.text();

    expect(only.status).toBe(403);
    expect(only.headers.get('Cache-Control')).toBe('no-store');
    expect(onlyBody).toContain('cannot remove this email');
    expect(await accountEmail(secondary.id)).not.toBeNull();
    expect(primary.status).toBe(403);
    expect(primary.headers.get('Cache-Control')).toBe('no-store');
    expect(primaryBody).toContain('cannot remove this email');
    expect(await accountEmail(account.accountEmailId)).not.toBeNull();
  });

  it('does not reveal cross-account or missing rows on remove', async () => {
    const { testEnv, account, session } = await setupAccount({ email: 'remove-actor@example.com' });
    const other = await seedAccount({ email: 'remove-other@example.com', testEnv });
    const foreign = await seedAccountEmail({
      accountId: other.accountId,
      address: 'foreign-remove@example.com',
      verifiedAt: Date.now(),
      testEnv,
    });

    for (const id of [foreign.id, 'missing-id']) {
      const response = await worker.fetch(settingsPost(`/sign-in/emails/${id}/remove`, session.cookie), testEnv);
      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/sign-in/emails');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
    expect(await accountEmail(foreign.id)).not.toBeNull();
    expect((await accountEmailRows(account.accountId))).toHaveLength(1);
  });

  it('handles concurrent remove of different verified rows', async () => {
    const { testEnv, account, session } = await setupAccount();
    await workerEnv.DB
      .prepare('UPDATE account_emails SET verified_at = NULL WHERE id = ?')
      .bind(account.accountEmailId)
      .run();
    const first = await seedAccountEmail({
      accountId: account.accountId,
      address: 'race-one@example.com',
      verifiedAt: Date.now(),
      testEnv,
    });
    const second = await seedAccountEmail({
      accountId: account.accountId,
      address: 'race-two@example.com',
      verifiedAt: Date.now(),
      testEnv,
    });

    const responses = await Promise.all([
      worker.fetch(settingsPost(`/sign-in/emails/${first.id}/remove`, session.cookie), testEnv),
      worker.fetch(settingsPost(`/sign-in/emails/${second.id}/remove`, session.cookie), testEnv),
    ]);
    const verifiedRows = await workerEnv.DB
      .prepare('SELECT id FROM account_emails WHERE account_id = ? AND verified_at IS NOT NULL')
      .bind(account.accountId)
      .all();

    expect(responses.map((response) => response.status).sort()).toEqual([303, 403]);
    expect(responses.every((response) => response.headers.get('Cache-Control') === 'no-store')).toBe(true);
    expect(verifiedRows.results || []).toHaveLength(1);
  });
});

async function setupAccount({ email = 'person@example.com' } = {}) {
  const testEnv = makeTestEnv();
  const account = await seedAccount({ email, testEnv });
  const session = await seedSession(account.accountId, { testEnv });
  return { testEnv, account, session };
}

function settingsPost(path, cookie) {
  return new Request(`https://services.solstone.app${path}`, {
    method: 'POST',
    headers: {
      Origin: 'https://services.solstone.app',
      Cookie: cookie,
    },
    body: '',
  });
}

async function accountEmailRows(accountId) {
  const { results } = await workerEnv.DB
    .prepare('SELECT id, is_primary, verified_at FROM account_emails WHERE account_id = ? ORDER BY id')
    .bind(accountId)
    .all();
  return results || [];
}

async function accountEmail(id) {
  return workerEnv.DB.prepare('SELECT * FROM account_emails WHERE id = ?').bind(id).first();
}
