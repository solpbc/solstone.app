import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { hashWithPepper } from '../src/crypto.js';
import { createDeletionProof, markDeletionProofVerified } from '../src/db.js';
import { getValidSession } from '../src/session.js';
import {
  extractCookieToken,
  makeTestEnv,
  resetDb,
  rowCount,
  seedAccount,
  seedCredential,
  seedOtp,
  seedSession,
  verifyRequest,
} from './helpers.js';

const ORIGIN = 'https://services.solstone.app';
const HOLD_MS = 72 * 60 * 60 * 1000;
const STATUS_TOKEN = 'lost-session-status-token';

// The owner requested deletion, then lost the original account_session cookie
// (cleared browser, other device, or the session expired inside the hold). A
// fresh sign-in must lead back to cancellation; the status receipt alone must not.
describe('deletion cancellation after the original session is lost', () => {
  beforeEach(resetDb);

  it('a status receipt alone opens no signed-in page, proof, cancellation, or export', async () => {
    const env = makeTestEnv({ OWNER_EXPORT_ENABLED: 'true' });
    const owner = await seedAccount({ email: 'lost@example.com', testEnv: env });
    await holdingDeletion(env, owner.accountId);
    const receipt = `account_deletion_status=${STATUS_TOKEN}`;

    const status = await worker.fetch(get('/account/delete/status', receipt), env);
    const statusBody = await status.text();
    expect(status.status).toBe(200);
    expect(statusBody).toContain('waiting for the safety period');
    expect(statusBody).not.toContain('lost@example.com');
    expect(statusBody).not.toContain('cancel deletion request');

    for (const path of ['/account/delete', '/account/export', '/sign-in']) {
      const response = await worker.fetch(get(path, receipt), env);
      expect([302, 303]).toContain(response.status);
      expect(response.headers.get('Location')).toBe('/');
    }
    for (const path of ['/', '/transparency']) {
      const response = await worker.fetch(get(path, receipt), env);
      expect(await response.text()).not.toContain('lost@example.com');
    }

    const proof = await worker.fetch(post('/account/delete/proof/otp', receipt, { purpose: 'cancel' }), env);
    const cancel = await worker.fetch(post('/account/delete/cancel', receipt), env);
    const exportPost = await worker.fetch(post('/account/export', receipt), env);
    for (const response of [proof, cancel, exportPost]) {
      expect(response.status).not.toBe(200);
      expect(response.headers.get('Content-Disposition')).toBeNull();
    }
    expect(env.EMAIL.sent).toHaveLength(0);
    await expect(rowCount('account_deletion_proofs')).resolves.toBe(0);
    await expect(phase()).resolves.toBe('frozen');
  });

  it('a fresh email sign-in inside the hold reaches cancellation and nothing else', async () => {
    const env = makeTestEnv({ OWNER_EXPORT_ENABLED: 'true' });
    const owner = await seedAccount({ email: 'lost@example.com', testEnv: env });
    await holdingDeletion(env, owner.accountId);
    const otp = await seedOtp({ email: 'lost@example.com', options: { code: '123456' } });

    const signIn = await worker.fetch(verifyRequest({ email: otp.emailLower, code: otp.code }), env);
    expect(signIn.status).toBe(303);
    expect(signIn.headers.get('Location')).toBe('/account/delete');
    expect(signIn.headers.get('Cache-Control')).toBe('no-store');
    const cookie = `account_session=${extractCookieToken(signIn.headers.get('Set-Cookie') || '')}`;
    expect(cookie).not.toBe('account_session=');
    // No credential-change proof is seeded for a session that cannot reach those routes.
    await expect(rowCount('account_deletion_proofs')).resolves.toBe(0);

    // Confined like the original session: the deletion routes and the export
    // carve-out only; every other signed-in surface reads as signed out.
    for (const path of ['/', '/transparency', '/sign-in', '/settings', '/support', '/services']) {
      await expect(getValidSession(get(path, cookie), env, Date.now())).resolves.toBeNull();
    }
    await expect(getValidSession(get('/account/delete', cookie), env, Date.now()))
      .resolves.toMatchObject({ account_id: owner.accountId });
    await expect(getValidSession(get('/account/export', cookie), env, Date.now()))
      .resolves.toMatchObject({ account_id: owner.accountId });

    const page = await worker.fetch(get('/account/delete', cookie), env);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('send a cancellation code');
    const status = await worker.fetch(get('/account/delete/status', `${cookie}; account_deletion_status=${STATUS_TOKEN}`), env);
    expect(await status.text()).toContain('href="/account/delete">cancel deletion request</a>');

    // The sign-in code is not the cancellation proof.
    const early = await worker.fetch(post('/account/delete/cancel', cookie), env);
    expect(early.status).toBe(400);
    await expect(phase()).resolves.toBe('frozen');

    const start = await worker.fetch(post('/account/delete/proof/otp', cookie, { purpose: 'cancel' }), env);
    expect(start.status).toBe(200);
    const code = env.EMAIL.sent.at(-1).text.match(/\b(\d{3}) (\d{3})\b/).slice(1).join('');
    const verify = await worker.fetch(post('/account/delete/proof/otp/verify', cookie, { purpose: 'cancel', code }), env);
    expect(verify.status).toBe(200);

    const cancel = await worker.fetch(post('/account/delete/cancel', cookie), env);
    expect(cancel.status).toBe(303);
    expect(cancel.headers.get('Location')).toBe('/account/delete');
    await expect(phase()).resolves.toBe('cancelled');
    await expect(getValidSession(get('/', cookie), env, Date.now()))
      .resolves.toMatchObject({ account_id: owner.accountId });
  });

  it('still requires the passkey proof when the owner has a passkey', async () => {
    const env = makeTestEnv();
    const owner = await seedAccount({ email: 'lost@example.com', testEnv: env });
    await seedCredential({ accountId: owner.accountId, credentialId: 'owner-passkey' });
    await holdingDeletion(env, owner.accountId);
    const otp = await seedOtp({ email: 'lost@example.com', options: { code: '123456' } });
    const signIn = await worker.fetch(verifyRequest({ email: otp.emailLower, code: otp.code }), env);
    expect(signIn.headers.get('Location')).toBe('/account/delete');
    const token = extractCookieToken(signIn.headers.get('Set-Cookie') || '');
    const cookie = `account_session=${token}`;
    const sessionIdHash = await hashWithPepper(token, env);

    await verifiedCancelProof(owner.accountId, sessionIdHash, 'otp');
    const otpOnly = await worker.fetch(post('/account/delete/cancel', cookie), env);
    expect(otpOnly.status).toBe(400);
    await expect(phase()).resolves.toBe('frozen');

    await verifiedCancelProof(owner.accountId, sessionIdHash, 'passkey');
    const cancel = await worker.fetch(post('/account/delete/cancel', cookie), env);
    expect(cancel.status).toBe(303);
    await expect(phase()).resolves.toBe('cancelled');
  });

  it('keeps refusing sign-in once the safety period has passed or purging began', async () => {
    const env = makeTestEnv();
    const owner = await seedAccount({ email: 'lost@example.com', testEnv: env });
    await holdingDeletion(env, owner.accountId, { deadline: Date.now() - 1 });
    let otp = await seedOtp({ email: 'lost@example.com', options: { code: '123456' } });
    const expired = await worker.fetch(verifyRequest({ email: otp.emailLower, code: otp.code }), env);
    expect(expired.status).toBe(200);
    expect(expired.headers.get('Set-Cookie')).toBeNull();

    await workerEnv.DB.prepare("UPDATE account_deletions SET phase = 'purging', cancellation_deadline_at = ?")
      .bind(Date.now() + HOLD_MS).run();
    otp = await seedOtp({ email: 'lost@example.com', options: { code: '654321' } });
    const purging = await worker.fetch(verifyRequest({ email: otp.emailLower, code: otp.code }), env);
    expect(purging.status).toBe(200);
    expect(purging.headers.get('Set-Cookie')).toBeNull();
    await expect(rowCount('sessions')).resolves.toBe(0);
  });

  it('leaves the original session and its export carve-out unchanged', async () => {
    const env = makeTestEnv({ OWNER_EXPORT_ENABLED: 'true' });
    const owner = await seedAccount({ email: 'lost@example.com', testEnv: env });
    const original = await seedSession(owner.accountId, { testEnv: env });
    await holdingDeletion(env, owner.accountId);

    await expect(getValidSession(get('/account/export', original.cookie), env, Date.now()))
      .resolves.toMatchObject({ account_id: owner.accountId });
    await expect(getValidSession(get('/', original.cookie), env, Date.now())).resolves.toBeNull();
    const page = await worker.fetch(get('/account/export', original.cookie), env);
    expect(page.status).toBe(200);
  });
});

