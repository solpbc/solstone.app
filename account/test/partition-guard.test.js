import { describe, expect, it } from 'vitest';
import { validateTestPartitions } from '../scripts/check-test-partitions.mjs';

const emptyPartitions = () => ({ worker: [], passkey: [], node: [] });

describe('test partition guard', () => {
  it('accepts an exact one-to-one assignment', () => {
    const discovered = ['test/a.test.js', 'test/nested/b.test.js'];
    const partitions = { worker: [discovered[0]], passkey: [], node: [discovered[1]] };

    expect(validateTestPartitions({ discovered, partitions })).toEqual({
      ok: true,
      missing: [],
      multiplyAssigned: [],
      unknown: [],
      invalidEntries: [],
      unexpectedPartitions: [],
    });
  });

  it('rejects a nested discovered file absent from all partitions', () => {
    const discovered = ['test/worker.test.js', 'test/tmp-nested/scratch.test.js'];
    const partitions = { ...emptyPartitions(), worker: ['test/worker.test.js'] };

    const result = validateTestPartitions({ discovered, partitions });

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['test/tmp-nested/scratch.test.js']);
  });

  it('rejects a nested file assigned more than once', () => {
    const nested = 'test/deep/nested/test-case.test.js';
    const partitions = { ...emptyPartitions(), worker: [nested], passkey: [nested] };

    const result = validateTestPartitions({ discovered: [nested], partitions });

    expect(result.ok).toBe(false);
    expect(result.multiplyAssigned).toEqual([{ path: nested, partitions: ['worker', 'passkey'] }]);
  });

  it('rejects assigned-but-undiscovered, malformed, and unexpected entries', () => {
    const partitions = {
      ...emptyPartitions(),
      worker: ['test/unknown.test.js', '../escape.test.js'],
      extra: [],
    };

    const result = validateTestPartitions({ discovered: [], partitions });

    expect(result.ok).toBe(false);
    expect(result.unknown).toEqual(['test/unknown.test.js']);
    expect(result.invalidEntries).toEqual([
      { partition: 'worker', path: '../escape.test.js', reason: 'invalid test path' },
    ]);
    expect(result.unexpectedPartitions).toEqual(['extra']);
  });

  it('detects a duplicate repeated within one partition', () => {
    const file = 'test/repeated.test.js';
    const partitions = { ...emptyPartitions(), node: [file, file] };

    const result = validateTestPartitions({ discovered: [file], partitions });

    expect(result.ok).toBe(false);
    expect(result.multiplyAssigned).toEqual([{ path: file, partitions: ['node', 'node'] }]);
  });
});
