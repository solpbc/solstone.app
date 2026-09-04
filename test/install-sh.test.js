import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker.js";

// Mock the static-asset binding: /install.sh exists (served with whatever
// content-type Workers Assets would infer -- deliberately the WRONG one here,
// to prove the worker overrides it rather than trusting the default), and
// everything else 404s.
function makeEnv() {
  return {
    ASSETS: {
      async fetch(req) {
        const path = new URL(req.url).pathname;
        if (path === "/install.sh") {
          return new Response("#!/bin/sh\necho hi\n", {
            status: 200,
            headers: { "Content-Type": "application/octet-stream" },
          });
        }
        return new Response("not found", { status: 404 });
      },
    },
  };
}

// req_impawibu / G20: solstone.app/install.sh is the authoritative installer
// URL. A Worker that ever served this as HTML or the wrong content-type would
// break `curl -fsSL https://solstone.app/install.sh | sh` in the worst way --
// the owner pipes markup or a byte-ambiguous type into their shell.
test("GET /install.sh serves the script as text/plain regardless of the asset's own content-type", async () => {
  const res = await worker.fetch(
    new Request("https://solstone.app/install.sh", { method: "GET" }),
    makeEnv(),
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(await res.text(), "#!/bin/sh\necho hi\n");
});

test("HEAD /install.sh is allowed and carries the same content-type override", async () => {
  const res = await worker.fetch(
    new Request("https://solstone.app/install.sh", { method: "HEAD" }),
    makeEnv(),
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8");
});

test("a nonexistent sibling path (the asset missing) still 404s -- never falls back to serving the script", async () => {
  const res = await worker.fetch(
    new Request("https://solstone.app/install.sh.bak", { method: "GET" }),
    makeEnv(),
  );
  assert.equal(res.status, 404);
});

test("POST /install.sh is rejected 405, never executes the asset fetch", async () => {
  const res = await worker.fetch(
    new Request("https://solstone.app/install.sh", { method: "POST", body: "x" }),
    makeEnv(),
  );
  assert.equal(res.status, 405);
});
