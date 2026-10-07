import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "../worker.js";

const EXPECTED = {
  "strict-transport-security": "max-age=31536000",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "x-frame-options": "DENY",
};

function assertSecured(res, label) {
  for (const [name, value] of Object.entries(EXPECTED)) {
    assert.equal(res.headers.get(name), value, `${label}: ${name}`);
  }
}

const notFoundAssets = {
  ASSETS: {
    async fetch(req) {
      if (new URL(req.url).pathname === "/404") {
        return new Response("<h1>not found</h1>", { status: 200, headers: { "Content-Type": "text/html" } });
      }
      return new Response("", { status: 404 });
    },
  },
};

test("worker responses carry the security headers: page, redirect, 405 and 404", async () => {
  assertSecured(await worker.fetch(new Request("https://solstone.app/observers"), {}), "redirect");
  assertSecured(await worker.fetch(new Request("https://solstone.app/", { method: "POST" }), {}), "405");
  assertSecured(await worker.fetch(new Request("https://solstone.app/nope"), notFoundAssets), "404");
});

test("/404 itself answers 404, in both spellings", async () => {
  for (const path of ["/404", "/404.html"]) {
    const res = await worker.fetch(new Request(`https://solstone.app${path}`), notFoundAssets);
    assert.equal(res.status, 404, path);
    assert.match(await res.text(), /not found/, path);
  }
});

test("/404 runs through the worker, so its status can be 404", async () => {
  const toml = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.match(toml, /run_worker_first = \[[^\]]*"\/404"[^\]]*"\/404\.html"/);
});

test("public/_headers sets the same block on every static asset", async () => {
  const headers = await readFile(new URL("../public/_headers", import.meta.url), "utf8");
  const block = headers.split(/\n\s*\n/).find((section) => section.startsWith("/*\n"));
  assert.ok(block, "a /* block exists");
  for (const [name, value] of Object.entries(EXPECTED)) {
    const line = block.split("\n").find((row) => row.trim().toLowerCase().startsWith(`${name}:`));
    assert.ok(line, name);
    assert.equal(line.trim().slice(name.length + 1).trim(), value, name);
  }
});
