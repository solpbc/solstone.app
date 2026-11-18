import { htmlText, t } from '../../i18n/account.mjs';

// OTP transactional email via Cloudflare Email Workers send_email binding.
// FROM: support@solstone.app (display: "solstone services"), the one address an owner
// can also write to. No List-Unsubscribe. Every send carries Reply-To support@solstone.app,
// so a reply reaches the support mailbox, as the privacy policy says it does.
// The operator alert alone stays on services@ (no inbound route): support triage keys its
// never-dropped withdrawal rule on that sender, which mail from support@ to itself would lose.

import { CLOSE_TIMING_LINE } from './html.js';

const FROM_ADDRESS = 'support@solstone.app';
const ALERT_FROM_ADDRESS = 'services@solstone.app';
const FROM_NAME = t('account.services.solstoneservices');
const REPLY_TO = 'support@solstone.app';

export async function sendOtpEmail({ env, address, code }) {
  const formatted = `${code.slice(0, 3)} ${code.slice(3)}`;
  const subject = t('account.mail.yoursolpbcsignincode', { code: formatted });
  const text = `${t('account.mail.yoursolpbcsignincodeis')}

    ${formatted}

${t('account.mail.itexpiresin10minutes')}

${t('account.mail.ifyoudidntrequestthisyoucanignorethisemail')}`;
  const html = `<!DOCTYPE html>
<html><body style="font-family: system-ui, -apple-system, sans-serif; color: #222; max-width: 520px; margin: 0 auto; padding: 24px;">
  <p>${htmlText('account.mail.yoursolpbcsignincodeis')}</p>
  <pre style="font-family: ui-monospace, Menlo, monospace; font-size: 28px; font-weight: 700; color: #1A1A1A; background: #FBEFDD; padding: 16px 20px; border-radius: 8px; margin: 12px 0; letter-spacing: 4px; text-align: center;">${formatted}</pre>
  <p>${htmlText('account.mail.itexpiresin10minutes')}</p>
  <p>${htmlText('account.mail.ifyoudidntrequestthisyoucanignorethisemail')}</p>
</body></html>`;
  const response = await env.EMAIL.send({
    to: address,
    from: `${FROM_NAME} <${FROM_ADDRESS}>`,
    replyTo: REPLY_TO,
    subject,
    text,
    html,
  });
  return { sent: true, messageId: response?.messageId };
}

