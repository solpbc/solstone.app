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
