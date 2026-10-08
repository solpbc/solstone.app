import { env as workerEnv } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportJWK, exportPKCS8, exportSPKI, generateKeyPair } from 'jose';
import rawContract from '../protocol/service-enable-proof.json?raw';
import contract from '../protocol/service-enable-proof.json';
import worker from '../src/index.js';
import { base64UrlEncode } from '../src/crypto.js';
import { signEnableResume, verifyEnableResume } from '../src/enable.js';
import {
  TEST_CSRF,
  installConsoleSpy,
  installRelayFetchMock,
  installS3FetchMock,
  makeTestEnv,
  resetDb,
  rowCount,
  seedAccount,
  seedCredential,
  seedEntitlement,
  seedOtp,
  seedPasskeyChallenge,
  seedScoutApplication,
  seedSession,
  seedSpbBinding,
} from './helpers.js';
import { generateReachKeyPair, mintHomeReachAssertion } from './reach-helper.js';

vi.mock('@simplewebauthn/server', () => ({
  verifyAuthenticationResponse: vi.fn(async () => ({
    verified: true,
    authenticationInfo: { newCounter: 1 },
  })),
  verifyRegistrationResponse: vi.fn(async () => ({ verified: true })),
}));

import { verifyAuthenticationResponse } from '@simplewebauthn/server';

function b64u(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function clientData(challenge) {
  return b64u(new TextEncoder().encode(JSON.stringify({ challenge })));
}

function authResponse(challenge, id, userHandle) {
  return {
    id,
    rawId: id,
    type: 'public-key',
    response: {
      clientDataJSON: clientData(challenge),
      authenticatorData: 'authenticator-data',
      signature: 'signature',
      userHandle,
    },
    clientExtensionResults: {},
  };
}

const VALID_NONCE = '4'.repeat(52);
const OTHER_NONCE = '5'.repeat(52);
const TABLES = [
  'spl_bindings',
  'spb_bindings',
  'spp_bindings',
  'sme_bindings',
  'service_handoffs',
  'spp_mint_audit',
  'entitlements',
  'mcp_bridge_bindings',
  'mcp_bridge_hostname_ledger',
  'spb_retired_tokens',
];

async function getRowCounts() {
  const counts = {};
  for (const table of TABLES) {
    counts[table] = await rowCount(table);
  }
  return counts;
}

async function validProofFor({ service, instanceId, privateKey, nonce = VALID_NONCE, claims = {} }) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = await mintHomeReachAssertion({
    instanceId,
    privateKey,
    claims: {
      scope: contract.scope,
      service,
      nonce,
      iat: now,
      exp: now + contract.lifetime_seconds,
      ...claims,
    },
  });
  return assertion;
}

function servicePath(svc) {
  if (svc === 'spl') return '/enable/spl';
  if (svc === 'spb') return '/enable/backup';
  if (svc === 'spp') return '/enable/spp';
  if (svc === 'sme') return '/enable/solstone-me';
  throw new Error(`unknown service ${svc}`);
}

function serviceConfirmPath(svc) {
  return `${servicePath(svc)}/confirm`;
}

function serviceFormExtra(svc) {
  if (svc === 'spp' || svc === 'sme') return { data_ack: 'yes' };
  return {};
}

