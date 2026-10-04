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

// /download/journal mirrors /download/macos — sol and the journal are separate
// macOS apps with their own Sparkle feeds and their own DMG download routes.
const JOURNAL_PATHS = ["/download/journal/latest"];
const JOURNAL_UNAVAILABLE_MESSAGE = "Latest journal download is temporarily unavailable. Try again shortly.";

test("journal download returns 503 when appcast fetch rejects", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  globalThis.fetch = () => Promise.reject(new Error("Network connection lost"));

  for (const path of JOURNAL_PATHS) {
    const res = await fetchDownload(path);
    assert.equal(res.status, 503);
    assert.equal(await res.text(), JOURNAL_UNAVAILABLE_MESSAGE);
    assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.equal(res.headers.get("cache-control"), "no-store");
  }
});

test("journal download returns 503 when appcast has no dmg enclosure", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  globalThis.fetch = () => Promise.resolve(new Response("<rss><channel></channel></rss>", { status: 200 }));

  for (const path of JOURNAL_PATHS) {
    const res = await fetchDownload(path);
    assert.equal(res.status, 503);
    assert.equal(await res.text(), JOURNAL_UNAVAILABLE_MESSAGE);
  }
});

test("journal download redirects to the latest dmg enclosure", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  const dmg = "https://updates.solstone.app/journal-macos/releases/v1.0.7/journal-1.0.7.dmg";
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(`<rss><channel><item><enclosure url="${dmg}" /></item></channel></rss>`, { status: 200 }),
    );

  for (const path of JOURNAL_PATHS) {
    const res = await fetchDownload(path);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), dmg);
  }
});

test("/download/journal serves the HTML page (200, text/html), never the binary", async () => {
  const env = {
    ASSETS: {
      async fetch(req) {
        assert.equal(new URL(req.url).pathname, "/download-journal");
        return new Response("<h1>download the journal</h1>", {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      },
    },
  };
  const res = await worker.fetch(new Request("https://solstone.app/download/journal"), env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
});

// /download/windows is now the human-shareable HTML page (mirrors /download/macos);
// the binary permalink moved to /download/windows/latest, with the legacy
// /download/windows.exe alias still 302ing to the installer.
const WINDOWS_PATHS = ["/download/windows/latest", "/download/windows.exe"];
const WIN_UNAVAILABLE_MESSAGE = "Latest Windows download is temporarily unavailable. Try again shortly.";

async function assertWinUnavailableResponse(res) {
  assert.equal(res.status, 503);
  assert.equal(await res.text(), WIN_UNAVAILABLE_MESSAGE);
  assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(res.headers.get("cache-control"), "no-store");
}

test("Windows download returns 503 when feed fetch rejects", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  globalThis.fetch = () => Promise.reject(new Error("Network connection lost"));

  for (const path of WINDOWS_PATHS) {
    const res = await fetchDownload(path);
    await assertWinUnavailableResponse(res);
  }
});

test("Windows download returns 503 when feed fetch is non-ok", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  globalThis.fetch = () => Promise.resolve(new Response("", { status: 500 }));

  for (const path of WINDOWS_PATHS) {
    const res = await fetchDownload(path);
    await assertWinUnavailableResponse(res);
  }
});

test("Windows download returns 503 when feed has no assets", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  globalThis.fetch = () => Promise.resolve(Response.json({ Assets: [] }));

  for (const path of WINDOWS_PATHS) {
    const res = await fetchDownload(path);
    await assertWinUnavailableResponse(res);
  }
});

test("Windows download returns 503 when feed has only delta assets", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  globalThis.fetch = () => Promise.resolve(Response.json({ Assets: [{ Version: "0.2.7", Type: "Delta" }] }));

  for (const path of WINDOWS_PATHS) {
    const res = await fetchDownload(path);
    await assertWinUnavailableResponse(res);
  }
});

test("Windows download returns 503 when feed JSON is invalid", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  globalThis.fetch = () => Promise.resolve(new Response("not json{", { status: 200 }));

  for (const path of WINDOWS_PATHS) {
    const res = await fetchDownload(path);
    await assertWinUnavailableResponse(res);
  }
});

