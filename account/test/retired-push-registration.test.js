import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { makeTestEnv, resetDb } from './helpers.js';

describe('retired push registration routes', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it.each([
    ['GET', '/enable/push'],
    ['POST', '/enable/push/confirm'],
    ['GET', '/handoff/push'],
    ['GET', '/devices'],
    ['POST', '/devices/revoke-all'],
    ['POST', '/devices/abc/revoke'],
    ['POST', '/push/disable'],
    ['GET', '/account/devices'],
    ['POST', '/account/devices/register'],
    ['POST', '/account/devices/deregister'],
  ])('%s %s returns 404', async (method, path) => {
    const request = new Request(`https://services.solstone.app${path}`, {
      method,
      headers: method === 'POST' ? { Origin: 'https://services.solstone.app' } : {},
      body: method === 'POST' ? new URLSearchParams({ ok: '1' }) : undefined,
      redirect: 'manual',
    });
    const response = await worker.fetch(request, makeTestEnv());
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get('Location')).toBe(null);
    expect(body).toContain('not found');
  });
});
