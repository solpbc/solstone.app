# services.solstone.app — approved redesign reference

**This is the authoritative visual + structural spec** for the experience-layer redesign of the services portal. Founder-approved 2026-06-11 (VPX project #1). Full rationale + a11y numbers: extro repo `vpx/workspace/services-portal-design-pass/design-decisions.md` and decision `records/decisions/260611-vpx-services-portal-experience-design-approved.md`.

The `surfaces/*.html` files are standalone, rendered mockups (they link `../portal.css` and `../fonts/`). **They are the target markup + styling.** The implementation ports `src/html.js` (and the `layout()` shell + a small `src/index.js` font route) to produce this design. Behavior is unchanged — only the experience layer.

## design system
- **`portal.css`** — the full stylesheet. Becomes the portal's CSS (serve it same-origin + cached at a route like `/portal.css`, or inline it in `layout()` — implementer's call; a served+cached stylesheet is preferred over re-inlining ~280 lines on every page).
- **`fonts/comfortaa-latin.woff2`, `fonts/inter-latin.woff2`** — brand fonts. Serve **same-origin, no external CDN** (brand requirement). Embed in the worker bundle (base64 module) and serve at e.g. `/fonts/<name>.woff2` with `Cache-Control: public, max-age=31536000, immutable`. `@font-face` in portal.css already references `fonts/<name>.woff2` — adjust the url to the served path.
- **a11y (load-bearing — this redesign FIXES a live WCAG defect):** sol-orange `#E8923A` is **decoration only** (never carries text); all orange text uses `#B06A1A`; primary buttons are **dark ink `#1A1A1A` on orange (7.13:1)** — never white-on-orange. Every text/background pair clears WCAG AA 4.5:1 (the tokens in portal.css are already tuned for this). Headings are **authored lowercase** — do NOT `text-transform: lowercase` them (that would force "Gemini" lowercase, violating third-party casing).

## the persistent chrome (new — on every signed-in page)
A top bar with a brand-home link (left) + a top-right **sign-in menu** (`<details class="usermenu">`, the owner's initial avatar) opening: header (`signed in as <email>` + `last sign-in <relative>`), then `home` · `manage sign-in` · separator · `sign out`. **Never the word "account"** anywhere (aria-labels, comments, copy) — it's the owner's sign-in. See `surfaces/03-dashboard-populated.html` (closed) and `03b-dashboard-menu-open.html` (open). Add this chrome to: dashboard, scout, sign-in shell/sessions/passkeys/emails, transparency, support, devices. Pre-auth/flow pages (landing, verify, consent, enabled, error/forbidden/not-found, goodbye) use the simpler centered `.brandbar`, no menu.

## surface → renderer map (`src/html.js`)
| mockup | renderer(s) | notes |
|---|---|---|
| `01-landing.html` | `renderLanding` | **preserve** `LANDING_JS` + `#passkey-error` + `<form action="/signin/start">` + `autocomplete="email webauthn"` on the email input (passkey conditional-UI). Keep the Turnstile div + `csrf`/resume hidden inputs. |
| `02-verify.html` | `renderVerify` | keep the OTP `<input class="code" name="code" ...>` + csrf/resume inputs + both email-shown and email-input variants. |
| `03-dashboard-populated.html` / `03b` | `renderServicesDashboard` (active) | umbrella card, scout + push rows (pill→manage), **support as a first-class service row** (chevron, no pill), standard footer (single link → `https://solpbc.org/privacy`). Preserve the passkey welcome panel + `ENROLL_JS` + its `#passkey-add`/`#passkey-skip`/`#passkey-friendly-name`/`#passkey-enroll-error` ids when `welcome` is true. |
| `04-dashboard-fresh.html` | `renderServicesDashboard` (fresh) | off-pills + welcome passkey card + the "enable from your device" notice + support row + footer. |
| `05-scout-active.html` | `renderServicesScout` (active) | §2a framing: `on · sol pbc is covering your Gemini usage`, honest paragraph, Gemini-key row, reveal/rotate/turn-off, audit history. Keep the existing ack→reveal flow + `flashMessages`. |
| `06-scout-empty.html` | `renderServicesScout` (no active key) | empty state: icon + heading + the `journal services enable scout` path. |
| `07-scout-reveal.html` | `renderServicesScout` ack-gate + `renderServicesScoutReveal` | gate card (CMO §2a copy) then revealed key in a mono field. Preserve the ack/reveal POST flow + warning hidden input. |
| `08-consent-scout.html` | `renderEnableScoutConsent` (+ apply pattern to `renderEnablePushConsent`) | numbered grant cards, **copy verbatim** (covenant-touching), real allow/cancel submit buttons. Must keep passing `brand-canon.test.js` enable-surface-strict (no sign-in/account/linked words). |
| `16-enabled.html` | `renderEnableScoutDone` (+ push done) | success card (§4d copy), route to manage. |
| `09-signin-shell.html` | `renderSignInShell` | §3 rows with descriptions; footer = `what we have about you` + `how we earn your trust`→privacy; drop the redundant bottom sign-out (it's in the menu). |
| `10-signin-passkeys.html` | `renderSignInPasskeys` | **preserve** `ENROLL_JS` + `#passkey-add`/`#passkey-friendly-name`/`#passkey-enroll-error` + the rename/remove forms. |
| `11-signin-sessions.html` | `renderSignInSessions` | `this device` pill, restrained destructive buttons, revoke-others. |
| `13-transparency.html` | `renderTransparency` | grouped sign-in/emails/passkeys/sessions + "what we don't have" + Article 8 citation. |
| `14-error.html` | `renderError` (+ `renderForbidden`, `renderNotFound`, `renderGoodbye`) | recovery-first; keep `renderForbidden`'s byte-identical state-free body (no host/account input) for the no-enumeration property. |
| *(no mockup)* | `renderSignInEmails`, `renderEmailVerify` | apply the same `.group`/`.row`/`.card` pattern as passkeys/sessions; keep add/verify/make-primary/remove forms + badges + the `enableSurfaceStrict`-safe wording. |
| *(no mockup)* | `renderServicesDevices` | same row pattern as sessions; keep revoke-all + per-device revoke. |
| *(no mockup)* | `renderSupportList`, `renderSupportDetail`, `renderSupportNotFound` | restyle to `.group`/`.row`/`.card`/`.notice`/`.empty`; **copy unchanged** (incl. the attachment-deletion notice verbatim). |

## hard constraints (behavior preservation — this is experience-layer only)
1. **Every JS hook intact:** `LANDING_JS` + `ENROLL_JS` run unchanged; all ids/selectors/form `action`s/`autocomplete` attrs they depend on are preserved. Restyle around them.
2. **No-enumeration & CSRF preserved:** identical-bytes responses, `renderForbidden` stays state-free, csrf hidden inputs on every POST form.
3. **All `npm test` green** (both vitest configs). Update copy/markup assertions to the new design; do not weaken behavioral assertions (status codes, single-consume, retention, auth, no-enumeration). `brand-canon.test.js` must pass as-is or stronger.
4. **No "account" owner-visible or in our framing.** Naming/verb canon per `cmo/brand/services.md`. "Gemini" keeps canonical case.
5. **Clean up:** remove this `design-reference/surfaces/*.html` (throwaway mockups) at the end; keep the fonts (as served assets) and replace this README with a short `DESIGN.md` pointing to the extro design-decisions doc. Keep `portal.css` as the real stylesheet source.
