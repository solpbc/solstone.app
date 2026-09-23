import { describe, expect, it } from 'vitest';
import { PORTAL_CSS } from '../src/assets.js';
import {
  calculateArcGeometry,
  calculateFrame,
  calculateSunTime,
  createSunarcController,
  envelope,
  noaaSolarTime,
  parseTokens,
  parseZoneTable,
  rgbToOklab,
  parseColor,
  solarPairFor,
  sunOpacity,
  SUNARC_JS,
  SUNARC_ZONE_COUNT,
  SUNARC_ZONE_TABLE,
} from '../src/sunarc.js';

const portalCssText = PORTAL_CSS;

function extractCssVar(css, name) {
  const re = new RegExp(`${name}\\s*:\\s*([^;]+);`);
  const match = css.match(re);
  if (!match) throw new Error(`Missing CSS variable ${name} in portal.css`);
  return match[1].trim();
}

function makeTokenReader(overrides = {}) {
  const customMap = new Map();
  const rootBlock = portalCssText.match(/:root\s*\{([\s\S]*?)\}/)?.[1] || '';
  for (const line of rootBlock.split('\n')) {
    const m = line.match(/(--[\w-]+)\s*:\s*([^;/*]+)/);
    if (m) {
      customMap.set(m[1].trim(), m[2].trim());
    }
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) {
      customMap.delete(k);
    } else {
      customMap.set(k, v);
    }
  }
  return function(name) {
    return customMap.get(name) || '';
  };
}

const defaultTokens = parseTokens(makeTokenReader());

describe('content container (spec section 8)', () => {
  it('puts the content on its own paper in both appearances, keyed on the system setting, never an attribute', () => {
    // Light: tile cream at 75%, so the sun reads through by day and faint text clears AA at true dark.
    expect(portalCssText).toMatch(/\nmain\s*\{\s*background:\s*rgb\(252 243 228 \/ 0\.75\);\s*border-radius:\s*var\(--radius\);\s*\}/);
    // Dark: solid cream, and the pre-script body fallback is the dark day ground, not a cream flash.
    const dark = portalCssText.match(/@media \(prefers-color-scheme: dark\)\s*\{([\s\S]*?)\n\}/);
    expect(dark).not.toBeNull();
    expect(dark[1]).toMatch(/main\s*\{\s*background:\s*var\(--cream\);\s*\}/);
    expect(dark[1]).toMatch(/body\s*\{\s*background:\s*var\(--sunarc-mixed,\s*var\(--sunarc-ground-dark-day\)\);\s*\}/);
    expect(portalCssText).not.toContain('[data-appearance');
    // Service cards keep their own white fill.
    expect(portalCssText).toMatch(/\.group\s*\{\s*background:\s*var\(--paper\);/);
    expect(portalCssText).toMatch(/\.card\s*\{\s*background:\s*var\(--paper\);/);
  });

  it('carries the 2026-09-23 tokens and none of the retired ones', () => {
    const expected = {
      '--sunarc-peak-opacity': '0.55',
      '--sunarc-peak-opacity-dark': '0.20',
      '--sunarc-ground-light-night': '#E9DECC',
      '--sunarc-ground-light-deep': '#D7C9B0',
      '--sunarc-ground-dark-day': '#392E26',
      '--sunarc-ground-dark-night': '#2E241C',
      '--sunarc-ground-dark-deep': '#281E17',
      '--sunarc-twilight-radius-ratio': '2.6180339887',
      '--sunarc-twilight-alpha-dark': '0.62',
      '--sunarc-twilight-alpha-light': '0.95',
      '--sunarc-twilight-sink': '0.10',
      '--sunarc-true-dark-min': '180',
      '--sunarc-sunrise': '#FFF3CF',
      '--sunarc-glow-radius-ratio': '1.6180339887',
      '--sunarc-glow-day-alpha': '0.22',
    };
    for (const [name, value] of Object.entries(expected)) {
      expect(extractCssVar(portalCssText, name)).toBe(value);
    }
    for (const retired of ['--sunarc-glow-night-alpha', '--sunarc-glow-night-floor', '--sunarc-appearance-flip', '--sunarc-night-ground']) {
      expect(portalCssText).not.toContain(retired);
    }
  });
});

describe('sunarc background', () => {
  it('1. rung 3 (06:30/19:30): opacity at m=dawn and m=dusk is 0', () => {
    const rise = 6 * 60 + 30;
    const set = 19 * 60 + 30;
    const tw = defaultTokens.twilightMinutes;
    const dawn = rise - tw;
    const dusk = set + tw;

    const timeDawn = calculateSunTime(new Date(2026, 8, 19, 0, dawn, 0), rise, set, tw);
    const opDawn = sunOpacity(timeDawn.t, defaultTokens.envelopeEdge, defaultTokens.peakOpacity, timeDawn.nightAmount);
    expect(opDawn).toBe(0);

    const timeDusk = calculateSunTime(new Date(2026, 8, 19, 0, dusk, 0), rise, set, tw);
    const opDusk = sunOpacity(timeDusk.t, defaultTokens.envelopeEdge, defaultTokens.peakOpacity, timeDusk.nightAmount);
    expect(opDusk).toBe(0);
  });

  it('2. geometry 1280x820 and 393x852: t=0.5 center within 1%, t=0 is A, t=1 is B', () => {
    const g1 = calculateArcGeometry(
      1280,
      820,
      defaultTokens.diameterRatio,
      defaultTokens.bowRatio,
      defaultTokens.overshoot,
      defaultTokens.arcAngle,
      0.5
    );
    expect(Math.abs(g1.x - 779.2) / 779.2).toBeLessThan(0.01);
    expect(Math.abs(g1.y - 234.3) / 234.3).toBeLessThan(0.01);

    const g1A = calculateArcGeometry(
      1280,
      820,
      defaultTokens.diameterRatio,
      defaultTokens.bowRatio,
      defaultTokens.overshoot,
      defaultTokens.arcAngle,
      0
    );
    expect(Math.abs(g1A.x - g1.ax)).toBeLessThan(0.1);
    expect(Math.abs(g1A.y - g1.ay)).toBeLessThan(0.1);
    expect(Math.abs(g1.ax - -469.1) / 469.1).toBeLessThan(0.01);
    expect(Math.abs(g1.ay - -469.1) / 469.1).toBeLessThan(0.01);

    const g1B = calculateArcGeometry(
      1280,
      820,
      defaultTokens.diameterRatio,
      defaultTokens.bowRatio,
      defaultTokens.overshoot,
      defaultTokens.arcAngle,
      1
    );
    expect(Math.abs(g1B.x - g1.bx)).toBeLessThan(0.1);
    expect(Math.abs(g1B.y - g1.by)).toBeLessThan(0.1);
    expect(Math.abs(g1.bx - 1749.1) / 1749.1).toBeLessThan(0.01);
    expect(Math.abs(g1.by - 1289.1) / 1289.1).toBeLessThan(0.01);

    const g2 = calculateArcGeometry(
      393,
      852,
      defaultTokens.diameterRatio,
      defaultTokens.bowRatio,
      defaultTokens.overshoot,
      defaultTokens.arcAngle,
      0.5
    );
    expect(Math.abs(g2.x - 299.6) / 299.6).toBeLessThan(0.01);
    expect(Math.abs(g2.y - 359.3) / 359.3).toBeLessThan(0.01);
    expect(Math.abs(g2.ax - -224.8) / 224.8).toBeLessThan(0.01);
    expect(Math.abs(g2.ay - -224.8) / 224.8).toBeLessThan(0.01);
    expect(Math.abs(g2.bx - 617.8) / 617.8).toBeLessThan(0.01);
    expect(Math.abs(g2.by - 1076.8) / 1076.8).toBeLessThan(0.01);
  });

  it('3. subtended A-B angle 36.0 deg +/- 0.1 deg across multiple viewports', () => {
    const viewports = [
      [1280, 820],
      [393, 852],
      [1920, 1080],
      [800, 600],
    ];
    for (const [w, h] of viewports) {
      const g = calculateArcGeometry(
        w,
        h,
        defaultTokens.diameterRatio,
        defaultTokens.bowRatio,
        defaultTokens.overshoot,
        defaultTokens.arcAngle,
        0.5
      );
      expect(Math.abs(g.subtendedDeg - 36.0)).toBeLessThan(0.1);
    }
  });

  it('4. mid-day env=1 not night: opacity === peak-opacity token; t outside draw range: opacity 0', () => {
    const opMid = sunOpacity(0.5, defaultTokens.envelopeEdge, defaultTokens.peakOpacity, 0);
    expect(opMid).toBe(defaultTokens.peakOpacity);

    expect(sunOpacity(-0.03, defaultTokens.envelopeEdge, defaultTokens.peakOpacity, 0)).toBe(0);
    expect(sunOpacity(1.03, defaultTokens.envelopeEdge, defaultTokens.peakOpacity, 0)).toBe(0);
  });

  it('5. sample inside twilight: opacity === peak * env(t) * (1 - nightAmount)', () => {
    const tSample = 0.1;
    const nightAmt = 0.4;
    const expected = defaultTokens.peakOpacity * envelope(tSample, defaultTokens.envelopeEdge) * (1 - nightAmt);
    const actual = sunOpacity(tSample, defaultTokens.envelopeEdge, defaultTokens.peakOpacity, nightAmt);
    expect(actual).toBeCloseTo(expected, 6);
    expect(actual).not.toBeCloseTo(defaultTokens.peakOpacity * envelope(tSample, defaultTokens.envelopeEdge), 6);
  });

  it('10. NOAA Denver fixture (lat 39.74, lon -104.99, date 2026-09-19, utcOffsetHours=-6): within 1 minute of 06:44 and 19:02', () => {
    const d = new Date(Date.UTC(2026, 8, 19));
    const rise = noaaSolarTime(d, 39.74, -104.99, true, 90.833, -6);
    const set = noaaSolarTime(d, 39.74, -104.99, false, 90.833, -6);

    const expectedRise = 6 * 60 + 44;
    const expectedSet = 19 * 60 + 2;

    expect(Math.abs(rise - expectedRise)).toBeLessThan(1.0);
    expect(Math.abs(set - expectedSet)).toBeLessThan(1.0);
  });

  it('11. polar day holds the last valid pair instead of falling to 06:30/19:30', () => {
    const table = parseZoneTable(SUNARC_ZONE_TABLE);
    const longyearbyen = table['Arctic/Longyearbyen'];
    const midsummer = new Date(Date.UTC(2026, 5, 21, 12, 0, 0));

    // The day itself has no sunrise at 78 N...
    expect(noaaSolarTime(midsummer, longyearbyen.lat, longyearbyen.lon, true, 90.833, 2)).toBe(null);
    // ...and the resolver still produces a real pair, walked back to the last day that had one.
    const pair = solarPairFor(longyearbyen, midsummer, 2);
    expect(pair).not.toBe(null);
    expect(pair.rise).not.toBe(390);
    expect(pair.set).not.toBe(1170);

    // Same through the controller, driven by the zone identifier alone.
    const doc = createMockDoc();
    const controller = createSunarcController({
      document: doc,
      window: { innerWidth: 1280, innerHeight: 820 },
      now: () => midsummer,
      utcOffsetHours: 2,
      zoneId: 'Arctic/Longyearbyen',
      getComputedStyle: () => ({ getPropertyValue: makeTokenReader() }),
    });
    controller.start();
    expect(controller.getSolarPair().rise).toBeCloseTo(pair.rise, 6);
    expect(controller.getSolarPair().set).toBeCloseTo(pair.set, 6);
    controller.stop();
  });

  it('11a. the bundled tzdb table carries the spec\'s worked zone point', () => {
    const table = parseZoneTable(SUNARC_ZONE_TABLE);
    expect(SUNARC_ZONE_COUNT).toBe(418);
    expect(Object.keys(table).length).toBe(418);
    // Spec section 5 rung 2: "America/Denver -> 39.74 N, 104.98 W".
    expect(table['America/Denver'].lat).toBeCloseTo(39.74, 2);
    expect(table['America/Denver'].lon).toBeCloseTo(-104.98, 2);
    expect(table['Europe/Oslo']).toBeTruthy();
    expect(table['America/Indiana/Indianapolis']).toBeTruthy();
    // A legacy alias with no row is rung 3's case.
    expect(table['US/Mountain']).toBeUndefined();
  });

  it('11b. the system timezone is rung 2: Denver draws the spec\'s worked day, not a fixed default', () => {
    const doc = createMockDoc();
    const controller = createSunarcController({
      document: doc,
      window: { innerWidth: 1280, innerHeight: 820 },
      now: () => new Date(2026, 8, 19, 12, 53, 0),
      utcOffsetHours: -6,
      zoneId: 'America/Denver',
      getComputedStyle: () => ({ getPropertyValue: makeTokenReader() }),
    });
    controller.start();
    const pair = controller.getSolarPair();
    expect(Math.abs(pair.rise - (6 * 60 + 44))).toBeLessThan(1.0);
    expect(Math.abs(pair.set - (19 * 60 + 2))).toBeLessThan(1.0);

    // Spec section 4's worked table for Denver 2026-09-19: t = 0.499 at 12:53.
    const time = calculateSunTime(new Date(2026, 8, 19, 12, 53, 0), pair.rise, pair.set, defaultTokens.twilightMinutes);
    expect(Math.abs(time.t - 0.499)).toBeLessThan(0.002);
    controller.stop();
  });

  it('11c. rung 1 outranks rung 2, and an unknown identifier falls to rung 3', () => {
    const doc = createMockDoc();
    const held = createSunarcController({
      document: doc,
      window: { innerWidth: 1280, innerHeight: 820 },
      now: () => new Date(2026, 8, 19, 12, 0, 0),
      utcOffsetHours: -6,
      zoneId: 'America/Denver',
      heldLocation: { lat: -33.87, lon: 151.22 },
      getComputedStyle: () => ({ getPropertyValue: makeTokenReader() }),
    });
    held.start();
    const heldPair = held.getSolarPair();
    expect(Math.abs(heldPair.rise - (6 * 60 + 44))).toBeGreaterThan(1.0);
    held.stop();

    const unknown = createSunarcController({
      document: createMockDoc(),
      window: { innerWidth: 1280, innerHeight: 820 },
      now: () => new Date(2026, 8, 19, 12, 0, 0),
      utcOffsetHours: -6,
      zoneId: 'US/Mountain',
      getComputedStyle: () => ({ getPropertyValue: makeTokenReader() }),
    });
    unknown.start();
    expect(unknown.getSolarPair().rise).toBe(390);
    expect(unknown.getSolarPair().set).toBe(1170);
    unknown.stop();
  });

  it('11d. a timezone change recomputes on the next tick', () => {
    let zone = 'America/Denver';
    const controller = createSunarcController({
      document: createMockDoc(),
      window: { innerWidth: 1280, innerHeight: 820 },
      now: () => new Date(2026, 8, 19, 12, 0, 0),
      utcOffsetHours: -6,
      get zoneId() { return zone; },
      getComputedStyle: () => ({ getPropertyValue: makeTokenReader() }),
    });
    controller.start();
    const denver = { ...controller.getSolarPair() };
    zone = 'Asia/Tokyo';
    controller.tick();
    const tokyo = controller.getSolarPair();
    expect(tokyo.zoneId).toBe('Asia/Tokyo');
    expect(Math.abs(tokyo.rise - denver.rise)).toBeGreaterThan(1.0);
    controller.stop();
  });

  it('11e. a sunset after local midnight is carried into the next day, so dawn precedes dusk', () => {
    const table = parseZoneTable(SUNARC_ZONE_TABLE);
    const pair = solarPairFor(table['Atlantic/Reykjavik'], new Date(Date.UTC(2026, 5, 21, 12, 0, 0)), 0);
    expect(pair.set).toBeGreaterThan(1440);
    expect(pair.set).toBeGreaterThan(pair.rise);

    // 00:10, which is inside that wrapped dusk twilight, reads as the end of the day rather
    // than the middle of the night.
    const tw = defaultTokens.twilightMinutes;
    const smallHours = calculateSunTime(new Date(2026, 5, 21, 0, 10, 0), pair.rise, pair.set, tw);
    expect(smallHours.t).toBeGreaterThan(0.9);
    expect(smallHours.nightAmount).toBeGreaterThan(0);
    expect(smallHours.nightAmount).toBeLessThan(1);

    // An hour later, past dusk, it is night.
    const night = calculateSunTime(new Date(2026, 5, 21, 1, 0, 0), pair.rise, pair.set, tw);
    expect(night.nightAmount).toBe(1);
  });

  it('13. full-day sweep touches no network and no location API at all', async () => {
    let fetchCalls = 0;
    let xhrCalls = 0;
    let permissionQueries = 0;
    let getCurrentPositionCalls = 0;

    const originalFetch = globalThis.fetch;
    const originalXHR = globalThis.XMLHttpRequest;
    const originalNavigator = globalThis.navigator;
    globalThis.fetch = () => {
      fetchCalls++;
      return Promise.reject(new Error('no fetch allowed'));
    };
    globalThis.XMLHttpRequest = function() {
      xhrCalls++;
    };
    // Spec section 12: "No network call and no location request attributable to this pattern."
    // A granted permission is still a request, so the engine must not reach either API.
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        permissions: { query: async () => { permissionQueries++; return { state: 'granted' }; } },
        geolocation: { getCurrentPosition: () => { getCurrentPositionCalls++; } },
      },
    });

    try {
      const doc = createMockDoc();
      let currentMinutes = 0;
      const controller = createSunarcController({
        document: doc,
        window: { innerWidth: 1280, innerHeight: 820 },
        now: () => new Date(2026, 8, 19, Math.floor(currentMinutes / 60), currentMinutes % 60, 0),
        utcOffsetHours: -6,
        zoneId: 'America/Denver',
        getComputedStyle: () => ({ getPropertyValue: makeTokenReader() }),
      });
      controller.start();
      await Promise.resolve();
      await Promise.resolve();

      for (let m = 0; m < 1440; m += 15) {
        currentMinutes = m;
        controller.tick();
      }

      expect(fetchCalls).toBe(0);
      expect(xhrCalls).toBe(0);
      expect(permissionQueries).toBe(0);
      expect(getCurrentPositionCalls).toBe(0);
      // And the sweep ran on the zone's real times, not the fixed default.
      expect(controller.getSolarPair().rise).not.toBe(390);
      controller.stop();
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.XMLHttpRequest = originalXHR;
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
    }
  });

  it('13a. the shipped bundle names no location or network API', () => {
    for (const forbidden of ['navigator', 'getCurrentPosition', 'permissions.query', 'fetch(', 'XMLHttpRequest']) {
      expect(SUNARC_JS.includes(forbidden)).toBe(false);
    }
    // ...and it does carry the bundled zone table, since the table cannot be fetched.
    expect(SUNARC_JS.includes('America/Adak')).toBe(true);
    expect(SUNARC_JS.includes(',Denver:3974:-10498,')).toBe(true);
  });

  it('14. many resize events inside 250ms debounce window recompute once', () => {
    let tickCount = 0;
    const doc = createMockDoc();
    let resizeHandler = null;

    let nextTimerId = 1;
    const activeTimers = new Map();

    function fakeSetTimeout(fn, ms) {
      const id = nextTimerId++;
      activeTimers.set(id, { fn, ms });
      return id;
    }

    function fakeClearTimeout(id) {
      activeTimers.delete(id);
    }

    const controller = createSunarcController({
      document: doc,
      window: {
        innerWidth: 1280,
        innerHeight: 820,
        addEventListener: (event, handler) => {
          if (event === 'resize') resizeHandler = handler;
        },
        removeEventListener: () => {},
      },
      now: () => {
        tickCount++;
        return new Date(2026, 8, 19, 12, 0, 0);
      },
      getComputedStyle: () => ({ getPropertyValue: makeTokenReader() }),
      setTimeout: fakeSetTimeout,
      clearTimeout: fakeClearTimeout,
      setInterval: () => 1,
      clearInterval: () => {},
    });

    controller.start();
    const startTicks = tickCount;
    expect(startTicks).toBeGreaterThanOrEqual(1);

    // Fire 10 resize events inside 250ms window
    for (let i = 0; i < 10; i++) {
      if (resizeHandler) resizeHandler();
    }

    // Debounce has not elapsed yet; tick count has not changed
    expect(tickCount).toBe(startTicks);
    expect(activeTimers.size).toBe(1);

    // Advance/flush the single active timer (250ms)
    const [timer] = Array.from(activeTimers.values());
    activeTimers.clear();
    timer.fn();

    // Exactly one additional tick performed
    expect(tickCount).toBe(startTicks + 1);
    controller.stop();
  });

  it('15. stub non-numeric or invalid color tokens: fail-closed with opacity 0, no NaN position, and removes --sunarc-mixed', () => {
    const brokenNumReader = makeTokenReader({ '--sunarc-diameter-ratio': 'invalid-not-a-number' });
    const brokenColorReader = makeTokenReader({ '--sunarc-glow-color': 'not-a-valid-hex' });
    const brokenGroundReader = makeTokenReader({ '--sunarc-ground-dark-night': 'not-a-valid-hex' });
    const brokenCreamReader = makeTokenReader({ '--cream': 'not-a-valid-hex' });
    const missingTwilightReader = makeTokenReader({ '--sunarc-twilight-alpha-light': undefined });

    expect(parseTokens(brokenNumReader)).toBeNull();
    expect(parseTokens(brokenColorReader)).toBeNull();
    expect(parseTokens(brokenGroundReader)).toBeNull();
    expect(parseTokens(brokenCreamReader)).toBeNull();
    expect(parseTokens(missingTwilightReader)).toBeNull();

    const doc = createMockDoc();
    // Pre-populate with previous valid state
    doc.documentElement.style.setProperty('--sunarc-mixed', '#123456');
    doc.sun.style.left = '100px';
    doc.sun.style.top = '100px';

    const controller = createSunarcController({
      document: doc,
      window: { innerWidth: 1280, innerHeight: 820 },
      now: () => new Date(2026, 8, 19, 12, 0, 0),
      getComputedStyle: () => ({ getPropertyValue: brokenNumReader }),
    });
    controller.tick();

    expect(doc.sun.style.opacity).toBe('0');
    expect(doc.glow.style.opacity).toBe('0');
    expect(doc.twilight.style.opacity).toBe('0');
    expect(doc.documentElement.style.properties.has('--sunarc-mixed')).toBe(false);
    expect(doc.attributeWrites).toEqual([]);
    expect(doc.sun.style.left).not.toBe('NaNpx');
    expect(doc.sun.style.top).not.toBe('NaNpx');
  });

  it('14. the assembled SUNARC_JS bundle executes cleanly and drives a real recompute standalone, at every phase of the day and in both appearances', () => {
    // This is the artifact actually shipped: served at /sunarc.js and executed by a real
    // visitor's browser, a global scope that never loaded this worker's own build tooling.
    // Every other test in this file calls the exported functions directly as ordinary JS,
    // which would stay green even if the assembled string itself were broken (as it was in
    // production once: a deploy-time bundler transform left a stray reference to a
    // name-preservation helper in one re-emitted function body, caught only by loading the
    // live page and reading the console). `new Function` resolves free variables against
    // the true global object only, so window/document/navigator are passed as explicit
    // parameters, the same isolation a fresh browser tab has. `Date` is passed too, pinned,
    // so the evening, true-dark and pre-dawn branches run here whatever the CI clock says:
    // a helper missing from the assembly would otherwise pass a daytime run and throw every
    // minute from dusk onward. This does not reproduce the minification-only artifact (this
    // pool's bundler doesn't inject it), so it is not a substitute for the post-deploy
    // console check, but it proves the string is sound and complete standalone.
    // The times hold whether the runtime's zone resolves to a tzdb point or to rung 3.
    const cases = [
      { h: 13, m: 0, twilight: false },
      { h: 21, m: 0, twilight: true },
      { h: 1, m: 0, twilight: false },
      { h: 5, m: 30, twilight: true },
    ];
    for (const scheme of ['light', 'dark']) {
      for (const c of cases) {
        const fixed = new Date(2026, 8, 23, c.h, c.m, 0).getTime();
        class PinnedDate extends Date {
          constructor(...args) {
            if (args.length === 0) super(fixed);
            else super(...args);
          }
        }
        const doc = createMockDoc();
        const media = createMockMedia(scheme === 'dark');
        let intervalHandle = null;
        const fakeWindow = {
          innerWidth: 1280,
          innerHeight: 900,
          addEventListener() {},
          removeEventListener() {},
          setTimeout: (fn, ms) => setTimeout(fn, ms),
          clearTimeout: (id) => clearTimeout(id),
          setInterval: (fn, ms) => {
            intervalHandle = setInterval(fn, ms);
            return intervalHandle;
          },
          clearInterval: (id) => clearInterval(id),
          getComputedStyle: () => ({ getPropertyValue: makeTokenReader() }),
          matchMedia: media.matchMedia,
        };
        const fakeDocument = {
          getElementById: doc.getElementById,
          documentElement: doc.documentElement,
          addEventListener() {},
          removeEventListener() {},
          visibilityState: 'visible',
        };
        const run = new Function('window', 'document', 'navigator', 'Date', SUNARC_JS);
        try {
          expect(() => run(fakeWindow, fakeDocument, {}, PinnedDate)).not.toThrow();
          const label = `${scheme} ${c.h}:${c.m}`;
          expect(doc.sun.style.opacity, label).not.toBe('');
          expect(doc.twilight.style.opacity, label).toBe(c.twilight ? '1' : '0');
          if (c.twilight) expect(doc.twilight.style.background, label).toContain('radial-gradient(circle closest-side at center');
          const ground = parseColor(doc.documentElement.style.properties.get('--sunarc-mixed'));
          const L = rgbToOklab(ground[0], ground[1], ground[2])[0];
          expect(scheme === 'dark' ? L < 0.5 : L > 0.5, label).toBe(true);
          expect(media.listeners.size, label).toBe(1);
          expect(doc.attributeWrites, label).toEqual([]);
        } finally {
          if (intervalHandle) clearInterval(intervalHandle);
        }
      }
    }
  });
});

// The 2026-09-23 amendment: the day in both appearances. Vectors are the spec's section 4a table
// (numbers.js over SUNARC.both(), Denver 2026-09-23, rise 06:48 / set 18:56, iphone 393 x 852).
describe('sun arc in both appearances (spec sections 4a, 6, 7, 8a, 12)', () => {
  const RISE = 408.26;
  const SET = 1135.65;
  const VP = { w: 393, h: 852 };
  // The table's light day ground is surface cream; this page's own is tile cream (section 6).
  const specTokens = parseTokens(makeTokenReader({ '--cream': '#FEFCF8' }));

  function at(h, m) {
    return new Date(2026, 8, 23, h, m, 0);
  }

  function channelsWithin(hexA, hexB, tol) {
    const a = parseColor(hexA);
    const b = parseColor(hexB);
    return a.every((v, i) => Math.abs(v - b[i]) <= tol);
  }

  // A glow's alpha at a pixel: a -> 0.45a -> 0 at 0 / 38 / 100 % of the radius (SUNARC.glowAt).
  function glowAt(g, x, y) {
    const f = Math.hypot(x - g.x, y - g.y) / g.radius;
    if (f >= 1) return 0;
    return f <= 0.38 ? g.alpha * (1 - 0.55 * f / 0.38) : g.alpha * 0.45 * (1 - (f - 0.38) / 0.62);
  }

  const VECTORS = [
    { t: [13, 0], light: { ground: '#FEFCF8', sun: 0.55 }, dark: { ground: '#392E26', sun: 0.2 }, w: 0, phase: 'day' },
    {
      t: [18, 56], w: 0.734, phase: 'day', centre: [601.9, 1019.6],
      light: { ground: '#FEFCF7', sun: 0.144, alpha: 0.698, color: '#FFE296', corner: 0.373 },
      dark: { ground: '#392E26', sun: 0.053, alpha: 0.455, color: '#F9BA36', corner: 0.243 },
    },
    {
      t: [19, 41], w: 0.994, phase: 'evening', centre: [620.4, 1086.7],
      light: { ground: '#E9DECC', sun: 0, alpha: 0.944, color: '#FFE294', corner: 0.416 },
      dark: { ground: '#2E241C', sun: 0, alpha: 0.616, color: '#F8B836', corner: 0.272 },
    },
    {
      t: [22, 0], w: 0.434, phase: 'evening', centre: [642.3, 1176.8],
      light: { ground: '#DFD2BC', sun: 0, alpha: 0.412, color: '#FFDC7F', corner: 0.152 },
      dark: { ground: '#2B2119', sun: 0, alpha: 0.269, color: '#F1A739', corner: 0.099 },
    },
    { t: [1, 0], w: 0, phase: 'true dark', light: { ground: '#D7C9B0', sun: 0, alpha: 0, corner: 0 }, dark: { ground: '#281E17', sun: 0, alpha: 0, corner: 0 } },
    {
      t: [5, 30], w: 0.938, phase: 'before dawn', centre: [-249.9, -245.0],
      light: { ground: '#E8DDCA', sun: 0, alpha: 0.891, color: '#FFE08F', corner: 0.375 },
      dark: { ground: '#2E241C', sun: 0, alpha: 0.582, color: '#F6B437', corner: 0.245 },
    },
  ];

  for (const v of VECTORS) {
    for (const appearance of ['light', 'dark']) {
      const hm = `${String(v.t[0]).padStart(2, '0')}:${String(v.t[1]).padStart(2, '0')}`;
      it(`section 4a vector ${hm} ${appearance}`, () => {
        const want = v[appearance];
        const f = calculateFrame(at(v.t[0], v.t[1]), RISE, SET, appearance, VP, specTokens);
        expect(channelsWithin(f.ground, want.ground, 1), `${f.ground} vs ${want.ground}`).toBe(true);
        expect(Math.abs(f.opacity - want.sun)).toBeLessThan(0.002);
        expect(Math.abs(f.twilight.w - v.w)).toBeLessThan(0.002);
        expect(f.twilight.phase).toBe(v.phase);
        const g = f.twilightGlow;
        expect(Math.abs(g.alpha - (want.alpha || 0))).toBeLessThan(0.002);
        if (want.alpha) {
          expect(Math.abs(g.x - v.centre[0])).toBeLessThan(1);
          expect(Math.abs(g.y - v.centre[1])).toBeLessThan(1);
          expect(Math.abs(g.radius - 832.4)).toBeLessThan(0.5);
          expect(channelsWithin(g.color, want.color, 1), `${g.color} vs ${want.color}`).toBe(true);
          const corner = Math.max(glowAt(g, VP.w, VP.h), glowAt(g, 0, 0));
          expect(Math.abs(corner - want.corner)).toBeLessThan(0.003);
          // What the controller writes must draw exactly that circle: the 100% stop on the
          // 2r box's inscribed circle, never a size-less circle (farthest-corner, r * sqrt 2).
          expect(g.background.startsWith('radial-gradient(circle closest-side at center, ')).toBe(true);
          expect(g.background).toContain(' 38%, ');
        }
        if (v.t[0] === 13) {
          expect(f.halo.alpha).toBeCloseTo(0.22, 6);
          expect(f.halo.background.startsWith('radial-gradient(circle closest-side at center, ')).toBe(true);
        }
      });
    }
  }

  it('section 12: at dusk + 15 the corner reads at least 0.40 on light and 0.25 on dark', () => {
    const light = calculateFrame(at(19, 41), RISE, SET, 'light', VP, specTokens).twilightGlow;
    const dark = calculateFrame(at(19, 41), RISE, SET, 'dark', VP, specTokens).twilightGlow;
    expect(glowAt(light, VP.w, VP.h)).toBeGreaterThanOrEqual(0.4);
    expect(glowAt(dark, VP.w, VP.h)).toBeGreaterThanOrEqual(0.25);
  });

  it('section 6: the portal draws its own tile cream as the light day ground, and the table from dusk on', () => {
    expect(calculateFrame(at(13, 0), RISE, SET, 'light', VP, defaultTokens).ground).toBe('#FCF3E4');
    expect(calculateFrame(at(1, 0), RISE, SET, 'light', VP, defaultTokens).ground).toBe('#D7C9B0');
    expect(calculateFrame(at(13, 0), RISE, SET, 'dark', VP, defaultTokens).ground).toBe('#392E26');
  });

  it('the portal\'s own sunrise equation lands Denver 2026-09-23 on the table\'s 06:48 / 18:56', () => {
    const denver = parseZoneTable(SUNARC_ZONE_TABLE)['America/Denver'];
    const pair = solarPairFor(denver, new Date(Date.UTC(2026, 8, 23)), -6);
    expect(Math.abs(pair.rise - RISE)).toBeLessThan(1);
    expect(Math.abs(pair.set - SET)).toBeLessThan(1);
  });

  it('true dark: a 180-minute window centred on solar midnight with no glow and the deep ground', () => {
    // dusk 19:25.65, dawn 06:18.26 -> midpoint 00:51.95 -> window 23:21.95 to 02:21.95
    for (const [h, m] of [[23, 23], [0, 52], [2, 21]]) {
      for (const appearance of ['light', 'dark']) {
        const f = calculateFrame(at(h, m), RISE, SET, appearance, VP, specTokens);
        expect(f.twilight.phase).toBe('true dark');
        expect(f.twilightGlow.alpha).toBe(0);
        expect(f.ground).toBe(appearance === 'dark' ? '#281E17' : '#D7C9B0');
      }
    }
    expect(calculateFrame(at(23, 20), RISE, SET, 'dark', VP, specTokens).twilight.phase).toBe('evening');
    expect(calculateFrame(at(2, 23), RISE, SET, 'dark', VP, specTokens).twilight.phase).toBe('before dawn');
  });

  it('a sunset after midnight is read on one extended minute axis, and a short night eases instead of snapping', () => {
    // The canon's vectors (SUNARC.both(), rise 175 / set 3, a Reykjavik-like June night; dark, 393 x 852):
    // the sunset wraps below sunrise, so it is carried past 1440 and the small hours read on that axis.
    const cases = [
      { m: 10, phase: 'day', w: 0.877 },
      { m: 60, phase: 'evening', w: 0.672 },
      { m: 120, phase: 'before dawn', w: 0.716 },
    ];
    for (const c of cases) {
      const f = calculateFrame(new Date(2026, 5, 21, 0, c.m, 0), 175, 3, 'dark', VP, defaultTokens);
      expect(f.twilight.phase, `m ${c.m}`).toBe(c.phase);
      expect(Math.abs(f.twilight.w - c.w), `m ${c.m}`).toBeLessThan(0.002);
      if (c.phase === 'before dawn') {
        expect(f.twilight.te).toBeGreaterThanOrEqual(-0.1);
        expect(f.twilight.te).toBeLessThanOrEqual(0);
      }
    }
    // The same night, carried at the source by the portal's own equation, gives the same reading.
    const pair = solarPairFor(parseZoneTable(SUNARC_ZONE_TABLE)['Atlantic/Reykjavik'], new Date(Date.UTC(2026, 5, 21, 12)), 0);
    expect(pair.set).toBeGreaterThan(1440);
    const carried = calculateFrame(new Date(2026, 5, 21, 0, 10, 0), pair.rise, pair.set, 'dark', VP, defaultTokens);
    const wrapped = calculateFrame(new Date(2026, 5, 21, 0, 10, 0), pair.rise, pair.set - 1440, 'dark', VP, defaultTokens);
    expect(carried.twilight.phase).toBe('day');
    expect(wrapped.twilight.w).toBeCloseTo(carried.twilight.w, 9);
    expect(wrapped.ground).toBe(carried.ground);
    // A night of 120 minutes or less has no true dark at all, and never divides by zero.
    for (let m = 0; m < 1440; m += 5) {
      const f = calculateFrame(new Date(2026, 5, 21, Math.floor(m / 60), m % 60, 0), 175, 3, 'dark', VP, defaultTokens);
      expect(Number.isFinite(f.twilight.w), `m ${m}`).toBe(true);
      expect(f.twilight.phase, `m ${m}`).not.toBe('true dark');
    }
  });

  it('a sunrise before 00:30 reads the last clock minutes as tomorrow\'s dawn (the mirror)', () => {
    // The canon's vectors (SUNARC.both(), rise 20 / set 1300, dark, 393 x 852).
    const cases = [
      { m: 1425, phase: 'before dawn', w: 0.985 },
      { m: 1435, phase: 'day', t: 0.004, night: 0.83 },
      { m: 0, phase: 'day', t: 0.007 },
    ];
    for (const c of cases) {
      const f = calculateFrame(new Date(2026, 11, 21, Math.floor(c.m / 60), c.m % 60, 0), 20, 1300, 'dark', VP, defaultTokens);
      expect(f.twilight.phase, `m ${c.m}`).toBe(c.phase);
      if (c.w !== undefined) expect(Math.abs(f.twilight.w - c.w), `m ${c.m}`).toBeLessThan(0.002);
      if (c.t !== undefined) expect(Math.abs(f.time.t - c.t), `m ${c.m}`).toBeLessThan(0.001);
      if (c.night !== undefined) expect(Math.abs(f.time.nightAmount - c.night), `m ${c.m}`).toBeLessThan(0.005);
    }
  });

  it('the appearance is the system\'s from the first tick, and follows a change at noon and at 01:00 on the event', () => {
    for (const [h, m, lightGround, darkGround] of [[13, 0, '#FEFCF8', '#392E26'], [1, 0, '#D7C9B0', '#281E17']]) {
      const doc = createMockDoc();
      const media = createMockMedia(true);
      const controller = createSunarcController({
        document: doc,
        window: { innerWidth: 393, innerHeight: 852 },
        viewport: () => VP,
        now: () => at(h, m),
        utcOffsetHours: -6,
        zoneId: 'America/Denver',
        matchMedia: media.matchMedia,
        getComputedStyle: () => ({ getPropertyValue: makeTokenReader({ '--cream': '#FEFCF8' }) }),
      });
      controller.start();
      // Dark at start: the first tick draws the dark row, with no change event needed.
      expect(doc.documentElement.style.properties.get('--sunarc-mixed')).toBe(darkGround);
      expect(controller.getFrame().appearance).toBe('dark');
      if (h === 13) expect(Number(doc.sun.style.opacity)).toBeCloseTo(0.2, 6);

      media.set(false);
      expect(doc.documentElement.style.properties.get('--sunarc-mixed')).toBe(lightGround);
      if (h === 13) expect(Number(doc.sun.style.opacity)).toBeCloseTo(0.55, 6);

      media.set(true);
      expect(doc.documentElement.style.properties.get('--sunarc-mixed')).toBe(darkGround);
      expect(doc.attributeWrites).toEqual([]);

      controller.stop();
      expect(media.listeners.size).toBe(0);
    }
  });

  it('the twilight glow changes colour with the appearance on the same event', () => {
    const doc = createMockDoc();
    const media = createMockMedia(false);
    const controller = createSunarcController({
      document: doc,
      window: { innerWidth: 393, innerHeight: 852 },
      viewport: () => VP,
      now: () => at(19, 41),
      utcOffsetHours: -6,
      zoneId: 'America/Denver',
      matchMedia: media.matchMedia,
      getComputedStyle: () => ({ getPropertyValue: makeTokenReader() }),
    });
    controller.start();
    expect(controller.getFrame().appearance).toBe('light');
    const lightBg = doc.twilight.style.background;
    media.set(true);
    expect(controller.getFrame().appearance).toBe('dark');
    expect(doc.twilight.style.background).not.toBe(lightBg);
    expect(channelsWithin(controller.getFrame().twilightGlow.color, '#F8B836', 1)).toBe(true);
    controller.stop();
  });

  it('nothing sets the appearance by clock: a 24-hour sweep through the controller keeps each owner on their own side of L 0.5', () => {
    for (const dark of [false, true]) {
      let minutes = 0;
      const doc = createMockDoc();
      const media = createMockMedia(dark);
      const controller = createSunarcController({
        document: doc,
        window: { innerWidth: 1280, innerHeight: 820 },
        now: () => new Date(2026, 8, 23, Math.floor(minutes / 60), minutes % 60, 0),
        utcOffsetHours: -6,
        zoneId: 'America/Denver',
        matchMedia: media.matchMedia,
        getComputedStyle: () => ({ getPropertyValue: makeTokenReader() }),
      });
      controller.start();
      for (minutes = 0; minutes < 1440; minutes += 15) {
        controller.tick();
        const ground = parseColor(doc.documentElement.style.properties.get('--sunarc-mixed'));
        const L = rgbToOklab(ground[0], ground[1], ground[2])[0];
        expect(dark ? L < 0.5 : L > 0.5, `${dark ? 'dark' : 'light'} at ${minutes}`).toBe(true);
        expect(controller.getFrame().appearance).toBe(dark ? 'dark' : 'light');
      }
      expect(doc.attributeWrites).toEqual([]);
      controller.stop();
    }
    // And the shipped engine carries no way to set one.
    expect(SUNARC_JS).not.toContain('data-appearance');
    expect(SUNARC_JS).not.toContain('setAttribute');
    expect(SUNARC_JS).toContain("matchMedia('(prefers-color-scheme: dark)')");
  });

  it('with no matchMedia at all the portal stays in its light appearance', () => {
    const f = calculateFrame(at(13, 0), RISE, SET, 'light', VP, defaultTokens);
    const doc = createMockDoc();
    const controller = createSunarcController({
      document: doc,
      window: { innerWidth: 393, innerHeight: 852 },
      viewport: () => VP,
      now: () => at(13, 0),
      getComputedStyle: () => ({ getPropertyValue: makeTokenReader() }),
    });
    controller.tick();
    expect(controller.getFrame().appearance).toBe('light');
    expect(f.appearance).toBe('light');
  });
});

function createMockMedia(initial) {
  const listeners = new Set();
  const list = {
    matches: initial,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (type, fn) => { if (type === 'change') listeners.add(fn); },
    removeEventListener: (type, fn) => { if (type === 'change') listeners.delete(fn); },
  };
  return {
    listeners,
    matchMedia: (query) => {
      if (query !== '(prefers-color-scheme: dark)') throw new Error(`unexpected media query ${query}`);
      return list;
    },
    set(value) {
      list.matches = value;
      for (const fn of Array.from(listeners)) fn({ matches: value, media: list.media });
    },
  };
}

function createMockDoc() {
  const rootStyle = {
    properties: new Map(),
    setProperty: (k, v) => rootStyle.properties.set(k, v),
    removeProperty: (k) => rootStyle.properties.delete(k),
  };
  const rootAttrs = new Map();
  const attributeWrites = [];
  const sun = { style: {} };
  const glow = { style: {} };
  const twilight = { style: {} };
  const container = {
    style: {},
    querySelector: (sel) => {
      if (sel === '.sunarc-sun') return sun;
      if (sel === '.sunarc-glow') return glow;
      if (sel === '.sunarc-twilight') return twilight;
      return null;
    },
  };
  return {
    documentElement: {
      style: rootStyle,
      setAttribute: (k, v) => { attributeWrites.push([k, v]); rootAttrs.set(k, v); },
      getAttribute: (k) => rootAttrs.get(k),
      removeAttribute: (k) => rootAttrs.delete(k),
    },
    getElementById: (id) => (id === 'sunarc' ? container : null),
    sun,
    glow,
    twilight,
    container,
    attributeWrites,
  };
}
