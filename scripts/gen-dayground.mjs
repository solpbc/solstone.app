#!/usr/bin/env node
// Writes the dayground's published files from the engine this site runs:
//
//   public/brand/dayground/dayground.js    the engine as one ES module, no dependencies
//   public/brand/dayground/dayground.json  worked numbers, computed by that module
//   public/brand/dayground.md              the page's words as one markdown file
//   public/brand/dayground.html            the same words, between the gen markers
//
// The engine is account/src/sunarc.js and its night sky, the same functions
// scripts/gen-sunarc.mjs assembles for every page's background, with the values
// from public/static/site.css. The words are scripts/dayground/dayground.src.md;
// its {{...}} slots are tables filled from the vectors, so the spec's numbers are
// the module's numbers.
//
//   node scripts/gen-dayground.mjs          write all four
//   node scripts/gen-dayground.mjs --check  write nothing; exit 1 if any is stale
//
// `make dayground` runs the first, `make deploy` runs the second: a deploy never
// regenerates these files, and refuses to ship a stale copy.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as engine from '../account/src/sunarc.js';
import { installNightSky } from '../account/src/night-sky.js';
import { installNightLayer } from '../account/src/night-layer.js';
import { renderMarkdown } from './dayground/markdown.mjs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

export const OUT = {
  module: 'public/brand/dayground/dayground.js',
  vectors: 'public/brand/dayground/dayground.json',
  markdown: 'public/brand/dayground.md',
  page: 'public/brand/dayground.html',
};

