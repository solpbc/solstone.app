import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { hashWithPepper } from '../src/crypto.js';
import { prefixFor } from '../src/spb-broker.js';
import { runSpbLapseSweep } from '../src/spb-sweep.js';
import {
  fetchWithCtx,
  installS3FetchMock,
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedSpbBinding,
} from './helpers.js';
import { installJwksStubWith, mintToken } from './jwks-helper.js';

const HUB_URL = 'https://extro.solpbc.org/hooks/security';
const BROKER_TOKEN = 'hub-redaction-broker-token';
const INSTANCE_ID = '11111111-1111-1111-1111-111111111111';
const SWEEP_NOW = 1_700_000_000_000;
const OLD_LAPSE = SWEEP_NOW - 31 * 24 * 60 * 60 * 1000;

describe('hub security-event redaction', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('redacts identifiers from an impersonate_denied event', async () => {
    const calls = [];
    await installAdminHubStub(calls);
    const account = await seedAccount({ email: 'denied-owner@example.com' });
    const testEnv = makeTestEnv({
      HUB_WEBHOOK_URL: HUB_URL,
      HUB_WEBHOOK_SECRET: 'hub-secret',
    });
    const operator = 'jer@solpbc.org';
    const token = await mintToken({ payload: { email: operator } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { response } = await fetchWithCtx(
      worker,
      adminRequest('/admin/impersonate', token, { account_id: account.accountId }),
      testEnv
    );

    expect(response.status).toBe(404);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      type: 'impersonate_denied',
      tier: 'T4',
      reason: 'disabled',
    });
    expectOpaqueRefs(calls[0], ['operator_ref', 'account_ref']);
    assertRedacted(calls[0], [account.accountId, 'denied-owner@example.com', operator]);
  });

  it('redacts identifiers from an impersonate event', async () => {
    const calls = [];
    await installAdminHubStub(calls);
    const account = await seedAccount({ email: 'minted-owner@example.com' });
    const testEnv = makeTestEnv({
      IMPERSONATE_ALLOWED: account.accountId,
      HUB_WEBHOOK_URL: HUB_URL,
      HUB_WEBHOOK_SECRET: 'hub-secret',
    });
    const operator = 'jer@solpbc.org';
    const token = await mintToken({ payload: { email: operator } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { response } = await fetchWithCtx(
      worker,
      adminRequest('/admin/impersonate', token, { account_id: account.accountId }),
      testEnv
    );
    const body = await response.json();
    const sessionIdHash = await hashWithPepper(body.session_token, testEnv);

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ type: 'impersonate', tier: 'T4' });
    expectOpaqueRefs(calls[0], ['operator_ref', 'account_ref', 'session_ref']);
    assertRedacted(calls[0], [
      account.accountId,
      'minted-owner@example.com',
      operator,
      body.session_token,
      sessionIdHash,
    ]);
  });

  it('redacts identifiers from a post-identity broker refusal event', async () => {
    const calls = [];
    installBrokerHubStub(calls);
    const testEnv = makeTestEnv({
      HUB_WEBHOOK_URL: HUB_URL,
      HUB_WEBHOOK_SECRET: 'hub-secret',
    });
    const account = await seedAccount({ email: 'broker-owner@example.com', testEnv });
    await seedEntitlement({ accountId: account.accountId, service: 'spb_hosted', status: 'active' });
    const tokenHash = await hashWithPepper(BROKER_TOKEN, testEnv);
    await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_ID, tokenHash });
    const prefix = prefixFor(account.accountId, INSTANCE_ID);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { response } = await fetchWithCtx(worker, new Request('https://services.solstone.app/backup/credentials', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${BROKER_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scope: 'not-a-real-scope' }),
    }), testEnv);

    expect(response.status).toBe(400);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      type: 'spb_mint_refused',
      tier: 'T4',
      outcome: 'refused_scope',
      identified: true,
    });
    expectOpaqueRefs(calls[0], ['account_ref', 'instance_ref']);
    assertRedacted(calls[0], [account.accountId, INSTANCE_ID, 'broker-owner@example.com', prefix]);
  });

  it('emits only aggregate counts for an SPB lapse sweep event', async () => {
    const calls = [];
    const testEnv = makeTestEnv({
      HUB_WEBHOOK_URL: HUB_URL,
      HUB_WEBHOOK_SECRET: 'hub-secret',
    });
    const account = await seedAccount({ email: 'sweep-owner@example.com', testEnv });
    await seedSpbBinding({ accountId: account.accountId, instanceId: INSTANCE_ID, lapsedAt: OLD_LAPSE });
    const prefix = prefixFor(account.accountId, INSTANCE_ID);
    const { fetchMock } = installS3FetchMock(testEnv, {
      default: async ({ method, url }) => {
        if (method === 'GET' && url.searchParams.get('list-type') === '2') {
          return xmlResponse('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>');
        }
        if (method === 'GET' && url.searchParams.has('uploads')) {
          return xmlResponse('<ListMultipartUploadsResult><IsTruncated>false</IsTruncated></ListMultipartUploadsResult>');
        }
        throw new Error(`unexpected sweep request: ${method} ${url.href}`);
      },
    });
    vi.stubGlobal('fetch', vi.fn(async (input, init = {}) => {
      const href = typeof input === 'string' ? input : input.url;
      if (href === HUB_URL) {
        calls.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return fetchMock(input, init);
    }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const ctx = createExecutionContext();
    await runSpbLapseSweep(testEnv, ctx, SWEEP_NOW);
    await waitOnExecutionContext(ctx);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      type: 'spb_lapse_sweep',
      tier: 'T4',
      bindings_swept: 1,
      objects_deleted: 0,
      multipart_aborted: 0,
    });
    assertRedacted(calls[0], [account.accountId, INSTANCE_ID, 'sweep-owner@example.com', prefix]);
    expect(Object.keys(calls[0]).filter((key) => key.endsWith('_ref'))).toEqual([]);
  });
});

async function installAdminHubStub(calls) {
  return installJwksStubWith(async (input, init = {}) => {
    const href = typeof input === 'string' ? input : input.url;
    if (href !== HUB_URL) return null;
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
}

function installBrokerHubStub(calls) {
  vi.stubGlobal('fetch', vi.fn(async (input, init = {}) => {
    const href = typeof input === 'string' ? input : input.url;
    if (href !== HUB_URL) throw new Error(`unexpected broker fetch: ${href}`);
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }));
}

function adminRequest(path, token, body) {
  return new Request(`https://services.solstone.app${path}`, {
    method: 'POST',
    headers: {
      'Cf-Access-Jwt-Assertion': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function expectOpaqueRefs(payload, fields) {
  for (const field of fields) expect(payload[field]).toMatch(/^[A-Za-z0-9_-]{20,}$/);
}

function assertRedacted(payload, rawValues) {
  const text = JSON.stringify(payload);
  for (const value of rawValues) expect(text).not.toContain(value);
  for (const field of ['account_id', 'instance_id', 'session_id_hash', 'operator', 'email', 'prefix', 'device_label']) {
    expect(payload).not.toHaveProperty(field);
  }
}

function xmlResponse(body) {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/xml' },
  });
}
