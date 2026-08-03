import { describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { makeTestEnv, resetDb } from './helpers.js';

describe('HEAD requests', () => {
  it.each([
    ['/', 200],
    ['/private-network', 200],
    ['/notifications', 200],
    ['/legal', 200],
    ['/services/spl', 302],
    ['/sealed-container', 302],
  ])('HEAD %s mirrors the GET status with no body', async (path, status) => {
    await resetDb();
    const env = makeTestEnv();
    const getResponse = await worker.fetch(
      new Request(`https://services.solstone.app${path}`, { redirect: 'manual' }),
      env,
    );
    const headResponse = await worker.fetch(
      new Request(`https://services.solstone.app${path}`, { method: 'HEAD', redirect: 'manual' }),
      env,
    );

    expect(getResponse.status).toBe(status);
    expect(headResponse.status).toBe(getResponse.status);
    expect(await headResponse.text()).toBe('');
    expect(headResponse.headers.get('Content-Type')).toBe(getResponse.headers.get('Content-Type'));
  });

  it('HEAD on an unknown path 404s like GET', async () => {
    await resetDb();
    const env = makeTestEnv();
    const response = await worker.fetch(
      new Request('https://services.solstone.app/does-not-exist', { method: 'HEAD' }),
      env,
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
  });
});
