import { createExecutionContext, env as workerEnv, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { runRetention } from '../src/retention.js';
import {
  installS3FetchMock,
  makeTestEnv,
  resetDb,
  rowCount,
  seedAccount,
  seedSpbBinding,
} from './helpers.js';

const NOW = 1_700_000_000_000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const COUNT_KEYS = [
  'otp_unconsumed',
  'otp_consumed',
  'challenges_unused',
  'challenges_used',
  'emails_unverified',
  'abandoned_sessions',
  'abandoned_passkeys',
  'abandoned_emails',
  'accounts_abandoned',
  'sessions_revoked',
  'sessions_expired',
  'rate_buckets',
  'spb_retired_tokens',
];

describe('retention cron', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const cases = [
    {
      name: 'deletes unconsumed expired OTPs',
      key: 'otp_unconsumed',
      seed: async () => {
        await insertOtp('delete-otp-unconsumed', { consumed: 0, expiresAt: NOW - 1, startedAt: NOW });
        await insertOtp('keep-otp-unconsumed', { consumed: 0, expiresAt: NOW + 1, startedAt: NOW });
      },
      gone: () => rowExists('otp_tokens', 'email_lower_hash', 'delete-otp-unconsumed'),
      kept: () => rowExists('otp_tokens', 'email_lower_hash', 'keep-otp-unconsumed'),
    },
    {
      name: 'deletes consumed OTPs older than 24h',
      key: 'otp_consumed',
      seed: async () => {
        await insertOtp('delete-otp-consumed', { consumed: 1, expiresAt: NOW + DAY_MS, startedAt: NOW - 24 * HOUR_MS - 1 });
        await insertOtp('keep-otp-consumed', { consumed: 1, expiresAt: NOW + DAY_MS, startedAt: NOW - 24 * HOUR_MS + 1 });
      },
      gone: () => rowExists('otp_tokens', 'email_lower_hash', 'delete-otp-consumed'),
      kept: () => rowExists('otp_tokens', 'email_lower_hash', 'keep-otp-consumed'),
    },
    {
      name: 'deletes unused expired passkey challenges',
      key: 'challenges_unused',
      seed: async () => {
        await insertChallenge('delete-unused-challenge', { expiresAt: NOW - 1, usedAt: null });
        await insertChallenge('keep-unused-challenge', { expiresAt: NOW + 1, usedAt: null });
      },
      gone: () => rowExists('passkey_challenges', 'challenge', 'delete-unused-challenge'),
      kept: () => rowExists('passkey_challenges', 'challenge', 'keep-unused-challenge'),
    },
    {
      name: 'deletes used passkey challenges older than 24h',
      key: 'challenges_used',
      seed: async () => {
        await insertChallenge('delete-used-challenge', { createdAt: NOW - 24 * HOUR_MS - 1, expiresAt: NOW + DAY_MS, usedAt: NOW });
        await insertChallenge('keep-used-challenge', { createdAt: NOW - 24 * HOUR_MS + 1, expiresAt: NOW + DAY_MS, usedAt: NOW });
      },
      gone: () => rowExists('passkey_challenges', 'challenge', 'delete-used-challenge'),
      kept: () => rowExists('passkey_challenges', 'challenge', 'keep-used-challenge'),
    },
    {
      name: 'deletes old unverified email rows',
      key: 'emails_unverified',
      seed: async () => {
        await insertAccount('email-delete-account', { createdAt: NOW });
        await insertAccount('email-keep-account', { createdAt: NOW });
        await insertEmail('delete-email-unverified', 'email-delete-account', { createdAt: NOW - 30 * DAY_MS - 1, verifiedAt: null });
        await insertEmail('keep-email-unverified', 'email-keep-account', { createdAt: NOW - 30 * DAY_MS + 1, verifiedAt: null });
      },
      gone: () => rowExists('account_emails', 'id', 'delete-email-unverified'),
      kept: () => rowExists('account_emails', 'id', 'keep-email-unverified'),
    },
    {
      name: 'deletes sessions for abandoned accounts',
      key: 'abandoned_sessions',
      seed: async () => {
        await insertAccount('abandoned-session-account', { createdAt: NOW - 30 * DAY_MS - 1 });
        await insertAccount('verified-session-account', { createdAt: NOW - 30 * DAY_MS - 1 });
        await insertEmail('verified-session-email', 'verified-session-account', { verifiedAt: NOW });
        await insertSession('delete-abandoned-session', 'abandoned-session-account', { expiresAt: NOW + DAY_MS });
        await insertSession('keep-verified-session', 'verified-session-account', { expiresAt: NOW + DAY_MS });
      },
      gone: () => rowExists('sessions', 'id_hash', 'delete-abandoned-session'),
      kept: () => rowExists('sessions', 'id_hash', 'keep-verified-session'),
    },
    {
      name: 'deletes passkeys for abandoned accounts',
      key: 'abandoned_passkeys',
      seed: async () => {
        await insertAccount('abandoned-passkey-account', { createdAt: NOW - 30 * DAY_MS - 1 });
        await insertAccount('verified-passkey-account', { createdAt: NOW - 30 * DAY_MS - 1 });
        await insertEmail('verified-passkey-email', 'verified-passkey-account', { verifiedAt: NOW });
        await insertCredential('delete-abandoned-passkey', 'abandoned-passkey-account');
        await insertCredential('keep-verified-passkey', 'verified-passkey-account');
      },
      gone: () => rowExists('passkey_credentials', 'credential_id', 'delete-abandoned-passkey'),
      kept: () => rowExists('passkey_credentials', 'credential_id', 'keep-verified-passkey'),
    },
    {
      name: 'deletes remaining emails for abandoned accounts',
      key: 'abandoned_emails',
      seed: async () => {
        await insertAccount('abandoned-email-account', { createdAt: NOW - 30 * DAY_MS - 1 });
        await insertAccount('verified-email-account', { createdAt: NOW - 30 * DAY_MS - 1 });
        await insertEmail('delete-abandoned-email', 'abandoned-email-account', { createdAt: NOW, verifiedAt: null });
        await insertEmail('keep-verified-email', 'verified-email-account', { createdAt: NOW, verifiedAt: NOW });
      },
      gone: () => rowExists('account_emails', 'id', 'delete-abandoned-email'),
      kept: () => rowExists('account_emails', 'id', 'keep-verified-email'),
    },
    {
      name: 'deletes abandoned accounts',
      key: 'accounts_abandoned',
      seed: async () => {
        await insertAccount('delete-abandoned-account', { createdAt: NOW - 30 * DAY_MS - 1 });
        await insertAccount('keep-verified-account', { createdAt: NOW - 30 * DAY_MS - 1 });
        await insertEmail('keep-account-email', 'keep-verified-account', { verifiedAt: NOW });
      },
      gone: () => rowExists('accounts', 'id', 'delete-abandoned-account'),
      kept: () => rowExists('accounts', 'id', 'keep-verified-account'),
    },
    {
      name: 'deletes old revoked sessions',
      key: 'sessions_revoked',
      seed: async () => {
        await insertAccount('revoked-session-account', { createdAt: NOW });
        await insertSession('delete-revoked-session', 'revoked-session-account', { revokedAt: NOW - 30 * DAY_MS - 1 });
        await insertSession('keep-revoked-session', 'revoked-session-account', { revokedAt: NOW - 30 * DAY_MS + 1 });
      },
      gone: () => rowExists('sessions', 'id_hash', 'delete-revoked-session'),
      kept: () => rowExists('sessions', 'id_hash', 'keep-revoked-session'),
    },
    {
      name: 'deletes old expired active sessions',
      key: 'sessions_expired',
      seed: async () => {
        await insertAccount('expired-session-account', { createdAt: NOW });
        await insertSession('delete-expired-session', 'expired-session-account', { expiresAt: NOW - 30 * DAY_MS - 1 });
        await insertSession('keep-expired-session', 'expired-session-account', { expiresAt: NOW - 30 * DAY_MS + 1 });
      },
      gone: () => rowExists('sessions', 'id_hash', 'delete-expired-session'),
      kept: () => rowExists('sessions', 'id_hash', 'keep-expired-session'),
    },
    {
      name: 'deletes old rate buckets',
      key: 'rate_buckets',
      seed: async () => {
        await insertRateBucket('delete-rate-bucket', NOW - 48 * HOUR_MS - 1);
        await insertRateBucket('keep-rate-bucket', NOW - 48 * HOUR_MS + 1);
      },
      gone: () => rowExists('rate_buckets', 'key', 'delete-rate-bucket'),
      kept: () => rowExists('rate_buckets', 'key', 'keep-rate-bucket'),
    },
    {
      name: 'deletes old retired SPB tokens',
      key: 'spb_retired_tokens',
      seed: async () => {
        await insertRetiredToken('delete-retired-token', 'retired-account', 'retired-instance', NOW - 7 * DAY_MS - 1);
        await insertRetiredToken('keep-retired-token', 'retired-account', 'retired-instance', NOW - 7 * DAY_MS + 1);
      },
      gone: () => rowExists('spb_retired_tokens', 'token_hash', 'delete-retired-token'),
      kept: () => rowExists('spb_retired_tokens', 'token_hash', 'keep-retired-token'),
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, async () => {
      await testCase.seed();
      const payload = await runWithWarnPayload();

      expect(await testCase.gone()).toBe(false);
      expect(await testCase.kept()).toBe(true);
      expect(payload.counts[testCase.key]).toBe(1);
    });
  }

  it('fully deletes an old unverified-only account in one run', async () => {
    await insertAccount('ordering-account', { createdAt: NOW - 31 * DAY_MS });
    await insertEmail('ordering-email', 'ordering-account', { createdAt: NOW - 31 * DAY_MS, verifiedAt: null });

    await runWithWarnPayload();

    expect(await rowExists('account_emails', 'id', 'ordering-email')).toBe(false);
    expect(await rowExists('accounts', 'id', 'ordering-account')).toBe(false);
  });

  it('deletes children before an abandoned account parent', async () => {
    await insertAccount('cascade-account', { createdAt: NOW - 31 * DAY_MS });
    await insertEmail('cascade-email', 'cascade-account', { createdAt: NOW - 31 * DAY_MS, verifiedAt: null });
    await insertSession('cascade-session', 'cascade-account', { revokedAt: NOW - 31 * DAY_MS });
    await insertCredential('cascade-credential', 'cascade-account');
    await workerEnv.DB
      .prepare(
        `INSERT INTO scout_lifecycle_events (
           correlation_id, account_id, sequence, action, from_status, to_status,
           actor_kind, actor_principal, reason_code, occurred_at
         ) VALUES (?, ?, 1, 'apply', 'absent', 'pending', 'owner', ?, 'owner_application', ?)`
      )
      .bind('cascade-event', 'cascade-account', 'cascade-account', NOW - 31 * DAY_MS)
      .run();

    await runWithWarnPayload();

    expect(await rowExists('account_emails', 'id', 'cascade-email')).toBe(false);
    expect(await rowExists('sessions', 'id_hash', 'cascade-session')).toBe(false);
    expect(await rowExists('passkey_credentials', 'credential_id', 'cascade-credential')).toBe(false);
    expect(await rowExists('scout_lifecycle_events', 'correlation_id', 'cascade-event')).toBe(false);
    expect(await rowExists('accounts', 'id', 'cascade-account')).toBe(false);
  });

  it('keeps a verified account and all lifecycle events byte-identical', async () => {
    await insertAccount('verified-old-account', { createdAt: NOW - 31 * DAY_MS });
    await insertEmail('verified-old-email', 'verified-old-account', { createdAt: NOW - 31 * DAY_MS, verifiedAt: NOW });
    await insertLifecycleEvent('verified-event-1', 'verified-old-account', {
      sequence: 1,
      action: 'apply',
      fromStatus: 'absent',
      toStatus: 'pending',
      actorKind: 'owner',
      actorPrincipal: 'verified-old-account',
      reasonCode: 'owner_application',
      occurredAt: NOW - 2,
    });
    await insertLifecycleEvent('verified-event-2', 'verified-old-account', {
      sequence: 2,
      action: 'approve',
      fromStatus: 'pending',
      toStatus: 'approved',
      actorKind: 'operator',
      actorPrincipal: 'operator@example.com',
      reasonCode: 'application_approved',
      occurredAt: NOW - 1,
    });
    const before = await lifecycleEvents('verified-old-account');

    await runWithWarnPayload();

    expect(await rowExists('accounts', 'id', 'verified-old-account')).toBe(true);
    expect(await rowExists('account_emails', 'id', 'verified-old-email')).toBe(true);
    await expect(lifecycleEvents('verified-old-account')).resolves.toEqual(before);
  });

  it('emits one all-zero line on an empty database', async () => {
    const payload = await runWithWarnPayload();

    expect(payload.event).toBe('retention_sweep');
    expect(payload.counts).toEqual(Object.fromEntries(COUNT_KEYS.map((key) => [key, 0])));
  });

  it('emits one failure line and stops when a statement throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const baseEnv = makeTestEnv();
    const throwingEnv = makeTestEnv({
      DB: {
        prepare(sql) {
          if (sql === 'DELETE FROM account_emails WHERE verified_at IS NULL AND created_at < ?') {
            const err = new Error('statement failed');
            err.name = 'D1Error';
            throw err;
          }
          return baseEnv.DB.prepare(sql);
        },
      },
    });

    await runRetention(throwingEnv, NOW);

    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(error.mock.calls[0][0]);
    expect(payload).toEqual({
      event: 'retention_sweep_failed',
      statement_index: 5,
      error_type: 'D1Error',
    });
  });

  it('allows concurrent runs to compose idempotently', async () => {
    await insertRateBucket('concurrent-rate-bucket', NOW - 49 * HOUR_MS);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(Promise.all([
      runRetention(makeTestEnv(), NOW),
      runRetention(makeTestEnv(), NOW),
    ])).resolves.toHaveLength(2);
  });

  it('does not emit PII-shaped values', async () => {
    await insertOtp('hash-like-token-key-12345678901234567890', {
      email: 'person@example.com',
      consumed: 0,
      expiresAt: NOW - 1,
      startedAt: NOW,
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await runRetention(makeTestEnv(), NOW);
    const output = [...log.mock.calls, ...warn.mock.calls, ...error.mock.calls].flat().join('\n');

    expect(output).not.toContain('@');
    expect(output).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
    expect(output).not.toMatch(/[0-9a-f]{32,}/);
    expect(output).not.toMatch(/[A-Za-z0-9_-]{32,}/);
  });

  it('is wired through the scheduled handler', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = createExecutionContext();

    await worker.scheduled({}, makeTestEnv(), ctx);
    await waitOnExecutionContext(ctx);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(warn.mock.calls[0][0]).event).toBe('retention_sweep');
  });

  it('dispatches the dedicated SPB sweep cron without running retention', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ email: 'scheduled-spb@example.com', testEnv });
    await seedSpbBinding({
      accountId: account.accountId,
      instanceId: '11111111-1111-1111-1111-111111111111',
      lapsedAt: NOW - 31 * DAY_MS,
    });
    installS3FetchMock(testEnv, {
      default: ({ method, url }) => {
        if (method === 'GET' && url.searchParams.get('list-type') === '2') {
          return new Response('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>', {
            headers: { 'Content-Type': 'application/xml' },
          });
        }
        if (method === 'GET' && url.searchParams.has('uploads')) {
          return new Response('<ListMultipartUploadsResult><IsTruncated>false</IsTruncated></ListMultipartUploadsResult>', {
            headers: { 'Content-Type': 'application/xml' },
          });
        }
        throw new Error(`unexpected R2 request: ${method} ${url.href}`);
      },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = createExecutionContext();

    await worker.scheduled({ cron: '0 3 * * *' }, testEnv, ctx);
    await waitOnExecutionContext(ctx);

    const events = warn.mock.calls.map((call) => JSON.parse(call[0]).event);
    expect(events).toEqual(['spb_lapse_sweep']);
  });
});

