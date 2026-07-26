import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SANDBOX_RUN_CONTRACT_JSON,
  SANDBOX_RUN_CONTRACT_MAX_BYTES,
} from '../src/sandbox-run-contract.js';

const accountDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const canonicalArtifactPath = resolve(accountDir, 'docs/sandbox-run-contract-v1.json');

export function generateContractBytes() {
  return Buffer.from(SANDBOX_RUN_CONTRACT_JSON, 'utf8');
}

export function assertContractSize(bytes, label) {
  const size = Buffer.byteLength(bytes);
  if (size >= SANDBOX_RUN_CONTRACT_MAX_BYTES) {
    throw new Error(
      `${label} is ${size} bytes; sandbox-run contract must be smaller than ${SANDBOX_RUN_CONTRACT_MAX_BYTES} bytes`
    );
  }
  return size;
}

export async function writeContract({ artifactPath = canonicalArtifactPath } = {}) {
  const generated = generateContractBytes();
  assertContractSize(generated, 'generated sandbox-run contract');
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, generated);
  return generated;
}

export async function checkContract({
  artifactPath = canonicalArtifactPath,
  generatedBytes = generateContractBytes(),
} = {}) {
  assertContractSize(generatedBytes, 'generated sandbox-run contract');
  let committed;
  try {
    committed = await readFile(artifactPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error('docs/sandbox-run-contract-v1.json is missing; run npm run generate:sandbox-run-contract');
    }
    throw error;
  }
  assertContractSize(committed, 'committed sandbox-run contract');
  if (!Buffer.from(generatedBytes).equals(committed)) {
    throw new Error(
      'docs/sandbox-run-contract-v1.json is stale; run npm run generate:sandbox-run-contract'
    );
  }
  return committed;
}

export async function runCli(args = process.argv.slice(2)) {
  if (args.length === 0) {
    await writeContract();
    return;
  }
  if (args.length === 1 && args[0] === '--check') {
    await checkContract();
    return;
  }
  throw new Error('usage: node scripts/generate-sandbox-run-contract.mjs [--check]');
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(`sandbox-run contract: ${error.message}`);
    process.exitCode = 1;
  });
}
