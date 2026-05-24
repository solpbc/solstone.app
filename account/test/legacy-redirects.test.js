import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { makeTestEnv, resetDb, seedAccount, seedSession } from './helpers.js';

describe('legacy customer-facing redirects', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it.each([
    ['GET', '/dashboard', '/', 302],
    ['GET', '/dashboard?welcome=1', '/?welcome=1', 302],
    ['GET', '/settings', '/sign-in', 302],
    ['GET', '/settings/sessions', '/sign-in/sessions', 302],
    ['GET', '/settings/gemini', '/services/scout', 302],
    ['GET', '/settings/devices', '/services/devices', 302],
    ['POST', '/settings/sessions/abc/revoke', '/sign-in/sessions/abc/revoke', 308],
    ['POST', '/settings/gemini/rotate', '/services/scout/rotate', 308],
  ])('%s %s redirects to %s', async (method, path, location, status) => {
    const response = await worker.fetch(legacyRequest(method, path), makeTestEnv());

    expect(response.status).toBe(status);
    expect(response.headers.get('Location')).toBe(location);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    if (method === 'POST') expect(await response.text()).toBe('');
  });

  it('preserves POST semantics when following a legacy session revoke redirect', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const current = await seedSession(account.accountId, { testEnv });
    const other = await seedSession(account.accountId, { testEnv });
    const body = new URLSearchParams({ reason: 'test' });

    const legacy = await worker.fetch(new Request(`https://services.solstone.app/settings/sessions/${other.idHash}/revoke`, {
      method: 'POST',
      headers: {
        Origin: 'https://services.solstone.app',
        Cookie: current.cookie,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      redirect: 'manual',
    }), testEnv);

    expect(legacy.status).toBe(308);
    expect(legacy.headers.get('Location')).toBe(`/sign-in/sessions/${other.idHash}/revoke`);
    expect(await legacy.text()).toBe('');

    const followed = await worker.fetch(new Request(`https://services.solstone.app${legacy.headers.get('Location')}`, {
      method: 'POST',
      headers: {
        Origin: 'https://services.solstone.app',
        Cookie: current.cookie,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    }), testEnv);
    const row = await workerEnv.DB
      .prepare('SELECT revoked_at FROM sessions WHERE id_hash = ?')
      .bind(other.idHash)
      .first();

    expect(followed.status).toBe(303);
    expect(followed.headers.get('Location')).toBe('/sign-in/sessions');
    expect(row.revoked_at).toBeGreaterThan(0);
  });
});

function legacyRequest(method, path) {
  return new Request(`https://services.solstone.app${path}`, {
    method,
    headers: method === 'POST' ? { Origin: 'https://services.solstone.app' } : {},
    body: method === 'POST' ? new URLSearchParams({ ok: '1' }) : undefined,
    redirect: 'manual',
  });
}