// The engine values, exactly as the site's pages declare them.
export function cssValues() {
  const site = read('public/static/site.css');
  const block = site.slice(site.indexOf(':root'), site.indexOf('}', site.indexOf(':root')));
  const out = {};
  for (const m of block.matchAll(/(--sunarc-[a-z-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  const orange = read('public/static/tokens.css').match(/--orange:\s*([^;]+);/);
  if (!orange) throw new Error('--orange not found in tokens.css');
  out['--orange'] = orange[1].trim();
  if (!engine.parseTokens((n) => out[n])) throw new Error('site.css is missing a sun-arc engine value');
  return out;
}

function markSvg() {
  return read('public/brand/assets/solstone/svg/mark.svg')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n\s*/g, '')
    .trim();
}

// The functions every page's background runs, in the order the site's script carries them.
const ENGINE_FUNCTIONS = [
  'parseZoneTable', 'systemZoneId', 'degToRad', 'radToDeg', 'sinDeg', 'cosDeg', 'tanDeg', 'asinDeg', 'acosDeg',
  'atanDeg', 'srgbToLinear', 'linearToSrgb', 'rgbToOklab', 'oklabToRgb', 'mixOklab', 'parseColor', 'formatHex',
  'formatRgba', 'parseTokens', 'noaaSolarTime', 'solarPairFor', 'calculateSunTime', 'envelope', 'sunOpacity',
  'calculateArcGeometry', 'radialBackground', 'calculateHalo', 'twilightEase', 'twilightWeight', 'calculateGround',
  'calculateTwilightGlow', 'calculateFrame', 'createSunarcController',
];

export function buildModule() {
  for (const name of ENGINE_FUNCTIONS) {
    if (typeof engine[name] !== 'function') throw new Error(`the engine no longer exports ${name}`);
  }
  if (!engine.SUNARC_JS.includes(engine.createSunarcController.toString())) {
    throw new Error('the site script and the engine source disagree');
  }
  const css = cssValues();
  return `// SPDX-License-Identifier: MIT · Copyright (c) 2026 solpbc · https://github.com/solpbc/solstone.app/blob/main/LICENSE
// dayground.js: solstone's time-of-day background. The spec is https://solstone.app/brand/dayground.md
// This is the engine solstone.app runs, as one ES module with no dependencies. It makes no network call
// and never asks for a location: sunrise and sunset come from the device's timezone and a bundled table.
// Copy this file into what you build. Generated from the solstone.app engine; do not hand-edit.

function __name(fn) { return fn; }
const night = {};
(${installNightSky.toString()})(night);
const NightSky = night.NightSky;
const NightSkyMath = night.NightSkyMath;
(${installNightLayer.toString()})(night);
const createNightLayer = night.createNightLayer;

const SUNARC_ZONE_TABLE = ${JSON.stringify(engine.SUNARC_ZONE_TABLE)};
const SUNARC_ZONE_COUNT = ${engine.SUNARC_ZONE_COUNT};
${ENGINE_FUNCTIONS.map((name) => engine[name].toString()).join('\n')}

// The values, as the CSS custom properties solstone.app declares them.
export const CSS_VALUES = Object.freeze(${JSON.stringify(css, null, 2)});
// The same values, parsed: what every function below takes as \`tokens\`.
export const VALUES = parseTokens(function (name) { return CSS_VALUES[name]; });
// The logo the dayground draws: mark.svg.
export const MARK_SVG = ${JSON.stringify(markSvg())};

let zones = null;
// A zone identifier's reference point from the bundled table, or null.
export function zonePoint(zoneId) {
  if (!zones) zones = parseZoneTable(SUNARC_ZONE_TABLE);
  return (typeof zoneId === 'string' && zones[zoneId]) || null;
}

// Sunrise and sunset in local minutes for a date, from the zone's point (rise 06:30 and set 19:30 for a
// zone the table does not know). A sunset after local midnight comes back above 1440.
export function sunTimes(date, zoneId, utcOffsetHours) {
  date = date || new Date();
  if (zoneId === undefined) zoneId = systemZoneId();
  if (utcOffsetHours === undefined) utcOffsetHours = -date.getTimezoneOffset() / 60;
  return solarPairFor(zonePoint(zoneId), date, utcOffsetHours) || { rise: 390, set: 1170 };
}

// One frame: ground, sun, halo and twilight glow for a clock time on a width x height surface.
// appearance is 'light' or 'dark', the owner's own setting. Pure.
export function frame(date, width, height, appearance, times) {
  times = times || sunTimes(date);
  return calculateFrame(date, times.rise, times.set, appearance, { w: width, h: height }, VALUES);
}

// Draw the dayground behind a web page and keep it on the minute. It stops while the page is hidden and
// returns { stop, tick, getFrame, getSolarPair }. Leave the page's own background transparent.
// options.heldLocation ({ lat, lon }) is for a position the app already holds for its own reasons.
export function mount(options) {
  options = options || {};
  const win = options.window || globalThis.window;
  const doc = options.document || win.document;
  let box = doc.getElementById('sunarc');
  if (!box) {
    box = doc.createElement('div');
    box.id = 'sunarc';
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = 'position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none;background:var(--sunarc-mixed)';
    const layer = 'position:absolute;pointer-events:none;opacity:0';
    box.innerHTML = '<div class="sunarc-twilight" style="' + layer + '"></div><div class="sunarc-glow" style="' + layer +
      '"></div><div class="sunarc-sun" style="' + layer + '">' +
      MARK_SVG.replace('<svg ', '<svg style="width:100%;height:100%;display:block" aria-hidden="true" ') + '</div>';
    doc.body.insertBefore(box, doc.body.firstChild);
  }
  if (typeof globalThis.createNightLayer !== 'function') globalThis.createNightLayer = createNightLayer;
  return createSunarcController({
    window: win,
    document: doc,
    now: function () { return new Date(); },
    viewport: function () { return { w: win.innerWidth, h: win.innerHeight }; },
    getComputedStyle: function () { return { getPropertyValue: function (name) { return CSS_VALUES[name] || ''; } }; },
    setTimeout: win.setTimeout.bind(win),
    clearTimeout: win.clearTimeout.bind(win),
    setInterval: win.setInterval.bind(win),
    clearInterval: win.clearInterval.bind(win),
    matchMedia: typeof win.matchMedia === 'function' ? win.matchMedia.bind(win) : null,
    heldLocation: options.heldLocation || null,
  }).start();
}

export {
  SUNARC_ZONE_TABLE as ZONE_TABLE, SUNARC_ZONE_COUNT as ZONE_COUNT, parseZoneTable, systemZoneId, noaaSolarTime,
  solarPairFor, calculateSunTime, envelope, sunOpacity, calculateArcGeometry, calculateHalo, twilightWeight,
  calculateGround, calculateTwilightGlow, calculateFrame, createSunarcController, mixOklab, parseColor, formatHex,
  formatRgba, NightSky, NightSkyMath, createNightLayer,
};
`;
}

export async function importModule(source) {
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}

// ---- the worked numbers -------------------------------------------------------------------------

export const FRAMES = [
  { name: 'phone', w: 393, h: 852 },
  { name: 'tablet', w: 1180, h: 820 },
  { name: 'web', w: 1280, h: 820 },
  { name: 'watch', w: 416, h: 496 },
];

const r4 = (v) => Math.round(v * 1e6) / 1e6;
const hm = (m) => {
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0');
};
const clockDate = (dateStr, minute) => {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d, Math.floor(minute / 60), minute % 60, 0);
};
const noonUtc = (dateStr) => {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, 12));
};
// a glow's alpha at a point: a, 0.45 a at 38 %, 0 at 100 % of its radius
const glowAt = (g, x, y) => {
  const f = Math.hypot(x - g.x, y - g.y) / g.radius;
  if (f >= 1) return 0;
  return f <= 0.38 ? g.alpha * (1 - 0.55 * f / 0.38) : g.alpha * 0.45 * (1 - (f - 0.38) / 0.62);
};

