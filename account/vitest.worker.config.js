import { testPartitions } from './test/partitions.js';
import { defineAccountWorkerConfig } from './vitest.worker.shared.js';

export default defineAccountWorkerConfig(testPartitions.worker);