async function holdingDeletion(env, accountId, { deadline = Date.now() + HOLD_MS } = {}) {
  await workerEnv.DB.prepare(
    `INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, cancellation_deadline_at, status_token_hash)
     VALUES ('lost-session-op', ?, 'frozen', ?, ?, ?)`
  ).bind(accountId, Date.now(), deadline, await hashWithPepper(STATUS_TOKEN, env)).run();
}

async function verifiedCancelProof(accountId, sessionIdHash, method) {
  const tokenHash = `cancel-${method}`;
  await createDeletionProof(workerEnv.DB, {
    tokenHash, accountId, sessionIdHash, purpose: 'cancel', method,
    issuedAt: Date.now(), expiresAt: Date.now() + 60_000,
    otpCodeHash: method === 'otp' ? 'hash' : null,
    passkeyChallenge: method === 'passkey' ? 'challenge' : null,
  });
  await markDeletionProofVerified(workerEnv.DB, { tokenHash, nowMs: Date.now() });
}

async function phase() {
  const row = await workerEnv.DB.prepare("SELECT phase FROM account_deletions WHERE operation_id = 'lost-session-op'").first();
  return row.phase;
}

function get(path, cookie) {
  return new Request(`${ORIGIN}${path}`, { headers: { Cookie: cookie } });
}

function post(path, cookie, form = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  });
}