export function buildVectors(mod) {
  const V = mod.VALUES;
  const geom = (w, h, t) => mod.calculateArcGeometry(w, h, V.diameterRatio, V.bowRatio, V.overshoot, V.arcAngle, t);

  const geometry = FRAMES.map((f) => {
    const g = geom(f.w, f.h, 0.5);
    return {
      frame: f.name, input: { width: f.w, height: f.h, t: 0.5 },
      expect: {
        side: Math.min(f.w, f.h), diameter: r4(g.diam), R: r4(g.r), A: [r4(g.ax), r4(g.ay)], B: [r4(g.bx), r4(g.by)],
        chord: r4(g.c), sagitta: r4(g.s), arcRadius: r4(g.rArc), centre: [r4(g.ox), r4(g.oy)], subtendedDeg: r4(g.subtendedDeg),
        position: [r4(g.x), r4(g.y)], haloRadius: r4(V.glowRadiusRatio * g.r), twilightRadius: r4(V.twilightRadiusRatio * g.r),
      },
    };
  });
  const path = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map((t) => {
    const g = geom(393, 852, t);
    return { frame: 'phone', input: { width: 393, height: 852, t }, expect: { position: [r4(g.x), r4(g.y)] } };
  });

  const PLACES = [
    { zone: 'America/Denver', date: '2026-09-19', utcOffsetHours: -6 },
    { zone: 'America/Denver', date: '2026-09-23', utcOffsetHours: -6 },
    { zone: 'Atlantic/Reykjavik', date: '2026-06-21', utcOffsetHours: 0 },
    { zone: 'Europe/London', date: '2026-12-21', utcOffsetHours: 0 },
    { zone: 'Australia/Sydney', date: '2026-12-21', utcOffsetHours: 11 },
  ];
  const sunTimes = PLACES.map((p) => {
    const pt = mod.zonePoint(p.zone);
    const pair = mod.solarPairFor(pt, noonUtc(p.date), p.utcOffsetHours);
    return {
      input: { zone: p.zone, lat: pt.lat, lon: pt.lon, date: p.date, utcOffsetHours: p.utcOffsetHours },
      expect: { rise: r4(pair.rise), set: r4(pair.set), riseClock: hm(pair.rise), setClock: hm(pair.set) },
    };
  });

  const d19 = sunTimes[0].expect;
  const day = [330, 374, 404, 480, 600, 773, 900, 1050, 1142, 1172, 1320].map((m) => {
    const s = mod.calculateSunTime(clockDate('2026-09-19', m), d19.rise, d19.set, V.twilightMinutes);
    return {
      input: { date: '2026-09-19', clock: hm(m), rise: d19.rise, set: d19.set },
      expect: { t: r4(s.t), night: r4(s.nightAmount), env: r4(mod.envelope(s.t, V.envelopeEdge)) },
    };
  });

  const d23 = sunTimes[1].expect;
  const clocks = [13 * 60, Math.round(d23.set), Math.round(d23.set) + 45, 22 * 60, 60, 5 * 60 + 30, Math.round(d23.rise)];
  const frames = [];
  for (const m of clocks) {
    for (const appearance of ['light', 'dark']) {
      const fr = mod.calculateFrame(clockDate('2026-09-23', m), d23.rise, d23.set, appearance, { w: 393, h: 852 }, V);
      const tg = fr.twilightGlow;
      frames.push({
        input: { date: '2026-09-23', clock: hm(m), rise: d23.rise, set: d23.set, appearance, width: 393, height: 852 },
        expect: {
          ground: fr.ground, sunOpacity: r4(fr.opacity), sunPosition: [r4(fr.geom.x), r4(fr.geom.y)],
          haloAlpha: r4(fr.halo.alpha), w: r4(fr.twilight.w), phase: fr.twilight.phase,
          twilight: tg.alpha > 0
            ? { position: [r4(tg.x), r4(tg.y)], radius: r4(tg.radius), alpha: r4(tg.alpha), color: tg.color,
                cornerAlpha: r4(Math.max(glowAt(tg, 393, 852), glowAt(tg, 0, 0))) }
            : null,
        },
      });
    }
  }

  // the night sky on the phone frame: what a port's seeded generator reproduces
  const g = mod.NightSkyMath.geometry(393, 852);
  const stars = mod.NightSkyMath.catalogue(g);
  const meteors = mod.NightSkyMath.meteors(g);
  const sun23 = { rise: d23.rise, set: d23.set };
  const mid = mod.NightSkyMath.state(g, { t: 2, night: 1, w: 0 }, sun23, 0).mid;
  const nightSky = {
    input: { width: 393, height: 852, rise: d23.rise, set: d23.set },
    expect: {
      solarMidnight: r4(mid), solarMidnightClock: hm(mid), stars: stars.length,
      firstStars: stars.slice(0, 3).map((s) => ({ x: r4(s.x), y: r4(s.y), level: s.lv })),
      meteors: meteors.map((x) => ({ start: r4(x.t0), duration: r4(x.dur), beam: x.k, length: r4(x.len) })),
    },
  };

  return {
    about: 'Worked numbers for the dayground, computed by dayground.js. Each vector gives its inputs and what the engine returns for them. Times are local minutes since midnight; positions are pixels from the top-left corner, y down.',
    spec: 'https://solstone.app/brand/dayground.md',
    module: 'https://solstone.app/brand/dayground/dayground.js',
    values: mod.CSS_VALUES,
    geometry, path, sunTimes, day, frames, nightSky,
  };
}

