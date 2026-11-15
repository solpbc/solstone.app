// solstone.app/brand/dayground: the live readout and the playground. Both run the published engine,
// /brand/dayground/dayground.js, which is generated from the same source as this site's background.
// Nothing here makes a network call, asks for a location or stores anything. Nothing plays on load:
// the playground animates only on a click, and stops all work while the page is hidden or the
// playground is out of view.
import {
  VALUES, MARK_SVG, NightSky, calculateFrame, calculateSunTime, calculateArcGeometry,
  solarPairFor, zonePoint, systemZoneId, sunTimes, parseZoneTable, ZONE_TABLE,
} from '/brand/dayground/dayground.js';

const $ = (id) => document.getElementById(id);
const FRAMES = {
  phone: { w: 393, h: 852, radius: 54 },
  tablet: { w: 1180, h: 820, radius: 36 },
  web: { w: 1280, h: 820, radius: 14 },
  watch: { w: 416, h: 496, radius: 110 },
};
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const wrap = (m) => ((m % 1440) + 1440) % 1440;
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const clockText = (m) => { const x = Math.round(wrap(m)) % 1440; return timeFormat.format(new Date(2000, 0, 1, Math.floor(x / 60), x % 60)); };
const clockOf = (m) => {
  const x = wrap(m);
  return { getHours: () => Math.floor(x / 60), getMinutes: () => Math.floor(x % 60), getSeconds: () => (x - Math.floor(x)) * 60 };
};

// The D5 phase words: dawn and dusk are the twilights, midday the hour either side of solar noon.
function phaseOf(m, rise, set) {
  const time = calculateSunTime(clockOf(m), rise, set, VALUES.twilightMinutes);
  const setX = set < rise ? set + 1440 : set;
  if (time.m < time.dawn || time.m > time.dusk) return { word: 'night', time };
  if (time.m < rise) return { word: 'dawn', time };
  if (time.m > setX) return { word: 'dusk', time };
  const noon = (rise + setX) / 2;
  if (Math.abs(time.m - noon) <= 60) return { word: 'midday', time };
  return { word: time.m < noon ? 'morning' : 'afternoon', time };
}

