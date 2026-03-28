export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/install") {
      return Response.redirect(`${url.origin}/install.md`, 301);
    }

    const response = await env.ASSETS.fetch(request);

    if (url.pathname.endsWith(".md")) {
      const headers = new Headers(response.headers);
      headers.set("Content-Type", "text/markdown; charset=utf-8");
      return new Response(response.body, { status: response.status, headers });
    }

    return response;
  },
};
