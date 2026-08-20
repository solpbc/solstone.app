// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const supportSurfaces = [
  'public/download-macos.html',
  'public/download-journal.html',
  'public/download.html',
  'public/install.html',
  'public/install.md',
];

test('every macOS install surface states the Apple Silicon requirement', async () => {
  for (const path of supportSurfaces) {
    const content = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.match(content, /Apple Silicon/, path);
    assert.match(content, /Intel macs aren't supported/i, path);
  }
});
