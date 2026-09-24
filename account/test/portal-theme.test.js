import { describe, expect, it } from 'vitest';
import { PORTAL_CSS } from '../src/assets.js';
import { parseColor, srgbToLinear } from '../src/sunarc.js';

const CONSTANTS = new Set(['--gold', '--orange', '--ink-on-brand', '--success', '--warn']);

function isConstant(name) {
  return CONSTANTS.has(name) || name.startsWith('--sunarc-');
}

function isColorValue(value) {
  const trimmed = value.trim();
  return /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed)
    || /^(?:rgb|rgba|hsl|hsla)\(/i.test(trimmed)
    || /^(?:white|black)$/i.test(trimmed);
}

function braceBlock(css, start) {
  const open = css.indexOf('{', start);
  if (open < 0) throw new Error('missing block');
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return { body: css.slice(open + 1, i), end: i + 1 };
    }
  }
  throw new Error('unbalanced block');
}

function rootBlocks(css) {
  const blocks = [];
  let i = 0;
  while (i < css.length) {
    const idx = css.indexOf(':root', i);
    if (idx < 0) break;
    const before = idx > 0 ? css[idx - 1] : '';
    if (/[\w-]/.test(before)) {
      i = idx + 5;
      continue;
    }
    const open = css.indexOf('{', idx);
    if (open < 0 || css.slice(idx + 5, open).trim() !== '') {
      i = idx + 5;
      continue;
    }
    const block = braceBlock(css, idx);
    blocks.push(block.body);
    i = block.end;
  }
  return blocks;
}

