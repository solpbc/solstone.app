#!/usr/bin/env node
// Stamp every /static/ reference in the site's pages with its file's content
// hash (`/static/site.css?v=<hash>`), so /static/* can be cached as immutable
// and a changed file still reaches every visitor on the next page load.
//
//   node scripts/stamp-assets.mjs           rewrite the stamps in place
//   node scripts/stamp-assets.mjs --check   exit 1 if any stamp is missing or stale
//
// `make stamp` rewrites; `make deploy` runs the check first, so a deploy can't
// ship a page that points at an old copy. Commit the stamped pages like the
// regenerated sitemap. Files a stylesheet loads by relative url() (the fonts)
// carry no stamp: give a changed font a new filename.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const sources = [
  ...readdirSync(resolve(root, "public")).filter((f) => f.endsWith(".html")).map((f) => `public/${f}`),
  "releases.js",
];
const REF = /\/static\/([A-Za-z0-9._/-]+\.(?:css|js|webp|svg|png|woff2))(?:\?v=[0-9a-f]*)?/g;
const hashes = new Map();
function stampFor(path) {
  if (!hashes.has(path)) {
    const bytes = readFileSync(resolve(root, "public/static", path));
    hashes.set(path, createHash("sha256").update(bytes).digest("hex").slice(0, 10));
  }
  return hashes.get(path);
}

const stale = [];
for (const file of sources) {
  const before = readFileSync(resolve(root, file), "utf8");
  const after = before.replace(REF, (_, path) => `/static/${path}?v=${stampFor(path)}`);
  if (after === before) continue;
  stale.push(file);
  if (!check) writeFileSync(resolve(root, file), after);
}
if (check && stale.length) {
  console.error(`asset stamps are stale in: ${stale.join(", ")}\nrun \`make stamp\` and commit the result.`);
  process.exit(1);
}
console.log(check ? "asset stamps are current" : `stamped ${stale.length} file(s)`);
