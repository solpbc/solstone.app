import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { hashWithPepper } from '../src/crypto.js';
import { mintSandboxExternalCredential } from '../src/r2-credential.js';
import { denySpbSandboxBinding } from '../src/spb-sandbox-lifecycle.js';
import {
  fetchWithCtx,
  installConsoleSpy,
  makeTestEnv,
  resetDb,
  rowCount,
  seedAccount,
  seedEntitlement,
  seedSandboxRun,
  seedSession,
  seedSpbBinding,
} from './helpers.js';

const INSTANCE_ID = '11111111-1111-1111-1111-111111111111';
const SANDBOX_RUN = 'aaaaaaaa-1111-1111-1111-111111111111';
const BROKER_TOKEN = 'spb-broker-token';
const SPB_SERVICE = 'spb_hosted';
const NOW = 1_700_000_000_000;
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
    vi.useRealTimers();
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
    await expect(spbBindingRow()).resolves.toMatchObject({
      sandbox_run_id: null,
      sandbox_credential_expires_at: null,
      sandbox_denied_at: null,
    });
    await expect(sandboxAuditRows()).resolves.toEqual([]);
  });

  it('durably advances the exact serialized 90-second sandbox expiry before responding', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const calls = [];
    installHubStub(calls);
    const testEnv = makeTestEnv({
      HUB_WEBHOOK_URL: HUB_URL,
      HUB_WEBHOOK_SECRET: 'hub-secret',
    });
    const seeded = await seedBrokerReady({ testEnv, sandboxRunId: SANDBOX_RUN });
    const spy = installConsoleSpy();

    try {
      const { response } = await fetchWithCtx(
        worker,
        credentialsRequest({ scope: 'backup' }, BROKER_TOKEN),
        testEnv
      );
      const body = await response.json();
      const { jwt, claims } = decodeSessionToken(body.session_token);
      const durable = await spbBindingRow();

      expect(response.status).toBe(200);
      expect(claims.exp - claims.iat).toBe(90);
      expect(Date.parse(body.expires_at)).toBe(NOW + 90_000);
      expect(durable.sandbox_credential_expires_at).toBe(Date.parse(body.expires_at));
      await expect(auditRows()).resolves.toEqual([]);
      await expect(sandboxAuditRows()).resolves.toEqual([sandboxMintAudit({
        outcome: 'minted',
        scope: 'backup',
        ttl: 90,
        credentialsMinted: 1,
      })]);
      expect(calls).toHaveLength(1);
      expect(Object.keys(calls[0].body).sort()).toEqual([
        'credentials_minted',
        'office',
        'outcome',
        'tier',
        'ts',
        'type',
      ]);
      expect(calls[0].body).toMatchObject({
        type: 'spb_sandbox_mint',
        outcome: 'minted',
        credentials_minted: 1,
      });
      const telemetry = {
        audits: await sandboxAuditRows(),
        console: spy.calls,
        hub: calls,
      };
      for (const forbidden of [
        seeded.account.accountId,
        SANDBOX_RUN,
        INSTANCE_ID,
        seeded.prefix,
        BROKER_TOKEN,
        body.secret_access_key,
        body.session_token,
        jwt,
      ]) {
        expect(JSON.stringify(telemetry)).not.toContain(forbidden);
      }
    } finally {
      spy.restore();
    }
  });

  it.each([
    ['missing', null],
    ['account-mismatched', { accountMismatch: true }],
    ['instance-mismatched', { instanceId: '33333333-3333-3333-3333-333333333333' }],
    ['non-active', { status: 'provisioning', provisioningPhase: 'created' }],
    ['boundary-expired', { createdAt: NOW - 3_600_000, leaseExpiresAt: NOW }],
  ])('rejects a %s run-owned binding lease before minting', async (_label, sandboxRun) => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { testEnv } = await seedBrokerReady({
      sandboxRunId: SANDBOX_RUN,
      sandboxRun,
    });

    const response = await worker.fetch(
      credentialsRequest({ scope: 'backup' }, BROKER_TOKEN),
      testEnv
    );

    await expectError(response, 401, 'invalid_token');
    await expect(spbBindingRow()).resolves.toMatchObject({
      sandbox_credential_expires_at: null,
    });
    await expect(auditRows()).resolves.toEqual([]);
    await expect(sandboxAuditRows()).resolves.toEqual([]);
  });

  it('discards the signed credential when the lease is lost before the expiry CAS', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const baseEnv = makeTestEnv();
    await seedBrokerReady({ testEnv: baseEnv, sandboxRunId: SANDBOX_RUN });
    const testEnv = interceptAllOnce(
      baseEnv,
      /UPDATE spb_bindings\s+SET sandbox_credential_expires_at/i,
      async (bound) => {
        await workerEnv.DB
          .prepare("UPDATE sandbox_runs SET status = 'cleanup_required' WHERE run_id = ?")
          .bind(SANDBOX_RUN)
          .run();
        return bound.all();
      }
    );

    const response = await worker.fetch(
      credentialsRequest({ scope: 'backup' }, BROKER_TOKEN),
      testEnv
    );
    const bodyText = await response.text();

    expect(response.status).toBe(401);
    expect(JSON.parse(bodyText)).toEqual({ error: 'invalid_token' });
    expect(bodyText).not.toContain('access_key_id');
    expect(bodyText).not.toContain('session_token');
    await expect(spbBindingRow()).resolves.toMatchObject({
      sandbox_credential_expires_at: null,
    });
    await expect(sandboxAuditRows()).resolves.toEqual([sandboxMintAudit({
      outcome: 'mint_cas_lost',
      scope: 'backup',
      ttl: 90,
    })]);
  });

  it('returns a lower-expiry sandbox credential without decreasing the durable maximum', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { testEnv } = await seedBrokerReady({
      sandboxRunId: SANDBOX_RUN,
      sandboxCredentialExpiresAt: NOW + 180_000,
    });

    const response = await worker.fetch(
      credentialsRequest({ scope: 'operated' }, BROKER_TOKEN),
      testEnv
    );
    const body = await response.json();
    const row = await spbBindingRow();

    expect(response.status).toBe(200);
    expect(Date.parse(body.expires_at)).toBe(NOW + 90_000);
    expect(row.sandbox_credential_expires_at).toBe(NOW + 180_000);
    expect(decodeSessionToken(body.session_token).claims.exp
      - decodeSessionToken(body.session_token).claims.iat).toBe(90);
  });

  it('uses only counts-only sandbox evidence for post-identity entitlement and scope refusals', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const cases = [
      {
        outcome: 'refused_entitlement',
        entitlement: null,
        request: () => credentialsRequest({ scope: 'backup' }, BROKER_TOKEN),
        status: 402,
        error: 'needs_subscription',
      },
      {
        outcome: 'refused_scope',
        entitlement: { status: 'active' },
        request: () => credentialsRequestRaw('{', BROKER_TOKEN),
        status: 400,
        error: 'invalid_scope',
      },
      {
        outcome: 'refused_scope',
        entitlement: { status: 'active' },
        request: () => credentialsRequest({ scope: 'maintenance' }, BROKER_TOKEN),
        status: 400,
        error: 'invalid_scope',
      },
    ];

    for (const testCase of cases) {
      await resetDb();
      const calls = [];
      installHubStub(calls);
      const testEnv = makeTestEnv({ HUB_WEBHOOK_URL: HUB_URL });
      await seedBrokerReady({
        testEnv,
        sandboxRunId: SANDBOX_RUN,
        entitlement: testCase.entitlement,
      });
      const spy = installConsoleSpy();
      try {
        const { response } = await fetchWithCtx(worker, testCase.request(), testEnv);
        await expectError(response, testCase.status, testCase.error);
        await expect(auditRows()).resolves.toEqual([]);
        await expect(sandboxAuditRows()).resolves.toEqual([sandboxMintAudit({
          outcome: testCase.outcome,
        })]);
        expect(calls).toHaveLength(1);
        expect(calls[0].body).toMatchObject({
          type: 'spb_sandbox_mint',
          outcome: testCase.outcome,
          credentials_minted: 0,
        });
        expect(JSON.stringify(calls)).not.toContain('spb_mint_refused');
        expect(JSON.stringify(spy.calls)).not.toContain('spb_mint_refused');
      } finally {
        spy.restore();
      }
      vi.unstubAllGlobals();
    }
  });

  it('discards every signed field when token rotation wins after signing and before the CAS', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const calls = [];
    installHubStub(calls);
    const baseEnv = makeTestEnv({ HUB_WEBHOOK_URL: HUB_URL });
    const seeded = await seedBrokerReady({ testEnv: baseEnv, sandboxRunId: SANDBOX_RUN });
    const signed = await mintSandboxExternalCredential(baseEnv, {
      prefix: seeded.prefix,
      scope: 'backup',
      nowSeconds: Math.floor(NOW / 1000),
    });
    const rotatedHash = await hashWithPepper('rotated-broker-token', baseEnv);
    const testEnv = interceptAllOnce(baseEnv, /UPDATE spb_bindings\s+SET sandbox_credential_expires_at/i, async (bound) => {
      await workerEnv.DB
        .prepare('UPDATE spb_bindings SET token_hash = ? WHERE instance_id = ?')
        .bind(rotatedHash, INSTANCE_ID)
        .run();
      return bound.all();
    });
    const spy = installConsoleSpy();

    try {
      const { response } = await fetchWithCtx(
        worker,
        credentialsRequest({ scope: 'backup' }, BROKER_TOKEN),
        testEnv
      );
      const bodyText = await response.text();
      const row = await spbBindingRow();

      expect(response.status).toBe(401);
      expect(JSON.parse(bodyText)).toEqual({ error: 'invalid_token' });
      expect(row.token_hash).toBe(rotatedHash);
      expect(row.sandbox_credential_expires_at).toBeNull();
      await expect(auditRows()).resolves.toEqual([]);
      await expect(sandboxAuditRows()).resolves.toEqual([sandboxMintAudit({
        outcome: 'mint_cas_lost',
        scope: 'backup',
        ttl: 90,
      })]);
      const forbidden = [
        signed.accessKeyId,
        signed.secretAccessKey,
        signed.sessionToken,
        atob(signed.sessionToken).slice(4),
      ];
      spy.assertNoSecrets(forbidden.concat([BROKER_TOKEN]));
      const surfaces = JSON.stringify({
        bodyText,
        binding: row,
        audits: await sandboxAuditRows(),
        hub: calls,
      });
      for (const value of forbidden) expect(surfaces).not.toContain(value);
    } finally {
      spy.restore();
    }
  });

  it('keeps a winning expiry CAS durable when response production fails afterward', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const calls = [];
    installHubStub(calls);
    const baseEnv = makeTestEnv({ HUB_WEBHOOK_URL: HUB_URL });
    const seeded = await seedBrokerReady({ testEnv: baseEnv, sandboxRunId: SANDBOX_RUN });
    const signed = await mintSandboxExternalCredential(baseEnv, {
      prefix: seeded.prefix,
      scope: 'backup',
      nowSeconds: Math.floor(NOW / 1000),
    });
    const testEnv = interceptRunOnce(
      baseEnv,
      /INSERT INTO spb_sandbox_audit/i,
      async () => {
        throw new Error('injected post-CAS response failure');
      }
    );
    const spy = installConsoleSpy();

    try {
      const { response } = await fetchWithCtx(
        worker,
        credentialsRequest({ scope: 'backup' }, BROKER_TOKEN),
        testEnv
      );
      const bodyText = await response.text();
      const durable = await spbBindingRow();

      expect(response.status).toBe(500);
      expect(JSON.parse(bodyText)).toEqual({ error: 'internal_error' });
      expect(durable.sandbox_credential_expires_at).toBe(NOW + 90_000);
      await expect(sandboxAuditRows()).resolves.toEqual([sandboxMintAudit({
        outcome: 'internal_error',
      })]);
      const forbidden = [
        signed.accessKeyId,
        signed.secretAccessKey,
        signed.sessionToken,
        atob(signed.sessionToken).slice(4),
      ];
      spy.assertNoSecrets(forbidden);
      const surfaces = JSON.stringify({ bodyText, audits: await sandboxAuditRows(), hub: calls });
      for (const value of forbidden) expect(surfaces).not.toContain(value);
    } finally {
      spy.restore();
    }
  });

  it('serializes mint-versus-denial in both orders without an untracked credential', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const denialFirstEnv = makeTestEnv();
    const denialFirst = await seedBrokerReady({
      testEnv: denialFirstEnv,
      sandboxRunId: SANDBOX_RUN,
    });
    const racedEnv = interceptAllOnce(
      denialFirstEnv,
      /UPDATE spb_bindings\s+SET sandbox_credential_expires_at/i,
      async (bound) => {
        await denySpbSandboxBinding(denialFirstEnv, null, {
          sandboxRunId: SANDBOX_RUN,
          accountId: denialFirst.account.accountId,
          instanceId: INSTANCE_ID,
          nowMs: NOW + 1,
        });
        return bound.all();
      }
    );

    const lost = await worker.fetch(
      credentialsRequest({ scope: 'backup' }, BROKER_TOKEN),
      racedEnv
    );
    await expectError(lost, 401, 'invalid_token');
    await expect(spbBindingRow()).resolves.toMatchObject({
      token_hash: null,
      sandbox_credential_expires_at: null,
      sandbox_denied_at: NOW + 1,
    });

    await resetDb();
    const casFirstEnv = makeTestEnv();
    const casFirst = await seedBrokerReady({
      testEnv: casFirstEnv,
      sandboxRunId: SANDBOX_RUN,
    });
    const won = await worker.fetch(
      credentialsRequest({ scope: 'backup' }, BROKER_TOKEN),
      casFirstEnv
    );
    const wonBody = await won.json();
    await expect(denySpbSandboxBinding(casFirstEnv, null, {
      sandboxRunId: SANDBOX_RUN,
      accountId: casFirst.account.accountId,
      instanceId: INSTANCE_ID,
      nowMs: NOW + 1,
    })).resolves.toEqual({ outcome: 'released' });
    await expect(spbBindingRow()).resolves.toMatchObject({
      token_hash: null,
      sandbox_credential_expires_at: Date.parse(wonBody.expires_at),
      sandbox_denied_at: NOW + 1,
    });
  });

  it('records only sandbox internal-error evidence after resolving run ownership', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const calls = [];
    installHubStub(calls);
    const baseEnv = makeTestEnv({ HUB_WEBHOOK_URL: HUB_URL });
    await seedBrokerReady({ testEnv: baseEnv, sandboxRunId: SANDBOX_RUN });
    const testEnv = interceptAllOnce(
      baseEnv,
      /UPDATE spb_bindings\s+SET sandbox_credential_expires_at/i,
      async () => {
        throw new Error('injected CAS failure');
      }
    );
    const spy = installConsoleSpy();

    try {
      const { response } = await fetchWithCtx(
        worker,
        credentialsRequest({ scope: 'backup' }, BROKER_TOKEN),
        testEnv
      );

      await expectError(response, 500, 'internal_error');
      await expect(auditRows()).resolves.toEqual([]);
      await expect(sandboxAuditRows()).resolves.toEqual([sandboxMintAudit({
        outcome: 'internal_error',
      })]);
      expect(calls).toHaveLength(1);
      expect(calls[0].body).toMatchObject({
        type: 'spb_sandbox_mint',
        outcome: 'internal_error',
        credentials_minted: 0,
      });
      expect(JSON.stringify(spy.calls)).not.toContain('spb_mint_failed');
    } finally {
      spy.restore();
    }
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
      'account_id',
      'instance_id',
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
      account_id: refused.account.accountId,
      instance_id: INSTANCE_ID,
    });
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
      account_id: null,
      instance_id: null,
    });
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
  sandboxRunId = null,
  sandboxRun = {},
  sandboxCredentialExpiresAt = null,
  sandboxDeniedAt = null,
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
    sandboxRunId,
    sandboxCredentialExpiresAt,
    sandboxDeniedAt,
  });
  if (sandboxRunId !== null && sandboxRun !== null) {
    let runAccountId = account.accountId;
    if (sandboxRun.accountMismatch) {
      const otherAccount = await seedAccount({ email: 'spb-run-other@example.com', testEnv });
      runAccountId = otherAccount.accountId;
    }
    const { accountMismatch: _accountMismatch, ...runOverrides } = sandboxRun;
    await seedSandboxRun({
      runId: sandboxRunId,
      accountId: runAccountId,
      instanceId: INSTANCE_ID,
      createdAt: NOW,
      ...runOverrides,
    });
  }
  return {
    testEnv,
    account,
    token,
    tokenHash,
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

async function sandboxAuditRows() {
  const { results } = await workerEnv.DB
    .prepare('SELECT * FROM spb_sandbox_audit ORDER BY rowid')
    .all();
  return results || [];
}

async function spbBindingRow() {
  return workerEnv.DB
    .prepare('SELECT * FROM spb_bindings WHERE instance_id = ?')
    .bind(INSTANCE_ID)
    .first();
}

function sandboxMintAudit({
  outcome,
  scope = null,
  ttl = null,
  credentialsMinted = 0,
}) {
  return {
    event: 'mint',
    outcome,
    scope,
    ttl,
    credentials_minted: credentialsMinted,
    objects_deleted: null,
    multipart_aborted: null,
    ts: NOW,
  };
}

function interceptAllOnce(testEnv, pattern, allHandler) {
  let intercepted = false;
  return {
    ...testEnv,
    DB: {
      prepare(sql) {
        const statement = testEnv.DB.prepare(sql);
        if (!pattern.test(sql)) return statement;
        return {
          bind(...args) {
            const bound = statement.bind(...args);
            return {
              run: (...runArgs) => bound.run(...runArgs),
              first: (...firstArgs) => bound.first(...firstArgs),
              all(...allArgs) {
                if (intercepted) return bound.all(...allArgs);
                intercepted = true;
                return allHandler(bound, allArgs);
              },
            };
          },
          run: (...args) => statement.run(...args),
          first: (...args) => statement.first(...args),
          all(...args) {
            if (intercepted) return statement.all(...args);
            intercepted = true;
            return allHandler(statement, args);
          },
        };
      },
      batch(statements) {
        return testEnv.DB.batch(statements);
      },
    },
  };
}

function interceptRunOnce(testEnv, pattern, runHandler) {
  let intercepted = false;
  return {
    ...testEnv,
    DB: {
      prepare(sql) {
        const statement = testEnv.DB.prepare(sql);
        if (!pattern.test(sql)) return statement;
        return {
          bind(...args) {
            const bound = statement.bind(...args);
            return {
              run(...runArgs) {
                if (intercepted) return bound.run(...runArgs);
                intercepted = true;
                return runHandler(bound, runArgs);
              },
              first: (...firstArgs) => bound.first(...firstArgs),
              all: (...allArgs) => bound.all(...allArgs),
            };
          },
          run(...args) {
            if (intercepted) return statement.run(...args);
            intercepted = true;
            return runHandler(statement, args);
          },
          first: (...args) => statement.first(...args),
          all: (...args) => statement.all(...args),
        };
      },
      batch(statements) {
        return testEnv.DB.batch(statements);
      },
    },
  };
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
