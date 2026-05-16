// Page renderers with lean inline styles. No external font, no wordmark blob.
// Sol orange accent: #E8923A. Lowercase voice throughout.

const SOL_ORANGE = '#E8923A';

export function layout({ title, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      margin: 0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #222;
      background: #fff;
      line-height: 1.55;
    }
    main { width: min(100% - 32px, 560px); margin: 0 auto; padding: 56px 0; }
    h1, h2 { margin: 0 0 16px; line-height: 1.2; text-transform: lowercase; }
    h1 { font-size: 1.65rem; }
    h2 { font-size: 1.2rem; color: ${SOL_ORANGE}; }
    p { margin: 0 0 18px; color: #555; }
    a { color: ${SOL_ORANGE}; text-decoration: none; }
    a:hover { text-decoration: underline; }
    label { display: block; margin-bottom: 6px; color: #555; font-size: 0.92rem; }
    input {
      width: 100%;
      min-height: 44px;
      padding: 10px 12px;
      border: 1px solid #d8d8d8;
      border-radius: 6px;
      font: inherit;
      margin-bottom: 14px;
    }
    button {
      min-height: 44px;
      padding: 10px 16px;
      border: 0;
      border-radius: 6px;
      background: ${SOL_ORANGE};
      color: #fff;
      font: inherit;
      cursor: pointer;
    }
    button[disabled] { cursor: not-allowed; opacity: 0.55; }
    form { margin: 0; }
    .cf-turnstile { margin: 4px 0 18px; min-height: 65px; }
    .welcome { border: 1px solid #eee; border-radius: 8px; padding: 18px; margin-bottom: 24px; }
    .helper { color: #767676; margin-bottom: 14px; }
    .welcome button + button { margin-left: 8px; background: #eee; color: #333; }
  </style>
</head>
<body><main>${body}</main></body>
</html>`;
}

export function renderLanding(turnstileSiteKey) {
  return layout({
    title: 'sign in to your solstone account',
    body: `<h1>sign in to your solstone account</h1>
<form method="post" action="/signin/start">
  <label for="email">email</label>
  <input id="email" type="email" name="email" autocomplete="email webauthn" required placeholder="you@example.com" maxlength="254">
  <div class="cf-turnstile" data-sitekey="${escAttr(turnstileSiteKey)}"></div>
  <button type="submit">continue</button>
</form>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`,
  });
}

export function renderCheckInbox() {
  return layout({
    title: 'check your inbox',
    body: `<h1>check your inbox</h1>
<p>check your inbox. if there's an account for that address, a sign-in link is on its way.</p>`,
  });
}

export function renderInvalidLink() {
  return layout({
    title: 'that link did not work',
    body: `<h1>that link did not work</h1>
<p><a href="/">start over</a></p>`,
  });
}

export function renderDashboard({ welcome }) {
  const welcomePanel = welcome
    ? `<div class="welcome">
  <h2>add a passkey to this device?</h2>
  <p class="helper">coming in the next update</p>
  <button disabled>add a passkey</button>
  <button onclick="history.replaceState({}, '', '/dashboard'); this.closest('.welcome').remove();">not now</button>
</div>`
    : '';
  return layout({
    title: 'dashboard',
    body: `${welcomePanel}<h1>dashboard</h1>
<p>you're signed in.</p>
<form method="post" action="/signout"><button type="submit">sign out</button></form>`,
  });
}

export function renderGoodbye() {
  return layout({
    title: 'signed out',
    body: `<h1>signed out</h1>
<p>you're signed out. <a href="/">sign in again</a></p>`,
  });
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escAttr(value) {
  return esc(value).replace(/"/g, '&quot;');
}
