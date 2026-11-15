# dayground

the solstone logo is a sun. behind solstone's screens it keeps the time of day. it comes in at the top-left corner at dawn, crosses the screen on one gentle arc, and leaves through the bottom-right corner at dusk. at night the ground dims, a glow rests in the corner, and the stars come out. this page is the whole design: how it works, how to build it, and when to use it.

## the spec

every number and every formula, in the order you need them to build it. the worked numbers were computed by `dayground.js`, and the same numbers are in `dayground.json`.

### 1 · the idea

the solstone logo is a sun, and the dayground is the day's own clock. the logo comes in at the top-left corner at dawn, travels one gentle arc across the screen and leaves through the bottom-right corner at dusk. it is always larger than the screen, so only a piece of it shows. the arc is one slot of the logo's own ring (36°), its size is φ times the screen's shorter side, and its colors are the logo's. it never asks for attention. it tells you, without a word, roughly where you are in the day.

it does this in whichever appearance the owner chose. a light-mode owner's night is lamplit paper with the light still in the corner. a dark-mode owner's day is a lifted warm dark with the logo across it. only a few hours around the middle of the night are truly dark.

from dusk to dawn the sky comes out: gold stars that turn as the sun would, ten of them where the logo's beam tips stood at noon, a short shower at solar midnight, and northern lights in the darkest hours. the logo isn't drawn at night, so the sky is the one graphic then.

### 2 · the values

