// Page renderers with lean inline styles. No external font, no wordmark blob.
// Sol orange accent: #E8923A. Lowercase voice throughout.

import { ENROLL_JS } from './inline/passkey-enroll.js';
import { LANDING_JS } from './inline/passkey-landing.js';

const SOL_ORANGE = '#E8923A';
export const VERIFY_ERROR = "that code didn't work. try again or request a new one.";
const SUPPORT_STATUS_LABELS = {
  open: 'open',
  'in-progress': 'in progress',
  waiting: 'waiting on you',
  proposed: 'waiting on you',
  resolved: 'resolved',
};
const SUPPORT_AUTHOR_LABELS = {
  human: 'you',
  operator: 'sol pbc support',
  agent: 'your solstone keeper',
  anonymous: 'you (via the form)',
};

export function layout({ title, body, afterMain = '' }) {
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
    main { max-width: 560px; margin: 0 16px; padding: 56px 0; }
    @media (min-width: 592px) { main { margin: 0 auto; } }
    h1, h2 { margin: 0 0 16px; line-height: 1.2; text-transform: lowercase; }
    h1 { font-size: 1.65rem; }
    h2 { font-size: 1.2rem; color: ${SOL_ORANGE}; }
    .brand { color: ${SOL_ORANGE}; font-size: 2rem; margin-bottom: 6px; }
    .subhead { color: #444; margin-bottom: 24px; }
    p { margin: 0 0 18px; color: #555; }
    a { color: ${SOL_ORANGE}; text-decoration: none; }
    a:hover { text-decoration: underline; }
    label { display: block; margin-bottom: 6px; color: #555; font-size: 0.92rem; }
    input, textarea, select {
      width: 100%;
      min-height: 44px;
      padding: 10px 12px;
      border: 1px solid #d8d8d8;
      border-radius: 6px;
      font: inherit;
      margin-bottom: 14px;
    }
    textarea { min-height: 140px; resize: vertical; }
    input.code {
      font-family: ui-monospace, Menlo, monospace;
      font-size: 1.35rem;
      letter-spacing: 4px;
      text-align: center;
    }
    input.code:focus { border-color: ${SOL_ORANGE}; outline: 2px solid #FBF6F0; }
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
    .error { color: #9f2d2d; margin-bottom: 14px; }
    .notice { border-left: 3px solid ${SOL_ORANGE}; padding-left: 10px; color: #555; }
    .disclosure { margin-top: 24px; color: #767676; font-size: 0.9rem; }
    .welcome button + button { margin-left: 8px; background: #eee; color: #333; }
    .settings-nav { display: flex; gap: 10px; flex-wrap: wrap; margin: 0 0 20px; }
    .settings-card, .settings-row { border: 1px solid #eee; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
    .settings-card { display: block; color: #222; }
    .settings-card > a { color: inherit; display: block; }
    .settings-card > a:hover { text-decoration: none; }
    .settings-card:hover { text-decoration: none; border-color: ${SOL_ORANGE}; }
    .settings-card strong { display: block; margin-bottom: 4px; }
    .meta { color: #767676; font-size: 0.92rem; margin-bottom: 8px; }
    .sticker { display: inline-block; color: ${SOL_ORANGE}; font-size: 0.82rem; margin-left: 8px; }
    .inline-form { margin-top: 10px; }
    .inline-form input { margin-bottom: 8px; }
    .danger { background: #9f2d2d; }
  </style>
</head>
<body><main>${body}</main>${afterMain}</body>
</html>`;
}

export function renderLanding(turnstileSiteKey, csrf, resume = {}, subhead = 'sign in to manage your services.') {
  const resumeHtml = resume.next && resume.nextSig
    ? `<input type="hidden" name="next" value="${escAttr(resume.next)}">
  <input type="hidden" name="next_sig" value="${escAttr(resume.nextSig)}">`
    : '';
  return layout({
    title: 'sign in to manage your services',
    body: `<h1 class="brand">solstone</h1>
	<p class="subhead">${esc(subhead)}</p>
	<div id="passkey-error" class="error" hidden></div>
	<form method="post" action="/signin/start">
	  <input type="hidden" name="csrf" value="${escAttr(csrf)}">
	  ${resumeHtml}
	  <label for="email">email</label>
  <input id="email" type="email" name="email" autocomplete="email webauthn" required placeholder="you@example.com" maxlength="254">
  <div class="cf-turnstile" data-sitekey="${escAttr(turnstileSiteKey)}"></div>
  <button type="submit">continue</button>
</form>
<p class="disclosure">no analytics, no tracking, no third parties.</p>`,
    afterMain: `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<script>${LANDING_JS}</script>`,
  });
}

export function renderVerify({ email = '', emailInputValue = '', error = '', csrf = '', next = '', nextSig = '' }) {
  const escapedEmail = esc(email);
  const errorHtml = error ? `<p class="error">${esc(error)}</p>` : '';
  const resumeHtml = next && nextSig
    ? `<input type="hidden" name="next" value="${escAttr(next)}">
  <input type="hidden" name="next_sig" value="${escAttr(nextSig)}">`
    : '';
  const emailFieldHtml = email
    ? `<input type="hidden" name="email" value="${escAttr(email)}">`
    : `<input type="email" name="email" value="${escAttr(emailInputValue)}" required autocomplete="email" placeholder="you@example.com" maxlength="254">`;
  const subhead = email
    ? `code sent to <strong>${escapedEmail}</strong>. expires 10 minutes after we sent it.`
    : 'enter your email and the 6-digit code we sent you.';
  return layout({
    title: 'verify your code',
    body: `<h1>verify your code</h1>
<p>${subhead}</p>
${errorHtml}
	<form method="post" action="/signin/verify">
	  <input type="hidden" name="csrf" value="${escAttr(csrf)}">
	  ${resumeHtml}
	  ${emailFieldHtml}
  <input class="code" name="code" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" autofocus required maxlength="6" oninput="this.value=this.value.replace(/\\D/g,'').slice(0,6)">
  <button type="submit">verify</button>
</form>`,
  });
}

export function renderError() {
  return layout({
    title: 'something went wrong',
    body: `<h1>something went wrong</h1>
<p><a href="/">start over</a></p>`,
  });
}

export function renderEnableScoutEntry({ csrf, code = '', error = '' }) {
  const errorHtml = error ? `<p class="error">${esc(error)}</p>` : '';
  return layout({
    title: 'enable solstone scout',
    body: `<h1>got a code from your terminal?</h1>
<p>enter it below to enable solstone scout on that machine.</p>
${errorHtml}
<form method="post" action="/enable/scout">
  <input type="hidden" name="csrf" value="${escAttr(csrf)}">
  <label for="code">code</label>
  <input id="code" class="code" name="code" value="${escAttr(code)}" autocomplete="one-time-code" inputmode="text" maxlength="15" required>
  <button type="submit">continue</button>
</form>`,
  });
}

export function renderEnableScoutConsent({ csrf, nonce = '', code = '', accountId = '' }) {
  const hidden = nonce
    ? `<input type="hidden" name="nonce" value="${escAttr(nonce)}">`
    : `<input type="hidden" name="code" value="${escAttr(code)}">`;
  return layout({
    title: 'enable solstone scout',
    body: `<pre class="welcome" style="white-space:pre-wrap;font:inherit">solstone on this device wants to enable solstone scout for you.

two things, and only these two:

  1 — know it's you
      so your sign-in recognizes this device. nothing from your
      journal comes with it — no observations, nothing sol has
      experienced alongside you. just: this is your machine.

  2 — enable solstone scout
      sol pbc creates a Google Gemini key on your behalf and hands
      it to this machine. the key is yours and it stays here. sol
      pbc sets it up — it never sits between you and Gemini, and
      never sees what you ask sol.

         [ allow ]            [ cancel ]

you can see exactly what you enabled — and turn either off — in
your services anytime.</pre>
<form method="post" action="/enable/scout/confirm">
  <input type="hidden" name="csrf" value="${escAttr(csrf)}">
  <input type="hidden" name="account_id" value="${escAttr(accountId)}">
  ${hidden}
  <button type="submit" name="action" value="allow">allow</button>
  <button type="submit" name="action" value="cancel">cancel</button>
</form>`,
  });
}

export function renderEnableScoutDone() {
  return layout({
    title: 'enabled',
    body: `<h1>enabled</h1>
<p>you've enabled solstone scout. you can close this tab.</p>`,
  });
}

export function renderEnableScoutError({ message }) {
  return layout({
    title: 'could not enable solstone scout',
    body: `<h1>could not enable solstone scout</h1>
<p>${esc(message || 'that request could not be completed.')}</p>
<p><a href="/enable/scout">try again</a></p>`,
  });
}

export function renderEnablePushConsent({ csrf, nonce, deviceToken, platform, bundleId }) {
  return layout({
    title: 'enable solstone push',
    body: `<pre class="welcome" style="white-space:pre-wrap;font:inherit">solstone push wants to reach this device for you.

two things, and only these two:

  1 — know it's you
      so your sign-in recognizes this device. nothing from your
      journal comes with it — no observations, nothing sol has
      experienced alongside you. just: this is your phone.

  2 — enable solstone push
      sol will send a short heads-up (an 80-character summary,
      never the full thing) to this device when there's something
      worth your attention. you can turn it off in your services
      anytime.

         [ allow ]            [ cancel ]

you can see exactly which devices solstone push reaches — and turn
it off — in your services anytime.</pre>
<form method="post" action="/enable/push/confirm">
  <input type="hidden" name="csrf" value="${escAttr(csrf)}">
  <input type="hidden" name="nonce" value="${escAttr(nonce)}">
  <input type="hidden" name="device_token" value="${escAttr(deviceToken)}">
  <input type="hidden" name="platform" value="${escAttr(platform)}">
  <input type="hidden" name="bundle_id" value="${escAttr(bundleId)}">
  <button type="submit" name="action" value="allow">allow</button>
  <button type="submit" name="action" value="cancel">cancel</button>
</form>`,
  });
}

export function renderEnablePushDone() {
  return layout({
    title: 'enabled',
    body: `<h1>enabled</h1>
<p>your phone is connected to solstone push. you can close this tab.</p>`,
  });
}

export function renderEnablePushError() {
  return layout({
    title: 'could not enable solstone push',
    body: `<h1>could not enable solstone push</h1>
<p>something didn't look right with that link.</p>
<p>if you got here from your solstone app, try again from the app. if
you got here some other way, you can close this tab.</p>`,
  });
}

// === services surfaces ===

export function renderServicesDashboard({ welcome, email, lastSignInAt, now, decryptOk, scoutActive, deviceCount }) {
  const emailText = email ? esc(email) : '—';
  const notice = decryptOk === false
    ? `<p class="notice">we couldn't decrypt your email address. you're still signed in.</p>`
    : '';
  const scoutStatus = scoutActive ? 'active' : 'not set up';
  const scoutControl = scoutActive
    ? `<form method="post" action="/services/scout/disable" class="inline-form">
  <button type="submit">turn off</button>
</form>`
    : '';
  const pushControl = deviceCount > 0
    ? `<form method="post" action="/services/push/disable" class="inline-form">
  <button type="submit">turn off all</button>
</form>`
    : '';
  const welcomePanel = welcome
    ? `<div class="welcome">
  <h2>set up a passkey for next time</h2>
  <p class="helper">use this device to sign in without typing a code.</p>
  <label for="passkey-friendly-name">device name</label>
  <input id="passkey-friendly-name" maxlength="64" placeholder="device name (optional)" autocomplete="off">
  <button id="passkey-add" type="button">add a passkey</button>
  <button id="passkey-skip" type="button">not now</button>
  <div id="passkey-enroll-error" class="error" hidden></div>
</div>
<script>${ENROLL_JS}</script>`
    : '';
  return layout({
    title: 'your services',
    body: `<h1>your services</h1>
<p>signed in as: ${emailText}</p>
${notice}
<p>last sign-in: ${esc(formatRelativeTime(lastSignInAt, now))}</p>
<div class="settings-card">
  <a href="/services/scout"><strong>solstone scout</strong><span>${scoutStatus}</span></a>
  ${scoutControl}
</div>
<div class="settings-card">
  <a href="/services/devices"><strong>solstone push</strong><span>${esc(countLabel(deviceCount, 'device', 'devices'))}</span></a>
  ${pushControl}
</div>
<div class="settings-card">
  <a href="https://solstone.app/trust"><strong>trust</strong><span>read how we earn your trust.</span></a>
</div>
<p><a href="/sign-in">your sign-in</a> <a href="/support">your support</a></p>
<form method="post" action="/signout"><button type="submit">sign out</button></form>
${welcomePanel}`,
  });
}

// === sign-in surfaces ===

export function renderSignInShell({ sessionCount, passkeyCount, emailCount = 0 }) {
  return layout({
    title: 'your sign-in',
    body: `<h1>your sign-in</h1>
	<nav class="settings-nav"><a href="/">back to your services</a><a href="/support">your support</a></nav>
<a class="settings-card" href="/sign-in/sessions">
  <strong>sessions</strong>
  <span>${esc(countLabel(sessionCount, 'active session', 'active sessions'))}</span>
</a>
<a class="settings-card" href="/sign-in/passkeys">
  <strong>passkeys</strong>
  <span>${esc(countLabel(passkeyCount, 'passkey', 'passkeys'))}</span>
</a>
<a class="settings-card" href="/sign-in/emails">
  <strong>email addresses</strong>
  <span>${esc(countLabel(emailCount, 'email', 'emails'))}</span>
</a>
	<p class="disclosure"><a href="/sign-in/data">what we have about you</a></p>
	<form method="post" action="/signout"><button type="submit">sign out</button></form>`,
  });
}

export function renderSignInEmails({ rows, addError = '', removeError = '' }) {
  const rowHtml = rows.map((row) => {
    const actionBase = `/sign-in/emails/${escAttr(row.id)}`;
    const badge = `<span class="sticker">${esc(row.badge)}</span>`;
    const expiry = row.expiryText ? `<p class="meta">${esc(row.expiryText)}</p>` : '';
    const makePrimary = row.badge === 'verified'
      ? `<form method="post" action="${actionBase}/make-primary" class="inline-form"><button type="submit">make primary</button></form>`
      : '';
    const remove = row.badge === 'primary'
      ? ''
      : `<form method="post" action="${actionBase}/remove" class="inline-form"><button class="danger" type="submit">remove</button></form>`;
    const verify = row.badge === 'unverified'
      ? `<p class="meta"><a href="/sign-in/emails/verify?address=${escAttr(row.encodedAddress)}">verify</a></p>`
      : '';
    return `<section class="settings-row">
  <h2>${esc(row.address)}${badge}</h2>
  <p class="meta">${esc(row.addedText)}</p>
  ${expiry}
  ${verify}
  ${makePrimary}
  ${remove}
</section>`;
  }).join('');
  const addErrorHtml = addError ? `<p class="error">${esc(addError)}</p>` : '';
  const removeErrorHtml = removeError ? `<p class="error">${esc(removeError)}</p>` : '';
  const emptyState = rows.length === 0 ? '<p>no email addresses for your sign-in.</p>' : '';
  return layout({
    title: 'email addresses',
    body: `<h1>email addresses</h1>
<nav class="settings-nav"><a href="/sign-in">back to your sign-in</a></nav>
${removeErrorHtml}
${emptyState}
${rowHtml}
<div class="welcome">
  <h2>add an email</h2>
  ${addErrorHtml}
  <form method="post" action="/sign-in/emails/add">
    <label for="address">email</label>
    <input id="address" type="email" name="address" autocomplete="email" required placeholder="you@example.com" maxlength="254">
    <button type="submit">add an email</button>
  </form>
</div>`,
  });
}

export function renderEmailVerify({
  address = '',
  addressInputValue = '',
  error = '',
  alreadyVerified = false,
}) {
  if (alreadyVerified) {
    return layout({
      title: 'verify email',
      body: `<h1>verify email</h1>
<p class="notice">this email is already verified for your sign-in.</p>
<p><a href="/sign-in/emails">back to email addresses</a></p>`,
    });
  }
  const errorHtml = error ? `<p class="error">${esc(error)}</p>` : '';
  const addressFieldHtml = address
    ? `<input type="hidden" name="address" value="${escAttr(address)}">`
    : `<input type="email" name="address" value="${escAttr(addressInputValue)}" required autocomplete="email" placeholder="you@example.com" maxlength="254">`;
  const subhead = address
    ? `we sent a code to <strong>${esc(address)}</strong>. enter it below.`
    : 'enter the email address and the 6-digit code we sent you.';
  return layout({
    title: 'verify email',
    body: `<h1>verify email</h1>
<p>${subhead}</p>
${errorHtml}
<form method="post" action="/sign-in/emails/verify">
  ${addressFieldHtml}
  <input class="code" name="code" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" autofocus required maxlength="6" oninput="this.value=this.value.replace(/\\D/g,'').slice(0,6)">
  <button type="submit">verify</button>
</form>`,
  });
}

// === transparency / data ===

export function renderTransparency({
  accountId,
  accountCreatedAt,
  lastSigninAt,
  emails,
  passkeys,
  sessions,
}) {
  const emailHtml = emails.map((row) => `<section class="settings-row">
  <h2>${esc(row.address)}${row.isPrimary ? '<span class="sticker">primary</span>' : ''}</h2>
  <p class="meta">${row.verifiedAt == null ? 'unverified' : 'verified'}</p>
  <p class="meta">added ${esc(formatDate(row.createdAt))}</p>
</section>`).join('');
  const passkeyHtml = passkeys.map((row) => `<section class="settings-row">
  <h2>${esc(row.name)}</h2>
  <p class="meta">aaguid ${esc(row.aaguid || '—')}</p>
  <p class="meta">credential ${esc(row.credentialId)}</p>
  <p class="meta">created ${esc(formatDate(row.createdAt))}</p>
  <p class="meta">last used ${esc(row.lastUsedAt == null ? 'never used' : formatDate(row.lastUsedAt))}</p>
  <p class="meta">${esc(row.revokedAt == null ? 'active' : `revoked ${formatDate(row.revokedAt)}`)}</p>
</section>`).join('');
  const sessionHtml = sessions.map((row) => `<section class="settings-row">
  <h2>${esc(row.deviceLabel)}</h2>
  <p class="meta">${esc(row.ipLabel)}</p>
  <p class="meta">created ${esc(formatDate(row.createdAt))}</p>
  <p class="meta">last active ${esc(formatDate(row.lastActiveAt))}</p>
  <p class="meta">expires ${esc(formatDate(row.expiresAt))}</p>
  <p class="meta">${esc(row.revokedAt == null ? 'active' : `revoked ${formatDate(row.revokedAt)}`)}</p>
</section>`).join('');
  return layout({
    title: 'what we have about you',
    body: `<h1>what we have about you</h1>
<nav class="settings-nav"><a href="/sign-in">back to your sign-in</a></nav>
<section class="settings-row">
  <h2>sign-in</h2>
  <p class="meta">id ${esc(accountId)}</p>
  <p class="meta">created ${esc(formatDate(accountCreatedAt))}</p>
  <p class="meta">last sign-in ${esc(lastSigninAt == null ? '—' : formatDate(lastSigninAt))}</p>
</section>
<h2>emails</h2>
${emailHtml}
<h2>passkeys</h2>
${passkeyHtml || '<p>no passkeys.</p>'}
<h2>sessions</h2>
${sessionHtml || '<p>no sessions.</p>'}
<h2>what we don't have</h2>
<ul>
  <li>no name</li>
  <li>no phone</li>
  <li>no address</li>
  <li>no analytics</li>
  <li>no behavioral data</li>
  <li>no IP geolocation stored separately</li>
  <li>no third-party tracking</li>
</ul>
<p class="disclosure">these are sol pbc's structural data commitments under <a href="https://solpbc.org/articles#s8-3">Article 8 of the articles of incorporation</a> (restated 2026-05-01) and <a href="https://solpbc.org/bylaws#art-3">Article III of the bylaws</a>.</p>`,
  });
}

export function renderSignInSessions({ rows, currentIdHash, now }) {
  const hasOtherSessions = rows.some((row) => row.id_hash !== currentIdHash);
  const revokeOthers = hasOtherSessions
    ? `<form method="post" action="/sign-in/sessions/revoke-others" class="inline-form">
  <button class="danger" type="submit" onclick="return confirm('revoke all other sessions?')">revoke all other sessions</button>
</form>`
    : '';
  const rowHtml = rows.map((row) => {
    const isCurrent = row.id_hash === currentIdHash;
    const action = `/sign-in/sessions/${escAttr(row.id_hash)}/revoke`;
    const revoke = isCurrent
      ? ''
      : `<form method="post" action="${action}" class="inline-form"><button class="danger" type="submit">revoke</button></form>`;
    return `<section class="settings-row">
  <h2>${esc(row.deviceLabel)}${isCurrent ? '<span class="sticker">current</span>' : ''}</h2>
  <p class="meta">${esc(row.ipLabel)}</p>
  <p class="meta">last active ${esc(formatRelativeTime(row.last_active_at, now))}</p>
  <p class="meta">created ${esc(formatDate(row.created_at))}</p>
  ${revoke}
</section>`;
  }).join('');
  return layout({
    title: 'sessions',
    body: `<h1>sessions</h1>
<nav class="settings-nav"><a href="/sign-in">your sign-in</a><a href="/">your services</a><a href="/support">your support</a></nav>
${revokeOthers}
${rowHtml}`,
  });
}

export function renderServicesDevices({ devices, nowMs, disableFlash = '' }) {
  const revokeAll = devices.length > 0
    ? `<form method="post" action="/services/devices/revoke-all" class="inline-form">
  <button class="danger" type="submit">revoke all devices</button>
</form>`
    : '';
  const notice = disableFlash === 'ok' ? '<p class="notice">push turned off for every device.</p>' : '';
  const emptyState = devices.length === 0 ? '<p>no devices registered.</p>' : '';
  const rowHtml = devices.map((row) => {
    const label = row.device_label || 'unnamed device';
    const appVersion = row.app_version || '—';
    const action = `/services/devices/${escAttr(row.device_id)}/revoke`;
    return `<section class="settings-row">
  <h2>${esc(label)}</h2>
  <p class="meta">platform ${esc(row.platform)}</p>
  <p class="meta">bundle ${esc(row.bundle_id)}</p>
  <p class="meta">environment ${esc(row.push_token_env)}</p>
  <p class="meta">app version ${esc(appVersion)}</p>
  <p class="meta">last seen ${esc(formatRelativeTime(row.last_seen_at, nowMs))}</p>
  <p class="meta">registered ${esc(formatDate(row.registered_at))}</p>
  <form method="post" action="${action}" class="inline-form"><button class="danger" type="submit">revoke this device</button></form>
</section>`;
  }).join('');
  return layout({
    title: 'your devices',
    body: `<h1>your devices</h1>
<nav class="settings-nav"><a href="/sign-in">your sign-in</a><a href="/">your services</a><a href="/support">your support</a></nav>
${notice}
${revokeAll}
${emptyState}
${rowHtml}`,
  });
}

export function renderSignInPasskeys({ rows, enrollJsIncluded }) {
  const emptyState = rows.length === 0
    ? `<p>no passkeys enrolled. next time you sign in, you'll use an email code.</p>`
    : '';
  const rowHtml = rows.map((row) => {
    const renameAction = `/sign-in/passkeys/${escAttr(row.credential_id)}/rename`;
    const removeAction = `/sign-in/passkeys/${escAttr(row.credential_id)}/remove`;
    return `<section class="settings-row">
  <h2>${esc(row.name)}</h2>
  <p class="meta">${esc(row.addedText)}</p>
  <p class="meta">${esc(row.lastUsedText)}</p>
  <form method="post" action="${renameAction}" class="inline-form">
    <label for="friendly-name-${escAttr(row.credential_id)}">name</label>
    <input id="friendly-name-${escAttr(row.credential_id)}" name="friendly_name" value="${escAttr(row.friendlyNameInput)}" maxlength="64" autocomplete="off">
    <button type="submit">rename</button>
  </form>
  <form method="post" action="${removeAction}" class="inline-form">
    <button class="danger" type="submit" onclick="return confirm('remove this passkey?')">remove</button>
  </form>
</section>`;
  }).join('');
  return layout({
    title: 'passkeys',
    body: `<h1>passkeys</h1>
<nav class="settings-nav"><a href="/sign-in">your sign-in</a><a href="/">your services</a><a href="/support">your support</a></nav>
${emptyState}
<div class="welcome">
  <h2>add a passkey</h2>
  <label for="passkey-friendly-name">device name</label>
  <input id="passkey-friendly-name" maxlength="64" placeholder="device name (optional)" autocomplete="off">
  <button id="passkey-add" type="button">add a passkey</button>
  <div id="passkey-enroll-error" class="error" hidden></div>
</div>
${rowHtml}
${enrollJsIncluded ? `<script>${ENROLL_JS}</script>` : ''}`,
  });
}

export function renderServicesScout({ active, rows, hasRecentAck, nowMs, flash = {} }) {
  const flashes = flashMessages(flash);
  const revealAction = hasRecentAck ? '/services/scout/reveal' : '/services/scout/ack';
  const revealText = hasRecentAck ? 'reveal current key' : 'acknowledge before reveal';
  const activeControls = active
    ? `<form method="post" action="${revealAction}" class="inline-form">
  ${hasRecentAck ? '' : '<input type="hidden" name="warning" value="scout-reveal">'}
  <button type="submit">${revealText}</button>
</form>
<form method="post" action="/services/scout/rotate" class="inline-form">
  <button type="submit">rotate key</button>
</form>
<form method="post" action="/services/scout/disable" class="inline-form">
  <button class="danger" type="submit">turn off</button>
</form>`
    : '';
  const keySection = active
    ? `<section class="settings-row">
  <h2>scout key</h2>
  <p class="meta">status active</p>
  <p class="meta">created ${esc(formatRelativeTime(active.created_at, nowMs))}</p>
  <p class="meta">last used ${esc(geminiLastUsedText(active, nowMs))}</p>
  ${activeControls}
</section>`
    : `<section class="settings-row">
  <h2>scout key</h2>
  <p>no scout key for this service.</p>
  <p>set up scout from the solstone cli to start.</p>
</section>`;
  const auditRows = rows.map((row) => {
    const isActive = row.revoked_at == null;
    const forget = isActive
      ? ''
      : `<form method="post" action="/services/scout/forget" class="inline-form">
    <input type="hidden" name="key_id" value="${escAttr(row.id)}">
    <button class="danger" type="submit">forget</button>
  </form>`;
    return `<section class="settings-row">
  <h2>${esc(row.display_name)}${isActive ? '<span class="sticker">active</span>' : '<span class="sticker">revoked</span>'}</h2>
  <p class="meta">created ${esc(formatDate(row.created_at))}</p>
  <p class="meta">last used ${esc(geminiLastUsedText(row, nowMs))}</p>
  <p class="meta">${esc(isActive ? 'active' : `revoked ${formatDate(row.revoked_at)}`)}</p>
  ${forget}
</section>`;
  }).join('');
  return layout({
    title: 'solstone scout',
    body: `<h1>solstone scout</h1>
<nav class="settings-nav"><a href="/sign-in">your sign-in</a><a href="/">your services</a><a href="/support">your support</a></nav>
${flashes}
${keySection}
<h2>audit</h2>
${auditRows}`,
  });
}

export function renderServicesScoutReveal({ apiKey }) {
  return layout({
    title: 'scout key',
    body: `<h1>scout key</h1>
<p class="notice">this key is visible on screen now.</p>
<input readonly value="${escAttr(apiKey)}" onclick="this.select()">
<form method="get" action="/services/scout"><button type="submit">close</button></form>`,
  });
}

// === support surfaces ===

export function renderSupportList({
  requests = [],
  nowMs = Date.now(),
  csrf = '',
  notices = [],
  failure = '',
  createConfirmation = null,
}) {
  const noticeHtml = supportNotices(notices);
  const failureHtml = failure ? `<p class="error">${esc(failure)}</p>` : '';
  const confirmationHtml = createConfirmation ? supportCreateConfirmation(createConfirmation) : '';
  const rowsHtml = requests.map((row) => `<section class="settings-row">
  <h2><a href="/support/${escAttr(row.id)}">${esc(row.subject || 'request')}</a></h2>
  <p class="meta">${esc(supportStatusLabel(row.status))}</p>
  <p class="meta">updated ${esc(formatRelativeTime(row.updatedAtMs, nowMs))}</p>
</section>`).join('');
  const emptyState = requests.length === 0 && !failure
    ? '<p>no open requests. need help? open one below — or your solstone keeper can file one for you.</p>'
    : '';
  return layout({
    title: 'your support',
    body: `<h1>your support</h1>
<nav class="settings-nav"><a href="/sign-in">your sign-in</a><a href="/">your services</a></nav>
${noticeHtml}
${failureHtml}
${confirmationHtml}
${emptyState}
${rowsHtml}
${renderSupportOpenForm(csrf)}`,
  });
}

export function renderSupportDetail({
  request,
  messages = [],
  attachments = [],
  csrf = '',
  nowMs = Date.now(),
  notices = [],
  failure = '',
}) {
  const noticeHtml = supportNotices(notices);
  const failureHtml = failure ? `<p class="error">${esc(failure)}</p>` : '';
  const messageRows = messages.map((message) => `<section class="settings-row">
  <h2>${esc(supportAuthorLabel(message.author_kind))}</h2>
  <p>${esc(message.content || '')}</p>
  <p class="meta">${esc(formatRelativeTime(message.createdAtMs, nowMs))}</p>
</section>`).join('');
  const attachmentRows = attachments.length
    ? attachments.map(renderSupportAttachment).join('')
    : '<p>no attachments.</p>';
  const id = request?.id || '';
  return layout({
    title: request?.subject || 'your support',
    body: `<h1>${esc(request?.subject || 'your support')}</h1>
<nav class="settings-nav"><a href="/sign-in">your sign-in</a><a href="/">your services</a></nav>
${noticeHtml}
${failureHtml}
<p class="meta">${esc(supportStatusLabel(request?.status))}</p>
<h2>messages</h2>
${messageRows || '<p>no messages.</p>'}
<h2>attachments</h2>
${attachmentRows}
<div class="welcome">
  <h2>reply</h2>
  <p class="helper">add a reply, or attach a screenshot or log.</p>
  <p class="notice">screenshots and logs are used only to triage your request, then removed right away. after you submit they're no longer viewable or downloadable here — we keep only a short summary from triage, never the files themselves.</p>
  <form method="post" action="/support/${escAttr(id)}/reply" enctype="multipart/form-data">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    <label for="reply-content">reply</label>
    <textarea id="reply-content" name="content" required maxlength="5000"></textarea>
    <label for="reply-file">attachments</label>
    <p class="helper">optional screenshots/logs</p>
    <input id="reply-file" type="file" name="file" multiple>
    <button type="submit">reply</button>
  </form>
</div>`,
  });
}

export function renderSupportNotFound() {
  return layout({
    title: 'request not found',
    body: `<h1>request not found</h1>
<p>we couldn't find that request.</p>
<p><a href="/support">back to your support</a></p>`,
  });
}

export function renderGoodbye() {
  return layout({
    title: 'signed out',
    body: `<h1>signed out.</h1><p>see you next time.</p><p><a href="/">start over</a></p>`,
  });
}

// Shown when the CSRF synchronizer token is missing or doesn't match — the
// rare residual case once the body-carried token defeats the common
// email-security link/header rewriting. Actionable and deliberately
// state-free (no host or account input) so the body is byte-identical on
// every token failure and leaks no enumeration signal.
export function renderForbidden() {
  return layout({
    title: "we couldn't verify this sign-in",
    body: `<h1>we couldn't verify this sign-in</h1>
<p>your email security may have modified the link you used to get here.</p>
<p>to continue, open <strong>https://services.solstone.app</strong> directly in a new browser tab and request a new code.</p>
<p><a href="https://services.solstone.app">open services.solstone.app</a></p>`,
  });
}

export function renderNotFound() {
  return layout({
    title: 'not found',
    body: `<h1>not found</h1>
<p>nothing at this address.</p>
<p><a href="/">back to home</a></p>`,
  });
}

export function formatRelativeTime(tsMs, nowMs) {
  if (tsMs == null) return '—';
  const ts = Number(tsMs);
  const now = Number(nowMs);
  if (!Number.isFinite(ts) || !Number.isFinite(now)) return '—';
  const diff = Math.max(0, now - ts);
  if (diff < 60_000) return 'just now';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  if (hours < 48) return 'yesterday';
  const days = Math.floor(hours / 24);
  if (days >= 30) return new Date(ts).toISOString().slice(0, 10);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function geminiLastUsedText(row, nowMs) {
  if (row.last_used_at != null && row.last_used_fetched_at != null) {
    return formatRelativeTime(row.last_used_at, nowMs);
  }
  if (row.last_used_fetched_at != null) return 'not available (checked just now)';
  return 'not available';
}

function supportStatusLabel(status) {
  return SUPPORT_STATUS_LABELS[status] || 'in progress';
}

function supportAuthorLabel(authorKind) {
  return SUPPORT_AUTHOR_LABELS[authorKind] || 'sol pbc support';
}

function supportNotices(notices) {
  return notices.map((notice) => `<p class="notice">${esc(notice)}</p>`).join('');
}

function supportCreateConfirmation({ id, email, uploadFailed = false }) {
  const uploadNotice = uploadFailed
    ? '<p class="error">your request was opened, but the attachments could not be uploaded.</p>'
    : '';
  return `<p class="notice">got it — this is request #${esc(id)}. we'll email you at ${esc(email)} and you can follow it right here.</p>
<p><a href="/support/${escAttr(id)}">view request</a></p>
${uploadNotice}`;
}

function renderSupportOpenForm(csrf) {
  return `<div class="welcome">
  <h2>open a request</h2>
  <p class="helper">tell us what's going on. you can attach screenshots or logs here — it's easier than email.</p>
  <form method="post" action="/support" enctype="multipart/form-data">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    <label for="support-subject">what's going on?</label>
    <input id="support-subject" name="subject" required maxlength="200">
    <label for="support-description">the details</label>
    <textarea id="support-description" name="description" required maxlength="5000"></textarea>
    <label for="support-product">which product?</label>
    <select id="support-product" name="product" required>
      <option value="solstone">solstone</option>
      <option value="vit">vit</option>
    </select>
    <label for="support-file">attachments</label>
    <p class="notice">screenshots and logs are used only to triage your request, then removed right away. after you submit they're no longer viewable or downloadable here — we keep only a short summary from triage, never the files themselves.</p>
    <p class="helper">optional screenshots/logs</p>
    <input id="support-file" type="file" name="file" multiple>
    <button type="submit">open a request</button>
  </form>
</div>`;
}

function renderSupportAttachment(attachment) {
  const filename = esc(attachment.filename || 'attachment');
  if (attachment.status === 'removed') {
    const summary = attachment.triage_summary ? ` ${esc(attachment.triage_summary)}` : '';
    return `<section class="settings-row">
  <h2>${filename}</h2>
  <p>attachment removed after triage${summary}</p>
</section>`;
  }
  const status = attachment.status === 'pending' ? '<p class="meta">pending</p>' : '';
  return `<section class="settings-row">
  <h2>${filename}</h2>
  ${status}
</section>`;
}

function flashMessages(flash) {
  const messages = [];
  if (flash.rotated === 'ok') messages.push('key rotated.');
  if (flash.rotated === 'conflict') messages.push('another rotation completed first. try again.');
  if (flash.rotated === 'no_active_key') messages.push('no active key to rotate.');
  if (flash.ack === 'ok') messages.push('reveal available for 24 hours.');
  if (flash.reveal === 'ack_required') messages.push('acknowledge before revealing the key.');
  if (flash.reveal === 'missing') messages.push('no active key to reveal.');
  if (flash.forget === 'ok') messages.push('revoked key forgotten.');
  if (flash.disable === 'ok') messages.push('scout turned off.');
  if (flash.disable === 'none') messages.push('no active scout key to turn off.');
  return messages.map((message) => `<p class="notice">${esc(message)}</p>`).join('');
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

function countLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatDate(tsMs) {
  const ts = Number(tsMs);
  if (!Number.isFinite(ts)) return '—';
  return new Date(ts).toISOString().slice(0, 10);
}