test("Windows download redirects to the first full asset version", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  const setup = "https://updates.solstone.app/solstone-windows/solstone-setup-0.2.7.exe";
  globalThis.fetch = () =>
    Promise.resolve(
      Response.json({
        Assets: [
          { Version: "0.2.8", Type: "Delta", NotesMarkdown: "delta" },
          { Version: "0.2.7", Type: "Full", NotesMarkdown: "current" },
          { Version: "0.2.6", Type: "Full", NotesMarkdown: "older" },
        ],
      }),
    );

  for (const path of WINDOWS_PATHS) {
    const res = await fetchDownload(path);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), setup);
  }
});

test("Windows download redirects to a full asset version without notes", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  const setup = "https://updates.solstone.app/solstone-windows/solstone-setup-0.2.7.exe";
  globalThis.fetch = () =>
    Promise.resolve(
      Response.json({
        Assets: [
          { Version: "0.2.8", Type: "Delta" },
          { Version: "0.2.7", Type: "Full" },
        ],
      }),
    );

  for (const path of WINDOWS_PATHS) {
    const res = await fetchDownload(path);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), setup);
  }
});

test("/download/windows serves the HTML page (200, text/html), never the binary", async () => {
  // Mirrors /download/macos: the human-shareable URL renders the asset page so
  // link unfurlers get Open Graph tags; the binary lives at /download/windows/latest.
  const env = {
    ASSETS: {
      async fetch(req) {
        assert.equal(new URL(req.url).pathname, "/download-windows");
        return new Response("<h1>download solstone for windows</h1>", {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      },
    },
  };
  const res = await worker.fetch(new Request("https://solstone.app/download/windows"), env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
});

// --- android ---------------------------------------------------------------
// /download/android is the human-shareable HTML page; the binary permalink is
// /download/android/latest, with /download/android.apk as a sibling alias.
// Unlike macOS and Windows, the page deliberately does NOT auto-download: its
// job is to explain what android asks before it will install an app it did not
// get from a store, and starting the download would pre-empt that.
const ANDROID_PATHS = ["/download/android/latest", "/download/android.apk"];
const ANDROID_PREFIX = "https://updates.solstone.app/solstone-android/release";
const ANDROID_UNAVAILABLE_MESSAGE = "Latest Android download is temporarily unavailable. Try again shortly.";
const ANDROID_APK = `${ANDROID_PREFIX}/2.1.0/solstone-android-2.1.0.apk`;
const ANDROID_DIGEST = "e1a8dc023a85c099e051fdee1c2cf0d291fb75c540191f4c7d96a3c985e06fcd";
const ANDROID_PAGE = `
  <p class="file-line">{{VERSION_LINE}}</p>
  <span>"{{APK_NAME}}"{{SIZE_PAREN}} from updates.solstone.app anyway?</span>
  {{DIGEST_BLOCK}}
  <pre><code>curl -fLO https://updates.solstone.app/solstone-android/release/{{VERSION}}/SHA256SUMS</code></pre>
`;

// Stub the origin: a map of URL -> Response factory, so a test can make any one
// leg fail while the others keep working.
function androidOrigin(overrides = {}) {
  const routes = {
    [`${ANDROID_PREFIX}/latest`]: () => new Response("version=2.1.0\n", { status: 200 }),
    [`${ANDROID_PREFIX}/2.1.0/SHA256SUMS`]: () =>
      new Response(`${ANDROID_DIGEST}  solstone-android-2.1.0.apk\n`, { status: 200 }),
    [ANDROID_APK]: () => new Response(null, { status: 200, headers: { "content-length": "23001475" } }),
    ...overrides,
  };
  return (input) => {
    const href = typeof input === "string" ? input : input.url;
    const route = routes[href];
    if (!route) return Promise.reject(new Error(`unstubbed android fetch: ${href}`));
    return Promise.resolve(route());
  };
}

function androidPageEnv() {
  return {
    ASSETS: {
      async fetch(req) {
        assert.equal(new URL(req.url).pathname, "/download-android");
        return new Response(ANDROID_PAGE, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      },
    },
  };
}

async function assertAndroidUnavailable(res) {
  assert.equal(res.status, 503);
  assert.equal(await res.text(), ANDROID_UNAVAILABLE_MESSAGE);
  assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(res.headers.get("cache-control"), "no-store");
}

test("Android download redirects to the version the origin pointer names", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  globalThis.fetch = androidOrigin();

  for (const path of ANDROID_PATHS) {
    const res = await fetchDownload(path);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), ANDROID_APK);
  }
});

test("Android download returns 503 when the origin pointer is unreadable", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  const broken = {
    "rejects": () => Promise.reject(new Error("Network connection lost")),
    "non-ok": () => Promise.resolve(new Response("", { status: 500 })),
    "not a version line": () => Promise.resolve(new Response("<!doctype html>404", { status: 200 })),
    "a path, not a version": () => Promise.resolve(new Response("version=../../other\n", { status: 200 })),
  };

  for (const make of Object.values(broken)) {
    globalThis.fetch = (input) => {
      const href = typeof input === "string" ? input : input.url;
      if (href === `${ANDROID_PREFIX}/latest`) return make();
      return Promise.reject(new Error(`unexpected fetch: ${href}`));
    };
    for (const path of ANDROID_PATHS) {
      await assertAndroidUnavailable(await fetchDownload(path));
    }
  }
});

