import { RELEASE_PAGE_CONFIGS, parseAppcastItems, parseChangelogItems, parseGitHubReleaseItems, renderReleasesPage } from "./releases.js";

const APPCAST_URL = "https://updates.solstone.app/solstone-macos/appcast.xml";
const JOURNAL_MACOS_APPCAST_URL = "https://updates.solstone.app/journal-macos/appcast.xml";
const WIN_FEED_URL = "https://updates.solstone.app/solstone-windows/releases.win.json";
const ANDROID_ORIGIN_PREFIX = "https://updates.solstone.app/solstone-android/release";
const JOURNAL_CHANGELOG_URL = "https://updates.solstone.app/solstone-journal/CHANGELOG.md";
const LINUX_CHANGELOG_URL = "https://updates.solstone.app/solstone-linux/CHANGELOG.md";
const WIN_CHANGELOG_URL = "https://updates.solstone.app/solstone-windows/CHANGELOG.md";
const ANDROID_RELEASES_URL = "https://api.github.com/repos/solpbc/solstone-android/releases";
const IOS_RELEASES_URL = "https://api.github.com/repos/solpbc/solstone-swift/releases";
const RELEASE_CACHE_TTL = 300; // 5 minutes at the edge

async function latestMacosDmgUrl() {
  try {
    const res = await fetch(APPCAST_URL, {
      cf: { cacheTtl: RELEASE_CACHE_TTL, cacheEverything: true },
    });
    if (!res.ok) return null;
    const xml = await res.text();
    // publish-appcast.py prepends new <item>s, so the first <enclosure ... .dmg> is the latest.
    const match = xml.match(/<enclosure[^>]*\burl="([^"]+\.dmg)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function latestJournalDmgUrl() {
  try {
    const res = await fetch(JOURNAL_MACOS_APPCAST_URL, {
      cf: { cacheTtl: RELEASE_CACHE_TTL, cacheEverything: true },
    });
    if (!res.ok) return null;
    const xml = await res.text();
    const match = xml.match(/<enclosure[^>]*\burl="([^"]+\.dmg)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function latestWindowsSetupUrl() {
  try {
    const res = await fetch(WIN_FEED_URL, {
      cf: { cacheTtl: RELEASE_CACHE_TTL, cacheEverything: true },
    });
    if (!res.ok) return null;
    const feed = await res.json();
    // The feed lists newest release first, so the first "Full" asset is the
    // current version. Deltas carry a Version too but aren't standalone
    // installers, so scan for the first Full rather than taking Assets[0].
    const asset = feed?.Assets?.find((a) => a?.Type === "Full");
    const version = String(asset?.Version ?? "").trim();
    if (!version) return null;
    return `https://updates.solstone.app/solstone-windows/solstone-setup-${version}.exe`;
  } catch {
    return null;
  }
}

// The android app has no auto-updater: an app installed from a file stays at
// that version until someone installs a newer one. So the release origin's
// `latest` pointer is the only thing that knows the current version, and both
// the permalink and the download page read it rather than hard-coding one.
//
// Returns null rather than stale facts if anything is unreadable. A download
// page that names a version and a digest is a page someone checks a file
// against; it must not be able to name the wrong ones.
async function latestAndroidRelease() {
  try {
    const pointer = await fetch(`${ANDROID_ORIGIN_PREFIX}/latest`, {
      cf: { cacheTtl: RELEASE_CACHE_TTL, cacheEverything: true },
    });
    if (!pointer.ok) return null;
    const match = (await pointer.text()).trim().match(/^version=(\d+\.\d+\.\d+)$/);
    if (!match) return null;
    const version = match[1];
    const apkName = `solstone-android-${version}.apk`;
    return { version, apkName, apkUrl: `${ANDROID_ORIGIN_PREFIX}/${version}/${apkName}` };
  } catch {
    return null;
  }
}

// The page's extras, kept separate from the permalink above on purpose: an
// unreadable SHA256SUMS must not stop someone getting the app, and an
// unverified digest must never reach the page. Each failure gets its own
// degradation.
async function latestAndroidFacts() {
  const release = await latestAndroidRelease();
  if (!release) return null;
  try {
    // The digest is published beside the artifact, by the same publisher, in
    // the same transaction. Read it rather than carrying a copy here.
    const sums = await fetch(`${ANDROID_ORIGIN_PREFIX}/${release.version}/SHA256SUMS`, {
      cf: { cacheTtl: RELEASE_CACHE_TTL, cacheEverything: true },
    });
    let sha256 = null;
    if (sums.ok) {
      const line = (await sums.text())
        .split("\n")
        .map((row) => row.trim().split(/\s+/))
        .find(([, name]) => name === release.apkName);
      if (line && /^[0-9a-f]{64}$/.test(line[0])) sha256 = line[0];
    }

    const head = await fetch(release.apkUrl, {
      method: "HEAD",
      cf: { cacheTtl: RELEASE_CACHE_TTL, cacheEverything: true },
    });
    const length = Number(head.headers.get("content-length"));
    const size = head.ok && Number.isFinite(length) && length > 0 ? length : null;

    return { ...release, sha256, size };
  } catch {
    return { ...release, sha256: null, size: null };
  }
}

// Fill the download page's slots from the origin. Every slot has a second
// reading that is still true when the origin cannot be read, so the page never
// has to choose between going blank and stating something it did not verify.
function renderAndroidPage(html, facts) {
  const megabytes = facts?.size ? `${(facts.size / 1e6).toFixed(2)} MB` : null;
  const versionPath = facts ? facts.version : "&lt;version&gt;";
  const sumsUrl = `updates.solstone.app/solstone-android/release/${versionPath}/SHA256SUMS`;
  const digestBlock = facts?.sha256
    ? `<pre><code class="fingerprint">${facts.sha256}</code></pre>\n` +
      `            <p>we publish it beside the file, at <code>${sumsUrl}</code>.</p>`
    : `<p>we publish it beside the file, at <code>${sumsUrl}</code> — that is the copy to check against.</p>`;
  return html
    .replaceAll("{{VERSION}}", versionPath)
    .replaceAll("{{APK_NAME}}", facts ? facts.apkName : "solstone-android-&lt;version&gt;.apk")
    .replaceAll("{{SIZE_PAREN}}", megabytes ? ` (${megabytes})` : "")
    .replaceAll(
      "{{VERSION_LINE}}",
      facts
        ? `version ${facts.version}${megabytes ? ` &middot; ${megabytes}` : ""} &middot; for android 8.0 and later`
        : "for android 8.0 and later",
    )
    .replaceAll("{{DIGEST_BLOCK}}", digestBlock);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // solstone.app is a static/redirect site — every route is GET/HEAD only.
    // Reject other methods up front with a 405 so a body-bearing request (e.g.
    // bot POSTs to /wp-login.php, /.env, /xmlrpc.php) never reaches the asset
    // fallbacks below: env.ASSETS.fetch(request) disturbs the body stream, and
    // reconstructing a Request from it then throws "ReadableStream is disturbed"
    // (scriptThrewException). Same class as the solpbc.org fix.
    if (request.method !== "GET" && request.method !== "HEAD") {
      return methodNotAllowed("GET, HEAD");
    }

    // Binary URL: /download/macos/latest (and the legacy .dmg alias) 302 to the
    // current versioned DMG on updates.solstone.app. Sparkle auto-update does
    // NOT use this path — it reads updates.solstone.app/.../appcast.xml directly.
    if (url.pathname === "/download/macos/latest" || url.pathname === "/download/macos.dmg") {
      const dmgUrl = await latestMacosDmgUrl();
      if (!dmgUrl) {
        return new Response("Latest macOS download is temporarily unavailable. Try again shortly.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
      return Response.redirect(dmgUrl, 302);
    }

    // Human-shareable URL: /download/macos is an HTML page so link unfurlers
    // (Slack, iMessage, Bluesky, etc.) get Open Graph tags and render a rich
    // preview. The page auto-downloads via JS and shows a visible button;
    // the binary itself lives at /download/macos/latest.
    if (url.pathname === "/download/macos") {
      const pageUrl = new URL(request.url);
      pageUrl.pathname = "/download-macos";
      const pageResponse = await env.ASSETS.fetch(assetRequest(pageUrl, request));
      const headers = new Headers(pageResponse.headers);
      headers.set("Content-Type", "text/html; charset=utf-8");
      return new Response(pageResponse.body, { status: 200, headers });
    }

    // Binary URL: /download/journal/latest 302s to the current versioned
    // journal DMG on updates.solstone.app, mirroring /download/macos/latest.
    // sol and the journal are separate macOS apps with their own Sparkle feeds.
    if (url.pathname === "/download/journal/latest") {
      const dmgUrl = await latestJournalDmgUrl();
      if (!dmgUrl) {
        return new Response("Latest journal download is temporarily unavailable. Try again shortly.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
      return Response.redirect(dmgUrl, 302);
    }

    // Human-shareable URL: /download/journal mirrors /download/macos — an HTML
    // page for link unfurlers, auto-downloading via JS; the binary lives at
    // /download/journal/latest.
    if (url.pathname === "/download/journal") {
      const pageUrl = new URL(request.url);
      pageUrl.pathname = "/download-journal";
      const pageResponse = await env.ASSETS.fetch(assetRequest(pageUrl, request));
      const headers = new Headers(pageResponse.headers);
      headers.set("Content-Type", "text/html; charset=utf-8");
      return new Response(pageResponse.body, { status: 200, headers });
    }

    // Windows installer permalink: resolve the current version from the live
    // Velopack feed and 302 to the constructed versioned Setup.exe on R2.
    // Velopack auto-update does NOT use this path; it reads
    // updates.solstone.app/solstone-windows/releases.win.json directly. The
    // legacy /download/windows.exe alias 302s here too so old links keep working.
    if (url.pathname === "/download/windows/latest" || url.pathname === "/download/windows.exe") {
      const setupUrl = await latestWindowsSetupUrl();
      if (!setupUrl) {
        return new Response("Latest Windows download is temporarily unavailable. Try again shortly.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
      return Response.redirect(setupUrl, 302);
    }

    // Human-shareable URL: /download/windows is an HTML page (mirrors
    // /download/macos) so link unfurlers get Open Graph tags and render a rich
    // preview. The page auto-downloads via JS and shows a visible button; the
    // binary itself lives at /download/windows/latest.
    if (url.pathname === "/download/windows") {
      const pageUrl = new URL(request.url);
      pageUrl.pathname = "/download-windows";
      const pageResponse = await env.ASSETS.fetch(assetRequest(pageUrl, request));
      const headers = new Headers(pageResponse.headers);
      headers.set("Content-Type", "text/html; charset=utf-8");
      return new Response(pageResponse.body, { status: 200, headers });
    }

    // Binary URL: /download/android/latest 302s to the current versioned APK on
    // updates.solstone.app, mirroring /download/macos/latest. There is no
    // auto-updater on android to bypass this path — this IS how an owner gets a
    // newer version.
    if (url.pathname === "/download/android/latest" || url.pathname === "/download/android.apk") {
      const release = await latestAndroidRelease();
      if (!release) {
        return new Response("Latest Android download is temporarily unavailable. Try again shortly.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
      return Response.redirect(release.apkUrl, 302);
    }

    // Human-shareable URL: /download/android mirrors /download/macos, with one
    // deliberate difference — it does NOT auto-download. The page explains what
    // android asks before it will install an app it did not get from a store,
    // and a page whose job is to be read before a decision must not start the
    // download out from under the reader. The binary is at
    // /download/android/latest, behind a visible button.
    if (url.pathname === "/download/android") {
      const pageUrl = new URL(request.url);
      pageUrl.pathname = "/download-android";
      const pageResponse = await env.ASSETS.fetch(assetRequest(pageUrl, request));
      if (!pageResponse.ok) return pageResponse;
      const facts = await latestAndroidFacts();
      const headers = new Headers(pageResponse.headers);
      headers.set("Content-Type", "text/html; charset=utf-8");
      // Only cache a page that resolved everything. A degraded render must not
      // sit at the edge for five minutes after the origin has come back.
      headers.set("Cache-Control", facts?.sha256 && facts?.size ? "public, max-age=300" : "no-store");
      return new Response(renderAndroidPage(await pageResponse.text(), facts), { status: 200, headers });
    }

    // The per-device get-sol page lives at /download (index of the /download/*
    // family). /observers is the retired pre-2026-07-03 name and /downloads a
    // likely guess — both 301 here so old links keep working.
    if (url.pathname === "/download") {
      const rewritten = new URL(request.url);
      rewritten.pathname = "/download.html";
      return env.ASSETS.fetch(assetRequest(rewritten, request));
    }

    if (url.pathname === "/observers" || url.pathname === "/downloads") {
      return Response.redirect(`${url.origin}/download`, 301);
    }

    // The one published privacy policy lives at solpbc.org; this app never
    // mints its own (see PhonePaneParts.kt's "do not mint a second privacy
    // page for this app"). Permanent consolidation, not a temporary alias --
    // 301, matching the /observers and /downloads precedent above.
    if (url.pathname === "/privacy") {
      return Response.redirect("https://solpbc.org/privacy", 301);
    }

    // /install.md was a third, unlinked copy of the install page: nothing in
    // the site, llms.txt or the .well-known skill ever referenced it, so it
    // drifted unread and was still telling owners "the tree is not published
    // yet" hours after 2.0.0 published. Retired rather than re-synced --
    // llms.txt and .well-known/skills/default/SKILL.md are the agent-facing
    // surfaces, and install.html is the one install page. 301, matching the
    // /privacy precedent above: permanent consolidation, not an alias.
    if (url.pathname === "/install.md") {
      const target = new URL(request.url);
      target.pathname = "/install";
      return Response.redirect(target.toString(), 301);
    }

    if (url.pathname === "/install") {
      const rewritten = new URL(request.url);
      rewritten.pathname = "/install.html";
      return env.ASSETS.fetch(assetRequest(rewritten, request));
    }

    // /beta is the one URL printed on QR codes and handed out for the phone
    // betas. The page is static; what it points at (the TestFlight public
    // link, /download/android) can change without reprinting anything.
    if (url.pathname === "/beta") {
      const rewritten = new URL(request.url);
      rewritten.pathname = "/beta.html";
      return env.ASSETS.fetch(assetRequest(rewritten, request));
    }

    // The authoritative installer URL: install.sh must be
    // served as plain text, never HTML. The live content-type override is
    // public/_headers (Workers Assets serves this exact-matching static file
    // directly, so this handler never runs while the asset exists -- verified
    // live, `run_worker_first` is unset/false here). This branch is a
    // defense-in-depth fallback for the case the asset is ever missing: if
    // this ever fell through to the SPA shell or a styled 404 page,
    // `curl ... | sh` would pipe markup into a shell -- the worst possible
    // failure for a piped installer. A missing asset still 404s untouched,
    // so a typo'd sibling path never serves the script.
    if (url.pathname === "/install.sh" || url.pathname === "/platform-install.sh") {
      const assetResponse = await env.ASSETS.fetch(assetRequest(url, request));
      if (assetResponse.status === 404) {
        return assetResponse;
      }
      const headers = new Headers(assetResponse.headers);
      headers.set("Content-Type", "text/plain; charset=utf-8");
      return new Response(assetResponse.body, { status: assetResponse.status, headers });
    }

    // Human-shareable release history: always returns a valid page, with
    // no-store graceful copy if the upstream source is temporarily unavailable.
    // Reads the release origin's own CHANGELOG.md mirror, not GitHub — GitHub
    // Releases stopped being kept current here 2026-09-07 (an optional,
    // decoupled mirror step that silently lapsed); the origin's copy is
    // updated in the same publish that ships the binaries, so it can't drift.
    if (url.pathname === "/releases") {
      const items = await changelogReleaseItems(JOURNAL_CHANGELOG_URL);
      return releasesResponse(items, RELEASE_PAGE_CONFIGS.journal);
    }

    if (url.pathname === "/releases/linux") {
      const items = await changelogReleaseItems(LINUX_CHANGELOG_URL);
      return releasesResponse(items, RELEASE_PAGE_CONFIGS.linux);
    }

    // Android reads GitHub releases (same path as journal/linux) — per-release notes
    // ride in each release body (the cut CHANGELOG section), tag `vX.Y.Z`.
    if (url.pathname === "/releases/android") {
      const items = await githubReleaseItems(ANDROID_RELEASES_URL);
      return releasesResponse(items, RELEASE_PAGE_CONFIGS.android);
    }

    // iOS reads GitHub releases (same path as journal/linux/android). An external
    // TestFlight beta submission is the release event on iOS — internal builds are
    // dev checkpoints and are never tagged, so they never appear here. Tag `vX.Y.Z`,
    // notes ride in the release body. See the internal Swift release runbook.
    if (url.pathname === "/releases/ios") {
      const items = await githubReleaseItems(IOS_RELEASES_URL);
      return releasesResponse(items, RELEASE_PAGE_CONFIGS.ios);
    }

    if (url.pathname === "/releases/journal-macos") {
      let items = [];
      try {
        const res = await fetch(JOURNAL_MACOS_APPCAST_URL, {
          cf: { cacheTtl: RELEASE_CACHE_TTL, cacheEverything: true },
        });
        if (res.ok) {
          items = parseAppcastItems(await res.text());
        }
      } catch {
        items = [];
      }

      return releasesResponse(items, RELEASE_PAGE_CONFIGS.journalMacos);
    }

    if (url.pathname === "/releases/macos") {
      let items = [];
      try {
        const res = await fetch(APPCAST_URL, {
          cf: { cacheTtl: RELEASE_CACHE_TTL, cacheEverything: true },
        });
        if (res.ok) {
          items = parseAppcastItems(await res.text());
        }
      } catch {
        items = [];
      }

      return releasesResponse(items, RELEASE_PAGE_CONFIGS.macos);
    }

    // Reads the release origin's own CHANGELOG.md mirror (same pattern as
    // /releases and /releases/linux), not the Velopack feed — that feed only
    // ever carries the single current version, which is exactly the "renders
    // 2.0.2 only" gap this replaces. The feed itself is untouched and still
    // the app's own auto-update source (see WIN_FEED_URL above).
    if (url.pathname === "/releases/windows") {
      const items = await changelogReleaseItems(WIN_CHANGELOG_URL);
      return releasesResponse(items, RELEASE_PAGE_CONFIGS.windows);
    }

    const response = await env.ASSETS.fetch(request);

    if (response.status === 404) {
      const notFoundUrl = new URL(request.url);
      notFoundUrl.pathname = "/404";
      const notFoundResponse = await env.ASSETS.fetch(assetRequest(notFoundUrl, request));
      return new Response(notFoundResponse.body, {
        status: 404,
        headers: notFoundResponse.headers,
      });
    }

    if (url.pathname.endsWith(".md")) {
      const headers = new Headers(response.headers);
      headers.set("Content-Type", "text/markdown; charset=utf-8");
      return new Response(response.body, { status: response.status, headers });
    }

    return response;
  },
};

function methodNotAllowed(allow) {
  return new Response(null, { status: 405, headers: { Allow: allow } });
}

// Reconstruct an asset-fallback request with only method + headers — never the
// body. Cloning the original Request (its body) after env.ASSETS.fetch() has
// disturbed the stream throws "ReadableStream is disturbed"; copying method/
// headers only is body-free and safe. Belt-and-suspenders behind the GET/HEAD
// guard above. Mirrors solpbc.org's assetRequest().
function assetRequest(url, request) {
  return new Request(url, {
    method: request.method,
    headers: request.headers,
  });
}

async function githubReleaseItems(apiUrl) {
  try {
    const res = await fetch(apiUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "solstone.app",
      },
      cf: { cacheTtl: RELEASE_CACHE_TTL, cacheEverything: true },
    });
    if (!res.ok) return [];
    return parseGitHubReleaseItems(await res.json());
  } catch {
    return [];
  }
}

async function changelogReleaseItems(changelogUrl) {
  try {
    const res = await fetch(changelogUrl, {
      cf: { cacheTtl: RELEASE_CACHE_TTL, cacheEverything: true },
    });
    if (!res.ok) return [];
    return parseChangelogItems(await res.text());
  } catch {
    return [];
  }
}

function releasesResponse(items, config) {
  return new Response(renderReleasesPage(items, config), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": items.length ? "public, max-age=300" : "no-store",
    },
  });
}
