import { describe, expect, it } from 'vitest';
import { PORTAL_CSS_HREF, SUNARC_JS_SRC } from '../src/assets.js';
import worker from '../src/index.js';
import { makeTestEnv } from './helpers.js';

const IMMUTABLE = 'public, max-age=31536000, immutable';
const PORTAL_CACHE = 'public, max-age=3600';

describe('public portal assets', () => {
  it('serves portal css with one-hour public caching', async () => {
    const response = await worker.fetch(new Request('https://services.solstone.app/portal.css'), makeTestEnv());
    const body = await response.text();
    const fontFaceBlocks = body.match(/@font-face\s*{[^}]+}/g) || [];

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/css; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe(PORTAL_CACHE);
    expect(body).toContain('@font-face');
    expect(body).toContain('--orange');
    expect(body).toContain('/fonts/comfortaa-latin.woff2');
    expect(response.headers.get('Cache-Control')).not.toBe('no-store');
    expect(fontFaceBlocks.join('\n')).not.toMatch(/googleapis|gstatic|https:\/\//);
  });

  it('serves the sun-arc script at its own cached route, not inlined on every page', async () => {
    // The engine is ~29KB assembled. Inlined it was 96% of the transparency view's own 50KB
    // budget before this arc added the zone table, and four suites' page-body assertions were
    // scanning engine source.
    expect(SUNARC_JS_SRC).toBe('/sunarc.js?v=1');

    for (const path of ['/sunarc.js', SUNARC_JS_SRC]) {
      const response = await worker.fetch(new Request(`https://services.solstone.app${path}`), makeTestEnv());
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/javascript; charset=utf-8');
      expect(response.headers.get('Cache-Control')).toBe(PORTAL_CACHE);
      // The bundled zone table rides with it — it is never fetched separately.
      expect(body).toContain(',Denver:3974:-10498,');
      expect(body).toContain('createSunarcController');
    }

    // And the page links it rather than carrying it.
    const page = await worker.fetch(new Request('https://services.solstone.app/'), makeTestEnv());
    const html = await page.text();
    expect(html).toContain(`<script src="${SUNARC_JS_SRC}" defer></script>`);
    expect(html).not.toContain('createSunarcController');
  });

  it('serves the versioned portal css href through the same route', async () => {
    expect(PORTAL_CSS_HREF).toBe('/portal.css?v=6');
    expect(PORTAL_CSS_HREF).not.toBe('/portal.css');

    const response = await worker.fetch(new Request(`https://services.solstone.app${PORTAL_CSS_HREF}`), makeTestEnv());

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/css; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe(PORTAL_CACHE);
  });

  it('serves allowlisted woff2 fonts with immutable public caching', async () => {
    for (const name of ['comfortaa-latin.woff2', 'inter-latin.woff2']) {
      const response = await worker.fetch(new Request(`https://services.solstone.app/fonts/${name}`), makeTestEnv());
      const bytes = new Uint8Array(await response.arrayBuffer());

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('font/woff2');
      expect(response.headers.get('Cache-Control')).toBe(IMMUTABLE);
      expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('wOF2');
    }
  });

  it('does not serve unknown font names', async () => {
    const response = await worker.fetch(new Request('https://services.solstone.app/fonts/nope.woff2'), makeTestEnv());

    expect(response.status).toBe(404);
  });
});
