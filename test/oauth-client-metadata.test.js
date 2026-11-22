import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

function headersBlock(headersText, route) {
  return headersText
    .split(/\r?\n\s*\r?\n/)
    .find((section) => section.startsWith(`${route}\n`) || section.startsWith(`${route}\r\n`));
}

function headerValue(block, name) {
  const lower = `${name.toLowerCase()}:`;
  const line = block.split(/\r?\n/).find((row) => row.trim().toLowerCase().startsWith(lower));
  return line ? line.trim().slice(lower.length).trim() : null;
}

test("ATProto OAuth client metadata matches the native public client contract", () => {
  const raw = read("public/oauth-client-metadata.json");
  assert.ok(Buffer.byteLength(raw, "utf8") <= 5 * 1024);
  const doc = JSON.parse(raw);

  assert.equal(doc.client_id, "https://solstone.app/oauth-client-metadata.json");
  assert.equal(doc.client_name, "solstone");
  assert.equal(doc.client_uri, "https://solstone.app");
  assert.equal(doc.application_type, "native");
  assert.deepEqual(doc.grant_types, ["authorization_code", "refresh_token"]);
  assert.deepEqual(doc.response_types, ["code"]);
  assert.deepEqual(doc.redirect_uris, [
    "http://127.0.0.1/callback",
    "http://[::1]/callback",
    "app.solstone:/callback",
  ]);
  assert.equal(doc.scope, "atproto transition:generic");
  assert.equal(doc.token_endpoint_auth_method, "none");
  assert.equal(doc.dpop_bound_access_tokens, true);
});

test("MCP OAuth client metadata matches the CIMD public client contract", () => {
  const raw = read("public/oauth/mcp-client-metadata.json");
  assert.ok(Buffer.byteLength(raw, "utf8") <= 5 * 1024);
  const doc = JSON.parse(raw);

  assert.equal(doc.client_id, "https://solstone.app/oauth/mcp-client-metadata.json");
  assert.equal(doc.client_name, "solstone");
  assert.equal(doc.client_uri, "https://solstone.app");
  assert.deepEqual(doc.redirect_uris, [
    "http://127.0.0.1/callback",
    "http://localhost/callback",
    "solstone://oauth/callback",
  ]);
  assert.deepEqual(doc.grant_types, ["authorization_code", "refresh_token"]);
  assert.deepEqual(doc.response_types, ["code"]);
  assert.equal(doc.token_endpoint_auth_method, "none");
  assert.equal("client_secret" in doc, false);
  assert.equal("jwks" in doc, false);
});

test("both OAuth client metadata documents declare JSON, CORS and cache headers and bypass the Worker", () => {
  const headers = read("public/_headers");
  const toml = read("wrangler.toml");

  for (const route of ["/oauth-client-metadata.json", "/oauth/mcp-client-metadata.json"]) {
    const block = headersBlock(headers, route);
    assert.ok(block, `public/_headers defines ${route}`);
    assert.equal(headerValue(block, "content-type"), "application/json; charset=utf-8", route);
    assert.equal(headerValue(block, "access-control-allow-origin"), "*", route);
    assert.equal(headerValue(block, "cache-control"), "public, max-age=300", route);
    assert.equal(toml.includes(`"${route}"`), false, `${route} stays on Static Assets`);
  }
});
