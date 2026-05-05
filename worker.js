const APPCAST_URL = "https://updates.solstone.app/solstone-macos/appcast.xml";
const APPCAST_CACHE_TTL = 300; // 5 minutes at the edge

async function latestMacosDmgUrl() {
  const res = await fetch(APPCAST_URL, {
    cf: { cacheTtl: APPCAST_CACHE_TTL, cacheEverything: true },
  });
  if (!res.ok) return null;
  const xml = await res.text();
  // publish-appcast.py prepends new <item>s, so the first <enclosure ... .dmg> is the latest.
  const match = xml.match(/<enclosure[^>]*\burl="([^"]+\.dmg)"/);
  return match ? match[1] : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/download/macos" || url.pathname === "/download/macos.dmg") {
      const dmgUrl = await latestMacosDmgUrl();
      if (!dmgUrl) {
        return new Response("Latest macOS download is temporarily unavailable. Try again shortly.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
      return Response.redirect(dmgUrl, 302);
    }

    if (url.pathname === "/install") {
      const rewritten = new URL(request.url);
      rewritten.pathname = "/install.html";
      return env.ASSETS.fetch(new Request(rewritten, request));
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
