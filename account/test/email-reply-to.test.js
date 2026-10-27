import { describe, expect, it } from 'vitest';
import {
  sendDeletionProofEmail,
  sendOperatorAlertEmail,
  sendOtpEmail,
  sendRenewalNoticeEmail,
  sendVerifyEmail,
} from '../src/email.js';
import { makeTestEnv } from './helpers.js';

// Owner mail comes from support@, the address an owner can write to, and the privacy
// policy says a reply to something we sent lands in the support mailbox, so every send
// path carries that Reply-To. The operator alert alone stays on services@, the sender
// support triage's never-dropped withdrawal rule is keyed on.
describe('services email sender and Reply-To', () => {
  it('sends owner mail from support@solstone.app with replyTo support@solstone.app', async () => {
    const env = makeTestEnv();
    const address = 'owner@example.com';
    await sendOtpEmail({ env, address, code: '123456' });
    await sendVerifyEmail({ env, address, code: '123456' });
    for (const purpose of ['export', 'credential-change', 'delete', 'cancel']) {
      await sendDeletionProofEmail({ env, address, code: '123456', purpose });
    }
    await sendRenewalNoticeEmail({ env, address, subject: 'renewal', text: 'text', html: '<p>html</p>' });

    expect(env.EMAIL.sent).toHaveLength(7);
    for (const message of env.EMAIL.sent) {
      expect(message.from).toBe('solstone services <support@solstone.app>');
      expect(message.replyTo).toBe('support@solstone.app');
    }
  });

  it('sends the operator alert from services@solstone.app', async () => {
    const env = makeTestEnv();
    await sendOperatorAlertEmail({ env, address: 'support@solstone.app', subject: 'alert', text: 'text', html: '<pre>text</pre>' });

    expect(env.EMAIL.sent).toHaveLength(1);
    expect(env.EMAIL.sent[0].from).toBe('solstone services <services@solstone.app>');
    expect(env.EMAIL.sent[0].replyTo).toBe('support@solstone.app');
  });
});
