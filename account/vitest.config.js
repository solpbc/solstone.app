import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

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
          d1Databases: ['DB'],
          d1Persist: false,
          kvNamespaces: ['GCP_TOKEN_CACHE'],
          bindings: {
            ENCRYPTION_SECRET: 'MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=',
            HMAC_PEPPER: 'test-hmac-pepper',
            OAUTH_TOKEN_PEPPER: 'test-oauth-token-pepper',
            DISPATCH_TOKEN_PEPPER: 'test-dispatch-token-pepper',
            GCP_SERVICE_ACCOUNT_JSON: '{}',
            TURNSTILE_SECRET: 'test-turnstile-secret',
            TURNSTILE_SITE_KEY: 'test-turnstile-site-key',
            CF_ACCESS_AUD: 'test-cf-access-aud',
            EMAIL_PATH_DISABLED: 'false',
            SIGNUP_DISABLED: 'false',
          },
        },
      },
    },
  },
});
