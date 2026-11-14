// /brand: every download it links exists, the downloads sit at stable paths
// (never under the immutable, content-stamped /static/), and a deploy never
// regenerates them.
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import worker from "../worker.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const page = read("public/brand.html");

function sameOriginRefs(html) {
  return [...html.matchAll(/\b(?:href|src)="(\/[^"#?]*)/g)].map((m) => m[1]);
}

test("every /brand/assets/ link on the page is a committed file", () => {
  const links = [...page.matchAll(/href="(\/brand\/assets\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(links.length >= 40, `found ${links.length} asset links`);
  for (const link of links) {
    const file = new URL(`public${link}`, root);
    assert.ok(existsSync(file) && statSync(file).size > 0, link);
  }
});

test("the page's images are the same committed files", () => {
  const imgs = [...page.matchAll(/<img[^>]+src="(\/[^"?]+)/g)].map((m) => m[1]);
  for (const src of imgs) assert.ok(existsSync(new URL(`public${src}`, root)), src);
});

test("downloads never live under /static/", () => {
  const downloads = [...page.matchAll(/<a\s[^>]*href="([^"]+)"[^>]*\bdownload\b/g)].map((m) => m[1]);
  assert.ok(downloads.length > 0);
  for (const href of downloads) {
    assert.ok(href.startsWith("/brand/assets/"), href);
  }
});

test("every copy button points at a source on the page", () => {
  const ids = new Set([...page.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const sources = [...page.matchAll(/data-copy-from="#([^"]+)"/g)].map((m) => m[1]);
  assert.ok(sources.length > 0);
  for (const id of sources) assert.ok(ids.has(id), id);
});

test("both pages load nothing from another origin", () => {
  for (const path of ["public/brand.html", "public/brand/logo.html"]) {
    const html = read(path);
    const loads = [
      ...html.matchAll(/<(?:script|img|iframe|source|video|audio)\b[^>]*\bsrc="([^"]+)"/g),
      ...html.matchAll(/<link\b[^>]*\bhref="([^"]+)"/g),
      ...html.matchAll(/url\(\s*['"]?([^'")]+)/g),
    ]
      .filter((m) => !/rel="canonical"/.test(m[0]))
      .map((m) => m[1]);
    for (const url of loads) {
      assert.ok(!/^(https?:)?\/\//.test(url), `${path} loads ${url}`);
    }
  }
});

test("the logo page's canonical is its solstone.app address", () => {
  assert.match(read("public/brand/logo.html"), /<link rel="canonical" href="https:\/\/solstone\.app\/brand\/logo">/);
  assert.match(page, /<link rel="canonical" href="https:\/\/solstone\.app\/brand">/);
});

test("make deploy does not regenerate the brand assets", () => {
  const makefile = read("Makefile");
  const deploy = makefile.match(/^deploy:([^\n]*)\n((?:\t[^\n]*\n)*)/m);
  assert.ok(deploy, "a deploy target exists");
  assert.doesNotMatch(deploy[1] + deploy[2], /brand/);
  assert.match(makefile, /^brand:\n\t\.\/scripts\/gen-brand-assets\.sh$/m);
});

test("/brand is in the sitemap, llms.txt and the site footer", () => {
  const sitemap = read("scripts/gen-sitemap.mjs");
  assert.match(sitemap, /\["\/brand", "public\/brand\.html"\]/);
  assert.match(sitemap, /\["\/brand\/logo", "public\/brand\/logo\.html"\]/);
  assert.match(read("public/llms.txt"), /\(https:\/\/solstone\.app\/brand\)/);
  for (const path of ["public/index.html", "public/download.html", "public/brand.html", "releases.js"]) {
    const footer = read(path).split('<footer class="site-footer">')[1];
    assert.ok(footer, path);
    assert.match(footer, /href="\/brand"/, path);
  }
});

test("same-origin references on /brand resolve to files", () => {
  const pages = new Set(["/", "/brand", "/brand/logo", "/download", "/phone", "/install", "/integrate", "/releases"]);
  for (const ref of sameOriginRefs(page)) {
    if (pages.has(ref)) continue;
    assert.ok(existsSync(new URL(`public${ref}`, root)), ref);
  }
});

test("/brand/mark and its .html and slash forms 301 to /brand/logo with the query", async (t) => {
  t.mock.method(globalThis, "fetch", () => assert.fail("the redirect must not fetch"));
  const env = { ASSETS: { fetch: () => assert.fail("the redirect must not read an asset") } };
  assert.ok(!existsSync(new URL("public/brand/mark.html", root)), "a brand/mark.html asset would answer before the worker");
  for (const path of ["/brand/mark", "/brand/mark/", "/brand/mark.html", "/brand/mark.html/"]) {
    for (const method of ["GET", "HEAD"]) {
      const res = await worker.fetch(new Request(`https://solstone.app${path}?v=1`, { method }), env);
      assert.equal(res.status, 301, path);
      assert.equal(res.headers.get("location"), "https://solstone.app/brand/logo?v=1", path);
    }
  }
});

test("/brands and /brands/mark, the old solpbc.org paths on this domain, 301 to /brand and /brand/logo", async (t) => {
  t.mock.method(globalThis, "fetch", () => assert.fail("the redirect must not fetch"));
  const env = { ASSETS: { fetch: () => assert.fail("the redirect must not read an asset") } };
  const cases = { "/brands": "/brand", "/brands/": "/brand", "/brands.html": "/brand", "/brands/mark": "/brand/logo", "/brands/mark/": "/brand/logo", "/brands/mark.html": "/brand/logo" };
  for (const [path, target] of Object.entries(cases)) {
    const res = await worker.fetch(new Request(`https://solstone.app${path}?v=1`), env);
    assert.equal(res.status, 301, path);
    assert.equal(res.headers.get("location"), `https://solstone.app${target}?v=1`, path);
  }
});
