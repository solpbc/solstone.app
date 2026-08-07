import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { hashWithPepper } from '../src/crypto.js';
import { decodeEnableResume, signEnableResume, verifyEnableResume } from '../src/enable.js';
import {
  makeTestEnv,
  resetDb,
  seedOtp,
  verifyRequest,
} from './helpers.js';

describe('support resume and sign-in prompts', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  it('round-trips /support, /support/closed, and /support/{id} through the signed resume gate', async () => {
    const testEnv = makeTestEnv();
    const list = await signEnableResume('/support', '', testEnv);
    const closed = await signEnableResume('/support/closed', '', testEnv);
    const detail = await signEnableResume('/support/REQ_123-abc', '', testEnv);

    await expect(verifyEnableResume(list.next, list.nextSig, testEnv)).resolves.toEqual({
      path: '/support',
      queryString: '',
    });
    expect(decodeEnableResume(detail.next)).toEqual({
      path: '/support/REQ_123-abc',
      queryString: '',
    });
    await expect(verifyEnableResume(closed.next, closed.nextSig, testEnv)).resolves.toEqual({
      path: '/support/closed',
      queryString: '',
    });
  });

  it('rejects support resume paths with queries, bad ids, or external paths', async () => {
    const testEnv = makeTestEnv();

    await expect(signEnableResume('/support', '?next=/support', testEnv)).resolves.toBeNull();
    await expect(signEnableResume('/support/closed', '?cursor=bad', testEnv)).resolves.toBeNull();
    await expect(signEnableResume('/support/bad.id', '', testEnv)).resolves.toBeNull();
    await expect(signEnableResume('/support/extra/seg', '', testEnv)).resolves.toBeNull();
    await expect(signEnableResume('/support/../x', '', testEnv)).resolves.toBeNull();
    await expect(signEnableResume('https://evil.example/support', '', testEnv)).resolves.toBeNull();
  });

  it('rejects forged invalid support resumes through the real verifier', async () => {
    const testEnv = makeTestEnv();
    const external = await forgedResume({ path: 'https://evil.example', queryString: '' }, testEnv);
    const extraSegment = await forgedResume({ path: '/support/extra/seg', queryString: '' }, testEnv);

    await expect(verifyEnableResume(external.next, external.nextSig, testEnv)).resolves.toBeNull();
    await expect(verifyEnableResume(extraSegment.next, extraSegment.nextSig, testEnv)).resolves.toBeNull();
  });

  it('sends signed-out /support through the signed local OTP resume gate', async () => {
    const testEnv = makeTestEnv();
    const response = await worker.fetch(new Request('https://services.solstone.app/support'), testEnv);

    // §9 makes /support the authenticated continuation rather than a public-site bounce.
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get('Location'), 'https://services.solstone.app');
    await expect(verifyEnableResume(location.searchParams.get('next'), location.searchParams.get('next_sig'), testEnv)).resolves.toEqual({
      path: '/support',
      queryString: '',
    });
  });

  it('sends signed-out /support/closed through its signed local OTP resume gate', async () => {
    const testEnv = makeTestEnv();
    const response = await worker.fetch(new Request('https://services.solstone.app/support/closed'), testEnv);

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get('Location'), 'https://services.solstone.app');
    await expect(verifyEnableResume(location.searchParams.get('next'), location.searchParams.get('next_sig'), testEnv)).resolves.toEqual({
      path: '/support/closed',
      queryString: '',
    });
  });

  it('shows the request-specific OTP prompt for signed-out /support/{id}', async () => {
    const testEnv = makeTestEnv();
    const landing = await followSupportRedirect('/support/REQ_77', testEnv);
    const body = await landing.text();

    expect(body).toContain("sign in with your email to see request #REQ_77. we'll email you a code.");
    expect(body).not.toMatch(/support[_-]?(nonce|token)|magic/i);
  });

  it('does not sign a malformed signed-out support id', async () => {
    const response = await worker.fetch(new Request('https://services.solstone.app/support/bad.id'), makeTestEnv());
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(body).toContain('request not found');
    expect(body).not.toContain('bad.id');
  });

  it('resumes to /support/{id} after OTP verification from the signed-out route', async () => {
    const testEnv = makeTestEnv();
    const path = '/support/REQ_1';
    const first = await worker.fetch(new Request(`https://services.solstone.app${path}`), testEnv);
    expect(first.status).toBe(303);
    const location = new URL(first.headers.get('Location'), 'https://services.solstone.app');
    const next = location.searchParams.get('next');
    const nextSig = location.searchParams.get('next_sig');
    const seeded = await seedOtp({ email: 'support-resume@example.com', options: { code: '123456' } });

    const response = await worker.fetch(verifyRequest({
      email: 'support-resume@example.com',
      code: seeded.code,
      next,
      nextSig,
    }), testEnv);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe(path);
  });
});

async function followSupportRedirect(path, testEnv) {
  const first = await worker.fetch(new Request(`https://services.solstone.app${path}`), testEnv);
  expect(first.status).toBe(303);
  const location = first.headers.get('Location');
  expect(location).toMatch(/^\/\?next=/);
  return worker.fetch(new Request(`https://services.solstone.app${location}`), testEnv);
}

async function forgedResume(payload, testEnv) {
  const next = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return {
    next,
    nextSig: await hashWithPepper(next, testEnv, 'HMAC_PEPPER'),
  };
}
