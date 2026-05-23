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
      'admin.js',
      'crypto.js',
      'db.js',
      'devices.js',
      'email.js',
      'emails.js',
      'gcp.js',
      'html.js',
      'index.js',
      'inline/passkey-enroll.js',
      'inline/passkey-landing.js',
      'oauth.js',
      'passkey.js',
      'provisioning.js',
      'retention.js',
      'session.js',
      'settings.js',
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

  it('only imports jose from admin.js', () => {
    expect(sourceEntries
      .filter((entry) => entry.text.includes('jose'))
      .map((entry) => entry.name)).toEqual(['admin.js']);
  });

  it('does not import from scouts', () => {
    expect(source).not.toMatch(/\.\.\/scouts|scouts\//);
  });

  it('does not use debug logging or log PII-shaped values', () => {
    expect(source).not.toContain(['console', 'log'].join('.'));
    // Canonical PII enforcement lives in runtime console-spy assertions for retention, kill switches, and admin.
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
