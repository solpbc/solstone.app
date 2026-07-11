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
  operator: 'solstone support',
  agent: 'sol',
  anonymous: 'you (via the form)',
};
const MARK_SVG = '<svg class="mark" viewBox="2.5 2.5 27 27" role="img" aria-label="solstone"><path fill="#FFCF33" d="M16.0 2.5 L18.6 7.3 A9.1 9.1 0 0 0 13.4 7.3 Z M23.9 5.1 L23.2 10.5 A9.1 9.1 0 0 0 19.0 7.4 Z M28.8 11.8 L25.1 15.8 A9.1 9.1 0 0 0 23.5 10.9 Z M28.8 20.2 L23.5 21.1 A9.1 9.1 0 0 0 25.1 16.2 Z M23.9 26.9 L19.0 24.6 A9.1 9.1 0 0 0 23.2 21.5 Z M16.0 29.5 L13.4 24.7 A9.1 9.1 0 0 0 18.6 24.7 Z M8.1 26.9 L8.8 21.5 A9.1 9.1 0 0 0 13.0 24.6 Z M3.2 20.2 L6.9 16.2 A9.1 9.1 0 0 0 8.5 21.1 Z M3.2 11.8 L8.5 10.9 A9.1 9.1 0 0 0 6.9 15.8 Z M8.1 5.1 L13.0 7.4 A9.1 9.1 0 0 0 8.8 10.5 Z"/><circle cx="16" cy="16" r="6.5" fill="none" stroke="#E8923A" stroke-width="1.7"/></svg>';
const CHEVRON_SVG = '<svg class="chevron" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l6 6-6 6"/></svg>';
const CARET_SVG = '<svg class="caret" viewBox="0 0 11 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l4.5 4.5L10 1"/></svg>';
const EXT_SVG = '<svg class="ext" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l6-6M5 3h4v4"/></svg>';
const BACK_SVG = '<svg viewBox="0 0 8 14" width="7" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 1L1 7l6 6"/></svg>';
const IC_SCOUT_SVG = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8.5" r="4"/><path d="M10.8 11.2 19 19.4M16.4 16.8l1.8-1.8M18.6 19l1.8-1.8"/></svg>';
const IC_PUSH_SVG = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9.5a6 6 0 1 1 12 0c0 4.5 2 5.5 2 5.5H4s2-1 2-5.5Z"/><path d="M10 18.5a2 2 0 0 0 4 0"/></svg>';
const IC_SUPPORT_SVG = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5h16v10H8.5L4 19z"/><path d="M8 9.5h8M8 12.5h5"/></svg>';
const IC_NEWS_SVG = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h7l5 5V20a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z"/><path d="M13 3.5V8.5h5"/><path d="M9 13h6M9 16h4"/></svg>';
const IC_SESSION_SVG = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 20c0-3.4 3-6 6.5-6s6.5 2.6 6.5 6"/></svg>';
const IC_PASSKEY_SVG = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="14" r="3.4"/><path d="M10.6 11.4 19 3M16 6l2 2M14 8l1.6 1.6"/></svg>';
const IC_EMAIL_SVG = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3.5 7.5 12 13l8.5-5.5"/></svg>';
const IC_EMPTY_DATA_SVG = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="6.5" ry="3"/><path d="M5.5 6v8c0 1.7 2.9 3 6.5 3 .9 0 1.8-.1 2.6-.3"/><path d="M18.5 6v5.5"/><path d="M5.5 10c0 1.7 2.9 3 6.5 3 1.7 0 3.2-.3 4.4-.8"/><path d="M17 15l4 4M21 15l-4 4"/></svg>';
const IC_NET = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2.4"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><path d="M6.6 7.4 10 10.4M17.4 7.4 14 10.4M6.6 16.6 10 13.6M17.4 16.6 14 13.6"/></svg>';
const IC_BACKUP = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/></svg>';
const IC_VAULT = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="12" cy="12" r="3.2"/><path d="M12 12v3"/></svg>';
const IC_CHIP = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="10" height="10" rx="1.5"/><rect x="10.5" y="10.5" width="3" height="3"/><path d="M10 4v3M14 4v3M10 17v3M14 17v3M4 10h3M4 14h3M17 10h3M17 14h3"/></svg>';
const IC_GLOBE = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.3 3.7 5.4 3.7 8.5S14.4 18.2 12 20.5C9.6 18.2 8.3 15.1 8.3 12S9.6 5.8 12 3.5Z"/></svg>';
const CHECK_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B06A1A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M8 12.2l2.6 2.6L16 9"/></svg>';
const SCOUT_COVENANT_LINE = "your questions to sol go straight to Google Gemini under Google's terms. sol pbc sets up the key but never sits between you and Gemini, and never sees what you ask.";
const TRANSPARENCY_INTRO = `<p class="intro">everything sol pbc holds for your sign-in is on this page. nothing more. no journal, no behavior, no tracking. we don't have your name, your phone, your address, or where you are: no analytics, no behavioral data, no third-party tracking. these aren't promises, they're structural commitments under <a href="https://solpbc.org/articles#s8-3">Article 8 of our articles of incorporation</a> (restated 2026-05-01) and <a href="https://solpbc.org/bylaws#art-3">Article III of the bylaws</a>.</p>`;

function brandbar() {
  return `<div class="brandbar">${MARK_SVG}<span class="wordmark">solstone</span></div>`;
}

function footer() {
  return `<footer class="footer"><a href="/transparency">data transparency</a><a href="/support">support</a><a href="/terms">terms</a><a href="https://solpbc.org/privacy">how we earn your trust ${EXT_SVG}</a><a href="https://solstone.app">solstone.app →</a></footer>`;
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

const BRANDLOCK = `<p class="brandlock"><span class="dot"></span>your journal is always private, only yours.</p>`;

function brandbarSignin() {
  return `<div class="topbar"><a class="home" href="/">${MARK_SVG}<span class="wordmark">solstone</span></a><a href="/?signin" style="color:var(--orange-ink);font-weight:600;text-decoration:none">sign in</a></div>`;
}

function row(href, ic, title, desc, trail) {
  return `<a class="row" href="${href}">${ic}<div class="body"><div class="title">${title}</div><div class="desc">${desc}</div></div><div class="trail">${trail}${CHEVRON_SVG}</div></a>`;
}

function pill(kind, label) {
  return `<span class="pill ${kind}"><span class="dot"></span>${label}</span>`;
}

function beat(ic, t, d) {
  return `<div class="beat">${ic.replace('class="ic"', 'class="ic bi"')}<div><p class="bt">${t}</p><p class="bd">${d}</p></div></div>`;
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

export function renderLanding(turnstileSiteKey, csrf, resume = {}, subhead = "sign in to manage the optional services you've turned on. sol and your journal run on your devices. you don't sign in to use them.") {
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
<p class="disclosure">no analytics, no tracking, no third parties. this is the only solstone surface that ever knows it's you, and only after you sign in.</p>`,
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
    title: 'enable scout',
    body: `${brandbar()}
<h1>enable scout</h1>
<p class="lead">solstone on this device wants to enable scout for you. two things, and only these two:</p>
<div class="card">
  <div class="grant">
    <div class="n">1</div>
    <div>
      <div class="gt">know it's you</div>
      <div class="gd">so your sign-in recognizes this device. nothing from your journal comes with it: no entries, nothing sol has taken in alongside you. just: this is your device.</div>
    </div>
  </div>
  <div class="grant">
    <div class="n">2</div>
    <div>
      <div class="gt">enable scout</div>
      <div class="gd">sol pbc creates a Google Gemini key on your behalf and hands it to this device. the key is yours and it stays on your device. sol pbc sets it up. it never sits between you and Gemini, and never sees what you ask sol.</div>
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
<p class="disclosure">you can see exactly what you enabled, and turn either off, in your services anytime.</p>`,
  });
}

export function renderEnableScoutDone() {
  return layout({
    title: 'scout enabled',
    body: `${brandbar()}
<div class="card">
  <h2 style="display:flex;align-items:center;gap:9px;font-size:1.15rem">${CHECK_SVG} scout enabled</h2>
  <p>sol pbc set up a Gemini key for you and put it on this device. you never had to touch it, and nothing from your journal crossed to set it up. you can close this tab.</p>
  <a class="btn secondary" href="/scout">manage scout</a>
</div>`,
  });
}

export function renderEnableScoutPendingDone() {
  return layout({
    title: 'scout request received',
    body: `${brandbar()}
<div class="card">
  <h2 style="display:flex;align-items:center;gap:9px;font-size:1.15rem">${CHECK_SVG} scout request received</h2>
  <p>scout is invite-only right now, and your request is under review. nothing was set up yet, and nothing from your journal crossed.</p>
  <p>once approved, you'll be able to enable scout from your services.</p>
  <a class="btn secondary" href="/">open your services</a>
</div>`,
  });
}

export function renderEnableScoutRevokedDone() {
  return layout({
    title: "scout isn't available",
    body: `${brandbar()}
<div class="card">
  <h2>scout isn't available</h2>
  <p>scout isn't available for this sign-in. nothing was set up.</p>
</div>`,
  });
}

export function renderEnableScoutError({ message }) {
  return layout({
    title: 'could not enable scout',
    body: `${brandbar()}
<div class="card">
  <h1>could not enable scout</h1>
  <p>${esc(message || 'that request could not be completed.')}</p>
  <p>if you got here from solstone on your device, run the enable command again for a fresh link. otherwise, you can close this tab.</p>
</div>`,
  });
}

export function renderEnablePushConsent({ csrf, nonce, deviceToken, platform, bundleId }) {
  return layout({
    title: 'enable notifications',
    body: `${brandbar()}
<h1>enable notifications</h1>
<p class="lead">notifications want to reach this device for you. two things, and only these two:</p>
<div class="card">
  <div class="grant">
    <div class="n">1</div>
    <div>
      <div class="gt">know it's you</div>
      <div class="gd">so your sign-in recognizes this device. nothing from your journal comes with it: no entries, nothing sol has taken in alongside you. just: this is your phone.</div>
    </div>
  </div>
  <div class="grant">
    <div class="n">2</div>
    <div>
      <div class="gt">enable notifications</div>
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
<p class="disclosure">you can see exactly which devices notifications reach, and turn it off, in your services anytime.</p>`,
  });
}

