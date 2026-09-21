import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const accountDir = dirname(dirname(fileURLToPath(import.meta.url)));
const testDir = join(accountDir, 'test');
const vitest = join(accountDir, 'node_modules', 'vitest', 'vitest.mjs');
const batchSize = 4;
const singletonFiles = new Set([join('test', 'settings-emails.test.js')]);

function discoverTests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return discoverTests(path);
    if (!entry.isFile() || !entry.name.endsWith('.test.js') || entry.name === 'static.test.js') return [];
    return [relative(accountDir, path)];
  });
}

const files = discoverTests(testDir)
  .sort();

if (files.length === 0) {
  console.error('worker test runner found no test files');
  process.exit(1);
}
for (const file of singletonFiles) {
  if (!files.includes(file)) {
    console.error(`worker test runner singleton is missing: ${file}`);
    process.exit(1);
  }
}

const batches = [];
let batch = [];
for (const file of files) {
  if (singletonFiles.has(file)) {
    if (batch.length > 0) batches.push(batch);
    batches.push([file]);
    batch = [];
    continue;
  }
  batch.push(file);
  if (batch.length === batchSize) {
    batches.push(batch);
    batch = [];
  }
}
if (batch.length > 0) batches.push(batch);

console.log(`worker test runner: ${files.length} files in ${batches.length} batches (max ${batchSize}; ${singletonFiles.size} singleton)`);

for (const [index, batch] of batches.entries()) {
  console.log(`worker test runner: batch ${index + 1}/${batches.length} (${batch.length} files)`);
  const result = spawnSync(process.execPath, [vitest, 'run', '--config', 'vitest.config.js', ...batch], {
    cwd: accountDir,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`worker test runner could not start batch ${index + 1}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    if (result.signal) console.error(`worker test runner batch ${index + 1} ended by ${result.signal}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`worker test runner: all ${files.length} files passed`);
