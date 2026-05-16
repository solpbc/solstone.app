import { describe, expect, it } from 'vitest';
import { LANDING_JS } from '../src/inline/passkey-landing.js';

describe('inline passkey bundle size', () => {
  it('keeps landing passkey JavaScript under 10KB', () => {
    expect(new TextEncoder().encode(LANDING_JS).byteLength).toBeLessThanOrEqual(10240);
  });
});