// A zone's UTC offset on a date, from the browser's own timezone data.
function offsetHours(zone, dateStr) {
  try {
    const at = new Date(dateStr + 'T12:00:00Z');
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(at);
    const get = (type) => Number(parts.find((p) => p.type === type).value);
    return (Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - at.getTime()) / 3600000;
  } catch (_) {
    return -at0().getTimezoneOffset() / 60;
  }
}
const at0 = () => new Date();
const noonUtc = (dateStr) => new Date(dateStr + 'T12:00:00Z');
function pairFor(zone, dateStr) {
  return solarPairFor(zonePoint(zone), noonUtc(dateStr), offsetHours(zone, dateStr)) || { rise: 390, set: 1170 };
}
// The current clock minute and date at a zone.
function nowAt(zone) {
  const d = new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d);
    const get = (type) => parts.find((p) => p.type === type).value;
    return { minute: Number(get('hour')) * 60 + Number(get('minute')), date: `${get('year')}-${get('month')}-${get('day')}` };
  } catch (_) {
    const pad = (n) => String(n).padStart(2, '0');
    return { minute: d.getHours() * 60 + d.getMinutes(), date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` };
  }
}
function solarMidnight(sun) {
  const set = sun.set < sun.rise ? sun.set + 1440 : sun.set;
  const dusk = set + 30, dawn = sun.rise - 30, span = wrap(dawn - dusk) || 1440;
  return wrap(dusk + span / 2);
}

// ---- the live readout (D5) ----------------------------------------------------------------------
function readout() {
  const el = $('dg-now-line');
  if (!el) return;
  const now = new Date();
  const m = now.getHours() * 60 + now.getMinutes();
  const sun = sunTimes(now);
  const p = phaseOf(m, sun.rise, sun.set);
  if (p.word === 'night') {
    let dawn = sun.rise - 30;
    if (p.time.m > p.time.dusk) dawn = sunTimes(new Date(now.getTime() + 86400000)).rise - 30;
    el.textContent = `right now, by your clock: ${clockText(m)}, night. the logo is out of sight until dawn at ${clockText(dawn)}.`;
  } else {
    const pct = Math.round(Math.max(0, Math.min(1, p.time.t)) * 100);
    el.textContent = `right now, by your clock: ${clockText(m)}, ${p.word}. the logo is ${pct}% of the way across.`;
  }
  $('dg-now').hidden = false;
}
let readoutTimer = null;
function readoutVisibility() {
  if (readoutTimer) clearTimeout(readoutTimer);
  readoutTimer = null;
  if (document.visibilityState === 'hidden') return;
  readout();
  const wait = 60000 - (Date.now() % 60000) + 50;
  readoutTimer = setTimeout(readoutVisibility, wait);
}

// ---- the playground ----------------------------------------------------------------------------
const stage = $('dg-stage');
const S = {
  screen: window.innerWidth < 700 ? 'phone' : 'web',
  appearance: darkQuery.matches ? 'dark' : 'light',
  zone: null, date: null, minute: 0, sun: null,
  build: false,
  mode: null, // 'play' | 'shower' | null
  played: 0, showerStart: 0, showerElapsed: 0, last: null,
};
let raf = null, inView = false;
const skies = new Map();
const els = {};

function buildStage() {
  stage.innerHTML = '<div class="dg-view"><div class="dg-screen"><div class="dg-twilight"></div><div class="dg-halo"></div>' +
    '<canvas class="dg-sky"></canvas><canvas class="dg-streaks"></canvas><div class="dg-sun">' +
    MARK_SVG.replace('<svg ', '<svg aria-hidden="true" focusable="false" ') + '</div></div>' +
    '<svg class="dg-build" xmlns="http://www.w3.org/2000/svg"></svg></div>';
  for (const k of ['view', 'screen', 'twilight', 'halo', 'sky', 'streaks', 'sun', 'build']) els[k] = stage.querySelector('.dg-' + k);
}

function layout() {
  const F = FRAMES[S.screen];
  const g = calculateArcGeometry(F.w, F.h, VALUES.diameterRatio, VALUES.bowRatio, VALUES.overshoot, VALUES.arcAngle, 0.5);
  const pad = S.build ? g.r / Math.SQRT2 + 40 : 0;
  const VW = F.w + 2 * pad, VH = F.h + 2 * pad;
  const width = stage.clientWidth || 320;
  const maxH = Math.min(window.innerHeight * 0.72, S.screen === 'watch' ? 420 : 640);
  const k = Math.min(width / VW, maxH / VH);
  stage.style.height = Math.round(VH * k) + 'px';
  Object.assign(els.view.style, { width: VW + 'px', height: VH + 'px', transform: `translateX(${Math.max(0, (width - VW * k) / 2)}px) scale(${k})` });
  Object.assign(els.screen.style, { left: pad + 'px', top: pad + 'px', width: F.w + 'px', height: F.h + 'px', borderRadius: F.radius + 'px' });
  els.build.setAttribute('viewBox', `${-pad} ${-pad} ${VW} ${VH}`);
  Object.assign(els.build.style, { width: VW + 'px', height: VH + 'px' });
  const q = Math.min(2, Math.max(0.5, k * (window.devicePixelRatio || 1)));
  for (const cv of [els.sky, els.streaks]) {
    cv.width = Math.round(F.w * q); cv.height = Math.round(F.h * q);
    cv.getContext('2d').setTransform(q, 0, 0, q, 0, 0);
  }
  S.k = k;
}

function skyFor(F) {
  const key = F.w + 'x' + F.h;
  if (!skies.has(key)) skies.set(key, new NightSky(F.w, F.h));
  return skies.get(key);
}

function placeGlow(el, gl) {
  el.style.opacity = gl.alpha > 0 ? '1' : '0';
  if (gl.alpha > 0) Object.assign(el.style, { left: gl.x - gl.radius + 'px', top: gl.y - gl.radius + 'px', width: gl.radius * 2 + 'px', height: gl.radius * 2 + 'px', background: gl.background });
}

function drawBuild(F, fr, appearance) {
  if (!S.build) { els.build.innerHTML = ''; return; }
  const V = VALUES, at = (t) => calculateArcGeometry(F.w, F.h, V.diameterRatio, V.bowRatio, V.overshoot, V.arcAngle, t);
  const g = at(0.5), ink = appearance === 'dark' ? '#FCF3E4' : '#1A1A1A', o = '#E8913A', s = 1 / S.k;
  const n = (v) => v.toFixed(1);
  const arcPath = [];
  for (let i = 0; i <= 60; i += 1) { const p = at(i / 60); arcPath.push((i ? 'L' : 'M') + n(p.x) + ' ' + n(p.y)); }
  const mid = [(g.ax + g.bx) / 2, (g.ay + g.by) / 2];
  let svg = `<g fill="none" stroke-width="${n(1.2 * s)}">` +
    `<rect x="0" y="0" width="${F.w}" height="${F.h}" rx="${F.radius}" stroke="${ink}" stroke-opacity=".5"/>` +
    `<path d="${arcPath.join(' ')}" stroke="${ink}" stroke-opacity=".7" stroke-dasharray="${n(7 * s)} ${n(5 * s)}"/>` +
    `<path d="M${n(g.ax)} ${n(g.ay)} L${n(g.bx)} ${n(g.by)}" stroke="${ink}" stroke-opacity=".35" stroke-dasharray="${n(3 * s)} ${n(4 * s)}"/>` +
    `<path d="M${n(mid[0])} ${n(mid[1])} L${n(g.x)} ${n(g.y)}" stroke="${o}"/>` +
    `<path d="M0 0 L${n(g.ax)} ${n(g.ay)} M${F.w} ${F.h} L${n(g.bx)} ${n(g.by)}" stroke="${o}" stroke-dasharray="${n(2 * s)} ${n(3 * s)}"/>`;
  if (fr.opacity > 0) svg += `<circle cx="${n(fr.geom.x)}" cy="${n(fr.geom.y)}" r="${n(fr.geom.r)}" stroke="${ink}" stroke-opacity=".45" stroke-dasharray="${n(4 * s)} ${n(4 * s)}"/>`;
  svg += '</g>';
  for (let i = 1; i < 10; i += 1) { const p = at(i / 10); svg += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(3 * s)}" fill="${ink}" fill-opacity=".7"/>`; }
  svg += `<circle cx="${n(g.ax)}" cy="${n(g.ay)}" r="${n(5 * s)}" fill="${o}"/><circle cx="${n(g.bx)}" cy="${n(g.by)}" r="${n(5 * s)}" fill="${o}"/>`;
  const fs = n(13 * s);
  svg += `<text x="${n(g.ax + 10 * s)}" y="${n(g.ay - 8 * s)}" font-size="${fs}" fill="${ink}" font-family="Inter, system-ui, sans-serif">dawn</text>` +
    `<text x="${n(g.bx - 52 * s)}" y="${n(g.by - 14 * s)}" font-size="${fs}" fill="${ink}" font-family="Inter, system-ui, sans-serif">dusk</text>`;
  els.build.innerHTML = svg;
}

