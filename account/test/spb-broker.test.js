import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { hashWithPepper } from '../src/crypto.js';
import { rotateSpbBindingToken } from '../src/db.js';
import {
  fetchWithCtx,
  installConsoleSpy,
  makeTestEnv,
  resetDb,
  rowCount,
  seedAccount,
  seedEntitlement,
  seedSession,
  seedSpbBinding,
} from './helpers.js';

const INSTANCE_ID = '11111111-1111-1111-1111-111111111111';
const BROKER_TOKEN = 'spb-broker-token';
const SPB_SERVICE = 'spb_hosted';
const BACKUP_ACTIONS = [
  'HeadObject',
  'GetObject',
  'GetBucketLocation',
  'ListObjectsV1',
  'ListObjectsV2',
  'ListMultipartUploads',
  'ListParts',
  'PutObject',
  'CreateMultipartUpload',
  'UploadPart',
  'CompleteMultipartUpload',
  'AbortMultipartUpload',
];
const MAINTENANCE_ACTIONS = [...BACKUP_ACTIONS, 'DeleteObject', 'DeleteObjects'];
const HUB_URL = 'https://extro.solpbc.org/hooks/security';

describe('spb credential broker', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mints backup credentials with the Cloudflare R2 local-signing JWT shape', async () => {
    const { testEnv, account, prefix } = await seedBrokerReady();

    const response = await worker.fetch(credentialsRequest({ scope: 'backup' }, BROKER_TOKEN), testEnv);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Object.keys(body)).toEqual([
      'access_key_id',
      'secret_access_key',
      'session_token',
      'endpoint',
      'bucket',
      'prefix',
      'expires_at',
    ]);
    const { jwt, header, claims } = decodeSessionToken(body.session_token);
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(claims.iss).toBe(testEnv.R2_PARENT_ACCESS_KEY_ID);
    expect(claims.sub).toBe(testEnv.R2_ACCOUNT_ID);
    expect(claims.aud).toBe(`${testEnv.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
    expect(claims.bucket).toBe(testEnv.R2_BUCKET);
    expect(claims.paths).toEqual({ prefixPaths: [prefix] });
    expect(Object.prototype.hasOwnProperty.call(claims.paths, 'objectPaths')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(claims, 'scope')).toBe(false);
    expect(claims.actions).toEqual(BACKUP_ACTIONS);
    expect(claims.exp).toBe(claims.iat + 259200);
    expect(body.access_key_id).toBe(testEnv.R2_PARENT_ACCESS_KEY_ID);
    expect(body.secret_access_key).toBe(await sha256Hex(jwt));
    expect(body.session_token).toBe(btoa(`jwt/${jwt}`));
    expect(body.endpoint).toBe(`https://${testEnv.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
    expect(body.bucket).toBe(testEnv.R2_BUCKET);
    expect(body.prefix).toBe(prefix);
    expect(body.expires_at).toBe(new Date(claims.exp * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'));
    expect(body.expires_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);

    await expect(auditRows()).resolves.toEqual([expect.objectContaining({
      account_id: account.accountId,
      instance_id: INSTANCE_ID,
      prefix,
      scope: 'backup',
      ttl: 259200,
      outcome: 'minted',
    })]);
  });

  it('mints operated credentials for bounded backup and restore runs', async () => {
    const { testEnv } = await seedBrokerReady();

    const response = await worker.fetch(credentialsRequest({ scope: 'operated' }, BROKER_TOKEN), testEnv);
    const body = await response.json();
    const { claims } = decodeSessionToken(body.session_token);

    expect(response.status).toBe(200);
    expect(claims.actions).toEqual(MAINTENANCE_ACTIONS);
    expect(claims.actions).toEqual(expect.arrayContaining(['DeleteObject', 'DeleteObjects']));
    expect(claims.exp).toBe(claims.iat + 259200);
    await expect(auditRows()).resolves.toEqual([expect.objectContaining({
      scope: 'operated',
      ttl: 259200,
      outcome: 'minted',
    })]);
  });

  it('mints maintenance credentials for bounded destructive work', async () => {
    const { testEnv } = await seedBrokerReady();

    const response = await worker.fetch(credentialsRequest({ scope: 'maintenance' }, BROKER_TOKEN), testEnv);
    const body = await response.json();
    const { claims } = decodeSessionToken(body.session_token);

    expect(response.status).toBe(200);
    expect(claims.actions).toEqual(MAINTENANCE_ACTIONS);
    expect(claims.actions).toEqual(expect.arrayContaining(['DeleteObject', 'DeleteObjects']));
    expect(claims.exp).toBe(claims.iat + 86400);
    await expect(auditRows()).resolves.toEqual([expect.objectContaining({
      scope: 'maintenance',
      ttl: 86400,
      outcome: 'minted',
    })]);
  });

  it('derives prefix only from the binding, never request body fields', async () => {
    const { testEnv, prefix } = await seedBrokerReady();

    const response = await worker.fetch(
      credentialsRequest({
        scope: 'backup',
        prefix: 'users/EVIL/x/',
        bucket: 'evil',
        account_id: 'EVIL',
        instance_id: 'EVIL',
      }, BROKER_TOKEN),
      testEnv
    );
    const body = await response.json();
    const { claims } = decodeSessionToken(body.session_token);

    expect(response.status).toBe(200);
    expect(body.prefix).toBe(prefix);
    expect(body.bucket).toBe(testEnv.R2_BUCKET);
    expect(claims.paths.prefixPaths).toEqual([prefix]);
    expect(JSON.stringify(body)).not.toContain('EVIL');
    expect(JSON.stringify(claims)).not.toContain('EVIL');
  });

  it('serves only active, comp-active, and in-grace past_due entitlements', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const cases = [
      [{ status: 'active' }, 200],
      [{ status: 'active', source: 'comp', currentPeriodEnd: null }, 200],
      [{ status: 'past_due', currentPeriodEnd: nowSeconds + 60 }, 200],
      [{ status: 'past_due', currentPeriodEnd: nowSeconds - 15 * 86400 }, 402],
      [{ status: 'past_due', currentPeriodEnd: null }, 402],
      [{ status: 'lapsed' }, 402],
      [{ status: 'canceled' }, 402],
      [null, 402],
    ];

    for (const [entitlement, status] of cases) {
      await resetDb();
      const { testEnv } = await seedBrokerReady({ entitlement });

      const response = await worker.fetch(credentialsRequest({ scope: 'backup' }, BROKER_TOKEN), testEnv);

      expect(response.status).toBe(status);
      if (status === 402) {
        expect(await response.json()).toEqual({ error: 'needs_subscription' });
        await expect(auditRows()).resolves.toEqual([expect.objectContaining({
          outcome: 'refused_entitlement',
          scope: null,
          ttl: null,
        })]);
      }
    }
  });

  it('does not write D1 audit rows for pre-identity auth refusals', async () => {
    await expectAuthRefusal(credentialsRequest({ scope: 'backup' }));
    await expectAuthRefusal(credentialsRequest({ scope: 'backup' }, null, { Authorization: 'not bearer' }));

    await resetDb();
    const { testEnv } = await seedBrokerReady();
    const unknown = await worker.fetch(credentialsRequest({ scope: 'backup' }, 'unknown-token'), testEnv);
    await expectError(unknown, 401, 'invalid_token');
    expect(await rowCount('spb_mint_audit')).toBe(0);

    await resetDb();
    const dispatchSeeded = await seedBrokerReady({ tokenPepper: 'dispatch' });
    const wrongPepper = await worker.fetch(credentialsRequest({ scope: 'backup' }, BROKER_TOKEN), dispatchSeeded.testEnv);
    await expectError(wrongPepper, 401, 'invalid_token');
    expect(await rowCount('spb_mint_audit')).toBe(0);

    await resetDb();
    const account = await seedAccount();
    const session = await seedSession(account.accountId);
    const cookieOnly = await worker.fetch(credentialsRequest({ scope: 'backup' }, null, {
      Cookie: session.cookie,
    }), makeTestEnv());
    await expectError(cookieOnly, 401, 'invalid_token');
    expect(await rowCount('spb_mint_audit')).toBe(0);
  });

  it('uses the lapsed binding only for identity; entitlement decides serving', async () => {
    const { testEnv } = await seedBrokerReady({ lapsedAt: 123 });

    const response = await worker.fetch(credentialsRequest({ scope: 'backup' }, BROKER_TOKEN), testEnv);

    expect(response.status).toBe(200);
    await expect(auditRows()).resolves.toEqual([expect.objectContaining({
      outcome: 'minted',
    })]);
  });

  it('rejects bad scope after identity and writes a post-identity audit row', async () => {
    const { testEnv, account, prefix } = await seedBrokerReady();

    const response = await worker.fetch(credentialsRequest({ scope: 'bogus' }, BROKER_TOKEN), testEnv);

    await expectError(response, 400, 'invalid_scope');
    await expect(auditRows()).resolves.toEqual([expect.objectContaining({
      account_id: account.accountId,
      instance_id: INSTANCE_ID,
      prefix,
      scope: null,
      ttl: null,
      outcome: 'refused_scope',
    })]);
  });

  it('rejects missing and unparseable scope after identity', async () => {
    await seedBrokerReady();
    await expectScopeRefusal(credentialsRequest({}, BROKER_TOKEN));

    await resetDb();
    await seedBrokerReady();
    await expectScopeRefusal(credentialsRequestRaw('{', BROKER_TOKEN));
  });

  it('keeps the kill switch default-off without writing pre-identity audit rows', async () => {
    await expectKillSwitch(makeTestEnv({ SPB_MINT_ENABLED: 'false' }));
    const unsetEnv = makeTestEnv();
    delete unsetEnv.SPB_MINT_ENABLED;
    await expectKillSwitch(unsetEnv);
  });

  it('does not log broker tokens or minted credentials', async () => {
    const spy = installConsoleSpy();
    const { testEnv } = await seedBrokerReady();
    try {
      const response = await worker.fetch(credentialsRequest({ scope: 'backup' }, BROKER_TOKEN), testEnv);
      expect(response.status).toBe(200);
      const body = await response.json();
      const { jwt } = decodeSessionToken(body.session_token);

      spy.assertNoSecrets([
        testEnv.R2_PARENT_SECRET_ACCESS_KEY,
        body.secret_access_key,
        body.session_token,
        jwt,
        BROKER_TOKEN,
      ]);
    } finally {
      spy.restore();
    }
  });

  it('emits refusal hub events with only approved fields and never for mints', async () => {
    const mintCalls = [];
    installHubStub(mintCalls);
    const minted = await seedBrokerReady({ testEnv: makeTestEnv({ HUB_WEBHOOK_URL: HUB_URL }) });
    const mintedResult = await fetchWithCtx(
      worker,
      credentialsRequest({ scope: 'backup' }, BROKER_TOKEN),
      minted.testEnv
    );
    expect(mintedResult.response.status).toBe(200);
    expect(mintCalls).toHaveLength(0);
    vi.unstubAllGlobals();

    const refusalCalls = [];
    installHubStub(refusalCalls);
    await resetDb();
    const refused = await seedBrokerReady({
      testEnv: makeTestEnv({ HUB_WEBHOOK_URL: HUB_URL, HUB_WEBHOOK_SECRET: 'hub-secret' }),
    });
    const refusedResult = await fetchWithCtx(
      worker,
      credentialsRequest({ scope: 'bogus' }, BROKER_TOKEN),
      refused.testEnv
    );

    expect(refusedResult.response.status).toBe(400);
    expect(refusalCalls).toHaveLength(1);
    expect(refusalCalls[0].headers['x-hub-secret']).toBe('hub-secret');
    expect(Object.keys(refusalCalls[0].body).sort()).toEqual([
      'account_ref',
      'identified',
      'instance_ref',
      'office',
      'outcome',
      'tier',
      'ts',
      'type',
    ]);
    expect(refusalCalls[0].body).toMatchObject({
      office: 'cso',
      type: 'spb_mint_refused',
      tier: 'T4',
      outcome: 'refused_scope',
      identified: true,
    });
    expect(refusalCalls[0].body.account_ref).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(refusalCalls[0].body.instance_ref).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(refusalCalls[0].body).not.toHaveProperty('account_id');
    expect(refusalCalls[0].body).not.toHaveProperty('instance_id');
  });

  it('emits pre-identity refusal alerts without D1 audit rows', async () => {
    const calls = [];
    installHubStub(calls);
    const testEnv = makeTestEnv({ HUB_WEBHOOK_URL: HUB_URL });

    const { response } = await fetchWithCtx(
      worker,
      credentialsRequest({ scope: 'backup' }),
      testEnv
    );

    await expectError(response, 401, 'invalid_token');
    expect(await rowCount('spb_mint_audit')).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({
      type: 'spb_mint_refused',
      tier: 'T4',
      outcome: 'refused_binding',
      identified: false,
      account_ref: null,
      instance_ref: null,
    });
  });

  it('treats a retired (rotated) token as superseded rather than merely invalid', async () => {
    const OLD_TOKEN = 'spb-broker-token-old';
    const NEW_TOKEN = 'spb-broker-token-new';
    const { testEnv, account } = await seedBrokerReady({ token: OLD_TOKEN });
    const newHash = await hashWithPepper(NEW_TOKEN, testEnv);
    await expect(rotateSpbBindingToken(testEnv.DB, {
      accountId: account.accountId,
      instanceId: INSTANCE_ID,
      tokenHash: newHash,
      nowMs: 5_000,
    })).resolves.toBe(true);

    const response = await worker.fetch(credentialsRequest({ scope: 'backup' }, OLD_TOKEN), testEnv);

    await expectError(response, 401, 'binding_superseded');
    expect(await rowCount('spb_mint_audit')).toBe(0);
  });

  it('emits a real-identity refusal alert for a superseded token, unlike pre-identity refusals', async () => {
    const OLD_TOKEN = 'spb-broker-token-old';
    const NEW_TOKEN = 'spb-broker-token-new';
    const calls = [];
    installHubStub(calls);
    const testEnv = makeTestEnv({ HUB_WEBHOOK_URL: HUB_URL });
    const { account } = await seedBrokerReady({ testEnv, token: OLD_TOKEN });
    const newHash = await hashWithPepper(NEW_TOKEN, testEnv);
    await rotateSpbBindingToken(testEnv.DB, {
      accountId: account.accountId,
      instanceId: INSTANCE_ID,
      tokenHash: newHash,
      nowMs: 5_000,
    });

    const { response } = await fetchWithCtx(worker, credentialsRequest({ scope: 'backup' }, OLD_TOKEN), testEnv);

    await expectError(response, 401, 'binding_superseded');
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({
      type: 'spb_mint_refused',
      tier: 'T4',
      outcome: 'refused_superseded',
      identified: true,
    });
    expect(calls[0].body.account_ref).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(calls[0].body.instance_ref).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(calls[0].body).not.toHaveProperty('account_id');
    expect(calls[0].body).not.toHaveProperty('instance_id');
  });

  it('lets the kill switch short-circuit before a superseded-token check', async () => {
    const OLD_TOKEN = 'spb-broker-token-old';
    const NEW_TOKEN = 'spb-broker-token-new';
    const testEnv = makeTestEnv({ SPB_MINT_ENABLED: 'false' });
    const { account } = await seedBrokerReady({ testEnv, token: OLD_TOKEN });
    const newHash = await hashWithPepper(NEW_TOKEN, testEnv);
    await rotateSpbBindingToken(testEnv.DB, {
      accountId: account.accountId,
      instanceId: INSTANCE_ID,
      tokenHash: newHash,
      nowMs: 5_000,
    });

    const response = await worker.fetch(credentialsRequest({ scope: 'backup' }, OLD_TOKEN), testEnv);

    await expectError(response, 503, 'mint_disabled');
  });

  it('keeps audit rows free of secrets after mint and post-identity refusal', async () => {
    const { testEnv } = await seedBrokerReady();
    const mint = await worker.fetch(credentialsRequest({ scope: 'backup' }, BROKER_TOKEN), testEnv);
    const mintBody = await mint.json();
    const { jwt } = decodeSessionToken(mintBody.session_token);
    assertAuditHasNoSecrets([
      testEnv.R2_PARENT_SECRET_ACCESS_KEY,
      jwt,
      mintBody.secret_access_key,
      mintBody.session_token,
    ], await auditRows());

    await resetDb();
    const refused = await seedBrokerReady();
    await worker.fetch(credentialsRequest({ scope: 'bogus-secret-scope' }, BROKER_TOKEN), refused.testEnv);
    assertAuditHasNoSecrets([
      refused.testEnv.R2_PARENT_SECRET_ACCESS_KEY,
      'bogus-secret-scope',
    ], await auditRows());
  });
});

