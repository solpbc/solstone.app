export function degToRad(d) {
  return d * (Math.PI / 180);
}

export function radToDeg(r) {
  return r * (180 / Math.PI);
}

export function sinDeg(d) {
  return Math.sin(degToRad(d));
}

export function cosDeg(d) {
  return Math.cos(degToRad(d));
}

export function tanDeg(d) {
  return Math.tan(degToRad(d));
}

export function asinDeg(x) {
  return radToDeg(Math.asin(x));
}

export function acosDeg(x) {
  return radToDeg(Math.acos(x));
}

export function atanDeg(x) {
  return radToDeg(Math.atan(x));
}

export function srgbToLinear(c) {
  const norm = c / 255;
  return norm <= 0.04045 ? norm / 12.92 : Math.pow((norm + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c) {
  const clamped = Math.max(0, Math.min(1, c));
  const s = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(255, s * 255)));
}

export function rgbToOklab(r, g, b) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}

export function oklabToRgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return [linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb)];
}

export function mixOklab(c1, c2, t) {
  const lab1 = rgbToOklab(c1[0], c1[1], c1[2]);
  const lab2 = rgbToOklab(c2[0], c2[1], c2[2]);
  const lab = [
    lab1[0] + (lab2[0] - lab1[0]) * t,
    lab1[1] + (lab2[1] - lab1[1]) * t,
    lab1[2] + (lab2[2] - lab1[2]) * t,
  ];
  return oklabToRgb(lab[0], lab[1], lab[2]);
}

export function parseColor(str) {
  if (typeof str !== 'string') return null;
  const trimmed = str.trim();
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
      return [r, g, b];
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
      return [r, g, b];
    }
    return null;
  }
  const rgbMatch = trimmed.match(/^rgba?\s*\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/i);
  if (rgbMatch) {
    const r = parseFloat(rgbMatch[1]);
    const g = parseFloat(rgbMatch[2]);
    const b = parseFloat(rgbMatch[3]);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return [Math.round(r), Math.round(g), Math.round(b)];
  }
  return null;
}

export function formatHex(rgb) {
  const r = rgb[0].toString(16).padStart(2, '0');
  const g = rgb[1].toString(16).padStart(2, '0');
  const b = rgb[2].toString(16).padStart(2, '0');
  return ('#' + r + g + b).toUpperCase();
}

export function formatRgba(rgb, alpha) {
  const clampedA = Math.max(0, Math.min(1, alpha));
  return 'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', ' + (Math.round(clampedA * 10000) / 10000) + ')';
}

export function calculateTwoStepNight(dayRgb, inkRgb, warmDarkRgb, inkMix, warmMix) {
  const step1 = mixOklab(dayRgb, inkRgb, inkMix);
  return mixOklab(step1, warmDarkRgb, warmMix);
}

export function calculateMixedGround(dayRgb, inkRgb, warmDarkRgb, inkMix, warmMix, nightAmount) {
  const fullNightRgb = calculateTwoStepNight(dayRgb, inkRgb, warmDarkRgb, inkMix, warmMix);
  return mixOklab(dayRgb, fullNightRgb, nightAmount);
}