function render(fractional) {
  const F = FRAMES[S.screen];
  const appearance = S.screen === 'watch' ? 'dark' : S.appearance;
  const m = S.minute;
  const fr = calculateFrame(clockOf(m), S.sun.rise, S.sun.set, appearance, { w: F.w, h: F.h }, VALUES);
  els.screen.style.background = fr.ground;
  placeGlow(els.twilight, fr.twilightGlow);
  placeGlow(els.halo, fr.halo);
  els.sun.style.opacity = String(fr.opacity);
  if (fr.opacity > 0) Object.assign(els.sun.style, { left: fr.geom.x - fr.geom.r + 'px', top: fr.geom.y - fr.geom.r + 'px', width: fr.geom.diam + 'px', height: fr.geom.diam + 'px' });

  const dark = appearance === 'dark';
  const sky = els.sky.getContext('2d'), streaks = els.streaks.getContext('2d');
  const streaking = S.mode === 'shower' && !reduced.matches;
  if (fr.time.nightAmount > 0) {
    const engine = skyFor(F);
    const nf = { t: fr.time.t, night: fr.time.nightAmount, w: fr.twilight.w,
      glows: [fr.halo, fr.twilightGlow].map((gl) => ({ x: gl.x, y: gl.y, r: gl.radius, a: gl.alpha })) };
    // the still sky stays on the whole minute, like every surface; streaks read the fractional time
    const key = [S.screen, Math.floor(m), dark, streaking, reduced.matches, S.sun.rise, S.sun.set].join('|');
    if (key !== S.skyKey || !fractional) {
      engine.paintStatic(sky, nf, S.sun, Math.floor(m), { dark, still: reduced.matches, stillMeteors: !streaking });
      S.skyKey = key;
    }
    streaks.clearRect(0, 0, F.w, F.h);
    if (streaking) {
      if (!S.preview || S.preview.base !== engine) {
        S.preview = Object.create(engine);
        S.preview.base = engine;
        // the shower's ten minutes, played in one: each streak keeps its own length and speed
        S.preview.meteors = engine.meteors.map((x) => Object.assign({}, x, { t0: x.t0 / 10 }));
      }
      S.preview.paintMeteors(streaks, nf, S.sun, m, { dark });
    }
  } else {
    sky.clearRect(0, 0, F.w, F.h);
    streaks.clearRect(0, 0, F.w, F.h);
    S.skyKey = null;
  }
  drawBuild(F, fr, appearance);
  const p = phaseOf(m, S.sun.rise, S.sun.set);
  $('dg-clock').textContent = clockText(m);
  $('dg-phase').textContent = p.word;
  if (!fractional) $('dg-scrub').value = String(Math.floor(wrap(m)));
}

