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

const BANNED = [
  'sealed engine',
  "not sol pbc's to read",
  "stays out of sol pbc's reach",
  "sol pbc can't see in",
  "sol pbc can't read",
  'only you can read it',
  'verified by your journal',
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
      const scanBody = stripHref(body).toLowerCase();
      for (const phrase of BANNED) {
        expect(scanBody, `${name}: ${phrase}`).not.toContain(phrase.toLowerCase());
      }
    }

    const combined = surfaces.map(([, body]) => stripHref(body)).join('\n').toLowerCase();
    expect(combined).toContain('no content is retained · no human reviews it · nothing is used to train');
    expect(combined).toContain('no third-party ai provider');
    expect(combined).toContain('confidential cloud hardware sol pbc operates');
  });
});

function get(path, testEnv, cookie) {
  return worker.fetch(new Request(`https://services.solstone.app${path}`, {
    headers: { Cookie: cookie },
  }), testEnv);
}
