// OTP transactional email via Cloudflare Email Workers send_email binding.
// FROM: services@solstone.app (display: "solstone services"). No Reply-To, no List-Unsubscribe.

const FROM_ADDRESS = 'services@solstone.app';
const FROM_NAME = 'solstone services';

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

export async function sendVerifyEmail({ env, address, code }) {
  const formatted = `${code.slice(0, 3)} ${code.slice(3)}`;
  const subject = `verify your sol pbc email: ${formatted}`;
  const text = `to verify this email address for your sol pbc sign-in, enter this code:

    ${formatted}

it expires in 10 minutes.

if you didn't request this, you can ignore this email.`;
  const html = `<!DOCTYPE html>
<html><body style="font-family: system-ui, -apple-system, sans-serif; color: #222; max-width: 520px; margin: 0 auto; padding: 24px;">
  <p>to verify this email address for your sol pbc sign-in, enter this code:</p>
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
