// Page renderers for the served portal.css design system and same-origin brand assets.

import { PORTAL_CSS_HREF } from './assets.js';
import { ENROLL_JS } from './inline/passkey-enroll.js';
import { LANDING_JS } from './inline/passkey-landing.js';

export const VERIFY_ERROR = "that code didn't work. try again or request a new one.";
const MARK_SVG = '<svg class="mark" viewBox="2.5 2.5 27 27" role="img" aria-label="solstone"><path fill="#FFCC33" d="M16 2.5 Q17.057687783 5.007810543 18.589661566 7.257449068 A9.118033989 9.118033989 0 0 0 13.410338434 7.257449068 Q14.942312217 5.007810543 16 2.5 Z M23.935100906 5.078270576 Q23.316734245 7.728825204 23.233822722 10.449292599 A9.118033989 9.118033989 0 0 0 19.043662288 7.404962845 Q21.605359462 6.485438643 23.935100906 5.078270576 Z M28.83926297 11.828270576 Q26.781036911 13.609147511 25.114909466 15.761317696 A9.118033989 9.118033989 0 0 0 23.514410599 10.83548868 Q26.127349912 11.597305794 28.83926297 11.828270576 Z M28.83926297 20.171729424 Q26.127349912 20.402694206 23.514410599 21.16451132 A9.118033989 9.118033989 0 0 0 25.114909466 16.238682304 Q26.781036911 18.390852489 28.83926297 20.171729424 Z M23.935100906 26.921729424 Q21.605359462 25.514561357 19.043662288 24.595037155 A9.118033989 9.118033989 0 0 0 23.233822722 21.550707401 Q23.316734245 24.271174796 23.935100906 26.921729424 Z M16 29.5 Q14.942312217 26.992189457 13.410338434 24.742550932 A9.118033989 9.118033989 0 0 0 18.589661566 24.742550932 Q17.057687783 26.992189457 16 29.5 Z M8.064899094 26.921729424 Q8.683265755 24.271174796 8.766177278 21.550707401 A9.118033989 9.118033989 0 0 0 12.956337712 24.595037155 Q10.394640538 25.514561357 8.064899094 26.921729424 Z M3.16073703 20.171729424 Q5.218963089 18.390852489 6.885090534 16.238682304 A9.118033989 9.118033989 0 0 0 8.485589401 21.16451132 Q5.872650088 20.402694206 3.16073703 20.171729424 Z M3.16073703 11.828270576 Q5.872650088 11.597305794 8.485589401 10.83548868 A9.118033989 9.118033989 0 0 0 6.885090534 15.761317696 Q5.218963089 13.609147511 3.16073703 11.828270576 Z M8.064899094 5.078270576 Q10.394640538 6.485438643 12.956337712 7.404962845 A9.118033989 9.118033989 0 0 0 8.766177278 10.449292599 Q8.683265755 7.728825204 8.064899094 5.078270576 Z"/><circle cx="16" cy="16" r="6.5" fill="none" stroke="#E8913A" stroke-width="1.736067977"/></svg>'
const CHEVRON_SVG = '<svg class="chevron" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l6 6-6 6"/></svg>';
const CARET_SVG = '<svg class="caret" viewBox="0 0 11 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l4.5 4.5L10 1"/></svg>';
const EXT_SVG = '<svg class="ext" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l6-6M5 3h4v4"/></svg>';
export const BACK_SVG = '<svg viewBox="0 0 8 14" width="7" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 1L1 7l6 6"/></svg>';
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
const SCOUT_PROGRAM_COVENANT = "confidential processing: no content is retained · no human reviews it · nothing is used to train. your journal must verify the service before anything is sent.";
const TRANSPARENCY_INTRO = `<p class="intro">everything sol pbc holds for your sign-in is on this page. nothing more. no journal, no behavior, no tracking. we don't have your name, your phone, your address, or where you are: no analytics, no behavioral data, no third-party tracking. these aren't promises, they're structural commitments under <a href="https://solpbc.org/articles#s8-3">Article 8 of our articles of incorporation</a> (restated 2026-05-01) and <a href="https://solpbc.org/bylaws#art-3">Article III of the bylaws</a>.</p>`;

function brandbar() {
  return `<div class="brandbar">${MARK_SVG}<span class="wordmark">solstone</span></div>`;
}

function footer() {
  return `<footer class="footer"><a href="/transparency">data transparency</a><a href="/support">support</a><a href="/legal">terms</a><a href="https://solpbc.org/privacy">how we earn your trust ${EXT_SVG}</a><a href="https://solstone.app">solstone.app →</a></footer>`;
}

export function topbar({ email = null, lastSignInAt = null, now = null } = {}) {
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
  const body = desc ? `<div class="title">${title}</div><div class="desc">${desc}</div>` : `<div class="title">${title}</div>`;
  return `<a class="row" href="${href}">${ic}<div class="body">${body}</div><div class="trail">${trail}${CHEVRON_SVG}</div></a>`;
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
  <link rel="icon" type="image/svg+xml" href="/mark.svg">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <meta property="og:image" content="https://services.solstone.app/og-image.png">
  <meta property="og:image:width" content="512">
  <meta property="og:image:height" content="512">
  <link rel="stylesheet" href="${PORTAL_CSS_HREF}">
</head>
<body><main>${body}${footer()}</main>${afterMain}</body>
</html>`;
}

export function renderLanding(turnstileSiteKey, csrf, resume = {}, subhead = "sign in to manage the optional services you've turned on. the solstone app runs on your devices, and your journal lives on one of them. you don't sign in to use them.") {
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

export function renderEnableScout() {
  return layout({
    title: 'scout',
    body: `${brandbar()}
<h1>scout</h1>
<p class="lead">scout is the tester program. approved scouts can enable complimentary confidential processing from the journal and share feedback that helps shape solstone.</p>
<div class="card">
  <h2>continue with scout</h2>
  <p>request scout access or review your scout status in your services.</p>
  <p><a href="/scout">open scout</a></p>
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
      <div class="gd">so your sign-in recognizes this device. nothing from your journal comes with it: no entries, nothing the solstone app has taken in alongside you. just: this is your phone.</div>
    </div>
  </div>
  <div class="grant">
    <div class="n">2</div>
    <div>
      <div class="gt">enable notifications</div>
      <div class="gd">you will get a short heads-up, never the full thing, to your device when there's something worth your attention. you turn them on or off on each device.</div>
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
      <div class="gd">so the portal can approve this request without receiving anything from the journal: no entries, nothing the solstone app has taken in alongside you. just: this journal asked for private network access.</div>
    </div>
  </div>
  <div class="grant">
    <div class="n">2</div>
    <div>
      <div class="gt">enable private network access</div>
      <div class="gd">sol pbc records an approval for this journal and hands that approval back. nothing from the journal is sent to sol pbc to do this.</div>
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
    : '<p class="disclosure"><a href="/services/backup">set up encrypted backup</a>. sol pbc runs encrypted backup for you.</p>';
  return layout({
    title: 'enable encrypted backup',
    body: `${brandbar()}
<h1>enable encrypted backup</h1>
<p class="lead">sol pbc received a request to enable encrypted backup for your journal. two things, and only these two:</p>
<div class="card">
  <div class="grant">
    <div class="n">1</div>
    <div>
      <div class="gt">know this request is yours</div>
      <div class="gd">so sol pbc can approve this request. no journal content comes with it, only what identifies the request.</div>
    </div>
  </div>
  <div class="grant">
    <div class="n">2</div>
    <div>
      <div class="gt">enable encrypted backup</div>
      <div class="gd">sol pbc starts keeping a copy of your journal, encrypted on your device before it leaves, so only you can read it. restoring it later takes your recovery key, a sign-in here, and encrypted backup still on. sol pbc holds no copy of your recovery key, and cannot open your encrypted copy without that key.</div>
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
  <p>sol pbc runs encrypted backup for you.</p>
  <a class="btn primary" href="/services/backup">set up encrypted backup</a>
</div>`,
  });
}

