// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

// Thin abstraction over CF Email Sending. Wrapping the binding lets us swap
// to SES / Resend / REST API in one file if the public-beta API moves.

import { EmailMessage } from 'cloudflare:email';
import { createMimeMessage } from 'mimetext';

const FROM_ADDRESS = 'scouts@solstone.app';
const FROM_NAME = 'solstone scouts';
const REPLY_TO = 'jer@solpbc.org';

export async function sendTransactionalEmail(env, { to, subject, text, html }) {
  if (env.EMAIL_PATH_DISABLED === 'true') {
    // Kill switch — silently no-op so callers can keep flat-time behavior.
    return { sent: false, reason: 'email_path_disabled' };
  }

  const msg = createMimeMessage();
  msg.setSender({ name: FROM_NAME, addr: FROM_ADDRESS });
  msg.setRecipient(to);
  msg.setSubject(subject);
  msg.setHeader('Reply-To', REPLY_TO);
  msg.addMessage({ contentType: 'text/plain', data: text });
  if (html) {
    msg.addMessage({ contentType: 'text/html', data: html });
  }

  const message = new EmailMessage(FROM_ADDRESS, to, msg.asRaw());
  await env.EMAIL.send(message);
  return { sent: true };
}

export function renderOtpEmail(code) {
  const subject = `⛺ your solstone scouts code: ${code.slice(0, 3)} ${code.slice(3)}`;
  const text = `your solstone scouts code is

      ${code.slice(0, 3)} ${code.slice(3)}

it expires in 10 minutes.

enter it at https://scouts.solstone.app/email/verify

didn't ask for this code? you can ignore this email — no
account was created. if you keep getting these, reply and
let us know.

⛺ scouts.solstone.app
sol pbc · https://solpbc.org
no analytics, no tracking, no third parties
`;
  const html = `<!DOCTYPE html>
<html><body style="font-family: system-ui, -apple-system, sans-serif; color: #2a2a2a; max-width: 480px; margin: 0 auto; padding: 24px;">
  <p style="margin: 0 0 8px 0;">your solstone scouts code is</p>
  <pre style="font-family: ui-monospace, Menlo, monospace; font-size: 28px; font-weight: 700; color: #E8923A; background: #FBF6F0; padding: 16px 20px; border-radius: 8px; margin: 12px 0; letter-spacing: 4px; text-align: center;">${code.slice(0, 3)} ${code.slice(3)}</pre>
  <p style="margin: 0 0 16px 0; color: #555;">it expires in 10 minutes.</p>
  <p style="margin: 0 0 24px 0;">enter it at <a href="https://scouts.solstone.app/email/verify" style="color: #E8923A;">scouts.solstone.app/email/verify</a></p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
  <p style="font-size: 13px; color: #767676; margin: 0 0 8px 0;">didn't ask for this code? you can ignore this email — no account was created. if you keep getting these, reply and let us know.</p>
  <p style="font-size: 12px; color: #999; margin: 24px 0 0 0;">⛺ scouts.solstone.app · sol pbc · <a href="https://solpbc.org" style="color: #999;">solpbc.org</a></p>
  <p style="font-size: 12px; color: #999; margin: 4px 0 0 0;">no analytics, no tracking, no third parties</p>
</body></html>`;
  return { subject, text, html };
}

export function renderApprovalEmail() {
  const subject = `⛺ you're in — solstone scouts`;
  const text = `your solstone scouts application is approved.

sign in to grab your gemini token and the install command:

  https://scouts.solstone.app

— jer & extro
sol pbc · https://solpbc.org
no analytics, no tracking, no third parties
`;
  const html = `<!DOCTYPE html>
<html><body style="font-family: system-ui, -apple-system, sans-serif; color: #2a2a2a; max-width: 480px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #E8923A; margin: 0 0 16px 0;">⛺ you're in</h2>
  <p style="margin: 0 0 16px 0;">your solstone scouts application is approved.</p>
  <p style="margin: 0 0 24px 0;">sign in to grab your gemini token and the install command:</p>
  <p style="margin: 0 0 24px 0;"><a href="https://scouts.solstone.app" style="display: inline-block; background: #E8923A; color: white; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 600;">scouts.solstone.app →</a></p>
  <p style="margin: 0 0 8px 0;">— jer & extro</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
  <p style="font-size: 12px; color: #999; margin: 0;">sol pbc · <a href="https://solpbc.org" style="color: #999;">solpbc.org</a> · no analytics, no tracking, no third parties</p>
</body></html>`;
  return { subject, text, html };
}