export function parseTokens(styleReader) {
  function getProp(name) {
    return styleReader(name);
  }

  function parseNum(name) {
    const val = getProp(name);
    if (!val) return null;
    const n = parseFloat(val);
    if (typeof n !== 'number' || !Number.isFinite(n)) return null;
    return n;
  }

  function parseCol(name) {
    const val = getProp(name);
    return parseColor(val);
  }

  const arcAngle = parseNum('--sunarc-arc-angle');
  const bowRatio = parseNum('--sunarc-bow-ratio');
  const diameterRatio = parseNum('--sunarc-diameter-ratio');
  const overshoot = parseNum('--sunarc-overshoot');
  const envelopeEdge = parseNum('--sunarc-envelope-edge');
  const peakOpacity = parseNum('--sunarc-peak-opacity');
  const twilightMinutes = parseNum('--sunarc-twilight-minutes');
  const inkMix = parseNum('--sunarc-ink-mix');
  const warmMix = parseNum('--sunarc-warm-mix');
  const glowRadiusRatio = parseNum('--sunarc-glow-radius-ratio');
  const glowDayAlpha = parseNum('--sunarc-glow-day-alpha');
  const glowNightAlpha = parseNum('--sunarc-glow-night-alpha');
  const glowNightFloor = parseNum('--sunarc-glow-night-floor');
  const glowMidStop = parseNum('--sunarc-glow-mid-stop');
  const glowMidRatio = parseNum('--sunarc-glow-mid-ratio');
  const appearanceFlip = parseNum('--sunarc-appearance-flip');

  const warmDark = parseCol('--sunarc-warm-dark');
  const ink = parseCol('--sunarc-ink');
  const glowColor = parseCol('--sunarc-glow-color');
  const nightGround = parseCol('--sunarc-night-ground');
  const cream = parseCol('--cream');

  if (
    arcAngle == null ||
    bowRatio == null ||
    diameterRatio == null ||
    overshoot == null ||
    envelopeEdge == null ||
    peakOpacity == null ||
    twilightMinutes == null ||
    inkMix == null ||
    warmMix == null ||
    glowRadiusRatio == null ||
    glowDayAlpha == null ||
    glowNightAlpha == null ||
    glowNightFloor == null ||
    glowMidStop == null ||
    glowMidRatio == null ||
    appearanceFlip == null ||
    warmDark == null ||
    ink == null ||
    glowColor == null ||
    nightGround == null ||
    cream == null
  ) {
    return null;
  }

  return {
    arcAngle,
    bowRatio,
    diameterRatio,
    overshoot,
    envelopeEdge,
    peakOpacity,
    twilightMinutes,
    inkMix,
    warmMix,
    glowRadiusRatio,
    glowDayAlpha,
    glowNightAlpha,
    glowNightFloor,
    glowMidStop,
    glowMidRatio,
    appearanceFlip,
    warmDark,
    ink,
    glowColor,
    nightGround,
    cream,
  };
}

export function noaaSolarTime(date, lat, lon, isSunrise, zenith, utcOffsetHours) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  const n1 = Math.floor(275 * month / 9);
  const n2 = Math.floor((month + 9) / 12);
  const n3 = 1 + Math.floor((year - 4 * Math.floor(year / 4) + 2) / 3);
  const n = n1 - n2 * n3 + day - 30;

  const lngHour = lon / 15;
  const tApprox = isSunrise ? n + (6 - lngHour) / 24 : n + (18 - lngHour) / 24;

  const m = 0.9856 * tApprox - 3.289;
  let l = m + 1.916 * sinDeg(m) + 0.020 * sinDeg(2 * m) + 282.634;
  l = (l % 360 + 360) % 360;

  let ra = atanDeg(0.91764 * tanDeg(l));
  ra = (ra % 360 + 360) % 360;

  const lQuadrant = Math.floor(l / 90) * 90;
  const raQuadrant = Math.floor(ra / 90) * 90;
  ra = ra + (lQuadrant - raQuadrant);
  ra = ra / 15;

  const sinDec = 0.39782 * sinDeg(l);
  const cosDec = cosDeg(asinDeg(sinDec));

  const cosH = (cosDeg(zenith) - sinDec * sinDeg(lat)) / (cosDec * cosDeg(lat));
  if (cosH > 1 || cosH < -1) return null;

  let h;
  if (isSunrise) {
    h = 360 - acosDeg(cosH);
  } else {
    h = acosDeg(cosH);
  }
  h = h / 15;

  const t = h + ra - 0.06571 * tApprox - 6.622;
  let ut = t - lngHour;
  ut = (ut % 24 + 24) % 24;

  let local = ut + utcOffsetHours;
  local = (local % 24 + 24) % 24;
  return local * 60;
}

