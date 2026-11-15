#!/usr/bin/env node
// The drawings on /brand/system and /brand/merch, generated from the brand
// source and committed. Every figure is drawn by the brand's own kernel and
// pattern modules, read by reference from BRAND_SRC and never copied here, so
// the pages can't drift from the source by hand. Like `make brand`, this is an
// explicit step: `make deploy` never runs it.
//
//   make sbis BRAND_SRC=/abs/path/to/brand-source
//   node scripts/gen-sbis.mjs --src <brand-source> [--check]
//
// Each figure lands between <!-- gen:sbis:<id>:begin --> and its :end marker.
// --check exits 1 if a page differs from what the source draws today.
// The object outlines (shirt, tote, mug, case, cloth edges) are page drawing,
// not brand geometry; the logo, the solar instrument, the field and the sun's
// position always come from the modules.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const src = flag("--src") || process.env.BRAND_SRC;
const check = args.includes("--check");
if (!src) { console.error("gen-sbis: set BRAND_SRC (or --src) to the brand source directory"); process.exit(2); }
const sbis = join(src, "sbis");

// ── load the kernel and the modules, by reference ─────────────────────────────
const ctx = { console };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ["kernel/sol-geo.js", "kernel/sol-ulm.js", "patterns/field/field.js", "patterns/sun-arc/sunarc.js", "patterns/solar-instrument/solar-instrument.js"]) {
  vm.runInContext(readFileSync(join(sbis, f), "utf8"), ctx, { filename: f });
}
const { SOL, SUNARC: SA, SBIS_FIELD: FIELD, SBIS_SOLAR: SOLAR } = ctx;
const { C, U } = SOL;
const PHI = C.PHI, CREAM = C.TILE_CREAM, INK = C.INK, n = (x) => Number(x.toFixed(3));

const lockupFile = readFileSync(join(src, "solstone/lockup-solstone-app.svg"), "utf8");
const lockupVB = lockupFile.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
const lockupInner = lockupFile.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<title>[\s\S]*?<\/title>/, "").replace(/<!--[\s\S]*?-->/g, "").trim();
const LETTER_TOP = 29.6;  // the word sits under the tip circle (tips at 29.5 in the lockup's units)

// ── page drawing helpers ──────────────────────────────────────────────────────
let uid = 0;
const id = (p) => `sbis-${p}-${++uid}`;
const rect = (x, y, w, h, fill, extra = "") => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"${extra}/>`;
const svg = (w, h, inner, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(w)} ${n(h)}" width="${n(w)}" height="${n(h)}" role="img" aria-label="${label}">${inner}</svg>`;
const markAt = (x, y, size) => U.g(x, y, size, 0, U.mark());
const clipRect = (x, y, w, h, inner, rx = 0) => { const c = id("c"); return `<clipPath id="${c}"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(rx)}"/></clipPath><g clip-path="url(#${c})">${inner}</g>`; };
const clipD = (d, inner) => { const c = id("c"); return `<clipPath id="${c}"><path d="${d}"/></clipPath><g clip-path="url(#${c})">${inner}</g>`; };
const OUTLINE = ' stroke="rgba(26,26,26,.22)" stroke-width="1"';
// the sun at time t on the dayground's own path across a w × h surface, cropped by its edge (t: 0 dawn top left, 1 dusk bottom right)
const sunOn = (x, y, w, h, t, D) => { const p = SA.path(w, h, "tl-br", SA.arc("s1"), false, 1, D / 2).at(t); return markAt(x + p[0], y + p[1], D); };
// the stacked lockup, or only its word, at width wd; on ink the word turns tile cream
function lockup(x, y, wd, { onInk = false, wordOnly = false, word } = {}) {
  const vb = wordOnly ? [lockupVB[0], LETTER_TOP, lockupVB[2], lockupVB[1] + lockupVB[3] - LETTER_TOP] : lockupVB;
  let inner = wordOnly ? lockupInner.replace(/<path fill="#FFCC33"[^>]*\/>/, "").replace(/<circle[^>]*\/>/, "") : lockupInner;
  if (onInk || word) inner = inner.replace(/fill="#E8913A"/g, `fill="${word || CREAM}"`);
  return `<svg x="${n(x)}" y="${n(y)}" width="${n(wd)}" height="${n(wd * vb[3] / vb[2])}" viewBox="${vb.join(" ")}" overflow="visible">${inner}</svg>`;
}
const lockupH = (wd, wordOnly) => wd * (wordOnly ? lockupVB[1] + lockupVB[3] - LETTER_TOP : lockupVB[3]) / lockupVB[2];
// the solar instrument is drawn once per page, as a symbol in the module's own
// mm coordinates (lines in currentColor, the logo in its colors), and every
// figure that shows it points at that symbol and sets the line color.
const INSTRUMENT = SOLAR.build({});
const SYMBOL = "sbis-instrument";
const instrumentDefs = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs><symbol id="${SYMBOL}" overflow="visible">${SOLAR.inner(INSTRUMENT, {})}</symbol></defs></svg>`;
const useInstrument = (line) => `<use href="#${SYMBOL}" color="${line}"/>`;
const instrumentBox = (() => { const b = INSTRUMENT.bounds, m = 4, s = Math.max(b.maxX - b.minX, b.maxY - b.minY) + 2 * m, cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2; return [cx - s / 2, cy - s / 2, s, s]; })();
function instrument(x, y, wd, line) {
  return `<svg x="${n(x)}" y="${n(y)}" width="${n(wd)}" height="${n(wd)}" viewBox="${instrumentBox.map(n).join(" ")}">${useInstrument(line)}</svg>`;
}
const instrumentFig = (vb, ground, line, w, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.map(n).join(" ")}" width="${w}" height="${n(w * vb[3] / vb[2])}" role="img" aria-label="${label}">${rect(vb[0], vb[1], vb[2], vb[3], ground)}${useInstrument(line)}</svg>`;