export function renderEnablePushDone() {
  return layout({
    title: 'notifications enabled',
    body: `${brandbar()}
<div class="card">
  <h2 style="display:flex;align-items:center;gap:9px;font-size:1.15rem">${CHECK_SVG} notifications enabled</h2>
  <p>your phone is connected to notifications. you can close this tab.</p>
  <a class="btn secondary" href="/devices">manage notifications</a>
</div>`,
  });
}

export function renderEnablePushError() {
  return layout({
    title: 'could not enable notifications',
    body: `${brandbar()}
<div class="card">
  <h1>could not enable notifications</h1>
  <p>something didn't look right with that link.</p>
  <p>if you got here from your solstone app, try again from the app. if
you got here some other way, you can close this tab.</p>
</div>`,
  });
}

export function renderEnableSplConsent({ csrf, nonce, instance = '', entitled = false }) {
  const instanceInput = instance
    ? `<input type="hidden" name="instance" value="${escAttr(instance)}">`
    : '';
  const disclosure = entitled
    ? '<p class="disclosure">you can review or change private network access from the journal anytime.</p>'
    : '<p class="disclosure"><a href="/private-network">set up your private network</a>. sol pbc runs the relay for you.</p>';
  return layout({
    title: 'enable private network access',
    body: `${brandbar()}
<h1>enable private network access</h1>
<p class="lead">this journal is asking to enable private network access. two things, and only these two:</p>
<div class="card">
  <div class="grant">
    <div class="n">1</div>
    <div>
      <div class="gt">know this request is yours</div>
      <div class="gd">so the portal can approve this request without receiving anything from the journal: no entries, nothing sol has taken in alongside you. just: this journal asked for private network access.</div>
    </div>
  </div>
  <div class="grant">
    <div class="n">2</div>
    <div>
      <div class="gt">enable private network access</div>
      <div class="gd">sol pbc records an approval for this journal and hands that approval back through this local handoff. nothing from the journal is sent to sol pbc to do this.</div>
    </div>
  </div>
  <form method="post" action="/enable/spl/confirm">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    <input type="hidden" name="nonce" value="${escAttr(nonce)}">
    ${instanceInput}
    <div class="btn-row" style="margin-top:20px">
      <button class="btn primary" name="action" value="allow" type="submit">allow</button>
      <button class="btn secondary" name="action" value="cancel" type="submit">cancel</button>
    </div>
  </form>
</div>
${disclosure}`,
  });
}

export function renderEnableSplDone() {
  return layout({
    title: 'private network access enabled',
    body: `${brandbar()}
<div class="card">
  <h2 style="display:flex;align-items:center;gap:9px;font-size:1.15rem">${CHECK_SVG} private network access enabled</h2>
  <p>private network access is approved for this journal. you can close this tab.</p>
</div>`,
  });
}

export function renderEnableSplNeedsSubscription() {
  return layout({
    title: 'private network needed',
    body: `${brandbar()}
<div class="card">
  <h2 style="display:flex;align-items:center;gap:9px;font-size:1.15rem">private network needed</h2>
  <p>sol pbc runs the relay for your private network before this journal can use it.</p>
  <a class="btn primary" href="/private-network">set up your private network</a>
</div>`,
  });
}

export function renderEnableSplError() {
  return layout({
    title: 'could not enable private network access',
    body: `${brandbar()}
<div class="card">
  <h1>could not enable private network access</h1>
  <p>something didn't look right with that link.</p>
  <p>if you got here from solstone on your device, try again from the journal. otherwise, you can close this tab.</p>
</div>`,
  });
}

export function renderEnableSpbConsent({ csrf, nonce, instance = '', entitled = false }) {
  const instanceInput = instance
    ? `<input type="hidden" name="instance" value="${escAttr(instance)}">`
    : '';
  const disclosure = entitled
    ? '<p class="disclosure">you can review or change encrypted backup from the journal anytime.</p>'
    : '<p class="disclosure"><a href="/services/backup">set up encrypted backup</a>. sol pbc keeps the encrypted copy for you.</p>';
  return layout({
    title: 'enable encrypted backup',
    body: `${brandbar()}
<h1>enable encrypted backup</h1>
<p class="lead">this journal is asking to enable encrypted backup. two things, and only these two:</p>
<div class="card">
  <div class="grant">
    <div class="n">1</div>
    <div>
      <div class="gt">know this request is yours</div>
      <div class="gd">so the portal can approve this request without receiving anything from the journal: no entries, nothing sol has taken in alongside you. just: this journal asked for encrypted backup.</div>
    </div>
  </div>
  <div class="grant">
    <div class="n">2</div>
    <div>
      <div class="gt">enable encrypted backup</div>
      <div class="gd">sol pbc records this journal's backup prefix and hands back a broker token through this local handoff. the encrypted backup remains readable only by you.</div>
    </div>
  </div>
  <form method="post" action="/enable/backup/confirm">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    <input type="hidden" name="nonce" value="${escAttr(nonce)}">
    ${instanceInput}
    <div class="btn-row" style="margin-top:20px">
      <button class="btn primary" name="action" value="allow" type="submit">allow</button>
      <button class="btn secondary" name="action" value="cancel" type="submit">cancel</button>
    </div>
  </form>
</div>
${disclosure}`,
  });
}

export function renderEnableSpbDone() {
  return layout({
    title: 'encrypted backup enabled',
    body: `${brandbar()}
<div class="card">
  <h2 style="display:flex;align-items:center;gap:9px;font-size:1.15rem">${CHECK_SVG} encrypted backup enabled</h2>
  <p>encrypted backup is approved for this journal. you can close this tab.</p>
</div>`,
  });
}

export function renderEnableSpbNeedsSubscription() {
  return layout({
    title: 'encrypted backup needed',
    body: `${brandbar()}
<div class="card">
  <h2 style="display:flex;align-items:center;gap:9px;font-size:1.15rem">encrypted backup needed</h2>
  <p>sol pbc keeps the encrypted copy for you before this journal can use encrypted backup.</p>
  <a class="btn primary" href="/services/backup">set up encrypted backup</a>
</div>`,
  });
}

export function renderEnableSpbError() {
  return layout({
    title: 'could not enable encrypted backup',
    body: `${brandbar()}
<div class="card">
  <h1>could not enable encrypted backup</h1>
  <p>something didn't look right with that link.</p>
  <p>if you got here from solstone on your device, try again from the journal. otherwise, you can close this tab.</p>
</div>`,
  });
}

export function renderEnableSppConsent({ csrf, nonce, instance = '' }) {
  const instanceInput = instance
    ? `<input type="hidden" name="instance" value="${escAttr(instance)}">`
    : '';
  return layout({
    title: 'enable confidential processing',
    body: `${brandbar()}
<h1>enable confidential processing</h1>
<p class="lead">this journal is asking to turn on confidential processing. here's exactly what that means — and it stays off until you allow it.</p>
<div class="card">
  <div class="grant">
    <div class="n">1</div>
    <div>
      <div class="gt">know this request is yours</div>
      <div class="gd">so the portal can approve this request without receiving anything from the journal: no entries, nothing sol has taken in alongside you. just: this journal asked for confidential processing.</div>
    </div>
  </div>
  <div class="grant">
    <div class="n">2</div>
    <div>
      <div class="gt">what leaves your device</div>
      <div class="gd">when sol uses confidential processing, only the thinking leaves this device — <a href="/confidential-processing/data">the text and images sol needs a model to work through</a>. your journal never leaves; it stays on your computer. your recordings never leave either — speech is turned to text on your device first. what leaves goes to a model sol pbc runs itself: no third-party AI provider is in the path. it's processed and not kept — no content retained, no human review, nothing used to train.</div>
    </div>
  </div>
  <div class="grant">
    <div class="n">3</div>
    <div>
      <div class="gt">your journal must verify before it sends</div>
      <div class="gd">before anything is sent, your journal must verify the service on the other end, and it only sends if that check passes — if it can't verify, it doesn't send, and sol tells you why. the engine runs on confidential hardware sol pbc operates: a model sol pbc runs itself, with no third-party AI provider in the path. sol pbc hands this device a credential through this local handoff so only this journal can reach the engine; the credential lives on your device, and sol pbc keeps only a hash of it.</div>
    </div>
  </div>
  <form method="post" action="/enable/spp/confirm">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    <input type="hidden" name="nonce" value="${escAttr(nonce)}">
    ${instanceInput}
    <label style="display:flex;align-items:center;gap:10px;margin-bottom:14px;color:var(--ink)">
      <input type="checkbox" name="data_ack" value="yes" required style="width:auto;min-height:0;margin:0">
      <span>i understand what turning this on sends, and that my journal must verify the service before anything is sent.</span>
    </label>
    <div class="btn-row" style="margin-top:20px">
      <button class="btn primary" name="action" value="allow" type="submit">allow</button>
      <button class="btn secondary" name="action" value="cancel" type="submit" formnovalidate>cancel</button>
    </div>
  </form>
</div>
<p class="disclosure">confidential processing is in early access — scouts get it first. it stays off until you allow it here, and you can turn it off from the journal anytime.</p>`,
  });
}

export function renderEnableSppEarlyAccess() {
  return layout({
    title: 'confidential processing is coming',
    body: `${brandbar()}
<div class="card">
  <h2 style="display:flex;align-items:center;gap:9px;font-size:1.15rem">confidential processing is coming</h2>
  <p>confidential processing lets sol think through your journal's text and images on a model sol pbc runs itself — on confidential hardware sol pbc operates, which keeps nothing: it's processed and not kept, no content retained, no human review, nothing used to train. your journal must verify the service before anything is sent — if it can't verify, it doesn't send. no third-party AI provider is ever in the path.</p>
  <p>this journal isn't in the scout alpha yet, so there's nothing to enable here. you can close this tab.</p>
</div>`,
  });
}

