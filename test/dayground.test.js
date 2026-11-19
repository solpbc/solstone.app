// /brand/dayground: the published engine runs with no network and no location call, reproduces
// every worked number in dayground.json, and the generated files (engine, numbers, markdown, page)
// match their sources, so the page and dayground.md carry the same words.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildAll, OUT } from "../scripts/gen-dayground.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const vectors = JSON.parse(read(OUT.vectors));
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 1e-5, `${label}: ${actual} vs ${expected}`);
const closeAll = (actual, expected, label) => expected.forEach((v, i) => close(actual[i], v, `${label}[${i}]`));

let mod;
test("the module imports and runs with no network and no location call", async (t) => {
  t.mock.method(globalThis, "fetch", () => assert.fail("the dayground made a network call"));
  Object.defineProperty(globalThis, "navigator", { value: { geolocation: { getCurrentPosition: () => assert.fail("location"), watchPosition: () => assert.fail("location") } }, configurable: true });
  mod = await import("../public/brand/dayground/dayground.js");
  const date = new Date(2026, 8, 23, 13, 0);
  const times = mod.sunTimes(date, "America/Denver", -6);
  const f = mod.frame(date, 393, 852, "light", times);
  assert.equal(f.ground, "#FEFCF8");
  assert.ok(f.opacity > 0.5);
  assert.equal(mod.ZONE_COUNT, 418);
  const src = read(OUT.module);
  assert.match(src.split("\n")[0], /^\/\/ SPDX-License-Identifier: MIT/);
  for (const call of ["fetch(", "XMLHttpRequest", "WebSocket", "sendBeacon", "geolocation", "EventSource", "import("]) {
    assert.ok(!src.includes(call), `dayground.js contains ${call}`);
  }
});

test("every vector in dayground.json comes out of the module", async () => {
  mod ??= await import("../public/brand/dayground/dayground.js");
  const V = mod.VALUES;
  assert.deepEqual(vectors.values, mod.CSS_VALUES);
  for (const v of [...vectors.geometry, ...vectors.path]) {
    const g = mod.calculateArcGeometry(v.input.width, v.input.height, V.diameterRatio, V.bowRatio, V.overshoot, V.arcAngle, v.input.t);
    closeAll([g.x, g.y], v.expect.position, `${v.frame} t=${v.input.t}`);
    if (v.expect.chord !== undefined) {
      close(g.c, v.expect.chord, "chord"); close(g.s, v.expect.sagitta, "sagitta"); close(g.rArc, v.expect.arcRadius, "arc radius");
      closeAll([g.ox, g.oy], v.expect.centre, "centre"); closeAll([g.ax, g.ay], v.expect.A, "A"); closeAll([g.bx, g.by], v.expect.B, "B");
      close(g.r, v.expect.R, "R"); close(g.subtendedDeg, v.expect.subtendedDeg, "subtended");
      assert.ok(Math.abs(g.subtendedDeg - 36) <= 0.1, "the arc subtends 36° ± 0.1°");
    }
  }
  for (const v of vectors.sunTimes) {
    const [y, m, d] = v.input.date.split("-").map(Number);
    const pair = mod.solarPairFor(mod.zonePoint(v.input.zone), new Date(Date.UTC(y, m - 1, d, 12)), v.input.utcOffsetHours);
    close(pair.rise, v.expect.rise, `${v.input.zone} rise`); close(pair.set, v.expect.set, `${v.input.zone} set`);
  }
  const at = (date, clock) => { const [y, m, d] = date.split("-").map(Number); const [h, mi] = clock.split(":").map(Number); return new Date(y, m - 1, d, h, mi); };
  for (const v of vectors.day) {
    const s = mod.calculateSunTime(at(v.input.date, v.input.clock), v.input.rise, v.input.set, V.twilightMinutes);
    close(s.t, v.expect.t, `${v.input.clock} t`); close(s.nightAmount, v.expect.night, `${v.input.clock} night`);
    close(mod.envelope(s.t, V.envelopeEdge), v.expect.env, `${v.input.clock} env`);
  }
  for (const v of vectors.frames) {
    const f = mod.calculateFrame(at(v.input.date, v.input.clock), v.input.rise, v.input.set, v.input.appearance, { w: v.input.width, h: v.input.height }, V);
    const label = `${v.input.clock} ${v.input.appearance}`;
    assert.equal(f.ground, v.expect.ground, label);
    close(f.opacity, v.expect.sunOpacity, label); close(f.halo.alpha, v.expect.haloAlpha, label); close(f.twilight.w, v.expect.w, label);
    assert.equal(f.twilight.phase, v.expect.phase, label);
    if (v.expect.twilight) {
      closeAll([f.twilightGlow.x, f.twilightGlow.y], v.expect.twilight.position, label);
      close(f.twilightGlow.alpha, v.expect.twilight.alpha, label); assert.equal(f.twilightGlow.color, v.expect.twilight.color, label);
    } else {
      assert.equal(f.twilightGlow.alpha, 0, label);
    }
  }
  const g = mod.NightSkyMath.geometry(vectors.nightSky.input.width, vectors.nightSky.input.height);
  const stars = mod.NightSkyMath.catalogue(g);
  assert.equal(stars.length, vectors.nightSky.expect.stars);
  vectors.nightSky.expect.firstStars.forEach((s, i) => { closeAll([stars[i].x, stars[i].y], [s.x, s.y], `star ${i}`); assert.equal(stars[i].lv, s.level); });
  mod.NightSkyMath.meteors(g).forEach((x, i) => { const e = vectors.nightSky.expect.meteors[i]; close(x.t0, e.start, `meteor ${i}`); assert.equal(x.k, e.beam); });
});

test("the generated files are current, so the page and dayground.md carry the same words", async () => {
  const files = await buildAll();
  for (const [path, body] of Object.entries(files)) assert.equal(read(path), body, `${path} is stale: run make dayground`);
});

test("make deploy refuses a stale copy and never regenerates one", () => {
  const deploy = read("Makefile").match(/^deploy:([^\n]*)\n((?:\t[^\n]*\n)*)/m);
  assert.match(deploy[2], /render-website\.mjs --check/);
  assert.doesNotMatch(deploy[1] + deploy[2].replace(/render-website\.mjs --check/, ""), /dayground/);
});

test("the page loads nothing from another origin, and /brand, llms.txt and the sitemap point at it", () => {
  const html = read(OUT.page);
  const loads = [
    ...html.matchAll(/<(?:script|img|iframe|source|video|audio)\b[^>]*\bsrc="([^"]+)"/g),
    ...html.matchAll(/<link\b[^>]*\bhref="([^"]+)"/g),
    ...html.matchAll(/url\(\s*['"]?([^'")]+)/g),
  ].filter((m) => !/rel="canonical"/.test(m[0])).map((m) => m[1]);
  for (const url of loads) assert.ok(!/^(https?:)?\/\//.test(url), `loads ${url}`);
  assert.match(html, /<link rel="canonical" href="https:\/\/solstone\.app\/brand\/dayground">/);
  assert.match(read("public/brand.html"), /href="\/brand\/dayground"/);
  assert.match(read("public/llms.txt"), /\(https:\/\/solstone\.app\/brand\/dayground\)/);
  assert.match(read("scripts/gen-sitemap.mjs"), /\["\/brand\/dayground", "public\/brand\/dayground\.html"\]/);
  const play = read("public/static/dayground-playground.js");
  assert.match(play, /from '\/brand\/dayground\/dayground\.js'/);
  for (const call of ["fetch(", "XMLHttpRequest", "geolocation", "localStorage", "document.cookie"]) assert.ok(!play.includes(call), call);
});