// a shirt: body 20 × 28 in, y = 0 at the shoulder line (page drawing)
function tee(ground, art, k = 9) {
  const bw = 20, pad = 6.5, w = (bw + 2 * pad) * k, h = 29.5 * k, X = pad, Y = 1;
  const p = (x, y) => `${n((X + x) * k)} ${n((Y + y) * k)}`, neck = bw * 0.33, nl = (bw - neck) / 2;
  const d = `M${p(nl, 0)} Q${p(bw / 2, 3.2)} ${p(nl + neck, 0)} L${p(bw, 0.9)} L${p(bw + 6, 6.2)} L${p(bw + 3.4, 9.6)} L${p(bw, 7.6)} L${p(bw, 28)} L${p(0, 28)} L${p(0, 7.6)} L${p(-3.4, 9.6)} L${p(-6, 6.2)} L${p(0, 0.9)} Z`;
  return { w, h, inner: clipD(d, rect(0, 0, w, h, ground) + art(X * k, Y * k, k)) + `<path d="${d}" fill="none"${OUTLINE}/>` };
}
// a flat good: a rounded rectangle (page drawing)
function flat(Wi, Hi, ground, art, k, { rx = 0.12, hole, camera } = {}) {
  const w = Wi * k, h = Hi * k;
  let extra = "";
  if (hole) extra += `<circle cx="${n(w / 2)}" cy="${n(hole * k)}" r="${n(0.11 * k)}" fill="#FFFFFF" stroke="rgba(26,26,26,.25)" stroke-width="0.8"/>`;
  if (camera) extra += rect(0.22 * k, 0.22 * k, 1.15 * k, 1.15 * k, "none", ` rx="${n(0.28 * k)}" stroke="rgba(26,26,26,.28)" stroke-width="1"`);
  return { w, h, inner: clipRect(0, 0, w, h, rect(0, 0, w, h, ground) + art(0, 0, k), rx * k) + extra + rect(0.5, 0.5, w - 1, h - 1, "none", ` rx="${n(rx * k)}"${OUTLINE}`) };
}
function tote(ground, art, k = 14) {
  const Wi = 15, Hi = 16, w = Wi * k, h = (Hi + 6) * k, y0 = 6 * k;
  const handles = [0.3, 0.7].map((f) => `<path d="M${n((f - 0.08) * w)} ${n(y0)} Q${n((f - 0.08) * w)} ${n(0.6 * k)} ${n(f * w)} ${n(0.6 * k)} Q${n((f + 0.08) * w)} ${n(0.6 * k)} ${n((f + 0.08) * w)} ${n(y0)}" fill="none" stroke="${INK}" stroke-width="${n(0.9 * k)}"/>`).join("");
  return { w, h, inner: handles + clipRect(0, y0, w, Hi * k, rect(0, y0, w, Hi * k, ground) + art(0, y0, k), 0.15 * k) + rect(0.5, y0 + 0.5, w - 1, Hi * k - 1, "none", ` rx="${n(0.15 * k)}"${OUTLINE}`) };
}
function mug(art, k = 46) {
  const Wi = 3.2, Hi = 3.6, w = (Wi + 1.1) * k, h = Hi * k;
  const handle = `<path d="M${n(Wi * k)} ${n(0.8 * k)} C${n((Wi + 1.2) * k)} ${n(0.8 * k)} ${n((Wi + 1.2) * k)} ${n(2.7 * k)} ${n(Wi * k)} ${n(2.7 * k)}" fill="none" stroke="rgba(26,26,26,.25)" stroke-width="${n(0.28 * k)}"/>`;
  return { w, h, inner: handle + clipRect(0, 0, Wi * k, h, rect(0, 0, Wi * k, h, CREAM) + art(0, 0, Wi * k, h), 0.18 * k) + rect(0.5, 0.5, Wi * k - 1, h - 1, "none", ` rx="${n(0.18 * k)}"${OUTLINE}`) };
}
function round(Di, ground, art, k = 60) {
  const w = Di * k, r = w / 2, d = `M0 ${n(r)} A${n(r)} ${n(r)} 0 1 0 ${n(w)} ${n(r)} A${n(r)} ${n(r)} 0 1 0 0 ${n(r)} Z`;
  return { w, h: w, inner: clipD(d, rect(0, 0, w, w, ground) + art(0, 0, k)) + `<circle cx="${n(r)}" cy="${n(r)}" r="${n(r - 0.5)}" fill="none"${OUTLINE}/>` };
}
const fig = (o, label) => svg(o.w, o.h, o.inner, label);

