import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { once } from 'node:events';

const fixtureWriterUrl = await startFixtureWriter();

export default defineWorkersConfig({
  test: {
    include: ['test/**/*.test.js'],
    exclude: ['test/static.test.js'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        main: './src/index.js',
        compatibilityDate: '2025-04-01',
        compatibilityFlags: ['nodejs_compat'],
        miniflare: {
          workers: [{
            name: 'extro-support',
            modules: true,
            script: 'export default { async fetch() { return new Response(JSON.stringify({ error: "test support worker not configured" }), { status: 500, headers: { "Content-Type": "application/json" } }); } }',
          }, {
            name: 'spl-relay',
            modules: true,
            script: 'export default { async fetch() { return new Response(JSON.stringify({ error: "test relay worker not configured" }), { status: 500, headers: { "Content-Type": "application/json" } }); } }',
          }],
          d1Databases: ['DB'],
          d1Persist: false,
          kvNamespaces: ['GCP_TOKEN_CACHE'],
          bindings: {
            ENCRYPTION_SECRET: 'MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=',
            HMAC_PEPPER: 'test-hmac-pepper',
            DISPATCH_TOKEN_PEPPER: 'test-dispatch-token-pepper',
            TURNSTILE_SECRET: 'test-turnstile-secret',
            TURNSTILE_SITE_KEY: 'test-turnstile-site-key',
            CF_ACCESS_AUD: 'test-cf-access-aud',
            EMAIL_PATH_DISABLED: 'false',
            SIGNUP_DISABLED: 'false',
            SERVICES_AUTH_TOKEN: 'test-services-auth-token',
            R2_PARENT_ACCESS_KEY_ID: 'test-r2-parent-access-key-id',
            R2_PARENT_SECRET_ACCESS_KEY: 'test-r2-parent-secret-access-key',
            R2_ACCOUNT_ID: '3f2c1528c7d4d9685819ea9e9e307c92',
            R2_BUCKET: 'solstone-backups',
            SPB_MINT_ENABLED: 'true',
            MCP_BRIDGE_FIXTURE_WRITE: process.env.MCP_BRIDGE_FIXTURE_WRITE || '',
            MCP_BRIDGE_FIXTURE_WRITE_URL: fixtureWriterUrl,
          },
        },
      },
    },
  },
});

async function startFixtureWriter() {
  if (process.env.MCP_BRIDGE_FIXTURE_WRITE !== '1') return '';
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/mcp-bridge-fixture') {
      response.writeHead(404).end();
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    writeFileSync(new URL('./test-fixtures/mcp_bridge_v1.json', import.meta.url), Buffer.concat(chunks));
    response.once('finish', () => server.close());
    response.writeHead(204).end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  server.unref();
  process.on('exit', () => server.close());
  const { port } = server.address();
  return `http://127.0.0.1:${port}/mcp-bridge-fixture`;
}