function declarations(block) {
  const body = block.replace(/\/\*[\s\S]*?\*\//g, '');
  const map = {};
  for (const part of body.split(';')) {
    const match = part.match(/(--[\w-]+)\s*:\s*([\s\S]+)$/);
    if (match) map[match[1]] = match[2].trim();
  }
  return map;
}

function themeMaps(css) {
  const blocks = rootBlocks(css);
  if (blocks.length < 2) throw new Error(`expected light and dark :root, found ${blocks.length}`);
  return { light: declarations(blocks[0]), dark: declarations(blocks[1]) };
}

// A token in the dark block wins. A constant with no dark line stays at its light value.
// A name in neither set throws. This never returns ''.
function readTheme(css, name, appearance) {
  const { light, dark } = themeMaps(css);
  const inLight = Object.prototype.hasOwnProperty.call(light, name);
  const inDark = Object.prototype.hasOwnProperty.call(dark, name);
  if (!inLight && !inDark) throw new Error(`unknown token ${name}`);
  const value = appearance === 'dark' && inDark ? dark[name] : light[name];
  if (!inLight && appearance !== 'dark') throw new Error(`missing light token ${name}`);
  if (value == null || value === '') throw new Error(`empty token ${name}`);
  return value;
}

function completenessErrors(css) {
  const { light, dark } = themeMaps(css);
  const errors = [];
  for (const [name, value] of Object.entries(light)) {
    if (!isColorValue(value)) continue;
    const inDark = Object.prototype.hasOwnProperty.call(dark, name);
    if (isConstant(name)) {
      if (inDark) errors.push(`${name} is constant and must stay out of the dark block`);
    } else if (!inDark) {
      errors.push(`${name} is colour-valued and has no dark override`);
    }
  }
  for (const name of Object.keys(dark)) {
    if (!Object.prototype.hasOwnProperty.call(light, name)) errors.push(`${name} is declared only in the dark block`);
  }
  return errors;
}

function contrastRatio(foreground, background) {
  const lum = (hex) => {
    const rgb = parseColor(hex);
    if (!rgb) throw new Error(`unparsed colour ${hex}`);
    return 0.2126 * srgbToLinear(rgb[0]) + 0.7152 * srgbToLinear(rgb[1]) + 0.0722 * srgbToLinear(rgb[2]);
  };
  const lighter = Math.max(lum(foreground), lum(background));
  const darker = Math.min(lum(foreground), lum(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function declarationValue(body, property) {
  const match = body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i'));
  return match ? match[1].trim() : null;
}

function automaticPairs(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const pairs = [];
  const stack = [];
  let preludeStart = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '{') {
      stack.push({ prelude: text.slice(preludeStart, i).trim(), start: i + 1 });
      preludeStart = i + 1;
    } else if (text[i] === '}') {
      const frame = stack.pop();
      const body = text.slice(frame.start, i);
      const prelude = frame.prelude;
      if (prelude && !prelude.startsWith('@') && prelude !== ':root' && !body.includes('{')) {
        const color = declarationValue(body, 'color');
        const background = declarationValue(body, 'background');
        const colorToken = color && color.match(/^var\((--[\w-]+)\)$/);
        const backgroundToken = background && background.match(/^var\((--[\w-]+)\)$/);
        if (colorToken && backgroundToken && background !== 'none' && background !== 'transparent') {
          pairs.push({ selector: prelude, fg: colorToken[1], bg: backgroundToken[1] });
        }
      }
      preludeStart = i + 1;
    }
  }
  return pairs;
}

function contrastRows(css) {
  const rows = [];
  const text = [
    ['--ink', '--paper'], ['--ink', '--cream-bright'], ['--ink', '--cream'],
    ['--ink-soft', '--paper'], ['--ink-soft', '--cream-bright'], ['--ink-soft', '--cream'],
    ['--ink-faint', '--paper'], ['--ink-faint', '--cream-bright'], ['--ink-faint', '--cream'],
    ['--orange-text-aa', '--paper'], ['--orange-text-aa', '--cream-bright'], ['--orange-text-aa', '--cream'],
    ['--danger', '--paper'], ['--danger', '--danger-wash'],
    ['--tag-builtin-ink', '--orange-wash'],
    ['--tag-free-ink', '--tag-free-bg'],
    ['--ink-faint', '--tag-neutral-bg'],
    ['--ink-soft', '--orange-wash'],
    ['--ink-on-brand', '--orange'], ['--ink-on-brand', '--gold'], ['--ink-on-brand', '--orange-hover'],
    ['--ink', '--hover-fill'], ['--ink', '--row-hover'],
    ['--error-ink', '--danger-wash'],
  ];
  for (const appearance of ['light', 'dark']) {
    for (const [fg, bg] of text) rows.push({ fg, bg, floor: 4.5, appearance, selector: 'manual' });
    rows.push({ fg: '--orange-ink', bg: '--paper', floor: 3, appearance, selector: 'check-svg' });
    rows.push({ fg: '--focus', bg: '--paper', floor: 3, appearance, selector: 'focus' });
    rows.push({ fg: '--focus', bg: '--cream-bright', floor: 3, appearance, selector: 'focus' });
    for (const pair of automaticPairs(css)) {
      rows.push({ fg: pair.fg, bg: pair.bg, floor: 4.5, appearance, selector: pair.selector });
    }
  }
  return rows;
}

function contrastFailures(css) {
  const failures = [];
  for (const row of contrastRows(css)) {
    const foreground = readTheme(css, row.fg, row.appearance);
    const background = readTheme(css, row.bg, row.appearance);
    const ratio = contrastRatio(foreground, background);
    if (!(ratio >= row.floor)) {
      failures.push({ ...row, foreground, background, ratio });
    }
  }
  return failures;
}

describe('portal theme', () => {
  it('resolves dark overrides, keeps constants on their light value, and throws for an unknown name', () => {
    expect(readTheme(PORTAL_CSS, '--ink', 'dark')).not.toBe(readTheme(PORTAL_CSS, '--ink', 'light'));
    expect(readTheme(PORTAL_CSS, '--ink', 'dark')).not.toBe('');
    expect(readTheme(PORTAL_CSS, '--orange', 'dark')).toBe(readTheme(PORTAL_CSS, '--orange', 'light'));
    expect(readTheme(PORTAL_CSS, '--sunarc-ground-light-day', 'light')).toBe('#FCF3E4');
    expect(readTheme(PORTAL_CSS, '--sunarc-ground-light-day', 'dark')).toBe('#FCF3E4');
    expect(() => readTheme(PORTAL_CSS, '--not-a-token', 'dark')).toThrow(/unknown token/);
    expect(() => readTheme(PORTAL_CSS, '--not-a-token', 'light')).toThrow(/unknown token/);
  });

  it('gives every colour-valued usage token a dark line, and no dark-only token', () => {
    expect(completenessErrors(PORTAL_CSS)).toEqual([]);
    const dropped = PORTAL_CSS.replace('--error-ink: #DFAB9D;', '/* dropped error ink */');
    expect(completenessErrors(dropped).join('\n')).toContain('--error-ink');
    const darkOnly = PORTAL_CSS.replace(
      '@media (prefers-color-scheme: dark) {\n  :root {',
      '@media (prefers-color-scheme: dark) {\n  :root {\n    --not-in-light: #FFFFFF;',
    );
    expect(completenessErrors(darkOnly).join('\n')).toContain('--not-in-light');
  });

  it('clears the text and non-text floors in both appearances', () => {
    expect(contrastFailures(PORTAL_CSS)).toEqual([]);
    const pairs = automaticPairs(PORTAL_CSS);
    expect(pairs.some((pair) => pair.fg === '--ink-on-brand' && pair.bg === '--orange')).toBe(true);
    expect(pairs.some((pair) => pair.selector.includes('.grant .n') && pair.fg === '--tag-builtin-ink')).toBe(true);
    expect(pairs.some((pair) => pair.fg === '--error-ink' && pair.bg === '--danger-wash')).toBe(true);
  });

  it('fails a text pair whose foreground is under 4.5, with no epsilon', () => {
    expect(contrastRatio('#A15F17', '#FBEFDD') >= 4.5).toBe(false);
    const mutated = PORTAL_CSS.replace('--tag-builtin-ink: #8A5314;', '--tag-builtin-ink: #A15F17;');
    expect(mutated).not.toBe(PORTAL_CSS);
    const failures = contrastFailures(mutated);
    expect(failures.length).toBeGreaterThan(0);
    expect(failures.some((failure) => failure.fg === '--tag-builtin-ink' && failure.bg === '--orange-wash' && failure.appearance === 'light')).toBe(true);
  });
});