| parameter | value | why |
|---|---|---|
| **ends** | dawn at the **top-left** corner, dusk at the **bottom-right** corner | |
| **the arc** | a circular arc subtending **36°**, one slot of the ring | angles are 36° or its halvings |
| **bow** (sagitta ÷ chord) | **0.07919** | `tan(36° ÷ 4) ÷ 2` |
| **bow direction** | toward the **top** of the frame | so the logo is highest at midday |
| **over the corner** | **1.0 R** | at t = 0 and t = 1 the centre sits one tip radius past the corner along its diagonal, so the logo is exactly hidden at both ends |
| **the sun's size** | **φ × the shorter side**, tip to tip (Ø) | φ = 1.6180339887 |
| **the logo** | as drawn: gold `#FFCC33` beams, orange `#E8913A` ring | the logo is never redrawn |
| **peak opacity** | **0.55** on a light ground · **0.20** on a dark ground | the same lightness step against either ground (§ 9a) |
| **floor opacity** | **0** | |
| **brightness curve** | **rise · hold · set**: sine ease-in over the first 22 % of the path, full through the middle, sine ease-out over the last 22 % | |
| **warmth toward the horizon** | **none**: the logo's colors never shift | no new color |
| **twilight** | **30 min** either side of sunrise and sunset | |
| **dawn and dusk** | dawn = sunrise − 30 min · dusk = sunset + 30 min | |
| **sunrise and sunset** | from the system timezone's reference point (or a position already in hand) and the date, on the device (§ 5) | |
| **appearance** | **the owner's system appearance**, never the clock, and no setting of its own | the owner's setting is the setting |
| **grounds** | **light:** day `#FEFCF8` · night `#AEA393` · true dark `#8C806E` · **dark:** day `#392E26` · night `#2E241C` · true dark `#281E17` (§ 6) | |
| **ground cross-fade** | day → night linear over each twilight (1 → 0 from dawn to sunrise, 0 → 1 from sunset to dusk); night → true dark by `1 − w` (§ 4) | |
| **halo color** | gold `#FFCC33` | |
| **halo radius** | **φ × R** (R = the sun's tip radius) | one rung up the φ ladder |
| **halo by day** | peak alpha **0.22** × the brightness curve | |
| **the twilight glow** | radius **φ² × R**; alpha **0.62 × w** on a dark ground, **0.95 × w** on a light ground; centred on the sun's position carried along its own circle to **t ∈ [−0.10, 1.10]**; gold → orange on dark, `#FFF3CF` → gold on light (§ 7) | |
| **true dark** | **180 min**, centred on solar midnight; the twilight glow is 0 inside it | |
| **glow gradient** | radial: alpha a at 0 %, 0.45 a at 38 %, 0 at 100 % of the radius | |
| **content** | follows the owner's appearance; every ground sits on its own appearance's side of OKLab L 0.5, so content never flips | |
| **the night sky** | the day's road of stars turning with the sky, the ten tips, the shower at solar midnight, the aurora on the sun's road in true dark (§ 8) | |
| **color outside solstone's brand colors** | the aurora's green `#6CF0A8` → violet `#A27CFF`, and nothing else | |
| **motion** | the minute tick, with one exception: the shower's streaks, animated only on solstone's apps on apple devices at full motion (§ 10) | |

### 3 · geometry: where the logo goes

work in the surface's own pixels (or points, or millimetres), origin top-left, y down. let **W × H** be the surface and **side = min(W, H)**.

1. **size.** `Ø = φ · side`, `R = Ø / 2`. R is the tip radius: the logo's beam tips lie on a circle of radius R. `mark.svg` has a viewBox 27 units across for a tip radius of 13.5, so scale it by `Ø / 27` and put its centre `(16, 16)` where the sun's centre goes.
2. **the ends.** the dawn end **A** is the top-left corner pushed outward one R along its diagonal: `A = (−R/√2, −R/√2)`. the dusk end **B** is the bottom-right corner pushed the same way: `B = (W + R/√2, H + R/√2)`.
3. **the chord.** `c = |AB|`, unit direction `u = (B − A) / c`, midpoint `M = (A + B) / 2`.
4. **the bow.** `s = 0.07919 · c` (the sagitta), on the side of the chord toward the **top** of the frame: take the normal `n` to `u` whose y-component is negative.
5. **the circle.** `Rarc = c² / (8s) + s / 2`. centre `O = M − n · (Rarc − s)`. the arc from A to B on this circle passes through `M + n · s` and subtends 36°.
6. **position at time t ∈ [0, 1].** `θA = atan2(A − O)`, `θB = atan2(B − O)`, `Δ` the signed short way from θA to θB (it is ±36°); `P(t) = O + Rarc · (cos(θA + Δt), sin(θA + Δt))`. the sun's centre is P(t). its angular speed is constant: the logo does not ease along the path, only its brightness eases.
7. **clip** to the surface. nothing of the logo draws outside the frame.

**worked numbers:**

| frame | W × H | side | logo Ø | R | A | B | chord c | sagitta s | arc radius | centre O | P(½) | halo radius |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| phone | 393 × 852 | 393 | 635.9 | 317.9 | (−224.8, −224.8) | (617.8, 1076.8) | 1550.6 | 122.8 | 2509.0 | (−1806.6, 1722.7) | (299.6, 359.3) | 514.4 |
| tablet | 1180 × 820 | 820 | 1326.8 | 663.4 | (−469.1, −469.1) | (1649.1, 1289.1) | 2752.8 | 218.0 | 4454.2 | (−2115.6, 3669.6) | (729.2, 242.3) | 1073.4 |
| web | 1280 × 820 | 820 | 1326.8 | 663.4 | (−469.1, −469.1) | (1749.1, 1289.1) | 2830.5 | 224.1 | 4579.9 | (−2065.6, 3823.5) | (779.2, 234.3) | 1073.4 |
| watch | 416 × 496 | 416 | 673.1 | 336.6 | (−238.0, −238.0) | (654.0, 734.0) | 1319.2 | 104.5 | 2134.6 | (−1287.7, 1620.6) | (285.0, 177.4) | 544.6 |

sample positions on the phone: t = 0.1 → (−105.7, −121.7) · t = 0.25 → (60.4, 46.6) · t = 0.75 → (486.9, 705.5) · t = 0.9 → (572.5, 925.9). at midday the centre is about 93 px inside the right edge and 42 % down: the logo's body fills the upper half of the screen and its left tips reach the left edge. the whole logo is never visible.

one slot of 36° keeps the midday centre just inside the right edge, so the ring and the middle of the logo show through the day rather than a wedge of beams. portrait and landscape use the same rule: corner to corner, bow up. the diagonal changes and the construction does not. on a square surface the chord is the diagonal and the bow is toward the top.

### 4 · time: the day's parameter

let **m** be local minutes since midnight, **rise** and **set** sunrise and sunset on the same clock, and **tw = 30**.

- `dawn = rise − tw`, `dusk = set + tw`, `t = (m − dawn) / (dusk − dawn)`.
- the logo is drawn while `−0.02 < t < 1.02` (a small margin so the last sliver leaves cleanly), and not otherwise.
- **night** (0 = day, 1 = night): 1 before dawn; `1 − (m − dawn) / tw` from dawn to sunrise; 0 through the day; `(m − set) / tw` from sunset to dusk; 1 after dusk.
- **the brightness curve** `env(t)`, rise · hold · set with e = 0.22: `sin(t/e · π/2)` for `t < e`; `1` for `e ≤ t ≤ 1 − e`; `sin((1 − t)/e · π/2)` for `t > 1 − e`. the logo's opacity is `α = peak · env(t) · (1 − night)`, peak 0.55 on a light ground and 0.20 on a dark one.

denver, 2026-09-19 (sunrise 06:44, sunset 19:02, dawn 06:14, dusk 19:32):

| clock | t | night | env |
|---|---|---|---|
| 05:30 | -0.056 | 1.00 | 0.000 |
| 06:14 | -0.001 | 1.00 | 0.000 |
| 06:44 | 0.037 | 0.02 | 0.261 |
| 08:00 | 0.132 | 0.00 | 0.810 |
| 10:00 | 0.283 | 0.00 | 1.000 |
| 12:53 | 0.500 | 0.00 | 1.000 |
| 15:00 | 0.659 | 0.00 | 1.000 |
| 17:30 | 0.847 | 0.00 | 0.888 |
| 19:02 | 0.962 | 0.00 | 0.267 |
| 19:32 | 1.000 | 0.99 | 0.002 |
| 22:00 | 1.185 | 1.00 | 0.000 |

at 08:00 the top-left quarter of the logo shows; at 12:53 its body is across the top with the centre just inside the right edge; at 17:30 it is the lower-right quarter.

#### 4a · the twilight weight and true dark

- **solar midnight** is the midpoint of dusk and the next dawn, which is also the midpoint of sunset and the next sunrise. **true dark** is the window centred on it, of length `min(D, night − 120 min)` with `D = 180 min`, and never below 0 (`from = mid − len/2`, `to = mid + len/2`). the glow always keeps at least an hour to ease out and an hour to ease in: a night shorter than five hours gets a shorter true dark, and a white night of two hours or less gets none. then the glow only touches zero at the midpoint.
- **one extended minute axis.** above about 64° a summer sunset falls after local midnight, and a sunrise equation that returns minutes mod 1440 hands it back *below* sunrise. carry it: `if set < rise then set += 1440`. then read a clock minute that falls before the carried dusk on the same axis: `if dusk > 1440 and m < dusk − 1440 then m += 1440`. the mirror, for a sunrise before 00:30 (dawn before midnight): `if dawn < 0 and m ≥ dawn + 1440 then m −= 1440`. everything below (t, night, w, the window) is computed on that axis.
- **the twilight weight `w`** ∈ [0, 1] says how much twilight glow there is:
  - **dawn → dusk:** `w = 1 − env(t)`, full at the ends of the path and 0 across the plateau.
  - **dusk → the window:** `x = (m − dusk) / (from − dusk)`, `w = (1 − x²)^1.5`. it holds through the early evening and eases to 0 at the window's edge.
  - **inside the window:** `w = 0`.
  - **the window → dawn:** `x = (dawn − m) / (dawn − to)`, `w = (1 − x²)^1.5`, the mirror.
- **the hidden sun's parameter `te`**: `t` by day; `1 + 0.10 x` after dusk; `−0.10 x` before dawn (and ±0.10 inside the window, where nothing is drawn). `P(te)` is § 3's circle carried on past each end, 3.6° more of it.
- **night → true dark**: the ground at night is `mix(night ground, true-dark ground, 1 − w)` (§ 6).

denver, 2026-09-23 (sunrise 06:48, sunset 18:56, solar midnight 00:52), on the phone (393 × 852):

| clock | ground, light · dark | logo opacity, light · dark | w · phase | twilight glow on light: centre · alpha · color | on dark | alpha at the corner, light · dark |
|---|---|---|---|---|---|---|
| 13:00 | `#FEFCF8` · `#392E26` | 0.550 · 0.200 | 0.000 · day | none | none | 0 |
| 18:56 | `#FDFBF7` · `#392E26` | 0.144 · 0.053 | 0.734 · day | (601.9, 1019.6) · 0.698 `#FFE295` | (601.9, 1019.6) · 0.455 `#F9BA36` | 0.373 · 0.243 |
| 19:41 | `#AEA393` · `#2E241C` | 0.000 · 0.000 | 0.994 · evening | (620.4, 1086.7) · 0.944 `#FFE293` | (620.4, 1086.7) · 0.616 `#F8B836` | 0.416 · 0.272 |
| 22:00 | `#9B8F7E` · `#2B2119` | 0.000 · 0.000 | 0.434 · evening | (642.3, 1176.8) · 0.412 `#FFDC7E` | (642.3, 1176.8) · 0.269 `#F1A739` | 0.152 · 0.099 |
| 01:00 | `#8C806E` · `#281E17` | 0.000 · 0.000 | 0.000 · true dark | none | none | 0 |
| 05:30 | `#ACA191` · `#2E241C` | 0.000 · 0.000 | 0.938 · before dawn | (−249.9, −245.0) · 0.891 `#FFE08E` | (−249.9, −245.0) · 0.582 `#F6B437` | 0.375 · 0.245 |
| 06:48 | `#FDFBF7` · `#392E26` | 0.145 · 0.053 | 0.734 · day | (−179.1, −186.7) · 0.697 `#FFE295` | (−179.1, −186.7) · 0.455 `#F9BA36` | 0.383 · 0.250 |

the twilight glow's radius is 832.4 (φ² × R) throughout. "alpha at the corner" is the glow's alpha at the corner the sun left or will return to.

### 5 · sunrise and sunset: on the device, never off it

sunrise and sunset come from a latitude, a longitude and today's date, computed on the device with the standard sunrise equation (NOAA, *almanac for computers*, zenith 90.833°). `noaaSolarTime` in `dayground.js` is a reference implementation that returns local minutes. the dayground sends nothing anywhere: no server call, no log, no coarse location.

the coordinates come from the first of three rungs that has them:

1. **a position the surface already has in hand,** for its own reasons. a platform's own solar times, where it has them and asks for nothing, count as this rung. the dayground never acquires a position: no permission prompt, and no call to the platform's position api at any authorization state. a permission already granted changes nothing, because the call is still a location request when the dayground is what makes it.
2. **the system timezone's reference point.** tzdb's `zone.tab` gives coordinates for each primary zone identifier (`America/Denver` → 39.74° N, 104.98° W; 418 identifiers in tzdata 2026c). `dayground.js` bundles that table and runs the same sunrise equation from the zone's point. use `zone.tab`, not `zone1970.tab`: the second drops every zone that has agreed with another since 1970 (`Europe/Oslo` among them), and devices report those identifiers. within a zone this lands sunrise within about an hour of the truth, and the 30-minute twilights absorb it. no permission, no prompt, no network.
3. **06:30 and 19:30**, only if the zone identifier is not in the table (a legacy alias with no row).

there is no hand-set sunrise or sunset and no setting for the dayground at all. in polar day or night (no sunrise) hold the last valid pair. recompute once a day and when the system timezone, or the position in hand, changes.

### 6 · the grounds

the owner's appearance picks the row; the time picks which of its three grounds shows. the dayground never sets the appearance: no forced color scheme, no theme snap, no flip by the clock.

| appearance | day | night (dusk → the window, the window → dawn) | true dark | text on it |
|---|---|---|---|---|
| **light** | surface cream `#FEFCF8` | **`#AEA393`**: cream mixed 0.70 toward tone `#E4D6BC`, then 0.30 toward `#2E241C` (OKLab) · L 0.72 | **`#8C806E`**: tone `#E4D6BC` mixed 0.45 toward `#2E241C` · L 0.61 | ink 7.0:1 at night, **4.4985:1** at true dark (§ 9) |
| **dark** | **`#392E26`**: cream mixed 0.80 toward ink, then 0.45 toward the warm dark `#2E1906` · L 0.31 | **`#2E241C`**: cream mixed 0.90 toward ink, then 0.45 toward the warm dark · L 0.27 | **`#281E17`**: 0.955, then 0.45 · L 0.25 | tile cream ≥ 12.0:1 |

- **the cross-fade:** day → night linear across each 30-minute twilight, and night → true dark by `1 − w` (§ 4a), so the ground deepens exactly as the corner's light goes out and comes back as it returns.
- **content never flips:** every light ground sits above OKLab L 0.5 and every dark ground below it. the warm dark `#2E1906` is orange ink's hue at ink's lightness, so the dark is warm, not a grey. the light night is the brand's own tone.
- the light true dark is the deepest light night at which ink `#1A1A1A` drawn straight on the ground still reads 4.5:1 rounded (4.4985:1 unrounded, so text there follows § 9). panels and content stay light while the ground behind them goes dusky.
- **a surface whose own ground is another brand ground** (tile cream `#FCF3E4`, white) uses it as its light day ground and keeps the table's night and true dark. **the watch** has no light mode, so it is the dark row (§ 11).

### 7 · the glow

two radial gradients, both with the stops `a → 0.45a → 0` at `0 % → 38 % → 100 %` of their radius, drawn under the logo and over the ground.

- **the day halo:** gold, radius `φ · R`, centred on the sun, `a = 0.22 · env(t) · (1 − night)`.
- **the twilight glow:** radius `φ² · R`, centred on `P(te)` (§ 4a), `a = 0.62 · w` on a dark ground and `0.95 · w` on a light ground.
  - **color on dark:** `mix(gold, orange, 0.30 + 0.50 x)` in OKLab: gold as the sun goes, warming toward orange as it sinks, and cooling back to gold before dawn.
  - **color on light:** `mix(#FFF3CF, gold, 0.45 + 0.25 x)`, the sunrise cream-gold, so the corner reads **brighter** than the dimmed paper, the way the sky stays light where the sun went down. gold alone would only tint the cream.
- **why φ²:** at dusk and dawn the centre sits exactly one R past the corner, so with radius φ²R the corner lands at `1/φ² = 0.382` of the radius, on the gradient's own 38 % stop, and carries 0.45 a.
- **it goes out** inside the true-dark window (`w = 0`). the night has a real bottom, a few hours long.

**order:** the ground, then the twilight glow, then the day halo, then the night sky (§ 8: the still sky, then the moving streaks), then the logo. the two glows overlap only near sunrise and sunset, below alpha 0.06. the sky comes out as the logo leaves: they share the screen only in twilight, while the logo is a fading sliver at the corner and only the brightest stars are out.

the glow is a ground effect. it is never applied to the logo itself, which stays as drawn.

### 8 · the night sky

the reference is `NightSky` and `NightSkyMath` in `dayground.js`. where this section and the code disagree, the code is right.

at night the logo isn't drawn, so the sky takes its place as the one graphic. one surface still has one day: the sky comes out as the logo goes, and they share the screen only in twilight.

**when.** star visibility is `s = night × (1 − 0.62 · w)` (§ 4, § 4a), so the sky comes out as the corner's light goes. night progress `u` runs from 0 at dusk to 1 at the next dawn (½ is solar midnight): `u = (m − dusk) / (1440 − (dusk − dawn))`, wrapping past midnight. by day nothing of the night is computed or drawn.

| element | the rule |
|---|---|
| **the field: the day's road** | one star per 9,000 px² of the polar region about the arc's centre `O` that the night sweeps, in four levels (mix 7 · 16 · 30 · 47 %), plus 2.6 × as many fainter stars (level 2 or 3) in a stream along the arc's own circle (radius `Rarc`, Gaussian σ = side ÷ φ⁴). seeded by the surface's size, so a layout gets the same sky every night (788 stars on the phone). port the generator with every random draw, used or not: the draws nothing uses still fix which stars exist. |
| **levels** | radii 1.75 · 1.38 · 1.08 · 0.85 px (× φ^−½ a step); dark alphas 0.92 · 0.64 · 0.45 · 0.31 (× φ^−¾ a step). level *n* fades in as `s` crosses 0.18 · 0.38 · 0.58 · 0.74 (smoothstep over 0.2): the brightest at dusk, all of them in true dark. each star is dimmed by `1 − min(0.9, 1.9 × the glow alpha at that point)`, so stars fade near the lit corner. |
| **color** | beam gold `#FFCC33`, every star, both appearances. no twinkle: a star never changes brightness. |
| **on light grounds: pinholes** | the same gold, as bright points over the paper rather than ink: alpha `min(1, dark α × 1.05 + 0.08)`, and every star (field and tips) drawn **1.1 ×** larger. |
| **the sky turns** | field, stream and tips rotate about `O` by `Δ · (u − ½)`, `Δ` the sun's own signed 36° (§ 3): about 2 px a minute on a phone, the sun's speed, moved on the minute tick. |
| **the ten tips** | ten stars at the logo's beam-tip angles (36° steps from straight up) on radius `R ÷ φ`, the noon logo one φ rung smaller, centred where the noon sun stands, `P(½)`, turning with the sky. levels by tip 0 1 0 0 1 0 0 1 0 1; radius `(level r × 1.35 + 0.4) × 0.8`, alpha `min(1, level α × 1.25)`, a soft halo at 4.2 × r and 0.14 × alpha. they fade in as `s` goes 0.3 → 0.65. no lines. |
| **the shower** | 11 meteors in the 10 minutes from **solar midnight** (the middle of true dark), the same 11 every night (seed 1021), drawn only while `s > 0.2`. each starts inside the tips and falls outward along one of the ten beam directions, 0.75 to 1.25 s long and 0.16 to 0.30 × side in length: a 1.4 px hairline, cream `#FCF3E4` on dark (peak alpha 0.95) and white on light (0.98), with a tail 0.42 of its length behind the head. |
| **the long exposure** | where streaks don't move (§ 10), each trail is a still 0.9 px hairline at 0.42 × alpha. it is painted on the minute, so a trail appears at the start of the minute its streak falls in, up to 59 s before the streak would have fallen, and every trail clears when the 10 minutes end. |
| **the aurora** | only inside true dark, easing in and out over 45 min (or half a shorter window). vertical rays whose lower edge follows the arc's circle (± 0.04 side of fold), rising 0.42 × side; green `#6CF0A8` at the lower edge to violet `#A27CFF` above. peak alpha 0.34 on dark and 0.42 × 1.3 on light, times the ease; added like light on dark and screened on light, so it lifts the ground. drawn at quarter resolution under a blur of about 3.6 px. **it changes shape once a minute** (a phase step on the tick) and never between ticks. under reduced motion or low power it holds one shape for the night. |

**color outside solstone's brand colors.** the aurora's green and violet are the only colors in the dayground outside solstone's brand colors. they stay in the aurora, in true dark: not a palette, and never a ui, text or brand color.

### 9 · content on top

the dayground is a background. everything that carries meaning sits on top of it in its own container.

- **widgets, cards, sheets and bars** keep their own fill, the platform's material or the surface's paper.
- **text never sits directly on the logo** on a dark ground: cream text over gold at 0.55 on the night ground measures 3.4:1, below AA. on light grounds ink over the logo clears comfortably, but the rule is the same for consistency: give text a container.
- **the app icon, a lockup in the navigation and a small status logo** stay as they are. the dayground is the surface's one graphic, and one small logo in the content does not count against it. there is never a second dayground: one surface, one day.
- **nothing reacts** to the dayground: no shadows cast by the sun, no parallax, no color sampled from it. the same holds for the night sky: nothing reacts to a star, a streak or the aurora.

#### 9a · the logo on a dark ground

on surface cream at 0.55 the logo sits 0.07 / 0.15 (beams / ring) below the ground in OKLab L. on a warm dark at the same 0.55 it would sit 0.35 / 0.27 above it, about three times louder, and dim gold reads olive. **on any ground below L 0.5 the peak is 0.20**, which gives 0.12 / 0.09 against `#392E26`: the same weight on either ground. the colors are unchanged; only the opacity balances.

#### 9b · text over the light night

the light night goes down to `#8C806E` (§ 6). on that ground only ink `#1A1A1A` comes near AA, at **4.4985:1**, at the line rather than over it. softer inks fall well short (`#5B5246` 1.98:1, `#6E6453` 1.50:1, the orange text color `#A15F17` 1.30:1), so the container rule holds in light mode at night as firmly as in dark mode.

- **a translucent panel over the sky is at least 95 % of its light color.** at 90 % cream, orange text `#A15F17` on the panel over the light true dark measures 4.42:1; at 95 %, 4.67:1.
- **a band that would sit on the bare ground** takes an opaque panel in its own color.
- **where a platform puts a label straight on the sky anyway** (a list's section header, an empty slot, a label a large text size pushes out of its card), it takes the platform's full-strength primary label color, never a secondary or dimmed one, and is measured on the deepest ground of both appearances, increased contrast included. black in light mode measures 5.43:1 on `#8C806E`.

legibility is fixed in the container and the label, never by lightening the night.

### 10 · motion, power and visibility

- the logo moves about 2 px a minute on a phone (the phone chord is about 1550 px over about 13 hours). recompute its position **once a minute** and on wake, resume, and a clock or timezone change: no continuous animation, no timer under a minute. use an eased 300 ms transition when a recompute jumps more than a few pixels (after sleep).
- one layer, one path, one gradient. the logo is a single filled path plus one stroked circle. on composited platforms it is one static image, scaled and translated.
- **everything solar stays on the whole minute:** the logo, grounds, glows, stars, tips, aurora and long exposure. the shower's moving streaks alone read a separate fractional time, so a streak is neither delayed nor replayed on resume, and a shower whose first streak ends before the next minute tick is still drawn.
- **the night is cached, not redrawn.** each mounted surface builds its star catalogue once per size and keeps one still raster (aurora, stars, tips, long exposure), recomposed on the minute tick. the aurora is drawn at quarter resolution and cached. there is no full-night atlas and no continuous redraw, and daytime skips the night entirely. panes that share one screen share one raster and one shower clock and clip their part of one scene.

#### 10a · by surface

| surface | the shower's streaks | the aurora's shape |
|---|---|---|
| **solstone's apps on apple devices, at full motion** (mac, iphone, ipad, the watch wrist up) | each streak animated at **at most 60 fps**, sleeping between streaks: no frame clock runs while no streak is falling | changes once a minute |
| **the same, under reduce motion or low power** | the long exposure | one fixed shape for the night |
| **a browser or web view** | the long exposure, always: a page has no power signal it can trust | changes once a minute; an unknown power state does not freeze it |
| **a browser under `prefers-reduced-motion`** | the long exposure | one fixed shape for the night |
| **the apple watch, wrist down** | the long exposure, over black | changes once a minute, the rate always on redraws at (§ 11) |
| **the android watch** | the long exposure, while the screen is interactive (§ 11) | changes once a minute |
| **terminals** | no sky: glow only (§ 11) | none |

- **reduce motion has something to reduce:** the streaks and the aurora's minute steps. **low power** can also recompute every five minutes.
- **hidden work stops.** a hidden browser document, or a sky scrolled out of view, runs no timer, animation frame or canvas work, the host's minute interval included. on return it samples the current time. native painters follow the scene's and the painter's own visibility (on the mac, window occlusion and minimize, not keyboard focus; on the phone and ipad, the background state; the watch's inactive always on counts as visible, its background does not) and the system's reduce motion and low power signals.
- **a web view on windows** has no native power or occlusion signal: it stops only on what the page can see (document visibility, the sky in view) and always shows the long exposure.
- **an ios sheet does not pause the sky.** a sheet can be half height, and pushed screens share the sky, so the shared clock keeps running until a platform shows that a sheet fully covers it. this is a known limit, not a hidden-work guarantee.
- **what it costs, and what isn't measured.** the night adds a small, bounded amount of rendering, not zero. measured: 60 visible minutes in headless Chrome with the gpu off went from about 0.02 s to 0.24 to 0.27 s of main-thread task time, and a hidden 180 s ran zero intervals, animation frames or canvas clears. a fresh full mac background at solar midnight took about 20 ms median cpu at scale 1 and 36 ms at retina, offscreen on a development machine. **battery use, os wakeups, gpu activity, app energy impact and the watch's always-on power are not measured.** so the night has no energy figure, and nothing here says it costs none.
- the playground on this page plays a day in 20 seconds and plays the shower on a click. those are for looking: a real surface moves on the minute.

### 11 · platform notes

**any platform.** load `mark.svg` (viewBox `2.5 2.5 27 27`, tip radius 13.5 about `(16, 16)`). scale it by `Ø / 27`, translate its centre to P(t), clip to the surface, opacity α. the ground comes from § 6, the glows from § 7, the times from §§ 4 and 5. everything in §§ 3 to 7 is a pure function of `(W, H, m, rise, set, appearance)`, which is `calculateFrame` in `dayground.js`: write it once as that function and test it against `dayground.json`. **read the appearance from the system; never set it.** the night sky is the same kind of function, `NightSky` on that frame, plus fractional seconds for the streaks alone (§ 10).

**web.** a layer covering the viewport, fixed to it so scrolling does not move it, with the logo in a box placed at P(t) − R and sized Ø; the layer's `overflow: hidden` is the clip. the ground fills the viewport behind the glows, and each glow is an absolutely positioned box with a `radial-gradient` at the § 7 stops. no `requestAnimationFrame`: a 60-second interval and a `visibilitychange` listener. the appearance is `prefers-color-scheme`, read live, and the page's own dark colors follow the same query, never the clock. the night adds two `<canvas>` layers between the halo and the logo: the still sky, repainted on the minute, and a layer for moving streaks, which stays empty in a browser (§ 10a). when the sky is hidden or out of view (`visibilitychange`, an `IntersectionObserver`), both stop, and so does the minute interval. one page is one surface: one logo per viewport.

`dayground.js` does all of this. `mount()` draws the dayground behind a page with a transparent background and keeps it on the minute; `frame(date, width, height, appearance)` returns one frame's numbers for a renderer of your own; `sunTimes(date)` returns sunrise and sunset from the device's timezone; `NightSky` paints the night on a canvas.

```js
import { mount } from './dayground.js';
const dayground = mount();   // dayground.stop() takes it down
```

**ios, ipados and watchos (SwiftUI).** a `TimelineView(.everyMinute)` driving a `Canvas` or a `Path` built from the logo's geometry (vendor the path data, not a rasterised png). the clip is the container. mix grounds in OKLab in code with the formula, not with `Color.mix`, which blends in sRGB. read `@Environment(\.colorScheme)`, with no `.preferredColorScheme` for the dayground. position: rung 1 or nothing, with no `CLLocationManager` request or read made for the dayground at any authorization state; the zone comes from `TimeZone.current.identifier` (§ 5, rung 2). the sunrise equation is about 40 lines of Swift.

**the apple watch.** the dayground is the watch's background at all times. wrist up it is the dark row with the logo at 0.20 (§ 9a). wrist down it is the dark row's logo at 0.50 over black, with no content on top. the host stays mounted for the life of the scene, so a wrist drop changes only how it draws. the night reaches the watch: wrist up it draws as on the phone (§ 10a), and wrist down it adds the aurora, stepping once a minute, beside the long exposure. watchos has no Core Image, so the watch's aurora blur is nine offset additive draws. the watch's text sits only on underlays: system glass on a control, a standard material behind a details panel.

**mac.** the same Swift renderer as the phone, behind the setup screens. visibility follows window occlusion and minimize, not keyboard focus.

**android.** the phone app does not draw the dayground today. the wear os watch app does, over black: while the screen is interactive it draws the logo at 0.20, both glows, the stars, the ten tips and the aurora, with the shower as the long exposure. in ambient mode it shows the time and a small grey logo instead. a Compose build is a `Canvas` with `withTransform { translate; scale }` drawing the logo's `Path`, a `clipRect`, and a `LaunchedEffect` ticking every minute. appearance: `isSystemInDarkTheme()`, or the app's own light, dark and system choice, resolved, never a snap by the clock. position as above: no `FusedLocationProvider` or `LocationManager` call for the dayground at any permission state; the zone comes from `ZoneId.systemDefault()`.

**terminals.** the same function, but a terminal has no logo to clip, so the dayground there is the **glow only**: a warm tint at the corner the day puts it, and no night sky. say so rather than drawing a low-fidelity logo.

**a web view inside an app** (windows included) follows the web note and § 10a's browser row.

### 12 · acceptance: what to check on a build

- at `t = 0` and `t = 1` no part of the logo is visible (the tip touches the corner exactly).
- at `t = ½` the centre matches the worked table for that frame's W × H within 1 %.
- the arc subtends 36.0° ± 0.1° (compute `2 · asin(c / 2Rarc)`).
- opacity 0.55 at the plateau on a light ground and **0.20 on a dark ground**; 0 outside the day.
- **the appearance equals the system's at every minute:** flip the device's setting at noon and at midnight and the ground follows within a minute. nothing in the dayground sets it.
- the grounds match § 6's table at 13:00, 19:41 and 01:00 (the § 4a worked numbers, ± 1 per channel). light mode reads `#AEA393` at 19:41 and `#8C806E` at 01:00.
- where a surface draws the dark row, its content has a dark treatment.
- the twilight glow's radius is φ² × R. at dusk + 15 min its alpha at the dusk-side corner is ≥ 0.25 on dark and ≥ 0.40 on light; before dawn it sits beyond the top-left and rises.
- inside the true-dark window no glow is drawn and the ground is the true-dark ground.
- a sunset after local midnight (reykjavik, 21 june) reads as day until it and as evening after it, and never jumps the glow to the dawn corner. a night under five hours eases out and in with no one-minute snap.
- the apple watch always draws the dayground: the dark row with the logo at 0.20 while the wrist is up, the dark row's logo at 0.50 over black while it's down. its text sits only on underlays.
- the position updates at most once a minute, with no timer under a minute.
- no network call and no location request comes from the dayground. a call to the platform's position api is a request at any permission state, granted included. no hand-set time, and no setting for it.
- with no position in hand, the times come from the system timezone's `zone.tab` point, not a fixed default.
- one logo per surface; text in containers on dark grounds and on the light night (§ 9).
- **the night sky:** at solar midnight on the worked frames the sky matches `NightSky` in `dayground.js` (pixel-exact in JavaScript for the same frame inputs; native within its rasterizer's differences). by day nothing of the night is drawn or computed.
- **motion follows § 10a on every surface:** no streak moves in a browser, under reduce motion or low power, or on the watch wrist down. full motion animates only while a streak is falling, at no more than 60 fps. the aurora steps at most once a minute and holds one shape under reduce motion and low power, except on the watch wrist down, where it steps once a minute.
- in the long exposure a trail appears at the start of its streak's minute and every trail clears when the 10 minutes end. a streak is neither delayed nor replayed on resume.
- a hidden browser document runs no timer, animation frame or canvas work, and shows the current minute on return.
- every label on the light night clears 4.5:1 on `#8C806E`, increased contrast and the largest text sizes included; a translucent panel over the sky is at least 95 % of its light color (§ 9b).

## for agents

building something for an owner from their journal? take the dayground with you. everything you need is in these files.

- [dayground.md](https://solstone.app/brand/dayground.md): this page as one text file
- [dayground.js](https://solstone.app/brand/dayground/dayground.js): the engine, with no dependencies
- [dayground.json](https://solstone.app/brand/dayground/dayground.json): worked numbers to check your build against
- [mark.svg](https://solstone.app/brand/assets/solstone/svg/mark.svg): the logo

copy these files into what you build. don't link to them from it. a link would send the owner's requests to our server, and the dayground never needs a network.

the dayground never asks for a location. sunrise and sunset come from the device's timezone, worked out on the device.

## using the dayground

the dayground is for apps that show data from a solstone journal. that's what we made it for, and that's what we ask. it's guidance, not a rule, and the code stays open source. using it doesn't mean sol pbc built or endorses your app.

the dayground crops and fades the logo on purpose. anywhere else, leave the logo as it is.

not sure? just ask. there's a contact form at [solpbc.org/contact](https://solpbc.org/contact).