export function renderEnableSppDone() {
  return layout({
    title: 'confidential processing enabled',
    body: `${brandbar()}
<div class="card">
  <h2 style="display:flex;align-items:center;gap:9px;font-size:1.15rem">${CHECK_SVG} confidential processing enabled</h2>
  <p>confidential processing is approved for this journal. you can close this tab.</p>
</div>`,
  });
}

export function renderEnableSppError() {
  return layout({
    title: 'could not enable confidential processing',
    body: `${brandbar()}
<div class="card">
  <h1>could not enable confidential processing</h1>
  <p>something didn't look right with that link.</p>
  <p>if you got here from solstone on your device, try again from the journal. otherwise, you can close this tab.</p>
</div>`,
  });
}

// === services surfaces ===

export function renderServicesCatalog({ signedIn, welcome = false, menu = {}, scoutActive = false, deviceCount = 0, networkActive = false, backupActive = false, sppActive = false } = {}) {
  if (!signedIn) {
    return layout({
      title: 'solstone services',
      body: `${brandbarSignin()}
<h1>solstone services</h1>
${BRANDLOCK}
<p class="intro"><strong>sol and your journal run on your devices.</strong> these are the optional parts sol pbc runs for you. turn one on when it helps, off whenever you want. nothing here is required to use solstone.</p>
<div class="group">
  ${row('/private-network', IC_NET, 'private network', 'reach your journal from your phone, from anywhere, over a private network only your devices can enter.', '<span class="price">$20<span class="per">/yr</span></span>')}
  ${row('/backup', IC_BACKUP, 'encrypted backup', 'keep an encrypted copy of your journal somewhere safe. only you can read it.', '<span class="price">$48<span class="per">/yr</span></span>')}
  ${row('/notifications', IC_PUSH_SVG, 'notifications', 'let sol reach you when there’s something worth a look.', '<span class="tag builtin">built in</span>')}
  ${row('/sealed-container', IC_VAULT, 'sealed container', 'your whole journal, run for you inside a sealed box even sol pbc can’t see into.', '<span class="tag soon">coming</span>')}
  ${row('/confidential-processing', IC_CHIP, 'confidential processing', 'let sol think off your device — on confidential hardware sol pbc runs that keeps nothing.', '<span class="tag soon">coming</span>')}
  ${row('/scout', IC_SCOUT_SVG, 'scout', 'join the alpha. we set you up with a Gemini key on your device.', '<span class="tag free">free</span>')}
</div>
<p class="disclosure">no analytics, no tracking, no third parties. sign in only to manage what you’ve turned on. solstone itself never asks you to sign in.</p>`,
    });
  }

  const notice = menu.decryptOk === false
    ? `<p class="notice">we couldn't decrypt your email address. you're still signed in.</p>`
    : '';
  const networkPill = pill(networkActive ? 'on' : 'off', networkActive ? 'on' : 'off');
  const backupPill = pill(backupActive ? 'on' : 'off', backupActive ? 'on' : 'off');
  const notifPill = pill(deviceCount > 0 ? 'on' : 'off', deviceCount > 0 ? 'on' : 'off');
  const sppPill = pill(sppActive ? 'on' : 'off', sppActive ? 'on' : 'off');
  const scoutPill = pill(scoutActive ? 'on' : 'off', scoutActive ? 'on' : 'off');
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
${BRANDLOCK}
<p class="intro"><strong>sol and your journal run on your devices.</strong> these services are optional. turn them on when they help, off whenever you want. nothing here is required.</p>
${welcomePanel}
<div class="group">
  ${row('/private-network', IC_NET, 'private network', 'your private network: reach your journal from anywhere.', networkPill)}
  ${row('/services/backup', IC_BACKUP, 'encrypted backup', 'an encrypted copy only you can read.', backupPill)}
  ${row('/notifications', IC_PUSH_SVG, 'notifications', 'sol reaches you when it matters, built in.', notifPill)}
  ${row('/sealed-container', IC_VAULT, 'sealed container', 'your journal in a sealed box.', '<span class="tag soon">coming</span>')}
  ${row('/confidential-processing', IC_CHIP, 'confidential processing', 'sol’s thinking, off your device on confidential hardware.', sppPill)}
  ${row('/scout', IC_SCOUT_SVG, 'scout', 'a Gemini key on your device.', scoutPill)}
</div>
<div class="group" style="margin-top:22px">
  ${row('/sign-in', IC_SESSION_SVG, 'your sign-in', 'sessions, passkeys, and email addresses.', '')}
  ${row('/transparency', IC_EMPTY_DATA_SVG, 'data transparency', 'everything sol pbc holds for your sign-in.', '')}
</div>`,
    afterMain: welcome ? `<script>${ENROLL_JS}</script>` : '',
  });
}

export function renderPrivateNetworkLanding() {
  return layout({
    title: 'private network',
    body: brandbarSignin()
      + `\n<a class="back" href="/">${BACK_SVG} services</a>
<h1>private network</h1>
<p class="hero-tag">your private network</p>
<p class="lead">reach your journal from your phone, your laptop, from anywhere: a private network only your own devices can enter, like a vpn dedicated to solstone. your journal never leaves home; your devices just reach it.</p>
${BRANDLOCK}
<div class="card">
  ${beat(IC_NET, 'your own network, always free', 'on the same wifi, or over your own vpn, your devices reach your journal directly. sol pbc is never in the path.')}
  ${beat(IC_GLOBE, 'your private network, from anywhere', 'sol pbc runs a blind relay so your devices stay reachable when you’re away from home or asleep, your private network spanning wherever your devices are. operated by sol pbc.')}
  ${beat(IC_VAULT, 'blind by construction', 'the relay passes along encrypted bytes it can’t read. sol pbc operates it but <strong>cannot see your traffic</strong>. there’s no key to reveal, by design, not by promise.')}
</div>
<div class="card">
  <div class="pricecard">
    <div><div class="big">$20 <span class="price"><span class="per">/ year</span></span></div><div class="alt">or $2.49 / month · per journal, not per device</div></div>
    <a class="btn primary" href="/?signin">sign in to enable</a>
  </div>
  <p class="free-note" style="margin:14px 0 0">you never have to pay us. on your own network (same wifi, or your own vpn), reaching your journal is always free. this only covers the relay sol pbc runs for you.</p>
</div>
<p class="disclosure">open source, self-hostable. run your own relay if you’d rather. <a href="/terms">terms</a></p>`,
  });
}

export function renderBackupLanding() {
  return layout({
    title: 'encrypted backup',
    body: brandbarSignin()
      + `\n<a class="back" href="/">${BACK_SVG} services</a>
<h1>encrypted backup</h1>
<p class="lead">keep an encrypted copy of your journal somewhere safe: encrypted on your device before it ever leaves, so only you can read it.</p>
${BRANDLOCK}
<div class="card">
  ${beat(IC_BACKUP, 'your own bucket, always free', 'point solstone at your own storage: backblaze b2, s3, any bucket. sol pbc is never in the path.')}
  ${beat(IC_GLOBE, 'operated by sol pbc, $48/year', "rather not run a bucket? let sol pbc keep the encrypted copy for you, in storage sol pbc operates. it's encrypted on your device first, so sol pbc only ever holds an unreadable blob.")}
  ${beat(IC_VAULT, 'encrypted before it leaves', 'your journal is encrypted on your device with a key only you hold. whoever stores the copy only ever sees an unreadable blob.')}
</div>
<div class="card">
  <div class="pricecard">
    <div><div class="big">$48 <span class="price"><span class="per">/ year</span></span></div><div class="alt">or $4.99 / month · operated by sol pbc</div></div>
    <a class="btn primary" href="/?signin">sign in to enable</a>
  </div>
  <p class="free-note" style="margin:14px 0 0">you never have to pay us. bring your own bucket (backblaze b2, s3, any bucket) free, set up from your journal. this only covers the storage sol pbc runs for you.</p>
</div>
<p class="disclosure">open source, self-hostable. <a href="/services/backup/terms">terms</a></p>`,
  });
}

export function renderNotificationsLanding() {
  return layout({
    title: 'notifications',
    body: brandbarSignin()
      + `\n<a class="back" href="/">${BACK_SVG} services</a>
<h1>notifications</h1>
<p class="hero-tag">built in</p>
<p class="lead">let sol reach you on your devices when there’s something worth a look: a short heads-up, never the full thing.</p>
${BRANDLOCK}
<div class="card">
  ${beat(IC_PUSH_SVG, 'built into solstone', 'notifications come with solstone, free, with no hosted service to enable. you turn them on for each device, and choose what reaches you.')}
  ${beat(IC_GLOBE, 'on your devices', 'sol sends a short summary to your phone or laptop: an 80-character heads-up, never the content itself.')}
  ${beat(IC_VAULT, 'not a tracking surface', 'no analytics, no behavioral profiling, no third parties. notifications never become a way to watch you: Article 8.')}
</div>
<div class="card">
  <div class="statusline"><span class="tag builtin">built in</span> <span>turn on notifications on each device you want to hear from.</span></div>
</div>
<p class="disclosure"><a href="/terms">terms</a></p>`,
  });
}

export function renderSealedContainerLanding() {
  return layout({
    title: 'sealed container',
    body: brandbarSignin()
      + `\n<a class="back" href="/">${BACK_SVG} services</a>
<h1>sealed container</h1>
<p class="hero-tag">your journal, in a sealed box</p>
<p class="lead">your whole journal, run for you inside a per-owner sealed container that even sol pbc can’t see into.</p>
${BRANDLOCK}
<div class="card">
  ${beat(IC_VAULT, 'the whole journal, run for you', 'not just a copy or a way in: your entire journal runs inside the sealed container, so you don’t have to run anything yourself.')}
  ${beat(IC_NET, 'hardware-sealed', 'it runs inside a hardware-attested AMD SEV-SNP container. sol pbc operates the box but cannot open it.')}
  ${beat(IC_GLOBE, 'mathematical, not contractual', 'you can verify your own enclave. the privacy is enforced by hardware, not promised by policy.')}
</div>
<div class="card">
  <div class="statusline"><span class="tag soon">coming soon</span><span>this isn’t available yet. pricing at launch.</span></div>
</div>
<p class="disclosure"><a href="/terms">terms</a></p>`,
  });
}

export function renderConfidentialProcessingLanding() {
  return layout({
    title: 'confidential processing',
    body: brandbarSignin()
      + `\n<a class="back" href="/">${BACK_SVG} services</a>
<h1>confidential processing</h1>
<p class="hero-tag">let sol think off your device</p>
<p class="lead">sol sends <a href="/confidential-processing/data">only the thinking off your device</a> — never your journal, which stays on your computer. it runs on confidential hardware sol pbc operates — a model sol pbc runs itself, with no third-party AI provider in the path.</p>
${BRANDLOCK}
<div class="card">
  ${beat(IC_CHIP, 'the thinking, off your device', 'let sol think off your device — on confidential hardware sol pbc runs that keeps nothing.')}
  ${beat(IC_VAULT, "sol pbc's own engine", "a model sol pbc runs itself, with no third-party AI provider in the path. it runs on confidential GPUs in Microsoft Azure that sol pbc operates, where the hardware boundary keeps the cloud host excluded from what's processed.")}
  ${beat(IC_EMPTY_DATA_SVG, 'kept for nothing', 'no content is retained · no human reviews it · nothing is used to train')}
  ${beat(IC_GLOBE, 'your journal does the checking', "your journal must verify the service before anything is sent — if it can't verify, it doesn't send.")}
</div>
<div class="card">
  <div class="statusline"><span class="tag soon">coming soon</span><span>scouts get confidential processing first. it isn't open yet — when it is, the scout program is the way in.</span></div>
</div>
<p class="disclosure"><a href="/terms">terms</a></p>`,
  });
}

export function renderConfidentialProcessingData() {
  const title = 'confidential processing';
  return layout({
    title,
    body: `${brandbar()}
<h1>${esc(title)}</h1>
<h2>what leaves your device</h2>
<p>the text and images sol needs a model to work through.</p>
<h2>what doesn't</h2>
<p>your journal (stays on your computer) and your recordings (speech becomes text on your device first; raw audio never leaves in v1).</p>
<h2>where it goes</h2>
<p>a model sol pbc runs itself. no third-party AI provider is in the path.</p>
<h2>the hardware</h2>
<p>confidential GPUs in Microsoft Azure that sol pbc operates. the hardware boundary keeps the cloud host excluded from what's processed, and the model that runs on it is sol pbc's own — no third-party AI provider is in the path.</p>
<h2>what's kept</h2>
<p>no content is retained · no human reviews it · nothing is used to train.</p>
<h2>the check</h2>
<p>your journal must verify the service before anything is sent; if it can't verify, it doesn't send.</p>
<h2>your choice</h2>
<p>off until you turn it on; turn it off from the journal anytime; nothing is stranded (nothing was kept to strand).</p>
<h2>the covenants</h2>
<p>the covenants: <a href="/terms">terms</a> · <a href="https://solpbc.org/privacy">privacy</a></p>`,
  });
}

export function renderScoutLanding() {
  return layout({
    title: 'scout',
    body: brandbarSignin()
      + `\n<a class="back" href="/">${BACK_SVG} services</a>
<h1>scout</h1>
<p class="lead">join the solstone alpha. we set you up with a Google Gemini key on your device so sol can think, and bring you into the tester cohort.</p>
${BRANDLOCK}
<div class="card">
  ${beat(IC_PASSKEY_SVG, 'a key on your device', 'sol pbc creates a Gemini key for you and puts it on your device. the key is yours and never leaves it.')}
  ${beat(IC_SCOUT_SVG, 'never in the middle', 'sol pbc sets it up but never sits between you and Gemini, and never sees what you ask sol.')}
  ${beat(IC_GLOBE, 'the alpha cohort', 'scout testers get early features and a direct line to tell us what they’re seeing.')}
  ${beat(IC_CHIP, 'confidential processing, coming', 'join the alpha — get early access to confidential processing and help shape solstone.')}
</div>
<div class="card">
  <div class="pricecard">
    <div><div class="big" style="font-size:1.15rem">free <span class="price"><span class="per">· alpha, invite-only</span></span></div></div>
    <a class="btn primary" href="/?signin">request access</a>
  </div>
  <p class="free-note" style="margin:14px 0 0">your questions to sol go straight to Google Gemini under Google’s terms. sol pbc sets up the key but never sits between you and Gemini.</p>
</div>
<p class="disclosure"><a href="/terms">terms</a></p>`,
  });
}

export function renderServicesSpl({ entitlement, csrf, flash = {}, menu, deviceCount = 0, lastSeen = null, nowMs }) {
  const flashes = billingFlashMessages(flash);
  const status = entitlement?.status || '';
  const detailParts = [];
  if (entitlement?.enabled_at != null) detailParts.push(`enabled ${formatDate(entitlement.enabled_at)}`);
  if (lastSeen != null) detailParts.push(`last seen ${formatRelativeTime(lastSeen, nowMs)}`);
  detailParts.push(`${deviceCount} device${deviceCount === 1 ? '' : 's'} reaching your journal`);
  const statusDetail = detailParts.join(' · ');
  const onStatusLine = '<span class="pill on" style="vertical-align:middle"><span class="dot"></span>on</span> &nbsp;your private network is on';
  const controlGroup = `<div class="group">
  <div class="row" style="cursor:default">${IC_NET}<div class="body"><div class="title">your private network</div><div class="desc">${esc(statusDetail)}</div></div></div>
</div>`;
  const page = ({ statusLine = '', content }) => layout({
    title: 'private network',
    body: `${topbar(menu)}
<a class="back" href="/">${BACK_SVG} your services</a>
${flashes}
<div class="pagehead">
  <h1>private network</h1>
  ${statusLine ? `<p class="signed-in">${statusLine}</p>` : ''}
</div>
${content}`,
  });

  if (entitlement?.source === 'comp' && status === 'active') {
    return page({
      statusLine: onStatusLine,
      content: `${controlGroup}
<p class="disclosure" style="margin-top:24px">free while you're an approved scout · on your own network (same wifi, or your own vpn), reaching your journal is always free. <a href="/private-network?learn">how it works</a> · <a href="/terms">terms</a></p>`,
    });
  }

  if (status === 'active') {
    return page({
      statusLine: onStatusLine,
      content: `${controlGroup}
<div class="btn-row" style="margin-top:16px">
  ${billingPortalForm({ csrf })}
  ${billingPortalForm({ csrf, buttonText: 'turn off', buttonClass: 'btn danger' })}
</div>
<p class="disclosure" style="margin-top:24px">renews ${esc(formatUnixSecondsDate(entitlement.current_period_end))} · billed through stripe. on your own network (same wifi, or your own vpn), reaching your journal is always free. <a href="/private-network?learn">how it works</a> · <a href="/terms">terms</a></p>`,
    });
  }

  if (status === 'past_due') {
    return page({
      statusLine: onStatusLine,
      content: `${controlGroup}
<p class="notice">your last payment didn't go through. manage billing to keep your private network reachable while you're away. your own network stays free either way.</p>
<div class="btn-row" style="margin-top:16px">
  ${billingPortalForm({ csrf })}
  ${billingPortalForm({ csrf, buttonText: 'turn off', buttonClass: 'btn danger' })}
</div>
<p class="disclosure" style="margin-top:24px">billed through stripe. on your own network (same wifi, or your own vpn), reaching your journal is always free. <a href="/private-network?learn">how it works</a> · <a href="/terms">terms</a></p>`,
    });
  }

  return page({
    content: `<p class="lead">sol pbc runs a blind relay so your devices stay reachable when they're asleep or away from home.</p>
<div class="card">
  <p>you never have to pay us. on your own network (same wifi, or your own vpn), reaching your journal is always free. this only covers the relay sol pbc runs for you.</p>
  <div class="group">
    ${billingCheckoutRow({ csrf, plan: 'annual', title: '$20 / year', buttonText: 'pay yearly', primary: true })}
    ${billingCheckoutRow({ csrf, plan: 'monthly', title: '$2.49 / month', buttonText: 'pay monthly', primary: false })}
  </div>
  <p class="disclosure">billed securely through stripe.</p>
</div>`,
  });
}

