import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export function defineAccountWorkerConfig(files) {
  return defineWorkersConfig({
    test: {
      include: files,
      setupFiles: ['./test/setup.js'],
      poolOptions: {
        workers: {
          singleWorker: true,
          isolatedStorage: true,
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
              GCP_SERVICE_ACCOUNT_JSON: '{}',
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
            },
          },
        },
      },
    },
  });
}