export function calculateSunTime(now, riseMin, setMin, twMin) {
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const m = hours * 60 + minutes + seconds / 60;

  const dawn = riseMin - twMin;
  const dusk = setMin + twMin;

  const t = (m - dawn) / (dusk - dawn);

  let nightAmount = 0;
  if (m < dawn) {
    nightAmount = 1;
  } else if (m < riseMin) {
    nightAmount = 1 - (m - dawn) / (riseMin - dawn);
  } else if (m <= setMin) {
    nightAmount = 0;
  } else if (m <= dusk) {
    nightAmount = (m - setMin) / (dusk - setMin);
  } else {
    nightAmount = 1;
  }

  const nightSpan = (24 * 60 - dusk) + dawn;
  let elapsedNight = 0;
  if (m >= dusk) {
    elapsedNight = m - dusk;
  } else {
    elapsedNight = (24 * 60 - dusk) + m;
  }
  let q = nightSpan > 0 ? elapsedNight / nightSpan : 0;
  q = Math.max(0, Math.min(1, q));

  return {
    m,
    dawn,
    dusk,
    t,
    nightAmount,
    q,
  };
}

export function envelope(t, edge) {
  if (t < edge) {
    const val = Math.sin((t / edge) * (Math.PI / 2));
    return Math.max(0, Math.min(1, val));
  }
  if (t > 1 - edge) {
    const val = Math.sin(((1 - t) / edge) * (Math.PI / 2));
    return Math.max(0, Math.min(1, val));
  }
  return 1;
}

export function sunOpacity(t, edge, peakOpacity, nightAmount) {
  if (t < -0.02 || t > 1.02) return 0;
  const env = envelope(t, edge);
  const op = peakOpacity * env * (1 - nightAmount);
  return Math.max(0, Math.min(1, op));
}

export function calculateArcGeometry(w, h, diameterRatio, bowRatio, overshoot, arcAngleDeg, t) {
  const side = Math.min(w, h);
  const diam = diameterRatio * side;
  const r = diam / 2;
  const off = (overshoot * r) / Math.SQRT2;
  const ax = -off;
  const ay = -off;
  const bx = w + off;
  const by = h + off;

  const dx = bx - ax;
  const dy = by - ay;
  const c = Math.hypot(dx, dy);
  const s = bowRatio * c;
  const rArc = (c * c) / (8 * s) + s / 2;

  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;

  const ux = -dy / c;
  const uy = dx / c;
  const dCenter = rArc - s;
  const ox = mx + dCenter * ux;
  const oy = my + dCenter * uy;

  const thetaA = Math.atan2(ay - oy, ax - ox);
  const thetaB = Math.atan2(by - oy, bx - ox);

  let dTheta = thetaB - thetaA;
  while (dTheta > Math.PI) dTheta -= 2 * Math.PI;
  while (dTheta < -Math.PI) dTheta += 2 * Math.PI;

  const thetaT = thetaA + t * dTheta;
  const x = ox + rArc * Math.cos(thetaT);
  const y = oy + rArc * Math.sin(thetaT);

  const subtendedDeg = 2 * Math.asin(c / (2 * rArc)) * (180 / Math.PI);

  return {
    diam,
    r,
    ax,
    ay,
    bx,
    by,
    c,
    s,
    rArc,
    ox,
    oy,
    thetaA,
    thetaB,
    dTheta,
    subtendedDeg,
    x,
    y,
  };
}

export function calculateGlow(t, edge, nightAmount, q, sunX, sunY, ptA, ptB, R, tokens) {
  const radius = tokens.glowRadiusRatio * R;
  let alpha = 0;
  let gx = sunX;
  let gy = sunY;

  if (nightAmount < 1) {
    const env = envelope(t, edge);
    alpha = tokens.glowDayAlpha * env * (1 - nightAmount);
    gx = sunX;
    gy = sunY;
  } else {
    if (q < 0.5) {
      gx = ptB.x;
      gy = ptB.y;
    } else {
      gx = ptA.x;
      gy = ptA.y;
    }
    const k = q < 0.5 ? 1 - 2 * q : 2 * q - 1;
    alpha = tokens.glowNightFloor + (tokens.glowNightAlpha - tokens.glowNightFloor) * Math.pow(k, 1.6);
  }

  alpha = Math.max(0, Math.min(1, alpha));
  const c0 = formatRgba(tokens.glowColor, alpha);
  const cMid = formatRgba(tokens.glowColor, alpha * tokens.glowMidRatio);
  const c100 = formatRgba(tokens.glowColor, 0);
  const background =
    'radial-gradient(circle at center, ' + c0 + ' 0%, ' + cMid + ' ' + tokens.glowMidStop + '%, ' + c100 + ' 100%)';

  return {
    x: gx,
    y: gy,
    radius,
    alpha,
    background,
  };
}

