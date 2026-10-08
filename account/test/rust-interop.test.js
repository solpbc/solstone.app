import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyServiceEnableProof } from '../src/enable-proof.js';
import fixture from '../test-fixtures/service-enable-assertion-rust.json';

// Public fixture captured by the real Rust signer in solstone-journal.
// Source: solstone-journal 3605b6dedd95af045828756c28e1eafb0816eafa,
// core/crates/solstone-core-sol-link/tests/fixtures/service_enable_assertion.json.
// Generator capture_service_enable_fixture, fixed clock 1700000000.
const proof = {
  assertion: fixture.compact,
  caPubkey: fixture.ca_pubkey_pem,
  instanceId: fixture.instance_id,
  nonce: fixture.nonce,
  service: fixture.service,
};

afterEach(() => vi.restoreAllMocks());

describe('Rust service-enable signature interoperability', () => {
  function at(seconds) {
    vi.spyOn(Date, 'now').mockReturnValue(seconds * 1000);
  }

  it('verifies a signature captured from the real journal signer', async () => {
    at(fixture.clock_unix_seconds);
    expect(await verifyServiceEnableProof(proof)).toBe(true);
  });

  it.each([
    ['nonce', { nonce: `${fixture.nonce[0] === 'A' ? 'B' : 'A'}${fixture.nonce.slice(1)}` }],
    ['service', { service: 'spb' }],
    ['journal id', { instanceId: '00000000-0000-8000-8000-000000000000' }],
    ['noncanonical public key', { caPubkey: `${fixture.ca_pubkey_pem}\n` }],
  ])('refuses a mismatched %s', async (_label, changed) => {
    at(fixture.clock_unix_seconds);
    expect(await verifyServiceEnableProof({ ...proof, ...changed })).toBe(false);
  });

  it('refuses an altered real signature', async () => {
    at(fixture.clock_unix_seconds);
    const [header, claims, signature] = fixture.compact.split('.');
    const altered = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
    expect(await verifyServiceEnableProof({ ...proof, assertion: `${header}.${claims}.${altered}` })).toBe(false);
  });

  it('refuses the real proof at its expiry boundary', async () => {
    at(fixture.exp);
    expect(await verifyServiceEnableProof(proof)).toBe(false);
  });
});
