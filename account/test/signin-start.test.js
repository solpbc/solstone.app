import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env as workerEnv } from 'cloudflare:test';
import worker from '../src/index.js';
import { signNext } from '../src/oauth.js';
import {
  makeTestEnv,
  recordingDb,
  resetDb,
  responseSnapshot,
  rowCount,
  startRequest,
  stubTurnstile,
  validConnectParams,
  verifyRequest,
} from './helpers.js';

describe('/signin/start', () => {
  beforeEach(async () => {
    await resetDb();
    stubTurnstile(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not read account_emails on the admit path', async () => {
    const statements = [];
    const testEnv = makeTestEnv({ DB: recordingDb(workerEnv.DB, statements) });
    await worker.fetch(startRequest('new@example.com'), testEnv);
    expect(statements.some((sql) => /account_emails/i.test(sql))).toBe(false);
  });

  it('writes an OTP row for every admitted request', async () => {
    const testEnv = makeTestEnv();
    await worker.fetch(startRequest('new@example.com'), testEnv);
    expect(await rowCount('otp_tokens')).toBe(1);
    expect(testEnv.EMAIL.sent).toHaveLength(1);
  });

  it('sends an OTP email without sign-in links', async () => {
    const testEnv = makeTestEnv();
    await worker.fetch(startRequest('email@example.com'), testEnv);
    const message = testEnv.EMAIL.sent[0];
    const body = `${message.text}\n${message.html}`;
    const finishPath = ['/signin', 'finish'].join('/');

    expect(message.subject).toMatch(/^your sol pbc sign-in code: \d{3} \d{3}$/);
    expect(message.from).toBe('solstone services <services@solstone.app>');
    expect(message).not.toHaveProperty('Reply-To');
    expect(message).not.toHaveProperty('List-Unsubscribe');
    expect(message.text).toMatch(/10 minute/i);
    expect(message.html).toContain('#E8923A');
    expect(body).not.toContain(finishPath);
    expect(body).not.toContain('http://');
    expect(body).not.toContain('https://');
  });

  it('returns byte-identical redirects across valid-email branches', async () => {
    const snapshots = [];

    await resetDb();
    stubTurnstile(true);
    snapshots.push(await responseSnapshot(await worker.fetch(startRequest('same@example.com'), makeTestEnv())));

    await resetDb();
    stubTurnstile(true);
    const ipEnv = makeTestEnv();
    for (let i = 0; i < 10; i++) {
      await worker.fetch(startRequest(`ip-${i}@example.com`, { 'CF-Connecting-IP': '203.0.113.20' }), ipEnv);
    }
    snapshots.push(await responseSnapshot(
      await worker.fetch(startRequest('same@example.com', { 'CF-Connecting-IP': '203.0.113.20' }), ipEnv)
    ));

    await resetDb();
    stubTurnstile(true);
    const emailEnv = makeTestEnv();
    for (let i = 0; i < 5; i++) {
      await worker.fetch(startRequest('same@example.com', { 'CF-Connecting-IP': `203.0.113.${30 + i}` }), emailEnv);
    }
    snapshots.push(await responseSnapshot(
      await worker.fetch(startRequest('same@example.com', { 'CF-Connecting-IP': '203.0.113.40' }), emailEnv)
    ));

    await resetDb();
    stubTurnstile(false);
    snapshots.push(await responseSnapshot(await worker.fetch(startRequest('same@example.com'), makeTestEnv())));

    await resetDb();
    stubTurnstile(true);
    snapshots.push(await responseSnapshot(
      await worker.fetch(startRequest('same@example.com'), makeTestEnv({ emailSendError: true }))
    ));

    expect(snapshots.slice(1)).toEqual(snapshots.slice(1).map(() => snapshots[0]));
  });

  it('redirects invalid email to the bare verify page', async () => {
    const response = await worker.fetch(startRequest('not-an-email'), makeTestEnv());
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/signin/verify');
  });

  it('does not set a session cookie', async () => {
    const response = await worker.fetch(startRequest('new@example.com'), makeTestEnv());
    expect(response.headers.has('Set-Cookie')).toBe(false);
  });

  it('rejects a missing csrf token before side effects', async () => {
    const response = await worker.fetch(
      startRequest('missing-csrf@example.com', {}, { csrf: null }),
      makeTestEnv()
    );
    await expectStartCsrfRejected(response);
  });

  it('rejects a wrong csrf token before side effects', async () => {
    const response = await worker.fetch(
      startRequest('wrong-csrf@example.com', {}, { csrf: 'wrong' }),
      makeTestEnv()
    );
    await expectStartCsrfRejected(response);
  });

  it('rejects an unparseable csrf body before side effects', async () => {
    const response = await worker.fetch(
      new Request('https://services.solstone.app/signin/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"email":"json@example.com"}',
      }),
      makeTestEnv()
    );
    await expectStartCsrfRejected(response);
  });

  it('accepts the csrf token rendered on the landing form', async () => {
    const testEnv = makeTestEnv();
    const landing = await worker.fetch(new Request('https://services.solstone.app/'), testEnv);
    const csrf = extractCsrf(await landing.text());
    const response = await worker.fetch(
      startRequest('roundtrip@example.com', {}, { csrf }),
      testEnv
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/signin/verify?email=roundtrip%40example.com');
    expect(await rowCount('otp_tokens')).toBe(1);
    expect(testEnv.EMAIL.sent).toHaveLength(1);
  });

  it('preserves valid resume fields on the verify redirect', async () => {
    const testEnv = makeTestEnv();
    const resume = await signNext(new URLSearchParams(validConnectParams()).toString(), testEnv);
    const response = await worker.fetch(
      startRequest('resume@example.com', {}, {
        next: resume.next,
        nextSig: resume.nextSig,
      }),
      testEnv
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toContain(`next=${encodeURIComponent(resume.next)}`);
    expect(response.headers.get('Location')).toContain(`next_sig=${encodeURIComponent(resume.nextSig)}`);
  });

  it('bumps rate buckets before writing the OTP row', async () => {
    const statements = [];
    const testEnv = makeTestEnv({ DB: recordingDb(workerEnv.DB, statements) });
    await worker.fetch(startRequest('new@example.com'), testEnv);
    const firstRateBucket = statements.findIndex((sql) => /INSERT INTO rate_buckets/i.test(sql));
    const firstOtp = statements.findIndex((sql) => /INSERT INTO otp_tokens/i.test(sql));
    expect(firstRateBucket).toBeGreaterThanOrEqual(0);
    expect(firstOtp).toBeGreaterThan(firstRateBucket);
  });

  it('runs the csrf hash plus four start hash operations on every token-admitted branch', async () => {
    await expectHashWorkForBranch({
      email: 'admit@example.com',
      ip: '203.0.113.51',
      setup: async () => {
        await resetDb();
        stubTurnstile(true);
      },
    });
    await expectHashWorkForBranch({
      email: 'turnstile@example.com',
      ip: '203.0.113.52',
      setup: async () => {
        await resetDb();
        stubTurnstile(false);
      },
    });
    await expectHashWorkForBranch({
      email: 'not-an-email',
      ip: '203.0.113.53',
      setup: async () => {
        await resetDb();
        stubTurnstile(true);
      },
    });
    await expectHashWorkForBranch({
      email: 'ip-cap@example.com',
      ip: '203.0.113.54',
      setup: async () => {
        await resetDb();
        stubTurnstile(true);
        const setupEnv = makeTestEnv();
        for (let i = 0; i < 10; i++) {
          await worker.fetch(startRequest(`ip-cap-${i}@example.com`, { 'CF-Connecting-IP': '203.0.113.54' }), setupEnv);
        }
      },
    });
    await expectHashWorkForBranch({
      email: 'email-cap@example.com',
      ip: '203.0.113.65',
      setup: async () => {
        await resetDb();
        stubTurnstile(true);
        const setupEnv = makeTestEnv();
        for (let i = 0; i < 5; i++) {
          await worker.fetch(startRequest('email-cap@example.com', { 'CF-Connecting-IP': `203.0.113.${60 + i}` }), setupEnv);
        }
      },
    });
    await expectHashWorkForBranch({
      email: 'send-fail@example.com',
      ip: '203.0.113.66',
      env: makeTestEnv({ emailSendError: true }),
      setup: async () => {
        await resetDb();
        stubTurnstile(true);
      },
    });
  });

  it('rolls back the OTP row when email send fails', async () => {
    const testEnv = makeTestEnv({ emailSendError: true });
    const response = await worker.fetch(startRequest('send-fail@example.com'), testEnv);
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/signin/verify?email=send-fail%40example.com');
    expect(await rowCount('otp_tokens')).toBe(0);
    expect(testEnv.EMAIL.sent).toHaveLength(0);
  });

  it('email cap skips the OTP write and leaves the prior row verifiable', async () => {
    const testEnv = makeTestEnv();
    for (let i = 0; i < 5; i++) {
      await worker.fetch(startRequest('cap@example.com', { 'CF-Connecting-IP': `203.0.113.${70 + i}` }), testEnv);
    }
    const code = codeFromSubject(testEnv.EMAIL.sent.at(-1).subject);

    const capped = await worker.fetch(
      startRequest('cap@example.com', { 'CF-Connecting-IP': '203.0.113.80' }),
      testEnv
    );
    expect(capped.status).toBe(303);
    expect(testEnv.EMAIL.sent).toHaveLength(5);
    expect(await rowCount('otp_tokens')).toBe(1);

    const verified = await worker.fetch(verifyRequest({ email: 'cap@example.com', code }), testEnv);
    expect(verified.status).toBe(303);
    expect(verified.headers.get('Location')).toBe('/?welcome=1');
  });
});

async function expectHashWorkForBranch({ email, ip, setup, env = makeTestEnv() }) {
  await setup();
  const inputs = [];
  const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementation((algorithm, data) => {
    inputs.push(new TextDecoder().decode(data));
    return originalDigest(algorithm, data);
  });

  await worker.fetch(startRequest(email, { 'CF-Connecting-IP': ip }), env);

  expect(inputs).toHaveLength(5);
  expect(inputs[0]).toBe('csrf:accounttest-hmac-pepper');
  expect(inputs[1]).toMatch(/^\d{6}test-hmac-pepper$/);
  expect(inputs[2]).toBe(`${email.trim().toLowerCase()}test-hmac-pepper`);
  expect(inputs[3]).toBe(`signin_ip:${ip}test-hmac-pepper`);
  expect(inputs[4]).toBe(`signin_email:${email.trim().toLowerCase()}test-hmac-pepper`);
  vi.restoreAllMocks();
}

async function expectStartCsrfRejected(response) {
  const body = await response.text();
  expect(response.status).toBe(403);
  expect(body).toContain('email security');
  expect(body).toContain('https://services.solstone.app');
  expect(await rowCount('otp_tokens')).toBe(0);
  expect(await rowCount('rate_buckets')).toBe(0);
  expect(response.headers.has('Set-Cookie')).toBe(false);
}

function extractCsrf(body) {
  return body.match(/name="csrf" value="([^"]+)"/)?.[1] || '';
}

function codeFromSubject(subject) {
  const match = subject.match(/: (\d{3}) (\d{3})$/);
  return `${match[1]}${match[2]}`;
}
