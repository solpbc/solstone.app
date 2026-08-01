import { createExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { encryptEmail } from '../src/crypto.js';
import { getScoutApplicationByAccount } from '../src/db.js';
import {
  installConsoleSpy,
  installGcpFetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedSession,
} from './helpers.js';

describe('settings gemini dashboard', () => {
  let spy;
  let secrets;

  beforeEach(async () => {
    await resetDb();
    spy = installConsoleSpy();
    secrets = [];
  });

  afterEach(() => {
    spy.assertNoSecrets(secrets);
    spy.restore();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('serves the public scout landing for a signed-out GET /scout', async () => {
    const response = await worker.fetch(settingsGet('/scout'), makeTestEnv());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<h1>scout</h1>');
    expect(body).toContain('scout is the tester program. approved scouts can enable confidential processing from the journal and share feedback that helps shape solstone.');
  });

  it('renders revoked application as terminal even when a key row exists', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({
      testEnv,
      accountId: account.accountId,
      status: 'revoked',
      revoked_at: 2_000,
    });
    await seedProvisionedKey({
      testEnv,
      accountId: account.accountId,
      id: 'revoked-precedence-active',
      displayName: 'acct-revoked-precedence',
      keyString: 'plaintext-revoked-precedence-key',
    });
    installGcpListMock([
      { name: 'projects/test-gcp-project/locations/global/keys/active', displayName: 'acct-revoked-precedence' },
    ]);
    secrets.push('plaintext-revoked-precedence-key');

    const response = await worker.fetch(settingsGet('/scout', { cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('access to scout has ended.');
    expect(body).not.toContain('action="/scout/apply"');
    expect(body).not.toContain('action="/scout/rotate"');
    expect(body).not.toContain('action="/scout/disable"');
    expect(body).not.toContain('action="/scout/forget"');
    expect(body).not.toContain('plaintext-revoked-precedence-key');
  });

  it('renders active key management without leaking plaintext or reveal controls', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedProvisionedKey({
      testEnv,
      accountId: account.accountId,
      id: 'active-key',
      displayName: 'acct-active',
      keyString: 'plaintext-current-key',
    });
    await seedProvisionedKey({
      testEnv,
      accountId: account.accountId,
      id: 'revoked-key',
      displayName: 'acct-revoked',
      keyString: 'plaintext-revoked-key',
      keyResourceName: 'projects/test-gcp-project/locations/global/keys/revoked',
      revokedAt: 2_000,
    });
    installGcpListMock([{ name: 'projects/test-gcp-project/locations/global/keys/active', displayName: 'acct-active' }]);
    secrets.push('plaintext-current-key', 'plaintext-revoked-key');

    const response = await worker.fetch(settingsGet('/scout', { cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('this sign-in has no approved scout access');
    expect(body).toContain('this sign-in is not currently approved for scout. legacy Gemini key management remains available below.');
    expect(body).toContain('<p class="section-label">legacy Gemini key</p>');
    expect(body).toContain('<div class="title">active key</div>');
    expect(body).toContain('<p class="section-label">legacy Gemini key history</p>');
    expect(body).toContain('action="/scout/rotate"');
    expect(body).toContain('action="/scout/disable"');
    expect(body).toContain('action="/scout/forget"');
    expect(body).toContain('acct-revoked');
    expect(body).not.toContain('action="/scout/apply"');
    expect(body).not.toContain('/scout/reveal');
    expect(body).not.toContain('/scout/ack');
    expect(body).not.toContain('plaintext-current-key');
    expect(body).not.toContain('plaintext-revoked-key');
  });

  it('renders approved program access separately from active legacy key management', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({
      testEnv,
      accountId: account.accountId,
      status: 'approved',
      data_acked_at: 1_500,
      approved_at: 2_000,
    });
    await seedProvisionedKey({
      testEnv,
      accountId: account.accountId,
      id: 'approved-active-key',
      displayName: 'acct-approved-active',
      keyString: 'plaintext-approved-active-key',
    });
    installGcpListMock([{ name: 'projects/test-gcp-project/locations/global/keys/active', displayName: 'acct-approved-active' }]);
    secrets.push('plaintext-approved-active-key');

    const response = await worker.fetch(settingsGet('/scout', { cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<span class="pill on"');
    expect(body).toContain('approved</span> &nbsp;scout access is approved for this sign-in');
    expect(body).toContain('confidential processing is available to enable from the journal. legacy Gemini key management remains available below.');
    expect(body).toContain('action="/scout/rotate"');
    expect(body).toContain('<div class="title">active key</div>');
    expect(body).not.toContain('plaintext-approved-active-key');
  });

  it('does not turn a pending application into approved access when an active legacy key lingers', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({
      testEnv,
      accountId: account.accountId,
      status: 'pending',
      applied_at: 1_000,
    });
    await seedProvisionedKey({
      testEnv,
      accountId: account.accountId,
      id: 'pending-active-key',
      displayName: 'acct-pending-active',
      keyString: 'plaintext-pending-active-key',
    });
    installGcpListMock([{ name: 'projects/test-gcp-project/locations/global/keys/active', displayName: 'acct-pending-active' }]);
    secrets.push('plaintext-pending-active-key');

    const response = await worker.fetch(settingsGet('/scout', { cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<span class="pill off"');
    expect(body).toContain('pending</span> &nbsp;scout request pending for this sign-in');
    expect(body).toContain('your scout request is under review. legacy Gemini key management remains available below.');
    expect(body).not.toContain('scout access is approved for this sign-in');
    expect(body).not.toContain('confidential processing is available to enable from the journal.');
    expect(body).not.toContain('plaintext-pending-active-key');
  });

  it('renders approved unacked application with covenant affirmation and historical audit only', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({
      testEnv,
      accountId: account.accountId,
      status: 'approved',
      approved_at: 2_000,
    });
    await seedProvisionedKey({
      testEnv,
      accountId: account.accountId,
      id: 'approved-history',
      displayName: 'acct-approved-history',
      keyString: 'plaintext-approved-history-key',
      keyResourceName: 'projects/test-gcp-project/locations/global/keys/approved-history',
      revokedAt: 3_000,
    });
    secrets.push('plaintext-approved-history-key');

    const response = await worker.fetch(settingsGet('/scout', { cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('approved</span> &nbsp;scout access is approved for this sign-in');
    expect(body).toContain('confidential processing is available to enable from the journal.');
    expect(body).toContain('confirm the scout covenant');
    expect(body).toContain('action="/scout/apply"');
    expect(body).toContain('<label class="ack">');
    expect(body).toContain('name="data_ack" value="yes" required');
    expect(body).toContain('<span>i understand</span>');
    expect(body).not.toContain('name="use_case"');
    expect(body).toContain('action="/scout/forget"');
    expect(body).not.toContain('action="/scout/rotate"');
    expect(body).not.toContain('action="/scout/disable"');
    expect(body).not.toContain('plaintext-approved-history-key');
  });

  it('renders approved acked application without covenant affirmation', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({
      testEnv,
      accountId: account.accountId,
      status: 'approved',
      data_acked_at: 1_500,
      approved_at: 2_000,
    });

    const response = await worker.fetch(settingsGet('/scout', { cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('approved</span> &nbsp;scout access is approved for this sign-in');
    expect(body).toContain('confidential processing is available to enable from the journal.');
    expect(body).not.toContain('action="/scout/apply"');
    expect(body).not.toContain('name="data_ack"');
    expect(body).not.toContain('confirm the scout covenant');
  });

  it('renders pending application with relative applied status and no actions', async () => {
    const now = 1_780_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({
      testEnv,
      accountId: account.accountId,
      status: 'pending',
      applied_at: now - 3 * 60_000,
      created_at: now - 3 * 60_000,
      updated_at: now - 3 * 60_000,
    });
    secrets.push(String(now));

    const response = await worker.fetch(settingsGet('/scout', { cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('pending, applied 3 minutes ago');
    expect(body).toContain('your scout request is under review.');
    expect(body).not.toContain('action="/scout/apply"');
    expect(body).not.toContain('action="/scout/rotate"');
    expect(body).not.toContain('action="/scout/disable"');
  });

  it('renders no-application state with apply form and no reveal control', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(settingsGet('/scout', { cookie: session.cookie }), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('request scout access for this sign-in. approved scouts can enable confidential processing from the journal and share feedback that helps shape solstone.');
    expect(body).toContain('scout is optional. for the legacy Gemini path, you can always bring your own Gemini key by hand instead of asking sol pbc to set one up.');
    expect(body).toContain('action="/scout/apply"');
    expect(body).toContain('<label class="ack">');
    expect(body).toContain('name="data_ack" value="yes" required');
    expect(body).toContain('<span>i understand</span>');
    expect(body).toContain('name="use_case"');
    expect(body).not.toContain('/scout/reveal');
    expect(body).not.toContain('/scout/ack');
  });

  it('names every legacy key operation in Scout flash messages', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const cases = [
      ['rotated=ok', 'legacy Gemini key rotated.'],
      ['rotated=conflict', 'another legacy Gemini key rotation completed first. try again.'],
      ['rotated=no_active_key', 'no active legacy Gemini key to rotate.'],
      ['rotated=rotation_failed', "legacy Gemini key rotation didn't finish. try again."],
      ['forget=ok', 'retired legacy Gemini key forgotten.'],
      ['disable=ok', 'legacy Gemini key turned off.'],
      ['disable=none', 'no active legacy Gemini key to turn off.'],
    ];

    for (const [query, copy] of cases) {
      const response = await worker.fetch(settingsGet(`/scout?${query}`, { cookie: session.cookie }), testEnv);
      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toContain(copy);
    }
  });

  it('gives the dropped news + feedback features a home on the scout page in every state', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    // off / no-application state carries both destination rows
    const off = await worker.fetch(settingsGet('/scout', { cookie: session.cookie }), testEnv);
    const offBody = await off.text();
    expect(off.status).toBe(200);
    expect(offBody).toContain('href="https://solstone.app/releases"');
    expect(offBody).toContain("what's new in solstone");
    expect(offBody).toContain("release notes: what's shipped and what's changing.");
    expect(offBody).toContain('share feedback');
    expect(offBody).toContain("tell us what you're seeing, or report a problem.");

    // revoked is terminal, but the dropped features still keep a home here
    await seedScoutApplication({
      testEnv,
      accountId: account.accountId,
      status: 'revoked',
      revoked_at: 2_000,
    });
    const revoked = await worker.fetch(settingsGet('/scout', { cookie: session.cookie }), testEnv);
    const revokedBody = await revoked.text();
    expect(revokedBody).toContain('access to scout has ended.');
    expect(revokedBody).toContain('href="https://solstone.app/releases"');
    expect(revokedBody).toContain('share feedback');
  });

  it('creates a pending application from the dashboard apply form', async () => {
    const now = 1_780_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    secrets.push(String(now));

    const response = await worker.fetch(settingsPost('/scout/apply', {
      cookie: session.cookie,
      body: { data_ack: 'yes', use_case: ' local research ' },
    }), testEnv);
    const row = await getScoutApplicationByAccount(testEnv.DB, { accountId: account.accountId });
    const event = await lifecycleEvent(testEnv, account.accountId);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/scout?apply=ok');
    expect(row).toMatchObject({
      account_id: account.accountId,
      status: 'pending',
      use_case: 'local research',
      data_acked_at: now,
      applied_at: now,
    });
    expect(event).toMatchObject({
      action: 'apply',
      actor_kind: 'owner',
      actor_principal: account.accountId,
      occurred_at: now,
    });
    expect(event.occurred_at).toBe(row.applied_at);
    expect(event.occurred_at).toBe(row.created_at);
    expect(event.occurred_at).toBe(row.updated_at);
  });

  it('returns the global error page without a success redirect when the apply batch fails', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const failingEnv = withFailingBatch(testEnv);

    const response = await worker.fetch(settingsPost('/scout/apply', {
      cookie: session.cookie,
      body: { data_ack: 'yes' },
    }), failingEnv);

    expect(response.status).toBe(500);
    expect(response.headers.get('Location')).toBeNull();
    expect(response.headers.get('Content-Type')).toContain('text/html');
    await expect(response.text()).resolves.toContain("that link didn't work");
    await expect(rowCount(testEnv, 'scout_applications')).resolves.toBe(0);
    await expect(rowCount(testEnv, 'scout_lifecycle_events')).resolves.toBe(0);
  });

  it('does not write an application when dashboard apply lacks data acknowledgement', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(settingsPost('/scout/apply', {
      cookie: session.cookie,
      body: { use_case: 'local research' },
    }), testEnv);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/scout?apply=no_ack');
    expect(await getScoutApplicationByAccount(testEnv.DB, { accountId: account.accountId })).toBe(null);
    await expect(rowCount(testEnv, 'scout_applications')).resolves.toBe(0);
    await expect(rowCount(testEnv, 'scout_lifecycle_events')).resolves.toBe(0);
  });

  it.each(['', 'no', '1', 'YES'])(
    'does not create an application for non-exact data acknowledgement %j',
    async (dataAck) => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });

      const response = await worker.fetch(settingsPost('/scout/apply', {
        cookie: session.cookie,
        body: { data_ack: dataAck, use_case: 'local research' },
      }), testEnv);

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/scout?apply=no_ack');
      expect(await getScoutApplicationByAccount(testEnv.DB, { accountId: account.accountId })).toBe(null);
      await expect(rowCount(testEnv, 'scout_applications')).resolves.toBe(0);
      await expect(rowCount(testEnv, 'scout_lifecycle_events')).resolves.toBe(0);
    }
  );

  it.each([null, '', 'no', '1', 'YES'])(
    'does not ack an approved application for missing or non-exact data acknowledgement %j',
    async (dataAck) => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      await seedScoutApplication({
        testEnv,
        accountId: account.accountId,
        status: 'approved',
        approved_at: 1_000,
      });
      const before = await getScoutApplicationByAccount(testEnv.DB, { accountId: account.accountId });

      const response = await worker.fetch(settingsPost('/scout/apply', {
        cookie: session.cookie,
        body: dataAck === null ? {} : { data_ack: dataAck },
      }), testEnv);

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/scout?apply=no_ack');
      await expect(getScoutApplicationByAccount(testEnv.DB, { accountId: account.accountId })).resolves.toEqual(before);
      await expect(rowCount(testEnv, 'scout_applications')).resolves.toBe(1);
      await expect(rowCount(testEnv, 'scout_lifecycle_events')).resolves.toBe(0);
    }
  );

  it('rejects dashboard apply from a bad origin without writing', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(settingsPost('/scout/apply', {
      cookie: session.cookie,
      origin: 'https://evil.example',
      body: { data_ack: 'yes', use_case: 'local research' },
    }), testEnv);

    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await getScoutApplicationByAccount(testEnv.DB, { accountId: account.accountId })).toBe(null);
  });

  it('affirms approved unacked application without provisioning or revealing a key', async () => {
    const now = 1_780_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedScoutApplication({
      testEnv,
      accountId: account.accountId,
      status: 'approved',
      approved_at: 1_000,
    });
    secrets.push(String(now));

    const response = await worker.fetch(settingsPost('/scout/apply', {
      cookie: session.cookie,
      body: { data_ack: 'yes' },
    }), testEnv);
    const row = await getScoutApplicationByAccount(testEnv.DB, { accountId: account.accountId });

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/scout?apply=acked');
    expect(row).toMatchObject({
      status: 'approved',
      data_acked_at: now,
      approved_at: 1_000,
    });
    await expect(rowCount(testEnv, 'provisioned_keys')).resolves.toBe(0);
  });

  it('returns not found for removed reveal and ack routes', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const reveal = await worker.fetch(settingsPost('/scout/reveal', { cookie: session.cookie }), testEnv);
    const ack = await worker.fetch(settingsPost('/scout/ack', { cookie: session.cookie }), testEnv);

    expect(reveal.status).toBe(404);
    expect(reveal.headers.get('Location')).toBe(null);
    expect(await reveal.text()).toContain('not found');
    expect(ack.status).toBe(404);
    expect(ack.headers.get('Location')).toBe(null);
    expect(await ack.text()).toContain('not found');
  });

  it('rotates from the dashboard and redirects to the success flash', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedProvisionedKey({
      testEnv,
      accountId: account.accountId,
      id: 'active-key',
      keyResourceName: 'projects/test-gcp-project/locations/global/keys/old-dashboard',
      keyString: 'plaintext-old-dashboard',
    });
    installRotationMock(['plaintext-new-dashboard'], { oldKeyName: 'projects/test-gcp-project/locations/global/keys/old-dashboard' });
    installImmediateTimeout();
    const ctx = createExecutionContext();
    const waitSpy = vi.spyOn(ctx, 'waitUntil');
    secrets.push('plaintext-old-dashboard', 'plaintext-new-dashboard');

    const response = await worker.fetch(settingsPost('/scout/rotate', { cookie: session.cookie }), testEnv, ctx);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/scout?rotated=ok');
    await waitSpy.mock.calls[0][0];
  });

  it('forgets revoked rows but refuses to delete the active row', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    await seedProvisionedKey({
      testEnv,
      accountId: account.accountId,
      id: 'active-key',
      displayName: 'acct-active',
      keyString: 'plaintext-active-key',
    });
    await seedProvisionedKey({
      testEnv,
      accountId: account.accountId,
      id: 'revoked-key',
      displayName: 'acct-revoked',
      keyString: 'plaintext-revoked-key',
      keyResourceName: 'projects/test-gcp-project/locations/global/keys/revoked',
      revokedAt: 2_000,
    });
    installGcpListMock([{ name: 'projects/test-gcp-project/locations/global/keys/active', displayName: 'acct-active' }]);
    secrets.push('plaintext-active-key', 'plaintext-revoked-key');

    const forget = await worker.fetch(settingsPost('/scout/forget', {
      cookie: session.cookie,
      body: { key_id: 'revoked-key' },
    }), testEnv);
    expect(forget.status).toBe(303);
    expect(await keyExists(testEnv, 'revoked-key')).toBe(false);

    const page = await worker.fetch(settingsGet('/scout', { cookie: session.cookie }), testEnv);
    expect(await page.text()).not.toContain('acct-revoked');

    const activeDelete = await worker.fetch(settingsPost('/scout/forget', {
      cookie: session.cookie,
      body: { key_id: 'active-key' },
    }), testEnv);
    expect(activeDelete.status).toBe(400);
    expect(await keyExists(testEnv, 'active-key')).toBe(true);
  });

  it('isolates gemini settings operations to the signed-in account', async () => {
    const testEnv = makeTestEnv();
    const accountA = await seedAccount({ email: 'a@example.com', testEnv });
    const accountB = await seedAccount({ email: 'b@example.com', testEnv });
    const sessionB = await seedSession(accountB.accountId, { testEnv });
    await seedProvisionedKey({
      testEnv,
      accountId: accountA.accountId,
      id: 'a-active',
      displayName: 'acct-a-active',
      keyResourceName: 'projects/test-gcp-project/locations/global/keys/a-old',
      keyString: 'plaintext-a-key',
    });
    await seedProvisionedKey({
      testEnv,
      accountId: accountA.accountId,
      id: 'a-revoked',
      displayName: 'acct-a-revoked',
      keyResourceName: 'projects/test-gcp-project/locations/global/keys/a-revoked',
      keyString: 'plaintext-a-revoked',
      revokedAt: 2_000,
    });
    await seedProvisionedKey({
      testEnv,
      accountId: accountB.accountId,
      id: 'b-active',
      displayName: 'acct-b-active',
      keyResourceName: 'projects/test-gcp-project/locations/global/keys/b-old',
      keyString: 'plaintext-b-key',
    });
    installGcpListMock([{ name: 'projects/test-gcp-project/locations/global/keys/b-old', displayName: 'acct-b-active' }]);
    secrets.push('plaintext-a-key', 'plaintext-a-revoked', 'plaintext-b-key', 'plaintext-b-new');

    const page = await worker.fetch(settingsGet('/scout', { cookie: sessionB.cookie }), testEnv);
    const body = await page.text();
    expect(body).toContain('acct-b-active');
    expect(body).not.toContain('acct-a-active');

    const forgetA = await worker.fetch(settingsPost('/scout/forget', {
      cookie: sessionB.cookie,
      body: { key_id: 'a-revoked' },
    }), testEnv);
    expect(forgetA.status).toBe(400);
    expect(await keyExists(testEnv, 'a-revoked')).toBe(true);

    installRotationMock(['plaintext-b-new'], { oldKeyName: 'projects/test-gcp-project/locations/global/keys/b-old' });
    installImmediateTimeout();
    const ctx = createExecutionContext();
    const waitSpy = vi.spyOn(ctx, 'waitUntil');
    const rotate = await worker.fetch(settingsPost('/scout/rotate', { cookie: sessionB.cookie }), testEnv, ctx);
    expect(rotate.status).toBe(303);
    await waitSpy.mock.calls[0][0];
    expect(await activeKeyResource(testEnv, accountA.accountId)).toBe('projects/test-gcp-project/locations/global/keys/a-old');
    expect(await activeKeyResource(testEnv, accountB.accountId)).toBe('projects/test-gcp-project/locations/global/keys/new-1');
  });
});

function settingsGet(path, { cookie } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  return new Request(`https://services.solstone.app${path}`, { headers });
}

function settingsPost(path, { cookie, body = {}, origin = 'https://services.solstone.app' } = {}) {
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (origin !== null) headers.Origin = origin;
  if (cookie) headers.Cookie = cookie;
  return new Request(`https://services.solstone.app${path}`, {
    method: 'POST',
    headers,
    body: new URLSearchParams(body),
  });
}

async function seedProvisionedKey({
  testEnv,
  accountId,
  id = crypto.randomUUID(),
  displayName = 'acct-test',
  keyResourceName = 'projects/test-gcp-project/locations/global/keys/active',
  keyString,
  createdAt = 1_000,
  revokedAt = null,
}) {
  await testEnv.DB
    .prepare(
      `INSERT INTO provisioned_keys (
         id, account_id, provider, display_name, key_resource_name,
         key_string_encrypted, created_at, revoked_at
       ) VALUES (?, ?, 'gemini', ?, ?, ?, ?, ?)`
    )
    .bind(id, accountId, displayName, keyResourceName, await encryptEmail(keyString, testEnv), createdAt, revokedAt)
    .run();
}

async function seedScoutApplication({
  testEnv,
  accountId,
  status,
  use_case = null,
  data_acked_at = null,
  applied_at = null,
  approved_at = null,
  revoked_at = null,
  created_at = 1_000,
  updated_at = created_at,
}) {
  await testEnv.DB
    .prepare(
      `INSERT INTO scout_applications (
         account_id, status, use_case, data_acked_at, applied_at,
         approved_at, revoked_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(accountId, status, use_case, data_acked_at, applied_at, approved_at, revoked_at, created_at, updated_at)
    .run();
}

function installGcpListMock(keys = []) {
  installGcpFetchMock({
    'POST oauth2.googleapis.com/token': async () => jsonResponse({
      access_token: 'gcp-access-token',
      expires_in: 3600,
      token_type: 'Bearer',
    }),
    'GET apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys': async () => jsonResponse({ keys }),
  });
}

function installRotationMock(apiKeys, { oldKeyName = 'projects/test-gcp-project/locations/global/keys/old' } = {}) {
  let createCount = 0;
  installGcpFetchMock({
    'POST oauth2.googleapis.com/token': async () => jsonResponse({
      access_token: 'gcp-access-token',
      expires_in: 3600,
      token_type: 'Bearer',
    }),
    'POST apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys': async () => {
      createCount += 1;
      return jsonResponse({ name: `operations/create-${createCount}` });
    },
    'GET apikeys.googleapis.com/v2/operations/create-1': async () => jsonResponse({
      done: true,
      response: { name: 'projects/test-gcp-project/locations/global/keys/new-1' },
    }),
    'GET apikeys.googleapis.com/v2/projects/test-gcp-project/locations/global/keys/new-1/keyString': async () => jsonResponse({
      keyString: apiKeys[0],
    }),
    [`DELETE apikeys.googleapis.com/v2/${oldKeyName}`]: async () => new Response(''),
  });
}

function installImmediateTimeout() {
  return vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback) => {
    callback();
    return 1;
  });
}

async function keyExists(testEnv, keyId) {
  const row = await testEnv.DB.prepare('SELECT id FROM provisioned_keys WHERE id = ?').bind(keyId).first();
  return row != null;
}

async function activeKeyResource(testEnv, accountId) {
  const row = await testEnv.DB
    .prepare("SELECT key_resource_name FROM provisioned_keys WHERE account_id = ? AND revoked_at IS NULL")
    .bind(accountId)
    .first();
  return row?.key_resource_name || null;
}

async function lifecycleEvent(testEnv, accountId) {
  return testEnv.DB
    .prepare('SELECT * FROM scout_lifecycle_events WHERE account_id = ? ORDER BY sequence')
    .bind(accountId)
    .first();
}

function withFailingBatch(testEnv) {
  return {
    ...testEnv,
    DB: {
      prepare: (...args) => testEnv.DB.prepare(...args),
      batch() {
        throw new Error('injected batch failure');
      },
    },
  };
}

async function rowCount(testEnv, table) {
  const row = await testEnv.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
  return row.count;
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
