import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import {
  makeTestEnv,
  resetDb,
  seedAccount,
  seedDevice,
  seedSession,
} from './helpers.js';

const BUNDLE_ID = 'app.solstone.swift';

describe('device registration', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('registers a device for the signed-in account', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(registerRequest(session.cookie), testEnv);
    const body = await response.json();
    const row = await deviceRow(body.device_id);

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, device_id: body.device_id });
    expect(row.account_id).toBe(account.accountId);
    expect(row.platform).toBe('ios');
    expect(row.bundle_id).toBe(BUNDLE_ID);
    expect(row.revoked_at).toBeNull();
  });

  it('re-registers the same account push key by bumping last_seen_at', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const existing = await seedDevice({
      accountId: account.accountId,
      deviceId: 'existing-device',
      pushToken: 'same-push-token',
      bundleId: BUNDLE_ID,
      lastSeenAt: 1_000,
    });

    const response = await worker.fetch(registerRequest(session.cookie, {
      push_token: existing.pushToken,
    }), testEnv);
    const body = await response.json();
    const row = await deviceRow(existing.deviceId);
    const count = await activeDeviceCount(account.accountId);

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, device_id: existing.deviceId });
    expect(row.last_seen_at).toBeGreaterThan(1_000);
    expect(count).toBe(1);
  });

  it('atomically revokes a prior account device and inserts the new owner row', async () => {
    const testEnv = makeTestEnv();
    const accountA = await seedAccount({ email: 'a@example.com', testEnv });
    const accountB = await seedAccount({ email: 'b@example.com', testEnv });
    const sessionB = await seedSession(accountB.accountId, { testEnv });
    await seedDevice({
      accountId: accountA.accountId,
      deviceId: 'prior-device',
      pushToken: 'shared-push-token',
      bundleId: BUNDLE_ID,
    });

    const response = await worker.fetch(registerRequest(sessionB.cookie, {
      push_token: 'shared-push-token',
    }), testEnv);
    const body = await response.json();
    const prior = await deviceRow('prior-device');
    const next = await deviceRow(body.device_id);

    expect(response.status).toBe(200);
    expect(prior.revoked_at).toBeGreaterThan(0);
    expect(next.account_id).toBe(accountB.accountId);
    expect(next.revoked_at).toBeNull();
  });

  it('rejects malformed JSON with invalid_input', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(new Request('https://services.solstone.app/account/devices/register', {
      method: 'POST',
      headers: {
        Origin: 'https://services.solstone.app',
        Cookie: session.cookie,
        'Content-Type': 'application/json',
      },
      body: '{',
    }), testEnv);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_input' });
  });

  it('rejects missing required fields with missing_field', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(registerRequest(session.cookie, {
      push_token: '',
    }), testEnv);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'missing_field' });
  });

  it('rejects unsupported platforms with invalid_platform', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(registerRequest(session.cookie, {
      platform: 'windows',
    }), testEnv);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_platform' });
  });

  it('accepts macos platform', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(registerRequest(session.cookie, {
      platform: 'macos',
      push_token: 'macos-push-token',
    }), testEnv);
    const body = await response.json();
    const row = await deviceRow(body.device_id);

    expect(response.status).toBe(200);
    expect(row.platform).toBe('macos');
    expect(row.bundle_id).toBe(BUNDLE_ID);
  });
});

function registerRequest(cookie, overrides = {}) {
  return new Request('https://services.solstone.app/account/devices/register', {
    method: 'POST',
    headers: {
      Origin: 'https://services.solstone.app',
      Cookie: cookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      platform: 'ios',
      push_token: 'push-token',
      push_token_env: 'production',
      bundle_id: BUNDLE_ID,
      device_label: 'phone',
      app_version: '1.0.0',
      ...overrides,
    }),
  });
}

async function deviceRow(deviceId) {
  return workerEnv.DB
    .prepare(
      `SELECT device_id, account_id, platform, bundle_id, last_seen_at, revoked_at
       FROM account_devices
       WHERE device_id = ?`
    )
    .bind(deviceId)
    .first();
}

async function activeDeviceCount(accountId) {
  const row = await workerEnv.DB
    .prepare('SELECT COUNT(*) AS count FROM account_devices WHERE account_id = ? AND revoked_at IS NULL')
    .bind(accountId)
    .first();
  return row.count;
}