export function renderEnableSpbRestoreConsent({ csrf, nonce, candidates, error = false }) {
  const several = candidates.length > 1;
  const candidateRows = several
    ? candidates.map((candidate) => `<label class="row" style="cursor:pointer">
  <input type="radio" name="selected_instance" value="${escAttr(candidate.instanceId)}">
  <span>${esc(restoreCandidateDetail(candidate))}</span>
</label>`).join('\n')
    : `<p>${esc(restoreCandidateDetail(candidates[0]))}</p>`;
  const selectedInput = several
    ? ''
    : `<input type="hidden" name="selected_instance" value="${escAttr(candidates[0].instanceId)}">`;
  const lead = several
    ? 'sol pbc received a restore request for your journal. sol pbc is holding more than one encrypted copy for you. choose which one to restore.'
    : 'sol pbc received a restore request for your journal. this is the encrypted copy sol pbc is holding for you:';
  return layout({
    title: 'restore from encrypted backup',
    body: `${brandbar()}
<h1>restore from encrypted backup</h1>
<p class="lead">${lead}</p>
<div class="card">
  <form method="post" action="/enable/backup/confirm">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    <input type="hidden" name="nonce" value="${escAttr(nonce)}">
    <input type="hidden" name="intent" value="restore">
    ${selectedInput}
    <div class="group">${candidateRows}</div>
    ${several && error ? '<p class="notice">nothing is selected yet.</p>' : ''}
    <p class="notice">only one journal at a time can back up to an encrypted copy. restoring reserves that spot for your journal, and any other journal still backing up to that copy stops.</p>
    <div class="btn-row" style="margin-top:20px">
      <button class="btn primary" name="action" value="allow" type="submit">restore</button>
      <button class="btn secondary" name="action" value="cancel" type="submit">cancel</button>
    </div>
  </form>
</div>`,
  });
}

export function renderEnableSpbRestoreNoHostedBackup() {
  return layout({
    title: "sol pbc isn't holding an encrypted copy under this sign-in",
    body: `${brandbar()}
<div class="card">
  <h2>sol pbc isn't holding an encrypted copy under this sign-in</h2>
  <p>if you have more than one way to sign in, sign out and sign back in the way you did when you set up encrypted backup.</p>
</div>`,
  });
}

export function renderEnableSpbRestoreExpired({ date }) {
  return layout({
    title: 'sol pbc deleted an encrypted copy',
    body: `${brandbar()}
<div class="card">
  <h2>sol pbc deleted an encrypted copy</h2>
  <p>on ${esc(date)}, sol pbc deleted that copy.</p>
</div>`,
  });
}

export function renderEnableSpbRestoreNeedsSubscription() {
  return layout({
    title: 'encrypted backup is off',
    body: `${brandbar()}
<div class="card">
  <h2>encrypted backup is off</h2>
  <p>sol pbc is still holding an encrypted copy for you. the restore needs encrypted backup on. sol pbc deletes that copy unless you turn encrypted backup back on. once it's back on, return to your journal and start the restore again. you'll enter your recovery key once more.</p>
  <a class="btn primary" href="/services/backup?intent=restore">turn encrypted backup back on</a>
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
<p class="lead">this journal is asking to turn on confidential processing. here's exactly what that means. it stays off until you allow it.</p>
<div class="card">
  <div class="grant">
    <div class="n">1</div>
    <div>
      <div class="gt">know this request is yours</div>
      <div class="gd">so the portal can approve this request without receiving anything from the journal: no entries, nothing the solstone app has taken in alongside you. just: this journal asked for confidential processing.</div>
    </div>
  </div>
  <div class="grant">
    <div class="n">2</div>
    <div>
      <div class="gt">what leaves your device</div>
      <div class="gd">when confidential processing is on, <a href="/confidential-processing/data">the text and images that go to a model for processing</a> leave your device. when the audio switch is on (its default), your audio recordings for transcription go too. your journal itself never leaves. it stays on your computer. voiceprints and speaker profiles are never created on the service; that work happens on your device and never leaves. what leaves goes to a model sol pbc runs itself: no third-party AI provider is in the path. it's processed and not kept. no content retained, no human review, nothing used to train.</div>
    </div>
  </div>
  <div class="grant">
    <div style="flex:none;width:26px"></div>
    <div>
      <div class="gt">audio has its own switch</div>
      <div class="gd">"transcribe audio on the service" lives in the journal's thinking app, in the confidential lane. it's on while confidential processing is in use. turn it off any time and it takes effect right away: speech becomes text on your device instead, and text and images continue under this choice.</div>
    </div>
  </div>
  <div class="grant">
    <div class="n">3</div>
    <div>
      <div class="gt">your journal must verify before it sends</div>
      <div class="gd">before anything is sent, your journal must verify the service on the other end, and it only sends if that check passes. if it can't verify, it doesn't send, and the solstone app tells you why. the engine runs on confidential hardware sol pbc operates: a model sol pbc runs itself, with no third-party AI provider in the path. sol pbc gives your device a credential so only this journal can reach the engine. the credential lives on your device, and sol pbc keeps only a hash of it. transcription included: if the check can't pass, your recordings wait on your device. they're never sent anywhere else, and it never quietly does it a different way.</div>
    </div>
  </div>
  <form method="post" action="/enable/spp/confirm">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    <input type="hidden" name="nonce" value="${escAttr(nonce)}">
    ${instanceInput}
    ${ackField('i understand what turning this on sends, and that my journal must verify the service before anything is sent.')}
    <div class="btn-row" style="margin-top:20px">
      <button class="btn primary" name="action" value="allow" type="submit">allow</button>
      <button class="btn secondary" name="action" value="cancel" type="submit" formnovalidate>cancel</button>
    </div>
  </form>
</div>
<p class="disclosure">confidential processing is available to approved scouts. it stays off until you allow it here, and you can turn it off from the journal anytime. <a href="/services/processing/terms">terms</a></p>`,
  });
}

