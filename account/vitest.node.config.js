import { defineConfig } from 'vitest/config';
import { testPartitions } from './test/partitions.js';

export default defineConfig({
  test: {
    environment: 'node',
    include: testPartitions.node,
    setupFiles: ['./test/setup.js'],
    pool: 'threads',
    poolOptions: {
      threads: { singleThread: true },
    },
  },
});
