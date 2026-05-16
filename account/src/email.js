// OTP transactional email via Cloudflare Email Workers send_email binding.
// FROM: account@solstone.app (display: "solstone account"). No Reply-To, no List-Unsubscribe.

const FROM_ADDRESS = 'account@solstone.app';
const FROM_NAME = 'solstone account';

export async function sendOtpEmail({ env, address, code }) {
  const formatted = `${code.slice(0, 3)} ${code.slice(3)}`;
  const subject = `your sol pbc sign-in code: ${formatted}`;
  const text = `your sol pbc sign-in code is

    ${formatted}

it expires in 10 minutes.

if you didn't request this, you can ignore this email.`;
  const html = `<!DOCTYPE html>
<html><body style="font-family: system-ui, -apple-system, sans-serif; color: #222; max-width: 520px; margin: 0 auto; padding: 24px;">
  <p>your sol pbc sign-in code is</p>
  <pre style="font-family: ui-monospace, Menlo, monospace; font-size: 28px; font-weight: 700; color: #E8923A; background: #FBF6F0; padding: 16px 20px; border-radius: 8px; margin: 12px 0; letter-spacing: 4px; text-align: center;">${formatted}</pre>
  <p>it expires in 10 minutes.</p>
  <p>if you didn't request this, you can ignore this email.</p>
</body></html>`;
  const response = await env.EMAIL.send({
    to: address,
    from: `${FROM_NAME} <${FROM_ADDRESS}>`,
    subject,
    text,
    html,
  });
  return { sent: true, messageId: response?.messageId };
}
