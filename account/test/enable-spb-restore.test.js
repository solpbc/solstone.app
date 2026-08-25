import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { decryptEmail, hashServiceHandoffNonce, hashWithPepper } from '../src/crypto.js';
import { rotateSpbBindingToken } from '../src/db.js';
import {
  TEST_CSRF,
  installConsoleSpy,
  installS3FetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedSession,
  seedSpbBinding,
  seedSpbSweepAudit,
} from './helpers.js';

const SERVICE = 'spb_hosted';
const NONCE_A = '4'.repeat(52);
const NONCE_B = '5'.repeat(52);
const NONCE_C = '6'.repeat(52);
const INSTANCE_A = '11111111-1111-1111-1111-111111111111';
const INSTANCE_B = '22222222-2222-2222-2222-222222222222';
const INSTANCE_C = '33333333-3333-3333-3333-333333333333';

describe('/enable/backup?intent=restore', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('uses only the authenticated account, ignoring supplied account and instance coordinates', async () => {
    const testEnv = makeTestEnv();
    const owner = await seedAccount({ email: 'restore-owner@example.com', testEnv });
    const foreign = await seedAccount({ email: 'restore-foreign@example.com', testEnv });
    const session = await seedSession(owner.accountId, { testEnv });
    await seedEntitlement({ accountId: owner.accountId, service: SERVICE, status: 'active' });
    await seedSpbBinding({ accountId: owner.accountId, instanceId: INSTANCE_A, createdAt: 1_000 });
    await seedSpbBinding({ accountId: foreign.accountId, instanceId: INSTANCE_B, createdAt: 1_000 });
    installRestoreS3(testEnv, {
      [prefix(owner.accountId, INSTANCE_A)]: objects(),
      [prefix(foreign.accountId, INSTANCE_B)]: objects(),
    });

    const response = await worker.fetch(new Request(restoreUrl({
      nonce: NONCE_A,
      account: foreign.accountId,
      instance: 'not-an-instance',
    }), { headers: { Cookie: session.cookie } }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain(`name="selected_instance" value="${INSTANCE_A}"`);
    expect(body).not.toContain(INSTANCE_B);
    expect(await handoffRow(NONCE_A, testEnv)).toBeNull();
  });

  it('resolves zero bindings and empty prefixes to no_hosted_backup before entitlement without mutations', async () => {
    const testEnv = makeTestEnv();
    const zero = await seedAccount({ email: 'restore-zero@example.com', testEnv });
    const empty = await seedAccount({ email: 'restore-empty@example.com', testEnv });
    const zeroSession = await seedSession(zero.accountId, { testEnv });
    const emptySession = await seedSession(empty.accountId, { testEnv });
    await seedSpbBinding({ accountId: empty.accountId, instanceId: INSTANCE_A, tokenHash: 'old-token-hash' });
    installRestoreS3(testEnv, { [prefix(empty.accountId, INSTANCE_A)]: [] });

    const zeroResponse = await worker.fetch(new Request(restoreUrl({ nonce: NONCE_A }), {
      headers: { Cookie: zeroSession.cookie },
    }), testEnv);
    const emptyResponse = await worker.fetch(new Request(restoreUrl({ nonce: NONCE_B }), {
      headers: { Cookie: emptySession.cookie },
    }), testEnv);

    for (const [response, nonce] of [[zeroResponse, NONCE_A], [emptyResponse, NONCE_B]]) {
      const body = await response.text();
      expect(response.status).toBe(200);
      expect(body).toContain("sol pbc isn't holding an encrypted copy under this sign-in");
      expect(body).not.toContain('turn encrypted backup back on');
      await expect(handoffPayload(nonce, testEnv)).resolves.toEqual({ status: 'refused', reason_code: 'no_hosted_backup' });
    }
    await expect(bindingRow(empty.accountId, INSTANCE_A)).resolves.toMatchObject({ token_hash: 'old-token-hash' });
    await expect(rowCount('entitlements')).resolves.toBe(0);
  });

  it('re-renders a terminal restore outcome when its handoff nonce already exists', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'restore-terminal-reload@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const request = () => new Request(restoreUrl({ nonce: NONCE_A }), { headers: { Cookie: session.cookie } });

    const first = await worker.fetch(request(), testEnv);
    const firstBody = await first.text();
    const second = await worker.fetch(request(), testEnv);
    const secondBody = await second.text();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstBody).toContain("sol pbc isn't holding an encrypted copy under this sign-in");
    expect(secondBody).toBe(firstBody);
    await expect(rowCount('service_handoffs')).resolves.toBe(1);
  });

  it('requires an exact current binding and sweep audit for hosted_backup_expired', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'restore-expired@example.com', testEnv });
    const foreign = await seedAccount({ email: 'restore-expired-foreign@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const auditTs = Date.UTC(2025, 4, 6);
    await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_A, lapsedAt: 1, createdAt: 5 });
    await seedSpbSweepAudit({ accountId: account.accountId, instanceId: INSTANCE_A, ts: auditTs });
    await seedSpbSweepAudit({ accountId: account.accountId, instanceId: INSTANCE_B, ts: Date.UTC(2027, 0, 1) });
    await seedSpbSweepAudit({ accountId: foreign.accountId, instanceId: INSTANCE_A, ts: Date.UTC(2027, 0, 2) });
    installRestoreS3(testEnv, { [prefix(account.accountId, INSTANCE_A)]: [] });

    const response = await worker.fetch(new Request(restoreUrl({ nonce: NONCE_A }), {
      headers: { Cookie: session.cookie },
    }), testEnv);
    const body = await response.text();

    expect(body).toContain('sol pbc deleted an encrypted copy');
    expect(body).toContain('on 2025-05-06, sol pbc deleted that copy.');
    expect(body).not.toContain('set up encrypted backup');
    await expect(handoffPayload(NONCE_A, testEnv)).resolves.toEqual({ status: 'refused', reason_code: 'hosted_backup_expired' });
  });

  it('treats empty prefixes without exact audit evidence as no_hosted_backup even when other audit rows exist', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'restore-no-audit@example.com', testEnv });
    const foreign = await seedAccount({ email: 'restore-no-audit-foreign@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_A });
    await seedSpbSweepAudit({ accountId: foreign.accountId, instanceId: INSTANCE_A });
    await seedSpbSweepAudit({ accountId: account.accountId, instanceId: INSTANCE_B });
    installRestoreS3(testEnv, { [prefix(account.accountId, INSTANCE_A)]: [] });

    const response = await worker.fetch(new Request(restoreUrl({ nonce: NONCE_A }), {
      headers: { Cookie: session.cookie },
    }), testEnv);

    expect(await response.text()).toContain("sol pbc isn't holding an encrypted copy under this sign-in");
    await expect(handoffPayload(NONCE_A, testEnv)).resolves.toEqual({ status: 'refused', reason_code: 'no_hosted_backup' });
  });

  it('requires consent before rotating a single recoverable binding, then approves only that coordinate', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'restore-single@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const oldHash = 'old-token-hash';
    await seedEntitlement({ accountId: account.accountId, service: SERVICE, status: 'active' });
    await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_A, tokenHash: oldHash, createdAt: 2_000 });
    installRestoreS3(testEnv, { [prefix(account.accountId, INSTANCE_A)]: objects() });

    const get = await worker.fetch(new Request(restoreUrl({ nonce: NONCE_A }), { headers: { Cookie: session.cookie } }), testEnv);
    const getBody = await get.text();
    expect(getBody).toContain('restore from encrypted backup');
    expect(getBody).toContain('last backup');
    expect(getBody).toContain(`name="selected_instance" value="${INSTANCE_A}"`);
    expect(await bindingRow(account.accountId, INSTANCE_A)).toMatchObject({ token_hash: oldHash });
    expect(await handoffRow(NONCE_A, testEnv)).toBeNull();

    const confirm = await worker.fetch(restoreConfirm({ cookie: session.cookie, nonce: NONCE_A, selectedInstance: INSTANCE_A }), testEnv);
    const payload = await handoffPayload(NONCE_A, testEnv);
    expect(confirm.status).toBe(200);
    expect(payload).toMatchObject({
      status: 'approved',
      account_id: account.accountId,
      instance_id: INSTANCE_A,
      prefix: prefix(account.accountId, INSTANCE_A),
      broker_token: expect.any(String),
    });
    expect(await bindingRow(account.accountId, INSTANCE_A)).toMatchObject({
      token_hash: await hashWithPepper(payload.broker_token, testEnv),
    });
  });

  it('uses an update-only rotation and re-resolves when the selected row vanishes', async () => {
    const testEnv = makeTestEnv();
    const direct = await seedAccount({ email: 'restore-rotate-direct@example.com', testEnv });
    await seedSpbBinding({ accountId: direct.accountId, instanceId: INSTANCE_A, tokenHash: 'before-delete' });
    await workerEnv.DB
      .prepare('DELETE FROM spb_bindings WHERE account_id = ? AND instance_id = ?')
      .bind(direct.accountId, INSTANCE_A)
      .run();
    await expect(rotateSpbBindingToken(workerEnv.DB, {
      accountId: direct.accountId,
      instanceId: INSTANCE_A,
      tokenHash: 'after-delete',
      nowMs: 2_000,
    })).resolves.toBe(false);
    await expect(bindingRow(direct.accountId, INSTANCE_A)).resolves.toBeNull();

    const account = await seedAccount({ email: 'restore-rotate-race@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedEntitlement({ accountId: account.accountId, service: SERVICE, status: 'active' });
    await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_A, tokenHash: 'before-race' });
    const racingEnv = makeTestEnv({ DB: deleteBeforeSpbRotate(account.accountId, INSTANCE_A) });
    installRestoreS3(racingEnv, { [prefix(account.accountId, INSTANCE_A)]: objects() });

    const response = await worker.fetch(restoreConfirm({
      cookie: session.cookie,
      nonce: NONCE_A,
      selectedInstance: INSTANCE_A,
    }), racingEnv);
    const payload = await handoffPayload(NONCE_A, racingEnv);

    expect(response.status).toBe(200);
    expect(payload).toEqual({ status: 'refused', reason_code: 'no_hosted_backup' });
    await expect(bindingRow(account.accountId, INSTANCE_A)).resolves.toBeNull();
  });

  it('fails a duplicate restore-confirm nonce instead of reporting a second success', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'restore-duplicate-nonce@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedEntitlement({ accountId: account.accountId, service: SERVICE, status: 'active' });
    await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_A, tokenHash: 'before-first' });
    installRestoreS3(testEnv, { [prefix(account.accountId, INSTANCE_A)]: objects() });
    const request = () => restoreConfirm({
      cookie: session.cookie,
      nonce: NONCE_A,
      selectedInstance: INSTANCE_A,
    });

    const first = await worker.fetch(request(), testEnv);
    const payload = await handoffPayload(NONCE_A, testEnv);
    const firstHash = (await bindingRow(account.accountId, INSTANCE_A)).token_hash;
    const second = await worker.fetch(request(), testEnv);
    const secondHash = (await bindingRow(account.accountId, INSTANCE_A)).token_hash;

    expect(first.status).toBe(200);
    expect(second.status).toBe(503);
    expect(await handoffPayload(NONCE_A, testEnv)).toEqual(payload);
    expect(secondHash).not.toBe(firstHash);
    await expect(rowCount('service_handoffs')).resolves.toBe(1);
  });

  it('shows several recoverable candidates with no default and rotates only explicit selections', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'restore-several@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedEntitlement({ accountId: account.accountId, service: SERVICE, status: 'active' });
    await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_A, tokenHash: 'hash-a', createdAt: 1_000 });
    await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_B, tokenHash: 'hash-b', createdAt: 2_000 });
    installRestoreS3(testEnv, {
      [prefix(account.accountId, INSTANCE_A)]: objects('a'),
      [prefix(account.accountId, INSTANCE_B)]: objects('b'),
    });

    const initial = await worker.fetch(new Request(restoreUrl({ nonce: NONCE_A }), { headers: { Cookie: session.cookie } }), testEnv);
    const initialBody = await initial.text();
    expect(initialBody).toContain('choose which one to restore.');
    expect(initialBody).toContain('name="selected_instance"');
    expect(initialBody).not.toContain('checked');

    const omitted = await worker.fetch(restoreConfirm({ cookie: session.cookie, nonce: NONCE_A }), testEnv);
    expect(await omitted.text()).toContain('nothing is selected yet.');
    expect(await handoffRow(NONCE_A, testEnv)).toBeNull();
    await expect(bindingRow(account.accountId, INSTANCE_A)).resolves.toMatchObject({ token_hash: 'hash-a' });
    await expect(bindingRow(account.accountId, INSTANCE_B)).resolves.toMatchObject({ token_hash: 'hash-b' });

    await worker.fetch(restoreConfirm({ cookie: session.cookie, nonce: NONCE_A, selectedInstance: INSTANCE_A }), testEnv);
    const first = await handoffPayload(NONCE_A, testEnv);
    expect(first.instance_id).toBe(INSTANCE_A);
    const hashAfterA = (await bindingRow(account.accountId, INSTANCE_A)).token_hash;
    expect((await bindingRow(account.accountId, INSTANCE_B)).token_hash).toBe('hash-b');

    await worker.fetch(restoreConfirm({ cookie: session.cookie, nonce: NONCE_B, selectedInstance: INSTANCE_B }), testEnv);
    const second = await handoffPayload(NONCE_B, testEnv);
    expect(second.instance_id).toBe(INSTANCE_B);
    expect((await bindingRow(account.accountId, INSTANCE_A)).token_hash).toBe(hashAfterA);
    expect((await bindingRow(account.accountId, INSTANCE_B)).token_hash).toBe(await hashWithPepper(second.broker_token, testEnv));
  });

  it('returns a non-mutating restore needs_subscription payload and retries the same binding after entitlement recovery', async () => {
    const testEnv = makeTestEnv();
    const first = await seedAccount({ email: 'restore-lapsed-first@example.com', testEnv });
    const second = await seedAccount({ email: 'restore-lapsed-second@example.com', testEnv });
    const firstSession = await seedSession(first.accountId, { testEnv });
    const secondSession = await seedSession(second.accountId, { testEnv });
    await seedSpbBinding({ accountId: first.accountId, instanceId: INSTANCE_A, tokenHash: 'first-hash', createdAt: 1_000 });
    await seedSpbBinding({ accountId: second.accountId, instanceId: INSTANCE_B, tokenHash: 'second-hash', createdAt: 1_000 });
    installRestoreS3(testEnv, {
      [prefix(first.accountId, INSTANCE_A)]: objects('first'),
      [prefix(second.accountId, INSTANCE_B)]: objects('second'),
    });

    for (const [account, session, nonce, instance, hash] of [
      [first, firstSession, NONCE_A, INSTANCE_A, 'first-hash'],
      [second, secondSession, NONCE_B, INSTANCE_B, 'second-hash'],
    ]) {
      const response = await worker.fetch(new Request(restoreUrl({ nonce }), { headers: { Cookie: session.cookie } }), testEnv);
      expect(await response.text()).toContain('encrypted backup is off');
      await expect(handoffPayload(nonce, testEnv)).resolves.toEqual({
        broker_endpoint: 'https://services.solstone.app',
        account_id: account.accountId,
        instance_id: instance,
        bucket: testEnv.R2_BUCKET,
        prefix: prefix(account.accountId, instance),
        broker_token: '',
        status: 'needs_subscription',
        subscribe_url: 'https://services.solstone.app/services/backup?intent=restore',
      });
      await expect(bindingRow(account.accountId, instance)).resolves.toMatchObject({ token_hash: hash });
    }

    await seedEntitlement({ accountId: first.accountId, service: SERVICE, status: 'active' });
    const recovered = await worker.fetch(new Request(restoreUrl({ nonce: NONCE_C }), { headers: { Cookie: firstSession.cookie } }), testEnv);
    expect(await recovered.text()).toContain('restore from encrypted backup');
    await worker.fetch(restoreConfirm({ cookie: firstSession.cookie, nonce: NONCE_C, selectedInstance: INSTANCE_A }), testEnv);
    expect((await handoffPayload(NONCE_C, testEnv)).instance_id).toBe(INSTANCE_A);

    const remainsLapsed = await worker.fetch(new Request(restoreUrl({ nonce: '7'.repeat(52) }), { headers: { Cookie: secondSession.cookie } }), testEnv);
    expect(await remainsLapsed.text()).toContain('encrypted backup is off');
  });

  it('creates encrypted one-time approved, refused, and needs_subscription handoffs without secret leakage', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    const refused = await seedAccount({ email: 'restore-once-refused@example.com', testEnv });
    const needed = await seedAccount({ email: 'restore-once-needed@example.com', testEnv });
    const approved = await seedAccount({ email: 'restore-once-approved@example.com', testEnv });
    const refusedSession = await seedSession(refused.accountId, { testEnv });
    const neededSession = await seedSession(needed.accountId, { testEnv });
    const approvedSession = await seedSession(approved.accountId, { testEnv });
    await seedSpbBinding({ accountId: needed.accountId, instanceId: INSTANCE_A });
    await seedSpbBinding({ accountId: approved.accountId, instanceId: INSTANCE_B });
    await seedEntitlement({ accountId: approved.accountId, service: SERVICE, status: 'active' });
    installRestoreS3(testEnv, {
      [prefix(needed.accountId, INSTANCE_A)]: objects(),
      [prefix(approved.accountId, INSTANCE_B)]: objects(),
    });
    try {
      await worker.fetch(new Request(restoreUrl({ nonce: NONCE_A }), { headers: { Cookie: refusedSession.cookie } }), testEnv);
      await worker.fetch(new Request(restoreUrl({ nonce: NONCE_B }), { headers: { Cookie: neededSession.cookie } }), testEnv);
      await worker.fetch(new Request(restoreUrl({ nonce: NONCE_C }), { headers: { Cookie: approvedSession.cookie } }), testEnv);
      await worker.fetch(restoreConfirm({ cookie: approvedSession.cookie, nonce: NONCE_C, selectedInstance: INSTANCE_B }), testEnv);

      const refusedPayload = await consume(NONCE_A, testEnv);
      const needsPayload = await consume(NONCE_B, testEnv);
      const approvedPayload = await consume(NONCE_C, testEnv);
      expect(refusedPayload).toEqual({ status: 'refused', reason_code: 'no_hosted_backup' });
      expect(needsPayload).toMatchObject({ status: 'needs_subscription', broker_token: '' });
      expect(approvedPayload).toMatchObject({ status: 'approved', instance_id: INSTANCE_B, broker_token: expect.any(String) });
      for (const nonce of [NONCE_A, NONCE_B, NONCE_C]) {
        const second = await worker.fetch(new Request(`https://services.solstone.app/handoff/backup?nonce=${nonce}`), testEnv);
        expect(second.status).toBe(410);
      }
      spy.assertNoSecrets([NONCE_A, NONCE_B, NONCE_C, approvedPayload.broker_token]);
    } finally {
      spy.restore();
    }
  });

  it('runs session, origin, and csrf guards before restore resolution', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'restore-guards@example.com', testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedEntitlement({ accountId: account.accountId, service: SERVICE, status: 'active' });
    await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_A });
    const { calls } = installRestoreS3(testEnv, { [prefix(account.accountId, INSTANCE_A)]: objects() });

    const signedOut = await worker.fetch(restoreConfirm({ nonce: NONCE_A, selectedInstance: INSTANCE_A }), testEnv);
    const badOrigin = await worker.fetch(restoreConfirm({ cookie: session.cookie, nonce: NONCE_A, selectedInstance: INSTANCE_A, origin: 'https://bad.example' }), testEnv);
    const badCsrf = await worker.fetch(restoreConfirm({ cookie: session.cookie, nonce: NONCE_A, selectedInstance: INSTANCE_A, csrf: 'bad' }), testEnv);
    expect(signedOut.status).toBe(303);
    expect(badOrigin.status).toBe(403);
    expect(badCsrf.status).toBe(403);
    expect(calls).toHaveLength(0);
    await expect(handoffRow(NONCE_A, testEnv)).resolves.toBeNull();

    const valid = await worker.fetch(restoreConfirm({ cookie: session.cookie, nonce: NONCE_A, selectedInstance: INSTANCE_A }), testEnv);
    expect(valid.status).toBe(200);
    expect((await handoffPayload(NONCE_A, testEnv)).status).toBe('approved');
  });

  it('returns a retryable server error without a terminal handoff when R2 proof or audit lookup fails', async () => {
    const r2Env = makeTestEnv();
    const r2Account = await seedAccount({ email: 'restore-r2-error@example.com', testEnv: r2Env });
    const r2Session = await seedSession(r2Account.accountId, { testEnv: r2Env });
    await seedSpbBinding({ accountId: r2Account.accountId, instanceId: INSTANCE_A, tokenHash: 'before-r2' });
    installRestoreS3(r2Env, { [prefix(r2Account.accountId, INSTANCE_A)]: 'fail' });
    const r2Failure = await worker.fetch(new Request(restoreUrl({ nonce: NONCE_A }), { headers: { Cookie: r2Session.cookie } }), r2Env);
    expect(r2Failure.status).toBe(503);
    await expect(handoffRow(NONCE_A, r2Env)).resolves.toBeNull();
    await expect(bindingRow(r2Account.accountId, INSTANCE_A)).resolves.toMatchObject({ token_hash: 'before-r2' });

    await resetDb();
    const auditAccount = await seedAccount({ email: 'restore-audit-error@example.com', testEnv: r2Env });
    const auditSession = await seedSession(auditAccount.accountId, { testEnv: r2Env });
    await seedSpbBinding({ accountId: auditAccount.accountId, instanceId: INSTANCE_A, tokenHash: 'before-audit' });
    installRestoreS3(r2Env, { [prefix(auditAccount.accountId, INSTANCE_A)]: [] });
    const failingDb = {
      prepare(sql) {
        if (sql.includes('spb_sweep_audit')) throw new Error('audit unavailable');
        return workerEnv.DB.prepare(sql);
      },
    };
    const auditFailure = await worker.fetch(new Request(restoreUrl({ nonce: NONCE_B }), { headers: { Cookie: auditSession.cookie } }), makeTestEnv({ DB: failingDb }));
    expect(auditFailure.status).toBe(503);
    await expect(handoffRow(NONCE_B, r2Env)).resolves.toBeNull();
    await expect(bindingRow(auditAccount.accountId, INSTANCE_A)).resolves.toMatchObject({ token_hash: 'before-audit' });
  });
});