// ---- the words ---------------------------------------------------------------------------------

const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1).replace(/^-0\.0$/, '0.0').replace('-', '−');
const f3 = (v) => v.toFixed(3);
const pt = (p) => `(${f1(p[0])}, ${f1(p[1])})`;

function tables(vec) {
  const out = {};
  out['table:geometry'] = [
    '| frame | W × H | side | logo Ø | R | A | B | chord c | sagitta s | arc radius | centre O | P(½) | halo radius |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...vec.geometry.map((v) => {
      const e = v.expect;
      return `| ${v.frame} | ${v.input.width} × ${v.input.height} | ${e.side} | ${f1(e.diameter)} | ${f1(e.R)} | ${pt(e.A)} | ${pt(e.B)} | ${f1(e.chord)} | ${f1(e.sagitta)} | ${f1(e.arcRadius)} | ${pt(e.centre)} | ${pt(e.position)} | ${f1(e.haloRadius)} |`;
    }),
  ].join('\n');
  out['line:path'] = vec.path.filter((v) => v.input.t > 0 && v.input.t < 1 && v.input.t !== 0.5)
    .map((v) => `t = ${v.input.t} → ${pt(v.expect.position)}`).join(' · ');
  const d19 = vec.sunTimes[0].expect;
  out['line:denver19'] = `sunrise ${d19.riseClock}, sunset ${d19.setClock}, dawn ${hmOf(d19.rise - 30)}, dusk ${hmOf(d19.set + 30)}`;
  out['table:day'] = [
    '| clock | t | night | env |',
    '|---|---|---|---|',
    ...vec.day.map((v) => `| ${v.input.clock} | ${f3(v.expect.t)} | ${v.expect.night.toFixed(2)} | ${f3(v.expect.env)} |`),
  ].join('\n');
  const d23 = vec.sunTimes[1].expect;
  const nightRow = vec.nightSky.expect;
  out['line:denver23'] = `sunrise ${d23.riseClock}, sunset ${d23.setClock}, solar midnight ${nightRow.solarMidnightClock}`;
  const rows = [];
  for (let i = 0; i < vec.frames.length; i += 2) {
    const L = vec.frames[i], D = vec.frames[i + 1];
    const glow = (v) => v.expect.twilight
      ? `${pt(v.expect.twilight.position)} · ${f3(v.expect.twilight.alpha)} \`${v.expect.twilight.color}\``
      : 'none';
    const corner = L.expect.twilight ? `${f3(L.expect.twilight.cornerAlpha)} · ${f3(D.expect.twilight.cornerAlpha)}` : '0';
    rows.push(`| ${L.input.clock} | \`${L.expect.ground}\` · \`${D.expect.ground}\` | ${f3(L.expect.sunOpacity)} · ${f3(D.expect.sunOpacity)} | ${f3(L.expect.w)} · ${L.expect.phase} | ${glow(L)} | ${glow(D)} | ${corner} |`);
  }
  out['table:frames'] = [
    '| clock | ground, light · dark | logo opacity, light · dark | w · phase | twilight glow on light: centre · alpha · color | on dark | alpha at the corner, light · dark |',
    '|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
  out['line:twilightRadius'] = f1(vec.geometry[0].expect.twilightRadius);
  out['line:stars'] = String(nightRow.stars);
  return out;
}
const hmOf = (m) => hm(m);