async function runWithWarnPayload() {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await runRetention(makeTestEnv(), NOW);
  expect(warn).toHaveBeenCalledTimes(1);
  return JSON.parse(warn.mock.calls[0][0]);
}

async function rowExists(table, column, value) {
  const row = await workerEnv.DB.prepare(`SELECT 1 FROM ${table} WHERE ${column} = ?`).bind(value).first();
  return row != null;
}

async function insertAccount(id, { createdAt, lastSigninAt = null } = {}) {
  await workerEnv.DB
    .prepare('INSERT INTO accounts (id, primary_email_id, passkey_user_handle, created_at, last_signin_at) VALUES (?, NULL, NULL, ?, ?)')
    .bind(id, createdAt, lastSigninAt)
    .run();
}

async function insertEmail(id, accountId, { createdAt = NOW, verifiedAt = null } = {}) {
  await workerEnv.DB
    .prepare('INSERT INTO account_emails (id, account_id, address_encrypted, address_lower_hash, is_primary, verified_at, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)')
    .bind(id, accountId, `encrypted-${id}`, `hash-${id}`, verifiedAt, createdAt)
    .run();
  if (verifiedAt != null) {
    await workerEnv.DB
      .prepare('UPDATE accounts SET primary_email_id = ? WHERE id = ?')
      .bind(id, accountId)
      .run();
  }
}

