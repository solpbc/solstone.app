// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const sourceFiles = listJsFiles(srcDir)
  .sort();
const sourceEntries = sourceFiles.map((name) => ({
  name,
  text: readFileSync(join(srcDir, name), 'utf8'),
}));
const source = sourceEntries.map((entry) => entry.text).join('\n');

describe('static source checks', () => {
  it('scans every src/*.js file', () => {
    expect(sourceFiles).toEqual([
      'crypto.js',
      'db.js',
      'email.js',
      'html.js',
      'index.js',
      'inline/passkey-enroll.js',
      'inline/passkey-landing.js',
      'passkey.js',
      'session.js',
    ]);
  });

  it('only imports @simplewebauthn/server from passkey.js', () => {
    expect(sourceEntries
      .filter((entry) => entry.text.includes('@simplewebauthn/server'))
      .map((entry) => entry.name)).toEqual(['passkey.js']);
  });

  it('does not import @simplewebauthn/browser', () => {
    expect(source).not.toContain('@simplewebauthn/browser');
  });

  it('does not import jose', () => {
    expect(source).not.toContain('jose');
  });

  it('does not import from scouts', () => {
    expect(source).not.toMatch(/\.\.\/scouts|scouts\//);
  });

  it('does not use debug logging or log PII-shaped values', () => {
    expect(source).not.toContain(['console', 'log'].join('.'));
    expect(source).not.toMatch(/console\.(?:log|warn|error|info|debug)[^\n]*(?:email|credential|userHandle|aaguid|password|token|\bip\b|\bnonce\b|\bsession\b|\bhash\b|emailLower|email_lower|codeHash|idHash)/i);
  });
});

function listJsFiles(dir, root = dir) {
  const files = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, name.name);
    if (name.isDirectory()) {
      files.push(...listJsFiles(fullPath, root));
    } else if (name.name.endsWith('.js')) {
      files.push(relative(root, fullPath).replace(/\\/g, '/'));
    }
  }
  return files;
}
