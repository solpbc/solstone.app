# solstone.app — agent guide

This file is the developer guide for the `solstone.app` repository. Read it
before writing code. `CLAUDE.md` and `GEMINI.md` are symlinks to this file.

> ⚠️ The root `README.md` is stale — it describes this as "a static deploy, no
> install step." That is true of the *root* site only. **This repo actually
> ships three separate Cloudflare Workers**, one of which (`account/`) is a
> large, security-critical account portal. Orient from §1, not the README.

## 1. This repo is three Workers

Each directory below is an independent Worker with its own `wrangler.toml`,
deployed separately. Know which one you're in before you change anything.

| Worker | Dir | Domain | What it is | Deploy | Test |
|--------|-----|--------|-----------|--------|------|
| `solstone-app` | repo root (`worker.js`, `releases.js`, `public/`) | `solstone.app` | Product site + download permalinks + release-history pages. Mostly static assets with a thin router. | `make deploy` (regenerates `sitemap.xml` then `wrangler deploy`) | `node --test test/*.test.js` |
| `account-portal` | `account/` | `services.solstone.app` | **The account portal** — owner accounts, passkeys, sessions, billing, entitlements, devices, push, service enablement. Security-critical. D1-backed. | `cd account && npm run deploy` | `cd account && npm test` (vitest) |
| `scouts` | `scouts/` | `scouts.solstone.app` | **Retired** — now only 301-redirects to `services.solstone.app/scout`. Scout data migrated into `account-portal`. | `cd scouts && npm run deploy` | (none) |

There is no top-level orchestrator that deploys all three — each is shipped from
its own directory. The root `Makefile` only deploys the root site.

## 2. The account portal (`account/`) — read before touching it

This is the most security-sensitive code in the repo: it holds user account
state and sits on sol pbc's money path. Treat it accordingly.

**What it does:** email-OTP + passkey (WebAuthn) sign-in, sessions, multi-email
management, device registration + dispatch tokens, APNs push, Stripe billing,
SPL/SPB entitlement grants pushed to the relay, Gemini key provisioning for
scouts, an R2 credential broker (SPB), a support-portal proxy, and a
CF-Access-gated `/admin/*` surface. Cron (`0 */6 * * *`) runs retention.

**Module map (`account/src/`):**

| Module | Owns |
|--------|------|
| `index.js` | The router — request dispatch for `services.solstone.app`. Start here. |
| `admin.js` | `/admin/*` operator surface (behind CF Access — see §4). |
| `db.js` | All D1 queries. The single data-access layer. |
| `crypto.js` | Email encryption, OTP generation, session-token mint, pepper hashing, `timingSafeEqual`. |
| `session.js`, `passkey.js`, `email.js`, `emails.js` | Auth + identity + email lifecycle. |
| `enable.js`, `devices.js`, `push.js`, `reach.js` | Service enablement (push/scout/SPL/SPB handoffs), device + dispatch-token + APNs flows. |
| `billing.js`, `spb-billing.js`, `stripe.js`, `relay-grant.js`, `spb-entitlement.js`, `spb-broker.js` | The money path — Stripe checkout/portal/webhook, entitlement grants to `spl-relay`, the R2 credential broker. |
| `provisioning.js`, `gcp.js`, `scout-migrate.js` | Gemini key provisioning + scout migration. |
| `support.js` | Proxy to the `extro-support` worker (internal service binding). |
| `settings.js`, `html.js`, `assets.js`, `portal.css`, `inline/` | The signed-in experience layer (see `account/DESIGN.md`). |
| `hub.js`, `retention.js` | Security-event sink to extro-hub; cron retention. |

**D1 migrations** live in `account/migrations/000N_*.sql` (wired via
`migrations_dir` in `wrangler.toml`); `account/schema.sql` is the consolidated
schema. Add a new numbered migration file for any schema change — never edit a
shipped migration. When you tighten a column/constraint, ship the migration
*with* forgiving read-side handling for legacy rows; don't strand existing data.

**Tests:** vitest on `@cloudflare/vitest-pool-workers`, two configs run in
sequence by `npm test` (`vitest.config.js` for worker tests,
`vitest.static.config.js` for the static-asset checks). The suite is large
(~100 files) and includes per-migration tests and `brand-canon.test.js` — keep
it green and add coverage for new routes/migrations.

## 3. Build / test / deploy

```bash
# Root site (solstone.app)
make deploy            # regenerate sitemap, then wrangler deploy
make dev               # wrangler dev
node --test test/*.test.js   # download + releases parsing tests

# Account portal (services.solstone.app)
cd account
npm install
npm run dev            # wrangler dev (Miniflare; local D1)
npm test               # vitest — the gate; green before commit
npm run deploy         # wrangler deploy (operator-run)

# Scouts redirect
cd scouts && npm run deploy
```

There is **no GitHub Actions / CI** in this repo, by policy — every deploy is
`wrangler deploy` run by an authenticated operator from a local machine.

## 4. Security invariants — the account portal handles accounts and money

These are not optional. A change that weakens one is wrong regardless of size.

- **`/admin/*` is two-layer-protected; keep it that way.** Edge Cloudflare
  Access (`CF_ACCESS_AUD`) *plus* the in-worker JWT check. `workers_dev = false`
  in `account/wrangler.toml` is load-bearing: a live `*.workers.dev` hostname
  would bypass the custom domain's edge CF Access and leave only one layer (CSO
  audit F5). Never re-enable `workers_dev`.
