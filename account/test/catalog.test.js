import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { encryptEmail } from '../src/crypto.js';
import {
  makeTestEnv,
  resetDb,
  seedAccount,
  seedDevice,
  seedEntitlement,
  seedSession,
} from './helpers.js';

describe('services catalog', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('renders the public catalog at the root without redirecting to sign-in', async () => {
    const response = await worker.fetch(new Request('https://services.solstone.app/'), makeTestEnv());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.status).toBeLessThan(300);
    expect(body).toContain('solstone services');
    for (const name of ['private network', 'encrypted backup', 'notifications', 'confidential processing', 'scout']) {
      expect(body).toContain(name);
    }
    expect(body).toContain('$20');
    expect(body).toContain('$48');
    expect(body).toContain('built in');
    expect(body).toContain('<span class="tag free">scouts</span>');
    expect(body).toContain('available to approved scouts. let sol think off your device on confidential hardware sol pbc runs that keeps nothing.');
    expect(body).toContain('<span class="tag free">program</span>');
    expect(body).toContain('the tester program. approved scouts can enable confidential processing.');
    expect(body).toContain('your journal is always private, only yours.');
    expect(body).toContain('href="/?signin"');
    expect(body).toContain('no analytics, no tracking, no third parties. sign in only to manage what you’ve turned on');
    expect(body).toContain('href="/transparency"');
    expect(body).not.toContain('action="/signin/start"');
  });

  it('omits the retired sealed container from public and signed-in catalogs', async () => {
    const testEnv = makeTestEnv();
    const publicResponse = await worker.fetch(new Request('https://services.solstone.app/'), testEnv);
    const publicBody = await publicResponse.text();
    const account = await seedAccount({ testEnv });
    const session = await seedSession(account.accountId, { testEnv });
    const signedInResponse = await worker.fetch(catalogRequest(session.cookie), testEnv);
    const signedInBody = await signedInResponse.text();

    for (const body of [publicBody, signedInBody]) {
      expect(body).not.toContain('sealed container');
      expect(body).not.toContain('/sealed-container');
    }
  });

  it('renders the signed-in catalog with no-store, account rows, and active service signals', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedEntitlement({ accountId: account.accountId, service: 'spl_hosted', status: 'active' });
    await seedEntitlement({ accountId: account.accountId, service: 'spp_hosted', status: 'active', source: 'comp' });
    await seedDevice({ accountId: account.accountId });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(catalogRequest(session.cookie), testEnv);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toContain('your services');
    expect(body).toContain('class="pill');
    expect(body).toContain('href="/sign-in"');
    expect(body).toContain('href="/transparency"');
    expect(body).toMatch(/href="\/private-network"[\s\S]*?<span class="pill on"><span class="dot"><\/span>on<\/span>/);
    expect(body).toMatch(/href="\/notifications"[\s\S]*?<span class="pill on"><span class="dot"><\/span>on<\/span>/);
    expect(body).toMatch(/href="\/confidential-processing"[\s\S]*?<span class="pill on"><span class="dot"><\/span>available<\/span>/);
    expect(extractCatalogRow(body, '/scout')).toContain('<span class="tag free">program</span>');
    expect(body).not.toContain('last seen');
  });

  it('keeps the Scout program label independent of a lingering active legacy key', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedProvisionedKey({ testEnv, accountId: account.accountId });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(catalogRequest(session.cookie), testEnv);
    const scoutRow = extractCatalogRow(await response.text(), '/scout');

    expect(response.status).toBe(200);
    expect(scoutRow).toContain('the tester program. approved scouts can enable confidential processing.');
    expect(scoutRow).toContain('<span class="tag free">program</span>');
    expect(scoutRow).not.toContain('approved</span>');
    expect(scoutRow).not.toContain('class="pill');
  });

  it('renders a lapsed confidential-processing entitlement as not available', async () => {
    const testEnv = makeTestEnv();
    const account = await seedAccount({ testEnv });
    await seedEntitlement({
      accountId: account.accountId,
      service: 'spp_hosted',
      status: 'lapsed',
      source: 'comp',
    });
    const session = await seedSession(account.accountId, { testEnv });

    const response = await worker.fetch(catalogRequest(session.cookie), testEnv);
    const sppRow = extractCatalogRow(await response.text(), '/confidential-processing');

    expect(response.status).toBe(200);
    expect(sppRow).toContain('<span class="pill off"><span class="dot"></span>not available</span>');
  });

  it('renders the sign-in form at /?signin', async () => {
    const response = await worker.fetch(new Request('https://services.solstone.app/?signin'), makeTestEnv());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('action="/signin/start"');
  });
});

function catalogRequest(cookie) {
  return new Request('https://services.solstone.app/', {
    headers: { Cookie: cookie },
  });
}

function extractCatalogRow(html, href) {
  const escapedHref = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`<a class="row" href="${escapedHref}"[\\s\\S]*?<\\/a>`));
  expect(match, `catalog row ${href}`).not.toBeNull();
  return match?.[0] || '';
}

async function seedProvisionedKey({ testEnv, accountId }) {
  await testEnv.DB
    .prepare(
      `INSERT INTO provisioned_keys (
         id, account_id, provider, display_name, key_resource_name,
         key_string_encrypted, created_at
       ) VALUES (?, ?, 'gemini', ?, ?, ?, ?)`
    )
    .bind(
      'catalog-active-key',
      accountId,
      'catalog-active',
      'projects/test-gcp-project/locations/global/keys/catalog-active',
      await encryptEmail('catalog-plaintext-key', testEnv),
      1_000
    )
    .run();
}
