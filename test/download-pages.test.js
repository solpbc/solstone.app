import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "../worker.js";

// The single-app download pages never start a download on their own: the
// download is a button, and the page fills the installer's size beside it from
// the origin.

async function page(name) {
  return readFile(new URL(`../public/${name}.html`, import.meta.url), "utf8");
}

function assetsServing(name) {
  return {
    ASSETS: {
      async fetch(req) {
        assert.equal(new URL(req.url).pathname, `/${name}`);
        return new Response(await page(name), {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      },
    },
  };
}

function stubFetch(t, routes) {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const route = routes[url];
    if (!route) return new Response("", { status: 404 });
    return route(init);
  };
}

const MACOS_APPCAST = "https://updates.solstone.app/solstone-macos/appcast.xml";
const JOURNAL_APPCAST = "https://updates.solstone.app/journal-macos/appcast.xml";
const WIN_FEED = "https://updates.solstone.app/solstone-windows/releases.win.json";
const JOURNAL_WIN_FEED = "https://updates.solstone.app/solstone-journal/release/windows/releases.win.json";

function appcast(url, length) {
  return () =>
    new Response(`<rss><channel><item><enclosure url="${url}" length="${length}" type="application/x-apple-diskimage" /></item></channel></rss>`, {
      status: 200,
    });
}

function sized(bytes) {
  return () => new Response(null, { status: 200, headers: { "content-length": String(bytes) } });
}

for (const name of ["download-macos", "download-journal", "download-windows", "download-journal-windows"]) {
  test(`${name} carries no timer or scripted navigation`, async () => {
    const html = await page(name);
    assert.doesNotMatch(html, /setTimeout|location\.href\s*=|location\.assign|location\.replace/);
  });
}

test("/download/macos fills the DMG size from the appcast enclosure", async (t) => {
  stubFetch(t, { [MACOS_APPCAST]: appcast("https://updates.solstone.app/solstone-macos/releases/v2.0.26/solstone-2.0.26.dmg", 10875218) });
  const res = await worker.fetch(new Request("https://solstone.app/download/macos"), assetsServing("download-macos"));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "public, max-age=300");
  const html = await res.text();
  assert.match(html, /about 11 MB/);
  assert.doesNotMatch(html, /SIZE_FACT/);
});

test("/download/journal fills the DMG size from the journal appcast", async (t) => {
  stubFetch(t, { [JOURNAL_APPCAST]: appcast("https://updates.solstone.app/journal-macos/releases/v2.0.34/build-72/journal-2.0.34-build-72.dmg", 176507210) });
  const res = await worker.fetch(new Request("https://solstone.app/download/journal"), assetsServing("download-journal"));
  assert.match(await res.text(), /about 177 MB/);
});

test("/download/windows fills the size from the Setup's own headers", async (t) => {
  stubFetch(t, {
    [WIN_FEED]: () => new Response(JSON.stringify({ Assets: [{ Type: "Full", Version: "2.0.20" }] }), { status: 200 }),
    "https://updates.solstone.app/solstone-windows/solstone-setup-2.0.20.exe": sized(14133776),
  });
  const res = await worker.fetch(new Request("https://solstone.app/download/windows"), assetsServing("download-windows"));
  assert.match(await res.text(), /about 14 MB/);
});

test("/download/journal/windows renders its page with the installer size in GB", async (t) => {
  stubFetch(t, {
    [JOURNAL_WIN_FEED]: () => new Response(JSON.stringify({ Assets: [{ Type: "Full", Version: "2.0.34" }] }), { status: 200 }),
    "https://updates.solstone.app/solstone-journal/release/windows/solstone-journal-2.0.34-windows-x86_64-setup.exe": sized(1122070464),
  });
  const res = await worker.fetch(
    new Request("https://solstone.app/download/journal/windows"),
    assetsServing("download-journal-windows"),
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
  const html = await res.text();
  assert.match(html, /about 1\.1 GB, and /);
  assert.match(html, /href="\/download\/journal\/windows\/latest"/);
});

test("an unreadable origin renders the page without a size, uncached", async (t) => {
  stubFetch(t, {});
  for (const [path, name] of [
    ["/download/macos", "download-macos"],
    ["/download/journal", "download-journal"],
    ["/download/windows", "download-windows"],
    ["/download/journal/windows", "download-journal-windows"],
  ]) {
    const res = await worker.fetch(new Request(`https://solstone.app${path}`), assetsServing(name));
    assert.equal(res.status, 200, path);
    assert.equal(res.headers.get("cache-control"), "no-store", path);
    const html = await res.text();
    assert.doesNotMatch(html, /about \d|SIZE_(FACT|LEAD)| · <\/p>|, and no administrator/, path);
  }
});

test("the sitemap leaves out the single-app download pages", async () => {
  const source = await readFile(new URL("../scripts/gen-sitemap.mjs", import.meta.url), "utf8");
  for (const path of ["/download/macos", "/download/journal", "/download/windows", "/download/journal/windows"]) {
    assert.doesNotMatch(source, new RegExp(`\\["${path.replaceAll("/", "\\/")}",`), path);
  }
});