- **Identity is resolved at the boundary, never client-supplied.** Derive the
  actor from the authenticated session / CF Access token / signed dispatch
  token — never trust an account id named in a request body or URL as the actor.
  Treat any scope id in a path as an assertion to check against the
  authenticated record.
- **Secrets live only in `wrangler secret put` — never in the repo.** Stripe
  keys, APNs `.p8`, relay-grant secret, SPB broker keys, hub-webhook secret,
  the impersonation allowlist. `account/wrangler.toml` documents each one and
  why; `[vars]` holds **non-secret config only**. Never log a secret, a token, a
  session value, or PII. The hub security-event webhook (`HUB_WEBHOOK_URL`)
  never carries raw tokens or credentials — typed events only.
- **Money-movement safety: never auto-mint a value a safety invariant depends
  on.** Verify Stripe webhook signatures (`STRIPE_WEBHOOK_SECRET`) before acting.
  The SPB broker ships with a default-off kill switch (`SPB_MINT_ENABLED` unset
  in prod). A loud fail-closed beats a quiet convenient default on the money path.
- **Impersonation is default-off and transient.** `IMPERSONATE_ALLOWED` is unset
  in prod (no account is impersonable, even with a valid CF Access token).
  Provision it for a single test run and delete it after; never a `[vars]` entry,
  never a hardcoded account id.
- **Encrypt PII at rest.** Emails are stored encrypted (`crypto.js`
  `encryptEmail`), compared via hashes with a pepper, and OTP/credential
  comparisons use `timingSafeEqual`. Don't add a code path that stores or logs a
  plaintext email or token.
- **Data covenant (Article 8).** This is user account data. It is never sold,
  licensed, shared, or used for analytics, profiling, or behavioral tracking —
  no exceptions, no analytics SDKs, no tracking pixels. Architectural, not policy.

## 5. Coding principles (sol pbc engineering standards, inlined)

These are the load-bearing sol pbc engineering standards for this repo, stated
here so they stand on their own:

- **Fail fast, fail clearly; no silent failures.** Validate at the request
  boundary; raise/return clear errors. The download/release routes already model
  the right pattern: an upstream fetch failure returns a `503`/`no-store`
  graceful page, never a confident-but-wrong success. Never swallow an exception
  and report success on a degraded result.
- **REST API design (the account portal is a real HTTP surface).** Status code
  is the success signal; the body is the resource. One error envelope with a
  machine-readable reason; don't pick status by substring-matching a message.
  Collections paginate with a bounded read. Compose multi-domain views in one
  named server endpoint, not a client fan-out.
- **KISS / YAGNI.** Don't add config, abstraction, fallbacks, or "defense in
  depth" for cases that don't exist. The root site is a thin router over static
  assets — keep it thin. Reach for complexity only when a concrete case forces it.
- **Verify before you claim.** External shapes — Stripe API responses, APNs
  payloads, the spl-relay grant endpoint, the GitHub releases / Sparkle appcast
  feeds — get verified against the live source before code depends on them, and
  against the *real* serialization boundary in tests (don't mock both sides of a
  wire contract). A 30-second check beats a 500-line reversal.
- **No backwards-compat shims.** Update all call sites directly when you rename
  or move something; for stored-data changes, write a D1 migration. No deprecated
  aliases or re-exports.
- **Reference, don't duplicate.** The portal experience-design rationale lives in
  the extro org (`vpx/workspace/services-portal-design-pass/` per
  `account/DESIGN.md`); don't copy it here. Point to the source of truth.

## 6. Conventions

- **License: MIT** (root `LICENSE`). Source files in this repo do **not**
  currently carry SPDX headers — match the existing files; do not bulk-add
  headers as a side effect of other work.
- **Runtime: Cloudflare Workers** via `wrangler` (v3 in `account/`, the root
  uses the global `wrangler`). Root tests use Node's built-in test runner;
  `account/` uses vitest on the Workers pool. Build interface is `make` at the
  root, `npm` scripts inside `account/` and `scouts/`.
- **Vendor all client-side dependencies.** Never load scripts, styles, or fonts
  from third-party CDNs — the portal serves its own CSS + `.woff2` fonts
  same-origin (`account/src/assets.js`). A compromised CDN can read everything on
  an authenticated page.
- **Brand canon (owner-facing copy).** Lowercase-first; no surveillance verbs
  (watch/capture/record/monitor/track/collect); avoid the forbidden phrasings
  enforced by `account/test/brand-canon.test.js`. solstone copy follows the
  sol platform canon (2026-07-03): solstone = the platform, **sol** = the app on
  every device, **the journal** = the memory sol keeps. "observers" and the
  "keeper" title are retired from customer-facing copy ("observer" stays
  engineering-internal); any statement of sol's presence lands the journal in
  the same breath. When you touch owner-visible strings, run the brand-canon
  test.
- **`scouts/` is retired** — a redirect-only Worker. Note the `wrangler.toml`
  cron gotcha documented there: an empty `crons = []` is required to *clear* a
  server-side schedule; omitting `[triggers]` does not delete it.
