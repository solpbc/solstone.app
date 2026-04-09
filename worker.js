export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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
