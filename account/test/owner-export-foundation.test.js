import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { createDeletionProof, consumeFreshExportProofs } from '../src/db.js';
import { requireFreshProof, startEmailProof } from '../src/deletion.js';
import { sendDeletionProofEmail } from '../src/email.js';
import { makeTestEnv, resetDb, seedAccount, seedCredential, seedSession } from './helpers.js';

const ORIGIN = 'https://services.solstone.app';
const NOW = 1_700_000_000_000;

describe('owner export foundation', () => {
  beforeEach(resetDb);

  it('returns one exact dependency-free 404 tuple for the whole path family while disabled', async () => {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'HEAD']) {
      for (const pathname of ['/account/export', '/account/export/', '/account/export/proof/otp', '/account/export/unknown']) {
        const env = new Proxy({ OWNER_EXPORT_ENABLED: 'false' }, {
          get(target, property) {
            if (property in target) return target[property];
            throw new Error(`disabled export touched ${String(property)}`);
          },
        });
        const response = await worker.fetch(new Request(`${ORIGIN}${pathname}`, { method }), env, {});
        expect(response.status).toBe(404);
        expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.text()).toBe(method === 'HEAD' ? '' : 'not found');
      }
    }
  });

  it('requires an exact origin before enabled proof routes touch a session', async () => {
    const env = makeTestEnv({ OWNER_EXPORT_ENABLED: 'true' });
    for (const origin of [null, 'http://services.solstone.app', 'https://services.solstone.app.evil.example']) {
      const headers = new Headers({ 'Content-Type': 'application/x-www-form-urlencoded' });
      if (origin) headers.set('Origin', origin);
      const response = await worker.fetch(new Request(`${ORIGIN}/account/export/proof/otp`, {
        method: 'POST', headers, body: '',
      }), env, {});
      expect(response.status).toBe(403);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('allows requested and frozen owners to prove export, but refuses purging owners', async () => {
    const env = makeTestEnv({ OWNER_EXPORT_ENABLED: 'true' });
    for (const phase of ['requested', 'frozen', 'purging']) {
      const account = await seedAccount({ email: `${phase}@example.com`, testEnv: env });
      const session = await seedSession(account.accountId, { testEnv: env });
      await activeDeletion(account.accountId, phase);
      const response = await worker.fetch(new Request(`${ORIGIN}/account/export`, {
        headers: { Cookie: session.cookie },
      }), env, {});
      if (phase === 'purging') {
        expect(response.status).toBe(303);
        expect(response.headers.get('location')).toBe('/');
      } else {
        expect(response.status).toBe(200);
        expect(await response.text()).toContain('download your data');
      }
    }
  });

  it('atomically consumes exactly the fresh proof set required at execution time', async () => {
    const env = makeTestEnv();
    const account = await seedAccount({ testEnv: env });
    const session = await seedSession(account.accountId, { testEnv: env, nowMs: NOW - 1000, expiresAt: NOW + 3600000 });
    await proof(account.accountId, session.idHash, 'otp', 'otp-one');
    await expect(consumeFreshExportProofs(workerEnv.DB, {
      accountId: account.accountId, sessionIdHash: session.idHash, nowMs: NOW,
    })).resolves.toMatchObject({ authorized: true, methods: ['otp'] });
    await expect(consumed('otp-one')).resolves.toBe(1);
    await expect(consumeFreshExportProofs(workerEnv.DB, {
      accountId: account.accountId, sessionIdHash: session.idHash, nowMs: NOW,
    })).resolves.toMatchObject({ authorized: false, methods: [] });

    await seedCredential({ accountId: account.accountId, credentialId: 'active' });
    await proof(account.accountId, session.idHash, 'otp', 'otp-two');
    await expect(consumeFreshExportProofs(workerEnv.DB, {
      accountId: account.accountId, sessionIdHash: session.idHash, nowMs: NOW,
    })).resolves.toMatchObject({ authorized: false, methods: [] });
    await expect(consumed('otp-two')).resolves.toBe(0);
    await proof(account.accountId, session.idHash, 'passkey', 'passkey-one');
    await expect(consumeFreshExportProofs(workerEnv.DB, {
      accountId: account.accountId, sessionIdHash: session.idHash, nowMs: NOW,
    })).resolves.toMatchObject({ authorized: true, methods: ['otp', 'passkey'] });
  });

  it('authorizes at most one of two concurrent emission attempts', async () => {
    const env = makeTestEnv();
    const account = await seedAccount({ testEnv: env });
    const session = await seedSession(account.accountId, { testEnv: env, nowMs: NOW - 1000, expiresAt: NOW + 3600000 });
    await proof(account.accountId, session.idHash, 'otp', 'one-shot');
    const results = await Promise.all([
      consumeFreshExportProofs(workerEnv.DB, { accountId: account.accountId, sessionIdHash: session.idHash, nowMs: NOW }),
      consumeFreshExportProofs(workerEnv.DB, { accountId: account.accountId, sessionIdHash: session.idHash, nowMs: NOW }),
    ]);
    expect(results.map(({ authorized }) => authorized).sort()).toEqual([false, true]);
    await expect(consumed('one-shot')).resolves.toBe(1);
  });

  it('evaluates a newly active passkey inside the consuming statement', async () => {
    const env = makeTestEnv();
    const account = await seedAccount({ testEnv: env });
    const session = await seedSession(account.accountId, { testEnv: env, nowMs: NOW - 1000, expiresAt: NOW + 3600000 });
    await proof(account.accountId, session.idHash, 'otp', 'race-otp');
    let inserted = false;
    const raceDb = {
      prepare(sql) {
        const statement = workerEnv.DB.prepare(sql);
        return {
          bind(...bindings) {
            const bound = statement.bind(...bindings);
            return {
              async all() {
                if (!inserted) {
                  inserted = true;
                  await seedCredential({ accountId: account.accountId, credentialId: 'race-passkey' });
                }
                return bound.all();
              },
            };
          },
        };
      },
    };
    await expect(consumeFreshExportProofs(raceDb, {
      accountId: account.accountId, sessionIdHash: session.idHash, nowMs: NOW,
    })).resolves.toMatchObject({ authorized: false, methods: [] });
    await expect(consumed('race-otp')).resolves.toBe(0);
    await proof(account.accountId, session.idHash, 'passkey', 'race-passkey-proof');
    await expect(consumeFreshExportProofs(workerEnv.DB, {
      accountId: account.accountId, sessionIdHash: session.idHash, nowMs: NOW,
    })).resolves.toMatchObject({ authorized: true, methods: ['otp', 'passkey'] });
  });

  it('consumes every eligible proof in one emission and ignores expired, wrong-purpose, and wrong-session proofs', async () => {
    const env = makeTestEnv();
    const account = await seedAccount({ testEnv: env });
    const session = await seedSession(account.accountId, { testEnv: env, nowMs: NOW - 1000, expiresAt: NOW + 3600000 });
    await proof(account.accountId, session.idHash, 'otp', 'fresh');
    await proof(account.accountId, session.idHash, 'otp', 'duplicate');
    await proof(account.accountId, session.idHash, 'passkey', 'expired', { expiresAt: NOW });
    await proof(account.accountId, 'other-session', 'passkey', 'wrong-session');
    await proof(account.accountId, session.idHash, 'passkey', 'wrong-purpose', { purpose: 'delete' });
    // A second verified code (the owner re-ran the ceremony) must not dead-end the
    // download; both are spent by the one emission so neither funds another.
    await expect(consumeFreshExportProofs(workerEnv.DB, {
      accountId: account.accountId, sessionIdHash: session.idHash, nowMs: NOW,
    })).resolves.toMatchObject({ authorized: true, methods: ['otp', 'otp'] });
    await expect(consumed('fresh')).resolves.toBe(1);
    await expect(consumed('duplicate')).resolves.toBe(1);
    await expect(consumed('expired')).resolves.toBe(0);
    await expect(consumed('wrong-session')).resolves.toBe(0);
    await expect(consumed('wrong-purpose')).resolves.toBe(0);
    await expect(consumeFreshExportProofs(workerEnv.DB, {
      accountId: account.accountId, sessionIdHash: session.idHash, nowMs: NOW,
    })).resolves.toMatchObject({ authorized: false, methods: [] });
  });

  it('agrees with requireFreshProof, the shared pre-check, on every proof-state axis', async () => {
    const scenarios = [
      ['no proofs', [], false],
      ['otp only, no passkey on the account', [['otp']], false],
      ['otp only, active passkey', [['otp']], true],
      ['otp and passkey proof, active passkey', [['otp'], ['passkey']], true],
      ['passkey proof only, active passkey', [['passkey']], true],
      ['expired otp', [['otp', { expiresAt: NOW }]], false],
      ['otp for another session', [['otp', { sessionIdHash: 'other-session' }]], false],
      ['otp for another purpose', [['otp', { purpose: 'delete' }]], false],
      ['two verified otps', [['otp'], ['otp']], false],
      ['stale passkey proof after the passkey was removed', [['otp'], ['passkey']], false],
      ['otp and an expired passkey proof, active passkey', [['otp'], ['passkey', { expiresAt: NOW }]], true],
    ];
    // requireFreshProof reads the real clock, so this scenario set is built on it.
    const now = Date.now();
    let scenarioIndex = 0;
    for (const [name, proofs, activePasskey] of scenarios) {
      const tag = `parity-${scenarioIndex++}`;
      const env = makeTestEnv();
      const account = await seedAccount({ email: `${tag}@example.com`, testEnv: env });
      const session = await seedSession(account.accountId, { testEnv: env, nowMs: now - 1000, expiresAt: now + 3600000 });
      if (activePasskey) await seedCredential({ accountId: account.accountId, credentialId: `credential-${tag}` });
      let index = 0;
      for (const [method, options = {}] of proofs) {
        const expiresAt = options.expiresAt === NOW ? now : now + 60_000;
        await proof(account.accountId, options.sessionIdHash || session.idHash, method, `${tag}-${index++}`, { ...options, expiresAt });
      }
      const fresh = await requireFreshProof(env, { accountId: account.accountId, sessionIdHash: session.idHash, purpose: 'export' });
      const ready = fresh.otpVerified && fresh.passkeyVerified;
      const consumeResult = await consumeFreshExportProofs(workerEnv.DB, {
        accountId: account.accountId, sessionIdHash: session.idHash, nowMs: now,
      });
      expect(consumeResult.authorized, name).toBe(ready);
    }
  });

  it('refuses consumption on revoked session, expired session, and purging phase', async () => {
    const env = makeTestEnv();
    const account = await seedAccount({ testEnv: env });
    const session = await seedSession(account.accountId, { testEnv: env, nowMs: NOW - 1000, expiresAt: NOW + 3600000 });
    await proof(account.accountId, session.idHash, 'otp', 'revoked-session-proof');

    // Revoked session
    await workerEnv.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE id_hash = ?').bind(NOW, session.idHash).run();
    await expect(consumeFreshExportProofs(workerEnv.DB, {
      accountId: account.accountId, sessionIdHash: session.idHash, nowMs: NOW,
    })).resolves.toMatchObject({ authorized: false, methods: [] });
    await expect(consumed('revoked-session-proof')).resolves.toBe(0);

    // Restore revoked and test expired session
    await workerEnv.DB.prepare('UPDATE sessions SET revoked_at = NULL, expires_at = ? WHERE id_hash = ?').bind(NOW - 1, session.idHash).run();
    await expect(consumeFreshExportProofs(workerEnv.DB, {
      accountId: account.accountId, sessionIdHash: session.idHash, nowMs: NOW,
    })).resolves.toMatchObject({ authorized: false, methods: [] });
    await expect(consumed('revoked-session-proof')).resolves.toBe(0);

    // Restore expires_at and test purging phase
    await workerEnv.DB.prepare('UPDATE sessions SET expires_at = ? WHERE id_hash = ?').bind(NOW + 3600000, session.idHash).run();
    await activeDeletion(account.accountId, 'purging');
    await expect(consumeFreshExportProofs(workerEnv.DB, {
      accountId: account.accountId, sessionIdHash: session.idHash, nowMs: NOW,
    })).resolves.toMatchObject({ authorized: false, methods: [] });
    await expect(consumed('revoked-session-proof')).resolves.toBe(0);

    // Clean deletion row and test requested/frozen phase allows consumption
    await workerEnv.DB.prepare('DELETE FROM account_deletions WHERE account_id = ?').bind(account.accountId).run();
    await activeDeletion(account.accountId, 'requested');
    await expect(consumeFreshExportProofs(workerEnv.DB, {
      accountId: account.accountId, sessionIdHash: session.idHash, nowMs: NOW,
    })).resolves.toMatchObject({ authorized: true, methods: ['otp'] });
    await expect(consumed('revoked-session-proof')).resolves.toBe(1);
  });

  it('gives export its own email contract without changing delete or cancel copy', async () => {
    const env = makeTestEnv();
    for (const purpose of ['delete', 'cancel', 'export']) {
      await sendDeletionProofEmail({ env, address: 'owner@example.com', code: '123456', purpose });
    }
    expect(env.EMAIL.sent.map(({ subject }) => subject)).toEqual([
      "confirm delete your sign-in and services: 123 456",
      'confirm cancel your deletion request: 123 456',
      'confirm your solstone services data download: 123 456',
    ]);
    expect(env.EMAIL.sent[0].text).toContain('this starts a deletion request. you have 72 hours to cancel before deletion begins.');
    expect(env.EMAIL.sent[1].text).toContain('this cancels your deletion request.');
    expect(env.EMAIL.sent[2].text).toBe(`you requested a copy of the data held with your solstone services sign-in.

enter this code to continue:

123 456

it expires in 10 minutes.

if you did not request this, you can ignore this email.`);
  });

  it('keeps export proof rate exhaustion isolated from delete and cancel capacity', async () => {
    const env = makeTestEnv();
    const account = await seedAccount({ testEnv: env });
    for (let index = 0; index < 10; index++) {
      await startEmailProof(env, {
        accountId: account.accountId, sessionIdHash: 'session', purpose: 'export', ip: '203.0.113.8',
      });
    }
    await expect(startEmailProof(env, {
      accountId: account.accountId, sessionIdHash: 'session', purpose: 'export', ip: '203.0.113.8',
    })).rejects.toThrow('proof_rate_limited');
    await expect(startEmailProof(env, {
      accountId: account.accountId, sessionIdHash: 'session', purpose: 'cancel', ip: '203.0.113.8',
    })).resolves.toMatchObject({ expiresAt: expect.any(Number) });
    const { results } = await workerEnv.DB.prepare(
      'SELECT DISTINCT purpose FROM account_deletion_proofs ORDER BY purpose'
    ).all();
    expect(results).toEqual([{ purpose: 'cancel' }, { purpose: 'export' }]);
  });

  it('renders only export intent and export action targets when enabled', async () => {
    const env = makeTestEnv({ OWNER_EXPORT_ENABLED: 'true' });
    const account = await seedAccount({ testEnv: env });
    const session = await seedSession(account.accountId, { testEnv: env });
    const preparation = await worker.fetch(new Request(`${ORIGIN}/account/export`, {
      headers: { Cookie: session.cookie },
    }), env, {});
    const preparationHtml = await preparation.text();
    expect(preparationHtml).toContain('action="/account/export/proof/otp"');
    expect(preparationHtml).not.toContain('/account/delete');
    const proofPage = await worker.fetch(new Request(`${ORIGIN}/account/export/proof/otp`, {
      method: 'POST',
      headers: { Cookie: session.cookie, Origin: ORIGIN },
    }), env, {});
    expect(proofPage.status).toBe(200);
    expect(proofPage.headers.get('Content-Type')).toContain('text/html');
    const proofHtml = await proofPage.text();
    expect(proofHtml).toContain('action="/account/export/proof/otp/verify"');
    expect(proofHtml).not.toContain('/account/delete');
    expect(() => JSON.parse(proofHtml)).toThrow();
  });
});

async function proof(accountId, sessionIdHash, method, tokenHash, options = {}) {
  return createDeletionProof(workerEnv.DB, {
    tokenHash, accountId, sessionIdHash,
    purpose: options.purpose || 'export', method,
    issuedAt: NOW - 1, expiresAt: options.expiresAt ?? NOW + 60_000,
    otpCodeHash: method === 'otp' ? `code-${tokenHash}` : null,
    passkeyChallenge: method === 'passkey' ? `challenge-${tokenHash}` : null,
  }).then(() => workerEnv.DB.prepare(
    'UPDATE account_deletion_proofs SET verified = 1 WHERE token_hash = ?'
  ).bind(tokenHash).run());
}

async function consumed(tokenHash) {
  const row = await workerEnv.DB.prepare(
    'SELECT consumed FROM account_deletion_proofs WHERE token_hash = ?'
  ).bind(tokenHash).first();
  return row.consumed;
}

async function activeDeletion(accountId, phase) {
  await workerEnv.DB.prepare(
    `INSERT INTO account_deletions (
       operation_id, account_id, phase, requested_at, frozen_at,
       cancellation_deadline_at, next_attempt_at, status_token_hash
     ) VALUES (?, ?, ?, 1, ?, ?, 1, ?)`
  ).bind(`op-${phase}`, accountId, phase, phase === 'requested' ? null : 2, NOW + 60_000, `status-${phase}`).run();
}
