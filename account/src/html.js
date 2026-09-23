// Page renderers for the served portal.css design system and same-origin brand assets.

import { PORTAL_CSS_HREF, SUNARC_JS_SRC } from './assets.js';
import { ENROLL_JS } from './inline/passkey-enroll.js';
import { LANDING_JS } from './inline/passkey-landing.js';
import { SME_SERVICE_PATH } from './sme-service.js';

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
// The page shows four record classes; the export carries every class the purge reaches, so
// the signed-in lead points at the download rather than calling the page complete.
const TRANSPARENCY_LEAD_SIGNED_IN = 'this page shows your sign-in: its emails, passkeys and sessions.';
const TRANSPARENCY_LEAD_DOWNLOAD = 'the download below adds the other records held with your sign-in, like your services and support requests, and says what it can\'t include.';
const TRANSPARENCY_LEAD_SIGNED_OUT = 'once you sign in, this page shows your sign-in: its emails, passkeys and sessions.';
const transparencyIntro = (lead) => `<p class="intro">${lead} we never hold a readable copy of your journal. we don't have your name, your phone, your address, or where you are: no analytics, no behavioral data, no third-party tracking. these aren't promises, they're structural commitments under <a href="https://solpbc.org/articles#s8-3">Article 8 of our articles of incorporation</a> (restated 2026-05-01) and <a href="https://solpbc.org/bylaws#art-3">Article III of the bylaws</a>.</p>`;

function brandbar() {
  return `<div class="brandbar">${MARK_SVG}<span class="wordmark">solstone</span></div>`;
}

// During an active deletion, a session only reaches /account/delete* and, while
// the hold is open, the export carve-out (getValidSession). Portal links that
// need an ordinary session would sign the owner out on arrival, so deletion
// pages leave out the footer links to /transparency and /support.
function footer({ deletionActive = false } = {}) {
  const portalLinks = deletionActive ? '' : '<a href="/transparency">data transparency</a><a href="/support">support</a>';
  return `<footer class="footer">${portalLinks}<a href="/terms">terms</a><a href="https://solpbc.org/privacy">how we earn your trust ${EXT_SVG}</a><a href="https://solstone.app">solstone.app →</a></footer>`;
}

// `deletion` is display context from loadDeletionMenuContext: present only while
// the account has an active deletion. The menu then offers only what that
// confined session can still open, and the wordmark is not a link to /, which
// would end the session.
export function topbar({ email = null, lastSignInAt = null, now = null, deletion = null } = {}) {
  const trimmedEmail = typeof email === 'string' ? email.trim() : '';
  const hasEmail = trimmedEmail.length > 0;
  const avatar = hasEmail ? esc(trimmedEmail[0] || '·') : '·';
  const head = hasEmail
    ? `<div class="head"><div class="lbl">signed in as</div><div class="who">${esc(trimmedEmail)}</div><div class="seen">last sign-in ${esc(formatRelativeTime(lastSignInAt, now))}</div></div>`
    : '';
  const home = deletion
    ? `<span class="home">${MARK_SVG}<span class="wordmark">solstone</span></span>`
    : `<a class="home" href="/">${MARK_SVG}<span class="wordmark">solstone</span></a>`;
  const links = deletion
    ? `<a href="/account/delete">deletion request</a>${deletion.exportAvailable ? '\n      <a href="/account/export">download what sol pbc holds</a>' : ''}`
    : `<a href="/">home</a>
      <a href="/sign-in">manage sign-in</a>`;
  // <details> never closes on its own when focus or a tap lands elsewhere. pointerdown,
  // not click: iOS Safari fires no click on a tap over non-interactive content.
  return `<div class="topbar">
  ${home}
  <details class="usermenu">
    <summary aria-label="menu"><span class="avatar">${avatar}</span>${CARET_SVG}</summary>
    <div class="menu" role="menu">
      ${head}
      ${links}
      <div class="sep"></div>
      <form method="post" action="/signout"><button class="mi signout" type="submit">sign out</button></form>
    </div>
  </details>
  <script>(function(){var m=document.currentScript.previousElementSibling;document.addEventListener('pointerdown',function(e){if(m.open&&!m.contains(e.target))m.open=false});document.addEventListener('keydown',function(e){if(e.key==='Escape'&&m.open){m.open=false;m.querySelector('summary').focus()}})})();</script>
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

export function layout({ title, body, afterMain = '', showFooter = true, mainClass = '', deletionActive = false }) {
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
<body>
  <div class="sunarc" id="sunarc" aria-hidden="true">
    <div class="sunarc-glow"></div>
    <div class="sunarc-sun">${MARK_SVG}</div>
  </div>
  <main${mainClass ? ` class="${escAttr(mainClass)}"` : ''}>${body}${showFooter ? footer({ deletionActive }) : ''}</main>
  ${afterMain}
  <script src="${SUNARC_JS_SRC}" defer></script>
</body>
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
<p class="disclosure">no analytics, no tracking, no third parties. this is the only solstone surface that ever knows it's you, and only after you sign in.</p>
<p class="disclosure">by signing in, you agree to the <a href="/terms">terms</a>.</p>`,
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

// === one pattern for every turn-on screen ===
// records/decisions/260921-cpo-service-turn-on-screens-follow-one-pattern-and-the-sign-in-bound-push-consent-retires.md § 1

// Card 1 is one shared constant on every turn-on screen: the request is tied to the
// owner's sign-in, no journal content comes with it, and allowing it is recorded.
const TURN_ON_CARD_1 = `<div class="grant">
    <div class="n">1</div>
    <div>
      <div class="gt">the request is tied to your sign-in</div>
      <div class="gd">sol pbc can approve it because it's tied to your sign-in. no journal content comes with it, only what identifies the request, and your allowing it is recorded.</div>
    </div>
  </div>`;

function turnOnLead(service) {
  return `sol pbc received a request to turn on ${service} for your journal. it stays off until you allow it.`;
}

// One shared footer for every turn-on screen: reversibility, the subscription
// caveat on paid services, the terms link (always /terms, never a redirecting
// alias), and the privacy-policy anchor for what sol pbc keeps.
function turnOnFooter({ paid, policyAnchor }) {
  const subscriptionClause = paid ? " turning it off doesn't cancel a subscription." : '';
  return `<p class="disclosure">you can turn it off from the journal anytime.${subscriptionClause} by turning this on, you agree to the <a href="/terms">terms</a>. what sol pbc keeps is in the <a href="https://solpbc.org/privacy#${policyAnchor}">privacy policy</a>.</p>`;
}

function restorePolicyFooter(policyAnchor) {
  return `<p class="disclosure">what sol pbc keeps is in the <a href="https://solpbc.org/privacy#${policyAnchor}">privacy policy</a>.</p>`;
}

// The three follow-on templates every turn-on flow shares (rule 8); the service
// name is the only variable. Restore's own three follow-on pages are its own
// (rule 7) and stay with renderEnableSpbRestore* below.
function enableDoneTemplate(service) {
  return layout({
    title: `${service} turned on`,
    body: `${brandbar()}
<div class="card">
  <h2 style="display:flex;align-items:center;gap:9px;font-size:1.15rem">${CHECK_SVG} ${service} turned on</h2>
  <p>${service} is on for your journal. you can close this tab.</p>
</div>`,
  });
}

function enableNeedsSubscriptionTemplate({ service, href }) {
  return layout({
    title: 'a subscription is needed',
    body: `${brandbar()}
<div class="card">
  <h2 style="display:flex;align-items:center;gap:9px;font-size:1.15rem">a subscription is needed</h2>
  <p>${service} needs an active subscription before it can turn on. your consent is saved; set one up, then turn ${service} on again in your journal.</p>
  <a class="btn primary" href="${escAttr(href)}">set up ${service}</a>
</div>`,
  });
}

function enableErrorTemplate(service) {
  return layout({
    title: `could not turn on ${service}`,
    body: `${brandbar()}
<div class="card">
  <h1>could not turn on ${service}</h1>
  <p>something didn't look right with that link.</p>
  <p>if you got here from solstone on your device, try again from the journal. otherwise, you can close this tab.</p>
</div>`,
  });
}

export function renderEnableSplConsent({ csrf, nonce, instance = '' }) {
  const instanceInput = instance
    ? `<input type="hidden" name="instance" value="${escAttr(instance)}">`
    : '';
  return layout({
    title: 'turn on private network',
    body: `${brandbar()}
<h1>turn on private network</h1>
<p class="lead">${turnOnLead('private network')}</p>
<div class="card">
  ${TURN_ON_CARD_1}
  <div class="grant">
    <div class="n">2</div>
    <div>
      <div class="gt">what it does for your journal</div>
      <div class="gd">sol pbc runs a relay so your journal stays reachable when it's away from your own network. the relay only passes encrypted bytes through: sol pbc can't read what passes through it. on your own network, reaching your journal is always free and doesn't use the relay.</div>
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
${turnOnFooter({ paid: true, policyAnchor: 'private-network' })}`,
  });
}

export function renderEnableSplDone() {
  return enableDoneTemplate('private network');
}

export function renderEnableSplNeedsSubscription() {
  return enableNeedsSubscriptionTemplate({ service: 'private network', href: '/private-network' });
}

export function renderEnableSplError() {
  return enableErrorTemplate('private network');
}

export function renderEnableSpbConsent({ csrf, nonce, instance = '' }) {
  const instanceInput = instance
    ? `<input type="hidden" name="instance" value="${escAttr(instance)}">`
    : '';
  return layout({
    title: 'turn on encrypted backup',
    body: `${brandbar()}
<h1>turn on encrypted backup</h1>
<p class="lead">${turnOnLead('encrypted backup')}</p>
<div class="card">
  ${TURN_ON_CARD_1}
  <div class="grant">
    <div class="n">2</div>
    <div>
      <div class="gt">what leaves your device</div>
      <div class="gd">sol pbc keeps a copy of your journal, encrypted on your device before it leaves, so only you can read it. sol pbc holds no copy of your recovery key and can't open your encrypted copy without it. if you lose it, no one can restore your backup, not even sol pbc.</div>
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
${turnOnFooter({ paid: true, policyAnchor: 'encrypted-backup' })}`,
  });
}

export function renderEnableSpbDone() {
  return enableDoneTemplate('encrypted backup');
}

export function renderEnableSpbNeedsSubscription() {
  return enableNeedsSubscriptionTemplate({ service: 'encrypted backup', href: '/services/backup' });
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
</div>
${restorePolicyFooter('encrypted-backup')}`,
  });
}

export function renderEnableSpbRestoreNoHostedBackup() {
  return layout({
    title: "sol pbc isn't holding an encrypted copy under your sign-in",
    body: `${brandbar()}
<div class="card">
  <h2>sol pbc isn't holding an encrypted copy under your sign-in</h2>
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
  return enableErrorTemplate('encrypted backup');
}

export function renderEnableSppConsent({ csrf, nonce, instance = '' }) {
  const instanceInput = instance
    ? `<input type="hidden" name="instance" value="${escAttr(instance)}">`
    : '';
  return layout({
    title: 'turn on confidential processing',
    body: `${brandbar()}
<h1>turn on confidential processing</h1>
<p class="lead">${turnOnLead('confidential processing')}</p>
<div class="card">
  ${TURN_ON_CARD_1}
  <div class="grant">
    <div class="n">2</div>
    <div>
      <div class="gt">what leaves your device</div>
      <div class="gd">when confidential processing is on, <a href="/confidential-processing/data">the text and images that go to a model for processing</a> leave your device. when the audio switch is on (its default), your audio recordings for transcription go too. turn it off any time in the journal's thinking app, in the confidential lane, and speech becomes text on your device instead. your journal itself never leaves; it stays on your computer. voiceprints and speaker profiles are never created on the service. it's processed on a model sol pbc runs itself, with no third-party AI provider in the path: no content is retained, no human reviews it, nothing is used to train.</div>
    </div>
  </div>
  <div class="grant">
    <div class="n">3</div>
    <div>
      <div class="gt">your journal must verify before it sends</div>
      <div class="gd">before anything is sent, your journal checks the service on the other end, and only sends if that check passes. if it can't verify, nothing is sent, including recordings waiting to transcribe, and the solstone app tells you why.</div>
    </div>
  </div>
  <form method="post" action="/enable/spp/confirm">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    <input type="hidden" name="nonce" value="${escAttr(nonce)}">
    ${instanceInput}
    ${ackField('i understand what this sends, and that my journal verifies the service before it sends.')}
    <div class="btn-row" style="margin-top:20px">
      <button class="btn primary" name="action" value="allow" type="submit">allow</button>
      <button class="btn secondary" name="action" value="cancel" type="submit" formnovalidate>cancel</button>
    </div>
  </form>
</div>
${turnOnFooter({ paid: false, policyAnchor: 'confidential-processing' })}`,
  });
}

export function renderEnableSppApprovalRequired() {
  return layout({
    title: 'scout approval required',
    body: `${brandbar()}
<div class="card">
  <h2 style="display:flex;align-items:center;gap:9px;font-size:1.15rem">scout approval required</h2>
  <p>confidential processing sends your thinking off your device, never your journal, which stays on your computer. it runs on a model sol pbc runs itself, which keeps nothing: no content is retained, no human reviews it, nothing is used to train. your journal must verify the service before anything is sent. if it can't verify, nothing is sent. no third-party AI provider is in the path.</p>
  <p>confidential processing is available to approved scouts. your sign-in is not currently approved, so there is nothing to turn on here.</p>
  <a class="btn primary" href="/scout">request scout access</a>
</div>`,
  });
}

export function renderEnableSppDone() {
  return enableDoneTemplate('confidential processing');
}

export function renderEnableSppError() {
  return enableErrorTemplate('confidential processing');
}

// The disclosure that must reach an owner before any subscription is taken, and again where
// they turn the service on. One string, used by three surfaces (this consent card,
// renderServicesSme and renderSmeLanding), so they cannot drift apart. Calmed 2026-09-21
// per the founder's direction (clo/workspace/founder-review-screencast-260920.md): the
// certificate-log mechanics are not owner education. The floor is the privacy policy's
// own sentence: the address's existence stays public for good, which stays below.
export const SME_PERMANENCE_PARTS = [
  "the address is public once it's issued, and stays public for good, even after you turn this off, cancel, or delete your sign-in. it's an identifier, not your data: eight random characters with nothing of yours in it.",
];

export function renderEnableSmeConsent({ csrf, nonce, instance }) {
  return layout({
    title: 'turn on solstone.me',
    body: `${brandbar()}
<h1>turn on solstone.me</h1>
<p class="lead">${turnOnLead('solstone.me')}</p>
<div class="card">
  ${TURN_ON_CARD_1}
  <div class="grant">
    <div class="n">2</div>
    <div>
      <div class="gt">what an agent gets</div>
      <div class="gd">an agent you connect can search and read your journal, within what you let it see: your whole journal, or only the facets you choose. it reads. it can't add, change or delete anything.</div>
    </div>
  </div>
  <div class="grant">
    <div class="n">3</div>
    <div>
      <div class="gt">the relay can't read what passes through it</div>
      <div class="gd">your journal gets an address on the internet. an agent's requests travel encrypted to your journal and are opened only there. sol pbc runs the relay in between and can't read what passes through it. what sol pbc can see is in the <a href="https://solpbc.org/privacy#solstone-me">privacy policy</a>.</div>
    </div>
  </div>
  <div class="grant">
    <div class="n">4</div>
    <div>
      <div class="gt">the public record is permanent</div>
      ${SME_PERMANENCE_PARTS.map((part, i) => `<div class="gd"${i ? ' style="margin-top:8px"' : ''}>${esc(part)}</div>`).join('')}
      <div class="gd" style="margin-top:8px">turning this off keeps the address. turning it back on uses the same one.</div>
    </div>
  </div>
  <form method="post" action="/enable/solstone-me/confirm">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    <input type="hidden" name="nonce" value="${escAttr(nonce)}">
    <input type="hidden" name="instance" value="${escAttr(instance)}">
    ${ackField('i understand that the public record of this address is permanent.')}
    <div class="btn-row" style="margin-top:20px">
      <button class="btn primary" name="action" value="allow" type="submit">allow</button>
      <button class="btn secondary" name="action" value="cancel" type="submit" formnovalidate>cancel</button>
    </div>
  </form>
</div>
${turnOnFooter({ paid: true, policyAnchor: 'solstone-me' })}`,
  });
}

export function renderEnableSmeNeedsSubscription() {
  return enableNeedsSubscriptionTemplate({ service: 'solstone.me', href: SME_SERVICE_PATH });
}

export function renderEnableSmeDone() {
  return enableDoneTemplate('solstone.me');
}

export function renderEnableSmeError() {
  return enableErrorTemplate('solstone.me');
}

// === services surfaces ===

export function renderServicesCatalog({ signedIn, welcome = false, menu = {}, networkActive = false, backupActive = false, sppActive = false, smeOnSale = false, smeActive = false } = {}) {
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
  ${smeOnSale ? row('/solstone-me', IC_GLOBE, 'solstone.me', 'an address for your journal, so an agent you already use can read from it.', '<span class="price">$5<span class="per">/yr</span></span>') : ''}
  ${row('/notifications', IC_PUSH_SVG, 'notifications', "notifications reach you when there's something worth a look.", '<span class="tag builtin">built in</span>')}
  ${row('/confidential-processing', IC_CHIP, 'confidential processing', 'available to approved scouts. confidential processing extends your compute on confidential hardware sol pbc runs that keeps nothing.', '<span class="tag free">scouts</span>')}
  ${row('/scout', IC_SCOUT_SVG, 'scout', 'the tester program. approved scouts can enable confidential processing.', '<span class="tag free">program</span>')}
</div>
  <p class="disclosure">no analytics, no tracking, no third parties. sign in only to manage what you've turned on. solstone itself never asks you to sign in.</p>`,
    });
  }

  const notice = menu.decryptOk === false
    ? `<p class="notice">we couldn't decrypt your email address. you're still signed in.</p>`
    : '';
  const networkPill = pill(networkActive ? 'on' : 'off', networkActive ? 'on' : 'off');
  const backupPill = pill(backupActive ? 'on' : 'off', backupActive ? 'on' : 'off');
  const notifPill = pill('on', 'on');
  const sppPill = pill(sppActive ? 'on' : 'off', sppActive ? 'available' : 'not available');
  const smePill = pill(smeActive ? 'on' : 'off', smeActive ? 'covered' : 'not covered');
  const welcomePanel = welcome
    ? `<div class="card" style="margin-bottom:24px">
  <h2>set up a passkey for next time</h2>
  <p>use your device to sign in without typing a code.</p>
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
  ${smeOnSale ? row(SME_SERVICE_PATH, IC_GLOBE, 'solstone.me', 'an address for your journal, so an agent you already use can read from it.', smePill) : ''}
  ${row('/notifications', IC_PUSH_SVG, 'notifications', 'notifications are built into the app. turn them on or off per device inside the app, not here.', notifPill)}
  ${row('/confidential-processing', IC_CHIP, 'confidential processing', 'confidential processing, off your device on confidential hardware.', sppPill)}
  ${row('/scout', IC_SCOUT_SVG, 'scout', 'the tester program. approved scouts can enable confidential processing.', '<span class="tag free">program</span>')}
</div>
<div class="group" style="margin-top:22px">
  ${row('/sign-in', IC_SESSION_SVG, 'your sign-in', 'sessions, passkeys, and email addresses.', '')}
  ${row('/transparency', IC_EMPTY_DATA_SVG, 'data transparency', menu.exportEnabled ? 'what sol pbc holds for your sign-in, with a download.' : 'what sol pbc holds for your sign-in.', '')}
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
  ${beat(IC_GLOBE, 'your private network, from anywhere', "sol pbc runs a blind relay so your devices stay reachable when you're away from home or asleep, your private network spanning wherever your devices are. operated by sol pbc.")}
  ${beat(IC_VAULT, 'blind by construction', "the relay passes along encrypted bytes it can't read. sol pbc operates it but <strong>cannot see your traffic</strong>. there's no key to reveal, by design, not by promise.")}
</div>
<div class="card">
  <div class="pricecard">
    <div><div class="big">$20 <span class="price"><span class="per">/ year</span></span></div><div class="alt">or $2.49 / month · per journal, not per device</div></div>
    <a class="btn primary" href="/?signin">sign in to enable</a>
  </div>
  <p class="free-note" style="margin:14px 0 0">you never have to pay us. on your own network (same wifi, or your own vpn), reaching your journal is always free. this only covers the relay sol pbc runs for you.</p>
</div>
<p class="disclosure">open source, self-hostable. run your own relay if you'd rather. <a href="/terms">terms</a></p>`,
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
<p class="disclosure">open source, self-hostable. <a href="/terms">terms</a></p>`,
  });
}

export function renderNotificationsLanding() {
  return layout({
    title: 'notifications',
    body: brandbarSignin()
      + `\n<a class="back" href="/">${BACK_SVG} services</a>
