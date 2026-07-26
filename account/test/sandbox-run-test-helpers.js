import { env as workerEnv } from 'cloudflare:test';
import { makeTestEnv, seedAccount, seedActiveGeminiKey, seedScoutApplication } from './helpers.js';
import {
  orderedObject,
  SANDBOX_CONTRACT_VERSION,
  SANDBOX_CREATE_REQUEST_KEYS,
  SANDBOX_PROFILE,
} from '../src/sandbox-run-contract.js';

export const SANDBOX_NOW = 1_700_000_000_000;
export const SANDBOX_RUN_ID = 'aaaaaaaa-1111-1111-1111-111111111111';
export const SANDBOX_RUN_ID_B = 'bbbbbbbb-2222-2222-2222-222222222222';
export const SANDBOX_INSTANCE_ID = '11111111-1111-1111-1111-111111111111';
export const SANDBOX_INSTANCE_ID_B = '22222222-2222-2222-2222-222222222222';
export const STANDING_GEMINI_KEY = 'sandbox-standing-gemini-key-material';

export function sandboxRequest(path, token, { method = 'GET', body } = {}) {
  const headers = {};
  if (token) headers['Cf-Access-Jwt-Assertion'] = token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new Request(`https://services.solstone.app${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

export function validSandboxInput({
  runId = SANDBOX_RUN_ID,
  instanceId = SANDBOX_INSTANCE_ID,
} = {}) {
  return orderedObject(SANDBOX_CREATE_REQUEST_KEYS, [
    SANDBOX_CONTRACT_VERSION,
    instanceId,
    SANDBOX_PROFILE,
    runId,
  ]);
}

export function makeRelayBinding({ onCall } = {}) {
  const calls = [];
  return {
    calls,
    binding: {
      async fetch(input, init = {}) {
        const url = new URL(typeof input === 'string' ? input : input.url);
        const method = (init.method || 'GET').toUpperCase();
        const bodyText = typeof init.body === 'string' ? init.body : '';
        const call = { method, url, bodyText, init };
        calls.push(call);
        const override = await onCall?.(call);
        if (override) return override;
        if (method === 'POST' && url.pathname === '/admin/entitlement') {
          return jsonResponse({ ok: true });
        }
        if (method === 'DELETE' && url.pathname.startsWith('/admin/instances/')) {
          return jsonResponse(retiredRelayBody());
        }
        return new Response('not found', { status: 404 });
      },
    },
  };
}

export async function seedSandboxBaseline({
  relay = makeRelayBinding(),
  email = 'sandbox-account@example.com',
  keyMaterial = STANDING_GEMINI_KEY,
  nowMs = SANDBOX_NOW,
  envOverrides = {},
} = {}) {
  const baseEnv = makeTestEnv(envOverrides);
  const account = await seedAccount({ email, nowMs, testEnv: baseEnv });
  await seedScoutApplication({
    accountId: account.accountId,
    status: 'approved',
    approved_at: nowMs,
    createdAt: nowMs,
  });
  const key = await seedActiveGeminiKey({
    accountId: account.accountId,
    keyMaterial,
    createdAt: nowMs,
    testEnv: baseEnv,
  });
  return {
    account,
    key,
    relay,
    testEnv: {
      ...baseEnv,
      ...envOverrides,
      SANDBOX_ACCOUNT_ID: account.accountId,
      RELAY: relay.binding,
    },
  };
}

export async function sandboxRunRow(runId = SANDBOX_RUN_ID) {
  return workerEnv.DB.prepare('SELECT * FROM sandbox_runs WHERE run_id = ?').bind(runId).first();
}

export function retiredRelayBody() {
  return {
    state: 'retired',
    entry_denial_verified: true,
    sockets_closed: true,
    devices_revoked: true,
    entitlement_cleared: true,
    pending_grants_cleared: true,
    tombstone_verified: true,
  };
}

export function emptyS3Response(input) {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.searchParams.has('uploads')) {
    return new Response(
      '<ListMultipartUploadsResult><IsTruncated>false</IsTruncated></ListMultipartUploadsResult>',
      { headers: { 'Content-Type': 'application/xml' } }
    );
  }
  if (url.searchParams.get('list-type') === '2') {
    return new Response(
      '<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>',
      { headers: { 'Content-Type': 'application/xml' } }
    );
  }
  return null;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