async function seedBrokerReady({
  testEnv = makeTestEnv(),
  token = BROKER_TOKEN,
  tokenPepper = 'default',
  entitlement = { status: 'active' },
  lapsedAt = null,
} = {}) {
  const account = await seedAccount({ email: 'spb@example.com', testEnv });
  if (entitlement) {
    await seedEntitlement({
      accountId: account.accountId,
      service: SPB_SERVICE,
      ...entitlement,
    });
  }
  const tokenHash = tokenPepper === 'dispatch'
    ? await hashWithPepper(token, testEnv, 'DISPATCH_TOKEN_PEPPER')
    : await hashWithPepper(token, testEnv);
  await seedSpbBinding({
    accountId: account.accountId,
    instanceId: INSTANCE_ID,
    tokenHash,
    lapsedAt,
  });
  return {
    testEnv,
    account,
    token,
    prefix: `users/${account.accountId}/${INSTANCE_ID}/`,
  };
}

async function expectAuthRefusal(request) {
  const response = await worker.fetch(request, makeTestEnv());
  await expectError(response, 401, 'invalid_token');
  expect(await rowCount('spb_mint_audit')).toBe(0);
}

async function expectKillSwitch(testEnv) {
  const response = await worker.fetch(credentialsRequest({ scope: 'backup' }, BROKER_TOKEN), testEnv);
  await expectError(response, 503, 'mint_disabled');
  expect(await rowCount('spb_mint_audit')).toBe(0);
}

