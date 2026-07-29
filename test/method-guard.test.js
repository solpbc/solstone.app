import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker.js";

// Mock the static-asset binding. Returns 404 for anything except /404, so we
// exercise the branded-404 fallback path that used to throw on body-bearing
// methods (worker.js: new Request(notFoundUrl, request) over a disturbed body).
function makeEnv() {
  return {
    ASSETS: {
      async fetch(req) {
        const path = new URL(req.url).pathname;
        if (path === "/404") {
          return new Response("<h1>not found</h1>", {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
        if (path === "/install.html") {
          return new Response("<h1>install</h1>", { status: 200 });
        }
        return new Response("not found", { status: 404 });
      },
    },
  };
}

// Regression: bot POST/PUT/DELETE probes to unknown paths must NOT throw a
// scriptThrewException — they get a clean 405. Before the fix these reached the
// 404 fallback, which reconstructed a Request from the already-read body and
// threw "ReadableStream is disturbed". (Mirrors the same fix on solpbc.org.)
for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
  test(`${method} to an unknown path returns 405, never throws`, async () => {
    const res = await worker.fetch(
      new Request("https://solstone.app/wp-login.php", {
        method,
        body: method === "DELETE" ? undefined : '{"probe":"x"}',
        headers: { "Content-Type": "application/json" },
      }),
      makeEnv(),
    );
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("allow"), "GET, HEAD");
  });
}

test("POST with a body to a real GET route (/install) is rejected with 405, not a throw", async () => {
  const res = await worker.fetch(
    new Request("https://solstone.app/install", {
      method: "POST",
      body: '{"probe":"x"}',
      headers: { "Content-Type": "application/json" },
    }),
    makeEnv(),
  );
  assert.equal(res.status, 405);
});

test("GET to an unknown path still serves the branded 404 page", async () => {
  const res = await worker.fetch(
    new Request("https://solstone.app/nope", { method: "GET" }),
    makeEnv(),
  );
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
});

test("HEAD to an unknown path is allowed and 404s cleanly", async () => {
  const res = await worker.fetch(
    new Request("https://solstone.app/nope", { method: "HEAD" }),
    makeEnv(),
  );
  assert.equal(res.status, 404);
});
