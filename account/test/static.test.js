// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const sourceFiles = readdirSync(srcDir)
  .filter((name) => name.endsWith('.js'))
  .sort();
const source = sourceFiles.map((name) => readFileSync(join(srcDir, name), 'utf8')).join('\n');

describe('static source checks', () => {
  it('scans every src/*.js file', () => {
    expect(sourceFiles).toEqual(['crypto.js', 'db.js', 'email.js', 'html.js', 'index.js']);
  });

  it('does not import @simplewebauthn/server', () => {
    expect(source).not.toContain('@simplewebauthn/server');
  });

  it('does not import jose', () => {
    expect(source).not.toContain('jose');
  });

  it('does not import from scouts', () => {
    expect(source).not.toMatch(/\.\.\/scouts|scouts\//);
  });

  it('does not use console.log or log PII-shaped values', () => {
    expect(source).not.toContain('console.log');
    expect(source).not.toMatch(/console\.(?:error|warn|info)\([^)]*(?:email|ip|nonce|session|hash)/i);
  });
});
