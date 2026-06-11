import { createExecutionContext, env as workerEnv, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  emailAddRequest,
  fetchWithCtx,
  makeTestEnv,
  recordingDb,
  resetDb,
  responseSnapshot,
  rowCount,
  seedAccount,
  seedAccountEmail,
  seedCredential,
  seedSession,
} from './helpers.js';

describe('settings emails list and add flow', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  it('renders settings shell email count and transparency link', async () => {
    const { testEnv, account, session } = await setupAccount();
    await seedCredential({ accountId: account.accountId, credentialId: 'shell-credential' });
    await seedAccountEmail({
      accountId: account.accountId,
      address: 'secondary@example.com',
      verifiedAt: 2_000,
      testEnv,
    });

    const response = await worker.fetch(settingsRequest('/sign-in', session.cookie), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toContain('<span class="meta" style="margin:0">1 active</span>');
    expect(body).toContain('<div class="title">passkeys</div>');
    expect(body).toContain('href="/sign-in/emails"');
    expect(body).toContain('<span class="meta" style="margin:0">2</span>');
    expect(body).toContain('href="/sign-in/data"');
  });

  it('renders email rows sorted primary first then newest', async () => {
    const { testEnv, account, session } = await setupAccount({ nowMs: 1_000 });
    await seedAccountEmail({
      accountId: account.accountId,
      address: 'old@example.com',
      verifiedAt: 2_000,
      createdAt: 2_000,
      testEnv,
    });
    await seedAccountEmail({
      accountId: account.accountId,
      address: 'new@example.com',
      createdAt: 3_000,
      expiresAt: Date.now() + 600_000,
      code: '123456',
      testEnv,
    });

    const response = await worker.fetch(settingsRequest('/sign-in/emails', session.cookie), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body.indexOf('person@example.com')).toBeLessThan(body.indexOf('new@example.com'));
    expect(body.indexOf('new@example.com')).toBeLessThan(body.indexOf('old@example.com'));
  });

  it('renders badges, actions, expiry text, and add form', async () => {
    const { testEnv, account, session } = await setupAccount();
    const verified = await seedAccountEmail({
      accountId: account.accountId,
      address: 'verified@example.com',
      verifiedAt: Date.now(),
      testEnv,
    });
    const unverified = await seedAccountEmail({
      accountId: account.accountId,
      address: 'unverified@example.com',
      code: '123456',
      expiresAt: Date.now() + 600_000,
      testEnv,
    });
    await seedAccountEmail({
      accountId: account.accountId,
      address: 'expired@example.com',
      code: '654321',
      expiresAt: Date.now() - 1_000,
      testEnv,
    });

    const response = await worker.fetch(settingsRequest('/sign-in/emails', session.cookie), testEnv);
    const body = await response.text();

    expect(body).toContain('primary');
    expect(body).toContain('verified@example.com');
    expect(body).toContain(`/sign-in/emails/${verified.id}/make-primary`);
    expect(body).toContain(`/sign-in/emails/${verified.id}/remove`);
    expect(body).toContain('unverified@example.com');
    expect(body).toContain(`/sign-in/emails/verify?address=unverified%40example.com`);
    expect(body).toContain(`/sign-in/emails/${unverified.id}/remove`);
    expect(body).toContain('code expires in');
    expect(body).toContain('code expired — request a new one');
    expect(body).toContain('action="/sign-in/emails/add"');
    expect(body).toContain('name="address"');
    expect(primarySection(body)).not.toContain('make-primary');
    expect(primarySection(body)).not.toContain('/remove');
  });

  it('adds a new email row and queues a verification email', async () => {
    const { testEnv, session } = await setupAccount();
    const before = Date.now();

    const { response } = await fetchWithCtx(
      worker,
      emailAddRequest({ address: 'Added@Example.com', cookie: session.cookie }),
      testEnv
    );
    const row = await emailByAddress('added@example.com', testEnv);
    const after = Date.now();
    const message = testEnv.EMAIL.sent[0];
    const body = `${message.text}\n${message.html}`;

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/sign-in/emails/verify?address=added%40example.com');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.has('Set-Cookie')).toBe(false);
    expect(row.verified_at).toBeNull();
    expect(row.verification_code_hash).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(row.verification_attempts).toBe(0);
    expect(row.verification_expires_at).toBeGreaterThanOrEqual(before + 10 * 60 * 1000 - 1_000);
    expect(row.verification_expires_at).toBeLessThanOrEqual(after + 10 * 60 * 1000 + 1_000);
    expect(testEnv.EMAIL.sent).toHaveLength(1);
    expect(message.subject).toMatch(/^verify your sol pbc email: \d{3} \d{3}$/);
    expect(body).toContain('to verify this email address for your sol pbc sign-in');
    expect(body).not.toContain('http://');
    expect(body).not.toContain('https://');
  });

  it('resends for an existing unverified same-account email', async () => {
    const { testEnv, account, session } = await setupAccount();
    const seeded = await seedAccountEmail({
      accountId: account.accountId,
      address: 'resend@example.com',
      code: '111111',
      expiresAt: Date.now() + 600_000,
      attempts: 3,
      testEnv,
    });
    const before = await emailRow(seeded.id);

    const { response } = await fetchWithCtx(
      worker,
      emailAddRequest({ address: 'resend@example.com', cookie: session.cookie }),
      testEnv
    );
    const after = await emailRow(seeded.id);

    expect(response.status).toBe(303);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await rowCount('account_emails')).toBe(2);
    expect(after.verification_code_hash).not.toBe(before.verification_code_hash);
    expect(after.verification_attempts).toBe(0);
    expect(after.verification_expires_at).toBeGreaterThan(before.verification_expires_at);
    expect(testEnv.EMAIL.sent).toHaveLength(1);
  });

  it('does not send or write for already verified same-account email and shows notice', async () => {
    const { testEnv, account, session } = await setupAccount();
    await seedAccountEmail({
      accountId: account.accountId,
      address: 'verified-same@example.com',
      verifiedAt: Date.now(),
      testEnv,
    });

    const { response } = await fetchWithCtx(
      worker,
      emailAddRequest({ address: 'verified-same@example.com', cookie: session.cookie }),
      testEnv
    );
    const verify = await worker.fetch(
      settingsRequest('/sign-in/emails/verify?address=verified-same%40example.com', session.cookie),
      testEnv
    );
    const body = await verify.text();

    expect(response.status).toBe(303);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await rowCount('account_emails')).toBe(2);
    expect(testEnv.EMAIL.sent).toHaveLength(0);
    expect(body).toContain('this email is already verified for your sign-in.');
  });

  it('hides third-party collisions with a byte-identical redirect and scrubbed log', async () => {
    const freshSnapshot = await addSnapshotForNewAddress('collision@example.com');

    await resetDb();
    const testEnv = makeTestEnv();
    const actor = await seedAccount({ email: 'actor@example.com', testEnv });
    const owner = await seedAccount({ email: 'owner@example.com', testEnv });
    const session = await seedSession(actor.accountId, { testEnv });
    await seedAccountEmail({
      accountId: owner.accountId,
      address: 'collision@example.com',
      verifiedAt: Date.now(),
      testEnv,
    });
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { response } = await fetchWithCtx(
      worker,
      emailAddRequest({ address: 'collision@example.com', cookie: session.cookie }),
      testEnv
    );
    const snapshot = await responseSnapshot(response);

    expect(snapshot).toEqual(freshSnapshot);
    expect(await rowCount('account_emails')).toBe(3);
    expect(await emailByAddress('collision@example.com', testEnv, actor.accountId)).toBeNull();
    expect(testEnv.EMAIL.sent).toHaveLength(0);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('add_addr_collision'));
    expect(spy.mock.calls[0][0]).toContain(actor.accountId);
    expect(spy.mock.calls[0][0]).not.toContain('collision@example.com');
  });

  it('rate cap behaves exactly like third-party collision', async () => {
    const collisionSnapshot = await collisionSnapshotForAddress('rate-cap@example.com');

    await resetDb();
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    for (let i = 0; i < 10; i++) {
      await fetchWithCtx(
        worker,
        emailAddRequest({ address: `cap-${i}@example.com`, cookie: session.cookie }),
        testEnv
      );
    }

    const beforeSendCount = testEnv.EMAIL.sent.length;
    const collisionSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { response } = await fetchWithCtx(
      worker,
      emailAddRequest({ address: 'rate-cap@example.com', cookie: session.cookie }),
      testEnv
    );
    const cappedSnapshot = await responseSnapshot(response);

    expect(cappedSnapshot).toEqual(collisionSnapshot);
    expect(testEnv.EMAIL.sent).toHaveLength(beforeSendCount);
    expect(await emailByAddress('rate-cap@example.com', testEnv, account.accountId)).toBeNull();
    expect(collisionSpy).toHaveBeenCalledWith(expect.stringContaining('add_addr_collision'));
  });

  it('returns byte-identical redirects with no cookies across valid add branches and rate cap', async () => {
    const address = 'snapshot@example.com';
    const scenarios = [
      async () => setupAccount({ email: 'snapshot-new@example.com' }),
      async () => {
        const setup = await setupAccount({ email: 'snapshot-unverified@example.com' });
        await seedAccountEmail({
          accountId: setup.account.accountId,
          address,
          code: '111111',
          expiresAt: Date.now() + 600_000,
          testEnv: setup.testEnv,
        });
        return setup;
      },
      async () => {
        const setup = await setupAccount({ email: 'snapshot-verified@example.com' });
        await seedAccountEmail({
          accountId: setup.account.accountId,
          address,
          verifiedAt: Date.now(),
          testEnv: setup.testEnv,
        });
        return setup;
      },
      async () => {
        const setup = await setupAccount({ email: 'snapshot-collision@example.com' });
        const owner = await seedAccount({ email: 'snapshot-owner@example.com', testEnv: setup.testEnv });
        await seedAccountEmail({
          accountId: owner.accountId,
          address,
          verifiedAt: Date.now(),
          testEnv: setup.testEnv,
        });
        return setup;
      },
      async () => {
        const setup = await setupAccount({ email: 'snapshot-cap@example.com' });
        for (let i = 0; i < 10; i++) {
          await fetchWithCtx(
            worker,
            emailAddRequest({ address: `snapshot-cap-${i}@example.com`, cookie: setup.session.cookie }),
            setup.testEnv
          );
        }
        return setup;
      },
    ];
    const snapshots = [];
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    for (const makeScenario of scenarios) {
      await resetDb();
      const { testEnv, session } = await makeScenario();
      const { response } = await fetchWithCtx(
        worker,
        emailAddRequest({ address, cookie: session.cookie }),
        testEnv
      );

      expect(response.status).toBe(303);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.has('Set-Cookie')).toBe(false);
      snapshots.push(await responseSnapshot(response));
    }

    for (const snapshot of snapshots.slice(1)) {
      expect(snapshot).toEqual(snapshots[0]);
    }
  });

  it('returns 400 for invalid email without hash, rate bump, row write, or send', async () => {
    const { testEnv, session } = await setupAccount();
    const statements = [];
    const digestSpy = vi.spyOn(crypto.subtle, 'digest');

    const response = await worker.fetch(
      emailAddRequest({ address: 'not-an-email', cookie: session.cookie }),
      makeTestEnv({ DB: recordingDb(workerEnv.DB, statements) })
    );
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toContain('enter a valid email address.');
    expect(statements.some((sql) => /rate_buckets/i.test(sql))).toBe(false);
    expect(statements.some((sql) => /INSERT INTO account_emails/i.test(sql))).toBe(false);
    expect(digestSpy).toHaveBeenCalledTimes(1);
    expect(testEnv.EMAIL.sent).toHaveLength(0);
  });

  it('runs constant hash work on every valid add branch', async () => {
    const branches = [
      async () => setupAccount({ email: 'new-branch@example.com' }),
      async () => {
        const setup = await setupAccount({ email: 'unverified-branch@example.com' });
        await seedAccountEmail({
          accountId: setup.account.accountId,
          address: 'branch@example.com',
          code: '111111',
          expiresAt: Date.now() + 600_000,
          testEnv: setup.testEnv,
        });
        return setup;
      },
      async () => {
        const setup = await setupAccount({ email: 'verified-branch@example.com' });
        await seedAccountEmail({
          accountId: setup.account.accountId,
          address: 'branch@example.com',
          verifiedAt: Date.now(),
          testEnv: setup.testEnv,
        });
        return setup;
      },
      async () => {
        const setup = await setupAccount({ email: 'collision-branch@example.com' });
        const owner = await seedAccount({ email: 'owner-branch@example.com', testEnv: setup.testEnv });
        await seedAccountEmail({
          accountId: owner.accountId,
          address: 'branch@example.com',
          verifiedAt: Date.now(),
          testEnv: setup.testEnv,
        });
        return setup;
      },
    ];

    for (const makeBranch of branches) {
      await resetDb();
      const { testEnv, account, session } = await makeBranch();
      const inputs = [];
      const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
      vi.spyOn(crypto.subtle, 'digest').mockImplementation((algorithm, data) => {
        inputs.push(new TextDecoder().decode(data));
        return originalDigest(algorithm, data);
      });
      await fetchWithCtx(
        worker,
        emailAddRequest({ address: 'branch@example.com', cookie: session.cookie }),
        testEnv
      );
      expect(inputs).toContain('branch@example.comtest-hmac-pepper');
      expect(inputs).toContain(`add_email_per_day:${account.accountId}test-hmac-pepper`);
      expect(inputs.some((input) => /^\d{6}test-hmac-pepper$/.test(input))).toBe(true);
      vi.restoreAllMocks();
    }
  });

  it('keeps valid add branch response timing within 50ms', async () => {
    const durations = [];
    const scenarios = [
      async () => setupAccount({ email: 'timing-new@example.com' }),
      async () => {
        const setup = await setupAccount({ email: 'timing-unverified@example.com' });
        await seedAccountEmail({
          accountId: setup.account.accountId,
          address: 'timing@example.com',
          code: '111111',
          expiresAt: Date.now() + 600_000,
          testEnv: setup.testEnv,
        });
        return setup;
      },
      async () => {
        const setup = await setupAccount({ email: 'timing-verified@example.com' });
        await seedAccountEmail({
          accountId: setup.account.accountId,
          address: 'timing@example.com',
          verifiedAt: Date.now(),
          testEnv: setup.testEnv,
        });
        return setup;
      },
      async () => {
        const setup = await setupAccount({ email: 'timing-collision@example.com' });
        const owner = await seedAccount({ email: 'timing-owner@example.com', testEnv: setup.testEnv });
        await seedAccountEmail({
          accountId: owner.accountId,
          address: 'timing@example.com',
          verifiedAt: Date.now(),
          testEnv: setup.testEnv,
        });
        return setup;
      },
    ];

    await addSnapshotForNewAddress('warmup@example.com');
    for (const makeScenario of scenarios) {
      await resetDb();
      const { testEnv, session } = await makeScenario();
      const ctx = createExecutionContext();
      const start = performance.now();
      const response = await worker.fetch(
        emailAddRequest({ address: 'timing@example.com', cookie: session.cookie }),
        testEnv,
        ctx
      );
      durations.push(performance.now() - start);
      expect(response.status).toBe(303);
      await waitOnExecutionContext(ctx);
    }

    expect(Math.max(...durations) - Math.min(...durations)).toBeLessThan(50);
  });

  it('does not use INSERT ON CONFLICT for resend', async () => {
    const { account, session } = await setupAccount();
    await seedAccountEmail({
      accountId: account.accountId,
      address: 'sql-resend@example.com',
      code: '111111',
      expiresAt: Date.now() + 600_000,
    });
    const statements = [];
    const testEnv = makeTestEnv({ DB: recordingDb(workerEnv.DB, statements) });

    const { response } = await fetchWithCtx(
      worker,
      emailAddRequest({ address: 'sql-resend@example.com', cookie: session.cookie }),
      testEnv
    );

    expect(response.status).toBe(303);
    expect(statements.some((sql) => /UPDATE account_emails\s+SET verification_code_hash/i.test(sql))).toBe(true);
    expect(statements.some((sql) => /ON CONFLICT/i.test(sql) && /account_emails/i.test(sql))).toBe(false);
  });

  it('logs verify send failures inside waitUntil without rolling back the row', async () => {
    const { session } = await setupAccount();
    const testEnv = makeTestEnv({ emailSendError: true });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { response } = await fetchWithCtx(
      worker,
      emailAddRequest({ address: 'send-fail@example.com', cookie: session.cookie }),
      testEnv
    );
    const row = await emailByAddress('send-fail@example.com', testEnv);

    expect(response.status).toBe(303);
    expect(spy).toHaveBeenCalledWith('verify_send_failed');
    expect(row.verification_code_hash).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(testEnv.EMAIL.sent).toHaveLength(0);
  });
});