export function renderEnableSppApprovalRequired() {
  return layout({
    title: 'scout approval required',
    body: `${brandbar()}
<div class="card">
  <h2 style="display:flex;align-items:center;gap:9px;font-size:1.15rem">scout approval required</h2>
  <p>confidential processing sends your thinking off your device, never your journal, which stays on your computer. it runs on a model sol pbc runs itself on confidential hardware sol pbc operates, which keeps nothing: it's processed and not kept, no content retained, no human review, nothing used to train. your journal must verify the service before anything is sent. if it can't verify, it doesn't send. no third-party AI provider is in the path.</p>
  <p>confidential processing is available to approved scouts. this sign-in is not currently approved, so there is nothing to enable here. you can close this tab.</p>
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

export function renderServicesCatalog({ signedIn, welcome = false, menu = {}, deviceCount = 0, networkActive = false, backupActive = false, sppActive = false } = {}) {
  if (!signedIn) {
    return layout({
      title: 'solstone services',
      body: `${brandbarSignin()}
<h1>solstone services</h1>
${BRANDLOCK}
<p class="intro"><strong>the solstone app runs on your devices, and your journal lives on one of them.</strong> these are the optional parts sol pbc runs for you. turn one on when it helps, off whenever you want. nothing here is required to use solstone.</p>
<div class="group">
  ${row('/private-network', IC_NET, 'private network', 'reach your journal from your phone, from anywhere, over a private network only your devices can enter.', '<span class="price">$20<span class="per">/yr</span></span>')}
  ${row('/backup', IC_BACKUP, 'encrypted backup', 'keep an encrypted copy of your journal somewhere safe. only you can read it.', '<span class="price">$48<span class="per">/yr</span></span>')}
  ${row('/notifications', IC_PUSH_SVG, 'notifications', 'notifications reach you when there’s something worth a look.', '<span class="tag builtin">built in</span>')}
  ${row('/confidential-processing', IC_CHIP, 'confidential processing', 'available to approved scouts. confidential processing extends your compute on confidential hardware sol pbc runs that keeps nothing.', '<span class="tag free">scouts</span>')}
  ${row('/scout', IC_SCOUT_SVG, 'scout', 'the tester program. approved scouts can enable confidential processing.', '<span class="tag free">program</span>')}
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
  const sppPill = pill(sppActive ? 'on' : 'off', sppActive ? 'available' : 'not available');
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
<p class="intro"><strong>the solstone app runs on your devices, and your journal lives on one of them.</strong> these services are optional. turn them on when they help, off whenever you want. nothing here is required.</p>
${welcomePanel}
<div class="group">
  ${row('/private-network', IC_NET, 'private network', 'your private network: reach your journal from anywhere.', networkPill)}
  ${row('/services/backup', IC_BACKUP, 'encrypted backup', 'an encrypted copy only you can read.', backupPill)}
  ${row('/notifications', IC_PUSH_SVG, 'notifications', 'notifications reach you when it matters, built in.', notifPill)}
  ${row('/confidential-processing', IC_CHIP, 'confidential processing', 'confidential processing, off your device on confidential hardware.', sppPill)}
  ${row('/scout', IC_SCOUT_SVG, 'scout', 'the tester program. approved scouts can enable confidential processing.', '<span class="tag free">program</span>')}
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
<p class="lead">notifications reach you on your devices when there’s something worth a look: a short heads-up, never the full thing.</p>
${BRANDLOCK}
<div class="card">
  ${beat(IC_PUSH_SVG, 'built into solstone', 'notifications come with solstone, free, with no hosted service to enable. you turn them on for each device, and choose what reaches you.')}
  ${beat(IC_GLOBE, 'on your devices', 'you get a short heads-up on your phone or laptop, never the content itself.')}
  ${beat(IC_VAULT, 'not a tracking surface', 'no analytics, no behavioral profiling, no third parties. notifications never become a way to watch you: Article 8.')}
</div>
<div class="card">
  <div class="statusline"><span class="tag builtin">built in</span> <span>turn on notifications on each device you want to hear from.</span></div>
</div>
<p class="disclosure"><a href="/legal">terms</a></p>`,
  });
}

export function renderConfidentialProcessingLanding() {
  return layout({
    title: 'confidential processing',
    body: brandbarSignin()
      + `\n<a class="back" href="/">${BACK_SVG} services</a>
<h1>confidential processing</h1>
<p class="hero-tag">extend your compute off your device</p>
<p class="lead">confidential processing sends <a href="/confidential-processing/data">your thinking off your device</a>, never your journal, which stays on your computer. it runs on confidential hardware sol pbc operates, using a model sol pbc runs itself with no third-party AI provider in the path.</p>
${BRANDLOCK}
<div class="card">
  ${beat(IC_CHIP, 'the thinking, off your device', 'confidential processing extends your compute on confidential hardware sol pbc runs that keeps nothing.')}
  ${beat(IC_VAULT, "sol pbc's own engine", "a model sol pbc runs itself, with no third-party AI provider in the path. it runs on confidential GPUs in Microsoft Azure that sol pbc operates, where the hardware boundary keeps the cloud host excluded from what's processed.")}
  ${beat(IC_EMPTY_DATA_SVG, 'kept for nothing', 'no content is retained · no human reviews it · nothing is used to train')}
  ${beat(IC_GLOBE, 'your journal does the checking', "your journal must verify the service before anything is sent. if it can't verify, it doesn't send.")}
</div>
<div class="card">
  <div class="statusline"><span class="tag free">available to approved scouts</span><span>confidential processing is available to approved scouts. enable it from the journal after approval.</span></div>
</div>
<p class="disclosure"><a href="/services/processing/terms">terms</a></p>`,
  });
}

export function renderConfidentialProcessingData() {
  const title = 'confidential processing';
  return layout({
    title,
    body: `${brandbar()}
<h1>${esc(title)}</h1>
<h2>what leaves your device</h2>
<p>the text and images that go to a model for processing. when the audio switch is on (its default), your audio recordings for transcription go too.</p>
<h2>what doesn't</h2>
<p>your journal stays on your computer. voiceprints and speaker profiles are computed on your device and never leave. nothing goes to any third-party AI provider.</p>
<h2>audio</h2>
<p>when confidential processing is on and the audio switch is on, your journal sends speech for transcription: segments up to five minutes each, prepared by your journal into one standard audio format. the service accepts exactly that format and rejects anything else. it travels only over the channel your journal has verified.</p>
<p>the service turns speech to text in memory on confidential hardware sol pbc operates and returns the transcript to your journal. nothing is written, nothing is kept, no human review, nothing used to train.</p>
<p>if your journal can't verify the service, transcription waits on your device. it never goes anywhere else and never silently falls back.</p>
<p>the "transcribe audio on the service" switch lives in the journal's thinking app, in the confidential lane: on while confidential processing is in use, off any time, effective immediately.</p>
<p>the model is the same either way: parakeet-tdt-0.6b-v3, the same parakeet generation the solstone app uses on your device. your journal checks the served model's identity. there's no premium tier: nothing is held back for the service.</p>
<p>speech-to-text is served with parakeet-tdt-0.6b-v3, created by NVIDIA, used under <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.</p>
<h2>where it goes</h2>
<p>a model sol pbc runs itself. no third-party AI provider is in the path.</p>
<h2>the hardware</h2>
<p>confidential GPUs in Microsoft Azure that sol pbc operates. the hardware boundary keeps the cloud host excluded from what's processed, and the model that runs on it is sol pbc's own. no third-party AI provider is in the path.</p>
<h2>what's kept</h2>
<p>no content is retained · no human reviews it · nothing is used to train.</p>
<h2>the check</h2>
<p>your journal must verify the service before anything is sent; if it can't verify, it doesn't send.</p>
<h2>your choice</h2>
<p>off until you turn it on; turn it off from the journal anytime; nothing is stranded (nothing was kept to strand).</p>
<h2>the covenants</h2>
<p>the covenants: <a href="/services/processing/terms">terms</a> · <a href="https://solpbc.org/privacy">privacy</a></p>`,
  });
}

export function renderScoutLanding() {
  return layout({
    title: 'scout',
    body: brandbarSignin()
      + `\n<a class="back" href="/">${BACK_SVG} services</a>
<h1>scout</h1>
<p class="lead">scout is the tester program. approved scouts can enable confidential processing from the journal and share feedback that helps shape solstone.</p>
${BRANDLOCK}
<div class="card">
  ${beat(IC_CHIP, 'confidential processing', 'confidential processing is available to approved scouts. enable it from the journal after approval.')}
  ${beat(IC_NET, 'your journal does the checking', "your journal must verify the service before anything is sent. if it can't verify, it doesn't send.")}
  ${beat(IC_SCOUT_SVG, 'kept for nothing', 'no content is retained · no human reviews it · nothing is used to train')}
  ${beat(IC_GLOBE, 'help shape solstone', "share feedback through support and follow what's changing.")}
</div>
<div class="card">
  <div class="pricecard">
    <div><div class="big" style="font-size:1.15rem">free <span class="price"><span class="per">· tester program</span></span></div></div>
    <a class="btn primary" href="/?signin">request scout</a>
  </div>
  <p class="free-note" style="margin:14px 0 0">${SCOUT_PROGRAM_COVENANT}</p>
</div>
<p class="disclosure"><a href="/legal">terms</a></p>`,
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
  <p class="disclosure">billed securely through stripe. <a href="/terms">terms</a></p>
</div>`,
  });
}

