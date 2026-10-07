import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "../worker.js";

// /download is the index of every download. Each version, size and fingerprint
// on it is read from the release feeds when the page is served; a feed that
// can't be read costs only its own row's values, and the page that results is
// never cached.

const ORIGIN = "https://updates.solstone.app";
const FEEDS = {
  macApp: `${ORIGIN}/solstone-macos/appcast.xml`,
  macJournal: `${ORIGIN}/journal-macos/appcast.xml`,
  macBoth: `${ORIGIN}/macos-both/latest.json`,
  winApp: `${ORIGIN}/solstone-windows/releases.win.json`,
  winJournal: `${ORIGIN}/solstone-journal/release/windows/releases.win.json`,
  linuxJournal: `${ORIGIN}/solstone-journal/release/latest`,
  linuxApp: `${ORIGIN}/solstone-linux/release/latest`,
  tmux: `${ORIGIN}/solstone-tmux/release/latest`,
  android: `${ORIGIN}/solstone-android/release/latest`,
};

const SIG_APP = "A".repeat(80) + "appSig==";
const SIG_JOURNAL = "B".repeat(80) + "jrnSig==";
const BOTH_SHA = "c".repeat(56) + "0b0b0b0b";
const ANDROID_SHA = "d".repeat(56) + "0a0a0a0a";
const NUPKG_SHA = "E".repeat(64);
const APP_SHA = "a".repeat(56) + "0c0c0c0c";
const JRN_SHA = "b".repeat(56) + "0d0d0d0d";
const WINJ_SHA = "e".repeat(56) + "0e0e0e0e";
const WINJ_PKG_SHA = "9".repeat(64);

function appcast(version, url, length, signature) {
  return `<rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"><channel>
<item><title>x</title><sparkle:shortVersionString>${version}</sparkle:shortVersionString>
<enclosure url="${url}" length="${length}" type="application/x-apple-diskimage" sparkle:edSignature="${signature}" /></item>
<item><sparkle:shortVersionString>0.0.1</sparkle:shortVersionString>
<enclosure url="${ORIGIN}/old.dmg" length="1" sparkle:edSignature="${"Z".repeat(86)}==" /></item>
</channel></rss>`;
}

function velopack(version) {
  return JSON.stringify({
    Assets: [
      { Version: version, Type: "Delta", SHA256: "F".repeat(64), Size: 5 },
      { Version: version, Type: "Full", SHA256: NUPKG_SHA, Size: 123456789 },
    ],
  });
}

// Every feed the page reads, answering with known values. The installer sizes
// are each installer's own content-length, deliberately unlike anything a feed
// carries.
function healthyRoutes() {
  const text = (body) => () => new Response(body, { status: 200 });
  const length = (bytes) => () => new Response(null, { status: 200, headers: { "content-length": String(bytes) } });
  return {
    [FEEDS.macApp]: text(appcast("7.1.1", `${ORIGIN}/solstone-macos/releases/v7.1.1/solstone-7.1.1.dmg`, 11_000_000, SIG_APP)),
    [FEEDS.macJournal]: text(appcast("7.2.2", `${ORIGIN}/journal-macos/releases/v7.2.2/journal-7.2.2.dmg`, 177_000_000, SIG_JOURNAL)),
    [FEEDS.macBoth]: text(
      JSON.stringify({
        schema: 1,
        url: `${ORIGIN}/macos-both/releases/both-7.1.1-7.2.2.dmg`,
        length: 188_000_000,
        sha256: BOTH_SHA,
        apps: {
          solstone: { version: "7.1.1", source_url: `${ORIGIN}/solstone-macos/releases/v7.1.1/solstone-7.1.1.dmg`, source_sha256: APP_SHA },
          journal: { version: "7.2.2", source_url: `${ORIGIN}/journal-macos/releases/v7.2.2/journal-7.2.2.dmg`, source_sha256: JRN_SHA },
        },
      }),
    ),
    [FEEDS.winApp]: text(velopack("7.3.3")),
    [`${ORIGIN}/solstone-windows/solstone-setup-7.3.3.exe`]: length(14_000_000),
    [FEEDS.winJournal]: text(velopack("7.4.4")),
    [`${ORIGIN}/solstone-journal/release/windows/solstone-journal-7.4.4-windows-x86_64-setup.exe`]: length(1_120_000_000),
    [`${ORIGIN}/solstone-journal/release/windows/solstone-journal-7.4.4-windows-x86_64.sha256`]: text(
      `${WINJ_SHA}  solstone-journal-7.4.4-windows-x86_64-setup.exe\n${WINJ_PKG_SHA}  SolstoneJournal-7.4.4-full.nupkg\n`,
    ),
    [FEEDS.linuxJournal]: text("version=7.5.5\n"),
    [FEEDS.linuxApp]: text("version=7.6.6\n"),
    [FEEDS.tmux]: text("version=7.7.7\n"),
    [FEEDS.android]: text("version=7.8.8\n"),
    [`${ORIGIN}/solstone-android/release/7.8.8/SHA256SUMS`]: text(`${ANDROID_SHA}  solstone-android-7.8.8.apk\n`),
    [`${ORIGIN}/solstone-android/release/7.8.8/solstone-android-7.8.8.apk`]: length(25_000_000),
  };
}

