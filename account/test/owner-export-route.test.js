import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeletionProof } from '../src/db.js';
import worker from '../src/index.js';
import {
  EXPORT_FILENAME,
  EXPORT_PROOF_INVALID,
  EXPORT_SERVICE_UNAVAILABLE,
} from '../src/owner-export.js';
import {
  installConsoleSpy,
  makeSupportWorker,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedCredential,
  seedSession,
  seedSplBinding,
} from './helpers.js';

async function seedVerifiedProof(accountId, sessionIdHash, method, tokenHash = `token-${method}`, overrides = {}) {
  const now = Date.now();
  await createDeletionProof(workerEnv.DB, {
    tokenHash,
    accountId,
    sessionIdHash,
    purpose: 'export',
    method,
    otpCodeHash: method === 'otp' ? 'test-otp-hash' : null,
    passkeyChallenge: method === 'passkey' ? 'test-passkey-challenge' : null,
    issuedAt: now - 1000,
    expiresAt: now + 600000,
    ip: '127.0.0.1',
    ...overrides,
  });
  await workerEnv.DB.prepare('UPDATE account_deletion_proofs SET verified = 1 WHERE token_hash = ?')
    .bind(tokenHash)
    .run();
}

function makeExportRequest(session, {
  origin = 'https://services.solstone.app',
  secFetchSite = 'same-origin',
  headers = {},
  body = null,
} = {}) {
  const reqHeaders = {
    Origin: origin,
    'Sec-Fetch-Site': secFetchSite,
    ...headers,
  };
  if (session) {
    reqHeaders.Cookie = session.cookie;
  }
  const init = {
    method: 'POST',
    headers: reqHeaders,
  };
  if (body !== null) {
    init.body = body;
  }
  return new Request('https://services.solstone.app/account/export', init);
}

const defaultSupport = makeSupportWorker({
  'GET /api/services/tickets': () => new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } }),
  'GET /api/services/tickets/closed': () => new Response(JSON.stringify({ tickets: [], next_cursor: null }), { headers: { 'Content-Type': 'application/json' } }),
});

