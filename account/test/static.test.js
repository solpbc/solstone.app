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
      'billing-page.js',
      'billing.js',
      'credential-change.js',
      'crypto.js',
      'db.js',
      'deletion-contract.js',
      'deletion-coordinator.js',
      'deletion-readiness.js',
      'deletion-services.js',
      'deletion.js',
      'devices.js',
      'dispatch-tokens.js',
      'email.js',
      'emails.js',
      'enable-constants.js',
      'enable.js',
      'html.js',
      'hub.js',
      'index.js',
      'inline/passkey-enroll.js',
      'inline/passkey-landing.js',
      'inline/support-forms.js',
      'mcp-bridge.js',
      'owner-data-inventory.js',
      'owner-export-compose.js',
      'owner-export-local.js',
      'owner-export-path.js',
      'owner-export-relay.js',
      'owner-export-retained.js',
      'owner-export-support.js',
      'owner-export.js',
      'passkey.js',
      'push.js',
      'r2-credential.js',
      'reach.js',
      'relay-grant.js',
      'renewal-notices.js',
      'retention.js',
      's3.js',
      'session.js',
      'settings.js',
      'sme-billing.js',
      'sme-entitlement.js',
      'sme-service.js',
      'spb-billing.js',
      'spb-broker.js',
      'spb-entitlement.js',
      'spb-sweep.js',
      'spp-authorize.js',
      'spp-entitlement.js',
      'stripe.js',
      'subscription-created.js',
      'sunarc.js',
      'support-constants.js',
      'support-html.js',
      'support-wire.js',
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

  it('only imports jose from admin.js, mcp-bridge.js, and r2-credential.js', () => {
    expect(sourceEntries
      .filter((entry) => entry.text.includes('jose'))
      .map((entry) => entry.name)).toEqual(['admin.js', 'mcp-bridge.js', 'r2-credential.js']);
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

  it('keeps logging to the audit stream only: logpush on, observability and tail consumers off', () => {
    const toml = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'wrangler.toml'), 'utf8');

    expect(toml).toMatch(/^logpush = true$/m);
    expect(toml).toMatch(/^\[observability\]\nenabled = false$/m);
    expect(toml).not.toMatch(/^\s*(?:logpush\s*=\s*false|tail_consumers|\[\[tail_consumers\]\]|\[observability\.)/m);
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
      expect(input).toMatch(/name="(?:data_ack|confirmation)" value="(?:yes|remove_details)" required/);
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

  it('describes the close boundary without claiming every support record disappears', () => {
    expect(source).toContain('the support service permanently removes submitted request details');
    expect(source).toContain('working classification');
    expect(source).toContain('limited delivery and retry records remain');
    expect(source).not.toContain('support-side metadata');
    expect(source).toContain('closing removes that summary with the rest of the request details');
    expect(source).toContain('the narrow ownership and closure records needed to show it to me');
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

function stripColourComments(text) {
  const withoutBlocks = text.replace(/\/\*[\s\S]*?\*\//g, '');
  return withoutBlocks.replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function exemptRootCustomProps(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const idx = text.indexOf(':root', i);
    if (idx < 0) {
      out += text.slice(i);
      break;
    }
    const before = idx > 0 ? text[idx - 1] : '';
    if (/[\w-]/.test(before)) {
      out += text.slice(i, idx + 5);
      i = idx + 5;
      continue;
    }
    const open = text.indexOf('{', idx);
    if (open < 0 || text.slice(idx + 5, open).trim() !== '') {
      out += text.slice(i, idx + 5);
      i = idx + 5;
      continue;
    }
    let depth = 0;
    let j = open;
    for (; j < text.length; j += 1) {
      if (text[j] === '{') depth += 1;
      else if (text[j] === '}') {
        depth -= 1;
        if (depth === 0) {
          j += 1;
          break;
        }
      }
    }
    const block = text.slice(open, j);
    const stripped = block.replace(/(^|[{;}])(\s*)--[\w-]+\s*:[^;]*/g, '$1$2');
    out += text.slice(i, open) + stripped;
    i = j;
  }
  return out;
}

function allowMarkSvg(text) {
  return text.replace(/const MARK_SVG = '[\s\S]*?';/, (literal) => literal
    .replace('fill="#FFCC33"', 'fill=""')
    .replace('stroke="#E8913A"', 'stroke=""'));
}

function colourLiterals(text) {
  const prepared = allowMarkSvg(exemptRootCustomProps(stripColourComments(text)));
  const hits = [];
  const patterns = [
    /(?<![A-Za-z0-9])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g,
    /(?:rgba?|hsla?)\(\s*[0-9.]/gi,
    /(?<![\w-])(?:white|black)(?![\w-])/gi,
  ];
  for (const pattern of patterns) {
    for (const match of prepared.matchAll(pattern)) hits.push(match[0]);
  }
  return hits;
}

describe('portal colour literals', () => {
  const colourFiles = [
    join(srcDir, 'portal.css'),
    join(srcDir, 'assets.js'),
    join(srcDir, 'html.js'),
    join(srcDir, 'support-html.js'),
    ...readdirSync(join(srcDir, 'inline'))
      .filter((name) => name.endsWith('.js'))
      .map((name) => join(srcDir, 'inline', name)),
  ];

  it('finds none in the portal content files', () => {
    const hits = colourFiles.flatMap((file) => colourLiterals(readFileSync(file, 'utf8')).map((hit) => `${relative(srcDir, file)}: ${hit}`));
    expect(hits).toEqual([]);
  });

  it('flags literals in strings and passes the exemptions', () => {
    expect(colourLiterals('const s = "color:#A15F17";')).not.toEqual([]);
    expect(colourLiterals('const svg = \'<svg stroke="#B06A1A"></svg>\';')).not.toEqual([]);
    expect(colourLiterals(':root { --x: #A15F17; }')).toEqual([]);
    expect(colourLiterals(':root { --a: #111111; --b: rgb(1, 2, 3); }')).toEqual([]);
    expect(colourLiterals('white-space:nowrap')).toEqual([]);
    expect(colourLiterals('white-space:pre-wrap')).toEqual([]);
    expect(colourLiterals('see https://example.com for docs')).toEqual([]);
    expect(colourLiterals('style="--x:#A15F17;color:var(--x)"')).not.toEqual([]);
  });
});
