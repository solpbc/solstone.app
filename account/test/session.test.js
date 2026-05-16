import { beforeEach, describe, expect, it } from 'vitest';
import { env as workerEnv } from 'cloudflare:test';
import worker from '../src/index.js';
import { hashWithPepper } from '../src/crypto.js';
import {
  dbDumpText,
  extractCookieToken,
  makeTestEnv,
  resetDb,
  seedOtp,
  verifyRequest,
} from './helpers.js';

describe('session handling', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('sets the exact session cookie format', async () => {
    const testEnv = makeTestEnv();
    const response = await verifySeededOtp('cookie@example.com', testEnv);
    const setCookie = response.headers.get('Set-Cookie') || '';
    expect(setCookie).toMatch(
      /^account_session=[A-Za-z0-9_-]+; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=1209600$/
    );
  });

  it('does not include a Domain attribute in the session cookie', async () => {
    const testEnv = makeTestEnv();
    const response = await verifySeededOtp('domain@example.com', testEnv);
    expect(response.headers.get('Set-Cookie')).not.toContain('Domain=');
  });

  it('stores sessions.id_hash as sha256(value || pepper)', async () => {
    const testEnv = makeTestEnv();
    const response = await verifySeededOtp('hash@example.com', testEnv);
    const token = extractCookieToken(response.headers.get('Set-Cookie') || '');
    const expectedHash = await hashWithPepper(token, testEnv);
    const row = await workerEnv.DB.prepare('SELECT id_hash FROM sessions').first();
    expect(row.id_hash).toBe(expectedHash);
    expect(row.id_hash).not.toBe(token);
  });

  it('never stores the raw session token in any D1 table', async () => {
    const testEnv = makeTestEnv();
    const response = await verifySeededOtp('raw-token@example.com', testEnv);
    const token = extractCookieToken(response.headers.get('Set-Cookie') || '');
    expect(await dbDumpText()).not.toContain(token);
  });
});

async function verifySeededOtp(email, testEnv) {
  const { code } = await seedOtp({ email });
  return worker.fetch(verifyRequest({ email, code }), testEnv);
}
