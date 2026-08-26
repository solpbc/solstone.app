const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const ACCOUNT_ABANDONED_SUBQUERY =
  'SELECT id FROM accounts WHERE created_at < ? AND NOT EXISTS (SELECT 1 FROM account_emails WHERE account_id = accounts.id AND verified_at IS NOT NULL)';

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

export async function runRetention(env, nowMs = Date.now()) {
  const db = env.DB;
  const startMs = Date.now();
  const counts = Object.fromEntries(COUNT_KEYS.map((key) => [key, 0]));
  let statementIndex = 0;
  const statements = [
    {
      index: 1,
      sql: 'DELETE FROM otp_tokens WHERE consumed = 0 AND expires_at < ?',
      cutoff: nowMs,
      key: 'otp_unconsumed',
    },
    {
      index: 2,
      sql: 'DELETE FROM otp_tokens WHERE consumed = 1 AND started_at < ?',
      cutoff: nowMs - 24 * HOUR_MS,
      key: 'otp_consumed',
    },
    {
      index: 3,
      sql: 'DELETE FROM passkey_challenges WHERE used_at IS NULL AND expires_at < ?',
      cutoff: nowMs,
      key: 'challenges_unused',
    },
    {
      index: 4,
      sql: 'DELETE FROM passkey_challenges WHERE used_at IS NOT NULL AND created_at < ?',
      cutoff: nowMs - 24 * HOUR_MS,
      key: 'challenges_used',
    },
    {
      index: 5,
      sql: 'DELETE FROM account_emails WHERE verified_at IS NULL AND created_at < ?',
      cutoff: nowMs - 30 * DAY_MS,
      key: 'emails_unverified',
    },
    {
      index: 6,
      sql: `DELETE FROM sessions WHERE account_id IN (${ACCOUNT_ABANDONED_SUBQUERY})`,
      cutoff: nowMs - 30 * DAY_MS,
      key: 'abandoned_sessions',
    },
    {
      index: 7,
      sql: `DELETE FROM passkey_credentials WHERE account_id IN (${ACCOUNT_ABANDONED_SUBQUERY})`,
      cutoff: nowMs - 30 * DAY_MS,
      key: 'abandoned_passkeys',
    },
    {
      index: 8,
      sql: `DELETE FROM account_emails WHERE account_id IN (${ACCOUNT_ABANDONED_SUBQUERY})`,
      cutoff: nowMs - 30 * DAY_MS,
      key: 'abandoned_emails',
    },
    {
      index: 9,
      sql: `DELETE FROM accounts WHERE created_at < ? AND NOT EXISTS (SELECT 1 FROM account_emails WHERE account_id = accounts.id AND verified_at IS NOT NULL)`,
      cutoff: nowMs - 30 * DAY_MS,
      key: 'accounts_abandoned',
    },
    {
      index: 10,
      sql: 'DELETE FROM sessions WHERE revoked_at IS NOT NULL AND revoked_at < ?',
      cutoff: nowMs - 30 * DAY_MS,
      key: 'sessions_revoked',
    },
    {
      index: 11,
      sql: 'DELETE FROM sessions WHERE revoked_at IS NULL AND expires_at < ?',
      cutoff: nowMs - 30 * DAY_MS,
      key: 'sessions_expired',
    },
    {
      index: 12,
      sql: 'DELETE FROM rate_buckets WHERE window_start < ?',
      cutoff: nowMs - 48 * HOUR_MS,
      key: 'rate_buckets',
    },
    {
      index: 13,
      sql: 'DELETE FROM spb_retired_tokens WHERE retired_at < ?',
      cutoff: nowMs - 7 * DAY_MS,
      key: 'spb_retired_tokens',
    },
  ];

  try {
    for (const statement of statements) {
      statementIndex = statement.index;
      const result = await db.prepare(statement.sql).bind(statement.cutoff).run();
      counts[statement.key] = result?.meta?.changes || 0;
    }
    console.warn(JSON.stringify({
      event: 'retention_sweep',
      counts,
      duration_ms: Date.now() - startMs,
      ts: Date.now(),
    }));
  } catch (err) {
    console.error(JSON.stringify({
      event: 'retention_sweep_failed',
      statement_index: statementIndex,
      error_type: err?.name || 'Error',
    }));
  }
}
