import { describe, expect, it } from 'vitest';
import { renderDeletionCancelPage, renderDeletionPage, renderDeletionProofPage } from '../src/html.js';

const menu = { email: null, lastSignInAt: null, now: Date.now(), decryptOk: false };

describe('deletion form accessibility', () => {
  it('uses the shared request form structure', () => {
    const body = renderDeletionPage({ menu });
    expect(body).toContain('<h1>delete sign-in and your services</h1>');
    expect(body).toContain('aria-live="polite"');
    expect(body).toContain('action="/account/delete/proof/otp"');
  });

  it('renders step-up errors as an alert summary with labelled OTP controls', () => {
    const body = renderDeletionProofPage({ menu, purpose: 'delete', error: 'invalid code' });
    expect(body).toContain('role="alert"');
    expect(body).toContain('tabindex="-1"');
    expect(body).toContain('href="#deletion-otp-code"');
    expect(body).toContain('<label for="deletion-otp-code">6-digit code</label>');
    expect(body).toContain('aria-invalid="true"');
    expect(body).toContain('autocomplete="one-time-code"');
    expect(body).toContain('inputmode="numeric"');
    expect(body).toContain('data-deletion-passkey');
  });

  it('uses the same live-region form template for cancellation', () => {
    const body = renderDeletionCancelPage({ menu, phase: 'frozen' });
    expect(body).toContain('<h1>cancel deletion request</h1>');
    expect(body).toContain('aria-live="polite"');
    expect(body).toContain('action="/account/delete/proof/otp"');
  });
});
