#!/usr/bin/env node
// Fail unless every served public installer equals the production installer
// generated from solstone at origin/main. Run via `make check-install-sh-served`;
// `make publish-install-sh` runs it last, so a green `wrangler deploy` line is
// never the whole receipt.
//
// Why this exists: the installer is versioned in solstone but served from this
// repo. This gate measures the actual edge bytes at both supported URLs:
//
//   https://solstone.app/install.sh                  (authoritative)
//   https://solstone.app/platform-install.sh         (compatibility URL)
//
// Deliberately NOT wired into solstone's CI or into `make deploy`:
// it necessarily straddles two repos, so it would fail every build the moment
// install.sh moves and before anyone can publish. It is a publish gate, reachable
// by name, like `make check-install-fast` in solstone-journal.
//
// Exit 0: every served copy equals the source.
// Exit 1: a served copy differs -- BEHIND. The fix is `make publish-install-sh`.
// Exit 2: a copy or the source could not be read -- UNMEASURED, never a pass.
//   (A finding outranks an unread copy: any BEHIND exits 1 even if another
//   surface was unreadable.)
//
// --wait SECONDS: keep re-reading a differing copy until it matches or the time
// is up. Only `publish-install-sh` uses it -- a fresh deploy takes the edge a
// few seconds to catch up, and the check must not call a good publish red.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SERVED_URLS = [
  "https://solstone.app/install.sh",
  "https://solstone.app/platform-install.sh",
];
const FIX = "cd <solstone.app checkout> && make publish-install-sh   (then: git add public/install.sh public/platform-install.sh && git commit)";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function revisionOf(bytes) {
  const m = /^(?:INSTALLER|BOOTSTRAP)_REVISION=(\d+)\s*$/m.exec(bytes.toString("utf8"));
  return m ? m[1] : "?";
}

function describe(bytes) {
  return { digest: sha256(bytes), revision: revisionOf(bytes) };
}

// Build the exact source `make publish-install-sh` would publish. Requiring the
// checkout itself to equal origin/main keeps local edits out of the authority.
function readSource(solstoneRepo) {
  execFileSync("git", ["-C", solstoneRepo, "fetch", "origin", "--quiet"], { stdio: "pipe" });
  const head = execFileSync("git", ["-C", solstoneRepo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const commit = execFileSync("git", ["-C", solstoneRepo, "rev-parse", "origin/main"], {
    encoding: "utf8",
  }).trim();
  if (head !== commit) throw new Error(`solstone HEAD ${head} is not origin/main ${commit}`);
  const dirty = execFileSync("git", ["-C", solstoneRepo, "status", "--porcelain"], { encoding: "utf8" }).trim();
  if (dirty) throw new Error("solstone checkout has uncommitted changes");
  execFileSync("make", ["-C", solstoneRepo, "build-installer"], { stdio: "pipe" });
  const bytes = readFileSync(resolve(solstoneRepo, "dist/install.sh"));
  return { bytes, label: `solstone origin/main ${commit.slice(0, 12)}` };
}

async function readServed(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (res.status !== 200) return { url, error: `HTTP ${res.status}` };
    return { url, ...describe(Buffer.from(await res.arrayBuffer())) };
  } catch (err) {
    return { url, error: err.cause?.code ?? err.message };
  }
}

// Read every surface; re-read only the ones that differ, until they match or
// the deadline passes. A copy that could not be read is retried the same way.
async function readAllServed(urls, want, waitSeconds, intervalSeconds) {
  const deadline = Date.now() + waitSeconds * 1000;
  let served = await Promise.all(urls.map(readServed));
  while (Date.now() < deadline && served.some((s) => s.error || s.digest !== want.digest)) {
    await sleep(intervalSeconds * 1000);
    served = await Promise.all(
      served.map((s) => (s.error || s.digest !== want.digest ? readServed(s.url) : s)),
    );
  }
  return served;
}

async function checkInstallShServed({ source, urls, waitSeconds = 0, intervalSeconds = 5 }) {
  const want = describe(source.bytes);
  const served = await readAllServed(urls, want, waitSeconds, intervalSeconds);
  const behind = served.filter((s) => !s.error && s.digest !== want.digest);
  const unread = served.filter((s) => s.error);
  const verdict = behind.length ? "BEHIND" : unread.length ? "UNMEASURED" : "OK";
  return { want, served, behind, unread, verdict, exit: { OK: 0, BEHIND: 1, UNMEASURED: 2 }[verdict] };
}

function report(source, r) {
  const short = (d) => d.slice(0, 12);
  const lines = [
    `source  ${source.label}  generated installer  revision ${r.want.revision}  sha256 ${short(r.want.digest)}`,
  ];
  for (const s of r.served) {
    if (s.error) lines.push(`served  ${s.url}  UNREAD (${s.error})`);
    else if (s.digest === r.want.digest) lines.push(`served  ${s.url}  revision ${s.revision}  sha256 ${short(s.digest)}  ok`);
    else lines.push(`served  ${s.url}  revision ${s.revision}  sha256 ${short(s.digest)}  BEHIND`);
  }
  if (r.behind.length) {
    lines.push("", "BEHIND: a served installer does not match the source, so it can refuse a release the source accepts.");
    for (const s of r.behind) {
      lines.push(`  ${s.url} serves revision ${s.revision} (${short(s.digest)}); the source is revision ${r.want.revision} (${short(r.want.digest)})`);
    }
    lines.push(`fix: ${FIX}`);
  }
  if (r.unread.length) {
    lines.push("", `UNMEASURED: ${r.unread.length} served copy could not be read. This is not a pass; publishing does not fix a read failure -- retry.`);
  }
  if (r.verdict === "OK") lines.push("", "OK: every served copy equals the source.");
  return lines.join("\n");
}

async function main() {
  const { values } = parseArgs({
    options: {
      "solstone-repo": { type: "string" },
      "source-file": { type: "string" }, // test/offline override for the git read
      url: { type: "string", multiple: true }, // test override for the served URLs
      wait: { type: "string", default: "0" },
      interval: { type: "string", default: "5" },
    },
  });
  const solstoneRepo = resolve(values["solstone-repo"] ?? process.env.SOLSTONE_REPO ?? resolve(repoRoot, "../solstone"));

  let source;
  try {
    source = values["source-file"]
      ? { bytes: readFileSync(values["source-file"]), label: values["source-file"] }
      : readSource(solstoneRepo);
  } catch (err) {
    console.error(`UNMEASURED: could not build the installer from origin/main in ${solstoneRepo}: ${err.message.split("\n")[0]}`);
    console.error("This is not a pass.");
    process.exit(2);
  }

  const r = await checkInstallShServed({
    source,
    urls: values.url ?? SERVED_URLS,
    waitSeconds: Number(values.wait),
    intervalSeconds: Number(values.interval),
  });
  (r.exit === 0 ? console.log : console.error)(report(source, r));
  process.exit(r.exit);
}

// Node exits 1 on an uncaught throw, and 1 here means BEHIND -- the signal to
// republish. A gate that crashed must never read as a finding, so it is exit 2.
main().catch((err) => {
  console.error(`UNMEASURED: the gate itself failed: ${err.stack ?? err}`);
  console.error("This is not a pass.");
  process.exit(2);
});
