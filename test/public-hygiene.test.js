import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = join(ROOT, "public");

// Public-hygiene guard: NOTHING under public/ is private.
//
// wrangler.toml serves this directory as static assets ([assets] directory =
// "./public"). Every byte ships: HTML comments are readable in view-source, CSS
// comments ship inside <style> and .css, and public/install.md is fetchable raw
// (solstone.app/install.md -> 200). There is no "internal" region of this tree.
//
// Why this guard exists (2026-07-13, founder-caught): sessions had been parking
// internal notes in HTML comments here — using them to "stage" unpublished copy
// alongside the reasoning for holding it. Live in view-source at the time:
// an internal watch id, a roadmap codename, a contractor's name attached to
// review findings, and internal repo paths. A session then went to *extend* one
// of those comments with the details of a privacy defect in a shipped build.
//
// Staging notes, gate conditions, and tracking belong in the org (an agency
// entry), never in a served file. This guard is the enforcement, because prose
// guidance did not hold.
const SKIP_DIRS = new Set(["node_modules"]);
const TEXT_EXT = new Set([".html", ".css", ".js", ".md", ".svg", ".json", ".txt", ".xml"]);

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (TEXT_EXT.has(extname(p))) out.push(p);
  }
  return out;
};

// Deliberately narrow: only markers that are unambiguously internal. A noisy
// guard gets disabled, and a disabled guard is worse than none.
const INTERNAL = [
  { re: /\b(?:req|ghw)_[a-z0-9]{8}\b/i, why: "internal request / watch id" },
  { re: /\brecords\/decisions\b/i, why: "internal decision-record path" },
  { re: /\b(?:cmo|cto|ceo|cfo|clo|coo|cpo|cio|cso|cxo|vpe|vpx)\/[a-z-]+\//i, why: "internal office path" },
  { re: /\b(?:founder|jer)-(?:approved|ratified|directed|call)\b/i, why: "internal founder attribution" },
  { re: /\b(?:CMO|CTO|CPO|VPE|VPX|CLO|CSO|CIO|CXO)\s+(?:owns|ruling|call|decision)\b/, why: "internal office attribution" },
  { re: /\bfinding\s+#\d+/i, why: "internal review-finding reference (often carries a person's name)" },
  { re: /\bTODO\b|\bFIXME\b|\bXXX\b|\bHACK\b/, why: "internal engineering note" },
  { re: /\bSTAGED\b|\bdo not publish\b|\bdo not flip\b/i, why: "staged/held copy — stage it in the org, not in a served file" },
];

test("no internal notes in any publicly-served file", () => {
  const violations = [];

  for (const file of walk(PUBLIC_DIR)) {
    const src = readFileSync(file, "utf8");
    const rel = relative(ROOT, file);
    src.split("\n").forEach((line, i) => {
      for (const { re, why } of INTERNAL) {
        if (re.test(line)) {
          violations.push(`${rel}:${i + 1} — ${why}\n    ${line.trim().slice(0, 110)}`);
        }
      }
    });
  }

  assert.equal(
    violations.length,
    0,
    `public/ is served verbatim to anyone — these lines ship in view-source.\n` +
      `Move the note to the org (an agency entry under shared/agency/), not a comment here.\n\n` +
      violations.join("\n"),
  );
});