function stubFetch(t, routes, onRequest = () => {}) {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    await onRequest(url);
    const route = routes[url];
    if (!route) return new Response("", { status: 404 });
    return route(init);
  };
}

const template = () => readFile(new URL("../public/download.html", import.meta.url), "utf8");

const env = {
  ASSETS: {
    async fetch(req) {
      assert.equal(new URL(req.url).pathname, "/download");
      return new Response(await template(), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
    },
  },
};

async function getIndex() {
  return worker.fetch(new Request("https://solstone.app/download"), env);
}

// The rows, in page order, each as { cellLabel: cellHtml }. The product cell is
// keyed "product".
function rows(html) {
  const body = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"));
  return [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(([, row]) => {
    const cells = { product: row.match(/<th\b[^>]*>([\s\S]*?)<\/th>/)[1] };
    for (const [, label, cell] of row.matchAll(/<td\b[^>]*data-label="([^"]+)"[^>]*>([\s\S]*?)<\/td>/g)) {
      cells[label] = cell;
    }
    return cells;
  });
}

const DASH = /class="none"/;
const ROW = {
  macApp: 0,
  macJournal: 1,
  macBoth: 2,
  winApp: 3,
  winJournal: 4,
  linuxJournal: 5,
  linuxApp: 6,
  tmux: 7,
  android: 8,
  stores: 9,
};

test("each feed's values reach their own row", async (t) => {
  stubFetch(t, healthyRoutes());
  const res = await getIndex();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
  const table = rows(await res.text());
  assert.equal(table.length, 10);

  const mac = table[ROW.macApp];
  assert.match(mac.version, />7\.1\.1</);
  assert.match(mac.size, /about 11 MB/);
  assert.ok(mac["check it"].includes(APP_SHA), "the app image's own digest");
  assert.match(mac["check it"], /sha256/);
  assert.ok(!mac["check it"].includes(SIG_APP), "the updater signature is not offered as a check");

  const journal = table[ROW.macJournal];
  assert.match(journal.version, />7\.2\.2</);
  assert.match(journal.size, /about 177 MB/);
  assert.ok(journal["check it"].includes(JRN_SHA));
  assert.ok(!journal["check it"].includes(APP_SHA), "each mac row carries its own digest");

  const both = table[ROW.macBoth];
  assert.match(both.version, /7\.1\.1[\s\S]*7\.2\.2/);
  assert.match(both.size, /about 188 MB/);
  assert.ok(both["check it"].includes(BOTH_SHA));
  assert.match(both["check it"], /sha256/);

  const win = table[ROW.winApp];
  assert.match(win.version, />7\.3\.3</);
  assert.match(win.size, /about 14 MB/, "the Setup's own size, not the package's");
  assert.match(win["check it"], /\S/);

  const winJournal = table[ROW.winJournal];
  assert.match(winJournal.version, />7\.4\.4</);
  assert.match(winJournal.size, /about 1\.1 GB/);
  assert.ok(winJournal["check it"].includes(WINJ_SHA), "the Setup's own line from the published .sha256");
  assert.ok(!winJournal["check it"].includes(WINJ_PKG_SHA), "not the update package's line");

  assert.match(table[ROW.linuxJournal].version, />7\.5\.5</);
  assert.match(table[ROW.linuxApp].version, />7\.6\.6</);
  assert.match(table[ROW.tmux].version, />7\.7\.7</);
  for (const row of [ROW.linuxJournal, ROW.linuxApp, ROW.tmux]) {
    assert.match(table[row].size, DASH);
  }

  const android = table[ROW.android];
  assert.match(android.version, />7\.8\.8</);
  assert.match(android.size, /about 25 MB/);
  assert.ok(android["check it"].includes(ANDROID_SHA));

  const stores = table[ROW.stores];
  assert.match(stores.version, DASH);
  assert.match(stores.size, DASH);
});

test("a page with every value read is cached; the feed's .nupkg hash never appears", async (t) => {
  stubFetch(t, healthyRoutes());
  const res = await getIndex();
  assert.equal(res.headers.get("cache-control"), "public, max-age=300");
  const html = await res.text();
  assert.ok(!html.includes(NUPKG_SHA), "the windows feed's hash is the package's, not the download's");
  assert.ok(!html.includes(NUPKG_SHA.toLowerCase()));
  assert.doesNotMatch(html, /<!--slot /, "every slot was filled");
});

test("no feed readable: the page still renders, every live cell is a dash, and nothing is cached", async (t) => {
  stubFetch(t, {});
  const res = await getIndex();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const html = await res.text();
  assert.doesNotMatch(html, /about \d/);
  assert.doesNotMatch(html, /class="fingerprint"/);
  assert.doesNotMatch(html, /<!--slot /);
  const table = rows(html);
  for (const row of table) {
    assert.match(row.version, DASH);
    assert.match(row.size, DASH);
  }
});

test("one unreadable feed costs only its own row, and the page is not cached", async (t) => {
  const routes = {};
  stubFetch(t, routes);
  for (const [feed, rowIndex] of [
    [FEEDS.tmux, ROW.tmux],
    [FEEDS.macBoth, ROW.macBoth],
    [FEEDS.winJournal, ROW.winJournal],
    [FEEDS.android, ROW.android],
  ]) {
    for (const key of Object.keys(routes)) delete routes[key];
    Object.assign(routes, healthyRoutes());
    routes[feed] = () => new Response("unavailable", { status: 503 });
    const res = await getIndex();
    assert.equal(res.status, 200, feed);
    assert.equal(res.headers.get("cache-control"), "no-store", feed);
    const table = rows(await res.text());
    assert.match(table[rowIndex].version, DASH, feed);
    for (const [name, index] of Object.entries(ROW)) {
      if (index === rowIndex || name === "stores") continue;
      assert.doesNotMatch(table[index].version, DASH, `${feed} left ${name} alone`);
    }
  }
});

test("a fingerprint or size the feed doesn't carry stays a dash, and the page is not cached", async (t) => {
  const routes = healthyRoutes();
  // An appcast item without a signature, and an android release without its sums.
  routes[FEEDS.macApp] = () =>
    new Response(
      `<rss><channel><item><sparkle:shortVersionString>7.1.1</sparkle:shortVersionString><enclosure url="${ORIGIN}/a.dmg" length="11000000" /></item></channel></rss>`,
    );
  delete routes[`${ORIGIN}/solstone-android/release/7.8.8/SHA256SUMS`];
  delete routes[`${ORIGIN}/solstone-windows/solstone-setup-7.3.3.exe`];
  stubFetch(t, routes);
  const res = await getIndex();
  assert.equal(res.headers.get("cache-control"), "no-store");
  const table = rows(await res.text());
  assert.match(table[ROW.macApp].version, />7\.1\.1</);
  assert.doesNotMatch(table[ROW.macApp]["check it"], /fingerprint/);
  assert.match(table[ROW.android].version, />7\.8\.8</);
  assert.doesNotMatch(table[ROW.android]["check it"], /fingerprint/);
  assert.match(table[ROW.winApp].version, />7\.3\.3</);
  assert.match(table[ROW.winApp].size, DASH);
});

test("a feed value that isn't a plain version never reaches the page", async (t) => {
  const routes = healthyRoutes();
  routes[FEEDS.macApp] = () =>
    new Response(appcast("<img src=x onerror=alert(1)>", `${ORIGIN}/a.dmg`, 11_000_000, SIG_APP));
  routes[FEEDS.winApp] = () => new Response(velopack('1.0.0"><script>'));
  stubFetch(t, routes);
  const html = await (await getIndex()).text();
  assert.doesNotMatch(html, /onerror|<script>/);
  const table = rows(html);
  assert.match(table[ROW.macApp].version, DASH);
  assert.match(table[ROW.winApp].version, DASH);
});

test("the feeds are read at the same time, not one after another", async (t) => {
  // Hold every first read until all nine feeds have been asked for. Read one
  // after another, the first would wait forever; the fallback releases it so a
  // failure reads as a failed assertion rather than a hung test.
  const firstReads = new Set(Object.values(FEEDS));
  const seen = new Set();
  let release;
  const allAsked = new Promise((resolve) => {
    release = resolve;
  });
  let timedOut = false;
  const fallback = setTimeout(() => {
    timedOut = true;
    release();
  }, 2000);
  t.after(() => clearTimeout(fallback));
  let reachedTogether = false;
  stubFetch(t, healthyRoutes(), async (url) => {
    if (!firstReads.has(url)) return;
    seen.add(url);
    if (seen.size === firstReads.size && !timedOut) {
      reachedTogether = true;
      release();
    }
    await allAsked;
  });
  const res = await getIndex();
  assert.equal(res.status, 200);
  assert.ok(reachedTogether, "the feeds were read one after another");
});

test("the page template: no timer, no scripted navigation, nothing loaded from elsewhere", async () => {
  const html = await template();
  assert.doesNotMatch(html, /setTimeout|setInterval|location\.href\s*=|location\.assign|location\.replace|http-equiv="refresh"/i);
  const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map(([tag]) => tag);
  assert.deepEqual(scripts, ['<script src="/static/sunarc.js" defer>']);
  for (const [, url] of html.matchAll(/<(?:link|script|img)\b[^>]*\b(?:href|src)="([^"]+)"/g)) {
    if (url.startsWith("https://solstone.app/")) continue; // canonical and og URLs name this site
    assert.ok(url.startsWith("/"), `${url} is loaded from another host`);
  }
  for (const [, path] of html.matchAll(/(?:src|href)="(\/static\/[^"]+)"/g)) {
    await readFile(new URL(`../public${path}`, import.meta.url));
  }
});