export function fillSource(src, vec) {
  const t = tables(vec);
  return src.replace(/\{\{([a-z]+:[A-Za-z0-9]+)\}\}/g, (all, key) => {
    if (!(key in t)) throw new Error(`unknown slot ${all}`);
    return t[key];
  });
}

// Split the filled source into its sections: <!-- section:name --> markers.
export function sections(md) {
  const out = {};
  const parts = md.split(/^<!-- section:([a-z]+) -->\n/m);
  for (let i = 1; i < parts.length; i += 2) out[parts[i]] = parts[i + 1].trim() + '\n';
  return out;
}

export function buildMarkdown(filled) {
  return filled.replace(/^<!-- section:[a-z]+ -->\n/gm, '').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function buildPage(page, secs) {
  let out = page;
  for (const [name, md] of Object.entries(secs)) {
    const begin = `<!-- gen:dayground:${name}:begin -->`;
    const end = `<!-- gen:dayground:${name}:end -->`;
    const a = out.indexOf(begin), b = out.indexOf(end);
    if (a < 0 || b < a) throw new Error(`the page has no ${name} markers`);
    out = out.slice(0, a + begin.length) + '\n' + renderMarkdown(md, { shiftHeadings: 0 }) + out.slice(b);
  }
  return out;
}

export async function buildAll() {
  const source = buildModule();
  const mod = await importModule(source);
  const vec = buildVectors(mod);
  const filled = fillSource(read('scripts/dayground/dayground.src.md'), vec);
  const secs = sections(filled);
  delete secs.title;
  return {
    [OUT.module]: source,
    [OUT.vectors]: JSON.stringify(vec, null, 2) + '\n',
    [OUT.markdown]: buildMarkdown(filled),
    [OUT.page]: buildPage(read(OUT.page), secs),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes('--check');
  const files = await buildAll();
  const stale = [];
  for (const [path, body] of Object.entries(files)) {
    let current = null;
    try { current = read(path); } catch { current = null; }
    if (current === body) continue;
    if (check) stale.push(path);
    else { mkdirSync(new URL('.', new URL(path, root)), { recursive: true }); writeFileSync(new URL(path, root), body); console.log('wrote ' + path); }
  }
  if (check && stale.length) {
    console.error('stale dayground files: ' + stale.join(', ') + '\nrun `make dayground`, review the diff and commit it.');
    process.exit(1);
  }
  if (check) console.log('dayground files are current');
}
