#!/usr/bin/env node
// Regenerate public/sitemap.xml with <lastmod> derived from each page's real
// last-modified date — the date of the last git commit that touched the page's
// source file. This makes the sitemap drift-proof: the lastmod can never again
// be frozen while the page content moves underneath it (the 2026-04-07 stale
// homepage snippet bug). Run via `make sitemap`; `make deploy` runs it first.
//
// Ordering note: run AFTER committing page changes so the committed date is
// fresh. As a safety net, a file with uncommitted edits falls back to today's
// local date (matching git's local-date semantics) so a pre-commit run never
// emits a stale date.
//
// Dynamic /releases* pages are generated from upstream release data; their
// lastmod tracks the releases.js template's last change (the only static
// signal available without a network fetch). Documented in the site runbook.

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// sitemap URL path → source file whose last-modified date drives <lastmod>
const PAGES = [
  ["/", "public/index.html"],
  ["/install", "public/install.html"],
  ["/download", "public/download.html"],
  ["/download/macos", "public/download-macos.html"],
  ["/download/journal", "public/download-journal.html"],
  ["/download/windows", "public/download-windows.html"],
  ["/releases", "releases.js"],
  ["/releases/macos", "releases.js"],
  ["/releases/journal-macos", "releases.js"],
  ["/releases/windows", "releases.js"],
  ["/releases/linux", "releases.js"],
  ["/releases/android", "releases.js"],
];

// Shared brand/head assets are part of every page's crawl-facing presentation.
// The site runbook requires icon changes to bump sitemap lastmod even when no
// HTML file changes; the header wordmark and token CSS follow the same global
// dependency shape.
const GLOBAL_LASTMOD_FILES = [
  "public/favicon.ico",
  "public/apple-touch-icon.png",
  "public/static/tokens.css",
  "public/static/sol-ring-icon.svg",
  "public/static/sol-wordmark.svg",
];

const BASE = "https://solstone.app";

function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function todayLocal() {
  // en-CA renders YYYY-MM-DD; local tz matches git's `%cs` (committer local date)
  return new Date().toLocaleDateString("en-CA");
}

function lastmod(file) {
  const dirty = git(`status --porcelain -- "${file}"`);
  if (dirty) return todayLocal();
  const committed = git(`log -1 --format=%cs -- "${file}"`);
  return committed || todayLocal();
}

function newestLastmod(files) {
  return files.map(lastmod).sort().at(-1);
}

const urls = PAGES.map(([path, file]) => {
  const loc = path === "/" ? `${BASE}/` : `${BASE}${path}`;
  return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${newestLastmod([file, ...GLOBAL_LASTMOD_FILES])}</lastmod>\n  </url>`;
}).join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

const out = resolve(repoRoot, "public/sitemap.xml");
writeFileSync(out, xml);
console.log(`wrote ${out}`);
for (const [path, file] of PAGES) {
  console.log(`  ${path.padEnd(16)} ← ${file.padEnd(20)} ${newestLastmod([file, ...GLOBAL_LASTMOD_FILES])}`);
}