test("every slot the template carries is one the worker fills, and the reverse", async () => {
  const html = await template();
  const inPage = new Set([...html.matchAll(/<!--slot ([a-z0-9-]+)-->/g)].map(([, name]) => name));
  const source = await readFile(new URL("../worker.js", import.meta.url), "utf8");
  const filler = source.slice(source.indexOf("async function downloadIndexSlots"), source.indexOf("async function windowsSetupFacts"));
  const inWorker = new Set([...filler.matchAll(/fill\(\s*"([a-z0-9-]+)"/g)].map(([, name]) => name));
  assert.ok(inPage.size > 0);
  assert.deepEqual([...inPage].sort(), [...inWorker].sort());
});

test("each product links its own download page, and the old index URLs still arrive here", async (t) => {
  stubFetch(t, healthyRoutes());
  const table = rows(await (await getIndex()).text());
  const linked = table.map((row) => row.product.match(/href="([^"]+)"/)?.[1] ?? null);
  assert.deepEqual(linked, [
    "/download/macos",
    "/download/journal",
    "/download/mac",
    "/download/windows",
    "/download/journal/windows",
    null,
    null,
    null,
    "/download/android",
    null,
  ]);

  const redirectEnv = { ASSETS: { fetch: () => assert.fail("a redirect must not read an asset") } };
  for (const path of ["/observers", "/downloads"]) {
    const res = await worker.fetch(new Request(`https://solstone.app${path}`), redirectEnv);
    assert.equal(res.status, 301, path);
    assert.equal(res.headers.get("location"), "https://solstone.app/download", path);
  }
});

test("a mac app's digest is shown only when the image record names the file its feed serves", async (t) => {
  const routes = healthyRoutes();
  routes[FEEDS.macApp] = () => new Response(appcast("7.1.2", `${ORIGIN}/solstone-macos/releases/v7.1.2/solstone-7.1.2.dmg`, 11_000_000, SIG_APP), { status: 200 });
  stubFetch(t, routes);
  const res = await getIndex();
  const table = rows(await res.text());
  assert.ok(!table[ROW.macApp]["check it"].includes(APP_SHA), "a record for an older image is not this download's digest");
  assert.equal(res.headers.get("cache-control"), "no-store");
});