describe('POST /account/export route integration', () => {
  beforeEach(resetDb);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('emits a complete JSON export attachment when proof is verified and services are healthy', async () => {
    const consoleSpy = installConsoleSpy();
    const env = makeTestEnv({
      OWNER_EXPORT_ENABLED: 'true',
      SUPPORT_WORKER: defaultSupport,
    });

    const account = await seedAccount({ testEnv: env, email: 'owner@example.com' });
    const session = await seedSession(account.accountId, { testEnv: env });
    await seedVerifiedProof(account.accountId, session.idHash, 'otp', 'export-otp');

    const req = makeExportRequest(session);
    const res = await worker.fetch(req, env);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe(`attachment; filename=${EXPORT_FILENAME}`);
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    const body = await res.json();
    expect(body.format_version).toBe(1);
    expect(body.complete).toBe(true);
    expect(Object.keys(body)).toEqual([
      'format_version',
      'generated_at',
      'complete',
      'legs',
      'local',
      'relay',
      'support',
      'retained',
      'not_included',
    ]);
    expect(body.legs).toEqual({
      local: { complete: true },
      relay: { complete: true },
      support: { complete: true },
    });

    // Check local.classes
    expect(Array.isArray(body.local.classes)).toBe(true);
    expect(body.local.classes.length).toBeGreaterThan(0);
    for (const cls of body.local.classes) {
      expect(typeof cls.name).toBe('string');
      expect(typeof cls.description).toBe('string');
      expect(typeof cls.fields).toBe('object');
      expect(cls.fields).not.toBeNull();
      expect(Array.isArray(cls.records)).toBe(true);
    }

    // Check closed explanation structure without freezing exact sentence
    expect(body.support.closed_explanation.code).toBe('content_removed');
    expect(typeof body.support.closed_explanation.description).toBe('string');
    expect(body.support.closed_explanation.description.length).toBeGreaterThan(0);
    expect(body.support.closed_explanation.description).not.toMatch(/day|month|year|retain|retention|available|availability|forever/i);

    // Console spy assertions
    const serializedBody = JSON.stringify(body);
    expect(serializedBody).not.toContain('<script');
    expect(serializedBody).not.toContain('r2_key');
    consoleSpy.assertNoSecrets(['r2_key']);
  });

  it('refuses export when feature gate is disabled, origin is bad, or signed out', async () => {
    const envGateOff = makeTestEnv({ OWNER_EXPORT_ENABLED: 'false', SUPPORT_WORKER: defaultSupport });
    const account = await seedAccount({ testEnv: envGateOff });
    const session = await seedSession(account.accountId, { testEnv: envGateOff });
    await seedVerifiedProof(account.accountId, session.idHash, 'otp');

    // 1. Gate off -> 404
    const resGateOff = await worker.fetch(makeExportRequest(session), envGateOff);
    expect(resGateOff.status).toBe(404);
    expect(await resGateOff.text()).toBe('not found');

    // 2. Cross-site origin -> 403
    const envGateOn = makeTestEnv({ OWNER_EXPORT_ENABLED: 'true', SUPPORT_WORKER: defaultSupport });
    const resBadOrigin = await worker.fetch(
      makeExportRequest(session, { origin: 'https://attacker.example', secFetchSite: 'cross-site' }),
      envGateOn,
    );
    expect(resBadOrigin.status).toBe(403);
    expect(await resBadOrigin.text()).toBe(EXPORT_PROOF_INVALID);

    // 2b. Missing Origin header -> 403, no-store, no JSON document
    const reqNoOrigin = new Request('https://services.solstone.app/account/export', {
      method: 'POST',
      headers: { Cookie: session.cookie },
    });
    const resNoOrigin = await worker.fetch(reqNoOrigin, envGateOn);
    expect(resNoOrigin.status).toBe(403);
    expect(resNoOrigin.headers.get('Cache-Control')).toBe('no-store');
    const noOriginText = await resNoOrigin.text();
    expect(noOriginText).toBe(EXPORT_PROOF_INVALID);
    expect(() => JSON.parse(noOriginText)).toThrow();

    // 3. Signed out -> 303
    const resSignedOut = await worker.fetch(makeExportRequest(null), envGateOn);
    expect(resSignedOut.status).toBe(303);
  });

  it('refuses with 403 on invalid, expired, cross-purpose, or cross-account proofs', async () => {
    const env = makeTestEnv({ OWNER_EXPORT_ENABLED: 'true', SUPPORT_WORKER: defaultSupport });
    const account = await seedAccount({ testEnv: env });
    const otherAccount = await seedAccount({ testEnv: env, email: 'other@example.com' });
    const session = await seedSession(account.accountId, { testEnv: env });

    // 1. No proof seeded -> 403
    const resNoProof = await worker.fetch(makeExportRequest(session), env);
    expect(resNoProof.status).toBe(403);
    expect(await resNoProof.text()).toBe(EXPORT_PROOF_INVALID);

    // 2. Cross-purpose proof (purpose = 'delete') -> 403
    await seedVerifiedProof(account.accountId, session.idHash, 'otp', 'delete-otp', { purpose: 'delete' });
    const resCrossPurpose = await worker.fetch(makeExportRequest(session), env);
    expect(resCrossPurpose.status).toBe(403);

    // 3. Cross-account proof (proof belonging to other account) -> 403
    await seedVerifiedProof(otherAccount.accountId, session.idHash, 'otp', 'other-acc-otp');
    const resCrossAccount = await worker.fetch(makeExportRequest(session), env);
    expect(resCrossAccount.status).toBe(403);

    // 4. Expired proof -> 403
    await seedVerifiedProof(account.accountId, session.idHash, 'otp', 'expired-otp', {
      issuedAt: Date.now() - 700000,
      expiresAt: Date.now() - 10000,
    });
    const resExpired = await worker.fetch(makeExportRequest(session), env);
    expect(resExpired.status).toBe(403);

    // 5. Passkey required but only OTP proof -> 403
    await seedCredential({ accountId: account.accountId, credentialId: 'my-passkey' });
    await seedVerifiedProof(account.accountId, session.idHash, 'otp', 'otp-only');
    const resMissingPasskey = await worker.fetch(makeExportRequest(session), env);
    expect(resMissingPasskey.status).toBe(403);

    // 6. Provide passkey proof too -> 200
    await seedVerifiedProof(account.accountId, session.idHash, 'passkey', 'passkey-done');
    const resWithPasskey = await worker.fetch(makeExportRequest(session), env);
    expect(resWithPasskey.status).toBe(200);
  });

  it('allows export during requested and frozen deletion phases, but redirects 303 during purging', async () => {
    const env = makeTestEnv({ OWNER_EXPORT_ENABLED: 'true', SUPPORT_WORKER: defaultSupport });
    const account = await seedAccount({ testEnv: env });
    const session = await seedSession(account.accountId, { testEnv: env });

    // 1. Requested phase -> 200
    await workerEnv.DB.prepare(
      "INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, cancellation_deadline_at, status_token_hash) VALUES ('op-req', ?, 'requested', ?, ?, 'tok-req')"
    ).bind(account.accountId, Date.now(), Date.now() + 86400000).run();
    await seedVerifiedProof(account.accountId, session.idHash, 'otp', 'req-phase-otp');
    const resRequested = await worker.fetch(makeExportRequest(session), env);
    expect(resRequested.status).toBe(200);

    // 2. Frozen phase -> 200
    await workerEnv.DB.prepare("UPDATE account_deletions SET phase = 'frozen' WHERE account_id = ?")
      .bind(account.accountId)
      .run();
    await seedVerifiedProof(account.accountId, session.idHash, 'otp', 'frozen-phase-otp');
    const resFrozen = await worker.fetch(makeExportRequest(session), env);
    expect(resFrozen.status).toBe(200);

    // 3. Purging phase -> 303 redirect
    await workerEnv.DB.prepare("UPDATE account_deletions SET phase = 'purging' WHERE account_id = ?")
      .bind(account.accountId)
      .run();
    await seedVerifiedProof(account.accountId, session.idHash, 'otp', 'purging-phase-otp');
    const resPurging = await worker.fetch(makeExportRequest(session), env);
    expect(resPurging.status).toBe(303);
  });

  it('ignores client-supplied account_id in POST body and exports session account', async () => {
    const env = makeTestEnv({ OWNER_EXPORT_ENABLED: 'true', SUPPORT_WORKER: defaultSupport });
    const account = await seedAccount({ testEnv: env, email: 'myaccount@example.com' });
    const session = await seedSession(account.accountId, { testEnv: env });
    await seedVerifiedProof(account.accountId, session.idHash, 'otp', 'spoof-test-otp');

    const formBody = new URLSearchParams({ account_id: 'attacker-account-id' });
    const req = makeExportRequest(session, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
    });
    const res = await worker.fetch(req, env);

    expect(res.status).toBe(200);
    const body = await res.json();
    const accountEmailClass = body.local.classes.find((c) => c.name === 'account_emails');
    expect(accountEmailClass.records[0].address).toBe('myaccount@example.com');
  });

  it('refuses with 503 and does not consume proofs when local collection fails', async () => {
    const env = makeTestEnv({ OWNER_EXPORT_ENABLED: 'true', SUPPORT_WORKER: defaultSupport });
    const account = await seedAccount({ testEnv: env });
    const session = await seedSession(account.accountId, { testEnv: env });
    await seedVerifiedProof(account.accountId, session.idHash, 'otp', 'safe-otp');

    // Break DB for local collector query while allowing session resolution
    const brokenDb = {
      prepare(sql) {
        if (sql.includes('account_emails')) {
          throw new Error('D1 database failure');
        }
        return env.DB.prepare(sql);
      },
    };
    const brokenEnv = { ...env, DB: brokenDb };

    const res = await worker.fetch(makeExportRequest(session), brokenEnv);
    expect(res.status).toBe(503);
    expect(await res.text()).toBe(EXPORT_SERVICE_UNAVAILABLE);

    // Assert proof in real DB is still unconsumed
    const proofRow = await workerEnv.DB.prepare('SELECT consumed FROM account_deletion_proofs WHERE token_hash = ?')
      .bind('safe-otp')
      .first();
    expect(proofRow.consumed).toBe(0);
  });

  it('handles support failure: returns 200 incomplete document and consumes proof', async () => {
    const failingSupport = makeSupportWorker({
      'GET /api/services/tickets': () => new Response('internal error', { status: 500 }),
      'GET /api/services/tickets/closed': () => new Response(JSON.stringify({ tickets: [], next_cursor: null }), { headers: { 'Content-Type': 'application/json' } }),
    });

    const env = makeTestEnv({
      OWNER_EXPORT_ENABLED: 'true',
      SUPPORT_WORKER: failingSupport,
    });

    const account = await seedAccount({ testEnv: env });
    const session = await seedSession(account.accountId, { testEnv: env });
    await seedVerifiedProof(account.accountId, session.idHash, 'otp', 'support-fail-otp');

    const res = await worker.fetch(makeExportRequest(session), env);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.complete).toBe(false);
    expect(body.legs.support.complete).toBe(false);
    expect(body.legs.support.reason).toBe('http_500');

    // Second POST without new proofs fails 403 (proof consumed)
    const secondRes = await worker.fetch(makeExportRequest(session), env);
    expect(secondRes.status).toBe(403);
  });

  it('handles relay failure with seeded SPL binding: returns 200 incomplete document and consumes proof', async () => {
    const failingRelay = {
      async fetch() {
        return new Response('internal error', { status: 500 });
      },
    };

    const env = makeTestEnv({
      OWNER_EXPORT_ENABLED: 'true',
      SUPPORT_WORKER: defaultSupport,
      RELAY: failingRelay,
      RELAY_SHARED_SECRET: 'relay-secret-123',
    });

    const account = await seedAccount({ testEnv: env });
    const session = await seedSession(account.accountId, { testEnv: env });

    // Seed an SPL token binding so relay collector will attempt relay fetch
    await seedSplBinding({
      accountId: account.accountId,
      instanceId: 'inst-spl-test-1',
    });

    await seedVerifiedProof(account.accountId, session.idHash, 'otp', 'relay-fail-otp');

    const res = await worker.fetch(makeExportRequest(session), env);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.complete).toBe(false);
    expect(body.legs.relay.complete).toBe(false);
    expect(body.legs.relay.reason).toBeDefined();

    // Proof consumed
    const proofRow = await workerEnv.DB.prepare('SELECT consumed FROM account_deletion_proofs WHERE token_hash = ?')
      .bind('relay-fail-otp')
      .first();
    expect(proofRow.consumed).toBe(1);
  });

  it('handles concurrent export requests by authorizing exactly one and 403ing the other', async () => {
    const env = makeTestEnv({ OWNER_EXPORT_ENABLED: 'true', SUPPORT_WORKER: defaultSupport });
    const account = await seedAccount({ testEnv: env });
    const session = await seedSession(account.accountId, { testEnv: env });
    await seedVerifiedProof(account.accountId, session.idHash, 'otp', 'single-use-otp');

    const [res1, res2] = await Promise.all([
      worker.fetch(makeExportRequest(session), env),
      worker.fetch(makeExportRequest(session), env),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 403]);
  });

  it('refuses with 403 if session is revoked in race after collection before consume', async () => {
    const env = makeTestEnv({ OWNER_EXPORT_ENABLED: 'true', SUPPORT_WORKER: defaultSupport });
    const account = await seedAccount({ testEnv: env });
    const session = await seedSession(account.accountId, { testEnv: env });
    await seedVerifiedProof(account.accountId, session.idHash, 'otp', 'race-session-otp');

    // Wrap DB to revoke session right before consumeFreshExportProofs runs
    const realPrepare = env.DB.prepare.bind(env.DB);
    const interceptedDb = {
      prepare(sql) {
        if (sql.includes('live_session') && sql.includes('account_deletion_proofs')) {
          return {
            bind(...args) {
              const statement = realPrepare(sql).bind(...args);
              return {
                async all() {
                  // Revoke session right now
                  await workerEnv.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE id_hash = ?')
                    .bind(Date.now(), session.idHash)
                    .run();
                  return statement.all();
                },
              };
            },
          };
        }
        return realPrepare(sql);
      },
    };

    const interceptedEnv = { ...env, DB: interceptedDb };
    const res = await worker.fetch(makeExportRequest(session), interceptedEnv);

    expect(res.status).toBe(403);
    expect(await res.text()).toBe(EXPORT_PROOF_INVALID);

    const proofRow = await workerEnv.DB.prepare('SELECT consumed FROM account_deletion_proofs WHERE token_hash = ?')
      .bind('race-session-otp')
      .first();
    expect(proofRow.consumed).toBe(0);
  });

  it('refuses with 403 if deletion enters purging in race after collection before consume', async () => {
    const env = makeTestEnv({ OWNER_EXPORT_ENABLED: 'true', SUPPORT_WORKER: defaultSupport });
    const account = await seedAccount({ testEnv: env });
    const session = await seedSession(account.accountId, { testEnv: env });
    await seedVerifiedProof(account.accountId, session.idHash, 'otp', 'race-purging-otp');

    // Wrap DB to insert purging deletion right before consume statement runs
    const realPrepare = env.DB.prepare.bind(env.DB);
    const interceptedDb = {
      prepare(sql) {
        if (sql.includes('phase_check') && sql.includes('account_deletion_proofs')) {
          return {
            bind(...args) {
              const statement = realPrepare(sql).bind(...args);
              return {
                async all() {
                  // Set deletion to purging right now
                  await workerEnv.DB.prepare(
                    "INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, cancellation_deadline_at, status_token_hash) VALUES ('op-race-purging', ?, 'purging', ?, ?, 'tok-race')"
                  ).bind(account.accountId, Date.now() - 100000, Date.now() - 50000).run();
                  return statement.all();
                },
              };
            },
          };
        }
        return realPrepare(sql);
      },
    };

    const interceptedEnv = { ...env, DB: interceptedDb };
    const res = await worker.fetch(makeExportRequest(session), interceptedEnv);

    expect(res.status).toBe(403);
    expect(await res.text()).toBe(EXPORT_PROOF_INVALID);

    const proofRow = await workerEnv.DB.prepare('SELECT consumed FROM account_deletion_proofs WHERE token_hash = ?')
      .bind('race-purging-otp')
      .first();
    expect(proofRow.consumed).toBe(0);
  });
});
