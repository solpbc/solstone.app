import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { decryptEmail } from '../src/crypto.js';
import { listSessionsForAccount } from '../src/db.js';
import { makeTestEnv, resetDb, seedAccount, seedSession } from './helpers.js';

describe('session activity metadata', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  it('sets last_active_at when creating a session', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv, nowMs: 44_000 });
    const row = await workerEnv.DB
      .prepare('SELECT created_at, last_active_at FROM sessions WHERE id_hash = ?')
      .bind(session.idHash)
      .first();

    expect(row).toEqual({ created_at: 44_000, last_active_at: 44_000 });
  });

  it('bumps encrypted IP and capped user agent on an authenticated request', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const longUa = `agent-${'x'.repeat(600)}`;

    await worker.fetch(new Request('https://services.solstone.app/sign-in', {
      headers: {
        Cookie: session.cookie,
        'CF-Connecting-IP': '73.225.42.18',
        'User-Agent': longUa,
      },
    }), testEnv);
    const row = await workerEnv.DB
      .prepare('SELECT last_ip_encrypted, last_user_agent FROM sessions WHERE id_hash = ?')
      .bind(session.idHash)
      .first();

    await expect(decryptEmail(row.last_ip_encrypted, testEnv)).resolves.toBe('73.225.42.18');
    expect(row.last_user_agent).toBe(longUa.slice(0, 512));
  });

  it('orders sessions by last activity descending', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const oldest = await seedSession(account.accountId, { testEnv, nowMs: 1_000 });
    const newest = await seedSession(account.accountId, { testEnv, nowMs: 3_000 });
    const middle = await seedSession(account.accountId, { testEnv, nowMs: 2_000 });

    const rows = await listSessionsForAccount(workerEnv.DB, account.accountId);

    expect(rows.map((row) => row.id_hash)).toEqual([newest.idHash, middle.idHash, oldest.idHash]);
  });

  it('keeps the request alive when the activity update throws', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const throwingDb = {
      prepare(sql) {
        if (/UPDATE sessions\s+SET last_active_at/i.test(sql)) {
          throw new Error('activity update failed');
        }
        return workerEnv.DB.prepare(sql);
      },
    };

    const response = await worker.fetch(new Request('https://services.solstone.app/sign-in', {
      headers: { Cookie: session.cookie },
    }), { ...testEnv, DB: throwingDb });

    expect(response.status).toBe(200);
    expect(spy).toHaveBeenCalledWith('activity_bump_failed');
  });

  it('bounces a revoked session with the cleared cookie', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await workerEnv.DB
      .prepare('UPDATE sessions SET revoked_at = ? WHERE id_hash = ?')
      .bind(Date.now(), session.idHash)
      .run();

    const response = await worker.fetch(new Request('https://services.solstone.app/', {
      headers: { Cookie: session.cookie },
    }), testEnv);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/');
    expect(response.headers.get('Set-Cookie')).toBe('account_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
  });

  it('bounces a revoked session on settings with the cleared cookie', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await workerEnv.DB
      .prepare('UPDATE sessions SET revoked_at = ? WHERE id_hash = ?')
      .bind(Date.now(), session.idHash)
      .run();

    const response = await worker.fetch(new Request('https://services.solstone.app/sign-in/sessions', {
      headers: { Cookie: session.cookie },
    }), testEnv);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/');
    expect(response.headers.get('Set-Cookie')).toBe('account_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
  });
});