export function renderServicesSpb({ entitlement, csrf, flash = {}, menu }) {
  const flashes = spbBillingFlashMessages(flash);
  const status = entitlement?.status || '';
  const detailParts = [];
  if (entitlement?.enabled_at != null) detailParts.push(`enabled ${formatDate(entitlement.enabled_at)}`);
  detailParts.push('operated by sol pbc');
  const statusDetail = detailParts.join(' · ');
  const onStatusLine = '<span class="pill on" style="vertical-align:middle"><span class="dot"></span>on</span> &nbsp;your encrypted backup is on';
  const controlGroup = `<div class="group">
  <div class="row" style="cursor:default">${IC_BACKUP}<div class="body"><div class="title">encrypted backup</div><div class="desc">${esc(statusDetail)}</div></div></div>
</div>`;
  const portalActions = `<div class="btn-row" style="margin-top:16px">
  ${billingPortalForm({ csrf, action: '/services/backup/portal' })}
  ${billingPortalForm({ csrf, buttonText: 'turn off', buttonClass: 'btn danger', action: '/services/backup/portal' })}
</div>`;
  const page = ({ statusLine = '', content }) => layout({
    title: 'encrypted backup',
    body: `${topbar(menu)}
<a class="back" href="/">${BACK_SVG} your services</a>
${flashes}
<div class="pagehead">
  <h1>encrypted backup</h1>
  <p class="meta">operated by sol pbc</p>
  ${statusLine ? `<p class="signed-in">${statusLine}</p>` : ''}
</div>
${content}`,
  });

  if (entitlement?.source === 'comp' && status === 'active') {
    return page({
      statusLine: onStatusLine,
      content: `${controlGroup}
<p class="disclosure" style="margin-top:24px">free while you're an approved scout. <a href="/backup">how it works</a> · <a href="/services/backup/terms">terms</a></p>`,
    });
  }

  if (status === 'active') {
    return page({
      statusLine: onStatusLine,
      content: `${controlGroup}
${portalActions}
<p class="disclosure" style="margin-top:24px">renews ${esc(formatUnixSecondsDate(entitlement.current_period_end))} · billed through Stripe. <a href="/backup">how it works</a> · <a href="/services/backup/terms">terms</a></p>`,
    });
  }

  if (status === 'past_due') {
    return page({
      statusLine: onStatusLine,
      content: `${controlGroup}
<p class="notice">your last payment didn't go through. manage billing to keep encrypted backup running. your encrypted copy is safe while you sort this out.</p>
${portalActions}
<p class="disclosure" style="margin-top:24px">billed through Stripe. <a href="/backup">how it works</a> · <a href="/services/backup/terms">terms</a></p>`,
    });
  }

  return page({
    content: `<p class="lead">sol pbc keeps an encrypted copy of your journal for you. it's encrypted on your device before it leaves, so only you can read it.</p>
<div class="card">
  <p>turn on encrypted backup</p>
  <div class="group">
    ${billingCheckoutRow({ csrf, plan: 'annual', title: '$48 / year', buttonText: 'pay yearly', primary: true, action: '/services/backup/checkout' })}
    ${billingCheckoutRow({ csrf, plan: 'monthly', title: '$4.99 / month', buttonText: 'pay monthly', primary: false, action: '/services/backup/checkout' })}
  </div>
  <p class="disclosure">billed securely through Stripe.</p>
</div>
<p class="disclosure" style="margin-top:24px">if you turn encrypted backup off, sol pbc keeps your encrypted copy for 30 days. turn it back on within that window and it's still there. after 30 days it's deleted. your journal stays on your device either way. <a href="/backup">how it works</a> · <a href="/services/backup/terms">terms</a></p>`,
  });
}