async function setupAccount({ email = 'person@example.com', nowMs = Date.now() } = {}) {
  const testEnv = makeTestEnv();
  const account = await seedAccount({ email, nowMs, testEnv });
  const session = await seedSession(account.accountId, { testEnv });
  return { testEnv, account, session };
}

function settingsRequest(path, cookie) {
  return new Request(`https://services.solstone.app${path}`, {
    headers: { Cookie: cookie },
  });
}

function primarySection(body) {
  const address = body.indexOf('person@example.com');
  const start = body.lastIndexOf('<div class="row" style="cursor:default">', address);
  const next = body.indexOf('<div class="row" style="cursor:default">', start + 1);
  const end = next === -1 ? body.indexOf('<div class="card">', start) : next;
  return body.slice(start, end);
}

async function emailByAddress(address, testEnv, accountId = null) {
  const accountFilter = accountId ? ' AND account_id = ?' : '';
  const hash = await import('../src/crypto.js').then(({ hashWithPepper }) => hashWithPepper(address, testEnv));
  const stmt = workerEnv.DB.prepare(`SELECT * FROM account_emails WHERE address_lower_hash = ?${accountFilter}`);
  return accountId ? stmt.bind(hash, accountId).first() : stmt.bind(hash).first();
}

async function emailRow(id) {
  return workerEnv.DB.prepare('SELECT * FROM account_emails WHERE id = ?').bind(id).first();
}

async function addSnapshotForNewAddress(address) {
  await resetDb();
  const { testEnv, session } = await setupAccount({ email: `actor-${address}` });
  const { response } = await fetchWithCtx(
    worker,
    emailAddRequest({ address, cookie: session.cookie }),
    testEnv
  );
  const snapshot = await responseSnapshot(response);
  vi.restoreAllMocks();
  return snapshot;
}

async function collisionSnapshotForAddress(address) {
  await resetDb();
  const testEnv = makeTestEnv();
  const actor = await seedAccount({ email: `actor-${address}`, testEnv });
  const owner = await seedAccount({ email: `owner-${address}`, testEnv });
  const session = await seedSession(actor.accountId, { testEnv });
  await seedAccountEmail({
    accountId: owner.accountId,
    address,
    verifiedAt: Date.now(),
    testEnv,
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { response } = await fetchWithCtx(
    worker,
    emailAddRequest({ address, cookie: session.cookie }),
    testEnv
  );
  return responseSnapshot(response);
}