<h1>notifications</h1>
<p class="hero-tag">built in</p>
<p class="lead">notifications reach you on your devices when there's something worth a look: a short heads-up, never the full thing.</p>
${BRANDLOCK}
<div class="card">
  ${beat(IC_PUSH_SVG, 'built into solstone', 'notifications come with solstone, free, with no hosted service to enable. you turn them on for each device, and choose what reaches you.')}
  ${beat(IC_GLOBE, 'on your devices', 'you get a short heads-up on your phone or laptop, never the content itself.')}
  ${beat(IC_VAULT, 'not a tracking surface', 'no analytics, no behavioral profiling, no third parties. notifications never become a way to watch you: Article 8.')}
</div>
<div class="card">
  <div class="statusline"><span class="tag builtin">built in</span> <span>turn on notifications on each device you want to hear from.</span></div>
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
<p class="hero-tag">extend your compute off your device</p>
<p class="lead">confidential processing sends <a href="/confidential-processing/data">your thinking off your device</a>, never your journal, which stays on your computer. it runs on confidential hardware sol pbc operates, using a model sol pbc runs itself with no third-party AI provider in the path.</p>
${BRANDLOCK}
<div class="card">
  ${beat(IC_CHIP, 'the thinking, off your device', 'confidential processing extends your compute on confidential hardware sol pbc runs that keeps nothing.')}
  ${beat(IC_VAULT, "sol pbc's own model", "a model sol pbc runs itself, with no third-party AI provider in the path. it runs on confidential GPUs in Microsoft Azure that sol pbc operates, where the hardware boundary keeps the cloud host excluded from what's processed.")}
  ${beat(IC_EMPTY_DATA_SVG, 'kept for nothing', 'no content is retained · no human reviews it · nothing is used to train')}
  ${beat(IC_GLOBE, 'your journal does the checking', "your journal must verify the service before anything is sent. if it can't verify, it doesn't send.")}
</div>
<div class="card">
  <div class="statusline"><span class="tag free">available to approved scouts</span><span>confidential processing is available to approved scouts. enable it from the journal after approval.</span></div>
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
<p>the covenants: <a href="/terms">terms</a> · <a href="https://solpbc.org/privacy">privacy</a></p>`,
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
<p class="disclosure"><a href="/terms">terms</a></p>`,
  });
}

