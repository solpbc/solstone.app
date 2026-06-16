import { describe, expect, it } from 'vitest';
import { LANDING_JS } from '../src/inline/passkey-landing.js';

describe('inline passkey bundle size', () => {
  it('keeps landing passkey JavaScript under 10KB', () => {
    expect(new TextEncoder().encode(LANDING_JS).byteLength).toBeLessThanOrEqual(10240);
  });

  it('wires the landing form next/next_sig into the finish POST body', () => {
    // reads both hidden inputs from the sign-in form handle
    expect(LANDING_JS).toContain(`l.querySelector('input[name="next"]')`);
    expect(LANDING_JS).toContain(`l.querySelector('input[name="next_sig"]')`);
    // assigns them onto the finish request body, both-or-neither
    expect(LANDING_JS).toContain('r.next=n.value,r.next_sig=g.value');
    // the finish POST body is the built object, replacing the old hardcoded body
    expect(LANDING_JS).toContain('body:JSON.stringify(p(e))');
    expect(LANDING_JS).not.toContain('body:JSON.stringify({response:f(e)})');
  });
});