test("Android download survives an unreadable SHA256SUMS — bytes first", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  globalThis.fetch = androidOrigin({
    [`${ANDROID_PREFIX}/2.1.0/SHA256SUMS`]: () => new Response("", { status: 500 }),
  });

  const res = await fetchDownload("/download/android/latest");
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), ANDROID_APK);
});

test("Android template URLs redirect to the rendered page without fetching assets or release facts", async (t) => {
  t.mock.method(globalThis, "fetch", () => assert.fail("the redirect must not fetch release facts"));
  const env = { ASSETS: { fetch: () => assert.fail("the raw template must not be served") } };
  for (const path of ["/download-android", "/download-android/", "/download-android.html", "/download-android.html/"]) {
    for (const method of ["GET", "HEAD"]) {
      const res = await worker.fetch(new Request(`https://solstone.app${path}?source=link`, { method }), env);
      assert.equal(res.status, 301);
      assert.equal(res.headers.get("location"), "https://solstone.app/download/android?source=link");
      assert.equal(await res.text(), "");
    }
    const res = await worker.fetch(new Request(`https://solstone.app${path}`, { method: "POST", body: "test" }), env);
    assert.equal(res.status, 405);
  }
});

test("following an Android template redirect renders the real page with the current version and checksum", async (t) => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../public/download-android.html", import.meta.url), "utf8");
  t.mock.method(globalThis, "fetch", androidOrigin());
  const env = { ASSETS: { async fetch(req) {
    assert.equal(new URL(req.url).pathname, "/download-android");
    return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
  } } };
  const redirect = await worker.fetch(new Request("https://solstone.app/download-android"), env);
  const res = await worker.fetch(new Request(redirect.headers.get("location")), env);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.doesNotMatch(html, /\{\{/);
  assert.match(html, /version 2\.1\.0/);
  assert.match(html, /solstone-android-2\.1\.0\.apk/);
  assert.match(html, new RegExp(`<code class="fingerprint">${ANDROID_DIGEST}</code>`));
});

test("/download/android serves the HTML page filled from the origin, never the binary", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  globalThis.fetch = androidOrigin();

  const res = await worker.fetch(new Request("https://solstone.app/download/android"), androidPageEnv());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(res.headers.get("cache-control"), "public, max-age=300");

  const html = await res.text();
  assert.doesNotMatch(html, /\{\{/, "no template slot may reach a reader");
  assert.match(html, /version 2\.1\.0 &middot; 23\.00 MB &middot; for android 8\.0 and later/);
  assert.match(html, /"solstone-android-2\.1\.0\.apk" \(23\.00 MB\) from updates\.solstone\.app anyway\?/);
  assert.match(html, new RegExp(`<code class="fingerprint">${ANDROID_DIGEST}</code>`));
  // The commands a reader pastes carry the version, so they must resolve too.
  assert.match(html, /release\/2\.1\.0\/SHA256SUMS/);
});

// The assertions above run against a stub asset, which is the right corpus for
// the worker's substitution logic and the WRONG one for anything about the page
// itself: a stub that never had an auto-download cannot prove the real page has
// none. This reads the shipped file.
test("the real android page does not auto-download, and carries every slot the worker fills", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../public/download-android.html", import.meta.url), "utf8");

  // /download/macos and /download/windows both fire location.href after 600ms.
  // This page deliberately does not: it explains what android asks before it
  // will install an app it did not get from a store, and starting the download
  // pre-empts the reading. The visible button is the only path to the binary.
  assert.doesNotMatch(page, /location\.href/, "the android page must not auto-download");
  assert.match(page, /href="\/download\/android\/latest"/);

  // Every slot the page carries must be one renderAndroidPage actually fills,
  // and every slot it fills must be one the page carries. A slot on one side
  // only is a literal {{NAME}} shipped to a reader, or dead worker code.
  const inPage = new Set(page.match(/\{\{[A-Z_]+\}\}/g) || []);
  const worker = readFileSync(new URL("../worker.js", import.meta.url), "utf8");
  const renderer = worker.slice(worker.indexOf("function renderAndroidPage"), worker.indexOf("\nexport default"));
  const inWorker = new Set(renderer.match(/\{\{[A-Z_]+\}\}/g) || []);
  assert.deepEqual([...inPage].sort(), [...inWorker].sort());

  // The rendered page identifies its canonical URL.
  assert.match(page, /<link rel="canonical" href="https:\/\/solstone\.app\/download\/android">/);
});

test("the Linux instructions use a journal pair link, not retired setup paths", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../public/download.html", import.meta.url), "utf8");

  assert.match(page, /solstone-linux setup &lt; pair-link\.txt/);
  assert.doesNotMatch(page, /setup --server-url/);
  assert.doesNotMatch(page, /journal observer create/);
});