export function renderSmeLanding() {
  return layout({
    title: 'solstone.me',
    body: brandbarSignin()
      + `\n<a class="back" href="/">${BACK_SVG} services</a>
<h1>solstone.me</h1>
<p class="lead">an address on the internet for your journal, so an agent you already use can read from it: Claude, Codex, goose, or anything else that speaks the Model Context Protocol. you turn it on, you connect an agent, and you choose what that agent may see.</p>
${BRANDLOCK}
<div class="card">
  ${beat(IC_GLOBE, 'an address for your journal', "sol pbc runs the solstone.me relay in between, so your agent can find your journal without you running anything of your own. it's off until you turn it on, and you can turn it off from the journal at any time.")}
  ${beat(IC_VAULT, 'blind by construction', "your own machine holds the private key and ends the encryption, so the relay can't read a byte of what passes through it. it keeps no record of what happened, only that something did.")}
  ${beat(IC_NET, 'what an agent gets', "you choose what it may see: your whole journal, or only the facets you choose. it reads. it can't add, change or delete anything.")}
</div>
<div class="card">
  <h2>the public record is permanent</h2>
  ${SME_PERMANENCE_PARTS.map((part) => `<p>${esc(part)}</p>`).join('\n  ')}
</div>
<div class="card">
  <div class="pricecard">
    <div><div class="big">$5 <span class="price"><span class="per">/ year</span></span></div><div class="alt">annual only · per journal, not per device</div></div>
    <a class="btn primary" href="/?signin">sign in to enable</a>
  </div>
  <p class="free-note" style="margin:14px 0 0">you never have to pay us. your journal doesn't need sol pbc to be reachable. a tunnel that only passes the bytes through works today with nothing of ours in the path, whether you rent one or run your own on a machine you control. one warning: some free tunnels decrypt your traffic in order to move it. whoever runs one of those can read what your agent reads, and can reuse your agent's key to reach your journal as though they were it. a tunnel that only passes the bytes through will say so; if its documentation doesn't say, assume it ends the encryption. the solstone.me relay is convenience, never a privacy upgrade over a tunnel that only passes the bytes through.</p>
</div>
<p class="disclosure"><a href="/terms">terms</a></p>`,
  });
}

export function renderServicesSpl({ entitlement, csrf, flash = {}, menu }) {
  const flashes = billingFlashMessages(flash);
  const status = entitlement?.status || '';
  const paidThrough = formatUnixSecondsDate(entitlement?.current_period_end);
  const cancelPending = Boolean(entitlement?.cancel_at_period_end);
  const detailParts = [];
  if (entitlement?.enabled_at != null) detailParts.push(`enabled ${formatDate(entitlement.enabled_at)}`);
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
${cancelPending ? `<p class="notice">scheduled to turn off on ${esc(paidThrough)}. manage billing to keep it on.</p>` : ''}
<div class="btn-row" style="margin-top:16px">
  ${billingPortalForm({ csrf })}
  ${cancelPending ? '' : billingPortalForm({ csrf, buttonText: 'turn off', buttonClass: 'btn danger', action: '/billing/cancel' })}
</div>
<p class="disclosure" style="margin-top:24px">${paidThrough ? `paid through ${esc(paidThrough)} · ` : ''}billed through Stripe. on your own network (same wifi, or your own vpn), reaching your journal is always free. <a href="/private-network?learn">how it works</a> · <a href="/terms">terms</a></p>`,
    });
  }

  if (status === 'past_due') {
    return page({
      statusLine: onStatusLine,
      content: `${controlGroup}
<p class="notice">your last payment didn't go through. manage billing to keep your private network reachable while you're away. your own network stays free either way.</p>
${cancelPending ? `<p class="notice">scheduled to turn off on ${esc(paidThrough)}. manage billing to keep it on.</p>` : ''}
<div class="btn-row" style="margin-top:16px">
  ${billingPortalForm({ csrf })}
  ${cancelPending ? '' : billingPortalForm({ csrf, buttonText: 'turn off', buttonClass: 'btn danger', action: '/billing/cancel' })}
</div>
<p class="disclosure" style="margin-top:24px">billed through Stripe. on your own network (same wifi, or your own vpn), reaching your journal is always free. <a href="/private-network?learn">how it works</a> · <a href="/terms">terms</a></p>`,
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
  <p class="disclosure">billed securely through Stripe. <a href="/terms">terms</a></p>
</div>`,
  });
}

export function renderServicesSpb({ entitlement, csrf, flash = {}, menu, restoreIntent = false, restoreCheckout = false }) {
  const flashes = spbBillingFlashMessages(flash);
  const status = entitlement?.status || '';
  const paidThrough = formatUnixSecondsDate(entitlement?.current_period_end);
  const cancelPending = Boolean(entitlement?.cancel_at_period_end);
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
  ${cancelPending ? '' : billingPortalForm({ csrf, buttonText: 'turn off', buttonClass: 'btn danger', action: '/services/backup/cancel' })}
</div>`;
  const cancellationNotice = cancelPending
    ? `<p class="notice">scheduled to turn off on ${esc(paidThrough)}. manage billing to keep it on.</p>`
    : '';
  const retentionDisclosure = '<p class="disclosure" style="margin-top:24px">if you turn encrypted backup off, sol pbc keeps your encrypted copy for 30 days. turn it back on within that window and it\'s still there. after 30 days it\'s deleted. your journal stays on your device either way. <a href="/backup">how it works</a> · <a href="/terms">terms</a></p>';
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
<p class="disclosure" style="margin-top:24px">free while you're an approved scout. <a href="/backup">how it works</a> · <a href="/terms">terms</a></p>`,
    });
  }

  if (status === 'active') {
    return page({
      statusLine: onStatusLine,
      content: `${controlGroup}
${cancellationNotice}
${portalActions}
${retentionDisclosure}
<p class="disclosure" style="margin-top:24px">${paidThrough ? `paid through ${esc(paidThrough)} · ` : ''}billed through Stripe. <a href="/backup">how it works</a> · <a href="/terms">terms</a></p>`,
    });
  }

  if (status === 'past_due') {
    return page({
      statusLine: onStatusLine,
      content: `${controlGroup}
<p class="notice">your last payment didn't go through. manage billing to keep encrypted backup running. your encrypted copy is safe while you sort this out.</p>
${cancellationNotice}
${portalActions}
${retentionDisclosure}
<p class="disclosure" style="margin-top:24px">billed through Stripe. <a href="/backup">how it works</a> · <a href="/terms">terms</a></p>`,
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
  <p class="disclosure">billed securely through Stripe. by paying, you agree to the <a href="/terms">terms</a>.</p>
</div>
${restoreCheckout ? '' : retentionDisclosure}`,
  });
}

export function renderServicesSme({ entitlement, csrf, flash = {}, menu }) {
  const flashes = smeBillingFlashMessages(flash);
  const status = entitlement?.status || '';
  const paidThrough = formatUnixSecondsDate(entitlement?.current_period_end);
  const cancelPending = Boolean(entitlement?.cancel_at_period_end);
  const detailParts = [];
  if (entitlement?.enabled_at != null) detailParts.push(`covered since ${formatDate(entitlement.enabled_at)}`);
  detailParts.push('operated by sol pbc', 'turn it on from your journal');
  const coveredPill = '<span class="pill on" style="vertical-align:middle"><span class="dot"></span>covered</span>';
  const controlGroup = `<div class="group">
  <div class="row" style="cursor:default">${IC_GLOBE}<div class="body"><div class="title">solstone.me</div><div class="desc">${esc(detailParts.join(' · '))}</div></div></div>
</div>`;
  const portalActions = `<div class="btn-row" style="margin-top:16px">
  ${billingPortalForm({ csrf, action: `${SME_SERVICE_PATH}/portal` })}
  ${cancelPending ? '' : billingPortalForm({ csrf, buttonText: 'cancel solstone.me', buttonClass: 'btn danger', action: `${SME_SERVICE_PATH}/cancel` })}
</div>`;
  const cancellationNotice = cancelPending
    ? `<p class="notice">your solstone.me coverage is scheduled to end on ${esc(paidThrough)}. manage billing to keep it.</p>`
    : '';
  const page = ({ statusLine = '', content }) => layout({
    title: 'solstone.me',
    body: `${topbar(menu)}
<a class="back" href="/">${BACK_SVG} your services</a>
${flashes}
<div class="pagehead">
  <h1>solstone.me</h1>
  <p class="meta">operated by sol pbc</p>
  ${statusLine ? `<p class="signed-in">${statusLine}</p>` : ''}
</div>
${content}`,
  });

  if (entitlement?.source === 'comp' && status === 'active') {
    return page({
      statusLine: coveredPill,
      content: `${controlGroup}
<p class="disclosure" style="margin-top:24px">free while you're an approved scout.</p>`,
    });
  }

  if (status === 'active') {
    return page({
      statusLine: `${coveredPill} &nbsp;your payment is up to date`,
      content: `${controlGroup}
${cancellationNotice}
${portalActions}
<p class="disclosure" style="margin-top:24px">${Number.isFinite(entitlement.current_period_end) ? `paid through ${esc(paidThrough)} · ` : ''}billed through Stripe.</p>`,
    });
  }

  if (status === 'past_due') {
    return page({
      statusLine: 'your last payment needs attention',
      content: `${controlGroup}
<p class="notice">your last payment didn't go through. manage billing to fix it.</p>
${cancellationNotice}
${portalActions}
<p class="disclosure" style="margin-top:24px">billed through Stripe.</p>`,
    });
  }

  return page({
    content: `<p class="lead">an address on the internet for your journal, so an agent you already use can read from it. sol pbc runs the solstone.me relay in between, so your agent can find your journal without you running anything of your own. it's off until you turn it on, and you can turn it off from the journal at any time.</p>
<div class="card">
  <h2>the public record is permanent</h2>
  ${SME_PERMANENCE_PARTS.map((part) => `<p>${esc(part)}</p>`).join('\n  ')}
</div>
<div class="card">
  <form method="post" action="${escAttr(`${SME_SERVICE_PATH}/checkout`)}">
    <input type="hidden" name="csrf" value="${escAttr(csrf)}">
    <input type="hidden" name="plan" value="annual">
    <p><strong>$5 / year</strong></p>
    ${ackField('i understand that the public record of this address is permanent.')}
    <div class="btn-row" style="margin-top:16px">
      <button class="btn primary" type="submit">pay yearly</button>
    </div>
  </form>
  <p class="disclosure">billed securely through Stripe. complimentary for approved scouts. by paying, you agree to the <a href="/terms">terms</a>.</p>
</div>
<p class="disclosure" style="margin-top:24px"><strong>you never have to pay us.</strong> your journal doesn't need sol pbc to be reachable. a tunnel that only passes the bytes through works today with nothing of ours in the path, whether you rent one or run your own on a machine you control. one warning: some free tunnels decrypt your traffic in order to move it. whoever runs one of those can read what your agent reads, and can reuse your agent's key to reach your journal as though they were it. a tunnel that only passes the bytes through will say so; if its documentation doesn't say, assume it ends the encryption. the solstone.me relay is convenience, never a privacy upgrade over a tunnel that only passes the bytes through.</p>`,
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
<p class="disclosure" style="margin-top:24px">your journal must verify the service before anything is sent. if it can't verify, it doesn't send. <a href="/terms">terms</a></p>
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
<p class="disclosure" style="margin-top:24px"><a href="/scout">request scout access</a> · <a href="/terms">terms</a></p>`,
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

// The one signed-in entry point to /account/export outside a deletion hold.
const TRANSPARENCY_EXPORT_CARD = `<div class="card">
  <h2>download what sol pbc holds</h2>
  <p>it's one file of what's held for your sign-in. we'll email you a code to confirm it's you, and have you confirm with your passkey too, if you have one.</p>
  <a class="btn primary block" href="/account/export">download what sol pbc holds</a>
</div>`;

export function renderTransparency({
  signedIn = true,
  accountId,
  accountCreatedAt,
  lastSigninAt,
  emails,
  passkeys,
  sessions,
  menu,
  exportEnabled = false,
}) {
  if (!signedIn) {
    return layout({
      title: 'data transparency',
      body: `${brandbar()}
<h1>data transparency</h1>
${transparencyIntro(TRANSPARENCY_LEAD_SIGNED_OUT)}
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
${transparencyIntro(exportEnabled ? `${TRANSPARENCY_LEAD_SIGNED_IN} ${TRANSPARENCY_LEAD_DOWNLOAD}` : TRANSPARENCY_LEAD_SIGNED_IN)}
${exportEnabled ? TRANSPARENCY_EXPORT_CARD : ''}
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
    mainClass: 'deletion-surface',
    deletionActive: Boolean(menu?.deletion),
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
  intro: 'this begins deletion of your portal sign-in and services after you confirm ownership.',
})}
<p>this does not delete a journal, device, or bucket you control. those remain under their own owner-controlled arrangements.</p>
<p class="notice">if you have paid subscriptions, deleting your sign-in ends every one of them when the 72-hour safety period below ends, with no refund of the unused period. to use what you paid for, cancel from the billing portal instead.</p>
<p class="notice">if encrypted backup is on, deleting your sign-in deletes the operated backup at once, with no 30-day lapse window. if you've turned on media offload, that backup is the only copy of that media, and it goes too.</p>
<p class="disclosure">after you confirm, you have 72 hours to cancel before deletion begins. see <a href="https://solpbc.org/privacy#your-rights">what this deletes and what outlasts it</a>.</p>`,
  });
}

export function renderDeletionProofPage({ menu, purpose, error = '', status = '' }) {
  const action = purpose === 'cancel' ? '/account/delete/cancel' : '/account/delete/confirm';
  const actionLabel = purpose === 'cancel' ? 'cancel deletion' : 'confirm deletion request';
  return layout({
    title: purpose === 'cancel' ? 'prove ownership to cancel deletion' : 'prove ownership to delete',
    mainClass: 'deletion-surface',
    deletionActive: Boolean(menu?.deletion),
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
  intro: 'enter the fresh code sent to your verified email address.',
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
  intro: 'if you have an active passkey, you must also verify it before continuing.',
  extra: `<button class="btn secondary" type="button" data-deletion-passkey data-purpose="${escAttr(purpose)}">verify with passkey</button>`,
})}
${deletionPasskeyScript()}`,
  });
}

