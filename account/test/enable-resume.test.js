import { describe, expect, it } from 'vitest';
import { hashWithPepper } from '../src/crypto.js';
import { decodeEnableResume, signEnableResume, verifyEnableResume } from '../src/enable.js';
import { makeTestEnv } from './helpers.js';

const VALID_NONCE = '2'.repeat(52);

describe('enable resume helpers', () => {
  it('round-trips a nonce resume for /enable/spl only', async () => {
    const testEnv = makeTestEnv();
    const queryString = `?nonce=${VALID_NONCE}`;
    const signed = await signEnableResume('/enable/spl', queryString, testEnv);

    expect(await verifyEnableResume(signed.next, signed.nextSig, testEnv)).toEqual({
      path: '/enable/spl',
      queryString,
    });
    expect(decodeEnableResume(signed.next)).toEqual({
      path: '/enable/spl',
      queryString,
    });
  });

  it('rejects wrong signatures or paths', async () => {
    const testEnv = makeTestEnv();
    const signed = await signEnableResume('/enable/spl', `?nonce=${VALID_NONCE}`, testEnv);
    const decoded = decodeEnableResume(signed.next);
    const badPath = btoa(JSON.stringify({ ...decoded, path: '/not-enable' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');

    await expect(verifyEnableResume(signed.next, 'bad-signature', testEnv)).resolves.toBeNull();
    await expect(verifyEnableResume(badPath, await hashWithPepper(badPath, testEnv, 'HMAC_PEPPER'), testEnv))
      .resolves.toBeNull();
  });
});
