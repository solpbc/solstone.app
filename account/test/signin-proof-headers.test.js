import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { signEnableResume, verifyEnableResume } from '../src/enable.js';
import { makeTestEnv, resetDb, rowCount, startRequest, stubTurnstile } from './helpers.js';
import { generateReachKeyPair, mintHomeReachAssertion } from './reach-helper.js';

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('proof-bearing sign-in start responses', () => {
  it.each([
    { name: 'admitted', turnstile: true, email: 'proof@example.com', disabled: 'false', otpRows: 1 },
    { name: 'Turnstile refusal', turnstile: false, email: 'proof@example.com', disabled: 'false', otpRows: 0 },
    { name: 'invalid email', turnstile: true, email: 'invalid', disabled: 'false', otpRows: 0 },
    { name: 'disabled email path', turnstile: true, email: 'proof@example.com', disabled: 'true', otpRows: 0 },
  ])('protects the $name redirect without changing sign-in behavior', async (branch) => {
    stubTurnstile(branch.turnstile);
    const testEnv = makeTestEnv({ EMAIL_PATH_DISABLED: branch.disabled });
    const key = await generateReachKeyPair();
    const nonce = '2'.repeat(52);
    const assertion = await mintHomeReachAssertion({
      instanceId: key.instanceId,
      privateKey: key.privateKey,
      claims: { scope: 'services.enable', service: 'spl', nonce },
    });
    const queryString = `?${new URLSearchParams({ nonce, instance: key.instanceId, assertion, ca_pubkey: key.publicKeyPem })}`;
    const { next, nextSig } = await signEnableResume('/enable/spl', queryString, testEnv);
    const response = await worker.fetch(startRequest(branch.email, {}, { next, nextSig }), testEnv);
    expect(response.status).toBe(303);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    const location = new URL(response.headers.get('Location'), 'https://services.solstone.app');
    expect(location.pathname).toBe('/signin/verify');
    const resume = await verifyEnableResume(location.searchParams.get('next'), location.searchParams.get('next_sig'), testEnv);
    expect(resume).toEqual({ path: '/enable/spl', queryString });
    expect(await rowCount('otp_tokens')).toBe(branch.otpRows);
    expect(testEnv.EMAIL.sent).toHaveLength(branch.otpRows);
  });
});
