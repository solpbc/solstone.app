import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import {
  renderConfidentialProcessingData,
  renderConfidentialProcessingLanding,
  renderEnableSppConsent,
  renderEnableSppEarlyAccess,
  renderServicesCatalog,
} from '../src/html.js';
import {
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedSession,
} from './helpers.js';

// CLO req_he4p6cvo (2026-07-13): the only admitted use of "premium" is this exact locked
// negation from the /data model paragraph. It is stripped before the BANNED scan so bare
// 'premium' stays fully banned; any drift in the sentence re-trips the guard, and the
// positive lock below keeps the sentence from being removed.
const CLO_LOCKED_PREMIUM_NEGATION = "there's no premium tier: nothing is held back for the service";

const BANNED = [
  // CLO #28(a): sealed container (spc) was mothballed 2026-07-12, but the ban still stands —
  // spp is shared, operated infrastructure that processes plaintext transiently, so it may never
  // make the can't-see-in claim.
  'sealed engine',
  'sealed',
  "not sol pbc's to read",
  "stays out of sol pbc's reach",
  "sol pbc can't see in",
  "sol pbc can't read",
  "can't read what's processed",
  'sealed out of',
  'only you can read it',
  // CLO #28(b): no asserted "verified" state before the real attestation crypto ships;
  // only the honest fail-closed verify register ("must verify … or it doesn't send").
  'verified by your journal',
  'verifies that seal',
  'verifies the engine',
  'verifies the hardware',
  'checks the hardware before it sends',
  'never sees',
  'activate',
  'subscribe',
  'upgrade',
  'premium',
  ' plan',
  'solstone hosts',
  'solstone runs',
  'solstone stores',
  '$',
  // A6 (2026-07-12): hosted STT joined confidential processing — the "recordings never leave" absolutes are retired and may not return.
  'never your audio',
  'recordings never leave',
  'raw audio never leaves',
  'never hears',
  'deleted after transcription',
  // CLO req_he4p6cvo: no hosted/local output-equivalence claim for audio; the surviving
  // form is "there's no premium tier: nothing is held back for the service".
  'no higher-quality hosted tier',
];

const stripHref = (html) => html.replace(/href="[^"]*"/gi, 'href=""');

describe('spp copy boundary', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('keeps banned claims out of every spp surface while retaining allowed claims', async () => {
    const testEnv = makeTestEnv();
    const activeAccount = await seedAccount({ email: 'spp-boundary-active@example.com', testEnv });
    await seedEntitlement({
      accountId: activeAccount.accountId,
      service: 'spp_hosted',
      status: 'active',
      source: 'comp',
    });
    const activeSession = await seedSession(activeAccount.accountId, { testEnv });
    const defaultAccount = await seedAccount({ email: 'spp-boundary-default@example.com', testEnv });
    const defaultSession = await seedSession(defaultAccount.accountId, { testEnv });

    const activeResponse = await get('/confidential-processing', testEnv, activeSession.cookie);
    const defaultResponse = await get('/confidential-processing', testEnv, defaultSession.cookie);
    const catalog = renderServicesCatalog({ signedIn: false });
    const catalogMatch = catalog.match(/<a class="row" href="\/confidential-processing"[\s\S]*?<\/a>/);

    expect(activeResponse.status).toBe(200);
    expect(defaultResponse.status).toBe(200);
    expect(catalogMatch).not.toBeNull();

    const surfaces = [
      ['enable consent', renderEnableSppConsent({
        csrf: 'csrf',
        nonce: '7'.repeat(52),
        instance: '11111111-1111-1111-1111-111111111111',
      })],
      ['enable early access', renderEnableSppEarlyAccess()],
      ['public landing', renderConfidentialProcessingLanding()],
      ['services active', await activeResponse.text()],
      ['services default', await defaultResponse.text()],
      ['data reference', renderConfidentialProcessingData()],
      ['catalog row', catalogMatch?.[0] || ''],
    ];

    for (const [name, body] of surfaces) {
      const scanBody = stripHref(body).toLowerCase().replaceAll(CLO_LOCKED_PREMIUM_NEGATION, '');
      for (const phrase of BANNED) {
        expect(scanBody, `${name}: ${phrase}`).not.toContain(phrase.toLowerCase());
      }
    }

    const combined = surfaces.map(([, body]) => stripHref(body)).join('\n').toLowerCase();
    expect(combined).toContain('no content is retained · no human reviews it · nothing is used to train');
    expect(combined).toContain('no third-party ai provider');
    expect(combined).toContain('confidential hardware sol pbc operates');
    // CLO #28(c): substrate honesty — Azure named, cloud host excluded (not a can't-see-in claim).
    expect(combined).toContain('microsoft azure');
    expect(combined).toContain("the hardware boundary keeps the cloud host excluded from what's processed");
    // CLO #28(b): the honest fail-closed verify register must be present.
    expect(combined).toContain('must verify the service before anything is sent');
    expect(combined).toContain("your journal's text, images, and audio");
    expect(combined).toContain('your audio recordings for transcription');
    expect(combined).toContain('on while confidential processing is in use');
    expect(combined).toContain('transcription waits on your device');
    expect(combined).toContain('parakeet-tdt-0.6b-v3');
    expect(combined).toContain("there's no premium tier: nothing is held back for the service");
    expect(combined).toContain('more of the faint talk around you becomes text in your journal');
  });
});

function get(path, testEnv, cookie) {
  return worker.fetch(new Request(`https://services.solstone.app${path}`, {
    headers: { Cookie: cookie },
  }), testEnv);
}
