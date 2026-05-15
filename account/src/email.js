// Magic-link transactional email via Cloudflare Email Workers send_email binding.
// FROM: account@solstone.app (display: "solstone account"). No Reply-To, no List-Unsubscribe.

const FROM_ADDRESS = 'account@solstone.app';
const FROM_NAME = 'solstone account';
const SUBJECT = 'your sol pbc sign-in link';

export async function sendMagicLinkEmail(env, address, link) {
  const text = `click the link below to sign in to your solstone account.\n\n${link}\n\nif you didn't request this, you can ignore this email.`;
  const html = `<!DOCTYPE html>
<html><body style="font-family: system-ui, -apple-system, sans-serif; color: #222; max-width: 520px; margin: 0 auto; padding: 24px;">
  <p>click the link below to sign in to your solstone account.</p>
  <p><a href="${escapeAttr(link)}" style="color: #E8923A;">${escapeHtml(link)}</a></p>
  <p>if you didn't request this, you can ignore this email.</p>
</body></html>`;
  const response = await env.EMAIL.send({
    to: address,
    from: `${FROM_NAME} <${FROM_ADDRESS}>`,
    subject: SUBJECT,
    text,
    html,
  });
  return { sent: true, messageId: response?.messageId };
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}