test("/download/android never prints a digest it did not read from the origin", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  const degraded = {
    "SHA256SUMS is a 500": { [`${ANDROID_PREFIX}/2.1.0/SHA256SUMS`]: () => new Response("", { status: 500 }) },
    "SHA256SUMS names another file": {
      [`${ANDROID_PREFIX}/2.1.0/SHA256SUMS`]: () =>
        new Response(`${ANDROID_DIGEST}  some-other-artifact.apk\n`, { status: 200 }),
    },
    "SHA256SUMS digest is not 64-hex": {
      [`${ANDROID_PREFIX}/2.1.0/SHA256SUMS`]: () =>
        new Response("not-a-digest  solstone-android-2.1.0.apk\n", { status: 200 }),
    },
  };

  for (const [label, overrides] of Object.entries(degraded)) {
    globalThis.fetch = androidOrigin(overrides);
    const res = await worker.fetch(new Request("https://solstone.app/download/android"), androidPageEnv());
    const html = await res.text();
    assert.equal(res.status, 200, label);
    assert.doesNotMatch(html, /\{\{/, label);
    assert.doesNotMatch(html, /class="fingerprint"/, `${label}: no digest may be shown`);
    assert.doesNotMatch(html, new RegExp(ANDROID_DIGEST), label);
    // The version is still known, so the page still says where to look.
    assert.match(html, /release\/2\.1\.0\/SHA256SUMS/, label);
    assert.equal(res.headers.get("cache-control"), "no-store", label);
  }
});

test("/download/android still renders when the origin cannot be read at all", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  globalThis.fetch = () => Promise.reject(new Error("Network connection lost"));

  const res = await worker.fetch(new Request("https://solstone.app/download/android"), androidPageEnv());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");

  const html = await res.text();
  assert.doesNotMatch(html, /\{\{/);
  assert.doesNotMatch(html, /class="fingerprint"/);
  assert.match(html, /for android 8\.0 and later/);
  assert.match(html, /solstone-android-&lt;version&gt;\.apk/);
  // An unresolvable version must read as a placeholder in the command, never
  // as a path segment a reader would paste.
  assert.match(html, /release\/&lt;version&gt;\/SHA256SUMS/);
  // No size is known, so the quoted browser warning carries no parenthetical.
  assert.match(html, /"solstone-android-&lt;version&gt;\.apk" from updates\.solstone\.app anyway\?/);
});

test("/download/android omits the size rather than guessing when the HEAD fails", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  globalThis.fetch = androidOrigin({
    [ANDROID_APK]: () => new Response(null, { status: 500 }),
  });

  const html = await (
    await worker.fetch(new Request("https://solstone.app/download/android"), androidPageEnv())
  ).text();
  assert.match(html, /version 2\.1\.0 &middot; for android 8\.0 and later/);
  assert.match(html, /"solstone-android-2\.1\.0\.apk" from updates\.solstone\.app anyway\?/);
  assert.match(html, new RegExp(`<code class="fingerprint">${ANDROID_DIGEST}</code>`));
});

const JOURNAL_WINDOWS_UNAVAILABLE = "Latest journal download for windows is temporarily unavailable. Try again shortly.";

test("/download/journal/windows/latest 302s to the versioned journal Setup from its own feed", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  globalThis.fetch = async (url) => {
    assert.equal(String(url), "https://updates.solstone.app/solstone-journal/release/windows/releases.win.json");
    return new Response(JSON.stringify({ Assets: [{ PackageId: "SolstoneJournal", Version: "2.0.19", Type: "Full" }] }), { status: 200 });
  };
  const res = await fetchDownload("/download/journal/windows/latest");
  assert.equal(res.status, 302);
  assert.equal(
    res.headers.get("location"),
    "https://updates.solstone.app/solstone-journal/release/windows/solstone-journal-2.0.19-windows-x86_64-setup.exe",
  );
});