function credentialsRequest(body, bearer = null, headers = {}) {
  const requestHeaders = { 'Content-Type': 'application/json', ...headers };
  if (bearer !== null) requestHeaders.Authorization = `Bearer ${bearer}`;
  return new Request('https://services.solstone.app/backup/credentials', {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify(body),
  });
}

function credentialsRequestRaw(body, bearer = null, headers = {}) {
  const requestHeaders = { 'Content-Type': 'application/json', ...headers };
  if (bearer !== null) requestHeaders.Authorization = `Bearer ${bearer}`;
  return new Request('https://services.solstone.app/backup/credentials', {
    method: 'POST',
    headers: requestHeaders,
    body,
  });
}

async function expectScopeRefusal(request) {
  const response = await worker.fetch(request, makeTestEnv());
  await expectError(response, 400, 'invalid_scope');
  await expect(auditRows()).resolves.toEqual([expect.objectContaining({
    outcome: 'refused_scope',
    scope: null,
    ttl: null,
  })]);
}

async function expectError(response, status, error) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error });
}

function decodeSessionToken(sessionToken) {
  const token = atob(sessionToken);
  expect(token.startsWith('jwt/')).toBe(true);
  const jwt = token.slice(4);
  const parts = jwt.split('.');
  expect(parts).toHaveLength(3);
  return {
    jwt,
    header: decodeJwtPart(parts[0]),
    claims: decodeJwtPart(parts[1]),
  };
}

function decodeJwtPart(part) {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(part)));
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function auditRows() {
  const { results } = await workerEnv.DB
    .prepare('SELECT account_id, instance_id, prefix, scope, ttl, outcome, ts FROM spb_mint_audit ORDER BY ts, rowid')
    .all();
  return results || [];
}

function installHubStub(calls) {
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    calls.push({
      url,
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: JSON.parse(init.body),
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }));
}

function assertAuditHasNoSecrets(secrets, rows) {
  const text = JSON.stringify(rows);
  for (const secret of secrets.filter(Boolean)) {
    expect(text).not.toContain(secret);
  }
}
