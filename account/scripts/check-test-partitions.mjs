#!/usr/bin/env node

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { testPartitions } from '../test/partitions.js';

const REQUIRED_PARTITIONS = Object.freeze(['worker', 'passkey', 'node']);
const DEFAULT_TEST_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../test');

export function validateTestPartitions({ discovered, partitions }) {
  const discoveredFiles = [...discovered].sort();
  const discoveredSet = new Set(discoveredFiles);
  const assignments = new Map();
  const invalidEntries = [];
  const unexpectedPartitions = Object.keys(partitions)
    .filter((name) => !REQUIRED_PARTITIONS.includes(name))
    .sort();

  for (const name of REQUIRED_PARTITIONS) {
    const files = partitions[name];
    if (!Array.isArray(files)) {
      invalidEntries.push({ partition: name, path: null, reason: 'partition must be an array' });
      continue;
    }
    for (const file of files) {
      if (!isTestPath(file)) {
        invalidEntries.push({ partition: name, path: file, reason: 'invalid test path' });
        continue;
      }
      const owners = assignments.get(file) ?? [];
      owners.push(name);
      assignments.set(file, owners);
    }
  }

  const missing = discoveredFiles.filter((file) => !assignments.has(file));
  const multiplyAssigned = [...assignments]
    .filter(([, owners]) => owners.length > 1)
    .map(([file, owners]) => ({ path: file, partitions: owners }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const unknown = [...assignments.keys()]
    .filter((file) => !discoveredSet.has(file))
    .sort();

  invalidEntries.sort((a, b) => `${a.partition}:${a.path}`.localeCompare(`${b.partition}:${b.path}`));
  return {
    ok: missing.length === 0
      && multiplyAssigned.length === 0
      && unknown.length === 0
      && invalidEntries.length === 0
      && unexpectedPartitions.length === 0,
    missing,
    multiplyAssigned,
    unknown,
    invalidEntries,
    unexpectedPartitions,
  };
}

export async function discoverTestFiles(root = DEFAULT_TEST_ROOT) {
  const files = [];
  await walk(root, root, files);
  return files.sort();
}

async function walk(root, directory, files) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(root, absolute, files);
    } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
      files.push(`test/${path.relative(root, absolute).split(path.sep).join('/')}`);
    }
  }
}

function isTestPath(file) {
  return typeof file === 'string'
    && file.startsWith('test/')
    && file.endsWith('.test.js')
    && !file.includes('\\')
    && path.posix.normalize(file) === file;
}

function printFailures(result) {
  for (const file of result.missing) console.error(`missing partition assignment: ${file}`);
  for (const item of result.multiplyAssigned) {
    console.error(`multiple partition assignments: ${item.path} (${item.partitions.join(', ')})`);
  }
  for (const file of result.unknown) console.error(`assigned file was not discovered: ${file}`);
  for (const item of result.invalidEntries) {
    console.error(`invalid partition entry: ${item.partition}: ${String(item.path)} (${item.reason})`);
  }
  for (const name of result.unexpectedPartitions) console.error(`unexpected partition: ${name}`);
}

async function main() {
  const discovered = await discoverTestFiles();
  const result = validateTestPartitions({ discovered, partitions: testPartitions });
  if (!result.ok) {
    printFailures(result);
    process.exitCode = 1;
    return;
  }
  console.log(
    `test partitions: ${discovered.length} files assigned exactly once `
    + `(worker=${testPartitions.worker.length}, passkey=${testPartitions.passkey.length}, node=${testPartitions.node.length})`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