export function renderExportPage({ menu, error = '', status = '' }) {
  const back = menu?.deletion
    ? `<a class="back" href="/account/delete">${BACK_SVG} deletion request</a>`
    : `<a class="back" href="/transparency">${BACK_SVG} data transparency</a>`;
  return layout({
    title: 'download what sol pbc holds',
    deletionActive: Boolean(menu?.deletion),
    body: `${topbar(menu)}
${back}
${renderDeletionForm({
  heading: 'download what sol pbc holds',
  action: '/account/export/proof/otp',
  submitLabel: 'send a confirmation code',
  error,
  status,
  statusId: 'export-request-status',
  intro: "confirm it's you first. if a service section can't be reached, the file will mark that section incomplete.",
})}`,
  });
}

export function renderExportProofPage({ menu, error = '', status = '' }) {
  return layout({
    title: 'confirm your download',
    deletionActive: Boolean(menu?.deletion),
    body: `${topbar(menu)}
<a class="back" href="/account/export">${BACK_SVG} download what sol pbc holds</a>
${renderDeletionForm({
  heading: 'confirm your download',
  action: '/account/export/proof/otp/verify',
  submitLabel: 'verify code',
  error,
  status,
  statusId: 'export-otp-status',
  intro: 'enter the code sent to your verified email address.',
  fields: [{
    id: 'export-otp-code', name: 'code', label: '6-digit code',
    hint: 'the code expires in 10 minutes.', type: 'text', inputmode: 'numeric',
    autocomplete: 'one-time-code', pattern: '[0-9]*',
  }],
})}
${renderDeletionForm({
  heading: 'passkey verification',
  action: '/account/export',
  submitLabel: 'download the file',
  status: '',
  statusId: 'export-passkey-status',
  intro: 'if you have an active passkey, you must also verify it before continuing.',
  extra: '<button class="btn secondary" type="button" data-export-passkey>verify with passkey</button>',
})}
${exportPasskeyScript()}`,
  });
}

export const DELETION_EXPORT_PROMPT_LINK = 'download what sol pbc holds before this completes';

export function renderDeletionCancelPage({ menu, phase, exportEnabled = false }) {
  if (phase === 'purging') {
    return layout({
      title: 'deletion in progress',
      mainClass: 'deletion-surface',
      deletionActive: Boolean(menu?.deletion),
      body: `${topbar(menu)}<h1>deletion in progress</h1><p>the deletion safety period has ended and this request can no longer be cancelled.</p>`,
    });
  }
  const exportLink = exportEnabled
    ? `<p><a href="/account/export">${esc(DELETION_EXPORT_PROMPT_LINK)}</a></p>`
    : '';
  return layout({
    title: 'cancel deletion request',
    mainClass: 'deletion-surface',
    deletionActive: Boolean(menu?.deletion),
    body: `${topbar(menu)}
${renderDeletionForm({
  heading: 'cancel deletion request',
  action: '/account/delete/proof/otp',
  submitLabel: 'send a cancellation code',
  hidden: { purpose: 'cancel' },
  intro: 'a fresh ownership proof is required before cancellation.',
  statusId: 'deletion-cancel-status',
})}${exportLink}`,
  });
}

export const DELETION_STATUS_SIGN_IN_LINE = 'you can still cancel before the safety period ends. sign in again, then confirm with a fresh code, and your passkey if you set one up.';
export const DELETION_STATUS_SIGN_IN_LINK = 'sign in to cancel';

// canSignInToCancel: the hold is still cancellable but this viewer holds only the
// receipt (or a session that cannot cancel). A fresh sign-in during the hold lands
// on /account/delete, where cancelling asks for its own fresh proof.
export function renderDeletionStatus({ state = 'deletion status unavailable', canCancel = false, canSignInToCancel = false } = {}) {
  const action = canCancel
    ? '<p><a class="btn danger" href="/account/delete">cancel deletion request</a></p>'
    : canSignInToCancel
      ? `<p>${esc(DELETION_STATUS_SIGN_IN_LINE)}</p><p><a class="btn primary" href="/?signin">${esc(DELETION_STATUS_SIGN_IN_LINK)}</a></p>`
      : '';
  return layout({
    title: 'deletion status',
    body: `<div class="card">${brandbar()}<h1>deletion status</h1><p aria-live="polite">${esc(state)}</p>${action}</div>`,
    showFooter: false,
  });
}

export function renderDeletionUnavailablePage({ menu } = {}) {
  return layout({
    title: "deletion request can't be confirmed",
    mainClass: 'deletion-surface',
    deletionActive: Boolean(menu?.deletion),
    body: `${topbar(menu)}
<div class="card">
  <h1>deletion request can't be confirmed</h1>
  <p class="lead">please try again later.</p>
  <p><a class="btn primary" href="/account/delete">return to deletion request</a></p>
</div>`,
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
    status.textContent = 'passkey verified';
  } catch (_) { window.location.reload(); }
}));
</script>`;
}

function exportPasskeyScript() {
  return `<script>
