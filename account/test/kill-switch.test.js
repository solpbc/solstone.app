import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  emailAddRequest,
  fetchWithCtx,
  extractCookieToken,
  makeTestEnv,
  resetDb,
  responseSnapshot,
  rowCount,
  seedAccount,
  seedAccountEmail,
  seedOtp,
  seedSession,
  startRequest,
  stubTurnstile,
  verifyRequest,
} from './helpers.js';

describe('kill switches', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('EMAIL_PATH_DISABLED skips signin OTP work with the happy-path redirect shape', async () => {
    stubTurnstile(true);
    const hashInputs = [];
    const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementation((algorithm, data) => {
      hashInputs.push(new TextDecoder().decode(data));
      return originalDigest(algorithm, data);
    });

    const disabledEnv = makeTestEnv({ EMAIL_PATH_DISABLED: 'true' });
    const disabled = await worker.fetch(startRequest('disabled@example.com'), disabledEnv);
    const disabledSnapshot = await responseSnapshot(disabled);

    expect(hashInputs).toHaveLength(4);
    expect(await rowCount('otp_tokens')).toBe(0);
    expect(await rowCount('rate_buckets')).toBe(0);
    expect(disabledEnv.EMAIL.sent).toHaveLength(0);

    vi.restoreAllMocks();
    await resetDb();
    stubTurnstile(true);
    const enabled = await worker.fetch(startRequest('disabled@example.com'), makeTestEnv());
    expect(disabledSnapshot).toEqual(await responseSnapshot(enabled));
  });

  it('EMAIL_PATH_DISABLED makes add-email mirror a third-party collision', async () => {
    const collisionSnapshot = await collisionSnapshotFor('disabled-add@example.com');

    await resetDb();
    const testEnv = makeTestEnv({ EMAIL_PATH_DISABLED: 'true' });
    const actor = await seedAccount({ email: 'actor@example.com', testEnv });
    const session = await seedSession(actor.accountId, { testEnv });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { response } = await fetchWithCtx(
      worker,
      emailAddRequest({ address: 'disabled-add@example.com', cookie: session.cookie }),
      testEnv
    );

    expect(await responseSnapshot(response)).toEqual(collisionSnapshot);
    expect(await rowCount('account_emails')).toBe(1);
    expect(testEnv.EMAIL.sent).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('add_addr_collision');
    expect(warn.mock.calls[0][0]).toContain(actor.accountId);
    expect(warn.mock.calls[0][0]).not.toContain('disabled-add@example.com');
  });

  it('SIGNUP_DISABLED rejects a correct OTP for a new email like a wrong code', async () => {
    const wrongCodeSnapshot = await wrongCodeSnapshotFor('blocked@example.com');

    await resetDb();
    const seeded = await seedOtp({ email: 'blocked@example.com', options: { code: '123456' } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = await worker.fetch(
      verifyRequest({ email: 'blocked@example.com', code: seeded.code }),
      makeTestEnv({ SIGNUP_DISABLED: 'true' })
    );

    expect(await responseSnapshot(response)).toEqual(wrongCodeSnapshot);
    expect(await rowCount('accounts')).toBe(0);
    expect(await rowCount('sessions')).toBe(0);
    expect(await otpRow(seeded.emailLowerHash)).toMatchObject({ consumed: 1, attempts: 0 });
    expect(warn).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(warn.mock.calls[0][0]);
    expect(payload.event).toBe('signup_disabled_rejection');
    expect(payload.email_lower_hash_prefix).toHaveLength(12);
    expect(warn.mock.calls[0][0]).not.toContain('@');
    expect(warn.mock.calls[0][0]).not.toContain(seeded.emailLowerHash);
  });

  it('SIGNUP_DISABLED allows existing accounts to sign in', async () => {
    const testEnv = makeTestEnv({ SIGNUP_DISABLED: 'true' });
    await seedAccount({ email: 'existing@example.com', testEnv });
    const seeded = await seedOtp({ email: 'existing@example.com', options: { code: '123456' } });

    const response = await worker.fetch(
      verifyRequest({ email: 'existing@example.com', code: seeded.code }),
      testEnv
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/dashboard');
    expect(extractCookieToken(response.headers.get('Set-Cookie') || '')).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await rowCount('accounts')).toBe(1);
    expect(await rowCount('sessions')).toBe(1);
  });

  it('applies both flags without cross-talk', async () => {
    stubTurnstile(true);
    const bothEnv = makeTestEnv({ EMAIL_PATH_DISABLED: 'true', SIGNUP_DISABLED: 'true' });
    await worker.fetch(startRequest('both@example.com'), bothEnv);
    expect(await rowCount('otp_tokens')).toBe(0);
    expect(bothEnv.EMAIL.sent).toHaveLength(0);

    const seeded = await seedOtp({ email: 'both@example.com', options: { code: '123456' } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = await worker.fetch(
      verifyRequest({ email: 'both@example.com', code: seeded.code }),
      bothEnv
    );

    expect(response.status).toBe(200);
    expect(await rowCount('accounts')).toBe(0);
    expect(await otpRow(seeded.emailLowerHash)).toMatchObject({ consumed: 1, attempts: 0 });
  });
});

async function collisionSnapshotFor(address) {
  const testEnv = makeTestEnv();
  const actor = await seedAccount({ email: `actor-${address}`, testEnv });
  const owner = await seedAccount({ email: `owner-${address}`, testEnv });
  const session = await seedSession(actor.accountId, { testEnv });
  await seedAccountEmail({
    accountId: owner.accountId,
    address,
    verifiedAt: Date.now(),
    testEnv,
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { response } = await fetchWithCtx(
    worker,
    emailAddRequest({ address, cookie: session.cookie }),
    testEnv
  );
  return responseSnapshot(response);
}

async function wrongCodeSnapshotFor(email) {
  const testEnv = makeTestEnv();
  await seedOtp({ email, options: { code: '111111' } });
  const response = await worker.fetch(verifyRequest({ email, code: '222222' }), testEnv);
  return responseSnapshot(response);
}

async function otpRow(emailLowerHash) {
  return workerEnv.DB
    .prepare('SELECT consumed, attempts FROM otp_tokens WHERE email_lower_hash = ?')
    .bind(emailLowerHash)
    .first();
}