function setPressed(group, value) {
  for (const b of document.querySelectorAll(`[data-${group}]`)) b.setAttribute('aria-pressed', String(b.dataset[group] === value));
}

function stopMotion() {
  S.mode = null; S.last = null;
  if (raf !== null) cancelAnimationFrame(raf);
  raf = null;
  $('dg-play').setAttribute('aria-pressed', 'false');
  $('dg-shower').setAttribute('aria-pressed', 'false');
}

function frameLoop(ts) {
  raf = null;
  if (!S.mode || !inView || document.visibilityState === 'hidden') { S.last = null; return; }
  const dt = S.last === null ? 0 : Math.min(0.1, (ts - S.last) / 1000);
  S.last = ts;
  if (S.mode === 'play') {
    const step = dt * 72; // 1440 minutes in 20 seconds
    S.played += step;
    S.minute = wrap(S.minute + step);
    if (S.played >= 1440) { S.minute = wrap(S.minute - (S.played - 1440)); stopMotion(); render(false); return; }
  } else if (S.mode === 'shower') {
    S.showerElapsed += dt;
    S.minute = wrap(S.showerStart + S.showerElapsed / 60);
    if (S.showerElapsed > 62) { stopMotion(); render(false); return; }
  }
  render(true);
  raf = requestAnimationFrame(frameLoop);
}
function resume() {
  if (S.mode && raf === null && inView && document.visibilityState !== 'hidden') raf = requestAnimationFrame(frameLoop);
}

function setSun() { S.sun = pairFor(S.zone, S.date); S.preview = null; }

