import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll, OUT } from './gen-dayground.mjs';
import { websiteTemplate } from '../i18n/website.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const pages = join(root, 'i18n/pages');
const check = process.argv.includes('--check');

function* templates(directory) {
  for (const entry of readdirSync(join(pages, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* templates(path);
    else yield path;
  }
}

const stale = [];
function emit(path, output) {
  const target = join(root, path);
  let current;
  try {
    current = readFileSync(target, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (current === output) return;
  stale.push(path);
  if (check) return;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, output);
}

for (const path of templates('')) {
  if (join('public', path) === OUT.page) continue;
  emit(join('public', path), websiteTemplate(readFileSync(join(pages, path), 'utf8')));
}
for (const [path, output] of Object.entries(await buildAll())) {
  emit(path, output);
}

if (check && stale.length) {
  throw new Error(`Stale website output: ${stale.join(', ')}. Run make render.`);
}
console.log(check ? 'Website output is current.' : `Rendered ${stale.length} changed website files.`);