// ── the figures ──────────────────────────────────────────────────────────────
const FIGS = {};
const MORNING = 0.22, EVENING = 0.78;   // the sun's place on its path at sunrise and sunset, as on the shirts

/* /brand/system */
FIGS["numbers"] = (() => {
  const S = 420, M = 210, u = M / 27, cx = S / 2, cy = S / 2, hair = C.RING_SW * u / 10, grey = "rgba(26,26,26,.30)";
  let o = rect(0, 0, S, S, CREAM);
  for (const a of [18, 54, 90, 126, 162]) { const r = a * Math.PI / 180, L = S; o += `<path d="M${n(cx - Math.cos(r) * L)} ${n(cy + Math.sin(r) * L)}L${n(cx + Math.cos(r) * L)} ${n(cy - Math.sin(r) * L)}" stroke="${grey}" stroke-width="${n(hair)}" fill="none"/>`; }
  for (const r of [5.632, 6.5, 7.368, 9.118, 13.5, 13.5 * PHI, 13.5 * PHI * PHI]) o += `<circle cx="${cx}" cy="${cy}" r="${n(r * u)}" fill="none" stroke="${grey}" stroke-width="${n(hair)}"/>`;
  return svg(S, S, clipRect(0, 0, S, S, o + markAt(cx, cy, M)), "the logo with the seven radii as circles and the five directions as lines through its center");
})();
FIGS["clear-screen"] = (() => {
  const S = 300, M = 150, R = M / 2 * (C.TIP_R + C.RING_R) / C.TIP_R;
  return svg(S, S, rect(0, 0, S, S, C.SURFACE_CREAM) + `<circle cx="150" cy="150" r="${n(R)}" fill="none" stroke="rgba(26,26,26,.35)" stroke-width="1" stroke-dasharray="5 4"/>` + markAt(150, 150, M), "on a screen: the logo with a dashed circle one ring radius past its tips");
})();
FIGS["clear-object"] = (() => { const half = 70, [mx, my] = INSTRUMENT.mark; return instrumentFig([mx - half, my - half, 2 * half, 2 * half], CREAM, INK, 300, "on an object: the solar instrument close up, its lines stopping just past the logo's tips"); })();
FIGS["instrument-light"] = instrumentFig(instrumentBox, CREAM, INK, 640, "the solar instrument: ink lines on cream, the logo at the center of the sky");
FIGS["instrument-ink"] = instrumentFig(instrumentBox, INK, CREAM, 640, "the solar instrument: cream lines on ink, the logo at the center of the sky");
const fieldFig = (dose, label) => FIELD.render({ W: 600, H: 400, dose, ground: CREAM }).replace(/^<svg /, `<svg role="img" aria-label="${label}" `);
FIGS["field-outside"] = fieldFig("construction", "the field at construction dose: ink outlines of thin and fat rhombs, no fill");
FIGS["field-inside"] = fieldFig("full", "the field at full dose: the same rhombs, some filled gold and some orange");
// on an object the sun's size is set by eye; these start at 1.05 × the short side, as on the pocket cloth
for (const [key, t, label] of [["frame-morning", MORNING, "morning: the logo comes in at the top left"], ["frame-midday", 0.5, "midday: the logo at the top of its arc"], ["frame-evening", EVENING, "evening: the logo goes down at the bottom right"]]) {
  const w = 600, h = 400;
  FIGS[key] = svg(w, h, clipRect(0, 0, w, h, rect(0, 0, w, h, CREAM) + sunOn(0, 0, w, h, t, 1.05 * h)), label);
}

