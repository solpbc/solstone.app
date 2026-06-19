import { describe, expect, it } from 'vitest';
import { authorizeRelay } from '../src/push.js';
import { mintReachRelayToken } from '../src/reach.js';
import { makeTestEnv } from './helpers.js';

const INSTANCE_ID = '11111111-1111-1111-1111-111111111111';
const OLD_PUSH_RELAY_SECRET = 'test-push-relay-secret';

describe('push relay authorization', () => {
  it('returns instance id for a valid reach relay token', async () => {
    const testEnv = makeTestEnv();
    const iat = Math.floor(Date.now() / 1000);
    const token = await mintReachRelayToken(testEnv, { instanceId: INSTANCE_ID, iat });

    const result = await authorizeRelay(authRequest(`Bearer ${token}`), testEnv);

    expect(result).not.toBeInstanceOf(Response);
    expect(result).toEqual({ instanceId: INSTANCE_ID });
  });

  it('returns a 401 Response for the retired shared secret', async () => {
    const result = await authorizeRelay(authRequest(`Bearer ${OLD_PUSH_RELAY_SECRET}`), makeTestEnv());

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(401);
  });

  it('returns a 401 Response for garbage bearer', async () => {
    const result = await authorizeRelay(authRequest('Bearer nope.nope.nope'), makeTestEnv());

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(401);
  });

  it('returns a 401 Response without Authorization header', async () => {
    const result = await authorizeRelay(authRequest(null), makeTestEnv());

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(401);
  });
});

function authRequest(authorization) {
  const headers = {};
  if (authorization !== null) headers.Authorization = authorization;
  return new Request('https://services.solstone.app/push/dispatch', { headers });
}
