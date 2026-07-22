// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FONT_FILES, PORTAL_CSS } from '../src/assets.js';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const sourceFiles = listJsFiles(srcDir)
  .sort();
const sourceEntries = sourceFiles.map((name) => ({
  name,
  text: readFileSync(join(srcDir, name), 'utf8'),
}));
const source = sourceEntries.map((entry) => entry.text).join('\n');
const portalCss = readFileSync(join(srcDir, 'portal.css'), 'utf8');

describe('static source checks', () => {
  it('scans every src/*.js file', () => {
    expect(sourceFiles).toEqual([
      'admin.js',
      'assets.js',
      'billing.js',
      'crypto.js',
      'db.js',
      'devices.js',
      'dispatch-tokens.js',
      'email.js',
      'emails.js',
      'enable-constants.js',
      'enable.js',
      'gcp.js',
      'html.js',
      'hub.js',
      'index.js',
      'inline/passkey-enroll.js',
      'inline/passkey-landing.js',
      'passkey.js',
      'provisioning.js',
      'push.js',
      'r2-credential.js',
      'reach.js',
      'relay-grant.js',
      'retention.js',
      's3.js',
      'scout-migrate.js',
      'session.js',
      'settings.js',
      'spb-billing.js',
      'spb-broker.js',
      'spb-entitlement.js',
      'spb-sweep.js',
      'spp-entitlement.js',
      'stripe.js',
      'support-constants.js',
      'support.js',
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

  it('only imports jose from admin.js and r2-credential.js', () => {
    expect(sourceEntries
      .filter((entry) => entry.text.includes('jose'))
      .map((entry) => entry.name)).toEqual(['admin.js', 'r2-credential.js']);
  });

  it('does not import from scouts', () => {
    expect(source).not.toMatch(/\.\.\/scouts|scouts\//);
  });

  it('does not use debug logging or log PII-shaped values', () => {
    expect(source).not.toContain(['console', 'log'].join('.'));
    // Canonical PII enforcement lives in runtime console-spy assertions for retention, kill switches, and admin.
  });

  it('targets the real support service binding', () => {
    const toml = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'wrangler.toml'), 'utf8');

    expect(toml).toContain('service = "extro-support"');
    expect(toml).not.toContain(['support', 'worker'].join('-'));
  });

  it('keeps embedded portal css in sync with the source file', () => {
    expect(portalCss).toBe(PORTAL_CSS);
  });

  it('keeps every acknowledgement checkbox on the shared accessible control contract', () => {
    const srcText = `${source}\n${portalCss}`;
    const checkboxInputs = srcText.match(/<input\b[^>]*type="checkbox"[^>]*>/g) || [];
    const ackLabels = srcText.match(/<label class="ack">[\s\S]*?<\/label>/g) || [];
    const ackInputs = ackLabels.flatMap((label) => label.match(/<input\b[^>]*type="checkbox"[^>]*>/g) || []);

    expect(checkboxInputs.length).toBeGreaterThan(0);
    for (const input of checkboxInputs) {
      expect(input).toContain('name="data_ack" value="yes" required');
      expect(input).not.toMatch(/\bstyle\s*=/);
    }
    expect(ackInputs).toEqual(checkboxInputs);
    expect(srcText).not.toContain('width:auto;min-height:0;margin:0');

    const ackRule = portalCss.match(/(?:^|\n)\.ack\s*\{([^}]*)\}/)?.[1] || '';
    const checkboxRule = portalCss.match(/(?:^|\n)\.ack input\[type=checkbox\]\s*\{([^}]*)\}/)?.[1] || '';
    const focusRule = portalCss.match(/(?:^|\n)\.ack input\[type=checkbox\]:focus-visible\s*\{([^}]*)\}/)?.[1] || '';
    const px = (rule, property) => Number(rule.match(new RegExp(`${property}:\\s*(\\d+(?:\\.\\d+)?)px`))?.[1]);

    expect(px(ackRule, 'min-height')).toBeGreaterThanOrEqual(46);
    expect(px(checkboxRule, 'width')).toBeGreaterThanOrEqual(20);
    expect(px(checkboxRule, 'height')).toBeGreaterThanOrEqual(20);
    expect(checkboxRule).toContain('flex: none');
    expect(checkboxRule).toContain('accent-color: var(--orange)');
    expect(focusRule).toContain('outline: 2px solid var(--focus)');
  });

  it('keeps embedded font blobs in sync with source files', () => {
    for (const name of ['comfortaa-latin.woff2', 'inter-latin.woff2']) {
      expect(Buffer.from(FONT_FILES[name], 'base64')).toEqual(readFileSync(join(srcDir, 'fonts', name)));
    }
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