/* /brand/merch */
const k12 = 9;
FIGS["tee-instrument-light"] = fig(tee(CREAM, (x, y, k) => instrument(x + 4 * k, y + 3.5 * k, 12 * k, INK)), "a cream tee with the solar instrument large across the front, ink lines");
FIGS["tee-instrument-ink"] = fig(tee(INK, (x, y, k) => instrument(x + 4 * k, y + 3.5 * k, 12 * k, CREAM)), "an ink tee with the solar instrument large across the front, cream lines");
for (const [key, t, ground, label] of [
  ["tee-morning-light", MORNING, CREAM, "a cream tee: the logo comes in large over the wearer's right shoulder"],
  ["tee-morning-ink", MORNING, INK, "an ink tee: the logo comes in large over the wearer's right shoulder"],
  ["tee-evening-light", EVENING, CREAM, "a cream tee: the logo goes down large over the bottom right hem"],
  ["tee-evening-ink", EVENING, INK, "an ink tee: the logo goes down large over the bottom right hem"],
]) FIGS[key] = fig(tee(ground, (x, y, k) => sunOn(x, y, 20 * k, 28 * k, t, 16 * k)), label);
FIGS["tote-sunrise"] = fig(tote(CREAM, (x, y, k) => sunOn(x, y, 15 * k, 16 * k, MORNING, 11 * k)), "a cream tote: the logo comes in at the top left");
FIGS["tote-sunset"] = fig(tote(CREAM, (x, y, k) => sunOn(x, y, 15 * k, 16 * k, EVENING, 11 * k)), "a cream tote: the logo goes down at the bottom right");
FIGS["notebook-sunrise"] = fig(flat(5.5, 8.5, CREAM, (x, y, k) => sunOn(x, y, 5.5 * k, 8.5 * k, MORNING, 4.4 * k), 30), "a cream notebook cover: the logo comes in at the top left");
FIGS["notebook-sunset"] = fig(flat(5.5, 8.5, CREAM, (x, y, k) => sunOn(x, y, 5.5 * k, 8.5 * k, EVENING, 4.4 * k), 30), "a cream notebook cover: the logo goes down at the bottom right");
FIGS["notebook-inside"] = (() => { const k = 30, w = 11 * k, h = 8.5 * k; const f = FIELD.render({ W: w, H: h, dose: "full", ground: CREAM }).replace(/^<svg[^>]*>|<\/svg>$/g, ""); return svg(w, h, clipRect(0, 0, w, h, f, 0.12 * k) + `<path d="M${n(w / 2)} 0V${n(h)}" stroke="rgba(26,26,26,.18)" stroke-width="1"/>` + rect(0.5, 0.5, w - 1, h - 1, "none", ` rx="${n(0.12 * k)}"${OUTLINE}`), "a notebook's endpapers: the field at full dose across the spread"); })();
FIGS["case-instrument"] = fig(flat(2.9, 5.9, CREAM, (x, y, k) => instrument(x + 0.2 * k, y + 2.55 * k, 2.5 * k, INK), 34, { rx: 0.42, camera: true }), "a cream phone case with the solar instrument on its lower half");
FIGS["case-frame"] = fig(flat(2.9, 5.9, CREAM, (x, y, k) => sunOn(x, y, 2.9 * k, 5.9 * k, 0.28, PHI * 2.9 * k), 34, { rx: 0.42, camera: true }), "a cream phone case with the logo at 10:00, large and cropped by the edge");
for (const [key, t, label] of [["mug-morning", MORNING, "the morning mug: the logo comes in at the top left"], ["mug-noon", 0.5, "the noon mug: the logo high in the middle"], ["mug-evening", EVENING, "the evening mug: the logo goes down at the bottom right"]]) FIGS[key] = fig(mug((x, y, w, h) => sunOn(x, y, w, h, t, 1.05 * w)), label);
FIGS["cloth-round"] = fig(round(6, INK, (x, y, k) => instrument(x + 0.25 * k, y + 0.25 * k, 5.5 * k, CREAM)), "a round cloth on ink with the solar instrument in cream");
FIGS["cloth-pocket"] = (() => {
  const k = 50, W = 7, H = 5;
  return fig(flat(W, H, CREAM, (x, y, kk) => { const wd = 2.5 * kk; return sunOn(x, y, W * kk, H * kk, 0.28, 1.05 * H * kk) + lockup(x + (W - 0.55) * kk - wd, y + (H - 0.7) * kk - lockupH(wd, true), wd, { wordOnly: true }); }, k, { rx: 0.08 }), "a cream pocket cloth: the logo comes in at the top left, the word solstone.app at the lower right");
})();
for (const [key, ground, label] of [["cloth-square-light", CREAM, "a square cream cloth with the stacked lockup low on the right"], ["cloth-square-ink", INK, "a square ink cloth with the stacked lockup low on the right"]]) {
  // the lockup as published, in full color on either ground (its orange word clears 7:1 on ink)
  FIGS[key] = fig(flat(5, 5, ground, (x, y, k) => { const wd = 2.09 * k; return lockup(x + (5 - 0.38) * k - wd, y + (5 - 0.37) * k - lockupH(wd), wd); }, 50, { rx: 0.05 }), label);
}
FIGS["hang-tag"] = fig(flat(2, 3.5, CREAM, (x, y, k) => { const wd = 1.0 * k; return lockup(x + (2 * k - wd) / 2, y + 0.58 * 3.5 * k - lockupH(wd) / 2, wd); }, 60, { rx: 0.1, hole: 0.35 }), "a cream hang tag: a plain string hole at the top, the stacked lockup below it");

