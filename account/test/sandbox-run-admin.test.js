import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { makeTestEnv, resetDb } from './helpers.js';
import { installJwksStub, mintToken } from './jwks-helper.js';
import {
  SANDBOX_RUN_ID,
  sandboxRequest,
  validSandboxInput,
} from './sandbox-run-test-helpers.js';

describe('sandbox run admin boundary', () => {
  beforeEach(async () => {
    await resetDb();
    await installJwksStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ['POST', '/admin/sandbox-runs', validSandboxInput()],
    ['GET', `/admin/sandbox-runs/${SANDBOX_RUN_ID}`, undefined],
    ['DELETE', `/admin/sandbox-runs/${SANDBOX_RUN_ID}`, undefined],
  ])('requires Access before %s %s', async (method, path, body) => {
    const response = await worker.fetch(sandboxRequest(path, null, { method, body }), makeTestEnv());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'cloudflare access required' });
  });

  it('keeps unknown sandbox methods and paths on the uniform admin not-found response', async () => {
    const token = await mintToken();
    const env = makeTestEnv({ SANDBOX_ACCOUNT_ID: SANDBOX_RUN_ID });
    const cases = [
      ['GET', '/admin/sandbox-runs'],
      ['DELETE', '/admin/sandbox-runs'],
      ['DELETE', `/admin/sandbox-runs/${SANDBOX_RUN_ID}`],
      ['POST', `/admin/sandbox-runs/${SANDBOX_RUN_ID}`],
      ['PATCH', `/admin/sandbox-runs/${SANDBOX_RUN_ID}`],
      ['GET', `/admin/sandbox-runs/${SANDBOX_RUN_ID}/extra`],
      ['GET', '/admin/sandbox-runs/not-a-uuid'],
    ];

    for (const [method, path] of cases) {
      const response = await worker.fetch(sandboxRequest(path, token, { method }), env);
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: 'account not found' });
    }
  });

  it('disables exact routes with a redacted 503 when SANDBOX_ACCOUNT_ID is unset or malformed', async () => {
    const token = await mintToken();
    for (const configured of [undefined, '', 'not-a-uuid']) {
      const response = await worker.fetch(
        sandboxRequest(`/admin/sandbox-runs/${SANDBOX_RUN_ID}`, token),
        makeTestEnv({ SANDBOX_ACCOUNT_ID: configured })
      );

      expect(response.status).toBe(503);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      await expect(response.json()).resolves.toEqual({
        error: 'sandbox run unavailable',
        code: 'sandbox_run_unavailable',
        run_id: SANDBOX_RUN_ID,
      });
    }
  });
});
