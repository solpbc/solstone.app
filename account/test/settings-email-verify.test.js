import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { VERIFY_ERROR } from '../src/html.js';
import {
  emailVerifyRequest,
  makeTestEnv,
  recordingDb,
  resetDb,
  responseSnapshot,
  seedAccount,
  seedAccountEmail,
  seedSession,
} from './helpers.js';

describe('settings email verify flow', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  it('renders hidden or visible address fields from the query', async () => {
    const { testEnv, session } = await setupAccount();

    const hidden = await worker.fetch(
      settingsRequest('/sign-in/emails/verify?address=New%40Example.com', session.cookie),
      testEnv
    );
    const hiddenBody = await hidden.text();
    const visible = await worker.fetch(
      settingsRequest('/sign-in/emails/verify?address=not-an-email', session.cookie),
      testEnv
    );
    const visibleBody = await visible.text();

    expect(hidden.status).toBe(200);
    expect(hidden.headers.get('Cache-Control')).toBe('no-store');
    expect(visible.headers.get('Cache-Control')).toBe('no-store');
    expect(hiddenBody).toContain('we sent a code to <strong>new@example.com</strong>');
    expect(hiddenBody).toContain('type="hidden" name="address" value="new@example.com"');
    expect(visibleBody).toContain('enter the email address and the 6-digit code we sent you.');
    expect(visibleBody).toContain('type="email" name="address"');
  });

  it('shows already-verified notice only for an owner-scoped verified row', async () => {
    const { testEnv, account, session } = await setupAccount({ email: 'owner@example.com' });
    const other = await seedAccount({ email: 'other@example.com', testEnv });
    await seedAccountEmail({
      accountId: account.accountId,
      address: 'same@example.com',
      verifiedAt: Date.now(),
      testEnv,
    });
    await seedAccountEmail({
      accountId: other.accountId,
      address: 'foreign@example.com',
      verifiedAt: Date.now(),
      testEnv,
    });

    const same = await worker.fetch(
      settingsRequest('/sign-in/emails/verify?address=same%40example.com', session.cookie),
      testEnv
    );
    const sameBody = await same.text();
    const foreign = await worker.fetch(
      settingsRequest('/sign-in/emails/verify?address=foreign%40example.com', session.cookie),
      testEnv
    );
    const foreignBody = await foreign.text();

    expect(sameBody).toContain('this email is already verified for your sign-in.');
    expect(foreignBody).not.toContain('this email is already verified for your sign-in.');
    expect(foreignBody).toContain('name="code"');
  });

  it('verifies a correct code atomically and redirects', async () => {
    const { testEnv, account, session } = await setupAccount();
    const email = await seedAccountEmail({
      accountId: account.accountId,
      address: 'verify@example.com',
      code: '123456',
      expiresAt: Date.now() + 600_000,
      testEnv,
    });

    const response = await worker.fetch(
      emailVerifyRequest({ address: 'verify@example.com', code: '123456', cookie: session.cookie }),
      testEnv
    );
    const row = await emailRow(email.id);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/sign-in/emails');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(row.verified_at).toBeGreaterThan(0);
    expect(row.verification_code_hash).toBeNull();
    expect(row.verification_expires_at).toBeNull();
  });

  it('rejects wrong code with generic error and SQL-side attempt increment', async () => {
    const { testEnv, account, session } = await setupAccount();
    const email = await seedAccountEmail({
      accountId: account.accountId,
      address: 'wrong@example.com',
      code: '123456',
      expiresAt: Date.now() + 600_000,
      testEnv,
    });

    const response = await worker.fetch(
      emailVerifyRequest({ address: 'wrong@example.com', code: '654321', cookie: session.cookie }),
      testEnv
    );
    const body = await response.text();
    const row = await emailRow(email.id);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toContain(VERIFY_ERROR);
    expect(row.verification_attempts).toBe(1);
    expect(row.verified_at).toBeNull();
  });

  it('NULLs both code fields on the fifth wrong attempt', async () => {
    const { testEnv, account, session } = await setupAccount();
    const email = await seedAccountEmail({
      accountId: account.accountId,
      address: 'lockout@example.com',
      code: '123456',
      expiresAt: Date.now() + 600_000,
      attempts: 4,
      testEnv,
    });

    const fifth = await worker.fetch(
      emailVerifyRequest({ address: 'lockout@example.com', code: '654321', cookie: session.cookie }),
      testEnv
    );
    const row = await emailRow(email.id);
    const sixth = await worker.fetch(
      emailVerifyRequest({ address: 'lockout@example.com', code: '123456', cookie: session.cookie }),
      testEnv
    );
    const sixthBody = await sixth.text();

    expect(fifth.status).toBe(200);
    expect(row.verification_attempts).toBe(5);
    expect(row.verification_code_hash).toBeNull();
    expect(row.verification_expires_at).toBeNull();
    expect(sixth.status).toBe(200);
    expect(sixthBody).toContain(VERIFY_ERROR);
  });

  it('rejects expired, cross-account, and no-row codes generically', async () => {
    const { testEnv, account, session } = await setupAccount({ email: 'actor@example.com' });
    const other = await seedAccount({ email: 'other@example.com', testEnv });
    await seedAccountEmail({
      accountId: account.accountId,
      address: 'expired@example.com',
      code: '123456',
      expiresAt: Date.now() - 1_000,
      testEnv,
    });
    const foreignEmail = await seedAccountEmail({
      accountId: other.accountId,
      address: 'foreign@example.com',
      code: '123456',
      expiresAt: Date.now() + 600_000,
      testEnv,
    });

    const expired = await worker.fetch(
      emailVerifyRequest({ address: 'expired@example.com', code: '123456', cookie: session.cookie }),
      testEnv
    );
    const foreign = await worker.fetch(
      emailVerifyRequest({ address: 'foreign@example.com', code: '123456', cookie: session.cookie }),
      testEnv
    );
    const missing = await worker.fetch(
      emailVerifyRequest({ address: 'missing@example.com', code: '123456', cookie: session.cookie }),
      testEnv
    );
    const foreignRow = await emailRow(foreignEmail.id);

    expect(await expired.text()).toContain(VERIFY_ERROR);
    expect(await foreign.text()).toContain(VERIFY_ERROR);
    expect(await missing.text()).toContain(VERIFY_ERROR);
    expect(foreignRow.verified_at).toBeNull();
    expect(foreignRow.verification_attempts).toBe(0);
    expect(foreignRow.verification_code_hash).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('returns byte-identical errors for no row and wrong code on a live row', async () => {
    const { testEnv, account, session } = await setupAccount();
    const noRow = await worker.fetch(
      emailVerifyRequest({ address: 'same@example.com', code: '111111', cookie: session.cookie }),
      testEnv
    );
    const noRowSnapshot = await responseSnapshot(noRow);
    await seedAccountEmail({
      accountId: account.accountId,
      address: 'same@example.com',
      code: '123456',
      expiresAt: Date.now() + 600_000,
      testEnv,
    });
    const wrong = await worker.fetch(
      emailVerifyRequest({ address: 'same@example.com', code: '111111', cookie: session.cookie }),
      testEnv
    );

    expect(noRow.headers.get('Cache-Control')).toBe('no-store');
    expect(noRow.headers.has('Set-Cookie')).toBe(false);
    expect(wrong.headers.has('Set-Cookie')).toBe(false);
    expect(await responseSnapshot(wrong)).toEqual(noRowSnapshot);
  });

  it('runs hash work before live-row and no-row verify misses', async () => {
    const { testEnv, account, session } = await setupAccount();
    await seedAccountEmail({
      accountId: account.accountId,
      address: 'hash@example.com',
      code: '123456',
      expiresAt: Date.now() + 600_000,
      testEnv,
    });

    for (const address of ['hash@example.com', 'missing-hash@example.com']) {
      const inputs = [];
      const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
      vi.spyOn(crypto.subtle, 'digest').mockImplementation((algorithm, data) => {
        inputs.push(new TextDecoder().decode(data));
        return originalDigest(algorithm, data);
      });
      await worker.fetch(
        emailVerifyRequest({ address, code: '111111', cookie: session.cookie }),
        testEnv
      );
      expect(inputs).toContain('111111test-hmac-pepper');
      expect(inputs).toContain(`${address}test-hmac-pepper`);
      vi.restoreAllMocks();
    }
  });

  it('handles concurrent right and wrong code', async () => {
    const { testEnv, account, session } = await setupAccount();
    const email = await seedAccountEmail({
      accountId: account.accountId,
      address: 'race@example.com',
      code: '123456',
      expiresAt: Date.now() + 600_000,
      testEnv,
    });

    const responses = await Promise.all([
      worker.fetch(emailVerifyRequest({ address: 'race@example.com', code: '123456', cookie: session.cookie }), testEnv),
      worker.fetch(emailVerifyRequest({ address: 'race@example.com', code: '654321', cookie: session.cookie }), testEnv),
    ]);
    const row = await emailRow(email.id);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 303]);
    expect(row.verified_at).toBeGreaterThan(0);
    expect([0, 1]).toContain(row.verification_attempts);
    expect(row.verification_code_hash).toBeNull();
    expect(row.verification_expires_at).toBeNull();
  });

  it('uses UPDATE RETURNING for match and SQL-side CASE for attempts', async () => {
    const { account, session } = await setupAccount();
    await seedAccountEmail({
      accountId: account.accountId,
      address: 'sql@example.com',
      code: '123456',
      expiresAt: Date.now() + 600_000,
    });
    const statements = [];
    const testEnv = makeTestEnv({ DB: recordingDb(workerEnv.DB, statements) });

    await worker.fetch(
      emailVerifyRequest({ address: 'sql@example.com', code: '654321', cookie: session.cookie }),
      testEnv
    );

    expect(statements.some((sql) => /UPDATE account_emails[\s\S]*RETURNING id/i.test(sql))).toBe(true);
    expect(statements.some((sql) => /verification_attempts = verification_attempts \+ 1/i.test(sql))).toBe(true);
    expect(statements.some((sql) => /CASE[\s\S]*verification_attempts \+ 1/i.test(sql))).toBe(true);
    expect(statements.some((sql) => /SELECT[\s\S]*verification_attempts/i.test(sql))).toBe(false);
  });
});

async function setupAccount({ email = 'person@example.com' } = {}) {
  const testEnv = makeTestEnv();
  const account = await seedAccount({ email, testEnv });
  const session = await seedSession(account.accountId, { testEnv });
  return { testEnv, account, session };
}

function settingsRequest(path, cookie) {
  return new Request(`https://services.solstone.app${path}`, {
    headers: { Cookie: cookie },
  });
}

async function emailRow(id) {
  return workerEnv.DB.prepare('SELECT * FROM account_emails WHERE id = ?').bind(id).first();
}
