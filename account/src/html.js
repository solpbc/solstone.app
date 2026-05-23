// Page renderers with lean inline styles. No external font, no wordmark blob.
// Sol orange accent: #E8923A. Lowercase voice throughout.

import { ENROLL_JS } from './inline/passkey-enroll.js';
import { LANDING_JS } from './inline/passkey-landing.js';

const SOL_ORANGE = '#E8923A';
export const VERIFY_ERROR = "that code didn't work. try again or request a new one.";

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
    main { width: min(100% - 32px, 560px); margin: 0 auto; padding: 56px 0; }
    h1, h2 { margin: 0 0 16px; line-height: 1.2; text-transform: lowercase; }
    h1 { font-size: 1.65rem; }
    h2 { font-size: 1.2rem; color: ${SOL_ORANGE}; }
    .brand { color: ${SOL_ORANGE}; font-size: 2rem; margin-bottom: 6px; }
    .subhead { color: #444; margin-bottom: 24px; }
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

export function renderLanding(turnstileSiteKey, csrf, resume = {}) {
  const resumeHtml = resume.next && resume.nextSig
    ? `<input type="hidden" name="next" value="${escAttr(resume.next)}">
  <input type="hidden" name="next_sig" value="${escAttr(resume.nextSig)}">`
    : '';
  return layout({
    title: 'sign in to your solstone account',
    body: `<h1 class="brand">solstone</h1>
	<p class="subhead">one place to manage your sol pbc account.</p>
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

export function renderDashboard({ welcome, email, lastSignInAt, now, decryptOk }) {
  const emailText = email ? esc(email) : '—';
  const notice = decryptOk === false
    ? `<p class="notice">we couldn't decrypt your email address. you're still signed in.</p>`
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
    title: 'dashboard',
    body: `<h1>⟡ welcome</h1>
<p>signed in as: ${emailText}</p>
${notice}
<p>last sign-in: ${esc(formatRelativeTime(lastSignInAt, now))}</p>
<p>account.solstone.app is the foundation for managing your solstone cloud services.</p>
<p><a href="/settings">account settings</a></p>
<form method="post" action="/signout"><button type="submit">sign out</button></form>
${welcomePanel}`,
  });
}

export function renderSettingsShell({ sessionCount, passkeyCount, emailCount = 0, deviceCount = 0 }) {
  return layout({
    title: 'account settings',
    body: `<h1>account settings</h1>
<nav class="settings-nav"><a href="/dashboard">back to dashboard</a></nav>
<a class="settings-card" href="/settings/sessions">
  <strong>sessions</strong>
  <span>${esc(countLabel(sessionCount, 'active session', 'active sessions'))}</span>
</a>
<a class="settings-card" href="/settings/passkeys">
  <strong>passkeys</strong>
  <span>${esc(countLabel(passkeyCount, 'passkey', 'passkeys'))}</span>
</a>
<a class="settings-card" href="/settings/emails">
  <strong>email addresses</strong>
  <span>${esc(countLabel(emailCount, 'email', 'emails'))}</span>
</a>
<a class="settings-card" href="/settings/devices">
  <strong>devices</strong>
  <span>${esc(countLabel(deviceCount, 'device', 'devices'))}</span>
</a>
<p class="disclosure"><a href="/settings/data">what we have about you</a></p>
<form method="post" action="/signout"><button type="submit">sign out</button></form>`,
  });
}

export function renderSettingsEmails({ rows, addError = '', removeError = '' }) {
  const rowHtml = rows.map((row) => {
    const actionBase = `/settings/emails/${escAttr(row.id)}`;
    const badge = `<span class="sticker">${esc(row.badge)}</span>`;
    const expiry = row.expiryText ? `<p class="meta">${esc(row.expiryText)}</p>` : '';
    const makePrimary = row.badge === 'verified'
      ? `<form method="post" action="${actionBase}/make-primary" class="inline-form"><button type="submit">make primary</button></form>`
      : '';
    const remove = row.badge === 'primary'
      ? ''
      : `<form method="post" action="${actionBase}/remove" class="inline-form"><button class="danger" type="submit">remove</button></form>`;
    const verify = row.badge === 'unverified'
      ? `<p class="meta"><a href="/settings/emails/verify?address=${escAttr(row.encodedAddress)}">verify</a></p>`
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
  const emptyState = rows.length === 0 ? '<p>no email addresses on this account.</p>' : '';
  return layout({
    title: 'email addresses',
    body: `<h1>email addresses</h1>
<nav class="settings-nav"><a href="/settings">settings</a><a href="/dashboard">dashboard</a></nav>
${removeErrorHtml}
${emptyState}
${rowHtml}
<div class="welcome">
  <h2>add an email</h2>
  ${addErrorHtml}
  <form method="post" action="/settings/emails/add">
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
<p class="notice">this email is already verified on this account.</p>
<p><a href="/settings/emails">back to email addresses</a></p>`,
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
<form method="post" action="/settings/emails/verify">
  ${addressFieldHtml}
  <input class="code" name="code" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" autofocus required maxlength="6" oninput="this.value=this.value.replace(/\\D/g,'').slice(0,6)">
  <button type="submit">verify</button>
</form>`,
  });
}

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
<nav class="settings-nav"><a href="/settings">back to settings</a></nav>
<section class="settings-row">
  <h2>account</h2>
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

export function renderSettingsSessions({ rows, currentIdHash, now }) {
  const hasOtherSessions = rows.some((row) => row.id_hash !== currentIdHash);
  const revokeOthers = hasOtherSessions
    ? `<form method="post" action="/settings/sessions/revoke-others" class="inline-form">
  <button class="danger" type="submit" onclick="return confirm('revoke all other sessions?')">revoke all other sessions</button>
</form>`
    : '';
  const rowHtml = rows.map((row) => {
    const isCurrent = row.id_hash === currentIdHash;
    const action = `/settings/sessions/${escAttr(row.id_hash)}/revoke`;
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
<nav class="settings-nav"><a href="/settings">settings</a><a href="/dashboard">dashboard</a></nav>
${revokeOthers}
${rowHtml}`,
  });
}

export function renderSettingsDevices({ devices, nowMs }) {
  const revokeAll = devices.length > 0
    ? `<form method="post" action="/settings/devices/revoke-all" class="inline-form">
  <button class="danger" type="submit">revoke all devices</button>
</form>`
    : '';
  const emptyState = devices.length === 0 ? '<p>no devices registered.</p>' : '';
  const rowHtml = devices.map((row) => {
    const label = row.device_label || 'unnamed device';
    const appVersion = row.app_version || '—';
    const action = `/settings/devices/${escAttr(row.device_id)}/revoke`;
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
<nav class="settings-nav"><a href="/settings">settings</a><a href="/dashboard">dashboard</a></nav>
${revokeAll}
${emptyState}
${rowHtml}`,
  });
}

export function renderSettingsPasskeys({ rows, enrollJsIncluded }) {
  const emptyState = rows.length === 0
    ? `<p>no passkeys enrolled. next time you sign in, you'll use an email code.</p>`
    : '';
  const rowHtml = rows.map((row) => {
    const renameAction = `/settings/passkeys/${escAttr(row.credential_id)}/rename`;
    const removeAction = `/settings/passkeys/${escAttr(row.credential_id)}/remove`;
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
<nav class="settings-nav"><a href="/settings">settings</a><a href="/dashboard">dashboard</a></nav>
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
<p>to continue, open <strong>https://account.solstone.app</strong> directly in a new browser tab and request a new code.</p>
<p><a href="https://account.solstone.app">open account.solstone.app</a></p>`,
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