document.querySelectorAll('[data-export-passkey]').forEach((button) => button.addEventListener('click', async () => {
  const status = document.getElementById('export-passkey-status');
  try {
    const start = await fetch('/account/export/proof/passkey/start', {method:'POST',headers:{'Content-Type':'application/json','Origin':location.origin},body:'{}'});
    const startBody = await start.json();
    if (!start.ok) throw new Error('start');
    const options = startBody.options;
    options.challenge = Uint8Array.from(atob(options.challenge.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
    options.allowCredentials = (options.allowCredentials || []).map((item) => ({...item,id:Uint8Array.from(atob(item.id.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0))}));
    const credential = await navigator.credentials.get({publicKey:options});
    const b64 = (value) => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
    const response = {id:credential.id,rawId:b64(credential.rawId),type:credential.type,response:{clientDataJSON:b64(credential.response.clientDataJSON),authenticatorData:b64(credential.response.authenticatorData),signature:b64(credential.response.signature),userHandle:credential.response.userHandle ? b64(credential.response.userHandle) : null},clientExtensionResults:credential.getClientExtensionResults()};
    const finish = await fetch('/account/export/proof/passkey/finish', {method:'POST',headers:{'Content-Type':'application/json','Origin':location.origin},body:JSON.stringify({response})});
    if (!finish.ok) throw new Error('finish');
    status.textContent = 'passkey proof verified';
  } catch (_) { window.location.reload(); }
}));
</script>`;
}

// The step-up page a gated passkey/email route redirects to when the signed-in
// session has no fresh 'credential-change' proof. next is one of a small fixed
// set of settings pages (validated server-side) so the OTP form and the
// passkey script both know where to send the owner back once fresh.
export function renderCredentialChangeProofPage({ menu, next = '/sign-in', error = '', status = '' }) {
  return layout({
    title: "confirm it's you",
    body: `${topbar(menu)}
<a class="back" href="${escAttr(next)}">${BACK_SVG} back</a>
${renderDeletionForm({
  heading: "confirm it's you",
  action: '/account/credential-change/proof/otp/verify',
  submitLabel: 'verify code',
  hidden: { next },
  error,
  status,
  statusId: 'credential-change-otp-status',
  intro: 'this change needs a fresh code. enter the code sent to your verified email address.',
  fields: [{
    id: 'credential-change-otp-code', name: 'code', label: '6-digit code',
    hint: 'the code expires in 10 minutes.', type: 'text', inputmode: 'numeric',
    autocomplete: 'one-time-code', pattern: '[0-9]*',
  }],
})}
${renderDeletionForm({
  heading: 'passkey verification',
  action: next,
  method: 'get',
  submitLabel: 'continue',
  status: '',
  statusId: 'credential-change-passkey-status',
  intro: 'if you have an active passkey, you must also verify it before continuing.',
  extra: `<button class="btn secondary" type="button" data-credential-change-passkey data-next="${escAttr(next)}">verify with passkey</button>`,
})}
${credentialChangePasskeyScript()}`,
  });
}

function credentialChangePasskeyScript() {
  return `<script>
document.querySelectorAll('[data-credential-change-passkey]').forEach((button) => button.addEventListener('click', async () => {
  const status = document.getElementById('credential-change-passkey-status');
  const next = button.dataset.next;
  try {
    const start = await fetch('/account/credential-change/proof/passkey/start', {method:'POST',headers:{'Content-Type':'application/json','Origin':location.origin},body:'{}'});
    const startBody = await start.json();
    if (!start.ok) throw new Error('start');
    const options = startBody.options;
    options.challenge = Uint8Array.from(atob(options.challenge.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
    options.allowCredentials = (options.allowCredentials || []).map((item) => ({...item,id:Uint8Array.from(atob(item.id.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0))}));
    const credential = await navigator.credentials.get({publicKey:options});
    const b64 = (value) => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
    const response = {id:credential.id,rawId:b64(credential.rawId),type:credential.type,response:{clientDataJSON:b64(credential.response.clientDataJSON),authenticatorData:b64(credential.response.authenticatorData),signature:b64(credential.response.signature),userHandle:credential.response.userHandle ? b64(credential.response.userHandle) : null},clientExtensionResults:credential.getClientExtensionResults()};
    const finish = await fetch('/account/credential-change/proof/passkey/finish', {method:'POST',headers:{'Content-Type':'application/json','Origin':location.origin},body:JSON.stringify({response})});
    const finishBody = await finish.json();
    if (!finish.ok) throw new Error('finish');
    if (finishBody.ready) { window.location.href = next; return; }
    status.textContent = 'passkey verified. check your email for a code too.';
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
    <div class="title">${esc(row.deviceLabel)}${isCurrent ? ' <span class="pill on" style="margin-left:4px"><span class="dot"></span>current device</span>' : ''}</div>
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

// GENERATED by clo/tools/render-tos.py from clo/compliance/solstone-services-terms-of-service.md
// (the region between the CANONICAL PUBLISHED TEXT delimiters). Regenerate and diff on any SOT
// change; never hand-edit the body between `${brandbar()}` and the closing template literal.
export function renderServicesTerms() {
  const title = 'solstone services · terms';
  return layout({
    title,
    body: `${brandbar()}
<h1>${esc(title)}</h1>
<p class="meta"><em>${esc(`effective September 20, 2026 · sol pbc, a Colorado public benefit corporation`)}</em></p>
<p>${esc(`these terms cover `)}<strong>${esc(`services.solstone.app`)}</strong>${esc(`, the place you sign in, and the `)}<strong>${esc(`solstone services`)}</strong>${esc(` sol pbc runs for you there: private network, encrypted backup, confidential processing, solstone.me, and the part of notifications sol pbc will run once it opens. they're between you and sol pbc. the short version comes first; the details follow.`)}</p>
<h2>${esc(`the short version`)}</h2>
<ul>
  <li><strong>${esc(`nothing here is required.`)}</strong>${esc(` solstone runs on devices you own, and your journal lives on one of them. three services take money today: private network, encrypted backup, and solstone.me. each has a way to do the same thing with sol pbc out of the path. confidential processing is available to approved scouts, and the part of notifications that reaches your phone isn't on yet. these terms cover your sign-in, the portal, and the parts sol pbc runs for you when you turn them on.`)}</li>
  <li>${esc(`your journal is always private, only yours, and `)}<strong>${esc(`nothing sol pbc runs reads a word of it except where a section below says so.`)}</strong>${esc(` private network carries encrypted bytes it can't read. encrypted backup holds encrypted blocks we have no key to. solstone.me is the one that lets an agent you choose read from it, and that agent is never us: it gives your journal an address so that agent can read the part of it you allow, over a connection we pass along and cannot read. with confidential processing, our own model reads what you send, in the clear, only while it answers you, and verifiably keeps none of it; while it's on, your speech goes for transcription too, unless you turn that switch off. each service's section says what sol pbc, and the provider whose hardware it runs on, can see.`)}</li>
  <li><strong>${esc(`you can always turn a service off, and what sol pbc runs for you is nearly all that changes.`)}</strong>${esc(` two things to know, and the first is the one exception: media you offload into encrypted backup lives only there, so letting backup go takes that media with it (section 12); and deleting your sign-in ends a paid subscription and deletes the operated backup copy with it, with no 30 days (section 7). apart from offloaded media, nothing on your devices changes.`)}</li>
  <li><strong>${esc(`if you pay, it renews until you cancel, and canceling is as easy as subscribing.`)}</strong>${esc(` turning a service off doesn't cancel its subscription; the billing portal does (section 3). you keep what you paid for through the end of the period. if we ever charge you by mistake, we refund it.`)}</li>
  <li><strong>${esc(`if you stop paying for encrypted backup, we keep the encrypted copy for 30 days after your paid period or your access ends, then delete it for good.`)}</strong>${esc(` if you offloaded media into it, that copy is the only one.`)}</li>
  <li><strong>${esc(`what we hold is small, named, and yours to see, export, and delete, and you can delete your whole sign-in yourself.`)}</strong>${esc(` the privacy policy lists all of it, service by service, and names the few things that outlast a deletion.`)}</li>
  <li><strong>${esc(`we never sell, license, sublicense, or lease your data, and we never use it for targeted advertising or behavioral profiling.`)}</strong>${esc(` that isn't a policy. it's Article 8 of sol pbc's articles of incorporation, and it can't be amended without the founder's personal signature; after him, the language can only get stronger. you can read it at `)}<a href="https://solpbc.org/articles">${esc(`solpbc.org/articles`)}</a>${esc(`.`)}</li>
  <li><strong>${esc(`if something goes wrong, whether the claim is about a service, the portal, your sign-in, or scout, the most we owe you is what you paid us for that service in the past year, or $100, whichever is more`)}</strong>${esc(`, except where the law says we can't limit it, and except for the covenants in section 6, our promise never to train a model on what you send us, section 13's promise that nothing you send is kept, and section 14's promise that we hold no record of what your agents asked, were shown, or were refused, none of which are capped at all. encrypted backup has one rule of its own: keeping your copy available while you pay (or have it as a scout), and keeping it for the 30 days after, is on us; what was inside a lost copy, which we can't read or rebuild, is not (section 12).`)}</li>
  <li><strong>${esc(`if these terms change in a way that matters, we tell you first, and you can walk away.`)}</strong></li>
</ul>
<h2>${esc(`how to read these terms`)}</h2>
<p>${esc(`the short version is a summary. the sections below carry the specifics: how paying and canceling work, what each service handles and keeps, the deletion route and what outlasts it, and the legal limits. if the two ever seem to disagree, the detailed section governs; tell us at support@solstone.app and we'll fix the summary.`)}</p>
<p>${esc(`two other documents go with these terms. the `)}<strong>${esc(`privacy policy`)}</strong>${esc(` at `)}<a href="https://solpbc.org/privacy">${esc(`solpbc.org/privacy`)}</a>${esc(` is part of this agreement, and it is the one home for what sol pbc holds: what each service handles and keeps, who processes it, how long it lasts, how to see, export and delete it, and what outlasts a deletion. these terms are the one home for what each service does, and for paying, canceling, refunds and the legal limits. where one document needs the other's facts it points there rather than repeating them. and when you turn on a service, the page you turn it on from tells you what that particular service does.`)}</p>
<hr>
<h2>${esc(`part one · what applies to everything`)}</h2>
<h2>${esc(`1. who these terms are between, and how you agree`)}</h2>
<p>${esc(`these terms are a contract between you and `)}<strong>${esc(`sol pbc`)}</strong>${esc(`, a Colorado public benefit corporation. they cover:`)}</p>
<ul>
  <li><strong>${esc(`services.solstone.app`)}</strong>${esc(`, the portal where you sign in to turn services on and off, see what we hold about you, and manage billing;`)}</li>
  <li><strong>${esc(`the solstone services`)}</strong>${esc(` sol pbc runs for you: private network, the operated tier of encrypted backup, confidential processing, solstone.me, and, once it opens to owners, the cross-device part of notifications (section 15). "operated" means sol pbc runs that part; each service's section names a way to do the same thing with sol pbc out of the path;`)}</li>
  <li><strong>${esc(`the scout program.`)}</strong></li>
</ul>
<p>${esc(`they don't cover the solstone software itself, which is open source under its own license, or anything you run on your own devices, your own network, or your own storage. sol pbc isn't in the path for any of that, and these terms don't reach it.`)}</p>
<p>${esc(`you agree to these terms the first time you do any of these: sign in to services.solstone.app, turn on a service, or subscribe to one at checkout. each of those pages says so and links here, so you can read them first. if you already have a sign-in, signing in, renewing, or keeping a service on is how you agree to this version; if you don't agree, turn the service off or cancel. section 9 says what happens if you reject a later material change. if you're new and don't agree, don't sign in and don't turn anything on; solstone keeps working without us.`)}</p>
<p>${esc(`you need to be at least 13 to sign in, and at least 18 (or the age of majority where you live) to subscribe to a paid service. our services aren't directed to children under 13, and if we learn a sign-in belongs to someone under 13, we delete it.`)}</p>
<h2>${esc(`2. your sign-in`)}</h2>
<ul>
  <li><strong>${esc(`how it works.`)}</strong>${esc(` you sign in with your email (we send you a code) or with a passkey (a sign-in key your own device holds, so there's no password to make up or lose). a session lasts up to two weeks unless you sign out sooner, and you can end any session from the portal.`)}</li>
  <li><strong>${esc(`what we hold for a sign-in.`)}</strong>${esc(` your emails, your passkeys, and your sessions. the privacy policy lists each record and how long it's kept (`)}<a href="https://solpbc.org/privacy#sign-in">${esc(`your sign-in`)}</a>${esc(`), and you can see all of it at `)}<a href="https://services.solstone.app/transparency">${esc(`services.solstone.app/transparency`)}</a>${esc(`. if you open a support request, you can see your history at `)}<a href="https://services.solstone.app/support">${esc(`services.solstone.app/support`)}</a>${esc(`.`)}</li>
  <li><strong>${esc(`it's yours to keep safe.`)}</strong>${esc(` a sign-in is for one person. keep your passkeys and your email in your own hands: anyone who can read your email or use your passkey can sign in as you and manage your services. if you think that's happened, sign out everywhere from the portal and tell us. the privacy policy says when one of our operators can open a session on your sign-in, and how you see and end it.`)}</li>
  <li><strong>${esc(`the solstone app has no sign-in of its own.`)}</strong>${esc(` the portal is where you sign in, and only to manage what sol pbc runs for you. your journal and your devices work without it.`)}</li>
</ul>
<h2>${esc(`3. paying, renewing, and canceling`)}</h2>
<p>${esc(`this section applies to any service you subscribe to: today, private network, the operated tier of encrypted backup, and solstone.me. prices are on the services page and at checkout. if you have two journals, that's two subscriptions.`)}</p>
<ul>
  <li><strong>${esc(`everything is shown before you pay.`)}</strong>${esc(` each service has a flat price, plus any sales tax shown at checkout, per journal, not per device: one subscription covers one journal and every device you've paired with it (connected to it as one of yours). the price, the billing interval, that it renews automatically, and how to cancel are all shown to you at checkout, before we take any billing details, and you agree to it there before any charge. after you subscribe we send you a written confirmation you can keep, with those renewal terms, our cancellation policy, and how to cancel. Colorado's automatic renewal law requires each of these (C.R.S. § 6-1-732(2)).`)}</li>
  <li><strong>${esc(`your subscription renews automatically`)}</strong>${esc(` at the end of each term, once a year on the annual plan or once a month on the monthly plan, at your plan's then-current price, using the payment method on file, `)}<strong>${esc(`until you cancel`)}</strong>${esc(`.`)}</li>
  <li><strong>${esc(`a renewal is never a surprise.`)}</strong>${esc(` on an annual plan we email you 25 to 40 days before each renewal to say that it will renew and how to cancel. on a monthly plan we send the same email once a year, 25 to 40 days before the renewal that carries you past each full year. that is the notice C.R.S. § 6-1-732(4) requires.`)}</li>
  <li><strong>${esc(`we tell you before a price changes.`)}</strong>${esc(` a price change is a material change (section 9): we notify you first, and it applies only from a renewal, so you can cancel before it does.`)}</li>
  <li><strong>${esc(`cancel anytime, with no more steps than it took to subscribe.`)}</strong>${esc(` the billing portal (a page Stripe hosts for us, linked from your services) cancels your subscription. no phone call, no email, no retention maze. the prorated mid-term exit in section 9 is the one exception: that one you ask for by email.`)}</li>
  <li><strong>${esc(`you keep what you paid for.`)}</strong>${esc(` when you cancel, the service keeps working until the end of the period you've already paid for, then stops. we don't prorate a cancellation you make on your own, and we don't claw back; sections 9 and 14 name the times we do refund unused time. for confidential processing, what a plan includes within a period is part of the plan terms shown at checkout (section 13).`)}</li>
  <li><strong>${esc(`nothing on your devices is lost when a service stops, with one exception.`)}</strong>${esc(` your journal, your devices, and your device pairings are untouched. the exception is media you offloaded into encrypted backup, which lives only there. what happens to a copy or a credential sol pbc held is in that service's section, and if you've turned on media offload, section 12 is the one to read before you let backup lapse. re-subscribe anytime to turn a service back on.`)}</li>
  <li><strong>${esc(`refunds.`)}</strong>${esc(` we don't run refund math on cancellation, because you keep the service through the end of what you paid for. if you're charged in error, whether a duplicate charge, a charge after you canceled, or a billing mistake, email support@solstone.app or use the billing portal and `)}<strong>${esc(`we'll refund the incorrect amount`)}</strong>${esc(`. nothing here affects any chargeback or refund right you have through your card issuer or under the law where you live.`)}</li>
</ul>
<h2>${esc(`4. payment is handled by Stripe`)}</h2>
<ul>
  <li>${esc(`sol pbc doesn't take or store your card. payments run through `)}<strong>${esc(`Stripe`)}</strong>${esc(`, our payment processor. paying by card is your choice, and choosing it is what sends your card and billing address to Stripe, which handles them under its own `)}<a href="https://stripe.com/legal">${esc(`terms`)}</a>${esc(` and `)}<a href="https://stripe.com/privacy">${esc(`privacy policy`)}</a>${esc(`. Stripe may offer you its own Link wallet at our checkout; it's Stripe's product under Stripe's terms, it's optional, and using it changes nothing about what we see.`)}</li>
  <li>${esc(`what we send Stripe, what we keep from what it sends back, and what one of our operators can see in Stripe's dashboard are in the privacy policy (`)}<a href="https://solpbc.org/privacy#billing">${esc(`billing`)}</a>${esc(`). `)}<strong>${esc(`sol pbc never sends Stripe anything from your journal.`)}</strong></li>
  <li>${esc(`Stripe runs the fraud and anti-money-laundering checks a payment company has to run; those are Stripe's checks, not ours, and we never direct Stripe to profile you. the privacy policy names the one other use Stripe's own terms allow (`)}<a href="https://solpbc.org/privacy#processors">${esc(`who processes data for us`)}</a>${esc(`).`)}</li>
</ul>
<h2>${esc(`5. fair use`)}</h2>
<p>${esc(`the services are for you, your own journal, and your own devices. don't use them to attack, overload, or interfere with a service or anyone else's systems. don't route other people's traffic or store other people's content through them, and don't use them at a scale that degrades a service for everyone else. each service's section names anything specific to it.`)}</p>
<p><strong>${esc(`what suspension can touch, and what it never can.`)}</strong>${esc(` sustained abuse can suspend your access to a service. it can never suspend your journal, your devices, or any path of your own: those are yours and don't run through us. if we suspend access we tell you why and what it would take to restore it, and you can reply at support@solstone.app.`)}</p>
<h2>${esc(`6. how your data is used, and the covenants behind it`)}</h2>
<p><strong>${esc(`what a service handles to do its job`)}</strong>${esc(` is in its section in part two, and none of it is read by us except where a section says so in as many words. `)}<strong>${esc(`your sign-in and billing details`)}</strong>${esc(` are used only to run your sign-in and your subscriptions. none of it is ever sold, licensed, shared for anyone else's purposes, profiled, used for advertising, or used to train any model.`)}</p>
<p><strong>${esc(`the covenants.`)}</strong>${esc(` sol pbc's articles of incorporation carry a `)}<strong>${esc(`Customer Privacy Covenant`)}</strong>${esc(` (Article 8) that legally binds the company, and these terms make its covenants promises to you under this agreement:`)}</p>
<ul>
  <li>${esc(`never to sell, license, sublicense, or lease your data, in any form;`)}</li>
  <li>${esc(`never to use it for targeted advertising or behavioral profiling, and never to let anyone else do that on our behalf;`)}</li>
  <li>${esc(`never to hand it outside sol pbc except through the three narrow doors Article 8 allows: a service provider bound by written agreement to protections no weaker than these covenants, and only as far as strictly necessary to provide, maintain, secure, or support the service you asked for; your own specific and informed direction; or compulsion of law, which we resist;`)}</li>
  <li>${esc(`and to carry all of this through any sale, merger, or change of control.`)}</li>
</ul>
<p>${esc(`the privacy policy sets out each of these in full: its citation, the three doors, the conditions a successor must meet, and what Article 8 means by `)}<strong>${esc(`Customer Data`)}</strong>${esc(`, which is what these terms call your data (`)}<a href="https://solpbc.org/privacy#covenants">${esc(`what sol pbc will never do`)}</a>${esc(`). the articles are the authority, and you can read them at `)}<a href="https://solpbc.org/articles">${esc(`solpbc.org/articles`)}</a>${esc(`. these covenants can't be amended without the founder's personal written consent, and after he stops serving, the language can only get stronger, never weaker, except to the minimum a law strictly requires.`)}</p>
<p><strong>${esc(`who processes data for us.`)}</strong>${esc(` Cloudflare, Microsoft Azure and Stripe process data for these services, and Google runs the mailbox where mail to support@solstone.app lands. none of them is given a readable byte of your journal. the privacy policy names what each one handles and what it can see, and carries every change to that list (`)}<a href="https://solpbc.org/privacy#processors">${esc(`who processes data for us`)}</a>${esc(`).`)}</p>
<h2>${esc(`7. how long we keep it, deleting your sign-in, and your rights`)}</h2>
<p><strong>${esc(`the privacy policy is the home for all of this, and it is part of this agreement`)}</strong>${esc(`: `)}<a href="https://solpbc.org/privacy#what-we-hold">${esc(`what we keep, service by service, and for how long`)}</a>${esc(`, and `)}<a href="https://solpbc.org/privacy#your-rights">${esc(`how to see it, download it, and delete it yourself, how long a deletion takes, what outlasts a deletion, and your privacy rights and how to appeal`)}</a>${esc(`. these terms don't repeat it. what belongs here is what deleting your sign-in does to what you've paid for, and to the only copy of anything:`)}</p>
<ul>
  <li><strong>${esc(`it ends your subscriptions.`)}</strong>${esc(` deleting your sign-in ends every subscription on it when the 72-hour safety period ends, with no refund of the unused period. if you'd rather use what you paid for, cancel from the billing portal instead and let the period run out.`)}</li>
  <li><strong>${esc(`it deletes the operated backup as part of that deletion`)}</strong>${esc(`, with no 30-day lapse window. if you've turned on media offload, that copy is the only copy of that media, and it goes too.`)}</li>
  <li><strong>${esc(`two things from solstone.me outlast it`)}</strong>${esc(`: the no-name reservation of your address, and the public certificate records for it (section 14).`)}</li>
  <li><strong>${esc(`it never touches`)}</strong>${esc(` your journal on your devices, your devices themselves, or a bucket you control.`)}</li>
</ul>
<p>${esc(`you have the privacy rights your state or country gives you, and we extend them to everyone, wherever you live. exercise any of them at support@solstone.app.`)}</p>
<h2>${esc(`8. the services are provided as-is`)}</h2>
<p>${esc(`we work to keep every service up, but we don't guarantee uninterrupted service. a service can go down for maintenance or for reasons outside our control, and your journal won't use confidential processing when it can't verify it. a path of your own is always your fallback, and your journal on your devices is never on the line.`)}</p>
<p><strong>${esc(`to the fullest extent permitted by law, each service is provided "as is" and "as available," and sol pbc disclaims all implied warranties, including merchantability and fitness for a particular purpose. sol pbc is not liable for indirect, incidental, or consequential damages, and sol pbc's total liability to you under these terms, whatever the claim is about (a service, the portal, your sign-in, or the scout program), is limited to the greater of $100 or the fees you paid us in the 12 months before the claim for the service the claim is about.`)}</strong>${esc(` nothing in these terms limits liability that cannot be limited by law, including for fraud, gross negligence, willful misconduct, or personal injury, or any statutory right you have as a consumer. that cap doesn't apply to the covenants in section 6, to our promise never to train a model on what you send us, to section 13's promise that nothing you send is kept, or to section 14's promise that we hold no record of what your agents asked, were shown, or were refused. the first isn't ours to cap by agreement; the rest we will not. two services carry a specific limit of their own, stated in their sections: the operated backup, on what was inside a lost copy, and confidential processing, on what the model produces.`)}</p>
<h2>${esc(`9. changes to these terms`)}</h2>
<p>${esc(`we may update these terms. if a change is material, we'll notify you before it takes effect, in a form you can keep, with how to cancel (C.R.S. § 6-1-732(3)). for a change that takes effect at your next renewal, you can cancel before then if you don't agree. if a material change has to take effect mid-term, the notice says how to cancel for a prorated refund of the unused period (today: write to support@solstone.app before the date). if you keep using a service after a change takes effect, that's how you accept it; if you don't want to, turn the service off or delete your sign-in before then.`)}</p>
<p>${esc(`when we add a service, we add its section here. if we ever retire a service you've paid for, we refund the time you paid for past the date it stops. if sol pbc ever winds down, Article 8 still governs where your data can go: anyone it goes to must take on covenants no less protective (section 6). we keep the current version posted here with the date it took effect.`)}</p>
<p>${esc(`no change to these terms can weaken the covenants in section 6. those change only the way Article 8 allows, and a change to a terms page isn't one of them.`)}</p>
<h2>${esc(`10. the legal details`)}</h2>
<ul>
  <li>${esc(`these terms are between you and `)}<strong>${esc(`sol pbc`)}</strong>${esc(`, a Colorado public benefit corporation, and they're governed by Colorado law.`)}</li>
  <li>${esc(`these terms, the privacy policy, the disclosure you're shown when you turn on a service or a feature of one, the plan terms you're shown at checkout, and, if you're a scout, the program disclosure you acknowledged, are the whole agreement between us about the services. if these terms ever conflict with sol pbc's articles of incorporation, the articles govern.`)}</li>
  <li>${esc(`when a section says we email you, we use the primary address on your sign-in; keep it current.`)}</li>
  <li>${esc(`if a court finds part of these terms unenforceable, the rest still applies. if we don't enforce something once, we can still enforce it later. sections 6, 7, 8, and 10, every refund promise in these terms (sections 3, 9, and 14), the promises section 8 says aren't capped, what sections 11, 12, 13, and 14 say happens after a service stops, and the specific limits in sections 12 and 13, keep applying after a subscription or a sign-in ends, for as long as they're relevant.`)}</li>
  <li>${esc(`sol pbc can hand these terms, or your data, to another company only in the way Article 8 allows (section 6).`)}</li>
  <li>${esc(`questions: support@solstone.app.`)}</li>
</ul>
<hr>
<h2>${esc(`part two · each service, one at a time`)}</h2>
<p>${esc(`each section below covers one service sol pbc runs, and only the part sol pbc runs. for private network, encrypted backup, confidential processing, and solstone.me, the way to do the same thing with sol pbc out of the path is named first, because it's always there.`)}</p>
<h2>${esc(`11. private network (the relay)`)}</h2>
<p><strong>${esc(`what it is.`)}</strong>${esc(` a relay sol pbc runs so your devices can reach your journal from anywhere, phone to home, without you running a relay of your own.`)}</p>
<p><strong>${esc(`you never have to pay us.`)}</strong>${esc(` the same private connection is always available for free. on the same network, your devices connect to your journal directly. or point solstone at your own VPN, Tailscale, or tunnel. or run the open-source relay yourself. all three are private by the same construction as the relay we run, because your devices encrypt to each other whatever path they take. `)}<strong>${esc(`the relay is convenience, never a privacy upgrade.`)}</strong></p>
<p><strong>${esc(`blind by construction.`)}</strong>${esc(` the relay passes encrypted bytes between your devices. it has no key to read them and keeps no copy of what flows through. sol pbc operates the relay and cannot read what it carries.`)}</p>
<p><strong>${esc(`what the relay handles, and what we keep.`)}</strong>${esc(` to move your bytes, the relay and Cloudflare, whose network it runs on, necessarily handle connection metadata, and pairing a device issues that device a credential, which the device holds. `)}<strong>${esc(`the relay keeps no list of your devices`)}</strong>${esc(`, and no connection log of its own. what we keep is a record of your home, the machine your journal runs on, and two access records at services.solstone.app. the privacy policy lists each one, what it holds, and how long (`)}<a href="https://solpbc.org/privacy#private-network">${esc(`private network`)}</a>${esc(`). the records we keep are Customer Data under our covenants, used only to operate and secure the relay, and deleted when you delete your sign-in. `)}<strong>${esc(`the relay never reads, stores, or analyzes what's inside your traffic.`)}</strong>${esc(` your traffic passes through and is gone.`)}</p>
<p><strong>${esc(`when it stops.`)}</strong>${esc(` cancel, or let it lapse, and the relay keeps working until the end of the period you paid for, then stops. deleting your sign-in stops it when the safety period ends (section 7). your journal, your data, and your device pairings are untouched. the free paths keep working, and you're never locked out of your own journal by a billing state. re-subscribe anytime.`)}</p>
<h2>${esc(`12. encrypted backup, operated tier`)}</h2>
<p><strong>${esc(`what it is.`)}</strong>${esc(` storage sol pbc runs so an encrypted copy of your journal can live somewhere other than your own machine, without you setting up a bucket (a bucket is what cloud storage calls a folder you rent).`)}</p>
<p><strong>${esc(`you never have to pay us.`)}</strong>${esc(` point solstone at your own bucket (Backblaze B2, Amazon S3, Cloudflare R2, any S3-compatible provider), pay that provider directly, and sol pbc is never contacted and never holds your data. the bring-your-own path and the operated tier use the `)}<strong>${esc(`same engine, the same encryption, and the same recovery model`)}</strong>${esc(`; the only difference is whose bucket the encrypted blocks land in. `)}<strong>${esc(`the operated tier is convenience, never a privacy upgrade.`)}</strong></p>
<p><strong>${esc(`encrypted by construction: only you can read it.`)}</strong>${esc(` before anything leaves your device, solstone encrypts it, so the contents, the file names, and the folder structure all become unreadable ciphertext. sol pbc stores those encrypted blocks and `)}<strong>${esc(`cannot read them`)}</strong>${esc(`: we hold no key, no password, and no way to decrypt your backup.`)}</p>
<p><strong>${esc(`what the storage handles, and what we keep.`)}</strong>${esc(` the encrypted blocks; a small amount of operational information about them (how many, how much space, when they last changed); the connection metadata of your upload sessions, which the storage (Cloudflare R2) necessarily handles; and a few access and credential records at services.solstone.app. none of it says anything about your content. the privacy policy lists each record, what it holds, and how long (`)}<a href="https://solpbc.org/privacy#encrypted-backup">${esc(`encrypted backup`)}</a>${esc(`). the encrypted blocks and the records we keep are Customer Data under our covenants, used only to operate and secure the service, and deleted when your sign-in is.`)}</p>
<p><strong>${esc(`your recovery key is the only key.`)}</strong>${esc(` solstone gave you a recovery key when you set up backup. a backup is restored only with it, and we don't have it. keep it safe. if you lose it, the backup can't be restored, by you or by us.`)}</p>
<p><strong>${esc(`a second copy, unless you choose otherwise.`)}</strong>${esc(` an encrypted backup is a second copy of a journal that lives on your own devices, not a substitute for it. there is one exception, and it's your choice: media offload is off unless you turn it on, and if you do, your journal removes media from your device once the backup holds it, and for that media the backup is the only copy. everything in this section, including what happens after a lapse, applies to that media too. if we ever lost that copy, that media would be gone, and section 8's limit is what we'd owe you; so don't let the backup go while it holds the only copy of something you want.`)}</p>
<p><strong>${esc(`after your subscription lapses, we keep your encrypted backup for 30 days, then delete it.`)}</strong>${esc(` here is the sequence, whether you cancel, a renewal payment fails, or your scout access ends:`)}</p>
<ul>
  <li>${esc(`the operated storage keeps running through the end of the period you paid for, then stops. if a renewal payment fails, the clock below doesn't start until that period has ended. if your scout access ends, or you stop a service early under section 9, the storage stops that day and the clock starts then; once it has stopped, your journal can't read the backup until you subscribe.`)}</li>
  <li>${esc(`your encrypted blocks then stay in our storage for 30 days. re-subscribe within those 30 days and the operated tier turns back on against your existing backup with nothing lost.`)}</li>
  <li>${esc(`after 30 days the operated copy is permanently deleted, and because it's encrypted with a key only you hold, once it's deleted we cannot recover it. this only ever affects the copy in our storage.`)}</li>
</ul>
<p>${esc(`you can also delete the operated copy yourself, anytime, from the backup screen in solstone; and deleting your sign-in deletes it as part of that deletion (section 7), with no 30-day lapse window.`)}</p>
<p><strong>${esc(`fair use, specifically.`)}</strong>${esc(` the operated tier is for backing up your own journal. don't use it to store or distribute anything else.`)}</p>
<p><strong>${esc(`a limit specific to this service.`)}</strong>${esc(` the operated copy is encrypted with a key only you hold, so we can't read it, rebuild it, or put a value on what's in it, and for everything except media you offloaded it's a second copy of a journal that lives on your own devices. so `)}<strong>${esc(`sol pbc is not liable for any inability to restore a copy where you have lost your recovery key, or for what was inside a lost operated copy, except where our own failure to keep it available is what lost it. none of this limits our responsibility to keep your backup available while you're paying for it or have it as a scout, and to keep it for the 30 days after that this section promises`)}</strong>${esc(`, and if we fail at that, section 8 says the most we can owe you.`)}</p>
<h2>${esc(`13. confidential processing`)}</h2>
<p><strong>${esc(`what it is.`)}</strong>${esc(` an AI model sol pbc runs on confidential GPU hardware, so your journal can think with more capacity (room to think faster and longer) than the device it lives on. it's off until you turn it on, and you can turn it off from the journal at any time.`)}</p>
<p><strong>${esc(`you never have to pay us.`)}</strong>${esc(` this is capacity, not a gate. your journal can always think without us: with a model on your own hardware, where nothing leaves your device and sol pbc is not in the path; with your own provider key, where the key stays in your journal and sol pbc is not in the path; or with any endpoint you run or trust. `)}<strong>${esc(`confidential processing is never a privacy upgrade over running locally.`)}</strong>${esc(` if you stop using it, you lose capacity. you don't lose your journal and you don't lose your privacy.`)}</p>
<p><strong>${esc(`a model sol pbc runs itself.`)}</strong>${esc(` sol pbc's own model weights, served by sol pbc, on confidential GPU hardware sol pbc operates. it's the same model generation your own device runs, with more room to run it: more capacity, never a better model. `)}<strong>${esc(`no third-party AI provider is in the path`)}</strong>${esc(`, and nothing you send is handed to one.`)}</p>
<p><strong>${esc(`it's protected differently from our other three services.`)}</strong>${esc(` the private network relay and the solstone.me relay can't read what passes through them, and the operated backup holds blocks we have no key to. this one runs inside a `)}<strong>${esc(`confidential container`)}</strong>${esc(`: a machine whose hardware walls off what's in its memory from the company that hosts it. what you send is encrypted over the network and visible in running memory only while it's being processed: `)}<strong>${esc(`our own model reads what you send, in the clear, while it answers you.`)}</strong>${esc(` we can't promise "no key" here, so instead your journal checks a fingerprint of the exact image it booted before it sends anything.`)}</p>
<p><strong>${esc(`your journal checks before it sends.`)}</strong>${esc(` before anything is sent, your journal verifies the hardware, and a fingerprint of the exact image it booted, against a fingerprint pinned in solstone's open source code. (in full: the AMD attestation chain up to AMD's own signing keys, the GPU's own evidence, the binding of that evidence to the encrypted connection, and the boot fingerprint.) the pin is public and version-controlled, and it ships in the same releases everything else does. `)}<strong>${esc(`we commit that sol pbc will not point you at different software without a release you can read.`)}</strong>${esc(` if the check fails, nothing is sent: your journal waits, tells you plainly that it couldn't verify, and never silently falls back to another service or another provider.`)}</p>
<p><strong>${esc(`the hardware is Microsoft Azure's, and Azure can't see inside it.`)}</strong>${esc(` the container is an AMD SEV-SNP confidential virtual machine with an NVIDIA H100 in confidential-compute mode, and that boundary is enforced by the hardware, not by configuration or by promise. Microsoft hosts the machine, so it knows the machine exists, its size, and when it's running, and because the channel runs from your journal to that machine directly, Azure's network handles the connection: the address it came from, when, and how much moved. it is not a party to your content.`)}</p>
<p><strong>${esc(`speech.`)}</strong>${esc(` when the audio switch is on, your journal sends speech for transcription over the same verified channel. it's served with `)}<code>${esc(`parakeet-tdt-0.6b-v3`)}</code>${esc(`, created by NVIDIA and used under `)}<a href="https://creativecommons.org/licenses/by/4.0/">${esc(`CC BY 4.0`)}</a>${esc(`, the same model generation your own device runs. the switch is `)}<strong>${esc(`on by default`)}</strong>${esc(` whenever confidential processing is in use, and the page where you turn confidential processing on says so. turn it off and speech becomes text on your own device instead, effective on the next thing you say.`)}</p>
<p><strong>${esc(`your use is metered, inside the container.`)}</strong>${esc(` the service keeps a count of how much confidential processing it has done for a journal, so it can manage capacity. apart from being down or full for a moment like any service (section 8), it can slow you down or say no when your access has ended, or briefly under fair use, where a no is temporary and clears on its own. your journal keeps thinking on its own either way. `)}<strong>${esc(`being metered is not being suspended`)}</strong>${esc(`: a limit doesn't reach your journal, your local processing, or your own key or endpoint, and the other paths above are always there.`)}</p>
<p><strong>${esc(`access today, and if paid plans open.`)}</strong>${esc(` access is complimentary while you're an approved scout (section 16). if and when paid plans open and you choose to subscribe, what your plan includes and what happens when you reach it, the price, the billing interval, and the automatic renewal are all shown to you before we take any billing details, and section 3 applies from then on.`)}</p>
<p><strong>${esc(`turning it off.`)}</strong>${esc(` turn it off from the journal, anytime, and it takes effect immediately. that needs nothing from us and no billing portal. turning it off stops the processing; it doesn't cancel a subscription, which you cancel from the billing portal as in section 3. nothing is stranded, because none of what you sent was stored: your journal goes back to thinking on your own hardware, or with whatever key or endpoint you point it at. the audio switch is separate and works the same way.`)}</p>
<p><strong>${esc(`what we keep.`)}</strong>${esc(` running this service involves a few different things, and we keep them apart:`)}</p>
<ul>
  <li><strong>${esc(`what you send the model.`)}</strong>${esc(` the text and images your journal needs a model to work through, plus your speech when the audio switch is on. our model processes it and returns the result. `)}<strong>${esc(`the service keeps nothing: no content is kept once your request is answered, not even in logs. no human reviews it. it is never sold, licensed, shared for anyone else's purposes, profiled, or used for advertising.`)}</strong></li>
  <li><strong>${esc(`nothing you send is used to train anything.`)}</strong>${esc(` not our models, not anyone else's. this is a commitment we make to you, and it's reinforced by the covenants in section 6.`)}</li>
  <li><strong>${esc(`access records, not content.`)}</strong>${esc(` to run the service and control who can use it, we keep three records about access: that you turned it on and acknowledged the disclosure, each time your journal was issued a credential or refused one, and the short-lived record the turn-on page leaves so your journal can collect its credential. none says how much you used, and none says anything about what you sent. the privacy policy lists what each one holds (`)}<a href="https://solpbc.org/privacy#confidential-processing">${esc(`confidential processing`)}</a>${esc(`). all of them are Customer Data under our covenants, and all of them are deleted when your sign-in is.`)}</li>
  <li><strong>${esc(`inside the container`)}</strong>${esc(`, the service keeps the count of how much confidential processing it has done for a journal, so it can manage capacity, and it notes that a channel was admitted or refused. that count is keyed to your credential, not to your sign-in, and neither it nor those notes record what you sent or where you connected from. metering and abuse handling both run there.`)}</li>
  <li><strong>${esc(`we keep no connection metadata for this service.`)}</strong>${esc(` that's a real difference from the private network and the operated backup. the privacy policy says what Azure's network, and our providers' short-lived request logs, still see.`)}</li>
</ul>
<p><strong>${esc(`what the model produces is not advice, and nobody checks it.`)}</strong>${esc(` a model can be confidently wrong. don't rely on what it produces for medical, legal, financial, safety, or any other decision that matters, and check it before you act. as between you and sol pbc, `)}<strong>${esc(`what you send and what comes back are yours.`)}</strong>${esc(` you grant sol pbc a limited license to process what you send, for as long as it takes to answer, solely to run confidential processing and hand the result back to you, and for nothing else. sol pbc claims no ownership of either, and makes no warranty that output is accurate, complete, current, or fit for any purpose.`)}</p>
<p><strong>${esc(`fair use, specifically.`)}</strong>${esc(` confidential processing is for thinking with your own journal. don't use it to generate or pursue things that are unlawful, that are meant to harm or harass someone, that impersonate a real person in order to deceive, or that attack the service or anyone else's systems.`)}</p>
<h2>${esc(`14. solstone.me`)}</h2>
<p><strong>${esc(`what it is.`)}</strong>${esc(` an address on the internet for your journal, so an agent you already use can read from it: Claude, Codex, goose, or anything else that speaks the Model Context Protocol. you turn it on, you connect an agent, and you choose what that agent may see. your journal makes itself reachable from wherever it is, and enforces that choice on your own device. sol pbc runs the solstone.me relay in between, so your agent can find your journal without you running anything of your own. it's off until you turn it on, and you can turn it off from the journal at any time.`)}</p>
<p><strong>${esc(`you never have to pay us.`)}</strong>${esc(` your journal doesn't need sol pbc to be reachable. a tunnel that only passes the bytes through works today with nothing of ours in the path, whether you rent one or run your own on a machine you control. one warning: `)}<strong>${esc(`some free tunnels decrypt your traffic in order to move it.`)}</strong>${esc(` whoever runs one of those can read what your agent reads, and can reuse your agent's key to reach your journal as though they were it. a tunnel that only passes the bytes through will say so; if its documentation doesn't say, assume it ends the encryption. `)}<strong>${esc(`the solstone.me relay is convenience, never a privacy upgrade over a tunnel that only passes the bytes through.`)}</strong></p>
<p><strong>${esc(`blind by construction, and this relay holds no state about you.`)}</strong>${esc(` your own machine holds the private key and ends the encryption, so the solstone.me relay has no key and cannot read a byte of what passes through it. it also keeps nothing: no database and no record of what passes through it. that is how it is built, not a policy we apply to it, and what it does write down about its own health says that something happened, never who it happened to. the machine it runs on is Microsoft Azure's, and Azure is not a party to your content.`)}</p>
<p><strong>${esc(`your journal's address, and the part of it that is permanent.`)}</strong>${esc(` when you turn this on, services.solstone.app mints an address for your journal: eight random characters with nothing of yours in them, followed by solstone.me. your journal then requests a real certificate for that address itself, the same kind secure websites use, and its key never leaves your machine; that certificate is how your agent can tell it's really your journal at the other end. issuing and renewing a certificate can be delayed, and there is a weekly ceiling on new certificates across everyone we serve, so turning on can land in a waiting state and a renewal can run late; the journal shows you which, and keeps trying. if an address never issues at all, write to support@solstone.app and we refund what you paid. `)}<strong>${esc(`one thing about that address is public, and stays that way.`)}</strong>${esc(` like the certificates behind secure websites, each certificate for your address is listed in public certificate logs that nobody can edit, and a new entry is added each time one is issued or renewed. an entry shows that the address exists. none says whose, though an agent you connect knows the address is yours, and so do we until you delete your sign-in. it stays if you turn this off, cancel, or delete your sign-in, and nobody can remove it, including us. the authority your journal asks for the certificate is today Let's Encrypt, and the privacy policy says the same (`)}<a href="https://solpbc.org/privacy#solstone-me">${esc(`solstone.me`)}</a>${esc(`).`)}</p>
<p><strong>${esc(`your address is never anyone else's.`)}</strong>${esc(` an address, once minted, is never issued to another journal. we keep the reservation that makes that true with no name, sign-in, or journal attached to it, which is why it can outlive your sign-in without saying anything about you (section 7). turning the service off keeps your address, and turning it back on uses the same one, with no new certificate while the one you have is still good, so your agents go on working without being set up again. `)}<strong>${esc(`the same holds if you stop paying:`)}</strong>${esc(` your journal stops being reachable through the solstone.me relay at the end of the period you paid for, your address stays reserved for you, and subscribing again brings back the same one. minting you a second address would add permanent records for that address to those public logs and break every agent you'd connected, and it would take nothing back, because the records for the first address never go away.`)}</p>
<p><strong>${esc(`what each agent may see is yours to set, and we're not in it.`)}</strong>${esc(` when you connect an agent you choose what it may read: your whole journal, or only the parts of it you choose, and which of transcripts, entities, and facets it may reach within that. transcripts means what was said in your recordings and imports, never the audio or the screen frames themselves; entities means the people, places, and projects your journal knows, and what it has noted about them; facets means facet names and descriptions, and the activities, events, and summaries filed in them. "your whole journal" keeps including what you add later, facets you make later included. a facet you choose grows with its contents, though a facet you make later isn't in that choice unless you add it. `)}<strong>${esc(`it reads; it can't add, change, or delete anything.`)}</strong>${esc(` you can narrow it or disconnect the agent whenever you like, and the change applies on that agent's next request, though what it already read stays with it; a request already in flight finishes under the old choice. it's your journal that checks, every time, not us. there are two ways to connect: pairing in your browser, or a key you create and paste in. `)}<strong>${esc(`a key is a bearer credential: anyone holding it can read what it may see until you revoke it`)}</strong>${esc(`, so keep it as you would a password, and revoke it from the journal if it gets out. `)}<strong>${esc(`sol pbc holds no record of what any agent asked your journal for, what it was shown, or what it was refused.`)}</strong>${esc(` the record your journal keeps stays on your device, for you to read; it is your only record of this, and it can have gaps, which it tells you about rather than hiding. we don't receive it, and we've built this so that we can't. changing that would mean rebuilding the service, and we'd have to tell you first under section 9.`)}</p>
<p><strong>${esc(`the agent is yours, and the company behind it isn't ours.`)}</strong>${esc(` the agents you connect are run by other companies, or by you. connecting one means giving it your address, so whoever runs it knows where to find your journal, and can match it to the public certificate records above. and when you let it read your journal, what it reads goes to them, on their terms, and sol pbc is neither a party to that nor able to see it. these terms don't reach them and we make no promise about what they do, so which agent to trust is your call. the covenants in section 6 bind sol pbc. they don't bind a company you pointed your own journal at.`)}</p>
<p><strong>${esc(`what this relay and our control plane handle, and what we keep.`)}</strong>${esc(` to carry your traffic, the solstone.me relay and the Azure network it runs on necessarily handle connection metadata. sol pbc can see that, and never what was said, and the relay keeps no record of it. what we do keep is the link between your address and your journal, the record that you confirmed the turn-on screen, and the no-name reservation of the address. `)}<strong>${esc(`we keep no record of the passes your journal asks us for.`)}</strong>${esc(` the privacy policy lists each record, what Cloudflare sees when your address is minted and looked up, and how long anything lasts (`)}<a href="https://solpbc.org/privacy#solstone-me">${esc(`solstone.me`)}</a>${esc(`). all of it is Customer Data under our covenants, used only to operate and secure this service. the binding is deleted when you delete your sign-in; what outlasts that is the no-name address reservation above and the public certificate records.`)}</p>
<p><strong>${esc(`turning it off, and how quickly that takes effect.`)}</strong>${esc(` turn it off from the agents page in solstone, anytime. your agents stop reaching it on their next request, because the check happens on your own device, not with us. turning it off stops the solstone.me relay carrying your traffic; it doesn't cancel a subscription, which you cancel from the billing portal as in section 3.`)}</p>
<p><strong>${esc(`a journal that isn't reachable is ordinary.`)}</strong>${esc(` your journal lives on a machine that sleeps, travels, and loses wifi, so an agent will often find it unreachable, and should tell you so rather than hang. that isn't a failure of this service, and section 8 is the general position on availability.`)}</p>
<p><strong>${esc(`fair use, specifically.`)}</strong>${esc(` this is for your own agents reading your own journal. don't use the address to run a service for other people, to route traffic that isn't yours, or to serve anything other than your journal.`)}</p>
<p><strong>${esc(`when it stops.`)}</strong>${esc(` cancel, or let it lapse, and the solstone.me relay keeps carrying your traffic until the end of the period you paid for, then stops. deleting your sign-in stops it when the safety period ends (section 7). your address stays reserved throughout. your journal, what's in it, what you've let each agent see, and your record of what they did are all on your devices and are untouched. re-subscribe anytime. one thing on our side, in the cases where we are the one stopping it: because this relay keeps no state, a connection already open through it closes when the short-lived pass runs out rather than at the moment we stop you, which today takes up to fifteen minutes.`)}</p>
<h2>${esc(`15. notifications`)}</h2>
<p><strong>${esc(`what it is.`)}</strong>${esc(` notifications are built into the solstone app: free, turned on by you for each device, no sign-in needed. they give you a short heads-up on your devices when there's something worth a look, never the full thing.`)}</p>
<p><strong>${esc(`what's on today.`)}</strong>${esc(` a heads-up is a local notification on the device that shows it, and it never leaves that device. nothing about notifications reaches sol pbc today.`)}</p>
<p><strong>${esc(`what's coming, and the rule it waits on.`)}</strong>${esc(` reaching a phone away from home needs a hop in between, because there's no way to reach a phone's push service without one. sol pbc has built that hop on Cloudflare's network, and it is not on for owners yet. it turns on only once this section says exactly what the hop and your phone's push service (Apple's or Google's) will see, and only after our own review against Article 8 has cleared it. turning it on will be your choice, from a screen in the solstone app that says what it does.`)}</p>
<p><strong>${esc(`not a tracking surface.`)}</strong>${esc(` no analytics, no behavioral profiling, and no third party in the path beyond Cloudflare and the push service that delivers to your phone. notifications never become a way to watch you: the profiling half of that is Article 8, and the rest is a promise we make here.`)}</p>
<p><strong>${esc(`turning it off.`)}</strong>${esc(` turn notifications off on any device, anytime, from the solstone app on that device.`)}</p>
<h2>${esc(`16. the scout program`)}</h2>
<p>${esc(`scout is sol pbc's tester program. if you apply and we approve you, you get complimentary access to the services that are open to scouts, and we ask for your feedback. today those services are private network, the operated tier of encrypted backup, confidential processing, and solstone.me.`)}</p>
<ul>
  <li><strong>${esc(`complimentary means complimentary.`)}</strong>${esc(` while you're an approved scout, you aren't charged for those services and sections 3 and 4 don't apply to them. everything else does.`)}</li>
  <li><strong>${esc(`it can end.`)}</strong>${esc(` scout status is ours to grant and ours to end, and we can end it at any time as ordinary management of the program. ending it isn't a deletion: it ends the free access, and anything you pay for separately keeps running; you can always subscribe to a service you were getting as a scout. if encrypted backup was on for you as a scout, section 12's 30-day clock starts the day your access ends. once your access has ended your journal can't read the backup until you subscribe, so if you offloaded media, subscribing within those 30 days is the way to keep it. if solstone.me was on for you as a scout, your journal stops being reachable through the solstone.me relay when your access ends, and your address stays reserved for you on the same terms as section 14 sets out.`)}</li>
  <li><strong>${esc(`what we keep.`)}</strong>${esc(` your application, your acknowledgment of the program disclosure, your status, and a history of status changes, used only to administer the program and deleted when your sign-in is. the privacy policy describes this record in full, and what outlasts a deletion (`)}<a href="https://solpbc.org/privacy#scout">${esc(`scout`)}</a>${esc(`).`)}</li>
</ul>
<hr>
<p class="meta"><em>${esc(`these terms describe the services sol pbc runs and the covenants that bind them. the covenants come first.`)}</em></p>`,
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

function smeBillingFlashMessages(flash) {
  const messages = [];
  if (flash.checkout === 'success') messages.push('payment received. it can take a moment to show up here.');
  if (flash.checkout === 'cancel') messages.push('no charge made.');
  if (flash.checkout === 'ack') messages.push('confirm you understand before continuing.');
  if (flash.checkout === 'email') messages.push('billing needs an email address on your sign-in.');
  if (['invalid', 'error'].includes(flash.checkout)) messages.push("billing couldn't start. try again.");
  if (flash.checkout === 'comped') messages.push("you're already covered free as a scout.");
  if (flash.billing === 'missing') messages.push('billing management is available once a payment has been made.');
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
  if (seconds == null) return null;
  const value = Number(seconds);
  if (!Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString().slice(0, 10);
}

export function formatDate(tsMs) {
  const ts = Number(tsMs);
  if (!Number.isFinite(ts)) return '—';
  return new Date(ts).toISOString().slice(0, 10);
}
