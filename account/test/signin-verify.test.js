import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { VERIFY_ERROR } from '../src/html.js';
import { signEnableResume } from '../src/enable.js';
import {
  extractCookieToken,
  makeTestEnv,
  resetDb,
  responseSnapshot,
  rowCount,
  seedOtp,
  verifyRequest,
} from './helpers.js';

const VALID_ENABLE_NONCE = '2'.repeat(52);

describe('/signin/verify', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('renders a hidden email field for a valid email query', async () => {
    const response = await worker.fetch(
      new Request('https://services.solstone.app/signin/verify?email=Person%40Example.com'),
      makeTestEnv()
    );
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain('code sent to <strong>person@example.com</strong>');
    expect(body).toContain('type="hidden" name="email" value="person@example.com"');
    expect(body).not.toContain('type="email"');
  });

  it('treats an invalid email query as the bare verify form', async () => {
    const response = await worker.fetch(
      new Request('https://services.solstone.app/signin/verify?email=not-an-email'),
      makeTestEnv()
    );
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain('enter your email and the 6-digit code we sent you.');
    expect(body).toContain('type="email"');
  });

  it('falls through to 404 for the deleted finish route', async () => {
    const response = await worker.fetch(
      new Request('https://services.solstone.app/signin/finish?n=anything'),
      makeTestEnv()
    );
    expect(response.status).toBe(404);
  });

  it('rejects a missing csrf token before account or session writes', async () => {
    const response = await worker.fetch(
      verifyRequest({ email: 'missing-csrf@example.com', code: '123456', csrf: null }),
      makeTestEnv()
    );
    await expectVerifyCsrfRejected(response);
  });

  it('rejects a wrong csrf token before account or session writes', async () => {
    const response = await worker.fetch(
      verifyRequest({ email: 'wrong-csrf@example.com', code: '123456', csrf: 'wrong' }),
      makeTestEnv()
    );
    await expectVerifyCsrfRejected(response);
  });

  it('rejects an unparseable csrf body before account or session writes', async () => {
    const response = await worker.fetch(
      new Request('https://services.solstone.app/signin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"email":"json@example.com","code":"123456"}',
      }),
      makeTestEnv()
    );
    await expectVerifyCsrfRejected(response);
  });

  it('admits a valid csrf token with rewritten origin and referer headers', async () => {
    const rewritten = 'https://urldefense.com/v3/__https://services.solstone.app__;!!';
    const testEnv = makeTestEnv();
    const seeded = await seedOtp({ email: 'rewritten@example.com', options: { code: '123456' } });
    const response = await worker.fetch(
      verifyRequest({
        email: 'rewritten@example.com',
        code: seeded.code,
        origin: rewritten,
        headers: { Referer: rewritten },
      }),
      testEnv
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/?welcome=1');
    expect(extractCookieToken(response.headers.get('Set-Cookie') || '')).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('accepts the csrf token rendered on the verify form', async () => {
    const testEnv = makeTestEnv();
    const seeded = await seedOtp({ email: 'roundtrip@example.com', options: { code: '123456' } });
    const page = await worker.fetch(
      new Request('https://services.solstone.app/signin/verify?email=roundtrip%40example.com'),
      testEnv
    );
    const csrf = extractCsrf(await page.text());
    const response = await worker.fetch(
      verifyRequest({ email: 'roundtrip@example.com', code: seeded.code, csrf }),
      testEnv
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/?welcome=1');
    expect(extractCookieToken(response.headers.get('Set-Cookie') || '')).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects malformed email with the generic error and echoes the form value', async () => {
    const response = await worker.fetch(
      verifyRequest({ email: 'not-an-email', code: '123456' }),
      makeTestEnv()
    );
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain(VERIFY_ERROR);
    expect(body).toContain('type="email" name="email" value="not-an-email"');
    expect(await rowCount('accounts')).toBe(0);
    expect(await rowCount('sessions')).toBe(0);
  });

  it('rejects malformed code with the generic error and no account or session', async () => {
    const response = await worker.fetch(
      verifyRequest({ email: 'code@example.com', code: '12 34' }),
      makeTestEnv()
    );
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain(VERIFY_ERROR);
    expect(await rowCount('accounts')).toBe(0);
    expect(await rowCount('sessions')).toBe(0);
  });

  it('returns the generic error for a code with no matching row', async () => {
    const testEnv = makeTestEnv();
    const noRow = await worker.fetch(
      verifyRequest({ email: 'missing@example.com', code: '123456' }),
      testEnv
    );
    const noRowSnapshot = await responseSnapshot(noRow);

    await seedOtp({ email: 'missing@example.com', options: { code: '111111' } });
    const wrongCode = await worker.fetch(
      verifyRequest({ email: 'missing@example.com', code: '222222' }),
      testEnv
    );
    const wrongCodeSnapshot = await responseSnapshot(wrongCode);
    const body = await noRow.text();

    expect(noRow.status).toBe(200);
    expect(noRow.headers.has('Set-Cookie')).toBe(false);
    expect(body).toContain(VERIFY_ERROR);
    expect(noRowSnapshot).toEqual(wrongCodeSnapshot);
    expect(await rowCount('accounts')).toBe(0);
    expect(await rowCount('sessions')).toBe(0);
  });

  it('verifies a correct OTP once and redirects a new account to the welcome dashboard', async () => {
    const testEnv = makeTestEnv();
    const seeded = await seedOtp({ email: 'new@example.com', options: { code: '123456' } });
    const response = await worker.fetch(
      verifyRequest({ email: 'new@example.com', code: seeded.code }),
      testEnv
    );
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/?welcome=1');
    expect(extractCookieToken(response.headers.get('Set-Cookie') || '')).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await rowCount('accounts')).toBe(1);
    expect(await rowCount('account_emails')).toBe(1);
    expect(await rowCount('sessions')).toBe(1);
    await expect(otpRow(seeded.emailLowerHash)).resolves.toMatchObject({ consumed: 1 });
  });

  it('verifies a correct OTP for an existing account and redirects to the dashboard', async () => {
    const testEnv = makeTestEnv();
    const first = await seedOtp({ email: 'existing@example.com', options: { code: '111111' } });
    await worker.fetch(verifyRequest({ email: 'existing@example.com', code: first.code }), testEnv);

    const second = await seedOtp({ email: 'existing@example.com', options: { code: '222222' } });
    const response = await worker.fetch(
      verifyRequest({ email: 'existing@example.com', code: second.code }),
      testEnv
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/');
    expect(await rowCount('accounts')).toBe(1);
    expect(await rowCount('account_emails')).toBe(1);
    expect(await rowCount('sessions')).toBe(2);
  });

  it('redirects to /enable/scout after OTP success when resume fields validate', async () => {
    const testEnv = makeTestEnv();
    const queryString = `?nonce=${VALID_ENABLE_NONCE}`;
    const resume = await signEnableResume('/enable/scout', queryString, testEnv);
    const seeded = await seedOtp({ email: 'resume@example.com', options: { code: '123456' } });
    const response = await worker.fetch(
      verifyRequest({
        email: 'resume@example.com',
        code: seeded.code,
        next: resume.next,
        nextSig: resume.nextSig,
      }),
      testEnv
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe(`/enable/scout${queryString}`);
  });

  it('falls back to dashboard after OTP success when resume signature is invalid', async () => {
    const testEnv = makeTestEnv();
    const queryString = `?nonce=${VALID_ENABLE_NONCE}`;
    const resume = await signEnableResume('/enable/scout', queryString, testEnv);
    const seeded = await seedOtp({ email: 'bad-resume@example.com', options: { code: '123456' } });
    const response = await worker.fetch(
      verifyRequest({
        email: 'bad-resume@example.com',
        code: seeded.code,
        next: resume.next,
        nextSig: 'bad-signature',
      }),
      testEnv
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/?welcome=1');
  });

  it('rejects a reused OTP after atomic consume', async () => {
    const testEnv = makeTestEnv();
    const seeded = await seedOtp({ email: 'reuse@example.com', options: { code: '123456' } });
    const first = await worker.fetch(verifyRequest({ email: 'reuse@example.com', code: seeded.code }), testEnv);
    const second = await worker.fetch(verifyRequest({ email: 'reuse@example.com', code: seeded.code }), testEnv);
    const body = await second.text();

    expect(first.status).toBe(303);
    expect(second.status).toBe(200);
    expect(body).toContain(VERIFY_ERROR);
    expect(await rowCount('accounts')).toBe(1);
  });

  it('rejects an expired OTP without incrementing attempts', async () => {
    const seeded = await seedOtp({
      email: 'expired@example.com',
      options: { code: '123456', expired: true },
    });
    const response = await worker.fetch(
      verifyRequest({ email: 'expired@example.com', code: seeded.code }),
      makeTestEnv()
    );
    const body = await response.text();
    const row = await otpRow(seeded.emailLowerHash);

    expect(response.status).toBe(200);
    expect(body).toContain(VERIFY_ERROR);
    expect(row.attempts).toBe(0);
    expect(row.consumed).toBe(0);
    expect(await rowCount('accounts')).toBe(0);
  });

  it('increments attempts on a wrong code', async () => {
    const seeded = await seedOtp({ email: 'wrong@example.com', options: { code: '123456' } });
    const response = await worker.fetch(
      verifyRequest({ email: 'wrong@example.com', code: '654321' }),
      makeTestEnv()
    );
    const row = await otpRow(seeded.emailLowerHash);

    expect(response.status).toBe(200);
    expect(row.attempts).toBe(1);
    expect(row.consumed).toBe(0);
  });

  it('consumes an OTP on the fifth wrong attempt', async () => {
    const seeded = await seedOtp({
      email: 'lockout@example.com',
      options: { code: '123456', attempts: 4 },
    });
    const response = await worker.fetch(
      verifyRequest({ email: 'lockout@example.com', code: '654321' }),
      makeTestEnv()
    );
    const row = await otpRow(seeded.emailLowerHash);

    expect(response.status).toBe(200);
    expect(row.attempts).toBe(5);
    expect(row.consumed).toBe(1);
  });

  it('concurrent verifies for the same OTP create exactly one account and one email row', async () => {
    const testEnv = makeTestEnv();
    const seeded = await seedOtp({ email: 'race@example.com', options: { code: '123456' } });
    const responses = await Promise.all([
      worker.fetch(verifyRequest({ email: 'race@example.com', code: seeded.code }), testEnv),
      worker.fetch(verifyRequest({ email: 'race@example.com', code: seeded.code }), testEnv),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 303]);
    expect(await rowCount('accounts')).toBe(1);
    expect(await rowCount('account_emails')).toBe(1);
  });
});

async function otpRow(emailLowerHash) {
  return workerEnv.DB.prepare('SELECT attempts, consumed FROM otp_tokens WHERE email_lower_hash = ?')
    .bind(emailLowerHash)
    .first();
}

async function expectVerifyCsrfRejected(response) {
  const body = await response.text();
  expect(response.status).toBe(403);
  expect(body).toContain('email security');
  expect(body).toContain('https://services.solstone.app');
  expect(await rowCount('accounts')).toBe(0);
  expect(await rowCount('sessions')).toBe(0);
  expect(response.headers.has('Set-Cookie')).toBe(false);
}

function extractCsrf(body) {
  return body.match(/name="csrf" value="([^"]+)"/)?.[1] || '';
}
