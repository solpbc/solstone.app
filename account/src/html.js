// Page renderers for the served portal.css design system and same-origin brand assets.

import { ENROLL_JS } from './inline/passkey-enroll.js';
import { LANDING_JS } from './inline/passkey-landing.js';

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
const MARK_SVG = '<svg class="mark" viewBox="2.5 2.5 27 27" role="img" aria-label="solstone"><path fill="#F5C740" d="M16.0 2.5 L18.6 7.3 A9.1 9.1 0 0 0 13.4 7.3 Z M23.9 5.1 L23.2 10.5 A9.1 9.1 0 0 0 19.0 7.4 Z M28.8 11.8 L25.1 15.8 A9.1 9.1 0 0 0 23.5 10.9 Z M28.8 20.2 L23.5 21.1 A9.1 9.1 0 0 0 25.1 16.2 Z M23.9 26.9 L19.0 24.6 A9.1 9.1 0 0 0 23.2 21.5 Z M16.0 29.5 L13.4 24.7 A9.1 9.1 0 0 0 18.6 24.7 Z M8.1 26.9 L8.8 21.5 A9.1 9.1 0 0 0 13.0 24.6 Z M3.2 20.2 L6.9 16.2 A9.1 9.1 0 0 0 8.5 21.1 Z M3.2 11.8 L8.5 10.9 A9.1 9.1 0 0 0 6.9 15.8 Z M8.1 5.1 L13.0 7.4 A9.1 9.1 0 0 0 8.8 10.5 Z"/><circle cx="16" cy="16" r="6.5" fill="none" stroke="#E8923A" stroke-width="1.7"/></svg>';
const CHEVRON_SVG = '<svg class="chevron" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l6 6-6 6"/></svg>';
const CARET_SVG = '<svg class="caret" viewBox="0 0 11 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l4.5 4.5L10 1"/></svg>';
const EXT_SVG = '<svg class="ext" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l6-6M5 3h4v4"/></svg>';
const BACK_SVG = '<svg viewBox="0 0 8 14" width="7" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 1L1 7l6 6"/></svg>';
const IC_SCOUT_SVG = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8.5" r="4"/><path d="M10.8 11.2 19 19.4M16.4 16.8l1.8-1.8M18.6 19l1.8-1.8"/></svg>';
const IC_PUSH_SVG = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9.5a6 6 0 1 1 12 0c0 4.5 2 5.5 2 5.5H4s2-1 2-5.5Z"/><path d="M10 18.5a2 2 0 0 0 4 0"/></svg>';
const IC_SUPPORT_SVG = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5h16v10H8.5L4 19z"/><path d="M8 9.5h8M8 12.5h5"/></svg>';
const IC_SESSION_SVG = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 20c0-3.4 3-6 6.5-6s6.5 2.6 6.5 6"/></svg>';
const IC_PASSKEY_SVG = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="14" r="3.4"/><path d="M10.6 11.4 19 3M16 6l2 2M14 8l1.6 1.6"/></svg>';
const IC_EMAIL_SVG = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3.5 7.5 12 13l8.5-5.5"/></svg>';
const IC_EMPTY_DATA_SVG = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="6.5" ry="3"/><path d="M5.5 6v8c0 1.7 2.9 3 6.5 3 .9 0 1.8-.1 2.6-.3"/><path d="M18.5 6v5.5"/><path d="M5.5 10c0 1.7 2.9 3 6.5 3 1.7 0 3.2-.3 4.4-.8"/><path d="M17 15l4 4M21 15l-4 4"/></svg>';
const CHECK_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B06A1A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M8 12.2l2.6 2.6L16 9"/></svg>';
const SCOUT_COVENANT_LINE = "your questions to solstone scout go straight to Google Gemini under Google's terms. sol pbc sets up the key but never sits between you and Gemini, and never sees what you ask.";
const TRANSPARENCY_INTRO = `<p class="intro">everything sol pbc holds for your sign-in is on this page — nothing more. no journal, no behavior, no tracking. we don't have your name, your phone, your address, or where you are — no analytics, no behavioral data, no third-party tracking. these aren't promises — they're structural commitments under <a href="https://solpbc.org/articles#s8-3">Article 8 of our articles of incorporation</a> (restated 2026-05-01) and <a href="https://solpbc.org/bylaws#art-3">Article III of the bylaws</a>.</p>`;

function brandbar() {
  return `<div class="brandbar">${MARK_SVG}<span class="wordmark">solstone</span></div>`;
}

function footer() {
  return `<footer class="footer"><a href="/transparency">data transparency</a><a href="/support">support</a><a href="https://solpbc.org/privacy">how we earn your trust ${EXT_SVG}</a></footer>`;
}

function topbar({ email = null, lastSignInAt = null, now = null } = {}) {
  const trimmedEmail = typeof email === 'string' ? email.trim() : '';
  const hasEmail = trimmedEmail.length > 0;
  const avatar = hasEmail ? esc(trimmedEmail[0] || '·') : '·';
  const head = hasEmail
    ? `<div class="head"><div class="lbl">signed in as</div><div class="who">${esc(trimmedEmail)}</div><div class="seen">last sign-in ${esc(formatRelativeTime(lastSignInAt, now))}</div></div>`
    : '';
  return `<div class="topbar">
  <a class="home" href="/">${MARK_SVG}<span class="wordmark">solstone</span></a>
  <details class="usermenu">
    <summary aria-label="menu"><span class="avatar">${avatar}</span>${CARET_SVG}</summary>
    <div class="menu" role="menu">
      ${head}
      <a href="/">home</a>
      <a href="/sign-in">manage sign-in</a>
      <div class="sep"></div>
      <form method="post" action="/signout"><button class="mi signout" type="submit">sign out</button></form>
    </div>
  </details>
</div>`;
}

