import { describe, expect, it, vi } from 'vitest';
import {
  MAX_SAMPLE_GAP_MS,
  assessMeasurement,
  buildReportRecord,
  collectProcSample,
  createLaunchSpec,
  forwardSignal,
  parseProcStat,
  parseProcStatus,
  parseRunCount,
  summarizeProcesses,
  updatePeaks,
  validateProcessGroupOwnership,
} from '../scripts/measure-test-resources.mjs';

describe('test resource measurement', () => {
  it('accepts the default, one-run, and two-run surfaces and rejects everything else', () => {
    expect(parseRunCount([])).toBe(1);
    expect(parseRunCount(['--runs', '1'])).toBe(1);
    expect(parseRunCount(['--runs', '2'])).toBe(2);
    expect(() => parseRunCount(['2'])).toThrow(/usage/);
    expect(() => parseRunCount(['--runs', '3'])).toThrow(/usage/);
  });

  it('defines the unchanged canonical npm test as a detached child', () => {
    expect(createLaunchSpec('/account')).toEqual({
      command: 'npm',
      args: ['test'],
      options: { cwd: '/account', detached: true, stdio: ['ignore', 'inherit', 'inherit'] },
    });
  });

  it('parses a stat comm containing spaces and parentheses without shifting pgid', () => {
    expect(parseProcStat('321 (worker name (one)) S 300 777 777 0 -1 0')).toEqual({
      pid: 321,
      comm: 'worker name (one)',
      state: 'S',
      ppid: 300,
      pgrp: 777,
    });
  });

  it('parses RSS and thread counts by status field name', () => {
    expect(parseProcStatus('Name:\tworker name\nVmRSS:\t4567 kB\nThreads:\t23\n')).toEqual({
      rssKiB: 4567,
      threads: 23,
    });
  });

  it('filters by launched pgid and aggregates RSS, workerd, and tasks', () => {
    const sample = summarizeProcesses([
      { pid: 1, pgrp: 10, state: 'S', comm: 'npm', rssKiB: 100, threads: 2 },
      { pid: 2, pgrp: 10, state: 'S', comm: 'workerd', rssKiB: 400, threads: 9 },
      { pid: 3, pgrp: 20, state: 'S', comm: 'workerd', rssKiB: 600, threads: 11 },
      { pid: 4, pgrp: 99, state: 'S', comm: 'workerd', rssKiB: 999, threads: 99 },
      { pid: 5, pgrp: 10, state: 'Z', comm: 'workerd', rssKiB: 50, threads: 1 },
    ], new Set([10, 20]));

    expect(sample.aggregate).toMatchObject({ rssKiB: 1100, threads: 22, workerd: 2 });
    expect(sample.aggregate).not.toHaveProperty('workerdPids');
    expect(sample.groups[10].workerdPids).toEqual([2]);
    expect(sample.groups[20].workerdPids).toEqual([3]);
  });

  it('retains maxima rather than the most recent sample', () => {
    const peaks = { rssKiB: 0, threads: 0, workerd: 0, groups: {} };
    updatePeaks(peaks, summarizeProcesses([
      { pid: 1, pgrp: 10, state: 'S', comm: 'workerd', rssKiB: 500, threads: 10 },
    ], new Set([10])));
    updatePeaks(peaks, summarizeProcesses([
      { pid: 1, pgrp: 10, state: 'S', comm: 'workerd', rssKiB: 300, threads: 8 },
    ], new Set([10])));

    expect(peaks).toMatchObject({ rssKiB: 500, threads: 10, workerd: 1 });
    expect(peaks.groups[10]).toEqual({ rssKiB: 500, threads: 10, workerd: 1 });
  });

  it('rejects a detached child that is not its process-group leader', () => {
    expect(() => validateProcessGroupOwnership({
      childPid: 100,
      pgrp: 101,
      samplerPgrp: 50,
      resolvedPgids: new Set(),
    })).toThrow(/not process-group leader/);
  });

  it('rejects a child process group that matches the sampler group', () => {
    expect(() => validateProcessGroupOwnership({
      childPid: 100,
      pgrp: 100,
      samplerPgrp: 100,
      resolvedPgids: new Set(),
    })).toThrow(/matches sampler process group/);
  });

  it('rejects a child process group already owned by another run', () => {
    expect(() => validateProcessGroupOwnership({
      childPid: 101,
      pgrp: 100,
      samplerPgrp: 50,
      resolvedPgids: new Set([100]),
    })).toThrow(/duplicate child pgrp/);
  });

  it('marks enumeration failure and malformed in-scope records unavailable', () => {
    expect(() => collectProcSample({
      pgids: new Set([10]),
      readdir: () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); },
    })).toThrow(/enumeration failure/);
    expect(() => collectProcSample({
      pgids: new Set([10]),
      readdir: () => [{ name: '123', isDirectory: () => true }],
      readFile: () => 'malformed',
    })).toThrow(/malformed or unreadable stat/);
  });

  it('makes all instrumentation failure paths nonzero and metrics unavailable', () => {
    const cases = [
      { errors: ['enumeration failure'], validSampleCount: 4, maxObservedGapMs: 100 },
      { errors: ['malformed sample'], validSampleCount: 4, maxObservedGapMs: 100 },
      { errors: [], validSampleCount: 0, maxObservedGapMs: 100 },
      { errors: [], validSampleCount: 4, maxObservedGapMs: MAX_SAMPLE_GAP_MS + 1 },
    ];
    for (const samplingCase of cases) {
      const fixture = measurementFixture({ sampling: samplingCase });
      const assessment = assessMeasurement(fixture);
      const report = buildReportRecord({ ...fixture, assessment });
      expect(assessment.exitCode).toBe(2);
      expect(assessment.unavailableReasons.length).toBeGreaterThan(0);
      expect(report).toMatchObject({
        metricsStatus: 'unavailable',
        peakAggregateRssKiB: null,
        concurrentWorkerdPeak: null,
        peakTaskThreadCount: null,
        exitCode: 2,
      });
      expect(JSON.stringify(report)).not.toContain('"peakAggregateRssKiB":0');
    }
    const unresolved = measurementFixture();
    unresolved.runs[0].pgidError = 'missing stat';
    const unresolvedResult = assessMeasurement(unresolved);
    expect(unresolvedResult.exitCode).toBe(2);
    expect(unresolvedResult.unavailableReasons.join(' ')).toMatch(/unresolved pgid/);
  });

  it('deduplicates repeated metrics-unavailable reasons while preserving order', () => {
    const fixture = measurementFixture({
      sampling: { errors: ['repeated failure', 'other failure', 'repeated failure'] },
    });
    const assessment = assessMeasurement(fixture);
    const report = buildReportRecord({ ...fixture, assessment });

    expect(assessment.unavailableReasons).toEqual([
      'repeated failure',
      'other failure',
    ]);
    expect(report.metricsUnavailableReasons).toEqual(['repeated failure', 'other failure']);
    expect(JSON.stringify(report).match(/repeated failure/g)).toHaveLength(1);
  });

  it('reports the final teardown observation and per-group resource peaks', () => {
    const fixture = measurementFixture();
    const assessment = assessMeasurement(fixture);

    expect(buildReportRecord({ ...fixture, assessment }).runs[0]).toMatchObject({
      peakRssKiB: 100,
      peakTaskThreadCount: 2,
      finalTeardownObservation: { count: 0, pids: [], source: 'clean-sample' },
    });
  });

  it('distinguishes child, resource-bound, unavailable, and interrupted exits', () => {
    const child = measurementFixture();
    child.runs[0].exitCode = 1;
    expect(assessMeasurement(child).exitCode).toBe(1);
    const bound = measurementFixture();
    bound.runs[0].peakWorkerd = 2;
    expect(assessMeasurement(bound).exitCode).toBe(1);
    const lingering = measurementFixture();
    lingering.runs[0].finalTeardownObservation = {
      count: 1,
      pids: [11],
      source: 'deadline',
    };
    expect(assessMeasurement(lingering).exitCode).toBe(1);
    const unavailable = measurementFixture({ sampling: { errors: ['bad sample'] } });
    unavailable.runs[0].exitCode = 1;
    expect(assessMeasurement(unavailable)).toMatchObject({ exitCode: 2 });
    expect(assessMeasurement({ ...measurementFixture(), interruptedSignal: 'SIGINT' }).exitCode).toBe(130);
  });

  it('forwards signals to negative process-group ids without targeting workerd pids', () => {
    const kill = vi.fn();

    expect(forwardSignal('SIGINT', [123, 456], kill)).toEqual([]);
    expect(kill.mock.calls).toEqual([[-123, 'SIGINT'], [-456, 'SIGINT']]);
  });
});

function measurementFixture({ sampling: samplingOverrides = {} } = {}) {
  return {
    runCount: 1,
    runs: [{
      index: 1,
      spawnError: null,
      pgidError: null,
      closeMs: 100,
      validLiveSamples: 1,
      observedWorkerd: true,
      exitCode: 0,
      exitSignal: null,
      pid: 10,
      pgid: 10,
      peakWorkerd: 1,
      finalTeardownObservation: { count: 0, pids: [], source: 'clean-sample' },
    }],
    sampling: {
      errors: [],
      validSampleCount: 2,
      maxObservedGapMs: 100,
      peaks: {
        rssKiB: 100,
        threads: 2,
        workerd: 1,
        groups: { 10: { rssKiB: 100, threads: 2, workerd: 1 } },
      },
      overlap: null,
      ...samplingOverrides,
    },
  };
}
