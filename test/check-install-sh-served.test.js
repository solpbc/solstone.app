import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);
const SCRIPT = new URL("../scripts/check-install-sh-served.mjs", import.meta.url).pathname;

const installer = (revision) => `#!/bin/sh\nset -eu\nBOOTSTRAP_REVISION=${revision}\necho installing\n`;
const CURRENT = installer(2);
const STALE = installer(1);

// Serve a fixed body per path from a local port; `bodies[path]` may be a
// function so a test can change what the "edge" returns between reads.
async function withServer(bodies, fn) {
  const server = createServer((req, res) => {
    const body = bodies[req.url];
    if (body === undefined) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": "text/plain" }).end(typeof body === "function" ? body() : body);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

function sourceFile(text) {
  const path = join(mkdtempSync(join(tmpdir(), "install-gate-")), "install.sh");
  writeFileSync(path, text);
  return path;
}

// Resolves with {code, out} for any exit status, so a red gate can be asserted on.
async function gate(source, urls, extra = []) {
  const args = [SCRIPT, "--source-file", sourceFile(source), ...urls.flatMap((u) => ["--url", u]), ...extra];
  try {
    const { stdout, stderr } = await run(process.execPath, args);
    return { code: 0, out: stdout + stderr };
  } catch (err) {
    return { code: err.code, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

test("exits 0 when both served copies equal the source", async () => {
  await withServer({ "/a": CURRENT, "/b": CURRENT }, async (base) => {
    const r = await gate(CURRENT, [`${base}/a`, `${base}/b`]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /OK: every served copy equals the source/);
  });
});

test("exits 1 and names the fix when the authoritative copy is stale", async () => {
  await withServer({ "/a": STALE, "/b": CURRENT }, async (base) => {
    const r = await gate(CURRENT, [`${base}/a`, `${base}/b`]);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /make publish-install-sh/);
    assert.match(r.out, new RegExp(`${base}/a serves revision 1`));
    assert.match(r.out, /the source is revision 2/);
  });
});

test("a stale compatibility alias alone is red -- both surfaces are in scope", async () => {
  await withServer({ "/a": CURRENT, "/b": STALE }, async (base) => {
    const r = await gate(CURRENT, [`${base}/a`, `${base}/b`]);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, new RegExp(`${base}/b serves revision 1`));
    assert.doesNotMatch(r.out, new RegExp(`${base}/a serves revision`));
  });
});

test("a same-revision copy with different bytes is still behind: the comparison is by digest, not revision", async () => {
  await withServer({ "/a": `${CURRENT}# edited\n` }, async (base) => {
    const r = await gate(CURRENT, [`${base}/a`]);
    assert.equal(r.code, 1, r.out);
  });
});

test("an unreadable surface exits 2 and is never a pass; the fix line is not offered for a read failure", async () => {
  await withServer({ "/a": CURRENT }, async (base) => {
    const r = await gate(CURRENT, [`${base}/a`, `${base}/missing`]);
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /UNMEASURED/);
    assert.match(r.out, /HTTP 404/);
    assert.doesNotMatch(r.out, /fix: /);
  });
});

test("a behind copy outranks an unread one", async () => {
  await withServer({ "/a": STALE }, async (base) => {
    const r = await gate(CURRENT, [`${base}/a`, `${base}/missing`]);
    assert.equal(r.code, 1, r.out);
  });
});

test("--wait rides out an edge that catches up, and still fails a copy that never does", async () => {
  let reads = 0;
  await withServer({ "/lagging": () => (++reads < 3 ? STALE : CURRENT), "/stuck": STALE }, async (base) => {
    const caughtUp = await gate(CURRENT, [`${base}/lagging`], ["--wait", "5", "--interval", "0.05"]);
    assert.equal(caughtUp.code, 0, caughtUp.out);
    assert.ok(reads >= 3, "the lagging copy was re-read");

    const never = await gate(CURRENT, [`${base}/stuck`], ["--wait", "0.3", "--interval", "0.05"]);
    assert.equal(never.code, 1, never.out);
  });
});

test("a crash of the gate itself exits 2, never 1: a crash must not read as BEHIND", async () => {
  const r = await run(process.execPath, [SCRIPT, "--no-such-flag"]).then(
    () => ({ code: 0 }),
    (err) => ({ code: err.code, out: err.stderr }),
  );
  assert.equal(r.code, 2);
  assert.match(r.out, /UNMEASURED: the gate itself failed/);
  assert.doesNotMatch(r.out, /make publish-install-sh/);
});

test("an unreadable source exits 2 rather than comparing against nothing", async () => {
  const r = await run(process.execPath, [SCRIPT, "--journal-repo", "/nonexistent/solstone-journal", "--url", "http://127.0.0.1:9/x"]).then(
    () => ({ code: 0 }),
    (err) => ({ code: err.code, out: err.stderr }),
  );
  assert.equal(r.code, 2);
  assert.match(r.out, /UNMEASURED: could not read core\/distribution\/install\.sh/);
});