export function createSunarcController(deps) {
  const document = deps.document;
  const window = deps.window;
  const now = deps.now || function() { return new Date(); };
  const getComputedStyle = deps.getComputedStyle;
  const setTimeout = deps.setTimeout;
  const clearTimeout = deps.clearTimeout;
  const setInterval = deps.setInterval;
  const clearInterval = deps.clearInterval;
  const permissions = deps.permissions;
  const geolocation = deps.geolocation;

  let solarPair = { rise: 390, set: 1170, lastDateKey: null };
  let lastLat = null;
  let lastLon = null;
  let geoGranted = false;
  let geoAttempted = false;
  let resizeTimer = null;
  let intervalId = null;

  function refreshSolarPair() {
    if (!geoGranted || lastLat == null || lastLon == null) return;
    const curDate = now();
    const tzOffsetHours =
      typeof deps.utcOffsetHours === 'number' ? deps.utcOffsetHours : -curDate.getTimezoneOffset() / 60;
    const newRise = noaaSolarTime(curDate, lastLat, lastLon, true, 90.833, tzOffsetHours);
    const newSet = noaaSolarTime(curDate, lastLat, lastLon, false, 90.833, tzOffsetHours);
    if (newRise != null && newSet != null) {
      solarPair = {
        rise: newRise,
        set: newSet,
        lastDateKey: curDate.getFullYear() + '-' + curDate.getMonth() + '-' + curDate.getDate(),
      };
    }
  }

  function tick() {
    if (!document) return;
    const container = document.getElementById('sunarc');
    if (!container) return;
    const sun = container.querySelector('.sunarc-sun');
    const glow = container.querySelector('.sunarc-glow');

    const curDate = now();
    const dateKey = curDate.getFullYear() + '-' + curDate.getMonth() + '-' + curDate.getDate();

    if (geoGranted && lastLat != null && lastLon != null && dateKey !== solarPair.lastDateKey) {
      refreshSolarPair();
    }

    const tokens = parseTokens(function(prop) {
      return getComputedStyle(document.documentElement).getPropertyValue(prop);
    });

    if (!tokens) {
      if (sun) sun.style.opacity = '0';
      if (glow) glow.style.opacity = '0';
      if (document.documentElement) {
        if (document.documentElement.style && typeof document.documentElement.style.removeProperty === 'function') {
          document.documentElement.style.removeProperty('--sunarc-mixed');
        }
        if (typeof document.documentElement.removeAttribute === 'function') {
          document.documentElement.removeAttribute('data-appearance');
        }
      }
      return;
    }

    const timeInfo = calculateSunTime(curDate, solarPair.rise, solarPair.set, tokens.twilightMinutes);
    const mixedGroundRgb = calculateMixedGround(
      tokens.cream,
      tokens.ink,
      tokens.warmDark,
      tokens.inkMix,
      tokens.warmMix,
      timeInfo.nightAmount
    );
    const mixedGroundHex = formatHex(mixedGroundRgb);
    document.documentElement.style.setProperty('--sunarc-mixed', mixedGroundHex);

    const mixedOklab = rgbToOklab(mixedGroundRgb[0], mixedGroundRgb[1], mixedGroundRgb[2]);
    const app = mixedOklab[0] < tokens.appearanceFlip ? 'dark' : 'light';
    document.documentElement.setAttribute('data-appearance', app);

    const vp = deps.viewport ? deps.viewport() : { w: window ? window.innerWidth : 800, h: window ? window.innerHeight : 600 };
    const geom = calculateArcGeometry(
      vp.w,
      vp.h,
      tokens.diameterRatio,
      tokens.bowRatio,
      tokens.overshoot,
      tokens.arcAngle,
      timeInfo.t
    );

    const op =
      timeInfo.t >= -0.02 && timeInfo.t <= 1.02
        ? sunOpacity(timeInfo.t, tokens.envelopeEdge, tokens.peakOpacity, timeInfo.nightAmount)
        : 0;

    if (sun) {
      sun.style.opacity = String(op);
      if (op > 0) {
        sun.style.left = geom.x - geom.r + 'px';
        sun.style.top = geom.y - geom.r + 'px';
        sun.style.width = geom.diam + 'px';
        sun.style.height = geom.diam + 'px';
      }
    }

    const glowInfo = calculateGlow(
      timeInfo.t,
      tokens.envelopeEdge,
      timeInfo.nightAmount,
      timeInfo.q,
      geom.x,
      geom.y,
      { x: geom.ax, y: geom.ay },
      { x: geom.bx, y: geom.by },
      geom.r,
      tokens
    );

    if (glow) {
      glow.style.opacity = String(glowInfo.alpha > 0 ? 1 : 0);
      if (glowInfo.alpha > 0) {
        const gw = glowInfo.radius * 2;
        glow.style.left = glowInfo.x - glowInfo.radius + 'px';
        glow.style.top = glowInfo.y - glowInfo.radius + 'px';
        glow.style.width = gw + 'px';
        glow.style.height = gw + 'px';
        glow.style.background = glowInfo.background;
      }
    }
  }

  function onPositionSuccess(pos) {
    if (!pos || !pos.coords) return;
    lastLat = pos.coords.latitude;
    lastLon = pos.coords.longitude;
    geoGranted = true;
    refreshSolarPair();
    tick();
  }

  function checkGeolocation() {
    if (!permissions || typeof permissions.query !== 'function') return;
    try {
      permissions
        .query({ name: 'geolocation' })
        .then(function(res) {
          if (!res) return;
          function handleStatus(status) {
            if (status === 'granted' && !geoAttempted && geolocation && typeof geolocation.getCurrentPosition === 'function') {
              geoAttempted = true;
              geolocation.getCurrentPosition(onPositionSuccess, function() {}, { timeout: 5000 });
            }
          }
          handleStatus(res.state);
          res.onchange = function() {
            handleStatus(res.state);
          };
        })
        .catch(function() {});
    } catch (_) {}
  }

  function onResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      tick();
    }, 250);
  }

  function onVisibilityChange() {
    if (document && document.visibilityState === 'visible') {
      refreshSolarPair();
      tick();
    }
  }

  return {
    start: function() {
      tick();
      checkGeolocation();
      if (setInterval) {
        intervalId = setInterval(tick, 60000);
      }
      if (window && typeof window.addEventListener === 'function') {
        window.addEventListener('resize', onResize);
      }
      if (document && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', onVisibilityChange);
      }
      return this;
    },
    stop: function() {
      if (intervalId && clearInterval) clearInterval(intervalId);
      if (resizeTimer && clearTimeout) clearTimeout(resizeTimer);
      if (window && typeof window.removeEventListener === 'function') {
        window.removeEventListener('resize', onResize);
      }
      if (document && typeof document.removeEventListener === 'function') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    },
    tick: tick,
    getSolarPair: function() {
      return solarPair;
    },
  };
}