export async function sendDeletionProofEmail({ env, address, code, purpose, deadline = '' }) {
  const formatted = `${code.slice(0, 3)} ${code.slice(3)}`;
  if (purpose === 'export') {
    const subject = t('account.mail.confirmyourdownloadfromsolstoneservices', { code: formatted });
    const text = `${t('account.mail.yourequestedacopyofthedataheldwithyoursolstone')}

${t('account.mail.enterthiscodetocontinue')}

${formatted}

${t('account.mail.itexpiresin10minutes')}

${t('account.mail.ifyoudidnotrequestthisyoucanignorethisemail')}`;
    const html = `<!DOCTYPE html>
<html><body style="font-family: system-ui, -apple-system, sans-serif; color: #222; max-width: 520px; margin: 0 auto; padding: 24px;">
  <p>${htmlText('account.mail.yourequestedacopyofthedataheldwithyoursolstone')}</p>
  <p>${htmlText('account.mail.enterthiscodetocontinue')}</p>
  <pre style="font-family: ui-monospace, Menlo, monospace; font-size: 28px; font-weight: 700; color: #1A1A1A; background: #FBEFDD; padding: 16px 20px; border-radius: 8px; margin: 12px 0; letter-spacing: 4px; text-align: center;">${formatted}</pre>
  <p>${htmlText('account.mail.itexpiresin10minutes')}</p>
  <p>${htmlText('account.mail.ifyoudidnotrequestthisyoucanignorethisemail')}</p>
</body></html>`;
    const response = await env.EMAIL.send({
      to: address,
      from: `${FROM_NAME} <${FROM_ADDRESS}>`,
      replyTo: REPLY_TO,
      subject,
      text,
      html,
    });
    return { sent: true, messageId: response?.messageId };
  }
  if (purpose === 'credential-change') {
    const subject = t('account.mail.verifyachangetoyoursignin', { code: formatted });
    const text = `${t('account.mail.yourequestedachangetoyourpasskeysoremailaddres')}

${t('account.mail.enterthiscodetocontinue')}

${formatted}

${t('account.mail.itexpiresin10minutes')}

${t('account.mail.ifyoudidnotrequestthisyoucanignorethisemail')}`;
    const html = `<!DOCTYPE html>
<html><body style="font-family: system-ui, -apple-system, sans-serif; color: #222; max-width: 520px; margin: 0 auto; padding: 24px;">
  <p>${htmlText('account.mail.yourequestedachangetoyourpasskeysoremailaddres')}</p>
  <p>${htmlText('account.mail.enterthiscodetocontinue')}</p>
  <pre style="font-family: ui-monospace, Menlo, monospace; font-size: 28px; font-weight: 700; color: #1A1A1A; background: #FBEFDD; padding: 16px 20px; border-radius: 8px; margin: 12px 0; letter-spacing: 4px; text-align: center;">${formatted}</pre>
  <p>${htmlText('account.mail.itexpiresin10minutes')}</p>
  <p>${htmlText('account.mail.ifyoudidnotrequestthisyoucanignorethisemail')}</p>
</body></html>`;
    const response = await env.EMAIL.send({
      to: address,
      from: `${FROM_NAME} <${FROM_ADDRESS}>`,
      replyTo: REPLY_TO,
      subject,
      text,
      html,
    });
    return { sent: true, messageId: response?.messageId };
  }
  // The owner closes a sign-in and keeps it; "delete" is kept for what is gone for good.
  const keeping = purpose === 'cancel';
  const subject = t('account.mail.confirmyoursignin', { action: keeping ? t('account.mail.keeping') : t('account.mail.closing'), code: formatted });
  const lines = keeping
    ? [
        t('account.deletion.youaskedkeepyoursigninat'),
        t('account.mail.enterthiscodetocontinue'),
        formatted,
        t('account.mail.itexpiresin10minutes2', { deadlineNotice: deadline ? t('account.mail.yoursigninclosesatunlessyouconfirmbeforethen', { deadline }) : '' }),
        t('account.deletion.ifyoudidntaskforthis'),
      ]
    : [
        t('account.deletion.youaskedcloseyoursigninat'),
        t('account.mail.enterthiscodetocontinue'),
        formatted,
        t('account.deletion.itexpiresin10minutesafteryou'),
        CLOSE_TIMING_LINE,
        t('account.deletion.closingyoursignindoesnttouch'),
        t('account.deletion.ifyoudidntaskforthis'),
      ];
  const text = lines.join('\n\n');
  const html = `<!DOCTYPE html>
<html><body style="font-family: system-ui, -apple-system, sans-serif; color: #222; max-width: 520px; margin: 0 auto; padding: 24px;">
${lines.map((line) => (line === formatted
    ? `  <pre style="font-family: ui-monospace, Menlo, monospace; font-size: 28px; font-weight: 700; color: #1A1A1A; background: #FBEFDD; padding: 16px 20px; border-radius: 8px; margin: 12px 0; letter-spacing: 4px; text-align: center;">${formatted}</pre>`
    : `  <p>${line}</p>`)).join('\n')}
</body></html>`;
  const response = await env.EMAIL.send({
    to: address,
    from: `${FROM_NAME} <${FROM_ADDRESS}>`,
    replyTo: REPLY_TO,
    subject,
    text,
    html,
  });
  return { sent: true, messageId: response?.messageId };
}

export async function sendVerifyEmail({ env, address, code }) {
  const formatted = `${code.slice(0, 3)} ${code.slice(3)}`;
  const subject = t('account.mail.verifyyoursolpbcemail', { code: formatted });
  const text = `${t('account.mail.toverifythisemailaddressforyoursolpbcsigninent')}

    ${formatted}

${t('account.mail.itexpiresin10minutes')}

${t('account.mail.ifyoudidntrequestthisyoucanignorethisemail')}`;
  const html = `<!DOCTYPE html>
<html><body style="font-family: system-ui, -apple-system, sans-serif; color: #222; max-width: 520px; margin: 0 auto; padding: 24px;">
  <p>${htmlText('account.mail.toverifythisemailaddressforyoursolpbcsigninent')}</p>
  <pre style="font-family: ui-monospace, Menlo, monospace; font-size: 28px; font-weight: 700; color: #1A1A1A; background: #FBEFDD; padding: 16px 20px; border-radius: 8px; margin: 12px 0; letter-spacing: 4px; text-align: center;">${formatted}</pre>
  <p>${htmlText('account.mail.itexpiresin10minutes')}</p>
  <p>${htmlText('account.mail.ifyoudidntrequestthisyoucanignorethisemail')}</p>
</body></html>`;
  const response = await env.EMAIL.send({
    to: address,
    from: `${FROM_NAME} <${FROM_ADDRESS}>`,
    replyTo: REPLY_TO,
    subject,
    text,
    html,
  });
  return { sent: true, messageId: response?.messageId };
}

export async function sendRenewalNoticeEmail({ env, address, subject, text, html }) {
  const response = await env.EMAIL.send({
    to: address,
    from: `${FROM_NAME} <${FROM_ADDRESS}>`,
    replyTo: REPLY_TO,
    subject,
    text,
    html,
  });
  return { sent: true, messageId: response?.messageId };
}

export async function sendOperatorAlertEmail({ env, address, subject, text, html }) {
  const response = await env.EMAIL.send({
    to: address,
    from: `${FROM_NAME} <${ALERT_FROM_ADDRESS}>`,
    replyTo: REPLY_TO,
    subject,
    text,
    html,
  });
  return { sent: true, messageId: response?.messageId };
}