export function renderServicesSpp({ entitlement, menu }) {
  const status = entitlement?.status || '';
  const page = ({ statusLine, content }) => layout({
    title: 'confidential processing',
    body: `${topbar(menu)}
<a class="back" href="/">${BACK_SVG} your services</a>
<div class="pagehead">
  <h1>confidential processing</h1>
  ${statusLine ? `<p class="signed-in">${statusLine}</p>` : ''}
</div>
${content}`,
  });

  if (status === 'active') {
    return page({
      statusLine: '<span class="pill on" style="vertical-align:middle"><span class="dot"></span>on</span> &nbsp;confidential processing is on for this journal',
      content: `<div class="group">
  <div class="row" style="cursor:default">${IC_CHIP}<div class="body"><div class="title">confidential processing</div><div class="desc">enabled for your journal</div></div></div>
</div>
<p class="disclosure" style="margin-top:24px">your journal must verify the service before anything is sent — if it can't verify, it doesn't send. <a href="/terms">terms</a></p>`,
    });
  }

  return page({
    statusLine: '<span class="pill off" style="vertical-align:middle"><span class="dot"></span>early access</span>',
    content: `<p class="lead">scouts get confidential processing first. it isn't open yet — when it is, the scout program is the way in.</p>
<div class="card">
  ${beat(IC_EMPTY_DATA_SVG, 'kept for nothing', 'no content is retained · no human reviews it · nothing is used to train')}
  ${beat(IC_CHIP, 'only the thinking leaves', 'sol sends only the thinking off your device — never your journal, which stays on your computer. it runs on confidential hardware sol pbc operates — a model sol pbc runs itself, with no third-party AI provider in the path.')}
</div>
<p class="disclosure" style="margin-top:24px"><a href="/scout">scout</a> · <a href="/terms">terms</a></p>`,
  });
}

export function renderBillingReturn({ status, menu }) {
  const success = status === 'success';
  const message = success
    ? 'payment received. it can take a moment to show up here.'
    : 'no charge made. you can turn on the relay anytime. on your own network, reaching your journal is always free.';
  return layout({
    title: 'private network',
    body: `${topbar(menu)}
<a class="back" href="/private-network">${BACK_SVG} your private network</a>
<div class="card">
  <h1>private network</h1>
  <p>${esc(message)}</p>
  <a class="btn secondary" href="/private-network">back to your private network</a>
</div>`,
  });
}

// === sign-in surfaces ===

