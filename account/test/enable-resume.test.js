import { describe, expect, it } from 'vitest';
import { hashWithPepper } from '../src/crypto.js';
import { decodeEnableResume, signEnableResume, verifyEnableResume } from '../src/enable.js';
import { makeTestEnv } from './helpers.js';

const VALID_NONCE = '2'.repeat(52);
const VALID_CODE = 'SCOUT-2345-6789';

describe('enable resume helpers', () => {
  it('round-trips a nonce resume for /enable/scout only', async () => {
    const testEnv = makeTestEnv();
    const queryString = `?nonce=${VALID_NONCE}`;
    const signed = await signEnableResume('/enable/scout', queryString, testEnv);

    expect(await verifyEnableResume(signed.next, signed.nextSig, testEnv)).toEqual({
      path: '/enable/scout',
      queryString,
    });
    expect(decodeEnableResume(signed.next)).toEqual({
      path: '/enable/scout',
      queryString,
    });
  });

  it('accepts a device code resume and rejects wrong signatures or paths', async () => {
    const testEnv = makeTestEnv();
    const signed = await signEnableResume('/enable/scout', `?code=${VALID_CODE}`, testEnv);
    const wrongPath = await signEnableResume('/enable/scout', `?nonce=${VALID_NONCE}`, testEnv);
    const decoded = decodeEnableResume(wrongPath.next);
    const badPath = btoa(JSON.stringify({ ...decoded, path: '/not-enable' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');

    await expect(verifyEnableResume(signed.next, signed.nextSig, testEnv)).resolves.toMatchObject({
      path: '/enable/scout',
      queryString: `?code=${VALID_CODE}`,
    });
    await expect(verifyEnableResume(signed.next, 'bad-signature', testEnv)).resolves.toBeNull();
    await expect(verifyEnableResume(badPath, await hashWithPepper(badPath, testEnv, 'HMAC_PEPPER'), testEnv))
      .resolves.toBeNull();
  });
});
