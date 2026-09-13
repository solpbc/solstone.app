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

  // The flat asset path is served at 200 alongside the pretty route, so it
  // needs the same rel=canonical its three siblings carry.
  assert.match(page, /<link rel="canonical" href="https:\/\/solstone\.app\/download\/android">/);
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
