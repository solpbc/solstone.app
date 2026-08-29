import { env as workerEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import fixture from '../proto/owner-purge-v1.json';
import {
  canonicalJson,
  encryptEmail,
  framedHmacSha256Base64Url,
  sha256Base64Url,
} from '../src/crypto.js';
import { advanceDeletionServiceOperation } from '../src/deletion-contract.js';
import { makeTestEnv, resetDb } from './helpers.js';

const REQUEST_MAX_LIFETIME_MS = fixture.time_bounds_ms.request_max_lifetime;
const ATTESTATION_MAX_LIFETIME_MS = fixture.time_bounds_ms.attestation_max_lifetime;
const SERVER_ONLY_REJECTION_VECTORS = new Set([
  // These vectors exercise target-service validation before lookup/mutation; the
  // account never constructs those invalid inputs, so relay/support own them.
  'request_future_issued_is_refused_before_lookup',
  'request_overlong_is_refused_before_lookup',
  'attestation_future_or_overlong_is_refused_without_state_change',
  'support_collision_and_missing_association',
]);

describe('deletion purge contract v1', () => {
  beforeEach(resetDb);

  it('reproduces the fixture canonical request bytes and request integrity', async () => {
    const transcript = fixture.wire_transcripts[0];
    const unsigned = withoutIntegrity(transcript.request);
    const canonical = canonicalJson(unsigned);
    expect(canonical).toBe(transcript.request_canonical_without_integrity);
    await expect(framedHmacSha256Base64Url(
      keyFor(transcript.request.key_version),
      `solpbc-owner-purge-v1:${transcript.service}:request`,
      canonical,
    )).resolves.toBe(transcript.request.integrity);
  });

  it('reproduces every fixture request/attestation digest and the v2 UTF-8 frame', async () => {
    for (const transcript of fixture.wire_transcripts) {
      expect(canonicalJson(withoutIntegrity(transcript.request))).toBe(transcript.request_canonical_without_integrity);
      expect(canonicalJson(withoutIntegrity(transcript.attestation))).toBe(transcript.attestation_canonical_without_integrity);
      await expect(sha256Base64Url(canonicalJson({
        version: 1,
        key_version: transcript.request.key_version,
        service: transcript.service,
        association_snapshot: transcript.request.association_snapshot,
      }))).resolves.toBe(transcript.request.request_digest);
      await expect(framedHmacSha256Base64Url(
        keyFor(transcript.request.key_version),
        `solpbc-owner-purge-v1:${transcript.service}:request`,
        transcript.request_canonical_without_integrity,
      )).resolves.toBe(transcript.request.integrity);
      await expect(framedHmacSha256Base64Url(
        keyFor(transcript.attestation.key_version),
        `solpbc-owner-purge-v1:${transcript.service}:confirm`,
        transcript.attestation_canonical_without_integrity,
      )).resolves.toBe(transcript.attestation.integrity);
    }
    const utf8 = fixture.wire_transcripts.find((entry) => entry.name === 'support_current_key_v2_utf8_snapshot');
    expect(frameHex(
      'solpbc-owner-purge-v1:support:request',
      utf8.request_canonical_without_integrity,
    )).toBe(utf8.request_frame_hex);
  });

  it.each(fixture.wire_transcripts)('$name reaches confirmed with fixture-exact protocol bytes', async (transcript) => {
    const loseFirstConfirmation = transcript.expected_confirm_retry === 'confirmed';
    const service = transcriptService(transcript, { loseFirstConfirmation });
    const env = serviceEnv(transcript.service, service.binding);
    await seedTranscriptOperation(env, transcript);
    const deletion = await deletionRow();
    const nowMs = transcript.attestation.issued_at;

    const first = await advanceDeletionServiceOperation(env, { deletion, service: transcript.service, nowMs });
    if (loseFirstConfirmation) {
      expect(first).toBe('retryable');
      await expect(operation(transcript.service)).resolves.toMatchObject({ state: 'complete' });
      await expect(advanceDeletionServiceOperation(env, { deletion, service: transcript.service, nowMs })).resolves.toBe('confirmed');
    } else {
      expect(first).toBe('confirmed');
    }

    await expect(operation(transcript.service)).resolves.toMatchObject({ state: 'confirmed' });
    expect(service.calls.filter((call) => call.path === fixture.routes.purge)).toHaveLength(1);
    expect(service.calls[0].body).toEqual({ envelope: transcript.request });
    expect(canonicalJson(withoutIntegrity(service.calls[0].body.envelope))).toBe(transcript.request_canonical_without_integrity);
    for (const call of service.calls.filter((entry) => entry.path === fixture.routes.confirm)) {
      expect(call.body.envelope).toEqual(transcript.request);
      const { issued_at, expires_at, integrity, ...fixedFields } = call.body.attestation;
      const {
        issued_at: _fixtureIssuedAt,
        expires_at: _fixtureExpiresAt,
        integrity: _fixtureIntegrity,
        ...expectedFixedFields
      } = transcript.attestation;
      expect(fixedFields).toEqual(expectedFixedFields);
      expect(issued_at).toBe(nowMs);
      expect(expires_at - issued_at).toBeGreaterThan(0);
      expect(expires_at - issued_at).toBeLessThanOrEqual(ATTESTATION_MAX_LIFETIME_MS);
      await expect(framedHmacSha256Base64Url(
        keyFor(call.body.attestation.key_version),
        `solpbc-owner-purge-v1:${transcript.service}:confirm`,
        canonicalJson(withoutIntegrity(call.body.attestation)),
      )).resolves.toBe(integrity);
    }
    expect(service.calls.every((call) => call.authorization === `Bearer ${bearerFor(transcript.service)}`)).toBe(true);
    await expect(operationCount(transcript.service)).resolves.toBe(1);
  });

  it('rejects a response signed with a non-original key version', async () => {
    const transcript = fixture.wire_transcripts.find((entry) => entry.name === 'support_current_key_v2_utf8_snapshot');
    const wrong = { ...transcript.response, ...transcript.wrong_response_key_version };
    const service = transcriptService(transcript, { confirmation: wrong });
    const env = serviceEnv('support', service.binding);
    await seedTranscriptOperation(env, transcript);

    await expect(advanceDeletionServiceOperation(env, {
      deletion: await deletionRow(), service: 'support', nowMs: transcript.attestation.issued_at,
    })).resolves.toBe('retryable');
    await expect(operation('support')).resolves.toMatchObject({ state: 'complete' });
  });

  it('keeps legacy absence, mismatched service/digest, and duplicate response members pending', async () => {
    const transcript = fixture.wire_transcripts[0];
    const cases = [
      {
        name: 'legacy absence',
        confirmation: await signedResponse(transcript, { disposition: 'confirmed_absent' }),
      },
      {
        name: 'wrong digest',
        confirmation: await signedResponse(transcript, { request_digest: 'different' }),
      },
      {
        name: 'wrong service',
        confirmation: await signedResponse(transcript, { service: 'support' }),
      },
      {
        name: 'duplicate disposition',
        confirmationRaw: duplicateDispositionResponse(transcript.response),
      },
    ];

    for (const testCase of cases) {
      await resetDb();
      const service = transcriptService(transcript, testCase);
      const env = serviceEnv('relay', service.binding);
      await seedTranscriptOperation(env, transcript);
      await expect(advanceDeletionServiceOperation(env, {
        deletion: await deletionRow(), service: 'relay', nowMs: transcript.attestation.issued_at,
      })).resolves.toBe('retryable');
      await expect(operation('relay')).resolves.toMatchObject({ state: 'complete' });
    }
  });

  it('replays one local unexpired operation for concurrent submit deliveries', async () => {
    const transcript = fixture.wire_transcripts[3];
    const service = transcriptService(transcript);
    const env = serviceEnv('relay', service.binding);
    await seedTranscriptOperation(env, transcript);
    const deletion = await deletionRow();

    await expect(Promise.all([
      advanceDeletionServiceOperation(env, { deletion, service: 'relay', nowMs: transcript.attestation.issued_at }),
      advanceDeletionServiceOperation(env, { deletion, service: 'relay', nowMs: transcript.attestation.issued_at }),
    ])).resolves.toEqual(['confirmed', 'confirmed']);
    const submits = service.calls.filter((call) => call.path === fixture.routes.purge);
    expect(submits).toHaveLength(2);
    expect(submits[0].raw).toBe(submits[1].raw);
    await expect(operationCount('relay')).resolves.toBe(1);
  });

  it('mints exact maximum request and attestation lifetimes', async () => {
    const transcript = fixture.wire_transcripts[3];
    const service = liveContractService('relay');
    const env = serviceEnv('relay', service.binding);
    const snapshot = await encryptEmail(JSON.stringify({ relay: transcript.request.association_snapshot }), env);
    await seedDeletion(snapshot);

    await expect(advanceDeletionServiceOperation(env, {
      deletion: await deletionRow(), service: 'relay', nowMs: 100,
    })).resolves.toBe('confirmed');
    const envelope = service.calls.find((call) => call.path === fixture.routes.purge).body.envelope;
    const attestation = service.calls.find((call) => call.path === fixture.routes.confirm).body.attestation;
    expect(envelope.expires_at - envelope.issued_at).toBe(REQUEST_MAX_LIFETIME_MS);
    expect(attestation.expires_at - attestation.issued_at).toBe(ATTESTATION_MAX_LIFETIME_MS);
  });

  it('keeps the fixture target-only rejection vector boundary explicit', () => {
    const names = fixture.rejection_vectors.map((entry) => entry.name);
    for (const name of SERVER_ONLY_REJECTION_VECTORS) expect(names).toContain(name);
    expect(names).toContain('concurrent_or_lost_submit_retry_converges_to_one_binding');
    expect(names).toContain('same_operation_different_digest_is_refused_before_lookup');
    expect(names).toContain('wrong_service_or_digest_never_advances');
  });
});

function serviceEnv(service, binding) {
  return makeTestEnv(service === 'relay' ? { RELAY: binding } : { SUPPORT_WORKER: binding });
}

function transcriptService(transcript, {
  loseFirstConfirmation = false,
  confirmation = transcript.response,
  confirmationRaw = null,
} = {}) {
  const calls = [];
  let confirmationCalls = 0;
  return {
    calls,
    binding: {
      async fetch(input, init) {
        const path = new URL(typeof input === 'string' ? input : input.url).pathname;
        const raw = init.body;
        calls.push({ path, raw, body: JSON.parse(raw), authorization: init.headers.Authorization });
        if (path === fixture.routes.purge) return jsonResponse(transcript.submit_response);
        if (path !== fixture.routes.confirm) return new Response('', { status: 404 });
        confirmationCalls += 1;
        if (loseFirstConfirmation && confirmationCalls === 1) throw new Error('lost confirmation response');
        return confirmationRaw == null ? jsonResponse(confirmation) : new Response(confirmationRaw, {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  };
}

function liveContractService(service) {
  const calls = [];
  return {
    calls,
    binding: {
      async fetch(input, init) {
        const path = new URL(typeof input === 'string' ? input : input.url).pathname;
        const raw = init.body;
        const body = JSON.parse(raw);
        calls.push({ path, raw, body, authorization: init.headers.Authorization });
        const envelope = body.envelope;
        return jsonResponse(await signedResponse({ service, request: envelope }, {
          disposition: path === fixture.routes.purge ? 'complete' : 'confirmed',
        }));
      },
    },
  };
}

async function seedTranscriptOperation(env, transcript) {
  const snapshot = transcript.service === 'relay'
    ? { relay: transcript.request.association_snapshot }
    : { support: transcript.request.association_snapshot };
  await seedDeletion(await encryptEmail(JSON.stringify(snapshot), env));
  await workerEnv.DB.prepare(
    `INSERT INTO account_deletion_service_ops (
       id, operation_id, service, service_operation_id, request_digest,
       key_version, envelope_issued_at, state, envelope_expires_at,
       next_attempt_at, attempt_count
     ) VALUES ('service', 'delete', ?, ?, ?, ?, ?, 'pending', ?, 0, 0)`
  ).bind(
    transcript.service,
    transcript.request.operation_id,
    transcript.request.request_digest,
    transcript.request.key_version,
    transcript.request.issued_at,
    transcript.request.expires_at,
  ).run();
}

async function seedDeletion(snapshot) {
  await workerEnv.DB.prepare(
    "INSERT INTO account_deletions (operation_id, account_id, phase, requested_at, cancellation_deadline_at, snapshot_encrypted, status_token_hash, lease_token) VALUES ('delete', 'account', 'purging', 0, 0, ?, 'status', 'lease')"
  ).bind(snapshot).run();
}

async function signedResponse(transcript, overrides = {}) {
  const request = transcript.request;
  const unsigned = {
    version: 1,
    key_version: request.key_version,
    service: transcript.service,
    operation_id: request.operation_id,
    request_digest: request.request_digest,
    disposition: 'confirmed',
    ...overrides,
  };
  return {
    ...unsigned,
    integrity: await framedHmacSha256Base64Url(
      keyFor(unsigned.key_version),
      `solpbc-owner-purge-v1:${unsigned.service}:response`,
      canonicalJson(unsigned),
    ),
  };
}

function duplicateDispositionResponse(response) {
  const unsigned = withoutIntegrity(response);
  return `{"version":${unsigned.version},"key_version":${unsigned.key_version},"service":${JSON.stringify(unsigned.service)},"operation_id":${JSON.stringify(unsigned.operation_id)},"request_digest":${JSON.stringify(unsigned.request_digest)},"disposition":"confirmed","disposition":"retryable","integrity":${JSON.stringify(response.integrity)}}`;
}

function withoutIntegrity(value) {
  const unsigned = { ...value };
  delete unsigned.integrity;
  return unsigned;
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
}

function keyFor(version) {
  return fixture.integrity.non_production_test_keys_utf8[String(version)];
}

function bearerFor(service) {
  return service === 'relay' ? 'test-relay-purge-bearer' : 'test-support-purge-bearer';
}

async function deletionRow() {
  return workerEnv.DB.prepare("SELECT * FROM account_deletions WHERE operation_id = 'delete'").first();
}

async function operation(service) {
  return workerEnv.DB.prepare(
    "SELECT * FROM account_deletion_service_ops WHERE operation_id = 'delete' AND service = ? ORDER BY rowid DESC LIMIT 1"
  ).bind(service).first();
}

async function operationCount(service) {
  const row = await workerEnv.DB.prepare(
    "SELECT COUNT(*) AS count FROM account_deletion_service_ops WHERE operation_id = 'delete' AND service = ?"
  ).bind(service).first();
  return row.count;
}

function frameHex(domain, payload) {
  const encoder = new TextEncoder();
  const frame = (value) => {
    const bytes = encoder.encode(value);
    const length = new DataView(new ArrayBuffer(8));
    length.setBigUint64(0, BigInt(bytes.length), false);
    const output = new Uint8Array(8 + bytes.length);
    output.set(new Uint8Array(length.buffer));
    output.set(bytes, 8);
    return output;
  };
  const left = frame(domain);
  const right = frame(payload);
  const output = new Uint8Array(left.length + right.length);
  output.set(left);
  output.set(right, left.length);
  return Array.from(output, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
