import { describe, expect, it } from 'vitest';
import { PORTAL_CSS } from '../src/assets.js';
import {
  calculateArcGeometry,
  calculateGlow,
  calculateMixedGround,
  calculateSunTime,
  calculateTwoStepNight,
  createSunarcController,
  envelope,
  formatHex,
  noaaSolarTime,
  parseColor,
  parseTokens,
  parseZoneTable,
  rgbToOklab,
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

describe('night text surface', () => {
  it('places portal text on cream while keeping service cards on white', () => {
    expect(portalCssText).toMatch(/:root\[data-appearance="dark"\]\s+main\s*\{\s*background:\s*var\(--cream\);\s*border-radius:\s*var\(--radius\);\s*\}/);
    expect(portalCssText).toMatch(/\.group\s*\{\s*background:\s*var\(--paper\);/);
    expect(portalCssText).toMatch(/\.card\s*\{\s*background:\s*var\(--paper\);/);
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

  it('6. sweep q 0->1: glow alpha never below night-floor token; equals night-alpha at q=0 and q=1; equals night-floor at q=0.5', () => {
    const ptA = { x: -100, y: -100 };
    const ptB = { x: 500, y: 500 };
    for (let q = 0; q <= 1.001; q += 0.05) {
      const g = calculateGlow(0, defaultTokens.envelopeEdge, 1, q, 0, 0, ptA, ptB, 100, defaultTokens);
      expect(g.alpha).toBeGreaterThanOrEqual(defaultTokens.glowNightFloor - 1e-6);
    }
    const g0 = calculateGlow(0, defaultTokens.envelopeEdge, 1, 0, 0, 0, ptA, ptB, 100, defaultTokens);
    expect(g0.alpha).toBeCloseTo(defaultTokens.glowNightAlpha, 5);

    const g1 = calculateGlow(0, defaultTokens.envelopeEdge, 1, 1, 0, 0, ptA, ptB, 100, defaultTokens);
    expect(g1.alpha).toBeCloseTo(defaultTokens.glowNightAlpha, 5);

    const gHalf = calculateGlow(0, defaultTokens.envelopeEdge, 1, 0.5, 0, 0, ptA, ptB, 100, defaultTokens);
    expect(gHalf.alpha).toBeCloseTo(defaultTokens.glowNightFloor, 5);
  });

  it('7. glow position B for q < 0.5 and A for q > 0.5', () => {
    const ptA = { x: -469.1, y: -469.1 };
    const ptB = { x: 1749.1, y: 1289.1 };

    const gUnder = calculateGlow(0, defaultTokens.envelopeEdge, 1, 0.3, 0, 0, ptA, ptB, 100, defaultTokens);
    expect(Math.abs(gUnder.x - ptB.x) / Math.abs(ptB.x)).toBeLessThan(0.01);
    expect(Math.abs(gUnder.y - ptB.y) / Math.abs(ptB.y)).toBeLessThan(0.01);

    const gOver = calculateGlow(0, defaultTokens.envelopeEdge, 1, 0.7, 0, 0, ptA, ptB, 100, defaultTokens);
    expect(Math.abs(gOver.x - ptA.x) / Math.abs(ptA.x)).toBeLessThan(0.01);
    expect(Math.abs(gOver.y - ptA.y) / Math.abs(ptA.y)).toBeLessThan(0.01);
  });

  it('8. day ground = default cream; nightAmount 1: mixed night ground equals --sunarc-night-ground', () => {
    const tokenHex = extractCssVar(portalCssText, '--sunarc-night-ground');
    const computedRgb = calculateMixedGround(
      defaultTokens.cream,
      defaultTokens.ink,
      defaultTokens.warmDark,
      defaultTokens.inkMix,
      defaultTokens.warmMix,
      1
    );
    const computedHex = formatHex(computedRgb);
    expect(computedHex).toBe(tokenHex);
  });

  it('9. different day-ground at nightAmount 1 is not default night-ground token; at nightAmount 0.5 L is intermediate', () => {
    const customDay = [200, 230, 255]; // cool blue day ground
    const fullNight = calculateMixedGround(
      customDay,
      defaultTokens.ink,
      defaultTokens.warmDark,
      defaultTokens.inkMix,
      defaultTokens.warmMix,
      1
    );
    const defaultNightTokenHex = extractCssVar(portalCssText, '--sunarc-night-ground');
    expect(formatHex(fullNight)).not.toBe(defaultNightTokenHex);

    const halfNight = calculateMixedGround(
      customDay,
      defaultTokens.ink,
      defaultTokens.warmDark,
      defaultTokens.inkMix,
      defaultTokens.warmMix,
      0.5
    );
    const labDay = rgbToOklab(customDay[0], customDay[1], customDay[2]);
    const labFull = rgbToOklab(fullNight[0], fullNight[1], fullNight[2]);
    const labHalf = rgbToOklab(halfNight[0], halfNight[1], halfNight[2]);

    expect(labHalf[0]).toBeLessThan(labDay[0]);
    expect(labHalf[0]).toBeGreaterThan(labFull[0]);
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

  it('12. appearance signal changes exactly once across dawn twilight and dusk twilight at flip threshold', () => {
    const steps = 100;
    let lastDawnApp = null;
    let dawnFlips = 0;
    for (let i = 0; i <= steps; i++) {
      const nightAmount = 1 - i / steps; // 1 -> 0 across dawn
      const rgb = calculateMixedGround(
        defaultTokens.cream,
        defaultTokens.ink,
        defaultTokens.warmDark,
        defaultTokens.inkMix,
        defaultTokens.warmMix,
        nightAmount
      );
      const lab = rgbToOklab(rgb[0], rgb[1], rgb[2]);
      const app = lab[0] < defaultTokens.appearanceFlip ? 'dark' : 'light';
      if (lastDawnApp && app !== lastDawnApp) {
        dawnFlips++;
      }
      lastDawnApp = app;
    }
    expect(dawnFlips).toBe(1);

    let lastDuskApp = null;
    let duskFlips = 0;
    for (let i = 0; i <= steps; i++) {
      const nightAmount = i / steps; // 0 -> 1 across dusk
      const rgb = calculateMixedGround(
        defaultTokens.cream,
        defaultTokens.ink,
        defaultTokens.warmDark,
        defaultTokens.inkMix,
        defaultTokens.warmMix,
        nightAmount
      );
      const lab = rgbToOklab(rgb[0], rgb[1], rgb[2]);
      const app = lab[0] < defaultTokens.appearanceFlip ? 'dark' : 'light';
      if (lastDuskApp && app !== lastDuskApp) {
        duskFlips++;
      }
      lastDuskApp = app;
    }
    expect(duskFlips).toBe(1);
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

  it('15. stub non-numeric or invalid color tokens: fail-closed with opacity 0, no NaN position, and removes --sunarc-mixed/data-appearance', () => {
    const brokenNumReader = makeTokenReader({ '--sunarc-diameter-ratio': 'invalid-not-a-number' });
    const brokenColorReader = makeTokenReader({ '--sunarc-glow-color': 'not-a-valid-hex' });
    const brokenNightGroundReader = makeTokenReader({ '--sunarc-night-ground': 'not-a-valid-hex' });
    const brokenCreamReader = makeTokenReader({ '--cream': 'not-a-valid-hex' });

    expect(parseTokens(brokenNumReader)).toBeNull();
    expect(parseTokens(brokenColorReader)).toBeNull();
    expect(parseTokens(brokenNightGroundReader)).toBeNull();
    expect(parseTokens(brokenCreamReader)).toBeNull();

    const doc = createMockDoc();
    // Pre-populate with previous valid state
    doc.documentElement.style.setProperty('--sunarc-mixed', '#123456');
    doc.documentElement.setAttribute('data-appearance', 'dark');
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
    expect(doc.documentElement.style.properties.has('--sunarc-mixed')).toBe(false);
    expect(doc.documentElement.getAttribute('data-appearance')).toBeUndefined();
    expect(doc.sun.style.left).not.toBe('NaNpx');
    expect(doc.sun.style.top).not.toBe('NaNpx');
  });

  it('14. the assembled SUNARC_JS bundle executes cleanly and drives a real recompute standalone', () => {
    // This is the artifact actually shipped: html.js inlines SUNARC_JS verbatim
    // into a <script> tag on every page, executed by a real visitor's browser —
    // a global scope that never loaded this worker's own build tooling. Every
    // other test in this file calls the exported functions directly as
    // ordinary JS, which sidesteps that gap entirely and would stay green even
    // if the assembled string itself were broken (as it was in production
    // once: a deploy-time bundler transform left a stray reference to a
    // name-preservation helper in one re-emitted function body, invisible to
    // source review and to every test that only calls the functions directly
    // — caught only by loading the live page and reading the console).
    // `new Function` resolves free variables against the true global object
    // only, never this test module's lexical scope, so window/document/
    // navigator must be passed as explicit parameters rather than closed over
    // — the same isolation a fresh browser tab has. This does not reproduce
    // the specific minification-only artifact above (this pool's own dev
    // bundler doesn't inject it), so it is not a substitute for a post-deploy
    // console check on that class of defect — but it does prove the string is
    // syntactically sound and functionally complete standalone.
    const doc = createMockDoc();
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
    };
    const fakeDocument = {
      getElementById: doc.getElementById,
      documentElement: doc.documentElement,
      addEventListener() {},
      removeEventListener() {},
      visibilityState: 'visible',
    };
    // `new Function` bodies only ever resolve free variables against the true
    // global object, never against this test module's local/lexical scope —
    // the same isolation a fresh browser tab has from this worker's own build
    // output. Passing window/document/navigator as explicit PARAMETERS (not
    // relying on globals) means the only way the code can reach a name like
    // `__name` is if SUNARC_JS defines it itself.
    const run = new Function('window', 'document', 'navigator', SUNARC_JS);

    try {
      expect(() => {
        run(fakeWindow, fakeDocument, {});
      }).not.toThrow();
      // A real recompute must actually have run, not merely "not thrown" —
      // confirm it drove the mock DOM the same way createSunarcController's
      // own direct-call tests already verify it should.
      expect(doc.sun.style.opacity).not.toBe('');
    } finally {
      if (intervalHandle) clearInterval(intervalHandle);
    }
  });
});

function createMockDoc() {
  const rootStyle = {
    properties: new Map(),
    setProperty: (k, v) => rootStyle.properties.set(k, v),
    removeProperty: (k) => rootStyle.properties.delete(k),
  };
  const rootAttrs = new Map();
  const sun = { style: {} };
  const glow = { style: {} };
  const container = {
    style: {},
    querySelector: (sel) => {
      if (sel === '.sunarc-sun') return sun;
      if (sel === '.sunarc-glow') return glow;
      return null;
    },
  };
  return {
    documentElement: {
      style: rootStyle,
      setAttribute: (k, v) => rootAttrs.set(k, v),
      getAttribute: (k) => rootAttrs.get(k),
      removeAttribute: (k) => rootAttrs.delete(k),
    },
    getElementById: (id) => (id === 'sunarc' ? container : null),
    sun,
    glow,
    container,
  };
}