export function layout({ title, body, afterMain = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="/portal.css">
</head>
<body><main>${body}${footer()}</main>${afterMain}</body>
</html>`;
}

export function renderLanding(turnstileSiteKey, csrf, resume = {}, subhead = "sign in to manage the optional services you've turned on. solstone itself runs on your machine — you don't sign in to use it.") {
  const resumeHtml = resume.next && resume.nextSig
    ? `<input type="hidden" name="next" value="${escAttr(resume.next)}">
  <input type="hidden" name="next_sig" value="${escAttr(resume.nextSig)}">`
    : '';
  return layout({
    title: 'sign in to manage your services',
    body: `${brandbar()}
<h1>your services</h1>
<p class="lead">${esc(subhead)}</p>
<div id="passkey-error" class="error" hidden></div>
<div class="card">
  <form method="post" action="/signin/start">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    ${resumeHtml}
    <label for="email">email</label>
    <input id="email" type="email" name="email" autocomplete="email webauthn" required placeholder="you@example.com" maxlength="254">
    <div class="cf-turnstile" data-sitekey="${escAttr(turnstileSiteKey)}"></div>
    <button class="btn primary block" type="submit">continue</button>
  </form>
</div>
<p class="disclosure">no analytics, no tracking, no third parties. this is the only solstone surface that ever knows it's you — and only after you sign in.</p>`,
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
    ? `code sent to <strong>${escapedEmail}</strong>. it expires 10 minutes after we sent it.`
    : 'enter your email and the 6-digit code we sent you.';
  return layout({
    title: 'verify your code',
    body: `${brandbar()}
<h1>verify your code</h1>
<p class="lead">${subhead}</p>
${errorHtml}
<div class="card">
  <form method="post" action="/signin/verify">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    ${resumeHtml}
    ${emailFieldHtml}
    <label for="code">6-digit code</label>
    <input id="code" class="code" name="code" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" autofocus required oninput="this.value=this.value.replace(/\\D/g,'').slice(0,6)">
    <button class="btn primary block" type="submit">verify</button>
  </form>
</div>
<p class="disclosure">didn't get it? <a href="/">request a new code</a>.</p>`,
  });
}

export function renderError() {
  return layout({
    title: "that link didn't work",
    body: `${brandbar()}
<h1>that link didn't work</h1>
<p class="lead">the link you used may have expired, or your email security may have changed it on the way to you. nothing happened to your services.</p>
<div class="card">
  <p style="margin:0 0 16px;color:var(--ink)">to pick up where you left off:</p>
  <ul style="margin:0 0 18px;padding-left:20px;color:var(--ink-soft)">
    <li style="margin-bottom:6px">if you came here from solstone on your device, run the enable command again for a fresh link.</li>
    <li>otherwise, open services.solstone.app directly and request a new code.</li>
  </ul>
  <a class="btn primary block" href="/">open your services</a>
</div>`,
  });
}

export function renderEnableScoutConsent({ csrf, nonce = '', accountId = '' }) {
  return layout({
    title: 'enable solstone scout',
    body: `${brandbar()}
<h1>enable solstone scout</h1>
<p class="lead">solstone on this device wants to enable solstone scout for you. two things, and only these two:</p>
<div class="card">
  <div class="grant">
    <div class="n">1</div>
    <div>
      <div class="gt">know it's you</div>
      <div class="gd">so your sign-in recognizes this device. nothing from your journal comes with it — no observations, nothing sol has experienced alongside you. just: this is your machine.</div>
    </div>
  </div>
  <div class="grant">
    <div class="n">2</div>
    <div>
      <div class="gt">enable solstone scout</div>
      <div class="gd">sol pbc creates a Google Gemini key on your behalf and hands it to this machine. the key is yours and it stays here. sol pbc sets it up — it never sits between you and Gemini, and never sees what you ask sol.</div>
    </div>
  </div>
  <form method="post" action="/enable/scout/confirm">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    <input type="hidden" name="account_id" value="${escAttr(accountId)}">
    <input type="hidden" name="nonce" value="${escAttr(nonce)}">
    <p class="gd" style="margin:16px 0 12px">${SCOUT_COVENANT_LINE}</p>
    <label style="display:flex;align-items:center;gap:10px;margin-bottom:14px;color:var(--ink)">
      <input type="checkbox" name="data_ack" value="yes" required style="width:auto;min-height:0;margin:0">
      <span>i understand</span>
    </label>
    <label for="use-case">what would you like to use it for? (optional)</label>
    <textarea id="use-case" name="use_case" maxlength="2000"></textarea>
    <div class="btn-row" style="margin-top:20px">
      <button class="btn primary" name="action" value="allow" type="submit">allow</button>
      <button class="btn secondary" name="action" value="cancel" type="submit">cancel</button>
    </div>
  </form>
</div>
<p class="disclosure">you can see exactly what you enabled — and turn either off — in your services anytime.</p>`,
  });
}

export function renderEnableScoutDone() {
  return layout({
    title: 'solstone scout enabled',
    body: `${brandbar()}
<div class="card">
  <h2 style="display:flex;align-items:center;gap:9px;font-size:1.15rem">${CHECK_SVG} solstone scout enabled</h2>
  <p>sol pbc set up a Gemini key for you and put it on this machine — you never had to touch it, and nothing from your journal crossed to set it up. you can close this tab.</p>
  <a class="btn secondary" href="/scout">manage solstone scout</a>
</div>`,
  });
}

export function renderEnableScoutPendingDone() {
  return layout({
    title: 'solstone scout request received',
    body: `${brandbar()}
<div class="card">
  <h2 style="display:flex;align-items:center;gap:9px;font-size:1.15rem">${CHECK_SVG} solstone scout request received</h2>
  <p>solstone scout is invite-only right now, and your request is under review. nothing was set up yet, and nothing from your journal crossed.</p>
  <p>once approved, you'll be able to enable solstone scout from your services.</p>
  <a class="btn secondary" href="/">open your services</a>
</div>`,
  });
}

export function renderEnableScoutRevokedDone() {
  return layout({
    title: "solstone scout isn't available",
    body: `${brandbar()}
<div class="card">
  <h2>solstone scout isn't available</h2>
  <p>solstone scout isn't available for this sign-in. nothing was set up.</p>
</div>`,
  });
}

export function renderEnableScoutError({ message }) {
  return layout({
    title: 'could not enable solstone scout',
    body: `${brandbar()}
<div class="card">
  <h1>could not enable solstone scout</h1>
  <p>${esc(message || 'that request could not be completed.')}</p>
  <p>if you got here from solstone on your device, run the enable command again for a fresh link. otherwise, you can close this tab.</p>
</div>`,
  });
}

export function renderEnablePushConsent({ csrf, nonce, deviceToken, platform, bundleId }) {
  return layout({
    title: 'enable solstone push',
    body: `${brandbar()}
<h1>enable solstone push</h1>
<p class="lead">solstone push wants to reach this device for you. two things, and only these two:</p>
<div class="card">
  <div class="grant">
    <div class="n">1</div>
    <div>
      <div class="gt">know it's you</div>
      <div class="gd">so your sign-in recognizes this device. nothing from your journal comes with it — no observations, nothing sol has experienced alongside you. just: this is your phone.</div>
    </div>
  </div>
  <div class="grant">
    <div class="n">2</div>
    <div>
      <div class="gt">enable solstone push</div>
      <div class="gd">sol will send a short heads-up (an 80-character summary, never the full thing) to this device when there's something worth your attention. you can turn it off in your services anytime.</div>
    </div>
  </div>
  <form method="post" action="/enable/push/confirm">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    <input type="hidden" name="nonce" value="${escAttr(nonce)}">
    <input type="hidden" name="device_token" value="${escAttr(deviceToken)}">
    <input type="hidden" name="platform" value="${escAttr(platform)}">
    <input type="hidden" name="bundle_id" value="${escAttr(bundleId)}">
    <div class="btn-row" style="margin-top:20px">
      <button class="btn primary" name="action" value="allow" type="submit">allow</button>
      <button class="btn secondary" name="action" value="cancel" type="submit">cancel</button>
    </div>
  </form>
</div>
<p class="disclosure">you can see exactly which devices solstone push reaches — and turn it off — in your services anytime.</p>`,
  });
}

export function renderEnablePushDone() {
  return layout({
    title: 'solstone push enabled',
    body: `${brandbar()}
<div class="card">
  <h2 style="display:flex;align-items:center;gap:9px;font-size:1.15rem">${CHECK_SVG} solstone push enabled</h2>
  <p>your phone is connected to solstone push. you can close this tab.</p>
  <a class="btn secondary" href="/devices">manage solstone push</a>
</div>`,
  });
}

export function renderEnablePushError() {
  return layout({
    title: 'could not enable solstone push',
    body: `${brandbar()}
<div class="card">
  <h1>could not enable solstone push</h1>
  <p>something didn't look right with that link.</p>
  <p>if you got here from your solstone app, try again from the app. if
you got here some other way, you can close this tab.</p>
</div>`,
  });
}

export function renderEnableSplConsent({ csrf, nonce }) {
  return layout({
    title: 'enable private link access',
    body: `${brandbar()}
<h1>enable private link access</h1>
<p class="lead">this journal is asking to enable private link access. two things, and only these two:</p>
<div class="card">
  <div class="grant">
    <div class="n">1</div>
    <div>
      <div class="gt">know this request is yours</div>
      <div class="gd">so the portal can approve this request without receiving anything from the journal — no observations, no entries, nothing sol has experienced alongside you. just: this journal asked for private link access.</div>
    </div>
  </div>
  <div class="grant">
    <div class="n">2</div>
    <div>
      <div class="gt">enable private link access</div>
      <div class="gd">sol pbc records an approval for this journal and hands that approval back through this local handoff. nothing from the journal is sent to sol pbc to do this.</div>
    </div>
  </div>
  <form method="post" action="/enable/spl/confirm">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    <input type="hidden" name="nonce" value="${escAttr(nonce)}">
    <div class="btn-row" style="margin-top:20px">
      <button class="btn primary" name="action" value="allow" type="submit">allow</button>
      <button class="btn secondary" name="action" value="cancel" type="submit">cancel</button>
    </div>
  </form>
</div>
<p class="disclosure">you can review or change private link access from the journal anytime.</p>`,
  });
}

export function renderEnableSplDone() {
  return layout({
    title: 'private link access enabled',
    body: `${brandbar()}
<div class="card">
  <h2 style="display:flex;align-items:center;gap:9px;font-size:1.15rem">${CHECK_SVG} private link access enabled</h2>
  <p>private link access is approved for this journal. you can close this tab.</p>
</div>`,
  });
}

export function renderEnableSplError() {
  return layout({
    title: 'could not enable private link access',
    body: `${brandbar()}
<div class="card">
  <h1>could not enable private link access</h1>
  <p>something didn't look right with that link.</p>
  <p>if you got here from solstone on your device, try again from the journal. otherwise, you can close this tab.</p>
</div>`,
  });
}

// === services surfaces ===

export function renderServicesDashboard({ welcome, menu, scoutActive, deviceCount }) {
  const notice = menu.decryptOk === false
    ? `<p class="notice">we couldn't decrypt your email address. you're still signed in.</p>`
    : '';
  const scoutDesc = scoutActive
    ? 'your alpha-tester service — sol pbc set up a Gemini key on this machine.'
    : 'your alpha-tester service — sol pbc sets up a Gemini key on your machine.';
  const scoutPill = scoutActive
    ? '<span class="pill on"><span class="dot"></span>on</span>'
    : '<span class="pill off"><span class="dot"></span>off</span>';
  const pushPill = deviceCount > 0
    ? `<span class="pill on"><span class="dot"></span>${esc(countLabel(deviceCount, 'device', 'devices'))}</span>`
    : '<span class="pill off"><span class="dot"></span>off</span>';
  const welcomePanel = welcome
    ? `<div class="card" style="margin-bottom:24px">
  <h2>set up a passkey for next time</h2>
  <p>use this device to sign in without typing a code.</p>
  <label for="passkey-friendly-name">device name</label>
  <input id="passkey-friendly-name" type="text" maxlength="64" placeholder="device name (optional)" autocomplete="off">
  <div class="btn-row">
    <button id="passkey-add" class="btn primary" type="button">add a passkey</button>
    <button id="passkey-skip" class="btn secondary" type="button">not now</button>
  </div>
  <div id="passkey-enroll-error" class="error" hidden></div>
</div>`
    : '';
  return layout({
    title: 'your services',
    body: `${topbar(menu)}
<h1>your services</h1>
${notice}
<p class="intro"><strong>solstone runs on your machine.</strong> these services are optional — turn them on when they help, turn them off whenever you want. nothing here is required to use solstone.</p>
${welcomePanel}
<div class="group">
  <a class="row" href="/scout">
    ${IC_SCOUT_SVG}
    <div class="body">
      <div class="title">solstone scout</div>
      <div class="desc">${scoutDesc}</div>
    </div>
    <div class="trail">${scoutPill}${CHEVRON_SVG}</div>
  </a>
  <a class="row" href="/devices">
    ${IC_PUSH_SVG}
    <div class="body">
      <div class="title">solstone push</div>
      <div class="desc">sol can reach your other devices when there's something worth a look.</div>
    </div>
    <div class="trail">${pushPill}${CHEVRON_SVG}</div>
  </a>
  <a class="row" href="/support">
    ${IC_SUPPORT_SVG}
    <div class="body">
      <div class="title">support</div>
      <div class="desc">get help from sol pbc, or follow up on a request you've opened.</div>
    </div>
    <div class="trail">${CHEVRON_SVG}</div>
  </a>
</div>`,
    afterMain: welcome ? `<script>${ENROLL_JS}</script>` : '',
  });
}

// === sign-in surfaces ===

export function renderSignInShell({ sessionCount, passkeyCount, emailCount = 0, menu }) {
  return layout({
    title: 'your sign-in',
    body: `${topbar(menu)}
<a class="back" href="/">${BACK_SVG} your services</a>
<h1>your sign-in</h1>
<p class="lead">how you get into this page to manage your services. solstone itself never asks you to sign in — this is the only place sign-in lives.</p>
<div class="group">
  <a class="row" href="/sign-in/sessions">
    ${IC_SESSION_SVG}
    <div class="body">
      <div class="title">sessions</div>
      <div class="desc">the machines and phones signed in right now — sign any of them out.</div>
    </div>
    <div class="trail"><span class="meta" style="margin:0">${esc(sessionCount)} active</span>${CHEVRON_SVG}</div>
  </a>
  <a class="row" href="/sign-in/passkeys">
    ${IC_PASSKEY_SVG}
    <div class="body">
      <div class="title">passkeys</div>
      <div class="desc">how you sign in. add more than one for backup or a second device.</div>
    </div>
    <div class="trail"><span class="meta" style="margin:0">${esc(passkeyCount)}</span>${CHEVRON_SVG}</div>
  </a>
  <a class="row" href="/sign-in/emails">
    ${IC_EMAIL_SVG}
    <div class="body">
      <div class="title">email addresses</div>
      <div class="desc">for a one-time code when you don't have a passkey handy.</div>
    </div>
    <div class="trail"><span class="meta" style="margin:0">${esc(emailCount)}</span>${CHEVRON_SVG}</div>
  </a>
</div>`,
  });
}

export function renderSignInEmails({ rows, addError = '', removeError = '', menu }) {
  const rowHtml = rows.map((row) => {
    const actionBase = `/sign-in/emails/${escAttr(row.id)}`;
    const badgeClass = row.badge === 'unverified' ? 'off' : 'on';
    const badge = `<span class="pill ${badgeClass}" style="margin-left:4px"><span class="dot"></span>${esc(row.badge)}</span>`;
    const expiry = row.expiryText ? `<div class="meta">${esc(row.expiryText)}</div>` : '';
    const makePrimary = row.badge === 'verified'
      ? `<form method="post" action="${actionBase}/make-primary"><button class="btn secondary" type="submit">make primary</button></form>`
      : '';
    const remove = row.badge === 'primary'
      ? ''
      : `<form method="post" action="${actionBase}/remove"><button class="btn danger" type="submit">remove</button></form>`;
    const verify = row.badge === 'unverified'
      ? `<a class="btn secondary" href="/sign-in/emails/verify?address=${escAttr(row.encodedAddress)}">verify</a>`
      : '';
    const actions = [verify, makePrimary, remove].filter(Boolean).join('');
    const trail = actions ? `<div class="trail">${actions}</div>` : '';
    return `<div class="row" style="cursor:default">
  <div class="body">
    <div class="title">${esc(row.address)}${badge}</div>
    <div class="desc">${esc(row.addedText)}</div>
    ${expiry}
  </div>
  ${trail}
</div>`;
  }).join('');
  const addErrorHtml = addError ? `<p class="error">${esc(addError)}</p>` : '';
  const removeErrorHtml = removeError ? `<p class="error">${esc(removeError)}</p>` : '';
  const emptyState = rows.length === 0 ? '<p>no email addresses for your sign-in.</p>' : '';
  const groupHtml = rowHtml ? `<div class="group">${rowHtml}</div>` : '';
  return layout({
    title: 'email addresses',
    body: `${topbar(menu)}
<a class="back" href="/sign-in">${BACK_SVG} your sign-in</a>
<h1>email addresses</h1>
${removeErrorHtml}
${emptyState}
${groupHtml}
<div class="card">
  <h2>add an email</h2>
  ${addErrorHtml}
  <form method="post" action="/sign-in/emails/add">
    <label for="address">email</label>
    <input id="address" type="email" name="address" autocomplete="email" required placeholder="you@example.com" maxlength="254">
    <button class="btn primary" type="submit">add an email</button>
  </form>
</div>`,
  });
}

export function renderEmailVerify({
  address = '',
  addressInputValue = '',
  error = '',
  alreadyVerified = false,
  menu,
}) {
  if (alreadyVerified) {
    return layout({
      title: 'verify email',
      body: `${topbar(menu)}
<a class="back" href="/sign-in/emails">${BACK_SVG} email addresses</a>
<h1>verify email</h1>
<p class="notice">this email is already verified for your sign-in.</p>
<a class="btn secondary" href="/sign-in/emails">back to email addresses</a>`,
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
    body: `${topbar(menu)}
<a class="back" href="/sign-in/emails">${BACK_SVG} email addresses</a>
<h1>verify email</h1>
<p class="lead">${subhead}</p>
${errorHtml}
<div class="card">
  <form method="post" action="/sign-in/emails/verify">
    ${addressFieldHtml}
    <label for="code">6-digit code</label>
    <input id="code" class="code" name="code" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" autofocus required oninput="this.value=this.value.replace(/\\D/g,'').slice(0,6)">
    <button class="btn primary block" type="submit">verify</button>
  </form>
</div>`,
  });
}

// === transparency / data ===

export function renderTransparency({
  signedIn = true,
  accountId,
  accountCreatedAt,
  lastSigninAt,
  emails,
  passkeys,
  sessions,
  menu,
}) {
  if (!signedIn) {
    return layout({
      title: 'data transparency',
      body: `${brandbar()}
<h1>data transparency</h1>
${TRANSPARENCY_INTRO}
<div class="card">
  <div class="empty">
    ${IC_EMPTY_DATA_SVG}
    <h2>we don't have anything about you</h2>
    <p>sol pbc doesn't know who you are because you haven't signed in yet. without a sign-in, there's no row here for you.</p>
    <a class="btn primary" href="/">sign in to manage your services</a>
  </div>
</div>
<p class="disclosure">the structure is the commitment: what we hold for a sign-in appears here, and when we don't know you, there's nothing to list.</p>`,
    });
  }

  const emailHtml = emails.map((row) => `<div class="row" style="cursor:default"><div class="body">
  <div class="title">${esc(row.address)}${row.isPrimary ? ' <span class="pill on" style="margin-left:4px"><span class="dot"></span>primary</span>' : ''}</div>
  <div class="desc">${row.verifiedAt == null ? 'unverified' : 'verified'} · added ${esc(formatDate(row.createdAt))}</div>
</div></div>`).join('');
  const passkeyHtml = passkeys.map((row) => {
    const status = row.revokedAt == null ? 'active' : `revoked ${formatDate(row.revokedAt)}`;
    return `<div class="row" style="cursor:default"><div class="body">
  <div class="title">${esc(row.name)}</div>
  <div class="desc">created ${esc(formatDate(row.createdAt))} · last used ${esc(row.lastUsedAt == null ? 'never used' : formatDate(row.lastUsedAt))} · ${esc(status)}</div>
  <div class="meta">credential ${esc(row.credentialId)} · aaguid ${esc(row.aaguid || '—')}</div>
</div></div>`;
  }).join('');
  const sessionHtml = sessions.map((row) => {
    const status = row.revokedAt == null ? 'active' : `revoked ${formatDate(row.revokedAt)}`;
    return `<div class="row" style="cursor:default"><div class="body">
  <div class="title">${esc(row.deviceLabel)}</div>
  <div class="desc">${esc(row.ipLabel)} · created ${esc(formatDate(row.createdAt))} · last active ${esc(formatDate(row.lastActiveAt))} · expires ${esc(formatDate(row.expiresAt))} · ${esc(status)}</div>
</div></div>`;
  }).join('');
  return layout({
    title: 'data transparency',
    body: `${topbar(menu)}
<a class="back" href="/">${BACK_SVG} your services</a>
<h1>data transparency</h1>
${TRANSPARENCY_INTRO}
<p class="section-label">sign-in</p>
<div class="group">
  <div class="row" style="cursor:default"><div class="body">
    <div class="meta" style="margin:0">id</div><div class="title" style="font-size:.84rem;font-family:ui-monospace,Menlo,monospace;font-weight:400">${esc(accountId)}</div>
    <div class="desc">created ${esc(formatDate(accountCreatedAt))} · last sign-in ${esc(lastSigninAt == null ? '—' : formatRelativeTime(lastSigninAt, Date.now()))}</div>
  </div></div>
</div>
<p class="section-label">emails</p>
<div class="group">${emailHtml}</div>
<p class="section-label">passkeys</p>
${passkeyHtml ? `<div class="group">${passkeyHtml}</div>` : '<p>no passkeys.</p>'}
<p class="section-label">sessions</p>
${sessionHtml ? `<div class="group">${sessionHtml}</div>` : '<p>no sessions.</p>'}`,
  });
}

export function renderSignInSessions({ rows, currentIdHash, now, menu }) {
  const hasOtherSessions = rows.some((row) => row.id_hash !== currentIdHash);
  const revokeOthers = hasOtherSessions
    ? `<div class="btn-row" style="margin-top:16px"><form method="post" action="/sign-in/sessions/revoke-others">
  <button class="btn danger" type="submit" onclick="return confirm('sign out every other device?')">sign out every other device</button>
</form></div>`
    : '';
  const rowHtml = rows.map((row) => {
    const isCurrent = row.id_hash === currentIdHash;
    const action = `/sign-in/sessions/${escAttr(row.id_hash)}/revoke`;
    const revoke = isCurrent
      ? ''
      : `<div class="trail"><form method="post" action="${action}"><button class="btn danger" type="submit">sign out</button></form></div>`;
    return `<div class="row" style="cursor:default">
  <div class="body">
    <div class="title">${esc(row.deviceLabel)}${isCurrent ? ' <span class="pill on" style="margin-left:4px"><span class="dot"></span>this device</span>' : ''}</div>
    <div class="desc">${esc(row.ipLabel)} · last active ${esc(formatRelativeTime(row.last_active_at, now))} · signed in ${esc(formatRelativeTime(row.created_at, now))}</div>
  </div>
  ${revoke}
</div>`;
  }).join('');
  return layout({
    title: 'sessions',
    body: `${topbar(menu)}
<a class="back" href="/sign-in">${BACK_SVG} your sign-in</a>
<h1>sessions</h1>
<p class="lead">the machines and phones currently signed in to manage your services. sign any of them out — the current one stays.</p>
<div class="group">${rowHtml}</div>
${revokeOthers}`,
  });
}

export function renderServicesDevices({ devices, nowMs, disableFlash = '', menu }) {
  const revokeAll = devices.length > 0
    ? `<div class="btn-row" style="margin-bottom:16px"><form method="post" action="/devices/revoke-all">
  <button class="btn danger" type="submit">revoke all devices</button>
</form></div>`
    : '';
  const notice = disableFlash === 'ok' ? '<p class="notice">push turned off for every device.</p>' : '';
  const emptyState = devices.length === 0
    ? `<div class="group">
  <div class="empty">
    ${IC_PUSH_SVG}
    <h2>push isn't on yet</h2>
    <p>turn it on from solstone on your device — it opens this page so you can confirm, then sol can reach your other devices.</p>
    <div class="notice" style="text-align:left;max-width:none">in solstone, run <strong>journal services enable push</strong> — or turn it on from the solstone app.</div>
  </div>
</div>`
    : '';
  const rowHtml = devices.map((row) => {
    const label = row.device_label || 'unnamed device';
    const appVersion = row.app_version || '—';
    const action = `/devices/${escAttr(row.device_id)}/revoke`;
    const desc = [
      `platform ${row.platform}`,
      `bundle ${row.bundle_id}`,
      `environment ${row.push_token_env}`,
      `app version ${appVersion}`,
      `last seen ${formatRelativeTime(row.last_seen_at, nowMs)}`,
      `registered ${formatDate(row.registered_at)}`,
    ];
    return `<div class="row" style="cursor:default">
  <div class="body">
    <div class="title">${esc(label)}</div>
    <div class="desc">${esc(desc.join(' · '))}</div>
  </div>
  <div class="trail"><form method="post" action="${action}"><button class="btn danger" type="submit">revoke this device</button></form></div>
</div>`;
  }).join('');
  const groupHtml = rowHtml ? `<div class="group">${rowHtml}</div>` : '';
  return layout({
    title: 'your devices',
    body: `${topbar(menu)}
<a class="back" href="/">${BACK_SVG} your services</a>
<h1>your devices</h1>
${notice}
${revokeAll}
${emptyState}
${groupHtml}`,
  });
}

export function renderSignInPasskeys({ rows, enrollJsIncluded, menu }) {
  const emptyState = rows.length === 0
    ? `<p class="empty">no passkeys enrolled. next time you sign in, you'll use an email code.</p>`
    : '';
  const rowHtml = rows.map((row) => {
    const renameAction = `/sign-in/passkeys/${escAttr(row.credential_id)}/rename`;
    const removeAction = `/sign-in/passkeys/${escAttr(row.credential_id)}/remove`;
    return `<div class="row" style="cursor:default">
  ${IC_PASSKEY_SVG}
  <div class="body">
    <div class="title">${esc(row.name)}</div>
    <div class="desc">${esc(row.addedText)} · ${esc(row.lastUsedText)}</div>
    <form method="post" action="${renameAction}" style="margin-top:12px">
      <label for="friendly-name-${escAttr(row.credential_id)}">name</label>
      <input id="friendly-name-${escAttr(row.credential_id)}" name="friendly_name" value="${escAttr(row.friendlyNameInput)}" maxlength="64" autocomplete="off">
      <div class="btn-row"><button class="btn secondary" type="submit">rename</button></div>
    </form>
  </div>
  <div class="trail"><form method="post" action="${removeAction}">
    <button class="btn danger" type="submit" onclick="return confirm('remove this passkey?')">remove</button>
  </form></div>
</div>`;
  }).join('');
  const groupHtml = rowHtml ? `<div class="group">${rowHtml}</div>` : '';
  return layout({
    title: 'passkeys',
    body: `${topbar(menu)}
<a class="back" href="/sign-in">${BACK_SVG} your sign-in</a>
<h1>passkeys</h1>
<p class="lead">how you sign in. you can have more than one — useful for backup, or for signing in from a second device.</p>
${emptyState}
${groupHtml}
<div class="card">
  <h2>add a passkey</h2>
  <label for="passkey-friendly-name">device name</label>
  <input id="passkey-friendly-name" type="text" maxlength="64" placeholder="device name (optional)" autocomplete="off">
  <div class="btn-row"><button id="passkey-add" class="btn primary" type="button">add a passkey</button></div>
  <div id="passkey-enroll-error" class="error" hidden></div>
  </div>`,
    afterMain: enrollJsIncluded ? `<script>${ENROLL_JS}</script>` : '',
  });
}

export function renderServicesScout({ active, rows = [], application, nowMs, flash = {}, menu }) {
  const flashes = flashMessages(flash);
  const activeControls = active
    ? `<div class="btn-row" style="margin-top:16px">
<form method="post" action="/scout/rotate">
  <button class="btn secondary" type="submit">rotate key</button>
</form>
<form method="post" action="/scout/disable">
  <button class="btn danger" type="submit">turn off</button>
</form>
</div>`
    : '';
  const keySection = active
    ? `<div class="group">
  <div class="row" style="cursor:default">
    ${IC_SCOUT_SVG}
    <div class="body">
      <div class="title">Gemini key</div>
      <div class="desc">last used ${esc(geminiLastUsedText(active, nowMs))} · set up ${esc(formatRelativeTime(active.created_at, nowMs))}</div>
    </div>
  </div>
</div>
${activeControls}`
    : '';
  const auditRows = rows.map((row) => {
    const isActive = row.revoked_at == null;
    const forget = isActive
      ? ''
      : `<div class="trail"><form method="post" action="/scout/forget">
    <input type="hidden" name="key_id" value="${escAttr(row.id)}">
    <button class="btn danger" type="submit">forget</button>
  </form></div>`;
    const pill = isActive
      ? '<span class="pill on" style="margin-left:4px"><span class="dot"></span>active</span>'
      : '<span class="pill off" style="margin-left:4px"><span class="dot"></span>rotated out</span>';
    const retired = isActive ? '' : ` · retired ${esc(formatDate(row.revoked_at))}`;
    return `<div class="row" style="cursor:default">
  <div class="body">
    <div class="title">${esc(row.display_name)} ${pill}</div>
    <div class="desc">set up ${esc(formatDate(row.created_at))} · last used ${esc(geminiLastUsedText(row, nowMs))}${retired}</div>
  </div>
  ${forget}
</div>`;
  }).join('');
  const historySection = rows.length > 0
    ? `<p class="section-label">history</p>
<div class="group">${auditRows}</div>
<p class="disclosure">last-used is the one piece of metadata sol pbc keeps — it's here so you can audit the key yourself. sol pbc never sees what you ask sol.</p>`
    : '';
  const page = ({ statusLine, lead, content = '' }) => layout({
    title: 'solstone scout',
    body: `${topbar(menu)}
<a class="back" href="/">${BACK_SVG} your services</a>
${flashes}
<div class="pagehead">
  <h1>solstone scout</h1>
  <p class="signed-in">${statusLine}</p>
</div>
<p class="lead">${lead}</p>
${content}`,
  });

  if (application?.status === 'revoked') {
    return page({
      statusLine: '<span class="pill off" style="vertical-align:middle"><span class="dot"></span>access has ended</span>',
      lead: 'access to solstone scout has ended.',
    });
  }

  if (active) {
    return page({
      statusLine: '<span class="pill on" style="vertical-align:middle"><span class="dot"></span>on</span> &nbsp;solstone scout is on',
      lead: 'sol pbc set up a Google Gemini key for you. the key lives in your journal on this machine and is never shown here.',
      content: `${keySection}
${historySection}`,
    });
  }

  if (application?.status === 'approved') {
    const ackForm = application.data_acked_at == null
      ? `<div class="card">
  <h2>confirm scout terms</h2>
  ${scoutApplyForm({ includeUseCase: false, buttonText: 'i understand' })}
</div>`
      : '';
    return page({
      statusLine: '<span class="pill on" style="vertical-align:middle"><span class="dot"></span>approved</span>',
      lead: 'approved — enable solstone scout in your journal to receive your key.',
      content: `${ackForm}
${historySection}`,
    });
  }

  if (application?.status === 'pending') {
    const pendingText = application.applied_at == null
      ? 'pending'
      : `pending — applied ${formatRelativeTime(application.applied_at, nowMs)}`;
    return page({
      statusLine: `<span class="pill off" style="vertical-align:middle"><span class="dot"></span>${esc(pendingText)}</span>`,
      lead: 'we have your scout request. there is nothing else to do here yet.',
    });
  }

  return page({
    statusLine: '<span class="pill off" style="vertical-align:middle"><span class="dot"></span>off</span>',
    lead: 'request solstone scout for this account.',
    content: `<div class="card">
  <h2>request access</h2>
  ${scoutApplyForm({ includeUseCase: true, buttonText: 'apply' })}
</div>
<p class="disclosure">solstone runs without scout. you can always bring your own Gemini key by hand instead — turning on scout just means sol pbc sets one up for you.</p>`,
  });
}

function scoutApplyForm({ includeUseCase, buttonText }) {
  const useCase = includeUseCase
    ? `<label for="use-case">what would you like to use it for? (optional)</label>
    <textarea id="use-case" name="use_case" maxlength="2000"></textarea>`
    : '';
  return `<form method="post" action="/scout/apply">
    ${scoutCovenantFields()}
    ${useCase}
    <div class="btn-row" style="margin-top:20px">
      <button class="btn primary" type="submit">${esc(buttonText)}</button>
    </div>
  </form>`;
}

function scoutCovenantFields() {
  return `<p class="gd" style="margin:16px 0 12px">${SCOUT_COVENANT_LINE}</p>
    <label style="display:flex;align-items:center;gap:10px;margin-bottom:14px;color:var(--ink)">
      <input type="checkbox" name="data_ack" value="yes" required style="width:auto;min-height:0;margin:0">
      <span>i understand</span>
    </label>`;
}

// === support surfaces ===

export function renderSupportList({
  requests = [],
  nowMs = Date.now(),
  csrf = '',
  notices = [],
  failure = '',
  createConfirmation = null,
  menu,
}) {
  const noticeHtml = supportNotices(notices);
  const failureHtml = failure ? `<p class="error">${esc(failure)}</p>` : '';
  const confirmationHtml = createConfirmation ? supportCreateConfirmation(createConfirmation) : '';
  const rowsHtml = requests.map((row) => `<div class="row" style="cursor:default">
  <div class="body">
    <div class="title"><a href="/support/${escAttr(row.id)}">${esc(row.subject || 'request')}</a></div>
    <div class="desc">${esc(supportStatusLabel(row.status))} · updated ${esc(formatRelativeTime(row.updatedAtMs, nowMs))}</div>
  </div>
</div>`).join('');
  const emptyState = requests.length === 0 && !failure
    ? '<p>no open requests. need help? open one below — or your solstone keeper can file one for you.</p>'
    : '';
  const groupHtml = rowsHtml ? `<div class="group">${rowsHtml}</div>` : '';
  return layout({
    title: 'your support',
    body: `${topbar(menu)}
<a class="back" href="/">${BACK_SVG} your services</a>
<h1>your support</h1>
${noticeHtml}
${failureHtml}
${confirmationHtml}
${emptyState}
${groupHtml}
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
  menu,
}) {
  const noticeHtml = supportNotices(notices);
  const failureHtml = failure ? `<p class="error">${esc(failure)}</p>` : '';
  const messageRows = messages.map((message) => `<div class="row" style="cursor:default">
  <div class="body">
  <div class="title">${esc(supportAuthorLabel(message.author_kind))}</div>
  <p>${esc(message.content || '')}</p>
  <div class="meta">${esc(formatRelativeTime(message.createdAtMs, nowMs))}</div>
  </div>
</div>`).join('');
  const attachmentRows = attachments.length
    ? attachments.map(renderSupportAttachment).join('')
    : '<p>no attachments.</p>';
  const id = request?.id || '';
  return layout({
    title: request?.subject || 'your support',
    body: `${topbar(menu)}
<a class="back" href="/">${BACK_SVG} your services</a>
<h1>${esc(request?.subject || 'your support')}</h1>
${noticeHtml}
${failureHtml}
<p class="meta">${esc(supportStatusLabel(request?.status))}</p>
<h2>messages</h2>
${messageRows ? `<div class="group">${messageRows}</div>` : '<p>no messages.</p>'}
<h2>attachments</h2>
${attachments.length ? `<div class="group">${attachmentRows}</div>` : attachmentRows}
<div class="card">
  <h2>reply</h2>
  <p>add a reply, or attach a screenshot or log.</p>
  <p class="notice">screenshots and logs are used only to triage your request — once we've reviewed them, the files are deleted and can't be recovered. after you submit, they're not viewable or downloadable here, and we keep only a short summary from triage — never the files themselves.</p>
  <form method="post" action="/support/${escAttr(id)}/reply" enctype="multipart/form-data">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    <label for="reply-content">reply</label>
    <textarea id="reply-content" name="content" required maxlength="5000"></textarea>
    <label for="reply-file">attachments</label>
    <p>optional screenshots/logs</p>
    <input id="reply-file" type="file" name="file" multiple>
    <button class="btn primary" type="submit">reply</button>
  </form>
</div>`,
  });
}

export function renderSupportNotFound({ menu } = {}) {
  return layout({
    title: 'request not found',
    body: `${topbar(menu)}
<a class="back" href="/">${BACK_SVG} your services</a>
<h1>request not found</h1>
<p>we couldn't find that request.</p>
<a class="btn secondary" href="/support">back to your support</a>`,
  });
}

export function renderGoodbye() {
  return layout({
    title: 'signed out',
    body: `${brandbar()}
<h1>signed out.</h1>
<p class="lead">see you next time.</p>
<a class="btn secondary" href="/">start over</a>`,
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
    body: `${brandbar()}
<div class="card">
  <h1>we couldn't verify this sign-in</h1>
  <p>your email security may have modified the link you used to get here.</p>
  <p>to continue, open <strong>https://services.solstone.app</strong> directly in a new browser tab and request a new code.</p>
  <p><a href="https://services.solstone.app">open services.solstone.app</a></p>
</div>`,
  });
}

export function renderNotFound() {
  return layout({
    title: 'not found',
    body: `${brandbar()}
<h1>not found</h1>
<p class="lead">nothing at this address.</p>
<a class="btn secondary" href="/">back to home</a>`,
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
  return `<div class="card">
  <h2>open a request</h2>
  <p>tell us what's going on. you can attach screenshots or logs here — it's easier than email.</p>
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
    <p class="notice">screenshots and logs are used only to triage your request — once we've reviewed them, the files are deleted and can't be recovered. after you submit, they're not viewable or downloadable here, and we keep only a short summary from triage — never the files themselves.</p>
    <p>optional screenshots/logs</p>
    <input id="support-file" type="file" name="file" multiple>
    <button class="btn primary" type="submit">open a request</button>
  </form>
</div>`;
}

function renderSupportAttachment(attachment) {
  const filename = esc(attachment.filename || 'attachment');
  if (attachment.status === 'removed') {
    const summary = attachment.triage_summary ? ` ${esc(attachment.triage_summary)}` : '';
    return `<div class="row" style="cursor:default">
  <div class="body">
    <div class="title">${filename}</div>
    <div class="desc">attachment removed after triage${summary}</div>
  </div>
</div>`;
  }
  const status = attachment.status === 'pending' ? '<div class="desc">pending</div>' : '';
  return `<div class="row" style="cursor:default">
  <div class="body">
    <div class="title">${filename}</div>
    ${status}
  </div>
</div>`;
}

function flashMessages(flash) {
  const messages = [];
  if (flash.rotated === 'ok') messages.push('key rotated.');
  if (flash.rotated === 'conflict') messages.push('another rotation completed first. try again.');
  if (flash.rotated === 'no_active_key') messages.push('no active key to rotate.');
  if (flash.rotated === 'rotation_failed') messages.push("key rotation didn't finish. try again.");
  if (flash.apply === 'ok') messages.push('scout request received.');
  if (flash.apply === 'acked') messages.push('scout acknowledgement saved.');
  if (flash.apply === 'no_ack') messages.push('confirm you understand before continuing.');
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
