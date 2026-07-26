#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export const SAMPLE_INTERVAL_MS = 100;
export const MAX_SAMPLE_GAP_MS = 1_000;
export const TEARDOWN_TIMEOUT_MS = 10_000;

const SIGNAL_NUMBERS = Object.freeze({ SIGHUP: 1, SIGINT: 2, SIGTERM: 15 });

export function parseRunCount(args) {
  if (args.length === 0) return 1;
  if (args.length === 2 && args[0] === '--runs' && (args[1] === '1' || args[1] === '2')) {
    return Number(args[1]);
  }
  throw new Error('usage: npm run test:resources -- [--runs 1|2]');
}

export function createLaunchSpec(cwd = process.cwd()) {
  return {
    command: 'npm',
    args: ['test'],
    options: {
      cwd,
      detached: true,
      stdio: ['ignore', 'inherit', 'inherit'],
    },
  };
}

export function parseProcStat(text) {
  const open = text.indexOf('(');
  const close = text.lastIndexOf(')');
  if (open <= 0 || close <= open || text[close + 1] !== ' ') {
    throw new Error('malformed /proc stat record');
  }
  const pid = Number(text.slice(0, open).trim());
  const fields = text.slice(close + 2).trim().split(/\s+/);
  const ppid = Number(fields[1]);
  const pgrp = Number(fields[2]);
  if (!Number.isInteger(pid) || !fields[0] || !Number.isInteger(ppid) || !Number.isInteger(pgrp)) {
    throw new Error('malformed /proc stat fields');
  }
  return { pid, comm: text.slice(open + 1, close), state: fields[0], ppid, pgrp };
}

export function parseProcStatus(text) {
  const rss = text.match(/^VmRSS:\s+(\d+)\s+kB$/m);
  const threads = text.match(/^Threads:\s+(\d+)$/m);
  if (!rss || !threads) throw new Error('malformed /proc status record');
  return { rssKiB: Number(rss[1]), threads: Number(threads[1]) };
}

export function summarizeProcesses(processes, pgids) {
  const groups = Object.fromEntries([...pgids].map((pgid) => [pgid, emptyGroup()]));
  for (const processRecord of processes) {
    if (!pgids.has(processRecord.pgrp) || processRecord.state === 'Z') continue;
    const group = groups[processRecord.pgrp];
    group.processes += 1;
    group.rssKiB += processRecord.rssKiB;
    group.threads += processRecord.threads;
    if (processRecord.comm === 'workerd') {
      group.workerd += 1;
      group.workerdPids.push(processRecord.pid);
    }
  }
  const aggregate = { processes: 0, rssKiB: 0, threads: 0, workerd: 0 };
  for (const group of Object.values(groups)) {
    aggregate.processes += group.processes;
    aggregate.rssKiB += group.rssKiB;
    aggregate.threads += group.threads;
    aggregate.workerd += group.workerd;
  }
  return { groups, aggregate };
}

