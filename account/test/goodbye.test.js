import { describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { makeTestEnv } from './helpers.js';

describe('goodbye page', () => {
  it('renders the signed-out copy', async () => {
    const response = await worker.fetch(new Request('https://services.solstone.app/goodbye'), makeTestEnv());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<h1>signed out.</h1>');
    expect(body).toContain('<p>see you next time.</p>');
    expect(body).toContain('<a href="/">start over</a>');
  });
});