function unescapeAttr(str) {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

describe('service enable proof of possession', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // 1. Raw file bytes
  it('protocol JSON equals exact bytes with no trailing newline', () => {
    expect(rawContract).toBe(
      '{"version":1,"alg":"ES256","typ":"home-reach","aud":"solstone-reach","scope":"services.enable","services":["spl","spb","spp","sme"],"lifetime_seconds":1800,"clock_skew_seconds":60}'
    );
  });

  // 2. Flag matrix on first claim with no proof
  describe('flag matrix on first claim without proof', () => {
    const services = ['spl', 'spb', 'spp', 'sme'];

    it('spl: first claim without a proof is refused', async () => {
      const testEnv = makeTestEnv({ SERVICE_ENABLE_PROOF_REQUIRED: 'true' });
      installRelayFetchMock();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      const kp = await generateReachKeyPair();

      const response = await worker.fetch(new Request(`https://services.solstone.app${serviceConfirmPath('spl')}`, {
        method: 'POST',
        headers: {
          Origin: 'https://services.solstone.app',
          Cookie: session.cookie,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          csrf: TEST_CSRF,
          nonce: VALID_NONCE,
          action: 'allow',
          instance: kp.instanceId,
        }),
      }), testEnv);

      expect(response.status).toBe(400);
      expect(await rowCount('spl_bindings')).toBe(0);
    });

    it('spb: first claim without a proof is refused', async () => {
      const testEnv = makeTestEnv({ SERVICE_ENABLE_PROOF_REQUIRED: 'true' });
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      const kp = await generateReachKeyPair();

      const response = await worker.fetch(new Request(`https://services.solstone.app${serviceConfirmPath('spb')}`, {
        method: 'POST',
        headers: {
          Origin: 'https://services.solstone.app',
          Cookie: session.cookie,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          csrf: TEST_CSRF,
          nonce: VALID_NONCE,
          action: 'allow',
          instance: kp.instanceId,
        }),
      }), testEnv);

      expect(response.status).toBe(400);
      expect(await rowCount('spb_bindings')).toBe(0);
    });

    it('spp: first claim without a proof is refused', async () => {
      const testEnv = makeTestEnv({ SERVICE_ENABLE_PROOF_REQUIRED: 'true' });
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      await seedScoutApplication({ accountId: account.accountId, status: 'approved' });
      const kp = await generateReachKeyPair();

      const response = await worker.fetch(new Request(`https://services.solstone.app${serviceConfirmPath('spp')}`, {
        method: 'POST',
        headers: {
          Origin: 'https://services.solstone.app',
          Cookie: session.cookie,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          csrf: TEST_CSRF,
          nonce: VALID_NONCE,
          action: 'allow',
          instance: kp.instanceId,
          data_ack: 'yes',
        }),
      }), testEnv);

      expect(response.status).toBe(400);
      expect(await rowCount('spp_bindings')).toBe(0);
    });

    it('sme: first claim without a proof is refused', async () => {
      const testEnv = makeTestEnv({ SERVICE_ENABLE_PROOF_REQUIRED: 'true' });
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      const kp = await generateReachKeyPair();

      const response = await worker.fetch(new Request(`https://services.solstone.app${serviceConfirmPath('sme')}`, {
        method: 'POST',
        headers: {
          Origin: 'https://services.solstone.app',
          Cookie: session.cookie,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          csrf: TEST_CSRF,
          nonce: VALID_NONCE,
          action: 'allow',
          instance: kp.instanceId,
          data_ack: 'yes',
        }),
      }), testEnv);

      expect(response.status).toBe(400);
      expect(await rowCount('sme_bindings')).toBe(0);
    });

    it.each(services)('%s: compatibility mode allows first claim without proof', async (svc) => {
      for (const flagValue of [undefined, '', 'false', 'TRUE', '1']) {
        await resetDb();
        const testEnv = makeTestEnv({ SERVICE_ENABLE_PROOF_REQUIRED: flagValue });
        installRelayFetchMock();
        const account = await seedAccount({ testEnv });
        const session = await seedSession(account.accountId, { testEnv });
        if (svc === 'spp') await seedScoutApplication({ accountId: account.accountId, status: 'approved' });
        const kp = await generateReachKeyPair();

        const response = await worker.fetch(new Request(`https://services.solstone.app${serviceConfirmPath(svc)}`, {
          method: 'POST',
          headers: {
            Origin: 'https://services.solstone.app',
            Cookie: session.cookie,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            csrf: TEST_CSRF,
            nonce: VALID_NONCE,
            action: 'allow',
            instance: kp.instanceId,
            ...serviceFormExtra(svc),
          }),
        }), testEnv);

        expect(response.status).toBe(200);
      }
    });
  });

  // 3. A presented proof is checked in compatibility mode and in mandatory mode
  describe('presented proof checked in both modes', () => {
    const modes = [
      { name: 'compatibility', flag: undefined },
      { name: 'mandatory', flag: 'true' },
    ];
    const services = ['spl', 'spb', 'spp', 'sme'];

    for (const { name, flag } of modes) {
      for (const svc of services) {
        it(`${svc}: valid proof completes binding in ${name} mode`, async () => {
          const testEnv = makeTestEnv({ SERVICE_ENABLE_PROOF_REQUIRED: flag });
          installRelayFetchMock();
          const account = await seedAccount({ testEnv });
          const session = await seedSession(account.accountId, { testEnv });
          if (svc === 'spp') await seedScoutApplication({ accountId: account.accountId, status: 'approved' });
          const kp = await generateReachKeyPair();
          const assertion = await validProofFor({ service: svc, instanceId: kp.instanceId, privateKey: kp.privateKey });

          const response = await worker.fetch(new Request(`https://services.solstone.app${serviceConfirmPath(svc)}`, {
            method: 'POST',
            headers: {
              Origin: 'https://services.solstone.app',
              Cookie: session.cookie,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              csrf: TEST_CSRF,
              nonce: VALID_NONCE,
              action: 'allow',
              instance: kp.instanceId,
              assertion,
              ca_pubkey: kp.publicKeyPem,
              ...serviceFormExtra(svc),
            }),
          }), testEnv);

          expect(response.status).toBe(200);
          expect(await rowCount(`${svc}_bindings`)).toBe(1);
          expect(await rowCount('service_handoffs')).toBe(1);
        });

        it(`${svc}: invalid proof is 400 even when account already holds the row in ${name} mode`, async () => {
          const testEnv = makeTestEnv({ SERVICE_ENABLE_PROOF_REQUIRED: flag });
          installRelayFetchMock();
          const account = await seedAccount({ testEnv });
          const session = await seedSession(account.accountId, { testEnv });
          if (svc === 'spp') await seedScoutApplication({ accountId: account.accountId, status: 'approved' });
          const kp = await generateReachKeyPair();

          // Seed existing row
          const now = Date.now();
          if (svc === 'spl') {
            await workerEnv.DB.prepare('INSERT INTO spl_bindings (account_id, instance_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)').bind(account.accountId, kp.instanceId, now, now).run();
          } else if (svc === 'spb') {
            await workerEnv.DB.prepare('INSERT INTO spb_bindings (account_id, instance_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)').bind(account.accountId, kp.instanceId, now, now).run();
          } else if (svc === 'spp') {
            await workerEnv.DB.prepare('INSERT INTO spp_bindings (account_id, instance_id, created_at, last_seen_at, consent_acked_at, consent_disclosure_version) VALUES (?, ?, ?, ?, ?, ?)').bind(account.accountId, kp.instanceId, now, now, now, '1').run();
          } else {
            await workerEnv.DB.prepare('INSERT INTO sme_bindings (account_id, instance_id, created_at, last_seen_at, consent_acked_at, consent_disclosure_version) VALUES (?, ?, ?, ?, ?, ?)').bind(account.accountId, kp.instanceId, now, now, now, '1').run();
          }

          const response = await worker.fetch(new Request(`https://services.solstone.app${serviceConfirmPath(svc)}`, {
            method: 'POST',
            headers: {
              Origin: 'https://services.solstone.app',
              Cookie: session.cookie,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              csrf: TEST_CSRF,
              nonce: VALID_NONCE,
              action: 'allow',
              instance: kp.instanceId,
              assertion: 'invalid.jws.assertion',
              ca_pubkey: kp.publicKeyPem,
              ...serviceFormExtra(svc),
            }),
          }), testEnv);

          expect(response.status).toBe(400);
        });
      }
    }
  });

  // 4. Refusal reasons before any side effect
  describe('refusal reasons asserted by row counts and relay mock', () => {
    async function assertRefusal({ svc, form, testEnv }) {
      const relay = installRelayFetchMock();
      const before = await getRowCounts();

      const response = await worker.fetch(new Request(`https://services.solstone.app${serviceConfirmPath(svc)}`, {
        method: 'POST',
        headers: {
          Origin: 'https://services.solstone.app',
          Cookie: form.cookie,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(form.body),
      }), testEnv);

      expect(response.status).toBe(400);
      const after = await getRowCounts();
      expect(after).toEqual(before);
      expect(relay.calls).toEqual([]);
    }

    it('wrong nonce on SPL', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      const kp = await generateReachKeyPair();
      const assertion = await validProofFor({ service: 'spl', instanceId: kp.instanceId, privateKey: kp.privateKey, nonce: OTHER_NONCE });

      await assertRefusal({
        svc: 'spl',
        testEnv,
        form: {
          cookie: session.cookie,
          body: {
            csrf: TEST_CSRF,
            nonce: VALID_NONCE,
            action: 'allow',
            instance: kp.instanceId,
            assertion,
            ca_pubkey: kp.publicKeyPem,
          },
        },
      });
    });

    it('wrong service on SPB', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      const kp = await generateReachKeyPair();
      const assertion = await validProofFor({ service: 'spl', instanceId: kp.instanceId, privateKey: kp.privateKey });

      await assertRefusal({
        svc: 'spb',
        testEnv,
        form: {
          cookie: session.cookie,
          body: {
            csrf: TEST_CSRF,
            nonce: VALID_NONCE,
            action: 'allow',
            instance: kp.instanceId,
            assertion,
            ca_pubkey: kp.publicKeyPem,
          },
        },
      });
    });

    it('scope push.relay.enroll on SPP', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      await seedScoutApplication({ accountId: account.accountId, status: 'approved' });
      const kp = await generateReachKeyPair();
      const assertion = await validProofFor({
        service: 'spp',
        instanceId: kp.instanceId,
        privateKey: kp.privateKey,
        claims: { scope: 'push.relay.enroll' },
      });

      await assertRefusal({
        svc: 'spp',
        testEnv,
        form: {
          cookie: session.cookie,
          body: {
            csrf: TEST_CSRF,
            nonce: VALID_NONCE,
            action: 'allow',
            instance: kp.instanceId,
            assertion,
            ca_pubkey: kp.publicKeyPem,
            data_ack: 'yes',
          },
        },
      });
    });

    it('scope mcp.bridge.register on SME', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      const kp = await generateReachKeyPair();
      const assertion = await validProofFor({
        service: 'sme',
        instanceId: kp.instanceId,
        privateKey: kp.privateKey,
        claims: { scope: 'mcp.bridge.register' },
      });

      await assertRefusal({
        svc: 'sme',
        testEnv,
        form: {
          cookie: session.cookie,
          body: {
            csrf: TEST_CSRF,
            nonce: VALID_NONCE,
            action: 'allow',
            instance: kp.instanceId,
            assertion,
            ca_pubkey: kp.publicKeyPem,
            data_ack: 'yes',
          },
        },
      });
    });

    it('wrong derived instance on SPL', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      const kp1 = await generateReachKeyPair();
      const kp2 = await generateReachKeyPair();
      const assertion = await validProofFor({ service: 'spl', instanceId: kp1.instanceId, privateKey: kp1.privateKey });

      await assertRefusal({
        svc: 'spl',
        testEnv,
        form: {
          cookie: session.cookie,
          body: {
            csrf: TEST_CSRF,
            nonce: VALID_NONCE,
            action: 'allow',
            instance: kp2.instanceId,
            assertion,
            ca_pubkey: kp1.publicKeyPem,
          },
        },
      });
    });

    it('wrong signer on SPB', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      const kp1 = await generateReachKeyPair();
      const kp2 = await generateReachKeyPair();
      // Sign kp1's claims with kp2's private key
      const assertion = await mintHomeReachAssertion({
        instanceId: kp1.instanceId,
        privateKey: kp2.privateKey,
        claims: { scope: contract.scope, service: 'spb', nonce: VALID_NONCE },
      });

      await assertRefusal({
        svc: 'spb',
        testEnv,
        form: {
          cookie: session.cookie,
          body: {
            csrf: TEST_CSRF,
            nonce: VALID_NONCE,
            action: 'allow',
            instance: kp1.instanceId,
            assertion,
            ca_pubkey: kp1.publicKeyPem,
          },
        },
      });
    });

    it('bad signature on SPP', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      await seedScoutApplication({ accountId: account.accountId, status: 'approved' });
      const kp = await generateReachKeyPair();
      const valid = await validProofFor({ service: 'spp', instanceId: kp.instanceId, privateKey: kp.privateKey });
      const [h, p, s] = valid.split('.');
      const corrupted = `${h}.${p}.${s[0] === 'a' ? 'b' : 'a'}${s.slice(1)}`;

      await assertRefusal({
        svc: 'spp',
        testEnv,
        form: {
          cookie: session.cookie,
          body: {
            csrf: TEST_CSRF,
            nonce: VALID_NONCE,
            action: 'allow',
            instance: kp.instanceId,
            assertion: corrupted,
            ca_pubkey: kp.publicKeyPem,
            data_ack: 'yes',
          },
        },
      });
    });

    it('malformed JWS on SME', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      const kp = await generateReachKeyPair();

      await assertRefusal({
        svc: 'sme',
        testEnv,
        form: {
          cookie: session.cookie,
          body: {
            csrf: TEST_CSRF,
            nonce: VALID_NONCE,
            action: 'allow',
            instance: kp.instanceId,
            assertion: 'not.a.valid.jwt.string.at.all',
            ca_pubkey: kp.publicKeyPem,
            data_ack: 'yes',
          },
        },
      });
    });

    it('duplicated fields on SPL', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      const kp = await generateReachKeyPair();
      const assertion = await validProofFor({ service: 'spl', instanceId: kp.instanceId, privateKey: kp.privateKey });

      const body = new URLSearchParams({
        csrf: TEST_CSRF,
        nonce: VALID_NONCE,
        action: 'allow',
        instance: kp.instanceId,
        ca_pubkey: kp.publicKeyPem,
      });
      body.append('assertion', assertion);
      body.append('assertion', assertion);

      await assertRefusal({
        svc: 'spl',
        testEnv,
        form: { cookie: session.cookie, body },
      });
    });

    it('one field without the other on SPB', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      const kp = await generateReachKeyPair();
      const assertion = await validProofFor({ service: 'spb', instanceId: kp.instanceId, privateKey: kp.privateKey });

      await assertRefusal({
        svc: 'spb',
        testEnv,
        form: {
          cookie: session.cookie,
          body: {
            csrf: TEST_CSRF,
            nonce: VALID_NONCE,
            action: 'allow',
            instance: kp.instanceId,
            assertion,
          },
        },
      });
    });

    it('empty string on SPP', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      await seedScoutApplication({ accountId: account.accountId, status: 'approved' });
      const kp = await generateReachKeyPair();

      await assertRefusal({
        svc: 'spp',
        testEnv,
        form: {
          cookie: session.cookie,
          body: {
            csrf: TEST_CSRF,
            nonce: VALID_NONCE,
            action: 'allow',
            instance: kp.instanceId,
            assertion: '',
            ca_pubkey: kp.publicKeyPem,
            data_ack: 'yes',
          },
        },
      });
    });

    it('whitespace on SME', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      const kp = await generateReachKeyPair();

      await assertRefusal({
        svc: 'sme',
        testEnv,
        form: {
          cookie: session.cookie,
          body: {
            csrf: TEST_CSRF,
            nonce: VALID_NONCE,
            action: 'allow',
            instance: kp.instanceId,
            assertion: '   ',
            ca_pubkey: kp.publicKeyPem,
            data_ack: 'yes',
          },
        },
      });
    });

    it('noncanonical PEM on SPL', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      const kp = await generateReachKeyPair();
      const assertion = await validProofFor({ service: 'spl', instanceId: kp.instanceId, privateKey: kp.privateKey });

      await assertRefusal({
        svc: 'spl',
        testEnv,
        form: {
          cookie: session.cookie,
          body: {
            csrf: TEST_CSRF,
            nonce: VALID_NONCE,
            action: 'allow',
            instance: kp.instanceId,
            assertion,
            ca_pubkey: `${kp.publicKeyPem}\n`,
          },
        },
      });
    });

    it('expired proof on SPB', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      const kp = await generateReachKeyPair();
      const now = Math.floor(Date.now() / 1000);
      const assertion = await validProofFor({
        service: 'spb',
        instanceId: kp.instanceId,
        privateKey: kp.privateKey,
        claims: { exp: now - 10, iat: now - 100 },
      });

      await assertRefusal({
        svc: 'spb',
        testEnv,
        form: {
          cookie: session.cookie,
          body: {
            csrf: TEST_CSRF,
            nonce: VALID_NONCE,
            action: 'allow',
            instance: kp.instanceId,
            assertion,
            ca_pubkey: kp.publicKeyPem,
          },
        },
      });
    });

    it('exp - iat equal to lifetime_seconds accepted, one second over refused on SPP', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      await seedScoutApplication({ accountId: account.accountId, status: 'approved' });
      const kp = await generateReachKeyPair();
      const now = Math.floor(Date.now() / 1000);

      // Exactly equal to lifetime_seconds: accepted
      const acceptedAssertion = await validProofFor({
        service: 'spp',
        instanceId: kp.instanceId,
        privateKey: kp.privateKey,
        claims: { iat: now, exp: now + contract.lifetime_seconds },
      });

      const okResponse = await worker.fetch(new Request(`https://services.solstone.app${serviceConfirmPath('spp')}`, {
        method: 'POST',
        headers: {
          Origin: 'https://services.solstone.app',
          Cookie: session.cookie,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          csrf: TEST_CSRF,
          nonce: VALID_NONCE,
          action: 'allow',
          instance: kp.instanceId,
          assertion: acceptedAssertion,
          ca_pubkey: kp.publicKeyPem,
          data_ack: 'yes',
        }),
      }), testEnv);
      expect(okResponse.status).toBe(200);

      // One second over: refused
      const kp2 = await generateReachKeyPair();
      const overAssertion = await validProofFor({
        service: 'spp',
        instanceId: kp2.instanceId,
        privateKey: kp2.privateKey,
        claims: { iat: now, exp: now + contract.lifetime_seconds + 1 },
      });

      await assertRefusal({
        svc: 'spp',
        testEnv,
        form: {
          cookie: session.cookie,
          body: {
            csrf: TEST_CSRF,
            nonce: VALID_NONCE,
            action: 'allow',
            instance: kp2.instanceId,
            assertion: overAssertion,
            ca_pubkey: kp2.publicKeyPem,
            data_ack: 'yes',
          },
        },
      });
    });

    it('non-integer iat and non-finite exp on SME', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      const kp = await generateReachKeyPair();
      const now = Math.floor(Date.now() / 1000);

      const nonIntAssertion = await validProofFor({
        service: 'sme',
        instanceId: kp.instanceId,
        privateKey: kp.privateKey,
        claims: { iat: now + 0.5, exp: now + 300 },
      });

      await assertRefusal({
        svc: 'sme',
        testEnv,
        form: {
          cookie: session.cookie,
          body: {
            csrf: TEST_CSRF,
            nonce: VALID_NONCE,
            action: 'allow',
            instance: kp.instanceId,
            assertion: nonIntAssertion,
            ca_pubkey: kp.publicKeyPem,
            data_ack: 'yes',
          },
        },
      });

      // Non-finite exp with number token 1e309 (JSON.parse yields Infinity)
      const encoder = new TextEncoder();
      const header = { alg: contract.alg, typ: contract.typ };
      const rawPayload = JSON.stringify({
        iss: `home:${kp.instanceId}`,
        aud: contract.aud,
        scope: contract.scope,
        instance_id: kp.instanceId,
        service: 'sme',
        nonce: VALID_NONCE,
        iat: now,
        exp: 123456789,
      }).replace('123456789', '1e309');

      const signingInput = `${base64UrlEncode(encoder.encode(JSON.stringify(header)))}.${base64UrlEncode(encoder.encode(rawPayload))}`;
      const sig = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        kp.privateKey,
        encoder.encode(signingInput)
      );
      const nonFiniteAssertion = `${signingInput}.${base64UrlEncode(new Uint8Array(sig))}`;

      await assertRefusal({
        svc: 'sme',
        testEnv,
        form: {
          cookie: session.cookie,
          body: {
            csrf: TEST_CSRF,
            nonce: VALID_NONCE,
            action: 'allow',
            instance: kp.instanceId,
            assertion: nonFiniteAssertion,
            ca_pubkey: kp.publicKeyPem,
            data_ack: 'yes',
          },
        },
      });
    });

    it('consent GET with a bad proof renders 200 and writes nothing', async () => {
      for (const svc of ['spl', 'spb', 'spp', 'sme']) {
        const testEnv = makeTestEnv({ SERVICE_ENABLE_PROOF_REQUIRED: 'true' });
        const account = await seedAccount({ testEnv });
        const session = await seedSession(account.accountId, { testEnv });
        if (svc === 'spp') await seedScoutApplication({ accountId: account.accountId, status: 'approved' });
        const kp = await generateReachKeyPair();
        const before = await getRowCounts();

        const response = await worker.fetch(new Request(`https://services.solstone.app${servicePath(svc)}?nonce=${VALID_NONCE}&instance=${kp.instanceId}&assertion=bad.assertion&ca_pubkey=${encodeURIComponent(kp.publicKeyPem)}`, {
          headers: { Cookie: session.cookie },
        }), testEnv);

        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
        const after = await getRowCounts();
        expect(after).toEqual(before);
      }
    });
  });

  // 5. SPP non-scout GET and POST with an invalid proof
  describe('SPP non-scout GET and POST with proof', () => {
    it('non-scout with invalid proof is 400 with no handoff and no audit', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      const kp = await generateReachKeyPair();

      // GET
      const getRes = await worker.fetch(new Request(`https://services.solstone.app/enable/spp?nonce=${VALID_NONCE}&instance=${kp.instanceId}&assertion=bad&ca_pubkey=${encodeURIComponent(kp.publicKeyPem)}`, {
        headers: { Cookie: session.cookie },
      }), testEnv);
      expect(getRes.status).toBe(400);
      expect(await rowCount('service_handoffs')).toBe(0);
      expect(await rowCount('spp_mint_audit')).toBe(0);

      // POST
      const postRes = await worker.fetch(new Request('https://services.solstone.app/enable/spp/confirm', {
        method: 'POST',
        headers: {
          Origin: 'https://services.solstone.app',
          Cookie: session.cookie,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          csrf: TEST_CSRF,
          nonce: VALID_NONCE,
          action: 'allow',
          instance: kp.instanceId,
          assertion: 'bad',
          ca_pubkey: kp.publicKeyPem,
          data_ack: 'yes',
        }),
      }), testEnv);
      expect(postRes.status).toBe(400);
      expect(await rowCount('service_handoffs')).toBe(0);
      expect(await rowCount('spp_mint_audit')).toBe(0);
    });

    it('valid proof produces early_access refusal page for non-scout', async () => {
      const testEnv = makeTestEnv();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      const kp = await generateReachKeyPair();
      const assertion = await validProofFor({ service: 'spp', instanceId: kp.instanceId, privateKey: kp.privateKey });

      const res = await worker.fetch(new Request('https://services.solstone.app/enable/spp/confirm', {
        method: 'POST',
        headers: {
          Origin: 'https://services.solstone.app',
          Cookie: session.cookie,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          csrf: TEST_CSRF,
          nonce: VALID_NONCE,
          action: 'allow',
          instance: kp.instanceId,
          assertion,
          ca_pubkey: kp.publicKeyPem,
          data_ack: 'yes',
        }),
      }), testEnv);

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('scout approval required');
      expect(await rowCount('service_handoffs')).toBe(1);
      expect(await rowCount('spp_mint_audit')).toBe(1);
    });

    it('mandatory mode without proof and no own row is 400 before handoff', async () => {
      const testEnv = makeTestEnv({ SERVICE_ENABLE_PROOF_REQUIRED: 'true' });
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      const kp = await generateReachKeyPair();

      // GET
      const getRes = await worker.fetch(new Request(`https://services.solstone.app/enable/spp?nonce=${VALID_NONCE}&instance=${kp.instanceId}`, {
        headers: { Cookie: session.cookie },
      }), testEnv);
      expect(getRes.status).toBe(400);
      expect(await rowCount('service_handoffs')).toBe(0);

      // POST
      const postRes = await worker.fetch(new Request('https://services.solstone.app/enable/spp/confirm', {
        method: 'POST',
        headers: {
          Origin: 'https://services.solstone.app',
          Cookie: session.cookie,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          csrf: TEST_CSRF,
          nonce: VALID_NONCE,
          action: 'allow',
          instance: kp.instanceId,
          data_ack: 'yes',
        }),
      }), testEnv);
      expect(postRes.status).toBe(400);
      expect(await rowCount('service_handoffs')).toBe(0);
    });

    it('mandatory mode without proof but with own row produces early access', async () => {
      const testEnv = makeTestEnv({ SERVICE_ENABLE_PROOF_REQUIRED: 'true' });
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      const kp = await generateReachKeyPair();
      const now = Date.now();
      await workerEnv.DB.prepare('INSERT INTO spp_bindings (account_id, instance_id, created_at, last_seen_at, consent_acked_at, consent_disclosure_version) VALUES (?, ?, ?, ?, ?, ?)').bind(account.accountId, kp.instanceId, now, now, now, '1').run();

      const res = await worker.fetch(new Request(`https://services.solstone.app/enable/spp?nonce=${VALID_NONCE}&instance=${kp.instanceId}`, {
        headers: { Cookie: session.cookie },
      }), testEnv);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('scout approval required');
      expect(await rowCount('service_handoffs')).toBe(1);
    });

    it('signed-in non-scout GET /enable/spp with valid nonce, no instance, no proof: 400 in mandatory, early_access in compatibility', async () => {
      // Mandatory mode: returns 400 and does not write handoff or audit
      await resetDb();
      const mandatoryEnv = makeTestEnv({ SERVICE_ENABLE_PROOF_REQUIRED: 'true' });
      const account1 = await seedAccount({ testEnv: mandatoryEnv });
      const session1 = await seedSession(account1.accountId, { testEnv: mandatoryEnv });

      const resMandatory = await worker.fetch(new Request(`https://services.solstone.app/enable/spp?nonce=${VALID_NONCE}`, {
        headers: { Cookie: session1.cookie },
      }), mandatoryEnv);
      expect(resMandatory.status).toBe(400);
      expect(await rowCount('service_handoffs')).toBe(0);
      expect(await rowCount('spp_mint_audit')).toBe(0);

      // Compatibility mode: writes early_access handoff
      await resetDb();
      const compatEnv = makeTestEnv();
      const account2 = await seedAccount({ testEnv: compatEnv });
      const session2 = await seedSession(account2.accountId, { testEnv: compatEnv });

      const resCompat = await worker.fetch(new Request(`https://services.solstone.app/enable/spp?nonce=${VALID_NONCE}`, {
        headers: { Cookie: session2.cookie },
      }), compatEnv);
      expect(resCompat.status).toBe(200);
      const textCompat = await resCompat.text();
      expect(textCompat).toContain('scout approval required');
      expect(await rowCount('service_handoffs')).toBe(1);
    });
  });

  // 6. SPL with no usable instance and no proof
  describe('SPL with no usable instance', () => {
    it('no instance and no proof succeeds in both flag modes without creating binding', async () => {
      for (const flag of [undefined, 'true']) {
        await resetDb();
        const testEnv = makeTestEnv({ SERVICE_ENABLE_PROOF_REQUIRED: flag });
        installRelayFetchMock();
        const account = await seedAccount({ testEnv });
        const session = await seedSession(account.accountId, { testEnv });

        const res = await worker.fetch(new Request('https://services.solstone.app/enable/spl/confirm', {
          method: 'POST',
          headers: {
            Origin: 'https://services.solstone.app',
            Cookie: session.cookie,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            csrf: TEST_CSRF,
            nonce: VALID_NONCE,
            action: 'allow',
          }),
        }), testEnv);

        expect(res.status).toBe(200);
        expect(await rowCount('spl_bindings')).toBe(0);
        expect(await rowCount('service_handoffs')).toBe(1);
      }
    });

    it('no usable instance and supplied proof is 400 in both modes', async () => {
      for (const flag of [undefined, 'true']) {
        await resetDb();
        const testEnv = makeTestEnv({ SERVICE_ENABLE_PROOF_REQUIRED: flag });
        const relay = installRelayFetchMock();
        const account = await seedAccount({ testEnv });
        const session = await seedSession(account.accountId, { testEnv });
        const kp = await generateReachKeyPair();

        const res = await worker.fetch(new Request('https://services.solstone.app/enable/spl/confirm', {
          method: 'POST',
          headers: {
            Origin: 'https://services.solstone.app',
            Cookie: session.cookie,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            csrf: TEST_CSRF,
            nonce: VALID_NONCE,
            action: 'allow',
            assertion: 'some-assertion',
            ca_pubkey: kp.publicKeyPem,
          }),
        }), testEnv);

        expect(res.status).toBe(400);
        expect(await rowCount('spl_bindings')).toBe(0);
        expect(await rowCount('service_handoffs')).toBe(0);
        expect(relay.calls).toEqual([]);
      }
    });
  });

  // 7. Mandatory re-consent
  describe('mandatory re-consent', () => {
    it.each(['spl', 'spb', 'spp', 'sme'])('%s: existing row in own table allows proof-free re-consent', async (svc) => {
      const testEnv = makeTestEnv({ SERVICE_ENABLE_PROOF_REQUIRED: 'true' });
      installRelayFetchMock();
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      if (svc === 'spp') await seedScoutApplication({ accountId: account.accountId, status: 'approved' });
      const kp = await generateReachKeyPair();

      const now = 1000;
      if (svc === 'spl') {
        await workerEnv.DB.prepare('INSERT INTO spl_bindings (account_id, instance_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)').bind(account.accountId, kp.instanceId, now, now).run();
      } else if (svc === 'spb') {
        await workerEnv.DB.prepare('INSERT INTO spb_bindings (account_id, instance_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)').bind(account.accountId, kp.instanceId, now, now).run();
      } else if (svc === 'spp') {
        await workerEnv.DB.prepare('INSERT INTO spp_bindings (account_id, instance_id, created_at, last_seen_at, consent_acked_at, consent_disclosure_version) VALUES (?, ?, ?, ?, ?, ?)').bind(account.accountId, kp.instanceId, now, now, now, '1').run();
      } else {
        await workerEnv.DB.prepare('INSERT INTO sme_bindings (account_id, instance_id, created_at, last_seen_at, consent_acked_at, consent_disclosure_version) VALUES (?, ?, ?, ?, ?, ?)').bind(account.accountId, kp.instanceId, now, now, now, '1').run();
      }

      const res = await worker.fetch(new Request(`https://services.solstone.app${serviceConfirmPath(svc)}`, {
        method: 'POST',
        headers: {
          Origin: 'https://services.solstone.app',
          Cookie: session.cookie,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          csrf: TEST_CSRF,
          nonce: VALID_NONCE,
          action: 'allow',
          instance: kp.instanceId,
          ...serviceFormExtra(svc),
        }),
      }), testEnv);

      expect(res.status).toBe(200);
      expect(await rowCount(`${svc}_bindings`)).toBe(1);
    });

    it('row in a different service table does not qualify', async () => {
      const testEnv = makeTestEnv({ SERVICE_ENABLE_PROOF_REQUIRED: 'true' });
      const account = await seedAccount({ testEnv });
      const session = await seedSession(account.accountId, { testEnv });
      const kp = await generateReachKeyPair();

      // Seed row in spl_bindings only
      await workerEnv.DB.prepare('INSERT INTO spl_bindings (account_id, instance_id, created_at, last_seen_at) VALUES (?, ?, 1000, 1000)').bind(account.accountId, kp.instanceId).run();

      // Try enabling spb without proof
      const res = await worker.fetch(new Request('https://services.solstone.app/enable/backup/confirm', {
        method: 'POST',
        headers: {
          Origin: 'https://services.solstone.app',
          Cookie: session.cookie,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          csrf: TEST_CSRF,
          nonce: VALID_NONCE,
          action: 'allow',
          instance: kp.instanceId,
        }),
      }), testEnv);

      expect(res.status).toBe(400);
      expect(await rowCount('spb_bindings')).toBe(0);
    });
  });

  // 8. Other active account, valid proof -> 409
  it('other active account with valid proof returns 409 and writes nothing', async () => {
    const testEnv = makeTestEnv();
    const relay = installRelayFetchMock();
    const owner = await seedAccount({ email: 'owner@example.com', testEnv });
    const stranger = await seedAccount({ email: 'stranger@example.com', testEnv });
    const strangerSession = await seedSession(stranger.accountId, { testEnv });
    const kp = await generateReachKeyPair();

    // Owner holds spl_binding
    await workerEnv.DB.prepare('INSERT INTO spl_bindings (account_id, instance_id, created_at, last_seen_at) VALUES (?, ?, 1000, 1000)').bind(owner.accountId, kp.instanceId).run();

    // Stranger presents valid proof
    const assertion = await validProofFor({ service: 'spl', instanceId: kp.instanceId, privateKey: kp.privateKey });

    const before = await getRowCounts();
    const response = await worker.fetch(new Request('https://services.solstone.app/enable/spl/confirm', {
      method: 'POST',
      headers: {
        Origin: 'https://services.solstone.app',
        Cookie: strangerSession.cookie,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        csrf: TEST_CSRF,
        nonce: VALID_NONCE,
        action: 'allow',
        instance: kp.instanceId,
        assertion,
        ca_pubkey: kp.publicKeyPem,
      }),
    }), testEnv);

    expect(response.status).toBe(409);
    const after = await getRowCounts();
    expect(after).toEqual(before);
    expect(relay.calls).toEqual([]);
  });

  // 9. Restore
  describe('SPB restore', () => {
    it('proof-free restore in mandatory mode still rotates token and does not insert spb_bindings', async () => {
      const testEnv = makeTestEnv({ SERVICE_ENABLE_PROOF_REQUIRED: 'true' });
      const owner = await seedAccount({ testEnv });
      const session = await seedSession(owner.accountId, { testEnv });
      await seedEntitlement({ accountId: owner.accountId, service: 'spb_hosted', status: 'active' });
      const kp = await generateReachKeyPair();
      await seedSpbBinding({ accountId: owner.accountId, instanceId: kp.instanceId, createdAt: 1000, tokenHash: 'existing-hash' });

      installS3FetchMock(testEnv, {
        default: async () => new Response('<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>test</Key><LastModified>2026-01-01T00:00:00.000Z</LastModified><Size>100</Size></Contents></ListBucketResult>', { headers: { 'Content-Type': 'application/xml' } }),
      });

      const res = await worker.fetch(new Request('https://services.solstone.app/enable/backup/confirm', {
        method: 'POST',
        headers: {
          Origin: 'https://services.solstone.app',
          Cookie: session.cookie,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          csrf: TEST_CSRF,
          nonce: VALID_NONCE,
          intent: 'restore',
          selected_instance: kp.instanceId,
        }),
      }), testEnv);

      expect(res.status).toBe(200);
      expect(await rowCount('spb_bindings')).toBe(1); // not inserted a second row
      expect(await rowCount('spb_retired_tokens')).toBe(1);
    });

    it('any supplied proof field on restore GET and POST is 400', async () => {
      const testEnv = makeTestEnv();
      const owner = await seedAccount({ testEnv });
      const session = await seedSession(owner.accountId, { testEnv });
      const kp = await generateReachKeyPair();

      // GET with proof
      const getRes = await worker.fetch(new Request(`https://services.solstone.app/enable/backup?nonce=${VALID_NONCE}&intent=restore&assertion=abc&ca_pubkey=${encodeURIComponent(kp.publicKeyPem)}`, {
        headers: { Cookie: session.cookie },
      }), testEnv);
      expect(getRes.status).toBe(400);

      // POST with proof
      const postRes = await worker.fetch(new Request('https://services.solstone.app/enable/backup/confirm', {
        method: 'POST',
        headers: {
          Origin: 'https://services.solstone.app',
          Cookie: session.cookie,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          csrf: TEST_CSRF,
          nonce: VALID_NONCE,
          intent: 'restore',
          assertion: 'abc',
          ca_pubkey: kp.publicKeyPem,
        }),
      }), testEnv);
      expect(postRes.status).toBe(400);
    });

    it('signed-out restore GET with proof redirects to sign-in and returns with proof to 400', async () => {
      const testEnv = makeTestEnv();
      const kp = await generateReachKeyPair();
      const query = `?nonce=${VALID_NONCE}&intent=restore&assertion=abc&ca_pubkey=${encodeURIComponent(kp.publicKeyPem)}`;

      // Signed-out GET
      const redirectRes = await worker.fetch(new Request(`https://services.solstone.app/enable/backup${query}`), testEnv);
      expect(redirectRes.status).toBe(303);
      expect(redirectRes.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(redirectRes.headers.get('Cache-Control')).toBe('no-store');

      const loc = new URL(redirectRes.headers.get('Location'), 'https://services.solstone.app');
      const resume = await verifyEnableResume(loc.searchParams.get('next'), loc.searchParams.get('next_sig'), testEnv);
      expect(resume.queryString).toContain('intent=restore');
      expect(resume.queryString).toContain('assertion=abc');

      // Now with a session, visiting the resumed URL
      const owner = await seedAccount({ testEnv });
      const session = await seedSession(owner.accountId, { testEnv });
      const afterRes = await worker.fetch(new Request(`https://services.solstone.app/enable/backup${resume.queryString}`, {
        headers: { Cookie: session.cookie },
      }), testEnv);
      expect(afterRes.status).toBe(400);
    });
  });

  // 10. Round trip, all four services
  describe('round trip for all four services', () => {
    it.each(['spl', 'spb', 'spp', 'sme'])('%s: round trip from signed-out GET to POST success', async (svc) => {
      const testEnv = makeTestEnv({ SERVICE_ENABLE_PROOF_REQUIRED: 'true' });
      installRelayFetchMock();
      const kp = await generateReachKeyPair();
      const assertion = await validProofFor({ service: svc, instanceId: kp.instanceId, privateKey: kp.privateKey });

      // 1. Signed-out GET with valid proof
      const getUrl = `https://services.solstone.app${servicePath(svc)}?nonce=${VALID_NONCE}&instance=${kp.instanceId}&assertion=${encodeURIComponent(assertion)}&ca_pubkey=${encodeURIComponent(kp.publicKeyPem)}`;
      const signedOutRes = await worker.fetch(new Request(getUrl), testEnv);
      expect(signedOutRes.status).toBe(303);
      expect(signedOutRes.headers.get('Cache-Control')).toBe('no-store');
      expect(signedOutRes.headers.get('Referrer-Policy')).toBe('no-referrer');

      // Check proof-absent GET has default Referrer-Policy
      const proofAbsentRes = await worker.fetch(new Request(`https://services.solstone.app${servicePath(svc)}?nonce=${VALID_NONCE}&instance=${kp.instanceId}`), testEnv);
      expect(proofAbsentRes.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');

      // 2. Location from signed-out redirect
      const location = new URL(signedOutRes.headers.get('Location'), 'https://services.solstone.app');
      const next = location.searchParams.get('next');
      const nextSig = location.searchParams.get('next_sig');

      // 3. Authenticate with OTP verify
      const email = `user-${svc}@example.com`;
      const account = await seedAccount({ email, testEnv });
      if (svc === 'spp') await seedScoutApplication({ accountId: account.accountId, status: 'approved' });

      // Sign-in OTP verify
      const { code } = await seedOtp({ email });

      const verifyRes = await worker.fetch(new Request('https://services.solstone.app/signin/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          csrf: TEST_CSRF,
          email,
          code,
          next,
          next_sig: nextSig,
        }),
      }), testEnv);

      expect(verifyRes.status).toBe(303);
      expect(verifyRes.headers.get('Cache-Control')).toBe('no-store');
      expect(verifyRes.headers.get('Referrer-Policy')).toBe('no-referrer');
      const resumedTarget = verifyRes.headers.get('Location');
      expect(resumedTarget).toContain(`assertion=`);
      expect(resumedTarget).toContain(`ca_pubkey=`);

      const sessionCookie = verifyRes.headers.get('Set-Cookie').split(';')[0];

      // 4. Signed-in GET renders hidden fields
      const consentRes = await worker.fetch(new Request(`https://services.solstone.app${resumedTarget}`, {
        headers: { Cookie: sessionCookie },
      }), testEnv);
      expect(consentRes.status).toBe(200);
      expect(consentRes.headers.get('Referrer-Policy')).toBe('no-referrer');
      const consentHtml = await consentRes.text();

      // Read back hidden fields
      const assertionMatch = consentHtml.match(/<input type="hidden" name="assertion" value="([^"]*)">/);
      const caPubkeyMatch = consentHtml.match(/<input type="hidden" name="ca_pubkey" value="([^"]*)">/s);
      expect(assertionMatch).not.toBeNull();
      expect(caPubkeyMatch).not.toBeNull();
      const readAssertion = unescapeAttr(assertionMatch[1]);
      const readCaPubkey = unescapeAttr(caPubkeyMatch[1]);
      expect(readAssertion).toBe(assertion);
      expect(readCaPubkey).toBe(kp.publicKeyPem);

      // 5. POST them to confirm
      const confirmRes = await worker.fetch(new Request(`https://services.solstone.app${serviceConfirmPath(svc)}`, {
        method: 'POST',
        headers: {
          Origin: 'https://services.solstone.app',
          Cookie: sessionCookie,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          csrf: TEST_CSRF,
          nonce: VALID_NONCE,
          action: 'allow',
          instance: kp.instanceId,
          assertion: readAssertion,
          ca_pubkey: readCaPubkey,
          ...serviceFormExtra(svc),
        }),
      }), testEnv);

      expect(confirmRes.status).toBe(200);
      expect(await rowCount(`${svc}_bindings`)).toBe(1);
      expect(await rowCount('service_handoffs')).toBe(1);
    });
  });

  // 11. Passkey finish
  it('passkey finish redirects to proof-bearing resume URL', async () => {
    const testEnv = makeTestEnv();
    const kp = await generateReachKeyPair();
    const assertion = await validProofFor({ service: 'spl', instanceId: kp.instanceId, privateKey: kp.privateKey });
    const queryString = `?nonce=${VALID_NONCE}&instance=${kp.instanceId}&assertion=${encodeURIComponent(assertion)}&ca_pubkey=${encodeURIComponent(kp.publicKeyPem)}`;

    const { next, nextSig } = await signEnableResume('/enable/spl', queryString, testEnv);

    const account = await seedAccount({ testEnv });
    await seedCredential({
      accountId: account.accountId,
      credentialId: 'proof-cred-id',
      userHandle: 'proof-handle',
    });
    await seedPasskeyChallenge({ challenge: 'proof-auth-challenge', purpose: 'authenticate' });

    verifyAuthenticationResponse.mockResolvedValueOnce({
      verified: true,
      authenticationInfo: { newCounter: 1 },
    });
    const finishRes = await worker.fetch(new Request('https://services.solstone.app/passkey/auth/finish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://services.solstone.app',
      },
      body: JSON.stringify({
        response: authResponse('proof-auth-challenge', 'proof-cred-id', 'proof-handle'),
        next,
        next_sig: nextSig,
      }),
    }), testEnv);

    expect(finishRes.status).toBe(200);
    const body = await finishRes.json();
    expect(body.redirect).toContain('/enable/spl?');
    expect(body.redirect).toContain('assertion=');
    expect(body.redirect).toContain('ca_pubkey=');
  });

  // 12. HTML breakout on all four consent GETs
  it.each(['spl', 'spb', 'spp', 'sme'])('%s: HTML breakout characters are escaped and not echoed in error/done', async (svc) => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    if (svc === 'spp') await seedScoutApplication({ accountId: account.accountId, status: 'approved' });
    const kp = await generateReachKeyPair();

    const breakoutAssertion = 'test"foo<bar>baz&qux';
    const breakoutPubkey = '-----BEGIN PUBLIC KEY-----\n"<&>\n-----END PUBLIC KEY-----';

    const res = await worker.fetch(new Request(`https://services.solstone.app${servicePath(svc)}?nonce=${VALID_NONCE}&instance=${kp.instanceId}&assertion=${encodeURIComponent(breakoutAssertion)}&ca_pubkey=${encodeURIComponent(breakoutPubkey)}`, {
      headers: { Cookie: session.cookie },
    }), testEnv);

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('&quot;foo&lt;bar&gt;baz&amp;qux');
    expect(html).not.toContain(breakoutAssertion);

    // Error body test
    const errRes = await worker.fetch(new Request(`https://services.solstone.app${serviceConfirmPath(svc)}`, {
      method: 'POST',
      headers: {
        Origin: 'https://services.solstone.app',
        Cookie: session.cookie,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        csrf: TEST_CSRF,
        nonce: VALID_NONCE,
        action: 'allow',
        instance: kp.instanceId,
        assertion: breakoutAssertion,
        ca_pubkey: breakoutPubkey,
        ...serviceFormExtra(svc),
      }),
    }), testEnv);

    expect(errRes.status).toBe(400);
    const errHtml = await errRes.text();
    expect(errHtml).not.toContain(breakoutAssertion);
    expect(errHtml).not.toContain(breakoutPubkey);
    expect(errHtml).not.toContain(VALID_NONCE);
  });

  // 13. Proof valid at GET and expired at POST writes nothing
  it.each(['spl', 'spb', 'spp', 'sme'])('%s: proof valid at GET and expired at POST writes nothing', async (svc) => {
    const testEnv = makeTestEnv();
    installRelayFetchMock();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    if (svc === 'spp') await seedScoutApplication({ accountId: account.accountId, status: 'approved' });
    const kp = await generateReachKeyPair();

    const now = Math.floor(Date.now() / 1000);
    // exp 1 second ahead
    const assertion = await validProofFor({
      service: svc,
      instanceId: kp.instanceId,
      privateKey: kp.privateKey,
      claims: { iat: now - 10, exp: now + 1 },
    });

    // Render GET
    const getRes = await worker.fetch(new Request(`https://services.solstone.app${servicePath(svc)}?nonce=${VALID_NONCE}&instance=${kp.instanceId}&assertion=${encodeURIComponent(assertion)}&ca_pubkey=${encodeURIComponent(kp.publicKeyPem)}`, {
      headers: { Cookie: session.cookie },
    }), testEnv);
    expect(getRes.status).toBe(200);

    // Wait until expired
    await new Promise((r) => setTimeout(r, 1200));

    const before = await getRowCounts();
    const postRes = await worker.fetch(new Request(`https://services.solstone.app${serviceConfirmPath(svc)}`, {
      method: 'POST',
      headers: {
        Origin: 'https://services.solstone.app',
        Cookie: session.cookie,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        csrf: TEST_CSRF,
        nonce: VALID_NONCE,
        action: 'allow',
        instance: kp.instanceId,
        assertion,
        ca_pubkey: kp.publicKeyPem,
        ...serviceFormExtra(svc),
      }),
    }), testEnv);

    expect(postRes.status).toBe(400);
    const after = await getRowCounts();
    expect(after).toEqual(before);
  });

  // 14. Console spy secrets check
  it('console spy asserts no secrets during success and refusal', async () => {
    const spy = installConsoleSpy();
    const testEnv = makeTestEnv();
    installRelayFetchMock();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const kp = await generateReachKeyPair();
    const pkcs8 = await exportPKCS8(kp.privateKey);
    const assertion = await validProofFor({ service: 'spl', instanceId: kp.instanceId, privateKey: kp.privateKey });

    // Success call
    await worker.fetch(new Request('https://services.solstone.app/enable/spl/confirm', {
      method: 'POST',
      headers: {
        Origin: 'https://services.solstone.app',
        Cookie: session.cookie,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        csrf: TEST_CSRF,
        nonce: VALID_NONCE,
        action: 'allow',
        instance: kp.instanceId,
        assertion,
        ca_pubkey: kp.publicKeyPem,
      }),
    }), testEnv);

    // Refusal call
    await worker.fetch(new Request('https://services.solstone.app/enable/spl/confirm', {
      method: 'POST',
      headers: {
        Origin: 'https://services.solstone.app',
        Cookie: session.cookie,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        csrf: TEST_CSRF,
        nonce: OTHER_NONCE,
        action: 'allow',
        instance: kp.instanceId,
        assertion: 'corrupted',
        ca_pubkey: kp.publicKeyPem,
      }),
    }), testEnv);

    spy.assertNoSecrets([assertion, kp.publicKeyPem, VALID_NONCE, pkcs8]);
    spy.restore();
  });

  // 15. Scope confusion with reach routes
  it('services.enable assertion rejected by reach relay-token and mcp bridge routes', async () => {
    const testEnv = makeTestEnv();
    const kp = await generateReachKeyPair();
    const assertion = await validProofFor({ service: 'spl', instanceId: kp.instanceId, privateKey: kp.privateKey });

    // Reach relay token route
    const reachRes = await worker.fetch(new Request('https://services.solstone.app/reach/push/relay-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instance_id: kp.instanceId,
        assertion,
        ca_pubkey: kp.publicKeyPem,
      }),
    }), testEnv);

    expect(reachRes.status).toBe(401);
    expect(await reachRes.json()).toEqual({ error: 'invalid_token' });

    // MCP bridge route
    const { publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    const cnf_jwk = await exportJWK(publicKey);
    const mcpRes = await worker.fetch(new Request('https://services.solstone.app/reach/mcp/bridge-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instance_id: kp.instanceId,
        assertion,
        ca_pubkey: kp.publicKeyPem,
        cnf_jwk,
      }),
    }), testEnv);

    expect(mcpRes.status).toBe(401);
    expect(await mcpRes.json()).toEqual({ error: 'invalid_token' });
  });

  // 16. Duplicate and empty supplied fields survive signed-out resume
  it('duplicate and empty supplied fields survive signed-out resume and are not treated as missing proof in mandatory mode', async () => {
    const testEnv = makeTestEnv({ SERVICE_ENABLE_PROOF_REQUIRED: 'true' });
    const kp = await generateReachKeyPair();

    const query = `?nonce=${VALID_NONCE}&instance=${kp.instanceId}&assertion=&assertion=duplicate&ca_pubkey=`;
    const res = await worker.fetch(new Request(`https://services.solstone.app/enable/spl${query}`), testEnv);
    expect(res.status).toBe(303);

    const location = new URL(res.headers.get('Location'), 'https://services.solstone.app');
    const resume = await verifyEnableResume(location.searchParams.get('next'), location.searchParams.get('next_sig'), testEnv);
    expect(resume).not.toBeNull();
    expect(resume.queryString).toContain('assertion=');
    expect(resume.queryString).toContain('assertion=duplicate');
    expect(resume.queryString).toContain('ca_pubkey=');

    // On next GET with session, it is still classified as supplied, not absent
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });

    // POSTing these invalid/empty fields in mandatory mode must return 400, not treat them as missing proof
    const postRes = await worker.fetch(new Request('https://services.solstone.app/enable/spl/confirm', {
      method: 'POST',
      headers: {
        Origin: 'https://services.solstone.app',
        Cookie: session.cookie,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        csrf: TEST_CSRF,
        nonce: VALID_NONCE,
        action: 'allow',
        instance: kp.instanceId,
        assertion: '',
        ca_pubkey: '',
      }),
    }), testEnv);

    expect(postRes.status).toBe(400);
    expect(await rowCount('spl_bindings')).toBe(0);
  });
});