export function collectProcSample({
  pgids,
  procRoot = '/proc',
  readdir = readdirSync,
  readFile = readFileSync,
}) {
  let entries;
  try {
    entries = readdir(procRoot, { withFileTypes: true });
  } catch (error) {
    throw procError('enumeration failure', error);
  }

  const processes = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
    const directory = path.join(procRoot, entry.name);
    let stat;
    try {
      stat = parseProcStat(readFile(path.join(directory, 'stat'), 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw procError(`malformed or unreadable stat for pid ${entry.name}`, error);
    }
    if (!pgids.has(stat.pgrp) || stat.state === 'Z') continue;
    try {
      processes.push({ ...stat, ...parseProcStatus(readFile(path.join(directory, 'status'), 'utf8')) });
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw procError(`malformed or unreadable status for pid ${entry.name}`, error);
    }
  }
  return summarizeProcesses(processes, pgids);
}

export function updatePeaks(peaks, sample) {
  peaks.rssKiB = Math.max(peaks.rssKiB, sample.aggregate.rssKiB);
  peaks.threads = Math.max(peaks.threads, sample.aggregate.threads);
  peaks.workerd = Math.max(peaks.workerd, sample.aggregate.workerd);
  for (const [pgid, group] of Object.entries(sample.groups)) {
    const current = peaks.groups[pgid] ?? emptyPeaks();
    current.rssKiB = Math.max(current.rssKiB, group.rssKiB);
    current.threads = Math.max(current.threads, group.threads);
    current.workerd = Math.max(current.workerd, group.workerd);
    peaks.groups[pgid] = current;
  }
  return peaks;
}

export function assessMeasurement({ runCount, runs, sampling, interruptedSignal = null }) {
  const unavailableReasons = [];
  for (const error of sampling.errors) addUnique(unavailableReasons, error);
  for (const run of runs) {
    if (run.spawnError) addUnique(unavailableReasons, `run ${run.index} spawn failure: ${run.spawnError}`);
    if (run.pgidError) addUnique(unavailableReasons, `run ${run.index} unresolved pgid: ${run.pgidError}`);
    if (run.closeMs == null && !run.spawnError) {
      addUnique(unavailableReasons, `run ${run.index} missing child close status`);
    }
    if (run.validLiveSamples === 0 && !run.spawnError) {
      addUnique(unavailableReasons, `run ${run.index} has no valid live-child sample`);
    }
    if (!run.observedWorkerd && !run.spawnError) {
      addUnique(unavailableReasons, `run ${run.index} observed no workerd`);
    }
  }
  if (sampling.validSampleCount === 0) addUnique(unavailableReasons, 'zero valid samples');
  if (sampling.maxObservedGapMs > MAX_SAMPLE_GAP_MS) {
    addUnique(
      unavailableReasons,
      `maximum observed gap ${formatMs(sampling.maxObservedGapMs)} exceeds ${MAX_SAMPLE_GAP_MS} ms`,
    );
  }
  if (sampling.peaks.rssKiB === 0) addUnique(unavailableReasons, 'peak aggregate RSS was not observed');
  if (sampling.peaks.threads === 0) addUnique(unavailableReasons, 'peak task/thread count was not observed');
  if (runCount === 2 && !sampling.overlap) {
    addUnique(unavailableReasons, 'two-run overlap window was not observed');
  }

  const childFailures = runs.filter((run) => run.exitCode !== 0 || run.exitSignal);
  const boundFailures = [];
  for (const run of runs) {
    if (run.peakWorkerd > 1) boundFailures.push(`run ${run.index} workerd peak ${run.peakWorkerd} exceeds 1`);
    if (run.finalTeardownObservation?.count > 0) {
      boundFailures.push(
        `run ${run.index} has ${run.finalTeardownObservation.count} lingering workerd after 10000 ms`,
      );
    }
  }
  if (sampling.peaks.workerd > runCount) {
    boundFailures.push(`aggregate workerd peak ${sampling.peaks.workerd} exceeds ${runCount}`);
  }
  if (runCount === 2 && sampling.overlap && sampling.overlap.durationMs <= 0) {
    boundFailures.push('the two child runs did not overlap');
  }

  if (interruptedSignal) {
    return { exitCode: 128 + SIGNAL_NUMBERS[interruptedSignal], unavailableReasons, childFailures, boundFailures };
  }
  if (unavailableReasons.length > 0) return { exitCode: 2, unavailableReasons, childFailures, boundFailures };
  if (childFailures.length > 0 || boundFailures.length > 0) {
    return { exitCode: 1, unavailableReasons, childFailures, boundFailures };
  }
  return { exitCode: 0, unavailableReasons, childFailures, boundFailures };
}

export function forwardSignal(signal, pgids, kill = process.kill) {
  const failures = [];
  for (const pgid of pgids) {
    try {
      kill(-pgid, signal);
    } catch (error) {
      if (error?.code !== 'ESRCH') failures.push(`pgid ${pgid}: ${error.message}`);
    }
  }
  return failures;
}

export function validateProcessGroupOwnership({ childPid, pgrp, samplerPgrp, resolvedPgids }) {
  if (!Number.isInteger(pgrp) || pgrp <= 0) throw new Error(`invalid pgrp ${pgrp}`);
  if (pgrp === samplerPgrp) {
    throw new Error(`child pgrp ${pgrp} matches sampler process group`);
  }
  if (resolvedPgids.has(pgrp)) throw new Error(`duplicate child pgrp ${pgrp}`);
  if (pgrp !== childPid) {
    throw new Error(`child pid ${childPid} is not process-group leader (pgrp ${pgrp})`);
  }
  resolvedPgids.add(pgrp);
  return pgrp;
}

function emptyGroup() {
  return { processes: 0, rssKiB: 0, threads: 0, workerd: 0, workerdPids: [] };
}

function emptyPeaks() {
  return { rssKiB: 0, threads: 0, workerd: 0 };
}

function procError(context, error) {
  const wrapped = new Error(`${context}: ${error.message}`);
  wrapped.cause = error;
  return wrapped;
}

function addUnique(values, value) {
  if (!values.includes(value)) values.push(value);
}

function reportSignalFailures(signal, pgids) {
  const failures = forwardSignal(signal, pgids);
  for (const failure of failures) console.error(`signal forwarding failed: ${failure}`);
}

function formatMs(value) {
  return Number(value).toFixed(1);
}

function elapsedMs(origin) {
  return Number(process.hrtime.bigint() - origin) / 1e6;
}

function startRun(index, origin, interruptedSignalRef, processGroups) {
  const run = {
    index,
    pid: null,
    pgid: null,
    spawnMs: null,
    closeMs: null,
    wallMs: null,
    exitCode: null,
    exitSignal: null,
    spawnError: null,
    pgidError: null,
    validLiveSamples: 0,
    observedWorkerd: false,
    peakWorkerd: 0,
    firstPostCloseLingering: null,
    finalTeardownObservation: null,
    teardownTimeMs: null,
  };
  const spec = createLaunchSpec();
  let child;
  try {
    child = spawn(spec.command, spec.args, spec.options);
    run.pid = child.pid;
  } catch (error) {
    run.spawnError = error.message;
    run.closeMs = elapsedMs(origin);
    return run;
  }

  child.once('spawn', () => {
    run.spawnMs = elapsedMs(origin);
    try {
      const stat = parseProcStat(readFileSync(`/proc/${child.pid}/stat`, 'utf8'));
      run.pgid = validateProcessGroupOwnership({
        childPid: child.pid,
        pgrp: stat.pgrp,
        samplerPgrp: processGroups.samplerPgrp,
        resolvedPgids: processGroups.resolvedPgids,
      });
      if (interruptedSignalRef.value) {
        reportSignalFailures(interruptedSignalRef.value, [run.pgid]);
      }
    } catch (error) {
      run.pgidError = error.message;
    }
  });
  child.once('error', (error) => {
    run.spawnError = error.message;
    if (run.closeMs == null) run.closeMs = elapsedMs(origin);
  });
  child.once('close', (code, signal) => {
    run.closeMs = elapsedMs(origin);
    run.wallMs = run.spawnMs == null ? null : run.closeMs - run.spawnMs;
    run.exitCode = code;
    run.exitSignal = signal;
  });
  return run;
}

async function monitorRuns(runs, runCount, origin) {
  const sampling = {
    validSampleCount: 0,
    maxObservedGapMs: 0,
    errors: [],
    peaks: { ...emptyPeaks(), groups: {} },
    overlap: null,
  };
  let lastAttemptMs = null;

  while (true) {
    const attemptMs = elapsedMs(origin);
    if (lastAttemptMs != null) {
      sampling.maxObservedGapMs = Math.max(sampling.maxObservedGapMs, attemptMs - lastAttemptMs);
    }
    lastAttemptMs = attemptMs;
    const pgids = new Set(runs.map((run) => run.pgid).filter(Number.isInteger));

    if (pgids.size > 0) {
      try {
        const sample = collectProcSample({ pgids });
        sampling.validSampleCount += 1;
        updatePeaks(sampling.peaks, sample);
        for (const run of runs) {
          if (!run.pgid) continue;
          const group = sample.groups[run.pgid];
          run.peakWorkerd = Math.max(run.peakWorkerd, group.workerd);
          if (run.closeMs == null) {
            run.validLiveSamples += 1;
            if (group.processes === 0 || group.rssKiB === 0 || group.threads === 0) {
              addUnique(
                sampling.errors,
                `run ${run.index} live process group yielded zero processes/RSS/tasks`,
              );
            }
          }
          if (group.workerd > 0) run.observedWorkerd = true;
          if (run.closeMs != null && run.firstPostCloseLingering == null) {
            run.firstPostCloseLingering = { count: group.workerd, pids: [...group.workerdPids] };
          }
          if (run.closeMs != null && group.workerd === 0 && run.teardownTimeMs == null) {
            run.teardownTimeMs = Math.max(0, attemptMs - run.closeMs);
            run.finalTeardownObservation = { count: 0, pids: [], source: 'clean-sample' };
          }
          if (
            run.closeMs != null
            && run.teardownTimeMs == null
            && attemptMs - run.closeMs >= TEARDOWN_TIMEOUT_MS
            && run.finalTeardownObservation == null
          ) {
            run.finalTeardownObservation = {
              count: group.workerd,
              pids: [...group.workerdPids],
              source: 'deadline',
            };
          }
        }
      } catch (error) {
        addUnique(sampling.errors, error.message);
      }
    }

    if (runs.every((run) => run.closeMs != null) && runs.every((run) => (
      run.spawnError
      || run.pgidError
      || run.teardownTimeMs != null
      || attemptMs - run.closeMs >= TEARDOWN_TIMEOUT_MS
    ))) break;

    const waitMs = Math.max(0, SAMPLE_INTERVAL_MS - (elapsedMs(origin) - attemptMs));
    await delay(waitMs);
  }

  if (runCount === 2 && runs.every((run) => run.spawnMs != null && run.closeMs != null)) {
    const startMs = Math.max(...runs.map((run) => run.spawnMs));
    const endMs = Math.min(...runs.map((run) => run.closeMs));
    sampling.overlap = { startMs, endMs, durationMs: Math.max(0, endMs - startMs) };
  }
  return sampling;
}

function resourceValue(value, assessment, suffix = '') {
  if (assessment.unavailableReasons.length > 0) return 'UNAVAILABLE';
  return `${value}${suffix}`;
}

export function buildReportRecord({ runCount, runs, sampling, assessment }) {
  return {
    runCount,
    sampleIntervalMs: SAMPLE_INTERVAL_MS,
    maxAllowedGapMs: MAX_SAMPLE_GAP_MS,
    teardownTimeoutMs: TEARDOWN_TIMEOUT_MS,
    metricsStatus: assessment.unavailableReasons.length === 0 ? 'available' : 'unavailable',
    metricsUnavailableReasons: assessment.unavailableReasons,
    peakAggregateRssKiB: assessment.unavailableReasons.length === 0 ? sampling.peaks.rssKiB : null,
    concurrentWorkerdPeak: assessment.unavailableReasons.length === 0 ? sampling.peaks.workerd : null,
    peakTaskThreadCount: assessment.unavailableReasons.length === 0 ? sampling.peaks.threads : null,
    validSampleCount: sampling.validSampleCount,
    maxObservedGapMs: sampling.maxObservedGapMs,
    overlap: sampling.overlap,
    runs: runs.map((run) => {
      const groupPeaks = sampling.peaks.groups[run.pgid];
      const available = assessment.unavailableReasons.length === 0;
      return {
        index: run.index,
        pid: run.pid,
        pgid: run.pgid,
        spawnMs: run.spawnMs,
        closeMs: run.closeMs,
        wallMs: run.wallMs,
        exitCode: run.exitCode,
        exitSignal: run.exitSignal,
        peakRssKiB: available ? groupPeaks?.rssKiB ?? null : null,
        peakTaskThreadCount: available ? groupPeaks?.threads ?? null : null,
        peakWorkerd: available ? run.peakWorkerd : null,
        firstPostCloseLingering: available ? run.firstPostCloseLingering : null,
        finalTeardownObservation: available ? run.finalTeardownObservation : null,
        teardownTimeMs: available ? run.teardownTimeMs : null,
      };
    }),
    exitCode: assessment.exitCode,
  };
}

function printReport({ runCount, runs, sampling, assessment }) {
  for (const run of assessment.childFailures) {
    console.error(
      `*** CHILD TEST FAILURE: run ${run.index} exited `
      + `${run.exitSignal ? `by ${run.exitSignal}` : `with code ${run.exitCode}`} ***`,
    );
  }
  for (const failure of assessment.boundFailures) console.error(`RESOURCE BOUND FAILURE: ${failure}`);
  if (assessment.unavailableReasons.length > 0) {
    console.error(`metrics unavailable: ${assessment.unavailableReasons.join('; ')}`);
  }

  const json = buildReportRecord({ runCount, runs, sampling, assessment });

  console.log('\nResource measurement');
  console.log(`runs: ${runCount}`);
  console.log(`sampling: ${SAMPLE_INTERVAL_MS} ms; validity gap: ${MAX_SAMPLE_GAP_MS} ms`);
  console.log(`valid sample count: ${sampling.validSampleCount}`);
  console.log(`max observed gap: ${formatMs(sampling.maxObservedGapMs)} ms`);
  console.log(`peak aggregate RSS: ${resourceValue(sampling.peaks.rssKiB, assessment, ' KiB')}`);
  console.log(`concurrent workerd peak: ${resourceValue(sampling.peaks.workerd, assessment)}`);
  console.log(`peak task/thread count: ${resourceValue(sampling.peaks.threads, assessment)}`);
  if (sampling.overlap) {
    console.log(
      `overlap window: ${formatMs(sampling.overlap.startMs)}..${formatMs(sampling.overlap.endMs)} ms `
      + `(${formatMs(sampling.overlap.durationMs)} ms)`,
    );
  } else {
    console.log('overlap window: n/a');
  }
  for (const run of runs) {
    const groupPeaks = sampling.peaks.groups[run.pgid];
    console.log(`run ${run.index}:`);
    console.log(`  launcher pid/pgid: ${run.pid ?? 'unavailable'}/${run.pgid ?? 'unavailable'}`);
    console.log(`  spawn timestamp: ${run.spawnMs == null ? 'unavailable' : `${formatMs(run.spawnMs)} ms`}`);
    console.log(`  close timestamp: ${run.closeMs == null ? 'unavailable' : `${formatMs(run.closeMs)} ms`}`);
    console.log(`  exit status: ${run.exitSignal ? `signal ${run.exitSignal}` : `code ${run.exitCode}`}`);
    console.log(`  wall time: ${run.wallMs == null ? 'unavailable' : `${formatMs(run.wallMs)} ms`}`);
    console.log(`  peak RSS: ${resourceValue(groupPeaks?.rssKiB ?? 0, assessment, ' KiB')}`);
    console.log(`  peak task/thread count: ${resourceValue(groupPeaks?.threads ?? 0, assessment)}`);
    console.log(`  workerd peak: ${resourceValue(run.peakWorkerd, assessment)}`);
    console.log(
      `  first post-close lingering workerd: ${resourceValue(
        run.firstPostCloseLingering?.count ?? 0,
        assessment,
      )}`,
    );
    const finalObservation = run.finalTeardownObservation == null
      ? 'not observed'
      : `${run.finalTeardownObservation.count} workerd (${run.finalTeardownObservation.source})`;
    console.log(
      `  final teardown observation: ${resourceValue(finalObservation, assessment)}`,
    );
    const teardown = run.teardownTimeMs == null
      ? 'not-observed-within-10000ms'
      : `${formatMs(run.teardownTimeMs)} ms`;
    console.log(`  teardown time: ${resourceValue(teardown, assessment)}`);
  }
  console.log(`RESOURCE_METRICS_JSON ${JSON.stringify(json)}`);
}

async function main() {
  let runCount;
  try {
    runCount = parseRunCount(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  try {
    readdirSync('/proc', { withFileTypes: true });
  } catch (error) {
    console.error(`metrics unavailable: /proc is unavailable: ${error.message}`);
    return 2;
  }
  let samplerPgrp;
  try {
    samplerPgrp = parseProcStat(readFileSync(`/proc/${process.pid}/stat`, 'utf8')).pgrp;
    if (!Number.isInteger(samplerPgrp) || samplerPgrp <= 0) {
      throw new Error(`invalid pgrp ${samplerPgrp}`);
    }
  } catch (error) {
    console.error(`metrics unavailable: cannot resolve sampler process group: ${error.message}`);
    return 2;
  }

  const origin = process.hrtime.bigint();
  const interruptedSignalRef = { value: null };
  const processGroups = { samplerPgrp, resolvedPgids: new Set() };
  const runs = [];
  const signalHandlers = {};
  for (const signal of Object.keys(SIGNAL_NUMBERS)) {
    signalHandlers[signal] = () => {
      interruptedSignalRef.value = signal;
      reportSignalFailures(signal, runs.map((run) => run.pgid).filter(Number.isInteger));
    };
    process.on(signal, signalHandlers[signal]);
  }

  for (let index = 1; index <= runCount; index += 1) {
    runs.push(startRun(index, origin, interruptedSignalRef, processGroups));
  }
  const sampling = await monitorRuns(runs, runCount, origin);
  for (const [signal, handler] of Object.entries(signalHandlers)) process.off(signal, handler);

  const assessment = assessMeasurement({
    runCount,
    runs,
    sampling,
    interruptedSignal: interruptedSignalRef.value,
  });
  printReport({ runCount, runs, sampling, assessment });
  return assessment.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((exitCode) => { process.exitCode = exitCode; })
    .catch((error) => {
      console.error(`metrics unavailable: internal sampler failure: ${error.stack ?? error.message}`);
      process.exitCode = 2;
    });
}