async function insertSession(idHash, accountId, {
  createdAt = NOW,
  expiresAt = NOW + DAY_MS,
  lastActiveAt = NOW,
  revokedAt = null,
} = {}) {
  await workerEnv.DB
    .prepare('INSERT INTO sessions (id_hash, account_id, created_at, expires_at, last_active_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(idHash, accountId, createdAt, expiresAt, lastActiveAt, revokedAt)
    .run();
}

async function insertCredential(credentialId, accountId) {
  await workerEnv.DB
    .prepare(
      `INSERT INTO passkey_credentials (
         credential_id, account_id, public_key, counter, aaguid, transports,
         backup_eligible, backup_state, device_type, friendly_name, created_at
       ) VALUES (?, ?, ?, 0, NULL, NULL, 0, 0, NULL, NULL, ?)`
    )
    .bind(credentialId, accountId, new Uint8Array([1, 2, 3]), NOW)
    .run();
}

async function insertLifecycleEvent(correlationId, accountId, {
  sequence,
  action,
  fromStatus,
  toStatus,
  actorKind,
  actorPrincipal,
  reasonCode,
  occurredAt,
}) {
  await workerEnv.DB
    .prepare(
      `INSERT INTO scout_lifecycle_events (
         correlation_id, account_id, sequence, action, from_status, to_status,
         actor_kind, actor_principal, reason_code, occurred_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      correlationId,
      accountId,
      sequence,
      action,
      fromStatus,
      toStatus,
      actorKind,
      actorPrincipal,
      reasonCode,
      occurredAt
    )
    .run();
}

async function lifecycleEvents(accountId) {
  const { results } = await workerEnv.DB
    .prepare('SELECT * FROM scout_lifecycle_events WHERE account_id = ? ORDER BY sequence')
    .bind(accountId)
    .all();
  return results;
}

async function insertChallenge(challenge, { createdAt = NOW, expiresAt = NOW + DAY_MS, usedAt = null } = {}) {
  await workerEnv.DB
    .prepare('INSERT INTO passkey_challenges (challenge, account_id, purpose, created_at, expires_at, used_at) VALUES (?, NULL, ?, ?, ?, ?)')
    .bind(challenge, 'authenticate', createdAt, expiresAt, usedAt)
    .run();
}

async function insertOtp(emailLowerHash, {
  email = `${emailLowerHash}@example.com`,
  codeHash = `code-${emailLowerHash}`,
  expiresAt,
  consumed,
  startedAt,
} = {}) {
  await workerEnv.DB
    .prepare('INSERT INTO otp_tokens (email_lower_hash, email_lower, code_hash, expires_at, attempts, consumed, started_at) VALUES (?, ?, ?, ?, 0, ?, ?)')
    .bind(emailLowerHash, email, codeHash, expiresAt, consumed, startedAt)
    .run();
}

async function insertRateBucket(key, windowStart) {
  await workerEnv.DB
    .prepare('INSERT INTO rate_buckets (key, count, window_start) VALUES (?, 1, ?)')
    .bind(key, windowStart)
    .run();
}

async function insertRetiredToken(tokenHash, accountId, instanceId, retiredAt) {
  await workerEnv.DB
    .prepare('INSERT INTO spb_retired_tokens (token_hash, account_id, instance_id, retired_at) VALUES (?, ?, ?, ?)')
    .bind(tokenHash, accountId, instanceId, retiredAt)
    .run();
}
