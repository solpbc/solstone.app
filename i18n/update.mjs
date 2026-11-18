import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const generated = join(root, 'generated');
const manifest = join(root, 'generated.sha256.json');

function files(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = prefix + entry.name;
    return entry.isDirectory() ? files(join(directory, entry.name), name + '/') : [name];
  });
}

function snapshot() {
  const names = ['compiler.json', ...files(join(root, 'catalog'), 'catalog/'), ...files(generated, 'generated/')];
  const hashes = names.sort().map((name) => [
    name,
    createHash('sha256').update(readFileSync(join(root, name))).digest('hex'),
  ]);
  return JSON.stringify(Object.fromEntries(hashes), null, 2) + '\n';
}

function regenerate() {
  const compiler = process.env.I18N_COMPILER;
  if (!compiler) throw new Error('Set I18N_COMPILER to the pinned i18n-catalog binary.');
  const pin = JSON.parse(readFileSync(join(root, 'compiler.json'), 'utf8'));
  const scratch = mkdtempSync(join(tmpdir(), 'account-catalog-'));
  const staging = mkdtempSync(join(root, '.generated-'));
  try {
    const output = join(scratch, 'output');
    const args = ['targets', join(root, 'catalog'), '--channel', pin.channel, '--out', output];
    for (const target of pin.targets) args.push('--target', target);
    execFileSync(compiler, args, { stdio: 'inherit' });
    const esm = join(output, 'esm');
    const locales = readdirSync(join(esm, pin.bundle)).filter((name) => name.endsWith('.ftl')).sort();
    const expected = pin.locales.map((locale) => locale + '.ftl').sort();
    if (JSON.stringify(locales) !== JSON.stringify(expected)) {
      throw new Error(`Unexpected generated locales for ${pin.bundle}: ${locales.join(', ')}`);
    }
    const next = join(staging, 'next');
    mkdirSync(next);
    cpSync(esm, join(next, 'esm'), {
      recursive: true,
      filter: (file) => !file.endsWith('.ftl'),
    });
    const previous = join(staging, 'previous');
    if (existsSync(generated)) renameSync(generated, previous);
    try {
      renameSync(next, generated);
    } catch (error) {
      if (existsSync(previous)) renameSync(previous, generated);
      throw error;
    }
    writeFileSync(manifest, snapshot());
  } finally {
    rmSync(staging, { recursive: true, force: true });
    rmSync(scratch, { recursive: true, force: true });
  }
}

switch (process.argv[2]) {
  case '--write':
    regenerate();
    break;
  case '--check':
    if (snapshot() !== readFileSync(manifest, 'utf8')) {
      throw new Error('The generated account catalog is stale. See i18n/README.md.');
    }
    break;
  default:
    throw new Error('Usage: node i18n/update.mjs --check | --write');
}
