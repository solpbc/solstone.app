import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import {
  renderConfidentialProcessingData,
  renderConfidentialProcessingLanding,
  renderEnableScout,
  renderEnableSppApprovalRequired,
  renderEnableSppConsent,
  renderEnableSppDone,
  renderEnableSppError,
  renderScoutLanding,
  renderServicesCatalog,
  renderServicesScout,
  renderServicesSpp,
} from '../src/html.js';
import {
  makeTestEnv,
  resetDb,
  seedAccount,
  seedEntitlement,
  seedSession,
} from './helpers.js';

// Legal review (2026-07-13): the only admitted use of "premium" is this exact locked
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
  // Legal review: no hosted/local output-equivalence claim for audio; the surviving
  // form is "there's no premium tier: nothing is held back for the service".
  'no higher-quality hosted tier',
  // Legal review (operator correction, 2026-07-13): the reverse claim is banned too.
  // The hosted-beats-local fidelity line rested on a 404-vs-230 word delta that was
  // filler/noise tokens, not recovered speech. No audio quality differential is measured
  // in either direction, so none may be stated on a page whose authority is that every
  // sentence is measured-true. This has drifted on twice; the guard is what stops a third.
  'full precision',
  'picks up noticeably more',
  'more of the faint talk',
  // Legal review (2026-08-01): these access-tier labels are retired now that
  // confidential processing is live for every approved scout.
  'invite-only',
  'private beta',
  'select access',
  'early-access list',
  '—',
  // Legal review (2026-08-01): these availability claims falsely describe a
  // live approved-scout service as unreleased or globally unavailable. Bare
  // 'coming' is intentional because that was the retired catalog trail.
  'coming',
  'early access',
  "isn't open yet",
  'alpha',
  // Legal review (2026-08-01): these concrete framings incorrectly present a
  // legacy Gemini key as the Scout program benefit.
  'we set you up with a gemini key',
  'a gemini key on your device',
  'to receive your key',
  'get early access to',
  'turning on scout just means sol pbc sets one up for you',
  'sol pbc creates a gemini key for you',
];

const stripHref = (html) => html.replace(/href="[^"]*"/gi, 'href=""');

describe('spp copy boundary', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('keeps banned claims out of every Scout and confidential-processing surface while retaining allowed claims', async () => {
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
    const publicCatalog = renderServicesCatalog({ signedIn: false });
    const signedCatalogUnavailable = renderServicesCatalog({ signedIn: true });
    const signedCatalogAvailable = renderServicesCatalog({ signedIn: true, sppActive: true });
    const scoutArgs = { nowMs: 10_000, menu: {} };

    expect(activeResponse.status).toBe(200);
    expect(defaultResponse.status).toBe(200);

    const surfaces = [
      ['scout public landing', renderScoutLanding()],
      ['scout enable terminal', renderEnableScout()],
      ['enable consent', renderEnableSppConsent({
        csrf: 'csrf',
        nonce: '7'.repeat(52),
        instance: '11111111-1111-1111-1111-111111111111',
      })],
      ['enable approval required', renderEnableSppApprovalRequired()],
      ['enable done', renderEnableSppDone()],
      ['enable error', renderEnableSppError()],
      ['confidential-processing public landing', renderConfidentialProcessingLanding()],
      ['confidential-processing services active', await activeResponse.text()],
      ['confidential-processing services default', await defaultResponse.text()],
      ['confidential-processing services lapsed', renderServicesSpp({ entitlement: { status: 'lapsed' }, menu: {} })],
      ['confidential-processing data reference', renderConfidentialProcessingData()],
      ['public confidential-processing catalog row', extractCatalogRow(publicCatalog, '/confidential-processing')],
      ['public Scout catalog row', extractCatalogRow(publicCatalog, '/scout')],
      ['signed-in confidential-processing unavailable catalog row', extractCatalogRow(signedCatalogUnavailable, '/confidential-processing')],
      ['signed-in confidential-processing available catalog row', extractCatalogRow(signedCatalogAvailable, '/confidential-processing')],
      ['signed-in Scout catalog row', extractCatalogRow(signedCatalogUnavailable, '/scout')],
      ['Scout revoked', renderServicesScout({
        ...scoutArgs,
        application: { status: 'revoked' },
        flash: { apply: 'ok' },
      })],
      ['Scout approved acknowledged', renderServicesScout({
        ...scoutArgs,
        application: { status: 'approved', data_acked_at: 1_000 },
        flash: { apply: 'acked' },
      })],
      ['Scout approved unacknowledged', renderServicesScout({
        ...scoutArgs,
        application: { status: 'approved', data_acked_at: null },
      })],
      ['Scout pending', renderServicesScout({
        ...scoutArgs,
        application: { status: 'pending', applied_at: 1_000 },
      })],
      ['Scout no application', renderServicesScout(scoutArgs)],
      ['Scout approved unacknowledged application form', extractScoutApplyForm(renderServicesScout({
        ...scoutArgs,
        application: { status: 'approved', data_acked_at: null },
      }))],
      ['Scout default application form', extractScoutApplyForm(renderServicesScout(scoutArgs))],
    ];

    for (const [name, body] of surfaces) {
      const scanBody = stripHref(body)
        .toLowerCase()
        .replaceAll(CLO_LOCKED_PREMIUM_NEGATION, '');
      for (const phrase of BANNED) {
        expect(scanBody, `${name}: ${phrase}`).not.toContain(phrase.toLowerCase());
      }
      expect(body, `${name}: retired provider`).not.toMatch(/\bgemini\b/i);
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
    expect(combined).toContain('confidential processing: no content is retained · no human reviews it · nothing is used to train. your journal must verify the service before anything is sent.');
    expect(combined).toContain('confidential processing is available to approved scouts.');
    expect(combined).toContain('approved scouts can enable confidential processing from the journal and share feedback that helps shape solstone.');
  });
});

function extractCatalogRow(html, href) {
  const escapedHref = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`<a class="row" href="${escapedHref}"[\\s\\S]*?<\\/a>`));
  expect(match, `catalog row ${href}`).not.toBeNull();
  return match?.[0] || '';
}

function extractScoutApplyForm(html) {
  const match = html.match(/<form method="post" action="\/scout\/apply">[\s\S]*?<\/form>/);
  expect(match, 'Scout application form').not.toBeNull();
  return match?.[0] || '';
}

function get(path, testEnv, cookie) {
  return worker.fetch(new Request(`https://services.solstone.app${path}`, {
    headers: { Cookie: cookie },
  }), testEnv);
}