FIGS["defs-system"] = instrumentDefs;
FIGS["defs-merch"] = instrumentDefs;

// Construction lines carry 2 decimals in their own units (a hundredth of a mm
// on the instrument), which halves the pages. The logo's own paths are never
// touched: only stroked paths are rounded.
const lean = (s) => s.replace(/<path d="([^"]+)"(?=[^>]*\bstroke=)/g, (_, d) => `<path d="${d.replace(/(\d+\.\d\d)\d+/g, "$1")}"`);
for (const k of Object.keys(FIGS)) FIGS[k] = lean(FIGS[k]);

// ── write them into the pages ────────────────────────────────────────────────
const PAGES = ["public/brand/system.html", "public/brand/merch.html"];
let stale = 0;
const used = new Set();
for (const page of PAGES) {
  const file = join(root, page);
  const before = readFileSync(file, "utf8");
  const after = before.replace(/(<!-- gen:sbis:([a-z0-9-]+):begin -->)[\s\S]*?(<!-- gen:sbis:\2:end -->)/g, (_, open, key, close) => {
    if (!FIGS[key]) throw new Error(`${page}: no figure named ${key}`);
    used.add(key);
    return `${open}${FIGS[key]}${close}`;
  });
  if (after !== before) {
    stale++;
    if (check) console.error(`gen-sbis: ${page} is stale; run make sbis BRAND_SRC=… and commit`);
    else { writeFileSync(file, after); console.log(`gen-sbis: wrote ${page}`); }
  } else console.log(`gen-sbis: ${page} is current`);
}
const unused = Object.keys(FIGS).filter((k) => !used.has(k));
if (unused.length) { console.error(`gen-sbis: figures no page places: ${unused.join(", ")}`); process.exit(1); }
if (check && stale) process.exit(1);
