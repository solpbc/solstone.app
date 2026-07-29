import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Anchor to the repo root so the guard runs the same from any cwd.
const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "public");

// Brand-canon guard for the *marketing site*.
//
// The signed-on portal (account/) has had one of these since launch
// (account/test/brand-canon.test.js). public/ never did — which is exactly how
// "your own raw audio and screen captures" sat on install.html untouched. The
// higher-traffic, first-impression surface was the unguarded one.
//
// Canon: the internal brand canon § the never-list.

// PROSE ONLY. Engineering identifiers are deliberately exempt (never-list rule 7
// carve-out, operator call 2026-07-13): `capture-executor`, the capture pipeline,
// and the on-disk `observers/` path keep their names in code and are NOT renamed
// — but they must never reach a sentence a person reads. Stripping code blocks is
// what encodes that distinction, so the guard enforces language without ever
// forcing a rename.
const stripCode = (src, isMarkdown) => {
  let s = src
    .replace(/<pre\b[\s\S]*?<\/pre>/gi, " ")
    .replace(/<code\b[\s\S]*?<\/code>/gi, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ");
  if (isMarkdown) {
    s = s.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ");
  }
  return s;
};

// Deliberately narrow. A noisy guard gets disabled, and a disabled guard is worse
// than none — so this carries only words that are unambiguously banned in prose.
// Ambiguous ones ("monitors" can mean screens) are left to human review.
const BANNED = [
  // never-list rule 7 (operator call, 2026-07-13): "capture" is predatory — it is
  // what *they* do to people. Banned in every form: verb, noun ("screen captures"
  // -> "screen frames"), and compound ("capture footprint").
  { re: /\bcaptur\w*/i, why: 'surveillance register — "capture" is banned in every form; for the owner\'s files write "screen frames"' },
  { re: /\bsurveil\w*/i, why: "surveillance register" },
  { re: /always\s+listening/i, why: 'never-list: "always" + a perception verb' },
  { re: /\bmeet\s+sol\b/i, why: 'never-list: the Clippy/Cortana onboarding cliché — use "this is sol"' },
  // "observers" retired customer-facing 2026-07-03 (the app is sol). The on-disk
  // observers/ path in a shell command is fine — that's why code is stripped.
  { re: /\bobservers?\b/i, why: '"observers" is retired customer-facing — the app is sol' },
];

const walk = (dir) => {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if ([".html", ".md", ".txt"].includes(extname(p))) out.push(p);
  }
  return out;
};

test("marketing site prose carries no banned brand-canon vocabulary", () => {
  // install.md and llms.txt live inside public/, so the walk already covers them.
  const files = walk(PUBLIC_DIR);
  const violations = [];

  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    const prose = stripCode(raw, extname(file) === ".md");
    for (const { re, why } of BANNED) {
      const hit = prose.match(re);
      if (hit) violations.push(`${file}: "${hit[0]}" — ${why}`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `brand-canon violations in owner-facing prose:\n  ${violations.join("\n  ")}\n\n` +
      `canon: the internal brand canon § the never-list`,
  );
});