export function renderServicesSpb({ entitlement, csrf, flash = {}, menu, restoreIntent = false, restoreCheckout = false }) {
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
${restoreCheckout ? '<p class="notice">if you\'re restoring a journal, return to it and start the restore again. you\'ll enter your recovery key once more.</p>' : ''}
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
    ${billingCheckoutRow({ csrf, plan: 'annual', title: '$48 / year', buttonText: 'pay yearly', primary: true, action: '/services/backup/checkout', restoreIntent })}
    ${billingCheckoutRow({ csrf, plan: 'monthly', title: '$4.99 / month', buttonText: 'pay monthly', primary: false, action: '/services/backup/checkout', restoreIntent })}
  </div>
  <p class="disclosure">billed securely through Stripe.</p>
</div>
${restoreCheckout ? '' : '<p class="disclosure" style="margin-top:24px">if you turn encrypted backup off, sol pbc keeps your encrypted copy for 30 days. turn it back on within that window and it\'s still there. after 30 days it\'s deleted. your journal stays on your device either way. <a href="/backup">how it works</a> · <a href="/services/backup/terms">terms</a></p>'}`,
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
      statusLine: '<span class="pill on" style="vertical-align:middle"><span class="dot"></span>available</span> &nbsp;confidential processing is available to this sign-in',
      content: `<div class="group">
  <div class="row" style="cursor:default">${IC_CHIP}<div class="body"><div class="title">confidential processing</div><div class="desc">available to enable from your journal</div></div></div>
</div>
<p class="disclosure" style="margin-top:24px">your journal must verify the service before anything is sent. if it can't verify, it doesn't send. <a href="/services/processing/terms">terms</a></p>
<p class="disclosure">the "transcribe audio on the service" switch lives in the journal's thinking app.</p>`,
    });
  }

  return page({
    statusLine: '<span class="pill off" style="vertical-align:middle"><span class="dot"></span>not available</span> &nbsp;confidential processing is not available to this sign-in',
    content: `<p class="lead">confidential processing is available to approved scouts. this sign-in is not currently approved. visit <a href="/scout">scout</a> to request access.</p>
<div class="card">
  ${beat(IC_EMPTY_DATA_SVG, 'kept for nothing', 'no content is retained · no human reviews it · nothing is used to train')}
  ${beat(IC_CHIP, 'the thinking leaves', 'confidential processing sends your thinking off your device, never your journal, which stays on your computer. it runs on confidential hardware sol pbc operates, using a model sol pbc runs itself with no third-party AI provider in the path.')}
</div>
<p class="disclosure" style="margin-top:24px"><a href="/scout">request scout access</a> · <a href="/services/processing/terms">terms</a></p>`,
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
${sessionHtml ? `<div class="group">${sessionHtml}</div>` : '<p>no sessions.</p>'}
<p><a class="btn danger" href="/account/delete">delete sign-in and your services</a></p>`,
  });
}

// Shared owner-deletion form structure. Keeping validation, labelling, and live
// status markup here prevents the request, proof, and cancellation pages from
// drifting into different accessibility behaviour.
export function renderDeletionForm({
  heading,
  action,
  submitLabel,
  fields = [],
  hidden = {},
  error = '',
  status = '',
  statusId = 'deletion-status',
  intro = '',
  extra = '',
  method = 'post',
}) {
  const invalid = error && fields.length ? fields : [];
  const errors = invalid.map((field) => ({ id: field.id, message: error }));
  const errorSummary = errors.length
    ? `<div class="error" role="alert" tabindex="-1" id="deletion-error-summary">
  <h2>there is a problem</h2>
  <ul>${errors.map((entry) => `<li><a href="#${escAttr(entry.id)}">${esc(entry.message)}</a></li>`).join('')}</ul>
</div>`
    : '';
  const hiddenHtml = Object.entries(hidden)
    .map(([name, value]) => `<input type="hidden" name="${escAttr(name)}" value="${escAttr(value)}">`)
    .join('');
  const fieldHtml = fields.map((field) => {
    const fieldError = errors.find((entry) => entry.id === field.id);
    const hintId = `${field.id}-hint`;
    const errorId = `${field.id}-error`;
    const describedBy = [hintId, fieldError ? errorId : ''].filter(Boolean).join(' ');
    return `<div class="field">
  <label for="${escAttr(field.id)}">${esc(field.label)}</label>
  <p class="hint" id="${escAttr(hintId)}">${esc(field.hint)}</p>
  <input id="${escAttr(field.id)}" name="${escAttr(field.name)}" type="${escAttr(field.type || 'text')}"${field.inputmode ? ` inputmode="${escAttr(field.inputmode)}"` : ''}${field.autocomplete ? ` autocomplete="${escAttr(field.autocomplete)}"` : ''}${field.pattern ? ` pattern="${escAttr(field.pattern)}"` : ''}${field.required === false ? '' : ' required'}${fieldError ? ` aria-invalid="true" aria-describedby="${escAttr(describedBy)}"` : ` aria-describedby="${escAttr(hintId)}"`}>
  ${fieldError ? `<p class="error" id="${escAttr(errorId)}">${esc(fieldError.message)}</p>` : ''}
</div>`;
  }).join('');
  return `<h1>${esc(heading)}</h1>
${errorSummary}
<p class="notice" aria-live="polite" id="${escAttr(statusId)}">${esc(status)}</p>
${intro ? `<p class="lead">${esc(intro)}</p>` : ''}
<div class="card"><form method="${escAttr(method)}" action="${escAttr(action)}">
${hiddenHtml}
${fieldHtml}
${extra}
<button class="btn danger" type="submit">${esc(submitLabel)}</button>
</form></div>`;
}

export function renderDeletionPage({ menu, error = '', status = '' }) {
  return layout({
    title: 'delete sign-in and your services',
    body: `${topbar(menu)}
<a class="back" href="/transparency">${BACK_SVG} data transparency</a>
${renderDeletionForm({
  heading: 'delete sign-in and your services',
  action: '/account/delete/proof/otp',
  submitLabel: 'send a confirmation code',
  hidden: { purpose: 'delete' },
  error,
  status,
  statusId: 'deletion-request-status',
  intro: 'This begins deletion of your portal sign-in and services after you confirm ownership.',
})}
<p>This does not delete a journal, device, or bucket you control. Those remain under their own owner-controlled arrangements.</p>
<p class="disclosure">Retention and financial deletion details will be provided here before this feature is deployed.</p>`,
  });
}

export function renderDeletionProofPage({ menu, purpose, error = '', status = '' }) {
  const action = purpose === 'cancel' ? '/account/delete/cancel' : '/account/delete/confirm';
  const actionLabel = purpose === 'cancel' ? 'cancel deletion' : 'confirm deletion request';
  return layout({
    title: purpose === 'cancel' ? 'prove ownership to cancel deletion' : 'prove ownership to delete',
    body: `${topbar(menu)}
<a class="back" href="/account/delete">${BACK_SVG} deletion request</a>
${renderDeletionForm({
  heading: purpose === 'cancel' ? 'prove ownership to cancel deletion' : 'prove ownership to delete',
  action: '/account/delete/proof/otp/verify',
  submitLabel: 'verify code',
  hidden: { purpose },
  error,
  status,
  statusId: 'deletion-otp-status',
  intro: 'Enter the fresh code sent to your verified email address.',
  fields: [{
    id: 'deletion-otp-code', name: 'code', label: '6-digit code',
    hint: 'The code expires in 10 minutes.', type: 'text', inputmode: 'numeric',
    autocomplete: 'one-time-code', pattern: '[0-9]*',
  }],
})}
${renderDeletionForm({
  heading: 'passkey proof',
  action,
  submitLabel: actionLabel,
  hidden: { purpose },
  status: '',
  statusId: 'deletion-passkey-status',
  intro: 'If you have an active passkey, you must also verify it before continuing.',
  extra: `<button class="btn secondary" type="button" data-deletion-passkey data-purpose="${escAttr(purpose)}">verify with passkey</button>`,
})}
${deletionPasskeyScript()}`,
  });
}

export function renderDeletionCancelPage({ menu, phase }) {
  if (phase === 'purging') {
    return layout({
      title: 'deletion in progress',
      body: `${topbar(menu)}<h1>deletion in progress</h1><p>The deletion safety period has ended and this request can no longer be cancelled.</p>`,
    });
  }
  return layout({
    title: 'cancel deletion request',
    body: `${topbar(menu)}
${renderDeletionForm({
  heading: 'cancel deletion request',
  action: '/account/delete/proof/otp',
  submitLabel: 'send a cancellation code',
  hidden: { purpose: 'cancel' },
  intro: 'A fresh ownership proof is required before cancellation.',
  statusId: 'deletion-cancel-status',
})}`,
  });
}

export function renderDeletionStatus({ state = 'deletion status unavailable' } = {}) {
  return layout({
    title: 'deletion status',
    body: `${brandbar()}<h1>deletion status</h1><p aria-live="polite">${esc(state)}</p>`,
  });
}

function deletionPasskeyScript() {
  return `<script>
document.querySelectorAll('[data-deletion-passkey]').forEach((button) => button.addEventListener('click', async () => {
  const status = document.getElementById('deletion-passkey-status');
  const purpose = button.dataset.purpose;
  try {
    const start = await fetch('/account/delete/proof/passkey/start', {method:'POST',headers:{'Content-Type':'application/json','Origin':location.origin},body:JSON.stringify({purpose})});
    const startBody = await start.json();
    if (!start.ok) throw new Error('start');
    const options = startBody.options;
    options.challenge = Uint8Array.from(atob(options.challenge.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
    options.allowCredentials = (options.allowCredentials || []).map((item) => ({...item,id:Uint8Array.from(atob(item.id.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0))}));
    const credential = await navigator.credentials.get({publicKey:options});
    const b64 = (value) => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
    const response = {id:credential.id,rawId:b64(credential.rawId),type:credential.type,response:{clientDataJSON:b64(credential.response.clientDataJSON),authenticatorData:b64(credential.response.authenticatorData),signature:b64(credential.response.signature),userHandle:credential.response.userHandle ? b64(credential.response.userHandle) : null},clientExtensionResults:credential.getClientExtensionResults()};
    const finish = await fetch('/account/delete/proof/passkey/finish', {method:'POST',headers:{'Content-Type':'application/json','Origin':location.origin},body:JSON.stringify({purpose,response})});
    if (!finish.ok) throw new Error('finish');
    status.textContent = 'passkey proof verified';
  } catch (_) { window.location.reload(); }
}));
</script>`;
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
    <p>turn it on from the solstone app on your device. it opens this page so you can confirm, then notifications can reach your devices.</p>
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

export function renderServicesScout({ application, nowMs, flash = {}, menu }) {
  const flashes = flashMessages(flash);
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
      lead: 'scout access for this sign-in has ended.',
    });
  }

  if (application?.status === 'approved') {
    const ackForm = application.data_acked_at == null
      ? `<div class="card">
  <h2>confirm the scout covenant</h2>
  ${scoutApplyForm({ includeUseCase: false, buttonText: 'i understand' })}
</div>`
      : '';
    return page({
      statusLine: '<span class="pill on" style="vertical-align:middle"><span class="dot"></span>approved</span> &nbsp;scout access is approved for this sign-in',
      lead: 'confidential processing is available to approved scouts. enable it from the journal.',
      content: ackForm,
    });
  }

  if (application?.status === 'pending') {
    const pendingText = application.applied_at == null
      ? 'pending'
      : `pending, applied ${formatRelativeTime(application.applied_at, nowMs)}`;
    return page({
      statusLine: `<span class="pill off" style="vertical-align:middle"><span class="dot"></span>${esc(pendingText)}</span>`,
      lead: 'your scout request is under review.',
    });
  }

  return page({
    statusLine: '<span class="pill off" style="vertical-align:middle"><span class="dot"></span>not approved</span>',
    lead: 'request scout access for this sign-in. approved scouts can enable confidential processing from the journal and share feedback that helps shape solstone.',
    content: `<div class="card">
  <h2>request access</h2>
  ${scoutApplyForm({ includeUseCase: true, buttonText: 'apply' })}
</div>`,
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

export function ackField(copy) {
  return `<label class="ack">
      <input type="checkbox" name="data_ack" value="yes" required>
      <span>${esc(copy)}</span>
    </label>`;
}

function scoutCovenantFields() {
  return `<p class="gd" style="margin:16px 0 12px">${SCOUT_PROGRAM_COVENANT}</p>
    ${ackField('i understand')}`;
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

export function renderTermsIndex() {
  const title = 'terms of service';
  return layout({
    title,
    body: `${brandbar()}
<h1>${esc(title)}</h1>
<p class="intro">each of these covers the single service it names as operated by sol pbc.</p>
<div class="group">
  ${row('/terms', IC_NET, 'private network', '', '')}
  ${row('/services/backup/terms', IC_BACKUP, 'encrypted backup', '', '')}
  ${row('/services/processing/terms', IC_CHIP, 'confidential processing', '', '')}
</div>`,
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
<p>${esc(`this isn't just our policy — it's `)}<strong>${esc(`structural.`)}</strong>${esc(` sol pbc's `)}<strong>${esc(`articles of incorporation (Article 8, the Customer Privacy Covenant)`)}</strong>${esc(` legally bind the company never to sell, license, or lease your data, never to use it for targeted advertising or behavioral profiling, and never to hand it outside sol pbc except in the narrow ways the covenant allows: to a provider strictly needed to run the service you asked for, at your own direction, or where the law compels it — and those bind any successor through a sale, merger, or change of control of the company. you can read it at `)}<a href="https://solpbc.org">${esc(`solpbc.org`)}</a>${esc(`.`)}</p>
<p>${esc(`for the complete picture — every category of data we handle, every infrastructure and payment provider we rely on to run the service (including cloudflare and stripe), how long we keep each thing, and exactly how to exercise your rights — see our `)}<a href="https://solpbc.org/privacy">${esc(`privacy policy`)}</a>${esc(`.`)}</p>
<h2>${esc(`10. how long we keep it, and your rights`)}</h2>
<ul>
  <li>${esc(`we keep your billing details for `)}<strong>${esc(`as long as you have a subscription, plus the period tax and financial-records law requires us to keep afterward`)}</strong>${esc(` (generally up to seven years for transaction records). when neither applies anymore, we delete them.`)}</li>
  <li>${esc(`you can `)}<strong>${esc(`see, correct, export, or delete`)}</strong>${esc(` your sign-in and billing data anytime — most of it directly from your settings at `)}<code>${esc(`services.solstone.app/settings/data`)}</code>${esc(`, and the rest by emailing `)}<code>${esc(`support@solstone.app`)}</code>${esc(`. deleting your subscription data ends the hosted relay; it never touches your journal.`)}</li>
  <li>${esc(`you have the privacy rights your state or country gives you — including the `)}<strong>${esc(`Colorado Privacy Act`)}</strong>${esc(`, and the `)}<strong>${esc(`CCPA/CPRA`)}</strong>${esc(` in California and `)}<strong>${esc(`GDPR`)}</strong>${esc(` in the EU/UK — to access, correct, delete, and port your data, and to opt out. sol pbc's covenants go further than any of them require. exercise any of them at `)}<code>${esc(`support@solstone.app`)}</code>${esc(`; we'll respond as fast as we can, and within the time the law requires — 45 days under the Colorado Privacy Act, with the extensions the law allows. `)}<strong>${esc(`if we deny a request,`)}</strong>${esc(` you can appeal by replying to that email; we'll respond to the appeal within 45 days, and if we deny the appeal, you can raise it with the `)}<a href="https://coag.gov/office-sections/consumer-protection/">${esc(`Colorado Attorney General`)}</a>${esc(`.`)}</li>
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
  <li><strong>${esc(`bring your own storage`)}</strong>${esc(` — set up encrypted backup with your own object-storage bucket (Backblaze B2, Amazon S3, Cloudflare R2, any S3-compatible provider). you pay your provider directly; sol pbc is never contacted and never holds your data.`)}</li>
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
<p>${esc(`this isn't just our policy — it's `)}<strong>${esc(`structural.`)}</strong>${esc(` sol pbc's `)}<strong>${esc(`articles of incorporation (Article 8, the Customer Privacy Covenant)`)}</strong>${esc(` legally bind the company never to sell, license, or lease your data — backup, metadata, or billing details alike — never to use it for targeted advertising or behavioral profiling, and never to hand it outside sol pbc except in the narrow ways the covenant allows: to a provider strictly needed to run the service you asked for, at your own direction, or where the law compels it — and those bind any successor through a sale, merger, or change of control of the company. the fact that the blocks we hold are blocks we can't read is one of those covenants made concrete. you can read it at `)}<a href="https://solpbc.org">${esc(`solpbc.org`)}</a>${esc(`.`)}</p>
<p>${esc(`for the complete picture — every category of data we handle, every infrastructure and payment provider we rely on to run the service (including cloudflare and stripe), how long we keep each thing, and exactly how to exercise your rights — see our `)}<a href="https://solpbc.org/privacy">${esc(`privacy policy`)}</a>${esc(`.`)}</p>
<h2>${esc(`10. how long we keep it, and your rights`)}</h2>
<ul>
  <li>${esc(`we keep your `)}<strong>${esc(`encrypted backup`)}</strong>${esc(` for as long as your subscription is active. `)}<strong>${esc(`when your subscription lapses, we keep it for 30 days, then permanently delete it`)}</strong>${esc(` (§ 4). you can also delete it yourself at any time from the backup management screen in solstone, which removes it from our storage; deleting it never touches your journal on your own devices.`)}</li>
  <li>${esc(`we keep your `)}<strong>${esc(`billing details`)}</strong>${esc(` for `)}<strong>${esc(`as long as you have a subscription, plus the period tax and financial-records law requires us to keep afterward`)}</strong>${esc(` (generally up to seven years for transaction records). when neither applies anymore, we delete them.`)}</li>
  <li>${esc(`you can `)}<strong>${esc(`see, correct, export, or delete`)}</strong>${esc(` your sign-in and billing data anytime — most of it directly from your settings at `)}<code>${esc(`services.solstone.app/settings/data`)}</code>${esc(`, and the rest by emailing `)}<code>${esc(`support@solstone.app`)}</code>${esc(`. your backup itself is encrypted and under your control: you restore it with your recovery key, and you delete it from the backup screen.`)}</li>
  <li>${esc(`you have the privacy rights your state or country gives you — including the `)}<strong>${esc(`Colorado Privacy Act`)}</strong>${esc(`, and the `)}<strong>${esc(`CCPA/CPRA`)}</strong>${esc(` in California and `)}<strong>${esc(`GDPR`)}</strong>${esc(` in the EU/UK — to access, correct, delete, and port your data, and to opt out. sol pbc's covenants go further than any of them require. exercise any of them at `)}<code>${esc(`support@solstone.app`)}</code>${esc(`; we'll respond as fast as we can, and within the time the law requires — 45 days under the Colorado Privacy Act, with the extensions the law allows. `)}<strong>${esc(`if we deny a request,`)}</strong>${esc(` you can appeal by replying to that email; we'll respond to the appeal within 45 days, and if we deny the appeal, you can raise it with the `)}<a href="https://coag.gov/office-sections/consumer-protection/">${esc(`Colorado Attorney General`)}</a>${esc(`.`)}</li>
</ul>
<h2>${esc(`11. changes to these terms`)}</h2>
<p>${esc(`we may update these terms. if a change is material, we'll notify you before it takes effect. for a change that takes effect at your next renewal, you can cancel before then if you don't agree. if a material change has to take effect mid-term, we'll give you notice and a way to cancel with a prorated refund of the unused period. we'll keep the current version posted here with its date.`)}</p>
<h2>${esc(`12. who you're dealing with, and the law that applies`)}</h2>
<p>${esc(`these terms are between you and `)}<strong>${esc(`sol pbc`)}</strong>${esc(`, a Colorado public benefit corporation. they're governed by Colorado law. questions: `)}<code>${esc(`support@solstone.app`)}</code>${esc(`.`)}</p>`,
  });
}

export function renderProcessingTerms() {
  const title = 'confidential processing · terms';
  return layout({
    title,
    body: `${brandbar()}
<h1>${esc(title)}</h1>
<p class="meta"><em>${esc(`last updated: August 25, 2026 · operated by sol pbc, a colorado public benefit corporation`)}</em></p>
<p>${esc(`these terms cover `)}<strong>${esc(`confidential processing`)}</strong>${esc(`: the AI model sol pbc runs on confidential GPU hardware, so your journal can think with more capacity than the machine it lives on. they're between you and sol pbc. we show you these terms when you turn confidential processing on, and turning it on is how you agree to them.`)}</p>
<h2>${esc(`1. you never have to pay us`)}</h2>
<p>${esc(`this is capacity, not a gate. your journal can always think without us:`)}</p>
<ul>
  <li><strong>${esc(`a model on your own hardware.`)}</strong>${esc(` nothing leaves your device, and sol pbc is not in the path at all.`)}</li>
  <li><strong>${esc(`bring your own key.`)}</strong>${esc(` point your journal at your own provider account. the key stays in your journal, and sol pbc is not in the path.`)}</li>
  <li><strong>${esc(`bring your own endpoint.`)}</strong>${esc(` point your journal at any endpoint you run or trust.`)}</li>
</ul>
<p>${esc(`confidential processing is a convenience for when your machine doesn't have the capacity you want. `)}<strong>${esc(`it is never a privacy upgrade over running locally.`)}</strong>${esc(` if you stop using it, you lose capacity. you do not lose your journal, and you do not lose your privacy.`)}</p>
<h2>${esc(`2. what you're getting, and what it is not`)}</h2>
<ul>
  <li><strong>${esc(`an engine sol pbc runs itself.`)}</strong>${esc(` sol pbc's own model weights on sol pbc's own serving stack, on confidential GPU hardware sol pbc operates. thinking is served with `)}<code>${esc(`Qwen/Qwen3.5-4B`)}</code>${esc(`, the `)}<strong>${esc(`same model generation that runs on your own device`)}</strong>${esc(`: the hosted service gives you more capacity, never a better model, and nothing is held back for it. `)}<strong>${esc(`no third-party AI provider is in the path`)}</strong>${esc(`, and nothing you send is handed to one.`)}</li>
  <li><strong>${esc(`it is off until you turn it on`)}</strong>${esc(`, and you can turn it off at any time from the journal.`)}</li>
  <li><strong>${esc(`it is not the sealed arrangement our other two services have.`)}</strong>${esc(` the relay can't read what passes through it and the operated backup holds blocks we have no key to. this one is different: what you send is `)}<strong>${esc(`encrypted over the network, and visible in running memory only while it is being processed`)}</strong>${esc(` by our engine. we will not tell you we never see it. what we will tell you is what becomes of it, in § 10.`)}</li>
  <li><strong>${esc(`the hardware is Microsoft Azure's, and Azure is excluded from what runs on it.`)}</strong>${esc(` the machine is a confidential GPU instance: an AMD SEV-SNP confidential virtual machine with an NVIDIA H100 in confidential-compute mode. that boundary is enforced by the hardware rather than by configuration or by promise, and it keeps the host out of what is being processed, memory included. Microsoft hosts the machine. it is not a party to your content.`)}</li>
  <li><strong>${esc(`speech.`)}</strong>${esc(` when the audio switch is on, your journal sends speech for transcription over the same verified channel. it is served with `)}<code>${esc(`parakeet-tdt-0.6b-v3`)}</code>${esc(`, created by NVIDIA and used under `)}<a href="https://creativecommons.org/licenses/by/4.0/">${esc(`CC BY 4.0`)}</a>${esc(`: the same model generation that runs on your own device, so nothing is held back for the service. the switch is `)}<strong>${esc(`on by default`)}</strong>${esc(` whenever confidential processing is in use. turning it off keeps speech-to-text on your own device, effective on the next thing you say.`)}</li>
  <li><strong>${esc(`access`)}</strong>${esc(` is complimentary while you're an approved scout. if and when paid plans open, the price and the billing interval are shown to you before any charge, and nothing about the sections below changes except that §§ 4, 6, and 8 start to apply to you.`)}</li>
</ul>
<h2>${esc(`3. the part you don't have to take on trust`)}</h2>
<p>${esc(`most services ask you to believe a privacy claim. this one is built so your own journal can check it.`)}</p>
<ul>
  <li><strong>${esc(`your journal verifies the hardware before anything is sent.`)}</strong>${esc(` it checks the AMD attestation chain up to AMD's own signing keys, the GPU's own evidence, the binding of that evidence to the encrypted connection, and a fingerprint of exactly which software booted on that machine.`)}</li>
  <li><strong>${esc(`that fingerprint is pinned in solstone's open source code.`)}</strong>${esc(` it is public, it is version-controlled, and it ships in the same signed releases everything else does. `)}<strong>${esc(`we commit that sol pbc will not point you at different software without a release you can read.`)}</strong>${esc(` we could not do it quietly if we wanted to.`)}</li>
  <li><strong>${esc(`if the check fails, nothing is sent.`)}</strong>${esc(` your journal waits, tells you plainly that it could not verify, and `)}<strong>${esc(`never silently falls back to another service or another provider.`)}</strong>${esc(` deferring is the designed behavior, not a failure mode we tolerate.`)}</li>
  <li>${esc(`you can turn the whole thing off and go back to processing locally at any moment, for any reason or none.`)}</li>
</ul>
<h2>${esc(`4. how access renews, if and when you subscribe`)}</h2>
<p>${esc(`these terms apply while access is complimentary. `)}<strong>${esc(`if and when paid access opens and you choose to subscribe`)}</strong>${esc(`, this section is how it works, and you agree to it at checkout, where the price, the billing interval, and the automatic renewal are shown and you affirmatively agree before any charge:`)}</p>
<ul>
  <li><strong>${esc(`your subscription renews automatically`)}</strong>${esc(` at the end of each term, at your plan's then-current price, using your payment method on file, `)}<strong>${esc(`until you cancel.`)}</strong></li>
  <li>${esc(`for any `)}<strong>${esc(`annual`)}</strong>${esc(` plan, we email you a reminder `)}<strong>${esc(`15 to 45 days before each renewal`)}</strong>${esc(`, with the renewal date, the amount, and a one-click link to cancel, so a yearly charge is never a surprise.`)}</li>
  <li>${esc(`we'll tell you in advance if the price ever changes. a price change only takes effect on a renewal after we've notified you, and you can cancel before it applies.`)}</li>
</ul>
<h2>${esc(`5. turning it off, and what happens to your journal`)}</h2>
<ul>
  <li><strong>${esc(`turn it off from the journal, anytime, and it takes effect immediately.`)}</strong>${esc(` stopping the processing needs nothing from us and no billing portal.`)}</li>
  <li><strong>${esc(`turning it off stops the processing; it does not cancel a subscription.`)}</strong>${esc(` if and when you're subscribed, `)}<strong>${esc(`cancel anytime, in two clicks, from the billing portal`)}</strong>${esc(`. no phone call, no email, no retention maze. canceling stops future charges, and access keeps working through the end of the period you've already paid for, then turns off on its own.`)}</li>
  <li><strong>${esc(`nothing is stranded, because nothing was stored.`)}</strong>${esc(` your journal goes back to thinking on your own hardware, or with whatever key or endpoint you point it at.`)}</li>
  <li><strong>${esc(`your journal is never touched.`)}</strong>${esc(` it lives on your own devices. turning this off doesn't reach it, and neither does canceling a subscription.`)}</li>
  <li>${esc(`the audio switch is separate and works the same way: turn it off and speech becomes text on your own device instead.`)}</li>
</ul>
<h2>${esc(`6. refunds, if and when you subscribe`)}</h2>
<ul>
  <li>${esc(`because canceling lets you keep access through the end of the period you paid for, we don't run refund math on cancellation.`)}</li>
  <li>${esc(`if you're charged in error, whether a duplicate charge, a charge after you canceled, or a billing mistake, email `)}<code>${esc(`support@solstone.app`)}</code>${esc(` or use the billing portal and `)}<strong>${esc(`we'll refund the incorrect amount.`)}</strong>${esc(` this doesn't affect any chargeback or refund right you have through your card issuer or under the law.`)}</li>
  <li>${esc(`nothing here waives any refund or cancellation right the law gives you where you live.`)}</li>
</ul>
<h2>${esc(`7. acceptable use`)}</h2>
<p>${esc(`confidential processing is for thinking with your own journal. don't use it to generate or pursue things that are unlawful, that are meant to harm or harass someone, that impersonate a real person in order to deceive, or that attack the service or anyone else's systems. don't use it at a volume that degrades the service for everyone else, and don't route other people's traffic through it.`)}</p>
<p><strong>${esc(`what suspension can touch, and what it can never touch.`)}</strong>${esc(` sustained abuse can suspend your access to confidential processing. `)}<strong>${esc(`it can never suspend your journal, your local processing, or your bring-your-own key or endpoint.`)}</strong>${esc(` those are yours and they don't run through us. we'll tell you if we suspend access, why, and what it would take to restore it, and you can reply to `)}<code>${esc(`support@solstone.app`)}</code>${esc(` about it.`)}</p>
<h2>${esc(`8. payment is handled by stripe, if and when you subscribe`)}</h2>
<ul>
  <li>${esc(`sol pbc does not take or store your card. payments run through `)}<strong>${esc(`stripe`)}</strong>${esc(`, our payment processor. your card and payment details go `)}<strong>${esc(`directly to stripe`)}</strong>${esc(` and are handled under stripe's own `)}<a href="https://stripe.com/legal">${esc(`terms`)}</a>${esc(` and `)}<a href="https://stripe.com/privacy">${esc(`privacy policy`)}</a>${esc(`.`)}</li>
  <li>${esc(`sol pbc receives from stripe only what it needs to run your subscription: that a payment succeeded or failed, when it renews, and a reference tying the subscription to your solstone sign-in. `)}<strong>${esc(`your card number never touches sol pbc's servers.`)}</strong></li>
  <li>${esc(`stripe is bound, as our payment processor, not to use what we send it for anything except processing your payments. as a regulated payment company it also runs the fraud and anti-money-laundering checks the law requires of it. `)}<strong>${esc(`sol pbc never sends stripe anything from your journal.`)}</strong></li>
</ul>
<h2>${esc(`9. the service is provided as-is, and so is what it produces`)}</h2>
<p>${esc(`we work to keep confidential processing up, but we don't guarantee uninterrupted service. it can go down for maintenance or for reasons outside our control, and it will deliberately refuse to run when your journal can't verify it. the local path is always your fallback.`)}</p>
<p><strong>${esc(`what the model produces is not advice, and it is not checked by anyone.`)}</strong>${esc(` a model can be confidently wrong. `)}<strong>${esc(`don't rely on what it produces for medical, legal, financial, safety, or any other decision that matters`)}</strong>${esc(`, and check it before you act.`)}</p>
<p>${esc(`as between you and sol pbc, `)}<strong>${esc(`what you send and what comes back are yours.`)}</strong>${esc(` you grant sol pbc a limited license to process what you send, for as long as it takes to answer, solely to run confidential processing and hand the result back to you, and for nothing else. sol pbc claims no ownership of either and makes no warranty that output is accurate, complete, current, or fit for any purpose.`)}</p>
<p><strong>${esc(`to the fullest extent permitted by law, confidential processing is provided "as is" and "as available," and sol pbc disclaims all implied warranties, including merchantability and fitness for a particular purpose. sol pbc is not liable for indirect, incidental, or consequential damages, and sol pbc's total liability for confidential processing is limited to the greater of the fees you paid for it in the 12 months before the claim, or $100.`)}</strong>${esc(` nothing in these terms limits liability that cannot be limited by law, including for fraud, gross negligence, willful misconduct, or personal injury, or any statutory right you have as a consumer.`)}</p>
<h2>${esc(`10. how your data is used`)}</h2>
<p>${esc(`running this service involves three different things, and we keep them apart:`)}</p>
<ul>
  <li><strong>${esc(`what you send the model.`)}</strong>${esc(` the text and images your journal needs a model to work through, plus your speech when the audio switch is on. our engine processes it and returns the result. `)}<strong>${esc(`the service runs zero data retention: no content is kept once your request is answered, not even in logs. no human reviews it. it is never sold, licensed, shared, profiled, or used for advertising.`)}</strong></li>
  <li><strong>${esc(`nothing you send is used to train anything.`)}</strong>${esc(` not our models, not anyone else's. this is a commitment we make to you, and it is reinforced by our covenants: sol pbc's `)}<strong>${esc(`articles of incorporation (Article 8, the Customer Privacy Covenant)`)}</strong>${esc(` legally bind the company never to sell, license, or lease your data, never to use it for targeted advertising or behavioral profiling, and never to hand it outside sol pbc except in the narrow ways the covenant allows: to a provider strictly needed to run the service you asked for (Azure and stripe, above), at your own direction, or where the law compels it. those bind any successor through a sale, merger, or change of control. you can read them at `)}<a href="https://solpbc.org">${esc(`solpbc.org`)}</a>${esc(`.`)}</li>
  <li><strong>${esc(`counts, not content.`)}</strong>${esc(` to run the service and keep it healthy we keep fleet-wide totals. they are counts rather than content, they are not associated with you, your journal, or your account, and they are never used to profile you or to advertise to you.`)}</li>
  <li><strong>${esc(`your billing details, if and when you subscribe.`)}</strong>${esc(` your email, the fact of the subscription, renewal dates, and a reference linking it to your sign-in. used only to run your subscription.`)}</li>
</ul>
<p>${esc(`for the complete picture, including every provider we rely on to run the service and how long we keep each thing, see our `)}<a href="https://solpbc.org/privacy">${esc(`privacy policy`)}</a>${esc(`.`)}</p>
<h2>${esc(`11. how long we keep it, and your rights`)}</h2>
<ul>
  <li><strong>${esc(`what you send the model is not kept at all`)}</strong>${esc(`, so there is nothing there to retain, export, or delete.`)}</li>
  <li>${esc(`we keep any billing details for `)}<strong>${esc(`as long as you have a subscription, plus the period tax and financial-records law requires us to keep afterward`)}</strong>${esc(` (generally up to seven years for transaction records). when neither applies anymore, we delete them.`)}</li>
  <li>${esc(`you can `)}<strong>${esc(`see, correct, export, or delete`)}</strong>${esc(` your sign-in and billing data anytime, most of it directly from your settings at `)}<code>${esc(`services.solstone.app/settings/data`)}</code>${esc(` and the rest by emailing `)}<code>${esc(`support@solstone.app`)}</code>${esc(`.`)}</li>
  <li>${esc(`you have the privacy rights your state or country gives you, including the `)}<strong>${esc(`Colorado Privacy Act`)}</strong>${esc(`, the `)}<strong>${esc(`CCPA/CPRA`)}</strong>${esc(` in California, and `)}<strong>${esc(`GDPR`)}</strong>${esc(` in the EU and UK: to access, correct, delete, and port your data, and to opt out. sol pbc's covenants go further than any of them require. exercise any of them at `)}<code>${esc(`support@solstone.app`)}</code>${esc(`; we'll respond as fast as we can, and within the time the law requires: 45 days under the Colorado Privacy Act, with the extensions the law allows. `)}<strong>${esc(`if we deny a request you can appeal by replying to that email, and we'll respond to the appeal within 45 days. if we deny the appeal, you can raise it with the `)}<a href="https://coag.gov/office-sections/consumer-protection/">${esc(`Colorado Attorney General`)}</a>${esc(`.`)}</strong></li>
</ul>
<h2>${esc(`12. changes to these terms`)}</h2>
<p>${esc(`we may update these terms. if a change is material, we'll notify you before it takes effect. for a change that takes effect at a renewal, you can cancel before then if you don't agree. if a material change has to take effect mid-term, we'll give you notice and a way to cancel with a prorated refund of the unused period. we'll keep the current version posted here with its date.`)}</p>
<h2>${esc(`13. who you're dealing with, and the law that applies`)}</h2>
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

export function formatByteSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value < 1024) return `${Math.floor(value)} bytes`;
  const units = ['KB', 'MB', 'GB'];
  let scaled = value / 1024;
  let unit = 0;
  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024;
    unit += 1;
  }
  return `${Number(scaled.toFixed(1))} ${units[unit]}`;
}

function restoreCandidateDetail(candidate) {
  return `last backup ${formatRelativeTime(candidate.lastBackupMs, Date.now())} · size ${formatByteSize(candidate.sizeBytes)} · enabled ${formatDate(candidate.createdAt)}`;
}

function billingCheckoutRow({ csrf, plan, title, buttonText, primary, action = '/billing/checkout', restoreIntent = false }) {
  // Display copy must match the configured Stripe price IDs; env stores opaque price IDs only.
  const buttonClass = primary ? 'btn primary' : 'btn secondary';
  return `<div class="row" style="cursor:default">
  <div class="body">
    <div class="title">${esc(title)}</div>
  </div>
  <div class="trail"><form method="post" action="${escAttr(action)}">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    <input type="hidden" name="plan" value="${escAttr(plan)}">
    ${restoreIntent ? '<input type="hidden" name="intent" value="restore">' : ''}
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
  if (flash.apply === 'ok') messages.push('scout request received.');
  if (flash.apply === 'acked') messages.push('scout acknowledgement saved.');
  if (flash.apply === 'no_ack') messages.push('confirm you understand before continuing.');
  return messages.map((message) => `<p class="notice">${esc(message)}</p>`).join('');
}

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function escAttr(value) {
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