test("/download/journal/windows/latest refuses an unreadable feed or an unexpected version", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  for (const feed of [null, { Assets: [] }, { Assets: [{ Type: "Full", Version: "../../x" }] }, { Assets: [{ Type: "Full", Version: "2.0.19-rc.1" }] }]) {
    globalThis.fetch = async () => (feed === null ? new Response("", { status: 500 }) : new Response(JSON.stringify(feed), { status: 200 }));
    const res = await fetchDownload("/download/journal/windows/latest");
    assert.equal(res.status, 503);
    assert.equal(await res.text(), JOURNAL_WINDOWS_UNAVAILABLE);
    assert.equal(res.headers.get("cache-control"), "no-store");
  }
});

test("no served page links to TestFlight; iPhone links go to the App Store", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const dir = new URL("../public/", import.meta.url);
  const pages = readdirSync(dir).filter((name) => name.endsWith(".html") || name === "llms.txt");
  assert.ok(pages.includes("phone.html") && pages.includes("install.html"), "scan sees the phone pages");
  for (const name of pages) {
    const page = readFileSync(new URL(name, dir), "utf8");
    assert.doesNotMatch(page, /testflight\.apple\.com/, `${name} links to TestFlight`);
  }
  for (const name of ["phone.html", "install.html", "download.html", "llms.txt"]) {
    const page = readFileSync(new URL(name, dir), "utf8");
    assert.match(page, /https:\/\/apps\.apple\.com\/app\/id6776850664/, `${name} links to the App Store`);
  }
});