function restoreUrl({ nonce = NONCE_A, ...params } = {}) {
  return `https://services.solstone.app/enable/backup?${new URLSearchParams({ nonce, intent: 'restore', ...params })}`;
}

function restoreConfirm({
  cookie = '',
  nonce = NONCE_A,
  selectedInstance,
  csrf = TEST_CSRF,
  origin = 'https://services.solstone.app',
} = {}) {
  const body = new URLSearchParams({ csrf, nonce, intent: 'restore', action: 'allow' });
  if (selectedInstance !== undefined) body.set('selected_instance', selectedInstance);
  const headers = { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' };
  if (cookie) headers.Cookie = cookie;
  return new Request('https://services.solstone.app/enable/backup/confirm', { method: 'POST', headers, body });
}

function prefix(accountId, instanceId) {
  return `users/${accountId}/${instanceId}/`;
}

function objects(name = 'backup') {
  return [{ key: `${name}/journal`, size: 2048, lastModified: '2026-01-02T03:04:05.000Z' }];
}

function installRestoreS3(testEnv, byPrefix) {
  return installS3FetchMock(testEnv, {
    default: async ({ method, url }) => {
      if (method !== 'GET' || url.searchParams.get('list-type') !== '2') throw new Error('unexpected restore R2 request');
      const value = byPrefix[url.searchParams.get('prefix')] || [];
      if (value === 'fail') return new Response('<Error><Code>InternalError</Code></Error>', { status: 500 });
      return new Response(`<ListBucketResult><IsTruncated>false</IsTruncated>${value
        .map((object) => `<Contents><Key>${object.key}</Key><LastModified>${object.lastModified}</LastModified><Size>${object.size}</Size></Contents>`)
        .join('')}</ListBucketResult>`, { headers: { 'Content-Type': 'application/xml' } });
    },
  });
}

function deleteBeforeSpbRotate(accountId, instanceId) {
  return {
    prepare(sql) {
      const statement = workerEnv.DB.prepare(sql);
      if (!sql.includes('UPDATE spb_bindings')) return statement;
      return {
        bind(...args) {
          const bound = statement.bind(...args);
          return {
            async run() {
              await workerEnv.DB
                .prepare('DELETE FROM spb_bindings WHERE account_id = ? AND instance_id = ?')
                .bind(accountId, instanceId)
                .run();
              return bound.run();
            },
          };
        },
      };
    },
  };
}

async function handoffRow(nonce, testEnv) {
  return workerEnv.DB
    .prepare('SELECT payload_encrypted FROM service_handoffs WHERE handoff_hash = ? AND service = ?')
    .bind(await hashServiceHandoffNonce(nonce, testEnv), 'spb')
    .first();
}

async function handoffPayload(nonce, testEnv) {
  const row = await handoffRow(nonce, testEnv);
  expect(row).not.toBeNull();
  return JSON.parse(await decryptEmail(row.payload_encrypted, testEnv));
}

async function consume(nonce, testEnv) {
  const response = await worker.fetch(new Request(`https://services.solstone.app/handoff/backup?nonce=${nonce}`), testEnv);
  expect(response.status).toBe(200);
  return response.json();
}

async function bindingRow(accountId, instanceId) {
  return workerEnv.DB
    .prepare('SELECT account_id, instance_id, token_hash, lapsed_at FROM spb_bindings WHERE account_id = ? AND instance_id = ?')
    .bind(accountId, instanceId)
    .first();
}

async function rowCount(table) {
  const row = await workerEnv.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
  return row.count;
}
