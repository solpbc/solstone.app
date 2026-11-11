import assert from "node:assert/strict";
import test from "node:test";
import worker from "../worker.js";
import { parseGitHubReleaseItems } from "../releases.js";

test("a mixed release feed keeps phone and Wear versions separate", () => {
  const feed = [
    { tag_name: "wear-v1.0.0", body: "watch change", published_at: "2026-11-11T00:00:00Z" },
    { tag_name: "v2.1.42", body: "phone change", published_at: "2026-11-11T00:00:00Z" },
  ];
  assert.deepEqual(parseGitHubReleaseItems(feed, "v").map(r => r.version), ["2.1.42"]);
  assert.deepEqual(parseGitHubReleaseItems(feed, "wear-v").map(r => r.version), ["1.0.0"]);
});

test("Wear downloads use only their own pointer and refuse an unavailable one", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    return new Response("version=1.0.0\n");
  };
  const response = await worker.fetch(new Request("https://solstone.app/download/wear/latest"), {});
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "https://updates.solstone.app/solstone-wear/release/1.0.0/solstone-wear-1.0.0.apk");
  assert.deepEqual(seen, ["https://updates.solstone.app/solstone-wear/release/latest"]);
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  const failed = await worker.fetch(new Request("https://solstone.app/download/wear/latest"), {});
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get("Location"), null);
  assert.equal(failed.headers.get("Cache-Control"), "no-store");
});


test("the existing iPhone stream retains build-qualified tags", () => {
  const items = parseGitHubReleaseItems([{ tag_name: "v2.0.11-155", body: "phone build" }]);
  assert.equal(items[0].version, "2.0.11-155");
});