export const SUNARC_JS = `(function(){
function __name(fn){return fn;}
${degToRad.toString()}
${radToDeg.toString()}
${sinDeg.toString()}
${cosDeg.toString()}
${tanDeg.toString()}
${asinDeg.toString()}
${acosDeg.toString()}
${atanDeg.toString()}
${srgbToLinear.toString()}
${linearToSrgb.toString()}
${rgbToOklab.toString()}
${oklabToRgb.toString()}
${mixOklab.toString()}
${parseColor.toString()}
${formatHex.toString()}
${formatRgba.toString()}
${calculateTwoStepNight.toString()}
${calculateMixedGround.toString()}
${parseTokens.toString()}
${noaaSolarTime.toString()}
${calculateSunTime.toString()}
${envelope.toString()}
${sunOpacity.toString()}
${calculateArcGeometry.toString()}
${calculateGlow.toString()}
${createSunarcController.toString()}
createSunarcController({
  window: window,
  document: document,
  now: function() { return new Date(); },
  viewport: function() { return { w: window.innerWidth, h: window.innerHeight }; },
  getComputedStyle: function(el) { return window.getComputedStyle(el); },
  setTimeout: window.setTimeout.bind(window),
  clearTimeout: window.clearTimeout.bind(window),
  setInterval: window.setInterval.bind(window),
  clearInterval: window.clearInterval.bind(window),
  permissions: navigator.permissions,
  geolocation: navigator.geolocation
}).start();
})();`;