test("Android links go to Google Play, keep the signed APK as a second way in, and no page calls it a beta", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const dir = new URL("../public/", import.meta.url);
  const pages = readdirSync(dir).filter((name) => name.endsWith(".html") || name === "llms.txt");
  assert.ok(pages.includes("phone.html") && pages.includes("download-android.html"), "scan sees the android pages");
  assert.ok(!pages.includes("beta.html"), "a beta.html asset would answer /beta before the worker's redirect");
  for (const name of pages) {
    const page = readFileSync(new URL(name, dir), "utf8");
    assert.doesNotMatch(page, /in beta|signed beta|isn't in the Play Store|not in the Play Store/i, `${name} calls android a beta`);
  }
  const play = /https:\/\/play\.google\.com\/store\/apps\/details\?id=app\.solstone\.observer\.phone/;
  for (const name of ["phone.html", "install.html", "download.html", "download-android.html", "llms.txt"]) {
    const page = readFileSync(new URL(name, dir), "utf8");
    assert.match(page, play, `${name} links to Google Play`);
  }
  for (const name of ["phone.html", "install.html", "download.html"]) {
    const page = readFileSync(new URL(name, dir), "utf8");
    assert.match(page, /href="\/download\/android"/, `${name} keeps the signed APK as a second way in`);
  }
});

test("/beta and its .html and slash forms 301 to /phone with the query, and /phone serves the page", async (t) => {
  t.mock.method(globalThis, "fetch", () => assert.fail("the redirect must not fetch"));
  const redirectEnv = { ASSETS: { fetch: () => assert.fail("the redirect must not read an asset") } };
  for (const path of ["/beta", "/beta/", "/beta.html", "/beta.html/"]) {
    for (const method of ["GET", "HEAD"]) {
      const res = await worker.fetch(new Request(`https://solstone.app${path}?src=qr`, { method }), redirectEnv);
      assert.equal(res.status, 301);
      assert.equal(res.headers.get("location"), "https://solstone.app/phone?src=qr");
    }
  }
  const res = await worker.fetch(new Request("https://solstone.app/beta"), redirectEnv);
  assert.equal(res.headers.get("location"), "https://solstone.app/phone");
  const phoneEnv = { ASSETS: { async fetch(req) {
    assert.equal(new URL(req.url).pathname, "/phone.html");
    return new Response("phone page", { headers: { "content-type": "text/html; charset=utf-8" } });
  } } };
  const page = await worker.fetch(new Request("https://solstone.app/phone"), phoneEnv);
  assert.equal(page.status, 200);
  assert.equal(await page.text(), "phone page");
});

// --- both mac apps ---------------------------------------------------------
// /download/mac offers the disk image that carries both mac apps. The image is
// in neither appcast, so it has its own pointer; the worker reads that pointer
// for the redirect and for the one fact the page shows, the image's size.
const MAC_BOTH_POINTER = "https://updates.solstone.app/macos-both/latest.json";
const MAC_BOTH_DMG =
  "https://updates.solstone.app/macos-both/releases/solstone-app-2.0.23-journal-app-2.0.30-build-68.dmg";
const MAC_BOTH_UNAVAILABLE = "Latest mac download is temporarily unavailable. Try again shortly.";

function macBothOrigin(pointer) {
  return (input) => {
    const href = typeof input === "string" ? input : input.url;
    if (href !== MAC_BOTH_POINTER) return Promise.reject(new Error(`unexpected fetch: ${href}`));
    return Promise.resolve(Response.json(pointer));
  };
}

const MAC_BOTH_GOOD = { schema: 1, url: MAC_BOTH_DMG, length: 186441365 };

function macBothPageEnv(body = '<div class="facts"><span>a</span><!--SIZE_FACT--></div>') {
  return {
    ASSETS: {
      async fetch(req) {
        assert.equal(new URL(req.url).pathname, "/download-mac");
        return new Response(body, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
      },
    },
  };
}

test("/download/mac/latest 302s to the image the pointer names", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  globalThis.fetch = macBothOrigin(MAC_BOTH_GOOD);

  const res = await fetchDownload("/download/mac/latest");
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), MAC_BOTH_DMG);
});

