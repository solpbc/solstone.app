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
          bindings: {
            ENCRYPTION_SECRET: 'MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=',
            HMAC_PEPPER: 'test-hmac-pepper',
            TURNSTILE_SECRET: 'test-turnstile-secret',
            TURNSTILE_SITE_KEY: 'test-turnstile-site-key',
          },
        },
      },
    },
  },
});
