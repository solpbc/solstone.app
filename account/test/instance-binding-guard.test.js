import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import {
  TEST_CSRF,
  installRelayFetchMock,
  makeTestEnv,
  resetDb,
  rowCount,
  seedAccount,
  seedEntitlement,
  seedScoutApplication,
  seedSession,
} from './helpers.js';

const NONCE = '7'.repeat(52);
const INSTANCE = '33333333-3333-3333-3333-333333333333';

// An instance id belongs to one account at a time. A consent for an instance that a different
// active account already holds is refused before anything is bound, granted, issued or pushed.
// The four consent flows are the only place a binding is created, and the id there is just a
// request parameter, so this is the rule that keeps one sign-in from taking another's journal.
const SERVICES = [
  { name: 'spl', table: 'spl_bindings', path: '/enable/spl/confirm', form: {}, entitlement: 'spl_hosted' },
  { name: 'spb', table: 'spb_bindings', path: '/enable/backup/confirm', form: {}, entitlement: 'spb_hosted' },
  { name: 'spp', table: 'spp_bindings', path: '/enable/spp/confirm', form: { data_ack: 'yes' }, entitlement: 'spp_hosted', scoutOnly: true },
  { name: 'sme', table: 'sme_bindings', path: '/enable/solstone-me/confirm', form: { data_ack: 'yes' }, entitlement: 'sme_hosted' },
];

describe.each(SERVICES)('$name: one account holds an instance at a time', (svc) => {
  beforeEach(resetDb);
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function setup() {
    const env = makeTestEnv();
    const owner = await seedAccount({ email: `owner-${svc.name}@example.com`, testEnv: env });
    const stranger = await seedAccount({ email: `stranger-${svc.name}@example.com`, testEnv: env });
    if (svc.scoutOnly) {
      for (const account of [owner, stranger]) {
        await seedScoutApplication({ accountId: account.accountId, status: 'approved', approved_at: 1_000 });
      }
    }
    await bind(svc, owner.accountId);
    const strangerSession = await seedSession(stranger.accountId, { testEnv: env });
    const ownerSession = await seedSession(owner.accountId, { testEnv: env });
    return { env, owner, stranger, strangerSession, ownerSession };
  }

  const confirm = (env, session, nonce = NONCE) => worker.fetch(new Request(`https://services.solstone.app${svc.path}`, {
    method: 'POST',
    headers: { Origin: 'https://services.solstone.app', Cookie: session.cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: TEST_CSRF, nonce, action: 'allow', instance: INSTANCE, ...svc.form }),
  }), env, { waitUntil() {} });

  const holders = async () => (await workerEnv.DB
    .prepare(`SELECT account_id FROM ${svc.table} WHERE instance_id = ?`).bind(INSTANCE).all()).results.map((r) => r.account_id);

  it('refuses a different account while the holder is active, and writes, grants and pushes nothing', async () => {
    const { env, owner, stranger, strangerSession } = await setup();
    const { calls } = installRelayFetchMock();
    const handoffsBefore = await rowCount('service_handoffs');

    const response = await confirm(env, strangerSession);

    expect(response.status).toBe(409);
    expect(await holders()).toEqual([owner.accountId]);
    expect(await rowCount('service_handoffs')).toBe(handoffsBefore);
    expect(await workerEnv.DB.prepare('SELECT 1 FROM entitlements WHERE account_id = ? AND service = ?').bind(stranger.accountId, svc.entitlement).first()).toBeNull();
    // The private network pushes an account's entitlement to every instance it holds; the
    // refusal must leave the holder's relay grant alone.
    expect(calls).toEqual([]);
  });

  it('lets the holder consent to its own instance again', async () => {
    const { env, owner, ownerSession } = await setup();
    installRelayFetchMock();

    const response = await confirm(env, ownerSession);

    expect(response.status).toBe(200);
    expect(await holders()).toEqual([owner.accountId]);
  });

  it('lets another account take the instance once the holder is being deleted', async () => {
    const { env, owner, stranger, strangerSession } = await setup();
    installRelayFetchMock();
    await workerEnv.DB.prepare(
      "INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, cancellation_deadline_at, status_token_hash) VALUES (?, ?, 'frozen', 0, 1, 'status')"
    ).bind(crypto.randomUUID(), owner.accountId).run();

    const response = await confirm(env, strangerSession);

    expect(response.status).toBe(200);
    expect(await holders()).toEqual(expect.arrayContaining([stranger.accountId]));
  });

  it('lets another account take the instance once the holder is gone', async () => {
    const { env, owner, stranger, strangerSession } = await setup();
    installRelayFetchMock();
    // A finished deletion has purged the holder's binding (the owner-data inventory drives it).
    await workerEnv.DB.prepare(`DELETE FROM ${svc.table} WHERE account_id = ?`).bind(owner.accountId).run();
    expect(await holders()).toEqual([]);

    const response = await confirm(env, strangerSession);

    expect(response.status).toBe(200);
    expect(await holders()).toEqual([stranger.accountId]);
  });
});

async function bind(svc, accountId) {
  const now = Date.now();
  const columns = {
    spl_bindings: ['account_id', 'instance_id', 'created_at', 'last_seen_at'],
    spb_bindings: ['account_id', 'instance_id', 'created_at', 'last_seen_at'],
    spp_bindings: ['account_id', 'instance_id', 'created_at', 'last_seen_at', 'consent_acked_at', 'consent_disclosure_version'],
    sme_bindings: ['account_id', 'instance_id', 'created_at', 'last_seen_at', 'consent_acked_at', 'consent_disclosure_version'],
  }[svc.table];
  const values = [accountId, INSTANCE, now, now, now, 'test'].slice(0, columns.length);
  await workerEnv.DB
    .prepare(`INSERT INTO ${svc.table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
    .bind(...values)
    .run();
  // A paying holder, so a stray push or grant would be visible.
  await seedEntitlement({ accountId, service: svc.entitlement, status: 'active', currentPeriodEnd: 1_900_000_000 });
}