test("/download/mac/latest returns 503 when the pointer is unreadable or points elsewhere", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  const broken = [
    () => Promise.reject(new Error("Network connection lost")),
    () => Promise.resolve(new Response("", { status: 500 })),
    () => Promise.resolve(new Response("not json{", { status: 200 })),
    macBothOrigin({ ...MAC_BOTH_GOOD, schema: 2 }),
    macBothOrigin({ ...MAC_BOTH_GOOD, url: undefined }),
    macBothOrigin({ ...MAC_BOTH_GOOD, url: "https://example.com/macos-both/releases/x.dmg" }),
    macBothOrigin({ ...MAC_BOTH_GOOD, url: "https://updates.solstone.app/journal-macos/releases/x.dmg" }),
    macBothOrigin({ ...MAC_BOTH_GOOD, url: "https://updates.solstone.app/macos-both/releases/../x.dmg" }),
    macBothOrigin({ ...MAC_BOTH_GOOD, url: "https://updates.solstone.app/macos-both/releases/x.zip" }),
  ];
  for (const make of broken) {
    globalThis.fetch = make;
    const res = await fetchDownload("/download/mac/latest");
    assert.equal(res.status, 503);
    assert.equal(await res.text(), MAC_BOTH_UNAVAILABLE);
    assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.equal(res.headers.get("cache-control"), "no-store");
  }
});

test("/download/mac serves the page with the size the pointer measures", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  globalThis.fetch = macBothOrigin(MAC_BOTH_GOOD);

  const res = await worker.fetch(new Request("https://solstone.app/download/mac"), macBothPageEnv());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(res.headers.get("cache-control"), "public, max-age=300");
  const html = await res.text();
  assert.doesNotMatch(html, /SIZE_FACT/);
  assert.match(html, /<span>about 186 MB<\/span>/);

  // A republished image changes the size the page shows.
  globalThis.fetch = macBothOrigin({ ...MAC_BOTH_GOOD, length: 201_600_000 });
  const next = await (await worker.fetch(new Request("https://solstone.app/download/mac"), macBothPageEnv())).text();
  assert.match(next, /<span>about 202 MB<\/span>/);
});

test("/download/mac shows no size, and is not cached, when the pointer can't give one", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  for (const make of [
    () => Promise.reject(new Error("Network connection lost")),
    macBothOrigin({ ...MAC_BOTH_GOOD, length: "unknown" }),
    macBothOrigin({ ...MAC_BOTH_GOOD, length: 0 }),
  ]) {
    globalThis.fetch = make;
    const res = await worker.fetch(new Request("https://solstone.app/download/mac"), macBothPageEnv());
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const html = await res.text();
    assert.doesNotMatch(html, /SIZE_FACT/);
    assert.doesNotMatch(html, /MB/);
  }
});

test("the real mac page carries the size slot and the three mac downloads, and no fixed size", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../public/download-mac.html", import.meta.url), "utf8");

  assert.equal(page.split("<!--SIZE_FACT-->").length, 2, "exactly one size slot");
  assert.doesNotMatch(page, /\d+ MB/, "the size comes from the pointer, never the page");
  assert.doesNotMatch(page, /location\.href/, "the page offers a choice, so it must not auto-download");
  assert.match(page, /href="\/download\/mac\/latest"/);
  assert.match(page, /href="\/download\/macos"/);
  assert.match(page, /href="\/download\/journal"/);
  assert.match(page, /<link rel="canonical" href="https:\/\/solstone\.app\/download\/mac">/);

  // Every local asset the page references must exist.
  for (const [, path] of page.matchAll(/(?:src|href)="(\/static\/[^"]+)"/g)) {
    readFileSync(new URL(`../public${path}`, import.meta.url));
  }
});

test("/download's mac card leads with both apps and keeps each app on its own", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../public/download.html", import.meta.url), "utf8");
  const card = page.slice(page.indexOf("<h2>solstone on mac</h2>"), page.indexOf("<h2>solstone on linux</h2>"));
  const both = card.indexOf('href="/download/mac"');
  assert.ok(both > 0, "the mac card links to /download/mac");
  assert.ok(card.indexOf('href="/download/macos"') > both, "the solstone app link sits below it");
  assert.ok(card.indexOf('href="/download/journal"') > both, "the journal app link sits below it");
});