export function renderSignInShell({ sessionCount, passkeyCount, emailCount = 0, menu }) {
  return layout({
    title: 'your sign-in',
    body: `${topbar(menu)}
<a class="back" href="/">${BACK_SVG} your services</a>
<h1>your sign-in</h1>
<p class="lead">how you get into this page to manage your services. solstone itself never asks you to sign in. this is the only place sign-in lives.</p>
<div class="group">
  <a class="row" href="/sign-in/sessions">
    ${IC_SESSION_SVG}
    <div class="body">
      <div class="title">sessions</div>
      <div class="desc">the devices and phones signed in right now. sign any of them out.</div>
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
<p class="lead">the devices and phones currently signed in to manage your services. sign any of them out. the current one stays.</p>
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
  const notice = disableFlash === 'ok' ? '<p class="notice">notifications turned off for every device.</p>' : '';
  const emptyState = devices.length === 0
    ? `<div class="group">
  <div class="empty">
    ${IC_PUSH_SVG}
    <h2>notifications aren't on yet</h2>
    <p>turn it on from solstone on your device. it opens this page so you can confirm, then sol can reach your devices.</p>
    <div class="notice" style="text-align:left;max-width:none">in solstone, run <strong>journal services enable push</strong>, or turn it on from the solstone app.</div>
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
<p class="lead">how you sign in. you can have more than one, useful for backup, or for signing in from a second device.</p>
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
<p class="disclosure">last-used is the one piece of metadata sol pbc keeps. it's here so you can audit the key yourself. sol pbc never sees what you ask sol.</p>`
    : '';
  // the old standalone scouts program had a news feed and a feedback form;
  // the converged portal drops both, but their destinations live on, news →
  // the public release notes, feedback → support. give them a permanent home
  // here, present in every scout state, as first-class destination rows.
  const scoutLinks = `<div class="group" style="margin-top:26px">
  <a class="row" href="https://solstone.app/releases">
    ${IC_NEWS_SVG}
    <div class="body">
      <div class="title">what's new in solstone ${EXT_SVG}</div>
      <div class="desc">release notes: what's shipped and what's changing.</div>
    </div>
    <div class="trail">${CHEVRON_SVG}</div>
  </a>
  <a class="row" href="/support">
    ${IC_SUPPORT_SVG}
    <div class="body">
      <div class="title">share feedback</div>
      <div class="desc">tell us what you're seeing, or report a problem.</div>
    </div>
    <div class="trail">${CHEVRON_SVG}</div>
  </a>
</div>`;
  const page = ({ statusLine, lead, content = '' }) => layout({
    title: 'scout',
    body: `${topbar(menu)}
<a class="back" href="/">${BACK_SVG} your services</a>
${flashes}
<div class="pagehead">
  <h1>scout</h1>
  <p class="signed-in">${statusLine}</p>
</div>
<p class="lead">${lead}</p>
${content}
${scoutLinks}`,
  });

  if (application?.status === 'revoked') {
    return page({
      statusLine: '<span class="pill off" style="vertical-align:middle"><span class="dot"></span>access has ended</span>',
      lead: 'access to scout has ended.',
    });
  }

  if (active) {
    return page({
      statusLine: '<span class="pill on" style="vertical-align:middle"><span class="dot"></span>on</span> &nbsp;scout is on',
      lead: 'sol pbc set up a Google Gemini key for you. the key lives in your journal on your device and is never shown here.',
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
      lead: 'approved. enable scout in your journal to receive your key.',
      content: `${ackForm}
${historySection}`,
    });
  }

  if (application?.status === 'pending') {
    const pendingText = application.applied_at == null
      ? 'pending'
      : `pending, applied ${formatRelativeTime(application.applied_at, nowMs)}`;
    return page({
      statusLine: `<span class="pill off" style="vertical-align:middle"><span class="dot"></span>${esc(pendingText)}</span>`,
      lead: 'we have your scout request. there is nothing else to do here yet.',
    });
  }

  return page({
    statusLine: '<span class="pill off" style="vertical-align:middle"><span class="dot"></span>off</span>',
    lead: 'request scout for this account.',
    content: `<div class="card">
  <h2>request access</h2>
  ${scoutApplyForm({ includeUseCase: true, buttonText: 'apply' })}
</div>
<p class="disclosure">solstone runs without scout. you can always bring your own Gemini key by hand instead. turning on scout just means sol pbc sets one up for you.</p>`,
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
    ? '<p>no open requests. need help? open one below, or sol can file one for you.</p>'
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
  <p class="notice">screenshots and logs are used only to triage your request. once we've reviewed them, the files are deleted and can't be recovered. after you submit, they're not viewable or downloadable here, and we keep only a short summary from triage, never the files themselves.</p>
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

export function renderTerms() {
  const title = 'private network · terms';
  return layout({
    title,
    body: `${brandbar()}
<h1>${esc(title)}</h1>
<p class="meta"><em>${esc(`last updated: June 16, 2026 · operated by sol pbc, a colorado public benefit corporation`)}</em></p>
<p>${esc(`these terms cover `)}<strong>${esc(`private network`)}</strong>${esc(`: the relay sol pbc operates so you can reach your own journal from anywhere — phone to home — without running your own relay. they're between you and sol pbc. by subscribing, you agree to them.`)}</p>
<h2>${esc(`1. you never have to pay us`)}</h2>
<p>${esc(`this is a convenience, not a gate. the same private connection is always available for free:`)}</p>
<ul>
  <li><strong>${esc(`lan-direct`)}</strong>${esc(` — phone and home on the same network connect directly, no relay, no charge.`)}</li>
  <li><strong>${esc(`bring your own transport`)}</strong>${esc(` — point solstone at your own vpn, tailscale, or tunnel.`)}</li>
  <li><strong>${esc(`self-host the relay`)}</strong>${esc(` — the relay is open source. run it yourself.`)}</li>
</ul>
<p>${esc(`all three are private by the `)}<em>${esc(`same construction`)}</em>${esc(` as the paid relay. `)}<strong>${esc(`the hosted relay is convenience — never a privacy upgrade.`)}</strong>${esc(` if you stop paying, you lose the convenience, not your journal and not your privacy.`)}</p>
<h2>${esc(`2. what you're buying`)}</h2>
<ul>
  <li>${esc(`the `)}<strong>${esc(`operated relay`)}</strong>${esc(` — a private channel between your devices and your home journal, run by sol pbc so you don't have to run one.`)}</li>
  <li><strong>${esc(`blind by construction.`)}</strong>${esc(` sol pbc operates the relay but `)}<strong>${esc(`cannot read what's inside your traffic.`)}</strong>${esc(` the relay passes encrypted bytes between your devices; it has no key to read them and keeps no copy of what flows through. to move those bytes it does handle basic connection details — your devices' network addresses, timing, and how much data moved — never the contents. it runs on third-party cloud infrastructure, which sees only those same encrypted bytes and connection details. hosting the pipe does not mean reading what's in it.`)}</li>
  <li>${esc(`a flat `)}<strong>${esc(`annual or monthly`)}</strong>${esc(` price, `)}<strong>${esc(`per home journal`)}</strong>${esc(` — not per device. all your paired devices reach that journal over the one subscription. the current price is shown to you when you subscribe.`)}</li>
</ul>
<h2>${esc(`3. subscription and automatic renewal`)}</h2>
<ul>
  <li><strong>${esc(`your subscription renews automatically`)}</strong>${esc(` at the end of each term — once a year on the annual plan, once a month on the monthly plan — at your plan's then-current price, using your payment method on file, `)}<strong>${esc(`until you cancel.`)}</strong>${esc(` you agree to these renewal terms when you confirm the subscription at checkout, where the price, the billing interval, and the automatic renewal are shown and you affirmatively agree to them before any charge.`)}</li>
  <li>${esc(`for the `)}<strong>${esc(`annual`)}</strong>${esc(` plan, we email you a reminder `)}<strong>${esc(`15–45 days before each renewal`)}</strong>${esc(`, with the renewal date, the amount, and a one-click link to cancel — so a yearly charge is never a surprise.`)}</li>
  <li>${esc(`we'll tell you in advance if the price ever changes; a price change only takes effect on a renewal after we've notified you, and you can cancel before it applies.`)}</li>
</ul>
<h2>${esc(`4. canceling — and what happens to your journal`)}</h2>
<ul>
  <li><strong>${esc(`cancel anytime, in two clicks.`)}</strong>${esc(` the billing portal cancels your subscription — no phone call, no email, no retention maze. canceling is as easy as subscribing.`)}</li>
  <li>${esc(`when you cancel, the `)}<strong>${esc(`hosted relay keeps working until the end of the period you've already paid for`)}</strong>${esc(`, then stops. we don't prorate or claw back; you keep what you paid for.`)}</li>
  <li><strong>${esc(`nothing is lost when the relay stops.`)}</strong>${esc(` your journal, your data, and your device pairings are untouched — your journal lives on your devices. the free paths — lan-direct and bring-your-own-transport — keep working. you drop to the free tier; you do not lose your data. (without the hosted relay, you reach your journal on your own network or through a transport you set up.)`)}</li>
  <li>${esc(`re-subscribe anytime to turn the hosted relay back on. one tap.`)}</li>
</ul>
<h2>${esc(`5. refunds`)}</h2>
<ul>
  <li>${esc(`because canceling lets you keep the hosted relay through the end of the period you paid for, we don't run refund math on cancellation.`)}</li>
  <li>${esc(`if you're charged in error — a duplicate charge, a charge after you canceled, a billing mistake — email `)}<code>${esc(`support@solstone.app`)}</code>${esc(` or use the billing portal and `)}<strong>${esc(`we'll refund the incorrect amount.`)}</strong>${esc(` this doesn't affect any chargeback or refund right you have through your card issuer or under the law.`)}</li>
  <li>${esc(`nothing here waives any refund or cancellation right the law gives you where you live.`)}</li>
</ul>
<h2>${esc(`6. fair use`)}</h2>
<p>${esc(`the hosted relay is for reaching your own journal from your own devices. don't use it to attack, overload, or relay for others at a scale that degrades the service for everyone else. sustained abuse can suspend the hosted relay — never your journal or the free paths.`)}</p>
<h2>${esc(`7. payment is handled by stripe`)}</h2>
<ul>
  <li>${esc(`sol pbc does not take or store your card. payments run through `)}<strong>${esc(`stripe`)}</strong>${esc(`, our payment processor. when you subscribe, your card and payment details go `)}<strong>${esc(`directly to stripe`)}</strong>${esc(` and are handled under stripe's own `)}<a href="https://stripe.com/legal">${esc(`terms`)}</a>${esc(` and `)}<a href="https://stripe.com/privacy">${esc(`privacy policy`)}</a>${esc(`. that's your choice to pay by card, and it's how the charge happens.`)}</li>
  <li>${esc(`sol pbc receives from stripe only what it needs to run your subscription: that a payment succeeded or failed, when it renews, and a reference that ties the subscription to your solstone sign-in. `)}<strong>${esc(`your card number never touches sol pbc's servers.`)}</strong></li>
  <li>${esc(`stripe is bound, as our payment processor, not to use the limited information we send it for anything except processing your payments — and, as a regulated payment company, it also runs the fraud and anti-money-laundering checks the law requires of it. sol pbc never sends stripe anything from your journal.`)}</li>
</ul>
<h2>${esc(`8. the service is provided as-is`)}</h2>
<p>${esc(`we work to keep the hosted relay up, but we don't guarantee uninterrupted service. the relay can go down for maintenance or for reasons outside our control. if it's down, the free paths (lan-direct, byo, self-host) are always your fallback.`)}</p>
<p><strong>${esc(`to the fullest extent permitted by law, the hosted relay is provided "as is" and "as available," and sol pbc disclaims all implied warranties, including merchantability and fitness for a particular purpose. sol pbc is not liable for indirect, incidental, or consequential damages, and sol pbc's total liability for the hosted relay is limited to the fees you paid for it in the 12 months before the claim.`)}</strong>${esc(` nothing in these terms limits liability that cannot be limited by law — including for fraud, gross negligence, willful misconduct, or personal injury — or any statutory right you have as a consumer.`)}</p>
<h2>${esc(`9. how your data is used`)}</h2>
<p>${esc(`running the hosted relay involves two very different things, and we keep them apart:`)}</p>
<ul>
  <li><strong>${esc(`your journal traffic`)}</strong>${esc(` — the encrypted bytes that flow between your devices and your home. sol pbc `)}<strong>${esc(`cannot read these.`)}</strong>${esc(` the relay has no key to your content and keeps no copy of it. nothing in your journal is ever read, stored, analyzed, sold, shared, profiled, used for advertising, or used to train any model. it passes through and is gone.`)}</li>
  <li><strong>${esc(`your billing details`)}</strong>${esc(` — your email, the fact that you subscribe to the hosted relay, your renewal dates, and a reference that links the subscription to your sign-in. we use this `)}<strong>${esc(`only`)}</strong>${esc(` to run your subscription and keep the relay on for you. we do `)}<strong>${esc(`not`)}</strong>${esc(` sell it, license it, share it for anyone else's purposes, or use it for advertising, profiling, behavioral tracking, or model training.`)}</li>
</ul>
<p>${esc(`this isn't just our policy — it's `)}<strong>${esc(`structural.`)}</strong>${esc(` sol pbc's `)}<strong>${esc(`articles of incorporation (Article 8, the Customer Privacy Covenant)`)}</strong>${esc(` legally bind the company never to sell, license, or share your data, and never to use it for targeted advertising or behavioral profiling — and that promise survives any sale, merger, or change of control of the company. you can read it at `)}<a href="https://solpbc.org">${esc(`solpbc.org`)}</a>${esc(`.`)}</p>
<p>${esc(`for the complete picture — every category of data we handle, every infrastructure and payment provider we rely on to run the service (including cloudflare and stripe), how long we keep each thing, and exactly how to exercise your rights — see our `)}<a href="https://solpbc.org/privacy">${esc(`privacy policy`)}</a>${esc(`.`)}</p>
<h2>${esc(`10. how long we keep it, and your rights`)}</h2>
<ul>
  <li>${esc(`we keep your billing details for `)}<strong>${esc(`as long as you have a subscription, plus the period tax and financial-records law requires us to keep afterward`)}</strong>${esc(` (generally up to seven years for transaction records). when neither applies anymore, we delete them.`)}</li>
  <li>${esc(`you can `)}<strong>${esc(`see, correct, export, or delete`)}</strong>${esc(` your sign-in and billing data anytime — most of it directly from your settings at `)}<code>${esc(`services.solstone.app/transparency`)}</code>${esc(`, and the rest by emailing `)}<code>${esc(`support@solstone.app`)}</code>${esc(`. deleting your subscription data ends the hosted relay; it never touches your journal.`)}</li>
  <li>${esc(`you have the privacy rights your state or country gives you — including the `)}<strong>${esc(`Colorado Privacy Act`)}</strong>${esc(`, and the `)}<strong>${esc(`CCPA/CPRA`)}</strong>${esc(` in California and `)}<strong>${esc(`GDPR`)}</strong>${esc(` in the EU/UK — to access, correct, delete, and port your data, and to opt out. sol pbc's covenants go further than any of them require. exercise any of them at `)}<code>${esc(`support@solstone.app`)}</code>${esc(`; if we deny a request, you can appeal by replying to that email, and we'll respond within the time the law allows.`)}</li>
</ul>
<h2>${esc(`11. changes to these terms`)}</h2>
<p>${esc(`we may update these terms. if a change is material, we'll notify you before it takes effect. for a change that takes effect at your next renewal, you can cancel before then if you don't agree. if a material change has to take effect mid-term, we'll give you notice and a way to cancel with a prorated refund of the unused period. we'll keep the current version posted here with its date.`)}</p>
<h2>${esc(`12. who you're dealing with, and the law that applies`)}</h2>
<p>${esc(`these terms are between you and `)}<strong>${esc(`sol pbc`)}</strong>${esc(`, a Colorado public benefit corporation. they're governed by Colorado law. questions: `)}<code>${esc(`support@solstone.app`)}</code>${esc(`.`)}</p>`,
  });
}

export function renderBackupTerms() {
  const title = 'encrypted backup · operated tier · terms';
  return layout({
    title,
    body: `${brandbar()}
<h1>${esc(title)}</h1>
<p class="meta"><em>${esc(`last updated: June 2026 · operated by sol pbc, a colorado public benefit corporation`)}</em></p>
<p>${esc(`these terms cover the `)}<strong>${esc(`operated tier of encrypted backup`)}</strong>${esc(`: storage sol pbc runs for you so you can keep an encrypted copy of your journal off your own machine — without standing up your own bucket. they're between you and sol pbc. by subscribing, you agree to them.`)}</p>
<h2>${esc(`1. you never have to pay us`)}</h2>
<p>${esc(`this is a convenience, not a gate. the same encrypted backup is always available for free, with sol pbc never in the path:`)}</p>
<ul>
  <li><strong>${esc(`bring your own storage`)}</strong>${esc(` — point solstone's backup at your own object-storage bucket (Backblaze B2, Amazon S3, Cloudflare R2, any S3-compatible provider). you pay your provider directly; sol pbc is never contacted and never holds your data.`)}</li>
</ul>
<p>${esc(`the bring-your-own path and the operated tier use the `)}<strong>${esc(`same engine, the same encryption, and the same recovery model`)}</strong>${esc(` — the only difference is whose bucket the encrypted blobs land in. `)}<strong>${esc(`the operated tier is convenience — never a privacy upgrade.`)}</strong>${esc(` if you stop paying, you lose the convenience, not your journal: your journal lives on your own devices, and you can switch to your own bucket at any time.`)}</p>
<h2>${esc(`2. what you're buying`)}</h2>
<ul>
  <li>${esc(`the `)}<strong>${esc(`operated tier`)}</strong>${esc(` — storage sol pbc runs on your behalf, so an encrypted copy of your journal lives somewhere other than your own machine without you having to set up and manage a bucket.`)}</li>
  <li><strong>${esc(`encrypted by construction — only you can read it.`)}</strong>${esc(` before anything leaves your machine, solstone encrypts it — the contents, the file names, and the folder structure all become unreadable ciphertext. sol pbc stores those encrypted blobs and `)}<strong>${esc(`cannot read them`)}</strong>${esc(`: we hold no key, no password, and no way to decrypt your backup. to operate and bill the storage we keep a small amount of operational information about your stored data — how many encrypted objects there are, how much space they take, and when they last changed — never their contents. it runs on third-party cloud storage, which sees only those same encrypted blocks and that same operational information.`)}</li>
  <li>${esc(`a flat `)}<strong>${esc(`annual or monthly`)}</strong>${esc(` price, `)}<strong>${esc(`per home journal`)}</strong>${esc(` — not per device. the current price is shown to you when you subscribe.`)}</li>
</ul>
<h2>${esc(`3. subscription and automatic renewal`)}</h2>
<ul>
  <li><strong>${esc(`your subscription renews automatically`)}</strong>${esc(` at the end of each term — once a year on the annual plan, once a month on the monthly plan — at your plan's then-current price, using your payment method on file, `)}<strong>${esc(`until you cancel.`)}</strong>${esc(` you agree to these renewal terms when you confirm the subscription at checkout, where the price, the billing interval, and the automatic renewal are shown and you affirmatively agree to them before any charge.`)}</li>
  <li>${esc(`for the `)}<strong>${esc(`annual`)}</strong>${esc(` plan, we email you a reminder `)}<strong>${esc(`15–45 days before each renewal`)}</strong>${esc(`, with the renewal date, the amount, and a one-click link to cancel — so a yearly charge is never a surprise.`)}</li>
  <li>${esc(`we'll tell you in advance if the price ever changes; a price change only takes effect on a renewal after we've notified you, and you can cancel before it applies.`)}</li>
</ul>
<h2>${esc(`4. canceling — and what happens to your backup`)}</h2>
<ul>
  <li><strong>${esc(`cancel anytime, in two clicks.`)}</strong>${esc(` the billing portal cancels your subscription — no phone call, no email, no retention maze. canceling is as easy as subscribing.`)}</li>
  <li>${esc(`when you cancel, the operated storage `)}<strong>${esc(`keeps working until the end of the period you've already paid for`)}</strong>${esc(`, then stops. we don't prorate or claw back; you keep what you paid for.`)}</li>
  <li><strong>${esc(`your journal is never touched.`)}</strong>${esc(` your journal, your data, and your device pairings live on your own devices — canceling the operated tier doesn't reach them. the bring-your-own-storage path keeps working; you can point your backup at your own bucket anytime.`)}</li>
  <li><strong>${esc(`after your subscription lapses, we keep your encrypted backup for 30 days, then delete it.`)}</strong>${esc(` if your subscription ends — whether you cancel or a renewal fails — your encrypted blobs in our storage are retained for `)}<strong>${esc(`30 days after the operated storage stops`)}</strong>${esc(` (the end of the last period you paid for) and then `)}<strong>${esc(`permanently deleted.`)}</strong>${esc(` within that 30-day window, re-subscribing turns the operated tier back on against your existing backup, with nothing lost. after 30 days the operated copy is gone for good. `)}<strong>${esc(`this only ever affects the copy in our storage`)}</strong>${esc(` — your journal on your own devices, and any bring-your-own-storage backup, are never touched at any point.`)}</li>
  <li>${esc(`because your backup is encrypted with a key only you hold, `)}<strong>${esc(`once it's deleted we cannot recover it`)}</strong>${esc(` — there is no copy we can read or restore. keep your recovery key safe; it is the only thing that can restore an encrypted backup, and we don't have it.`)}</li>
</ul>
<h2>${esc(`5. refunds`)}</h2>
<ul>
  <li>${esc(`because canceling lets you keep the operated storage through the end of the period you paid for, we don't run refund math on cancellation.`)}</li>
  <li>${esc(`if you're charged in error — a duplicate charge, a charge after you canceled, a billing mistake — email `)}<code>${esc(`support@solstone.app`)}</code>${esc(` or use the billing portal and `)}<strong>${esc(`we'll refund the incorrect amount.`)}</strong>${esc(` this doesn't affect any chargeback or refund right you have through your card issuer or under the law.`)}</li>
  <li>${esc(`nothing here waives any refund or cancellation right the law gives you where you live.`)}</li>
</ul>
<h2>${esc(`6. fair use`)}</h2>
<p>${esc(`the operated tier is for backing up your own solstone journal. don't use it to store or distribute content unrelated to your journal, or in a way that abuses the storage at a scale that degrades the service for everyone else. sustained abuse can suspend the operated tier — never your journal, your recovery key, or the free bring-your-own-storage path.`)}</p>
<h2>${esc(`7. payment is handled by stripe`)}</h2>
<ul>
  <li>${esc(`sol pbc does not take or store your card. payments run through `)}<strong>${esc(`stripe`)}</strong>${esc(`, our payment processor. when you subscribe, your card and payment details go `)}<strong>${esc(`directly to stripe`)}</strong>${esc(` and are handled under stripe's own `)}<a href="https://stripe.com/legal">${esc(`terms`)}</a>${esc(` and `)}<a href="https://stripe.com/privacy">${esc(`privacy policy`)}</a>${esc(`. that's your choice to pay by card, and it's how the charge happens.`)}</li>
  <li>${esc(`sol pbc receives from stripe only what it needs to run your subscription: that a payment succeeded or failed, when it renews, and a reference that ties the subscription to your solstone sign-in. `)}<strong>${esc(`your card number never touches sol pbc's servers.`)}</strong></li>
  <li>${esc(`stripe is bound, as our payment processor, not to use the limited information we send it for anything except processing your payments — and, as a regulated payment company, it also runs the fraud and anti-money-laundering checks the law requires of it. sol pbc never sends stripe anything from your journal or your backup.`)}</li>
</ul>
<h2>${esc(`8. the service is provided as-is`)}</h2>
<p>${esc(`we work to keep the operated storage up and your backup safe, but we don't guarantee uninterrupted service, and `)}<strong>${esc(`an encrypted backup is not a substitute for your journal living on your own devices`)}</strong>${esc(` — it's a second copy, not your only copy. the storage can go down for maintenance or for reasons outside our control. you are responsible for keeping your recovery key; because your backup is encrypted with a key only you hold, `)}<strong>${esc(`we cannot restore it for you and cannot recover it if you lose that key.`)}</strong></p>
<p><strong>${esc(`to the fullest extent permitted by law, the operated tier is provided "as is" and "as available," and sol pbc disclaims all implied warranties, including merchantability and fitness for a particular purpose. because the operated tier is a second copy of a journal that lives on your own devices, and because your backup is encrypted with a key only you hold, sol pbc is not liable for loss of the operated copy or for any inability to restore it — including where you have lost your recovery key. sol pbc is not liable for indirect, incidental, or consequential damages, and sol pbc's total liability for the operated tier is limited to the fees you paid for it in the 12 months before the claim. none of this limits our responsibility to keep your backup available through the period you've paid for.`)}</strong>${esc(` nothing in these terms limits liability that cannot be limited by law — including for fraud, gross negligence, willful misconduct, or personal injury — or any statutory right you have as a consumer.`)}</p>
<h2>${esc(`9. how your data is used`)}</h2>
<p>${esc(`running the operated tier involves two very different things, and we keep them apart:`)}</p>
<ul>
  <li><strong>${esc(`your backup`)}</strong>${esc(` — the encrypted blocks that hold your journal. sol pbc `)}<strong>${esc(`cannot read these.`)}</strong>${esc(` we have no key to your content and no way to decrypt it. nothing in your journal is ever read, analyzed, sold, shared, profiled, used for advertising, or used to train any model — because we can't read it, and because we're bound not to. to operate and bill the storage we keep a small amount of operational information about it — how many encrypted objects there are, how much space they use, and when they last changed — which we use `)}<strong>${esc(`only`)}</strong>${esc(` to run and bill the service, never to profile you or for any other purpose.`)}</li>
  <li><strong>${esc(`your billing details`)}</strong>${esc(` — your email, the fact that you subscribe to the operated tier, your renewal dates, and a reference that links the subscription to your sign-in. we use this `)}<strong>${esc(`only`)}</strong>${esc(` to run your subscription. we do `)}<strong>${esc(`not`)}</strong>${esc(` sell it, license it, share it for anyone else's purposes, or use it for advertising, profiling, behavioral tracking, or model training.`)}</li>
</ul>
<p>${esc(`the encrypted blocks are stored on storage operated by `)}<strong>${esc(`cloudflare`)}</strong>${esc(` (Cloudflare R2) on sol pbc's behalf; cloudflare, like our payment processor, is bound by contract never to use what passes through it to advertise to you, profile you, or sell your data, and it can see only those encrypted blocks, that operational information, and the basic connection details any storage provider handles to move your data — never your content.`)}</p>
<p>${esc(`this isn't just our policy — it's `)}<strong>${esc(`structural.`)}</strong>${esc(` sol pbc's `)}<strong>${esc(`articles of incorporation (Article 8, the Customer Privacy Covenant)`)}</strong>${esc(` legally bind the company never to sell, license, or share your data — backup, metadata, or billing details alike — and never to use it for targeted advertising or behavioral profiling — and that promise survives any sale, merger, or change of control of the company. the fact that the blocks we hold are blocks we can't read is one of those covenants made concrete. you can read it at `)}<a href="https://solpbc.org">${esc(`solpbc.org`)}</a>${esc(`.`)}</p>
<p>${esc(`for the complete picture — every category of data we handle, every infrastructure and payment provider we rely on to run the service (including cloudflare and stripe), how long we keep each thing, and exactly how to exercise your rights — see our `)}<a href="https://solpbc.org/privacy">${esc(`privacy policy`)}</a>${esc(`.`)}</p>
<h2>${esc(`10. how long we keep it, and your rights`)}</h2>
<ul>
  <li>${esc(`we keep your `)}<strong>${esc(`encrypted backup`)}</strong>${esc(` for as long as your subscription is active. `)}<strong>${esc(`when your subscription lapses, we keep it for 30 days, then permanently delete it`)}</strong>${esc(` (§ 4). you can also delete it yourself at any time from the backup management screen in solstone, which removes it from our storage; deleting it never touches your journal on your own devices.`)}</li>
  <li>${esc(`we keep your `)}<strong>${esc(`billing details`)}</strong>${esc(` for `)}<strong>${esc(`as long as you have a subscription, plus the period tax and financial-records law requires us to keep afterward`)}</strong>${esc(` (generally up to seven years for transaction records). when neither applies anymore, we delete them.`)}</li>
  <li>${esc(`you can `)}<strong>${esc(`see, correct, export, or delete`)}</strong>${esc(` your sign-in and billing data anytime — most of it directly from your settings at `)}<code>${esc(`services.solstone.app/transparency`)}</code>${esc(`, and the rest by emailing `)}<code>${esc(`support@solstone.app`)}</code>${esc(`. your backup itself is encrypted and under your control: you restore it with your recovery key, and you delete it from the backup screen.`)}</li>
  <li>${esc(`you have the privacy rights your state or country gives you — including the `)}<strong>${esc(`Colorado Privacy Act`)}</strong>${esc(`, and the `)}<strong>${esc(`CCPA/CPRA`)}</strong>${esc(` in California and `)}<strong>${esc(`GDPR`)}</strong>${esc(` in the EU/UK — to access, correct, delete, and port your data, and to opt out. sol pbc's covenants go further than any of them require. exercise any of them at `)}<code>${esc(`support@solstone.app`)}</code>${esc(`; we'll respond as fast as we can, and within the time the law requires — 45 days under the Colorado Privacy Act, with the extensions the law allows. `)}<strong>${esc(`if we deny a request,`)}</strong>${esc(` you can appeal by replying to that email; we'll respond to the appeal within 45 days, and if we deny the appeal, you can raise it with the `)}<a href="https://coag.gov/office-sections/consumer-protection/">${esc(`Colorado Attorney General`)}</a>${esc(`.`)}</li>
</ul>
<h2>${esc(`11. changes to these terms`)}</h2>
<p>${esc(`we may update these terms. if a change is material, we'll notify you before it takes effect. for a change that takes effect at your next renewal, you can cancel before then if you don't agree. if a material change has to take effect mid-term, we'll give you notice and a way to cancel with a prorated refund of the unused period. we'll keep the current version posted here with its date.`)}</p>
<h2>${esc(`12. who you're dealing with, and the law that applies`)}</h2>
<p>${esc(`these terms are between you and `)}<strong>${esc(`sol pbc`)}</strong>${esc(`, a Colorado public benefit corporation. they're governed by Colorado law. questions: `)}<code>${esc(`support@solstone.app`)}</code>${esc(`.`)}</p>`,
  });
}

// Shown when the CSRF synchronizer token is missing or doesn't match, the
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
  return SUPPORT_AUTHOR_LABELS[authorKind] || 'solstone support';
}

function supportNotices(notices) {
  return notices.map((notice) => `<p class="notice">${esc(notice)}</p>`).join('');
}

function supportCreateConfirmation({ id, email, uploadFailed = false }) {
  const uploadNotice = uploadFailed
    ? '<p class="error">your request was opened, but the attachments could not be uploaded.</p>'
    : '';
  return `<p class="notice">got it, this is request #${esc(id)}. we'll email you at ${esc(email)} and you can follow it right here.</p>
<p><a href="/support/${escAttr(id)}">view request</a></p>
${uploadNotice}`;
}

function renderSupportOpenForm(csrf) {
  return `<div class="card">
  <h2>open a request</h2>
  <p>tell us what's going on. you can attach screenshots or logs here. it's easier than email.</p>
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
    <p class="notice">screenshots and logs are used only to triage your request. once we've reviewed them, the files are deleted and can't be recovered. after you submit, they're not viewable or downloadable here, and we keep only a short summary from triage, never the files themselves.</p>
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

function billingCheckoutRow({ csrf, plan, title, buttonText, primary, action = '/billing/checkout' }) {
  // Display copy must match the configured Stripe price IDs; env stores opaque price IDs only.
  const buttonClass = primary ? 'btn primary' : 'btn secondary';
  return `<div class="row" style="cursor:default">
  <div class="body">
    <div class="title">${esc(title)}</div>
  </div>
  <div class="trail"><form method="post" action="${escAttr(action)}">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    <input type="hidden" name="plan" value="${escAttr(plan)}">
    <button class="${buttonClass}" type="submit">${esc(buttonText)}</button>
  </form></div>
</div>`;
}

function billingPortalForm({ csrf, buttonText = 'manage billing', buttonClass = 'btn primary', action = '/billing/portal' }) {
  return `<form method="post" action="${escAttr(action)}">
  <input type="hidden" name="csrf" value="${escAttr(csrf)}">
  <button class="${buttonClass}" type="submit">${esc(buttonText)}</button>
</form>`;
}

function billingFlashMessages(flash) {
  const messages = [];
  if (flash.checkout === 'invalid') messages.push('choose yearly or monthly billing.');
  if (flash.checkout === 'email') messages.push("billing couldn't start. try again.");
  if (flash.checkout === 'error') messages.push("billing couldn't start. try again.");
  if (flash.checkout === 'comped') messages.push("you're already covered free as a scout.");
  if (flash.billing === 'missing') messages.push('billing management is available after hosting starts.');
  if (flash.billing === 'error') messages.push("billing management didn't open. try again.");
  return messages.map((message) => `<p class="notice">${esc(message)}</p>`).join('');
}

function spbBillingFlashMessages(flash) {
  const messages = [];
  if (flash.checkout === 'success') messages.push('payment received. it can take a moment to show up here.');
  if (flash.checkout === 'cancel') messages.push('no charge made. you can turn on encrypted backup anytime.');
  if (flash.checkout === 'invalid') messages.push('choose yearly or monthly billing.');
  if (flash.checkout === 'email') messages.push("billing couldn't start. try again.");
  if (flash.checkout === 'error') messages.push("billing couldn't start. try again.");
  if (flash.checkout === 'comped') messages.push("you're already covered free as a scout.");
  if (flash.billing === 'missing') messages.push('billing management is available after encrypted backup starts.');
  if (flash.billing === 'error') messages.push("billing management didn't open. try again.");
  return messages.map((message) => `<p class="notice">${esc(message)}</p>`).join('');
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

function formatUnixSecondsDate(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return '—';
  return new Date(value * 1000).toISOString().slice(0, 10);
}

export function formatDate(tsMs) {
  const ts = Number(tsMs);
  if (!Number.isFinite(ts)) return '—';
  return new Date(ts).toISOString().slice(0, 10);
}
