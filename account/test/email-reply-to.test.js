import { describe, expect, it } from 'vitest';
import {
  sendDeletionProofEmail,
  sendOtpEmail,
  sendRenewalNoticeEmail,
  sendVerifyEmail,
} from '../src/email.js';
import { makeTestEnv } from './helpers.js';

// services@ has no inbound route; the privacy policy says a reply to something we
// sent lands in the support mailbox. Every send path must carry that Reply-To.
describe('services email Reply-To', () => {
  it('sets replyTo support@solstone.app on all six send paths', async () => {
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
      expect(message.from).toBe('solstone services <services@solstone.app>');
      expect(message.replyTo).toBe('support@solstone.app');
    }
  });
});
