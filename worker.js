import { RELEASE_PAGE_CONFIGS, parseAppcastItems, parseGitHubReleaseItems, parseWinFeedItems, renderReleasesPage } from "./releases.js";

const APPCAST_URL = "https://updates.solstone.app/solstone-macos/appcast.xml";
const JOURNAL_MACOS_APPCAST_URL = "https://updates.solstone.app/journal-macos/appcast.xml";
const WIN_FEED_URL = "https://updates.solstone.app/solstone-windows/releases.win.json";
const JOURNAL_RELEASES_URL = "https://api.github.com/repos/solpbc/solstone-journal/releases";
const LINUX_RELEASES_URL = "https://api.github.com/repos/solpbc/solstone-linux/releases";
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // solstone.app is a static/redirect site — every route is GET/HEAD only.
    // Reject other methods up front with a 405 so a body-bearing request (e.g.
    // bot POSTs to /wp-login.php, /.env, /xmlrpc.php) never reaches the asset
    // fallbacks below: env.ASSETS.fetch(request) disturbs the body stream, and
    // reconstructing a Request from it then throws "ReadableStream is disturbed"
    // (scriptThrewException). Same class as the solpbc.org fix (req_4jqldsxb).
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

    if (url.pathname === "/install") {
      const rewritten = new URL(request.url);
      rewritten.pathname = "/install.html";
      return env.ASSETS.fetch(assetRequest(rewritten, request));
    }

    // Human-shareable release history: always returns a valid page, with
    // no-store graceful copy if the upstream source is temporarily unavailable.
    if (url.pathname === "/releases") {
      const items = await githubReleaseItems(JOURNAL_RELEASES_URL);
      return releasesResponse(items, RELEASE_PAGE_CONFIGS.journal);
    }

    if (url.pathname === "/releases/linux") {
      const items = await githubReleaseItems(LINUX_RELEASES_URL);
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
    // notes ride in the release body. See vpe/playbooks/solstone-swift-release.md.
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

    // Windows reads the live Velopack feed (our own R2 surface, not GitHub) —
    // mirrors /releases/macos reading the live appcast. Per-release notes ride in
    // each Full asset's NotesMarkdown; the page auto-reflects every release.
    if (url.pathname === "/releases/windows") {
      let items = [];
      try {
        const res = await fetch(WIN_FEED_URL, {
          cf: { cacheTtl: RELEASE_CACHE_TTL, cacheEverything: true },
        });
        if (res.ok) {
          items = parseWinFeedItems(await res.json());
        }
      } catch {
        items = [];
      }

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
// guard above. Mirrors solpbc.org's assetRequest() (req_4jqldsxb).
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

function releasesResponse(items, config) {
  return new Response(renderReleasesPage(items, config), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": items.length ? "public, max-age=300" : "no-store",
    },
  });
}
