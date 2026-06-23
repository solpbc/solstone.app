import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker.js";

const DOWNLOAD_PATHS = ["/download/macos/latest", "/download/macos.dmg"];
const UNAVAILABLE_MESSAGE = "Latest macOS download is temporarily unavailable. Try again shortly.";

async function fetchDownload(path) {
  return worker.fetch(new Request("https://solstone.app" + path), {});
}

async function assertUnavailableResponse(res) {
  assert.equal(res.status, 503);
  assert.equal(await res.text(), UNAVAILABLE_MESSAGE);
  assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(res.headers.get("cache-control"), "no-store");
}

test("macOS download returns 503 when appcast fetch rejects", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  globalThis.fetch = () => Promise.reject(new Error("Network connection lost"));

  for (const path of DOWNLOAD_PATHS) {
    const res = await fetchDownload(path);
    await assertUnavailableResponse(res);
  }
});

test("macOS download returns 503 when appcast fetch is non-ok", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  globalThis.fetch = () => Promise.resolve(new Response("", { status: 500 }));

  for (const path of DOWNLOAD_PATHS) {
    const res = await fetchDownload(path);
    await assertUnavailableResponse(res);
  }
});

test("macOS download returns 503 when appcast has no dmg enclosure", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  globalThis.fetch = () => Promise.resolve(new Response("<rss><channel></channel></rss>", { status: 200 }));

  for (const path of DOWNLOAD_PATHS) {
    const res = await fetchDownload(path);
    await assertUnavailableResponse(res);
  }
});

test("macOS download redirects to the latest dmg enclosure", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  const dmg = "https://updates.solstone.app/solstone-macos/Solstone-1.3.4.dmg";
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(`<rss><channel><item><enclosure url="${dmg}" /></item></channel></rss>`, { status: 200 }),
    );

  for (const path of DOWNLOAD_PATHS) {
    const res = await fetchDownload(path);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), dmg);
  }
});

const WINDOWS_SETUP = "https://updates.solstone.app/solstone-windows/Solstone-win-Setup.exe";

test("Windows download 302s to the stable Velopack Setup.exe (no feed parse)", async () => {
  for (const path of ["/download/windows", "/download/windows.exe"]) {
    const res = await fetchDownload(path);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), WINDOWS_SETUP);
  }
});
