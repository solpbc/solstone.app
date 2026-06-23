import { RELEASE_PAGE_CONFIGS, parseAppcastItems, parseGitHubReleaseItems, renderReleasesPage } from "./releases.js";

const APPCAST_URL = "https://updates.solstone.app/solstone-macos/appcast.xml";
const JOURNAL_RELEASES_URL = "https://api.github.com/repos/solpbc/solstone-journal/releases";
const LINUX_RELEASES_URL = "https://api.github.com/repos/solpbc/solstone-linux/releases";
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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
      const pageResponse = await env.ASSETS.fetch(new Request(pageUrl, request));
      const headers = new Headers(pageResponse.headers);
      headers.set("Content-Type", "text/html; charset=utf-8");
      return new Response(pageResponse.body, { status: 200, headers });
    }

    // Windows installer permalink: 302 to the latest Velopack Setup.exe on R2.
    // Velopack emits a stable Setup.exe name, so this always points at the
    // current release — no feed parse needed (unlike the versioned macOS DMG).
    // Velopack auto-update does NOT use this path; it reads
    // updates.solstone.app/solstone-windows/releases.win.json directly.
    if (url.pathname === "/download/windows" || url.pathname === "/download/windows.exe") {
      return Response.redirect(
        "https://updates.solstone.app/solstone-windows/Solstone-win-Setup.exe",
        302,
      );
    }

    if (url.pathname === "/install") {
      const rewritten = new URL(request.url);
      rewritten.pathname = "/install.html";
      return env.ASSETS.fetch(new Request(rewritten, request));
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

    const response = await env.ASSETS.fetch(request);

    if (response.status === 404) {
      const notFoundUrl = new URL(request.url);
      notFoundUrl.pathname = "/404";
      const notFoundResponse = await env.ASSETS.fetch(new Request(notFoundUrl, request));
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