function zoneOptions(current) {
  const table = parseZoneTable(ZONE_TABLE);
  const ids = Object.keys(table).sort();
  if (current && !table[current]) ids.unshift(current);
  const sel = $('dg-place');
  sel.innerHTML = ids.map((id) => `<option value="${id}">${id.replace(/_/g, ' ')}</option>`).join('');
  sel.value = current;
}

function jumpTo(which) {
  stopMotion();
  if (which === 'now') {
    const n = nowAt(S.zone);
    S.date = n.date; $('dg-date').value = n.date; setSun();
    S.minute = n.minute;
  } else if (which === 'dawn') S.minute = wrap(S.sun.rise - 30);
  else if (which === 'noon') S.minute = wrap((S.sun.rise + (S.sun.set < S.sun.rise ? S.sun.set + 1440 : S.sun.set)) / 2);
  else if (which === 'dusk') S.minute = wrap(S.sun.set + 30);
  else if (which === 'midnight') S.minute = solarMidnight(S.sun);
  render(false);
}

function start() {
  buildStage();
  const zone = systemZoneId() || 'America/Denver';
  S.zone = zone;
  zoneOptions(zone);
  const n = nowAt(zone);
  S.date = n.date; S.minute = n.minute;
  $('dg-date').value = n.date;
  setSun();
  setPressed('screen', S.screen);
  setPressed('look', S.appearance);
  layout();
  render(false);

  $('dg-scrub').addEventListener('input', (e) => { stopMotion(); S.minute = Number(e.target.value); render(true); });
  for (const b of document.querySelectorAll('[data-jump]')) b.addEventListener('click', () => jumpTo(b.dataset.jump));
  for (const b of document.querySelectorAll('[data-screen]')) b.addEventListener('click', () => {
    S.screen = b.dataset.screen; setPressed('screen', S.screen);
    $('dg-watch-note').hidden = S.screen !== 'watch';
    S.skyKey = null; S.preview = null; layout(); render(false);
  });
  for (const b of document.querySelectorAll('[data-look]')) b.addEventListener('click', () => {
    S.appearance = b.dataset.look; setPressed('look', S.appearance); S.skyKey = null; render(false);
  });
  $('dg-place').addEventListener('change', (e) => { S.zone = e.target.value; setSun(); S.skyKey = null; render(false); });
  $('dg-date').addEventListener('change', (e) => { if (!e.target.value) return; S.date = e.target.value; setSun(); S.skyKey = null; render(false); });
  $('dg-build').addEventListener('change', (e) => { S.build = e.target.checked; layout(); render(false); });
  $('dg-play').addEventListener('click', () => {
    if (S.mode === 'play') { stopMotion(); render(false); return; }
    stopMotion();
    S.mode = 'play'; S.played = 0;
    $('dg-play').setAttribute('aria-pressed', 'true');
    resume();
  });
  $('dg-shower').addEventListener('click', () => {
    if (S.mode === 'shower') { stopMotion(); render(false); return; }
    stopMotion();
    const mid = solarMidnight(S.sun);
    if (reduced.matches) {
      // under reduced motion the shower is the long exposure: every trail, still
      S.minute = wrap(mid + 9.9);
      render(false);
      return;
    }
    S.mode = 'shower'; S.showerStart = mid; S.showerElapsed = 0; S.minute = mid; S.skyKey = null;
    $('dg-shower').setAttribute('aria-pressed', 'true');
    resume();
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (inView) { layout(); S.skyKey = null; render(false); } }, 200);
  });
  new IntersectionObserver((entries) => {
    inView = entries.some((e) => e.isIntersecting);
    if (inView) resume();
    else if (raf !== null) { cancelAnimationFrame(raf); raf = null; S.last = null; }
  }).observe(stage);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { if (raf !== null) cancelAnimationFrame(raf); raf = null; S.last = null; }
    else resume();
  });
  reduced.addEventListener('change', () => { if (S.mode === 'shower') stopMotion(); S.skyKey = null; render(false); });
}

document.documentElement.classList.add('js');
readoutVisibility();
document.addEventListener('visibilitychange', readoutVisibility);
if (stage) start();
